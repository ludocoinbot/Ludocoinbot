# Ludo Coin — Telegram Bot + Mini App

ሙሉ ኮድ ተዘጋጅቷል፡ ቦት (bot.js)፣ API server (server.js)፣ database (db.js)፣
security check (verifyInitData.js)፣ እና ጨዋታው ራሱ (public/index.html)።

**እኔ ማድረግ የማልችለው ብቻ** (ይህ ኮድ ሩጫ ላይ ካለው internet-less sandbox ውጪ፣ የእርስዎን
Telegram አካውንት/hosting account የሚያስፈልገው ስለሆነ)፡ bot መፍጠር፣ deploy ማድረግ፣
environment variables ማስገባት። ከታች ያለውን 10-ደቂቃ checklist ብቻ ይከተሉ።

---

## 1. Bot ይፍጠሩ (2 ደቂቃ)

1. Telegram ላይ **@BotFather**ን ይክፈቱ
2. `/newbot` ይላኩ → ስም እና username ይስጡት (ለምሳሌ `LudoCoinBot`)
3. የሚሰጥዎትን **token** ይቅዱ (ይህን ለማንም አያካፍሉ)

## 2. Group / Channel ID ያግኙ (ለ"ይቀላቀሉ" ተግባራት ብቻ አስፈላጊ)

1. Bot ያዘጋጁት group/channel ውስጥ **admin** አድርገው ይጨምሩት
2. ጊዜያዊ በ **@userinfobot**ን ወደ group/channel ይጨምሩ → የቁጥር ID ያሳይዎታል (ከ`-100` የሚጀምር)
3. ያንን ID ይቅዱ፣ ከዚያ @userinfobot ማስወገድ ይችላሉ

(ይህን ካልፈለጉ `tg_group`/`tg_chan` ተግባራትን ከ`public/index.html` ውስጥ `TASK_CONFIG` ላይ ማጥፋት ይችላሉ።)

## 3. Environment ያዘጋጁ

```bash
cp .env.example .env
```

`.env`ን ይክፈቱ እና፡
- `BOT_TOKEN` → ከBotFather የተቀበሉት
- `TELEGRAM_GROUP_ID` / `TELEGRAM_CHANNEL_ID` → ከደረጃ 2
- `WEBAPP_URL` → በደረጃ 5 ላይ የሚያገኙት URL (ለአሁን ባዶ ይተውት)

## 4. በኮምፒውተርዎ ላይ ይሞክሩ (አማራጭ ግን ይመከራል)

```bash
npm install
npm start
```

Terminal ላይ `✅ Bot polling started` ብቅ ካለ ስራ ላይ ነው። Telegram ላይ bot's ስም ፈልገው
`/start` ይላኩ — ምላሽ ሊሰጥዎት ይገባል።

## 5. Deploy ያድርጉ (ነፃ አማራጭ: Render.com)

