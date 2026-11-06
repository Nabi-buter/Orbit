import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomNet, roomDelayFor } from '../src/net/roomNet.js';
import { Lockstep, stateHash } from '../src/net/lockstep.js';
import { Match } from '../src/core/match.js';

/** 가짜 방: 지연·유실이 있는 메시지 버스 + 수동 시계 */
function makeWorld({ latency = 40, jitter = 20, drop = 0, seed = 7, sameAccount = false } = {}) {
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
            world.queue.push({ at: world.t + (isMe ? 0 : latency + rand() * jitter), m, topic, msg: { topic, data: copy, peer, isMe: isMe || sameAccount, sameTab: isMe } });
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
function makePlayer(world, peer, weapon, netCfg) {
  const net = new RoomNet(world.client(peer), { ...world.clock, net: netCfg });
  const p = { net, weapon, lobby: null, joined: null, match: null, ls: null, errors: [], frames: 0 };
  net.on('joined', (m) => { p.joined = m; net.send({ t: 'select', weapon }); })
    .on('lobby', (m) => { p.lobby = m; })
    .on('error', (m) => p.errors.push(m.msg))
    .on('roomClosed', (m) => { p.closed = m.msg; })
    .on('peerLeft', () => { p.left = (p.left ?? 0) + 1; })
    .on('start', (m) => {
      p.start = m;
      p.match = new Match({ weapons: m.weapons, roundSeconds: m.time });
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
  const a = makePlayer(world, 'peer-a', 'axe', opts.net);
  const b = makePlayer(world, 'peer-b', 'spear', opts.net);
  a.net.send({ t: 'create' });
  await world.advance(50);
  assert.ok(a.joined?.code, '방 생성');
  b.net.send({ t: 'join', code: a.joined.code.toLowerCase() });
  // 유실이 있으면 재전송으로 맞춰지기까지 조금 걸린다 (최대 6초)
  for (let t = 0; t < 6000 && !(b.joined && b.lobby?.weapons?.[1] === 'spear'); t += 100) await world.advance(100);
  assert.equal(b.joined?.slot, 1, '코드로 참가');
  assert.deepEqual(b.lobby?.weapons, ['axe', 'spear'], '로비 무기 공유');
  a.net.send({ t: 'ready', ready: true });
  b.net.send({ t: 'ready', ready: true });
  // 60fps 로 양쪽 게임 진행
  // freeze: [시작, 끝] ms 동안 손님 화면 루프가 멈춤 (탭 전환·앱 전환·큰 프레임 드랍)
  //   hidden=false: 돌아오면 밀린 시간만큼 몰아서 진행 (app.js 처럼 한 번에 최대 250ms)
  //   hidden=true : 멈춘 동안 상대 입력이 올 때마다 따라 진행 (app.js catchUpHidden)
  let acc = 0, t0 = world.t, owed = 0;
  const frozen = () => opts.freeze && world.t - t0 >= opts.freeze[0] && world.t - t0 < opts.freeze[1];
  if (opts.hidden) {
    b.net.on('input', (m) => {
      b.ls && m.m === b.ls.matchId && b.ls.onRemoteInput(m.f, m.i);
      if (frozen()) queueMicrotask(() => {
        for (let i = 0; i < 900 && b.ls && !b.match.over; i++) { const s0 = b.ls.stalled; b.tick(); if (b.ls.stalled > s0) break; }
        b.net.flushInputs();
      });
    });
  }
  world.onMs = () => {
    if (++acc < 17) return;
    acc = 0;
    a.tick();
    if (frozen()) { if (!opts.hidden) owed += 1; return; }
    const n = 1 + Math.min(14, owed); owed = Math.max(0, owed - 14);
    for (let k = 0; k < n; k++) b.tick();
  };
  await world.advance(opts.ms ?? 30000);
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
  // 여러 유실 패턴 (선택·준비·시작 메시지가 빠지는 경우 포함)
  for (const seed of [11, 23, 37, 51, 77]) {
    const { a, b } = await runDuel({ drop: 0.2, seed });
    assert.ok(a.match && b.match, `seed ${seed}: 유실에도 시작 신호 도착`);
    assert.ok(a.frames > 900 && b.frames > 900, `seed ${seed}: 진행 ${a.frames}/${b.frames}`);
    assert.equal(a.ls.desyncAt, null); assert.equal(b.ls.desyncAt, null);
  }
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

test('잠깐 연결이 흔들려도 방이 깨지지 않고, 방장이 정말 나가면 손님은 처음 화면으로', async () => {
  const world = makeWorld();
  const a = makePlayer(world, 'peer-a', 'axe');
  const b = makePlayer(world, 'peer-b', 'spear');
  a.net.send({ t: 'create' });
  await world.advance(50);
  b.net.send({ t: 'join', code: a.joined.code });
  for (let t = 0; t < 4000 && !b.joined; t += 100) await world.advance(100);
  assert.equal(b.joined?.slot, 1);
  // 방장의 참가자 표시가 잠깐 빠졌다가 돌아옴 (재연결)
  const members = [...world.rooms.values()][0];
  const guest = [...members].find((m) => m.peer === 'peer-b');
  guest.peerFns.forEach((fn) => fn({ left: [{ peer: 'peer-a' }], joined: [], updated: [], peers: [] }));
  await world.advance(1500);
  guest.peerFns.forEach((fn) => fn({ left: [], joined: [{ peer: 'peer-a' }], updated: [], peers: [] }));
  await world.advance(8000);
  assert.equal(b.closed, undefined, '짧은 흔들림으로 방이 닫히면 안 됨');
  assert.equal(b.left ?? 0, 0);
  // 방장이 정말 나감
  await a.net.close();
  await world.advance(500);
  assert.ok(b.closed?.includes('방장이 방을 나갔'), b.closed);
});

test('시간 제한: 방장만 바꿀 수 있고(무제한 포함) 손님에게 공유되며 시작 신호에 실린다', async () => {
  const world = makeWorld({ drop: 0 });
  const a = makePlayer(world, 'peer-a', 'axe');
  const b = makePlayer(world, 'peer-b', 'spear');
  a.net.send({ t: 'create' });
  await world.advance(50);
  b.net.send({ t: 'join', code: a.joined.code });
  await world.advance(2000);
  assert.equal(b.lobby?.time, 90, '온라인 기본 90초');
  // 손님이 바꾸려 해도 무시
  b.net.send({ t: 'time', time: 0 });
  b.net.control({ op: 'time', time: 0 });
  await world.advance(1500);
  assert.equal(a.lobby.time, 90); assert.equal(b.lobby.time, 90);
  // 방장이 무제한으로 → 준비가 풀리고 손님에게도 보임
  a.net.send({ t: 'ready', ready: true });
  await world.advance(200);
  a.net.send({ t: 'time', time: 0 });
  await world.advance(1500);
  assert.equal(b.lobby.time, 0, '손님에게 무제한 공유');
  assert.deepEqual(a.lobby.ready, [false, false], '시간을 바꾸면 준비 해제');
  a.net.send({ t: 'time', time: 37 }); // 목록에 없는 값은 무시
  await world.advance(200);
  assert.equal(a.lobby.time, 0);
  a.net.send({ t: 'ready', ready: true });
  b.net.send({ t: 'ready', ready: true });
  await world.advance(1000);
  assert.equal(a.start?.time, 0); assert.equal(b.start?.time, 0);
  assert.ok(a.match.unlimited && b.match.unlimited);
});

test('한쪽 화면이 멈췄다 돌아와도(프레임 드랍·가려진 탭) 입력이 빠지지 않고 서로 기다리며 멈추지 않는다', async () => {
  for (const [name, net] of [['방 기능', undefined], ['직접 연결', { flushMs: 17 }]]) {
    for (const hidden of [false, true]) {
      // 대전 시작 몇 초 뒤 손님 화면이 3초 멈춤 (hidden: 가려진 탭)
      const { a, b } = await runDuel({ drop: 0.05, seed: 5, freeze: [9000, 12000], hidden, net, ms: 20000, latency: 120 });
      const tag = `${name}${hidden ? ' 가려진 탭' : ' 몰아서 진행'}`;
      assert.ok(a.match && b.match, `${tag}: 시작`);
      assert.ok(a.frames > 800 && b.frames > 800, `${tag}: 진행 ${a.frames}/${b.frames}`);
      assert.ok(Math.abs(a.frames - b.frames) < 40, `${tag}: 프레임 차 ${a.frames}/${b.frames}`);
      if (hidden) assert.ok(a.frames > 1000, `${tag}: 가려진 동안에도 상대 화면이 계속 진행 ${a.frames}`);
      assert.equal(a.ls.desyncAt, null); assert.equal(b.ls.desyncAt, null);
    }
  }
});

test('준비 / 준비 취소: 손님·방장 모두 바로 바뀌고, 같은 계정의 다른 기기(탭)끼리도 대전된다', async () => {
  const world = makeWorld({ drop: 0, sameAccount: true });
  const a = makePlayer(world, 'peer-a', 'axe');
  const b = makePlayer(world, 'peer-b', 'spear');
  a.net.send({ t: 'create' });
  await world.advance(50);
  b.net.send({ t: 'join', code: a.joined.code });
  await world.advance(2000);
  assert.equal(b.joined?.slot, 1, '같은 계정 다른 탭으로 참가');
  b.net.send({ t: 'ready', ready: true });
  await world.advance(1);
  assert.equal(b.lobby.ready[1], true, '손님 화면: 누르자마자 준비 완료');
  await world.advance(500);
  assert.equal(a.lobby.ready[1], true, '방장에게 전달');
  b.net.send({ t: 'ready', ready: false });
  await world.advance(1);
  assert.equal(b.lobby.ready[1], false, '준비 취소 바로 반영');
  await world.advance(1500);
  assert.equal(a.lobby.ready[1], false); assert.equal(b.lobby.ready[1], false);
  a.net.send({ t: 'ready', ready: true });
  a.net.send({ t: 'ready', ready: false });
  a.net.send({ t: 'ready', ready: true });
  await world.advance(500);
  assert.equal(b.lobby.ready[0], true, '방장 준비 토글');
  // 손님이 준비한 뒤 방장이 시간을 바꾸면 손님 준비도 풀린 채로 유지 (다시 저절로 준비되지 않음)
  b.net.send({ t: 'ready', ready: false });
  await world.advance(300);
  a.net.send({ t: 'ready', ready: false });
  b.net.send({ t: 'ready', ready: true });
  await world.advance(2000);
  a.net.send({ t: 'time', time: 60 });
  await world.advance(3000);
  assert.deepEqual(a.lobby.ready, [false, false]); assert.deepEqual(b.lobby.ready, [false, false]);
  a.net.send({ t: 'ready', ready: true });
  b.net.send({ t: 'ready', ready: true });
  await world.advance(1000);
  assert.ok(a.match && b.match, '시작');
  assert.equal(a.start.time, 60);
  let acc = 0;
  world.onMs = () => { if (++acc >= 17) { acc = 0; a.tick(); b.tick(); } };
  await world.advance(5000);
  assert.ok(a.frames > 200 && b.frames > 200, `같은 계정끼리 진행 ${a.frames}/${b.frames}`);
});

test('게임 버전이 다르면 참가하지 못하고 양쪽에 새로고침 안내 (예전 버전을 캐시로 든 기기)', async () => {
  const world = makeWorld({ drop: 0 });
  const a = makePlayer(world, 'peer-a', 'axe');
  const b = makePlayer(world, 'peer-b', 'spear');
  b.net.version = '6-oldbuild';
  a.net.send({ t: 'create' });
  await world.advance(50);
  b.net.send({ t: 'join', code: a.joined.code });
  await world.advance(3000);
  assert.equal(b.joined, null, '참가 안 됨');
  assert.ok(b.errors.some((e) => e.includes('버전')), b.errors.join());
  assert.ok(a.errors.some((e) => e.includes('버전')), a.errors.join());
  assert.equal(a.lobby.connected[1], false, '방장 쪽 자리는 비어 있음');
  // 새로고침해서 같은 버전으로 다시 참가하면 된다
  const c = makePlayer(world, 'peer-c', 'spear');
  c.net.send({ t: 'join', code: a.joined.code });
  await world.advance(2000);
  assert.equal(c.joined?.slot, 1);
});

test('참가 버튼을 여러 번 눌러도 연결이 하나만 남고, 손님 준비가 방장에게 반영되어 시작된다', async () => {
  const world = makeWorld({ drop: 0 });
  const a = makePlayer(world, 'peer-a', 'axe');
  // 손님: 누를 때마다 다른 연결(PeerJS 는 참가마다 새 Peer)이 생기는 로비
  let n = 0;
  const base = world.client('peer-b');
  const lobbyB = { ...base, join: (name) => world.client(`peer-b${++n}`).join(name) };
  const b = makePlayer(world, 'peer-b', 'spear');
  b.net.lobby = lobbyB;
  a.net.send({ t: 'create' });
  await world.advance(50);
  for (let i = 0; i < 3; i++) b.net.send({ t: 'join', code: a.joined.code });
  await world.advance(30);
  b.net.send({ t: 'join', code: a.joined.code }); // 조금 뒤에 한 번 더
  await world.advance(2500);
  assert.equal(b.joined?.slot, 1, '참가');
  b.net.send({ t: 'ready', ready: true });
  await world.advance(800);
  assert.equal(a.lobby.ready[1], true, '방장 화면에 손님 준비 반영');
  a.net.send({ t: 'ready', ready: true });
  await world.advance(800);
  assert.ok(a.match && b.match, '시작');
  let acc = 0;
  world.onMs = () => { if (++acc >= 17) { acc = 0; a.tick(); b.tick(); } };
  await world.advance(4000);
  assert.ok(a.frames > 150 && b.frames > 150, `진행 ${a.frames}/${b.frames}`);
});
