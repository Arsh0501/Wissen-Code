import prisma from '../prisma';
import { appURL, deliverOutbox, enqueueMail, mailConfigured } from './communication';
import { formatMailTime } from './mailer';
import { OTP_TTL_SECONDS, claimOtpSendSlot, issueOtp, type OtpPurpose } from './otp';

const INTERVIEW_REMINDER_MINUTES = 30;

// Push freshly queued mail out immediately; the outbox worker retries anything that fails.
export function sendNow(ids: string[]) {
  if (ids.length) void deliverOutbox(fetch, ids).catch(() => {});
}

export function assessmentInvitationBody(
  assessment: { name: string; timeLimitMinutes: number; startAt: Date | null; endAt: Date | null },
  link: string,
) {
  return [
    `You have been invited to take the ${assessment.name} assessment.`,
    [
      `Duration: ${assessment.timeLimitMinutes} minutes`,
      assessment.startAt && assessment.startAt > new Date()
        ? `Opens: ${formatMailTime(assessment.startAt)}`
        : null,
      assessment.endAt ? `Closes: ${formatMailTime(assessment.endAt)}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    link,
    'Use a laptop or desktop with a stable connection. The timer starts when you begin, not when you open the link.',
  ].join('\n\n');
}

function interviewBody(
  interview: { candidateName: string; title: string; scheduledAt: Date | null; timeLimitMinutes: number; roomToken: string },
  interviewerName: string | undefined,
  lead: string,
) {
  return [
    `Hello ${interview.candidateName},`,
    lead,
    [
      `Interview: ${interview.title}`,
      `When: ${interview.scheduledAt ? formatMailTime(interview.scheduledAt) : 'Time to be confirmed'}`,
      `Duration: ${interview.timeLimitMinutes} minutes`,
      interviewerName ? `Interviewer: ${interviewerName}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    appURL(`/interview/${interview.roomToken}`),
    'Join a few minutes early to check your camera, microphone and editor.',
  ].join('\n\n');
}

/**
 * Queues the invitation now and, when there is enough lead time, a reminder that the
 * outbox worker releases 30 minutes before the start. Returns false if mail is off.
 */
export async function queueInterviewInvitation(
  interview: {
    id: number;
    candidateName: string;
    candidateEmail: string;
    title: string;
    scheduledAt: Date | null;
    timeLimitMinutes: number;
    roomToken: string;
  },
  authorId: number,
) {
  if (!mailConfigured()) return false;
  const interviewer = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } });
  const invite = await enqueueMail(
    interview.candidateEmail,
    `Interview scheduled: ${interview.title}`,
    interviewBody(interview, interviewer?.name, 'Your interview has been scheduled. The details are below.'),
    authorId,
  );
  const reminderAt = interview.scheduledAt
    ? new Date(interview.scheduledAt.getTime() - INTERVIEW_REMINDER_MINUTES * 60000)
    : null;
  if (reminderAt && reminderAt > new Date())
    await enqueueMail(
      interview.candidateEmail,
      `Starting in ${INTERVIEW_REMINDER_MINUTES} minutes: ${interview.title}`,
      interviewBody(interview, interviewer?.name, `Your interview starts in ${INTERVIEW_REMINDER_MINUTES} minutes.`),
      authorId,
      reminderAt,
    );
  sendNow([invite.id]);
  return true;
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
