// =============================================================================
// 브라우저 종단 테스트 (Playwright 필요): node scripts/e2e.cjs [스크린샷 폴더]
// 도트 캔버스 UI를 키보드/마우스로 조작해 모든 흐름, 7종 무기, PvE/로컬/온라인을 확인한다.
// =============================================================================
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 8123;
const outDir = process.argv[2];
const root = path.resolve(__dirname, '..');

function assert(c, msg) { if (!c) throw new Error('E2E 실패: ' + msg); console.log('  ✓ ' + msg); }

(async () => {
  const server = spawn(process.execPath, [path.join(root, 'server/server.js'), String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(tag + m.text()); });
    p.on('pageerror', (e) => errors.push(tag + String(e)));
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    watch(page, '');
    const shot = async (p, name) => outDir && p.screenshot({ path: path.join(outDir, name + '.png') });
    const scene = (p = page) => p.evaluate(() => window.__game.scene);
    const wait = (ms) => page.waitForTimeout(ms);
    const key = async (k, p = page) => { await p.keyboard.press(k); await p.waitForTimeout(40); };
    /** 아트 좌표 클릭 */
    const clickArt = async (x, y, p = page) => {
      const box = await p.locator('#game').boundingBox();
      await p.mouse.click(box.x + (x / 427) * box.width, box.y + (y / 240) * box.height);
      await p.waitForTimeout(60);
    };

    await page.goto(`http://localhost:${PORT}/`);
    await wait(300);
    assert(await scene() === 'title', '타이틀 화면');
    await shot(page, '01-title');

    // 조작법 (마우스)
    const helpBtn = await page.evaluate(() => { const b = window.__game.screen.buttons[2]; return [b.x + 10, b.y + 6]; });
    await clickArt(helpBtn[0], helpBtn[1]);
    assert(await scene() === 'help', '조작법 화면 (마우스 클릭)');
    await key('Escape');
    assert(await scene() === 'title', '조작법 → 타이틀');

    // 설정: 키 바인딩 · 서로 바꾸기 · 취소 · 저장 · 기본값
    await page.evaluate(() => window.__game.toSettings());
    assert(await scene() === 'settings', '설정 화면');
    const cell = (p, a) => page.evaluate(([p, a]) => { const it = window.__game.screen.items.find((i) => i.kind === 'key' && i.p === p && i.a === a); return [it.x + it.w / 2, it.y + it.h / 2]; }, [p, a]);
    const binding = (p, a) => page.evaluate(async ([p, a]) => (await import('/src/config/controls.js')).CONTROLS[p][a].join(), [p, a]);
    await clickArt(...(await cell(0, 'light')));
    assert(await page.evaluate(() => window.__game.screen.capturing), '칸 클릭 → 새 키 대기');
    await shot(page, '01b-settings-capture');
    await key('KeyL');
    assert(await binding(0, 'light') === 'KeyL', '약공격 = L');
    await clickArt(...(await cell(0, 'light')));
    await key('KeyK'); // 강공격 키 → 서로 바뀜
    assert(await binding(0, 'light') === 'KeyK' && await binding(0, 'heavy') === 'KeyL', '이미 쓰는 키는 서로 바뀜 (약공 K, 강공 L)');
    assert(await page.evaluate(() => window.__game.screen.items.every((i) => i.kind !== 'key' || i.p === 0)), '키 배치는 플레이어 한 명(P2 칸 없음)');
    await clickArt(...(await cell(0, 'guard')));
    await key('Escape');
    assert(await binding(0, 'guard') === 'KeyS' && await scene() === 'settings', 'ESC 로 입력 취소');
    await shot(page, '01c-settings');
    await page.reload(); await wait(300);
    assert(await binding(0, 'light') === 'KeyK', '새로고침해도 저장됨');
    // 바꾼 키로 실제 공격
    await page.evaluate(() => { const g = window.__game; g.mode = 'pve'; g.toLoadout({ mode: 'pve' }); });
    await key('Enter'); await wait(1700);
    await page.evaluate(() => { window.__game.ai = null; });
    await page.keyboard.press('KeyK'); await wait(60);
    assert(await page.evaluate(() => window.__game.match.fighters[0].attack?.def.kind) === 'light', '바꾼 키(K)로 약공격');
    await key('Escape'); await key('ArrowDown'); await key('ArrowDown'); await key('ArrowDown'); await key('Enter'); // 메인 화면
    await page.evaluate(() => window.__game.toSettings());
    const reset = await page.evaluate(() => { const it = window.__game.screen.items.find((i) => i.kind === 'reset'); return [it.x + it.w / 2, it.y + it.h / 2]; });
    await clickArt(...reset);
    assert(await binding(0, 'light') === 'KeyJ' && await binding(0, 'heavy') === 'KeyK', '기본값으로 되돌리기');
    await key('Escape');
    assert(await scene() === 'title', '설정 → 타이틀');

    // 플레이 → 로드아웃
    await key('Enter');
    assert(await scene() === 'loadout', '플레이 → 로드아웃 (가운데 캐릭터 + 하단 무기)');
    await shot(page, '02-loadout');

    // Q / E 로 모드 전환
    await key('KeyE');
    assert(await page.evaluate(() => window.__game.screen.mode) === 'online', 'E → 온라인');
    await key('KeyE');
    assert(await page.evaluate(() => window.__game.screen.mode) === 'training', 'E → 훈련장');
    await key('KeyE');
    assert(await page.evaluate(() => window.__game.screen.mode) === 'pve', 'E → AI 대전 (순환)');
    await key('KeyQ');
    assert(await page.evaluate(() => window.__game.screen.mode) === 'training', 'Q → 훈련장 (역순)');
    await key('KeyQ'); await key('KeyQ');
    assert(await page.evaluate(() => window.__game.screen.mode) === 'pve', 'Q → AI 대전');

    // 하단 무기 7종 + 무작위 마우스 선택 확인
    const cards = await page.evaluate(() => window.__game.screen.cards.map((c) => [c.id, c.x + c.w / 2, c.y + c.h / 2]));
    assert(cards.length === 8 && cards.at(-1)[0] === 'random' && new Set(cards.map((c) => c[2])).size === 1, '무기 7종 + 무작위가 하단 1열');
    for (const [id, x, y] of cards) {
      await clickArt(x, y);
      assert(await page.evaluate(() => window.__game.screen.weapon) === id, `무기 클릭 선택: ${id}`);
    }

    // PvE: 무기별 대전 시작
    for (const id of ['longsword', 'rapier', 'greatsword', 'dagger', 'axe', 'spear', 'knuckle']) {
      await page.evaluate((w) => { window.__game.toLoadout({ mode: 'pve' }); window.__game.screen.setWeapon(w); }, id);
      await key('Enter');
      const w = await page.evaluate(() => window.__game.match.fighters[0].weapon.id);
      assert(w === id && await scene() === 'battle', `PvE 시작 (${id})`);
      await wait(1700);
      await page.keyboard.down('KeyD'); await wait(400); await page.keyboard.up('KeyD');
      await key('KeyJ'); await wait(250); await key('KeyK'); await wait(500);
      await key('ShiftLeft'); await wait(300); await key('KeyW'); await wait(400);
      if (id === 'longsword') await shot(page, '03-battle');
    }

    // 플레이어 무작위 + AI 무작위: 대전마다 실제 무기를 뽑고, 다시 대전하면 새로 뽑는다 (너클 포함 모두 나옴)
    await page.evaluate(() => { window.__game.toLoadout({ mode: 'pve' }); window.__game.screen.setWeapon('random'); window.__game.screen.cpuWeapon = 'random'; });
    await wait(700);
    await shot(page, '02b-loadout-random');
    await key('Enter');
    const seenP = new Set(), seenC = new Set();
    for (let k = 0; k < 60; k++) {
      const [p, c] = await page.evaluate(() => { const g = window.__game; g.startMatch(); return g.match.fighters.map((f) => f.weapon.id); });
      seenP.add(p); seenC.add(c);
    }
    assert(seenP.size === 7 && seenC.size === 7, `무작위가 7종 모두 (플레이어 ${seenP.size}, AI ${seenC.size})`);
    assert(seenC.has('knuckle'), 'AI 무작위에 너클');
    await page.evaluate(() => window.__game.toLoadout({ mode: 'pve' }));
    assert(await page.evaluate(() => window.__game.screen.weapon) === 'random', '무기 선택으로 돌아오면 무작위가 그대로 선택됨');
    await page.evaluate(() => { window.__game.screen.setWeapon('longsword'); });
    await key('Enter');

    // 일시정지 / 재시작
    await key('Escape');
    assert(await page.evaluate(() => window.__game.paused) === true, '일시정지');
    await shot(page, '04-pause');
    const f0 = await page.evaluate(() => window.__game.match.frame);
    await wait(300);
    assert(await page.evaluate(() => window.__game.match.frame) === f0, '일시정지 중 정지');
    await key('ArrowDown'); await key('Enter');
    assert(await page.evaluate(() => window.__game.match.frame) < 5, '재시작');

    // 결과
    const koOnce = () => page.evaluate(() => { const g = window.__game; g.intro = 0; g.match.roundIntro = 0; g.match.fighters[1].hp = 1; g.match.fighters[0].x = 600; g.match.fighters[1].x = 660; g.ai = null; });
    await koOnce();
    await key('KeyJ');
    await page.waitForFunction(() => window.__game.match.round === 2, null, { timeout: 4000 });
    const r2 = await page.evaluate(() => ({ lives: window.__game.match.lives, hp: window.__game.match.fighters.map((f) => f.hp / f.maxHp) }));
    assert(r2.lives.join() === '2,1' && r2.hp[1] === 1, `첫 KO → 2라운드 (목숨 ${r2.lives}, 쓰러진 쪽 체력 회복)`);
    await wait(300);
    await shot(page, '05a-round2');
    await koOnce();
    await key('KeyJ');
    await wait(2500);
    assert(await scene() === 'result', '두 번째 KO → 결과');
    await shot(page, '05-result');
    await key('Enter');
    assert(await scene() === 'battle', '다시 대전');
    // 라운드 시간이 다 되면 끝나지 않고 연장전 → 양쪽 체력이 줄어 쓰러지면 (마지막 목숨이면) 결과
    await page.evaluate(() => { const g = window.__game; g.ai = null; g.intro = 0; g.match.timeLeft = 2; });
    await wait(500);
    assert(await page.evaluate(() => window.__game.scene === 'battle' && window.__game.match.overtime), '시간이 다 되면 연장전 (경기는 계속)');
    await shot(page, '05b-overtime');
    await page.evaluate(() => { const m = window.__game.match; m.lives = [1, 1]; m.fighters[0].hp = 40; m.fighters[1].hp = 60; });
    await wait(3500);
    assert(await scene() === 'result', '연장전에서 쓰러짐 → 결과');

    // 훈련장: 내 무기만 고름, 더미는 맨손으로 움직이지 않고 쓰러지지 않음, 시간 제한 없음, 궁극기 무제한
    await page.evaluate(() => window.__game.toLoadout({ mode: 'training' }));
    await page.evaluate(() => window.__game.screen.setWeapon('dagger'));
    await shot(page, '06-loadout-training');
    await key('Enter');
    const tw = await page.evaluate(() => window.__game.match.fighters.map((f) => [f.weapon.id, !!f.unarmed]));
    assert(await scene() === 'battle' && tw[0][0] === 'dagger' && !tw[0][1] && tw[1][1], `훈련장 시작: 내 무기 단검, 더미는 맨손 ${JSON.stringify(tw)}`);
    assert(await page.evaluate(() => window.__game.match.unlimited), '훈련장 시간 무제한');
    await wait(1800);
    const d0 = await page.evaluate(() => window.__game.match.fighters[1].x);
    // P2 였던 키(방향키·숫자패드)를 눌러도 더미는 움직이지 않는다
    await page.keyboard.down('ArrowLeft'); await key('Numpad1'); await wait(500); await page.keyboard.up('ArrowLeft');
    assert(await page.evaluate(() => window.__game.match.fighters[1].x) === d0 && await page.evaluate(() => window.__game.match.fighters[1].state) === 'idle', '더미는 조작되지 않음');
    // 마구 때려도 쓰러지지 않음 · 궁극기 계속 가능
    await page.evaluate(() => { const [a, b] = window.__game.match.fighters; a.x = b.x - 70; });
    for (let k = 0; k < 14; k++) { await key(k % 3 ? 'KeyJ' : 'KeyK'); await wait(160); }
    await key('KeyI'); await wait(1200); await key('KeyI'); await wait(1200);
    const tr = await page.evaluate(() => { const g = window.__game, [a, b] = g.match.fighters; return { over: g.match.over, lives: g.match.lives[1], hp: b.hp, max: b.maxHp, ult: a.ult, hits: a.stats.hitsLanded }; });
    assert(!tr.over && tr.lives === 2 && tr.hp > 0, `더미는 쓰러지지 않음 ${JSON.stringify(tr)}`);
    assert(tr.hits > 0, '내 무기로 더미 공격');
    await shot(page, '06b-training');
    await key('Escape');

    // 새로고침
    await page.reload();
    await wait(300);
    assert(await scene() === 'title', '새로고침 후 타이틀');

    // 화면 크기
    for (const [w, h] of [[800, 450], [390, 844], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await wait(100);
      const ok = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return r.width <= innerWidth + 1 && r.height <= innerHeight + 1; });
      assert(ok, `화면 ${w}x${h} 맞춤`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });

    // 온라인 (브라우저 두 개)
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pageB = await ctxB.newPage();
    watch(pageB, 'B: ');
    await pageB.goto(`http://localhost:${PORT}/`);
    await page.goto(`http://localhost:${PORT}/`);
    await wait(300);
    // A: 타이틀 → 온라인 대전 → 로드아웃(도끼) → 시작 → 방 만들기
    await key('ArrowDown'); await key('Enter');
    assert(await page.evaluate(() => window.__game.screen.mode) === 'online', '온라인 → 로드아웃(온라인 모드)');
    await page.evaluate(() => window.__game.screen.setWeapon('axe'));
    await key('Enter');
    await page.waitForFunction(() => window.__game.netState?.phase === 'connect');
    await key('Enter'); // 방 만들기
    await page.waitForFunction(() => window.__game.netState?.code);
    const code = await page.evaluate(() => window.__game.netState.code);
    assert(/^[A-Z0-9]{4}$/.test(code), `방 생성 ${code}`);
    await shot(page, '07-online-room');
    // B: 코드 입력
    await key('ArrowDown', pageB); await key('Enter', pageB);
    await pageB.evaluate(() => window.__game.screen.setWeapon('knuckle'));
    await key('Enter', pageB);
    await pageB.waitForFunction(() => window.__game.netState?.phase === 'connect');
    for (const ch of code) await key(/\d/.test(ch) ? `Digit${ch}` : `Key${ch}`, pageB);
    await key('Enter', pageB);
    await pageB.waitForFunction(() => window.__game.netState?.code);
    assert(await pageB.evaluate(() => window.__game.netState.code) === code, '코드 입력으로 참가');
    await wait(300);
    await key('KeyJ'); await key('KeyJ', pageB);
    await page.waitForFunction(() => window.__game.scene === 'battle');
    await pageB.waitForFunction(() => window.__game.scene === 'battle');
    const wa = await page.evaluate(() => window.__game.match.fighters.map((f) => f.weapon.id).join());
    const wb = await pageB.evaluate(() => window.__game.match.fighters.map((f) => f.weapon.id).join());
    assert(wa === 'axe,knuckle' && wb === wa, `온라인 대전 시작 ${wa}`);
    await wait(1800);
    await page.keyboard.down('KeyD'); await pageB.keyboard.down('ArrowLeft');
    await wait(600);
    await page.keyboard.up('KeyD'); await pageB.keyboard.up('ArrowLeft');
    for (let k = 0; k < 5; k++) { await key('KeyJ'); await key('KeyK', pageB); await wait(200); }
    await wait(1200);
    await shot(page, '08-online-battle');
    const st = (p) => p.evaluate(() => ({ f: window.__game.match.frame, d: window.__game.lockstep?.desyncAt ?? null }));
    const sa = await st(page), sb = await st(pageB);
    assert(sa.f > 100 && Math.abs(sa.f - sb.f) <= 12, `온라인 진행 ${sa.f}/${sb.f}`);
    assert(sa.d === null && sb.d === null, '동기화 해시 일치');
    await key('Escape'); await key('ArrowDown'); await key('Enter'); // 기권
    await pageB.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 3000 });
    assert(true, '상대 기권 → 결과 화면');
    await ctxB.close();

    assert(errors.length === 0, `콘솔 오류 없음 ${errors.length ? JSON.stringify(errors) : ''}`);
    console.log('E2E 통과');
  } catch (e) {
    console.error(e.message);
    if (errors.length) console.error('콘솔 오류:', errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})();
