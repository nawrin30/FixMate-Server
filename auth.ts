import { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";

export type Role = "customer" | "technician" | "admin";
export interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; role: Role };
}
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "development-only-change-this");

export async function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.role !== "string") {
      return res.status(401).json({ message: "Invalid token" });
    }
    req.user = { id: String(payload.sub), email: payload.email, name: String(payload.name || ""), role: payload.role as Role };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
function roleOnly(role: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}
export const verifyCustomer = roleOnly("customer");
export const verifyTechnician = roleOnly("technician");
export const verifyAdmin = roleOnly("admin");
