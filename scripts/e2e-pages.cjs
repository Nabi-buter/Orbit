// =============================================================================
// GitHub Pages(정적 사이트) 온라인 대전 브라우저 테스트: node scripts/e2e-pages.cjs [스크린샷 폴더]
// 배포와 같은 _site 를 만들어 하위 경로로 띄우고, 두 탭이 방 만들기 → 코드 참가 → 대전까지 간다.
// 실제 PeerJS 중개 서버 대신, 같은 브라우저의 두 탭을 BroadcastChannel 로 잇는 가짜 Peer 를 주입한다.
// (PeerJS API 모양: new Peer(id?) · on('open'|'connection'|'error') · connect(id) · conn.send/on('data'|'open'|'close') · destroy)
// =============================================================================
const { chromium } = require('playwright');
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = process.argv[2];
const PORT = 8142;

const FAKE_PEER = `(() => {
  const bc = new BroadcastChannel('fake-peerjs');
  const live = new Map(); // 이 탭의 Peer 들
  class Em { constructor() { this.h = {}; } on(e, f) { (this.h[e] ||= []).push(f); return this; } fire(e, ...a) { (this.h[e] || []).forEach((f) => f(...a)); } }
  class Conn extends Em {
    constructor(owner, peer, cid) { super(); this.owner = owner; this.peer = peer; this.cid = cid; this.open = false; }
    send(d) { if (this.open) bc.postMessage({ k: 'data', to: this.peer, from: this.owner.id, cid: this.cid, d }); }
    close() { if (!this.open) return; this.open = false; bc.postMessage({ k: 'close', to: this.peer, from: this.owner.id, cid: this.cid }); this.fire('close'); }
  }
  let n = 0;
  window.Peer = class extends Em {
    constructor(id) {
      super();
      this.id = typeof id === 'string' ? id : 'anon-' + Math.random().toString(36).slice(2, 8);
      this.conns = new Map(); this.destroyed = false;
      let taken = false;
      const onTaken = (ev) => { if (ev.data.k === 'taken' && ev.data.id === this.id) taken = true; };
      bc.addEventListener('message', onTaken);
      bc.postMessage({ k: 'claim', id: this.id });
      setTimeout(() => {
        bc.removeEventListener('message', onTaken);
        if (taken || [...live.values()].some((p) => p.id === this.id && !p.destroyed)) { this.fire('error', { type: 'unavailable-id' }); return; }
        live.set(this.id, this); this.fire('open', this.id);
      }, 150);
    }
    connect(target) {
      const cid = this.id + ':' + (++n);
      const c = new Conn(this, target, cid); this.conns.set(cid, c);
      bc.postMessage({ k: 'conn', to: target, from: this.id, cid });
      setTimeout(() => { if (!c.open) this.fire('error', { type: 'peer-unavailable' }); }, 2000);
      return c;
    }
    destroy() { if (this.destroyed) return; this.destroyed = true; this.conns.forEach((c) => c.close()); live.delete(this.id); }
  };
  bc.onmessage = (ev) => {
    const m = ev.data;
    if (m.k === 'claim') { for (const p of live.values()) if (p.id === m.id && !p.destroyed) bc.postMessage({ k: 'taken', id: m.id }); return; }
    const p = live.get(m.to) || [...live.values()].find((x) => x.id === m.to);
    if (!p || p.destroyed) return;
    if (m.k === 'conn') { const c = new Conn(p, m.from, m.cid); p.conns.set(m.cid, c); p.fire('connection', c); c.open = true; c.fire('open'); bc.postMessage({ k: 'ack', to: m.from, from: p.id, cid: m.cid }); }
    else if (m.k === 'ack') { const c = p.conns.get(m.cid); if (c) { c.open = true; c.fire('open'); } }
    else if (m.k === 'data') { const c = p.conns.get(m.cid); if (c && c.open) c.fire('data', m.d); }
    else if (m.k === 'close') { const c = p.conns.get(m.cid); if (c && c.open) { c.open = false; c.fire('close'); } }
  };
})();`;

function assert(c, msg) { if (!c) throw new Error('E2E(Pages) 실패: ' + msg); console.log('  ✓ ' + msg); }

