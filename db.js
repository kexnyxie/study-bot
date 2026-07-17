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

  CREATE TABLE IF NOT EXISTS inventory (
    userId TEXT NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER DEFAULT 0,
    PRIMARY KEY (userId, item)
  );
`);

try { db.exec('ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN lastDaily INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN dailyStreak INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN focusMinutesToday INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN focusDate TEXT DEFAULT ''"); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN lastWork INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN xpBoostUntil INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN coffeeBoostActive INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN focusFlameActive INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN luckyFlipsRemaining INTEGER DEFAULT 0'); } catch (e) {}

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
  let finalAmount = amount;

  if (user.xpBoostUntil && Date.now() < user.xpBoostUntil) {
    finalAmount = Math.round(amount * 1.2);
  }

  const newXP = user.xp + finalAmount;
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

function work(userId) {
  const user = getUser(userId);
  const now = Date.now();
  const cooldown = 60 * 60 * 1000;

  if (now - user.lastWork < cooldown) {
    return { success: false, remaining: cooldown - (now - user.lastWork) };
  }

  const earned = Math.floor(Math.random() * 21) + 10;
  db.prepare('UPDATE users SET balance = balance + ?, lastWork = ? WHERE userId = ?').run(earned, now, userId);

  return { success: true, earned };
}

function addToInventory(userId, item, qty = 1) {
  db.prepare(`
    INSERT INTO inventory (userId, item, quantity) VALUES (?, ?, ?)
    ON CONFLICT(userId, item) DO UPDATE SET quantity = quantity + excluded.quantity
  `).run(userId, item, qty);
}

function getInventory(userId) {
  return db.prepare('SELECT * FROM inventory WHERE userId = ? AND quantity > 0').all(userId);
}

function removeFromInventory(userId, item, qty = 1) {
  const row = db.prepare('SELECT quantity FROM inventory WHERE userId = ? AND item = ?').get(userId, item);
  if (!row || row.quantity < qty) return false;
  db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE userId = ? AND item = ?').run(qty, userId, item);
  return true;
}

function buyItem(userId, itemKey, cost) {
  const user = getUser(userId);
  if (user.balance < cost) return { success: false };
  db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
  addToInventory(userId, itemKey, 1);
  return { success: true };
}

function useItem(userId, itemKey) {
  const hasItem = removeFromInventory(userId, itemKey, 1);
  if (!hasItem) return { success: false };

  if (itemKey === 'coffeeboost') {
    db.prepare('UPDATE users SET coffeeBoostActive = 1 WHERE userId = ?').run(userId);
  }
  if (itemKey === 'goldenbook') {
    const boostUntil = Date.now() + (60 * 60 * 1000);
    db.prepare('UPDATE users SET xpBoostUntil = ? WHERE userId = ?').run(boostUntil, userId);
  }
  if (itemKey === 'luckyclover') {
    db.prepare('UPDATE users SET luckyFlipsRemaining = luckyFlipsRemaining + 3 WHERE userId = ?').run(userId);
  }
  if (itemKey === 'focusflame') {
    db.prepare('UPDATE users SET focusFlameActive = 1 WHERE userId = ?').run(userId);
  }

  return { success: true };
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

  let streak;
  let shieldUsed = false;

  if (now - user.lastDaily < twoDays) {
    streak = user.dailyStreak + 1;
  } else {
    shieldUsed = removeFromInventory(userId, 'streakshield', 1);
    streak = shieldUsed ? user.dailyStreak + 1 : 1;
  }

  const reward = 50 + (streak * 5);
  db.prepare('UPDATE users SET balance = balance + ?, lastDaily = ?, dailyStreak = ? WHERE userId = ?')
    .run(reward, now, streak, userId);

  return { success: true, reward, streak, shieldUsed };
}

module.exports = {
  getUser, addXP, getLeaderboard, addTodo, getTodos, completeTodo, deleteTodo,
  claimDaily, getBalance, addBalance, addFocusMinutes, getFocusToday,
  work, buyItem, useItem, getInventory,
};