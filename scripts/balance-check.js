// =============================================================================
// 밸런스 점검 도구 (헤드리스)
//   node scripts/balance-check.js
// 1) 단순 전략 봇(약공 연타 / 점프 남발 / 가드만)이 일반 AI 상대로 지나치게 강한지
// 2) 강공격 vs 약공격 동시 입력 시 거리별 승패 (빠른 공격이 항상 이기지 않는지)
// 3) 무기별 승률(AI 대 AI)
// =============================================================================

import { Match } from '../src/core/match.js';
import { AIController } from '../src/ai/ai.js';
import { EMPTY_INPUT, S, isFree } from '../src/core/fighter.js';
import { WEAPON_ORDER, WEAPONS } from '../src/config/weapons.js';
import { reachOf } from '../src/core/attackDef.js';
import { BALANCE } from '../src/config/balance.js';

const I = (o = {}) => ({ ...EMPTY_INPUT, ...o });

// --- 단순 전략 봇 -------------------------------------------------------------
const bots = {
  lightSpam: () => {
    let t = 0;
    return (m, idx) => {
      const me = m.fighters[idx], op = m.fighters[1 - idx];
      t++;
      const toward = op.x > me.x ? 'right' : 'left';
      const d = Math.abs(op.x - me.x);
      if (d > reachOf(me.weapon.light) + 10) return I({ [toward]: true });
      return I({ light: t % 2 === 0 });
    };
  },
  jumpSpam: () => {
    let t = 0;
    return (m, idx) => {
      const me = m.fighters[idx], op = m.fighters[1 - idx];
      t++;
      const toward = op.x > me.x ? 'right' : 'left';
      if (me.state === S.JUMP && me.vy < 0) return I({ heavy: t % 2 === 0 });
      if (isFree(me)) return I({ up: t % 2 === 0, [toward]: true });
      return I();
    };
  },
  turtle: () => {
    let t = 0;
    return (m, idx) => {
      const me = m.fighters[idx], op = m.fighters[1 - idx];
      t++;
      const d = Math.abs(op.x - me.x);
      // 가드를 계속 누르다 상대가 경직되면 약공
      if ((op.state === S.PARRIED || op.state === S.LANDING) && d < reachOf(me.weapon.light) + 10) return I({ light: t % 2 === 0 });
      return I({ guard: true });
    };
  },
  heavySpam: () => {
    let t = 0;
    return (m, idx) => {
      const me = m.fighters[idx], op = m.fighters[1 - idx];
      t++;
      const toward = op.x > me.x ? 'right' : 'left';
      if (Math.abs(op.x - me.x) > reachOf(me.weapon.heavy)) return I({ [toward]: true });
      return I({ heavy: t % 2 === 0 });
    };
  },
};

let seed = 777;
function play(w1, w2, c1, c2) {
  const m = new Match({ weapons: [w1, w2] });
  const counts = {};
  while (!m.over) {
    const ev = m.step([c1(m, 0), c2(m, 1)]);
    for (const e of ev) counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return { winner: m.winner, frames: m.frame, counts };
}

function aiCtl(diff) { const a = new AIController(diff, seed++); return (m, i) => a.think(m, i); }

console.log('=== 1. 단순 전략 봇 vs AI (봇 승률 %, 무기 6종 × 각 6판) ===');
for (const diff of ['normal', 'hard']) {
  const row = [];
  for (const [name, mk] of Object.entries(bots)) {
    let wins = 0, n = 0;
    for (const w of WEAPON_ORDER) for (let k = 0; k < 6; k++) {
      const swap = k % 2;
      const r = swap ? play(w, w, aiCtl(diff), mk()) : play(w, w, mk(), aiCtl(diff));
      if (r.winner === (swap ? 1 : 0)) wins++;
      else if (r.winner === 'draw') wins += 0.5;
      n++;
    }
    row.push(`${name} ${(wins / n * 100).toFixed(0)}%`);
  }
  console.log(`  AI ${diff}: ${row.join(' · ')}`);
}

console.log('\n=== 2. 강공(A) vs 약공(B) 동시 입력: 강공이 이기는 거리 비율 ===');
for (const a of WEAPON_ORDER) {
  const cells = [];
  for (const b of WEAPON_ORDER) {
    let heavyWins = 0, total = 0;
    for (let d = 60; d <= 260; d += 10) {
      const m = new Match({ weapons: [a, b] });
      m.fighters[0].x = 500; m.fighters[1].x = 500 + d;
      m.step([I({ heavy: true }), I({ light: true })]);
      let aHit = false, bHit = false;
      for (let k = 0; k < 60; k++) {
        const ev = m.step([I(), I()]);
        for (const e of ev) {
          if (e.type === 'hit' && e.attacker === 0 && !bHit) aHit = true;
          if (e.type === 'hit' && e.attacker === 1 && !aHit) bHit = true;
        }
        if (aHit || bHit) break;
      }
      if (aHit || bHit) { total++; if (aHit) heavyWins++; }
    }
    cells.push(`${(heavyWins / Math.max(1, total) * 100).toFixed(0).padStart(3)}%`);
  }
  console.log(`  ${WEAPONS[a].name.padEnd(3, '　')} 강공 vs [${WEAPON_ORDER.map((w) => WEAPONS[w].name).join('/')}] 약공: ${cells.join(' ')}`);
}

console.log('\n=== 3. 무기 데이터 요약 ===');
for (const id of WEAPON_ORDER) {
  const w = WEAPONS[id];
  const sum = (d) => d.hits.reduce((s, h) => s + h.damage, 0);
  console.log(`  ${w.name}: 약 ${w.light.hits[0].from}f/${sum(w.light)}dmg/${reachOf(w.light)}px/전체${w.light.duration}f · 강 ${w.heavy.hits[0].from}f/${sum(w.heavy)}dmg/${reachOf(w.heavy)}px/전체${w.heavy.duration}f`);
}
console.log(`  체력 ${BALANCE.fighter.maxHp}, 특수강공 ${BALANCE.special.damage}`);
