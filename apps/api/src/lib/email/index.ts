import type { EmailProvider, EmailSendParams, EmailSendResult } from "./types";

import { BrevoProvider } from "./brevo";
import { SecureMailProvider } from "./securemail";

export type { EmailProvider, EmailSendParams, EmailSendResult };

export type EmailEnv = {
  EMAIL_PROVIDER?: string;
  BREVO_API_KEY: string;
  SECUREMAIL_API_KEY?: string;
};

export function createEmailProvider(env: EmailEnv): EmailProvider {
  const provider = env.EMAIL_PROVIDER ?? "brevo";
  switch (provider) {
    case "securemail": {
      if (!env.SECUREMAIL_API_KEY) {
        throw new Error("SECUREMAIL_API_KEY is required when EMAIL_PROVIDER is 'securemail'");
      }
      return new SecureMailProvider(env.SECUREMAIL_API_KEY);
    }
    case "brevo":
      return new BrevoProvider(env.BREVO_API_KEY);
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}

export async function sendEmail(env: EmailEnv, params: EmailSendParams): Promise<EmailSendResult> {
  return createEmailProvider(env).send(params);
}
