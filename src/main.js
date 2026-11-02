// =============================================================================
// 진입점: 고정 프레임(60fps) 게임 루프
// =============================================================================

import { FPS } from './config/balance.js';
import { Match } from './core/match.js';
import { Keyboard } from './input/keyboard.js';
import { Renderer } from './render/renderer.js';

const canvas = document.getElementById('game');
const keyboard = new Keyboard();
const renderer = new Renderer(canvas);
let match = new Match();

const STEP = 1000 / FPS;
let acc = 0;
let last = performance.now();

function frame(now) {
  acc += Math.min(250, now - last);
  last = now;
  while (acc >= STEP) {
    if (keyboard.consume('F2')) renderer.showBoxes = !renderer.showBoxes;
    if (keyboard.consume('KeyR') && match.over) match = new Match();
    if (keyboard.consume('Backspace')) match = new Match();
    const events = match.step([keyboard.sample(0), keyboard.sample(1)]);
    renderer.pushEvents(events);
    keyboard.endFrame();
    acc -= STEP;
  }
  renderer.draw(match);
  if (match.over) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000a';
    ctx.fillRect(0, 280, 1280, 140);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(match.winner === 'draw' ? '무승부' : `P${match.winner + 1} 승리!`, 640, 350);
    ctx.font = '20px sans-serif';
    ctx.fillText('R: 다시 대전', 640, 395);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 디버그/테스트용 노출
window.__game = { get match() { return match; } };
