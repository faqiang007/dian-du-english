/* ============================================================
   007学英语 · 本地版源代码（多服务商引擎）
   —— 请和 dian-du-openrouter.html 一起保存好！

   基于云端 v9 全功能版改造：storage 换成 localStorage，
   callClaude 支持多家模型服务商（见下方 PROVIDERS 表），
   新增服务商 / API Key / 模型 设置页（首次打开会看到）。
   界面、交互逻辑与云端版完全一致，未来云端版再更新，
   把新的 app.jsx 内容整体替换本文件的对应部分即可同步。

   加新服务商：只要它的接口兼容 OpenAI 的 /chat/completions 格式，
   在 PROVIDERS 里加一条就行，不用改其他任何代码。
   前提是该服务商的 CORS 要放行 file:// 的 null 来源——
   现有 9 家都实测通过，新增时可以这样验证：
     curl -X OPTIONS <接口地址> -H "Origin: null" \
       -H "Access-Control-Request-Method: POST" \
       -H "Access-Control-Request-Headers: authorization,content-type" -D -
   返回头里有 access-control-allow-origin 就说明可以直连。

   重新打包步骤：
   1. npm i react@18.3.1 react-dom@18.3.1 lucide-react@0.383.0 mammoth esbuild
   2. 入口 main.jsx：
      import { createRoot } from "react-dom/client";
      import App from "./app.jsx";
      createRoot(document.getElementById("root")).render(<App />);
   3. esbuild main.jsx --bundle --minify --jsx=automatic
        --define:process.env.NODE_ENV='"production"' --outfile=bundle.js
   4. 把 bundle.js 内联进 HTML 的 <script> 标签
      （先把字符串 </script 替换为 <\/script），HTML 骨架：
      <div id="root"></div> + 背景色 #FCFBF7

   数据存在浏览器 localStorage（键名 dd-vocab-v1 / dd-tabs-v1 /
   dd-stats-v1 / dd-prefs-v1 / dd-provider / dd-keys-v1 / dd-models-v1，
   另有旧版的 dd-or-key / dd-or-model 用于自动迁移），
   改版时不要改这些键名，否则用户数据会"消失"。
   ============================================================ */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Sparkles, Volume2, Plus, Check, X, RefreshCw,
  Play, Square, Dices, Trash2, Copy, Loader2, BookOpen,
  Brain, BarChart3, Puzzle, ClipboardCheck,
  ChevronLeft, ChevronRight, RotateCcw, Turtle, Flame,
  Languages, Upload, Download, FileUp, ChevronDown, MoreHorizontal,
  KeyRound, Settings, Bookmark, Menu, Globe, ExternalLink,
  MessagesSquare, Send, CornerDownLeft, GraduationCap
} from "lucide-react";
import mammoth from "mammoth";
import { unzipSync, strFromU8 } from "fflate";

/* ============================================================
   007学英语 · AI 英语阅读
   AI 生成分级文章 · 点词查释义 · 整句解析 · 对照翻译 ·
   间隔复习 · 生词织入 · 小测自动调难 · 跟读 · 学习统计
   ============================================================ */

const LEVELS = [
  { id: "A2", label: "入门", tag: "初中 · A1–A2", words: 150,
    spec: "只使用最常见的 1000 个基础词汇，句子简短（8–12 词），全部使用简单时态" },
  { id: "B1", label: "基础", tag: "高中/四级 · B1", words: 200,
    spec: "使用高中及大学四级范围词汇，句式清晰，偶尔使用复合句" },
  { id: "B2", label: "进阶", tag: "六级 · B2", words: 240,
    spec: "使用大学六级范围词汇，包含常见短语动词和从句" },
  { id: "C1", label: "高级", tag: "考研/雅思 · C1", words: 280,
    spec: "使用考研与雅思 7 分水平词汇，句式多样，包含地道搭配与习语" },
  { id: "C2", label: "挑战", tag: "外刊原版 · C2", words: 300,
    spec: "外刊原版水平（The Economist / The Atlantic 风格），词汇高级地道，论证有深度" },
];

/* 话题按分类组织。每类给足条目，「换一批」才不会翻来覆去就那几篇。
   这些只是**起手提示**，真正写什么由模型决定，输入框里也能随便改。
   加分类：往下面加一条就行，界面会自动多出一个按钮。 */
const TOPIC_CATS = [
  { id: "tech", name: "科技", pool: [
    "手机芯片是怎么造出来的", "海底光缆如何连接世界", "电池为什么会老化",
    "无人机送货离我们还有多远", "为什么充电口最后统一成了 Type-C",
    "卫星互联网怎么覆盖偏远地区", "自动驾驶卡在哪一步", "指纹解锁的原理",
    "机械键盘为什么让人上瘾", "二维码是怎么被发明的", "折叠屏难在哪里",
    "为什么家用机器人还没普及", "数据中心为什么建在冷的地方",
    "无线充电到底损失了多少电", "老式相机为什么又火了", "语音助手听懂话的过程",
    "为什么有些网站打开特别慢", "键盘上的字母为什么这样排列" ] },
  { id: "ai", name: "AI", pool: [
    "大语言模型是怎么学会说话的", "AI 为什么会一本正经地胡说",
    "AI 画画和人画画的区别", "机器翻译走过的三个阶段",
    "推荐算法如何猜中你的心思", "AI 在医院里能做什么",
    "自动驾驶如何判断前方是行人", "AI 生成的声音怎么以假乱真",
    "训练一个模型要用掉多少电", "AI 会取代哪些工作，又造出哪些",
    "人脸识别的边界在哪里", "AI 下棋比人强在什么地方",
    "为什么 AI 数不清一句话里有几个字母", "AI 帮科学家找新药的方式",
    "开源模型和闭源模型的区别", "AI 需要多少数据才够用",
    "机器人学会走路有多难", "AI 写代码到什么水平了" ] },
  { id: "sport", name: "运动", pool: [
    "马拉松最后几公里发生了什么", "为什么游泳能练全身",
    "跑步伤膝盖是真的吗", "肌肉是怎么长出来的",
    "运动员的心率为什么比常人低", "拉伸到底该在运动前还是后",
    "足球越位规则的来历", "篮球三分线为什么定在那个距离",
    "攀岩者如何克服恐高", "举重选手为什么要大喊",
    "为什么高原训练能提高成绩", "羽毛球球速能有多快",
    "长跑运动员的呼吸节奏", "冷水浴对恢复有用吗",
    "一场网球比赛要跑多远", "滑雪如何在雪面上转弯",
    "运动后为什么会肌肉酸痛", "为什么有人越练越累" ] },
  { id: "science", name: "科学", pool: [
    "为什么天空是蓝色的", "人类为什么会做梦", "深海里的发光生物",
    "闪电形成的一瞬间", "为什么水结冰会膨胀", "极光是怎么来的",
    "蜡烛火焰为什么是上尖下圆", "地震波如何穿过地球",
    "蜂巢为什么是六边形", "彩虹的两端到底在哪", "声音在水里传得更快吗",
    "为什么金属摸起来更凉", "沙漠里的水从哪来", "树能长到多高",
    "为什么盐能融化冰雪", "指南针指向的到底是哪里",
    "细菌和病毒有什么不同", "时间为什么不能倒流" ] },
  { id: "space", name: "太空", pool: [
    "宇航员的一天", "一封来自火星的信", "月球背面有什么",
    "火箭是怎么飞出大气层的", "太空里为什么听不到声音",
    "宇航服里藏着什么装置", "国际空间站如何供水",
    "为什么去火星要等窗口期", "望远镜如何看到几十亿年前的光",
    "太空垃圾有多危险", "失重下人体会发生什么变化",
    "黑洞照片是怎么拍的", "为什么木星有那么多卫星",
    "探测器如何靠引力弹弓加速", "在太空种菜可行吗",
    "土星环是由什么组成的", "宇宙到底有没有边", "第一颗人造卫星的故事" ] },
  { id: "biz", name: "商业", pool: [
    "咖啡的环球之旅", "一家百年面馆的故事", "集装箱如何改变了贸易",
    "为什么机票价格一直在变", "超市货架的摆放心机",
    "免费的产品靠什么赚钱", "一杯奶茶的成本构成",
    "品牌 logo 为什么越改越简单", "会员制商店的生意经",
    "为什么便利店总开在路口", "快时尚背后的供应链",
    "二手市场为什么越来越大", "订阅制是怎么流行起来的",
    "小众品牌如何找到自己的人", "为什么有些店故意排长队",
    "包装设计对销量的影响", "一件商品从工厂到你手上的路",
    "打折为什么总在特定日子" ] },
  { id: "health", name: "健康", pool: [
    "睡眠分成哪几个阶段", "为什么熬夜后特别想吃甜的",
    "咖啡因在身体里待多久", "久坐对身体做了什么",
    "喝水到底要不要八杯", "肠道菌群和情绪的关系",
    "为什么冬天更容易感冒", "护眼的正确做法",
    "情绪压力如何影响免疫力", "为什么有人天生浅眠",
    "早餐真的最重要吗", "走一万步这个数字从哪来",
    "为什么疼痛因人而异", "维生素补充剂有用吗",
    "打哈欠会传染的原因", "冥想对大脑的实际影响",
    "为什么有些人怎么吃都不胖", "戒糖之后身体的变化" ] },
  { id: "nature", name: "自然", pool: [
    "猫为什么会发出咕噜声", "一座即将消失的小岛", "候鸟如何找到方向",
    "蚂蚁社会的分工", "树木之间会交流吗", "珊瑚白化意味着什么",
    "沙漠动物如何度过白天", "章鱼有多聪明",
    "为什么有些花只在夜里开", "蜜蜂消失会怎样",
    "企鹅怎么在南极过冬", "森林大火之后发生什么",
    "鲸鱼的歌声传多远", "变色龙变色的真正原因",
    "种子能休眠多久", "城市里的野生动物",
    "为什么有的树会落叶有的不会", "土壤里有多少生命" ] },
  { id: "culture", name: "文化", pool: [
    "面包的简史", "地铁里的陌生人", "如果动物会开会",
    "文字是怎么被发明的", "为什么各国插座不一样",
    "一部电影的配乐如何影响情绪", "地名背后的历史",
    "为什么钟表是顺时针", "博物馆如何决定展出什么",
    "翻译一本小说会丢掉什么", "节日食物的由来",
    "为什么图书馆要保持安静", "路牌字体的讲究",
    "一门语言消失的过程", "为什么有些歌全世界都会哼",
    "手写信正在消失吗", "城市广场的功能变迁", "颜色在不同文化里的含义" ] },
];

function catOf(id) {
  return TOPIC_CATS.find((c) => c.id === id) || TOPIC_CATS[0];
}

const VOCAB_KEY = "dd-vocab-v1";
const ARTICLE_KEY = "dd-article-v1";
const STATS_KEY = "dd-stats-v1";
const TABS_KEY = "dd-tabs-v1";
const MAX_TABS = 6;

/* ---- 读过的文章 ----
   以前关掉标签页或「换一篇」就把原文永久删掉了，读过的东西除了当下开着的
   6 篇之外一律不存在。而重读旧文章巩固词汇的效果比读新文章更好——同一批
   词在同一个语境里再见一次。所以关掉/替换时先归档。
   只留最近 HISTORY_MAX 篇、总量不超过 HISTORY_CHARS，超了丢最旧的；
   译文不归档（占地方且能随时重新生成）。 */
/* 情景对话的场景。每个场景给 AI 一个明确的身份和目标，
   比笼统地说"陪我练英语"有效得多——后者聊两句就变成互相寒暄。 */
const SCENES = [
  { id: "cafe", label: "咖啡店点单", icon: "☕", role: "咖啡店店员", goal: "让学习者完成点单：选饮品、说明规格、结账" },
  { id: "job", label: "工作面试", icon: "💼", role: "面试官", goal: "问学习者的经历、优势和一个技术问题，追问细节" },
  { id: "doctor", label: "看医生", icon: "🩺", role: "全科医生", goal: "问清症状、持续时间，给出建议" },
  { id: "trip", label: "问路与出行", icon: "🧭", role: "热心的当地人", goal: "帮学习者找到目的地，说明换乘或步行路线" },
  { id: "hotel", label: "酒店入住", icon: "🏨", role: "酒店前台", goal: "办理入住：确认预订、房型、早餐和退房时间" },
  { id: "chat", label: "随便聊聊", icon: "💬", role: "同龄的外国朋友", goal: "从学习者的近况聊起，自然地把话题延续下去" },
];

const HISTORY_KEY = "dd-history-v1";
const HISTORY_MAX = 20;
const HISTORY_CHARS = 400000;

function trimHistory(list) {
  const out = [];
  let chars = 0;
  for (const h of list) {
    const n = (h.chapters || []).join("").length;
    if (out.length >= HISTORY_MAX || chars + n > HISTORY_CHARS) break;
    out.push(h);
    chars += n;
  }
  return out;
}
/* 每章的目标词数。定成 350 是因为查词、译文、小测都要把整章发给模型，
   再长就容易漏段和跑题。想读长文档不靠调大它，靠分章。 */
const CHAPTER_WORDS = 350;
/* 抓网页时最多要多少词。分章功能做出来之前这里写死 300，
   导致抓回来的永远只是页面的一小片。上限放宽后由分章接手。
   注意别调太大：搜索插件喂给模型的本身就是摘录，
   要得比它实际读到的多，它就会开始补写——真实来源反而更危险。 */
const FETCH_WORDS = 800;
/* 单篇文档的字符上限。浏览器 localStorage 实测约 480 万字符封顶，
   且要和生词本、统计、其他文章共用，所以给单篇留 150 万——
   约 25 万英文词，两本长篇小说的量。 */
const MAX_DOC_CHARS = 1500000;
const APIKEY_STORE = "dd-or-key";      // 旧版单一 Key（仅用于迁移）
const MODEL_STORE = "dd-or-model";     // 旧版单一模型（仅用于迁移）
const PROVIDER_STORE = "dd-provider";  // 当前选中的服务商 id
const KEYS_STORE = "dd-keys-v1";       // { 服务商id: apiKey }
const MODELS_STORE = "dd-models-v1";   // { 服务商id: 模型名 }
const PREFS_KEY = "dd-prefs-v1";

/* ---------- 模型服务商 ----------
   全部实测支持浏览器直连（CORS 放行 file:// 的 null 来源）。
   protocol: "openai" = 标准 /chat/completions；"anthropic" = Messages API。
   modelsUrl 存在时，设置页可一键拉取该服务商的真实模型列表，
   所以 defaultModel 只是初始建议，过时了点一下按钮就能更新。 */
const PROVIDERS = {
  openrouter: {
    name: "OpenRouter", protocol: "openai", webSearch: true,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    defaultModel: "deepseek/deepseek-v4-pro",
    keyHint: "sk-or-...", site: "openrouter.ai",
    blurb: "一把钥匙调用几十家模型，模型名格式是「厂商/模型」。国内需要开代理。",
    proxy: true,
  },
  deepseek: {
    name: "DeepSeek 深度求索", protocol: "openai",
    endpoint: "https://api.deepseek.com/chat/completions",
    modelsUrl: "https://api.deepseek.com/models",
    defaultModel: "deepseek-chat",
    keyHint: "sk-...", site: "platform.deepseek.com",
    blurb: "国内直连不用代理，价格便宜，是日常使用的推荐选择。",
  },
  moonshot: {
    name: "月之暗面 Kimi", protocol: "openai",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    modelsUrl: "https://api.moonshot.cn/v1/models",
    defaultModel: "kimi-latest",
    keyHint: "sk-...", site: "platform.moonshot.cn",
    blurb: "国内直连不用代理，中文语感好。",
  },
  zhipu: {
    name: "智谱 GLM", protocol: "openai",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    modelsUrl: "",
    defaultModel: "glm-4-plus",
    keyHint: "一串带「.」的密钥", site: "bigmodel.cn",
    blurb: "国内直连不用代理。该平台不提供模型列表接口，模型名请照官网文档填写。",
  },
  qwen: {
    name: "阿里通义千问", protocol: "openai",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    modelsUrl: "",
    defaultModel: "qwen-plus",
    keyHint: "sk-...", site: "bailian.console.aliyun.com",
    blurb: "国内直连不用代理。在阿里云百炼平台开通后获取密钥。",
  },
  siliconflow: {
    name: "硅基流动 SiliconFlow", protocol: "openai",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    modelsUrl: "https://api.siliconflow.cn/v1/models",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    keyHint: "sk-...", site: "siliconflow.cn",
    blurb: "国内直连不用代理，聚合了很多开源模型，注册送额度。",
  },
  anthropic: {
    name: "Anthropic Claude", protocol: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    modelsUrl: "https://api.anthropic.com/v1/models",
    defaultModel: "claude-sonnet-5",
    keyHint: "sk-ant-...", site: "console.anthropic.com",
    blurb: "Claude 官方接口。国内需要开代理，且代理必须是家宽/住宅 IP，机房 IP 会被拒。",
    proxy: true,
  },
  openai: {
    name: "OpenAI", protocol: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    modelsUrl: "https://api.openai.com/v1/models",
    defaultModel: "gpt-4o",
    keyHint: "sk-...", site: "platform.openai.com",
    blurb: "OpenAI 官方接口。国内需要开代理，且代理必须是家宽/住宅 IP，机房 IP 会被拒。",
    proxy: true,
  },
  gemini: {
    name: "Google Gemini", protocol: "openai",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    defaultModel: "gemini-2.5-flash",
    keyHint: "AIza...", site: "aistudio.google.com",
    blurb: "Google AI Studio 提供免费额度。国内需要开代理。",
    proxy: true,
  },
};
const PROVIDER_IDS = Object.keys(PROVIDERS);
const DEFAULT_PROVIDER = "openrouter";

function providerOf(id) { return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER]; }

/* 读取「每个服务商各存一份」的 Key / 模型，并把旧版单 Key 数据迁移进来 */
function loadKeyMap() {
  const m = sGet(KEYS_STORE) || {};
  if (!m[DEFAULT_PROVIDER]) {
    try {
      const old = localStorage.getItem(APIKEY_STORE);
      if (old) { m[DEFAULT_PROVIDER] = old; sSet(KEYS_STORE, m); }
    } catch (e) {}
  }
  return m;
}
function loadModelMap() {
  const m = sGet(MODELS_STORE) || {};
  if (!m[DEFAULT_PROVIDER]) {
    try {
      const old = localStorage.getItem(MODEL_STORE);
      if (old) { m[DEFAULT_PROVIDER] = old; sSet(MODELS_STORE, m); }
    } catch (e) {}
  }
  return m;
}
function loadProviderId() {
  try {
    const p = localStorage.getItem(PROVIDER_STORE);
    if (p && PROVIDERS[p]) return p;
  } catch (e) {}
  return DEFAULT_PROVIDER;
}

/* ---------- 外观主题 ---------- */
/* 配色统一走 CSS 变量，主题只覆盖其中几个。
   --paper 是页面底色、--card 是卡片底色，两者必须拉开差距，
   否则卡片会「糊」在背景里——这正是旧版看着扁平的原因。 */
const BASE_VARS = {
  "--paper": "#F5F6F8", "--card": "#FFFFFF", "--ink": "#111826", "--ink2": "#4B5565",
  "--mut": "#98A2B3", "--line": "#E3E6EC", "--line2": "#F0F2F5",
  "--blue": "#4055C6", "--blue-d": "#33449E", "--blue-bg": "#EEF1FD",
  "--hi": "#F5B944", "--hi-hot": "#F0A81E", "--hi-soft": "#FEF3D6", "--hi-wash": "#FEF8E8",
  "--hi-text": "#7A5200", "--ok": "#12855F", "--ok-bg": "#E7F5EF",
  "--bad": "#C4342B", "--bad-bg": "#FDECEA",
  "--top": "rgba(245,246,248,.88)", "--sk": "#EDEFF3",
  "--sh": "0 1px 2px rgba(17,24,38,.04)", "--sh-l": "0 4px 16px rgba(64,85,198,.10)",
};
const THEMES = {
  paper: { name: "纸白", swatch: "#F5F6F8", vars: BASE_VARS },
  cream: { name: "米黄", swatch: "#F4ECDC", vars: { ...BASE_VARS,
    "--paper": "#F4ECDC", "--card": "#FFFBF2", "--line": "#E6DAC2", "--line2": "#F0E8D6",
    "--top": "rgba(244,236,220,.9)", "--sk": "#EBE1CB",
    "--sh": "0 1px 2px rgba(90,70,35,.05)" } },
  green: { name: "豆绿", swatch: "#E4EEDF", vars: { ...BASE_VARS,
    "--paper": "#E4EEDF", "--card": "#F8FCF6", "--line": "#D0DEC8", "--line2": "#E3ECDE",
    "--top": "rgba(228,238,223,.9)", "--sk": "#D9E6D3",
    "--sh": "0 1px 2px rgba(40,70,40,.05)" } },
  dark: { name: "夜间", swatch: "#12151C", vars: { ...BASE_VARS,
    "--paper": "#12151C", "--card": "#1A1E27", "--ink": "#E9ECF2", "--ink2": "#AEB6C4",
    "--mut": "#727B8C", "--line": "#2A2F3B", "--line2": "#222732",
    "--blue": "#8095F5", "--blue-d": "#9AABF8", "--blue-bg": "#242A44",
    "--hi": "#F0B33C", "--hi-hot": "#FFC65A",
    "--hi-soft": "rgba(240,179,60,.28)", "--hi-wash": "rgba(240,179,60,.12)",
    "--hi-text": "#F0B33C", "--ok": "#4EC08C", "--ok-bg": "#15332A",
    "--bad": "#E5867A", "--bad-bg": "#33211F",
    "--top": "rgba(18,21,28,.9)", "--sk": "#212632",
    "--sh": "0 1px 2px rgba(0,0,0,.3)", "--sh-l": "0 4px 16px rgba(128,149,245,.14)" } },
};
const FONT_SIZES = [15, 17, 19, 21, 23];

/* ---------- helpers ---------- */

/* 把 HTTP 状态码归类成应用内部的错误代号。
   注意不能只看状态码：Google Gemini 把「密钥无效」报成 400，
   只靠状态码会归到「未知错误」，给用户毫无帮助的提示。 */
function codeToErr(code, msg) {
  if (/api[\s_-]?key|unauthoriz|authenticat|invalid.*credential/i.test(msg || "")) return "KEY";
  if (/quota|insufficient|balance|billing|欠费|余额/i.test(msg || "")) return "CREDIT";
  if (code === 401 || code === 403) return "KEY";
  if (code === 402) return "CREDIT";
  if (code === 429) return "RATE";
  return "API";
}

/* 有的服务商（如 Gemini）出错时把内容包在数组里，先拆开再看 */
function unwrap(data) {
  return Array.isArray(data) ? (data[0] || {}) : (data || {});
}

/* 发一次请求。抛出的 Error 里带 detail 字段，方便判断要不要重试 */
async function postOnce(url, headers, body) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    // fetch 抛异常有两种：真的连不上，或请求本身构造非法（如头部含非 ASCII）
    throw new Error("NET");
  }
  let data;
  try { data = unwrap(await res.json()); } catch (e) { throw new Error("API"); }
  // OpenRouter 等会在 HTTP 200 的响应体里放 error；多数服务商用 HTTP 状态码
  const errObj = data.error;
  if (errObj || !res.ok) {
    const msg = (errObj && (errObj.message || errObj.type)) || "";
    const err = new Error(codeToErr((errObj && errObj.code) || res.status, msg));
    err.detail = msg;
    throw err;
  }
  return data;
}

/* web=true 时开启联网搜索（目前只有 OpenRouter 支持）。
   返回的对象上挂一个不可枚举的 __cites，装搜索引擎实际访问过的页面。 */
async function callClaude(prompt, apiKey, model, web, providerId) {
  const p = providerOf(providerId);
  const useModel = model || p.defaultModel;
  let data;

  if (p.protocol === "anthropic") {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // 没有这个头，浏览器直连会被 Anthropic 拒绝
      "anthropic-dangerous-direct-browser-access": "true",
    };
    const base = {
      model: useModel,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    };
    try {
      // 本应用只要一段 JSON，关掉思考模式更快也更省钱
      data = await postOnce(p.endpoint, headers, { ...base, thinking: { type: "disabled" } });
    } catch (e) {
      // 少数模型不接受关闭思考（会返回 400），去掉这个参数再试一次
      if (e.message === "API" && /thinking/i.test(e.detail || "")) {
        data = await postOnce(p.endpoint, headers, base);
      } else throw e;
    }
  } else {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
      // 注意：HTTP 头的值只能是 ASCII，写中文会让 fetch 直接抛 TypeError
      "X-Title": "007 English Reader",
    };
    data = await postOnce(p.endpoint, headers, {
      model: useModel,
      messages: [{ role: "user", content: prompt }],
      // OpenRouter 的联网搜索走 plugins，不是 tools。
      // tools 是给自定义函数调用用的，塞个 {type:"..."} 进去不会报错，
      // 会被静默忽略——模型压根没搜网，只是凭记忆编。这个坑踩过一次。
      ...(web && p.webSearch ? { plugins: [{ id: "web", max_results: 5 }] } : {}),
    });
  }

  const text = extractText(data);
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  // 模型没按 JSON 返回时，把它实际说了什么带上——空字符串说明这个模型
  // 根本没吐正文（推理模型常把内容放在别的字段），有正文则是格式跑偏了
  if (s === -1 || e === -1) {
    const err = new Error("API");
    err.detail = clean ? `模型没按 JSON 返回：${clean.slice(0, 200)}` : "模型返回了空内容（换个模型试试）";
    throw err;
  }
  let out;
  try {
    out = JSON.parse(clean.slice(s, e + 1));
  } catch (pe) {
    const err = new Error("API");
    err.detail = `模型返回的 JSON 有语法错误：${pe.message}`;
    throw err;
  }
  // 挂成不可枚举，免得混进正文字段或被 JSON.stringify 存进 localStorage
  Object.defineProperty(out, "__cites", { value: citesOf(data), enumerable: false });
  return out;
}

/* 取出搜索引擎真正访问过的页面。
   这是 OpenRouter 附加的，不是模型自己写的——比让模型「标明出处」可信得多，
   因为模型能编出一个格式完全合法、但根本不存在的网址。 */
function citesOf(data) {
  const ann = data.choices?.[0]?.message?.annotations;
  if (!Array.isArray(ann)) return [];
  return ann
    .filter((a) => a && a.type === "url_citation" && a.url_citation)
    .map((a) => a.url_citation)
    .filter((c) => /^https?:\/\/\S+\.\S+/i.test(c.url || ""));
}

/* 两种协议的正文位置不一样，统一取出纯文本 */
function extractText(data) {
  if (Array.isArray(data.content)) {
    return data.content.filter((b) => b && b.type === "text").map((b) => b.text).join("");
  }
  return data.choices?.[0]?.message?.content || "";
}

