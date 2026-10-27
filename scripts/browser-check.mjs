import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(new URL('../server/package.json', import.meta.url));
require('dotenv').config({
  path: new URL('../server/.env', import.meta.url).pathname,
});
const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();
const origin = process.env.BROWSER_TEST_URL || 'http://localhost:3000';
let browser;
let stage = 'launch Chrome';
const stamp = crypto.randomUUID();
const userIds = [];
const assessmentIds = [];
const questionIds = [];
let interviewId;
const errors = [];
const click = async (page, pattern) => {
  const handle = await page.evaluateHandle(
    (text) =>
      [...document.querySelectorAll('button,a')].find((e) =>
        new RegExp(text, 'i').test(e.textContent.trim()),
      ),
    pattern,
  );
  assert.ok(handle.asElement(), `Missing control: ${pattern}`);
  await handle.asElement().click();
};
const waitText = (page, text) =>
  page.waitForFunction(
    (value) => document.body.innerText.includes(value),
    { timeout: 30000 },
    text,
  );
const identity = async (role) => {
  const user = await prisma.user.create({
    data: {
      name: `Browser ${role} ${stamp}`,
      email: `${role}-${stamp}@test.invalid`,
      password: 'test-unused',
      role,
    },
  });
  userIds.push(user.id);
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return {
    user: { id: user.id, name: user.name, email: user.email, role },
    token: jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        sessionId: session.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    ),
  };
};
const pageFor = async (auth) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', (error) => errors.push(error.message));
  if (auth)
    await page.evaluateOnNewDocument(({ user, token }) => {
      localStorage.setItem('wissen-user', JSON.stringify(user));
      localStorage.setItem('wissen-token', token);
    }, auth);
  return page;
};
try {
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : await puppeteer.executablePath()),
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      ...(process.env.CI ? ['--no-sandbox'] : []),
    ],
  });
  stage = 'create test fixtures';
  const admin = await identity('admin'),
    candidate = await identity('candidate');
  const mcq = await prisma.question.create({
    data: {
      title: `Browser MCQ ${stamp}`,
      statement: 'Choose the correct answer.',
      difficulty: 'easy',
      questionType: 'mcq',
      settings: {
        options: [
          { id: 'a', text: 'Correct fixture answer' },
          { id: 'b', text: 'Other fixture answer' },
        ],
        correctOptionIds: ['a'],
      },
    },
  });
  questionIds.push(mcq.id);
  const assessment = await prisma.assessment.create({
    data: {
      name: `Browser assessment ${stamp}`,
      status: 'published',
      timeLimitMinutes: 30,
      questionTypes: '["mcq"]',
      questions: { create: { questionId: mcq.id, marks: 10 } },
    },
  });
  assessmentIds.push(assessment.id);
  const adminPage = await pageFor(admin);
  stage = 'load hiring operations';
  await adminPage.goto(`${origin}/admin/operations`, {
    waitUntil: 'networkidle0',
  });
  await waitText(adminPage, 'Hiring operations');
  await adminPage.select('select[aria-label="Assessment"]', String(assessment.id));
  await waitText(adminPage, 'Question performance');
  await click(adminPage, '^Integrity review$');
  await waitText(adminPage, 'No submission pairs');
  await click(adminPage, '^System readiness$');
  await waitText(adminPage, 'Real code execution');
  const candidatePage = await pageFor(candidate);
  stage = 'candidate assessment and grading';
  await candidatePage.goto(`${origin}/exam/${assessment.id}`, {
    waitUntil: 'networkidle0',
  });
  await click(candidatePage, '^Start Assessment$');
  await waitText(candidatePage, 'Correct fixture answer');
  await candidatePage.click('input[type="radio"]');
  await click(candidatePage, '^Submit Test$');
  await click(candidatePage, 'confirm.*submit|submit.*assessment|confirm submission');
  await waitText(candidatePage, 'Assessment Submitted');
  const graded = await prisma.submission.findFirstOrThrow({
    where: { assessmentId: assessment.id, candidateName: candidate.user.name },
  });
  assert.equal(graded.score, 100);
  const reportCheck = await adminPage.evaluate(
    async ({ userId, assessmentId }) => {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('wissen-token')}`,
      };
      const report = await fetch(`/api/candidates/${userId}/report?assessmentId=${assessmentId}`, {
        headers,
      });
      if (!report.ok) throw new Error(`Report HTTP ${report.status}`);
      const data = await report.json();
      const pdf = await fetch(`/api/admin/reports/${userId}/${assessmentId}/download`, { headers });
      if (!pdf.ok) throw new Error(`PDF HTTP ${pdf.status}`);
      const bytes = new Uint8Array(await pdf.arrayBuffer());
      return {
        score: data.marks.percentage,
        signature: String.fromCharCode(...bytes.slice(0, 4)),
        bytes: bytes.length,
      };
    },
    { userId: candidate.user.id, assessmentId: assessment.id },
  );
  assert.equal(reportCheck.score, 100);
  assert.equal(reportCheck.signature, '%PDF');
  assert.ok(reportCheck.bytes > 1000);

  stage = 'create live interview';
  const coding = await prisma.question.create({
    data: {
      title: `Browser code ${stamp}`,
      statement: 'Print the required answer.',
      difficulty: 'easy',
      starterCodes: {
        create: {
          languageId: 71,
          languageName: 'Python',
          code: 'print("initial")',
        },
      },
      testCases: {
        create: { input: '', expectedOutput: 'industry', isSample: true },
      },
    },
  });
  questionIds.push(coding.id);
  const interview = await prisma.interview.create({
    data: {
      title: `Browser interview ${stamp}`,
      interviewerId: admin.user.id,
      candidateId: candidate.user.id,
      candidateName: candidate.user.name,
      candidateEmail: candidate.user.email,
      status: 'in_progress',
      startedAt: new Date(),
      roomToken: crypto.randomBytes(32).toString('hex'),
      currentQuestionId: coding.id,
      currentCode: 'print("initial")',
      currentLanguageId: 71,
      questions: { create: { questionId: coding.id, status: 'active' } },
    },
  });
  interviewId = interview.id;
  stage = 'load interviewer room';
  await adminPage.goto(`${origin}/admin/interviews/${interview.id}?tab=live`, {
    waitUntil: 'networkidle0',
  });
  await waitText(adminPage, 'Live Interview Room');
  const room = await pageFor();
  stage = 'load candidate interview room';
  await room.goto(`${origin}/interview/${interview.roomToken}`, {
    waitUntil: 'networkidle0',
  });
  stage = 'load Monaco editor';
  await room.waitForSelector('.monaco-editor textarea.inputarea', {
    timeout: 60000,
  });
  await room.waitForFunction(() => document.body.innerText.includes('Saved'), {
    timeout: 30000,
  });
  await room.focus('.monaco-editor textarea.inputarea');
  await room.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
  await room.keyboard.press('KeyA');
  await room.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
  await room.keyboard.type('print("industry")');
  const until = Date.now() + 10000;
  let saved;
  while (Date.now() < until) {
    saved = await prisma.interview.findUnique({ where: { id: interview.id } });
    if (saved.currentCode === 'print("industry")') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(saved.currentCode, 'print("industry")');
  await adminPage.waitForFunction(
    () =>
      [...document.querySelectorAll('.view-lines')].some((e) => e.textContent.includes('industry')),
    { timeout: 10000 },
  );
  stage = 'synchronize interview chat';
  await adminPage.type('input[aria-label="Chat message"]', 'Browser chat evidence');
  await click(adminPage, '^Send$');
  await waitText(room, 'Browser chat evidence');
  stage = 'synchronize interview whiteboard';
  await click(adminPage, '^Whiteboard$');
  const board = await adminPage.$('svg[aria-label="Shared drawing whiteboard"]');
  await board.scrollIntoView();
  const bounds = await board.boundingBox();
  await adminPage.mouse.move(bounds.x + 80, bounds.y + 80);
  await adminPage.mouse.down();
  await adminPage.mouse.move(bounds.x + 180, bounds.y + 140, { steps: 8 });
  await adminPage.mouse.up();
  await click(room, '^Whiteboard$');
  await room.waitForSelector('svg[aria-label="Shared drawing whiteboard"] polyline');
  stage = 'connect interview video';
  await click(adminPage, '^Video$');
  await click(room, '^Video$');
  await click(adminPage, '^Start video call$');
  await waitText(room, 'Incoming video call');
  await click(room, '^Accept call$');
  await waitText(adminPage, 'Video: connected');
  await waitText(room, 'Video: connected');
  await click(adminPage, '^Leave call$');
  const joinEvents = await prisma.interviewEvent.findMany({
    where: {
      interviewId: interview.id,
      eventType: { in: ['CANDIDATE_JOINED', 'INTERVIEWER_JOINED'] },
    },
  });
  const socketIds = joinEvents.map((event) => JSON.parse(event.payload).socketId);
  assert.equal(
    new Set(socketIds).size,
    socketIds.length,
    'Room synchronization must not duplicate join events',
  );
  stage = 'load interview replay';
  await adminPage.goto(`${origin}/admin/interviews/${interview.id}?tab=replay`, {
    waitUntil: 'networkidle0',
  });
  await waitText(adminPage, 'Interview replay');
  await waitText(adminPage, 'CODE CHANGED');
  await adminPage.screenshot({
    path: process.env.BROWSER_SCREENSHOT || path.join(os.tmpdir(), 'wissen-advanced-replay.png'),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: browser operations, readiness, MCQ grading, JSON/PDF reports, local Monaco, shared code, persisted chat, whiteboard, loopback video with simulated media, and replay.',
  );
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.log(
    `::error title=Browser workflow failed at ${stage}::${detail.replace(/\r?\n/g, ' ')}`,
  );
  console.error(`Browser validation failed at ${stage}:`, detail);
  console.error('Page errors:', errors);
  throw error;
} finally {
  await browser?.close();
  if (interviewId) await prisma.interview.deleteMany({ where: { id: interviewId } });
  await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
}
