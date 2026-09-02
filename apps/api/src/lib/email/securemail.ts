import type { EmailProvider, EmailSendParams, EmailSendResult } from "./types";

type SecureMailResponse = {
  message_id: string;
  status: string;
};

export class SecureMailProvider implements EmailProvider {
  constructor(private apiKey: string) {}

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const response = await fetch("https://api.securemail.kawan.pro/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: "noreply@tracky.pro", name: "Tracky Pro" },
        to: [{ email: params.to.email, name: params.to.name ?? null }],
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: null,
        templateName: null,
        vars: null,
        replyTo: null,
        webhook_url: null,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SecureMail API error ${response.status}: ${body}`);
    }

    const data = await response.json() as SecureMailResponse;
    return { messageId: data.message_id };
  }
}
