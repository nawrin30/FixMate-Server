import dns from "node:dns";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import { ObjectId } from "mongodb";
import { jwtVerify } from "jose";
import { connectDB, getDB } from "./db.js";
import { verifyToken, verifyCustomer, verifyTechnician, verifyAdmin, } from "./auth.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
dotenv.config();
const app = express();
const port = Number(process.env.PORT || 5000);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_missing");
app.use(cors({
    origin: (process.env.CLIENT_URL || "http://localhost:3000")
        .split(",")
        .map((url) => url.trim()),
    credentials: true,
}));
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, name: "FixMate API" });
});

function validId(id) {
    return typeof id === "string" && ObjectId.isValid(id);
}
function oid(id) {
    if (typeof id !== "string" || !ObjectId.isValid(id)) {
        throw new Error("Invalid MongoDB ObjectId");
    }
    return new ObjectId(id);
}

async function recordPaidSession(session) {
    const db = getDB();
    if (session.payment_status !== "paid")
        return;
    const bookingId = String(session.metadata?.bookingId || "");
    if (!validId(bookingId))
        return;
    const booking = await db.collection("bookings").findOne({
        _id: oid(bookingId),
    });
    if (!booking || booking.status !== "completed")
        return;
    
    if (!session.metadata?.customerEmail ||
        session.metadata.customerEmail !== booking.customerEmail ||
        Number(session.amount_total || 0) !==
            Math.round(Number(booking.finalAmount) * 100)) {
        return;
    }
    await db.collection("payments").updateOne({ bookingId }, {
        $setOnInsert: {
            bookingId,
            serviceTitle: booking.serviceTitle,
            customerName: booking.customerName,
            customerEmail: booking.customerEmail,
            technicianName: booking.technicianName,
            technicianEmail: booking.technicianEmail,
            amount: (session.amount_total || 0) / 100,
            currency: session.currency || "usd",
            transactionId: String(session.payment_intent || ""),
            stripeSessionId: session.id,
            paymentStatus: "paid",
            paidAt: new Date(),
        },
    }, { upsert: true });
    await db.collection("bookings").updateOne({
        _id: oid(bookingId),
        paymentStatus: "unpaid",
    }, {
        $set: { paymentStatus: "paid" },
    });
}

app.post("/api/payments/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig || Array.isArray(sig)) {
        return res.status(400).send("Missing Stripe signature");
    }
    try {
        const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || "");
        if (event.type === "checkout.session.completed") {
            await recordPaidSession(event.data.object);
        }
        res.json({ received: true });
    }
    catch (e) {
        res.status(400).send(`Webhook Error: ${e.message}`);
    }
});
app.use(express.json());


app.get("/api/services", async (req, res) => {
    const db = getDB();
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "");
    const mode = String(req.query.mode || "");
    const sort = String(req.query.sort || "newest");
    const filter = {
        approvalStatus: "approved",
        isAvailable: true,
    };
    if (q) {
        filter.$or = [
            { title: { $regex: q, $options: "i" } },
            { category: { $regex: q, $options: "i" } },
        ];
    }
    if (category)
        filter.category = category;
    if (mode)
        filter.serviceMode = mode;
    const sortOption = sort === "price-asc"
        ? { basePrice: 1 }
        : sort === "price-desc"
            ? { basePrice: -1 }
            : { createdAt: -1 };
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(24, Math.max(1, Number(req.query.limit || 12)));
    const [items, total] = await Promise.all([
        db
            .collection("services")
            .find(filter)
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray(),
        db.collection("services").countDocuments(filter),
    ]);
    res.json({
        items,
        total,
        page,
        pages: Math.ceil(total / limit),
    });
});

app.get("/api/services/mine", verifyToken, verifyTechnician, async (req, res) => {
    const items = await getDB()
        .collection("services")
        .find({ technicianEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray();
    res.json(items);
});

app.get("/api/services/:id", async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(404).json({ message: "Service not found" });
        }
        const item = await getDB()
            .collection("services")
            .findOne({ _id: oid(req.params.id) });
        if (!item) {
            return res.status(404).json({ message: "Service not found" });
        }
        
        if (item.approvalStatus === "approved" &&
            item.isAvailable === true) {
            return res.json(item);
        }
       
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ")
            ? header.slice(7)
            : "";
        if (!token) {
            return res.status(404).json({ message: "Service not found" });
        }
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || "development-only-change-this");
        const { payload } = await jwtVerify(token, secret);
        const isOwner = payload.role === "technician" &&
            typeof payload.email === "string" &&
            payload.email === item.technicianEmail;
        const isAdmin = payload.role === "admin";
        if (!isOwner && !isAdmin) {
            return res.status(404).json({ message: "Service not found" });
        }
        return res.json(item);
    }
    catch (error) {
        console.error("Service details error:", error);
        return res.status(404).json({ message: "Service not found" });
    }
});

