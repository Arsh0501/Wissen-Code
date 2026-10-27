import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import prisma from '../database/prisma';
import { createInterviewConversationRouter } from '../routes/interview-conversation';
import type { structuredAI } from '../services/ai/structured-ai';

test('question chat persists turns, isolates new audio, replaces suggestions, and sends full history for feedback', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Chat fixture',
      email: `${randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  const question = await prisma.question.create({
    data: {
      title: 'Caching',
      statement: 'Explain your cache design.',
      difficulty: 'medium',
      questionType: 'written',
    },
  });
  const interview = await prisma.interview.create({
    data: {
      title: 'Chat fixture',
      candidateName: 'Fixture',
      candidateEmail: 'fixture@test.invalid',
      roomToken: randomUUID(),
      interviewerId: user.id,
      status: 'in_progress',
      startedAt: new Date(),
      currentQuestionId: question.id,
      questions: { create: { questionId: question.id } },
    },
  });
  const inputs: { kind: string; value: any }[] = [];
  const ai = (async (kind: string, _schema: unknown, _instructions: string, value: any) => {
    inputs.push({ kind, value });
    return kind === 'question_conversation_feedback'
      ? { feedback: 'Explained caching and TTL tradeoffs.' }
      : {
          suggestions: [
            {
              question: 'How do you invalidate it?',
              context: 'Explore consistency.',
              quote: value.transcript.slice(0, 8),
            },
            {
              question: 'How do you handle eviction?',
              context: 'Explore memory.',
              quote: value.transcript.slice(0, 8),
            },
          ],
        };
  }) as typeof structuredAI;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: req.header('other') ? -1 : user.id,
      name: user.name,
      email: user.email,
      role: 'interviewer',
    };
    next();
  });
  app.use(
    '/interviews/:id/questions/:questionId/conversation',
    createInterviewConversationRouter(ai),
  );
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 400).json({ error: err.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/interviews/${interview.id}/questions/${question.id}/conversation`;
  async function call(body?: unknown, other = false) {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(other ? { other: '1' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: (await response.json()) as any };
  }
  try {
    assert.equal((await call(undefined, true)).status, 404);
    const started = await call({ action: 'start', revision: 0 });
    assert.equal(started.status, 200);
    assert.equal(started.data.turns[0].question, question.statement);
    const askedLink = await prisma.interviewQuestion.findUniqueOrThrow({
      where: { interviewId_questionId: { interviewId: interview.id, questionId: question.id } },
    });
    assert.equal(askedLink.status, 'asked');
    assert.ok(JSON.parse(askedLink.notes).questionAskedAt);
    const first = started.data.turns[0];
    const oldSegment = await prisma.interviewTranscriptSegment.create({
      data: {
        id: randomUUID(),
        interviewId: interview.id,
        questionId: question.id,
        sessionId: randomUUID(),
        sequence: 0,
        speaker: 'candidate',
        text: 'We use Redis.',
        startedAt: new Date(first.startedAt),
        endedAt: new Date(),
      },
    });
    assert.equal(
      (await call({ action: 'send', revision: 0, turnId: first.id, text: 'Stale' })).status,
      409,
    );
    assert.equal(
      (
        await call({
          action: 'send',
          revision: started.data.revision,
          turnId: first.id,
          text: 'We use Redis.',
          segmentIds: [oldSegment.id],
        })
      ).status,
      200,
    );
    let state = (await call()).data;
    assert.equal(state.suggestions.length, 2);
    assert.equal(inputs[0].value.currentQuestion, question.statement);
    assert.equal(inputs[0].value.transcript, 'We use Redis.');
    const chosen = state.suggestions[0];
    assert.equal(
      (await call({ action: 'ask', revision: state.revision, suggestionId: chosen.id })).status,
      200,
    );
    state = (await call()).data;
    assert.equal(state.turns.length, 2);
    assert.equal(state.turns[0].transcript, 'We use Redis.');
    assert.equal(state.turns[1].transcript, '');
    assert.equal(state.suggestions.length, 0);
    assert.ok(!state.segments.some((item: any) => item.id === oldSegment.id));
    assert.equal(
      (
        await call({
          action: 'save',
          revision: state.revision,
          turnId: state.turns[1].id,
          text: 'Bad audio reuse',
          segmentIds: [oldSegment.id],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call({
          action: 'send',
          revision: state.revision,
          turnId: state.turns[1].id,
          text: 'We use TTL invalidation.',
        })
      ).status,
      200,
    );
    assert.equal(inputs[1].value.currentQuestion, chosen.question);
    assert.equal(inputs[1].value.transcript, 'We use TTL invalidation.');
    state = (await call()).data;
    const feedback = await call({
      action: 'feedback',
      revision: state.revision,
      turnId: state.turns[1].id,
      text: 'We use TTL with write invalidation.',
    });
    assert.equal(feedback.status, 200);
    assert.equal(feedback.data.feedback, 'Explained caching and TTL tradeoffs.');
    assert.deepEqual(inputs[2].value.conversation, [
      { question: question.statement, transcript: 'We use Redis.' },
      { question: chosen.question, transcript: 'We use TTL with write invalidation.' },
    ]);
    state = (await call()).data;
    assert.equal(state.feedback, '');
    assert.equal(
      (
        await call({
          action: 'save-feedback',
          revision: state.revision,
          text: 'My reviewed feedback.',
        })
      ).status,
      200,
    );
    assert.equal((await call()).data.feedback, 'My reviewed feedback.');
    assert.equal(
      await prisma.interviewFollowUp.count({
        where: { interviewId: interview.id, status: 'asked' },
      }),
      1,
    );
    await prisma.interview.update({ where: { id: interview.id }, data: { status: 'completed' } });
    assert.equal((await call({ action: 'start', revision: 0 })).status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
