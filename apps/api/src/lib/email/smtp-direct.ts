import type { EmailProvider, EmailSendParams, EmailSendResult } from "./types";

import { sendViaSmtp } from "./smtp-client";

export type SmtpDirectEnv = {
  SMTP_HOST: string; // securemail.kawan.pro
  SMTP_PORT?: string; // 587
  SMTP_USER: string; // hr@kesatria.my
  SMTP_PASS: string;
};

/**
 * Direct SMTP provider — talks SMTP-over-TLS from the Worker via Cloudflare
 * TCP sockets (cloudflare:sockets) to the public mailcow at securemail.kawan.pro.
 * No VM relay needed.
 */
export class SmtpDirectProvider implements EmailProvider {
  constructor(private env: SmtpDirectEnv) {}

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const messageId = await sendViaSmtp(
      {
        host: this.env.SMTP_HOST,
        port: Number(this.env.SMTP_PORT ?? 587),
        user: this.env.SMTP_USER,
        pass: this.env.SMTP_PASS,
      },
      {
        from: this.env.SMTP_USER,
        to: [params.to.email],
        subject: params.subject,
        html: params.htmlContent,
      },
    );
    return { messageId };
  }
}