app.post("/api/services", verifyToken, verifyTechnician, async (req, res) => {
    const b = req.body || {};
    if (!b.title ||
        !b.category ||
        !b.description ||
        !(Number(b.basePrice) > 0) ||
        !b.image) {
        return res.status(400).json({
            message: "Please provide all required service fields",
        });
    }
    const doc = {
        title: String(b.title),
        category: String(b.category),
        description: String(b.description),
        image: String(b.image),
        basePrice: Number(b.basePrice),
        estimatedDuration: String(b.estimatedDuration || ""),
        serviceMode: String(b.serviceMode || "Home Visit"),
        serviceArea: String(b.serviceArea || ""),
        technicianName: req.user.name,
        technicianEmail: req.user.email,
        approvalStatus: "pending",
        isAvailable: true,
        createdAt: new Date(),
    };
    const result = await getDB()
        .collection("services")
        .insertOne(doc);
    res.status(201).json({
        ...doc,
        _id: result.insertedId,
    });
});

app.patch("/api/services/:id", verifyToken, verifyTechnician, async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(400).json({ message: "Invalid id" });
    }
    const { title, category, description, image, basePrice, estimatedDuration, serviceMode, serviceArea, isAvailable, } = req.body || {};
    const update = {};
    for (const [k, v] of Object.entries({
        title,
        category,
        description,
        image,
        basePrice: basePrice === undefined ? undefined : Number(basePrice),
        estimatedDuration,
        serviceMode,
        serviceArea,
        isAvailable,
    })) {
        if (v !== undefined)
            update[k] = v;
    }
    update.approvalStatus = "pending";
    const result = await getDB()
        .collection("services")
        .updateOne({
        _id: oid(req.params.id),
        technicianEmail: req.user.email,
    }, { $set: update });
    if (!result.matchedCount) {
        return res.status(404).json({ message: "Service not found" });
    }
    res.json({ message: "Updated; waiting for admin approval" });
});

app.delete("/api/services/:id", verifyToken, verifyTechnician, async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(400).json({ message: "Invalid id" });
    }
    const r = await getDB()
        .collection("services")
        .deleteOne({
        _id: oid(req.params.id),
        technicianEmail: req.user.email,
    });
    if (!r.deletedCount) {
        return res.status(404).json({ message: "Service not found" });
    }
    res.json({ message: "Deleted" });
});

app.patch("/api/services/:id/availability", verifyToken, verifyTechnician, async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(400).json({ message: "Invalid id" });
    }
    const r = await getDB()
        .collection("services")
        .updateOne({
        _id: oid(req.params.id),
        technicianEmail: req.user.email,
    }, {
        $set: {
            isAvailable: Boolean(req.body.isAvailable),
        },
    });
    if (!r.matchedCount) {
        return res.status(404).json({ message: "Service not found" });
    }
    res.json({ message: "Availability updated" });
});

