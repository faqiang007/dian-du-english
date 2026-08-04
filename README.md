# 007学英语

> 一个单文件的 AI 英语分级阅读器。双击 HTML 就能用，不需要服务器、不需要安装。

按你的水平生成英语短文，点任意单词即时查释义，读完自动出题——答得好下次自动升难度。查过的生词会被织进后续文章里反复遇见，配合间隔复习，让单词在真实语境中记住，而不是背单词表。

所有数据存在你自己的浏览器里，不上传任何服务器。AI 能力通过 [OpenRouter](https://openrouter.ai) 调用，一把 Key 可切换几十家模型。

---

## 功能

**阅读**

- **AI 生成分级文章** —— 输入任意主题，生成对应难度的英语短文，附一句话中文导读
- **五档难度** —— A2 入门（初中）/ B1 基础（高中·四级）/ B2 进阶（六级）/ C1 高级（考研·雅思）/ C2 挑战（外刊原版），150–300 词
- **导入自己的材料** —— 粘贴文本、上传文件（`.txt` / `.md` / `.docx`）、或给一个网址让 AI 抓取正文
- **多标签页** —— 最多同时开 6 篇，随时切换，关掉浏览器也不丢

**查询**

- **点词查释义** —— 音标、词性、多条释义、例句；结合上下文给出该词在**当前句子**里的准确含义
- **中英互查** —— 输入中文词也能查英文对应说法，带用法与语气说明
- **整句解析** —— 拆出主谓宾等成分，点明从句类型、时态、固定搭配
- **划词翻译** —— 选中任意句子或段落即时翻译
- **全文对照** —— 一键生成逐段中文译文，与原文对照阅读
- **追问对话** —— 对某个单词继续提问，回答里出现的好词可直接收藏

**记忆**

- **生词本** —— 一键收藏，支持导出／导入 Markdown
- **间隔复习** —— 答对则间隔翻 2.5 倍（1 天 → 2.5 天 → 6 天…最长 60 天），答错则 12 小时后重来
- **生词织入** —— 生成新文章时，自动挑选最该复习的生词自然融入正文，并记录你与它的相遇次数
- **读后小测** —— 3 道单选题，优先考察你查过的词；全对自动升一档难度，答对不足 2 题自动降档

**朗读**

- **全文朗读** —— 逐句高亮跟随，自动滚动
- **跟读模式** —— 一句一停等你复述，可切慢速重播
- **语音可选** —— 自动优先选择设备上音质最好的英语语音，语速可调

**其他**

- **学习统计** —— 连续学习天数、每日文章／小测／复习次数
- **外观** —— 纸白／米黄／豆绿／夜间四套配色，衬线与无衬线字体，五档字号
- **选题提炼** —— 从文章内容提炼短视频选题（给内容创作者用）

---

## 快速开始

### 1. 拿到应用

```bash
git clone https://github.com/faqiang007/dian-du-english.git
```

或直接下载仓库里的 `dian-du-openrouter.html` 单个文件。

### 2. 用 Chrome 打开

双击 `dian-du-openrouter.html`。

> ⚠️ **不要用 Safari。** Safari 禁止本地文件页面使用 localStorage，生词本会存不住，而且不会报错。

### 3. 填 API Key

首次打开会看到设置页：

1. 去 [openrouter.ai](https://openrouter.ai) 注册，在 Keys 页面创建一把 Key（`sk-or-` 开头）
2. 在 Credits 页面充几美元，按用量计费
3. 把 Key 填进设置页，模型留空则用默认的 `deepseek/deepseek-v4-pro`

Key 只存在你的浏览器里，不会发给除 OpenRouter 之外的任何地方。

**成本参考**：生成一篇 200 词文章约 0.0035 元，查一个词约 0.002 元。日常使用一个月通常不到几块钱。

---

## 开发

### 环境

```bash
npm install
```

### 构建

改完源码后：

```bash
npm run build
```

macOS 用户也可以直接双击 **`构建.command`**。

构建约 130ms，产出单文件 `dian-du-openrouter.html`（约 766KB，React、图标、docx 解析库全部内联）。构建是可复现的——同一份源码重新构建，产物字节一致。

改动后回到浏览器按 `Cmd + Shift + R` 强制刷新。

### 项目结构

```
dian-du-openrouter-source.jsx   源码，所有界面和功能都在这里
main.jsx                        打包入口
template.html                   HTML 骨架（改标题、背景色时动）
build.mjs                       构建脚本
构建.command                     双击即可重新打包（macOS）
dian-du-openrouter.html         构建产物，别手改
诊断.html                        连接排查工具，显示 HTTP 状态与原始返回
切换模型.html                     一键切换所用模型
```

### 回退

```bash
git log --oneline
git checkout <commit> -- dian-du-openrouter-source.jsx
npm run build
```

每次构建也会自动把上一版产物存为 `dian-du-openrouter.html.bak`。

---

## 数据与隐私

所有数据存在浏览器 localStorage，**不经过任何第三方服务器**（除了你主动发起的 OpenRouter 请求）。

| 键名 | 内容 |
|---|---|
| `dd-vocab-v1` | 生词本 |
| `dd-tabs-v1` | 打开的文章标签页 |
| `dd-stats-v1` | 学习统计 |
| `dd-prefs-v1` | 外观与语音偏好 |
| `dd-or-key` | OpenRouter API Key |
| `dd-or-model` | 所用模型 |

> 改版时**不要改这些键名**，否则用户数据会「消失」。

**备份**：清除浏览器数据会连生词本一起清掉。生词本页有「复制为 Markdown」导出，应用也能反向解析导入——这是唯一的备份与换设备通道。

---

## 已知限制

- **数据不跨设备同步。** localStorage 属于单个浏览器，换设备＝空的生词本。这是设计上的取舍：无服务器、无账号、零成本、完全私密。
- **必须用 Chrome 或 Edge。** Safari 不支持本地文件页面的 localStorage。
- **导入网页依赖模型的联网能力。** 抓不到时把正文复制出来用「粘贴文本」导入最稳。
- **朗读音质取决于设备。** 用的是浏览器内置语音合成，苹果设备和 Windows + Edge 效果最好。

---

## 疑难排查

### 报「连不上 OpenRouter 服务器」但网络正常

代码把 `fetch` 的所有异常都归到网络错误分支，所以**请求在发出前就失败**时也会显示这条。最常见的原因是给请求头设了非 ASCII 的值：

```js
// ✗ 浏览器会抛 TypeError: String contains non ISO-8859-1 code point
headers: { "X-Title": "007学英语" }

// ✓
headers: { "X-Title": "007 English Reader" }
```

**加任何请求头都只能用 ASCII 字符。**

### OpenAI / Anthropic 的模型返回 403

报错原文：

```
The request is prohibited due to a violation of provider Terms Of Service
```

这不是 Key 无效也不是余额不足，而是你的出口 IP 是**机房 IP**，被模型提供方判定为代理而拒绝。DeepSeek 不做这种拦截，所以往往表现为「只有 DeepSeek 能用」。

查自己的出口 IP 类型：

```bash
curl "http://ip-api.com/json/?fields=hosting,country,isp"
```

`hosting: true` 是机房 IP（会被拦），`false` 是住宅 IP（能过）。要用 Claude 或 GPT，需要切换到「原生 / 家宽 / 住宅 IP」节点。

### 其他情况

用浏览器打开 `诊断.html`，它会读取已保存的设置实际发一次请求，把 HTTP 状态码和原始返回完整显示出来，并指出解析在哪一步失败。

---

## 技术栈

| | |
|---|---|
| 界面 | React 18.3.1（无框架、无路由、无状态管理库） |
| 图标 | lucide-react |
| 文档解析 | mammoth（读 `.docx`） |
| 打包 | esbuild，单文件内联输出 |
| AI | OpenRouter（OpenAI 兼容协议） |
| 存储 | 浏览器 localStorage |
| 朗读 | Web Speech API |

没有构建产物之外的运行时依赖，没有后端，没有数据库。

---

## 许可

尚未指定。如果打算让别人使用或修改，建议补一个 `LICENSE` 文件（个人项目通常选 MIT）。
