import { describe, expect, it } from "vitest";

import { buildInvitationEmail, buildPasswordResetEmail, buildVerificationEmail } from "./email-templates";

describe("buildVerificationEmail", () => {
  const url = "https://example.com/verify?token=abc";

  it("contains the verification URL as an href", () => {
    const html = buildVerificationEmail(url);
    expect(html).toContain(`href="${url}"`);
  });

  it("contains 'Verify your email' heading text", () => {
    const html = buildVerificationEmail(url);
    expect(html).toContain("Verify your email");
  });

  it("contains '24 hours' expiry text", () => {
    const html = buildVerificationEmail(url);
    expect(html).toContain("24 hours");
  });
});

describe("buildPasswordResetEmail", () => {
  const url = "https://example.com/reset?token=abc";

  it("contains the reset URL as an href", () => {
    const html = buildPasswordResetEmail(url);
    expect(html).toContain(`href="${url}"`);
  });

  it("contains 'Reset your password' heading text", () => {
    const html = buildPasswordResetEmail(url);
    expect(html).toContain("Reset your password");
  });

  it("contains '1 hour' expiry text", () => {
    const html = buildPasswordResetEmail(url);
    expect(html).toContain("1 hour");
  });
});

describe("buildInvitationEmail", () => {
  const params = {
    inviteUrl: "https://tracky.pro/invite?token=abc123",
    workspaceName: "Acme Corp",
    inviterName: "John Doe",
    role: "admin",
  };

  it("contains the inviterName in the HTML", () => {
    const html = buildInvitationEmail(params);
    expect(html).toContain("John Doe");
  });

  it("contains the workspaceName in the HTML", () => {
    const html = buildInvitationEmail(params);
    expect(html).toContain("Acme Corp");
  });

  it("contains 'an admin' when role is 'admin'", () => {
    const html = buildInvitationEmail({ ...params, role: "admin" });
    expect(html).toContain("an admin");
  });

  it("contains 'a member' when role is 'user'", () => {
    const html = buildInvitationEmail({ ...params, role: "user" });
    expect(html).toContain("a member");
  });

  it("contains the inviteUrl as a link", () => {
    const html = buildInvitationEmail(params);
    expect(html).toContain(`href="${params.inviteUrl}"`);
  });

  it("contains 'Join workspace' button label", () => {
    const html = buildInvitationEmail(params);
    expect(html).toContain("Join workspace");
  });

  it("contains '7 days' expiry text", () => {
    const html = buildInvitationEmail(params);
    expect(html).toContain("7 days");
  });
});
