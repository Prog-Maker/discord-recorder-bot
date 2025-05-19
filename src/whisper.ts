import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_SEGMENT_SIZE_MB = 24;
const SEGMENT_FOLDER = './segments';

if (!OPENAI_API_KEY) {
  throw new Error('Не найден OPENAI_API_KEY в .env');
}

// Проверка наличия ffmpeg и ffprobe
function checkDependencies() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    execSync('ffprobe -version', { stdio: 'ignore' });
  } catch {
    throw new Error('Необходимы ffmpeg и ffprobe. Установите их в системе.');
  }
}

function cleanSegmentFolder() {
  if (fs.existsSync(SEGMENT_FOLDER)) {
    fs.rmSync(SEGMENT_FOLDER, { recursive: true, force: true });
  }
  fs.mkdirSync(SEGMENT_FOLDER);
}

function getFileSizeMB(filePath: string): number {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

function splitAudioBySize(inputFile: string): string[] {
  const duration = parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFile}"`
    )
      .toString()
      .trim()
  );

  const fileSizeMB = getFileSizeMB(inputFile);
  const approxSegments = Math.ceil(fileSizeMB / MAX_SEGMENT_SIZE_MB);
  const segmentDuration = Math.ceil(duration / approxSegments);

  console.log(
    `Разбиваем на ${approxSegments} части по ~${segmentDuration} сек.`
  );

  const outputPattern = path.join(SEGMENT_FOLDER, 'segment_%03d.mp3');
  execSync(
    `ffmpeg -i "${inputFile}" -f segment -segment_time ${segmentDuration} -c:a libmp3lame -b:a 128k "${outputPattern}"`
  );

  return fs
    .readdirSync(SEGMENT_FOLDER)
    .filter((f) => f.endsWith('.mp3'))
    .map((f) => path.join(SEGMENT_FOLDER, f));
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
  checkDependencies();
  cleanSegmentFolder();

  const segments = splitAudioBySize(filePath);
  let fullText = '';

  for (const segment of segments) {
    console.log(`Распознаём: ${segment}`);
    const text = await transcribeFile(segment);
    fullText += text + '\n';
  }

  return fullText.trim();
}
