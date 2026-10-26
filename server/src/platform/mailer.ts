import nodemailer, { type Transporter } from 'nodemailer';

// Gmail via a Google Cloud Console OAuth client is preferred; plain SMTP is the fallback.
function gmailOAuthConfigured() {
  return !!(
    process.env.GOOGLE_MAIL_USER &&
    process.env.GOOGLE_MAIL_CLIENT_ID &&
    process.env.GOOGLE_MAIL_CLIENT_SECRET &&
    process.env.GOOGLE_MAIL_REFRESH_TOKEN
  );
}
function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
export function nodemailerConfigured() {
  return gmailOAuthConfigured() || smtpConfigured();
}

let transporter: Transporter | undefined;
export function mailTransport() {
  if (transporter) return transporter;
  if (!nodemailerConfigured())
    throw Object.assign(new Error('Nodemailer is not configured'), { status: 503 });
  transporter = gmailOAuthConfigured()
    ? nodemailer.createTransport({
        service: 'gmail',
        pool: true,
        maxConnections: 3,
        auth: {
          type: 'OAuth2',
          user: process.env.GOOGLE_MAIL_USER,
          clientId: process.env.GOOGLE_MAIL_CLIENT_ID,
          clientSecret: process.env.GOOGLE_MAIL_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_MAIL_REFRESH_TOKEN,
        },
      })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        pool: true,
        maxConnections: 3,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
  return transporter;
}
export function mailSender() {
  const address = process.env.MAIL_FROM || process.env.GOOGLE_MAIL_USER || process.env.SMTP_USER;
  if (!address) return undefined;
  return address.includes('<')
    ? address
    : `"${process.env.MAIL_FROM_NAME || 'Wissen Code'}" <${address}>`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function formatMailTime(date: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: process.env.MAIL_TIMEZONE || 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

// Bodies stay plain text in the outbox; the HTML version is derived at send time so every
// email shares one layout, links become buttons/anchors and the send time is stamped.
export function renderEmail(subject: string, body: string, sentAt = new Date()) {
  const stamp = formatMailTime(sentAt);
  const url = /^https?:\/\/\S+$/;
  const blocks = body
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split('\n');
      if (lines.length === 1 && url.test(lines[0].trim())) {
        const href = escapeHtml(lines[0].trim());
        return `<p style="margin:24px 0"><a href="${href}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Open link</a></p><p style="margin:0 0 16px;font-size:12px;color:#6b7280;word-break:break-all">${href}</p>`;
      }
      const otp = /^\s*(\d{6})\s*$/.exec(para);
      if (otp)
        return `<p style="margin:24px 0;font-size:32px;letter-spacing:10px;font-weight:700;color:#111827;font-family:'SFMono-Regular',Consolas,monospace">${otp[1]}</p>`;
      return `<p style="margin:0 0 16px;line-height:1.6">${lines
        .map((line) =>
          escapeHtml(line).replace(
            /(https?:\/\/[^\s<]+)/g,
            '<a href="$1" style="color:#4f46e5;word-break:break-all">$1</a>',
          ),
        )
        .join('<br>')}</p>`;
    })
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#111827;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">Wissen Code</td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 20px;font-size:20px;color:#111827">${escapeHtml(subject)}</h1>${blocks}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">Sent ${escapeHtml(stamp)} &middot; This is an automated message, please do not reply.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${body.trim()}\n\n—\nSent ${stamp}\nWissen Code`;
  return { html, text };
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: string; // base64
}

export async function sendWithNodemailer(input: {
  id: string;
  to: string;
  subject: string;
  body: string;
  attachments?: MailAttachment[];
}) {
  const { html, text } = renderEmail(input.subject, input.body);
  const info = await mailTransport().sendMail({
    from: mailSender(),
    to: input.to,
    subject: input.subject,
    text,
    html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: a.content,
      encoding: 'base64',
    })),
    // Stable Message-ID lets receiving servers collapse duplicates after a worker retry.
    messageId: `<${input.id}@wissen-code>`,
  });
  return info.messageId as string;
}
