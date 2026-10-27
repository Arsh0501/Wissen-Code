import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../database/prisma';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const BASE_URL = 'http://localhost:4001/api';

test('Interview Creation & Execution Enhancements Flow', async (t) => {
  // Isolate sessions and data from real users, including the one-device candidate policy.
  const testUserIds: number[] = [];
  const testQuestionIds: number[] = [];
  t.after(async () => {
    if (testUserIds.length) {
      await prisma.interview.deleteMany({ where: { interviewerId: { in: testUserIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await prisma.question.deleteMany({ where: { id: { in: testQuestionIds } } });
  });
  const runId = randomUUID();
  async function createUser(role: string, password: string) {
    const user = await prisma.user.create({
      data: {
        name: `Interview test ${role}`,
        email: `interview-test-${role}-${testUserIds.length}-${runId}@example.test`,
        role,
        password: await bcrypt.hash(password, 10),
      },
    });
    testUserIds.push(user.id);
    return user;
  }
  const admin = await createUser('admin', 'Admin@123');
  const interviewer = await createUser('interviewer', 'Interviewer@123');
  const candidate = await createUser('candidate', 'Candidate@123');

  assert.ok(admin, 'Admin user should exist');
  assert.ok(interviewer, 'Interviewer user should exist');
  assert.ok(candidate, 'Candidate user should exist');

  // Login as admin
  const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: 'Admin@123' }),
  });
  assert.equal(adminLoginRes.status, 200);
  const adminData: any = await adminLoginRes.json();
  const adminToken = adminData.token;

  // Login as interviewer
  const interviewerLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: interviewer.email, password: 'Interviewer@123' }),
  });
  assert.equal(interviewerLoginRes.status, 200);
  const interviewerData: any = await interviewerLoginRes.json();
  const interviewerToken = interviewerData.token;

  // Login as candidate
  const candidateLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: candidate.email, password: 'Candidate@123' }),
  });
  assert.equal(candidateLoginRes.status, 200);
  const candidateData: any = await candidateLoginRes.json();
  const candidateToken = candidateData.token;

  let testInterviewId: number;
  // A small valid PDF, kept in memory so the test also checks exact binary preservation.
  const pdfContent =
    'BT /F1 12 Tf 72 720 Td (Maya - React TypeScript Node.js PostgreSQL Docker engineer. Built scalable APIs.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(pdfContent)} >>\nstream\n${pdfContent}\nendstream`,
  ];
  let pdfSource = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdfSource));
    pdfSource += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdfSource);
  pdfSource += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const resumePdf = Buffer.from(pdfSource);

  await t.test('Prevents assigning a candidate as interviewer', async () => {
    const res = await fetch(`${BASE_URL}/interviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Role Test Interview',
        candidateName: 'Test Candidate',
        candidateEmail: 'temp@test.com',
        interviewerId: candidate.id, // Candidate passed as interviewer!
        timeLimitMinutes: 45,
      }),
    });

    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.match(body.error, /Interviewer cannot have candidate role/i);
  });

  await t.test('Creates interview with assigned interviewer, candidate, and resume', async () => {
    const resumeText = `
John Doe - Senior Software Engineer
Skills: React, TypeScript, Node.js, PostgreSQL, Docker, AWS
Experience:
- Architected high-throughput microservices handling 20,000 req/sec using Node.js and Redis.
- Redesigned frontend component state using React and Zustand, cutting bundle size by 35%.
- Implemented zero-downtime PostgreSQL schema migrations for tables with 10M+ records.
`;

    const res = await fetch(`${BASE_URL}/interviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Fullstack Systems Architect Interview',
        candidateName: candidate.name,
        candidateEmail: candidate.email.toUpperCase(),
        interviewerId: interviewer.id,
        candidateResume: resumeText + '\u0000',
        candidateResumeUrl: `data:application/pdf;base64,${resumePdf.toString('base64')}`,
        timeLimitMinutes: 60,
      }),
    });

    assert.equal(res.status, 201);
    const body: any = await res.json();
    assert.ok(body.interview?.id);
    assert.equal(body.interview.interviewerId, interviewer.id);
    assert.equal(body.interview.candidateId, candidate.id);
    assert.ok(body.interview.candidateResume.includes('React'));
    assert.equal(body.interview.candidateResume.includes('\u0000'), false);
    assert.equal(body.interview.status, 'scheduled');
    assert.equal(body.interview.candidateResumeUrl, `/api/interviews/${body.interview.id}/resume`);

    testInterviewId = body.interview.id;
  });

  await t.test('Shows the saved interview on interviewer and candidate dashboards', async () => {
    for (const [path, token] of [
      ['/interviews', interviewerToken],
      ['/interviews/my-interviews', candidateToken],
    ]) {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200);
      const interviews: any = await response.json();
      assert.ok(interviews.some((interview: any) => interview.id === testInterviewId));
    }
  });

  await t.test('Assigned interviewer can view the original PDF before starting', async () => {
    const response = await fetch(`${BASE_URL}/interviews/${testInterviewId}/resume`, {
      headers: { Authorization: `Bearer ${interviewerToken}` },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /application\/pdf/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), resumePdf);
    const listResponse = await fetch(`${BASE_URL}/interviews`, {
      headers: { Authorization: `Bearer ${interviewerToken}` },
    });
    const interviews: any = await listResponse.json();
    const interview = interviews.find((item: any) => item.id === testInterviewId);
    assert.equal(interview.status, 'scheduled');
    assert.equal(interview.candidateResumeUrl, `/api/interviews/${testInterviewId}/resume`);
  });

  await t.test('Resume PDF requires staff authorization and assignment', async () => {
    const outsider = await createUser('interviewer', 'Interviewer@123');
    const login = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: outsider.email, password: 'Interviewer@123' }),
    });
    assert.equal(login.status, 200);
    const auth: any = await login.json();
    for (const token of [candidateToken, auth.token]) {
      const response = await fetch(`${BASE_URL}/interviews/${testInterviewId}/resume`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 403);
    }
  });

  await t.test('Rejects a non-PDF upload', async () => {
    const response = await fetch(`${BASE_URL}/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Invalid PDF',
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        interviewerId: interviewer.id,
        timeLimitMinutes: 45,
        candidateResumeUrl: `data:application/pdf;base64,${Buffer.from('not a PDF').toString('base64')}`,
      }),
    });
    assert.equal(response.status, 400);
  });

  await t.test('Only admin can modify or cancel a scheduled interview', async () => {
    for (const token of [interviewerToken, candidateToken]) {
      for (const [suffix, method] of [
        ['', 'PUT'],
        ['/cancel', 'POST'],
      ]) {
        const response = await fetch(`${BASE_URL}/interviews/${testInterviewId}${suffix}`, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: 'Unauthorized change' }),
        });
        assert.equal(response.status, 403);
      }
    }
    const response = await fetch(`${BASE_URL}/interviews/${testInterviewId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 'Updated scheduled interview', timeLimitMinutes: 60 }),
    });
    assert.equal(response.status, 200);
    const saved = await prisma.interview.findUniqueOrThrow({ where: { id: testInterviewId } });
    assert.equal(saved.title, 'Updated scheduled interview');
    assert.equal(saved.status, 'scheduled');
    assert.equal(
      saved.candidateResumeUrl,
      `data:application/pdf;base64,${resumePdf.toString('base64')}`,
    );
    const invalid = await fetch(`${BASE_URL}/interviews/${testInterviewId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ timeLimitMinutes: -1, scheduledAt: 'invalid date' }),
    });
    assert.equal(invalid.status, 400);
  });

  await t.test(
    'Admin can reassign, reschedule and cancel, with changes visible on both dashboards',
    async () => {
      const alternate = await createUser('interviewer', 'Interviewer@123');
      const login = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: alternate.email, password: 'Interviewer@123' }),
      });
      assert.equal(login.status, 200);
      const auth: any = await login.json();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
      const created = await fetch(`${BASE_URL}/interviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Interview to reschedule',
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          interviewerId: interviewer.id,
          timeLimitMinutes: 45,
        }),
      });
      assert.equal(created.status, 201);
      const { interview }: any = await created.json();
      const scheduledAt = new Date(Date.now() + 86400000).toISOString();
      const edited = await fetch(`${BASE_URL}/interviews/${interview.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ interviewerId: alternate.id, scheduledAt, timeLimitMinutes: 90 }),
      });
      assert.equal(edited.status, 200);
      for (const [token, shouldSee] of [
        [interviewerToken, false],
        [auth.token, true],
      ] as const) {
        const response = await fetch(`${BASE_URL}/interviews`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const interviews: any = await response.json();
        assert.equal(
          interviews.some((item: any) => item.id === interview.id),
          shouldSee,
        );
      }
      const cancelled = await fetch(`${BASE_URL}/interviews/${interview.id}/cancel`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      assert.equal(cancelled.status, 200);
      for (const [path, token] of [
        ['/interviews', auth.token],
        ['/interviews/my-interviews', candidateToken],
      ]) {
        const response = await fetch(`${BASE_URL}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(response.status, 200);
        const interviews: any = await response.json();
        const saved = interviews.find((item: any) => item.id === interview.id);
        assert.equal(saved.status, 'cancelled');
        assert.equal(saved.scheduledAt, scheduledAt);
        assert.equal(saved.timeLimitMinutes, 90);
      }
      const start = await fetch(`${BASE_URL}/interviews/${interview.id}/start`, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${auth.token}` },
        body: '{}',
      });
      assert.equal(start.status, 409);
      const room = await fetch(`${BASE_URL}/public/interview/${interview.roomToken}`);
      assert.equal(room.status, 410);
      for (const [suffix, method] of [
        ['', 'PUT'],
        ['/cancel', 'POST'],
      ]) {
        const response = await fetch(`${BASE_URL}/interviews/${interview.id}${suffix}`, {
          method,
          headers,
          body: '{}',
        });
        assert.equal(response.status, 409);
      }
    },
  );

  await t.test(
    'An unstarted interview expires after its scheduled duration and cannot start or receive feedback',
    async () => {
      const scheduledAt = new Date(Date.now() - 46 * 60000);
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
      const created = await fetch(`${BASE_URL}/interviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Missed interview',
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          interviewerId: interviewer.id,
          scheduledAt: scheduledAt.toISOString(),
          timeLimitMinutes: 45,
        }),
      });
      assert.equal(created.status, 201);
      const { interview }: any = await created.json();
      for (const [path, token] of [
        ['/interviews', interviewerToken],
        ['/interviews/my-interviews', candidateToken],
      ]) {
        const response = await fetch(`${BASE_URL}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(response.status, 200);
        const interviews: any = await response.json();
        const saved = interviews.find((item: any) => item.id === interview.id);
        assert.equal(saved.status, 'expired');
        assert.equal(saved.startedAt, null);
        assert.equal(saved.endedAt, new Date(scheduledAt.getTime() + 45 * 60000).toISOString());
      }
      for (const operation of ['start', 'feedback']) {
        const response = await fetch(`${BASE_URL}/interviews/${interview.id}/${operation}`, {
          method: 'POST',
          headers: { ...headers, Authorization: `Bearer ${interviewerToken}` },
          body: '{}',
        });
        assert.equal(response.status, 409);
      }
      const room = await fetch(`${BASE_URL}/public/interview/${interview.roomToken}`);
      assert.equal(room.status, 410);
      assert.match(((await room.json()) as any).error, /ended/);
    },
  );

  await t.test(
    'Elapsed live interviews complete automatically while extensions preserve active time',
    async () => {
      const startedAt = new Date(Date.now() - 46 * 60000);
      const records: { id: number }[] = [];
      for (const duration of [45, 60]) {
        records.push(
          await prisma.interview.create({
            data: {
              title: `Live expiry ${duration}`,
              interviewerId: interviewer.id,
              candidateId: candidate.id,
              candidateName: candidate.name,
              candidateEmail: candidate.email,
              roomToken: randomUUID(),
              status: 'in_progress',
              startedAt,
              timeLimitMinutes: duration,
              extendedMinutes: duration - 45,
            },
          }),
        );
      }
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${interviewerToken}`,
      };
      const response = await fetch(`${BASE_URL}/interviews`, { headers });
      assert.equal(response.status, 200);
      const interviews: any = await response.json();
      const elapsed = interviews.find((item: any) => item.id === records[0].id);
      const extended = interviews.find((item: any) => item.id === records[1].id);
      assert.equal(elapsed.status, 'completed');
      assert.equal(elapsed.endedAt, new Date(startedAt.getTime() + 45 * 60000).toISOString());
      assert.equal(extended.status, 'in_progress');
      const deniedExtension = await fetch(`${BASE_URL}/interviews/${elapsed.id}/extend`, {
        method: 'POST',
        headers,
        body: '{"extensionMinutes":15}',
      });
      assert.equal(deniedExtension.status, 409);
      await fetch(`${BASE_URL}/interviews`, { headers });
      assert.equal(
        await prisma.interviewEvent.count({
          where: { interviewId: elapsed.id, eventType: 'INTERVIEW_ENDED' },
        }),
        1,
      );
    },
  );

  await t.test('Enforces scheduled start window restriction when scheduled in future', async () => {
    const futureTime = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    const createFuture = await fetch(`${BASE_URL}/interviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Future Scheduled Interview',
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        interviewerId: interviewer.id,
        scheduledAt: futureTime,
        timeLimitMinutes: 45,
      }),
    });

    assert.equal(createFuture.status, 201);
    const futureData: any = await createFuture.json();
    const futureId = futureData.interview.id;

    // Try starting it right now (outside 15-min window)
    const startRes = await fetch(`${BASE_URL}/interviews/${futureId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${interviewerToken}`,
      },
      body: JSON.stringify({}),
    });

    assert.equal(startRes.status, 400);
    const body: any = await startRes.json();
    assert.match(body.error, /Interview cannot be started yet/i);
  });

  await t.test('Starts immediate interview properly', async () => {
    const startRes = await fetch(`${BASE_URL}/interviews/${testInterviewId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${interviewerToken}`,
      },
      body: JSON.stringify({}),
    });

    assert.equal(startRes.status, 200);
    const body: any = await startRes.json();
    assert.equal(body.interview.status, 'in_progress');
  });

  await t.test('Extends interview duration when in progress', async () => {
    const extendRes = await fetch(`${BASE_URL}/interviews/${testInterviewId}/extend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${interviewerToken}`,
      },
      body: JSON.stringify({ extensionMinutes: 15 }),
    });

    assert.equal(extendRes.status, 200);
    const body: any = await extendRes.json();
    assert.equal(body.addedMinutes, 15);
    assert.equal(body.interview.extendedMinutes, 15);
    assert.equal(body.interview.timeLimitMinutes, 75); // 60 + 15
  });

  await t.test(
    'Live interviews cannot be modified or cancelled, and candidates cannot extend time',
    async () => {
      for (const [suffix, method] of [
        ['', 'PUT'],
        ['/cancel', 'POST'],
      ]) {
        const response = await fetch(`${BASE_URL}/interviews/${testInterviewId}${suffix}`, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: '{}',
        });
        assert.equal(response.status, 409);
      }
      const response = await fetch(`${BASE_URL}/interviews/${testInterviewId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidateToken}` },
        body: JSON.stringify({ extensionMinutes: 15 }),
      });
      assert.equal(response.status, 403);
    },
  );

  await t.test('Interviewer can submit final feedback and rating', async () => {
    const premature = await fetch(`${BASE_URL}/interviews/${testInterviewId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${interviewerToken}` },
      body: JSON.stringify({ finalFeedback: 'Too early', finalRating: 5 }),
    });
    assert.equal(premature.status, 409);
    const ended = await fetch(`${BASE_URL}/interviews/${testInterviewId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${interviewerToken}` },
      body: '{}',
    });
    assert.equal(ended.status, 200);
    const feedbackRes = await fetch(`${BASE_URL}/interviews/${testInterviewId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${interviewerToken}`,
      },
      body: JSON.stringify({
        finalRating: 5,
        finalRecommendation: 'Strong Hire',
        finalFeedback:
          'Candidate showed exceptional mastery of distributed state, PostgreSQL indexing, and microservice resilience.',
        revision: 0,
        criteria: [
          {
            key: 'communication_confidence',
            label: 'Communication / confidence',
            rating: 5,
            feedback: 'Clearly explained decisions and answered follow-ups.',
          },
          {
            key: 'fundamentals',
            label: 'Fundamentals',
            rating: 5,
            feedback: 'Correctly applied PostgreSQL indexing and distributed state concepts.',
          },
          {
            key: 'role_alignment',
            label: 'Role alignment',
            rating: 5,
            feedback: 'Demonstrated the required service design skills.',
          },
        ],
      }),
    });

    assert.equal(feedbackRes.status, 200);
    const body: any = await feedbackRes.json();
    assert.equal(body.interview.finalRating, 5);
    assert.equal(body.interview.finalRecommendation, 'Strong Hire');
    assert.ok(body.interview.finalFeedback.includes('exceptional mastery'));
  });

  await t.test(
    'Ended interviews reject question generation, adding, updating and removal',
    async () => {
      for (const [path, method] of [
        ['questions', 'POST'],
        ['questions/1', 'PUT'],
        ['questions/1', 'DELETE'],
      ]) {
        const response = await fetch(`${BASE_URL}/interviews/${testInterviewId}/${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${interviewerToken}`,
          },
          body: JSON.stringify({ title: 'Late change', statement: 'Must not be saved' }),
        });
        assert.equal(response.status, 409);
        assert.match(((await response.json()) as any).error, /ended/);
      }
    },
  );

  await t.test('Interviewer and candidate both see the interview', async () => {
    // Interviewer lists their interviews
    const interviewerListRes = await fetch(`${BASE_URL}/interviews`, {
      headers: { Authorization: `Bearer ${interviewerToken}` },
    });
    assert.equal(interviewerListRes.status, 200);
    const interviewerList: any = await interviewerListRes.json();
    const foundByInterviewer = interviewerList.some((i: any) => i.id === testInterviewId);
    assert.ok(foundByInterviewer, 'Assigned interviewer should see the interview');

    // Candidate retrieves my-interviews
    const candidateListRes = await fetch(`${BASE_URL}/interviews/my-interviews`, {
      headers: { Authorization: `Bearer ${candidateToken}` },
    });
    assert.equal(candidateListRes.status, 200);
    const candidateList: any = await candidateListRes.json();
    const foundByCandidate = candidateList.some((i: any) => i.id === testInterviewId);
    assert.ok(foundByCandidate, 'Assigned candidate should see the interview');
  });
});
