import prisma from './prisma';

export async function seedInterviewSession() {
  const existing = await prisma.interviewSession.findUnique({
    where: { token: 'demo-interview-token' },
  });

  if (!existing) {
    const session = await prisma.interviewSession.create({
      data: {
        token: 'demo-interview-token',
        candidateName: 'Alice Candidate',
        candidateEmail: 'alice.candidate@example.com',
        interviewerName: 'Sarah Jenkins',
        meetingUrl: 'https://teams.microsoft.com/l/meetup-join/demo-meeting',
        status: 'waiting',
        durationMinutes: 60,
      },
    });
    console.log('✅ Seeded demo interview session with token "demo-interview-token" (ID:', session.id, ')');
  } else {
    await prisma.interviewSession.update({
      where: { token: 'demo-interview-token' },
      data: {
        candidateEmail: 'alice.candidate@example.com',
        meetingUrl: 'https://teams.microsoft.com/l/meetup-join/demo-meeting',
      },
    });
    console.log('ℹ️ Demo interview session updated (token: demo-interview-token)');
  }
}

if (process.argv[1]?.includes('seed-interview')) {
  seedInterviewSession().then(() => process.exit(0)).catch((err) => {
    console.error('Failed to seed interview session:', err);
    process.exit(1);
  });
}
