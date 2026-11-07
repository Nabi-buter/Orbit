// =============================================================================
// 경기장 배경 (도트) — 여러 장소
// -----------------------------------------------------------------------------
// 경기마다 하나를 고르고(라운드가 바뀌어도 유지), 카메라가 경기장 전체 폭 그림을 잘라서 보여 준다.
// 장소마다:
//   build()            경기장 전체 폭(BW × PH) 그림 (한 번만 그려 둠)
//   far?               멀리 있는 풍경(하늘·도시) — 카메라보다 천천히 움직여 깊이감 (parallax)
//   animate(ctx, cam, t)  매 프레임 위에 덧그리는 작은 움직임 (조명 깜빡임, 횃불, 나뭇잎 …)
// 바닥 높이(GROUND)는 모든 장소가 같다 (캐릭터가 서는 줄).
// 그리기 전용 — 경기 계산과 무관하다.
// =============================================================================

import { STAGE } from '../config/balance.js';
import { PX, PW, PH, createArtCanvas, rect, text } from './pixel.js';

const GROUND = Math.round(STAGE.groundY / PX);
const BW = Math.ceil(STAGE.width / PX);
const MID = Math.round(BW / 2);
const CYAN = '#4fd1c1';

/** 장식 위치용 결정론적 난수 (그릴 때마다 같은 그림) */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const label = (g, str, cx, y, color) => text(g, str, cx, y, color, { align: 'center' });

/** 거리 눈금 (가운데 0M 에서 10M 간격) — 장소마다 색만 다르게 */
function distanceMarks(g, tick, num) {
  for (let k = -3; k <= 3; k++) {
    const mx = MID + k * 100;
    if (mx < 20 || mx > BW - 20) continue;
    rect(g, mx, GROUND + 2, 1, 8, tick);
    label(g, `${Math.abs(k) * 10}M`, mx, GROUND + 18, num);
  }
}

/** 경기장 끝 (벽) 표시 기둥 */
function boundaryPosts(g, body, edge, stripe) {
  for (const wx of [STAGE.leftWall - 40, STAGE.rightWall + 40]) {
    const x = Math.round(wx / PX);
    rect(g, x - 4, 26, 9, GROUND - 26, body);
    rect(g, x - 4, 26, 1, GROUND - 26, edge);
    for (let y = 40; y < GROUND - 10; y += 12) rect(g, x - 3, y, 7, 2, stripe);
  }
}

