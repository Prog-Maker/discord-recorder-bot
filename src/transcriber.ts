import { transcribeAudioInChunks } from './whisper';
import { generateFollowUp } from './followup';
import { Logger } from './logger';
import { sendToDiscord } from './discordSender';
import { Message } from 'discord.js';

export async function transcribeAndHandle(filePath: string, message: Message) {
  try {
    const transcript = await transcribeAudioInChunks(filePath);
    Logger.log('Распознанный текст: ' + transcript);

    const followup = await generateFollowUp(transcript);
    Logger.log('Follow-up: ' + followup);

    await sendToDiscord(followup, filePath, message);
  } catch (err) {
    Logger.error('Ошибка при расшифровке записи: ' + err);
    await sendToDiscord('Fake follow up', filePath, message);
  }
}
