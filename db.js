import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();
const uri = process.env.MONGODB_URI;
if (!uri)
    throw new Error("MONGODB_URI is required");
const client = new MongoClient(uri);
let db;
export async function connectDB() {
    if (!db) {
        await client.connect();
        db = client.db(process.env.DB_NAME || "fixmate");
        await Promise.all([
            db.collection("services").createIndex({ technicianEmail: 1 }),
            db.collection("services").createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 }),
            db.collection("bookings").createIndex({ customerEmail: 1 }),
            db.collection("bookings").createIndex({ technicianEmail: 1 }),
            db.collection("bookings").createIndex({ serviceId: 1, customerEmail: 1, status: 1 }),
            db.collection("payments").createIndex({ stripeSessionId: 1 }, { unique: true, sparse: true }),
            db.collection("payments").createIndex({ bookingId: 1 }, { unique: true, sparse: true })
        ]);
    }
    return db;
}
export const getDB = () => {
    if (!db)
        throw new Error("Database not connected");
    return db;
};
