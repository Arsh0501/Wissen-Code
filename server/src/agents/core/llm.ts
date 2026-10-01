import OpenAI from 'openai';

// Initialize the OpenAI client
// The API key is automatically picked up from process.env.OPENAI_API_KEY
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
