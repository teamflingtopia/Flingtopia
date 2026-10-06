import nodemailer from "nodemailer";

// One transport for verification and both durable queues. Never log provider bodies.
export function createMailTransport(config) {
  if (config.resendApiKey)
    return {
      async sendMail(message) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${config.resendApiKey}`,
            "Content-Type": "application/json",
            ...(message.deliveryKey
              ? { "Idempotency-Key": message.deliveryKey }
              : {}),
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
        });
        if (!response.ok)
          throw new Error(`Email provider returned ${response.status}`);
        await response.arrayBuffer();
      },
      close() {},
    };
  if (!config.smtpHost) return null;
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: config.smtpPort === 465,
    auth: config.smtpUser
      ? { user: config.smtpUser, pass: config.smtpPassword }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
}
