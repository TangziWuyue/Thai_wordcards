/**
 * 把 web/audio 打包成小程序用的「离线发音包」：
 *   dist/miniprogram-audio.zip（zip 根目录就是 0001.mp3 … 5393.mp3）
 * 上传到微信云存储后，把 fileID 填进 miniprogram/core/audio-cloud.js。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const AUDIO = path.join(ROOT, 'web', 'audio');
const OUT = path.join(ROOT, 'dist', 'miniprogram-audio.zip');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
const count = fs.readdirSync(AUDIO).filter((f) => f.endsWith('.mp3')).length;
execFileSync('zip', ['-r', '-q', OUT, '.'], { cwd: AUDIO });
const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
console.log(`已生成 dist/miniprogram-audio.zip（${count} 条 / ${mb} MB）`);
console.log('下一步：微信开发者工具 → 云开发 → 存储 → 上传这个 zip → 复制 fileID → 填进 miniprogram/core/audio-cloud.js');
