// =============================================================================
// 무기 밸런스 자동 탐색 (AI 대 AI 시뮬레이션 기반)
//   node scripts/tune.js [라운드=12] [조합당판수=12]
// 1단계: 콤보·리치·데미지·공격속도(4개 주 변수)만 조정
// 2단계: 그래도 승률 편차가 크면 체력·가드 감소량(보조 변수) 조정
// 무기 정체성 규칙(tests/weapons.test.js 와 같은 조건)을 깨는 변경은 되돌린다.
// 결과 변수 표를 출력한다 → src/config/weapons.js 의 KNOBS 에 반영.
// =============================================================================

import { evaluateAll } from './evalcore.js';
import { WEAPON_ORDER, WEAPONS, KNOBS, applyKnobs } from '../src/config/weapons.js';
import { reachOf } from '../src/core/attackDef.js';

const ROUNDS = Number(process.argv[2] || 12);
const N = Number(process.argv[3] || 10); // 조합 × 난이도쌍(9)당 판수

const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => Math.round(v * 100) / 100;

function evaluate(seedBase = 1000) {
  return evaluateAll(WEAPON_ORDER, N, seedBase).rates;
}

/** 무기 정체성 규칙 (테스트와 동일 취지) */
function identityOK() {
  const W = WEAPONS;
  const su = (id, k) => W[id][k].hits[0].from;
  const dmg = (id, k) => W[id][k].hits.reduce((s, h) => s + h.damage, 0);
  for (const id of WEAPON_ORDER) {
    if (id === 'greatsword') continue;
    if (su('greatsword', 'heavy') < su(id, 'heavy')) return 'greatsword 가장 느린 강공';
    if (dmg('greatsword', 'heavy') <= dmg(id, 'heavy')) return 'greatsword 최고 강공 피해';
  }
  for (const id of WEAPON_ORDER) if (id !== 'spear' && reachOf(W.spear.light) <= reachOf(W[id].light)) return 'spear 최장 약공';
  for (const id of ['longsword', 'greatsword', 'axe', 'spear']) {
    if (su('dagger', 'light') >= su(id, 'light') || su('knuckle', 'light') >= su(id, 'light')) return '단검/너클 최속 약공';
    if (reachOf(W.knuckle.light) >= reachOf(W[id].light)) return '너클 최단 사거리';
  }
  if (reachOf(W.knuckle.light) >= reachOf(W.dagger.light)) return '너클 < 단검 사거리';
  const hits = (id) => [...W[id].lights, ...W[id].heavies].flatMap((d) => d.hits);
  const avg = (a) => a.reduce((s, h) => s + h.damage, 0) / a.length;
  if (avg(hits('dagger')) <= avg(hits('knuckle')) * 1.4) return '단검 한 타 > 너클 한 타 ×1.4';
  if (W.knuckle.combo.lightMax <= W.dagger.combo.lightMax) return '너클 콤보 > 단검 콤보';
  for (const id of WEAPON_ORDER) if (W[id].combo.heavyMax >= W[id].combo.lightMax) return '강공 콤보 < 약공 콤보';
  return null;
}

function setKnob(id, kn) { applyKnobs(id, kn); }

function spread(rates) { const v = Object.values(rates); return Math.max(...v) - Math.min(...v); }
function show(rates) { return WEAPON_ORDER.map((w) => `${WEAPONS[w].name} ${(rates[w] * 100).toFixed(0)}`).join(' · '); }

let rates = evaluate();
console.log(`시작  편차 ${(spread(rates) * 100).toFixed(1)}%p  | ${show(rates)}`);
let best = { spread: spread(rates), knobs: clone(KNOBS), rates };

let gain = 1; // 나빠지면 절반으로 줄이는 보폭

function step(phase) {
  for (const id of WEAPON_ORDER) {
    const err = rates[id] - 0.5;
    if (Math.abs(err) < 0.02) continue;
    // 변수를 하나씩 바꾸고, 무기 정체성 규칙을 깨는 변수만 되돌린다
    const tries = phase === 1
      ? [
        (kn) => { kn.speed = r2(clamp(kn.speed * (1 + 0.25 * gain * err), 1.0, 1.6)); },
        (kn) => { kn.damage = r2(clamp(kn.damage * (1 - 0.6 * gain * err), 0.75, 1.3)); },
        (kn) => { kn.reach = r2(clamp(kn.reach * (1 - 0.25 * gain * err), 0.85, 1.15)); },
        (kn) => {
          const minTotal = Math.max(kn.combo.lightMax, kn.combo.heavyMax);
          if (err < -0.1) kn.combo.maxTotal = Math.min(kn.combo.maxTotal + 1, kn.combo.lightMax + kn.combo.heavyMax);
          if (err > 0.1) kn.combo.maxTotal = Math.max(kn.combo.maxTotal - 1, minTotal);
        },
      ]
      : [
        (kn) => { kn.hp = r2(clamp(kn.hp * (1 - 0.3 * gain * err), 0.85, 1.2)); },
        (kn) => { kn.guardTaken = r2(clamp(kn.guardTaken * (1 + 0.4 * gain * err), 0.8, 1.25)); },
      ];
    for (const t of tries) {
      const before = clone(KNOBS[id]);
      const kn = clone(before);
      t(kn);
      setKnob(id, kn);
      if (identityOK()) setKnob(id, before);
    }
  }
}

for (const phase of [1, 2]) {
  const rounds = phase === 1 ? ROUNDS : Math.ceil(ROUNDS / 2);
  if (phase === 2 && best.spread <= 0.08) { console.log('1단계로 편차 8%p 이내 → 보조 변수 조정 생략'); break; }
  for (const id of WEAPON_ORDER) setKnob(id, clone(best.knobs[id]));
  rates = best.rates;
  gain = 1;
  for (let r = 1; r <= rounds; r++) {
    step(phase);
    rates = evaluate();
    const s = spread(rates);
    console.log(`${phase}단계 ${String(r).padStart(2)}  편차 ${(s * 100).toFixed(1)}%p  보폭 ${gain.toFixed(2)} | ${show(rates)}`);
    if (s < best.spread) best = { spread: s, knobs: clone(KNOBS), rates };
    else {
      // 나빠졌으면 최적값으로 되돌리고 보폭 절반
      for (const id of WEAPON_ORDER) setKnob(id, clone(best.knobs[id]));
      rates = best.rates;
      gain *= 0.5;
      if (gain < 0.1) break;
    }
  }
}

// 다른 시드로 검증
for (const id of WEAPON_ORDER) setKnob(id, clone(best.knobs[id]));
const check = evaluate(777777);
console.log(`\n최적 (탐색 시드) 편차 ${(best.spread * 100).toFixed(1)}%p | ${show(best.rates)}`);
console.log(`검증 (새 시드)   편차 ${(spread(check) * 100).toFixed(1)}%p | ${show(check)}`);
console.log('\nKNOBS =');
for (const id of WEAPON_ORDER) console.log(`  ${id}: ${JSON.stringify(best.knobs[id])},`);
