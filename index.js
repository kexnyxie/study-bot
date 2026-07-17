require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { SHOP } = require('./shop');
const { getUser, addXP, getLeaderboard, addTodo, getTodos, completeTodo, deleteTodo, claimDaily, getBalance, addBalance, addFocusMinutes, getFocusToday, work, buyItem, useItem, getInventory } = require('./db');
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
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

const activeSessions = new Map(); // userId -> { timeoutId, stopped }
const messageCooldowns = new Map();
const voiceJoinTimes = new Map();

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function progressBar(current, total) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round(percent / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${percent}%`;
}

function runPomodoroCycle(channel, user, cycleNum, totalCycles, focusMin, breakMin, session) {
  session.timeoutId = setTimeout(() => {
    if (session.stopped) return;

    const totalToday = addFocusMinutes(user.id, focusMin);
    addXP(user.id, 25, 'pomodoro');

    channel.send({
      embeds: [{
        color: 0x2f3136,
        title: 'Great work! 🎉',
        description: `+25 XP\nTotal focus today: **${formatMinutes(totalToday)}**\nCycle ${cycleNum}/${totalCycles} complete`,
      }],
    });

    if (cycleNum < totalCycles) {
      channel.send(`☕ ${user}, break time! Relax for **${breakMin} minutes**.`);
      session.timeoutId = setTimeout(() => {
        if (session.stopped) return;

        channel.send({
          embeds: [{
            color: 0x2f3136,
            title: '🍅 Next Cycle Started',
            description: `${focusMin} min Focus\nCycle ${cycleNum + 1}/${totalCycles}\n\nProgress:\n${progressBar(cycleNum, totalCycles)}`,
          }],
        });
        runPomodoroCycle(channel, user, cycleNum + 1, totalCycles, focusMin, breakMin, session);
      }, breakMin * 60 * 1000);
    } else {
      channel.send(`🏁 ${user}, all **${totalCycles} cycles** complete! Amazing focus session today.`);
      activeSessions.delete(user.id);
    }
  }, focusMin * 60 * 1000);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', (member) => {
  const channel = member.guild.systemChannel;
  if (!channel) return;
  channel.send(
    `📚 Welcome to the study server, ${member}! Grab a subject role, find a quiet corner, and get to it. Good luck!`
  );
});

client.on('guildMemberRemove', (member) => {
  const channel = member.guild.systemChannel;
  if (!channel) return;
  channel.send(`👋 ${member.user.username} has left the study session.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'todo') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const task = interaction.options.getString('task');
      const id = addTodo(interaction.user.id, task);
      await interaction.reply(`✅ Added task #${id}: "${task}"`);
    }

    if (sub === 'list') {
      const todos = getTodos(interaction.user.id);
      if (todos.length === 0) {
        await interaction.reply('📋 You have no tasks yet. Add one with `/todo add`.');
      } else {
        const list = todos
          .map(t => `${t.completed ? '✅' : '⬜'} **#${t.id}** ${t.task}`)
          .join('\n');
        await interaction.reply(`📋 **Your tasks:**\n${list}`);
      }
    }

    if (sub === 'complete') {
      const id = interaction.options.getInteger('id');
      completeTodo(interaction.user.id, id);
      await interaction.reply(`🎉 Marked task #${id} as complete!`);
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      deleteTodo(interaction.user.id, id);
      await interaction.reply(`🗑️ Removed task #${id}.`);
    }
  }

  if (interaction.commandName === 'daily') {
    const result = claimDaily(interaction.user.id);

    if (!result.success) {
      const hours = Math.ceil(result.remaining / (60 * 60 * 1000));
      await interaction.reply(`⏳ Already claimed today! Come back in about ${hours}h.`);
    } else {
      await interaction.reply(
        `<:yummycake:1521406870869246053> You got your daily **${result.reward} cakes**!! Daily streak: **${result.streak} days** 🔥`
      );
    }
  }

  if (interaction.commandName === 'work') {
    const result = work(interaction.user.id);
    if (!result.success) {
      const mins = Math.ceil(result.remaining / 60000);
      await interaction.reply(`⏳ You're still tired from work! Try again in ${mins} min.`);
    } else {
      await interaction.reply(`💼 You worked hard and earned <:yummycake:1521406870869246053> **${result.earned} cakes**!`);
    }
  }
