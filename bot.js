require('dotenv').config();
const { Telegraf } = require('telegraf');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN || BOT_TOKEN.includes('Example')) {
  console.error('❌ BOT_TOKEN is missing/placeholder. Get a real one from @BotFather and put it in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  const user = db.getUser(uid);

  // referral bonus: /start ref_<inviterId>
  const payload = ctx.startPayload;
  if (payload && payload.startsWith('ref_') && !user.referredBy) {
    const refId = payload.slice(4);
    if (refId && refId !== uid) {
      user.referredBy = refId;
      await db.saveUser(user);
      const refUser = db.getUser(refId);
      refUser.coins += 100;
      await db.saveUser(refUser);
      try {
        await bot.telegram.sendMessage(refId, '🎉 አንድ ጓደኛ በሊንክዎ ተቀላቅሏል! +100 LUDO ተጨምሮልዎታል።');
      } catch (e) {
        /* inviter may have blocked the bot — ignore */
      }
    }
  }

  await ctx.reply(
    'እንኳን ወደ Ludo Coin በደህና መጡ! 🎲🪙\nሉዶ ተጫውተው እና ተግባራት ሰርተው ሳንቲም ያግኙ።',
    WEBAPP_URL
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: '▶️ Ludo Coin ክፈት', web_app: { url: WEBAPP_URL } }]],
          },
        }
      : undefined
  );
});

// Used by server.js to verify "join group / join channel" tasks.
async function isChatMember(chatId, userId) {
  try {
    const member = await bot.telegram.getChatMember(chatId, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) {
    console.error(`getChatMember(${chatId}, ${userId}) failed:`, e.description || e.message);
    return false;
  }
}

module.exports = { bot, isChatMember };
