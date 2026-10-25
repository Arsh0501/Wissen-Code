import test from 'node:test';
import assert from 'node:assert/strict';
import { compactInterviewContext, isContextLimitError, scopeFollowUpContext } from '../ai/context-budget';
import { validateEvidence } from '../ai/schemas';

test('follow-ups focus on the selected question current subquestion without leaking another question', () => {
  const notes = (id: string, question: string) => JSON.stringify({
    interviewerFeedback: 'Candidate described Redis caching.',
    currentSubquestion: { id, question, askedAt: new Date().toISOString(), parentId: null },
  });
  const input = { id: 1, title: 'Interview', status: 'in_progress', currentQuestionId: 1, currentCode: '',
    questions: [
      { questionId: 1, candidateAnswer: '', notes: notes('asked-1', 'How do you invalidate the cache?'), question: { title: 'Caching', statement: 'Explain caching', questionType: 'written' } },
      { questionId: 2, candidateAnswer: '', notes: notes('asked-2', 'OTHER_SUBQUESTION'), question: { title: 'Other', statement: 'Other question', questionType: 'written' } },
    ], submissions: [], notes: [], events: [],
  };
  for (const budget of [12000, 5000]) {
    const context = compactInterviewContext(scopeFollowUpContext(input, 1), budget);
    assert.equal(context.interview.currentQuestionId, 1);
    assert.equal(context.interview.currentSubquestion?.question, 'How do you invalidate the cache?');
    assert.equal(JSON.stringify(context).includes('OTHER_SUBQUESTION'), false);
    assert.ok(JSON.stringify(context).length <= budget);
  }
});

test('interview AI context excludes resume attachments and repeated code snapshots and stays within its budget', () => {
  const input = {
    id: 1, title: 'Long interview', status: 'in_progress', currentQuestionId: 3,
    candidateResumeUrl: 'data:application/pdf;base64,' + 'PRIVATE_PDF_BYTES'.repeat(100000),
    roomToken: 'PRIVATE_ROOM_TOKEN', currentCode: 'def solve():\n    return 42\n'.repeat(2000),
    questions: Array.from({ length: 20 }, (_, id) => ({ questionId: id, candidateAnswer: 'I selected a hash map for constant time lookup. '.repeat(500), question: { title: `Question ${id}`, statement: 'Explain the algorithm. '.repeat(1000) } })),
    submissions: Array.from({ length: 50 }, (_, id) => ({ id, questionId: id % 10, code: 'print(42)\n'.repeat(4000), results: '{"status":"Accepted"}'.repeat(200), score: 100 })),
    notes: Array.from({ length: 100 }, (_, id) => ({ id, content: 'Explained the complexity correctly. '.repeat(500) })),
    events: [...Array.from({ length: 200 }, (_, id) => ({ id, eventType: 'CODE_CHANGED', actorRole: 'candidate', payload: 'OLD_CODE_SNAPSHOT'.repeat(3000) })), { id: 201, eventType: 'CODE_SUBMITTED', actorRole: 'candidate', payload: '{"passed":4,"total":4}' }],
    plan: { requiredSkills: ['Python', 'DSA'] },
  };
  for (const budget of [12000, 5000]) {
    const context = compactInterviewContext(input, budget);
    const serialized = JSON.stringify(context);
    assert.ok(serialized.length <= budget);
    assert.equal(serialized.includes('PRIVATE_PDF_BYTES'), false);
    assert.equal(serialized.includes('PRIVATE_ROOM_TOKEN'), false);
    assert.equal(serialized.includes('OLD_CODE_SNAPSHOT'), false);
    assert.equal(context.interview.questions[0].questionId, 3);
    assert.ok(context.interview.events.some((event) => event.id === 201));
    const quote = context.sources['current:code'].slice(0, 12);
    assert.ok(input.currentCode.includes(quote));
    validateEvidence({ evidence: [{ sourceId: 'current:code', quote }] }, context.sources);
    assert.throws(() => validateEvidence({ evidence: [{ sourceId: 'current:code', quote: 'invented candidate explanation' }] }, context.sources));
  }
});

test('only provider size errors trigger smaller-context retries', () => {
  assert.equal(isContextLimitError({ status: 400, message: 'Please reduce the length of the messages or completion.' }), true);
  assert.equal(isContextLimitError({ status: 413, message: 'Request too large for model' }), true);
  assert.equal(isContextLimitError({ status: 401, message: 'Invalid API key' }), false);
  assert.equal(isContextLimitError({ status: 429, message: 'Rate limit exceeded' }), false);
});

