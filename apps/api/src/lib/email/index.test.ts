import { describe, expect, it } from "vitest";

import { BrevoProvider } from "./brevo";
import { createEmailProvider, sendEmail } from "./index";
import { SecureMailProvider } from "./securemail";

describe("createEmailProvider", () => {
  const baseEnv = {
    BREVO_API_KEY: "brevo-key",
    SECUREMAIL_API_KEY: "securemail-key",
  };

  it("defaults to BrevoProvider when EMAIL_PROVIDER is not set", () => {
    const provider = createEmailProvider(baseEnv);
    expect(provider).toBeInstanceOf(BrevoProvider);
  });

  it("returns BrevoProvider when EMAIL_PROVIDER is 'brevo'", () => {
    const provider = createEmailProvider({ ...baseEnv, EMAIL_PROVIDER: "brevo" });
    expect(provider).toBeInstanceOf(BrevoProvider);
  });

  it("returns SecureMailProvider when EMAIL_PROVIDER is 'securemail'", () => {
    const provider = createEmailProvider({ ...baseEnv, EMAIL_PROVIDER: "securemail" });
    expect(provider).toBeInstanceOf(SecureMailProvider);
  });

  it("throws when EMAIL_PROVIDER is 'securemail' but SECUREMAIL_API_KEY is missing", () => {
    expect(() =>
      createEmailProvider({ BREVO_API_KEY: "brevo-key", EMAIL_PROVIDER: "securemail" }),
    ).toThrow("SECUREMAIL_API_KEY is required");
  });

  it("throws on unknown provider value", () => {
    expect(() =>
      createEmailProvider({ ...baseEnv, EMAIL_PROVIDER: "unknown" }),
    ).toThrow("Unknown email provider: unknown");
  });
});

describe("sendEmail", () => {
  it("rejects instead of throwing on bad provider config", async () => {
    const env = { BREVO_API_KEY: "key", EMAIL_PROVIDER: "unknown" };
    const params = { to: { email: "a@b.com" }, subject: "hi", htmlContent: "<p>hi</p>" };
    await expect(sendEmail(env, params)).rejects.toThrow("Unknown email provider: unknown");
  });
});
