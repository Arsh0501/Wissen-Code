import { openai } from '../core/llm';
import { questionTools, toolImplementations } from '../tools/question-tools';

export interface QuestionGenerationParams {
  topic: string;
  difficulty: string;
  questionType: string;
  skills: string[];
  experienceLevel: string;
}

export class QuestionGeneratorAgent {
  /**
   * Generates a question by conversing with the LLM and utilizing tools.
   */
  async generate(params: QuestionGenerationParams) {
    console.log(`[QuestionGeneratorAgent] Starting generation for topic: ${params.topic}`);

    const systemPrompt = `You are an expert Question Generation Agent for a technical assessment platform.
Your task is to generate high-quality ${params.questionType} questions about ${params.topic} 
for candidates with ${params.experienceLevel} experience, focusing on skills: ${params.skills.join(', ')}.
Difficulty should be: ${params.difficulty}.

Follow these steps using the provided tools:
1. Search the existing question bank to avoid duplicates and get inspiration (searchQuestionBank).
2. Draft the question and check if it's a duplicate (checkDuplicate).
3. Generate test cases for the question (generateTestCases).
4. Validate the final question structure (validateQuestion).
5. Finally, save it as a draft (saveDraftQuestion).

Return a final summary to the user once the draft is saved.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Please generate a question based on my requirements." }
    ];

    let isFinished = false;
    let finalResponse = "";

    while (!isFinished) {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Switched from gpt-4-turbo to avoid 404 access errors
        messages,
        tools: questionTools as any,
        tool_choice: "auto",
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const fnName = (toolCall as any).function.name as keyof typeof toolImplementations;
          const fnArgs = JSON.parse((toolCall as any).function.arguments);

          if (toolImplementations[fnName]) {
            const toolResult = await toolImplementations[fnName](fnArgs as any);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: fnName,
              content: toolResult,
            });
          } else {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: fnName,
              content: JSON.stringify({ error: "Tool not found" }),
            });
          }
        }
      } else {
        isFinished = true;
        finalResponse = message.content || "";
      }
    }

    return finalResponse;
  }
}
