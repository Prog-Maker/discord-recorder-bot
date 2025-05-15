import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateFollowUp(transcript: string): Promise<string> {
  const chatCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'Ты ассистент, который составляет краткий follow-up по итогам звонка.',
      },
      {
        role: 'user',
        content: `Вот транскрипт звонка:\n\n${transcript}\n\nСоставь краткий follow-up.`,
      },
    ],
  });

  return chatCompletion.choices[0].message.content || 'Не удалось сгенерировать follow-up.';
}
