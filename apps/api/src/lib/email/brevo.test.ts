import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailSendParams } from "./types";

import { BrevoProvider } from "./brevo";

const mockFetch = vi.fn();

describe("brevoProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ messageId: "test-message-id-123" }), { status: 201 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const params: EmailSendParams = {
    to: { email: "recipient@example.com", name: "Test Recipient" },
    subject: "Test Subject",
    htmlContent: "<p>Hello world</p>",
  };

  const provider = new BrevoProvider("test-brevo-api-key");

  it("calls fetch with the correct Brevo API URL", async () => {
    await provider.send(params);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.anything(),
    );
  });

  it("passes correct headers including api-key and content-type", async () => {
    await provider.send(params);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("test-brevo-api-key");
    expect(headers["content-type"]).toBe("application/json");
  });

  it("request body contains sender with Tracky Pro name and noreply@tracky.pro email", async () => {
    await provider.send(params);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.sender).toEqual({ name: "Tracky Pro", email: "noreply@tracky.pro" });
  });

  it("request body contains to array with recipient email and name", async () => {
    await provider.send(params);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { to: Array<{ email: string; name: string }> };
    expect(body.to).toHaveLength(1);
    expect(body.to[0].email).toBe("recipient@example.com");
    expect(body.to[0].name).toBe("Test Recipient");
  });

  it("uses email as name fallback when name is not provided", async () => {
    await provider.send({ ...params, to: { email: "test@example.com" } });
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { to: Array<{ email: string; name: string }> };
    expect(body.to[0].name).toBe("test@example.com");
  });

  it("returns messageId from successful response", async () => {
    const result = await provider.send(params);
    expect(result).toEqual({ messageId: "test-message-id-123" });
  });

  it("throws on non-ok response with status code in error message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    await expect(provider.send(params)).rejects.toThrow("401");
  });
});
