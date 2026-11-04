// =============================================================================
// 무기 판정 ↔ 그림 일치 검사: node scripts/hit-visual-check.js
// 거리별로 "무기가 상대 몸을 지나가는데(그림) 피해가 없는" 경우를 센다.
//   - 보임: 공격의 모든 프레임에서 그려진 무기 선분이 상대 몸 사각형에 닿는가
//   - 판정: 판정 프레임 안에서 실제 판정(segs)이 닿는가
// 보이는데 판정이 전혀 없는 거리 = 눈에 띄는 헛맞음
// =============================================================================
import { WEAPONS, WEAPON_ORDER } from '../src/config/weapons.js';
import { framePieces } from '../src/render/hitGeometry.js';
import { segmentHitsRect } from '../src/core/combat.js';
import { BALANCE } from '../src/config/balance.js';

const F = BALANCE.fighter;
const offsetAt = (def, f) => { let x = 0; for (let k = 0; k < f; k++) for (const m of def.moves) if (k >= m.from && k <= m.to) x += m.vx; return x; };
const touches = (pieces, ox, d) => pieces.some(([x1, y1, x2, y2, r]) => segmentHitsRect(x1 + ox, y1, x2 + ox, y2, r, { x: d - F.width / 2, y: 0, w: F.width, h: F.height }));

let bad = 0, total = 0, early_n = 0;
for (const id of WEAPON_ORDER) {
  for (const def of [...WEAPONS[id].lights, ...WEAPONS[id].heavies]) {
    const miss = [];
    for (let d = 40; d <= 240; d += 10) {
      let seen = false, early = null, dmg = null;
      // 대기 자세에서 무기가 이미 상대에게 걸쳐 있는 거리는 제외 (휘두르기 전부터 닿아 있음 = 붙어 선 것)
      const p0 = framePieces(id, def, 0);
      if (p0 && touches(p0, 0, d)) continue;
      // 휘두르는 구간만 본다: 준비 동작 끝(첫 판정 8프레임 전)부터 마지막 판정 + 따라가기
      const s0 = Math.max(1, def.hits[0].from - 8), s1 = Math.min(def.duration - 1, def.hits.at(-1).to + 10);
      for (let f = s0; f <= s1; f++) {
        const p = framePieces(id, def, f);
        if (!p) continue;
        const ox = offsetAt(def, f);
        if (touches(p, ox, d)) { seen = true; if (early == null) early = f; }
        const hit = def.hits.find((h) => f >= h.from && f <= h.to);
        if (hit && dmg == null && hit.segs[f - hit.from].some((s) => touches([s], ox, d))) dmg = f;
      }
      total++;
      if (seen && dmg == null) { bad++; miss.push(`${d}`); }
      else if (seen && early < (dmg ?? 0) - 1) { early_n++; miss.push(`${d}(먼저 ${dmg - early}f)`); }
    }
    if (miss.length) console.log(`${id.padEnd(10)} ${def.name.padEnd(8)} 보이는데 안 맞음: ${miss.join(' ')}`);
  }
}
console.log(`휘두르는 무기가 닿는데 피해 없음: ${bad}/${total} · 피해보다 먼저 닿아 보임(2f 이상): ${early_n}/${total}`);
