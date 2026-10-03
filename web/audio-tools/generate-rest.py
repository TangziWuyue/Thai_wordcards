"""生成「剩余词」的发音：单音节套单曲线、多音节按 IPA 逐音节校正、无 IPA 自然合成。

规格与 generate.py 相同（Premwadee · -25% · 元音核心 · ×1.25 目标曲线）；
多音节用「浊音段 + 能量谷」切分，再逐节套对应声调的曲线。
支持断点续跑：已存在的输出会跳过。
用法：
  uv run --with edge-tts --with numpy --with soundfile --with praat-parselmouth \
    python web/audio-tools/generate-rest.py
"""
import asyncio
import json
import os
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import edge_tts
import numpy as np
import parselmouth
import soundfile as sf

ROOT = Path(__file__).resolve().parent / '.work-rest'
RAW = ROOT / 'raw'
AUD = ROOT / 'audio'
VOICE = 'th-TH-PremwadeeNeural'
BASE = 170.0
RATE = '-25%'
TARGET = {
    1: [0.0, 0.0, 0.0, 0.0, 0.0],
    2: [-3.0, -3.8, -4.5, -5.2, -5.8],
    3: [6.9, 5.6, 2.5, -3.1, -8.1],
    4: [2.5, 3.5, 4.5, 5.5, 6.5],
    5: [-4.75, -5.25, -3.75, -0.6, 4.4],
}
CONCURRENCY = int(os.environ.get('TWC_CONCURRENCY', '6'))
WORKERS = 4


def boundaries(snd, n):
    """把一次朗读切成 n 个音节：优先用浊音段，否则在等分点附近找能量谷。"""
    pit = snd.to_pitch(time_step=0.005, pitch_floor=60, pitch_ceiling=420)
    f0 = pit.selected_array['frequency']
    t = pit.xs()
    voiced = [x for x, y in zip(t, f0) if y > 0]
    if len(voiced) < 6:
        return None
    runs, cur = [], []
    for x in voiced:
        if cur and x - cur[-1] > 0.06:
            runs.append(cur)
            cur = []
        cur.append(x)
    if cur:
        runs.append(cur)
    runs = [r for r in runs if r[-1] - r[0] > 0.04]
    if len(runs) == n:
        return [runs[0][0]] + [runs[i][0] for i in range(1, n)] + [runs[-1][-1]]
    t0, t1 = voiced[0], voiced[-1]
    inten = snd.to_intensity(time_step=0.005)
    iv, ti = inten.values[0], inten.xs()

    def at(x):
        i = min(len(ti) - 1, max(0, int(round((x - ti[0]) / (ti[1] - ti[0])))))
        return iv[i]

    edges = [t0]
    for k in range(1, n):
        guess = t0 + (t1 - t0) * k / n
        span = (t1 - t0) / n * 0.6
        lo, hi = guess - span, guess + span
        if lo < t0 or hi > t1:
            edges.append(guess)
            continue
        best, bx = 1e9, guess
        x = lo
        while x <= hi:
            v = at(x)
            if v < best:
                best, bx = v, x
            x += 0.005
        edges.append(bx)
    edges.append(t1)
    return edges


def apply_contours(snd, edges, tones):
    manip = parselmouth.praat.call(snd, 'To Manipulation', 0.01, 55, 520)
    tier = parselmouth.praat.call(manip, 'Create PitchTier', 'pt', edges[0], edges[-1])
    for i, tone in enumerate(tones):
        a, b = edges[i], edges[i + 1]
        pts = TARGET[tone]
        for k, semi in enumerate(pts):
            tt = a + (b - a) * (0.08 + 0.84 * k / (len(pts) - 1))
            parselmouth.praat.call(tier, 'Add point', tt, BASE * (2 ** (semi / 12)))
    parselmouth.praat.call([manip, tier], 'Replace pitch tier')
    return parselmouth.praat.call(manip, 'Get resynthesis (overlap-add)')


