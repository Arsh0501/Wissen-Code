import OpenAI from 'openai';

/**
 * Groq API Client
 * Uses the OpenAI SDK pointed at Groq's OpenAI-compatible endpoint.
 * Ensure GROQ_API_KEY is set in your .env file.
 */
export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export const MODELS = {
  PRIMARY: 'qwen/qwen3.8-27b',
};

/**
 * Extracts a JSON object from an LLM response that may contain
 * thinking tags (<think>...</think>) or markdown code fences.
 */
function extractJSON(raw: string): string {
  // Strip <think>...</think> blocks (Qwen thinking model output)
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // Strip markdown code fences like ```json ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try to find the first { ... } block
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }

  return cleaned;
}

/**
 * Helper to call Groq with automatic retry on 429 rate limit errors.
 * Groq free tier has strict TPM limits, so we wait and retry.
 * 
 * We do NOT use response_format: json_object because Qwen's thinking
 * model outputs <think> tags that break Groq's JSON mode.
 * Instead we parse JSON from the raw text ourselves.
 */
export async function callGroq(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<string> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: MODELS.PRIMARY,
        messages,
        max_tokens: options?.maxTokens ?? 2048,
        temperature: 0.7,
        // NOTE: No response_format here — Qwen thinking model breaks JSON mode
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Groq returned empty response');

      // If caller expects JSON, extract it from thinking model output
      if (options?.jsonMode) {
        return extractJSON(content);
      }

      return content;
    } catch (err: any) {
      // Handle rate limiting (429) by waiting and retrying
      if (err?.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(err?.headers?.['retry-after']) || 3;
        const waitMs = retryAfter * 1000;
        console.warn(`[Groq] Rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Groq: Max retries exceeded');
}
