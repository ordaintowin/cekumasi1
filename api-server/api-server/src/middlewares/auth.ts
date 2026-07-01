import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, teensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) throw new Error("SESSION_SECRET environment variable must be set");

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: number };

    // Teen user — encoded as negative userId (-teenId)
    if (payload.userId < 0) {
      const teenId = -payload.userId;
      const teen = await db.select().from(teensTable)
        .where(and(eq(teensTable.id, teenId), eq(teensTable.isArchived, false))).limit(1);
      if (!teen.length) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      (req as any).user = {
        id: payload.userId,
        username: teen[0].membershipId ?? "",
        passwordHash: "",
        roleLevel: 5,
        roleSubtype: "teen",
        memberId: null,
        teenId: teen[0].id,
        isActive: true,
      };
      return next();
    }

    const user = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user.length || !user[0].isActive) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    (req as any).user = user[0];
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(minLevel: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || user.roleLevel > minLevel) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return next();
  authenticateToken(req, res, next);
}