def process_one(args):
    import numpy as np
    import parselmouth
    import soundfile as sf

    i, tones, correctable = args
    raw = RAW / f'{i:05d}.mp3'
    out = AUD / f'{i:05d}.mp3'
    if out.exists() and out.stat().st_size > 800:
        return (i, 'skip')
    if not raw.exists():
        return (i, 'noraw')
    try:
        src = raw
        if correctable and tones:
            snd = parselmouth.Sound(str(raw))
            if len(tones) == 1:
                inten = snd.to_intensity(time_step=0.005)
                iv, ti = inten.values[0], inten.xs()
                sel = [t for t, v in zip(ti, iv) if v > max(iv) * 0.75]
                if len(sel) >= 3:
                    res = apply_contours(snd, [sel[0], sel[-1]], tones)
                    wav = ROOT / f'tmp_{i:05d}.wav'
                    res.save(str(wav), 'WAV')
                    src = wav
            else:
                edges = boundaries(snd, len(tones))
                if edges and len(edges) == len(tones) + 1:
                    res = apply_contours(snd, edges, tones)
                    wav = ROOT / f'tmp_{i:05d}.wav'
                    res.save(str(wav), 'WAV')
                    src = wav
        d, sr = sf.read(str(src), dtype='float32')
        if d.ndim > 1:
            d = d.mean(axis=1)
        w = max(1, int(sr * 0.005))
        n = len(d) // w
        rms = np.sqrt(np.array([np.mean(d[j * w:(j + 1) * w] ** 2) for j in range(n)]) + 1e-12)
        k = np.where(rms > max(rms.max() * 0.04, 1e-4))[0]
        if len(k):
            a = max(0, k[0] * w - int(sr * 0.02))
            b = min(len(d), (k[-1] + 1) * w + int(sr * 0.03))
            d = d[a:b]
        d = d / (float(np.max(np.abs(d))) or 1.0) * 0.89
        f = min(int(sr * 0.01), len(d) // 4)
        if f:
            d[:f] *= np.linspace(0, 1, f)
            d[-f:] *= np.linspace(1, 0, f)
        sf.write(str(out), d, sr)
        if src != raw and Path(src).exists():
            os.remove(src)
        return (i, 'corrected' if correctable else 'natural')
    except Exception as e:  # noqa: BLE001
        return (i, f'err:{type(e).__name__}')


async def synth_all(items):
    sem = asyncio.Semaphore(CONCURRENCY)
    done = [0]
    failed = []

    async def one(it):
        p = RAW / f'{it["i"]:05d}.mp3'
        if p.exists() and p.stat().st_size > 800:
            done[0] += 1
            return
        async with sem:
            for attempt in range(5):
                try:
                    await edge_tts.Communicate(it['word'], VOICE, rate=RATE).save(str(p))
                    if p.exists() and p.stat().st_size > 800:
                        done[0] += 1
                        return
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(1.2 * (attempt + 1))
            failed.append(it['i'])

    tasks = [asyncio.create_task(one(it)) for it in items]
    while tasks:
        batch, tasks = tasks[:200], tasks[200:]
        await asyncio.gather(*batch)
        print(f'  合成 {done[0]}/{len(items)}（失败 {len(failed)}）', flush=True)
    return failed


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    AUD.mkdir(parents=True, exist_ok=True)
    items = json.loads((ROOT / 'list.json').read_text(encoding='utf-8'))
    if len(sys.argv) > 1:
        items = items[:int(sys.argv[1])]
    t0 = time.time()
    print(f'== 1/3 合成 {len(items)} 条 ==', flush=True)
    failed = asyncio.run(synth_all(items))
    print(f'合成完成 {time.time() - t0:.0f}s，失败 {len(failed)}', flush=True)
    print('== 2/3 校正 + 后处理 ==', flush=True)
    jobs = [(it['i'], it['tones'] if it['correctable'] else None, bool(it['correctable'])) for it in items]
    stats = {}
    with ProcessPoolExecutor(max_workers=WORKERS) as ex:
        for n, (_, status) in enumerate(ex.map(process_one, jobs, chunksize=20), 1):
            stats[status] = stats.get(status, 0) + 1
            if n % 1000 == 0:
                print(f'  处理 {n}/{len(jobs)}  {stats}', flush=True)
    print('处理完成:', stats, f'用时 {time.time() - t0:.0f}s', flush=True)
    print('== 3/3 manifest ==', flush=True)
    manifest = []
    for it in items:
        p = AUD / f'{it["i"]:05d}.mp3'
        if not p.exists():
            continue
        manifest.append({
            'i': it['i'], 'word': it['word'], 'roman': it['roman'],
            'zh': it['zh'], 'en': it['en'], 'common': it['common'],
            'tone': it['tones'][0] if len(it['tones']) == 1 else 0,
            'syllables': it['syllables'], 'corrected': bool(it['correctable']),
            'file': f'{it["i"]:05d}.mp3', 'bytes': p.stat().st_size,
        })
    (ROOT / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    total = sum(x['bytes'] for x in manifest)
    print(f'manifest: {len(manifest)} 条 / {total / 1024 / 1024:.1f} MB', flush=True)


if __name__ == '__main__':
    main()
