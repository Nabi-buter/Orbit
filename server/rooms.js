// =============================================================================
// 온라인 대전 방 관리 (서버는 판정하지 않고 입력만 중계한다)
// -----------------------------------------------------------------------------
// 흐름: create → (상대) join → select/ready → start → input 중계 → end → (재대결)
// 두 클라이언트가 같은 결정론적 시뮬레이션을 같은 입력으로 돌리므로 결과가 같다.
// 입력 지연(프레임)은 두 플레이어의 왕복 지연(RTT)을 보고 시작 시 정한다.
// =============================================================================

import { WEAPON_ORDER } from '../src/config/weapons.js';
import { BALANCE } from '../src/config/balance.js';

const TIME_OPTIONS = BALANCE.round.timeOptions;

const FRAME_MS = 1000 / 60;
export const NET = {
  minDelay: 2,      // [TEMP] 최소 입력 지연(프레임)
  maxDelay: 8,      // [TEMP] 최대 입력 지연
  pingEvery: 1000,
};

const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(c)) return c;
  }
}

function lobbyState(room) {
  return {
    t: 'lobby',
    code: room.code,
    connected: room.players.map((p) => !!p),
    weapons: room.weapons,
    ready: room.ready,
    playing: room.playing,
    time: room.time,
  };
}

function broadcast(room, msg) { for (const p of room.players) p?.send(msg); }

export function inputDelayFor(rtts) {
  const worst = Math.max(...rtts.map((r) => r ?? 100));
  // 한쪽 입력이 상대에게 도착하는 데 걸리는 시간(RTT/2)을 프레임으로 + 여유 1
  const d = Math.ceil(worst / 2 / FRAME_MS) + 1;
  return Math.max(NET.minDelay, Math.min(NET.maxDelay, d));
}

export function attach(conn) {
  conn.room = null;
  conn.slot = -1;
  conn.rtt = null;

  const ping = setInterval(() => conn.send({ t: 'sping', ts: Date.now() }), NET.pingEvery);
  conn.send({ t: 'sping', ts: Date.now() });

  conn.on('message', (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    handle(conn, msg);
  });

  conn.on('close', () => {
    clearInterval(ping);
    leave(conn);
  });
}

function leave(conn) {
  const room = conn.room;
  if (!room) return;
  room.players[conn.slot] = null;
  room.ready = [false, false];
  room.playing = false;
  conn.room = null;
  const other = room.players.find(Boolean);
  if (!other) rooms.delete(room.code);
  else { other.send({ t: 'peerLeft' }); other.send(lobbyState(room)); }
}

function handle(conn, msg) {
  const room = conn.room;
  switch (msg.t) {
    case 'spong':
      if (typeof msg.ts === 'number') conn.rtt = Math.min(2000, Date.now() - msg.ts);
      if (room) {
        const other = room.players[1 - conn.slot];
        conn.send({ t: 'ping', rtt: conn.rtt, peerRtt: other?.rtt ?? null });
      }
      return;

    case 'create': {
      if (room) leave(conn);
      const r = { code: makeCode(), players: [conn, null], weapons: ['longsword', 'longsword'], ready: [false, false], playing: false, matchId: 0, time: BALANCE.round.onlineDefault };
      rooms.set(r.code, r);
      conn.room = r; conn.slot = 0;
      conn.send({ t: 'joined', code: r.code, slot: 0 });
      conn.send(lobbyState(r));
      return;
    }

    case 'join': {
      const code = String(msg.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) return conn.send({ t: 'error', msg: '방을 찾을 수 없습니다.' });
      const slot = r.players.indexOf(null);
      if (slot < 0) return conn.send({ t: 'error', msg: '방이 가득 찼습니다.' });
      if (room) leave(conn);
      r.players[slot] = conn;
      r.ready = [false, false];
      conn.room = r; conn.slot = slot;
      conn.send({ t: 'joined', code: r.code, slot });
      broadcast(r, lobbyState(r));
      return;
    }

    case 'leave':
      leave(conn);
      return;

    case 'select':
      if (!room || room.playing || !WEAPON_ORDER.includes(msg.weapon)) return;
      room.weapons[conn.slot] = msg.weapon;
      room.ready[conn.slot] = false;
      broadcast(room, lobbyState(room));
      return;

    case 'time':
      // 방장(1P)만, 경기 중이 아닐 때. 바꾸면 양쪽 준비 해제
      if (!room || room.playing || conn.slot !== 0 || !TIME_OPTIONS.includes(msg.time) || room.time === msg.time) return;
      room.time = msg.time;
      room.ready = [false, false];
      broadcast(room, lobbyState(room));
      return;

    case 'ready':
      if (!room || room.playing) return;
      room.ready[conn.slot] = !!msg.ready;
      if (room.ready[0] && room.ready[1] && room.players[0] && room.players[1]) {
        room.playing = true;
        room.ready = [false, false];
        room.matchId++;
        const delay = inputDelayFor(room.players.map((p) => p.rtt));
        room.players.forEach((p, slot) => p.send({ t: 'start', matchId: room.matchId, weapons: room.weapons, delay, time: room.time, slot }));
      }
      broadcast(room, lobbyState(room));
      return;

    case 'input':
    case 'hash':
      // 같은 경기 메시지만 상대에게 중계
      if (!room || !room.playing || msg.m !== room.matchId) return;
      room.players[1 - conn.slot]?.send(msg);
      return;

    case 'end':
      if (!room || msg.m !== room.matchId) return;
      room.playing = false;
      broadcast(room, lobbyState(room));
      return;

    default:
      break;
  }
}

export function roomCount() { return rooms.size; }
