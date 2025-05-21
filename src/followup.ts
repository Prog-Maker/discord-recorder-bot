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
        content: `Ты — профессиональный ассистент, который составляет краткий и структурированный follow-up по итогам делового звонка.
Follow-up должен содержать:
1. Основные темы обсуждения
2. Принятые решения
3. Дальнейшие шаги (action items с указанием ответственных, если они упоминаются).
Оформляй ответ в виде маркированного списка или с подзаголовками. Пиши лаконично и ясно.`,
      },
      {
        role: 'user',
        content: `Вот транскрипт звонка:\n\n${transcript}\n\nСоставь follow-up по указанной структуре.`,
      },
    ],
  });

  return (
    chatCompletion.choices[0].message.content ||
    'Не удалось сгенерировать follow-up.'
  );
}
