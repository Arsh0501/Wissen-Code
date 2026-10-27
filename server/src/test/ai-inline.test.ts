import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import { runInlineJob } from '../ai/inline';

test('direct AI jobs persist results, reject duplicate execution and preserve failures for retry', async () => {
  const notes = {
    technicalNotes: [],
    codingNotes: [],
    problemSolvingNotes: [],
    communicationNotes: [],
    keyObservations: [],
    timeline: [],
  };
  const user = await prisma.user.create({
    data: {
      name: 'Inline AI fixture',
      email: `inline-${randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  try {
    const job = await prisma.aIJob.create({
      data: { authorId: user.id, kind: 'note-writer', input: {} },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = runInlineJob(job.id, async () => {
      started();
      await gate;
      return notes;
    });
    await ready;
    try {
      await assert.rejects(runInlineJob(job.id), /already running/);
    } finally {
      release();
    }
    assert.equal((await first).status, 'completed');
    assert.deepEqual(
      (await prisma.aIJob.findUniqueOrThrow({ where: { id: job.id } })).output,
      notes,
    );
    await assert.rejects(runInlineJob(job.id), /already running/);
    const failure = await prisma.aIJob.create({
      data: { authorId: user.id, kind: 'note-writer', input: {} },
    });
    await assert.rejects(
      runInlineJob(failure.id, async () => {
        throw new Error('Provider unavailable');
      }),
      /Provider unavailable/,
    );
    assert.equal(
      (await prisma.aIJob.findUniqueOrThrow({ where: { id: failure.id } })).status,
      'failed',
    );
    assert.equal((await runInlineJob(failure.id, async () => notes)).status, 'completed');
  } finally {
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