// -----------------------------------------------------------------------------
// 1) 훈련장 (실내 사격장 같은 회색 시설) — 원래 배경
// -----------------------------------------------------------------------------
function buildRange() {
  const W = BW;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  rect(g, 0, 0, W, 26, '#181b23');
  for (let x = 0; x < W; x += 32) rect(g, x, 0, 2, 26, '#20242e');
  for (let lx = 30, i = 0; lx < W - 20; lx += 64 + (i++ % 3) * 14) {
    rect(g, lx + 10, 18, 1, 12, '#2a2f3a');
    rect(g, lx, 30, 22, 2, '#dfe8f0');
    g.globalAlpha = 0.08; rect(g, lx - 10, 32, 42, 40, '#dfe8f0'); g.globalAlpha = 1;
  }
  rect(g, 0, 26, W, GROUND - 26, '#3a404d');
  for (let y = 26; y < GROUND; y += 38) rect(g, 0, y, W, 1, '#2d323d');
  for (let x = 0; x < W; x += 48) { rect(g, x, 26, 1, GROUND - 26, '#2d323d'); rect(g, x + 1, 26, 1, GROUND - 26, '#454c5a'); }
  for (let x = 0; x < W; x += 48) for (let y = 26; y < GROUND - 30; y += 38) { g.fillStyle = '#525a69'; g.fillRect(x + 4, y + 4, 1, 1); g.fillRect(x + 43, y + 4, 1, 1); }
  for (const vx of [60, 220, MID + 150, W - 120]) { rect(g, vx, 120, 30, 14, '#2b303a'); for (let k = 0; k < 5; k++) rect(g, vx + 2, 122 + k * 2, 26, 1, '#3f4552'); }
  for (const lx of [MID - 230, MID + 260]) {
    for (let k = 0; k < 3; k++) { rect(g, lx + k * 13, 110, 12, 38, '#323845'); rect(g, lx + k * 13, 110, 12, 1, '#4a5261'); rect(g, lx + k * 13 + 9, 126, 1, 4, '#7d838f'); }
  }
  for (const ex of [MID - 330, MID + 340]) { rect(g, ex, 128, 5, 12, '#a33a33'); rect(g, ex + 1, 125, 3, 3, '#2a2e37'); }
  rect(g, MID - 38, 68, 76, 22, '#162a2c');
  g.globalAlpha = 0.9; rect(g, MID - 38, 68, 76, 1, CYAN); rect(g, MID - 38, 89, 76, 1, CYAN); g.globalAlpha = 1;
  label(g, 'RANGE 01', MID, 72, CYAN);
  label(g, 'DUEL ZONE', MID, 81, '#2f8f86');
  for (const [sx, l] of [[MID - 260, 'A'], [MID + 260, 'B']]) {
    rect(g, sx - 9, 74, 18, 14, '#20242e'); rect(g, sx - 9, 74, 18, 1, '#e7b93c');
    label(g, l, sx, 78, '#e7b93c');
  }
  for (let x = 0; x < W; x += 1) rect(g, x, GROUND - 8, 1, 6, Math.floor((x + 3) / 6) % 2 ? '#e7b93c' : '#1d1f25');
  rect(g, 0, GROUND - 9, W, 1, '#22252d');
  rect(g, 0, GROUND - 2, W, 2, '#2a2e37');
  boundaryPosts(g, '#2a2f3a', '#4a5261', '#e7b93c');
  rect(g, 0, GROUND, W, PH - GROUND, '#565c68');
  rect(g, 0, GROUND, W, 1, '#8a909e');
  for (let x = 0; x < W; x += 3) for (let y = GROUND + 2; y < PH; y += 4) if ((x * 7 + y * 13) % 11 === 0) rect(g, x, y, 1, 1, '#4c525d');
  for (let x = 8; x < W; x += 20) rect(g, x, GROUND + 14, 10, 1, '#e7b93c');
  distanceMarks(g, '#c9ccd4', '#7d838f');
  rect(g, 0, PH - 10, W, 10, '#3f444e');
  return canvas;
}
function animateRange(ctx, cam, t) {
  // 천장 조명 미세한 깜빡임 + 홀로그램 표지 스캔선
  if (t % 180 < 3) { ctx.globalAlpha = 0.25; rect(ctx, MID - 120 - cam, 30, 22, 1, '#000'); ctx.globalAlpha = 1; }
  const scan = (t >> 1) % 18;
  ctx.globalAlpha = 0.5; rect(ctx, MID - 36 - cam, 70 + scan, 72, 1, CYAN); ctx.globalAlpha = 1;
}

