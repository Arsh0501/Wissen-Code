import { QuestionGenerationParams } from './generator.types';

/**
 * Builds the system prompt for the Question Generation Agent.
 * Instructs the LLM to return structured JSON with question, test cases, and solution code.
 */
export const getGeneratorSystemPrompt = (params: QuestionGenerationParams) => {
  const baseContext = `You are an expert Question Generation Agent for a technical assessment platform.
Generate a high-quality ${params.questionType} question about "${params.topic}" 
for candidates with ${params.experienceLevel} experience level.
Required skills: ${params.skills.join(', ')}.
Difficulty: ${params.difficulty}.`;

  if (params.category === 'interview') {
    return `${baseContext}
${params.context ? `\nCandidate/Job Context:\n${params.context}\n` : ''}
This is an INTERVIEW question. It should be open-ended, discussion-based, or architectural.

Respond with ONLY a valid JSON object:
{
  "title": "Short descriptive title",
  "statement": "The full interview question text",
  "difficulty": "${params.difficulty}",
  "type": "interview",
  "skills": ${JSON.stringify(params.skills)},
  "discussionPoints": ["point1", "point2", "point3"],
  "followUpQuestions": ["follow-up 1", "follow-up 2"],
  "evaluationRubric": "How to evaluate the candidate's answer"
}`;
  }

  return `${baseContext}
This is a DSA/Coding ASSESSMENT question.

Respond with ONLY a valid JSON object:
{
  "title": "Short descriptive title",
  "statement": "Full problem statement including input/output format and constraints",
  "difficulty": "${params.difficulty}",
  "type": "assessment",
  "skills": ${JSON.stringify(params.skills)},
  "constraints": "Input size limits, time/space complexity expectations",
  "testCases": [
    {"input": "actual sample input", "expectedOutput": "correct output"},
    {"input": "another input", "expectedOutput": "correct output"},
    {"input": "edge case input", "expectedOutput": "correct output"}
  ],
  "starterCode": "A function skeleton with proper signature, parameters and return type. Include comments hinting at the approach but do NOT include the solution logic."
}`;
};
