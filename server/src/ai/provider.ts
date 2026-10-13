import type {
  AIQuestionReview, GenerateQuestionsRequest, GeneratedQuestion, InterviewPlanRequest, Observation,
  ObservationsRequest, PlanSection,
} from './contract';
import { standInProvider } from './standin';

/**
 * Everything the platform needs from an AI backend. The AI backend owner implements this
 * interface (e.g. with OpenAI structured outputs) and registers it in getAIProvider().
 * Implementations must return data that matches the contract types exactly — routes
 * re-validate generated questions before using them.
 */
export interface AIProvider {
  name: string;
  generateQuestions(req: GenerateQuestionsRequest): Promise<GeneratedQuestion[]>;
  /** Judgement checks for one question (correctness, ambiguity, difficulty, missing edge cases). */
  reviewQuestion(q: GeneratedQuestion): Promise<AIQuestionReview>;
  planInterview(req: InterviewPlanRequest): Promise<{ sections: PlanSection[]; rationale: string }>;
  /** Observations about a candidate's answer; each must cite verbatim evidence from the inputs. */
  observe(req: ObservationsRequest): Promise<Observation[]>;
}

/**
 * Selects the provider. Until the real backend is wired in, the stand-in serves
 * realistic, deterministic responses so every workflow can be built and demoed.
 */
export function getAIProvider(): AIProvider {
  // e.g. if (process.env.AI_PROVIDER === 'openai') return openAIProvider;
  return standInProvider;
}