// -----------------------------------------------------------------------------
// 2) 도장 (나무 마루, 창호지 미닫이 벽, 걸린 족자와 등)
// -----------------------------------------------------------------------------
/** 걸린 등 위치 (그림과 흔들림이 같은 자리) */
const DOJO_LANTERNS = (() => { const r = rng(7), out = []; for (let lx = 90; lx < BW - 40; lx += 150 + Math.floor(r() * 40)) out.push(lx); return out; })();
function buildDojo() {
  const W = BW;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  const r = rng(8);
  // 천장 서까래
  rect(g, 0, 0, W, 30, '#2a1d16');
  for (let x = 0; x < W; x += 40) { rect(g, x, 0, 6, 30, '#3a291f'); rect(g, x, 0, 1, 30, '#4b3628'); }
  rect(g, 0, 28, W, 4, '#4b3628'); rect(g, 0, 31, W, 1, '#1d140f');
  // 창호지 미닫이 (격자) — 칸마다 따뜻한 빛
  rect(g, 0, 32, W, GROUND - 32, '#e9dcc0');
  for (let x = 0; x < W; x += 56) {
    rect(g, x, 32, 4, GROUND - 32, '#5a3f2c'); rect(g, x, 32, 1, GROUND - 32, '#6f4f38');
    for (let gx = x + 4 + 13; gx < x + 56; gx += 13) rect(g, gx, 36, 1, GROUND - 60, '#b9a481');
    for (let gy = 36; gy < GROUND - 24; gy += 16) rect(g, x + 4, gy, 52, 1, '#b9a481');
  }
  rect(g, 0, 32, W, 4, '#5a3f2c');
  rect(g, 0, GROUND - 24, W, 24, '#6f4f38'); rect(g, 0, GROUND - 24, W, 1, '#8a6548');
  for (let x = 0; x < W; x += 56) rect(g, x, GROUND - 24, 4, 24, '#4b3628');
  // 족자 (가운데 · 양옆)
  for (const [sx, h, accent] of [[MID, 70, '#a8322b'], [MID - 210, 56, '#2c4a6e'], [MID + 210, 56, '#2c4a6e']]) {
    rect(g, sx - 13, 44, 26, h, '#f4ecd8'); rect(g, sx - 14, 42, 28, 3, '#3a291f'); rect(g, sx - 14, 44 + h, 28, 3, '#3a291f');
    rect(g, sx - 1, 52, 2, h - 18, accent); rect(g, sx - 6, 58, 12, 2, accent); rect(g, sx - 4, 70, 8, 2, accent);
  }
  // 걸린 등 (빛 번짐)
  for (const lx of DOJO_LANTERNS) {
    rect(g, lx, 32, 1, 10, '#3a291f');
    rect(g, lx - 5, 42, 11, 14, '#d9a35a'); rect(g, lx - 5, 42, 11, 1, '#3a291f'); rect(g, lx - 5, 55, 11, 1, '#3a291f');
    g.globalAlpha = 0.12; rect(g, lx - 18, 38, 37, 34, '#ffcf7a'); g.globalAlpha = 1;
  }
  boundaryPosts(g, '#3a291f', '#6f4f38', '#a8322b');
  // 마루 (널판 이음매 · 결)
  rect(g, 0, GROUND, W, PH - GROUND, '#9a6a3f');
  rect(g, 0, GROUND, W, 1, '#c99460');
  for (let y = GROUND + 6; y < PH; y += 7) rect(g, 0, y, W, 1, '#7a5230');
  for (let y = GROUND + 1, row = 0; y < PH; y += 7, row++) for (let x = (row * 37) % 90; x < W; x += 90) rect(g, x, y, 1, 6, '#6f4a2b');
  for (let k = 0; k < 500; k++) rect(g, Math.floor(r() * W), GROUND + 2 + Math.floor(r() * (PH - GROUND - 2)), 3, 1, '#8a5d36');
  distanceMarks(g, '#f4ecd8', '#5a3f2c');
  return canvas;
}
function animateDojo(ctx, cam, t) {
  // 등불이 아주 조금 흔들림
  DOJO_LANTERNS.forEach((lx, i) => {
    const x = lx - cam;
    if (x < -20 || x > PW + 20) return;
    ctx.globalAlpha = 0.05 + 0.04 * Math.sin(t * 0.07 + i);
    rect(ctx, x - 14, 40, 29, 28, '#ffd98a');
  });
  ctx.globalAlpha = 1;
}

