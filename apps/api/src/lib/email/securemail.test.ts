import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailSendParams } from "./types";

import { SecureMailProvider } from "./securemail";

const mockFetch = vi.fn();

describe("secureMailProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ message_id: "sm-msg-456", status: "queued" }), { status: 202 }),
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

  const provider = new SecureMailProvider("test-securemail-api-key");

  it("calls fetch with the correct SecureMail API URL", async () => {
    await provider.send(params);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.securemail.kawan.pro/send",
      expect.anything(),
    );
  });

  it("passes Bearer token in Authorization header", async () => {
    await provider.send(params);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-securemail-api-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("request body contains sender with Tracky Pro name and noreply@tracky.pro email", async () => {
    await provider.send(params);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.sender).toEqual({ email: "noreply@tracky.pro", name: "Tracky Pro" });
  });

  it("request body contains to array with recipient email and name", async () => {
    await provider.send(params);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { to: Array<{ email: string; name: string | null }> };
    expect(body.to).toHaveLength(1);
    expect(body.to[0].email).toBe("recipient@example.com");
    expect(body.to[0].name).toBe("Test Recipient");
  });

  it("uses null as name when name is not provided", async () => {
    await provider.send({ ...params, to: { email: "test@example.com" } });
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { to: Array<{ email: string; name: string | null }> };
    expect(body.to[0].name).toBeNull();
  });

  it("request body contains subject and htmlContent", async () => {
    await provider.send(params);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.subject).toBe("Test Subject");
    expect(body.htmlContent).toBe("<p>Hello world</p>");
  });

  it("maps message_id from response to messageId", async () => {
    const result = await provider.send(params);
    expect(result).toEqual({ messageId: "sm-msg-456" });
  });

  it("throws on non-ok response with status code in error message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    await expect(provider.send(params)).rejects.toThrow("401");
  });
});