app.post("/api/bookings", verifyToken, verifyCustomer, async (req, res) => {
    const b = req.body || {};
    const serviceId = String(b.serviceId || "");
    if (!validId(serviceId)) {
        return res.status(400).json({ message: "Invalid service" });
    }
    const db = getDB();
    const service = await db.collection("services").findOne({
        _id: oid(serviceId),
        approvalStatus: "approved",
        isAvailable: true,
    });
    if (!service) {
        return res.status(404).json({ message: "Service unavailable" });
    }
    if (service.technicianEmail === req.user.email) {
        return res.status(403).json({
            message: "You cannot book your own service",
        });
    }
    if (!b.customerPhone ||
        !b.address ||
        !b.preferredDate ||
        String(b.problemDescription || "").trim().length < 20) {
        return res.status(400).json({
            message: "Complete all fields; problem description must be at least 20 characters",
        });
    }
    const preferredDate = new Date(b.preferredDate);
    if (Number.isNaN(preferredDate.getTime()) ||
        preferredDate.getTime() <= Date.now()) {
        return res.status(400).json({
            message: "Please select a valid future date",
        });
    }
    const active = await db.collection("bookings").findOne({
        serviceId: String(service._id),
        customerEmail: req.user.email,
        status: {
            $in: ["requested", "accepted", "in-progress"],
        },
    });
    if (active) {
        return res.status(409).json({
            message: "You already have an active request for this service",
        });
    }
    const doc = {
        serviceId: String(service._id),
        serviceTitle: service.title,
        serviceImage: service.image,
        category: service.category,
        basePrice: service.basePrice,
        technicianName: service.technicianName,
        technicianEmail: service.technicianEmail,
        customerName: req.user.name,
        customerEmail: req.user.email,
        customerPhone: String(b.customerPhone),
        address: String(b.address),
        preferredDate,
        problemDescription: String(b.problemDescription),
        status: "requested",
        finalAmount: service.basePrice,
        paymentStatus: "unpaid",
        createdAt: new Date(),
        statusHistory: [
            {
                status: "requested",
                changedAt: new Date(),
            },
        ],
    };
    const result = await db.collection("bookings").insertOne(doc);
    const ticketNumber = `FM-${result.insertedId
        .toString()
        .slice(-6)
        .toUpperCase()}`;
    await db.collection("bookings").updateOne({ _id: result.insertedId }, { $set: { ticketNumber } });
    res.status(201).json({
        ...doc,
        _id: result.insertedId,
        ticketNumber,
    });
});
app.get("/api/bookings/my", verifyToken, verifyCustomer, async (req, res) => {
    const bookings = await getDB()
        .collection("bookings")
        .find({ customerEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray();
    res.json(bookings);
});

app.patch("/api/bookings/:id/cancel", verifyToken, verifyCustomer, async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(400).json({ message: "Invalid id" });
    }
    const r = await getDB()
        .collection("bookings")
        .updateOne({
        _id: oid(req.params.id),
        customerEmail: req.user.email,
        status: "requested",
    }, {
        $set: { status: "cancelled" },
        $push: {
            statusHistory: {
                status: "cancelled",
                changedAt: new Date(),
            },
        },
    });
    if (!r.modifiedCount) {
        return res.status(409).json({
            message: "Only your requested bookings can be cancelled",
        });
    }
    res.json({ message: "Booking cancelled" });
});

app.get("/api/bookings/technician", verifyToken, verifyTechnician, async (req, res) => {
    const filter = {
        technicianEmail: req.user.email,
    };
    if (req.query.status && req.query.status !== "all") {
        filter.status = req.query.status;
    }
    const bookings = await getDB()
        .collection("bookings")
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();
    res.json(bookings);
});

app.patch("/api/bookings/:id/status", verifyToken, verifyTechnician, async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(400).json({ message: "Invalid id" });
    }
    const db = getDB();
    const booking = await db.collection("bookings").findOne({
        _id: oid(req.params.id),
        technicianEmail: req.user.email,
    });
    if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
    }
    const next = String(req.body.status || "");
    const allowed = {
        requested: ["accepted", "rejected"],
        accepted: ["in-progress"],
        "in-progress": ["completed"],
    };
    if (!allowed[booking.status]?.includes(next)) {
        return res.status(409).json({
            message: "Invalid status transition",
        });
    }
    const update = {
        status: next,
    };
    if (next === "completed") {
        const amount = Number(req.body.finalAmount);
        if (!(amount > 0)) {
            return res.status(400).json({
                message: "Final amount must be greater than zero",
            });
        }
        update.finalAmount = amount;
    }
    const result = await db.collection("bookings").updateOne({
        _id: booking._id,
        technicianEmail: req.user.email,
        status: booking.status,
    }, {
        $set: update,
        $push: {
            statusHistory: {
                status: next,
                changedAt: new Date(),
            },
        },
    });
    if (!result.modifiedCount) {
        return res.status(409).json({
            message: "Booking status changed. Refresh and try again.",
        });
    }
    res.json({ message: `Booking ${next}` });
});

app.post("/api/payments/create-checkout-session", verifyToken, verifyCustomer, async (req, res) => {
    const id = String(req.body.bookingId || "");
    if (!validId(id)) {
        return res.status(400).json({ message: "Invalid booking" });
    }
    const booking = await getDB()
        .collection("bookings")
        .findOne({
        _id: oid(id),
        customerEmail: req.user.email,
        status: "completed",
        paymentStatus: "unpaid",
    });
    if (!booking) {
        return res.status(409).json({
            message: "Payment is available only for your completed unpaid booking",
        });
    }
    const existingPayment = await getDB()
        .collection("payments")
        .findOne({ bookingId: id });
    if (existingPayment) {
        return res.status(409).json({
            message: "This booking has already been paid",
        });
    }
    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
            {
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: booking.serviceTitle,
                    },
                    unit_amount: Math.round(Number(booking.finalAmount) * 100),
                },
                quantity: 1,
            },
        ],
        success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
        metadata: {
            bookingId: id,
            customerEmail: req.user.email,
        },
    });
    res.json({ url: session.url });
});

