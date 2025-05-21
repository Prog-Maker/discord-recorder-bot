import * as fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import * as dotenv from 'dotenv';
import { splitAudioBySize } from './recorder';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error('Не найден OPENAI_API_KEY в .env');
}

async function transcribeFile(filePath: string): Promise<string> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('model', 'whisper-1');

  const response = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    }
  );

  return response.data.text;
}

export async function transcribeAudioInChunks(
  filePath: string
): Promise<string> {
  const segments = splitAudioBySize(filePath);
  let fullText = '';

  for (const segment of segments) {
    console.log(`Распознаём: ${segment}`);
    const text = await transcribeFile(segment);
    fullText += text + '\n';
  }

  return fullText
    .trim()
    .replace(/([.!?])\s+/g, '$1\n') // разбивка по предложениям
    .replace(/\n{2,}/g, '\n'); // убрать лишние пустые строки
}
