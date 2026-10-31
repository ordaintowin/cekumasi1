export type EmailConfig = {
  apiKey: string;
  from: string;
  publicAppUrl: string;
};

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim() || "https://app.christembassykumasi1.org";
  if (!apiKey || !from) return null;

  try {
    const parsedUrl = new URL(publicAppUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") return null;
    return { apiKey, from, publicAppUrl: parsedUrl.origin };
  } catch {
    return null;
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
  config: EmailConfig,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: config.from, to, subject, text, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend returned HTTP ${response.status}`);
  }
}
