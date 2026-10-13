import { callGroq } from '../core/openai-client';
import { toolImplementations } from '../tools/question-tools';
import { getValidatorSystemPrompt } from './validator.prompts';
import { ValidationResult } from './validator.types';

export class QuestionValidatorAgent {
  /**
   * Validates a draft question using the Groq LLM.
   * Also runs a real duplicate check against the DB before calling the LLM.
   */
  async validate(
    draftQuestion: string,
    category: 'assessment' | 'interview' = 'assessment'
  ): Promise<ValidationResult> {
    console.log(`[ValidatorAgent] Validating draft for category: ${category}...`);

    // Run a real duplicate check from DB before asking the LLM
    let duplicateContext = '';
    try {
      const parsed = JSON.parse(draftQuestion);
      if (parsed.title) {
        const dupResult = await toolImplementations.checkDuplicate({
          title: parsed.title,
          statement: parsed.statement || '',
        });
        const dupData = JSON.parse(dupResult);
        if (dupData.isDuplicate) {
          duplicateContext = '\n⚠️ WARNING: A question with a very similar title already exists in the database!';
        }
      }
    } catch {
      // draftQuestion might not be valid JSON yet, that's ok
    }

    const messages: any[] = [
      { role: 'system', content: getValidatorSystemPrompt(category) },
      {
        role: 'user',
        content: `Validate this question draft:${duplicateContext}\n\n${draftQuestion}`,
      },
    ];

    // Single LLM call with JSON mode
    const response = await callGroq(messages, { jsonMode: true, maxTokens: 800 });

    try {
      return JSON.parse(response) as ValidationResult;
    } catch {
      // If LLM returns malformed JSON, treat it as a failure
      console.error('[ValidatorAgent] Failed to parse LLM response as JSON:', response);
      return {
        isValid: false,
        feedback: 'Validator returned malformed output. Retrying...',
        checks: {
          correctness: false,
          difficulty: false,
          duplicate: false,
          ambiguity: false,
          testCases: false,
          expectedSolution: false,
          edgeCases: false,
        },
      };
    }
  }
}
