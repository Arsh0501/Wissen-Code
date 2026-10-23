import 'dotenv/config';
import assert from 'node:assert/strict';
import { generateSetPreview } from '../services/question-sets';

async function main() {
  const detailed = await generateSetPreview({
    topics: 'Java concurrency and thread safety',
    count: 3,
    includeAnswers: true,
    answerDetail: 'detailed',
  });
  assert.equal(detailed.questions.length, 3);
  assert.ok(detailed.questions.every(question => question.answer?.trim()));
  assert.equal(new Set(detailed.questions.map(question => question.title.toLowerCase())).size, 3);

  const questionsOnly = await generateSetPreview({
    topics: 'SQL transactions',
    count: 1,
    includeAnswers: false,
    answerDetail: 'brief',
  });
  assert.equal(questionsOnly.questions.length, 1);
  assert.equal(questionsOnly.questions[0].answer, null);
  console.log('Dedicated Groq agent check passed: three detailed-answer questions and one question without an answer; no records saved.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
