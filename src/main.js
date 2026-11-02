// 진입점
import { App } from './game/app.js';

const app = new App({
  canvas: document.getElementById('game'),
  overlay: document.getElementById('overlay'),
});

// 디버그/자동 테스트용 노출
window.__game = app;
