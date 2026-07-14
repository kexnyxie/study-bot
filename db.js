const Database = require('better-sqlite3');
const db = new Database('leveling.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    messageCount INTEGER DEFAULT 0,
    voiceMinutes INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    task TEXT NOT NULL,
    completed INTEGER DEFAULT 0
  );
`);

function getUser(userId) {
  let user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
  if (!user) {
    db.prepare('INSERT INTO users (userId) VALUES (?)').run(userId);
    user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
  }
  return user;
}

function addXP(userId, amount, type) {
  const user = getUser(userId);
  const newXP = user.xp + amount;
  const newLevel = Math.floor(newXP / 100) + 1;
  const leveledUp = newLevel > user.level;

  let query = 'UPDATE users SET xp = ?, level = ?';
  const params = [newXP, newLevel];

  if (type === 'message') query += ', messageCount = messageCount + 1';
  if (type === 'voice') {
    query += ', voiceMinutes = voiceMinutes + ?';
    params.push(amount);
  }

  query += ' WHERE userId = ?';
  params.push(userId);
  db.prepare(query).run(...params);

  return { newXP, newLevel, leveledUp };
}

function getLeaderboard(limit = 10) {
  return db.prepare('SELECT * FROM users ORDER BY xp DESC LIMIT ?').all(limit);
}

module.exports = { 
  getUser, 
  addXP, 
  getLeaderboard,
  addTodo
};
function addTodo(userId, task) {
  const result = db.prepare(
    'INSERT INTO todos (userId, task) VALUES (?, ?)'
  ).run(userId, task);

  return result.lastInsertRowid;
}