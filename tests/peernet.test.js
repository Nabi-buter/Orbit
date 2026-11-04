import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomNet } from '../src/net/roomNet.js';
import { PeerLobby } from '../src/net/peerLobby.js';
import { Lockstep } from '../src/net/lockstep.js';
import { Match } from '../src/core/match.js';

/** 가짜 PeerJS: 중개 서버(ID 등록) + 직접 연결(지연 있는 신뢰 채널) + 수동 시계 */
function makeBroker({ latency = 25 } = {}) {
  const w = { t: 0, queue: [], timers: [], ids: new Map() };
  w.clock = {
    now: () => w.t,
    setInterval: (f, ms) => { w.timers.push({ f, ms, next: w.t + ms, every: true }); return w.timers.length - 1; },
    clearInterval: (id) => { if (w.timers[id]) w.timers[id].dead = true; },
    setTimeout: (f, ms) => { w.timers.push({ f, next: w.t + ms }); return w.timers.length - 1; },
  };
  const later = (ms, f) => w.queue.push({ at: w.t + ms, f });
  class Emitter {
    constructor() { this.h = new Map(); }
    on(ev, fn) { this.h.set(ev, [...(this.h.get(ev) ?? []), fn]); return this; }
    fire(ev, ...a) { for (const fn of this.h.get(ev) ?? []) fn(...a); }
  }
  class Conn extends Emitter {
    constructor(owner, peerId) { super(); this.owner = owner; this.peer = peerId; this.open = false; this.other = null; }
    send(text) { if (!this.open) return; const o = this.other; later(latency, () => o.open && o.fire('data', text)); }
    close() { if (!this.open) return; this.open = false; this.other.open = false; const o = this.other; later(latency, () => o.fire('close')); this.fire('close'); }
  }
  let anon = 0;
  class FakePeer extends Emitter {
    constructor(id, opts) {
      super();
      if (typeof id !== 'string') id = `anon${++anon}`;
      this.id = id; this.destroyed = false; this.conns = [];
      later(5, () => {
        if (w.ids.has(id)) { this.fire('error', { type: 'unavailable-id' }); return; }
        w.ids.set(id, this); this.fire('open', id);
      });
    }
    connect(target) {
      const mine = new Conn(this, target);
      later(latency, () => {
        const host = w.ids.get(target);
        if (!host || host.destroyed) { this.fire('error', { type: 'peer-unavailable' }); return; }
        const theirs = new Conn(host, this.id);
        mine.other = theirs; theirs.other = mine;
        host.conns.push(theirs); this.conns.push(mine);
        host.fire('connection', theirs);
        later(latency, () => { mine.open = theirs.open = true; theirs.fire('open'); mine.fire('open'); });
      });
      return mine;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (w.ids.get(this.id) === this) w.ids.delete(this.id);
      for (const c of this.conns) c.close();
    }
  }
  w.Peer = FakePeer;
  w.advance = async (ms) => {
    for (let k = 0; k < ms; k++) {
      await null; await null; await null;
      w.t++;
      const due = w.queue.filter((q) => q.at <= w.t);
      w.queue = w.queue.filter((q) => q.at > w.t);
      for (const q of due) q.f();
      for (const tm of w.timers) if (!tm.dead && tm.next <= w.t) { tm.f(); if (tm.every) tm.next += tm.ms; else tm.dead = true; }
      w.onMs?.();
    }
  };
  return w;
}

function makePlayer(w, weapon) {
  const net = new RoomNet(new PeerLobby(w.Peer), { ...w.clock, net: { flushMs: 17, window: 12 } });
  const p = { net, lobby: null, joined: null, match: null, ls: null, errors: [], frames: 0, left: 0 };
  net.on('joined', (m) => { p.joined = m; net.send({ t: 'select', weapon }); })
    .on('lobby', (m) => { p.lobby = m; })
    .on('error', (m) => p.errors.push(m.msg))
    .on('peerLeft', () => { p.left++; })
    .on('start', (m) => {
      p.match = new Match({ weapons: m.weapons });
      p.ls = new Lockstep({ slot: m.slot, delay: m.delay, matchId: m.matchId, send: (x) => net.send(x) });
    })
    .on('input', (m) => p.ls && m.m === p.ls.matchId && p.ls.onRemoteInput(m.f, m.i))
    .on('hash', (m) => p.ls && m.m === p.ls.matchId && p.ls.onRemoteHash(m.f, m.h));
  let k = 0;
  p.tick = () => {
    if (!p.ls || p.match.over) return;
    if (p.ls.needsLocal()) { k++; p.ls.pushLocal({ right: k % 40 < 20, left: k % 70 > 55, light: k % 11 === 0, heavy: k % 31 === 0, guard: k % 50 > 42 }); }
    const inputs = p.ls.next();
    if (!inputs) return;
    p.match.step(inputs);
    p.ls.afterStep(p.match);
    p.frames++;
  };
  return p;
}

test('WebRTC(PeerJS) 온라인: 코드로 방 만들고 참가 → 무기·준비 → 경기, 양쪽 동기화', async () => {
  const w = makeBroker();
  const a = makePlayer(w, 'greatsword');
  const b = makePlayer(w, 'dagger');
  a.net.send({ t: 'create' });
  await w.advance(100);
  assert.ok(a.joined?.code && a.joined.slot === 0, '방 생성');
  b.net.send({ t: 'join', code: a.joined.code });
  await w.advance(1000);
  assert.equal(b.joined?.slot, 1, '코드로 참가');
  assert.deepEqual(b.lobby?.weapons, ['greatsword', 'dagger']);
  a.net.send({ t: 'ready', ready: true });
  b.net.send({ t: 'ready', ready: true });
  let acc = 0;
  w.onMs = () => { if (++acc >= 17) { acc = 0; a.tick(); b.tick(); } };
  await w.advance(20000);
  assert.ok(a.match && b.match, '양쪽 시작');
  assert.ok(a.ls.delay <= 5, `직접 연결이라 입력 지연이 작다 (${a.ls.delay}F)`);
  assert.ok(a.frames > 1000 && Math.abs(a.frames - b.frames) < 20, `진행 ${a.frames}/${b.frames}`);
  assert.equal(a.ls.desyncAt, null); assert.equal(b.ls.desyncAt, null);
  // 상대가 나가면 알림
  await b.net.close();
  await w.advance(200);
  assert.ok(a.left >= 1, '상대 나감 알림');
});

test('WebRTC(PeerJS) 온라인: 없는 코드, 가득 찬 방', async () => {
  const w = makeBroker();
  const x = makePlayer(w, 'axe');
  x.net.send({ t: 'join', code: 'QQQQ' });
  await w.advance(6000);
  assert.ok(x.errors.some((e) => e.includes('찾을 수 없')), x.errors.join());
  // 세 번째 사람은 가득 참
  const a = makePlayer(w, 'axe'), b = makePlayer(w, 'spear'), c = makePlayer(w, 'knuckle');
  a.net.send({ t: 'create' });
  await w.advance(100);
  b.net.send({ t: 'join', code: a.joined.code });
  await w.advance(800);
  c.net.send({ t: 'join', code: a.joined.code });
  await w.advance(1500);
  assert.equal(b.joined?.slot, 1);
  assert.ok(c.errors.some((e) => e.includes('가득')), c.errors.join());
});
