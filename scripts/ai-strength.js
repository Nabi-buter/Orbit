// =============================================================================
// AI 난이도 강도 측정 (병렬)
//   node scripts/ai-strength.js [판수=20] [시드=1] ['{"comboPlan":false}' 어려움 수치 바꿔 보기]
// 1) 어려움 vs 보통 승률 (무기 7종 돌려가며, 좌우 교대)
// 2) 어려움 AI 의 분당 완벽패링 · 콤보(연속 적중) 평균 길이 · 3타 이상 비율
// 3) 습관 봇 vs 어려움 AI: 가만히 · 약공 연타 · 강공 연타 · 가드만 · 대시 돌진 · 점프 공격 · 치고 빠지기
// =============================================================================
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { Match } from '../src/core/match.js';
import { AIController, DIFFICULTY } from '../src/ai/ai.js';
import { WEAPON_ORDER } from '../src/config/weapons.js';
import { reachOf } from '../src/core/attackDef.js';
import { S } from '../src/core/fighter.js';

const MAX = 60 * 60 * 4;
const toward = (me, op) => (op.x > me.x ? 'right' : 'left');
const away = (me, op) => (op.x > me.x ? 'left' : 'right');
export const BOTS = {
  idle: () => ({}),
  lightSpam: (m, k) => { const [b, a] = m.fighters; const d = Math.abs(a.x - b.x); return { light: k % 6 === 0, [toward(b, a)]: d > reachOf(b.weapon.light) - 5 }; },
  heavySpam: (m, k) => { const [b, a] = m.fighters; const d = Math.abs(a.x - b.x); return { heavy: k % 6 === 0, [toward(b, a)]: d > reachOf(b.weapon.heavy) - 10 }; },
  turtle: () => ({ guard: true }),
  // 멀면 대시로 파고들어 약공 두 번, 다시 물러남
  dashIn: (m, k) => { const [b, a] = m.fighters; const d = Math.abs(a.x - b.x); const ph = k % 70; if (d > 200) return { dash: ph % 20 === 0, [toward(b, a)]: true }; return ph < 30 ? { light: ph % 10 === 0 } : { [away(b, a)]: true }; },
  // 점프로 들어와 낙하 공격
  jumpIn: (m, k) => { const [b, a] = m.fighters; const d = Math.abs(a.x - b.x); const ph = k % 50; return { up: ph === 0, [toward(b, a)]: d > 60, heavy: b.state === S.JUMP && b.vy < 0 }; },
  // 약공으로 들어오고, 맞거나 막히면 바로 뒤 대시로 빠짐
  hitAndRun: (m, k) => { const [b, a] = m.fighters; const d = Math.abs(a.x - b.x); if (b.state === S.HITSTUN || b.state === S.BLOCKSTUN) return { dash: true, [away(b, a)]: true }; return { light: d < reachOf(b.weapon.light) && k % 8 === 0, [toward(b, a)]: d > reachOf(b.weapon.light) - 10 }; },
};

/** 한 판 + 통계 (side = 측정할 AI 쪽) */
function play(wa, wb, ctrl, side) {
  const m = new Match({ weapons: [wa, wb] });
  const st = { perfects: 0, combos: [], cur: 0, lastHit: -999 };
  let k = 0;
  while (!m.over && m.frame < MAX) {
    const ev = m.step([ctrl[0](m, k), ctrl[1](m, k)]); k++;
    for (const e of ev) {
      if (e.type === 'perfect' && e.defender === side) st.perfects++;
      if (e.type === 'hit' && e.attacker === side && e.kind !== 'ultimate') {
        if (m.frame - st.lastHit < 60 && m.fighters[1 - side].state === S.HITSTUN) st.cur++;
        else { if (st.cur) st.combos.push(st.cur); st.cur = 1; }
        st.lastHit = m.frame;
      }
    }
  }
  if (st.cur) st.combos.push(st.cur);
  const me = m.fighters[side];
  return { win: m.winner === side ? 1 : m.winner === 'draw' ? 0.5 : 0, perfects: st.perfects, combos: st.combos, frames: m.frame, dmg: 1 - (me.hp / me.maxHp + (m.lives[side] - 1)) / 2 };
}
const aiCtrl = (diff, seed, idx) => { const ai = new AIController(diff, seed); return (m) => ai.think(m, idx); };

/** 작업 하나: {kind:'vs', i} 또는 {kind:'bot', diff, bot, i} */
function job(j, SEED) {
  if (j.kind === 'vs') {
    const i = j.i;
    const wa = WEAPON_ORDER[(i * 3 + SEED) % 7], wb = WEAPON_ORDER[(i * 5 + SEED * 2) % 7];
    const hs = i % 2;
    const ctrl = hs === 0 ? [aiCtrl('hard', SEED * 1000 + i, 0), aiCtrl('normal', SEED * 1000 + i + 500, 1)] : [aiCtrl('normal', SEED * 1000 + i + 500, 0), aiCtrl('hard', SEED * 1000 + i, 1)];
    return play(wa, wb, ctrl, hs);
  }
  const wb = WEAPON_ORDER[(j.i + SEED) % 7], wa = WEAPON_ORDER[(j.i * 3 + SEED) % 7];
  return play(wb, wa, [(m, k) => BOTS[j.bot](m, k), aiCtrl(j.diff, SEED * 77 + j.i, 1)], 1);
}

if (isMainThread) {
  const N = Number(process.argv[2] || 20), SEED = Number(process.argv[3] || 1), over = JSON.parse(process.argv[4] || '{}');
  const jobs = [];
  for (let i = 0; i < N * 7; i++) jobs.push({ kind: 'vs', i });
  for (const diff of ['normal', 'hard']) for (const bot of Object.keys(BOTS)) for (let i = 0; i < N; i++) jobs.push({ kind: 'bot', diff, bot, i });
  const W = Math.max(1, cpus().length), chunks = Array.from({ length: W }, (_, w) => jobs.filter((_, i) => i % W === w));
  const results = (await Promise.all(chunks.map((c) => new Promise((res) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c, SEED, over } });
    w.on('message', res);
  })))).flat();
  const vs = results.filter((r) => r.j.kind === 'vs');
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const combos = vs.flatMap((r) => r.combos);
  console.log(`어려움 vs 보통: 어려움 승률 ${(sum(vs, (r) => r.win) / vs.length * 100).toFixed(1)}% · 분당 완벽패링 ${(sum(vs, (r) => r.perfects) / (sum(vs, (r) => r.frames) / 3600)).toFixed(2)} · 콤보 평균 ${(combos.reduce((a, b) => a + b, 0) / combos.length).toFixed(2)}타 · 3타 이상 ${(combos.filter((c) => c >= 3).length / combos.length * 100).toFixed(0)}% (${vs.length}판)`);
  for (const diff of ['normal', 'hard']) {
    const line = Object.keys(BOTS).map((bot) => {
      const rs = results.filter((r) => r.j.kind === 'bot' && r.j.diff === diff && r.j.bot === bot);
      return `${bot} ${(sum(rs, (r) => r.win) / rs.length * 100).toFixed(0)}%/${(sum(rs, (r) => r.dmg) / rs.length * 100).toFixed(0)}`;
    });
    console.log(`${diff.padEnd(6)} 습관 봇 상대 AI승률/AI피해%: ${line.join(' · ')}`);
  }
} else {
  const { jobs, SEED, over } = workerData;
  Object.assign(DIFFICULTY.hard, over);
  parentPort.postMessage(jobs.map((j) => ({ j, ...job(j, SEED) })));
}
