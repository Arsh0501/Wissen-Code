import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import { createSessionForUser } from '../routes/auth';
import puppeteer from 'puppeteer';
async function main() {
  const user = await prisma.user.create({
    data: {
      name: 'Report smoke check',
      email: `report-${randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  let questionId: number | undefined;
  let assessmentId: number | undefined;
  try {
    const question = await prisma.question.create({
      data: { title: 'Report fixture', statement: 'Print one integer', difficulty: 'easy' },
    });
    questionId = question.id;
    const assessment = await prisma.assessment.create({
      data: {
        name: 'Report fixture',
        questions: { create: [{ questionId, marks: 10, orderIndex: 0 }] },
      },
    });
    assessmentId = assessment.id;
    const session = await prisma.assessmentSession.create({
      data: {
        assessmentId,
        candidateName: user.name,
        candidateUserId: user.id,
        finishedAt: new Date(),
        gradingStatus: 'completed',
      },
    });
    await prisma.submission.create({
      data: {
        assessmentId,
        questionId,
        sessionId: session.id,
        candidateName: user.name,
        languageId: 71,
        languageName: 'Python',
        code: 'print(1)',
        status: 'graded',
        score: 100,
      },
    });
    const auth = await createSessionForUser(user.id, user.email, user.name, 'admin');
    const paths = [
      `/candidates/${encodeURIComponent(user.name)}/report?assessmentId=${assessmentId}`,
      `/admin/reports/export/${assessmentId}`,
      `/admin/reports/${encodeURIComponent(user.name)}/${assessmentId}/download`,
    ];
    for (const path of paths) {
      const response = await fetch('http://localhost:4001/api' + path, {
        headers: { Authorization: `Bearer ${auth.token}` },
        signal: AbortSignal.timeout(60000),
      });
      const bytes = await response.arrayBuffer();
      console.log(
        JSON.stringify({
          path,
          status: response.status,
          type: response.headers.get('content-type'),
          bytes: bytes.byteLength,
          ...(response.ok ? {} : { error: new TextDecoder().decode(bytes) }),
        }),
      );
      if (!response.ok && path.endsWith('/download')) {
        try {
          const browser = await puppeteer.launch({
            headless: true,
            ...(process.env.PUPPETEER_EXECUTABLE_PATH
              ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
              : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
          });
          await browser.close();
        } catch (error) {
          console.log('PDF browser diagnosis:', (error as Error).message);
        }
      }
    }
  } finally {
    if (assessmentId) await prisma.assessment.delete({ where: { id: assessmentId } });
    if (questionId) await prisma.question.delete({ where: { id: questionId } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
void main();
