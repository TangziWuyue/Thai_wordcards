# 打包的字体

`web/fonts/` 下的 woff2 是从 Google Fonts 下载后放进仓库的，目的是让练习页在任何机器上都能显示标准印刷体泰文，不依赖系统装没装泰文字体。

## Sarabun（标准体，默认）

- 文件：`sarabun-400-thai.woff2`、`sarabun-400-latin.woff2`
- 版权：Copyright 2013 The Sarabun Project Authors
- 来源：https://fonts.google.com/specimen/Sarabun
- 授权：SIL Open Font License 1.1（全文见同目录 `OFL.txt`）
- 说明：泰国政府文书标准字体，也是很多泰语教材的印刷体。

## Noto Serif Thai（印刷衬线体）

- 文件：`noto-serif-thai-400-thai.woff2`、`noto-serif-thai-400-latin.woff2`
- 版权：Copyright 2022 The Noto Project Authors (https://github.com/notofonts/thai)
- 来源：https://fonts.google.com/noto/specimen/Noto+Serif+Thai
- 授权：SIL Open Font License 1.1（全文见同目录 `OFL.txt`）

## 说明

- 只打包了 Thai 与 Latin 两个 subset，各约 10KB。
- 二者都可自由使用、修改、再分发，条件是不得单独出售字体本身、保留版权声明。详见 `OFL.txt`。
- 界面里的「系统体」选项不打包字体，直接用你机器上的泰文字体（macOS 通常是 Sukhumvit Set / Thonburi）。
