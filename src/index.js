require("dotenv").config();

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { Client, GatewayIntentBits, Events } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} = require("@discordjs/voice");
const { getAudioBase64 } = require("google-tts-api");

const token = process.env.DISCORD_TOKEN;
const pinnedChannelId = process.env.VOICE_CHANNEL_ID || null;
const autoJoin = (process.env.AUTO_JOIN || "true").toLowerCase() !== "false";
const leaveWhenEmpty = (process.env.LEAVE_WHEN_EMPTY || "false").toLowerCase() === "true";
const greetingTemplate = process.env.GREETING || "Welcome, {name}!";
const lang = process.env.TTS_LANG || "en";

console.log(`[config] env: DISCORD_TOKEN=${token ? "set" : "MISSING"} VOICE_CHANNEL_ID=${pinnedChannelId ? "set" : "none"} AUTO_JOIN=${autoJoin} LEAVE_WHEN_EMPTY=${leaveWhenEmpty}`);

if (!token) {
  console.error("Missing DISCORD_TOKEN. Set it as an environment variable (Railway -> Variables) or in a local .env file.");
  process.exit(1);
}

const REGISTRY_PATH = path.join(__dirname, "..", "data", "registry.json");

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch {
    return { guilds: {} };
  }
}

const registry = loadRegistry();

function saveRegistry() {
  try {
    fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch (err) {
    console.error("[registry] save failed:", err.message);
  }
}

function guildEntry(guild) {
  const entry = (registry.guilds[guild.id] ||= { id: guild.id, name: guild.name, voiceChannels: {} });
  entry.name = guild.name;
  return entry;
}

function recordChannel(guild, channel) {
  const entry = guildEntry(guild);
  entry.voiceChannels[channel.id] = channel.name;
  entry.lastActiveChannelId = channel.id;
  saveRegistry();
}

async function scanGuild(guild) {
  try {
    const channels = await guild.channels.fetch();
    const entry = guildEntry(guild);
    entry.voiceChannels = {};
    for (const [, ch] of channels) {
      if (ch && ch.isVoiceBased()) entry.voiceChannels[ch.id] = ch.name;
    }
    saveRegistry();
  } catch (err) {
    console.error(`[registry] scan failed for ${guild.id}:`, err.message);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const sessions = new Map();

const commands = [
  { name: "join", description: "Make Hermes join the voice channel you are in" },
  { name: "leave", description: "Disconnect Hermes from this server's voice channel" },
  { name: "status", description: "Show Hermes voice status for this server" },
];

async function registerCommands(guild) {
  try {
    const registered = await guild.commands.set(commands);
    console.log(`[commands] registered ${registered.size} command(s) in ${guild.name}`);
  } catch (err) {
    console.error(`[commands] register failed for ${guild.id}:`, err.message);
  }
}

async function renderSpeech(text) {
  const base64 = await getAudioBase64(text, { lang, slow: false, timeout: 10000 });
  return Buffer.from(base64, "base64");
}

async function playNext(session) {
  if (session.speaking || session.queue.length === 0 || !session.player) return;
  session.speaking = true;
  const text = session.queue.shift();
  try {
    const buffer = await renderSpeech(text);
    const resource = createAudioResource(Readable.from(buffer), { inputType: StreamType.Arbitrary });
    resource.playStream.on("error", (err) => console.error("[audio] stream error:", err.message));
    session.player.play(resource);
    console.log(`[speak] ${session.guildName}: ${text}`);
  } catch (err) {
    console.error("[tts] error:", err.message);
    session.speaking = false;
    void playNext(session);
  }
}

function enqueue(session, text) {
  session.queue.push(text);
  void playNext(session);
}

function destroySession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;
  try { session.connection.destroy(); } catch {}
  sessions.delete(guildId);
}

async function joinChannel(channel) {
  const guildId = channel.guild.id;
  const existing = sessions.get(guildId);
  if (existing && existing.channelId === channel.id && existing.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    return existing;
  }
  if (existing) destroySession(guildId);

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  const player = createAudioPlayer();
  const session = {
    guildId,
    guildName: channel.guild.name,
    channelId: channel.id,
    connection,
    player,
    queue: [],
    speaking: false,
  };

  player.on("error", (err) => {
    console.error("[audio] player error:", err.message);
    session.speaking = false;
  });
  player.on(AudioPlayerStatus.Idle, () => {
    session.speaking = false;
    void playNext(session);
  });
  connection.subscribe(player);

  connection.on("error", (err) => console.error("[voice] connection error:", err.message));
  connection.on(VoiceConnectionStatus.Ready, () =>
    console.log(`[voice] connected: ${channel.guild.name} / ${channel.name}`));

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      if (sessions.get(guildId) === session) {
        destroySession(guildId);
        setTimeout(() => {
          void joinChannel(channel).catch((err) => console.error("[voice] rejoin failed:", err.message));
        }, 5000);
      }
    }
  });

  sessions.set(guildId, session);
  console.log(`[voice] joining: ${channel.guild.name} / ${channel.name}`);
  return session;
}

