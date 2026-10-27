import test from 'node:test';
import assert from 'node:assert/strict';
import { uiResults, buildUIHistory } from '../ai/results';

test('AI messages expose generation provenance and retain evidence separately from edited notes', () => {
  const metadata = {
    createdAt: '2026-10-19T10:00:00Z',
    trigger: { mode: 'automatic', eventId: 483, eventType: 'CODE_SUBMITTED' },
  };
  const result = uiResults(
    'job',
    'note-writer',
    {
      technicalNotes: [
        {
          content: 'Original note',
          evidence: [{ sourceId: 'event:483', quote: 'Used transactions' }],
        },
      ],
      codingNotes: [],
      problemSolvingNotes: [],
      communicationNotes: [],
      keyObservations: [],
      timeline: [],
      _reviews: { 'job-technicalNotes-0': { decision: 'accept', content: 'Reviewed note' } },
    },
    metadata,
  );
  const note = result.notes![0];
  assert.equal(note.body, 'Reviewed note');
  assert.equal(note.content, 'Reviewed note');
  assert.equal(note.status, 'accepted');
  assert.equal(note.evidence, 'event:483: Used transactions');
  assert.deepEqual(note.trigger, metadata.trigger);
  assert.equal(note.createdAt, metadata.createdAt);
  const assistant = uiResults(
    'follow',
    'interview-assistant',
    {
      followUps: [{ context: 'Context', question: 'Why?', evidence: [] }],
      observations: [],
      areasToProbe: [],
    },
    metadata,
  );
  assert.deepEqual(assistant.followUps![0].trigger, metadata.trigger);
  assert.deepEqual(assistant.evaluation!.trigger, metadata.trigger);
});

test('AI feed retains earlier suggestions and reviews across recent completed jobs', () => {
  const assistant = (question: string, reviewed = false) => ({
    followUps: [{ question, context: 'Context', evidence: [] }],
    observations: [],
    areasToProbe: [],
    ...(reviewed ? { _reviews: { 'older-0': { decision: 'dismiss' } } } : {}),
  });
  const feed = buildUIHistory([
    {
      id: 'newer',
      kind: 'interview-assistant',
      createdAt: new Date('2026-10-19T10:02:00Z'),
      input: { _trigger: { mode: 'manual', eventId: 484 } },
      output: assistant('New suggestion'),
    },
    {
      id: 'older',
      kind: 'interview-assistant',
      createdAt: new Date('2026-10-19T10:01:00Z'),
      input: { _trigger: { mode: 'automatic', eventId: 483 } },
      output: assistant('Earlier suggestion', true),
    },
  ]) as any;
  assert.deepEqual(
    feed.followUps.map((item: any) => item.question),
    ['Earlier suggestion', 'New suggestion'],
  );
  assert.equal(feed.followUps[0].status, 'dismissed');
  assert.equal(feed.followUps[1].trigger.eventId, 484);
});