if (interaction.commandName === 'shop') {
    const fields = Object.values(SHOP).map(item => ({
      name: `${item.emoji} ${item.name} — ${item.cost} cakes`,
      value: item.description,
    }));
    await interaction.reply({ embeds: [{ color: 0x2f3136, title: '🛒 Shop', fields }] });
  }

  if (interaction.commandName === 'buy') {
    const key = interaction.options.getString('item');
    const product = SHOP[key];
    if (!product) { await interaction.reply('❌ Unknown item.'); return; }

    const result = buyItem(interaction.user.id, key, product.cost);
    await interaction.reply(
      result.success
        ? `${product.emoji} Bought **${product.name}**! Use \`/use item:${key}\` to activate it.`
        : `❌ Not enough cakes (need ${product.cost}).`
    );
  }

  if (interaction.commandName === 'use') {
    const key = interaction.options.getString('item');
    const product = SHOP[key];
    if (!product) { await interaction.reply('❌ Unknown item.'); return; }

    const result = useItem(interaction.user.id, key);
    await interaction.reply(
      result.success
        ? `${product.emoji} **${product.name}** activated!`
        : `❌ You don't own that item. Buy it first with \`/buy\`.`
    );
  }

  if (interaction.commandName === 'inventory') {
    const items = getInventory(interaction.user.id);
    if (items.length === 0) {
      await interaction.reply('🎒 Your inventory is empty. Visit `/shop` to buy something!');
    } else {
      const list = items.map(i => `${SHOP[i.item]?.emoji || '📦'} ${SHOP[i.item]?.name || i.item} x${i.quantity}`).join('\n');
      await interaction.reply(`🎒 **Inventory**\n${list}`);
    }
  }

  if (interaction.commandName === 'balance') {
    const balance = getBalance(interaction.user.id);
    await interaction.reply(`<:yummycake:1521406870869246053> **${interaction.user.username}** has **${balance} cakes**.`);
  }

  if (interaction.commandName === 'coinflip') {
    const bet = interaction.options.getInteger('bet');
    const choice = interaction.options.getString('choice');
    const balance = getBalance(interaction.user.id);

    if (bet <= 0) {
      await interaction.reply('❌ Bet must be more than 0 cakes.');
      return;
    }
    if (bet > balance) {
      await interaction.reply(`❌ You only have ${balance} cakes.`);
      return;
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === choice;

    addBalance(interaction.user.id, won ? bet : -bet);

    await interaction.reply(
      won
        ? `<:yummycake:1521406870869246053> It landed on **${result}**! You won **${bet} cakes**! Your new balance is **${getBalance(interaction.user.id)} cakes**.`
        : `<:yummycake:1521406870869246053> It landed on **${result}**. You lost **${bet} cakes**. Better luck next time!`
    );
  }

  if (interaction.commandName === 'pomodoro') {
    if (activeSessions.has(interaction.user.id)) {
      await interaction.reply('⚠️ You already have an active Pomodoro session. Use `/stopstudy` to end it first.');
      return;
    }

    const focusMin = interaction.options.getInteger('focus') || 25;
    const breakMin = interaction.options.getInteger('break') || 5;
    const cycles = interaction.options.getInteger('cycles') || 1;
    const todayFocus = getFocusToday(interaction.user.id);

    await interaction.reply({
      embeds: [{
        color: 0x2f3136,
        title: '🍅 Session Started',
        description: `${focusMin} min Focus\n${breakMin} min Break\nRepeat: ${cycles} cycle${cycles > 1 ? 's' : ''}`,
        fields: [
          { name: 'Progress', value: progressBar(0, cycles) },
          { name: "Today's Focus", value: formatMinutes(todayFocus) },
        ],
      }],
    });

    const session = { timeoutId: null, stopped: false };
    activeSessions.set(interaction.user.id, session);
    runPomodoroCycle(interaction.channel, interaction.user, 1, cycles, focusMin, breakMin, session);
  }

  if (interaction.commandName === 'stopstudy') {
    const session = activeSessions.get(interaction.user.id);
    if (!session) {
      await interaction.reply("You don't have an active Pomodoro session.");
      return;
    }

    clearTimeout(session.timeoutId);
    session.stopped = true;
    activeSessions.delete(interaction.user.id);
    await interaction.reply('🛑 Your Pomodoro session has been stopped.');
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({
      embeds: [
        {
          color: 0x2f3136,
          title: '📚 Study Bot',
          description: 'A utility bot built for this study server to help with focus and productivity.',
          fields: [
            { name: '/pomodoro [focus] [break] [cycles]', value: 'Start a focus session.' },
            { name: '/stopstudy', value: 'Stop your current Pomodoro session.' },
            { name: '/rank', value: 'Check your level and XP.' },
            { name: '/leaderboard', value: 'See the top studiers by XP.' },
            { name: '/daily', value: 'Claim your daily cakes.' },
            { name: '/work', value: 'Earn cakes (hourly cooldown).' },
            { name: '/balance', value: 'Check your cake balance.' },
            { name: '/coinflip [bet] [choice]', value: 'Bet cakes on a coin flip.' },
            { name: '/shop', value: 'View items you can buy with cakes.' },
            { name: '/buy [item]', value: 'Purchase an item from the shop.' },
            { name: '/use [item]', value: 'Use an item from your inventory.' },
            { name: '/inventory', value: 'View your owned items.' },
            { name: '/todo add/list/complete/remove', value: 'Manage your study tasks.' },
          ],
          footer: { text: 'Study Bot by kexyie', icon_url: client.user.displayAvatarURL() },
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