// -----------------------------------------------------------------------------
// 3) 밤 옥상 (도시 야경, 달, 물탱크, 난간) — 먼 도시는 천천히 움직임
// -----------------------------------------------------------------------------
const ROOF_FAR = 0.35; // 먼 도시가 카메라를 따라가는 비율
function buildRooftopFar() {
  const W = Math.ceil(PW + (BW - PW) * ROOF_FAR) + 4;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  const r = rng(21);
  // 밤하늘 (위가 어둡게, 지평선이 보랏빛)
  const sky = ['#0b0d1a', '#10142a', '#171b38', '#211f46', '#2f2550', '#43305a'];
  sky.forEach((c, i) => rect(g, 0, i * 22, W, 22, c));
  rect(g, 0, sky.length * 22, W, PH, sky.at(-1));
  for (let k = 0; k < 140; k++) { g.globalAlpha = 0.4 + r() * 0.6; rect(g, Math.floor(r() * W), Math.floor(r() * 90), 1, 1, '#dfe6ff'); }
  g.globalAlpha = 1;
  // 달
  const mx = Math.round(W * 0.7);
  for (let dy = -9; dy <= 9; dy++) { const w = Math.round(Math.sqrt(81 - dy * dy)); rect(g, mx - w, 40 + dy, w * 2 + 1, 1, '#f1edd6'); }
  rect(g, mx + 2, 37, 3, 2, '#d8d2b6'); rect(g, mx - 4, 43, 2, 2, '#d8d2b6');
  g.globalAlpha = 0.07; rect(g, mx - 22, 18, 45, 45, '#f1edd6'); g.globalAlpha = 1;
  // 먼 빌딩 (두 겹)
  for (const [base, col, win, step] of [[150, '#1a1c30', '#3b3f66', 1], [118, '#13152a', '#e8c86a', 2]]) {
    for (let x = -4; x < W;) {
      const bw = 14 + Math.floor(r() * 26), bh = 30 + Math.floor(r() * (base - 40));
      const top = GROUND - 30 - bh + (step === 1 ? -10 : 0);
      rect(g, x, top, bw, GROUND - top, col);
      if (r() < 0.3) rect(g, x + Math.floor(bw / 2), top - 6, 1, 6, col);
      for (let wy = top + 4; wy < GROUND - 34; wy += 5) for (let wx = x + 2; wx < x + bw - 2; wx += 4) if (r() < (step === 2 ? 0.28 : 0.12)) rect(g, wx, wy, 2, 2, win);
      x += bw + Math.floor(r() * 4);
    }
  }
  return canvas;
}
function buildRooftop() {
  const W = BW;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  const r = rng(33);
  // 옥상 구조물 (가까이): 물탱크, 환기탑, 안테나
  for (const tx of [MID - 300, MID + 230, 70, W - 110]) {
    rect(g, tx, GROUND - 70, 4, 50, '#2a2d3d'); rect(g, tx + 30, GROUND - 70, 4, 50, '#2a2d3d');
    rect(g, tx - 4, GROUND - 110, 42, 42, '#3a3348'); rect(g, tx - 4, GROUND - 110, 42, 2, '#55496a');
    for (let y = GROUND - 104; y < GROUND - 70; y += 8) rect(g, tx - 4, y, 42, 1, '#2e2a3c');
    rect(g, tx - 6, GROUND - 114, 46, 5, '#2e2a3c');
  }
  for (const vx of [MID - 120, MID + 110]) { rect(g, vx, GROUND - 40, 22, 20, '#33354a'); rect(g, vx - 2, GROUND - 42, 26, 3, '#44475f'); for (let k = 0; k < 4; k++) rect(g, vx + 3, GROUND - 36 + k * 4, 16, 1, '#26283a'); }
  rect(g, MID + 20, GROUND - 150, 2, 130, '#2a2d3d'); rect(g, MID + 14, GROUND - 120, 14, 1, '#2a2d3d'); rect(g, MID + 16, GROUND - 100, 10, 1, '#2a2d3d');
  // 난간
  rect(g, 0, GROUND - 22, W, 2, '#4a4d63');
  for (let x = 0; x < W; x += 16) rect(g, x, GROUND - 22, 2, 20, '#3a3c50');
  rect(g, 0, GROUND - 12, W, 1, '#3a3c50');
  boundaryPosts(g, '#2a2d3d', '#4a4d63', '#d9655b');
  // 바닥 (방수 콘크리트, 배수 줄, 웅덩이 반사)
  rect(g, 0, GROUND, W, PH - GROUND, '#3d3f50');
  rect(g, 0, GROUND, W, 1, '#6b6e88');
  for (let x = 0; x < W; x += 64) rect(g, x, GROUND + 1, 1, PH - GROUND, '#34364a');
  for (let k = 0; k < 7; k++) { const px = Math.floor(r() * (W - 60)); g.globalAlpha = 0.35; rect(g, px, GROUND + 6 + Math.floor(r() * 18), 30 + Math.floor(r() * 30), 2, '#6b6e9a'); g.globalAlpha = 1; }
  for (let x = 0; x < W; x += 3) for (let y = GROUND + 2; y < PH; y += 4) if ((x * 5 + y * 11) % 13 === 0) rect(g, x, y, 1, 1, '#34364a');
  distanceMarks(g, '#8f92ad', '#6b6e88');
  return canvas;
}
function animateRooftop(ctx, cam, t) {
  // 안테나 끝 빨간 불 깜빡임
  if (t % 90 < 45) { rect(ctx, MID + 19 - cam, GROUND - 153, 4, 3, '#ff4a4a'); ctx.globalAlpha = 0.25; rect(ctx, MID + 15 - cam, GROUND - 157, 12, 11, '#ff4a4a'); ctx.globalAlpha = 1; }
}

