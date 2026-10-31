import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, membersTable, cellsTable, seniorCellsTable, pcfsTable, teensTable,
  passwordResetTokensTable, emailVerificationTokensTable,
} from "@workspace/db";
import { eq, and, gte, gt, isNull, lt, lte, sql } from "drizzle-orm";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middlewares/auth";
import { getEmailConfig, sendEmail, type EmailConfig } from "../lib/email";
import { sendMemberEmailVerification } from "../lib/email-verification";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) throw new Error("SESSION_SECRET environment variable must be set");

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

type ResetMode = "password" | "pin";
type ResetTarget = {
  targetType: "user" | "member" | "teen";
  targetId: number;
  email: string;
  emailVerified: boolean;
};

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function resolveResetTarget(
  email: string,
  mode: ResetMode,
  membershipId?: string,
): Promise<ResetTarget | null> {
  if (mode === "password") {
    const matchingMembers = await db.select({
      id: membersTable.id,
      email: membersTable.email,
      emailVerified: membersTable.emailVerified,
    }).from(membersTable).where(and(
      eq(membersTable.isArchived, false),
      sql`lower(${membersTable.email}) = ${email}`,
    )).limit(5);

    const accounts: ResetTarget[] = [];
    for (const member of matchingMembers) {
      if (!member.email) continue;
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(and(
        eq(usersTable.memberId, member.id),
        eq(usersTable.isActive, true),
        lte(usersTable.roleLevel, 4),
      )).limit(2);
      for (const admin of admins) {
        accounts.push({
          targetType: "user",
          targetId: admin.id,
          email: member.email,
          emailVerified: member.emailVerified,
        });
      }
    }
    return accounts.length === 1 ? accounts[0] : null;
  }

  if (membershipId) {
    const memberMatches = await db.select({
      id: membersTable.id,
      email: membersTable.email,
      emailVerified: membersTable.emailVerified,
    }).from(membersTable).where(and(
      eq(membersTable.membershipId, membershipId),
      eq(membersTable.isArchived, false),
      sql`lower(${membersTable.email}) = ${email}`,
    )).limit(1);

    const teenMatches = await db.select({
      id: teensTable.id,
      parentId: teensTable.parentId,
    }).from(teensTable).where(and(
      eq(teensTable.membershipId, membershipId),
      eq(teensTable.isArchived, false),
    )).limit(1);

    const targets: ResetTarget[] = [];
    if (memberMatches.length && memberMatches[0].email) {
      targets.push({
        targetType: "member",
        targetId: memberMatches[0].id,
        email: memberMatches[0].email,
        emailVerified: memberMatches[0].emailVerified,
      });
    }
    if (teenMatches.length && teenMatches[0].parentId) {
      const parent = await db.select({
        email: membersTable.email,
        emailVerified: membersTable.emailVerified,
      }).from(membersTable).where(and(
        eq(membersTable.id, teenMatches[0].parentId),
        eq(membersTable.isArchived, false),
        sql`lower(${membersTable.email}) = ${email}`,
      )).limit(1);
      if (parent.length && parent[0].email) {
        targets.push({
          targetType: "teen",
          targetId: teenMatches[0].id,
          email: parent[0].email,
          emailVerified: parent[0].emailVerified,
        });
      }
    }
    return targets.length === 1 ? targets[0] : null;
  }

  const matchingMembers = await db.select({
    id: membersTable.id,
    email: membersTable.email,
    emailVerified: membersTable.emailVerified,
  }).from(membersTable).where(and(
    eq(membersTable.isArchived, false),
    sql`lower(${membersTable.email}) = ${email}`,
  )).limit(2);

  return matchingMembers.length === 1 && matchingMembers[0].email
    ? {
        targetType: "member",
        targetId: matchingMembers[0].id,
        email: matchingMembers[0].email,
        emailVerified: matchingMembers[0].emailVerified,
      }
    : null;
}

