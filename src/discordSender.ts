import { TextChannel, Message } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

const followup_channel = process.env.FOLLOW_UP_CHANNEL;

export async function sendToDiscord(
  followup: string,
  filePath: string,
  message: Message
) {
  try {
    const txtPath = filePath.replace(path.extname(filePath), '.txt');
    fs.writeFileSync(txtPath, followup, 'utf-8');
    Logger.log('Follow-up сохранён в файл: ' + txtPath);

    const guild = message.guild;
    if (!guild) {
      Logger.warn('Сообщение не из сервера.');
      return;
    }

    const channel = guild.channels.cache.find(
      (ch) => ch.name === followup_channel && ch.isTextBased()
    );

    if (channel && channel.isTextBased()) {
      await (channel as TextChannel).send({
        content: 'Вот итоговый follow-up по созвону:',
        files: [txtPath],
      });
    } else {
      Logger.warn(`Канал "${followup_channel}" не найден или не текстовый.`);
    }
  } catch (err) {
    Logger.error('Ошибка при отправке follow-up в канал: ' + err);
  }
}