// -----------------------------------------------------------------------------
// 4) 노을 투기장 (돌 아치, 모래 바닥, 횃불)
// -----------------------------------------------------------------------------
const ARENA_FAR = 0.25;
function buildArenaFar() {
  const W = Math.ceil(PW + (BW - PW) * ARENA_FAR) + 4;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  const r = rng(51);
  const sky = ['#3a2448', '#5a2f4e', '#86404c', '#b85a45', '#de8a4c', '#f2b35e'];
  sky.forEach((c, i) => rect(g, 0, i * 18, W, 18, c));
  rect(g, 0, sky.length * 18, W, PH, sky.at(-1));
  // 해
  const sx = Math.round(W * 0.35);
  for (let dy = -12; dy <= 0; dy++) { const w = Math.round(Math.sqrt(144 - dy * dy)); rect(g, sx - w, 112 + dy, w * 2 + 1, 1, '#ffe2a0'); }
  // 구름 띠
  for (let k = 0; k < 9; k++) { const cx = Math.floor(r() * W), cy = 20 + Math.floor(r() * 70); g.globalAlpha = 0.35; rect(g, cx, cy, 30 + Math.floor(r() * 40), 3, '#f7c9a0'); rect(g, cx + 6, cy - 2, 20, 2, '#f7c9a0'); g.globalAlpha = 1; }
  // 먼 언덕
  for (let x = 0; x < W; x++) { const h = 14 + Math.round(8 * Math.sin(x / 37) + 5 * Math.sin(x / 13)); rect(g, x, 112 - h, 1, h, '#7a3f48'); }
  return canvas;
}
function buildArena() {
  const W = BW;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  const r = rng(61);
  // 관중석 벽 (돌, 아치 두 층) — 아치 사이로 하늘이 보이게 아치 안은 비움
  const wallTop = 70;
  for (let x = 0; x < W; x += 1) {
    for (let y = wallTop; y < GROUND; y++) {
      const ax = x % 44, ay1 = y - (wallTop + 8), ay2 = y - (wallTop + 64);
      const inArch1 = ax > 10 && ax < 34 && ay1 > 0 && ay1 < 40 && (ay1 > 10 || (ax - 22) ** 2 + (ay1 - 10) ** 2 < 144);
      const inArch2 = ax > 12 && ax < 32 && ay2 > 0 && ay2 < 50 && (ay2 > 9 || (ax - 22) ** 2 + (ay2 - 9) ** 2 < 100);
      if (inArch1 || inArch2) continue;
      const brick = ((y >> 2) + (((x + ((y >> 2) % 2) * 4) >> 3))) % 7 === 0;
      g.fillStyle = brick ? '#8c6a52' : (y - wallTop) % 4 === 0 ? '#9c7a60' : '#b08b6c';
      g.fillRect(x, y, 1, 1);
    }
  }
  rect(g, 0, wallTop, W, 3, '#d2ad86'); rect(g, 0, wallTop + 56, W, 3, '#d2ad86');
  rect(g, 0, GROUND - 12, W, 12, '#7f5f48'); rect(g, 0, GROUND - 12, W, 1, '#a78466');
  // 깃발
  for (let fx = 40, i = 0; fx < W; fx += 132, i++) { rect(g, fx, wallTop - 30, 1, 30, '#4a3628'); rect(g, fx + 1, wallTop - 30, 12, 8, i % 2 ? '#3c5f99' : '#a8322b'); }
  // 횃불 받침
  for (let tx = 66; tx < W - 30; tx += 176) { rect(g, tx - 1, GROUND - 46, 3, 30, '#4a3628'); rect(g, tx - 4, GROUND - 48, 9, 3, '#2e2420'); }
  boundaryPosts(g, '#6d523f', '#a78466', '#e7b93c');
  // 모래 바닥 (자국 · 자갈)
  rect(g, 0, GROUND, W, PH - GROUND, '#cfa572');
  rect(g, 0, GROUND, W, 1, '#e8c592');
  for (let k = 0; k < 900; k++) rect(g, Math.floor(r() * W), GROUND + 2 + Math.floor(r() * (PH - GROUND - 2)), 1, 1, r() < 0.5 ? '#b88e5d' : '#dcb684');
  for (let k = 0; k < 40; k++) { g.globalAlpha = 0.4; rect(g, Math.floor(r() * W), GROUND + 4 + Math.floor(r() * 24), 8 + Math.floor(r() * 14), 1, '#a87f50'); g.globalAlpha = 1; }
  distanceMarks(g, '#7f5f48', '#8c6a52');
  return canvas;
}
function animateArena(ctx, cam, t) {
  // 횃불 불꽃 (3단 흔들림)
  for (let tx = 66, i = 0; tx < BW - 30; tx += 176, i++) {
    const x = tx - cam;
    if (x < -10 || x > PW + 10) continue;
    const f = Math.floor((t / 5 + i * 3) % 3);
    rect(ctx, x - 2, GROUND - 53 - f, 5, 5 + f, '#e8742f');
    rect(ctx, x - 1, GROUND - 51 - f, 3, 3 + f, '#ffd36b');
    ctx.globalAlpha = 0.12; rect(ctx, x - 9, GROUND - 62, 19, 18, '#ffb14f'); ctx.globalAlpha = 1;
  }
}

