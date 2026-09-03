import type { EmailProvider, EmailSendParams, EmailSendResult } from "./types";

import { SmtpDirectProvider } from "./smtp-direct";

export type { EmailProvider, EmailSendParams, EmailSendResult };

export type EmailEnv = {
  EMAIL_PROVIDER?: string; // "smtp-direct" | "log"
  SMTP_HOST?: string; // securemail.kawan.pro
  SMTP_PORT?: string;
  SMTP_USER?: string; // hr@kesatria.my
  SMTP_PASS?: string;
};

export function createEmailProvider(env: EmailEnv): EmailProvider {
  const provider = env.EMAIL_PROVIDER ?? "smtp-direct";
  switch (provider) {
    case "smtp-direct": {
      if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
        throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS are required when EMAIL_PROVIDER is 'smtp-direct'");
      }
      return new SmtpDirectProvider({
        SMTP_HOST: env.SMTP_HOST,
        SMTP_PORT: env.SMTP_PORT,
        SMTP_USER: env.SMTP_USER,
        SMTP_PASS: env.SMTP_PASS,
      });
    }
    case "log":
      // Dev/test: log instead of sending
      return {
        send: async (params) => {
          console.log(`[email:log] to=${params.to.email} subject="${params.subject}"`);
          return { messageId: "log-only" };
        },
      } satisfies EmailProvider;
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}

export async function sendEmail(env: EmailEnv, params: EmailSendParams): Promise<EmailSendResult> {
  return createEmailProvider(env).send(params);
}