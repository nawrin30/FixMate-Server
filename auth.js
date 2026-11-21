import { jwtVerify } from "jose";
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "development-only-change-this");
export async function verifyToken(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (!token)
            return res.status(401).json({ message: "Authentication required" });
        const { payload } = await jwtVerify(token, secret());
        if (!payload.sub || typeof payload.email !== "string" || typeof payload.role !== "string") {
            return res.status(401).json({ message: "Invalid token" });
        }
        req.user = { id: String(payload.sub), email: payload.email, name: String(payload.name || ""), role: payload.role };
        next();
    }
    catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
function roleOnly(role) {
    return (req, res, next) => {
        if (req.user?.role !== role)
            return res.status(403).json({ message: "Forbidden" });
        next();
    };
}
export const verifyCustomer = roleOnly("customer");
export const verifyTechnician = roleOnly("technician");
export const verifyAdmin = roleOnly("admin");