// -----------------------------------------------------------------------------
// 5) 대나무 숲 (안개, 흙길, 떨어지는 잎)
// -----------------------------------------------------------------------------
const FOREST_FAR = 0.4;
function buildForestFar() {
  const W = Math.ceil(PW + (BW - PW) * FOREST_FAR) + 4;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  const r = rng(77);
  const sky = ['#c7d9c0', '#b5ccae', '#a3bf9c', '#91b28a'];
  sky.forEach((c, i) => rect(g, 0, i * 30, W, 30, c));
  rect(g, 0, 120, W, PH, '#91b28a');
  // 먼 대나무 (흐릿하게 두 겹)
  for (const [col, n, wmax] of [['#8aa883', 70, 3], ['#6f9068', 50, 4]]) {
    for (let k = 0; k < n; k++) {
      const x = Math.floor(r() * W), w = 2 + Math.floor(r() * (wmax - 1));
      rect(g, x, 0, w, GROUND, col);
      for (let y = 10 + Math.floor(r() * 20); y < GROUND; y += 22 + Math.floor(r() * 10)) rect(g, x - 1, y, w + 2, 1, '#5d7d57');
    }
  }
  g.globalAlpha = 0.25; rect(g, 0, GROUND - 60, W, 60, '#e4eedf'); g.globalAlpha = 1;
  return canvas;
}
function buildForest() {
  const W = BW;
  const { canvas, ctx: g } = createArtCanvas(W, PH);
  const r = rng(91);
  // 가까운 대나무 (굵게, 마디, 잎)
  for (let x = 6; x < W; x += 26 + Math.floor(r() * 40)) {
    const w = 4 + Math.floor(r() * 3);
    rect(g, x, 0, w, GROUND, '#3f6b3a'); rect(g, x, 0, 1, GROUND, '#5c8c4f'); rect(g, x + w - 1, 0, 1, GROUND, '#2d4f2a');
    for (let y = 8 + Math.floor(r() * 16); y < GROUND - 4; y += 24 + Math.floor(r() * 8)) {
      rect(g, x - 1, y, w + 2, 2, '#2d4f2a');
      if (r() < 0.45) { const dir = r() < 0.5 ? -1 : 1; for (let k = 0; k < 9; k++) rect(g, x + (dir > 0 ? w : -1) + dir * k, y - 1 - Math.floor(k / 3), 1, 1, '#4f8a3f'); }
    }
  }
  // 돌 등롱 (가운데 양옆)
  for (const lx of [MID - 160, MID + 160]) {
    rect(g, lx - 2, GROUND - 30, 5, 30, '#8d9088'); rect(g, lx - 7, GROUND - 38, 15, 8, '#9ea19a'); rect(g, lx - 4, GROUND - 36, 9, 4, '#f2d58e');
    rect(g, lx - 9, GROUND - 42, 19, 4, '#7d8078'); rect(g, lx - 6, GROUND - 4, 13, 4, '#7d8078');
  }
  boundaryPosts(g, '#4a3a2a', '#6f5a42', '#c9a85a');
  // 흙길 + 풀
  rect(g, 0, GROUND, W, PH - GROUND, '#7a5f3e');
  rect(g, 0, GROUND, W, 1, '#9a7b52');
  for (let k = 0; k < 700; k++) rect(g, Math.floor(r() * W), GROUND + 2 + Math.floor(r() * (PH - GROUND - 2)), 1, 1, r() < 0.5 ? '#6a5134' : '#8a6c46');
  for (let x = 0; x < W; x += 2) if (r() < 0.6) rect(g, x, GROUND - 1 - Math.floor(r() * 3), 1, 2 + Math.floor(r() * 2), '#5c8c4f');
  distanceMarks(g, '#c9b98a', '#5a4630');
  return canvas;
}
function animateForest(ctx, cam, t) {
  // 떨어지는 잎 (화면 기준, 바람에 흔들리며)
  for (let i = 0; i < 9; i++) {
    const period = 300 + i * 37;
    const p = ((t + i * 97) % period) / period;
    const x = ((i * 53 + Math.sin(p * 6 + i) * 12 + p * 40) % PW + PW) % PW;
    const y = Math.floor(p * (GROUND + 10)) - 8;
    rect(ctx, Math.round(x), y, 2, 1, i % 3 ? '#7fb35e' : '#c9b04a');
  }
}

