import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomNet, roomDelayFor } from '../src/net/roomNet.js';
import { Lockstep, stateHash } from '../src/net/lockstep.js';
import { Match } from '../src/core/match.js';

/** 가짜 방: 지연·유실이 있는 메시지 버스 + 수동 시계 */
function makeWorld({ latency = 40, jitter = 20, drop = 0, seed = 7 } = {}) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const world = { t: 0, queue: [], timers: [], rooms: new Map(), rand };
  world.clock = {
    now: () => world.t,
    setInterval: (f, ms) => { const id = world.timers.length; world.timers.push({ f, ms, next: world.t + ms, every: true }); return id; },
    clearInterval: (id) => { if (world.timers[id]) world.timers[id].dead = true; },
    setTimeout: (f, ms) => { world.timers.push({ f, next: world.t + ms, every: false }); return world.timers.length - 1; },
    rand,
  };
  world.client = (peer) => ({
    connected: () => true,
    onConnection: (fn) => { world.clock.setTimeout(() => fn(true), 1); return () => {}; },
    async join(name) {
      const members = world.rooms.get(name) ?? new Set();
      world.rooms.set(name, members);
      const handlers = new Map(); const peerFns = [];
      const me = { peer, handlers, peerFns };
      members.add(me);
      return {
        name,
        emit: async (topic, data) => {
          const copy = JSON.parse(JSON.stringify(data ?? {}));
          for (const m of members) {
            const isMe = m === me;
            if (!isMe && rand() < drop) continue;
            world.queue.push({ at: world.t + (isMe ? 0 : latency + rand() * jitter), m, topic, msg: { topic, data: copy, peer, isMe, sameTab: isMe } });
          }
        },
        on: (topic, fn) => { handlers.set(topic, [...(handlers.get(topic) ?? []), fn]); return () => {}; },
        onPeers: (fn) => { peerFns.push(fn); return () => {}; },
        peers: () => [...members].map((m) => ({ peer: m.peer, sameTab: m === me })),
        leave: async () => { members.delete(me); for (const m of members) m.peerFns.forEach((fn) => fn({ left: [{ peer }], joined: [], updated: [], peers: [] })); },
      };
    },
  });
  world.advance = async (ms) => {
    for (let k = 0; k < ms; k++) {
      await null; await null; // 대기 중인 비동기 처리(방 참가 등)를 먼저 흘려보냄
      world.t++;
      const due = world.queue.filter((q) => q.at <= world.t);
      world.queue = world.queue.filter((q) => q.at > world.t);
      for (const q of due) (q.m.handlers.get(q.topic) ?? []).forEach((fn) => fn(q.msg));
      for (const tm of world.timers) if (!tm.dead && tm.next <= world.t) { tm.f(); if (tm.every) tm.next += tm.ms; else tm.dead = true; }
      world.onMs?.();
    }
  };
  return world;
}

/** 게임 쪽 흉내: app.js 의 온라인 흐름과 같은 순서 */
function makePlayer(world, peer, weapon) {
  const net = new RoomNet(world.client(peer), world.clock);
  const p = { net, weapon, lobby: null, joined: null, match: null, ls: null, errors: [], frames: 0 };
  net.on('joined', (m) => { p.joined = m; net.send({ t: 'select', weapon }); })
    .on('lobby', (m) => { p.lobby = m; })
    .on('error', (m) => p.errors.push(m.msg))
    .on('start', (m) => {
      p.match = new Match({ weapons: m.weapons });
      p.ls = new Lockstep({ slot: m.slot, delay: m.delay, matchId: m.matchId, send: (x) => net.send(x) });
    })
    .on('input', (m) => p.ls && m.m === p.ls.matchId && p.ls.onRemoteInput(m.f, m.i))
    .on('hash', (m) => p.ls && m.m === p.ls.matchId && p.ls.onRemoteHash(m.f, m.h));
  let k = 0;
  p.tick = () => {
    if (!p.ls || p.match.over) return;
    if (p.ls.needsLocal()) {
      k++;
      p.ls.pushLocal({ right: k % 50 < 25, left: k % 90 > 70, light: k % 13 === 0, heavy: k % 37 === 0, guard: k % 60 > 50, dash: k % 97 === 3 });
    }
    const inputs = p.ls.next();
    if (!inputs) return;
    p.match.step(inputs);
    p.ls.afterStep(p.match);
    p.frames++;
  };
  return p;
}

async function runDuel(opts) {
  const world = makeWorld(opts);
  const a = makePlayer(world, 'peer-a', 'axe');
  const b = makePlayer(world, 'peer-b', 'spear');
  a.net.send({ t: 'create' });
  await world.advance(50);
  assert.ok(a.joined?.code, '방 생성');
  b.net.send({ t: 'join', code: a.joined.code.toLowerCase() });
  await world.advance(1500);
  assert.equal(b.joined?.slot, 1, '코드로 참가');
  assert.deepEqual(b.lobby?.weapons, ['axe', 'spear'], '로비 무기 공유');
  a.net.send({ t: 'ready', ready: true });
  b.net.send({ t: 'ready', ready: true });
  // 60fps 로 양쪽 게임 진행
  let acc = 0;
  world.onMs = () => { if (++acc >= 17) { acc = 0; a.tick(); b.tick(); } };
  await world.advance(30000);
  return { a, b };
}

test('방 기능 온라인: 생성 → 코드 참가 → 준비 → 시작, 양쪽 시뮬레이션이 같다 (유실 없음)', async () => {
  const { a, b } = await runDuel({ drop: 0 });
  assert.ok(a.match && b.match, '양쪽 시작');
  assert.ok(a.frames > 1000, `진행 ${a.frames}`);
  const f = Math.min(a.frames, b.frames);
  assert.ok(Math.abs(a.frames - b.frames) < 30, `프레임 차 ${a.frames}/${b.frames}`);
  assert.equal(a.ls.desyncAt, null); assert.equal(b.ls.desyncAt, null);
  assert.ok(f > 0);
});

test('방 기능 온라인: 메시지 20% 유실에도 멈추지 않고 동기화가 유지된다', async () => {
  const { a, b } = await runDuel({ drop: 0.2, seed: 11 });
  assert.ok(a.match && b.match, '유실에도 시작 신호 도착');
  assert.ok(a.frames > 900 && b.frames > 900, `진행 ${a.frames}/${b.frames}`);
  assert.equal(a.ls.desyncAt, null); assert.equal(b.ls.desyncAt, null);
  // 같은 프레임에서의 상태가 같다: 짧은 쪽에 맞춰 다시 계산하지 않고 해시 교환 결과로 확인
});

test('없는 코드로 참가하면 오류, 입력 지연은 왕복 지연에 맞춰진다', async () => {
  const world = makeWorld();
  const b = makePlayer(world, 'peer-b', 'spear');
  b.net.send({ t: 'join', code: 'ZZZZ' });
  await world.advance(6000);
  assert.ok(b.errors.some((e) => e.includes('찾을 수 없')), b.errors.join());
  assert.ok(roomDelayFor([60, 80]) >= 3 && roomDelayFor([60, 80]) <= 12);
  assert.ok(roomDelayFor([400, 400]) > roomDelayFor([40, 40]));
});
