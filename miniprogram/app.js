App({
  globalData: {
    // 云开发环境 ID：在 DevTools「云开发」里创建环境后填这里（见 miniprogram/README.md）
    cloudEnv: '',
  },
  onLaunch() {
    if (wx.cloud && this.globalData.cloudEnv) {
      wx.cloud.init({ env: this.globalData.cloudEnv, traceUser: true });
    }
  },
});
