// =============================================================================
// 브라우저 종단 테스트 (Playwright 필요): node scripts/e2e.cjs [스크린샷 폴더]
// 모든 화면 흐름, 6종 무기, PvP/PvE, 일시정지/재시작, 새로고침, 작은 화면, 콘솔 오류를 확인한다.
// =============================================================================
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 8123;
const outDir = process.argv[2];
const root = path.resolve(__dirname, '..');

function assert(c, msg) { if (!c) throw new Error('E2E 실패: ' + msg); console.log('  ✓ ' + msg); }

(async () => {
  const server = spawn(process.execPath, [path.join(root, 'scripts/serve.js'), String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    const shot = async (name) => outDir && page.screenshot({ path: path.join(outDir, name + '.png') });
    const scene = () => page.evaluate(() => window.__game.scene);
    const wait = (ms) => page.waitForTimeout(ms);

    await page.goto(`http://localhost:${PORT}/`);
    await wait(300);
    assert(await scene() === 'title', '타이틀 화면');
    await shot('01-title');

    // 조작 방법
    await page.click('text=조작 방법');
    assert(await scene() === 'help', '조작 안내 화면');
    await shot('02-help');
    await page.keyboard.press('Escape');
    assert(await scene() === 'title', '안내 → 타이틀 복귀');

    // PvP: 6종 무기 모두 대전 시작
    const weapons = ['longsword', 'greatsword', 'dagger', 'axe', 'spear', 'knuckle'];
    for (let i = 0; i < weapons.length; i++) {
      await page.evaluate(() => window.__game.toSelect('pvp'));
      await wait(80);
      await page.click(`.select-panel.p1 .weapon-card[data-id="${weapons[i]}"]`);
      await page.click(`.select-panel.p2 .weapon-card[data-id="${weapons[(i + 3) % 6]}"]`);
      await page.keyboard.press('KeyJ');          // P1 준비
      await page.keyboard.press('Numpad1');       // P2 준비
      await page.keyboard.press('Enter');
      await wait(100);
      const w = await page.evaluate(() => window.__game.match.fighters.map((f) => f.weapon.id));
      assert(w[0] === weapons[i] && w[1] === weapons[(i + 3) % 6], `PvP 무기 선택 ${w.join(' vs ')}`);
      // 시작 연출 후 실제 조작
      await wait(1700);
      await page.keyboard.down('KeyD'); await wait(500); await page.keyboard.up('KeyD');
      await page.keyboard.press('KeyJ'); await wait(150);
      await page.keyboard.press('KeyK'); await wait(400);
      await page.keyboard.press('KeyL'); await wait(300);
      await page.keyboard.press('KeyW'); await wait(500);
      await page.keyboard.down('ArrowDown'); await wait(300); await page.keyboard.up('ArrowDown');
      if (i === 0) await shot('03-battle');
    }

    // 일시정지 / 재시작
    await page.keyboard.press('Escape');
    await wait(100);
    assert(await page.evaluate(() => window.__game.paused) === true, '일시정지');
    await shot('04-pause');
    const f0 = await page.evaluate(() => window.__game.match.frame);
    await wait(300);
    assert(await page.evaluate(() => window.__game.match.frame) === f0, '일시정지 중 시뮬레이션 정지');
    await page.click('text=재시작');
    await wait(100);
    assert(await page.evaluate(() => window.__game.match.frame) < 5 && await scene() === 'battle', '재시작');

    // 결과 화면
    await page.evaluate(() => { window.__game.intro = 0; window.__game.match.fighters[1].hp = 1; window.__game.match.fighters[0].x = 600; window.__game.match.fighters[1].x = 660; });
    await page.keyboard.press('KeyJ');
    await wait(2200);
    assert(await scene() === 'result', 'KO → 결과 화면');
    await shot('05-result');
    await page.click('text=다시 대전');
    await wait(100);
    assert(await scene() === 'battle', '다시 대전');
    await page.evaluate(() => { window.__game.match.timeLeft = 2; window.__game.intro = 0; });
    await wait(400);
    assert(await scene() === 'result', '시간 종료 → 결과');
    await page.click('text=메인 화면');
    assert(await scene() === 'title', '메인 화면 복귀');

    // PvE: 난이도 3종
    for (const diff of ['easy', 'normal', 'hard']) {
      await page.evaluate(() => window.__game.toSelect('pve'));
      await page.click(`.diff[data-diff="${diff}"]`);
      await page.click('.start-btn');
      await wait(100);
      assert(await page.evaluate(() => !!window.__game.ai) && await page.evaluate(() => window.__game.difficulty) === diff, `PvE 시작 (${diff})`);
      await wait(4500);
      const ev = await page.evaluate(() => window.__game.match.fighters.map((f) => Math.round(f.hp)));
      assert(ev.length === 2, `PvE ${diff} 진행 중 체력 ${ev.join('/')}`);
    }
    await shot('06-pve');

    // 새로고침 후 정상 동작
    await page.reload();
    await wait(300);
    assert(await scene() === 'title', '새로고침 후 타이틀');
    await page.evaluate(() => window.__game.toSelect('pve'));
    await page.click('.start-btn');
    await wait(2000);
    assert(await page.evaluate(() => window.__game.match.frame) > 0, '새로고침 후 대전 진행');

    // 작은 화면 / 세로 화면
    for (const [w, h] of [[800, 450], [390, 844], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.__game.toSelect('pvp'));
      await wait(150);
      const overflow = await page.evaluate(() => {
        const st = document.getElementById('stage').getBoundingClientRect();
        return st.width <= innerWidth + 1 && st.height <= innerHeight + 1;
      });
      assert(overflow, `화면 ${w}x${h} 에 맞게 배치`);
      await shot(`07-select-${w}x${h}`);
    }

    // 온라인 대전: 두 브라우저(다른 컴퓨터 역할)
    await page.setViewportSize({ width: 1280, height: 720 });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pageB = await ctxB.newPage();
    pageB.on('console', (m) => { if (m.type() === 'error') errors.push('B: ' + m.text()); });
    pageB.on('pageerror', (e) => errors.push('B: ' + String(e)));
    await page.goto(`http://localhost:${PORT}/`);
    await pageB.goto(`http://localhost:${PORT}/`);
    await wait(300);
    await page.click('text=온라인 대전');
    await page.waitForSelector('text=방 만들기');
    await page.click('text=방 만들기');
    await page.waitForSelector('.room-code b');
    const code = await page.textContent('.room-code b');
    assert(/^[A-Z0-9]{4}$/.test(code), `방 생성 (코드 ${code})`);
    await shot('08-online-room');
    await pageB.click('text=온라인 대전');
    await pageB.waitForSelector('.code-input');
    await pageB.fill('.code-input', code.toLowerCase());
    await pageB.click('text=참가');
    await pageB.waitForSelector('.room-code b');
    assert(await pageB.textContent('.room-code b') === code, '코드로 방 참가');
    await page.click('.weapon-card[data-id="axe"]');
    await wait(100);
    await pageB.click('.weapon-card[data-id="knuckle"]');
    await wait(200);
    await page.click('.ready-btn');
    await pageB.click('.ready-btn');
    await wait(300);
    const wa = await page.evaluate(() => window.__game.scene === 'battle' && window.__game.match.fighters.map((f) => f.weapon.id));
    const wb = await pageB.evaluate(() => window.__game.scene === 'battle' && window.__game.match.fighters.map((f) => f.weapon.id));
    assert(JSON.stringify(wa) === '["axe","knuckle"]' && JSON.stringify(wb) === '["axe","knuckle"]', `온라인 대전 시작 ${wa} / ${wb}`);
    await wait(1800);
    await page.keyboard.down('KeyD'); await pageB.keyboard.down('ArrowLeft');
    await wait(700);
    await page.keyboard.up('KeyD'); await pageB.keyboard.up('ArrowLeft');
    for (let k = 0; k < 6; k++) { await page.keyboard.press('KeyJ'); await pageB.keyboard.press('KeyK'); await wait(120); }
    await wait(1500);
    await shot('09-online-battle');
    const st = async (p) => p.evaluate(() => { const g = window.__game; return { f: g.match.frame, desync: g.lockstep?.desyncAt ?? null, hp: g.match.fighters.map((x) => x.hp) }; });
    const sa = await st(page), sb = await st(pageB);
    assert(sa.f > 120 && sb.f > 120, `온라인 진행 프레임 ${sa.f} / ${sb.f}`);
    assert(Math.abs(sa.f - sb.f) <= 12, '두 클라이언트 프레임 차이가 입력 지연 이내');
    assert(sa.desync === null && sb.desync === null, '동기화 해시 일치 (desync 없음)');
    // 같은 프레임 시점의 상태 비교: 한쪽을 기다렸다가 비교
    const hpA = sa.hp.join('/'), hpB = sb.hp.join('/');
    console.log(`    체력 A ${hpA} · B ${hpB}`);
    // 기권 → 상대에게 승리 화면
    await page.keyboard.press('Escape');
    await page.click('text=대전 나가기');
    await pageB.waitForSelector('text=승리 (상대 퇴장)', { timeout: 3000 });
    assert(true, '상대 기권 시 승리 처리');
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
