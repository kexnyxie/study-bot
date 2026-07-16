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
try { db.exec('ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN lastDaily INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN dailyStreak INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN focusMinutesToday INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN focusDate TEXT DEFAULT ''"); } catch (e) {}

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

function addTodo(userId, task) {
  const result = db.prepare('INSERT INTO todos (userId, task) VALUES (?, ?)').run(userId, task);
  return result.lastInsertRowid;
}

function getTodos(userId) {
  return db.prepare('SELECT * FROM todos WHERE userId = ? ORDER BY id').all(userId);
}

function completeTodo(userId, id) {
  return db.prepare('UPDATE todos SET completed = 1 WHERE id = ? AND userId = ?').run(id, userId);
}

function deleteTodo(userId, id) {
  return db.prepare('DELETE FROM todos WHERE id = ? AND userId = ?').run(id, userId);
}

function claimDaily(userId) {
  const user = getUser(userId);
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const twoDays = 48 * 60 * 60 * 1000;

  if (now - user.lastDaily < oneDay) {
    const remaining = oneDay - (now - user.lastDaily);
    return { success: false, remaining };
  }

  const streak = (now - user.lastDaily < twoDays) ? user.dailyStreak + 1 : 1;
  const reward = 50 + (streak * 5); // base 50, +5 per streak day

  db.prepare('UPDATE users SET balance = balance + ?, lastDaily = ?, dailyStreak = ? WHERE userId = ?')
    .run(reward, now, streak, userId);

  return { success: true, reward, streak };
}

function getBalance(userId) {
  return getUser(userId).balance;
}

function addBalance(userId, amount) {
  db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(amount, userId);
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function addFocusMinutes(userId, minutes) {
  const user = getUser(userId);
  const today = getTodayDateString();
  const total = user.focusDate === today ? user.focusMinutesToday + minutes : minutes;
  db.prepare('UPDATE users SET focusMinutesToday = ?, focusDate = ? WHERE userId = ?').run(total, today, userId);
  return total;
}

function getFocusToday(userId) {
  const user = getUser(userId);
  return user.focusDate === getTodayDateString() ? user.focusMinutesToday : 0;
}

module.exports = {
  getUser,
  addXP,
  getLeaderboard,
  addTodo,
  getTodos,
  completeTodo,
  deleteTodo,
  claimDaily,
  getBalance,
  addBalance,
  addFocusMinutes,
  getFocusToday,
};