test('only reviewed transcript for the selected question is admitted as speech evidence', () => {
  const evidence = (text: string) => JSON.stringify({ transcriptEvidence: { text, segmentIds: ['one'], reviewedAt: new Date().toISOString() } });
  const input = { id: 1, title: 'Interview', status: 'in_progress', currentQuestionId: 1, currentCode: '',
    questions: [
      { questionId: 1, candidateAnswer: '', notes: evidence('We used Redis to cache queries.'), question: { title: 'Caching', statement: 'Explain caching', questionType: 'written' } },
      { questionId: 2, candidateAnswer: '', notes: evidence('OTHER_QUESTION_SPEECH'), question: { title: 'Coding', statement: 'Implement cache', questionType: 'coding' } },
    ], submissions: [], notes: [], events: [],
  };
  const context = compactInterviewContext(scopeFollowUpContext(input, 1));
  assert.equal(context.sources['question:1:reviewed-transcript'], 'We used Redis to cache queries.');
  assert.equal(JSON.stringify(context).includes('OTHER_QUESTION_SPEECH'), false);
  assert.equal(JSON.stringify(compactInterviewContext(input)).includes('We used Redis'), false);
  assert.equal(compactInterviewContext(scopeFollowUpContext(input, 2)).sources['question:2:reviewed-transcript'], 'OTHER_QUESTION_SPEECH');
  assert.throws(() => scopeFollowUpContext({ ...input, questions: input.questions.map(q => ({ ...q, notes: '{}' })) }, 1), /Save interviewer feedback/);
});

test('follow-ups use only selected question feedback or the latest candidate submission', () => {
  const input = { id: 1, title: 'Interview', status: 'in_progress', currentQuestionId: 1, currentCode: 'UNSUBMITTED_DRAFT',
    questions: [
      { questionId: 1, candidateAnswer: 'CANDIDATE_WRITTEN_ANSWER', notes: JSON.stringify({ interviewerFeedback: 'Explained row locking but missed deadlocks.' }), question: { title: 'Booking', statement: 'Design booking', questionType: 'written' } },
      { questionId: 2, candidateAnswer: '', question: { title: 'Two sum', statement: 'Find a pair', questionType: 'coding' } },
    ],
    submissions: [
      { id: 3, questionId: 2, code: 'INTERVIEWER_CODE', results: '[]', score: 100, submittedBy: 'interviewer' },
      { id: 2, questionId: 2, code: 'CANDIDATE_SUBMITTED_CODE', results: 'passed 3/4', score: 75, submittedBy: 'candidate' },
      { id: 1, questionId: 1, code: 'OTHER_QUESTION_CODE', results: '[]', score: 0, submittedBy: 'candidate' },
    ],
    notes: [{ id: 1, content: 'WHOLE_INTERVIEW_NOTES' }], events: [
      { id: 1, eventType: 'CODE_SUBMITTED', actorRole: 'candidate', payload: '{"questionId":2}' },
      { id: 2, eventType: 'QUESTION_FEEDBACK_UPDATED', actorRole: 'interviewer', payload: '{"questionId":1}' },
    ],
  };
  const nonCoding = compactInterviewContext(scopeFollowUpContext(input, 1));
  assert.equal(nonCoding.sources['question:1:feedback'], 'Explained row locking but missed deadlocks.');
  assert.equal(nonCoding.interview.questions.length, 1);
  assert.equal(JSON.stringify(nonCoding).includes('CANDIDATE_WRITTEN_ANSWER'), false);
  const coding = compactInterviewContext(scopeFollowUpContext(input, 2));
  assert.equal(coding.sources['submission:2:code'], 'CANDIDATE_SUBMITTED_CODE');
  assert.equal(coding.sources['submission:2:execution'], 'passed 3/4');
  for (const excluded of ['INTERVIEWER_CODE', 'UNSUBMITTED_DRAFT', 'OTHER_QUESTION_CODE', 'WHOLE_INTERVIEW_NOTES', 'row locking']) assert.equal(JSON.stringify(coding).includes(excluded), false);
  assert.deepEqual(coding.interview.events.map((event) => event.id), [1]);
  assert.throws(() => scopeFollowUpContext(input, 999), /Select a question/);
  assert.throws(() => scopeFollowUpContext({ ...input, submissions: [] }, 2), /candidate must submit code/);
  assert.throws(() => scopeFollowUpContext({ ...input, questions: input.questions.map((item) => ({ ...item, notes: '' })) }, 1), /Save interviewer feedback/);
});
