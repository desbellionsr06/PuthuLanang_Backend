import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

/**
 * Memanggil Google Gemini API dengan mode respons JSON terstruktur.
 */
export async function generateGeminiJsonText(prompt: string): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum diisi pada Backend/.env');
  }

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

