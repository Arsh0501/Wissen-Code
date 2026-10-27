/** Resolve provider settings consistently for API routes and background workers. */
export function aiConfig() {
  const provider =
    process.env.AI_PROVIDER?.trim() || (process.env.GROQ_API_KEY?.trim() ? 'groq' : 'openai');
  if (provider !== 'groq' && provider !== 'openai') {
    throw new Error('AI_PROVIDER must be groq or openai');
  }
  const groq = provider === 'groq';
  return {
    provider,
    apiKey: (groq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY)?.trim(),
    model:
      (groq ? process.env.GROQ_MODEL : process.env.OPENAI_MODEL)?.trim() ||
      (groq ? 'openai/gpt-oss-120b' : 'gpt-4.1-mini'),
    baseURL: groq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1',
  };
}

export function aiConfigured() {
  return !!aiConfig().apiKey;
}
