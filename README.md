# 007学英语 · 本地版

单文件离线英语阅读应用，调用 OpenRouter 的模型。数据全部存在本机浏览器里。

## 日常使用

双击 **`dian-du-openrouter.html`**，用 **Chrome** 打开。

> ⚠️ 不要用 Safari。Safari 禁止本地文件页面使用 localStorage，生词本会存不住且不报错。

## 改动流程

1. 改 **`dian-du-openrouter-source.jsx`**（所有界面和功能都在这个文件里）
2. 双击 **`构建.command`**（或在终端跑 `npm run build`）
3. 回到浏览器按 `Cmd + Shift + R` 强制刷新

改坏了想退回：

```bash
git log --oneline        # 看历史版本
git checkout <编号> -- dian-du-openrouter-source.jsx
npm run build
```

或者直接把 `dian-du-openrouter.html.bak` 改名回去，恢复上一版产物。

## 文件说明

| 文件 | 作用 |
|---|---|
| `dian-du-openrouter-source.jsx` | **源码**，改这个 |
| `main.jsx` | 打包入口，基本不用动 |
| `template.html` | HTML 骨架，改标题/背景色时动 |
| `build.mjs` | 构建脚本 |
| `构建.command` | 双击即可重新打包 |
| `dian-du-openrouter.html` | **产物**，双击使用；由构建生成，别手改 |
| `诊断.html` | 出问题时跑一次，显示 HTTP 状态和原始返回 |
| `切换模型.html` | 一键切换使用的模型 |

## 两个踩过的坑

**1. HTTP 请求头不能写中文**

原代码发 `X-Title: "007学英语"`，浏览器 `fetch` 会直接抛
`TypeError: String contains non ISO-8859-1 code point`。而代码把 fetch 的所有异常
都归到 `NET` 分支，于是误报成「连不上服务器，检查网络」，极具误导性。
已改为 ASCII。**以后加任何请求头都只能用 ASCII。**

**2. OpenAI / Anthropic 模型返回 403**

报错原文 `The request is prohibited due to a violation of provider Terms Of Service`。
不是 Key 或余额问题，而是代理出口是**机房 IP**，被判定为代理而拒绝。
DeepSeek 不做这种拦截，所以只有它能用。

查自己的出口 IP 类型：

```bash
curl "http://ip-api.com/json/?fields=hosting,country,isp"
```

`hosting: true` 是机房 IP（会被拦），`false` 是住宅 IP（能过）。
要用 Claude / GPT 就得换「原生 / 家宽 / 住宅 IP」节点。

## 数据

存在浏览器 localStorage，键名 `dd-vocab-v1` / `dd-tabs-v1` / `dd-stats-v1` /
`dd-prefs-v1` / `dd-or-key` / `dd-or-model`。

**改版时绝对不要改这些键名**，否则用户数据会「消失」。

清 Chrome 浏览数据会连生词本一起清掉。生词本页有「复制为 Markdown」导出，
应用也能反向解析导入 —— 这是唯一的备份和换设备通道。
