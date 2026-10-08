"""音节 / 字母音频：edge-tts 合成 +（按需）声调曲线校正 + 裁剪归一。

清单由 export-syllables.mjs 生成（按声音去重，能借真词音频的直接拷贝）。
文件名就是 rules.js 的 soundKey：syl/v1/{key}.mp3（零清单，页面自己算路径）。
tone = 0 的条目只裁剪归一、不铺曲线（现在只有借词音频的那几条）。
环境变量可换清单 / 工作目录（试听或重跑用）：
  TWC_SYL_LIST 清单路径 | TWC_SYL_RAW / TWC_SYL_OUT 工作目录名。
支持断点续跑（已存在的输出会跳过）。

用法：
  uv run --with edge-tts --with numpy --with soundfile --with praat-parselmouth \
    python web/audio-tools/generate-syllables.py
可选：TWC_SYL_LIST=xxx.json 只跑指定清单（试听用）；TWC_CONCURRENCY=14。
"""
import asyncio
import json
import os
import shutil
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import edge_tts

WEB = Path(__file__).resolve().parent.parent
ROOT = Path(__file__).resolve().parent / '.work'
RAW = ROOT / os.environ.get('TWC_SYL_RAW', 'syl-raw')
AUD = ROOT / os.environ.get('TWC_SYL_OUT', 'syl-audio')
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
CONCURRENCY = int(os.environ.get('TWC_CONCURRENCY', '14'))
WORKERS = 4


def process_one(args):
    """子进程：声调校正 + 裁剪归一（tone=0 跳过校正）。"""
    import numpy as np
    import parselmouth
    import soundfile as sf

    key, tone = args
    raw = RAW / f'{key}.mp3'
    out = AUD / f'{key}.mp3'
    if out.exists() and out.stat().st_size > 800:
        return (key, 'skip')
    if not raw.exists():
        return (key, 'noraw')
    try:
        src = raw
        if tone:
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
                wav = RAW / f'tmp_{key}.wav'
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
        return (key, 'ok')
    except Exception as e:  # noqa: BLE001 —— 单条失败不拖垮整批
        return (key, f'err:{type(e).__name__}')


async def synth_all(items):
    sem = asyncio.Semaphore(CONCURRENCY)
    done = [0]
    failed = []

    async def one(it):
        key = it['key']
        out = AUD / f'{key}.mp3'
        if out.exists() and out.stat().st_size > 800:
            done[0] += 1
            return
        if it.get('copyFrom'):
            # 和现有真词音频同音同调：直接拷过来，不再合成
            src = WEB / 'audio' / it['copyFrom']
            if not src.exists():
                failed.append(key)
                return
            AUD.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, out)
            done[0] += 1
            return
        path = RAW / f'{key}.mp3'
        if path.exists() and path.stat().st_size > 800:
            done[0] += 1
            return
        async with sem:
            for attempt in range(5):
                try:
                    # say 是「要合成的写法」（可能和显示的字形不同），没有就按 text 读
                    await edge_tts.Communicate(it.get('say') or it['text'], VOICE, rate=RATE).save(str(path))
                    if path.exists() and path.stat().st_size > 800:
                        done[0] += 1
                        return
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(1.2 * (attempt + 1))
            failed.append(key)

    tasks = [asyncio.create_task(one(it)) for it in items]
    while tasks:
        batch, tasks = tasks[:200], tasks[200:]
        await asyncio.gather(*batch)
        print(f'  合成进度 {done[0]}/{len(items)}（失败 {len(failed)}）', flush=True)
    return failed


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    AUD.mkdir(parents=True, exist_ok=True)
    list_path = Path(os.environ.get('TWC_SYL_LIST', ROOT / 'syl-list.json'))
    items = json.loads(list_path.read_text(encoding='utf-8'))
    if len(sys.argv) > 1:   # 可选：只跑前 N 条
        items = items[:int(sys.argv[1])]
    t0 = time.time()
    print(f'== 1/3 合成 {len(items)} 条（借词 {sum(1 for x in items if x.get("copyFrom"))}）==', flush=True)
    failed = asyncio.run(synth_all(items))
    print(f'合成完成，用时 {time.time() - t0:.0f}s，失败 {len(failed)} 条', flush=True)
    print('== 2/3 校正 + 后处理 ==', flush=True)
    jobs = [(it['key'], it['tone'] if not it.get('copyFrom') else 0) for it in items]
    stats = {}
    with ProcessPoolExecutor(max_workers=WORKERS) as ex:
        for n, (_, status) in enumerate(ex.map(process_one, jobs, chunksize=20), 1):
            stats[status] = stats.get(status, 0) + 1
            if n % 500 == 0:
                print(f'  处理 {n}/{len(jobs)}  {stats}', flush=True)
    print('处理完成:', stats, f'用时 {time.time() - t0:.0f}s', flush=True)
    print('== 3/3 核对 ==', flush=True)
    missing = []
    total = 0
    for it in items:
        p = AUD / f'{it["key"]}.mp3'
        if p.exists():
            total += p.stat().st_size
        else:
            missing.append(it['key'])
    print(f'音节音频：{len(items) - len(missing)}/{len(items)} 条 / {total / 1024 / 1024:.1f} MB', flush=True)
    if missing:
        print(f'缺少 {len(missing)} 条：{" ".join(missing[:10])}…', flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
