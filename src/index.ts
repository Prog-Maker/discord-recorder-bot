import {
  Client,
  GatewayIntentBits,
  Partials,
  VoiceState,
  Message,
  TextChannel,
} from 'discord.js';
import {
  joinVoiceChannel,
  EndBehaviorType,
  entersState,
  VoiceConnectionStatus,
  DiscordGatewayAdapterCreator,
  VoiceReceiver,
} from '@discordjs/voice';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import prism from 'prism-media';
import { transcribeAudioInChunks } from './whisper';
import { generateFollowUp } from './followup';
import { Logger } from './logger';

const followup_channel = process.env.FOLLOW_UP_CHANNEL;
const logs_channel = process.env.LOGS_CHANNEL;
const token = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

const recordingsDir = path.join(__dirname, '../recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir);
}

interface ActiveRecording {
  userId: string;
  connection: ReturnType<typeof joinVoiceChannel>;
  receiver: VoiceReceiver;
  ffmpeg: ReturnType<typeof spawn>;
}

const activeRecordings = new Map<string, ActiveRecording>();

client.once('ready', async () => {
  const guild = client.guilds.cache.first();
  if (guild) Logger.init(guild);
  console.log(`Бот запущен как ${client.user?.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.content === '!r') {
    const member = message.member;
    const voiceChannel = member?.voice.channel;
    if (!voiceChannel) {
      message.reply('Ты должен быть в голосовом канале!');
      return;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild
        .voiceAdapterCreator as DiscordGatewayAdapterCreator,
      selfDeaf: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch (error) {
      Logger.error('Ошибка при подключении к голосовому каналу: ' + error);
      //console.error('Ошибка при подключении к голосовому каналу:', error);
      return;
    }

    const receiver = connection.receiver;
    const userId = message.author.id;
    const username = message.author.username.replace(/\W/g, '');
    const filename = `${username}-${Date.now()}.wav`;
    const filepath = path.join(recordingsDir, filename);

    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 3600000,
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
      filepath,
    ]);

    ffmpeg.stderr.on('data', (data) => {
      Logger.log(`ffmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', async (code) => {
      Logger.log(`Запись завершена, ffmpeg завершился с кодом ${code}`);
      await TranscribeAudio(filepath, message);
    });

    opusStream.pipe(decoder).pipe(ffmpeg.stdin);

    Logger.log(`Началась запись: ${filepath}`);

    activeRecordings.set(message.guild.id, {
      userId,
      connection,
      receiver,
      ffmpeg,
    });
  }

  if (message.content === '!testTr') {
    TranscribeAudio(recordingsDir + '/test.wav', message);
  }

  if (message.content === '!stop') {
    const recording = activeRecordings.get(message.guild.id);
    if (!recording) {
      message.reply('Нет активной записи для остановки.');
      return;
    }

    if (recording.userId !== message.author.id) {
      message.reply(
        'Только пользователь, начавший запись, может её остановить.'
      );
      return;
    }

    StopRecording(recording, message.member!.voice);
    message.reply('Запись остановлена.');
  }
});

client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
  const recording = activeRecordings.get(oldState.guild.id);
  if (
    recording &&
    oldState.id === recording.userId &&
    oldState.channelId &&
    !newState.channelId
  ) {
    Logger.log(
      `${oldState.member?.user.tag} вышел из канала, завершаем запись.`
    );

    StopRecording(recording, oldState);
  }
});

client.login(token);

function StopRecording(recording: ActiveRecording, oldState: VoiceState) {
  if (
    recording.ffmpeg?.stdin &&
    !recording.ffmpeg.stdin.destroyed &&
    !recording.ffmpeg.stdin.writableEnded
  ) {
    recording.ffmpeg.stdin.end();
  }

  recording.connection.destroy();
  activeRecordings.delete(oldState.guild.id);
}

export async function TranscribeAudio(filePath: string, message: Message) {
  try {
    const transcript = await transcribeAudioInChunks(filePath);
    Logger.log('Распознанный текст: ' + transcript);
    const followup = await generateFollowUp(transcript);
    SendToDiscord(followup, filePath, message);
    Logger.log('Follow-up: ' + followup);
  } catch (err) {
    SendToDiscord('Fake follow up', filePath, message);
    Logger.error('Ошибка при расшифровке записи: ' + err);
  }
}

export async function SendToDiscord(
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
