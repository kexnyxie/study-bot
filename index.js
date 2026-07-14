require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUser, addXP, getLeaderboard } = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Reaction],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Someone joins the server
client.on('guildMemberAdd', (member) => {
  const channel = member.guild.systemChannel;
  if (!channel) return;
  channel.send(
    `📚 Welcome to the study server, ${member}! Grab a subject role, find a quiet corner, and get to it. Good luck!`
  );
});

// Someone leaves the server
client.on('guildMemberRemove', (member) => {
  const channel = member.guild.systemChannel;
  if (!channel) return;
  channel.send(`👋 ${member.user.username} has left the study session.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'pomodoro') {
    const minutes = interaction.options.getInteger('minutes') || 25;
    await interaction.reply(
      `🍅 Pomodoro started! Focus for **${minutes} minutes**. I'll ping you when it's time for a break.`
    );

    setTimeout(async () => {
      await interaction.followUp(
        `⏰ Time's up, ${interaction.user}! Take a 5-minute break, you earned it.`
      );
    }, minutes * 60 * 1000);
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({
      embeds: [
        {
          color: 0x2f3136,
          title: '📚 Study Bot',
          description: 'A utility bot built for this study server to help with focus and productivity.',
          fields: [
            {
              name: '/pomodoro [minutes]',
              value: 'Start a focus timer. Defaults to 25 minutes if none given.',
            },
            {
              name: '/rank',
              value: 'Check your level and XP.',
            },
            {
              name: '/leaderboard',
              value: 'See the top studiers by XP.',
            },
          ],
          footer: { text: 'Made by Nyx' },
        },
      ],
    });
  }

  if (interaction.commandName === 'rank') {
    const user = getUser(interaction.user.id);
    await interaction.reply(
      `📊 **${interaction.user.username}** — Level ${user.level}, ${user.xp} XP\n(${user.messageCount} messages, ${user.voiceMinutes} VC minutes)`
    );
  }

  if (interaction.commandName === 'leaderboard') {
    const top = getLeaderboard(10);
    const list = top.map((u, i) => `${i + 1}. <@${u.userId}> — Level ${u.level} (${u.xp} XP)`).join('\n');
    await interaction.reply(list || 'No data yet!');
  }
});

// Message XP (with 60s cooldown per user to prevent spam farming)
const messageCooldowns = new Map();

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const last = messageCooldowns.get(message.author.id);
  const now = Date.now();
  if (last && now - last < 60000) return;
  messageCooldowns.set(message.author.id, now);

  const result = addXP(message.author.id, 5, 'message');
  if (result.leveledUp) {
    message.channel.send(`🎉 ${message.author} leveled up to **Level ${result.newLevel}**!`);
  }
});

// Reaction XP
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }

  const result = addXP(user.id, 2, 'reaction');
  if (result.leveledUp) {
    reaction.message.channel.send(`🎉 <@${user.id}> leveled up to **Level ${result.newLevel}**!`);
  }
});

// Voice channel time tracking
const voiceJoinTimes = new Map();

client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;

  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(userId, Date.now());
  }

  if (oldState.channelId && !newState.channelId) {
    const joinTime = voiceJoinTimes.get(userId);
    if (joinTime) {
      const minutes = Math.floor((Date.now() - joinTime) / 60000);
      voiceJoinTimes.delete(userId);
      if (minutes > 0) addXP(userId, minutes, 'voice');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);