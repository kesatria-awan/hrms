import type { EmailProvider, EmailSendParams, EmailSendResult } from "./types";

import { MailcowRelayProvider } from "./mailcow-relay";

export type { EmailProvider, EmailSendParams, EmailSendResult };

export type EmailEnv = {
  EMAIL_PROVIDER?: string; // "mailcow-relay" | "log"
  MAIL_RELAY_URL?: string;
  MAIL_RELAY_API_KEY?: string;
};

export function createEmailProvider(env: EmailEnv): EmailProvider {
  const provider = env.EMAIL_PROVIDER ?? "mailcow-relay";
  switch (provider) {
    case "mailcow-relay": {
      if (!env.MAIL_RELAY_URL || !env.MAIL_RELAY_API_KEY) {
        throw new Error("MAIL_RELAY_URL and MAIL_RELAY_API_KEY are required when EMAIL_PROVIDER is 'mailcow-relay'");
      }
      return new MailcowRelayProvider({
        MAIL_RELAY_URL: env.MAIL_RELAY_URL,
        MAIL_RELAY_API_KEY: env.MAIL_RELAY_API_KEY,
      }) as unknown as EmailProvider;
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