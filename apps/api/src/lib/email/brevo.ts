import type { EmailProvider, EmailSendParams, EmailSendResult } from "./types";

type BrevoResponse = {
  messageId: string;
};

export class BrevoProvider implements EmailProvider {
  constructor(private apiKey: string) {}

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Tracky Pro", email: "noreply@tracky.pro" },
        to: [{ email: params.to.email, name: params.to.name ?? params.to.email }],
        subject: params.subject,
        htmlContent: params.htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<BrevoResponse>;
  }
}
