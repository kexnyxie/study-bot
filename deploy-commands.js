require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('pomodoro')
    .setDescription('Start a Pomodoro study timer')
    .addIntegerOption(option =>
      option.setName('minutes')
        .setDescription('Length of the focus session (default 25)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show info about this bot and its commands'),
    new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your level and XP'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See the top studiers by XP'),

].map(command => command.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error(error);
  }
})();