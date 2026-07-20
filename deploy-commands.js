require('dotenv').config();
console.log(__filename);
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { SHOP } = require('./shop');

const shopChoices = Object.entries(SHOP).map(([key, item]) => ({
  name: `${item.emoji} ${item.name} — ${item.cost} cakes`,
  value: key,
}));

const commands = [
  new SlashCommandBuilder()
  .setName('pomodoro')
  .setDescription('Start a Pomodoro study session')
  .addIntegerOption(option =>
    option.setName('focus').setDescription('Focus minutes (default 25)').setRequired(false)
  )
  .addIntegerOption(option =>
    option.setName('break').setDescription('Break minutes (default 5)').setRequired(false)
  )
  .addIntegerOption(option =>
    option.setName('cycles').setDescription('Number of cycles (default 1)').setRequired(false)
  ),

    new SlashCommandBuilder()
  .setName('todo')
  .setDescription('Manage your study tasks')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a new task')
      .addStringOption(option =>
        option.setName('task').setDescription('The task you want to add').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('list').setDescription('View all your tasks')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('complete')
      .setDescription('Mark a task as done')
      .addIntegerOption(option =>
        option.setName('id').setDescription('The task ID (from /todo list)').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Delete a task')
      .addIntegerOption(option =>
        option.setName('id').setDescription('The task ID (from /todo list)').setRequired(true)
      )
  ),

  new SlashCommandBuilder()
  .setName('stopstudy')
  .setDescription('Stop your current Pomodoro session'),
  
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show info about this bot and its commands'),
    new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your level and XP'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See the top studiers by XP'),

    new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily cakes'),

new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your cake balance'),

new SlashCommandBuilder()
  .setName('work')
  .setDescription('Earn cakes by working'),

new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Bet cakes on a coin flip')
  .addIntegerOption(option =>
    option.setName('bet').setDescription('How many cakes to bet').setRequired(true)
  )
  .addStringOption(option =>
    option.setName('choice').setDescription('Heads or tails').setRequired(true)
      .addChoices(
        { name: 'Heads', value: 'heads' },
        { name: 'Tails', value: 'tails' },
      )
  ),

  new SlashCommandBuilder()
  .setName('shop')
  .setDescription('View the shop'),

new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Purchase an item from the shop')
  .addStringOption(option =>
    option.setName('item').setDescription('Item to buy').setRequired(true).addChoices(...shopChoices)
  ),

new SlashCommandBuilder()
  .setName('use')
  .setDescription('Use an item from your inventory')
  .addStringOption(option =>
    option.setName('item').setDescription('Item to use').setRequired(true).addChoices(...shopChoices)
  ),

new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('View your items'),

new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View your study profile'),

].map(command => command.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    console.log(commands.map(c => c.name));
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error(error);
  }
})();