1. ይህን ፎልደር ወደ GitHub repo ይግፉት (push)
2. [render.com](https://render.com) → New → **Web Service** → repo ይምረጡ
3. Build command: `npm install`   |   Start command: `npm start`
4. "Environment" ስር ከ`.env` ውስጥ ያሉትን ሁሉ variable በእጅ ያስገቡ
5. Deploy ሲጨርስ የሚሰጥዎትን URL (`https://xxxx.onrender.com`) ይቅዱ
6. ወደ `.env`/Render environment ተመልሰው `WEBAPP_URL`ን በዚያ URL ይተኩ → **Manual Deploy** በድጋሚ ያድርጉ

> ⚠️ Render's free tier disk resets on redeploy, ስለዚህ `data.json` (ሳንቲም/ተግባራት)
> ጊዜያዊ ብቻ ነው የሚቆየው። ለቋሚ ማከማቻ Render's paid persistent disk ወይም Railway/Fly.io
> ይምረጡ፣ ወይም `db.js`ን በኋላ ላይ ወደ እውነተኛ Postgres/MongoDB ይቀይሩ (ሌሎቹ ፋይሎች
> ምንም መቀየር አያስፈልጋቸውም — db.js ውስጥ ያለውን 4 function interface ብቻ ይጠብቁ)።

## 6. Menu Button ያገናኙ

@BotFather → `/mybots` → bot ይምረጡ → **Bot Settings → Menu Button** → የ`WEBAPP_URL`ን
ያስገቡ። አሁን ተጠቃሚዎች bot ሲከፍቱ ጨዋታውን በቀጥታ ማየት ይችላሉ (ወይም `/start` ሲልኩ
የሚላከው አዝራርንም መጠቀም ይችላሉ)።

---

## ፋይሎች ምን እንደሚያደርጉ

| ፋይል | ስራ |
|---|---|
| `bot.js` | `/start` ትዕዛዝ፣ referral bonus፣ group/channel membership ማረጋገጫ |
| `server.js` | API endpoints (`/api/state`, `/api/tasks`, `/api/task/claim`, `/api/game/finish`) + Socket.IO server |
| `rooms.js` | **ኦንላይን multiplayer** — ክፍል መፍጠር/መቀላቀል፣ ፈጣን ግጥሚያ (matchmaking)፣ authoritative game loop፣ 1ኛ/2ኛ/3ኛ/4ኛ ደረጃ ሽልማት |
| `game-engine.js` | ንፁህ የሉዶ ህግጋት (ዳይስ፣ እንቅስቃሴ፣ መያዝ/capture፣ ደረጃ አሰጣጥ) — በሰርቨር (ኦንላይን ጨዋታ) እና በብራውዘር (ኦፍላይን vs ቦት UI helper) ሁለቱም ጋር ጥቅም ላይ ይውላል |
| `verifyInitData.js` | እያንዳንዱ request/socket connection በእውነት ከTelegram እና ከዚያ ተጠቃሚ እንደመጣ ያረጋግጣል |
| `db.js` | ተጠቃሚ ሳንቲም/ውጤት የሚያስቀምጥ ቀላል JSON ፋይል ዳታቤዝ |
| `public/index.html` | ራሱ ጨዋታው (frontend) — ኦፍላይን vs ቦት እና ኦንላይን multiplayer ሁለቱም ይዟል |

## 🌐 ኦንላይን Multiplayer (በተለያዩ ስልኮች መካከል)

አዲስ ተጨምሯል — “🌐 ኦንላይን” ትር ውስጥ ሁለት አማራጭ አለ፦

- **⚡ ፈጣን ግጥሚያ** — ተጠቃሚው አዝራሩን ሲነካ በተመሳሳይ ጊዜ የሚፈልጉ ሌሎች ተጫዋቾች ካሉ ወዲያውኑ በራስ-ሰር ይጣመራሉ (2 ወይም 4 ሰው)። ማንም ካልተገኘ "ግጥሚያ በመፈለግ ላይ..." ብሎ ይጠብቃል፣ ሌላ ሰው ሲገባ ወዲያውኑ ጨዋታው ይጀምራል።
- **➕ ክፍል ፍጠር / 🔑 በኮድ ግባ** — 6-ፊደል ኮድ ተፈጥሮ ለጓደኞችዎ ይላካሉ፣ እነሱ ኮዱን አስገብተው ይቀላቀላሉ።

**ደረጃ-ተኮር ሽልማት (ውድድር)** — ጨዋታው የሚያልቀው ሁሉም ተጫዋቾች (ከመጨረሻው በስተቀር) ሁሉንም ቁራጮቻቸውን ወደ ቤት ካደረሱ በኋላ ነው (እንደ እውነተኛ ሉዶ)፦

| ደረጃ | 2-ተጫዋች ሽልማት | 4-ተጫዋች ሽልማት |
|---|---|---|
| 🥇 1ኛ | 400 🪙 | 500 🪙 |
| 🥈 2ኛ | 100 🪙 | 300 🪙 |
| 🥉 3ኛ | — | 150 🪙 |
| 4ኛ | — | 60 🪙 |

ይህ ሙሉ በሙሉ **server-side authoritative** ነው፦ ዳይስ፣ እንቅስቃሴ፣ ሽልማት ሁሉም በሰርቨር (`rooms.js` + `game-engine.js`) ላይ ብቻ ይሰላሉ — ስለዚህ አንድ ተጫዋች የራሱን ስልክ አፕ አርትዖት አድርጎ ሊያታልል አይችልም። ተጫዋች ግንኙነት ቢቋረጥ 25 ሰከንድ ካለፈ በኋላ ተራው በራስ-ሰር ይለፋል (ጨዋታው እንዳይቆም)።

**የታወቁ ገደቦች** (እውነት ለመናገር)፦ ብዙ Telegram አካውንት ከፍቶ ራስን ማጭበርበር (multi-accounting) መከላከያ የለውም፤ ትልቅ ካደገ phone-number ማረጋገጫ ወይም rate-limiting መጨመር ያስፈልጋል። እንዲሁም አሁን ያለው `data.json` ማከማቻ ለብዙ ሺ ተጠቃሚ በአንድ ጊዜ የሚስማማ ስላልሆነ ትልቅ ካደገ ወደ እውነተኛ ዳታቤዝ (Postgres) መቀየር ይመከራል (`db.js`ን ብቻ መቀየር በቂ ነው)።

## 🎵 TikTok ተግባር ተጨምሯል

ከYouTube/Telegram ጎን TikTok follow ተግባርም ተጨምሯል (+200 🪙)። ሁሉም social-media ተግባራት ሽልማት ጨምሯል፦ YouTube subscribe/view, Telegram group/channel, TikTok follow ሁሉም 200/100 🪙 ሆነዋል (ከዚህ በፊት 150/80 ነበር)። በ`CONFIG.TIKTOK_URL` (public/index.html አናት ላይ) ትክክለኛውን የTikTok ሊንክዎን ያስገቡ።

## አስፈላጊ ገደቦች (እውነት ለመናገር)

- **YouTube subscribe/view ማረጋገጫ የለም** — YouTube ይፋዊ API ያለ እያንዳንዱ ተጠቃሚ OAuth
  ፈቃድ "ተመዝግቧል" ብሎ ማረጋገጥ አይፈቅድም። እነዚያ ተግባራት honor-system ናቸው (አንድ ጊዜ ብቻ
  claim ማድረግ ቢቻልም እውነት ማድረጋቸውን ማረጋገጥ አይቻልም)።
- **Telegram group/channel ግን በእውነት ይረጋገጣል** (bot's `getChatMember` በኩል)።
- **Anti-multi-account የለም** — አንድ ሰው ብዙ Telegram አካውንት ከፍቶ bot ደጋግሞ መጠቀም ይችላል።
  ትልቅ ሲሆን phone-number verification ወይም rate-limiting መጨመር ያስፈልጋል።
- ይህ ውስጣዊ ነጥብ (in-app coin) ብቻ ነው፣ እውነተኛ crypto/blockchain token አይደለም። ወደ
  እውነተኛ TON token መቀየር የተለየ ትልቅ ስራ ነው (tokenomics, smart contract, ህጋዊ ተገዢነት) —
  ከፈለጉ ለብቻው እንነጋገርበት።