(async () => {
  // 배포 워크플로와 같은 방식으로 _site 생성
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-pages-'));
  const site = path.join(tmp, 'Orbit');
  fs.mkdirSync(site);
  execSync(`cp -r index.html src "${site}/"`, { cwd: root });
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8')
    .replace('<script type="module" src="src/main.js"></script>', '<script>window.ORBIT_STATIC = true;</script>\n  <script type="module" src="src/main.js"></script>');
  fs.writeFileSync(path.join(site, 'index.html'), html);
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: tmp, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(FAKE_PEER);
    const [A, B] = [await ctx.newPage(), await ctx.newPage()];
    for (const [p, tag] of [[A, 'A: '], [B, 'B: ']]) { p.on('pageerror', (e) => errors.push(tag + e)); p.on('console', (m) => m.type() === 'error' && errors.push(tag + m.text())); }
    const key = async (p, k) => { await p.keyboard.press(k); await p.waitForTimeout(40); };
    for (const p of [A, B]) { await p.goto(`http://localhost:${PORT}/Orbit/`); await p.waitForTimeout(300); }
    // A: 온라인 → 도끼 → 방 만들기
    await key(A, 'ArrowDown'); await key(A, 'Enter');
    await A.evaluate(() => window.__game.screen.setWeapon('axe'));
    await key(A, 'Enter');
    await A.waitForFunction(() => window.__game.netState?.phase === 'connect', null, { timeout: 5000 });
    assert(true, 'Pages 주소에서 온라인 연결 준비 (WebRTC 모드)');
    await key(A, 'Enter');
    await A.waitForFunction(() => window.__game.netState?.code, null, { timeout: 5000 });
    const code = await A.evaluate(() => window.__game.netState.code);
    assert(/^[A-Z0-9]{4}$/.test(code), `방 생성 ${code}`);
    // B: 온라인 → 너클 → 코드 입력
    await key(B, 'ArrowDown'); await key(B, 'Enter');
    await B.evaluate(() => window.__game.screen.setWeapon('knuckle'));
    await key(B, 'Enter');
    await B.waitForFunction(() => window.__game.netState?.phase === 'connect', null, { timeout: 5000 });
    // 화면 입력판으로 코드 입력 (모바일과 같은 방식: 탭)
    const tapArt = async (p, x, y) => {
      const box = await p.locator('#game').boundingBox();
      await p.mouse.click(box.x + (x / 427) * box.width, box.y + (y / 240) * box.height);
      await p.waitForTimeout(50);
    };
    for (const ch of code) {
      const k = await B.evaluate((c) => { const b = window.__game.screen.keys.find((x) => x.label === c); return [b.x + b.w / 2, b.y + b.h / 2]; }, ch);
      await tapArt(B, ...k);
    }
    assert(await B.evaluate(() => window.__game.screen.code) === code, '입력판으로 코드 입력');
    out && await B.screenshot({ path: path.join(out, 'pages-online-keypad.png') });
    const jk = await B.evaluate(() => { const b = window.__game.screen.keys.find((x) => x.label === '참가'); return [b.x + b.w / 2, b.y + b.h / 2]; });
    await tapArt(B, ...jk);
    await B.waitForFunction(() => window.__game.netState?.code, null, { timeout: 8000 });
    assert(true, '코드로 참가');
    await A.waitForTimeout(800);
    out && await A.screenshot({ path: path.join(out, 'pages-online-room.png') });
    // 양쪽 준비
    await key(A, 'KeyJ'); await key(B, 'KeyJ');
    await A.waitForFunction(() => window.__game.scene === 'battle', null, { timeout: 8000 });
    await B.waitForFunction(() => window.__game.scene === 'battle', null, { timeout: 8000 });
    const wa = await A.evaluate(() => window.__game.match.fighters.map((f) => f.weapon.id).join());
    assert(wa === 'axe,knuckle', `온라인 대전 시작 ${wa}`);
    const stages = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.renderer.stage)));
    assert(stages[0] && stages[0] === stages[1], `두 사람이 같은 배경 (${stages})`);
    await A.waitForTimeout(1800);
    await A.keyboard.down('KeyD'); await B.keyboard.down('ArrowLeft');
    await A.waitForTimeout(600);
    await A.keyboard.up('KeyD'); await B.keyboard.up('ArrowLeft');
    for (let k = 0; k < 5; k++) { await key(A, 'KeyJ'); await key(B, 'KeyK'); await A.waitForTimeout(200); }
    await A.waitForTimeout(1500);
    out && await A.screenshot({ path: path.join(out, 'pages-online-battle.png') });
    const st = (p) => p.evaluate(() => ({ f: window.__game.match.frame, d: window.__game.lockstep?.desyncAt ?? null }));
    const sa = await st(A), sb = await st(B);
    assert(sa.f > 100 && Math.abs(sa.f - sb.f) <= 12, `진행 ${sa.f}/${sb.f}`);
    assert(sa.d === null && sb.d === null, '동기화 해시 일치');
    // 손님 탭이 가려짐(다른 탭·앱으로 전환): 화면 루프는 멈춰도 상대 입력을 따라 진행해 방장 화면이 멈추지 않아야 한다
    const setHidden = (p, h) => p.evaluate((v) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, h);
    await setHidden(B, true);
    const h0 = await st(A);
    await A.waitForTimeout(2500);
    const h1 = await st(A);
    assert(h1.f - h0.f > 90, `상대 탭이 가려져도 진행 (${h1.f - h0.f}프레임 / 2.5초)`);
    await setHidden(B, false);
    await A.waitForTimeout(800);
    const sa2 = await st(A), sb2 = await st(B);
    assert(Math.abs(sa2.f - sb2.f) <= 12 && sa2.d === null && sb2.d === null, `돌아온 뒤 동기화 ${sa2.f}/${sb2.f}`);
    // 준비 버튼 (탭) — 결과 후 로비에서 확인
    // 경기 종료(연장전에서 쓰러짐) → 양쪽 '로비로' → 같은 방에서 재대결 준비 상태여야 한다 (상대가 나갔다는 오류 없이)
    for (const p of [A, B]) await p.evaluate(() => { const m = window.__game.match; m.lives = [1, 1]; m.fighters[0].hp = 30; m.fighters[1].hp = 50; m.timeLeft = 2; });
    await A.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 8000 });
    await B.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 8000 });
    await key(A, 'Enter'); await key(B, 'Enter');
    await A.waitForTimeout(1500);
    out && await A.screenshot({ path: path.join(out, 'pages-online-rematch-A.png') });
    out && await B.screenshot({ path: path.join(out, 'pages-online-rematch-B.png') });
    const ns = (p) => p.evaluate(() => ({ scene: window.__game.scene, phase: window.__game.netState?.phase, error: window.__game.netState?.error ?? null, connected: window.__game.netState?.connected }));
    const ra = await ns(A), rb = await ns(B);
    assert(ra.scene === 'online' && rb.scene === 'online', `양쪽 로비 (${ra.scene}/${rb.scene})`);
    assert(ra.phase === 'room' && rb.phase === 'room' && !ra.error && !rb.error, `같은 방 유지, 오류 없음 A=${JSON.stringify(ra)} B=${JSON.stringify(rb)}`);
    assert(ra.connected?.[1] && rb.connected?.[0], '상대 접속 상태 유지');
    // 방장이 시간 제한을 무제한으로 (Q 두 번: 90초 → 60초 → 무제한)
    await key(B, 'KeyE'); // 손님은 못 바꿈
    await key(A, 'KeyQ'); await key(A, 'KeyQ');
    await B.waitForFunction(() => window.__game.netState?.time === 0, null, { timeout: 4000 });
    assert(true, '방장 시간 변경(무제한) → 손님에게 공유');
    out && await B.screenshot({ path: path.join(out, 'pages-online-time-B.png') });
    out && await A.screenshot({ path: path.join(out, 'pages-online-time-A.png') });
    // 손님이 준비 → 준비 취소를 화면 탭으로 (바로 바뀌고 방장에게도 전달)
    const tapMenu = async (p, label) => {
      const r = await p.evaluate((l) => { const b = window.__game.screen.buttons.find((x) => x.label === l); return b && [b.x + 12 + 20, b.y + b.h / 2]; }, label);
      assert(r, `버튼 ${label}`);
      await tapArt(p, ...r);
    };
    await tapMenu(B, '준비');
    await B.waitForFunction(() => window.__game.netState.ready[1] === true, null, { timeout: 3000 });
    await A.waitForFunction(() => window.__game.netState.ready[1] === true, null, { timeout: 3000 });
    await tapMenu(B, '준비 취소');
    await A.waitForFunction(() => window.__game.netState.ready[1] === false, null, { timeout: 3000 });
    await tapMenu(A, '준비');
    await B.waitForFunction(() => window.__game.netState.ready[0] === true, null, { timeout: 3000 });
    await tapMenu(A, '준비 취소');
    await B.waitForFunction(() => window.__game.netState.ready[0] === false, null, { timeout: 3000 });
    assert(true, '준비 / 준비 취소 (양쪽, 탭)');
    // 재대결
    await key(A, 'KeyJ'); await key(B, 'KeyJ');
    await A.waitForFunction(() => window.__game.scene === 'battle', null, { timeout: 8000 });
    await B.waitForFunction(() => window.__game.scene === 'battle', null, { timeout: 8000 });
    assert(true, '재대결 시작');
    const un = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.match.unlimited)));
    assert(un[0] && un[1], '양쪽 무제한 경기');
    await A.waitForTimeout(2500);
    out && await A.screenshot({ path: path.join(out, 'pages-online-unlimited.png') });
    assert(errors.length === 0, `콘솔 오류 없음 ${errors.length ? JSON.stringify(errors) : ''}`);
    console.log('E2E(Pages 온라인) 통과');
  } catch (e) {
    console.error(e.message);
    if (errors.length) console.error('콘솔 오류:', errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
