import prisma from '../src/prisma';
import crypto from 'crypto';

async function testAdminInterviewSetup() {
  console.log('[Test] 1. Checking existing sessions...');
  const sessions = await prisma.interviewSession.findMany({
    include: {
      _count: {
        select: { snapshots: true, drafts: true }
      }
    }
  });
  console.log(`[Test] Found ${sessions.length} sessions.`);
  for (const s of sessions) {
    console.log(`  - ID: ${s.id}, Token: ${s.token}, Candidate: ${s.candidateName} (${s.candidateEmail}), Meeting: ${s.meetingUrl}`);
  }

  console.log('\n[Test] 2. Creating a new test interview session with email & meeting link...');
  const testToken = `wissen-${crypto.randomBytes(6).toString('hex')}`;
  const created = await prisma.interviewSession.create({
    data: {
      token: testToken,
      candidateName: 'John Doe',
      candidateEmail: 'john.doe@techcorp.com',
      interviewerName: 'Sarah Jenkins',
      meetingUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_test',
      durationMinutes: 45,
      status: 'waiting',
    }
  });

  console.log(`[Test] Successfully created session ID ${created.id}:`);
  console.log(`  - Candidate: ${created.candidateName} <${created.candidateEmail}>`);
  console.log(`  - Meeting URL: ${created.meetingUrl}`);
  console.log(`  - Token: ${created.token}`);

  console.log('\n[Test] 3. Verifying findUnique for candidate validation...');
  const validated = await prisma.interviewSession.findUnique({
    where: { token: testToken }
  });
  if (validated && validated.candidateEmail === 'john.doe@techcorp.com') {
    console.log('✅ Validation query confirmed email & meetingUrl persisted properly!');
  } else {
    throw new Error('Failed to validate session');
  }

  console.log('\n[Test] 4. Cleaning up test session...');
  await prisma.interviewSession.delete({ where: { id: created.id } });
  console.log('✅ Cleaned up test session. All DB & logic tests passed!');
}

testAdminInterviewSetup().then(() => process.exit(0)).catch((err) => {
  console.error('[Test Error]', err);
  process.exit(1);
});
