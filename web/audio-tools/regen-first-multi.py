"""把第一批（4 位文件名）里那 1,109 个多音节词，用逐音节方案重做一遍。
产出直接覆盖 web/audio/<file>.mp3 与 docs/audio/<file>.mp3。
用法：
  uv run --with edge-tts --with numpy --with soundfile --with praat-parselmouth \
    python web/audio-tools/regen-first-multi.py
"""
import asyncio
import json
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import edge_tts
import numpy as np
import parselmouth
import soundfile as sf

ROOT = Path(__file__).resolve().parent
WORK = ROOT / '.work-fix'
RAW = WORK / 'raw'
DONE = WORK / 'done'
ROOT_DIR = ROOT.parent.parent          # 仓库根
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


def boundaries(snd, n):
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


def fix_one(args):
    word, file, tones = args
    raw = RAW / file          # file 形如 0002.mp3
    if (DONE / file).exists():
        return (file, 'skip')
    try:
        snd = parselmouth.Sound(str(raw))
        edges = boundaries(snd, len(tones))
        if not edges or len(edges) != len(tones) + 1:
            return (file, 'no-boundaries')
        manip = parselmouth.praat.call(snd, 'To Manipulation', 0.01, 55, 520)
        tier = parselmouth.praat.call(manip, 'Create PitchTier', 'pt', edges[0], edges[-1])
        for i, tone in enumerate(tones):
            a, b = edges[i], edges[i + 1]
            pts = TARGET[tone]
            for k, semi in enumerate(pts):
                tt = a + (b - a) * (0.08 + 0.84 * k / (len(pts) - 1))
                parselmouth.praat.call(tier, 'Add point', tt, BASE * (2 ** (semi / 12)))
        parselmouth.praat.call([manip, tier], 'Replace pitch tier')
        res = parselmouth.praat.call(manip, 'Get resynthesis (overlap-add)')
        wav = WORK / f'{file}.wav'
        res.save(str(wav), 'WAV')
        d, sr = sf.read(str(wav), dtype='float32')
        if d.ndim > 1:
            d = d.mean(axis=1)
        w = max(1, int(sr * 0.005))
        n = len(d) // w
        rms = np.sqrt(np.array([np.mean(d[j * w:(j + 1) * w] ** 2) for j in range(n)]) + 1e-12)
        kk = np.where(rms > max(rms.max() * 0.04, 1e-4))[0]
        if len(kk):
            a = max(0, kk[0] * w - int(sr * 0.02))
            b = min(len(d), (kk[-1] + 1) * w + int(sr * 0.03))
            d = d[a:b]
        d = d / (float(np.max(np.abs(d))) or 1.0) * 0.89
        f = min(int(sr * 0.01), len(d) // 4)
        if f:
            d[:f] *= np.linspace(0, 1, f)
            d[-f:] *= np.linspace(1, 0, f)
        for target in [ROOT_DIR / 'web' / 'audio', ROOT_DIR / 'docs' / 'audio']:
            sf.write(str(target / file), d, sr)
        (DONE / file).write_text('1')
        if wav.exists():
            os.remove(wav)
        return (file, 'ok')
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return (file, f'err:{type(e).__name__}')


async def main():
    RAW.mkdir(parents=True, exist_ok=True)
    items = [x for x in json.loads((WORK / 'list.json').read_text(encoding='utf-8')) if x['correctable']]
    print(f'要重做 {len(items)} 条（多音节逐音节校正）', flush=True)
    sem = asyncio.Semaphore(10)

    async def synth(it):
        p = RAW / it['file']
        if p.exists() and p.stat().st_size > 800:
            return
        async with sem:
            for attempt in range(5):
                try:
                    await edge_tts.Communicate(it['word'], VOICE, rate=RATE).save(str(p))
                    if p.exists() and p.stat().st_size > 800:
                        return
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(1.2 * (attempt + 1))
            print('  合成失败:', it['word'], flush=True)

    tasks = [asyncio.create_task(synth(it)) for it in items]
    for i in range(0, len(tasks), 200):
        await asyncio.gather(*tasks[i:i + 200])
        print(f'  合成 {min(i + 200, len(tasks))}/{len(tasks)}', flush=True)
    DONE.mkdir(parents=True, exist_ok=True)
    jobs = [(it['word'], it['file'], it['tones']) for it in items]
    stats = {}
    for n, job in enumerate(jobs, 1):
        _, status = fix_one(job)
        stats[status] = stats.get(status, 0) + 1
        if n % 100 == 0 or n == len(jobs):
            print(f'  处理 {n}/{len(jobs)} {stats}', flush=True)
    print('完成:', stats, flush=True)


asyncio.run(main())
