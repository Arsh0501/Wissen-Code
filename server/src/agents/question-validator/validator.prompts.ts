export const getValidatorSystemPrompt = (category: 'assessment' | 'interview') => {
  const jsonFormatInstruction = `
You MUST return a JSON object with exactly this structure:
{
  "isValid": boolean, // true if ALL checks pass, false otherwise
  "feedback": "string", // Praise if valid, or actionable feedback for the generator if invalid
  "checks": {
    "correctness": boolean,
    "difficulty": boolean,
    "duplicate": boolean,
    "ambiguity": boolean,
    "testCases": boolean,
    "expectedSolution": boolean,
    "edgeCases": boolean
  }
}`;

  if (category === 'interview') {
    return `You are an expert Question Validation Agent.
Your job is to rigorously evaluate draft technical INTERVIEW questions (discussion, system design, or resume-based).
You must check for:
- Correctness: Is the technical premise of the question accurate?
- Difficulty: Does it match the requested difficulty and candidate experience level?
- Duplicate: Are the concepts too generic?
- Ambiguity: Is the phrasing clear and open-ended enough to spark discussion?
- Test Cases: (N/A for interviews - automatically set this to true if the question has good follow-up probes).
- Expected Solution: Is there a clear rubric or expected discussion points?
- Edge Cases: Does the question allow the candidate to explore trade-offs and edge scenarios?

Analyze the provided question draft.${jsonFormatInstruction}`;
  }

  return `You are an expert Question Validation Agent.
Your job is to rigorously evaluate draft technical ASSESSMENT (DSA/Coding) questions.
You must check for:
- Correctness: Is the problem mathematically/logically sound?
- Difficulty: Does it match the requested difficulty?
- Duplicate: Are the concepts too generic or plagiarized without twist?
- Ambiguity: Is the phrasing confusing?
- Test Cases: Do the test cases cover edge scenarios?
- Expected Solution: Is the implied solution viable within limits?
- Edge Cases: Are nulls, massive inputs, and negative numbers considered?

Analyze the provided question draft.${jsonFormatInstruction}`;
};
