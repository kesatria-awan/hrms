import { connect } from "cloudflare:sockets";

export type SmtpSendParams = {
  from: string;
  to: string[];
  subject: string;
  html: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

const SMTP_TIMEOUT_MS = 15_000;

/**
 * Minimal SMTP client over Cloudflare TCP sockets (cloudflare:sockets).
 * Speaks EHLO -> STARTTLS -> AUTH PLAIN -> MAIL FROM -> RCPT TO -> DATA.
 */
export async function sendViaSmtp(cfg: SmtpConfig, params: SmtpSendParams): Promise<string> {
  const socket = connect({ hostname: cfg.host, port: cfg.port }, { secureTransport: "starttls" as const, allowHalfOpen: false });
  const reader = socket.readable.getReader();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = "";
  const readUntil = async (marker: string, r = reader): Promise<string> => {
    const deadline = Date.now() + SMTP_TIMEOUT_MS;
    while (!buffer.includes(marker)) {
      if (Date.now() > deadline) throw new Error("SMTP timeout");
      const { done, value } = await r.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
    const idx = buffer.indexOf(marker);
    const out = buffer.slice(0, idx + marker.length);
    buffer = buffer.slice(idx + marker.length);
    return out;
  };

  const greeting = await readUntil("\r\n");
  if (!greeting.startsWith("220")) throw new Error(`SMTP greeting failed: ${greeting}`);

  const writeLine = async (line: string) => {
    const w = socket.writable.getWriter();
    await w.write(encoder.encode(line + "\r\n"));
    w.releaseLock();
  };

  await writeLine("EHLO hrms.kesatria.my");
  const ehlo = await readUntil("250 ");
  if (!ehlo.includes("250")) throw new Error(`EHLO failed: ${ehlo}`);

  await writeLine("STARTTLS");
  const tlsResp = await readUntil("220 ");
  if (!tlsResp.startsWith("220")) throw new Error(`STARTTLS failed: ${tlsResp}`);

  // upgrade to TLS — acquire fresh reader/writer after upgrade
  await socket.startTls();

  await writeLine("EHLO hrms.kesatria.my");
  await readUntil("250 ");

  const auth = btoa(`\u0000${cfg.user}\u0000${cfg.pass}`);
  await writeLine(`AUTH PLAIN ${auth}`);
  const authResp = await readUntil("\r\n");
  if (!authResp.startsWith("235")) throw new Error(`AUTH failed: ${authResp}`);

  await writeLine(`MAIL FROM:<${params.from}>`);
  const mailFrom = await readUntil("\r\n");
  if (!mailFrom.startsWith("250")) throw new Error(`MAIL FROM failed: ${mailFrom}`);

  for (const rcpt of params.to) {
    await writeLine(`RCPT TO:<${rcpt}>`);
    const rcptResp = await readUntil("\r\n");
    if (!rcptResp.startsWith("250")) throw new Error(`RCPT TO ${rcpt} failed: ${rcptResp}`);
  }

  await writeLine("DATA");
  const dataResp = await readUntil("\r\n");
  if (!dataResp.startsWith("354")) throw new Error(`DATA failed: ${dataResp}`);

  const headers = [
    `From: KA HRMS <${params.from}>`,
    `To: ${params.to.join(", ")}`,
    `Subject: ${params.subject.replace(/[\r\n]/g, " ")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@hrms.kesatria.my>`,
  ].join("\r\n");
  const body = params.html.replace(/^\./gm, "..");
  await writeLine(`${headers}\r\n\r\n${body}\r\n.`);
  const sent = await readUntil("\r\n");
  if (!sent.startsWith("250")) throw new Error(`Send failed: ${sent}`);

  await writeLine("QUIT");
  socket.close();

  return sent.trim();
}