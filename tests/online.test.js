import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/server.js';
import { inputDelayFor, NET } from '../server/rooms.js';
import { NetClient } from '../src/net/client.js';
import { Lockstep, encodeInput, decodeInput, stateHash } from '../src/net/lockstep.js';
import { Match } from '../src/core/match.js';
import { EMPTY_INPUT } from '../src/core/fighter.js';

const I = (o = {}) => ({ ...EMPTY_INPUT, ...o });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function once(client, type) {
  return new Promise((resolve) => {
    const prev = client.handlers.get(type);
    client.on(type, (m) => { if (prev) client.on(type, prev); resolve(m); });
  });
}

test('입력 인코딩 왕복', () => {
  const inp = I({ left: true, heavy: true, ult: true });
  assert.deepEqual(decodeInput(encodeInput(inp)), inp);
});

test('입력 지연은 RTT 에 따라 정해지고 범위 안에 있다', () => {
  assert.equal(inputDelayFor([10, 20]), NET.minDelay);
  assert.ok(inputDelayFor([120, 80]) >= 4);
  assert.equal(inputDelayFor([5000, 10]), NET.maxDelay);
});

test('락스텝: 입력이 늦게 와도 두 시뮬레이션은 같은 결과 (지연 메시지 시뮬레이션)', () => {
  const queues = [[], []];
  const ls = [0, 1].map((slot) => new Lockstep({ slot, delay: 3, matchId: 1, send: (msg) => queues[1 - slot].push({ msg, at: 0 }) }));
  const ms = [new Match({ weapons: ['axe', 'knuckle'] }), new Match({ weapons: ['axe', 'knuckle'] })];
  const script = (slot, k) => slot === 0
    ? I({ right: k % 60 < 35, light: k % 13 === 0, heavy: k % 47 === 0, guard: k % 100 > 85 })
    : I({ left: k % 50 < 25, light: k % 9 === 0, dash: k % 90 === 3, up: k % 140 === 7 });
  const sampled = [0, 0];
  for (let tick = 0; tick < 3000; tick++) {
    for (const slot of [0, 1]) {
      // 상대 메시지는 무작위로 0~5틱 늦게 도착
      const q = queues[slot];
      for (const item of q) item.at++;
      while (q.length && q[0].at > ((tick * 7 + slot * 3) % 6)) {
        const { msg } = q.shift();
        if (msg.t === 'input') ls[slot].onRemoteInput(msg.f, msg.i);
        if (msg.t === 'hash') ls[slot].onRemoteHash(msg.f, msg.h);
      }
      if (ms[slot].frame >= 1500 || ms[slot].over) continue; // 두 쪽을 같은 프레임에서 멈춰 비교
      if (ls[slot].needsLocal()) ls[slot].pushLocal(script(slot, sampled[slot]++));
      const pair = ls[slot].next();
      if (pair) { ms[slot].step(pair); ls[slot].afterStep(ms[slot]); }
    }
  }
  assert.ok(ms[0].frame > 600, `진행 프레임 ${ms[0].frame}`);
  assert.equal(ms[0].frame, ms[1].frame);
  // 같은 프레임 수까지 맞춘 뒤 비교
  assert.equal(stateHash(ms[0]), stateHash(ms[1]));
  assert.equal(ls[0].desyncAt, null);
  assert.equal(ls[1].desyncAt, null);
});

test('서버: 방 생성/입장/무기 선택/준비 → 시작, 입력 중계로 양쪽 동일 결과', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const a = await new NetClient(url).connect();
  const b = await new NetClient(url).connect();
  try {
    a.send({ t: 'create' });
    const ja = await once(a, 'joined');
    assert.equal(ja.slot, 0);
    assert.match(ja.code, /^[A-Z0-9]{4}$/);

    b.send({ t: 'join', code: 'ZZZZ' });
    assert.equal((await once(b, 'error')).msg, '방을 찾을 수 없습니다.');
    b.send({ t: 'join', code: ja.code.toLowerCase() });
    assert.equal((await once(b, 'joined')).slot, 1);

    a.send({ t: 'select', weapon: 'spear' });
    b.send({ t: 'select', weapon: 'dagger' });
    b.send({ t: 'select', weapon: 'not-a-weapon' });
    await wait(50);
    const startA = once(a, 'start');
    const startB = once(b, 'start');
    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });
    const [sa, sb] = await Promise.all([startA, startB]);
    assert.deepEqual(sa.weapons, ['spear', 'dagger']);
    assert.deepEqual(sb.weapons, ['spear', 'dagger']);
    assert.equal(sa.delay, sb.delay);
    assert.equal(sb.slot, 1);

    // 양쪽 클라이언트가 실제 네트워크로 락스텝 진행
    const run = (client, start, script) => new Promise((resolve) => {
      const match = new Match({ weapons: start.weapons });
      const ls = new Lockstep({ slot: start.slot, delay: start.delay, matchId: start.matchId, send: (m) => client.send(m) });
      client.on('input', (m) => ls.onRemoteInput(m.f, m.i));
      client.on('hash', (m) => ls.onRemoteHash(m.f, m.h));
      let k = 0;
      const timer = setInterval(() => {
        for (let s = 0; s < 4; s++) {
          if (ls.needsLocal()) ls.pushLocal(script(k++));
          const pair = ls.next();
          if (pair) { match.step(pair); ls.afterStep(match); }
          if (match.frame >= 600) { clearInterval(timer); resolve({ match, ls }); return; }
        }
      }, 1);
    });
    const [ra, rb] = await Promise.all([
      run(a, sa, (k) => I({ right: k % 40 < 30, light: k % 11 === 0, heavy: k % 37 === 0 })),
      run(b, sb, (k) => I({ left: k % 30 < 20, light: k % 7 === 0, guard: k % 80 > 60 })),
    ]);
    assert.equal(ra.match.frame, 600);
    assert.equal(stateHash(ra.match), stateHash(rb.match));
    assert.ok(ra.match.fighters.some((f) => f.hp < 1200), '실제로 전투가 일어남');
    assert.equal(ra.ls.desyncAt, null);

    // 상대 퇴장 알림
    const left = once(a, 'peerLeft');
    b.close();
    await left;
  } finally {
    a.close(); b.close();
    await new Promise((r) => server.close(r));
  }
});
