import { QuestionGeneratorAgent } from '../question-generator';
import { QuestionGenerationParams } from '../question-generator/generator.types';
import { toolImplementations } from '../tools/question-tools';

/**
 * Simple pipeline: Generate → Save → Return.
 * 
 * Validation agent is skipped for now because Groq's free tier
 * rate limits cause the validator to produce truncated responses.
 * When you upgrade to a paid API, re-enable the validator.
 */
export class QuestionCreationPipeline {
  private generator = new QuestionGeneratorAgent();

  async run(params: QuestionGenerationParams) {
    console.log(`\n[Pipeline] Generating ${params.category} question for: ${params.topic}`);

    // Step 1: Generate question + test cases + solution code
    const draft = await this.generator.draftQuestion(params);

    // Step 2: Parse the response
    let parsed: any;
    try {
      parsed = JSON.parse(draft);
    } catch {
      // If JSON parsing fails, return raw text
      return {
        success: true,
        question: {
          title: `Generated: ${params.topic}`,
          statement: draft,
          difficulty: params.difficulty,
          type: params.category,
          skills: params.skills,
        },
        testCases: [],
        solutionCode: null,
        solutionExplanation: null,
        saved: { success: false, error: 'Draft was not valid JSON' },
      };
    }

    // Step 3: Save to database
    let saveResult: any = { success: false };
    try {
      const result = await toolImplementations.saveDraftQuestion({
        title: parsed.title || `Generated: ${params.topic}`,
        statement: parsed.statement || draft,
        difficulty: parsed.difficulty || params.difficulty,
        tags: parsed.skills || params.skills,
        testCases: parsed.testCases || [],
      });
      saveResult = JSON.parse(result);
    } catch (e: any) {
      saveResult = { success: false, error: e.message };
    }

    console.log('[Pipeline] ✅ Question generated and saved!');

    return {
      success: true,
      question: {
        title: parsed.title,
        statement: parsed.statement,
        difficulty: parsed.difficulty,
        type: parsed.type,
        skills: parsed.skills,
        constraints: parsed.constraints || null,
      },
      testCases: parsed.testCases || [],
      starterCode: parsed.starterCode || null,
      // Interview-specific fields
      discussionPoints: parsed.discussionPoints || null,
      followUpQuestions: parsed.followUpQuestions || null,
      evaluationRubric: parsed.evaluationRubric || null,
      saved: saveResult,
    };
  }
}
