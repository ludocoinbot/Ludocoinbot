// Minimal file-based database — no native modules required, works on any
// Node host. Fine for a small/medium user base. If you outgrow it, swap
// this file for a real database (Postgres, etc.) without touching server.js
// or bot.js, since they only call the functions exported below.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

function loadRaw() {
  if (!fs.existsSync(DB_PATH)) {
    return { users: {}, taskClaims: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('data.json was unreadable, starting fresh:', e.message);
    return { users: {}, taskClaims: {} };
  }
}

const data = loadRaw();
let writeQueue = Promise.resolve();

// Writes are queued so two near-simultaneous requests never clobber
// each other's changes to data.json.
function persist() {
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve) => {
        fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), (err) => {
          if (err) console.error('DB write error:', err);
          resolve();
        });
      })
  );
  return writeQueue;
}

function getUser(uid) {
  uid = String(uid);
  if (!data.users[uid]) {
    data.users[uid] = {
      id: uid,
      coins: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      referredBy: null,
      createdAt: Date.now(),
    };
  }
  return data.users[uid];
}

function saveUser(user) {
  data.users[String(user.id)] = user;
  return persist();
}

function claimKey(uid, taskId, dailyKey) {
  return dailyKey ? `${uid}:${taskId}:${dailyKey}` : `${uid}:${taskId}`;
}

function hasClaimedTask(uid, taskId, dailyKey) {
  return !!data.taskClaims[claimKey(uid, taskId, dailyKey)];
}

function markClaimed(uid, taskId, dailyKey) {
  data.taskClaims[claimKey(uid, taskId, dailyKey)] = {
    uid,
    taskId,
    at: Date.now(),
  };
  return persist();
}

module.exports = { getUser, saveUser, hasClaimedTask, markClaimed };