app.get("/api/payments/verify", verifyToken, verifyCustomer, async (req, res) => {
    const sessionId = String(req.query.session_id || "");
    if (!sessionId) {
        return res.status(400).json({
            message: "Session ID is required",
        });
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.customerEmail !== req.user.email) {
        return res.status(403).json({ message: "Forbidden" });
    }
    if (session.payment_status === "paid") {
        await recordPaidSession(session);
    }
    const payment = await getDB()
        .collection("payments")
        .findOne({
        stripeSessionId: sessionId,
        customerEmail: req.user.email,
    });
    if (!payment) {
        return res.status(402).json({
            message: "Payment not confirmed yet",
        });
    }
    res.json(payment);
});

app.get("/api/payments/my", verifyToken, verifyCustomer, async (req, res) => {
    const payments = await getDB()
        .collection("payments")
        .find({ customerEmail: req.user.email })
        .sort({ paidAt: -1 })
        .toArray();
    res.json(payments);
});

app.get("/api/admin/users", verifyToken, verifyAdmin, async (_req, res) => {
    const users = await getDB()
        .collection("user")
        .find({}, {
        projection: {
            name: 1,
            email: 1,
            image: 1,
            role: 1,
            createdAt: 1,
        },
    })
        .toArray();
    res.json(users);
});

app.patch("/api/admin/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(400).json({ message: "Invalid id" });
    }
    if (req.params.id === req.user.id) {
        return res.status(400).json({
            message: "You cannot change your own role",
        });
    }
    const role = ["customer", "technician", "admin"].includes(req.body.role)
        ? req.body.role
        : null;
    if (!role) {
        return res.status(400).json({ message: "Invalid role" });
    }
    const r = await getDB()
        .collection("user")
        .updateOne({ _id: oid(req.params.id) }, { $set: { role } });
    if (!r.matchedCount) {
        return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "Role updated" });
});

app.get("/api/admin/services", verifyToken, verifyAdmin, async (_req, res) => {
    const services = await getDB()
        .collection("services")
        .find()
        .sort({
        approvalStatus: 1,
        createdAt: -1,
    })
        .toArray();
    res.json(services);
});

app.patch("/api/admin/services/:id/approval", verifyToken, verifyAdmin, async (req, res) => {
    if (!validId(req.params.id) ||
        !["approved", "rejected"].includes(req.body.approvalStatus)) {
        return res.status(400).json({
            message: "Invalid request",
        });
    }
    const r = await getDB()
        .collection("services")
        .updateOne({ _id: oid(req.params.id) }, {
        $set: {
            approvalStatus: req.body.approvalStatus,
        },
    });
    if (!r.matchedCount) {
        return res.status(404).json({
            message: "Service not found",
        });
    }
    res.json({ message: "Approval updated" });
});

app.get("/api/admin/bookings", verifyToken, verifyAdmin, async (_req, res) => {
    const bookings = await getDB()
        .collection("bookings")
        .find()
        .sort({ createdAt: -1 })
        .toArray();
    res.json(bookings);
});

app.get("/api/admin/payments", verifyToken, verifyAdmin, async (_req, res) => {
    const db = getDB();
    const items = await db
        .collection("payments")
        .find()
        .sort({ paidAt: -1 })
        .toArray();
    const revenue = items.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    res.json({ items, revenue });
});

app.patch("/api/users/profile", verifyToken, async (req, res) => {
    const { name, phone, area, bio, image } = req.body || {};
    const r = await getDB()
        .collection("user")
        .updateOne({ email: req.user.email }, {
        $set: {
            name,
            phone,
            area,
            bio,
            image,
        },
    });
    if (!r.matchedCount) {
        return res.status(404).json({
            message: "User not found",
        });
    }
    res.json({ message: "Profile updated" });
});

app.post("/api/seed/admin", async (req, res) => {
    if (!process.env.ADMIN_SEED_KEY ||
        req.headers["x-seed-key"] !== process.env.ADMIN_SEED_KEY) {
        return res.status(403).json({ message: "Forbidden" });
    }
    const email = process.env.ADMIN_EMAIL;
    if (!email) {
        return res.status(400).json({
            message: "ADMIN_EMAIL missing",
        });
    }
    const r = await getDB()
        .collection("user")
        .updateOne({ email }, {
        $set: { role: "admin" },
    });
    if (!r.matchedCount) {
        return res.status(404).json({
            message: "Sign up with ADMIN_EMAIL first",
        });
    }
    res.json({ message: "Admin role assigned" });
});

    then(() => {
    app.listen(port, () => {
        console.log(`FixMate API running on port ${port}`);
    });
})
    .catch((err) => {
    console.error("Database connection failed:", err);
    process.exit(1);
});
