export type EmailSendParams = {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
};

export type EmailSendResult = {
  messageId: string;
};

export type EmailProvider = {
  send: (params: EmailSendParams) => Promise<EmailSendResult>;
};
