import { QuestionGeneratorAgent, QuestionGenerationParams } from '../question-generator';

/**
 * The Orchestrator acts as the central router for different agents.
 * As the project expands, you can add more agents (e.g., GradingAgent, FeedbackAgent) here.
 * The orchestrator pattern allows for easy expansion in the future.
 */
export class AgentOrchestrator {
  private questionGenerator: QuestionGeneratorAgent;

  constructor() {
    this.questionGenerator = new QuestionGeneratorAgent();
  }

  /**
   * Delegates the task to the QuestionGeneratorAgent.
   */
  async runQuestionGeneration(params: QuestionGenerationParams) {
    console.log("[Orchestrator] Routing task to QuestionGeneratorAgent...");
    return await this.questionGenerator.generate(params);
  }
}

// Export a singleton instance
export const orchestrator = new AgentOrchestrator();
