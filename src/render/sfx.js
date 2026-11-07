// =============================================================================
// 간단한 합성 효과음 (WebAudio, 외부 파일 없음). M 키로 음소거.
// =============================================================================

let ctx = null;
export const sfx = { muted: false };

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = freq, dur = 0.1, type = 'square', vol = 0.12, noise = false }) {
  if (sfx.muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(a.destination);
  if (noise) {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    src.connect(f); f.connect(g); src.start(t);
  } else {
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    o.connect(g); o.start(t); o.stop(t + dur);
  }
}

export function playEvent(type, kind) {
  switch (type) {
    case 'hit':
      tone({ freq: kind === 'heavy' ? 900 : 1800, dur: kind === 'heavy' ? 0.16 : 0.08, noise: true, vol: 0.22 });
      tone({ freq: kind === 'heavy' ? 140 : 220, to: 60, dur: 0.12, type: 'sine', vol: 0.2 });
      break;
    case 'parry':
      tone({ freq: 1200, to: 900, dur: 0.09, type: 'triangle', vol: 0.12 });
      break;
    case 'overtime': // 연장전 경고음
      tone({ freq: 440, dur: 0.18, type: 'square', vol: 0.1 });
      tone({ freq: 330, dur: 0.3, type: 'square', vol: 0.08 });
      break;
    case 'perfect':
      tone({ freq: 1568, dur: 0.25, type: 'triangle', vol: 0.14 });
      tone({ freq: 2349, dur: 0.35, type: 'sine', vol: 0.1 });
      break;
    case 'guardBreak':
      tone({ freq: 3000, dur: 0.35, noise: true, vol: 0.25 });
      tone({ freq: 300, to: 80, dur: 0.3, type: 'sawtooth', vol: 0.12 });
      break;
    case 'special':
      tone({ freq: 600, dur: 0.3, noise: true, vol: 0.3 });
      tone({ freq: 120, to: 40, dur: 0.3, type: 'sine', vol: 0.3 });
      break;
    case 'armored':
      tone({ freq: 400, to: 300, dur: 0.1, type: 'square', vol: 0.06 });
      break;
    case 'ult':
      tone({ freq: 200, to: 800, dur: 0.3, type: 'sawtooth', vol: 0.1 });
      break;
    case 'ko':
      tone({ freq: 400, to: 60, dur: 0.6, type: 'sawtooth', vol: 0.14 });
      break;
    case 'dash':
      tone({ freq: 2500, dur: 0.07, noise: true, vol: 0.05 });
      break;
    case 'tick':
      tone({ freq: 660, dur: 0.06, type: 'square', vol: 0.05 });
      break;
    case 'fight':
      tone({ freq: 523, to: 1046, dur: 0.25, type: 'square', vol: 0.08 });
      break;
    default:
      break;
  }
}
