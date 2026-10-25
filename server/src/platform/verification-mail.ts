import { deliverOutbox, enqueueMail, mailConfigured } from './communication';
import { formatMailTime } from './mailer';
import { OTP_TTL_SECONDS, claimOtpSendSlot, issueOtp, type OtpPurpose } from './otp';

export function sendNow(ids: string[]) {
  if (ids.length) void deliverOutbox(undefined, ids).catch(() => {});
}

const otpSubjects: Record<OtpPurpose, string> = {
  login: 'Your Wissen Code sign-in code',
  'email-verification': 'Verify your Wissen Code email',
  'password-reset': 'Your Wissen Code password reset code',
};

/** 'sent' when a mail went out, 'cooldown' when throttled, 'off' when mail is not configured. */
export async function sendOtpMail(purpose: OtpPurpose, user: { id: number; email: string }) {
  if (!mailConfigured()) return { status: 'off' as const, expiresInSeconds: OTP_TTL_SECONDS };
  if (!(await claimOtpSendSlot(purpose, user.email)))
    return { status: 'cooldown' as const, expiresInSeconds: OTP_TTL_SECONDS };
  const otp = await issueOtp(purpose, user.email);
  const expiresAt = new Date(Date.now() + otp.expiresInSeconds * 1000);
  const message = await enqueueMail(
    user.email,
    otpSubjects[purpose],
    `Use this code to continue:\n\n${otp.code}\n\nIt is valid until ${formatMailTime(expiresAt)} (${Math.ceil(otp.expiresInSeconds / 60)} minutes). Requesting a new code within this time sends the same code.\n\nIf you did not request this, you can ignore this email.`,
  );
  sendNow([message.id]);
  return { status: 'sent' as const, expiresInSeconds: otp.expiresInSeconds };
}
