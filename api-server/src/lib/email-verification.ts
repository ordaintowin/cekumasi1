import crypto from "crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db, emailVerificationTokensTable } from "@workspace/db";
import { getEmailConfig, sendEmail } from "./email";

export type VerificationEmailResult = "sent" | "unavailable" | "rate_limited";

export async function sendMemberEmailVerification(
  memberId: number,
  email: string,
): Promise<VerificationEmailResult> {
  const config = getEmailConfig();
  if (!config) return "unavailable";

  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  const recentRequests = await db.select({ id: emailVerificationTokensTable.id })
    .from(emailVerificationTokensTable)
    .where(and(
      eq(emailVerificationTokensTable.memberId, memberId),
      gte(emailVerificationTokensTable.createdAt, new Date(now.getTime() - 15 * 60 * 1000)),
    ))
    .limit(3);
  if (recentRequests.length >= 3) return "rate_limited";

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await db.update(emailVerificationTokensTable)
    .set({ usedAt: now })
    .where(and(
      eq(emailVerificationTokensTable.memberId, memberId),
      isNull(emailVerificationTokensTable.usedAt),
    ));
  await db.insert(emailVerificationTokensTable).values({
    tokenHash,
    memberId,
    email: normalizedEmail,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  const verifyUrl = new URL("/verify-email", config.publicAppUrl);
  verifyUrl.searchParams.set("token", rawToken);
  const subject = "Verify your church portal email address";
  const text = [
    "Please verify this email address for your church portal account.",
    "",
    `Use this link within 24 hours to verify your email: ${verifyUrl.toString()}`,
    "",
    "If you did not request this, you can ignore this email.",
    "Need help? WhatsApp the admin at +233 26 182 7900 or call +233 55 372 2482.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#25213a">
    <h2>Verify your church portal email</h2>
    <p>Confirm that this email address belongs to you by using the link below.</p>
    <p><a href="${verifyUrl.toString()}" style="display:inline-block;padding:12px 18px;background:#5b21b6;color:#fff;text-decoration:none;border-radius:6px">Verify email address</a></p>
    <p>This link expires in 24 hours. If you did not request this, ignore this email.</p>
    <p>Need help? WhatsApp the admin at <a href="https://wa.me/233261827900">+233 26 182 7900</a> or call <a href="tel:+233553722482">+233 55 372 2482</a>.</p>
  </div>`;

  try {
    await sendEmail(normalizedEmail, subject, text, html, config);
    return "sent";
  } catch (err) {
    await db.update(emailVerificationTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokensTable.tokenHash, tokenHash));
    console.warn("Email verification message could not be sent:", err instanceof Error ? err.message : "unknown error");
    return "unavailable";
  }
}
