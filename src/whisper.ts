import * as fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import * as dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error('Не найден OPENAI_API_KEY в .env');
}

export async function transcribeAudio(filePath: string): Promise<string> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('model', 'whisper-1');

  try {
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    });

    return response.data.text;
  } catch (error: any) {
    console.error('Ошибка при расшифровке аудио:', error.response?.data || error.message);
    throw error;
  }
}