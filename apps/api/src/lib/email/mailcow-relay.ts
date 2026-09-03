import type { EmailSendResult } from "./types";

type MailRelayEnv = {
  MAIL_RELAY_URL: string;
  MAIL_RELAY_API_KEY: string;
};

/**
 * Mailcow relay provider — sends OTP/system email through the KA mail relay
 * (tiny HTTP endpoint on KawanPro-VM → mailcow SMTP 10.10.0.36:587), exposed via
 * Cloudflare tunnel. Workers cannot reach LAN SMTP directly; the relay bridges that.
 */
export class MailcowRelayProvider {
  constructor(private env: MailRelayEnv) {}

  async send(params: {
    to: { email: string; name?: string | null };
    subject: string;
    htmlContent: string;
    sender?: { email: string; name: string };
  }): Promise<EmailSendResult> {
    const response = await fetch(`${this.env.MAIL_RELAY_URL}/send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.env.MAIL_RELAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: params.sender ?? { email: "hr@kesatria.my", name: "KA HRMS" },
        to: [params.to],
        subject: params.subject,
        htmlContent: params.htmlContent,
      }),
      // OTP emails must be fast; fail loudly rather than hang
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mail relay error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { message_id?: string };
    return { messageId: data.message_id ?? "relay-accepted" };
  }
}