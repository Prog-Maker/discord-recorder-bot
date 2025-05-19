import { spawn, execSync } from 'child_process';
import * as prism from 'prism-media';
import { EndBehaviorType, VoiceReceiver } from '@discordjs/voice';
import { Logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

const MAX_SEGMENT_SIZE_MB = 24;
const SEGMENT_FOLDER = './segments';

export function createRecordingPipeline(
  userId: string,
  receiver: VoiceReceiver,
  outputPath: string
) {
  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 3600000, // до 1 часа
    },
  });

  const decoder = new prism.opus.Decoder({
    rate: 48000,
    channels: 2,
    frameSize: 960,
  });

  const ffmpeg = spawn('ffmpeg', [
    '-f',
    's16le',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-i',
    'pipe:0',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '192k',
    outputPath,
  ]);

  ffmpeg.stderr.on('data', (data) => {
    Logger.log(`ffmpeg stderr: ${data}`);
  });

  opusStream.pipe(decoder).pipe(ffmpeg.stdin);

  Logger.log(`Запись началась: ${outputPath}`);

  return ffmpeg;
}

export function getFileSizeMB(filePath: string): number {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

export function getDurationSec(filePath: string): number {
  return parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    )
      .toString()
      .trim()
  );
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

export function splitAudioBySize(inputFile: string): string[] {
  checkDependencies();
  cleanSegmentFolder();

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
