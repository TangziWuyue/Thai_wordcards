/**
 * 发音播放：
 *   1. 包内前 20 条（assets/audio-demo）——工程一打开就能出声；
 *   2. 其余走「离线发音包」：云存储里放一个 audio.zip（5,393 条 / 约 29MB），
 *      第一次播放时下载并解压到本地，之后全部本地播放（不用再联网）。
 * 配置见 miniprogram/README.md：把 zip 的 fileID 填进 core/audio-cloud.js。
 */
const CLOUD = require('../core/audio-cloud.js');

const PACK_VERSION = 1;
const PACK_DIR = `${wx.env.USER_DATA_PATH}/audio-pack`;
const fs = wx.getFileSystemManager();
const DEMO = new Set(Array.from({ length: 20 }, (_, i) => `${String(i + 1).padStart(4, '0')}.mp3`));
let ctx = null;
let downloading = null;

function inner() {
  if (!ctx) {
    ctx = wx.createInnerAudioContext();
    ctx.obeyMuteSwitch = false;
  }
  return ctx;
}

function demoPath(file) {
  return `/assets/audio-demo/${file}`;
}

function packReady(file) {
  try {
    if (wx.getStorageSync('audioPackVersion') !== PACK_VERSION) return false;
    fs.accessSync(`${PACK_DIR}/${file}`);
    return true;
  } catch (e) {
    return false;
  }
}

function ensurePack() {
  if (!CLOUD.packFileID) return Promise.reject(new Error('还没配置发音包 fileID'));
  if (downloading) return downloading;
  downloading = new Promise((resolve, reject) => {
    wx.showLoading({ title: '下载发音包…', mask: true });
    wx.cloud.downloadFile({ fileID: CLOUD.packFileID })
      .then((res) => {
        wx.showLoading({ title: '解压发音包…', mask: true });
        try { fs.rmdirSync(PACK_DIR, true); } catch (e) { /* 首次没有这个目录 */ }
        try { fs.mkdirSync(PACK_DIR, true); } catch (e) { /* 已存在 */ }
        fs.unzip({
          zipFilePath: res.tempFilePath,
          targetPath: PACK_DIR,
          success: () => {
            wx.setStorageSync('audioPackVersion', PACK_VERSION);
            wx.hideLoading();
            downloading = null;
            resolve();
          },
          fail: (err) => {
            wx.hideLoading();
            downloading = null;
            reject(err);
          },
        });
      })
      .catch((err) => {
        wx.hideLoading();
        downloading = null;
        reject(err);
      });
  });
  return downloading;
}

/** 播放一个音频文件名；demoFirst 为 true 时优先用包内试听文件 */
function play(file, demoFirst = true) {
  const a = inner();
  a.stop();
  if (demoFirst && DEMO.has(file)) {
    a.src = demoPath(file);
    a.play();
    return Promise.resolve('demo');
  }
  if (packReady(file)) {
    a.src = `${PACK_DIR}/${file}`;
    a.play();
    return Promise.resolve('pack');
  }
  return ensurePack().then(() => {
    a.src = `${PACK_DIR}/${file}`;
    a.play();
    return 'downloaded';
  });
}

module.exports = { play, ensurePack, packReady };
