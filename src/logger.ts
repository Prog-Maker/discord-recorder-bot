import { TextChannel, Guild } from 'discord.js';

export class Logger {
private static channel: TextChannel | null = null;

  // Инициализация логгера при запуске
  static init(guild: Guild) {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === process.env.LOGS_CHANNEL && ch.isTextBased()
    );

    if (channel && channel.isTextBased()) {
      this.channel = channel as TextChannel;
      console.log(`Logger инициализирован: ${channel.name}`);
    } else {
      this.channel = null;
      console.warn(`Канал логов "${process.env.LOGS_CHANNEL}" не найден или не текстовый.`);
    }
  }

  static async log(message: string) {
    await this.sendToDiscord(message, 0x2f3136); // серый
  }

  static async warn(message: string) {
    await this.sendToDiscord(message, 0xffcc00); // жёлтый
  }

  static async error(message: string) {
    await this.sendToDiscord(message, 0xff0000); // красный
  }

  private static async sendToDiscord(content: string, color: number) {
    if (!this.channel) {
      this.fallback(content, color);
      return;
    }

    // Проверим, существует ли канал и есть ли доступ
    const guild = this.channel.guild;
    const channelExists = guild.channels.cache.has(this.channel.id);

    if (!channelExists) {
      console.warn(`Logger: канал логов был удалён, переключаемся на консоль.`);
      this.channel = null;
      this.fallback(content, color);
      return;
    }

    try {
      const embed = {
        description: content,
        color,
        timestamp: new Date().toISOString(),
      };
      await this.channel.send({ embeds: [embed] });
    } catch (err) {
      console.warn(`Logger: ошибка при отправке в лог-канал, переключаемся на консоль.`);
      this.channel = null;
      this.fallback(`${content} (ошибка: ${err})`, color);
    }
  }

  private static fallback(message: string, color: number) {
    const prefix = color === 0xff0000
      ? '[ERROR]'
      : color === 0xffcc00
      ? '[WARN]'
      : '[LOG]';
    console.log(`${prefix} ${message}`);
  }
}
