require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const db = require('./db');
const { verifyInitData } = require('./verifyInitData');
const { bot, isChatMember } = require('./bot');
const { attachMultiplayer } = require('./rooms');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

const REWARDS = { tokenFinish: 15, winSmall: 300, winBig: 500, participation: 25 };
const TASK_REWARDS = { yt_sub: 200, yt_view: 100, tg_group: 200, tg_chan: 200, tk_follow: 200, daily: 30 };
const TASK_IDS = Object.keys(TASK_REWARDS);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Every /api request must carry a valid Telegram WebApp initData string,
// proving it really came from Telegram for the user it claims to be.
function authUser(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const authedUser = verifyInitData(initData, BOT_TOKEN);
  if (!authedUser || !authedUser.id) {
    return res.status(401).json({ error: 'invalid_init_data' });
  }
  req.tgUser = authedUser;
  next();
}

app.get('/api/state', authUser, (req, res) => {
  const user = db.getUser(req.tgUser.id);
  res.json({ coins: user.coins, gamesPlayed: user.gamesPlayed, gamesWon: user.gamesWon });
});

app.get('/api/tasks', authUser, (req, res) => {
  const uid = String(req.tgUser.id);
  const todayKey = new Date().toISOString().slice(0, 10);
  const status = {};
  TASK_IDS.forEach((id) => {
    const dailyKey = id === 'daily' ? todayKey : null;
    status[id] = db.hasClaimedTask(uid, id, dailyKey);
  });
  res.json(status);
});

app.post('/api/task/claim', authUser, async (req, res) => {
  const uid = String(req.tgUser.id);
  const { taskId } = req.body || {};
  if (!TASK_REWARDS[taskId]) return res.status(400).json({ error: 'unknown_task' });

  const todayKey = new Date().toISOString().slice(0, 10);
  const dailyKey = taskId === 'daily' ? todayKey : null;

  if (db.hasClaimedTask(uid, taskId, dailyKey)) {
    return res.status(409).json({ error: 'already_claimed' });
  }

  // Server-side verification where it's actually possible.
  if (taskId === 'tg_group') {
    if (!TELEGRAM_GROUP_ID) return res.status(500).json({ error: 'group_not_configured' });
    const ok = await isChatMember(TELEGRAM_GROUP_ID, uid);
    if (!ok) return res.status(403).json({ error: 'not_a_member' });
  }
  if (taskId === 'tg_chan') {
    if (!TELEGRAM_CHANNEL_ID) return res.status(500).json({ error: 'channel_not_configured' });
    const ok = await isChatMember(TELEGRAM_CHANNEL_ID, uid);
    if (!ok) return res.status(403).json({ error: 'not_a_member' });
  }
  // yt_sub / yt_view / daily: Telegram/YouTube expose no reliable way to check
  // this server-side without each user granting YouTube OAuth access, so these
  // stay honor-system — but the one-claim-per-task(-per-day) check above still
  // stops the same task from being claimed twice.

  const user = db.getUser(uid);
  user.coins += TASK_REWARDS[taskId];
  await db.saveUser(user);
  await db.markClaimed(uid, taskId, dailyKey);
  res.json({ coins: user.coins, awarded: TASK_REWARDS[taskId] });
});

app.post('/api/game/finish', authUser, async (req, res) => {
  const uid = String(req.tgUser.id);
  const { won, mode, tokensFinished } = req.body || {};

  const user = db.getUser(uid);
  user.gamesPlayed += 1;
  if (won) user.gamesWon += 1;

  const finished = Math.min(Math.max(parseInt(tokensFinished, 10) || 0, 0), 4);
  const finishBonus = finished * REWARDS.tokenFinish;
  const winBonus = won ? (mode === 2 ? REWARDS.winSmall : REWARDS.winBig) : REWARDS.participation;
  const awarded = finishBonus + winBonus;

  user.coins += awarded;
  await db.saveUser(user);
  res.json({ coins: user.coins, awarded });
});

const httpServer = http.createServer(app);
attachMultiplayer(httpServer, { BOT_TOKEN, db });

httpServer.listen(PORT, () => console.log(`Ludo Coin API + multiplayer listening on :${PORT}`));

bot
  .launch()
  .then(() => console.log('✅ Bot polling started'))
  .catch((e) => console.error('❌ Bot failed to start — check BOT_TOKEN in .env:', e.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