async function sendPasswordResetEmail(to: string, mode: ResetMode, rawToken: string, config: EmailConfig) {
  const resetUrl = new URL("/reset-password", config.publicAppUrl);
  resetUrl.searchParams.set("token", rawToken);
  resetUrl.searchParams.set("mode", mode);

  const credentialName = mode === "pin" ? "PIN" : "password";
  const subject = `Reset your church portal ${credentialName}`;
  const text = [
    "A request was made to reset access to your church portal account.",
    "",
    `Use this one-time link within 30 minutes to set a new ${credentialName}:`,
    resetUrl.toString(),
    "",
    "If you did not request this, you can ignore this email.",
    "Need help? WhatsApp the admin at +233 26 182 7900 or call +233 55 372 2482.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#25213a">
    <h2>Reset your church portal ${credentialName}</h2>
    <p>A request was made to reset access to your account.</p>
    <p><a href="${resetUrl.toString()}" style="display:inline-block;padding:12px 18px;background:#5b21b6;color:#fff;text-decoration:none;border-radius:6px">Set a new ${credentialName}</a></p>
    <p>This one-time link expires in 30 minutes. If you did not request this, ignore this email.</p>
    <p>Need help? WhatsApp the admin at <a href="https://wa.me/233261827900">+233 26 182 7900</a> or call <a href="tel:+233553722482">+233 55 372 2482</a>.</p>
  </div>`;

  await sendEmail(to, subject, text, html, config);
}

function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET!, { expiresIn: "7d" });
}

function getRoleString(level: number, subtype: string | null): string {
  switch (level) {
    case 1: return "super_admin";
    case 2: return "finance_admin";
    case 3: return subtype ? `admin_${subtype}` : "admin";
    case 4: return "leader";
    case 5: return "member";
    default: return "member";
  }
}

async function getLeaderCellInfo(memberId: number | null | undefined) {
  if (!memberId) return {
    leadsCellId: null, leadsCellName: null,
    leadsSeniorCellId: null, leadsSeniorCellName: null,
    leadsPcfId: null, leadsPcfName: null,
  };
  const [leadsCell, leadsSC, leadsPCF] = await Promise.all([
    db.select({ id: cellsTable.id, name: cellsTable.name })
      .from(cellsTable)
      .where(and(eq(cellsTable.leaderId, memberId), eq(cellsTable.isArchived, false)))
      .limit(1),
    db.select({ id: seniorCellsTable.id, name: seniorCellsTable.name })
      .from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.leaderId, memberId), eq(seniorCellsTable.isArchived, false)))
      .limit(1),
    db.select({ id: pcfsTable.id, name: pcfsTable.name })
      .from(pcfsTable)
      .where(and(eq(pcfsTable.leaderId, memberId), eq(pcfsTable.isArchived, false)))
      .limit(1),
  ]);
  return {
    leadsCellId: leadsCell.length ? leadsCell[0].id : null,
    leadsCellName: leadsCell.length ? leadsCell[0].name : null,
    leadsSeniorCellId: leadsSC.length ? leadsSC[0].id : null,
    leadsSeniorCellName: leadsSC.length ? leadsSC[0].name : null,
    leadsPcfId: leadsPCF.length ? leadsPCF[0].id : null,
    leadsPcfName: leadsPCF.length ? leadsPCF[0].name : null,
  };
}

router.post("/login", async (req, res) => {
  const { username, password, loginType } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  // Teen PIN login: look up teen by membershipId, compare PIN
  if (loginType === "teen_pin") {
    const teen = await db.select().from(teensTable)
      .where(and(eq(teensTable.membershipId, username), eq(teensTable.isArchived, false))).limit(1);
    if (!teen.length || teen[0].pin !== password) {
      return res.status(401).json({ error: "Invalid membership ID or PIN" });
    }
    const t = teen[0];
    const token = generateToken(-t.id);
    return res.json({
      token,
      user: {
        id: -t.id,
        username: t.membershipId ?? "",
        role: "member",
        roleLevel: 5,
        roleSubtype: "teen",
        memberId: null,
        teenId: t.id,
        memberName: `${t.firstName} ${t.lastName}`,
        leadsCellId: null, leadsCellName: null,
        leadsSeniorCellId: null, leadsSeniorCellName: null,
        leadsPcfId: null, leadsPcfName: null,
      },
    });
  }

  // Member PIN login: look up by membershipId in members first, then fall through to teens
  if (loginType === "member_pin") {
    const member = await db.select().from(membersTable)
      .where(and(eq(membersTable.membershipId, username), eq(membersTable.isArchived, false))).limit(1);

    if (member.length && member[0].pin === password) {
      // Found in members table — proceed as member
      let memberUser = await db.select().from(usersTable)
        .where(and(eq(usersTable.memberId, member[0].id), gte(usersTable.roleLevel, 4))).limit(1);
      if (!memberUser.length) {
        const newUser = await db.insert(usersTable).values({
          username: member[0].membershipId.toLowerCase(),
          passwordHash: hashPassword(member[0].pin ?? ""),
          roleLevel: 5,
          roleSubtype: null,
          memberId: member[0].id,
          isActive: true,
        }).returning();
        memberUser = newUser;
      }
      const u = memberUser[0];
      const token = generateToken(u.id);
      const cellInfo = await getLeaderCellInfo(u.memberId);
      return res.json({
        token,
        user: {
          id: u.id, username: u.username,
          role: getRoleString(u.roleLevel, u.roleSubtype),
          roleLevel: u.roleLevel, memberId: u.memberId,
          memberName: `${member[0].firstName} ${member[0].lastName}`,
          ...cellInfo,
        }
      });
    }

    // Not found in members — try teens table
    const teen = await db.select().from(teensTable)
      .where(and(eq(teensTable.membershipId, username), eq(teensTable.isArchived, false))).limit(1);
    if (teen.length && teen[0].pin === password) {
      const t = teen[0];
      const token = generateToken(-t.id);
      return res.json({
        token,
        user: {
          id: -t.id,
          username: t.membershipId ?? "",
          role: "member",
          roleLevel: 5,
          roleSubtype: "teen",
          memberId: null,
          teenId: t.id,
          memberName: `${t.firstName} ${t.lastName}`,
          leadsCellId: null, leadsCellName: null,
          leadsSeniorCellId: null, leadsSeniorCellName: null,
          leadsPcfId: null, leadsPcfName: null,
        },
      });
    }

    return res.status(401).json({ error: "Invalid membership ID or PIN" });
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (!users.length) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const u = users[0];
  if (!u.isActive) return res.status(401).json({ error: "Account is deactivated" });
  const hash = hashPassword(password);
  if (u.passwordHash !== hash) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = generateToken(u.id);

  let memberName: string | null = null;
  if (u.memberId) {
    const member = await db.select({ firstName: membersTable.firstName, lastName: membersTable.lastName })
      .from(membersTable).where(eq(membersTable.id, u.memberId)).limit(1);
    if (member.length) memberName = `${member[0].firstName} ${member[0].lastName}`;
  }

  const cellInfo2 = await getLeaderCellInfo(u.memberId);

  res.json({
    token,
    user: {
      id: u.id, username: u.username,
      role: getRoleString(u.roleLevel, u.roleSubtype),
      roleLevel: u.roleLevel, roleSubtype: u.roleSubtype ?? null,
      memberId: u.memberId,
      memberName,
      ...cellInfo2,
    }
  });
});

router.post("/email-verification/verify", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (token.length < 32 || token.length > 128) {
    return res.status(400).json({ error: "This verification link is invalid or expired. Request a new one." });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();
  try {
    const verified = await db.transaction(async (tx) => {
      const claimed = await tx.update(emailVerificationTokensTable)
        .set({ usedAt: now })
        .where(and(
          eq(emailVerificationTokensTable.tokenHash, tokenHash),
          isNull(emailVerificationTokensTable.usedAt),
          gt(emailVerificationTokensTable.expiresAt, now),
        ))
        .returning({
          memberId: emailVerificationTokensTable.memberId,
          email: emailVerificationTokensTable.email,
        });
      if (!claimed.length) return false;

      const result = await tx.update(membersTable)
        .set({ emailVerified: true })
        .where(and(
          eq(membersTable.id, claimed[0].memberId),
          eq(membersTable.isArchived, false),
          sql`lower(trim(${membersTable.email})) = ${claimed[0].email}`,
        ))
        .returning({ id: membersTable.id });
      return result.length === 1;
    });

    if (!verified) {
      return res.status(400).json({ error: "This verification link is invalid, expired, or no longer matches your email." });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Email verification failed:", err instanceof Error ? err.message : "unknown error");
    return res.status(500).json({ error: "We could not verify this email. Please contact the admin." });
  }
});

router.post("/email-verification/request", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  if (!user.memberId) {
    return res.status(400).json({ error: "Please contact the admin to verify the email linked to your account." });
  }

  try {
    const members = await db.select({
      id: membersTable.id,
      email: membersTable.email,
      emailVerified: membersTable.emailVerified,
    }).from(membersTable).where(and(
      eq(membersTable.id, user.memberId),
      eq(membersTable.isArchived, false),
    )).limit(1);
    if (!members.length) return res.status(404).json({ error: "Member profile not found." });
    const member = members[0];
    if (!member.email) {
      return res.status(400).json({ error: "Add an email address to your profile, or contact the admin for help." });
    }
    if (member.emailVerified) return res.json({ success: true, alreadyVerified: true });

    const result = await sendMemberEmailVerification(member.id, member.email);
    if (result === "rate_limited") {
      return res.status(429).json({ error: "Too many verification emails were requested. Please try again later." });
    }
    if (result !== "sent") {
      return res.status(503).json({ error: "We could not send a verification email. Please contact the admin." });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Email verification request failed:", err instanceof Error ? err.message : "unknown error");
    return res.status(500).json({ error: "We could not send a verification email. Please contact the admin." });
  }
});

router.post("/password-reset/request", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const mode = req.body?.mode as ResetMode;
  const membershipId = typeof req.body?.membershipId === "string"
    ? req.body.membershipId.trim()
    : "";

  if (!email || (mode !== "password" && mode !== "pin") || membershipId.length > 50) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const config = getEmailConfig();
  if (!config) {
    return res.status(503).json({ error: "Email reset is not configured yet. Please contact the admin." });
  }

  try {
    const target = await resolveResetTarget(email, mode, membershipId || undefined);
    if (!target) return res.json({ success: true });
    if (!target.emailVerified) return res.json({ success: true, supportRequired: true });

    const now = new Date();
    const recentRequests = await db.select({ id: passwordResetTokensTable.id })
      .from(passwordResetTokensTable)
      .where(and(
        eq(passwordResetTokensTable.targetType, target.targetType),
        eq(passwordResetTokensTable.targetId, target.targetId),
        eq(passwordResetTokensTable.purpose, mode),
        gte(passwordResetTokensTable.createdAt, new Date(now.getTime() - 15 * 60 * 1000)),
      ))
      .limit(3);
    if (recentRequests.length >= 3) return res.json({ success: true });

    await db.delete(passwordResetTokensTable)
      .where(lt(passwordResetTokensTable.expiresAt, now));
    await db.update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(and(
        eq(passwordResetTokensTable.targetType, target.targetType),
        eq(passwordResetTokensTable.targetId, target.targetId),
        eq(passwordResetTokensTable.purpose, mode),
        isNull(passwordResetTokensTable.usedAt),
      ));

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await db.insert(passwordResetTokensTable).values({
      tokenHash,
      purpose: mode,
      targetType: target.targetType,
      targetId: target.targetId,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    });

    try {
      await sendPasswordResetEmail(target.email, mode, rawToken, config);
    } catch (err) {
      await db.update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokensTable.tokenHash, tokenHash));
      console.warn("Password reset email could not be sent:", err instanceof Error ? err.message : "unknown error");
    }

    // Keep the response identical whether or not an account matched the email.
    return res.json({ success: true });
  } catch (err) {
    console.error("Password reset request failed:", err instanceof Error ? err.message : "unknown error");
    return res.status(500).json({ error: "We could not process the request. Please contact the admin." });
  }
});

router.post("/password-reset/complete", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const mode = req.body?.mode as ResetMode;
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  const newPin = typeof req.body?.newPin === "string" ? req.body.newPin : "";

  if (token.length < 32 || token.length > 128 || (mode !== "password" && mode !== "pin")) {
    return res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." });
  }
  if (mode === "password" && (newPassword.length < 8 || newPassword.length > 128)) {
    return res.status(400).json({ error: "Your new password must be at least 8 characters." });
  }
  if (mode === "pin" && !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: "Your new PIN must contain exactly 4 digits." });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();
  try {
    const completed = await db.transaction(async (tx) => {
      const claimed = await tx.update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          eq(passwordResetTokensTable.purpose, mode),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, now),
        ))
        .returning({
          targetType: passwordResetTokensTable.targetType,
          targetId: passwordResetTokensTable.targetId,
        });
      if (!claimed.length) return false;

      const target = claimed[0];
      let updated: { id: number }[] = [];
      if (mode === "password" && target.targetType === "user") {
        updated = await tx.update(usersTable)
          .set({ passwordHash: hashPassword(newPassword) })
          .where(and(eq(usersTable.id, target.targetId), eq(usersTable.isActive, true)))
          .returning({ id: usersTable.id });
      } else if (mode === "pin" && target.targetType === "member") {
        updated = await tx.update(membersTable)
          .set({ pin: newPin })
          .where(and(eq(membersTable.id, target.targetId), eq(membersTable.isArchived, false)))
          .returning({ id: membersTable.id });
      } else if (mode === "pin" && target.targetType === "teen") {
        updated = await tx.update(teensTable)
          .set({ pin: newPin })
          .where(and(eq(teensTable.id, target.targetId), eq(teensTable.isArchived, false)))
          .returning({ id: teensTable.id });
      }
      return updated.length === 1;
    });

    if (!completed) {
      return res.status(400).json({ error: "This reset link is invalid, already used, or expired. Request a new one." });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Password reset completion failed:", err instanceof Error ? err.message : "unknown error");
    return res.status(500).json({ error: "We could not reset your sign-in details. Please contact the admin." });
  }
});

router.post("/logout", (req, res) => {
  res.json({ success: true });
});

router.get("/me", authenticateToken, async (req, res) => {
  const user = (req as any).user;

  // Teen user path
  if (user.teenId) {
    const teen = await db.select().from(teensTable).where(eq(teensTable.id, user.teenId)).limit(1);
    if (!teen.length) return res.status(401).json({ error: "Teen not found" });
    const t = teen[0];
    return res.json({
      id: user.id,
      username: user.username,
      role: "member",
      roleLevel: 5,
      roleSubtype: "teen",
      memberId: null,
      teenId: t.id,
      memberName: `${t.firstName} ${t.lastName}`,
      leadsCellId: null, leadsCellName: null,
      leadsSeniorCellId: null, leadsSeniorCellName: null,
      leadsPcfId: null, leadsPcfName: null,
    });
  }

  let memberName: string | null = null;
  let dateOfBirth: string | null = null;
  if (user.memberId) {
    const member = await db.select({ firstName: membersTable.firstName, lastName: membersTable.lastName, dateOfBirth: membersTable.dateOfBirth })
      .from(membersTable).where(eq(membersTable.id, user.memberId)).limit(1);
    if (member.length) {
      memberName = `${member[0].firstName} ${member[0].lastName}`;
      dateOfBirth = member[0].dateOfBirth ?? null;
    }
  }
  const meInfo = await getLeaderCellInfo(user.memberId);
  res.json({
    id: user.id, username: user.username,
    role: getRoleString(user.roleLevel, user.roleSubtype),
    roleLevel: user.roleLevel, memberId: user.memberId,
    memberName, dateOfBirth,
    roleSubtype: user.roleSubtype,
    ...meInfo,
  });
});

router.post("/change-pin", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { currentPin, newPin } = req.body;
  if (!newPin || String(newPin).length < 3 || String(newPin).length > 6) {
    return res.status(400).json({ error: "New PIN must be 3–6 digits" });
  }

  // Teen PIN change
  if (user.teenId) {
    const teen = await db.select().from(teensTable).where(eq(teensTable.id, user.teenId)).limit(1);
    if (!teen.length) return res.status(404).json({ error: "Teen not found" });
    if (teen[0].pin !== currentPin) return res.status(401).json({ error: "Current PIN is incorrect" });
    await db.update(teensTable).set({ pin: newPin }).where(eq(teensTable.id, user.teenId));
    return res.json({ success: true });
  }

  // Member PIN change
  if (!user.memberId) return res.status(403).json({ error: "Not a member" });
  const member = await db.select().from(membersTable).where(eq(membersTable.id, user.memberId)).limit(1);
  if (!member.length) return res.status(404).json({ error: "Member not found" });
  if (member[0].pin !== currentPin) return res.status(401).json({ error: "Current PIN is incorrect" });
  await db.update(membersTable).set({ pin: newPin }).where(eq(membersTable.id, user.memberId));
  res.json({ success: true });
});

export default router;