// -----------------------------------------------------------------------------
export const BACKGROUNDS = [
  { id: 'range', name: '훈련 시설', build: buildRange, animate: animateRange },
  { id: 'dojo', name: '도장', build: buildDojo, animate: animateDojo },
  { id: 'rooftop', name: '밤 옥상', build: buildRooftop, far: buildRooftopFar, farRate: ROOF_FAR, animate: animateRooftop },
  { id: 'arena', name: '노을 투기장', build: buildArena, far: buildArenaFar, farRate: ARENA_FAR, animate: animateArena },
  { id: 'forest', name: '대나무 숲', build: buildForest, far: buildForestFar, farRate: FOREST_FAR, animate: animateForest },
];

const built = new Map();
/** 장소 그림 (처음 쓸 때 한 번만 그림) */
export function backgroundOf(id) {
  const def = BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
  if (!built.has(def.id)) built.set(def.id, { def, near: def.build(), far: def.far ? def.far() : null });
  return built.get(def.id);
}

/** 경기장 배경 그리기 (cam = 카메라 왼쪽 끝, 아트 px) */
export function drawStageBackground(ctx, id, cam, t) {
  const bg = backgroundOf(id);
  if (bg.far) ctx.drawImage(bg.far, -Math.round(cam * bg.def.farRate), 0);
  ctx.drawImage(bg.near, -cam, 0);
  bg.def.animate?.(ctx, cam, t);
}

/** 경기마다 고르는 배경: 온라인은 경기 번호로 정해 두 사람이 같은 장소를 본다 */
export function pickBackground(seed = null) {
  const n = BACKGROUNDS.length;
  const i = seed == null ? Math.floor(Math.random() * n) : ((seed * 2654435761) >>> 0) % n;
  return BACKGROUNDS[i].id;
}

/** 메뉴 화면용 (예전 함수 이름 유지): 훈련 시설 그림 */
export function buildBackground() { return backgroundOf('range').near; }
