"""按定稿口径批量生成单词发音：edge-tts 合成 + 声调曲线校正 + 裁剪归一 + 清单。

规格见 web/audio-tools/README.md。支持断点续跑（已存在的输出会跳过）。
用法：
  uv run --with edge-tts --with numpy --with soundfile --with praat-parselmouth \
    python web/audio-tools/generate.py
"""
import asyncio
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent / '.work'
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
CONCURRENCY = 6
WORKERS = 4


def process_one(args):
    """子进程：声调校正 + 裁剪归一（多音节只裁剪归一）。"""
    import numpy as np
    import parselmouth
    import soundfile as sf

    i, tone, single = args
    raw = RAW / f'{i:04d}.mp3'
    out = AUD / f'{i:04d}.mp3'
    if out.exists() and out.stat().st_size > 800:
        return (i, 'skip')
    if not raw.exists():
        return (i, 'noraw')
    try:
        src = raw
        if single and tone:
            snd = parselmouth.Sound(str(raw))
            inten = snd.to_intensity(time_step=0.005)
            iv, ti = inten.values[0], inten.xs()
            imax = max(iv)
            sel = [t for t, v in zip(ti, iv) if v > imax * 0.75]
            if len(sel) >= 3:
                t0, t1 = sel[0], sel[-1]
                manip = parselmouth.praat.call(snd, 'To Manipulation', 0.01, 55, 520)
                tier = parselmouth.praat.call(manip, 'Create PitchTier', 'pt', t0, t1)
                pts = TARGET[tone]
                for k, semi in enumerate(pts):
                    tt = t0 + (t1 - t0) * k / (len(pts) - 1)
                    parselmouth.praat.call(tier, 'Add point', tt, BASE * (2 ** (semi / 12)))
                parselmouth.praat.call([manip, tier], 'Replace pitch tier')
                res = parselmouth.praat.call(manip, 'Get resynthesis (overlap-add)')
                wav = ROOT / f'tmp_{i:04d}.wav'
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
        return (i, 'ok')
    except Exception as e:  # noqa: BLE001 —— 单条失败不拖垮整批
        return (i, f'err:{type(e).__name__}')


async def synth_all(items):
    sem = asyncio.Semaphore(CONCURRENCY)
    done = [0]
    failed = []

    async def one(it):
        i = it['i']
        path = RAW / f'{i:04d}.mp3'
        if path.exists() and path.stat().st_size > 800:
            done[0] += 1
            return
        async with sem:
            for attempt in range(5):
                try:
                    await edge_tts.Communicate(it['word'], VOICE, rate=RATE).save(str(path))
                    if path.exists() and path.stat().st_size > 800:
                        done[0] += 1
                        return
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(1.2 * (attempt + 1))
            failed.append(i)

    tasks = [asyncio.create_task(one(it)) for it in items]
    while tasks:
        batch, tasks = tasks[:200], tasks[200:]
        await asyncio.gather(*batch)
        print(f'  合成进度 {done[0]}/{len(items)}（失败 {len(failed)}）', flush=True)
    return failed


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    AUD.mkdir(parents=True, exist_ok=True)
    items = json.loads((ROOT / 'list.json').read_text(encoding='utf-8'))
    if len(sys.argv) > 1:   # 可选：只跑前 N 条（试听/调试）
        items = items[:int(sys.argv[1])]
    t0 = time.time()
    print(f'== 1/3 合成 {len(items)} 条 ==', flush=True)
    failed = asyncio.run(synth_all(items))
    print(f'合成完成，用时 {time.time() - t0:.0f}s，失败 {len(failed)} 条', flush=True)
    print('== 2/3 校正 + 后处理 ==', flush=True)
    jobs = [(it['i'], it['tone'], 1 if (it['syllables'] == 1 and it['tone']) else 0) for it in items]
    stats = {}
    with ProcessPoolExecutor(max_workers=WORKERS) as ex:
        for n, (_, status) in enumerate(ex.map(process_one, jobs, chunksize=20), 1):
            stats[status] = stats.get(status, 0) + 1
            if n % 500 == 0:
                print(f'  处理 {n}/{len(jobs)}  {stats}', flush=True)
    print('处理完成:', stats, f'用时 {time.time() - t0:.0f}s', flush=True)
    print('== 3/3 manifest ==', flush=True)
    manifest = []
    for it in items:
        p = AUD / f'{it["i"]:04d}.mp3'
        if not p.exists():
            continue
        manifest.append({
            'i': it['i'], 'word': it['word'], 'roman': it['roman'],
            'zh': it['zh'], 'en': it['en'], 'common': it['common'],
            'tone': it['tone'], 'syllables': it['syllables'],
            'file': f'{it["i"]:04d}.mp3', 'bytes': p.stat().st_size,
        })
    (ROOT / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    total = sum(x['bytes'] for x in manifest)
    print(f'manifest: {len(manifest)} 条 / {total / 1024 / 1024:.1f} MB', flush=True)


if __name__ == '__main__':
    main()