/* 拉取某个服务商当前可用的模型列表 */
async function fetchModels(apiKey, providerId) {
  const p = providerOf(providerId);
  if (!p.modelsUrl) throw new Error("NOLIST");
  const headers = p.protocol === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true" }
    : { "Authorization": "Bearer " + apiKey };
  let res;
  try { res = await fetch(p.modelsUrl, { headers }); } catch (e) { throw new Error("NET"); }
  let data;
  try { data = unwrap(await res.json()); } catch (e) { throw new Error("API"); }
  if (!res.ok || data.error) {
    const msg = (data.error && (data.error.message || data.error.type)) || "";
    throw new Error(codeToErr((data.error && data.error.code) || res.status, msg));
  }
  const list = data.data || data.models || [];
  const ids = list.map((m) => (typeof m === "string" ? m : m.id || m.name)).filter(Boolean);
  // Gemini 的兼容接口返回 "models/xxx"，去掉前缀好读
  return Array.from(new Set(ids.map((id) => id.replace(/^models\//, "")))).sort();
}

function errText(e, providerId) {
  const p = providerOf(providerId);
  switch (e.message) {
    case "KEY": return `API Key 无效或没有权限，去设置里检查一下（应该是 ${p.keyHint} 这样的格式）。`;
    case "CREDIT": return `${p.name} 账户余额不足，去 ${p.site} 充值后再试。`;
    case "RATE": return "请求太频繁，等几秒再试一次。";
    case "NET": return p.proxy
      ? `连不上 ${p.name} 服务器，检查网络（国内使用需要开代理），然后重试。`
      : `连不上 ${p.name} 服务器，检查一下网络再重试。`;
    case "NOLIST": return `${p.name} 没有提供模型列表接口，请照官网文档手填模型名。`;
    default: {
      // 服务商原文（模型不存在、参数不被支持之类）都在 detail 里。以前这里
      // 一律显示"出了点问题"，把唯一能定位的线索丢了，用户和作者都无从查起。
      const d = (e.detail || "").trim();
      return d ? `出了点问题：${d.slice(0, 300)}` : "出了点问题，重试一下。";
    }
  }
}

/* ---- 词级词典缓存 ----
   只存单词条目本身（释义/音标/例句），不存语境。上限 DICT_CACHE_MAX 条，
   超了丢最早写入的那批——词典条目丢了只是下次重查一次，不是数据损失，
   所以这里不跟生词本抢 localStorage 配额。 */
const DICT_CACHE_KEY = "dd-dict-cache-v1";
const DICT_CACHE_MAX = 400;

/* ---- 教材正文缓存 ----
   和词典缓存同一个道理：抓一次要真联网、要花钱，抓到的正文就该留在本地，
   下次点开直接读、离线也能读，也能当复习材料反复用。

   条目比词条大得多（一节课文上千词），所以上限卡得紧，而且同时按条数和
   总字数两头限——localStorage 是全应用共用的，教材不能把生词本挤掉。 */
const BOOK_CACHE_KEY = "dd-book-cache-v1";
const BOOK_CACHE_MAX = 20;
const BOOK_CACHE_CHARS = 300000;
/* ---- 教材语料库 ----
   语料是本仓库自带的（教材/索引.json + 教材/篇目/*.json，由 工具/建教材库.py
   生成），通过 jsDelivr 发给前端。

   为什么不实时抓第三方网站：纯前端取正文只能靠浏览器 fetch，于是同时被两个
   条件卡死——国内能直连的站（古登堡、OpenStax、中国日报）不放行跨域；放行
   跨域的站（维基百科系）在国内连不上。两边没有交集，这条路是死的。

   jsDelivr 两个条件同时满足：实测国内不走代理 HTTP 200，且回
   access-control-allow-origin: *。中文路径也实测可用。

   以后自己上线了，把 LIB_BASE 换成自己域名下的同一份文件即可，连 jsDelivr
   也不用依赖。 */
const LIB_BASE = "https://cdn.jsdelivr.net/gh/faqiang007/dian-du-english@main/教材/";
const LIB_KEY = "dd-lib-v1";

async function libFetch(path) {
  // 路径里有中文，必须编码；encodeURI 不动 / 和 : ，正好
  const r = await fetch(encodeURI(LIB_BASE + path), { cache: "force-cache" });
  if (!r.ok) throw new Error("net");
  return r.json();
}

function loadBookCache() {
  const raw = sGet(BOOK_CACHE_KEY);
  return new Map(Array.isArray(raw) ? raw : []);
}
function saveBookCache(map) {
  // 从最近写入的往回留，两个上限谁先到算谁
  let out = [];
  let chars = 0;
  for (const e of [...map.entries()].reverse()) {
    const n = ((e[1] && e[1].chapters) || []).join("").length;
    if (out.length >= BOOK_CACHE_MAX || chars + n > BOOK_CACHE_CHARS) break;
    out.push(e);
    chars += n;
  }
  out.reverse();
  const ok = sSet(BOOK_CACHE_KEY, out);
  return { map: new Map(out), ok };
}

/* ---- 查过几次 ----
   「我点了这个词」是本应用能拿到的最强信号：它精确说明了你不认识哪个词。
   以前这个信号只喂给小测（clickedRef），换篇文章就清空。现在按词累计并落盘，
   查到第 SEEN_NUDGE 次就提醒收进生词本——同一个词查两次，基本可以断定
   你是真不认识，而不是手滑。 */
const SEEN_KEY = "dd-seen-v1";
const SEEN_MAX = 800;
const SEEN_NUDGE = 2;

function loadSeen() {
  const raw = sGet(SEEN_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}
function saveSeen(obj) {
  let o = obj;
  const keys = Object.keys(o);
  if (keys.length > SEEN_MAX) {
    // 满了先丢只查过一次的——那些多半是扫一眼就懂的词，留着没意义
    o = {};
    for (const k of keys) if (obj[k] > 1) o[k] = obj[k];
  }
  sSet(SEEN_KEY, o);
  return o;
}

function stripCtx(d) {
  return d && d.context_cn ? { ...d, context_cn: null } : d;
}
/* 生词本里的条目来源不一：查词存的是完整词条，从单词问答收藏的、
   Markdown 导入的可能只有一条释义没音标没例句。拿这种「瘦身版」顶替
   一次真查询，用户会永远看到残缺的卡片——所以只有完整的才配当缓存用。 */
function isFullEntry(d) {
  if (!d) return false;
  if (d.type === "en") return !!d.phonetic_us && (d.senses || []).length > 0 && (d.examples || []).length > 0;
  if (d.type === "zh") return (d.translations || []).length > 0 && (d.examples || []).length > 0;
  return false;
}
function loadDictCache() {
  const raw = sGet(DICT_CACHE_KEY);
  return new Map(Array.isArray(raw) ? raw : []);
}
function saveDictCache(map) {
  let entries = [...map.entries()];
  if (entries.length > DICT_CACHE_MAX) entries = entries.slice(-DICT_CACHE_MAX);
  sSet(DICT_CACHE_KEY, entries);
}

function sGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
/* 返回是否写入成功。存储写满时浏览器抛 QuotaExceededError，
   以前这里静默吞掉，用户会以为存上了、下次打开却没了。 */
function sSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
}

function pickChips(pool) {
  const p = [...pool];
  const out = [];
  while (out.length < 6 && p.length) {
    out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
  }
  return out;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Boldify({ text, word }) {
  if (!word) return <>{text}</>;
  const re = new RegExp(`(${escapeReg(word)}[a-zA-Z]*)`, "ig");
  const isWord = new RegExp(`^${escapeReg(word)}[a-zA-Z]*$`, "i");
  const parts = String(text).split(re);
  return (
    <>
      {parts.map((p, i) =>
        isWord.test(p) ? <b key={i}>{p}</b> : <span key={i}>{p}</span>
      )}
    </>
  );
}

function splitSentences(para) {
  return para.match(/[^.!?…]+[.!?…]+[\s"')\]]*|[^.!?…]+$/g) || [para];
}

function buildVocabMd(vocab) {
  const lines = [`# 生词本 · ${new Date().toLocaleDateString("zh-CN")}`, ""];
  vocab.forEach((v) => {
    const d = v.data;
    if (d.type === "en") {
      lines.push(`## ${d.word}  ${d.phonetic_us || ""}`);
      (d.senses || []).forEach((x) => lines.push(`- ${x.pos} ${x.cn}`));
      // 计算机含义要一起导出，否则换机器搬家就丢了
      if (d.tech_cn) lines.push(`- 计算机：${d.tech_cn}`);
      if (d.examples?.[0]) lines.push(`- 例：${d.examples[0].en} — ${d.examples[0].cn}`);
    } else {
      lines.push(`## ${d.input}`);
      (d.translations || []).forEach((t) =>
        lines.push(`- ${t.en} ${t.phonetic_us || ""} ${t.pos || ""}${t.note ? " · " + t.note : ""}`)
      );
    }
    lines.push("");
  });
  return lines.join("\n");
}

/* 解析「复制为 Markdown」导出的生词本文本 */
function parseVocabMd(text) {
  const out = [];
  const blocks = String(text).split(/\n(?=##\s)/).map((b) => b.trim()).filter((b) => b.startsWith("## "));
  for (const block of blocks) {
    const lines = block.split("\n");
    const head = lines[0].replace(/^##\s*/, "").trim();
    if (!head) continue;
    const hm = head.match(/^(.*?)\s+(\/.*)$/);
    const word = (hm ? hm[1] : head).trim();
    const phon = hm ? hm[2].trim() : "";
    if (!word) continue;
    const zh = /[\u4e00-\u9fff]/.test(word);
    if (zh) {
      const translations = [];
      for (const ln of lines.slice(1)) {
        if (!ln.startsWith("- ")) continue;
        const body = ln.slice(2).trim();
        const mm = body.match(/^([A-Za-z][A-Za-z '\-]*?)\s*(\/[^/]*\/)?\s*([a-z]{1,6}\.)?\s*(?:·\s*(.*))?$/);
        if (mm && mm[1]) {
          translations.push({ en: mm[1].trim(), phonetic_us: mm[2] || "", pos: mm[3] || "", note: mm[4] || "" });
        }
      }
      if (!translations.length) continue;
      out.push({ word, data: { type: "zh", input: word, translations, examples: [] } });
    } else {
      const senses = [];
      let example = null;
      let tech = null;
      for (const ln of lines.slice(1)) {
        if (!ln.startsWith("- ")) continue;
        const body = ln.slice(2).trim();
        // 这一条要在「当成释义」之前判，否则会被兜底分支收成一条没有词性的释义
        if (/^计算机[：:]/.test(body)) {
          tech = body.replace(/^计算机[：:]\s*/, "").trim() || null;
          continue;
        }
        if (/^例[：:]/.test(body)) {
          const ex = body.replace(/^例[：:]\s*/, "");
          const seg = ex.split(/\s+—\s+/);
          example = { en: (seg[0] || "").trim(), cn: (seg[1] || "").trim() };
        } else {
          const mm = body.match(/^([a-z]{1,6}\.)\s+(.*)$/i);
          if (mm) senses.push({ pos: mm[1], cn: mm[2] });
          else if (body) senses.push({ pos: "", cn: body });
        }
      }
      if (!senses.length && !example) continue;
      out.push({
        word,
        data: { type: "en", word, phonetic_us: phon, phonetic_uk: "", context_cn: null, tech_cn: tech, senses, examples: example ? [example] : [] },
      });
    }
  }
  return out.map((x) => ({
    key: x.word.toLowerCase(), data: x.data, surface: x.word,
    savedAt: Date.now(), meet: 1, rv: { due: Date.now(), iv: 0, streak: 0 },
  }));
}

/* 按完整句子截取到约 maxW 词 */
/* 把长文按段落切成若干「章」，每章约 perCh 个英文单词。
   段落不劈开——译文对照和跟读都按段落编号对齐，
   一段被切成两半会让下半段的译文错位。 */
function splitChapters(text, perCh = CHAPTER_WORDS) {
  const paras = String(text).replace(/\r/g, "").split(/\n{2,}|\n/)
    .map((p) => p.trim()).filter(Boolean);
  const chs = [];
  let buf = [], n = 0;
  const flush = () => { if (buf.length) { chs.push(buf.join("\n\n")); buf = []; n = 0; } };
  for (const p of paras) {
    const w = (p.match(/[A-Za-z]+/g) || []).length;
    // 整章不分段的情况（常见于字幕、扫描件），只能退一步按句子切
    if (w > perCh * 1.6) {
      flush();
      for (const piece of splitLongPara(p, perCh)) chs.push(piece);
      continue;
    }
    if (n + w > perCh && buf.length) flush();
    buf.push(p); n += w;
  }
  flush();
  return chs.length ? chs : [String(text).trim()];
}

function splitLongPara(para, perCh) {
  const out = [];
  let buf = [], n = 0;
  for (const s of splitSentences(para)) {
    const w = (s.match(/[A-Za-z]+/g) || []).length;
    if (n + w > perCh && buf.length) { out.push(buf.join("").trim()); buf = []; n = 0; }
    buf.push(s); n += w;
  }
  if (buf.length) out.push(buf.join("").trim());
  return out;
}

function countWords(text) {
  return (String(text).match(/[A-Za-z]+/g) || []).length;
}

/* 老版本的标签页只有 content、trans 是个数组。
   统一成「chapters 数组 + ch 章号 + trans 按章号存」，
   后面所有代码只认这一种形状，不用到处判断有没有分章。 */
function normalizeTab(t) {
  if (Array.isArray(t.chapters) && t.chapters.length) {
    return {
      ...t,
      ch: Math.min(Math.max(0, t.ch || 0), t.chapters.length - 1),
      trans: t.trans && !Array.isArray(t.trans) ? t.trans : {},
    };
  }
  return {
    ...t,
    chapters: [t.content || ""],
    ch: 0,
    trans: Array.isArray(t.trans) ? { 0: t.trans } : {},
  };
}

function looksLikeSentence(q) {
  const zh = /[\u4e00-\u9fff]/.test(q);
  if (zh) return q.replace(/\s/g, "").length >= 10 || /[，。！？；]/.test(q);
  const words = q.trim().split(/\s+/).length;
  return words >= 5 || /[.!?;]\s/.test(q.trim());
}

/* 联网抓一个网页的正文。「从网址导入」和教材页的「抓来读」共用这一条管线——
   两边要的是同一件事：真去读那个页面，把原文摘回来，绝不让模型自己编。

   抛出的错误码由调用方翻成人话：
     nocite 没有任何访问记录（等于没真去读）／ empty 没拿到内容 ／ thin 内容太少不像正文 */
async function fetchPageText(url, opts) {
  const { apiKey, model, providerId, maxWords, hint } = opts;
  const prompt = `请用网络搜索工具获取并阅读这个网页的内容：${url}
${hint || ""}

关于 content：
- 只摘录你**实际读到**的原文，保持原文措辞，不要改写、不要总结
- 尽量完整，上限 ${maxWords} 词；从开头连续往下取，不要东拼西凑
- **实际读到多少就给多少。宁可只有两段，也绝不自己补写凑长度**

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"title":"内容的英文标题","content":"提取的英文原文，段落用\\n\\n分隔"}

如果实在无法获取该页面的英文内容，返回：{"error":"一句话中文原因"}`;
  const data = await callClaude(prompt, apiKey, model, true, providerId);
  if (data.error || !data.content) throw new Error("empty");
  // 没有任何搜索引用 = 根本没去读这个页面，正文多半是编的
  if (!(data.__cites || []).length) throw new Error("nocite");
  if ((data.content.match(/[A-Za-z]/g) || []).length < 40) throw new Error("thin");
  return { title: data.title || "", content: data.content };
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return "网页"; }
}

/* 给设备语音打分：神经/在线/云端音色优先，机器人音色靠后 */
function scoreVoice(v) {
  const n = (v.name || "").toLowerCase();
  let sc = 0;
  if (/natural|neural/.test(n)) sc += 100;
  if (/google/.test(n)) sc += 60;
  if (/premium|enhanced/.test(n)) sc += 50;
  if (/siri/.test(n)) sc += 45;
  if (/online/.test(n)) sc += 30;
  if (v.localService === false) sc += 25;
  if (/aria|jenny|guy|ava|samantha|allison|libby|sonia|ryan|emma|karen|daniel|serena|zira/.test(n)) sc += 18;
  if (/espeak|compact|whisper|novelty|albert|zarvox|trinoids/.test(n)) sc -= 90;
  return sc;
}
const clampRate = (r) => Math.min(1.4, Math.max(0.5, r || 1));

/* 复习进度：没有记录的旧词视为"到期" */
const rvOf = (v) => v.rv || { due: v.savedAt || 0, iv: 0, streak: 0 };

/* 连对 3 次即视为已掌握。这个数才是学习的收获——「生词总数」只增不减，
   衡量的是欠债，越努力看着越吓人；界面上得让人看见自己拿下了多少。 */
const MASTER_STREAK = 3;
const isMastered = (v) => rvOf(v).streak >= MASTER_STREAK;

/* 能织进文章的英文表达：英文词条取词本身，中文词条取第一个英文译词。
   生词本只存这两类（句子 type:"sent" 不入库），别的一律返回空跳过。 */
const WEAVE_MAX = 6;
function weaveTermOf(v) {
  const d = v && v.data;
  if (!d) return "";
  if (d.type === "en") return String(d.word || v.surface || "").trim();
  if (d.type === "zh") {
    const t = (d.translations || [])[0];
    return String((t && (t.en || t.word)) || "").trim();
  }
  return "";
}

const DAY = 86400000;
/* ---- EPUB 解析 ----
   EPUB 就是一个 zip：META-INF/container.xml 指向 .opf 目录文件，
   .opf 里的 <spine> 规定正文顺序（manifest 里则是全部资源，含封面、
   版权页、目录页这些不该按顺序读的东西，所以必须走 spine）。
   正文是 XHTML，用浏览器自带的 DOMParser 解析，不引额外的库。 */
function epubToText(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const read = (p) => (files[p] ? strFromU8(files[p]) : "");
  const parse = (s, type) => new DOMParser().parseFromString(s, type || "application/xml");

  const container = parse(read("META-INF/container.xml"));
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("epub");
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const opf = parse(read(opfPath));
  const title = opf.querySelector("metadata > title, title")?.textContent?.trim() || "";

  // manifest: id → href；spine 只给 idref，得查表
  const hrefById = {};
  opf.querySelectorAll("manifest > item").forEach((it) => {
    const id = it.getAttribute("id");
    const href = it.getAttribute("href");
    if (id && href) hrefById[id] = href;
  });

  const parts = [];
  opf.querySelectorAll("spine > itemref").forEach((ref) => {
    const href = hrefById[ref.getAttribute("idref")];
    if (!href) return;
    // href 里可能带 #锚点，也可能有 %20 这类转义
    const clean = decodeURIComponent(href.split("#")[0]);
    const raw = read(baseDir + clean) || read(clean);
    if (!raw) return;

    const doc = parse(raw, "application/xhtml+xml");
    // 解析失败时 DOMParser 不抛异常，而是返回一棵含 parsererror 的树
    const body = doc.querySelector("parsererror") ? parse(raw, "text/html").body : doc.body;
    if (!body) return;
    body.querySelectorAll("script, style, nav, header, footer").forEach((n) => n.remove());
    // 块级元素之间补换行，否则整章会挤成一坨没有分段
    body.querySelectorAll("p, div, br, h1, h2, h3, h4, li, blockquote").forEach((n) => {
      n.append("\n");
    });
    const t = (body.textContent || "").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (t) parts.push(t);
  });

  if (!parts.length) throw new Error("epub");
  return { title, text: parts.join("\n\n") };
}

/* 「3 天前」这类相对时间。读过的文章列表里，具体日期没意义，
   "多久没碰了"才是决定要不要重读的依据。 */
function agoText(ts) {
  if (!ts) return "";
  const d = Math.floor((Date.now() - ts) / DAY);
  if (d <= 0) return "今天读过";
  if (d === 1) return "昨天读过";
  if (d < 7) return `${d} 天前读过`;
  if (d < 30) return `${Math.floor(d / 7)} 周前读过`;
  return `${Math.floor(d / 30)} 个月前读过`;
}

function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function calcStreak(log) {
  const active = (d) => {
    const e = log[dateStr(d)];
    return e && (e.a || 0) + (e.q || 0) + (e.r || 0) + (e.t || 0) > 0;
  };
  let t = new Date(); t.setHours(0, 0, 0, 0);
  if (!active(t)) t = new Date(t.getTime() - DAY);
  let n = 0;
  while (active(t)) { n++; t = new Date(t.getTime() - DAY); }
  return n;
}

/* ---------- 主组件 ---------- */

export default function App() {
  const [view, setView] = useState("read");           // read | vocab | stats | review | settings
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("B1");
  const [chipCat, setChipCat] = useState(TOPIC_CATS[0].id);
  const [chips, setChips] = useState(() => pickChips(TOPIC_CATS[0].pool));
  const [realBusy, setRealBusy] = useState(false);
  const [realErr, setRealErr] = useState("");
  // {lv, at, list[], dropped, cites[]}；null = 还没搜过
  const [books, setBooks] = useState(() => sGet(LIB_KEY));
  const [booksBusy, setBooksBusy] = useState(false);
  const [booksErr, setBooksErr] = useState("");
  const bookCacheRef = useRef(loadBookCache());
  const [readBusy, setReadBusy] = useState("");   // 正在抓哪本（存 url）
  const [readErr, setReadErr] = useState("");
  // 只为了让界面知道哪些已经存了本地；正文本身在 bookCacheRef 里，不进 state
  const [cachedBooks, setCachedBooks] = useState(() => {
    const m = {};
    for (const [k, v] of loadBookCache()) m[k] = v.words || 0;
    return m;
  });

  const [tabs, setTabs] = useState([]);                 // [{id,title,content,cn_intro,topic,level,woven[],imported,trans}]
  const [activeId, setActiveId] = useState(null);
  const article = useMemo(() => tabs.find((t) => t.id === activeId) || null, [tabs, activeId]);

  /* 当前正在读的那一章。全篇存在 article.chapters 里，
     但查词、朗读、译文、小测一律只针对当前这一章——
     这是长文档能读又不撑爆模型的关键。 */
  const chapters = article?.chapters || [];
  const chIdx = chapters.length ? Math.min(Math.max(0, article.ch || 0), chapters.length - 1) : 0;
  const curText = chapters[chIdx] || "";
  const curTrans = (article?.trans || {})[chIdx] || null;
  const curWords = useMemo(() => countWords(curText), [curText]);
  const curMins = Math.max(1, Math.round(curWords / 180)); // 按每分钟约 180 词估

  function gotoCh(next) {
    if (!article || !chapters.length) return;
    const n = Math.max(0, Math.min(next, chapters.length - 1));
    if (n === chIdx) return;
    hardStop();
    setTabs((ts) => ts.map((x) => (x.id === article.id ? { ...x, ch: n } : x)));
    // 换章等于换了篇文章，小测和译文开关都得归零
    setQuiz({ st: "idle" });
    setShowTrans(false);
    clickedRef.current = new Set();
    setClicks(0);
    setLvHint(null);
    window.scrollTo({ top: 0 });
  }

  function canOpenNewTab() {
    if (tabs.length >= MAX_TABS) {
      showToast(`最多同时开 ${MAX_TABS} 个标签页，先关掉几个吧`);
      return false;
    }
    return true;
  }
  /* 文章要被销毁前先留一份。同一篇重复归档时按 id 去重并提到最前，
     免得同一篇在「读过的」里出现好几遍。 */
  function archive(art) {
    if (!art || !(art.chapters || []).length) return;
    const rec = {
      id: art.id, title: art.title, topic: art.topic, autoTopic: art.autoTopic,
      level: art.level, cn_intro: art.cn_intro || "", chapters: art.chapters,
      woven: art.woven || [], imported: !!art.imported,
      srcUrl: art.srcUrl || "", srcSite: art.srcSite || "",
      readAt: Date.now(),
    };
    setHistory((hs) => trimHistory([rec, ...hs.filter((h) => h.id !== art.id)]));
  }

  function closeTab(id) {
    archive(tabs.find((t) => t.id === id));
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id);
      if (id === activeId) {
        if (reading || shadow.on) hardStop();
        const idx = ts.findIndex((t) => t.id === id);
        const fallback = next[idx - 1] || next[idx] || next[next.length - 1] || null;
        setActiveId(fallback ? fallback.id : null);
      }
      return next;
    });
  }
  /* 重读：把归档的文章原样开回来。已经开着就直接切过去，不重复开一份。
     记录留在历史里不删——重读一遍不等于读完了，下周可能还想再读。 */
  function reread(h) {
    const open = tabs.find((t) => t.id === h.id);
    if (open) { switchTab(h.id); setView("read"); return; }
    if (!canOpenNewTab()) return;
    hardStop();
    const art = { ...h, ch: 0, trans: {} };
    delete art.readAt;
    setTabs((ts) => [...ts, art]);
    setActiveId(h.id);
    setView("read");
    setQuiz({ st: "idle" });
    setShowTrans(false);
    clickedRef.current = new Set();
    setClicks(0);
    setLvHint(null);
    window.scrollTo({ top: 0 });
  }

  function removeHistory(id) {
    setHistory((hs) => hs.filter((h) => h.id !== id));
    showToast("已从「读过的」移除");
  }

  function switchTab(id) {
    if (id === activeId) return;
    hardStop();
    setActiveId(id);
  }
  function openBlankTab() {
    hardStop();
    setActiveId(null);
  }
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");

  const [dict, setDict] = useState({ status: "idle" }); // status, term, key, sent, data, meta
  const [dictOpen, setDictOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [vocab, setVocab] = useState([]);
  const [stats, setStats] = useState({ log: {}, total: 0, lv: null });
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [reading, setReading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const [quiz, setQuiz] = useState({ st: "idle" });     // idle|loading|on|done|err
  const [shadow, setShadow] = useState({ on: false, idx: 0, slow: false, waiting: false });
  const [rev, setRev] = useState(null);                 // {queue,i,flip,ok,ng}

  const [prefs, setPrefs] = useState({ theme: "paper", font: "serif", size: 19, voiceURI: "", rate: 1, dictOff: false });
  const [navOpen, setNavOpen] = useState(false);   // 窄屏时侧栏才是抽屉，宽屏一直显示
  const [providerId, setProviderId] = useState(loadProviderId);
  const [keyMap, setKeyMap] = useState(loadKeyMap);
  const [modelMap, setModelMap] = useState(loadModelMap);
  // 每家服务商各存一份 Key 和模型，切换时不用重新填
  const apiKey = keyMap[providerId] || "";
  const model = modelMap[providerId] || providerOf(providerId).defaultModel;
  const [showSetup, setShowSetup] = useState(false);
  const [providerDraft, setProviderDraft] = useState(loadProviderId);
  const [keyDraft, setKeyDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [showTrans, setShowTrans] = useState(false);
  const [transBusy, setTransBusy] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [impTab, setImpTab] = useState("paste");        // paste | file | url
  const [impText, setImpText] = useState("");
  const [impUrl, setImpUrl] = useState("");
  const [impBusy, setImpBusy] = useState(false);
  const [impErr, setImpErr] = useState("");
  const [vImpOpen, setVImpOpen] = useState(false);
  const [vImpText, setVImpText] = useState("");
  const [lvMenu, setLvMenu] = useState(false);
  const [voices, setVoices] = useState([]);
  const [readIdx, setReadIdx] = useState(-1);
  const [wchat, setWchat] = useState({ word: null, msgs: [], busy: false });
  const [selTip, setSelTip] = useState(null); // {x, y, text}
  const [ctxBusy, setCtxBusy] = useState(false); // 正在补「这句里的意思」
  const [history, setHistory] = useState([]);    // 读过的文章，最近的在前
  /* 情景对话。scene=null 时显示场景选择；msgs 里 role 为 u/a，
     a 消息附 fix（更地道的说法）和 used（这轮用上的生词）。 */
  const [talk, setTalk] = useState({ scene: null, msgs: [], busy: false, draft: "" });
  /* 本章点了几个词。clickedRef 是 ref，改了不触发重渲染，所以另存一份 state：
     点词密度是每篇文章都有的难度信号，不像小测那样要你主动去做。 */
  const [clicks, setClicks] = useState(0);
  const [lvHint, setLvHint] = useState(null); // {dir:"up"|"down", to:难度id, label}

  const cacheRef = useRef(new Map());
  /* 词级词典缓存，落地 localStorage。cacheRef 的键带句子，换篇文章就失效，
     且刷新即清空——同一个词反复花钱查。这份只按单词存，跨文章跨会话都能命中。
     存进来的条目一律剥掉 context_cn：那是针对某一句的解释，套到别的句子上会误导。 */
  const dictCacheRef = useRef(loadDictCache());
  const seenRef = useRef(loadSeen()); // {词: 查过几次}，跨文章跨会话累计
  const readRef = useRef({ on: false });
  const lastLookupRef = useRef(null);
  const lastWordRef = useRef(null);   // 从整句解析返回单词卡
  const clickedRef = useRef(new Set()); // 本篇点过的词（喂给小测）
  const toastRef = useRef(null);

  /* ---- 初始化 ---- */
  useEffect(() => {
    (async () => {
      const v = await sGet(VOCAB_KEY);
      if (Array.isArray(v)) setVocab(v);
      const tb = await sGet(TABS_KEY);
      if (tb && Array.isArray(tb.tabs) && tb.tabs.length) {
        // 老存档没有 chapters 字段，在这里补上，之后全程只有一种形状
        setTabs(tb.tabs.map(normalizeTab));
        setActiveId(tb.activeId && tb.tabs.some((t) => t.id === tb.activeId) ? tb.activeId : tb.tabs[0].id);
        const cur = tb.tabs.find((t) => t.id === tb.activeId) || tb.tabs[0];
        setTopic(cur.topic || "");
        if (cur.level) setLevel(cur.level);
      } else {
        const a = await sGet(ARTICLE_KEY); // 迁移旧版单文章存档
        if (a && a.content) {
          const id = "t" + Date.now();
          setTabs([normalizeTab({ ...a, id })]);
          setActiveId(id);
          setTopic(a.topic || "");
          if (a.level) setLevel(a.level);
        }
      }
      const hi = await sGet(HISTORY_KEY);
      if (Array.isArray(hi)) setHistory(hi);
      const st = await sGet(STATS_KEY);
      if (st) {
        setStats({ log: {}, total: 0, lv: null, ...st });
        if (st.lv) setLevel(st.lv);
      }
      const pf = await sGet(PREFS_KEY);
      if (pf) setPrefs((p) => ({ ...p, ...pf }));
      setLoaded(true);
    })();
    return () => { try { window.speechSynthesis.cancel(); } catch (e) {} };
  }, []);

  useEffect(() => {
    const load = () => {
      try { setVoices(window.speechSynthesis.getVoices() || []); } catch (e) {}
    };
    load();
    try { window.speechSynthesis.addEventListener("voiceschanged", load); } catch (e) {
      try { window.speechSynthesis.onvoiceschanged = load; } catch (e2) {}
    }
    return () => {
      try { window.speechSynthesis.removeEventListener("voiceschanged", load); } catch (e) {}
    };
  }, []);

  useEffect(() => {
    const hide = () => setSelTip(null);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, []);

  const enVoices = useMemo(
    () => voices.filter((v) => /^en/i.test(v.lang)).sort((a, b) => scoreVoice(b) - scoreVoice(a)),
    [voices]
  );
  function getVoiceFor(lang) {
    if (!enVoices.length) return null;
    const sel = prefs.voiceURI ? enVoices.find((v) => v.voiceURI === prefs.voiceURI) : null;
    if (lang === "en-GB") {
      if (sel && /en[-_]?gb/i.test(sel.lang)) return sel;
      const gb = enVoices.filter((v) => /en[-_]?gb/i.test(v.lang))[0];
      return gb || sel || enVoices[0];
    }
    if (sel) return sel;
    const us = enVoices.filter((v) => /en[-_]?us/i.test(v.lang));
    return (us.length ? us : enVoices)[0];
  }

  useEffect(() => {
    if (!loaded) return;
    // 生词本最要紧，写不进去必须当场说，不能等用户发现词没了
    if (!sSet(VOCAB_KEY, vocab)) showToast("生词没能存进浏览器——存储写满了，先关掉几篇长文档");
  }, [vocab, loaded]);
  useEffect(() => { if (loaded) sSet(STATS_KEY, stats); }, [stats, loaded]);
  // 归档写失败不弹提示：丢的是"读过的"记录，不是用户的数据，提示了也没法处理
  useEffect(() => { if (loaded) sSet(HISTORY_KEY, history); }, [history, loaded]);
  useEffect(() => {
    if (!loaded) return;
    if (!sSet(TABS_KEY, { tabs, activeId })) {
      showToast("存储写满了，这篇文章下次打不开——关掉几篇长文档再试");
    }
  }, [tabs, activeId, loaded]);
  useEffect(() => { if (loaded) sSet(PREFS_KEY, prefs); }, [prefs, loaded]);

  const appStyle = useMemo(() => ({
    ...(THEMES[prefs.theme] || THEMES.paper).vars,
    "--read-size": prefs.size + "px",
    "--read-font": prefs.font === "serif" ? "var(--serif)" : "var(--sans)",
  }), [prefs]);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2400);
  }

  function bumpStat(k, n = 1) {
    setStats((s) => {
      const d = dateStr();
      const day = s.log[d] || {};
      return { ...s, log: { ...s.log, [d]: { ...day, [k]: (day[k] || 0) + n } } };
    });
  }

  /* 每天记一笔"当前已掌握多少词"。词条上只有当前的 streak，没有变化历史，
     不记快照就永远画不出增长曲线。只在数字变了时写，避免无谓的重渲染。
     注意：曲线从装上这个版本的那天开始才有数据，之前的日子补不出来。 */
  useEffect(() => {
    const m = vocab.filter(isMastered).length;
    setStats((s) => {
      const d = dateStr();
      const day = s.log[d] || {};
      if (day.m === m) return s;
      return { ...s, log: { ...s.log, [d]: { ...day, m } } };
    });
  }, [vocab]);

  /* 读着读着发现太难，立刻提示——此刻提示才有用，你可以马上换一篇。
     只提示，不自作主张改难度：改了下一篇才生效，用户得知情。
     阈值 8 个词且超过 8%：低于 8 个可能只是碰巧有几个生词，不足以说明问题。 */
  useEffect(() => {
    if (!article || lvHint || curWords < 60) return;
    const idx = LEVELS.findIndex((l) => l.id === level);
    if (clicks >= 8 && clicks / curWords > 0.08 && idx > 0) {
      setLvHint({ dir: "down", to: LEVELS[idx - 1].id, label: LEVELS[idx - 1].label });
    }
  }, [clicks, curWords, level, article, lvHint]);

  // 正开着的文章已经在「继续读」里了，不必在「读过的」再出现一次
  const pastRead = useMemo(
    () => history.filter((h) => !tabs.some((t) => t.id === h.id)),
    [history, tabs]
  );
  const weekRead = useMemo(
    () => pastRead.filter((h) => Date.now() - h.readAt < 7 * DAY).length,
    [pastRead]
  );

  const streak = useMemo(() => calcStreak(stats.log), [stats.log]);
  const dueList = useMemo(
    () => vocab.filter((v) => rvOf(v).due <= Date.now()),
    [vocab]
  );
  /* ---- AI 现写：可织入的生词候选 ---- */
  // 排序：没记牢的（streak<2）排前，其次到期早的。给 12 个够选了。
  const weaveCands = useMemo(() => {
    const seen = new Set();
    return vocab
      .map((v) => ({ v, term: weaveTermOf(v) }))
      .filter(({ term }) => {
        const k = term.toLowerCase();
        if (!term || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => {
        const wa = rvOf(a.v).streak < 2, wb = rvOf(b.v).streak < 2;
        if (wa !== wb) return wa ? -1 : 1;
        return rvOf(a.v).due - rvOf(b.v).due;
      })
      .slice(0, 12)
      .map((x) => x.term);
  }, [vocab]);

  // weaveSel 为 null 表示"没手动选过"，跟着候选自动走；点过一次就固定成显式列表。
  const [weaveOn, setWeaveOn] = useState(true);
  const [weaveSel, setWeaveSel] = useState(null);
  const weavePicked = useMemo(
    () => (weaveSel ? weaveCands.filter((w) => weaveSel.includes(w)) : weaveCands.slice(0, 4)),
    [weaveCands, weaveSel]
  );
  function toggleWeave(w) {
    setWeaveSel((cur) => {
      const base = cur || weaveCands.slice(0, 4);
      if (base.includes(w)) return base.filter((x) => x !== w);
      if (base.length >= WEAVE_MAX) {
        showToast(`最多选 ${WEAVE_MAX} 个，再多文章会写得生硬`);
        return base;
      }
      return [...base, w];
    });
  }

  /* ---- 语音 ---- */
  function cancelSpeech() {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  function hardStop() {
    readRef.current.on = false;
    cancelSpeech();
    setReading(false);
    setReadIdx(-1);
    setShadow((s) => (s.on ? { ...s, on: false } : s));
  }
  function speak(text, lang = "en-US", mul = 1) {
    readRef.current.on = false;
    cancelSpeech();
    setReading(false);
    setReadIdx(-1);
    setShadow((s) => (s.on ? { ...s, waiting: true } : s)); // 跟读时查词不退出
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = getVoiceFor(lang);
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = lang; }
      u.rate = clampRate((prefs.rate || 1) * mul);
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function toggleReadArticle() {
    if (reading) { hardStop(); return; }
    if (!article || !flatSents.length) return;
    hardStop();
    readRef.current.on = true;
    setReading(true);
    const step = (i) => {
      if (!readRef.current.on) return;
      let j = i;
      while (j < flatSents.length && !flatSents[j].t) j++;
      if (j >= flatSents.length) {
        readRef.current.on = false; setReading(false); setReadIdx(-1);
        return;
      }
      setReadIdx(j);
      try {
        const el = document.getElementById("sen-" + flatSents[j].id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {}
      try {
        const u = new SpeechSynthesisUtterance(flatSents[j].t);
        const v = getVoiceFor("en-US");
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-US"; }
        u.rate = clampRate(prefs.rate || 1);
        u.onend = () => step(j + 1);
        u.onerror = () => step(j + 1);
        window.speechSynthesis.speak(u);
      } catch (e) { readRef.current.on = false; setReading(false); setReadIdx(-1); }
    };
    step(0);
  }

  /* ---- 跟读模式 ---- */
  const flatSents = useMemo(() => {
    if (!article) return [];
    return curText
      .split(/\n+/).map((p) => p.trim()).filter(Boolean)
      .flatMap((p, pi) =>
        splitSentences(p).map((s, si) => ({ id: `${pi}-${si}`, t: s.trim() }))
      );
  }, [article]);

  function playShadow(idx, slow) {
    const s = flatSents[idx];
    if (!s) return;
    if (!s.t) { advanceShadow(idx, slow); return; }
    cancelSpeech();
    try {
      const el = document.getElementById("sen-" + s.id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {}
    try {
      const u = new SpeechSynthesisUtterance(s.t);
      const v = getVoiceFor("en-US");
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-US"; }
      u.rate = clampRate((prefs.rate || 1) * (slow ? 0.72 : 0.97));
      u.onend = () => setShadow((x) => (x.on ? { ...x, waiting: true } : x));
      u.onerror = () => setShadow((x) => (x.on ? { ...x, waiting: true } : x));
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function startShadow() {
    if (!article || !flatSents.length) return;
    hardStop();
    setShadow({ on: true, idx: 0, slow: false, waiting: false });
    playShadow(0, false);
  }
  function advanceShadow(cur, slow) {
    const next = cur + 1;
    if (next >= flatSents.length) {
      setShadow({ on: false, idx: 0, slow: false, waiting: false });
      cancelSpeech();
      showToast("🎉 全文跟读完成！");
      return;
    }
    setShadow((x) => ({ ...x, idx: next, waiting: false, slow }));
    playShadow(next, slow);
  }
  function exitShadow() {
    cancelSpeech();
    setShadow({ on: false, idx: 0, slow: false, waiting: false });
  }

  /* ---- 生成文章（含生词织入） ---- */
  async function generateArticle(t, lvId, opts) {
    const theTopic = (t ?? topic).trim();
    const theLevel = lvId ?? level;
    if (genLoading) return;
    /* 织哪些词由首页「AI 现写」卡决定，这里只管用。
       opts.weave 是给「今天」那条主线用的：它同一轮里刚 setWeaveOn(true)，
       而 state 要下一轮才更新，读 weaveOn 会读到旧的 false。 */
    const weave = (opts && opts.weave) || (weaveOn ? weavePicked : []);

    // 主题可以留空——那就让模型照着生词自己找情境，硬填主题写出来反而生硬。
    // 但两者不能都空：没主题又没词，模型只会翻来覆去写那几个万金油话题。
    if (!theTopic && !weave.length) {
      showToast("写个主题，或者打开生词复习选几个词");
      return;
    }
    const wantNewTab = !!(opts && opts.newTab) || !activeId;
    if (wantNewTab && !canOpenNewTab()) return;

    /* 上一篇几乎没查词 = 偏简单。这个判断只能在读完离开时下——读到一半
       点得少，可能是后面还没读。所以放在生成下一篇的时刻。 */
    const prevIdx = LEVELS.findIndex((l) => l.id === theLevel);
    const tooEasy = article && curWords >= 120 && clicks <= 2 && prevIdx < LEVELS.length - 1;

    hardStop();
    setGenLoading(true);
    setGenError("");
    const lv = LEVELS.find((l) => l.id === theLevel);

    const weaveLine = weave.length
      ? `\n- 请自然地用上这些单词（是学习者的生词，帮 TA 复习）：${weave.join(", ")}。个别词若与该难度实在不符可省略，切勿生硬堆砌`
      : "";

    const openLine = theTopic
      ? `请以主题「${theTopic}」为内容，写一篇 ${lv.tag}（CEFR ${lv.id}）水平的英语短文。`
      : `请写一篇 ${lv.tag}（CEFR ${lv.id}）水平的英语短文，主题由你来定——围绕下面那些生词，自己想一个能把它们自然串起来的真实情境。挑话题时以"哪种情境用得上这些词"为准，不要为了凑词而选一个牵强的话题；成文要像一篇正经文章，不能像单词练习。`;

    const prompt = `你是一位专业的英语分级阅读内容作者。${openLine}

严格要求：
- 长度约 ${lv.words} 词，分 2-4 段
- ${lv.spec}
- 内容有趣、有信息量，适合中国英语学习者阅读
- **只写已被确认的知识**：科学共识、公认的历史事实、教科书级别的常识。绝不写伪科学、民间偏方、都市传说、阴谋论，也不写"据说""有人认为"这类没有依据的说法
- **拿不准就不写**：不要编造具体数字、年份、人名、机构名、研究结论或引语。宁可只讲定性的、大方向上不会错的内容，也不要为了具体而编
- 若这个话题学界本身尚无定论，就如实写明目前还有争议，不要挑一边当成结论讲
- 标题简洁吸引人${weaveLine}

只返回 JSON，不要任何其他文字、解释或 markdown 代码块：
{"title":"英文标题","content":"英文正文，段落之间用\\n\\n分隔","cn_intro":"一句话中文导读，25字以内","topic_cn":"本文话题的中文短标签，4-10字，如「桥梁工程」「城市里的鸟」"}`;

    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (!data.title || !data.content) throw new Error("bad");

      // 实际检测哪些生词真的被织进来了
      const woven = weave.filter((w) =>
        new RegExp(`\\b${escapeReg(w)}[a-zA-Z]*\\b`, "i").test(data.content)
      );
      if (woven.length) {
        const set = new Set(woven.map((w) => w.toLowerCase()));
        setVocab((vs) =>
          vs.map((v) => {
            const t = weaveTermOf(v).toLowerCase();
            return t && set.has(t) ? { ...v, meet: (v.meet || 1) + 1 } : v;
          })
        );
      }

      // 原地替换会把当前这篇彻底覆盖掉，先归档
      if (!wantNewTab) archive(tabs.find((t) => t.id === activeId));
      const tabId = wantNewTab ? "t" + Date.now() : activeId;
      const art = {
        id: tabId,
        title: data.title,
        chapters: [data.content], ch: 0, trans: {},
        cn_intro: data.cn_intro || "",
        // 没填主题时用模型自报的话题标签，界面上「继续读」卡片、文章出处那几处
        // 才不会露出空白；autoTopic 记着这篇本来是不限主题的，重写时不锁死话题
        topic: theTopic || (data.topic_cn || "").trim() || "生词复习",
        autoTopic: !theTopic,
        level: theLevel,
        woven,
      };
      setTabs((ts) => (wantNewTab ? [...ts, art] : ts.map((x) => (x.id === activeId ? art : x))));
      setActiveId(tabId);
      setLevel(theLevel);
      setView("read");
      setQuiz({ st: "idle" });
      setShowTrans(false);
      clickedRef.current = new Set();
      setClicks(0);
      // 提示挂到新文章上（重置之后再设，否则会被上面那行清掉）
      setLvHint(tooEasy ? { dir: "up", to: LEVELS[prevIdx + 1].id, label: LEVELS[prevIdx + 1].label } : null);
      setStats((s) => {
        const d = dateStr();
        const day = s.log[d] || {};
        return {
          ...s, lv: theLevel, total: (s.total || 0) + 1,
          log: { ...s.log, [d]: { ...day, a: (day.a || 0) + 1 } },
        };
      });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setGenError(errText(e, providerId));
    } finally {
      setGenLoading(false);
    }
  }

  /* ---- 查词 ---- */

  /* 词典面板的开合。桌面端用 prefs.dictOff 记住"用户主动收起"，收起后正文占满整幅；
     移动端仍只看 dictOpen（底部抽屉），CSS 上用媒体查询隔开，两边互不影响。
     任何一次查词都会自动把面板重新展开——点了词却看不到释义是说不通的。 */
  /* 查词时把其他浮层一律收掉。窄屏下它们都是盖住整屏的固定层，
     留着任何一个都会和单词卡叠在一起：
       .seltip  z-80  划词后的「译」气泡，比单词卡还高，会飘在它上面
       .sidebar z-70  侧栏抽屉
       .popmask z-69  难度下拉的全屏遮罩，会挡住单词卡上的点击
     词典本身是 z-60，谁都比它高，所以必须主动关，不能指望层级压住。 */
  function openDict() {
    setDictOpen(true);
    setNavOpen(false);
    setSelTip(null);
    setLvMenu(false);
    setPrefs((p) => (p.dictOff ? { ...p, dictOff: false } : p));
  }
  function closeDict() {
    setDictOpen(false);
    setPrefs((p) => ({ ...p, dictOff: true }));
  }

  async function lookup(term, sentence, key) {
    const q = (term || "").trim();
    if (!q) return;
    if (looksLikeSentence(q)) { translateText(q); return; }
    lastLookupRef.current = [term, sentence, key];
    setDict({ status: "loading", term: q, key, sent: sentence });
    openDict();
    const ql = q.toLowerCase();
    if (/^[a-zA-Z]/.test(q)) {
      const before = clickedRef.current.size;
      clickedRef.current.add(ql);
      if (clickedRef.current.size !== before) setClicks(clickedRef.current.size);
    }

    // 计数放在所有缓存判断之前：本地秒开的那一次同样是"你又不认识它了"
    seenRef.current[ql] = (seenRef.current[ql] || 0) + 1;
    seenRef.current = saveSeen(seenRef.current);

    const cacheKey = ql + "||" + (sentence || "");
    const finish = (data, local) => {
      const lemma = (data.word || data.input || q).toLowerCase();
      const hit = vocab.find(
        (v) =>
          (v.data?.word || "").toLowerCase() === lemma ||
          (v.surface || "").toLowerCase() === q.toLowerCase() ||
          v.key === lemma
      );
      const next = {
        status: "ok", term: q, key, sent: sentence, data,
        meta: {
          saved: !!hit,
          meet: hit ? hit.meet || 1 : 0,
          // local=true 表示这条没花 API，界面据此提供「补一条语境」的入口
          local: !!local,
          seen: seenRef.current[ql] || 1,
        },
      };
      setDict(next);
      if (data.type === "en" || data.type === "zh") lastWordRef.current = next;
      if (data.type === "en" && wchat.word !== data.word) {
        setWchat({ word: data.word, msgs: [], busy: false });
      }
    };

    if (cacheRef.current.has(cacheKey)) {
      finish(cacheRef.current.get(cacheKey));
      return;
    }

    /* 本地先行：生词本 > 词级缓存。命中就秒开，不调 API 也不花钱。
       生词本里存的就是完整词条，以前却从不读它——收藏过的词再点一次
       照样去问模型，这是纯浪费。 */
    const localHit =
      [
        vocab.find((v) => v.key === ql || (v.surface || "").toLowerCase() === ql)?.data,
        dictCacheRef.current.get(ql),
      ].find(isFullEntry);
    if (localHit) {
      finish(stripCtx(localHit), true);
      return;
    }
    const isZh = /[\u4e00-\u9fff]/.test(q);
    let prompt;
    if (isZh) {
      prompt = `你是一本专业的汉英词典。把中文词条「${q}」翻译成英文。

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"type":"zh","input":"${q}","translations":[{"en":"英文对应词","phonetic_us":"美式音标，含斜杠","pos":"词性缩写","note":"简短的用法/语气/场合说明"}],"examples":[{"en":"英文例句","cn":"中文翻译"}]}

translations 按常用程度给 1-3 个；examples 恰好 2 条（使用第一个译词，难度适中）。`;
    } else {
      prompt = `你是一本专业的英汉词典（风格类似有道词典）。查询词条：「${q}」${sentence ? `\n它出现在句子："${sentence}"` : ""}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"type":"en","word":"单词原形","phonetic_us":"美式音标，含斜杠","phonetic_uk":"英式音标，含斜杠","context_cn":${sentence ? '"该词在上面句子中的准确中文含义，一句话说清"' : "null"},"tech_cn":"该词在计算机／IT 领域的专门含义，白话说清，不超过 40 字；没有专门含义就填 null","senses":[{"pos":"词性缩写如 n. / v. / adj.","cn":"中文释义"}],"examples":[{"en":"英文例句","cn":"中文翻译"}]}

senses 按常用程度排列，最多 4 条；examples 恰好 2 条且包含查询词，难度适中。若词条是短语，phonetic 可为 null。

tech_cn 只在该词是计算机／编程／软件界面的常用术语时才填（如 artifact、default、thread、cache、prompt）。日常词在计算机里没有区别于字面的专门用法时一律填 null，不要为了凑内容硬扯。`;
    }
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (!data.type) throw new Error("bad");
      cacheRef.current.set(cacheKey, data);
      // 按词原形和用户点的形态各存一份：点 running 下次直接命中，
      // 点 run 也命中同一条，省得同一个词的不同变形各查一次
      const lemma = (data.word || data.input || q).toLowerCase();
      dictCacheRef.current.set(ql, stripCtx(data));
      if (lemma && lemma !== ql) dictCacheRef.current.set(lemma, stripCtx(data));
      saveDictCache(dictCacheRef.current);
      finish(data);
    } catch (e) {
      setDict({ status: "error", term: q, key, sent: sentence, msg: errText(e, providerId) });
    }
  }

  /* 重新生成某篇文章时该沿用什么主题。不限主题写出来的那篇，重写时依旧
     不限主题——它的 topic 只是模型自报的标签，拿它去重写等于把话题锁死了。 */
  function reTopicOf(a) {
    return a && a.autoTopic ? "" : a && a.topic;
  }

  /* 本地命中的词条没有「这句里什么意思」——那条跟着句子走，不能拿别句的顶替。
     多数时候有释义就够了，所以做成按需：想看再点，点了才花这一次调用。 */
  async function fetchContext() {
    const d = dict.data;
    if (!d || dict.status !== "ok" || !dict.sent || ctxBusy) return;
    setCtxBusy(true);
    try {
      const data = await callClaude(
        `单词「${dict.term}」出现在这句话里："${dict.sent}"

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"context_cn":"该词在这句话中的准确中文含义，一句话说清"}`,
        apiKey, model, null, providerId
      );
      if (data.context_cn) {
        setDict((x) => (x.status === "ok" ? { ...x, data: { ...x.data, context_cn: data.context_cn } } : x));
      }
    } catch (e) {
      showToast(errText(e, providerId));
    } finally {
      setCtxBusy(false);
    }
  }

  function retryLookup() {
    if (lastLookupRef.current) lookup(...lastLookupRef.current);
  }

  /* ---- 句子/段落翻译 ---- */
  async function translateText(raw) {
    let text = (raw || "").trim();
    if (!text) return;
    const trunc = text.length > 700;
    if (trunc) text = text.slice(0, 700);
    setSelTip(null);
    const short = text.length > 16 ? text.slice(0, 16) + "…" : text;
    setDict({ status: "loading", term: short, trMode: true });
    openDict();
    const cacheKey = "T||" + text;
    if (cacheRef.current.has(cacheKey)) {
      setDict({ status: "ok", term: short, data: cacheRef.current.get(cacheKey) });
      return;
    }
    const zh = /[\u4e00-\u9fff]/.test(text);
    const prompt = `把下面的${zh ? "中文翻译成自然地道的英文" : "英文翻译成简洁流畅的中文"}：
"${text.replace(/"/g, "'")}"

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"type":"tr","dir":"${zh ? "zh2en" : "en2zh"}","src":"原文","dst":"译文","note":"一句话点出翻译要点或地道表达（没有可为 null）"}`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (data.type !== "tr" || !data.dst) throw new Error("bad");
      if (trunc) data.trunc = true;
      cacheRef.current.set(cacheKey, data);
      setDict({ status: "ok", term: short, data });
    } catch (e) {
      setDict({ status: "error", term: short, trFail: raw, msg: errText(e, providerId) });
    }
  }

  /* ---- 词卡追问对话 ---- */
  async function askWord(q) {
    const question = (q || "").trim();
    if (!question || wchat.busy || !wchat.word) return;
    const word = wchat.word;
    const history = wchat.msgs.slice(-4)
      .map((m) => (m.role === "q" ? "学习者问过：" : "你答过：") + m.t)
      .join("\n");
    setWchat((w) => ({ ...w, busy: true, msgs: [...w.msgs, { role: "q", t: question }] }));
    const prompt = `你是耐心的英语词汇老师。学习者正在研究单词「${word}」${dict.sent ? `（它出现在句子："${dict.sent}"）` : ""}。
${history ? history + "\n" : ""}学习者现在的问题：${question}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"answer":"用中文口语化地回答，可夹英文词汇，150字以内，直接切中问题","words":[{"w":"回答中值得学习者收藏的相关英文单词或短语","p":"美式音标含斜杠","cn":"简短中文释义"}]}

words 按相关度最多给 5 个；如果回答里没有值得收藏的词就给空数组。`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (!data.answer) throw new Error("bad");
      setWchat((w) => ({
        ...w, busy: false,
        msgs: [...w.msgs, { role: "a", t: data.answer, words: Array.isArray(data.words) ? data.words.slice(0, 5) : [] }],
      }));
    } catch (e) {
      setWchat((w) => ({
        ...w, busy: false,
        msgs: [...w.msgs, { role: "a", t: "这条没答上来，换个问法再试试。", words: [] }],
      }));
    }
  }

  /* 小测错题词批量入库。存的是薄词条（只有一条释义），这没问题——
     isFullEntry 会挡住它被当成查词缓存用，下次点它仍会拉一份完整的。 */
  function saveMissedWords(list) {
    const fresh = (list || []).filter((m) => m.w && !savedKeys.has(m.w.toLowerCase()));
    if (!fresh.length) { showToast("这些词都已经在生词本里了"); return; }
    setVocab((v) => [
      ...fresh.map((m) => ({
        key: m.w.toLowerCase(),
        data: {
          type: "en", word: m.w, phonetic_us: "", phonetic_uk: "",
          context_cn: null, senses: [{ pos: "", cn: m.cn || "" }], examples: [],
        },
        surface: m.w, savedAt: Date.now(), meet: 1,
        rv: { due: Date.now(), iv: 0, streak: 0 },
      })),
      ...v,
    ]);
    showToast(`已收 ${fresh.length} 个错题词，今天就能复习`);
  }

  function addChatWord(cw) {
    const key = (cw.w || "").toLowerCase().trim();
    if (!key) return;
    if (savedKeys.has(key)) { showToast("已在生词本里了"); return; }
    setVocab((v) => [
      {
        key,
        data: {
          type: "en", word: cw.w, phonetic_us: cw.p || "", phonetic_uk: "",
          context_cn: null, senses: [{ pos: "", cn: cw.cn || "" }], examples: [],
        },
        surface: cw.w, savedAt: Date.now(), meet: 1,
        rv: { due: Date.now(), iv: 0, streak: 0 },
      },
      ...v,
    ]);
    showToast(`已收藏 ${cw.w}`);
  }

  /* ---- 情景对话 ---- */

  function startTalk(scene) {
    setTalk({ scene, msgs: [], busy: false, draft: "" });
    sendTalk("", scene, []); // 空输入触发开场白，由 AI 先说第一句
  }
  function exitTalk() {
    setTalk({ scene: null, msgs: [], busy: false, draft: "" });
  }

  async function sendTalk(text, sceneArg, msgsArg) {
    const scene = sceneArg || talk.scene;
    if (!scene || talk.busy) return;
    const said = (text || "").trim();
    const base = msgsArg || talk.msgs;
    const msgs = said ? [...base, { role: "u", t: said }] : base;
    setTalk((s) => ({ ...s, msgs, busy: true, draft: "" }));

    const lv = LEVELS.find((l) => l.id === level) || LEVELS[1];
    /* 让对话吃生词本里到期的词：这次改的每一处都是把断掉的信号接回去，
       对话练习也该用你正在复习的词，而不是另起一套词汇。 */
    const want = dueList.slice(0, 6).map((v) => weaveTermOf(v)).filter(Boolean);
    const wantLine = want.length
      ? `\n学习者正在复习这些词，如果自然的话请在你的话里用上一两个（不要硬塞、不要一次全用）：${want.join(", ")}。`
      : "";
    const historyLine = msgs
      .map((m) => (m.role === "u" ? "学习者说：" : "你说：") + m.t)
      .join("\n");

    const prompt = `你在和一位中国英语学习者做情景对话练习。你扮演${scene.role}，目标是${scene.goal}。
学习者的英语水平：${lv.tag}（CEFR ${lv.id}），你说的英语要贴着这个水平，别超纲。${wantLine}

${historyLine ? `目前的对话：\n${historyLine}` : "对话还没开始，请你说第一句，把场景自然地带起来。"}

规则：
- 你的回复要短，1-3 句，像真人说话，不要长篇大论
- 每次都要把对话往前推进（提问、给选项、要求确认），不要只是附和
- 学习者说得不地道时，不要打断对话去纠正，把改进版放进 fix 字段

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"say":"你这轮说的英文","say_cn":"这句的中文翻译","fix":${said ? '"学习者上一句更地道的英文说法；本来就没问题就填 null"' : "null"},"fix_why":${said ? '"用一句中文说明改了什么；fix 为 null 时也填 null"' : "null"},"used":["你这轮实际用上的复习词，没有就空数组"]}`;

    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (!data.say) throw new Error("bad");
      setTalk((s) => ({
        ...s, busy: false,
        msgs: [...msgs, {
          role: "a", t: data.say, cn: data.say_cn || "",
          fix: data.fix || "", why: data.fix_why || "",
          used: Array.isArray(data.used) ? data.used : [],
        }],
      }));
      // 对话里真的用上的复习词，按"又见了一面"记一次
      const used = new Set((Array.isArray(data.used) ? data.used : []).map((w) => String(w).toLowerCase()));
      if (used.size) {
        setVocab((vs) => vs.map((v) => {
          const t = weaveTermOf(v).toLowerCase();
          return t && used.has(t) ? { ...v, meet: (v.meet || 1) + 1 } : v;
        }));
      }
      bumpStat("t");
    } catch (e) {
      setTalk((s) => ({ ...s, busy: false }));
      showToast(errText(e, providerId));
    }
  }

  /* ---- 整句解析 ---- */
  async function analyzeSentence(sentence) {
    const s = (sentence || "").trim();
    if (!s) return;
    setDict({ status: "loading", term: "整句解析", sentMode: true });
    openDict();
    const cacheKey = "S||" + s;
    if (cacheRef.current.has(cacheKey)) {
      setDict({ status: "ok", term: s, data: cacheRef.current.get(cacheKey) });
      return;
    }
    const prompt = `你是耐心的英语语法老师。为中国学习者解析这个句子：
"${s}"

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"type":"sent","sentence":"${s.replace(/"/g, "'")}","translation":"自然流畅的中文翻译","parts":[{"r":"成分名（主语/谓语/宾语/状语/定语从句等）","t":"对应的原文片段"}],"grammar":"用一两句口语化中文点出本句关键语法（从句类型、时态、固定搭配等）"}

parts 按语序给 3-6 项，覆盖整句主干和关键修饰。`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (data.type !== "sent") throw new Error("bad");
      cacheRef.current.set(cacheKey, data);
      setDict({ status: "ok", term: s, data });
    } catch (e) {
      setDict({ status: "error", term: "整句解析", sentFail: s, msg: errText(e, providerId) });
    }
  }
  function backToWord() {
    if (lastWordRef.current) setDict(lastWordRef.current);
    else setDict({ status: "idle" });
  }

  function doSearch() {
    const q = search.trim();
    if (!q) return;
    // 词典面板只在阅读页显示，所以查词前先回阅读页并展开面板，
    // 否则在生词本/统计页搜索会「查了但看不到结果」
    setView("read");
    openDict();
    lookup(q);
  }

  /* 侧栏里点任何一项都走这里：切视图 + 收起抽屉（窄屏用） */
  function go(v) {
    setView(v);
    setNavOpen(false);
    // 进教材页顺手把清单拉上；已经有了就直接返回，不会重复请求
    if (v === "books") loadLibrary(false);
  }

  /* ---- 读后小测 ---- */
  async function startQuiz() {
    if (!article || quiz.st === "loading") return;
    setQuiz({ st: "loading" });
    const focus = [
      ...new Set([...(article.woven || []), ...clickedRef.current]),
    ].slice(0, 5);
    const focusLine = focus.length
      ? `词汇题优先考察这些词（学习者查过或在复习的词）：${focus.join(", ")}。`
      : "";
    const prompt = `基于下面这篇英文文章，为中国英语学习者出 3 道单选题：第 1、2 题考文中词汇的含义（${focusLine}），第 3 题考对文章内容的理解。选项要有迷惑性但只有一个正确答案。

文章《${article.title}》：
${curText}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"questions":[{"q":"题干","options":["选项A","选项B","选项C","选项D"],"answer":0,"explain":"一句话中文解析","word":"这道题考察的那个英文单词原形；内容理解题填 null","word_cn":"该词的简短中文释义；word 为 null 时也填 null"}]}

题干用中文提问（考察的英文词/句可直接引用原文），answer 是正确选项的下标 0-3。`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      const qs = (data.questions || []).filter(
        (x) => x.q && Array.isArray(x.options) && x.options.length >= 2
      );
      if (!qs.length) throw new Error("bad");
      setQuiz({ st: "on", qs, i: 0, sel: null, score: 0, missed: [] });
    } catch (e) {
      setQuiz({ st: "err" });
    }
  }
  function pickOption(oi) {
    if (quiz.st !== "on" || quiz.sel !== null) return;
    const q = quiz.qs[quiz.i];
    const right = oi === q.answer;
    // 答错是比"点过这个词"更硬的证据：你确实没掌握它。以前这个信号
    // 什么也不触发，现在收下来，结果页可以一键送进生词本。
    const missed = quiz.missed || [];
    const w = (q.word || "").trim();
    const next = !right && w && !missed.some((m) => m.w.toLowerCase() === w.toLowerCase())
      ? [...missed, { w, cn: (q.word_cn || "").trim() }]
      : missed;
    setQuiz({ ...quiz, sel: oi, score: quiz.score + (right ? 1 : 0), missed: next });
  }
  function nextQuestion() {
    if (quiz.st !== "on") return;
    if (quiz.i + 1 < quiz.qs.length) {
      setQuiz({ ...quiz, i: quiz.i + 1, sel: null });
      return;
    }
    // 结束：记统计 + 自动调难
    bumpStat("q");
    const idx = LEVELS.findIndex((l) => l.id === level);
    let adj = null;
    if (quiz.score === quiz.qs.length && idx < LEVELS.length - 1) {
      const nl = LEVELS[idx + 1];
      setLevel(nl.id);
      setStats((s) => ({ ...s, lv: nl.id }));
      adj = { dir: "up", label: nl.label, tag: nl.tag };
    } else if (quiz.score <= 1 && idx > 0) {
      const nl = LEVELS[idx - 1];
      setLevel(nl.id);
      setStats((s) => ({ ...s, lv: nl.id }));
      adj = { dir: "down", label: nl.label, tag: nl.tag };
    }
    setQuiz({ st: "done", qs: quiz.qs, score: quiz.score, adj, missed: quiz.missed || [] });
  }

  /* ---- 导入材料 ---- */
  function finishImport(art) {
    if (!canOpenNewTab()) return;
    hardStop();
    const id = "t" + Date.now();
    setTabs((ts) => [...ts, { ...art, id }]);
    setActiveId(id);
    setView("read");
    setQuiz({ st: "idle" });
    setShowTrans(false);
    clickedRef.current = new Set();
    setClicks(0);
    setLvHint(null);
    setImpOpen(false);
    setImpErr("");
    setImpText("");
    setImpUrl("");
    setStats((st) => {
      const d = dateStr();
      const day = st.log[d] || {};
      return { ...st, total: (st.total || 0) + 1, log: { ...st.log, [d]: { ...day, a: (day.a || 0) + 1 } } };
    });
    window.scrollTo({ top: 0 });
    showToast("导入成功，点单词即可查词");
  }

  function importFromText(raw, label) {
    const t = String(raw || "").trim();
    if (!t) { setImpErr("先把内容粘贴进来"); return; }
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    if (latin < 40) { setImpErr("看起来不是英文材料——目前只支持导入英文内容来学习"); return; }
    if (t.length > MAX_DOC_CHARS) {
      setImpErr(`这份材料有 ${(t.length / 10000).toFixed(0)} 万字符，超过浏览器存储能放下的上限（约 ${MAX_DOC_CHARS / 10000} 万）。拆成几份分别导入吧`);
      return;
    }

    // 第一行像标题就摘出来当标题，剩下的正文再分章
    let title = "";
    let body = t;
    const firstLine = t.split("\n")[0].trim();
    if (firstLine.length <= 70 && countWords(firstLine) <= 12 && t.includes("\n")) {
      title = firstLine.replace(/[#*]+/g, "").trim();
      body = t.split("\n").slice(1).join("\n").trim() || t;
    } else {
      title = t.split(/\s+/).slice(0, 8).join(" ") + "…";
    }

    const chs = splitChapters(body);
    if (!chs.length || !chs[0]) { setImpErr("没有识别到有效内容"); return; }
    const words = countWords(body);
    finishImport({
      title, chapters: chs, ch: 0, trans: {},
      cn_intro: chs.length > 1
        ? `全文约 ${words} 词，已分成 ${chs.length} 章。查词、译文、小测都只针对当前这一章，读完一章点「下一章」继续`
        : "",
      topic: label, level, imported: true,
    });
  }

  async function importFromUrl(rawUrl) {
    const url = (typeof rawUrl === "string" ? rawUrl : impUrl).trim();
    if (!/^https?:\/\//i.test(url)) { setImpErr("请粘贴以 http(s):// 开头的完整网址"); return; }
    if (!providerOf(providerId).webSearch) {
      // 联网抓取依赖服务商提供搜索工具，目前只有 OpenRouter 支持；
      // 别的服务商没有这个能力，硬发过去只会让模型凭空编内容
      setImpErr(`当前服务商（${providerOf(providerId).name}）不支持联网抓取网页。请改用「粘贴文本」导入，或到设置里切换成 OpenRouter`);
      return;
    }
    if (impBusy) return;
    setImpBusy(true);
    setImpErr("");
    try {
      const data = await fetchPageText(url, {
        apiKey, model, providerId, maxWords: FETCH_WORDS,
        hint: "如果它是视频页面，请尽力找到其英文字幕、台词或内容简介。",
      });
      const chs = splitChapters(data.content);
      finishImport({
        title: data.title || hostOf(url),
        chapters: chs, ch: 0, trans: {},
        srcUrl: url, srcSite: hostOf(url),
        cn_intro: chs.length > 1 ? `抓到约 ${countWords(data.content)} 词，已分成 ${chs.length} 章` : "",
        topic: hostOf(url), level, imported: true,
      });
    } catch (e) {
      setImpErr(
        e.message === "nocite"
          ? "没有真正抓到这个页面（模型没返回任何访问记录），内容不可信，已放弃。把正文复制过来用「粘贴文本」导入最稳"
          : "没抓到这个页面的英文内容——最稳的办法：把正文（或视频字幕）复制过来，用「粘贴文本」导入"
      );
    } finally {
      setImpBusy(false);
    }
  }

  /* 按分类联网找一篇**真实**文章。
     和「生成文章」的根本区别：这里的正文来自真实网页，会带上可点开核对的原始链接。
     不做这个功能而让模型「标注出处」是不行的——它会编出看着很像真的链接。 */
  /* 找真实文章。传了主题就按主题搜，没传就按当前分类随便找一篇。 */
  async function fetchRealArticle(theTopic) {
    if (realBusy) return;
    if (!providerOf(providerId).webSearch) {
      setRealErr(`找真实文章要靠服务商的联网搜索，当前的 ${providerOf(providerId).name} 不支持。去设置里换成 OpenRouter，或者用右边的「AI 现写」——但那是编的，不是真实报道`);
      return;
    }
    if (!canOpenNewTab()) return;
    setRealBusy(true);
    setRealErr("");
    const cat = catOf(chipCat);
    const want = (typeof theTopic === "string" && theTopic.trim())
      ? `主题是「${theTopic.trim()}」`
      : `主题属于「${cat.name}」领域`;
    const prompt = `用网络搜索找一篇**真实存在**的英文文章，${want}，最好是最近一年内的科普或报道。

要求：
- 必须是你通过搜索真实访问到的页面，不能凭记忆编造
- url 必须是完整的 http(s) 网址，且确实是这篇文章的地址
- content 只摘录你**实际读到**的原文，保持原文措辞，不要改写、不要总结
- 尽量完整，上限 ${FETCH_WORDS} 词；从文章开头连续往下取，不要跳着摘
- **实际读到多少就给多少。宁可只有两段，也绝不自己补写凑长度**——
  内容不足不是问题，编造才是问题
- 难度控制在${LEVELS.find((l) => l.id === level)?.tag} 左右，太难的话换一篇相对易读的

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"title":"文章英文标题","site":"网站名，如 BBC / Nature","url":"https://完整原文地址","date":"发布日期，不确定就空字符串","content":"英文原文摘录"}

如果搜不到可靠的，返回：{"error":"一句话中文原因"}`;
    try {
      const data = await callClaude(prompt, apiKey, model, true, providerId);
      if (data.error || !data.content) throw new Error("empty");

      /* 出处以搜索引擎实际访问过的页面为准。
         模型自报的 url 只在能和引用列表对上时才用——它完全有能力
         编出一个格式合法却不存在的网址，光校验格式挡不住。 */
      const cites = data.__cites || [];
      if (!cites.length) throw new Error("nocite");
      const said = String(data.url || "");
      const hit = cites.find((c) => c.url === said)
        || cites.find((c) => hostOf(c.url) === hostOf(said))
        || cites[0];

      if ((data.content.match(/[A-Za-z]/g) || []).length < 200) throw new Error("thin");
      const chs = splitChapters(data.content);
      const site = data.site || hostOf(hit.url);
      finishImport({
        title: data.title || hit.title || "Untitled",
        chapters: chs, ch: 0, trans: {},
        srcUrl: hit.url,
        srcSite: site,
        srcDate: data.date || "",
        // 模型报的网址和真正搜到的对不上时，如实说出来，别假装一致
        cn_intro: `来自 ${site} 的真实文章${data.date ? `（${data.date}）` : ""}，`
          + `正文为原文摘录，约 ${countWords(data.content)} 词`
          + (chs.length > 1 ? `，已分成 ${chs.length} 章。` : "。")
          + (said && said !== hit.url ? "注意：模型自报的网址与实际搜到的页面不一致，已改用实际页面。" : "")
          + "点上方来源链接可核对原文",
        topic: (typeof theTopic === "string" && theTopic.trim()) || cat.name, level, imported: true,
      });
    } catch (e) {
      setRealErr(
        e.message === "nocite"
          ? "这次没有真正联网搜索（没拿到任何搜索结果），拿不到可核对的出处，不予采用。再点一次试试；一直这样的话检查服务商是否支持联网"
          : "没搜到合适的真实文章。换个说法或换个分类再试；实在找不到就用「AI 现写」，但那是编的"
      );
    } finally {
      setRealBusy(false);
    }
  }

  /* 拉语料库索引。只是一份几十 KB 的清单，进页面拉一次就够，
     之后按难度筛选、按关键词过滤全在本地做，不再联网。
     索引也落盘，离线能看列表（正文另有自己的缓存）。 */
  async function loadLibrary(force) {
    if (booksBusy) return;
    if (!force && books && (books.items || []).length) return;
    setBooksBusy(true);
    setBooksErr("");
    try {
      const d = await libFetch("索引.json");
      const items = Array.isArray(d.items) ? d.items : [];
      if (!items.length) throw new Error("empty");
      const next = { v: d.v || 1, at: Date.now(), items };
      setBooks(next);
      if (!sSet(LIB_KEY, next)) showToast("索引没能存下来（存储写满了），这次还能用");
    } catch (e) {
      setBooksErr("拉不到教材清单——检查一下网络再试。清单存在 jsDelivr 上，国内可以直连，不需要代理");
    } finally {
      setBooksBusy(false);
    }
  }

  /* 把一篇的正文取下来读。
     和查词同一个套路：取过一次就存本地，之后点开直接读、离线也能读，
     也能当复习材料反复用。 */
  async function readBook(b) {
    if (readBusy) return;
    const key = b.id;

    const hit = bookCacheRef.current.get(key);
    if (hit && (hit.chapters || []).length) {
      finishImport({
        title: hit.title, chapters: hit.chapters, ch: 0, trans: {},
        srcUrl: b.srcUrl, srcSite: b.src,
        cn_intro: `本地已存的正文（约 ${hit.words} 词${hit.chapters.length > 1 ? `，${hit.chapters.length} 章` : ""}），没有重新联网`,
        topic: hit.title, level, imported: true,
      });
      go("read");
      return;
    }

    setReadBusy(key);
    setReadErr("");
    try {
      const d = await libFetch("篇目/" + b.id + ".json");
      const text = String(d.text || "");
      if (countWords(text) < 60) throw new Error("thin");
      const chs = splitChapters(text);
      const words = countWords(text);

      // 先落盘再进阅读页：万一存储写满了，得当场说清这次没存下来
      bookCacheRef.current.set(key, { title: b.title, site: b.src, chapters: chs, words, at: Date.now() });
      const { map, ok } = saveBookCache(bookCacheRef.current);
      bookCacheRef.current = map;
      const nx = {};
      for (const [k, v] of map) nx[k] = v.words || 0;
      setCachedBooks(nx);
      if (!ok) showToast("正文没能存下来（存储写满了），这次还能读");

      finishImport({
        title: b.title, chapters: chs, ch: 0, trans: {},
        srcUrl: b.srcUrl, srcSite: b.src,
        cn_intro: `${b.author} · ${b.book}，约 ${words} 词`
          + (chs.length > 1 ? `，已分成 ${chs.length} 章` : "")
          + `。许可：${b.lic}`
          + (ok ? "。已存本地，下次点开不用再联网" : ""),
        topic: b.title, level, imported: true,
      });
      go("read");
    } catch (e) {
      setReadErr(e.message === "thin"
        ? "这一篇的正文是空的，可能是语料库出了问题。换一篇试试"
        : "取不到这一篇的正文，检查一下网络再试");
    } finally {
      setReadBusy("");
    }
  }

  async function handleImportFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setImpBusy(true);
    setImpErr("");
    try {
      let text = "";
      let name = f.name;
      if (/\.docx$/i.test(f.name)) {
        const buf = await f.arrayBuffer();
        const r = await mammoth.extractRawText({ arrayBuffer: buf });
        text = r.value || "";
      } else if (/\.epub$/i.test(f.name)) {
        const buf = await f.arrayBuffer();
        const bk = epubToText(buf);
        text = bk.text;
        // 书里写的标题比文件名可靠，文件名常是 author-title-1234.epub 这种
        if (bk.title) name = bk.title;
      } else {
        text = await f.text();
      }
      importFromText(text, name);
    } catch (err) {
      setImpErr(
        err.message === "epub"
          ? "这本 EPUB 没解析出正文——可能是加密（DRM）的，或者是扫描图片版。换一本，或把正文复制出来用「粘贴文本」"
          : "这个文件读取失败了——把内容复制出来用「粘贴文本」导入最稳"
      );
    } finally {
      setImpBusy(false);
    }
  }

  /* ---- 全文对照翻译 ---- */
  async function toggleTrans() {
    if (!article) return;
    if (showTrans) { setShowTrans(false); return; }
    if (curTrans) { setShowTrans(true); return; }
    if (transBusy) return;
    setTransBusy(true);
    const paras = curText.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const prompt = `把下面的英文文章逐段翻译成简洁、自然的中文。原文共 ${paras.length} 段，请保持相同的分段。

${paras.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"trans":["第1段中文译文","第2段中文译文"]}
数组长度必须为 ${paras.length}。`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      let tr = data.trans;
      if (!Array.isArray(tr) || !tr.length) throw new Error("bad");
      if (tr.length > paras.length) {
        tr = tr.slice(0, paras.length - 1).concat(tr.slice(paras.length - 1).join(" "));
      }
      while (tr.length < paras.length) tr.push("");
      // 译文按章号存，换章不会串台
      setTabs((ts) => ts.map((x) => (x.id === article.id ? { ...x, trans: { ...x.trans, [chIdx]: tr } } : x)));
      setShowTrans(true);
    } catch (e) {
      showToast("翻译失败了，再点一次重试");
    } finally {
      setTransBusy(false);
    }
  }

  /* ---- 复习 ---- */
  function startReview() {
    if (!dueList.length) { showToast("今天没有到期的词，先去读一篇吧"); return; }
    hardStop();
    setRev({ queue: dueList.map((v) => v.key), i: 0, flip: false, ok: 0, ng: 0 });
    setView("review");
  }
  function answerReview(good) {
    if (!rev) return;
    const key = rev.queue[rev.i];
    setVocab((vs) =>
      vs.map((v) => {
        if (v.key !== key) return v;
        const r = rvOf(v);
        if (good) {
          const iv = r.iv === 0 ? 1 : Math.min(Math.round(r.iv * 2.5), 60);
          return { ...v, rv: { iv, streak: r.streak + 1, due: Date.now() + iv * DAY } };
        }
        return { ...v, rv: { iv: 0, streak: 0, due: Date.now() + 12 * 3600000 } };
      })
    );
    bumpStat("r");
    setRev((x) => ({
      ...x, i: x.i + 1, flip: false,
      ok: x.ok + (good ? 1 : 0), ng: x.ng + (good ? 0 : 1),
    }));
  }

  /* ---- 生词本 ---- */
  const savedKeys = useMemo(() => new Set(vocab.map((v) => v.key)), [vocab]);
  const savedSurfaces = useMemo(() => {
    const s = new Set();
    vocab.forEach((v) => {
      if (v.data?.type === "en") {
        if (v.data.word) s.add(v.data.word.toLowerCase());
        if (v.surface) s.add(v.surface.toLowerCase());
      }
    });
    return s;
  }, [vocab]);
  const wovenSet = useMemo(
    () => new Set((article?.woven || []).map((w) => w.toLowerCase())),
    [article]
  );

  function entryKeyOf(d) {
    return (d.type === "en" ? d.word : d.input || "").toLowerCase();
  }
  function saveCurrent() {
    if (dict.status !== "ok" || dict.data.type === "sent") return;
    const key = entryKeyOf(dict.data);
    if (!key) return;
    if (savedKeys.has(key)) {
      setVocab((v) => v.filter((x) => x.key !== key));
      showToast("已从生词本移除");
      return;
    }
    setVocab((v) => [
      {
        key, data: dict.data, surface: dict.term, savedAt: Date.now(),
        meet: 1, rv: { due: Date.now(), iv: 0, streak: 0 },
      },
      ...v,
    ]);
    showToast("已加入生词本，今天就能复习它");
  }
  function removeWord(key) {
    setVocab((v) => v.filter((x) => x.key !== key));
  }

  function copyText(text, okMsg) {
    const ok = () => showToast(okMsg);
    const fail = () => showToast("复制失败，请手动选择");
    try {
      navigator.clipboard.writeText(text).then(ok).catch(() => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          ok();
        } catch (e) { fail(); }
      });
    } catch (e) { fail(); }
  }
  function copyVocab() {
    if (!vocab.length) { showToast("生词本还是空的"); return; }
    copyText(buildVocabMd(vocab), "已复制为 Markdown");
  }

  function downloadVocab() {
    if (!vocab.length) { showToast("生词本还是空的"); return; }
    const md = buildVocabMd(vocab);
    try {
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `生词本-${dateStr()}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 2000);
      showToast("已开始下载 .md 文件");
    } catch (e) {
      copyText(md, "下载被拦截，已复制到剪贴板");
    }
  }

  function importVocabMd() {
    const parsed = parseVocabMd(vImpText);
    if (!parsed.length) { showToast("没有识别到词条，确认粘贴的是导出的 Markdown"); return; }
    let added = 0, skipped = 0;
    setVocab((vs) => {
      const have = new Set(vs.map((v) => v.key));
      const fresh = [];
      for (const p of parsed) {
        if (have.has(p.key)) { skipped++; continue; }
        have.add(p.key);
        fresh.push(p);
        added++;
      }
      return [...fresh, ...vs];
    });
    setVImpText("");
    setVImpOpen(false);
    showToast(`导入 ${added} 个生词${skipped ? `，跳过重复 ${skipped} 个` : ""}`);
  }

  /* ---- 渲染 ---- */
  const dictSavedKey =
    dict.status === "ok" && dict.data.type !== "sent" ? entryKeyOf(dict.data) : null;
  const dictIsSaved = dictSavedKey ? savedKeys.has(dictSavedKey) : false;

  if (!apiKey || showSetup) {
    // 设置页没有侧栏，得关掉 .app 的两列网格，否则左边会空出一条
    return (
      <div className="app solo" style={appStyle}>
        <style>{CSS}</style>
        <SetupView
          hasKey={!!apiKey}
          providerDraft={providerDraft}
          onPickProvider={(id) => {
            // 换服务商时，自动带出之前给这家存过的 Key 和模型
            setProviderDraft(id);
            setKeyDraft(keyMap[id] || "");
            setModelDraft(modelMap[id] || "");
          }}
          keyDraft={keyDraft}
          setKeyDraft={setKeyDraft}
          modelDraft={modelDraft}
          setModelDraft={setModelDraft}
          showToast={showToast}
          onSave={() => {
            const k = keyDraft.trim();
            if (!k) { showToast("请先粘贴 API Key"); return; }
            const pid = providerDraft;
            const m = modelDraft.trim() || providerOf(pid).defaultModel;
            const nextKeys = { ...keyMap, [pid]: k };
            const nextModels = { ...modelMap, [pid]: m };
            sSet(KEYS_STORE, nextKeys);
            sSet(MODELS_STORE, nextModels);
            try { localStorage.setItem(PROVIDER_STORE, pid); } catch (e) {}
            setKeyMap(nextKeys);
            setModelMap(nextModels);
            setProviderId(pid);
            setShowSetup(false);
            showToast(`已连接 ${providerOf(pid).name}，开始使用吧`);
          }}
          onClear={() => {
            // 只清掉当前这一家的密钥，其他服务商的保留
            const pid = providerDraft;
            const nextKeys = { ...keyMap };
            delete nextKeys[pid];
            sSet(KEYS_STORE, nextKeys);
            setKeyMap(nextKeys);
            setKeyDraft("");
            showToast(`已清除 ${providerOf(pid).name} 的密钥`);
          }}
          onBack={() => setShowSetup(false)}
        />
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="app" style={appStyle}>
      <style>{CSS}</style>

      {/* ======= 左侧栏 ======= */}
      {navOpen && <div className="sbmask" onClick={() => setNavOpen(false)} />}
      <aside className={navOpen ? "sidebar open" : "sidebar"}>
        {/* 窄屏下侧栏占满整屏、不再有遮罩可点，得给一个明确的关闭出口 */}
        <button className="sb-close" onClick={() => setNavOpen(false)} aria-label="关闭菜单">
          <X size={18} />
        </button>
        <button className="brand2" onClick={() => go("read")}>
          <span className="logo">007</span>学英语
        </button>

        <nav className="snav" aria-label="视图切换">
          <button className={view === "read" ? "sl on" : "sl"} onClick={() => go("read")}>
            <BookOpen size={16} /> 阅读
          </button>
          <button
            className={view === "vocab" ? "sl on" : "sl"}
            onClick={() => go("vocab")}
          >
            <Bookmark size={16} /> 生词本
            {vocab.length > 0 && <span className="sbadge">{vocab.length}</span>}
          </button>
          <button
            className={view === "review" ? "sl on" : "sl"}
            onClick={() => { startReview(); setNavOpen(false); }}
          >
            <RotateCcw size={16} /> 复习
            {dueList.length > 0 && <span className="sbadge hot">{dueList.length}</span>}
          </button>
          <button className={view === "talk" ? "sl on" : "sl"} onClick={() => go("talk")}>
            <MessagesSquare size={16} /> 对话
          </button>
          <button className={view === "books" ? "sl on" : "sl"} onClick={() => go("books")}>
            <GraduationCap size={16} /> 教材
          </button>
          <button className={view === "stats" ? "sl on" : "sl"} onClick={() => go("stats")}>
            <BarChart3 size={16} /> 统计
          </button>
        </nav>

        <div className="sdiv" />

        {/* 原来的标签页条并进侧栏，省掉正文上方一整行 */}
        <div className="slbl">
          最近打开
          <button className="sadd" onClick={() => { openBlankTab(); go("read"); }}
            aria-label="新开一页" title="新开一页"><Plus size={13} /></button>
        </div>
        <div className="stabs">
          {tabs.length === 0 && <p className="sempty">还没有文章</p>}
          {tabs.map((t) => (
            <div key={t.id} className={view === "read" && t.id === activeId ? "st on" : "st"}>
              <button className="st-b" onClick={() => { switchTab(t.id); go("read"); }} title={t.title}>
                {t.imported && <FileUp size={11} />}
                <span className="st-tt">{t.title || "未命名"}</span>
                {t.chapters?.length > 1 && (
                  <span className="st-ch">{(t.ch || 0) + 1}/{t.chapters.length}</span>
                )}
              </button>
              <button className="st-x" onClick={() => closeTab(t.id)}
                aria-label={`关闭「${t.title}」`}><X size={11} /></button>
            </div>
          ))}
        </div>

        <button
          className={view === "settings" ? "sl sl-set on" : "sl sl-set"}
          onClick={() => go("settings")}
        >
          <Settings size={16} /> 设置
        </button>

        {streak > 0 && (
          <div className="sfoot">
            <b><Flame size={13} /> 连续学习 {streak} 天</b>
          </div>
        )}
      </aside>

      <div className="mainwrap">
        {/* ======= 细顶条：只放查词 ======= */}
        <header className="topbar">
          {/* 开侧栏时收起词典抽屉，理由同 openDict：两个浮层不能同时占屏 */}
          <button className="menubtn" onClick={() => { setNavOpen(true); setDictOpen(false); }} aria-label="菜单">
            <Menu size={18} />
          </button>
          <div className="tsearch">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
              placeholder="查词 / 翻译句子 · 中英互查"
              aria-label="查词"
            />
          </div>
        </header>

        {/* 词典只在阅读页有意义，生词本/统计/复习页要腾出整幅宽度 */}
        <main className={prefs.dictOff || view !== "read" ? "layout nodict" : "layout"}>
        {/* ======= 左：主区域 ======= */}
        <section className="mainc">
          {view === "review" ? (
            <ReviewView
              rev={rev}
              vocab={vocab}
              onSpeak={speak}
              onFlip={() => setRev((x) => ({ ...x, flip: true }))}
              onAnswer={answerReview}
              onExit={() => setView("vocab")}
              onRead={() => { setView("read"); openBlankTab(); }}
            />
          ) : view === "talk" ? (
            <TalkView
              talk={talk}
              dueCount={dueList.length}
              level={LEVELS.find((l) => l.id === level)}
              onStart={startTalk}
              onSend={sendTalk}
              onExit={exitTalk}
              onSetDraft={(v) => setTalk((s) => ({ ...s, draft: v }))}
              onSpeak={speak}
            />
          ) : view === "books" ? (
            <BooksView
              books={books}
              busy={booksBusy}
              err={booksErr}
              curLevel={level}
              onLoad={loadLibrary}
              onRead={readBook}
              readBusy={readBusy}
              readErr={readErr}
              cached={cachedBooks}
            />
          ) : view === "stats" ? (
            <StatsView
              stats={stats}
              streak={streak}
              vocab={vocab}
              vocabCount={vocab.length}
              dueCount={dueList.length}
              level={LEVELS.find((l) => l.id === level)}
              onGoReview={startReview}
            />
          ) : view === "settings" ? (
            <SettingsView
              prefs={prefs}
              setPrefs={setPrefs}
              enVoices={enVoices}
              onTestVoice={() => speak("Hello! I will be your reading voice. Let's read something together.", "en-US")}
              providerName={providerOf(providerId).name}
              model={model}
              onChangeProvider={() => {
                setProviderDraft(providerId);
                setKeyDraft(apiKey);
                setModelDraft(model);
                setShowSetup(true);
              }}
              vocabCount={vocab.length}
              onCopyVocab={copyVocab}
              onDownloadVocab={downloadVocab}
              confirmClear={confirmClear}
              setConfirmClear={setConfirmClear}
              onClearVocab={() => { setVocab([]); setConfirmClear(false); showToast("已清空生词本"); }}
            />
          ) : view === "vocab" ? (
            <VocabView
              vocab={vocab}
              dueCount={dueList.length}
              onStartReview={startReview}
              onSpeak={speak}
              onRemove={removeWord}
              onCopy={copyVocab}
              onDownload={downloadVocab}
              vImpOpen={vImpOpen}
              setVImpOpen={setVImpOpen}
              vImpText={vImpText}
              setVImpText={setVImpText}
              onVImport={importVocabMd}
              confirmClear={confirmClear}
              setConfirmClear={setConfirmClear}
              onClear={() => { setVocab([]); setConfirmClear(false); showToast("已清空生词本"); }}
              onLookup={(w) => lookup(w)}
            />
          ) : (
            <>
              {!article && !genLoading ? (
            /* ---- 空状态 / 生成器 ---- */
            <div className="home">
              <h1 className="home-t">今天想读点什么？</h1>
              <p className="home-sub">让 AI 按你的难度和生词现写一篇，或者导入自己的材料；想读有出处的真实文章，点下面的话题卡。</p>

              {/* 当日主线：先给一个默认动作。下面三块（现写／继续读／话题卡）
                  都在喊"从我这儿开始"，每次打开都要重新决策一遍，累的是人。
                  有到期的词就先复习，否则接着上次读。 */}
              {(dueList.length > 0 || article) && (
                <div className="today">
                  <div className="today-l">
                    <span className="today-tag">今天</span>
                    {dueList.length > 0
                      ? <b>{dueList.length} 个词到期了</b>
                      : <b>接着读《{article.title}》{(article.chapters || []).length > 1 ? ` 第 ${(article.ch || 0) + 1} 章` : ""}</b>}
                  </div>
                  <div className="today-a">
                    {dueList.length > 0 ? (
                      <>
                        <button className="btn-pri small" onClick={startReview}>
                          <Brain size={15} /> 复习 {dueList.length} 个词
                        </button>
                        {weaveCands.length > 0 && (
                          <button className="btn-gh small"
                            onClick={() => { setWeaveOn(true); setTopic(""); generateArticle("", null, { weave: weavePicked }); }}
                            disabled={genLoading}>
                            <Sparkles size={15} /> 读一篇织入它们的文章
                          </button>
                        )}
                      </>
                    ) : (
                      <button className="btn-pri small" onClick={() => setView("read")}>
                        <BookOpen size={15} /> 继续读
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="genbox">
              {!providerOf(providerId).webSearch && (
                <div className="genwarn">
                  当前服务商 <b>{providerOf(providerId).name}</b> 不支持联网搜索，找不了真实文章。
                  去<button className="lnk" onClick={() => go("settings")}>设置</button>换成 OpenRouter 即可。
                </div>
              )}

              <div className="genfoot">
                <button className="lnk-imp" onClick={() => { setImpOpen((o) => !o); setImpErr(""); }}>
                  <Upload size={13} /> 导入自己的材料
                  <ChevronDown size={13} className={impOpen ? "flip" : ""} />
                </button>
              </div>

              {realErr && <div className="err">{realErr}</div>}

              {impOpen && (
                <div className="imp">
                  <div className="chipswitch imp-tabs">
                    <button className={impTab === "paste" ? "cs on" : "cs"} onClick={() => setImpTab("paste")}>粘贴文本</button>
                    <button className={impTab === "file" ? "cs on" : "cs"} onClick={() => setImpTab("file")}>上传文件</button>
                    <button className={impTab === "url" ? "cs on" : "cs"} onClick={() => setImpTab("url")}>网址 / 视频</button>
                  </div>

                  {impTab === "paste" && (
                    <>
                      <textarea
                        className="imp-ta"
                        value={impText}
                        onChange={(e) => setImpText(e.target.value)}
                        placeholder="把英文文章、视频字幕、邮件……任何想读的英文内容粘贴到这里"
                      />
                      <div className="imp-row">
                        <button className="btn-pri small" onClick={() => importFromText(impText, "粘贴的文本")}>
                          <BookOpen size={14} /> 开始阅读
                        </button>
                        <span className="imp-hint">长文会按段落自动分章，每章约 350 词，查词和小测只针对当前这一章</span>
                      </div>
                    </>
                  )}

                  {impTab === "file" && (
                    <>
                      <label className="filebtn">
                        {impBusy ? <Loader2 size={15} className="spin" /> : <FileUp size={15} />}
                        {impBusy ? " 解析中…" : " 选择文件（.txt / .md / .docx / .epub）"}
                        <input type="file" accept=".txt,.md,.docx,.epub"
                          style={{ display: "none" }} onChange={handleImportFile} />
                      </label>
                      <p className="imp-hint">EPUB 会按书里的正文顺序整本导入，自动分章。PDF 暂不支持——把文字复制出来，用「粘贴文本」导入即可。</p>
                    </>
                  )}

                  {impTab === "url" && (
                    <>
                      <div className="imp-row">
                        <input
                          className="topic-in imp-url"
                          value={impUrl}
                          onChange={(e) => setImpUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") importFromUrl(); }}
                          placeholder="https://…  文章或视频链接"
                        />
                        <button className="btn-pri small" onClick={importFromUrl} disabled={impBusy}>
                          {impBusy ? <><Loader2 size={14} className="spin" /> 抓取中…</> : "抓取并阅读"}
                        </button>
                      </div>
                      <p className="imp-hint">通过网络搜索抓取公开页面正文；视频会尽力找英文字幕或简介。抓不到时，复制正文用「粘贴文本」最稳。</p>
                    </>
                  )}

                  {impErr && <div className="err">{impErr}</div>}
                </div>
              )}

              {genError && (
                <div className="err">
                  {genError} <button className="lnk" onClick={() => generateArticle()}>重试</button>
                </div>
              )}
              </div>{/* /genbox */}

              {/* ---- AI 现写：单独一类，跟「找真实文章」明确分开 ---- */}
              <div className="aibox">
                <div className="ai-head">
                  <span className="ai-tag"><Sparkles size={13} /> AI 现写</span>
                  <span className="ai-sub">按下面的设定当场写一篇。<b>只写公认的知识</b>，但具体数字、年份可能有出入，别直接引用</span>
                </div>

                <div className="ai-row">
                  <span className="ai-l">主题</span>
                  <input
                    className="topic-in ai-in"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") generateArticle(); }}
                    placeholder="想读什么？留空则由 AI 照着你选的生词自己定"
                  />
                </div>

                <div className="ai-row">
                  <span className="ai-l">难度</span>
                  <div className="ai-chips">
                    {LEVELS.map((l) => (
                      <button
                        key={l.id}
                        className={l.id === level ? "lvt on" : "lvt"}
                        title={l.tag}
                        onClick={() => { setLevel(l.id); setStats((st) => ({ ...st, lv: l.id })); }}
                      >{l.label}</button>
                    ))}
                  </div>
                  <span className="ai-hint">
                    {LEVELS.find((l) => l.id === level)?.tag} · 约 {LEVELS.find((l) => l.id === level)?.words} 词
                  </span>
                </div>

                <div className="ai-row">
                  <span className="ai-l">复习生词</span>
                  <button
                    className={weaveOn ? "wsw on" : "wsw"}
                    onClick={() => setWeaveOn((o) => !o)}
                    aria-pressed={weaveOn}
                    title="把生词本里的词织进文章，在上下文里再见一次"
                  ><i /></button>
                  <span className="ai-hint">
                    {!weaveCands.length
                      ? "生词本还空着——查几个词存起来，之后就能织进文章里复习"
                      : weaveOn
                        ? `已选 ${weavePicked.length} 个，点词可增减（最多 ${WEAVE_MAX} 个）`
                        : "关着，文章不会特意用你的生词"}
                  </span>
                </div>

                {weaveOn && weaveCands.length > 0 && (
                  <div className="wchips">
                    {weaveCands.map((w) => (
                      <button
                        key={w}
                        className={weavePicked.includes(w) ? "wc on" : "wc"}
                        onClick={() => toggleWeave(w)}
                      >{w}</button>
                    ))}
                  </div>
                )}

                <div className="ai-foot">
                  <button className="btn-pri" onClick={() => generateArticle()} disabled={genLoading}>
                    <Sparkles size={16} /> 让 AI 现写一篇
                  </button>
                  <span className="ai-hint">
                    {topic.trim()
                      ? ""
                      : weaveOn && weavePicked.length
                        ? `不限主题，AI 会围绕这 ${weavePicked.length} 个生词找个合适的情境`
                        : "写个主题，或者打开上面的「复习生词」选几个词"}
                  </span>
                </div>
              </div>

              {tabs.length > 0 && (
                <>
                  <div className="sechead"><h2>继续读</h2></div>
                  <div className="cardgrid">
                    {tabs.map((t) => (
                      <button key={t.id} className="ccard" onClick={() => switchTab(t.id)}>
                        <span className={t.srcUrl ? "ctag real" : t.imported ? "ctag" : "ctag ai"}>
                          {t.srcUrl ? "真实来源"
                            : t.imported ? "导入"
                            : `AI · ${LEVELS.find((l) => l.id === t.level)?.label || "现写"}`}
                        </span>
                        <b>{t.title || "未命名"}</b>
                        <p>
                          {t.topic || "未分类"}
                          {" · 约 "}
                          {countWords((t.chapters || []).join(" "))} 词
                        </p>
                        {t.chapters?.length > 1 && (
                          <>
                            <div className="cprog">
                              <i style={{ width: `${(((t.ch || 0) + 1) / t.chapters.length) * 100}%` }} />
                            </div>
                            <div className="cmeta">读到第 {(t.ch || 0) + 1} / {t.chapters.length} 章</div>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* 读过的文章。重读旧文比读新文更能巩固词汇——同一批词在同一个
                  语境里再见一次。本周读过的单独标出来，呼应「周末复习本周」。 */}
              {pastRead.length > 0 && (
                <>
                  <div className="sechead">
                    <h2>读过的</h2>
                    <span className="sec-sub">
                      {weekRead > 0
                        ? `本周读过 ${weekRead} 篇 · 重读一遍比读新的更能记住词`
                        : "重读一遍比读新的更能记住词"}
                    </span>
                  </div>
                  <div className="cardgrid">
                    {pastRead.slice(0, 8).map((h) => (
                      // 卡片本身是 button，删除键不能嵌在里面（按钮套按钮非法），
                      // 所以外面包一层定位容器
                      <div className="ccard-wrap" key={h.id}>
                        <button className="ccard" onClick={() => reread(h)}>
                          <span className={h.srcUrl ? "ctag real" : h.imported ? "ctag" : "ctag ai"}>
                            {h.srcUrl ? "真实来源" : h.imported ? "导入" : `AI · ${LEVELS.find((l) => l.id === h.level)?.label || "现写"}`}
                          </span>
                          <b>{h.title || "未命名"}</b>
                          <p>
                            {h.topic || "未分类"}
                            {" · "}
                            {countWords((h.chapters || []).join(" "))} 词
                          </p>
                          <div className="cmeta">
                            {agoText(h.readAt)}
                            {h.woven?.length ? ` · 织入过 ${h.woven.length} 个生词` : ""}
                          </div>
                        </button>
                        <button className="ccard-x" onClick={() => removeHistory(h.id)}
                          aria-label={`从「读过的」移除《${h.title || "未命名"}》`} title="移除">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="sechead">
                <h2>换个话题试试</h2>
                <div className="sechead-r">
                  <button className="btn-gh"
                    onClick={() => setChips(pickChips(catOf(chipCat).pool))}
                  ><Dices size={14} /> 换一批</button>
                  <button className="btn-gh pri" onClick={() => fetchRealArticle()} disabled={realBusy}>
                    {realBusy
                      ? <><Loader2 size={14} className="spin" /> 搜索中…</>
                      : <><Globe size={14} /> 本类随机一篇</>}
                  </button>
                </div>
              </div>

              <div className="catrow">
                {TOPIC_CATS.map((c) => (
                  <button key={c.id}
                    className={c.id === chipCat ? "cat on" : "cat"}
                    onClick={() => { setChipCat(c.id); setChips(pickChips(c.pool)); setRealErr(""); }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="cardgrid tight">
                {chips.map((c) => (
                  <button key={c} className="ccard" onClick={() => { setTopic(c); fetchRealArticle(c); }}>
                    <b>{c}</b>
                    <p>{catOf(chipCat).name} · 点一下去搜真文章</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ---- 文章 ---- */
            <div className="article">
              <div className="art-bar">
                <button className="btn-gh pri" onClick={toggleReadArticle} disabled={genLoading}>
                  {reading ? <Square size={14} /> : <Play size={14} />}
                  {reading ? "停止朗读" : "朗读全文"}
                </button>
                <button className="btn-gh" onClick={toggleTrans} disabled={genLoading || transBusy}>
                  {transBusy ? <Loader2 size={14} className="spin" /> : <Languages size={14} />}
                  {transBusy ? "翻译中…" : showTrans ? "隐藏中文" : "显示中文"}
                </button>
                <button className="btn-gh" onClick={startShadow} disabled={genLoading || shadow.on}>
                  <RotateCcw size={14} /> 跟读练习
                </button>
                <button className="btn-gh" onClick={startQuiz}
                  disabled={genLoading || quiz.st === "loading" || quiz.st === "on"}>
                  {quiz.st === "loading"
                    ? <><Loader2 size={14} className="spin" /> 出题中…</>
                    : <><ClipboardCheck size={14} /> 做小测</>}
                </button>
                {!article?.imported && (
                  <button className="btn-gh" onClick={() => generateArticle(reTopicOf(article))} disabled={genLoading}>
                    <RefreshCw size={14} /> 换一篇
                  </button>
                )}
              </div>

              {genLoading ? (
                <Skeleton topic={topic || reTopicOf(article)} />
              ) : (
                <>
                  {/* 点词密度给出的难度建议。只提示不自动改——难度改了下一篇
                      才生效，替用户默默改掉会让人莫名其妙。 */}
                  {lvHint && (
                    <div className={lvHint.dir === "down" ? "lvhint hard" : "lvhint easy"}>
                      <span>
                        {lvHint.dir === "down"
                          ? `这篇你点了 ${clicks} 个词，可能偏难了`
                          : `上一篇你几乎没查词，也许可以再难一点`}
                      </span>
                      <span className="lvhint-a">
                        <button className="lvhint-b" onClick={() => {
                          setLevel(lvHint.to);
                          setStats((s) => ({ ...s, lv: lvHint.to }));
                          showToast(`难度已调到「${lvHint.label}」，下一篇生效`);
                          setLvHint(null);
                        }}>调到{lvHint.label}</button>
                        <button className="lvhint-x" onClick={() => setLvHint(null)} aria-label="不用了">
                          <X size={13} />
                        </button>
                      </span>
                    </div>
                  )}
                  <div className="art-meta">
                    {article.srcUrl ? (
                      <>
                        <span className="mtag real"><Globe size={11} /> 真实来源</span>
                        <a className="srclink" href={article.srcUrl} target="_blank" rel="noreferrer">
                          {article.srcSite || hostOf(article.srcUrl)}
                          <ExternalLink size={11} />
                        </a>
                        {article.srcDate && <><span className="dotsep">·</span>{article.srcDate}</>}
                        <span className="dotsep">·</span>约 {curWords} 词
                        <span className="dotsep">·</span>{curMins} 分钟
                      </>
                    ) : article.imported ? (
                      <>
                        <span className="mtag">导入</span>
                        来源「{article.topic}」
                        <span className="dotsep">·</span>约 {curWords} 词
                        <span className="dotsep">·</span>{curMins} 分钟
                      </>
                    ) : (
                      <>
                        <span className="lvsel">
                          <button className="mtag btn" onClick={() => setLvMenu((o) => !o)}>
                            {LEVELS.find((l) => l.id === article.level)?.label}
                            {" "}
                            {article.level}
                            <ChevronDown size={11} />
                          </button>
                          {lvMenu && (
                            <>
                              <div className="popmask" onClick={() => setLvMenu(false)} />
                              <div className="menu">
                                {LEVELS.map((l) => (
                                  <button
                                    key={l.id}
                                    className={l.id === article.level ? "mi on" : "mi"}
                                    onClick={() => { setLvMenu(false); generateArticle(reTopicOf(article), l.id); }}
                                  >
                                    <span>{l.label}</span>
                                    <span className="mi-tag">{l.tag}</span>
                                    {l.id === article.level && <Check size={13} />}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </span>
                        约 {curWords} 词
                        <span className="dotsep">·</span>{curMins} 分钟
                        <span className="mtag ai" title="内容由 AI 现写，不是真实报道，不要当作事实引用">AI 现写</span>
                        <span className="dotsep">·</span>主题「{article.topic}」
                        <span className="dotsep">·</span>
                        <button className="meta-btn"
                          onClick={() => generateArticle(reTopicOf(article), article.level, { newTab: true })}
                          disabled={genLoading}
                        >
                          <Copy size={12} /> 对比一篇
                        </button>
                      </>
                    )}
                  </div>
                  <h2 className="art-title">{article.title}</h2>
                  {chapters.length > 1 && (
                    <div className="chbar">
                      <button className="btn-gh" onClick={() => gotoCh(chIdx - 1)} disabled={chIdx === 0}>
                        <ChevronLeft size={14} /> 上一章
                      </button>
                      <div className="chprog">
                        <span className="chnum">第 {chIdx + 1} / {chapters.length} 章</span>
                        <div className="chtrack">
                          <i style={{ width: `${((chIdx + 1) / chapters.length) * 100}%` }} />
                        </div>
                      </div>
                      <button className="btn-gh" onClick={() => gotoCh(chIdx + 1)}
                        disabled={chIdx === chapters.length - 1}>
                        下一章 <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                  {article.cn_intro && chIdx === 0 && <p className="art-intro">{article.cn_intro}</p>}
                  {article.woven?.length > 0 && (
                    <p className="woven-note">
                      <Brain size={13} /> 本篇织入了你的生词：{article.woven.join("、")}，留意重逢 👀
                    </p>
                  )}
                  <div
                    onMouseUp={() => {
                      setTimeout(() => {
                        try {
                          const sel = window.getSelection();
                          const t = sel ? sel.toString().trim() : "";
                          if (t && t.length >= 8 && (/\s/.test(t) || /[\u4e00-\u9fff]/.test(t))) {
                            const r = sel.getRangeAt(0).getBoundingClientRect();
                            setSelTip({ x: r.left + r.width / 2, y: r.top, text: t });
                          } else setSelTip(null);
                        } catch (e) { setSelTip(null); }
                      }, 0);
                    }}
                    onTouchEnd={() => {
                      setTimeout(() => {
                        try {
                          const sel = window.getSelection();
                          const t = sel ? sel.toString().trim() : "";
                          if (t && t.length >= 8) {
                            const r = sel.getRangeAt(0).getBoundingClientRect();
                            setSelTip({ x: r.left + r.width / 2, y: r.top, text: t });
                          } else setSelTip(null);
                        } catch (e) { setSelTip(null); }
                      }, 60);
                    }}
                  >
                  <ArticleBody
                    content={curText}
                    trans={curTrans}
                    showTrans={showTrans}
                    activeKey={dict.key}
                    savedSurfaces={savedSurfaces}
                    wovenSet={wovenSet}
                    shadowId={
                      shadow.on ? flatSents[shadow.idx]?.id
                      : reading && readIdx >= 0 ? flatSents[readIdx]?.id
                      : null
                    }
                    onWord={(w, sent, key) => lookup(w, sent, key)}
                  />
                  </div>
                  {/* 读后动作 */}
                  {chIdx < chapters.length - 1 && (
                    <div className="after-row">
                      <button className="btn-soft" onClick={() => gotoCh(chIdx + 1)}>
                        下一章 <ChevronRight size={15} />
                      </button>
                    </div>
                  )}

                  {quiz.st === "err" && (
                    <div className="err">出题失败了。<button className="lnk" onClick={startQuiz}>重试</button></div>
                  )}
                  {(quiz.st === "on" || quiz.st === "done") && (
                    <QuizBlock quiz={quiz} onPick={pickOption} onNext={nextQuestion}
                      onRetryArticle={() => generateArticle(reTopicOf(article))}
                      onSaveMissed={saveMissedWords} savedKeys={savedKeys} />
                  )}

                </>
              )}
              {genError && (
                <div className="err">
                  {genError} <button className="lnk" onClick={() => generateArticle(reTopicOf(article))}>重试</button>
                </div>
              )}
            </div>
              )}
            </>
          )}
        </section>

        {/* ======= 右：词典面板 ======= */}
        <aside className={dictOpen ? "dictwrap open" : "dictwrap"}>
          <div className="dict">
            <button className="dict-close" onClick={closeDict} aria-label="收起词典">
              <X size={16} />
            </button>

            {/* 面板内也留一个查词框：手机上词典是底部抽屉，够不着顶栏那个 */}
            <div className="dsearch">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                placeholder="查词 / 翻译句子"
                aria-label="查词"
              />
            </div>

            {dict.status === "idle" && (
              <div className="dict-idle">
                <div className="dict-idle-mark">007</div>
                <p>点击文中任意单词查词</p>
                <p className="mut">顶部搜索框支持中英互查</p>
              </div>
            )}

            {dict.status === "loading" && (
              <div className="dict-load">
                <span className="hw">{dict.sentMode ? "整句解析" : dict.term}</span>
                <Loader2 size={18} className="spin" />
                <span className="mut">{dict.sentMode ? "拆句中…" : "查询中…"}</span>
              </div>
            )}

            {dict.status === "error" && (
              <div className="dict-load">
                <span className="hw">{dict.term}</span>
                <span className="mut">{dict.msg || "查询失败了。"}</span>
                <button className="lnk" onClick={() =>
                  dict.trFail ? translateText(dict.trFail)
                  : dict.sentFail ? analyzeSentence(dict.sentFail)
                  : retryLookup()
                }>重试</button>
              </div>
            )}

            {dict.status === "ok" && dict.data.type === "en" && (
              <>
                <EnCard
                  d={dict.data}
                  meta={dict.meta}
                  sent={dict.sent}
                  onAnalyze={() => analyzeSentence(dict.sent)}
                  onSpeak={speak}
                  saved={dictIsSaved}
                  onSave={saveCurrent}
                  onCtx={fetchContext}
                  ctxBusy={ctxBusy}
                />
                <WordChat
                  word={wchat.word}
                  msgs={wchat.msgs}
                  busy={wchat.busy}
                  onAsk={askWord}
                  onAdd={addChatWord}
                  onSpeak={speak}
                  savedKeys={savedKeys}
                />
              </>
            )}

            {dict.status === "ok" && dict.data.type === "tr" && (
              <TrCard d={dict.data} onSpeak={speak} />
            )}

            {dict.status === "ok" && dict.data.type === "zh" && (
              <ZhCard d={dict.data} onSpeak={speak} saved={dictIsSaved} onSave={saveCurrent} />
            )}

            {dict.status === "ok" && dict.data.type === "sent" && (
              <SentCard d={dict.data} onSpeak={speak} onBack={backToWord} />
            )}
          </div>
        </aside>
        </main>
      </div>

      {!dictOpen && (
        <button className={prefs.dictOff ? "dict-fab show" : "dict-fab"}
          onClick={openDict} aria-label="打开词典">
          <Search size={18} />
        </button>
      )}

      {selTip && (
        <button
          className="seltip"
          style={{ left: selTip.x, top: Math.max(8, selTip.y - 42) }}
          onClick={() => translateText(selTip.text)}
        >
          <Languages size={13} /> 译
        </button>
      )}

      {/* ======= 跟读控制条 ======= */}
      {shadow.on && (
        <div className="shadowbar">
          <span className="sb-idx">{shadow.idx + 1}/{flatSents.length}</span>
          <span className="sb-hint">{shadow.waiting ? "跟读一遍，然后下一句 →" : "听…"}</span>
          <button className="sb-btn" onClick={() => playShadow(shadow.idx, shadow.slow)} aria-label="重听">
            <RotateCcw size={15} />
          </button>
          <button
            className={shadow.slow ? "sb-btn on" : "sb-btn"}
            onClick={() => {
              const slow = !shadow.slow;
              setShadow((x) => ({ ...x, slow }));
              playShadow(shadow.idx, slow);
            }}
            aria-label="慢速"
            title="慢速"
          ><Turtle size={15} /></button>
          <button className="sb-btn pri" onClick={() => advanceShadow(shadow.idx, shadow.slow)}>
            下一句 <ChevronRight size={15} />
          </button>
          <button className="sb-btn" onClick={exitShadow} aria-label="退出跟读"><X size={15} /></button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------- API Key 设置页 ---------- */

function SetupView({
  hasKey, providerDraft, onPickProvider, keyDraft, setKeyDraft,
  modelDraft, setModelDraft, showToast, onSave, onClear, onBack,
}) {
  const p = providerOf(providerDraft);
  const [models, setModels] = useState([]);
  const [listBusy, setListBusy] = useState(false);
  const [filter, setFilter] = useState("");

  // 换服务商后，上一家的模型列表就没意义了
  useEffect(() => { setModels([]); setFilter(""); }, [providerDraft]);

  async function loadModels() {
    const k = keyDraft.trim();
    if (!k) { showToast("请先粘贴 API Key"); return; }
    setListBusy(true);
    try {
      const list = await fetchModels(k, providerDraft);
      setModels(list);
      showToast(list.length ? `找到 ${list.length} 个可用模型` : "没有拿到模型列表");
    } catch (e) {
      showToast(errText(e, providerDraft));
    } finally {
      setListBusy(false);
    }
  }

  const shown = filter.trim()
    ? models.filter((m) => m.toLowerCase().includes(filter.trim().toLowerCase()))
    : models;

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-head"><KeyRound size={20} /> 连接模型服务</div>
        <p className="setup-sub">
          先选一家模型服务商，填上它的 API Key 就能用。密钥只存在这台电脑的浏览器里，
          不会发到你选的这家服务商以外的任何地方。每家的密钥分开保存，随时可以切换。
        </p>

        <p className="setup-l">选择服务商</p>
        <div className="prov-grid">
          {PROVIDER_IDS.map((id) => (
            <button
              key={id}
              className={id === providerDraft ? "prov-chip on" : "prov-chip"}
              onClick={() => onPickProvider(id)}
            >
              {PROVIDERS[id].name}
              {!PROVIDERS[id].proxy && <span className="prov-tag">免代理</span>}
            </button>
          ))}
        </div>
        <p className="setup-note" style={{ marginTop: 12 }}>{p.blurb}</p>

        <p className="setup-l">
          API Key（去 <b>{p.site}</b> 注册后创建，格式类似 <code>{p.keyHint}</code>）
        </p>
        <div className="setup-row">
          <input
            className="setup-in"
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={p.keyHint}
            aria-label="API Key"
          />
        </div>

        <p className="setup-l">模型（留空则用默认的 {p.defaultModel}）</p>
        <div className="setup-row">
          <input
            className="setup-in mono"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
            placeholder={p.defaultModel}
          />
          {p.modelsUrl && (
            <button className="btn-gh" onClick={loadModels} disabled={listBusy}>
              {listBusy ? "获取中…" : "获取可用模型"}
            </button>
          )}
          <button className="btn-pri" onClick={onSave}>保存并开始</button>
        </div>

        {models.length > 0 && (
          <div className="model-box">
            <input
              className="setup-in"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="输入关键词筛选，比如 deepseek"
              aria-label="筛选模型"
            />
            <div className="model-list">
              {shown.slice(0, 300).map((m) => (
                <button
                  key={m}
                  className={m === modelDraft ? "model-item on" : "model-item"}
                  onClick={() => setModelDraft(m)}
                >{m}</button>
              ))}
              {shown.length === 0 && <p className="setup-note">没有匹配的模型名。</p>}
            </div>
          </div>
        )}

        <p className="setup-note">
          不确定填哪个模型时，先填好 Key 点「获取可用模型」，列表是从服务商那里实时取的，
          点一下就能选中。{p.proxy ? "这家服务商在国内需要先开启代理。" : "这家服务商国内可以直接连，不用代理。"}
        </p>

        {hasKey && (
          <div className="setup-acts">
            <button className="btn-gh" onClick={onBack}>返回</button>
            <button className="btn-gh danger-t" onClick={onClear}>清除这家的密钥</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 标签页栏 ---------- */

/* ---------- 文章正文（分句 + 可点击单词 + 跟读高亮） ---------- */

function ArticleBody({ content, trans, showTrans, onWord, activeKey, savedSurfaces, wovenSet, shadowId }) {
  const paras = content.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const tokenRe = /([A-Za-z]+(?:['’-][A-Za-z]+)*)/;
  return (
    <div className="art-body">
      {paras.map((para, pi) => (
        <div className="pwrap" key={pi}>
        <p>
          {splitSentences(para).map((sent, si) => {
            const sid = `${pi}-${si}`;
            const parts = sent.split(new RegExp(tokenRe, "g"));
            return (
              <span
                key={si}
                id={"sen-" + sid}
                className={"sen" + (shadowId === sid ? " on" : "")}
              >
                {parts.map((tk, ti) => {
                  if (!tokenRe.test(tk) || !/[A-Za-z]/.test(tk)) {
                    return <span key={ti}>{tk}</span>;
                  }
                  const low = tk.toLowerCase();
                  const key = `${pi}-${si}-${ti}`;
                  const isWov = [...wovenSet].some(
                    (w) => low === w || low.startsWith(w)
                  );
                  const cls =
                    "w" +
                    (activeKey === key ? " act" : "") +
                    (savedSurfaces.has(low) ? " sav" : "") +
                    (isWov ? " wov" : "");
                  return (
                    <span
                      key={ti}
                      className={cls}
                      role="button"
                      tabIndex={0}
                      onClick={() => onWord(tk, sent.trim(), key)}
                      onKeyDown={(e) => { if (e.key === "Enter") onWord(tk, sent.trim(), key); }}
                    >{tk}</span>
                  );
                })}
              </span>
            );
          })}
        </p>
        {showTrans && trans && trans[pi] ? (
          <p className="para-cn">{trans[pi]}</p>
        ) : null}
        </div>
      ))}
    </div>
  );
}

/* ---------- 词典卡片：英→中 ---------- */

function EnCard({ d, meta, sent, onAnalyze, onSpeak, saved, onSave, onCtx, ctxBusy }) {
  return (
    <div className="card">
      {meta?.saved && (
        <div className="meetb"><Brain size={12} /> 你的生词 · 第 {meta.meet} 次见面</div>
      )}
      {/* 同一个词查到第二次，基本可以断定是真不认识。此刻你正看着释义，
          提醒一句不算打断——比让你在读得投入时自己想起来按收藏靠谱得多。 */}
      {!meta?.saved && meta?.seen >= 2 && (
        <div className="nudge">
          <span><Brain size={12} /> 这个词你查过 {meta.seen} 次了</span>
          <button className="nudge-b" onClick={onSave}>收进生词本</button>
        </div>
      )}
      <div className="hw">{d.word}</div>
      <div className="phon-row">
        {d.phonetic_us && (
          <button className="phon" onClick={() => onSpeak(d.word, "en-US")}>
            <span className="phon-l">美</span> {d.phonetic_us} <Volume2 size={13} />
          </button>
        )}
        {d.phonetic_uk && (
          <button className="phon" onClick={() => onSpeak(d.word, "en-GB")}>
            <span className="phon-l">英</span> {d.phonetic_uk} <Volume2 size={13} />
          </button>
        )}
        {!d.phonetic_us && !d.phonetic_uk && (
          <button className="phon" onClick={() => onSpeak(d.word, "en-US")}>
            <Volume2 size={13} /> 发音
          </button>
        )}
      </div>

      {d.context_cn && (
        <div className="ctx">
          <span className="ctx-l">语境</span>
          {d.context_cn}
        </div>
      )}

      {/* 词条来自本地（生词本或缓存），没花 API，也就没有这句话的语境。
          想看就点，点了才发一次请求。 */}
      {!d.context_cn && sent && meta?.local && (
        <button className="ctxbtn" onClick={onCtx} disabled={ctxBusy}>
          {ctxBusy
            ? <><Loader2 size={13} className="spin" /> 正在看这句…</>
            : <><Sparkles size={13} /> 看它在这句里是什么意思</>}
        </button>
      )}

      {sent && (
        <button className="sentbtn" onClick={onAnalyze}>
          <Puzzle size={14} /> 解析这句话
        </button>
      )}

      <ul className="senses">
        {(d.senses || []).map((s, i) => (
          <li key={i}>
            <i className="pos">{s.pos}</i>
            <span>{s.cn}</span>
          </li>
        ))}
      </ul>

      {/* 计算机领域的专门含义。放在释义之后而不是之前：手机抽屉只有 64vh，
          彩色块堆在上面会把释义挤出首屏，而释义才是查词的主角。
          日常词模型返回 null，整块不渲染——挂一行「无特殊含义」纯属噪音。 */}
      {d.tech_cn && (
        <div className="ctx tech">
          <span className="ctx-l tech-l">计算机</span>
          {d.tech_cn}
        </div>
      )}

      {d.examples?.length > 0 && (
        <div className="exs">
          <div className="sec-l">例句</div>
          {d.examples.map((ex, i) => (
            <div className="ex" key={i}>
              <p className="ex-en">
                <Boldify text={ex.en} word={d.word} />
                <button className="ex-sp" onClick={() => onSpeak(ex.en, "en-US", 0.9)} aria-label="朗读例句">
                  <Volume2 size={12} />
                </button>
              </p>
              <p className="ex-cn">{ex.cn}</p>
            </div>
          ))}
        </div>
      )}

      <button className={saved ? "btn-save on" : "btn-save"} onClick={onSave}>
        {saved ? <Check size={15} /> : <Plus size={15} />}
        {saved ? "已在生词本 · 点击移除" : "加入生词本"}
      </button>
    </div>
  );
}

/* ---------- 词典卡片：中→英 ---------- */

function ZhCard({ d, onSpeak, saved, onSave }) {
  return (
    <div className="card">
      <div className="hw">{d.input}</div>
      <div className="trans">
        {(d.translations || []).map((t, i) => (
          <div className="tr" key={i}>
            <div className="tr-top">
              <span className="tr-en serif">{t.en}</span>
              {t.phonetic_us && <span className="tr-ph">{t.phonetic_us}</span>}
              <button className="ex-sp" onClick={() => onSpeak(t.en, "en-US")} aria-label="发音">
                <Volume2 size={12} />
              </button>
              {t.pos && <i className="pos">{t.pos}</i>}
            </div>
            {t.note && <p className="tr-note">{t.note}</p>}
          </div>
        ))}
      </div>

      {d.examples?.length > 0 && (
        <div className="exs">
          <div className="sec-l">例句</div>
          {d.examples.map((ex, i) => (
            <div className="ex" key={i}>
              <p className="ex-en">
                {ex.en}
                <button className="ex-sp" onClick={() => onSpeak(ex.en, "en-US", 0.9)} aria-label="朗读例句">
                  <Volume2 size={12} />
                </button>
              </p>
              <p className="ex-cn">{ex.cn}</p>
            </div>
          ))}
        </div>
      )}

      <button className={saved ? "btn-save on" : "btn-save"} onClick={onSave}>
        {saved ? <Check size={15} /> : <Plus size={15} />}
        {saved ? "已在生词本 · 点击移除" : "加入生词本"}
      </button>
    </div>
  );
}

/* ---------- 翻译卡片 ---------- */

function TrCard({ d, onSpeak }) {
  const enSrc = d.dir === "en2zh";
  return (
    <div className="card">
      <div className="sec-l">原文</div>
      <p className={enSrc ? "tr-src serif" : "tr-src"}>
        {d.src}
        {enSrc && (
          <button className="ex-sp" onClick={() => onSpeak(d.src, "en-US", 0.92)} aria-label="朗读原文">
            <Volume2 size={12} />
          </button>
        )}
      </p>
      <div className="sec-l" style={{ marginTop: 12 }}>译文</div>
      <p className={enSrc ? "tr-dst" : "tr-dst serif"}>
        {d.dst}
        {!enSrc && (
          <button className="ex-sp" onClick={() => onSpeak(d.dst, "en-US", 0.92)} aria-label="朗读译文">
            <Volume2 size={12} />
          </button>
        )}
      </p>
      {d.trunc && <p className="imp-hint" style={{ marginTop: 8 }}>内容较长，已截取前段翻译。</p>}
      {d.note && (
        <div className="ctx" style={{ marginTop: 12 }}>
          <span className="ctx-l">要点</span>
          {d.note}
        </div>
      )}
    </div>
  );
}

/* ---------- 词卡追问对话 ---------- */

const QUICK_QS = ["近义词", "反义词", "引申含义", "常见搭配", "词源记忆"];

function WordChat({ word, msgs, busy, onAsk, onAdd, onSpeak, savedKeys }) {
  const [q, setQ] = useState("");
  if (!word) return null;
  const send = () => {
    if (!q.trim()) return;
    onAsk(q);
    setQ("");
  };
  return (
    <div className="wchat">
      <div className="sec-l">问问它</div>
      <div className="wc-chips">
        {QUICK_QS.map((c) => (
          <button key={c} className="chip" disabled={busy}
            onClick={() => onAsk(`${word} 的${c}是什么？`)}>{c}</button>
        ))}
      </div>

      {msgs.map((m, i) =>
        m.role === "q" ? (
          <p className="wc-q" key={i}>{m.t}</p>
        ) : (
          <div className="wc-a" key={i}>
            <p>{m.t}</p>
            {m.words?.length > 0 && (
              <div className="wc-words">
                {m.words.map((cw, j) => (
                  <span className="wcw" key={j}>
                    <b className="serif">{cw.w}</b>
                    {cw.p && <i>{cw.p}</i>}
                    <span>{cw.cn}</span>
                    <button className="ex-sp" onClick={() => onSpeak(cw.w, "en-US")} aria-label="发音">
                      <Volume2 size={11} />
                    </button>
                    <button
                      className="wcw-add"
                      onClick={() => onAdd(cw)}
                      aria-label="加入生词本"
                    >{savedKeys.has((cw.w || "").toLowerCase()) ? <Check size={12} /> : <Plus size={12} />}</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      )}
      {busy && <p className="wc-a mut"><Loader2 size={13} className="spin" /> 想想…</p>}

      <div className="wc-in">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={`关于 ${word}，随便问`}
          disabled={busy}
        />
        <button className="wc-send" onClick={send} disabled={busy}>问</button>
      </div>
    </div>
  );
}

/* ---------- 整句解析卡片 ---------- */

function SentCard({ d, onSpeak, onBack }) {
  return (
    <div className="card">
      <button className="backbtn" onClick={onBack}><ChevronLeft size={14} /> 返回单词</button>
      <p className="sent-src serif">
        {d.sentence}
        <button className="ex-sp" onClick={() => onSpeak(d.sentence, "en-US", 0.9)} aria-label="朗读">
          <Volume2 size={12} />
        </button>
      </p>

      <div className="sec-l">句子结构</div>
      <div className="parts">
        {(d.parts || []).map((p, i) => (
          <div className="part" key={i}>
            <span className="part-r">{p.r}</span>
            <span className="part-t serif">{p.t}</span>
          </div>
        ))}
      </div>

      {d.grammar && (
        <div className="ctx" style={{ marginTop: 12 }}>
          <span className="ctx-l">语法</span>
          {d.grammar}
        </div>
      )}

      <div className="sec-l" style={{ marginTop: 12 }}>翻译</div>
      <p className="sent-cn">{d.translation}</p>
    </div>
  );
}

/* ---------- 读后小测 ---------- */

function QuizBlock({ quiz, onPick, onNext, onRetryArticle, onSaveMissed, savedKeys }) {
  if (quiz.st === "done") {
    const total = quiz.qs.length;
    return (
      <div className="quiz">
        <div className="quiz-done">
          <div className="quiz-score">
            {quiz.score === total ? "🎉" : quiz.score >= total - 1 ? "👍" : "💪"} 答对 {quiz.score} / {total}
          </div>
          {quiz.adj?.dir === "up" && (
            <p className="quiz-adj up">全对！难度已升到「{quiz.adj.label} · {quiz.adj.tag}」，下一篇生效</p>
          )}
          {quiz.adj?.dir === "down" && (
            <p className="quiz-adj down">我们放缓一点，难度已调到「{quiz.adj.label} · {quiz.adj.tag}」，稳扎稳打</p>
          )}
          {!quiz.adj && <p className="quiz-adj">这个难度刚刚好，保持！</p>}

          {/* 答错的词单独列出来。这是全应用最硬的一条证据——不是"你点过它"，
              是"你确实答错了"，不收进生词本等于白测一场。 */}
          {(quiz.missed || []).length > 0 && (
            <div className="missed">
              <div className="missed-t">这几个词答错了，收进生词本？</div>
              <div className="missed-ws">
                {quiz.missed.map((m) => (
                  <span className="missed-w" key={m.w}>
                    <b>{m.w}</b>{m.cn ? ` · ${m.cn}` : ""}
                    {savedKeys?.has(m.w.toLowerCase()) && <i className="missed-ok">已在本子里</i>}
                  </span>
                ))}
              </div>
              <button className="btn-pri small" onClick={() => onSaveMissed(quiz.missed)}>
                <Plus size={14} /> 全部收进生词本
              </button>
            </div>
          )}

          <button className="btn-soft" onClick={onRetryArticle}>
            <RefreshCw size={14} /> 按新难度再来一篇
          </button>
        </div>
      </div>
    );
  }
  const q = quiz.qs[quiz.i];
  return (
    <div className="quiz">
      <div className="quiz-head">
        <ClipboardCheck size={15} /> 读后小测 <span className="mut">{quiz.i + 1} / {quiz.qs.length}</span>
      </div>
      <p className="quiz-q">{q.q}</p>
      <div className="qopts">
        {q.options.map((op, oi) => {
          let cls = "qopt";
          if (quiz.sel !== null) {
            if (oi === q.answer) cls += " right";
            else if (oi === quiz.sel) cls += " wrong";
            else cls += " dim";
          }
          return (
            <button key={oi} className={cls} onClick={() => onPick(oi)}>
              <span className="qletter">{"ABCD"[oi]}</span> {op}
            </button>
          );
        })}
      </div>
      {quiz.sel !== null && (
        <div className="qexp">
          {quiz.sel === q.answer ? "✅ 答对了！" : "❌ 正确答案是 " + "ABCD"[q.answer] + "。"}
          {q.explain}
          <button className="btn-soft small" onClick={onNext}>
            {quiz.i + 1 < quiz.qs.length ? "下一题" : "查看结果"} <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- 复习模式 ---------- */

function ReviewView({ rev, vocab, onSpeak, onFlip, onAnswer, onExit, onRead }) {
  if (!rev) {
    return (
      <div className="rvw">
        <button className="backbtn" onClick={onExit}><ChevronLeft size={14} /> 返回生词本</button>
        <p className="mut" style={{ marginTop: 20 }}>没有正在进行的复习。</p>
      </div>
    );
  }
  if (rev.i >= rev.queue.length) {
    return (
      <div className="rvw">
        <div className="rvw-done">
          <div className="rvw-emoji">🎉</div>
          <h2>今日复习完成！</h2>
          <p className="mut">记住了 {rev.ok} 个 · 还不熟 {rev.ng} 个{rev.ng > 0 ? "（它们很快会再来见你）" : ""}</p>
          <div className="rvw-acts">
            <button className="btn-soft" onClick={onExit}><BookOpen size={15} /> 返回生词本</button>
            <button className="btn-pri" onClick={onRead}><Sparkles size={15} /> 读一篇织入生词的新文章</button>
          </div>
        </div>
      </div>
    );
  }
  const key = rev.queue[rev.i];
  const v = vocab.find((x) => x.key === key);
  if (!v) {
    return (
      <div className="rvw">
        <div className="flipcard">
          <p className="mut">这个词刚被移除了。</p>
          <button className="btn-soft" style={{ marginTop: 14 }} onClick={() => onAnswer(true)}>
            跳过 <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }
  const d = v.data;
  const en = d.type === "en";
  return (
    <div className="rvw">
      <div className="rvw-top">
        <button className="backbtn" onClick={onExit}><ChevronLeft size={14} /> 退出</button>
        <span className="mut">{rev.i + 1} / {rev.queue.length}</span>
      </div>
      <div className="rvw-bar"><i style={{ width: `${(rev.i / rev.queue.length) * 100}%` }} /></div>

      <div className="flipcard">
        <div className="fc-front">
          <div className="fc-word">{en ? d.word : d.input}</div>
          {en && (
            <button className="phon" onClick={() => onSpeak(d.word, "en-US")}>
              {d.phonetic_us || ""} <Volume2 size={13} />
            </button>
          )}
        </div>

        {rev.flip ? (
          <div className="fc-back">
            {en ? (
              <>
                <ul className="senses tight">
                  {(d.senses || []).slice(0, 3).map((s, i) => (
                    <li key={i}><i className="pos">{s.pos}</i><span>{s.cn}</span></li>
                  ))}
                </ul>
                {/* 只放在翻面之后。放正面等于直接把答案给出去了，
                    这张卡的规矩是「先回想、再对答案」。 */}
                {d.tech_cn && (
                  <div className="ctx tech fc-tech">
                    <span className="ctx-l tech-l">计算机</span>
                    {d.tech_cn}
                  </div>
                )}
                {d.examples?.[0] && (
                  <p className="vb-ex" style={{ marginTop: 10 }}>
                    <Boldify text={d.examples[0].en} word={d.word} />
                    <span className="vb-ex-cn"> — {d.examples[0].cn}</span>
                  </p>
                )}
              </>
            ) : (
              (d.translations || []).map((t, i) => (
                <div className="vb-tr" key={i}>
                  <span className="serif"><b>{t.en}</b></span>
                  {t.phonetic_us && <span className="tr-ph">{t.phonetic_us}</span>}
                  <button className="ex-sp" onClick={() => onSpeak(t.en, "en-US")} aria-label="发音">
                    <Volume2 size={12} />
                  </button>
                </div>
              ))
            )}
            <div className="fc-btns">
              <button className="fc-ng" onClick={() => onAnswer(false)}>😵 还不熟</button>
              <button className="fc-ok" onClick={() => onAnswer(true)}>✅ 记住了</button>
            </div>
          </div>
        ) : (
          <button className="fc-flip" onClick={onFlip}>想好意思了？点开看释义</button>
        )}
      </div>
    </div>
  );
}

/* ---------- 统计面板 ---------- */

/* ---------- 情景对话 ---------- */

function TalkView({ talk, dueCount, level, onStart, onSend, onExit, onSetDraft, onSpeak }) {
  const endRef = useRef(null);
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [talk.msgs.length, talk.busy]);

  if (!talk.scene) {
    return (
      <div className="talk">
        <h2 className="vb-t"><MessagesSquare size={19} /> 情景对话</h2>
        <p className="vb-sub">
          挑个场景，AI 扮演对方跟你一来一回。你说得不地道时它不会打断，
          会在回复下面给一句更自然的说法。
          {dueCount > 0 && <> 它还会顺手用上你今天要复习的词。</>}
        </p>
        <div className="scenes">
          {SCENES.map((s) => (
            <button key={s.id} className="scene" onClick={() => onStart(s)}>
              <span className="scene-i">{s.icon}</span>
              <b>{s.label}</b>
              <span className="scene-r">AI 扮演{s.role}</span>
            </button>
          ))}
        </div>
        <p className="talk-note">
          按你当前的难度「{level?.label || "基础"}」说话，不会超纲。练完随时能换场景。
        </p>
      </div>
    );
  }

  return (
    <div className="talk">
      <div className="talk-head">
        <span className="talk-scene">{talk.scene.icon} {talk.scene.label}</span>
        <button className="btn-gh small" onClick={onExit}><X size={14} /> 换个场景</button>
      </div>

      <div className="talk-body">
        {talk.msgs.map((m, i) => (
          m.role === "u" ? (
            <div className="bub u" key={i}>{m.t}</div>
          ) : (
            <div className="bub-wrap" key={i}>
              <div className="bub a">
                {m.t}
                <button className="bub-sp" onClick={() => onSpeak(m.t, "en-US", 0.95)} aria-label="朗读">
                  <Volume2 size={13} />
                </button>
              </div>
              {m.cn && <div className="bub-cn">{m.cn}</div>}
              {m.used?.length > 0 && (
                <div className="bub-used">用到你在复习的：{m.used.join(" · ")}</div>
              )}
              {m.fix && (
                <div className="fix">
                  <span className="fix-l">更地道</span>
                  <b>{m.fix}</b>
                  {m.why && <span className="fix-why">{m.why}</span>}
                </div>
              )}
            </div>
          )
        ))}
        {talk.busy && <div className="bub a busy"><Loader2 size={14} className="spin" /> 正在想…</div>}
        <div ref={endRef} />
      </div>

      <div className="talk-in">
        <input
          value={talk.draft}
          onChange={(e) => onSetDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) onSend(talk.draft); }}
          placeholder="用英文回他一句…"
          disabled={talk.busy}
        />
        <button className="btn-pri small" onClick={() => onSend(talk.draft)} disabled={talk.busy || !talk.draft.trim()}>
          <Send size={15} /> 发送
        </button>
      </div>
      <p className="talk-note"><CornerDownLeft size={12} /> 回车发送。说错不要紧，改进版会跟在它的回复下面。</p>
    </div>
  );
}

function StatsView({ stats, streak, vocab = [], vocabCount, dueCount, level, onGoReview }) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const e = stats.log[dateStr(d)] || {};
    days.push({
      label: d.getDate(),
      val: (e.a || 0) + (e.q || 0) + (e.r || 0) + (e.t || 0),
      m: typeof e.m === "number" ? e.m : null,
      today: i === 0,
    });
  }
  const max = Math.max(1, ...days.map((d) => d.val));

  const mastered = vocab.filter(isMastered).length;
  const learning = vocabCount - mastered;

  /* 没记快照的日子沿用上一个已知值——那几天不是"掌握了 0 个"，
     是没打开过应用。缺口两端都没有数据时才留空。 */
  let carry = null;
  const mDays = days.map((d) => {
    if (d.m !== null) carry = d.m;
    return { ...d, mv: carry };
  });
  const mMax = Math.max(1, ...mDays.map((d) => d.mv || 0));
  const hasCurve = mDays.some((d) => d.mv !== null);
  const empty = (stats.total || 0) === 0 && vocabCount === 0;

  return (
    <div className="stats">
      <h2 className="vb-t"><BarChart3 size={19} /> 学习统计</h2>

      {empty ? (
        <div className="vb-empty">
          <div className="dict-idle-mark">007</div>
          <p>读完第一篇文章，这里就会热闹起来 🌱</p>
        </div>
      ) : (
        <>
          <div className="st-cards">
            <div className="st-card">
              <span className="st-n"><Flame size={17} /> {streak}</span>
              <span className="st-l">连续天数</span>
            </div>
            <div className="st-card">
              <span className="st-n">{learning}</span>
              <span className="st-l">学习中</span>
            </div>
            <div className="st-card">
              <span className="st-n master">{mastered}</span>
              <span className="st-l">已掌握</span>
            </div>
            <button className="st-card go" onClick={onGoReview}>
              <span className="st-n">{dueCount}</span>
              <span className="st-l">待复习 →</span>
            </button>
          </div>

          <div className="st-chart">
            <div className="sec-l">最近 14 天活跃（读文 + 小测 + 复习 + 对话）</div>
            <div className="bars">
              {days.map((d, i) => (
                <div className="barcol" key={i} title={`${d.label}日：${d.val} 次`}>
                  <div
                    className={d.today ? "bar today" : "bar"}
                    style={{ height: `${Math.max(4, (d.val / max) * 74)}px`, opacity: d.val ? 1 : 0.25 }}
                  />
                  <span className="bar-l">{i % 3 === 0 || d.today ? d.label : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {hasCurve && (
            <div className="st-chart">
              <div className="sec-l">已掌握词数（连对 {MASTER_STREAK} 次即算掌握）</div>
              <div className="bars">
                {mDays.map((d, i) => (
                  <div className="barcol" key={i} title={d.mv === null ? `${d.label}日：无记录` : `${d.label}日：掌握 ${d.mv} 个`}>
                    <div
                      className={d.today ? "bar mbar today" : "bar mbar"}
                      style={{ height: `${Math.max(4, ((d.mv || 0) / mMax) * 74)}px`, opacity: d.mv === null ? 0.18 : 1 }}
                    />
                    <span className="bar-l">{i % 3 === 0 || d.today ? d.label : ""}</span>
                  </div>
                ))}
              </div>
              <p className="st-note">这条曲线从你装上这个版本那天开始记，之前的日子补不出来。</p>
            </div>
          )}

          {level && (
            <p className="st-lv">当前难度：<b>{level.label}</b>（{level.tag}）— 读后小测会自动帮你升降档</p>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- 生词本 ---------- */

/* ---- 教材推荐 ---- */
function BooksView({ books, busy, err, curLevel, onLoad, onRead, readBusy, readErr, cached }) {
  // 只在本页选难度，不改全局设置——来看看别的水平有什么，不该顺手把阅读难度也改了
  const [lv, setLv] = useState(curLevel);
  const [q, setQ] = useState("");
  const cur = LEVELS.find((l) => l.id === lv) || LEVELS[1];
  const all = (books && books.items) || [];

  // 筛选全在本地做，索引已经在手上了，敲字不发任何请求
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all
      .filter((x) => x.lv === lv)
      .filter((x) => !kw || (x.title + " " + x.book + " " + x.author).toLowerCase().includes(kw))
      .sort((x, y) => x.words - y.words);
  }, [all, lv, q]);

  const counts = useMemo(() => {
    const m = {};
    for (const x of all) m[x.lv] = (m[x.lv] || 0) + 1;
    return m;
  }, [all]);

  return (
    <div className="books">
      <div className="vb-head">
        <h2 className="vb-t"><GraduationCap size={19} /> 教材库</h2>
        {all.length > 0 && <span className="vb-n">{list.length} / {all.length} 篇</span>}
      </div>

      <div className="bk-bar">
        <span className="ai-l">难度</span>
        <div className="ai-chips">
          {LEVELS.map((l) => (
            <button key={l.id} className={l.id === lv ? "lvt on" : "lvt"}
              onClick={() => setLv(l.id)}>
              {l.label}{counts[l.id] ? <span className="lvt-n">{counts[l.id]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="bk-bar bk-q">
        <span className="ai-l">筛选</span>
        <input
          className="bk-in"
          value={q}
          placeholder="按标题、作者、书名筛（不联网）"
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-gh small" onClick={() => onLoad(true)} disabled={busy}>
          {busy ? <><Loader2 size={15} className="spin" /> 更新中…</> : <><RefreshCw size={15} /> 更新清单</>}
        </button>
      </div>

      <p className="bk-hint">{cur.tag} · {cur.spec}</p>

      <details className="bk-note">
        <summary>这些材料是哪来的</summary>
        <p>
          全部是<b>版权已过期的公版文学</b>（伊索寓言、格林/安徒生童话、爱丽丝、丛林之书、
          汤姆索亚、福尔摩斯、欧亨利短篇、圣诞颂歌、傲慢与偏见）和
          <b>Simple English Wikipedia</b>（CC BY-SA 4.0）。每篇都标了作者、出处和许可，
          点开能核对。
        </p>
        <p>
          语料随应用一起发布，从 jsDelivr 取，<b>国内直连可用，不需要代理</b>。
          这是刻意的选择：能实时抓的第三方站要么国内连不上，要么不放行跨域，没有交集。
        </p>
        <p>
          难度按来源类型定区间、再用可读性指标（句长、长词比例）在区间内选一档。
          点「取来读」会把正文取回来<b>存在本地</b>，之后离线也能读，
          和你自己导入的文章一样能点词查词、做小测。
        </p>
      </details>

      {err && <div className="err">{err}</div>}
      {readErr && <div className="err">{readErr}</div>}

      {all.length === 0 && !busy && !err && (
        <div className="vb-empty">
          <div className="dict-idle-mark">007</div>
          <p>正在取教材清单…</p>
        </div>
      )}

      {all.length > 0 && list.length === 0 && (
        <div className="vb-empty">
          <p>这个难度下没有匹配「{q}」的篇目，换个词或换个难度</p>
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="bk-list">
            {list.map((b) => {
              const saved = cached[b.id] > 0;
              return (
                <div className="bk-card" key={b.id}>
                  <div className="bk-top">
                    <h3 className="bk-t">{b.title}</h3>
                    <span className="bk-kind">{b.kind}</span>
                  </div>
                  <p className="bk-meta">{b.author} · {b.book}</p>
                  <p className="bk-why">约 {b.words} 词 · {b.lic}</p>
                  {saved && (
                    <p className="bk-saved"><Check size={12} /> 已存本地 · 离线也能读</p>
                  )}
                  <div className="bk-acts">
                    <button className="btn-pri small" onClick={() => onRead(b)} disabled={!!readBusy}>
                      {readBusy === b.id
                        ? <><Loader2 size={14} className="spin" /> 取正文…</>
                        : saved
                          ? <><BookOpen size={14} /> 读这篇</>
                          : <><Download size={14} /> 取来读</>}
                    </button>
                    <a className="bk-src" href={b.srcUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> 出处
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bk-foot">
            <span>共 {all.length} 篇，按 CEFR 分五档。内容随应用发布，读过的存在本地</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- 生词本 ----
   原来是卡片网格，每张卡把音标、三条释义、一个例句全摊开。词少时好看，
   过百之后就是一堵墙：一屏只放得下六张卡，没法搜、没有次序、想找某个词
   只能一路翻。

   改成可展开的紧凑列表：一行一词，点开才看详情。信息一条没少，只是默认收起。 */

function vbWord(d) { return d.type === "en" ? d.word : d.input; }
function vbPhon(d) {
  return d.type === "en" ? d.phonetic_us : (((d.translations || [])[0]) || {}).phonetic_us;
}
function vbBrief(d) {
  if (d.type === "en") {
    const s = (d.senses || [])[0];
    return s ? ((s.pos ? s.pos + " " : "") + (s.cn || "")) : "";
  }
  return ((d.translations || []).map((t) => t.en).join(" / ")) || "";
}
function vbHay(d) {
  // 搜索要能用中文释义命中，不能只匹配单词本身
  const parts = [vbWord(d)];
  if (d.type === "en") {
    for (const x of d.senses || []) parts.push(x.cn, x.pos);
  } else {
    for (const t of d.translations || []) parts.push(t.en, t.pos);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function VocabView({ vocab, dueCount, onStartReview, onSpeak, onRemove, onCopy, onDownload, vImpOpen, setVImpOpen, vImpText, setVImpText, onVImport, confirmClear, setConfirmClear, onClear, onLookup }) {
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState(null);
  // 已掌握的词本来就不用天天看，默认折起来，第一屏留给真正要复习的
  const [fold, setFold] = useState({ done: true });

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const hit = kw ? vocab.filter((v) => vbHay(v.data).includes(kw)) : vocab;
    const now = Date.now();
    const due = [], learn = [], done = [];
    for (const v of hit) {
      if (rvOf(v).due <= now) due.push(v);
      else if (isMastered(v)) done.push(v);
      else learn.push(v);
    }
    due.sort((a, b) => rvOf(a).due - rvOf(b).due);
    const recent = (a, b) => (b.savedAt || 0) - (a.savedAt || 0);
    learn.sort(recent);
    done.sort(recent);
    return [
      { id: "due", name: "待复习", items: due },
      { id: "learn", name: "学习中", items: learn },
      { id: "done", name: "已掌握", items: done },
    ];
  }, [vocab, q]);

  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="vocab">
      <div className="vb-head">
        <h2 className="vb-t"><BookOpen size={19} /> 生词本 <span className="vb-n">{vocab.length}</span></h2>
        <div className="vb-acts">
          {vocab.length > 0 && (
            <button className={dueCount ? "btn-pri small" : "btn-gh"} onClick={onStartReview}>
              <Brain size={14} /> {dueCount ? `开始复习 · ${dueCount}` : "今日无待复习"}
            </button>
          )}
          <span className="lvsel">
            <button className="btn-gh" onClick={() => setMenu((o) => !o)}>
              <MoreHorizontal size={15} /> 导入 / 导出
            </button>
            {menu && (
              <>
                <div className="popmask" onClick={() => { setMenu(false); setConfirmClear(false); }} />
                <div className="menu menu-r">
                  <button className="mi" onClick={() => { setMenu(false); onCopy(); }}>
                    <Copy size={14} /> 复制为 Markdown
                  </button>
                  <button className="mi" onClick={() => { setMenu(false); onDownload(); }}>
                    <Download size={14} /> 下载 .md 文件
                  </button>
                  <button className="mi" onClick={() => { setMenu(false); setVImpOpen(true); }}>
                    <Upload size={14} /> 导入生词（粘贴 md）
                  </button>
                  {vocab.length > 0 && (
                    <>
                      <div className="mi-div" />
                      {confirmClear ? (
                        <button className="mi danger" onClick={() => { setMenu(false); onClear(); }}>
                          确认清空全部？
                        </button>
                      ) : (
                        <button className="mi danger"
                          onClick={() => { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }}>
                          <Trash2 size={14} /> 清空生词本
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </span>
        </div>
      </div>

      {vImpOpen && (
        <div className="imp vimp">
          <textarea
            className="imp-ta"
            value={vImpText}
            onChange={(e) => setVImpText(e.target.value)}
            placeholder={'粘贴之前用「复制 md / 下载 .md」导出的生词本内容，例如：\n## resilient  /rɪˈzɪliənt/\n- adj. 有韧性的\n- 例：She is resilient. — 她很有韧性。'}
          />
          <div className="imp-row">
            <button className="btn-pri small" onClick={onVImport}><Upload size={14} /> 导入</button>
            <span className="imp-hint">已存在的词会自动跳过 · 换版本搬家就靠它</span>
          </div>
        </div>
      )}

      {vocab.length === 0 ? (
        <div className="vb-empty">
          <div className="dict-idle-mark">007</div>
          <p>还没有生词。</p>
          <p className="mut">读文章时点击单词，或在顶部搜索，然后点「加入生词本」。</p>
        </div>
      ) : (
        <>
          <div className="vb-search">
            <Search size={14} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜单词或中文释义"
            />
            {q && <button className="vb-clr" onClick={() => setQ("")} aria-label="清空"><X size={13} /></button>}
          </div>

          {q && shown === 0 && (
            <div className="vb-empty"><p>没有匹配「{q}」的词</p></div>
          )}

          {groups.map((g) => {
            if (!g.items.length) return null;
            // 搜索时一律展开，否则搜出来的东西藏在折叠组里等于没搜
            const folded = q ? false : !!fold[g.id];
            return (
              <div className="vb-grp" key={g.id}>
                <button className="vb-grp-h" onClick={() => setFold((f) => ({ ...f, [g.id]: !f[g.id] }))}>
                  <ChevronDown size={14} className={folded ? "flip-r" : ""} />
                  <b className={g.id === "due" ? "hot" : g.id === "done" ? "ok" : ""}>{g.name}</b>
                  <span className="vb-grp-n">{g.items.length}</span>
                </button>
                {!folded && (
                  <div className="vb-rows">
                    {g.items.map((v) => {
                      const d = v.data;
                      const r = rvOf(v);
                      const on = openKey === v.key;
                      const ph = vbPhon(d);
                      return (
                        <div className={on ? "vb-row on" : "vb-row"} key={v.key}>
                          <button className="vb-rmain" onClick={() => setOpenKey(on ? null : v.key)}>
                            <span className="vb-rw">{vbWord(d)}</span>
                            {ph && <span className="vb-rph">{ph}</span>}
                            <span className="vb-rbrief">{vbBrief(d)}</span>
                            {d.tech_cn && <span className="vb-rtech" title="有计算机领域的含义">计算机</span>}
                          </button>
                          <button className="vb-rsp" onClick={() => onSpeak(d.type === "en" ? d.word : ((d.translations || [])[0] || {}).en || d.input, "en-US")} aria-label="发音">
                            <Volume2 size={13} />
                          </button>
                          <button className="vb-rx" onClick={() => onRemove(v.key)} aria-label="移除">
                            <X size={13} />
                          </button>
                          {on && (
                            <div className="vb-det">
                              {d.type === "en" ? (
                                <>
                                  <ul className="senses tight">
                                    {(d.senses || []).map((x, i) => (
                                      <li key={i}><i className="pos">{x.pos}</i><span>{x.cn}</span></li>
                                    ))}
                                  </ul>
                                  {/* 计算机含义是特意查出来的东西，收进生词本却看不到，
                                      等于白查。位置和查词卡保持一致：释义之后、例句之前 */}
                                  {d.tech_cn && (
                                    <div className="ctx tech vb-tech">
                                      <span className="ctx-l tech-l">计算机</span>
                                      {d.tech_cn}
                                    </div>
                                  )}
                                  {(d.examples || []).slice(0, 2).map((ex, i) => (
                                    <p className="vb-ex" key={i}>
                                      <Boldify text={ex.en} word={d.word} />
                                      <span className="vb-ex-cn"> — {ex.cn}</span>
                                    </p>
                                  ))}
                                </>
                              ) : (
                                (d.translations || []).map((t, i) => (
                                  <div className="vb-tr" key={i}>
                                    <span className="serif"><b>{t.en}</b></span>
                                    {t.phonetic_us && <span className="tr-ph">{t.phonetic_us}</span>}
                                    <button className="ex-sp" onClick={() => onSpeak(t.en, "en-US")} aria-label="发音">
                                      <Volume2 size={12} />
                                    </button>
                                    {t.pos && <i className="pos">{t.pos}</i>}
                                  </div>
                                ))
                              )}
                              <div className="vb-meta">
                                {r.due <= Date.now()
                                  ? <span className="due">待复习</span>
                                  : <span className="mut">连对 {r.streak} 次 · 见过 {v.meet || 1} 次</span>}
                                <button className="vb-look" onClick={() => onLookup(vbWord(d))}>
                                  <Search size={12} /> 重新查这个词
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ---------- 设置页 ----------
   原来这些挤在一个 284px 的浮层里，还挡着正文。
   拆成分组的整页，每组一句说明——设置项的意义比设置项本身重要。 */

function SettingsView({
  prefs, setPrefs, enVoices, onTestVoice,
  providerName, model, onChangeProvider,
  vocabCount, onCopyVocab, onDownloadVocab,
  confirmClear, setConfirmClear, onClearVocab,
}) {
  /* 必须用函数式更新读 p.size：从渲染闭包里读 prefs.size 的话，
     连点两次「A＋」时第二次拿到的还是旧值，只会加一档。 */
  const bumpSize = (d) => setPrefs((p) => {
    const i = FONT_SIZES.indexOf(p.size);
    return { ...p, size: FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, i + d))] };
  });
  return (
    <div className="setpage">
      <h2 className="vb-t"><Settings size={19} /> 设置</h2>

      <section className="setgrp">
        <h3>外观</h3>
        <p className="setgrp-h">只影响这台电脑上的显示，不会动到你的生词和文章。</p>

        <div className="setrow">
          <span className="setl">背景</span>
          <div className="swrow">
            {Object.entries(THEMES).map(([id, t]) => (
              <button key={id}
                className={prefs.theme === id ? "sw on" : "sw"}
                style={{ background: t.swatch }}
                title={t.name}
                aria-label={t.name}
                onClick={() => setPrefs((p) => ({ ...p, theme: id }))}
              >{prefs.theme === id ? "✓" : ""}</button>
            ))}
          </div>
        </div>

        <div className="setrow">
          <span className="setl">正文字体</span>
          <div className="chipswitch">
            <button className={prefs.font === "serif" ? "cs on" : "cs"}
              onClick={() => setPrefs((p) => ({ ...p, font: "serif" }))}
              style={{ fontFamily: "var(--serif)" }}>衬线 Aa</button>
            <button className={prefs.font === "sans" ? "cs on" : "cs"}
              onClick={() => setPrefs((p) => ({ ...p, font: "sans" }))}>黑体 Aa</button>
          </div>
        </div>

        <div className="setrow">
          <span className="setl">正文字号</span>
          <div className="sizerow">
            <button className="szbtn" aria-label="调小"
              onClick={() => bumpSize(-1)}>A−</button>
            <span className="szval">{prefs.size}</span>
            <button className="szbtn" aria-label="调大"
              onClick={() => bumpSize(1)}>A＋</button>
          </div>
        </div>
      </section>

      <section className="setgrp">
        <h3>朗读</h3>
        <p className="setgrp-h">
          用的是设备自带的语音合成，不消耗 API 额度。音质取决于系统——苹果设备和 Windows 上的 Edge 最好。
        </p>

        <div className="setrow">
          <span className="setl">语速</span>
          <div className="chipswitch">
            {[[0.75, "慢"], [0.9, "稍慢"], [1, "正常"], [1.15, "快"]].map(([val, lb]) => (
              <button key={lb}
                className={Math.abs((prefs.rate || 1) - val) < 0.01 ? "cs on" : "cs"}
                onClick={() => setPrefs((p) => ({ ...p, rate: val }))}
              >{lb}</button>
            ))}
          </div>
        </div>

        <div className="setrow">
          <span className="setl">声音</span>
          <div className="setctl">
            <select
              className="vsel"
              value={prefs.voiceURI || ""}
              onChange={(e) => setPrefs((p) => ({ ...p, voiceURI: e.target.value }))}
            >
              <option value="">自动（已挑选设备里最佳）</option>
              {enVoices.slice(0, 12).map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>
              ))}
            </select>
            <button className="btn-gh" onClick={onTestVoice}><Volume2 size={14} /> 试听</button>
          </div>
        </div>
      </section>

      <section className="setgrp">
        <h3>模型服务</h3>
        <p className="setgrp-h">
          API Key 只存在这台电脑的浏览器里，只发给你选的这一家。每家的 Key 分开保存，切换不用重填。
        </p>
        <div className="setrow">
          <span className="setl">当前</span>
          <div className="setctl">
            <span className="provnow">{providerName} · <code>{model}</code></span>
            <button className="btn-gh" onClick={onChangeProvider}>
              <KeyRound size={14} /> 更换服务商 / 模型
            </button>
          </div>
        </div>
      </section>

      <section className="setgrp">
        <h3>数据</h3>
        <p className="setgrp-h">
          全部数据只存在本浏览器里。<b>清除浏览器数据会一并清掉生词本</b>——导出的 Markdown
          既是备份，也能在生词本页反向导入，这是唯一的搬家通道。
        </p>
        <div className="setrow">
          <span className="setl">生词本</span>
          <div className="setctl">
            <span className="provnow">共 {vocabCount} 个词</span>
            <button className="btn-gh" onClick={onCopyVocab} disabled={!vocabCount}>
              <Copy size={14} /> 复制为 Markdown
            </button>
            <button className="btn-gh" onClick={onDownloadVocab} disabled={!vocabCount}>
              <Download size={14} /> 下载 .md
            </button>
          </div>
        </div>
        <div className="setrow">
          <span className="setl">危险操作</span>
          <div className="setctl">
            {confirmClear ? (
              <>
                <span className="setwarn">清空后无法恢复，确定？</span>
                <button className="btn-danger" onClick={onClearVocab}>确认清空</button>
                <button className="btn-gh" onClick={() => setConfirmClear(false)}>取消</button>
              </>
            ) : (
              <button className="btn-gh danger-t" onClick={() => setConfirmClear(true)} disabled={!vocabCount}>
                <Trash2 size={14} /> 清空生词本
              </button>
            )}
          </div>
        </div>
      </section>

      <button className="setreset"
        onClick={() => setPrefs({ theme: "paper", font: "serif", size: 19, voiceURI: "", rate: 1, dictOff: false })}
      >恢复默认外观</button>
    </div>
  );
}

/* ---------- 骨架屏 ---------- */

function Skeleton({ topic }) {
  return (
    <div className="skel">
      <div className="skel-note">
        <Loader2 size={15} className="spin" />{" "}
        {topic && topic.trim()
          ? <>正在为你现写一篇「{topic.trim()}」…</>
          : <>正在照着你的生词现写一篇…</>}
      </div>
      <div className="sk sk-t" />
      <div className="sk" /><div className="sk" /><div className="sk w80" />
      <div className="sk-gap" />
      <div className="sk" /><div className="sk" /><div className="sk w60" />
    </div>
  );
}

/* ============================================================
   样式
   ============================================================ */

const CSS = `
:root{
  --paper:#F5F6F8; --card:#FFFFFF; --ink:#111826; --ink2:#4B5565; --mut:#98A2B3;
  --line:#E3E6EC; --line2:#F0F2F5;
  --blue:#4055C6; --blue-d:#33449E; --blue-bg:#EEF1FD;
  --hi:#F5B944; --hi-hot:#F0A81E; --hi-soft:#FEF3D6; --hi-wash:#FEF8E8; --hi-text:#7A5200;
  --ok:#12855F; --ok-bg:#E7F5EF; --bad:#C4342B; --bad-bg:#FDECEA;
  --top:rgba(245,246,248,.88); --sk:#EDEFF3;
  --sh:0 1px 2px rgba(17,24,38,.04); --sh-l:0 4px 16px rgba(64,85,198,.10);
  --sbw:216px;
  --read-size:19px; --read-font:Georgia,'Iowan Old Style','Times New Roman','Songti SC',STSong,serif;
  --serif:Georgia,'Iowan Old Style','Times New Roman','Songti SC',STSong,serif;
  --sans:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
.app{min-height:100vh;background:var(--paper);color:var(--ink);font-family:var(--sans);
  -webkit-font-smoothing:antialiased;display:grid;grid-template-columns:var(--sbw) minmax(0,1fr)}
.app.solo{display:block}
button{font-family:var(--sans);cursor:pointer;background:none;border:none;color:inherit}
button:disabled{opacity:.55;cursor:default}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:4px}
.serif{font-family:var(--serif)}
.mut{color:var(--mut);font-size:13px}
.spin{animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

/* ---- 左侧栏 ---- */
/* 侧栏抽屉比词典抽屉(60)高一层：它自带遮罩，是"当前占屏的那个"。
   以前两者同为 60，靠 DOM 先后决定谁盖谁，词典恰好靠后就把侧栏整条盖住了。 */
.sidebar{background:var(--card);border-right:1px solid var(--line);padding:18px 12px;
  display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh;z-index:70}
.brand2{display:flex;align-items:center;gap:9px;padding:6px 9px 18px;font-size:15px;
  font-weight:800;letter-spacing:.5px;color:var(--ink)}
.brand2 .logo{width:30px;height:30px;border-radius:9px;background:var(--blue);color:#fff;
  display:grid;place-items:center;font-size:11.5px;font-weight:800;letter-spacing:-.5px;flex:none}
.snav{display:flex;flex-direction:column;gap:3px}
.sl{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;font-size:14px;
  color:var(--ink2);text-align:left;width:100%}
.sl:hover{background:var(--line2);color:var(--ink)}
.sl.on{background:var(--blue-bg);color:var(--blue);font-weight:700}
.sl svg{flex:none}
.sbadge{margin-left:auto;background:var(--line2);color:var(--ink2);font-size:11px;font-weight:700;
  border-radius:99px;padding:1px 7px}
.sl.on .sbadge{background:var(--blue);color:#fff}
.sbadge.hot{background:var(--hi);color:#4A3200}
.sdiv{height:1px;background:var(--line);margin:12px 4px}
.slbl{display:flex;align-items:center;font-size:11px;letter-spacing:1.5px;color:var(--mut);
  font-weight:700;padding:2px 6px 6px 10px}
.sadd{margin-left:auto;display:inline-flex;color:var(--mut);padding:4px;border-radius:6px}
.sadd:hover{background:var(--line2);color:var(--blue)}
.stabs{display:flex;flex-direction:column;gap:2px;overflow:auto;min-height:0}
.sempty{font-size:12.5px;color:var(--mut);padding:2px 10px}
.st{display:flex;align-items:center;border-radius:8px}
.st:hover{background:var(--line2)}
.st.on{background:var(--blue-bg)}
.st-b{flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink2);
  padding:8px 4px 8px 10px;text-align:left;white-space:nowrap;overflow:hidden}
.st-tt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.st.on .st-b{color:var(--blue);font-weight:600}
.st-b svg{flex:none}
.st-ch{flex:none;font-size:11px;color:var(--mut);font-variant-numeric:tabular-nums}
.st-x{color:var(--mut);padding:5px 8px 5px 4px;border-radius:6px;opacity:0}
.st:hover .st-x,.st.on .st-x{opacity:1}
.st-x:hover{color:var(--bad)}
.sfoot{margin-top:auto;background:var(--line2);border-radius:10px;padding:11px 12px}
.sfoot b{display:flex;align-items:center;gap:6px;font-size:12.5px}
.sfoot b svg{color:var(--hi-hot)}
.sfoot span{display:block;font-size:11.5px;color:var(--mut);margin-top:3px}
.sbmask{display:none}

/* ---- 细顶条 ---- */
.mainwrap{min-width:0}
.topbar{position:sticky;top:0;z-index:40;background:var(--top);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line);height:58px;padding:0 26px;display:flex;align-items:center;gap:12px}
.menubtn{display:none;color:var(--ink2);padding:8px;border-radius:8px}
.menubtn:hover{background:var(--line2)}
.tsearch{flex:1;max-width:420px;display:flex;align-items:center;gap:8px;background:var(--card);
  border:1px solid var(--line);border-radius:10px;padding:8px 12px;color:var(--mut)}
.tsearch:focus-within{border-color:var(--blue)}
.tsearch input{border:none;outline:none;background:none;flex:1;min-width:0;font-size:13.5px;
  color:var(--ink);font-family:var(--sans)}

/* ---- 布局 ---- */
.layout{max-width:1180px;padding:26px 26px 110px;display:grid;
  grid-template-columns:minmax(0,1fr) 330px;gap:22px;align-items:start}
.mainc{min-width:0}

/* ---- 首页工作台 ---- */
.home{padding-top:4px}
.home-t{font-size:28px;font-weight:800;letter-spacing:-.3px}
.home-sub{color:var(--ink2);font-size:14.5px;margin-top:7px}
.today{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  margin-top:18px;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--blue);
  border-radius:12px;padding:13px 15px;box-shadow:var(--sh)}
.today-l{display:flex;align-items:center;gap:9px;font-size:15px;color:var(--ink)}
.today-tag{flex:none;font-size:11px;font-weight:800;color:var(--blue);background:var(--blue-bg);
  border-radius:6px;padding:2px 7px}
.today-a{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.genbox{background:var(--card);border:1px solid var(--line);border-radius:15px;
  padding:10px 20px;margin-top:20px;box-shadow:var(--sh)}
/* 展开导入面板、或有服务商提示条时才恢复正常内边距 */
.genbox:has(.imp),.genbox:has(.genwarn),.genbox:has(.err){padding:20px}
.genrow{display:flex;gap:10px;flex-wrap:wrap}
.topic-in{flex:1;min-width:220px;font-size:15px;padding:12px 15px;border:1px solid var(--line);
  border-radius:10px;background:var(--paper);color:var(--ink);outline:none;font-family:var(--sans)}
.topic-in:focus{border-color:var(--blue);background:var(--card)}
.btn-pri{display:inline-flex;align-items:center;gap:7px;background:var(--blue);color:#fff;
  font-size:14.5px;font-weight:700;padding:12px 24px;border-radius:10px}
.btn-pri:hover{background:var(--blue-d)}
.btn-pri.small{font-size:13px;padding:9px 16px}
.btn-gh.small{font-size:13px;padding:8px 13px}
.genfoot{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.genwarn + .genfoot{margin-top:12px}
.lvt{font-size:13px;padding:6px 13px;border-radius:8px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink2)}
.lvt:hover{border-color:var(--mut);color:var(--ink)}
.lvt.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:700}
.lv-tag{font-size:12px;color:var(--mut);margin-left:2px;line-height:1.7;max-width:min(100%,540px)}
.lv-tag b{color:var(--ink2);font-weight:700}
.chips-l{font-size:12.5px;color:var(--mut);font-weight:600}
/* AI 现写卡：跟「找真实文章」并列的第二类入口 */
.aibox{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:18px 20px;box-shadow:var(--sh);margin-top:16px}
.ai-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ai-tag{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;
  color:var(--hi-text);background:var(--hi-wash);border:1px solid var(--hi-soft);
  border-radius:7px;padding:4px 9px;flex:none}
.ai-sub{font-size:12.5px;color:var(--mut);line-height:1.6}
.ai-sub b{color:var(--hi-text);font-weight:700}
.ai-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:14px}
.ai-l{font-size:12.5px;color:var(--mut);font-weight:600;min-width:52px}
.ai-chips{display:flex;gap:6px;flex-wrap:wrap}
.ai-hint{font-size:12px;color:var(--mut);line-height:1.6}
.ai-hint b{color:var(--ink2);font-weight:700}
.wsw{width:38px;height:22px;border-radius:99px;background:var(--line);border:none;
  padding:0;position:relative;transition:background .16s;flex:none}
.wsw i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;
  background:#fff;box-shadow:0 1px 2px rgba(17,24,38,.25);transition:transform .16s}
.wsw.on{background:var(--blue)}
.wsw.on i{transform:translateX(16px)}
.ai-in{flex:1;min-width:220px}
.wchips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-left:61px}
.wc{font-size:12.5px;padding:5px 11px;border-radius:8px;border:1px dashed var(--line);
  background:var(--paper);color:var(--mut)}
.wc:hover{border-color:var(--mut);color:var(--ink2)}
.wc.on{background:var(--hi-wash);border:1px solid var(--hi-soft);
  color:var(--hi-text);font-weight:600}
.ai-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px;
  padding-top:14px;border-top:1px solid var(--line2)}
@media(max-width:640px){.wchips{padding-left:0}}
.genwarn{margin-top:12px;background:var(--hi-wash);border:1px solid var(--hi-soft);
  border-radius:10px;padding:10px 13px;font-size:12.5px;color:var(--hi-text);line-height:1.7}
.genwarn b{font-weight:700}
.lnk-imp{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:13px;
  font-weight:600;color:var(--blue);padding:5px 4px;border-radius:6px}
.lnk-imp:hover{color:var(--blue-d)}
.lnk-imp .flip{transform:rotate(180deg)}
.lnk-imp svg{transition:transform .18s}
.chipswitch{display:flex;background:var(--line2);border-radius:9px;padding:3px}
.cs{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;padding:5px 12px;border-radius:7px;color:var(--ink2)}
.cs.on{background:var(--card);color:var(--ink);font-weight:600;box-shadow:var(--sh)}

/* 数据条 */
/* 分区标题 + 卡片网格 */
.sechead{display:flex;align-items:center;justify-content:space-between;gap:12px;
  margin:30px 0 13px;flex-wrap:wrap}
.sechead h2{font-size:16px;font-weight:800}
.sechead-r{display:flex;align-items:center;gap:8px}
.sec-sub{font-size:12.5px;color:var(--mut)}
.cardgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:13px}
.ccard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;
  text-align:left;box-shadow:var(--sh);transition:border-color .15s,box-shadow .15s}
.ccard:hover{border-color:var(--blue);box-shadow:var(--sh-l)}
/* 卡片是网格项，包一层后要让它撑满，否则会缩成内容宽度 */
.ccard-wrap{position:relative;display:flex}
.ccard-wrap .ccard{flex:1;min-width:0}
.ccard-x{position:absolute;top:8px;right:8px;color:var(--mut);border-radius:7px;padding:4px;
  opacity:0;transition:opacity .15s,color .15s,background .15s}
.ccard-wrap:hover .ccard-x{opacity:1}
.ccard-x:hover{color:var(--bad);background:var(--bad-bg)}
/* 触屏没有 hover，删除键得一直显示，否则根本点不到 */
@media (hover:none){.ccard-x{opacity:1}}
.ccard .ctag{font-size:11px;font-weight:700;color:var(--blue);background:var(--blue-bg);
  border-radius:6px;padding:2px 8px;display:inline-block;margin-bottom:9px}
.ccard b{display:block;font-size:14.5px;font-weight:700;line-height:1.45}
.ccard p{font-size:12.5px;color:var(--mut);margin-top:6px;line-height:1.6;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ccard .ctag.real{background:var(--ok-bg);color:var(--ok)}
.ccard .ctag.ai{background:var(--hi-wash);color:var(--hi-text)}
.ccard .cprog{height:4px;background:var(--line2);border-radius:99px;margin-top:12px;overflow:hidden}
.ccard .cprog i{display:block;height:100%;background:var(--blue);border-radius:99px}
.ccard .cmeta{font-size:11.5px;color:var(--mut);margin-top:6px}
.cardgrid.tight .ccard{padding:14px 15px}

.err{margin-top:16px;background:var(--bad-bg);color:var(--bad);
  border-radius:10px;padding:11px 14px;font-size:14px}
.lnk{color:var(--blue);text-decoration:underline;font-size:inherit}

/* ---- 文章 ---- */
.article{background:var(--card);border:1px solid var(--line);border-radius:15px;
  padding:30px 38px 34px;box-shadow:var(--sh)}
.art-bar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:22px}
.btn-gh{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink2);
  border:1px solid var(--line);background:var(--card);border-radius:9px;padding:7px 12px}
.btn-gh:hover{color:var(--ink);border-color:var(--mut)}
.btn-gh.pri{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600}
.btn-gh.pri:hover{background:var(--blue-d);border-color:var(--blue-d);color:#fff}
.btn-soft{display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:#fff;
  border:none;background:var(--blue);border-radius:10px;padding:10px 18px}
.btn-soft:hover{background:var(--blue-d)}
.btn-soft.small{font-size:13px;padding:8px 14px;margin-left:10px}
.lv-mini{display:flex;background:var(--line2);border-radius:9px;padding:3px}
.lvm{font-size:12.5px;padding:5px 11px;border-radius:7px;color:var(--ink2)}
.lvm.on{background:var(--blue);color:#fff;font-weight:600}
.art-acts{display:flex;gap:7px;flex-wrap:wrap}
.art-meta{display:flex;align-items:center;flex-wrap:wrap;gap:5px;
  font-size:12.5px;color:var(--mut);letter-spacing:.2px;margin-bottom:8px}
.mtag{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;
  color:var(--blue);background:var(--blue-bg);border-radius:6px;padding:3px 8px}
.mtag.btn{cursor:pointer;border:none}
.mtag.btn:hover{background:var(--blue);color:#fff}
.mtag.real{background:var(--ok-bg);color:var(--ok)}
.mtag.ai{background:var(--hi-wash);color:var(--hi-text)}
.srclink{display:inline-flex;align-items:center;gap:4px;color:var(--blue);font-weight:600;
  text-decoration:none;border-bottom:1px solid transparent}
.srclink:hover{border-bottom-color:var(--blue)}
.catrow{display:flex;flex-wrap:wrap;gap:7px;margin:-4px 0 14px}
.cat{display:inline-flex;align-items:center;gap:5px;font-size:13px;padding:7px 14px;
  border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink2)}
.cat:hover{border-color:var(--mut);color:var(--ink)}
.cat.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:700}
.art-title{font-size:clamp(24px,3vw,32px);font-weight:800;line-height:1.35;letter-spacing:-.3px}
.art-intro{margin-top:14px;color:var(--ink2);font-size:14px;line-height:1.7;
  background:var(--blue-bg);border-radius:10px;padding:13px 16px}
/* ---- 章节导航 ---- */
.chbar{display:flex;align-items:center;gap:14px;margin-top:16px;padding:11px 14px;
  background:var(--paper);border:1px solid var(--line);border-radius:11px}
.chbar .btn-gh{flex:none;background:var(--card)}
.chprog{flex:1;min-width:0}
.chnum{display:block;font-size:12.5px;color:var(--ink2);font-weight:600;
  text-align:center;margin-bottom:6px;font-variant-numeric:tabular-nums}
.chtrack{height:4px;background:var(--line);border-radius:99px;overflow:hidden}
.chtrack i{display:block;height:100%;background:var(--blue);border-radius:99px;transition:width .25s}

.woven-note{margin-top:12px;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;
  color:var(--hi-text);background:var(--hi-wash);border:1px solid var(--hi-soft);border-radius:9px;padding:6px 11px}
.art-body{margin-top:26px}
.art-body .pwrap{margin-bottom:1.1em;max-width:64ch}
.art-body p{font-family:var(--read-font);font-size:var(--read-size);line-height:1.95;
  letter-spacing:.15px;margin-bottom:0}
.para-cn{font-family:var(--sans)!important;font-size:14px!important;line-height:1.75!important;
  color:var(--ink2);margin-top:7px!important;padding:10px 14px;background:var(--paper);
  border-radius:9px}
.sen{border-radius:4px;transition:background .2s}
.sen.on{background:var(--hi-soft);
  box-decoration-break:clone;-webkit-box-decoration-break:clone}
.w{cursor:pointer;border-radius:4px;padding:0 1px;margin:0 -1px;transition:background .12s}
.w:hover{background:var(--hi-soft)}
.w.act{background:var(--hi);color:#3D2A00}
.w.sav{box-shadow:inset 0 -7px 0 var(--hi-soft)}
.w.wov{background:var(--hi-wash);box-shadow:inset 0 -2px 0 var(--hi)}
.after-row{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap}

/* ---- 小测 ---- */
/* 小测嵌在文章卡片里，所以用「凹进去」的底色，不要再叠一层卡片 */
.quiz{margin-top:20px;background:var(--paper);border:1px solid var(--line);border-radius:13px;padding:20px}
.quiz-head{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700}
.quiz-q{margin-top:12px;font-size:15.5px;line-height:1.7}
.qopts{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.qopt{display:flex;align-items:flex-start;gap:9px;text-align:left;font-size:14.5px;line-height:1.55;
  border:1px solid var(--line);border-radius:10px;padding:10px 13px;background:var(--card)}
.qopt:hover{border-color:var(--blue)}
.qletter{flex:none;width:22px;height:22px;border-radius:7px;background:var(--line2);
  display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.qopt.right{border-color:var(--ok);background:var(--ok-bg)}
.qopt.right .qletter{background:var(--ok);color:#fff}
.qopt.wrong{border-color:var(--bad);background:var(--bad-bg)}
.qopt.wrong .qletter{background:var(--bad);color:#fff}
.qopt.dim{opacity:.55}
.qexp{margin-top:12px;font-size:14px;line-height:1.7;background:var(--card);border-radius:10px;
  padding:11px 13px;display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.quiz-done{text-align:center;padding:8px 0 4px}
.quiz-score{font-size:22px;font-weight:800;letter-spacing:-.3px}
.quiz-adj{margin:12px 0 14px;font-size:14px;color:var(--ink2)}
.quiz-adj.up{color:var(--ok);background:var(--ok-bg);border-radius:9px;padding:8px 12px;display:inline-block}
.quiz-adj.down{color:var(--bad);background:var(--bad-bg);border-radius:9px;padding:8px 12px;display:inline-block}

/* ---- 骨架 ---- */
.skel{padding-top:8px}
.skel-note{display:flex;align-items:center;gap:8px;color:var(--ink2);font-size:14px;margin-bottom:22px}
.sk{height:15px;border-radius:6px;background:linear-gradient(90deg,var(--line2) 25%,var(--sk) 45%,var(--line2) 65%);
  background-size:200% 100%;animation:sh 1.4s infinite;margin-bottom:13px;max-width:66ch}
.sk-t{height:30px;width:60%;margin-bottom:24px}
.sk.w80{width:80%}.sk.w60{width:60%}
.sk-gap{height:14px}
@keyframes sh{to{background-position:-200% 0}}

/* ---- 词典面板 ---- */
.dictwrap{position:sticky;top:76px}
.dict{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:20px;
  max-height:calc(100vh - 100px);overflow:auto;box-shadow:var(--sh)}
.sb-close{display:none;position:absolute;top:12px;right:12px;color:var(--mut);
  background:var(--line2);border-radius:99px;padding:7px;z-index:1}
.sb-close:hover{color:var(--ink)}
.dict-close{display:flex;position:absolute;top:10px;right:12px;color:var(--mut);
  background:var(--line2);border-radius:99px;padding:6px}
.dsearch{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;
  padding:9px 12px;margin-bottom:18px;color:var(--mut);background:var(--paper)}
.dsearch:focus-within{border-color:var(--blue)}
.dsearch input{border:none;outline:none;background:none;flex:1;min-width:0;font-size:13.5px;
  color:var(--ink);font-family:var(--sans)}
.dict-fab{display:none;position:fixed;right:18px;bottom:86px;z-index:58;width:46px;height:46px;
  border-radius:99px;background:var(--blue);color:#fff;align-items:center;justify-content:center;
  box-shadow:0 8px 22px rgba(64,85,198,.35)}
.dict-idle{text-align:center;padding:26px 8px;color:var(--ink2);font-size:14px}
.dict-idle p{margin-top:10px}
.dict-idle-mark{width:58px;height:36px;margin:0 auto;background:var(--blue);color:#fff;
  font-family:var(--sans);font-weight:800;font-size:15px;letter-spacing:1.5px;border-radius:11px;
  display:flex;align-items:center;justify-content:center}
.dict-load{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:6px 2px}
.hw{font-size:27px;font-weight:800;line-height:1.2;word-break:break-word;letter-spacing:-.3px}
.meetb{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--hi-text);
  background:var(--hi-wash);border:1px solid var(--hi-soft);border-radius:99px;padding:3px 10px;margin-bottom:8px}
.phon-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.phon{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink2);
  background:var(--blue-bg);border-radius:8px;padding:5px 10px;font-family:var(--serif)}
.phon:hover{color:var(--blue)}
.phon-l{font-family:var(--sans);font-size:11px;background:var(--card);border-radius:5px;
  padding:1px 5px;color:var(--mut)}
.ctx{margin-top:14px;background:var(--hi-wash);border:1px solid var(--hi-soft);border-radius:10px;
  padding:10px 12px;font-size:14px;line-height:1.6}
.ctx-l{font-size:11px;font-weight:700;color:#9A7B00;background:var(--hi);border-radius:5px;
  padding:1px 6px;margin-right:7px}
/* 标签文字用 --card 而不是写死 #fff：--blue 在夜间主题是亮蓝(#8095F5)，
   白字压上去只有 2.6:1 糊成一片；--card 在每套主题里都跟 --blue 深浅相反。 */
.ctx.tech{background:var(--blue-bg);border-color:var(--blue-bg)}
.ctx-l.tech-l{color:var(--card);background:var(--blue)}
.nudge{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;
  background:var(--hi-wash);border:1px solid var(--hi-soft);border-radius:10px;padding:7px 9px 7px 11px;
  font-size:12px;font-weight:700;color:var(--hi-text)}
.nudge span{display:inline-flex;align-items:center;gap:5px}
/* --hi-hot 在四套主题里都是亮金色，所以这里写死深棕字，两边都够对比度；
   写 #fff 或 var(--card) 都会在某一套主题下糊掉 */
.nudge-b{flex:none;font-size:12px;font-weight:700;color:#4A3200;background:var(--hi-hot);
  border-radius:7px;padding:4px 10px}
.nudge-b:hover{filter:brightness(1.06)}
.ctxbtn{display:inline-flex;align-items:center;gap:6px;margin-top:12px;font-size:12.5px;
  color:var(--ink2);border:1px dashed var(--line);border-radius:9px;padding:6px 11px;background:transparent}
.ctxbtn:hover:not(:disabled){color:var(--blue);border-color:var(--blue)}
.ctxbtn:disabled{opacity:.6}
.sentbtn{display:inline-flex;align-items:center;gap:6px;margin-top:12px;font-size:13px;
  color:var(--blue);border:1px dashed var(--blue);border-radius:9px;padding:6px 12px;background:var(--blue-bg)}
.sentbtn:hover{background:var(--card)}
.senses{list-style:none;margin-top:14px}
.senses li{display:flex;gap:9px;padding:6px 0;font-size:14.5px;line-height:1.6;
  border-bottom:1px dashed var(--line2)}
.senses li:last-child{border-bottom:none}
.senses.tight li{padding:3px 0;font-size:13.5px;border:none}
.pos{flex:none;color:var(--blue);font-size:12px;font-weight:700;background:var(--blue-bg);
  border-radius:5px;padding:2px 7px;height:fit-content;margin-top:1px}
.exs{margin-top:6px}
.sec-l{font-size:11.5px;font-weight:700;color:var(--mut);letter-spacing:2px;margin:10px 0 4px}
.ex{padding:8px 0;border-bottom:1px dashed var(--line2)}
.ex:last-child{border-bottom:none}
.ex-en{font-family:var(--serif);font-size:14.5px;line-height:1.6}
.ex-en b{background:var(--hi-soft);border-radius:3px;padding:0 2px}
.ex-cn{font-size:13px;color:var(--mut);margin-top:3px}
.ex-sp{color:var(--mut);padding:2px 4px;vertical-align:middle;margin-left:4px}
.ex-sp:hover{color:var(--blue)}
.btn-save{width:100%;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:7px;
  background:var(--blue);color:#fff;font-size:14px;font-weight:700;border-radius:10px;padding:11px}
.btn-save:hover{background:var(--blue-d)}
.btn-save.on{background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue)}
.trans{margin-top:14px}
.tr{padding:9px 0;border-bottom:1px dashed var(--line2)}
.tr:last-child{border:none}
.tr-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tr-en{font-size:19px;font-weight:700}
.tr-ph{font-family:var(--serif);font-size:12.5px;color:var(--mut)}
.tr-note{font-size:13px;color:var(--ink2);margin-top:4px}
.backbtn{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:var(--mut);
  padding:4px 8px;border-radius:8px;margin-bottom:10px}
.backbtn:hover{background:var(--line2);color:var(--ink)}
.sent-src{font-size:16.5px;line-height:1.7;font-weight:600}
.parts{margin-top:4px}
.part{display:flex;gap:9px;align-items:flex-start;padding:6px 0;border-bottom:1px dashed var(--line2)}
.part:last-child{border-bottom:none}
.part-r{flex:none;font-size:11.5px;font-weight:700;color:var(--blue);background:var(--blue-bg);
  border-radius:6px;padding:3px 8px;margin-top:1px;white-space:nowrap}
.part-t{font-size:14px;line-height:1.55}
.sent-cn{font-size:14.5px;line-height:1.7;background:var(--hi-wash);border-radius:10px;padding:10px 12px}

/* ---- 复习 ---- */
.rvw{max-width:520px;margin:0 auto;padding-top:8px}
.rvw-top{display:flex;align-items:center;justify-content:space-between}
.rvw-bar{height:5px;background:var(--line2);border-radius:99px;margin-top:10px;overflow:hidden}
.rvw-bar i{display:block;height:100%;background:var(--hi-hot);border-radius:99px;transition:width .25s}
.flipcard{margin-top:26px;background:var(--card);border:1px solid var(--line);border-radius:16px;
  padding:34px 26px;box-shadow:var(--sh);text-align:center}
.fc-word{font-size:36px;font-weight:800;line-height:1.2;word-break:break-word;letter-spacing:-.5px}
.fc-front .phon{margin-top:14px}
.fc-flip{margin-top:26px;width:100%;font-size:14.5px;color:var(--ink2);border:1.5px dashed var(--line);
  border-radius:12px;padding:14px;background:var(--paper)}
.fc-flip:hover{border-color:var(--blue);color:var(--blue)}
.fc-back{margin-top:20px;text-align:left;border-top:1px dashed var(--line2);padding-top:16px}
.fc-btns{display:flex;gap:10px;margin-top:20px}
.fc-ng,.fc-ok{flex:1;font-size:15px;font-weight:700;border-radius:12px;padding:13px}
.fc-ng{background:var(--bad-bg);color:var(--bad);border:1.5px solid transparent}
.fc-ng:hover{border-color:var(--bad)}
.fc-ok{background:var(--ok-bg);color:var(--ok);border:1.5px solid transparent}
.fc-ok:hover{border-color:var(--ok)}
.rvw-done{text-align:center;padding:56px 10px}
.rvw-emoji{font-size:44px}
.rvw-done h2{margin-top:14px;font-size:26px}
.rvw-done .mut{margin-top:8px}
.rvw-acts{display:flex;gap:10px;justify-content:center;margin-top:24px;flex-wrap:wrap}

/* ---- 统计 ---- */
.stats{padding-top:6px}
.st-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:18px}
.st-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 14px;
  text-align:center;box-shadow:var(--sh)}
.st-card.go{cursor:pointer}
.st-card.go:hover{border-color:var(--blue);box-shadow:var(--sh-l)}
.st-card.go .st-l{color:var(--blue);font-weight:700}
.st-n{font-size:25px;font-weight:800;letter-spacing:-.5px;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--ink)}
.st-n svg{color:#E0862B}
.st-l{display:block;margin-top:4px;font-size:12.5px;color:var(--mut)}
/* ---- 情景对话 ---- */
.talk{max-width:760px;margin:0 auto;padding-bottom:20px}
.scenes{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:20px}
.scene{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;
  text-align:left;box-shadow:var(--sh);transition:border-color .15s,box-shadow .15s}
.scene:hover{border-color:var(--blue);box-shadow:var(--sh-l)}
.scene-i{font-size:24px;display:block;margin-bottom:8px}
.scene b{display:block;font-size:15px}
.scene-r{display:block;margin-top:4px;font-size:12px;color:var(--mut)}
.talk-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding-bottom:12px;border-bottom:1px solid var(--line)}
.talk-scene{font-size:16px;font-weight:800}
.talk-body{display:flex;flex-direction:column;gap:14px;padding:18px 0;min-height:220px}
.bub-wrap{display:flex;flex-direction:column;align-items:flex-start;gap:5px;max-width:88%}
.bub{border-radius:13px;padding:10px 13px;font-size:15px;line-height:1.62;max-width:88%}
/* 气泡和标签的文字都用 var(--card) 而非 #fff：--blue/--ok 在夜间主题是
   亮色，白字压上去对比度不足；--card 在每套主题里都与它们深浅相反。 */
.bub.u{align-self:flex-end;background:var(--blue);color:var(--card);border-bottom-right-radius:4px}
.bub.a{background:var(--card);border:1px solid var(--line);color:var(--ink);
  border-bottom-left-radius:4px;box-shadow:var(--sh)}
.bub.busy{display:inline-flex;align-items:center;gap:7px;color:var(--mut);font-size:13.5px}
.bub-sp{margin-left:7px;color:var(--mut);vertical-align:middle}
.bub-sp:hover{color:var(--blue)}
.bub-cn{font-size:12.5px;color:var(--mut);padding-left:3px}
.bub-used{font-size:11.5px;color:var(--ok);font-weight:700;padding-left:3px}
.fix{background:var(--ok-bg);border-radius:10px;padding:8px 11px;font-size:13.5px;line-height:1.6}
.fix-l{display:inline-block;font-size:11px;font-weight:800;color:var(--card);background:var(--ok);
  border-radius:5px;padding:1px 6px;margin-right:7px}
.fix-why{display:block;margin-top:3px;font-size:12px;color:var(--ink2);font-weight:400}
.talk-in{display:flex;gap:9px;align-items:center;border-top:1px solid var(--line);padding-top:14px}
.talk-in input{flex:1;background:var(--card);border:1px solid var(--line);border-radius:11px;
  padding:11px 13px;font-size:15px;color:var(--ink)}
.talk-in input:focus{border-color:var(--blue)}
.talk-note{display:flex;align-items:center;gap:5px;margin-top:10px;font-size:11.5px;color:var(--mut)}

.lvhint{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  margin-bottom:12px;border-radius:11px;padding:9px 10px 9px 13px;font-size:13px;font-weight:600}
.lvhint.hard{background:var(--hi-wash);border:1px solid var(--hi-soft);color:var(--hi-text)}
.lvhint.easy{background:var(--ok-bg);border:1px solid var(--ok-bg);color:var(--ok)}
.lvhint-a{display:inline-flex;align-items:center;gap:4px;flex:none}
.lvhint-b{font-size:12.5px;font-weight:700;color:var(--card);background:var(--ink2);
  border-radius:7px;padding:4px 10px}
.lvhint-b:hover{background:var(--ink)}
.lvhint-x{color:var(--mut);padding:3px}
.lvhint-x:hover{color:var(--ink)}
.missed{margin:14px 0 4px;background:var(--bad-bg);border:1px solid var(--bad-bg);
  border-radius:12px;padding:12px 14px;text-align:left}
.missed-t{font-size:13px;font-weight:700;color:var(--bad);margin-bottom:8px}
.missed-ws{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:11px}
.missed-w{font-size:12.5px;color:var(--ink2);background:var(--card);border:1px solid var(--line);
  border-radius:8px;padding:4px 9px}
.missed-ok{font-style:normal;font-size:11px;color:var(--ok);margin-left:5px}
.st-n.master{color:var(--ok)}
.bar.mbar{background:var(--ok)}
.st-note{margin-top:9px;font-size:11.5px;color:var(--mut)}
.st-chart{margin-top:18px;background:var(--card);border:1px solid var(--line);border-radius:12px;
  padding:18px;box-shadow:var(--sh)}
.bars{display:flex;align-items:flex-end;gap:6px;height:100px;margin-top:10px}
.barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;justify-content:flex-end}
.bar{width:100%;max-width:22px;background:var(--blue);border-radius:5px 5px 2px 2px}
.bar.today{background:var(--hi-hot)}
.bar-l{font-size:10px;color:var(--mut);height:12px}
.st-lv{margin-top:18px;font-size:13.5px;color:var(--ink2)}

/* ---- 教材推荐 ---- */
.books{padding-top:6px}
.bk-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px}
.bk-q{margin-top:10px}
.bk-in{flex:1;min-width:160px;font-size:14px;color:var(--ink);background:var(--card);
  border:1px solid var(--line);border-radius:9px;padding:8px 12px;font-family:var(--sans)}
.bk-in:focus{outline:none;border-color:var(--blue)}
.bk-in::placeholder{color:var(--mut)}
.lvt-n{margin-left:5px;font-size:10.5px;opacity:.65;font-weight:600}
.bk-hint{margin-top:8px;font-size:12.5px;color:var(--mut)}
.bk-note{margin-top:14px;font-size:12.5px;color:var(--ink2);line-height:1.65}
.bk-note summary{cursor:pointer;color:var(--mut);font-size:12.5px;
  display:inline-flex;align-items:center;gap:5px;list-style:none}
.bk-note summary::-webkit-details-marker{display:none}
.bk-note summary::before{content:"?";display:inline-flex;align-items:center;justify-content:center;
  width:15px;height:15px;border-radius:99px;background:var(--line2);font-size:10px;font-weight:800}
.bk-note summary:hover{color:var(--ink)}
.bk-note p{margin-top:9px;padding-left:20px}
.bk-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:18px}
.bk-card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);
  border-radius:12px;padding:16px;box-shadow:var(--sh)}
.bk-top{display:flex;align-items:flex-start;gap:8px}
.bk-t{font-family:var(--serif);font-size:16.5px;font-weight:700;line-height:1.35;
  color:var(--ink);letter-spacing:-.2px;flex:1}
.bk-kind{flex:none;margin-top:2px;font-size:11px;font-weight:700;white-space:nowrap;
  background:var(--blue-bg);color:var(--blue);border-radius:99px;padding:2px 9px}
.bk-cn{margin-top:5px;font-size:13.5px;color:var(--ink2)}
.bk-meta{margin-top:9px;font-size:12.5px;color:var(--mut);line-height:1.5}
.bk-why{margin-top:10px;font-size:13px;color:var(--ink2);line-height:1.6;
  border-left:2px solid var(--line);padding-left:9px}
.bk-saved{margin-top:10px;font-size:12px;color:var(--ok);
  display:inline-flex;align-items:center;gap:5px}
.bk-acts{margin-top:auto;padding-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bk-src{font-size:12px;color:var(--mut);display:inline-flex;align-items:center;gap:5px}
.bk-src:hover{color:var(--blue);text-decoration:underline}
.bk-foot{margin-top:18px;font-size:12px;color:var(--mut);line-height:1.7}
.bk-cites{margin-top:6px}
.bk-cites summary{cursor:pointer;color:var(--mut)}
.bk-cites summary:hover{color:var(--ink)}
.bk-cites ul{margin-top:7px;padding-left:18px;display:grid;gap:4px}
.bk-cites a{color:var(--ink2);text-decoration:underline;text-underline-offset:2px}
.bk-cites a:hover{color:var(--blue)}

/* ---- 生词本 ---- */
.vb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  margin:8px 0 20px}
.vb-t{font-size:22px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:9px}
.vb-n{font-size:13px;font-weight:700;background:var(--blue-bg);color:var(--blue);border-radius:99px;padding:2px 11px}
.vb-acts{display:flex;gap:8px;flex-wrap:wrap}
.btn-danger{font-size:13px;background:#B5432F;color:#fff;border-radius:9px;padding:7px 12px}
.vb-empty{text-align:center;padding:70px 20px;color:var(--ink2);font-size:15px}
.vb-empty p{margin-top:12px}
/* 生词本改成紧凑列表：一行一词，点开才展开详情。
   .vb-list / .vb-card 是旧的卡片网格，复习页还在用，留着。 */
.vb-search{display:flex;align-items:center;gap:8px;margin:0 0 16px;padding:9px 13px;
  background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--mut)}
.vb-search:focus-within{border-color:var(--blue)}
.vb-search input{flex:1;border:0;outline:0;background:transparent;font-size:14.5px;
  color:var(--ink);font-family:var(--sans)}
.vb-search input::placeholder{color:var(--mut)}
.vb-clr{color:var(--mut);padding:2px;border-radius:5px}
.vb-clr:hover{background:var(--line2);color:var(--ink)}

.vb-grp{margin-bottom:18px}
.vb-grp-h{display:flex;align-items:center;gap:7px;width:100%;padding:5px 2px;
  color:var(--ink2);font-size:13.5px}
.vb-grp-h b{font-weight:700;color:var(--ink)}
.vb-grp-h b.hot{color:var(--hi-hot)}
.vb-grp-h b.ok{color:var(--ok)}
.vb-grp-n{font-size:11.5px;font-weight:700;color:var(--mut);background:var(--line2);
  border-radius:99px;padding:1px 8px}
.vb-grp-h .flip-r{transform:rotate(-90deg)}
.vb-grp-h svg{transition:transform .16s ease;color:var(--mut);flex:none}

.vb-rows{margin-top:6px;border:1px solid var(--line);border-radius:11px;overflow:hidden;
  background:var(--card)}
.vb-row{position:relative;display:flex;align-items:center;flex-wrap:wrap;
  border-top:1px solid var(--line2)}
.vb-row:first-child{border-top:0}
.vb-row:hover{background:var(--line2)}
.vb-row.on{background:var(--line2)}
.vb-rmain{flex:1;min-width:0;display:flex;align-items:baseline;gap:9px;
  padding:11px 4px 11px 14px;text-align:left}
.vb-rw{font-size:15.5px;font-weight:700;color:var(--ink);flex:none}
.vb-row.on .vb-rw,.vb-rmain:hover .vb-rw{color:var(--blue)}
.vb-rph{font-size:11.5px;color:var(--mut);flex:none;font-family:var(--sans)}
.vb-rbrief{font-size:13px;color:var(--ink2);flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vb-rsp,.vb-rx{flex:none;color:var(--mut);padding:6px;border-radius:6px;margin-right:2px}
.vb-rx{margin-right:8px}
.vb-rsp:hover{background:var(--card);color:var(--blue)}
.vb-rx:hover{background:var(--bad-bg);color:var(--bad)}
.vb-det{flex-basis:100%;padding:2px 14px 14px;border-top:1px dashed var(--line)}
.vb-det .senses{margin-top:10px}
.vb-det .vb-ex{margin-top:9px}
.vb-det .vb-meta{display:flex;align-items:center;gap:10px}
.vb-det .vb-tech{margin-top:11px}
/* 不展开也要能一眼看出哪些词有计算机含义 */
.vb-rtech{flex:none;font-size:10.5px;font-weight:700;color:var(--card);background:var(--blue);
  border-radius:5px;padding:1px 6px;letter-spacing:.2px}
.fc-tech{margin-top:12px;text-align:left}
.vb-look{margin-left:auto;font-size:11.5px;color:var(--mut);
  display:inline-flex;align-items:center;gap:4px}
.vb-look:hover{color:var(--blue)}

.vb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.vb-card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:12px;
  padding:16px 16px 12px;box-shadow:var(--sh)}
.vb-x{position:absolute;top:10px;right:10px;color:var(--mut);padding:4px;border-radius:6px}
.vb-x:hover{background:var(--line2);color:var(--ink)}
.vb-word{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-right:24px}
.vb-w{font-size:18px;font-weight:800;letter-spacing:-.2px;color:var(--ink)}
button.vb-w:hover{color:var(--blue)}
.vb-ex{margin-top:8px;font-family:var(--serif);font-size:13px;color:var(--ink2);line-height:1.55}
.vb-ex b{background:var(--hi-soft);border-radius:3px;padding:0 2px}
.vb-ex-cn{font-family:var(--sans);color:var(--mut)}
.vb-tr{display:flex;align-items:center;gap:7px;margin-top:6px;font-size:15px;flex-wrap:wrap}
.vb-meta{margin-top:10px;padding-top:8px;border-top:1px dashed var(--line2);font-size:11.5px}
.due{color:var(--hi-text);background:var(--hi-wash);border:1px solid var(--hi-soft);border-radius:99px;
  padding:2px 9px;font-weight:700;font-size:11px}

/* ---- 跟读条 ---- */
.shadowbar{position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:55;
  display:flex;align-items:center;gap:8px;background:var(--ink);color:var(--card);border-radius:99px;
  padding:9px 12px 9px 18px;box-shadow:0 10px 30px rgba(17,24,38,.35);max-width:94vw;flex-wrap:wrap;justify-content:center}
.sb-idx{font-size:12.5px;color:#B9C4D8;font-variant-numeric:tabular-nums}
.sb-hint{font-size:13px}
.sb-btn{display:inline-flex;align-items:center;gap:4px;color:#fff;background:rgba(255,255,255,.14);
  border-radius:99px;padding:7px 10px;font-size:13px}
.sb-btn:hover{background:rgba(255,255,255,.25)}
.sb-btn.on{background:var(--hi);color:#3D2A00}
.sb-btn.pri{background:var(--hi);color:#3D2A00;font-weight:700;padding:7px 14px}
.sb-btn.pri:hover{background:var(--hi-hot)}

/* ---- toast ---- */
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:99;
  background:var(--ink);color:var(--paper);font-size:13.5px;border-radius:99px;padding:9px 20px;
  box-shadow:0 6px 20px rgba(17,24,38,.25);animation:up .2s ease}
@keyframes up{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}

/* ---- 设置页 ---- */
.sl-set{margin-top:8px}
.setpage{max-width:720px;padding-top:2px}
.setgrp{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:20px 22px;margin-top:16px;box-shadow:var(--sh)}
.setgrp h3{font-size:15px;font-weight:800}
.setgrp-h{font-size:12.5px;color:var(--mut);line-height:1.75;margin-top:6px}
.setgrp-h b{color:var(--ink2)}
.setrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  padding:13px 0;border-bottom:1px solid var(--line2)}
.setrow:last-child{border-bottom:none;padding-bottom:0}
.setgrp-h + .setrow{border-top:1px solid var(--line2);margin-top:14px}
.setl{flex:none;width:78px;font-size:13.5px;color:var(--ink2);font-weight:600}
.setctl{display:flex;align-items:center;gap:9px;flex-wrap:wrap;min-width:0}
.provnow{font-size:13px;color:var(--ink2)}
.provnow code{background:var(--line2);border-radius:5px;padding:2px 7px;font-size:12px}
.setwarn{font-size:13px;color:var(--bad);font-weight:600}
.swrow{display:flex;gap:8px}
.sw{width:28px;height:28px;border-radius:99px;border:2px solid var(--line);font-size:12px;
  color:#1C2B45;display:inline-flex;align-items:center;justify-content:center}
.sw.on{border-color:var(--blue)}
.sw[title="夜间"]{color:#E8ECF5}
.sizerow{display:flex;align-items:center;gap:8px}
.szbtn{font-size:13px;font-weight:700;border:1px solid var(--line);border-radius:8px;
  padding:5px 11px;background:var(--paper)}
.szbtn:hover{border-color:var(--blue);color:var(--blue)}
.szval{font-size:13px;color:var(--ink2);min-width:22px;text-align:center;font-variant-numeric:tabular-nums}
.vsel{min-width:220px;font-size:13px;color:var(--ink);background:var(--paper);
  border:1px solid var(--line);border-radius:9px;padding:9px 10px;outline:none;font-family:var(--sans)}
.vsel:focus{border-color:var(--blue)}
.setreset{width:100%;margin-top:16px;font-size:13px;color:var(--mut);padding:11px;
  border-radius:10px;border:1px solid var(--line);background:var(--card)}
.setreset:hover{color:var(--ink);border-color:var(--mut)}

/* ---- 导入材料 ---- */
.imp-entry{display:flex;align-items:center;gap:10px;margin-top:24px;flex-wrap:wrap}
.imp{margin-top:14px;background:var(--card);border:none;border-radius:16px;padding:18px}
.imp-tabs{margin-bottom:12px}
.imp-ta{width:100%;min-height:120px;resize:vertical;font-size:14px;line-height:1.7;color:var(--ink);
  background:var(--paper);border:1.5px solid var(--line);border-radius:11px;padding:12px 14px;
  font-family:var(--sans);outline:none}
.imp-ta:focus{border-color:var(--blue)}
.imp-row{display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap}
.imp-url{flex:1;min-width:200px;font-size:14px;padding:10px 13px}
.imp-hint{font-size:12px;color:var(--mut);line-height:1.6}
.filebtn{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;font-weight:600;
  color:var(--ink);border:1.5px dashed var(--line);border-radius:11px;padding:12px 18px;background:var(--paper)}
.filebtn:hover{border-color:var(--blue);color:var(--blue)}
.vimp{margin:0 0 18px}

/* ---- 翻译卡片 & 词卡追问 ---- */
.tr-src{font-size:15.5px;line-height:1.7}
.tr-dst{font-size:15px;line-height:1.75;background:var(--hi-wash);border-radius:10px;padding:10px 12px}
.seltip{position:fixed;z-index:80;transform:translateX(-50%);display:inline-flex;align-items:center;gap:5px;
  background:var(--ink);color:var(--card);font-size:13px;font-weight:600;border-radius:99px;padding:7px 14px;
  box-shadow:0 8px 22px rgba(17,24,38,.32)}
.seltip:hover{background:#2F5AA8}
.wchat{margin-top:18px;border-top:1px dashed var(--line);padding-top:6px}
.wc-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px}
.wc-q{margin-top:12px;font-size:13.5px;font-weight:700;color:var(--ink)}
.wc-q::before{content:"你：";color:var(--mut);font-weight:400}
.wc-a{margin-top:8px;font-size:13.5px;line-height:1.75;color:var(--ink2)}
.wc-a.mut{display:flex;align-items:center;gap:6px}
.wc-words{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.wcw{display:flex;align-items:center;gap:7px;flex-wrap:wrap;background:var(--paper);
  border-radius:10px;padding:7px 10px;font-size:13px}
.wcw b{font-size:14.5px;color:var(--ink)}
.wcw i{font-family:var(--serif);font-style:normal;font-size:12px;color:var(--mut)}
.wcw>span{color:var(--ink2)}
.wcw-add{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;
  width:24px;height:24px;border-radius:99px;background:var(--hi);color:#3D2A00}
.wcw-add:hover{background:var(--hi-hot)}
.wc-in{display:flex;align-items:center;gap:8px;margin-top:12px;border-bottom:1.5px solid var(--line);padding-bottom:6px}
.wc-in:focus-within{border-bottom-color:var(--ink)}
.wc-in input{flex:1;min-width:0;border:none;outline:none;background:none;font-size:13.5px;color:var(--ink)}
.wc-send{font-size:13px;font-weight:700;color:var(--paper);background:var(--ink);border-radius:99px;padding:5px 13px}
.wc-send:hover{opacity:.88}

/* ---- 下拉菜单 & meta 行 ---- */
.popmask{position:fixed;inset:0;z-index:69}
.lvsel{position:relative;display:inline-flex}
.menu{position:absolute;left:0;top:calc(100% + 6px);z-index:70;min-width:196px;background:var(--card);
  border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 12px 34px rgba(17,24,38,.16)}
.menu.menu-r{left:auto;right:0}
.mi{display:flex;align-items:center;gap:8px;width:100%;text-align:left;font-size:13.5px;
  color:var(--ink);padding:9px 11px;border-radius:8px}
.mi:hover{background:var(--line2)}
.mi.on{font-weight:700}
.mi.on svg:last-child{margin-left:auto;color:var(--ok)}
.mi-tag{font-size:11.5px;color:var(--mut)}
.mi.danger{color:var(--bad)}
.mi-div{height:1px;background:var(--line2);margin:5px 8px}
.art-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.meta-btn{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:var(--ink2);
  padding:3px 6px;border-radius:7px;background:none;text-decoration:underline dotted;text-underline-offset:3px}
.meta-btn:hover{color:var(--blue)}
.meta-btn:disabled{opacity:.55}
.dotsep{color:var(--mut)}
/* ---- API 设置页 ---- */
.setup{max-width:600px;margin:0 auto;padding:64px 24px 100px}
.setup-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:34px 30px;
  box-shadow:var(--sh)}
.setup-head{display:flex;align-items:center;gap:10px;font-size:24px;font-weight:800;letter-spacing:-.3px}
.setup-sub{margin-top:12px;color:var(--ink2);font-size:14.5px;line-height:1.75}
.setup-steps{margin:20px 0 0 20px;font-size:14.5px;line-height:2.15}
.setup-steps code{background:var(--line2);border-radius:5px;padding:1px 6px;font-size:13px}
.setup-l{margin-top:16px;font-size:12px;color:var(--mut)}
.setup-row{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
.setup-in{flex:1;min-width:200px;font-size:14px;padding:11px 14px;border:1px solid var(--line);
  border-radius:10px;background:var(--paper);color:var(--ink);outline:none;font-family:var(--sans)}
.setup-in.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.setup-in:focus{border-color:var(--blue);background:var(--card)}
.setup-note{margin-top:16px;font-size:12px;color:var(--mut);line-height:1.75}
.setup-note code{background:var(--line2);border-radius:5px;padding:1px 5px}
.setup-acts{display:flex;gap:10px;margin-top:20px}
.prov-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.prov-chip{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;
  padding:9px 13px;border-radius:11px;border:1.5px solid var(--line);
  background:var(--card);color:var(--ink2);cursor:pointer;transition:.15s}
.prov-chip:hover{border-color:var(--blue);color:var(--ink)}
.prov-chip.on{border-color:var(--blue);background:var(--blue-bg);color:var(--blue-d);font-weight:600}
.prov-tag{font-size:10.5px;padding:1px 5px;border-radius:5px;
  background:var(--ok-bg);color:var(--ok);font-weight:600}
.model-box{margin-top:12px;padding:12px;border-radius:12px;background:var(--sk)}
.model-list{display:flex;flex-direction:column;gap:3px;max-height:230px;
  overflow-y:auto;margin-top:10px}
.model-item{text-align:left;font-family:ui-monospace,Menlo,Consolas,monospace;
  font-size:12.5px;padding:7px 10px;border-radius:8px;border:none;
  background:transparent;color:var(--ink2);cursor:pointer}
.model-item:hover{background:var(--card);color:var(--ink)}
.model-item.on{background:var(--blue-bg);color:var(--blue-d);font-weight:600}
.danger-t{color:var(--bad)}
.danger-t:hover{background:var(--bad-bg)}

/* ---- 桌面端：手动收起词典 ----
   880px 以上才生效，正好和下面的移动端断点错开，收起状态不会波及手机的抽屉。 */
@media (min-width:881px){
  .layout.nodict{grid-template-columns:minmax(0,1fr)}
  .layout.nodict .dictwrap{display:none}
  .dict-fab.show{display:flex}
}

/* ---- 窄屏：侧栏变成抽屉 ----
   1000px 以下先收侧栏（比词典的 880px 早一档），
   免得中等宽度的窗口被侧栏+词典挤得正文只剩一条缝。 */
@media (max-width:1000px){
  .app{grid-template-columns:minmax(0,1fr)}
  /* 收起状态必须同时用 visibility，不能只靠 transform 位移。
     宽屏时侧栏没有 transform，把窗口拖窄跨过这个断点时，它要从「无」过渡到
     -102%；这个过渡在布局模式切换的当口可能跑不起来，值卡在起点 0，于是侧栏
     原地不动压在正文上——class 上并没有 open、遮罩也不渲染，看着就是"页面重叠"。

     visibility 这里**不加过渡**，收起时立即生效，不依赖动画时钟：动画一旦卡住，
     任何带延迟的隐藏都永远等不到。代价是收起时没有滑出动画（展开的滑入还在），
     用一个动效换一个必现的错位，值得。 */
  .sidebar{position:fixed;left:0;top:0;width:252px;
    transform:translateX(-102%);visibility:hidden;
    transition:transform .24s ease;
    box-shadow:0 0 40px rgba(17,24,38,.2)}
  .sidebar.open{transform:none;visibility:visible}
  .sbmask{display:block;position:fixed;inset:0;z-index:65;background:rgba(17,24,38,.4)}
  .menubtn{display:inline-flex}
}

/* ---- 移动端 ---- */
@media (max-width:880px){
  /* 侧栏也占满整屏：这个宽度下 252px 的抽屉 + 半透明遮罩，等于把三层界面
     压在一起，正是"看着重叠、不美观"的来源。整屏之后没有遮罩可点，改用
     右上角的关闭按钮退出（点任意导航项也会自动收起）。 */
  .sidebar{width:100%;height:100dvh;padding:20px 16px;border-right:none;
    box-shadow:none;overflow-y:auto}
  .sbmask{display:none}
  .sb-close{display:inline-flex}
  .layout{display:block;padding:18px 14px 150px}
  .topbar{padding:0 14px;gap:8px}
  .article{padding:22px 18px 26px;border-radius:13px}
  .home-t{font-size:24px}
  .dict-fab{display:flex}
  .pop{right:-8px}
  .art-body p{font-size:calc(var(--read-size) - 1.5px);line-height:1.9}
  .lv-mini{margin:0}
  .fc-word{font-size:31px}
  .lnk-imp{margin-left:0}
  /* 窄屏下单词卡占满整屏，成为独立的一页。
     原来是底部抽屉（只占 64vh），上下都露出主页内容，看着就是几层界面叠在
     一起；屏幕本来就窄，半覆盖既不好看也没多给出可读面积。
     visibility 不加过渡的理由同侧栏：位移动画卡住时也得藏得住。 */
  .dictwrap{position:fixed;inset:0;z-index:60;
    transform:translateY(102%);visibility:hidden;
    transition:transform .26s ease}
  .dictwrap.open{transform:translateY(0);visibility:visible}
  .dict{border-radius:0;max-height:none;height:100%;position:relative;
    border:none;box-shadow:none;padding-top:26px;overflow:auto}
  .dict-close{display:flex}
  .shadowbar{bottom:14px}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important}
}
`;
