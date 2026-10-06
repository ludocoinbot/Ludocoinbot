// LudoEngine — pure game rules, no I/O. Works in Node (require) and in the
// browser (window.LudoEngine) via the UMD wrapper below.
//
// This is the SAME board math already used by the offline vs-bot mode in
// public/index.html (48-cell ring, start offsets, 45 common steps + 5 home
// stretch steps, finish at step 50) — kept identical so both modes look and
// feel the same to a player.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LudoEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const COLORS = ['red', 'green', 'yellow', 'blue'];
  const RING_LEN = 48;
  const RING_STEPS = 45; // relative steps 0..44 travel the shared ring
  const FINISH_R = 50;   // relative step at which a token is "home"
  const START_IDX = { red: 1, green: 13, yellow: 25, blue: 37 };
  const SAFE_GLOBAL = new Set(Object.values(START_IDX));

  function buildRing() {
    const c = [];
    for (let col = 0; col <= 12; col++) c.push([0, col]);
    for (let row = 1; row <= 12; row++) c.push([row, 12]);
    for (let col = 11; col >= 0; col--) c.push([12, col]);
    for (let row = 11; row >= 1; row--) c.push([row, 0]);
    return c; // 48 cells
  }
  const RING = buildRing();

  function globalIndexFor(color, r) {
    return (START_IDX[color] + r) % RING_LEN;
  }

  function freshGame(activeColors) {
    const tokens = {};
    COLORS.forEach((c) => {
      tokens[c] = [-1, -1, -1, -1]; // -1 = in yard
    });
    return {
      active: activeColors.slice(),
      tokens,
      turnIdx: 0,
      dice: null,
      consecutiveSixes: 0,
      awaitingPick: false,
      movable: [],
      finishOrder: [], // colors in the order they got ALL 4 tokens home (ranking)
      over: false,
      winner: null,
    };
  }

  function currentColor(game) {
    return game.active[game.turnIdx];
  }

  function movesFor(game, color, dice) {
    const list = [];
    game.tokens[color].forEach((r, idx) => {
      if (r === -1) {
        if (dice === 6) list.push(idx);
        return;
      }
      if (r >= FINISH_R) return;
      if (r + dice <= FINISH_R) list.push(idx);
    });
    return list;
  }

  // Rolls for whoever's turn it currently is. Returns info about the roll;
  // if nobody can move, the turn is auto-advanced immediately.
  function rollDice(game) {
    if (game.over) return { error: 'game_over' };
    if (game.awaitingPick) return { error: 'must_move_first' };
    const color = currentColor(game);
    const dice = 1 + Math.floor(Math.random() * 6);
    const moves = movesFor(game, color, dice);
    game.dice = dice;
    if (dice === 6) game.consecutiveSixes++;
    else game.consecutiveSixes = 0;

    if (moves.length === 0) {
      game.awaitingPick = false;
      game.movable = [];
      advanceTurn(game, dice);
      return { dice, moves: [], autoPassed: true };
    }
    game.awaitingPick = true;
    game.movable = moves;
    return { dice, moves, autoPassed: false };
  }

  function applyMove(game, color, tokenIdx) {
    if (game.over) return { error: 'game_over' };
    if (currentColor(game) !== color) return { error: 'not_your_turn' };
    if (!game.awaitingPick || !game.movable.includes(tokenIdx)) {
      return { error: 'invalid_move' };
    }
    const dice = game.dice;
    const r = game.tokens[color][tokenIdx];
    const newR = r === -1 ? 0 : r + dice;
    game.tokens[color][tokenIdx] = newR;

    const captured = [];
    if (newR < RING_STEPS) {
      const gi = globalIndexFor(color, newR);
      if (!SAFE_GLOBAL.has(gi)) {
        COLORS.forEach((oc) => {
          if (oc === color || !game.active.includes(oc)) return;
          game.tokens[oc].forEach((orr, oidx) => {
            if (orr >= 0 && orr < RING_STEPS && globalIndexFor(oc, orr) === gi) {
              game.tokens[oc][oidx] = -1;
              captured.push({ color: oc, idx: oidx });
            }
          });
        });
      }
    }

    game.awaitingPick = false;
    game.movable = [];

    // Ranking: a player who finishes all 4 tokens is "done" but play
    // continues for the rest — just like real Ludo — until only one
    // active color is left, which is automatically ranked last.
    let justFinished = false;
    if (game.tokens[color].every((v) => v === FINISH_R) && !game.finishOrder.includes(color)) {
      game.finishOrder.push(color);
      justFinished = true;
    }

    const remaining = game.active.filter((c) => !game.finishOrder.includes(c));
    if (remaining.length <= 1) {
      if (remaining.length === 1) game.finishOrder.push(remaining[0]);
      game.over = true;
      game.winner = game.finishOrder[0];
      return { captured, finished: justFinished, gameOver: true, finishOrder: game.finishOrder.slice() };
    }

    advanceTurn(game, dice);
    return { captured, finished: justFinished, gameOver: false };
  }

  // Rotates turnIdx forward, skipping any color that has already finished
  // (extra sixes still grant another roll, same as before).
  function nextActiveIdx(game, fromIdx) {
    let idx = fromIdx;
    for (let i = 0; i < game.active.length; i++) {
      idx = (idx + 1) % game.active.length;
      if (!game.finishOrder.includes(game.active[idx])) return idx;
    }
    return fromIdx; // shouldn't happen — caller already guarantees >=1 remaining
  }

  function advanceTurn(game, dice) {
    if (dice === 6 && game.consecutiveSixes < 3) {
      return; // same player rolls again
    }
    game.consecutiveSixes = 0;
    game.turnIdx = nextActiveIdx(game, game.turnIdx);
  }

  // Used when the current player has disconnected or times out.
  function skipTurn(game) {
    if (game.over) return;
    game.awaitingPick = false;
    game.movable = [];
    game.consecutiveSixes = 0;
    game.turnIdx = nextActiveIdx(game, game.turnIdx);
  }

  return {
    COLORS,
    RING,
    RING_LEN,
    RING_STEPS,
    FINISH_R,
    START_IDX,
    SAFE_GLOBAL,
    globalIndexFor,
    freshGame,
    currentColor,
    movesFor,
    rollDice,
    applyMove,
    advanceTurn,
    skipTurn,
  };
});
