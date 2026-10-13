import { callGroq } from '../core/openai-client';
import { toolImplementations } from '../tools/question-tools';
import { getGeneratorSystemPrompt } from './generator.prompts';
import { QuestionGenerationParams } from './generator.types';

export * from './generator.types';

export class QuestionGeneratorAgent {
  generate(params: QuestionGenerationParams, feedback?: string): Promise<string> {
    return this.draftQuestion(params, feedback);
  }

  /**
   * Generates a draft question using a simple prompt → JSON approach.
   * 
   * Instead of relying on LLM tool calling (which free-tier models handle
   * poorly and causes infinite loops), we:
   * 1. Run the DB tools ourselves BEFORE calling the LLM (search + duplicate check)
   * 2. Inject the tool results into the prompt as context
   * 3. Ask the LLM for a single, clean JSON response
   */
  async draftQuestion(params: QuestionGenerationParams, feedback?: string): Promise<string> {
    console.log(`[GeneratorAgent] Drafting question for topic: ${params.topic}`);

    // Step 1: Run tools ourselves to gather context
    const existingQuestions = await toolImplementations.searchQuestionBank({
      query: params.topic,
      difficulty: params.difficulty,
    });

    // Step 2: Build messages with context baked in
    let userMessage = `Generate the question now.

Here are existing questions in the bank (avoid duplicates):
${existingQuestions}`;

    if (feedback) {
      userMessage = `The validator rejected the previous draft. Fix it based on this feedback:
${feedback}

Existing questions in the bank (avoid duplicates):
${existingQuestions}`;
    }

    const messages: any[] = [
      { role: 'system', content: getGeneratorSystemPrompt(params) },
      { role: 'user', content: userMessage },
    ];

    // Step 3: Single LLM call with JSON mode — no tool calling loop
    const response = await callGroq(messages, { jsonMode: true, maxTokens: 1500 });

    console.log('[GeneratorAgent] Draft generated successfully.');
    return response;
  }
}
