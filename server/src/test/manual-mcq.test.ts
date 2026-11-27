import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import questions from '../routes/questions';
import prisma from '../database/prisma';

test('manual MCQs validate answers, exclude coding resources and clear them on conversion', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 1, name: 'Test', email: 'test@test.invalid', role: 'admin' };
    next();
  });
  app.use('/questions', questions);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}/questions`;
  const ids: number[] = [];
  const settings = {
    options: [
      { id: 'a', text: 'First' },
      { id: 'b', text: 'Second' },
    ],
    correctOptionIds: ['b'],
    multiple: false,
  };
  const body = {
    title: 'Manual MCQ fixture',
    statement: 'Choose one',
    questionType: 'mcq',
    settings,
    starterCodes: [{ languageId: 71, languageName: 'Python', code: 'pass' }],
    testCases: [{ input: '1', expectedOutput: '1' }],
  };
  const request = async (url: string, method: string, data: unknown) => {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return { status: response.status, data: (await response.json()) as any };
  };
  try {
    assert.equal(
      (
        await request(root, 'POST', {
          ...body,
          settings: { ...settings, correctOptionIds: ['missing'] },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(root, 'POST', {
          ...body,
          settings: {
            ...settings,
            options: [
              { id: 'a', text: ' ' },
              { id: 'b', text: 'B' },
            ],
          },
        })
      ).status,
      400,
    );
    const created = await request(root, 'POST', body);
    assert.equal(created.status, 201);
    ids.push(created.data.id);
    assert.deepEqual(created.data.starterCodes, []);
    assert.deepEqual(created.data.testCases, []);
    assert.deepEqual(created.data.settings.correctOptionIds, ['b']);
    assert.equal(
      (await request(`${root}/${created.data.id}/starter-code`, 'POST', body.starterCodes[0]))
        .status,
      400,
    );
    assert.equal(
      (await request(`${root}/${created.data.id}/testcases`, 'POST', { testCases: body.testCases }))
        .status,
      400,
    );
    const coding = await request(root, 'POST', { ...body, questionType: 'coding', settings: {} });
    ids.push(coding.data.id);
    assert.equal(coding.data.testCases.length, 1);
    const parsed = await request(`${root}/testcases/parse`, 'POST', {
      text: 'sample\n3\n1 2 3\n6\nhidden\n2\n10 20\n30',
    });
    assert.equal(parsed.status, 200);
    assert.equal(parsed.data.testCases.length, 2);
    const imported = await request(`${root}/${coding.data.id}/testcases`, 'POST', parsed.data);
    assert.equal(imported.status, 201);
    assert.equal(imported.data.count, 2);
    assert.equal(await prisma.testCase.count({ where: { questionId: coding.data.id } }), 3);
    assert.equal(
      (await request(`${root}/testcases/parse`, 'POST', { text: 'sample\n6' })).status,
      400,
    );
    const converted = await request(`${root}/${coding.data.id}`, 'PUT', {
      questionType: 'mcq',
      settings,
    });
    assert.equal(converted.status, 200);
    assert.deepEqual(converted.data.testCases, []);
    assert.deepEqual(converted.data.starterCodes, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.question.deleteMany({ where: { id: { in: ids } } });
  }
});