async function maybeLeaveEmpty(channel) {
  const session = sessions.get(channel.guild.id);
  if (!session || session.channelId !== channel.id) return;
  try {
    const fresh = await client.channels.fetch(channel.id);
    const humans = fresh.members.filter((m) => !m.user.bot).size;
    if (humans === 0) {
      destroySession(channel.guild.id);
      console.log(`[voice] left empty: ${channel.guild.name} / ${channel.name}`);
    }
  } catch {}
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(`[config] autoJoin=${autoJoin} leaveWhenEmpty=${leaveWhenEmpty} pinned=${pinnedChannelId || "none"}`);
  console.log(`[config] servers: ${client.guilds.cache.map((g) => g.name).join(", ") || "none"}`);

  for (const [, guild] of client.guilds.cache) {
    await scanGuild(guild);
    await registerCommands(guild);
  }

  if (pinnedChannelId) {
    try {
      const channel = await client.channels.fetch(pinnedChannelId);
      if (channel && channel.isVoiceBased()) await joinChannel(channel);
      else console.error(`[voice] pinned channel ${pinnedChannelId} is not a voice channel`);
    } catch (err) {
      console.error("[voice] pinned join failed:", err.message);
    }
  }
});

client.on(Events.GuildCreate, (guild) => {
  console.log(`[guild] added to: ${guild.name}`);
  void scanGuild(guild);
  void registerCommands(guild);
});

client.on(Events.GuildDelete, (guild) => {
  console.log(`[guild] removed from: ${guild.name}`);
  destroySession(guild.id);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member ?? (await newState.guild.members.fetch(newState.id).catch(() => null));
  if (!member || member.user.bot) return;

  const joinedId = newState.channelId;
  const leftId = oldState.channelId;

  if (joinedId && joinedId !== leftId) {
    const channel = newState.channel ?? (await newState.guild.channels.fetch(joinedId).catch(() => null));
    if (!channel) return;

    recordChannel(newState.guild, channel);

    const isPinned = pinnedChannelId && joinedId === pinnedChannelId;
    if (!autoJoin && !isPinned) return;

    const session = await joinChannel(channel);
    const name = member.displayName || member.user.username;
    enqueue(session, greetingTemplate.replace(/\{name\}/g, name));
  }

  if (leaveWhenEmpty && leftId && leftId !== joinedId) {
    const channel = oldState.channel ?? (await oldState.guild.channels.fetch(leftId).catch(() => null));
    if (channel) await maybeLeaveEmpty(channel);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
    return;
  }

  if (interaction.commandName === "join") {
    const channel = interaction.member?.voice?.channel;
    if (!channel) {
      await interaction.reply({ content: "Join a voice channel first, then run /join.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await joinChannel(channel);
    await interaction.editReply({ content: `Joined ${channel.name}.` });
    return;
  }

  if (interaction.commandName === "leave") {
    const session = sessions.get(guild.id);
    if (!session) {
      await interaction.reply({ content: "I'm not in a voice channel here.", ephemeral: true });
      return;
    }
    destroySession(guild.id);
    await interaction.reply({ content: "Disconnected from the voice channel.", ephemeral: true });
    return;
  }

  if (interaction.commandName === "status") {
    const session = sessions.get(guild.id);
    await interaction.reply({
      content: session ? `Connected to <#${session.channelId}>.` : "Not connected to a voice channel.",
      ephemeral: true,
    });
  }
});

client.on("error", (err) => console.error("[bot] error:", err.message));
process.on("unhandledRejection", (err) => console.error("[unhandled]", err));

client.login(token);
