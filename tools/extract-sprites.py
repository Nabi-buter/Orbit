#!/usr/bin/env python3
"""
캐릭터 시트(assets/reference/character-sheet.webp)에서 게임용 스프라이트를 추출해
src/render/botSprites.js 를 만든다.

  python3 tools/extract-sprites.py

1) 줄(대기/걷기/달리기/대시)별로 프레임 분리
2) 바깥 체크무늬 배경을 flood fill 로 제거 (외곽선 안쪽의 밝은 하이라이트는 유지)
3) 4×4 블록을 1픽셀로 축소 (외곽선 우선), 밝기로 6단계 팔레트 문자에 대응
   '#' 외곽선, 'd' 어두움(어깨·관절), 'm' 중간, 'b' 몸, 'l' 밝음, 'w' 하이라이트
4) 대기 0번 프레임에서 앞팔/뒷팔을 잘라 컷아웃 리그(rig) 부품을 만든다
"""
import json, os, sys
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/reference/character-sheet.webp')
OUT = os.path.join(ROOT, 'src/render/botSprites.js')
K = 4

im = Image.open(SRC).convert('RGB')
px = im.load()

def is_bg(c):
    r, g, b = c
    return (r + g + b) / 3 > 200 and max(c) - min(c) < 14

def segments(y0, y1, x0, x1):
    cols = [sum(1 for y in range(y0, y1) if not is_bg(px[x, y])) > 3 for x in range(x0, x1)]
    segs, start = [], None
    for i, c in enumerate(cols + [False]):
        if c and start is None: start = i
        if not c and start is not None:
            if i - start > 20: segs.append((x0 + start, x0 + i))
            start = None
    return segs

ROWS = {'idle': (262, 445, 40, 560), 'walk': (262, 445, 700, 1500), 'run': (590, 760, 40, 880), 'dash': (590, 760, 880, 1520)}

def letter(c):
    r, g, b = c
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    if lum < 70: return '#'
    if lum < 115: return 'd'
    if lum < 160: return 'm'
    if lum < 195: return 'b'
    if lum < 225: return 'l'
    return 'w'

def extract(x0, y0, x1, y1):
    x0 -= 6; x1 += 6
    w, h = x1 - x0, y1 - y0
    bg = [[False] * w for _ in range(h)]
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if bg[y][x] or not is_bg(px[x0 + x, y0 + y]): continue
        bg[y][x] = True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx]: q.append((nx, ny))
    sw, sh = w // K, h // K
    grid = [['.'] * sw for _ in range(sh)]
    for by in range(sh):
        for bx in range(sw):
            cols = [px[x0 + xx, y0 + yy] for yy in range(by * K, by * K + K) for xx in range(bx * K, bx * K + K) if not bg[yy][xx]]
            if len(cols) * 2 >= K * K:
                darks = [c for c in cols if sum(c) / 3 < 70]
                if len(darks) * 3 >= len(cols): grid[by][bx] = '#'
                else: grid[by][bx] = letter(tuple(sum(c[i] for c in cols) // len(cols) for i in range(3)))
    # 여백 자르기
    ys = [y for y in range(sh) if any(ch != '.' for ch in grid[y])]
    xs = [x for x in range(sw) if any(grid[y][x] != '.' for y in range(sh))]
    rows = [''.join(grid[y][min(xs):max(xs) + 1]) for y in range(min(ys), max(ys) + 1)]
    return rows

def anchors(rows):
    """발밑 중심, 앞주먹(몸통 높이에서 가장 앞쪽 픽셀) 위치"""
    h, w = len(rows), len(rows[0])
    bottom = [x for y in range(h - 3, h) for x in range(w) if rows[y][x] != '.']
    foot = (round(sum(bottom) / len(bottom)), h - 1)
    best = None
    for y in range(int(h * 0.35), int(h * 0.75)):
        for x in range(w - 1, -1, -1):
            if rows[y][x] != '.':
                if best is None or x > best[0]: best = (x, y)
                break
    return foot, best

frames = {}
for name, (y0, y1, x0, x1) in ROWS.items():
    frames[name] = []
    for sx, ex in segments(y0, y1, x0, x1):
        rows = extract(sx, y0, ex, y1)
        foot, fist = anchors(rows)
        frames[name].append({'rows': rows, 'foot': foot, 'fist': fist})

# --- 컷아웃 리그: 대기 0번에서 팔 분리 ---------------------------------------
base = [list(r) for r in frames['idle'][0]['rows']]
def take(cond):
    part = [['.'] * len(base[0]) for _ in base]
    for y, row in enumerate(base):
        for x, ch in enumerate(row):
            if ch != '.' and cond(x, y):
                part[y][x] = ch
                base[y][x] = '.'
    return [''.join(r) for r in part]
front = take(lambda x, y: x >= 14 and 14 <= y <= 26)
back = take(lambda x, y: (x <= 5 and 13 <= y <= 25) or (x <= 4 and y == 26))
rig = {
    'core': [''.join(r) for r in base],
    'front': front, 'back': back,
    # 리그 기준점 (대기 0번 좌표)
    'hip': [10, 26], 'frontShoulder': [15, 15], 'frontHand': [17, 24],
    'backShoulder': [4, 14], 'backHand': [2, 24], 'foot': list(frames['idle'][0]['foot']),
}

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// 자동 생성: tools/extract-sprites.py (원본 assets/reference/character-sheet.webp)\n')
    f.write('// 문자: # 외곽선, d 어두움, m 중간, b 몸, l 밝음, w 하이라이트, . 투명\n')
    f.write('export const BOT_FRAMES = ' + json.dumps(frames, ensure_ascii=False) + ';\n')
    f.write('export const BOT_RIG = ' + json.dumps(rig, ensure_ascii=False) + ';\n')
print('wrote', OUT, {k: len(v) for k, v in frames.items()})
