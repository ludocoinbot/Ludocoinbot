// Real-time multiplayer: create/join rooms, quick-match queue, and an
// authoritative game loop driven by game-engine.js so no client can cheat
// its own dice rolls or moves.

const { Server } = require('socket.io');
const engine = require('./game-engine');
const { verifyInitData } = require('./verifyInitData');

const TURN_TIMEOUT_MS = 25000; // auto-skip a player who goes quiet mid-turn
const ROOM_GONE_GRACE_MS = 90000; // how long a disconnected player's seat is held

function colorsForMode(mode) {
  return mode === 4 ? ['red', 'green', 'yellow', 'blue'] : ['red', 'yellow'];
}
function makeRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function attachMultiplayer(httpServer, { BOT_TOKEN, db }) {
  const io = new Server(httpServer, { cors: { origin: '*' } });

  const rooms = new Map(); // roomId -> room
  const queue = { 2: [], 4: [] }; // waiting sockets per mode
  const uidToRoom = new Map(); // uid -> roomId (for rejoin after disconnect)

  const MP_RANK_REWARDS = {
    2: [400, 100],
    4: [500, 300, 150, 60],
  };

  function publicRoomView(room) {
    return {
      id: room.id,
      mode: room.mode,
      status: room.status,
      players: room.players.map((p) => ({ color: p.color, name: p.name, uid: p.uid, connected: p.connected })),
      state: room.state,
    };
  }
  function broadcastRoom(room) {
    io.to(room.id).emit('room:update', publicRoomView(room));
  }

  function clearTurnTimer(room) {
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  }
  function armTurnTimer(room) {
    clearTurnTimer(room);
    if (!room.state || room.status !== 'playing') return;
    room.turnTimer = setTimeout(() => {
      if (!room.state || room.state.over) return;
      engine.skipTurn(room.state);
      broadcastRoom(room);
      armTurnTimer(room);
    }, TURN_TIMEOUT_MS);
  }

  function newRoom(mode, hostSocket) {
    const id = makeRoomId();
    const room = {
      id,
      mode,
      status: 'waiting',
      players: [{ socketId: hostSocket.id, uid: String(hostSocket.tgUser.id), name: hostSocket.tgUser.first_name || 'Player', color: 'red', connected: true }],
      state: null,
      turnTimer: null,
    };
    rooms.set(id, room);
    return room;
  }

  function startRoom(room) {
    room.status = 'playing';
    room.state = engine.freshGame(room.players.map((p) => p.color));
    armTurnTimer(room);
  }

  async function finishGame(room) {
    clearTurnTimer(room);
    room.status = 'finished';
    const order = room.state.finishOrder; // colors, 1st..last
    const rewardsTable = MP_RANK_REWARDS[room.mode] || [];
    const rewards = {};
    const ranking = order.map((color, i) => {
      const p = room.players.find((pp) => pp.color === color);
      const amount = rewardsTable[i] || 0;
      rewards[color] = amount;
      return { color, name: p ? p.name : color, rank: i + 1, uid: p ? p.uid : null };
    });

    // credit coins server-side (authoritative)
    for (const entry of ranking) {
      if (!entry.uid) continue;
      const user = db.getUser(entry.uid);
      user.coins += rewards[entry.color] || 0;
      user.gamesPlayed += 1;
      if (entry.rank === 1) user.gamesWon += 1;
      await db.saveUser(user);
    }

    io.to(room.id).emit('game:over', { ranking, rewards });
  }

  function removeFromQueues(socket) {
    [2, 4].forEach((m) => {
      queue[m] = queue[m].filter((s) => s.id !== socket.id);
    });
  }

  function leaveRoom(socket, { silent } = {}) {
    removeFromQueues(socket);
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    socket.leave(roomId);
    socket.roomId = null;
    if (!room) return;

    if (room.status === 'waiting') {
      room.players = room.players.filter((p) => p.socketId !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else if (!silent) {
        broadcastRoom(room);
      }
      return;
    }

    // mid-game: mark disconnected, keep their seat for a grace period,
    // and let the turn timer auto-skip their turns in the meantime.
    const p = room.players.find((pp) => pp.socketId === socket.id);
    if (p) p.connected = false;
    if (!silent) broadcastRoom(room);
  }

  io.use((socket, next) => {
    const initData = socket.handshake.auth && socket.handshake.auth.initData;
    const user = verifyInitData(initData, BOT_TOKEN);
    if (!user || !user.id) return next(new Error('unauthorized'));
    socket.tgUser = user;
    next();
  });

  io.on('connection', (socket) => {
    const uid = String(socket.tgUser.id);

    socket.on('room:create', ({ mode }) => {
      mode = mode === 4 ? 4 : 2;
      leaveRoom(socket, { silent: true });
      const room = newRoom(mode, socket);
      socket.join(room.id);
      socket.roomId = room.id;
      uidToRoom.set(uid, room.id);
      socket.emit('room:created', { roomId: room.id });
      broadcastRoom(room);
    });

    socket.on('room:join', ({ roomId }) => {
      const room = rooms.get(String(roomId || '').toUpperCase());
      if (!room) return socket.emit('room:error', { error: 'not_found' });
      if (room.status !== 'waiting') return socket.emit('room:error', { error: 'already_started' });
      const used = room.players.map((p) => p.color);
      const avail = colorsForMode(room.mode).find((c) => !used.includes(c));
      if (!avail) return socket.emit('room:error', { error: 'full' });

      leaveRoom(socket, { silent: true });
      room.players.push({ socketId: socket.id, uid, name: socket.tgUser.first_name || 'Player', color: avail, connected: true });
      socket.join(room.id);
      socket.roomId = room.id;
      uidToRoom.set(uid, room.id);
      socket.emit('room:joined', { roomId: room.id, color: avail });

      if (room.players.length === room.mode) startRoom(room);
      broadcastRoom(room);
    });

    socket.on('room:rejoin', ({ roomId }) => {
      const room = rooms.get(String(roomId || '').toUpperCase());
      if (!room) return socket.emit('room:error', { error: 'not_found' });
      const p = room.players.find((pp) => pp.uid === uid);
      if (!p) return socket.emit('room:error', { error: 'not_found' });
      p.socketId = socket.id;
      p.connected = true;
      socket.join(room.id);
      socket.roomId = room.id;
      uidToRoom.set(uid, room.id);
      broadcastRoom(room);
    });

    socket.on('room:leave', () => leaveRoom(socket));

    socket.on('quick:join', ({ mode }) => {
      mode = mode === 4 ? 4 : 2;
      leaveRoom(socket, { silent: true });
      const q = queue[mode];
      q.push(socket);
      socket.quickMode = mode;
      socket.emit('quick:waiting');

      if (q.length >= mode) {
        const group = q.splice(0, mode);
        const room = newRoom(mode, group[0]);
        group[0].join(room.id);
        group[0].roomId = room.id;
        uidToRoom.set(String(group[0].tgUser.id), room.id);

        for (let i = 1; i < group.length; i++) {
          const s = group[i];
          const used = room.players.map((p) => p.color);
          const avail = colorsForMode(mode).find((c) => !used.includes(c));
          room.players.push({ socketId: s.id, uid: String(s.tgUser.id), name: s.tgUser.first_name || 'Player', color: avail, connected: true });
          s.join(room.id);
          s.roomId = room.id;
          uidToRoom.set(String(s.tgUser.id), room.id);
        }
        startRoom(room);
        broadcastRoom(room);
      }
    });

    socket.on('game:roll', () => {
      const room = rooms.get(socket.roomId);
      if (!room || room.status !== 'playing') return;
      const me = room.players.find((p) => p.socketId === socket.id);
      if (!me || engine.currentColor(room.state) !== me.color) return;
      const result = engine.rollDice(room.state);
      if (result.error) return;
      armTurnTimer(room);
      broadcastRoom(room);
    });

    socket.on('game:move', ({ tokenIdx }) => {
      const room = rooms.get(socket.roomId);
      if (!room || room.status !== 'playing') return;
      const me = room.players.find((p) => p.socketId === socket.id);
      if (!me) return;
      const result = engine.applyMove(room.state, me.color, tokenIdx);
      if (result.error) return;
      if (result.gameOver) {
        broadcastRoom(room);
        finishGame(room);
        return;
      }
      armTurnTimer(room);
      broadcastRoom(room);
    });

    socket.on('disconnect', () => leaveRoom(socket));
  });

  return io;
}

module.exports = { attachMultiplayer };
