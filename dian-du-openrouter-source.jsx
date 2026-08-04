/* ============================================================
   007学英语 · 本地版源代码（OpenRouter 引擎）
   —— 请和 dian-du-openrouter.html 一起保存好！

   基于云端 v9 全功能版改造：storage 换成 localStorage，
   callClaude 换成 OpenRouter 协议（Bearer 认证 + model 可选），
   新增 API Key / 模型 设置页（首次打开会看到）。
   界面、交互逻辑与云端版完全一致，未来云端版再更新，
   把新的 app.jsx 内容整体替换本文件的对应部分即可同步。

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
   dd-stats-v1 / dd-prefs-v1 / dd-or-key / dd-or-model），
   改版时不要改这些键名，否则用户数据会"消失"。
   ============================================================ */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Sparkles, Volume2, Plus, Check, X, RefreshCw,
  Play, Square, Dices, Trash2, Copy, Loader2, BookOpen,
  Brain, BarChart3, Puzzle, Clapperboard, ClipboardCheck,
  ChevronLeft, ChevronRight, RotateCcw, Turtle, Flame,
  Languages, Palette, Upload, Download, FileUp, ChevronDown, MoreHorizontal,
  KeyRound, Settings
} from "lucide-react";
import mammoth from "mammoth";

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

const TOPIC_POOL = [
  "猫为什么会发出咕噜声", "咖啡的环球之旅", "深海里的发光生物",
  "人类为什么会做梦", "一封来自火星的信", "地铁里的陌生人",
  "一家百年面馆的故事", "宇航员的一天", "为什么天空是蓝色的",
  "如果动物会开会", "一座即将消失的小岛", "面包的简史",
];

const CREATOR_POOL = [
  "为什么人们相信自己愿意相信的", "损失厌恶：怕失去大于想得到",
  "从众心理：人多的地方更安全吗", "稀缺感如何让人冲动下单",
  "讲故事为什么比讲道理有效", "第一印象的心理学",
  "为什么坏消息传播更快", "峰终定律：人如何记住一段体验",
  "多巴胺与刷不停的手指", "承诺一致性：小请求变成大让步",
  "光环效应：好看的人更可信吗", "为什么短视频让人上瘾",
];

const VOCAB_KEY = "dd-vocab-v1";
const ARTICLE_KEY = "dd-article-v1";
const STATS_KEY = "dd-stats-v1";
const TABS_KEY = "dd-tabs-v1";
const MAX_TABS = 6;
const APIKEY_STORE = "dd-or-key";
const MODEL_STORE = "dd-or-model";
const DEFAULT_MODEL = "deepseek/deepseek-v4-pro";
const PREFS_KEY = "dd-prefs-v1";

/* ---------- 外观主题 ---------- */
const BASE_VARS = {
  "--paper": "#FCFBF7", "--card": "#FFFFFF", "--ink": "#1C2B45", "--ink2": "#44546E",
  "--mut": "#8B94A6", "--line": "#E7E5DC", "--line2": "#EFEDE5",
  "--blue": "#2F5AA8", "--blue-d": "#24477F", "--blue-bg": "#EDF2FA",
  "--hi": "#FFE873", "--hi-hot": "#FFDF54", "--hi-soft": "#FFF4BE", "--hi-wash": "#FFFAE0",
  "--hi-text": "#7A6200", "--ok": "#2E7D5B", "--ok-bg": "#E8F4EE",
  "--bad": "#B5432F", "--bad-bg": "#FBEFEC",
  "--top": "rgba(252,251,247,.94)", "--sk": "#F7F5EE",
};
const THEMES = {
  paper: { name: "纸白", swatch: "#FCFBF7", vars: BASE_VARS },
  cream: { name: "米黄", swatch: "#F6EFDD", vars: { ...BASE_VARS,
    "--paper": "#F6EFDD", "--card": "#FDF9EE", "--line": "#E5D9BE", "--line2": "#EDE3CC",
    "--top": "rgba(246,239,221,.94)", "--sk": "#F0E7D2" } },
  green: { name: "豆绿", swatch: "#E7EFE2", vars: { ...BASE_VARS,
    "--paper": "#E7EFE2", "--card": "#F6FAF2", "--line": "#D2DEC9", "--line2": "#DDE7D5",
    "--top": "rgba(231,239,226,.94)", "--sk": "#DFE9D6" } },
  dark: { name: "夜间", swatch: "#141926", vars: { ...BASE_VARS,
    "--paper": "#141926", "--card": "#1D2433", "--ink": "#E8ECF5", "--ink2": "#B9C3D6",
    "--mut": "#7E89A0", "--line": "#2C3549", "--line2": "#242C3E",
    "--blue": "#5C8CE6", "--blue-d": "#7AA2EE", "--blue-bg": "#25324C",
    "--hi": "#E9CB45", "--hi-hot": "#F3D855",
    "--hi-soft": "rgba(233,203,69,.30)", "--hi-wash": "rgba(233,203,69,.13)",
    "--hi-text": "#E9CB45", "--ok": "#63C495", "--ok-bg": "#1D3A2E",
    "--bad": "#E28A74", "--bad-bg": "#3B2622",
    "--top": "rgba(20,25,38,.92)", "--sk": "#232B3D" } },
};
const FONT_SIZES = [15, 17, 19, 21, 23];

/* ---------- helpers ---------- */

async function callClaude(prompt, apiKey, model, tools) {
  let res;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        // 注意：HTTP 头的值只能是 ASCII，写中文会让 fetch 直接抛 TypeError
        "X-Title": "007 English Reader",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        ...(tools ? { tools } : {}),
      }),
    });
  } catch (e) {
    throw new Error("NET");
  }
  const data = await res.json();
  if (data.error) {
    const code = data.error.code;
    if (code === 401) throw new Error("KEY");
    if (code === 402) throw new Error("CREDIT");
    if (code === 429) throw new Error("RATE");
    throw new Error("API");
  }
  const text = data.choices?.[0]?.message?.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("API");
  return JSON.parse(clean.slice(s, e + 1));
}

function errText(e) {
  switch (e.message) {
    case "KEY": return "API Key 无效，去设置里检查一下（完整复制，以 sk-or- 开头）。";
    case "CREDIT": return "账户余额不足，去 openrouter.ai 的 Credits 页面充值后再试。";
    case "RATE": return "请求太频繁，等几秒再试一次。";
    case "NET": return "连不上 OpenRouter 服务器，检查网络（国内使用需要开代理），然后重试。";
    default: return "出了点问题，重试一下。";
  }
}

function sGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
function sSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
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
      for (const ln of lines.slice(1)) {
        if (!ln.startsWith("- ")) continue;
        const body = ln.slice(2).trim();
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
        data: { type: "en", word, phonetic_us: phon, phonetic_uk: "", context_cn: null, senses, examples: example ? [example] : [] },
      });
    }
  }
  return out.map((x) => ({
    key: x.word.toLowerCase(), data: x.data, surface: x.word,
    savedAt: Date.now(), meet: 1, rv: { due: Date.now(), iv: 0, streak: 0 },
  }));
}

/* 按完整句子截取到约 maxW 词 */
function truncateWords(text, maxW = 350) {
  const paras = String(text).replace(/\r/g, "").split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  const outP = [];
  let count = 0, cut = false;
  for (const p of paras) {
    if (cut) break;
    const sents = splitSentences(p);
    const keep = [];
    for (const sen of sents) {
      const w = (sen.match(/[A-Za-z]+/g) || []).length;
      if (count + w > maxW && count > 0) { cut = true; break; }
      keep.push(sen);
      count += w;
    }
    if (keep.length) outP.push(keep.join("").trim());
  }
  return { content: outP.join("\n\n"), truncated: cut, words: count };
}

function looksLikeSentence(q) {
  const zh = /[\u4e00-\u9fff]/.test(q);
  if (zh) return q.replace(/\s/g, "").length >= 10 || /[，。！？；]/.test(q);
  const words = q.trim().split(/\s+/).length;
  return words >= 5 || /[.!?;]\s/.test(q.trim());
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

const DAY = 86400000;
function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function calcStreak(log) {
  const active = (d) => {
    const e = log[dateStr(d)];
    return e && (e.a || 0) + (e.q || 0) + (e.r || 0) > 0;
  };
  let t = new Date(); t.setHours(0, 0, 0, 0);
  if (!active(t)) t = new Date(t.getTime() - DAY);
  let n = 0;
  while (active(t)) { n++; t = new Date(t.getTime() - DAY); }
  return n;
}

/* ---------- 主组件 ---------- */

export default function App() {
  const [view, setView] = useState("read");           // read | vocab | stats | review
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("B1");
  const [chipMode, setChipMode] = useState("daily");  // daily | creator
  const [chips, setChips] = useState(() => pickChips(TOPIC_POOL));

  const [tabs, setTabs] = useState([]);                 // [{id,title,content,cn_intro,topic,level,woven[],imported,trans}]
  const [activeId, setActiveId] = useState(null);
  const article = useMemo(() => tabs.find((t) => t.id === activeId) || null, [tabs, activeId]);

  function canOpenNewTab() {
    if (tabs.length >= MAX_TABS) {
      showToast(`最多同时开 ${MAX_TABS} 个标签页，先关掉几个吧`);
      return false;
    }
    return true;
  }
  function closeTab(id) {
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
  const [ideas, setIdeas] = useState({ st: "idle" });   // idle|loading|ok|err
  const [shadow, setShadow] = useState({ on: false, idx: 0, slow: false, waiting: false });
  const [rev, setRev] = useState(null);                 // {queue,i,flip,ok,ng}

  const [prefs, setPrefs] = useState({ theme: "paper", font: "serif", size: 19, voiceURI: "", rate: 1, dictOff: false });
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem(APIKEY_STORE) || ""; } catch (e) { return ""; } });
  const [model, setModel] = useState(() => { try { return localStorage.getItem(MODEL_STORE) || DEFAULT_MODEL; } catch (e) { return DEFAULT_MODEL; } });
  const [showSetup, setShowSetup] = useState(false);
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

  const cacheRef = useRef(new Map());
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
        setTabs(tb.tabs);
        setActiveId(tb.activeId && tb.tabs.some((t) => t.id === tb.activeId) ? tb.activeId : tb.tabs[0].id);
        const cur = tb.tabs.find((t) => t.id === tb.activeId) || tb.tabs[0];
        setTopic(cur.topic || "");
        if (cur.level) setLevel(cur.level);
      } else {
        const a = await sGet(ARTICLE_KEY); // 迁移旧版单文章存档
        if (a && a.content) {
          const id = "t" + Date.now();
          setTabs([{ ...a, id }]);
          setActiveId(id);
          setTopic(a.topic || "");
          if (a.level) setLevel(a.level);
        }
      }
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

  useEffect(() => { if (loaded) sSet(VOCAB_KEY, vocab); }, [vocab, loaded]);
  useEffect(() => { if (loaded) sSet(STATS_KEY, stats); }, [stats, loaded]);
  useEffect(() => { if (loaded) sSet(TABS_KEY, { tabs, activeId }); }, [tabs, activeId, loaded]);
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

  const streak = useMemo(() => calcStreak(stats.log), [stats.log]);
  const dueList = useMemo(
    () => vocab.filter((v) => rvOf(v).due <= Date.now()),
    [vocab]
  );

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
    return article.content
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
    if (!theTopic) { showToast("先输入一个主题吧"); return; }
    if (genLoading) return;
    const wantNewTab = !!(opts && opts.newTab) || !activeId;
    if (wantNewTab && !canOpenNewTab()) return;
    hardStop();
    setGenLoading(true);
    setGenError("");
    const lv = LEVELS.find((l) => l.id === theLevel);

    // 挑最需要复习的生词织进去
    const weave = vocab
      .filter((v) => v.data?.type === "en" && v.data.word && rvOf(v).streak < 2)
      .sort((a, b) => rvOf(a).due - rvOf(b).due)
      .slice(0, 4)
      .map((v) => v.data.word);

    const weaveLine = weave.length
      ? `\n- 请自然地用上这些单词（是学习者的生词，帮 TA 复习）：${weave.join(", ")}。个别词若与该难度实在不符可省略，切勿生硬堆砌`
      : "";

    const prompt = `你是一位专业的英语分级阅读内容作者。请以主题「${theTopic}」为内容，写一篇 ${lv.tag}（CEFR ${lv.id}）水平的英语短文。

严格要求：
- 长度约 ${lv.words} 词，分 2-4 段
- ${lv.spec}
- 内容有趣、有信息量、角度新颖，适合中国英语学习者阅读
- 标题简洁吸引人${weaveLine}

只返回 JSON，不要任何其他文字、解释或 markdown 代码块：
{"title":"英文标题","content":"英文正文，段落之间用\\n\\n分隔","cn_intro":"一句话中文导读，25字以内"}`;

    try {
      const data = await callClaude(prompt, apiKey, model);
      if (!data.title || !data.content) throw new Error("bad");

      // 实际检测哪些生词真的被织进来了
      const woven = weave.filter((w) =>
        new RegExp(`\\b${escapeReg(w)}[a-zA-Z]*\\b`, "i").test(data.content)
      );
      if (woven.length) {
        const set = new Set(woven.map((w) => w.toLowerCase()));
        setVocab((vs) =>
          vs.map((v) =>
            v.data?.type === "en" && set.has((v.data.word || "").toLowerCase())
              ? { ...v, meet: (v.meet || 1) + 1 }
              : v
          )
        );
      }

      const tabId = wantNewTab ? "t" + Date.now() : activeId;
      const art = {
        id: tabId,
        title: data.title,
        content: data.content,
        cn_intro: data.cn_intro || "",
        topic: theTopic,
        level: theLevel,
        woven,
      };
      setTabs((ts) => (wantNewTab ? [...ts, art] : ts.map((x) => (x.id === activeId ? art : x))));
      setActiveId(tabId);
      setLevel(theLevel);
      setView("read");
      setQuiz({ st: "idle" });
      setIdeas({ st: "idle" });
      setShowTrans(false);
      clickedRef.current = new Set();
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
      setGenError(errText(e));
    } finally {
      setGenLoading(false);
    }
  }

  /* ---- 查词 ---- */

  /* 词典面板的开合。桌面端用 prefs.dictOff 记住"用户主动收起"，收起后正文占满整幅；
     移动端仍只看 dictOpen（底部抽屉），CSS 上用媒体查询隔开，两边互不影响。
     任何一次查词都会自动把面板重新展开——点了词却看不到释义是说不通的。 */
  function openDict() {
    setDictOpen(true);
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
    if (/^[a-zA-Z]/.test(q)) clickedRef.current.add(q.toLowerCase());

    const cacheKey = q.toLowerCase() + "||" + (sentence || "");
    const finish = (data) => {
      const lemma = (data.word || data.input || q).toLowerCase();
      const hit = vocab.find(
        (v) =>
          (v.data?.word || "").toLowerCase() === lemma ||
          (v.surface || "").toLowerCase() === q.toLowerCase() ||
          v.key === lemma
      );
      const next = {
        status: "ok", term: q, key, sent: sentence, data,
        meta: hit ? { saved: true, meet: hit.meet || 1 } : null,
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
{"type":"en","word":"单词原形","phonetic_us":"美式音标，含斜杠","phonetic_uk":"英式音标，含斜杠","context_cn":${sentence ? '"该词在上面句子中的准确中文含义，一句话说清"' : "null"},"senses":[{"pos":"词性缩写如 n. / v. / adj.","cn":"中文释义"}],"examples":[{"en":"英文例句","cn":"中文翻译"}]}

senses 按常用程度排列，最多 4 条；examples 恰好 2 条且包含查询词，难度适中。若词条是短语，phonetic 可为 null。`;
    }
    try {
      const data = await callClaude(prompt, apiKey, model);
      if (!data.type) throw new Error("bad");
      cacheRef.current.set(cacheKey, data);
      finish(data);
    } catch (e) {
      setDict({ status: "error", term: q, key, sent: sentence, msg: errText(e) });
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
      const data = await callClaude(prompt, apiKey, model);
      if (data.type !== "tr" || !data.dst) throw new Error("bad");
      if (trunc) data.trunc = true;
      cacheRef.current.set(cacheKey, data);
      setDict({ status: "ok", term: short, data });
    } catch (e) {
      setDict({ status: "error", term: short, trFail: raw, msg: errText(e) });
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
      const data = await callClaude(prompt, apiKey, model);
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
      const data = await callClaude(prompt, apiKey, model);
      if (data.type !== "sent") throw new Error("bad");
      cacheRef.current.set(cacheKey, data);
      setDict({ status: "ok", term: s, data });
    } catch (e) {
      setDict({ status: "error", term: "整句解析", sentFail: s, msg: errText(e) });
    }
  }
  function backToWord() {
    if (lastWordRef.current) setDict(lastWordRef.current);
    else setDict({ status: "idle" });
  }

  function doSearch() {
    const q = search.trim();
    if (!q) return;
    lookup(q);
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
${article.content}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"questions":[{"q":"题干","options":["选项A","选项B","选项C","选项D"],"answer":0,"explain":"一句话中文解析"}]}

题干用中文提问（考察的英文词/句可直接引用原文），answer 是正确选项的下标 0-3。`;
    try {
      const data = await callClaude(prompt, apiKey, model);
      const qs = (data.questions || []).filter(
        (x) => x.q && Array.isArray(x.options) && x.options.length >= 2
      );
      if (!qs.length) throw new Error("bad");
      setQuiz({ st: "on", qs, i: 0, sel: null, score: 0 });
    } catch (e) {
      setQuiz({ st: "err" });
    }
  }
  function pickOption(oi) {
    if (quiz.st !== "on" || quiz.sel !== null) return;
    const right = oi === quiz.qs[quiz.i].answer;
    setQuiz({ ...quiz, sel: oi, score: quiz.score + (right ? 1 : 0) });
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
    setQuiz({ st: "done", qs: quiz.qs, score: quiz.score, adj });
  }

  /* ---- 提炼选题 ---- */
  async function startIdeas() {
    if (!article || ideas.st === "loading") return;
    setIdeas({ st: "loading" });
    const prompt = `你是短视频爆款选题策划，擅长"人性、心理、传播"角度。基于下面这篇英文文章的内容，为中文短视频创作者提炼 3 个选题。

文章《${article.title}》：
${article.content}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"ideas":[{"t":"选题标题（有钩子感，15字以内）","a":"一句话切入角度"}]}`;
    try {
      const data = await callClaude(prompt, apiKey, model);
      if (!Array.isArray(data.ideas) || !data.ideas.length) throw new Error("bad");
      setIdeas({ st: "ok", list: data.ideas.slice(0, 3) });
    } catch (e) {
      setIdeas({ st: "err" });
    }
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
    setIdeas({ st: "idle" });
    setShowTrans(false);
    clickedRef.current = new Set();
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
    const { content, truncated, words } = truncateWords(t, 350);
    if (!content) { setImpErr("没有识别到有效内容"); return; }
    let title = "";
    let body = content;
    const firstLine = content.split("\n")[0].trim();
    if (firstLine.length <= 70 && (firstLine.match(/[A-Za-z]+/g) || []).length <= 12 && content.includes("\n")) {
      title = firstLine.replace(/[#*]+/g, "").trim();
      body = content.split("\n").slice(1).join("\n").trim() || content;
    } else {
      title = content.split(/\s+/).slice(0, 8).join(" ") + "…";
    }
    finishImport({
      title, content: body,
      cn_intro: truncated ? `材料较长，已截取前约 ${words} 词（保持完整句子），确保查词、小测、翻译稳定` : "",
      topic: label, level, imported: true,
    });
  }

  async function importFromUrl() {
    const url = impUrl.trim();
    if (!/^https?:\/\//i.test(url)) { setImpErr("请粘贴以 http(s):// 开头的完整网址"); return; }
    if (impBusy) return;
    setImpBusy(true);
    setImpErr("");
    const prompt = `请用网络搜索工具获取并阅读这个网页的内容：${url}
如果它是视频页面，请尽力找到其英文字幕、台词或内容简介。

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"title":"内容的英文标题","content":"提取的英文正文，段落用\\n\\n分隔，最多 300 词，选取最有阅读价值的部分"}

如果实在无法获取该页面的英文内容，返回：{"error":"一句话中文原因"}`;
    try {
      const data = await callClaude(prompt, apiKey, model, [{ type: "openrouter:web_search" }]);
      if (data.error || !data.content) throw new Error(data.error || "empty");
      const { content, truncated } = truncateWords(data.content, 350);
      const latin = (content.match(/[A-Za-z]/g) || []).length;
      if (latin < 40) throw new Error("thin");
      finishImport({
        title: data.title || hostOf(url),
        content,
        cn_intro: truncated ? "内容较长，已截取（保持完整句子）" : "",
        topic: hostOf(url), level, imported: true,
      });
    } catch (e) {
      setImpErr("没抓到这个页面的英文内容——最稳的办法：把正文（或视频字幕）复制过来，用「粘贴文本」导入");
    } finally {
      setImpBusy(false);
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
      if (/\.docx$/i.test(f.name)) {
        const buf = await f.arrayBuffer();
        const r = await mammoth.extractRawText({ arrayBuffer: buf });
        text = r.value || "";
      } else {
        text = await f.text();
      }
      importFromText(text, f.name);
    } catch (err) {
      setImpErr("这个文件读取失败了——把内容复制出来用「粘贴文本」导入最稳");
    } finally {
      setImpBusy(false);
    }
  }

  /* ---- 全文对照翻译 ---- */
  async function toggleTrans() {
    if (!article) return;
    if (showTrans) { setShowTrans(false); return; }
    if (article.trans) { setShowTrans(true); return; }
    if (transBusy) return;
    setTransBusy(true);
    const paras = article.content.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const prompt = `把下面的英文文章逐段翻译成简洁、自然的中文。原文共 ${paras.length} 段，请保持相同的分段。

${paras.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"trans":["第1段中文译文","第2段中文译文"]}
数组长度必须为 ${paras.length}。`;
    try {
      const data = await callClaude(prompt, apiKey, model);
      let tr = data.trans;
      if (!Array.isArray(tr) || !tr.length) throw new Error("bad");
      if (tr.length > paras.length) {
        tr = tr.slice(0, paras.length - 1).concat(tr.slice(paras.length - 1).join(" "));
      }
      while (tr.length < paras.length) tr.push("");
      setTabs((ts) => ts.map((x) => (x.id === article.id ? { ...x, trans: tr } : x)));
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
    return (
      <div className="app" style={appStyle}>
        <style>{CSS}</style>
        <SetupView
          hasKey={!!apiKey}
          keyDraft={keyDraft}
          setKeyDraft={setKeyDraft}
          modelDraft={modelDraft}
          setModelDraft={setModelDraft}
          onSave={() => {
            const k = keyDraft.trim();
            if (!k) { showToast("请先粘贴 API Key"); return; }
            const m = modelDraft.trim() || DEFAULT_MODEL;
            try { localStorage.setItem(APIKEY_STORE, k); localStorage.setItem(MODEL_STORE, m); } catch (e) {}
            setApiKey(k);
            setModel(m);
            setShowSetup(false);
            showToast("已连接，开始使用吧");
          }}
          onClear={() => {
            try { localStorage.removeItem(APIKEY_STORE); } catch (e) {}
            setApiKey(""); setKeyDraft("");
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

      {/* ======= 顶栏 ======= */}
      <header className="top">
        <div className="top-in">
          <button className="brand2" onClick={() => setView("read")}>007学英语</button>

          <nav className="nav2" aria-label="视图切换">
            <button
              className={view === "read" ? "nl on" : "nl"}
              onClick={() => setView("read")}
            >阅读</button>
            <button
              className={view === "vocab" || view === "review" ? "nl on" : "nl"}
              onClick={() => setView("vocab")}
            >
              生词本{vocab.length > 0 && <span className="nbadge">{vocab.length}</span>}
            </button>
            <button
              className={view === "stats" ? "nl on" : "nl"}
              onClick={() => setView("stats")}
            >统计</button>
          </nav>

          <div className="prefwrap">
            <button className="gearbtn" onClick={() => setPrefsOpen((o) => !o)}
              aria-label="外观设置" title="外观">
              <Palette size={17} />
            </button>
            {prefsOpen && (
              <>
              <div className="popmask" onClick={() => setPrefsOpen(false)} />
              <div className="pop">
                <div className="pop-row">
                  <span className="pop-l">背景</span>
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
                <div className="pop-row">
                  <span className="pop-l">正文字体</span>
                  <div className="chipswitch">
                    <button className={prefs.font === "serif" ? "cs on" : "cs"}
                      onClick={() => setPrefs((p) => ({ ...p, font: "serif" }))}
                      style={{ fontFamily: "var(--serif)" }}>衬线 Aa</button>
                    <button className={prefs.font === "sans" ? "cs on" : "cs"}
                      onClick={() => setPrefs((p) => ({ ...p, font: "sans" }))}>黑体 Aa</button>
                  </div>
                </div>
                <div className="pop-row">
                  <span className="pop-l">字号</span>
                  <div className="sizerow">
                    <button className="szbtn" aria-label="调小"
                      onClick={() => setPrefs((p) => ({ ...p, size: FONT_SIZES[Math.max(0, FONT_SIZES.indexOf(p.size) - 1)] }))}
                    >A−</button>
                    <span className="szval">{prefs.size}</span>
                    <button className="szbtn" aria-label="调大"
                      onClick={() => setPrefs((p) => ({ ...p, size: FONT_SIZES[Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(p.size) + 1)] }))}
                    >A＋</button>
                  </div>
                </div>
                <div className="pop-div" />
                <div className="pop-row">
                  <span className="pop-l">朗读语速</span>
                  <div className="chipswitch">
                    {[["0.75", 0.75, "慢"], ["0.9", 0.9, "稍慢"], ["1", 1, "正常"], ["1.15", 1.15, "快"]].map(([k, val, lb]) => (
                      <button key={k}
                        className={Math.abs((prefs.rate || 1) - val) < 0.01 ? "cs on" : "cs"}
                        onClick={() => setPrefs((p) => ({ ...p, rate: val }))}
                      >{lb}</button>
                    ))}
                  </div>
                </div>
                <div className="pop-row pop-col">
                  <span className="pop-l">朗读声音</span>
                  <select
                    className="vsel"
                    value={prefs.voiceURI || ""}
                    onChange={(e) => setPrefs((p) => ({ ...p, voiceURI: e.target.value }))}
                  >
                    <option value="">自动（已挑选设备里最佳）</option>
                    {enVoices.slice(0, 12).map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} · {v.lang}
                      </option>
                    ))}
                  </select>
                  <button className="btn-gh vtest"
                    onClick={() => speak("Hello! I will be your reading voice. Let's read something together.", "en-US")}
                  ><Volume2 size={14} /> 试听</button>
                  <p className="pop-hint">音质取决于设备内置语音——Windows 用 Edge 浏览器、苹果设备上效果最好。</p>
                </div>
                <div className="pop-div" />
                <div className="pop-row pop-col">
                  <span className="pop-l">API 连接</span>
                  <p className="pop-hint" style={{ margin: "0 0 2px" }}>
                    当前模型：<code>{model}</code>
                  </p>
                  <button className="btn-gh"
                    onClick={() => { setKeyDraft(apiKey); setModelDraft(model); setShowSetup(true); setPrefsOpen(false); }}
                  ><KeyRound size={14} /> 更换 Key / 模型</button>
                </div>
                <button className="pop-reset"
                  onClick={() => setPrefs({ theme: "paper", font: "serif", size: 19, voiceURI: "", rate: 1, dictOff: false })}
                >恢复默认外观</button>
              </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={prefs.dictOff ? "layout nodict" : "layout"}>
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
          ) : view === "stats" ? (
            <StatsView
              stats={stats}
              streak={streak}
              vocabCount={vocab.length}
              dueCount={dueList.length}
              level={LEVELS.find((l) => l.id === level)}
              onGoReview={startReview}
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
              {tabs.length > 0 && (
                <TabBar tabs={tabs} activeId={activeId} onSwitch={switchTab} onClose={closeTab} onNew={openBlankTab} />
              )}
              {!article && !genLoading ? (
            /* ---- 空状态 / 生成器 ---- */
            <div className="hero">
              <p className="eyebrow">
                英 语 分 级 阅 读{streak > 0 && <> · <Flame size={12} /> 连续 {streak} 天</>}
              </p>
              <h1 className="hero-t">
                今天想<span className="mk">读</span>点什么？
              </h1>

              <div className="genrow">
                <input
                  className="topic-in"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") generateArticle(); }}
                  placeholder="输入任意主题，中英文都行，AI 现写一篇给你"
                />
                <button className="btn-pri" onClick={() => generateArticle()}>
                  <Sparkles size={16} /> 生成文章
                </button>
              </div>

              <button className="lnk-imp" onClick={() => { setImpOpen((o) => !o); setImpErr(""); }}>
                <Upload size={13} /> 或者，导入自己的材料读（粘贴 / 文件 / 网址）
                <ChevronDown size={13} className={impOpen ? "flip" : ""} />
              </button>

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
                        <span className="imp-hint">超过约 350 词会自动截取，保证查词、小测、翻译稳定</span>
                      </div>
                    </>
                  )}

                  {impTab === "file" && (
                    <>
                      <label className="filebtn">
                        {impBusy ? <Loader2 size={15} className="spin" /> : <FileUp size={15} />}
                        {impBusy ? " 解析中…" : " 选择文件（.txt / .md / .docx）"}
                        <input type="file" accept=".txt,.md,.docx"
                          style={{ display: "none" }} onChange={handleImportFile} />
                      </label>
                      <p className="imp-hint">PDF 暂不支持——把文字复制出来，用「粘贴文本」导入即可。</p>
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

              <div className="lvline">
                <span className="chips-l">难度</span>
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    className={l.id === level ? "lvt on" : "lvt"}
                    title={l.tag}
                    onClick={() => { setLevel(l.id); setStats((st) => ({ ...st, lv: l.id })); }}
                  >{l.label}</button>
                ))}
                <span className="lv-tag">{LEVELS.find((l) => l.id === level)?.tag}</span>
              </div>

              <div className="chips">
                <div className="chipswitch">
                  <button
                    className={chipMode === "daily" ? "cs on" : "cs"}
                    onClick={() => { setChipMode("daily"); setChips(pickChips(TOPIC_POOL)); }}
                  >日常</button>
                  <button
                    className={chipMode === "creator" ? "cs on" : "cs"}
                    title="心理学与人性主题——练阅读顺手给短视频攒选题"
                    onClick={() => { setChipMode("creator"); setChips(pickChips(CREATOR_POOL)); }}
                  ><Clapperboard size={13} /> 创作素材</button>
                </div>
                {chips.map((c) => (
                  <button key={c} className="chip" onClick={() => setTopic(c)}>{c}</button>
                ))}
                <button
                  className="chip dice"
                  onClick={() => setChips(pickChips(chipMode === "daily" ? TOPIC_POOL : CREATOR_POOL))}
                  aria-label="换一批"
                ><Dices size={14} /></button>
              </div>

              {genError && (
                <div className="err">
                  {genError} <button className="lnk" onClick={() => generateArticle()}>重试</button>
                </div>
              )}
            </div>
          ) : (
            /* ---- 文章 ---- */
            <div className="article">
              <div className="art-bar">
                <button className="btn-gh" onClick={openBlankTab}>
                  <Plus size={15} /> 新文章
                </button>
                <div className="art-acts">
                  <button className="btn-gh" onClick={toggleTrans} disabled={genLoading || transBusy}>
                    {transBusy ? <Loader2 size={14} className="spin" /> : <Languages size={14} />}
                    {transBusy ? "翻译中…" : showTrans ? "隐藏译文" : "译文"}
                  </button>
                  <button className="btn-gh" onClick={toggleReadArticle} disabled={genLoading}>
                    {reading ? <Square size={14} /> : <Play size={14} />}
                    {reading ? "停止" : "朗读"}
                  </button>
                  <button className="btn-gh" onClick={startShadow} disabled={genLoading || shadow.on}>
                    <RotateCcw size={14} /> 跟读
                  </button>
                </div>
              </div>

              {genLoading ? (
                <Skeleton topic={topic || article?.topic} />
              ) : (
                <>
                  <div className="art-meta">
                    {article.imported ? (
                      <>导入材料 · 来源「{article.topic}」</>
                    ) : (
                      <>
                        <span className="lvsel">
                          <button className="meta-btn" onClick={() => setLvMenu((o) => !o)}>
                            {LEVELS.find((l) => l.id === article.level)?.label}
                            {" · "}
                            {LEVELS.find((l) => l.id === article.level)?.tag}
                            <ChevronDown size={12} />
                          </button>
                          {lvMenu && (
                            <>
                              <div className="popmask" onClick={() => setLvMenu(false)} />
                              <div className="menu">
                                {LEVELS.map((l) => (
                                  <button
                                    key={l.id}
                                    className={l.id === article.level ? "mi on" : "mi"}
                                    onClick={() => { setLvMenu(false); generateArticle(article.topic, l.id); }}
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
                        <span className="dotsep">·</span>主题「{article.topic}」
                        <span className="dotsep">·</span>
                        <button className="meta-btn" onClick={() => generateArticle(article.topic)} disabled={genLoading}>
                          <RefreshCw size={12} /> 换一篇
                        </button>
                        <span className="dotsep">·</span>
                        <button className="meta-btn"
                          onClick={() => generateArticle(article.topic, article.level, { newTab: true })}
                          disabled={genLoading}
                        >
                          <Copy size={12} /> 对比一篇
                        </button>
                      </>
                    )}
                  </div>
                  <h2 className="art-title">{article.title}</h2>
                  {article.cn_intro && <p className="art-intro">{article.cn_intro}</p>}
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
                    content={article.content}
                    trans={article.trans}
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
                  <div className="after-row">
                    <button
                      className="btn-soft"
                      onClick={startQuiz}
                      disabled={quiz.st === "loading" || quiz.st === "on"}
                    >
                      {quiz.st === "loading"
                        ? <><Loader2 size={15} className="spin" /> 出题中…</>
                        : <><ClipboardCheck size={15} /> 读后小测</>}
                    </button>
                    <button
                      className="btn-soft"
                      onClick={startIdeas}
                      disabled={ideas.st === "loading"}
                    >
                      {ideas.st === "loading"
                        ? <><Loader2 size={15} className="spin" /> 提炼中…</>
                        : <><Clapperboard size={15} /> 提炼中文选题</>}
                    </button>
                  </div>

                  {quiz.st === "err" && (
                    <div className="err">出题失败了。<button className="lnk" onClick={startQuiz}>重试</button></div>
                  )}
                  {(quiz.st === "on" || quiz.st === "done") && (
                    <QuizBlock quiz={quiz} onPick={pickOption} onNext={nextQuestion}
                      onRetryArticle={() => generateArticle(article?.topic)} />
                  )}

                  {ideas.st === "err" && (
                    <div className="err">提炼失败了。<button className="lnk" onClick={startIdeas}>重试</button></div>
                  )}
                  {ideas.st === "ok" && (
                    <IdeasBlock list={ideas.list} onCopy={copyText} />
                  )}
                </>
              )}
              {genError && (
                <div className="err">
                  {genError} <button className="lnk" onClick={() => generateArticle(article?.topic)}>重试</button>
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

            <div className="dsearch">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                placeholder="查词 / 翻译句子 · 中英互查"
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
                <span className="hw serif">{dict.sentMode ? "整句解析" : dict.term}</span>
                <Loader2 size={18} className="spin" />
                <span className="mut">{dict.sentMode ? "拆句中…" : "查询中…"}</span>
              </div>
            )}

            {dict.status === "error" && (
              <div className="dict-load">
                <span className="hw serif">{dict.term}</span>
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

function SetupView({ hasKey, keyDraft, setKeyDraft, modelDraft, setModelDraft, onSave, onClear, onBack }) {
  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-head"><KeyRound size={20} /> 连接 OpenRouter</div>
        <p className="setup-sub">
          本地版直接调用 OpenRouter 接口，一把密钥可以切换几十家模型。只需设置一次，之后打开就能直接用。
        </p>
        <ol className="setup-steps">
          <li>打开 <b>openrouter.ai</b>，注册或登录</li>
          <li>进入 <b>Keys</b> 页 → <b>Create Key</b>，复制以 <code>sk-or-</code> 开头的密钥</li>
          <li>先充值几美元（或用免费模型试跑），按用量计费</li>
          <li>把密钥粘贴到下面：</li>
        </ol>
        <div className="setup-row">
          <input
            className="setup-in"
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="sk-or-..."
            aria-label="API Key"
          />
        </div>
        <p className="setup-l">模型（可选，留空用默认）</p>
        <div className="setup-row">
          <input
            className="setup-in mono"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
            placeholder={DEFAULT_MODEL}
          />
          <button className="btn-pri" onClick={onSave}>保存并开始</button>
        </div>
        <p className="setup-note">
          填任意 OpenRouter 支持的模型名都行，比如 <code>openai/gpt-5.2</code>、<code>google/gemini-2.5-pro</code>，或更省钱的模型。
          密钥只保存在这台电脑的浏览器里，不会传到 OpenRouter 以外的任何地方。国内使用需要先开启代理。
        </p>
        {hasKey && (
          <div className="setup-acts">
            <button className="btn-gh" onClick={onBack}>返回</button>
            <button className="btn-gh danger-t" onClick={onClear}>清除已保存的密钥</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 标签页栏 ---------- */

function TabBar({ tabs, activeId, onSwitch, onClose, onNew }) {
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div key={t.id} className={t.id === activeId ? "tabchip on" : "tabchip"}>
          <button className="tabchip-btn" onClick={() => onSwitch(t.id)} title={t.title}>
            {t.imported && <FileUp size={11} />}
            {(t.title || "未命名").length > 12 ? t.title.slice(0, 12) + "…" : (t.title || "未命名")}
          </button>
          <button className="tabchip-x" onClick={() => onClose(t.id)} aria-label={`关闭「${t.title}」`}>
            <X size={11} />
          </button>
        </div>
      ))}
      <button className="tabchip-add" onClick={onNew} aria-label="新开标签页" title="新开一页">
        <Plus size={14} />
      </button>
    </div>
  );
}

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

function EnCard({ d, meta, sent, onAnalyze, onSpeak, saved, onSave }) {
  return (
    <div className="card">
      {meta?.saved && (
        <div className="meetb"><Brain size={12} /> 你的生词 · 第 {meta.meet} 次见面</div>
      )}
      <div className="hw serif">{d.word}</div>
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

function QuizBlock({ quiz, onPick, onNext, onRetryArticle }) {
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

/* ---------- 提炼选题 ---------- */

function IdeasBlock({ list, onCopy }) {
  const all = list.map((x, i) => `${i + 1}. ${x.t} —— ${x.a}`).join("\n");
  return (
    <div className="ideas">
      <div className="quiz-head">
        <Clapperboard size={15} /> 可做的中文选题
        <button className="lnk" style={{ marginLeft: "auto" }}
          onClick={() => onCopy(all, "已复制全部选题")}>复制全部</button>
      </div>
      {list.map((x, i) => (
        <div className="idea" key={i}>
          <div className="idea-t">{x.t}</div>
          <div className="idea-a">{x.a}</div>
          <button className="idea-cp" onClick={() => onCopy(`${x.t} —— ${x.a}`, "已复制")}
            aria-label="复制"><Copy size={13} /></button>
        </div>
      ))}
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
          <h2 className="serif">今日复习完成！</h2>
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
          <div className="fc-word serif">{en ? d.word : d.input}</div>
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

function StatsView({ stats, streak, vocabCount, dueCount, level, onGoReview }) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const e = stats.log[dateStr(d)] || {};
    days.push({
      label: d.getDate(),
      val: (e.a || 0) + (e.q || 0) + (e.r || 0),
      today: i === 0,
    });
  }
  const max = Math.max(1, ...days.map((d) => d.val));
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
              <span className="st-n">{stats.total || 0}</span>
              <span className="st-l">累计文章</span>
            </div>
            <div className="st-card">
              <span className="st-n">{vocabCount}</span>
              <span className="st-l">生词总数</span>
            </div>
            <button className="st-card go" onClick={onGoReview}>
              <span className="st-n">{dueCount}</span>
              <span className="st-l">待复习 →</span>
            </button>
          </div>

          <div className="st-chart">
            <div className="sec-l">最近 14 天活跃（读文 + 小测 + 复习）</div>
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

          {level && (
            <p className="st-lv">当前难度：<b>{level.label}</b>（{level.tag}）— 读后小测会自动帮你升降档</p>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- 生词本 ---------- */

function VocabView({ vocab, dueCount, onStartReview, onSpeak, onRemove, onCopy, onDownload, vImpOpen, setVImpOpen, vImpText, setVImpText, onVImport, confirmClear, setConfirmClear, onClear, onLookup }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="vocab">
      <div className="vb-head">
        <h2 className="vb-t"><BookOpen size={19} /> 生词本 <span className="vb-n">{vocab.length}</span></h2>
        <div className="vb-acts">
          {vocab.length > 0 && (
            <button
              className={dueCount ? "btn-pri small" : "btn-gh"}
              onClick={onStartReview}
            >
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
        <div className="vb-list">
          {vocab.map((v) => {
            const d = v.data;
            const r = rvOf(v);
            return (
              <div className="vb-card" key={v.key}>
                <button className="vb-x" onClick={() => onRemove(v.key)} aria-label="移除">
                  <X size={14} />
                </button>
                {d.type === "en" ? (
                  <>
                    <div className="vb-word">
                      <button className="vb-w serif" onClick={() => onLookup(d.word)}>{d.word}</button>
                      {d.phonetic_us && <span className="tr-ph">{d.phonetic_us}</span>}
                      <button className="ex-sp" onClick={() => onSpeak(d.word, "en-US")} aria-label="发音">
                        <Volume2 size={12} />
                      </button>
                    </div>
                    <ul className="senses tight">
                      {(d.senses || []).slice(0, 3).map((s, i) => (
                        <li key={i}><i className="pos">{s.pos}</i><span>{s.cn}</span></li>
                      ))}
                    </ul>
                    {d.examples?.[0] && (
                      <p className="vb-ex">
                        <Boldify text={d.examples[0].en} word={d.word} />
                        <span className="vb-ex-cn"> — {d.examples[0].cn}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="vb-word"><span className="vb-w">{d.input}</span></div>
                    {(d.translations || []).map((t, i) => (
                      <div className="vb-tr" key={i}>
                        <span className="serif"><b>{t.en}</b></span>
                        {t.phonetic_us && <span className="tr-ph">{t.phonetic_us}</span>}
                        <button className="ex-sp" onClick={() => onSpeak(t.en, "en-US")} aria-label="发音">
                          <Volume2 size={12} />
                        </button>
                        {t.pos && <i className="pos">{t.pos}</i>}
                      </div>
                    ))}
                  </>
                )}
                <div className="vb-meta">
                  {r.due <= Date.now()
                    ? <span className="due">待复习</span>
                    : <span className="mut">连对 {r.streak} 次 · 见过 {v.meet || 1} 次</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- 骨架屏 ---------- */

function Skeleton({ topic }) {
  return (
    <div className="skel">
      <div className="skel-note">
        <Loader2 size={15} className="spin" /> 正在为你现写一篇「{topic}」…
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
  --paper:#FCFBF7; --card:#FFFFFF; --ink:#1C2B45; --ink2:#44546E; --mut:#8B94A6;
  --line:#E7E5DC; --line2:#EFEDE5;
  --blue:#2F5AA8; --blue-d:#24477F; --blue-bg:#EDF2FA;
  --hi:#FFE873; --hi-hot:#FFDF54; --hi-soft:#FFF4BE; --hi-wash:#FFFAE0; --hi-text:#7A6200;
  --ok:#2E7D5B; --ok-bg:#E8F4EE; --bad:#B5432F; --bad-bg:#FBEFEC;
  --top:rgba(252,251,247,.94); --sk:#F7F5EE;
  --read-size:19px; --read-font:Georgia,'Iowan Old Style','Times New Roman','Songti SC',STSong,serif;
  --serif:Georgia,'Iowan Old Style','Times New Roman','Songti SC',STSong,serif;
  --sans:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
.app{min-height:100vh;background:var(--paper);color:var(--ink);font-family:var(--sans);
  -webkit-font-smoothing:antialiased}
button{font-family:var(--sans);cursor:pointer;background:none;border:none;color:inherit}
button:disabled{opacity:.55;cursor:default}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:4px}
.serif{font-family:var(--serif)}
.mut{color:var(--mut);font-size:13px}
.spin{animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

/* ---- 顶栏 ---- */
.top{position:sticky;top:0;z-index:40;background:var(--top);backdrop-filter:blur(8px)}
.top-in{max-width:1120px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:22px}
.brand2{font-family:var(--serif);font-weight:700;font-size:15px;letter-spacing:3px;color:var(--ink)}
.nav2{display:flex;gap:20px;margin:0 auto}
.nl{font-size:13.5px;color:var(--mut);padding:3px 1px;letter-spacing:.5px;display:inline-flex;align-items:center;gap:5px;
  border-bottom:2px solid transparent}
.nl:hover{color:var(--ink)}
.nl.on{color:var(--ink);font-weight:600;border-bottom-color:var(--hi-hot)}
.nbadge{background:var(--hi);color:#1C2B45;border-radius:99px;font-size:10.5px;font-weight:700;
  padding:1px 6px;line-height:1.5}

/* ---- 布局 ---- */
.layout{max-width:1120px;margin:0 auto;padding:26px 20px 120px;display:grid;
  grid-template-columns:minmax(0,1fr) 340px;gap:30px;align-items:start}
.mainc{min-width:0}

/* ---- 空状态 / 生成器 ---- */
.hero{padding:52px 0 20px;max-width:640px}
.eyebrow{display:flex;align-items:center;gap:6px;font-size:12px;letter-spacing:4px;color:var(--mut)}
.eyebrow svg{color:#E0862B}
.hero-t{font-family:var(--serif);font-size:clamp(36px,5.2vw,58px);font-weight:700;letter-spacing:2px;
  line-height:1.28;margin-top:16px}
.mk{background:linear-gradient(100deg,var(--hi) 8%,var(--hi-soft) 96%);border-radius:6px;padding:0 6px;color:#1C2B45}
.genrow{display:flex;gap:14px;margin-top:34px;flex-wrap:wrap;align-items:flex-end}
.topic-in{flex:1;min-width:240px;font-size:17px;padding:10px 2px;border:none;
  border-bottom:2px solid var(--line);border-radius:0;background:none;color:var(--ink);
  outline:none;font-family:var(--sans)}
.topic-in:focus{border-bottom-color:var(--ink)}
.btn-pri{display:inline-flex;align-items:center;gap:7px;background:var(--ink);color:var(--paper);
  font-size:14.5px;font-weight:600;padding:12px 24px;border-radius:99px}
.btn-pri:hover{opacity:.88}
.btn-pri.small{font-size:13px;padding:8px 16px}
.lvline{display:flex;align-items:center;gap:16px;margin-top:30px;flex-wrap:wrap}
.lvt{font-size:14px;color:var(--mut);padding:3px 1px;border-bottom:2px solid transparent}
.lvt:hover{color:var(--ink)}
.lvt.on{color:var(--ink);font-weight:700;border-bottom-color:var(--hi-hot)}
.lv-tag{font-size:12px;color:var(--mut)}
.chips-l{font-size:13px;color:var(--mut)}
.lnk-imp{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-size:13.5px;
  color:var(--ink2);padding:5px 2px;border-radius:6px}
.lnk-imp:hover{color:var(--blue)}
.lnk-imp .flip{transform:rotate(180deg)}
.lnk-imp svg{transition:transform .18s}
.chipswitch{display:flex;background:var(--line2);border-radius:9px;padding:3px}
.cs{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;padding:5px 12px;border-radius:7px;color:var(--ink2)}
.cs.on{background:var(--card);color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(28,43,69,.10)}
.chips{display:flex;align-items:center;gap:8px;margin-top:16px;flex-wrap:wrap}
.chip{font-size:13px;padding:4px 6px;border-radius:6px;border:none;
  background:none;color:var(--ink2)}
.chip:hover{background:linear-gradient(100deg,var(--hi) 4%,var(--hi-soft) 96%);color:#1C2B45}
.chip.dice{display:inline-flex;align-items:center;gap:5px;color:var(--mut)}
.err{margin-top:20px;background:var(--bad-bg);border:1px solid transparent;color:var(--bad);
  border-radius:10px;padding:11px 14px;font-size:14px}
.lnk{color:var(--blue);text-decoration:underline;font-size:inherit}

/* ---- 文章 ---- */
.art-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:22px}
.btn-gh{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink2);
  border:none;background:none;border-radius:8px;padding:7px 9px}
.btn-gh:hover{color:var(--ink);background:var(--line2)}
.btn-soft{display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:600;color:var(--ink);
  border:none;background:var(--line2);border-radius:99px;padding:10px 18px}
.btn-soft:hover{background:var(--hi-soft);color:#1C2B45}
.btn-soft.small{font-size:13px;padding:7px 12px;margin-left:10px}
.lv-mini{display:flex;background:var(--line2);border-radius:9px;padding:3px}
.lvm{font-size:12.5px;padding:5px 11px;border-radius:7px;color:var(--ink2)}
.lvm.on{background:var(--ink);color:var(--paper);font-weight:600}
.art-acts{display:flex;gap:8px;flex-wrap:wrap}
.art-meta{font-size:12.5px;color:var(--mut);letter-spacing:.3px;margin-bottom:8px}
.art-title{font-family:var(--serif);font-size:clamp(28px,3.8vw,42px);font-weight:700;line-height:1.3;letter-spacing:.5px}
.art-intro{margin-top:12px;color:var(--ink2);font-size:14.5px;padding-left:12px;
  border-left:4px solid var(--hi)}
.woven-note{margin-top:12px;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;
  color:var(--hi-text);background:var(--hi-wash);border:1px dashed var(--hi-hot);border-radius:9px;padding:6px 11px}
.art-body{margin-top:22px}
.art-body .pwrap{margin-bottom:1.15em;max-width:66ch}
.art-body p{font-family:var(--read-font);font-size:var(--read-size);line-height:1.95;
  letter-spacing:.15px;margin-bottom:0}
.para-cn{font-family:var(--sans)!important;font-size:14px!important;line-height:1.75!important;
  color:var(--ink2);margin-top:6px!important;padding:8px 12px;background:var(--hi-wash);
  border-left:3px solid var(--hi);border-radius:0 8px 8px 0}
.sen{border-radius:4px;transition:background .2s}
.sen.on{background:linear-gradient(100deg,rgba(255,232,115,.55),rgba(255,244,190,.55));
  box-decoration-break:clone;-webkit-box-decoration-break:clone}
.w{cursor:pointer;border-radius:4px;padding:0 1px;margin:0 -1px;transition:background .12s}
.w:hover{background:linear-gradient(100deg,var(--hi) 4%,var(--hi-soft) 96%);color:#1C2B45}
.w.act{background:var(--hi-hot);color:#1C2B45}
.w.sav{background:var(--hi-wash);box-shadow:inset 0 -6px 0 var(--hi-soft)}
.w.wov{background:var(--hi-soft);box-shadow:inset 0 -2px 0 var(--hi-hot)}
.after-row{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap}

/* ---- 小测 ---- */
.quiz{margin-top:20px;background:var(--card);border:none;border-radius:16px;padding:20px}
.quiz-head{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700}
.quiz-q{margin-top:12px;font-size:15.5px;line-height:1.7}
.qopts{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.qopt{display:flex;align-items:flex-start;gap:9px;text-align:left;font-size:14.5px;line-height:1.55;
  border:1.5px solid var(--line);border-radius:10px;padding:10px 13px;background:var(--paper)}
.qopt:hover{border-color:var(--blue)}
.qletter{flex:none;width:22px;height:22px;border-radius:7px;background:var(--line2);
  display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.qopt.right{border-color:var(--ok);background:var(--ok-bg)}
.qopt.right .qletter{background:var(--ok);color:#fff}
.qopt.wrong{border-color:var(--bad);background:var(--bad-bg)}
.qopt.wrong .qletter{background:var(--bad);color:#fff}
.qopt.dim{opacity:.55}
.qexp{margin-top:12px;font-size:14px;line-height:1.7;background:var(--paper);border-radius:10px;
  padding:11px 13px;display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.quiz-done{text-align:center;padding:8px 0 4px}
.quiz-score{font-size:22px;font-weight:800;font-family:var(--serif)}
.quiz-adj{margin:12px 0 14px;font-size:14px;color:var(--ink2)}
.quiz-adj.up{color:var(--ok);background:var(--ok-bg);border-radius:9px;padding:8px 12px;display:inline-block}
.quiz-adj.down{color:var(--bad);background:var(--bad-bg);border-radius:9px;padding:8px 12px;display:inline-block}

/* ---- 选题 ---- */
.ideas{margin-top:20px;background:var(--card);border:none;border-radius:16px;padding:20px}
.idea{position:relative;padding:11px 34px 11px 0;border-bottom:1px dashed var(--line2)}
.idea:last-child{border-bottom:none}
.idea-t{font-weight:700;font-size:15px}
.idea-a{margin-top:3px;font-size:13.5px;color:var(--ink2)}
.idea-cp{position:absolute;right:0;top:12px;color:var(--mut);padding:5px;border-radius:7px}
.idea-cp:hover{background:var(--line2);color:var(--ink)}

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
.dictwrap{position:sticky;top:78px}
.dict{background:var(--card);border:none;border-radius:18px;padding:20px;
  max-height:calc(100vh - 110px);overflow:auto;box-shadow:0 4px 22px rgba(28,43,69,.08)}
.dict-close{display:flex;position:absolute;top:10px;right:12px;color:var(--mut);
  background:var(--line2);border-radius:99px;padding:6px}
.dsearch{display:flex;align-items:center;gap:8px;border-bottom:1.5px solid var(--line);
  padding:2px 2px 9px;margin-bottom:14px;color:var(--mut)}
.dsearch input{border:none;outline:none;background:none;flex:1;min-width:0;font-size:14px;color:var(--ink)}
.dsearch:focus-within{border-bottom-color:var(--ink)}
.dict-fab{display:none;position:fixed;right:18px;bottom:86px;z-index:58;width:46px;height:46px;
  border-radius:99px;background:var(--ink);color:var(--paper);align-items:center;justify-content:center;
  box-shadow:0 8px 22px rgba(28,43,69,.3)}
.dict-idle{text-align:center;padding:26px 8px;color:var(--ink2);font-size:14px}
.dict-idle p{margin-top:10px}
.dict-idle-mark{width:58px;height:36px;margin:0 auto;background:var(--hi);color:#1C2B45;
  font-family:var(--sans);font-weight:800;font-size:15px;letter-spacing:1.5px;border-radius:11px;
  display:flex;align-items:center;justify-content:center;transform:rotate(-4deg)}
.dict-load{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:6px 2px}
.hw{font-size:29px;font-weight:700;line-height:1.2;word-break:break-word}
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
.sentbtn{display:inline-flex;align-items:center;gap:6px;margin-top:12px;font-size:13px;
  color:var(--blue);border:1px dashed var(--blue);border-radius:9px;padding:6px 12px;background:var(--blue-bg)}
.sentbtn:hover{background:#E2EBF8}
.senses{list-style:none;margin-top:14px}
.senses li{display:flex;gap:9px;padding:6px 0;font-size:14.5px;line-height:1.6;
  border-bottom:1px dashed var(--line2)}
.senses li:last-child{border-bottom:none}
.senses.tight li{padding:3px 0;font-size:13.5px;border:none}
.pos{flex:none;font-family:var(--serif);color:var(--blue);font-size:13px;padding-top:2px}
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
  background:var(--ink);color:var(--paper);font-size:14px;font-weight:600;border-radius:10px;padding:11px}
.btn-save:hover{opacity:.9}
.btn-save.on{background:var(--hi-wash);color:var(--ink);border:1.5px solid var(--hi-hot)}
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
.flipcard{margin-top:26px;background:var(--card);border:none;border-radius:20px;
  padding:34px 26px;box-shadow:0 3px 16px rgba(28,43,69,.06);text-align:center}
.fc-word{font-size:38px;font-weight:800;line-height:1.2;word-break:break-word}
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
.st-card{background:var(--card);border:none;border-radius:16px;padding:16px 14px;text-align:center}
.st-card.go{cursor:pointer}
.st-card.go:hover{box-shadow:0 3px 14px rgba(28,43,69,.10)}
.st-card.go .st-l{color:var(--blue);font-weight:700}
.st-n{font-family:var(--serif);font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--ink)}
.st-n svg{color:#E0862B}
.st-l{display:block;margin-top:4px;font-size:12.5px;color:var(--mut)}
.st-chart{margin-top:22px;background:var(--card);border:none;border-radius:16px;padding:18px}
.bars{display:flex;align-items:flex-end;gap:6px;height:100px;margin-top:10px}
.barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;justify-content:flex-end}
.bar{width:100%;max-width:22px;background:var(--ink);border-radius:5px 5px 2px 2px}
.bar.today{background:var(--hi-hot)}
.bar-l{font-size:10px;color:var(--mut);height:12px}
.st-lv{margin-top:18px;font-size:13.5px;color:var(--ink2)}

/* ---- 生词本 ---- */
.vb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  margin:8px 0 20px}
.vb-t{font-family:var(--serif);font-size:24px;display:flex;align-items:center;gap:9px}
.vb-n{font-size:14px;background:var(--hi);color:#1C2B45;border-radius:99px;padding:2px 11px;font-family:var(--sans)}
.vb-acts{display:flex;gap:8px;flex-wrap:wrap}
.btn-danger{font-size:13px;background:#B5432F;color:#fff;border-radius:9px;padding:7px 12px}
.vb-empty{text-align:center;padding:70px 20px;color:var(--ink2);font-size:15px}
.vb-empty p{margin-top:12px}
.vb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.vb-card{position:relative;background:var(--card);border:none;border-radius:16px;
  padding:16px 16px 12px}
.vb-x{position:absolute;top:10px;right:10px;color:var(--mut);padding:4px;border-radius:6px}
.vb-x:hover{background:var(--line2);color:var(--ink)}
.vb-word{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-right:24px}
.vb-w{font-size:19px;font-weight:700;color:var(--ink)}
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
  display:flex;align-items:center;gap:8px;background:#1C2B45;color:#fff;border-radius:99px;
  padding:9px 12px 9px 18px;box-shadow:0 10px 30px rgba(28,43,69,.35);max-width:94vw;flex-wrap:wrap;justify-content:center}
.sb-idx{font-size:12.5px;color:#B9C4D8;font-variant-numeric:tabular-nums}
.sb-hint{font-size:13px}
.sb-btn{display:inline-flex;align-items:center;gap:4px;color:#fff;background:rgba(255,255,255,.14);
  border-radius:99px;padding:7px 10px;font-size:13px}
.sb-btn:hover{background:rgba(255,255,255,.25)}
.sb-btn.on{background:var(--hi);color:#1C2B45}
.sb-btn.pri{background:var(--hi);color:#1C2B45;font-weight:700;padding:7px 14px}
.sb-btn.pri:hover{background:var(--hi-hot)}

/* ---- toast ---- */
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:99;
  background:var(--ink);color:var(--paper);font-size:13.5px;border-radius:99px;padding:9px 20px;
  box-shadow:0 6px 20px rgba(28,43,69,.25);animation:up .2s ease}
@keyframes up{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}

/* ---- 外观设置 ---- */
.prefwrap{position:relative}
.gearbtn{display:inline-flex;color:var(--ink2);padding:10px;border-radius:99px;border:none;
  background:var(--card);box-shadow:0 2px 10px rgba(28,43,69,.10)}
.gearbtn:hover{color:var(--ink);box-shadow:0 3px 14px rgba(28,43,69,.16)}
.pop{position:absolute;right:0;top:44px;z-index:70;width:284px;background:var(--card);
  border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 12px 34px rgba(28,43,69,.16)}
.pop-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0}
.pop-l{font-size:12.5px;color:var(--mut)}
.swrow{display:flex;gap:7px}
.sw{width:26px;height:26px;border-radius:99px;border:2px solid var(--line);font-size:12px;
  color:#1C2B45;display:inline-flex;align-items:center;justify-content:center}
.sw.on{border-color:var(--blue)}
.sw[title="夜间"]{color:#E8ECF5}
.sizerow{display:flex;align-items:center;gap:8px}
.szbtn{font-size:13px;font-weight:700;border:1px solid var(--line);border-radius:8px;padding:4px 9px;background:var(--paper)}
.szbtn:hover{border-color:var(--blue);color:var(--blue)}
.szval{font-size:13px;color:var(--ink2);min-width:20px;text-align:center;font-variant-numeric:tabular-nums}
.pop-div{height:1px;background:var(--line2);margin:8px 0}
.pop-col{flex-direction:column;align-items:stretch;gap:8px}
.vsel{width:100%;font-size:13px;color:var(--ink);background:var(--paper);border:1.5px solid var(--line);
  border-radius:9px;padding:8px 10px;outline:none;font-family:var(--sans)}
.vsel:focus{border-color:var(--blue)}
.vtest{align-self:flex-start}
.pop-hint{font-size:11.5px;color:var(--mut);line-height:1.6}
.pop-reset{width:100%;margin-top:8px;font-size:12.5px;color:var(--mut);padding:6px;border-radius:8px}
.pop-reset:hover{background:var(--line2);color:var(--ink)}

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
  background:#1C2B45;color:#fff;font-size:13px;font-weight:600;border-radius:99px;padding:7px 14px;
  box-shadow:0 8px 22px rgba(28,43,69,.32)}
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
  width:24px;height:24px;border-radius:99px;background:var(--hi);color:#1C2B45}
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
  border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 12px 34px rgba(28,43,69,.16)}
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
.tabbar{display:flex;align-items:center;gap:3px;margin-bottom:22px;overflow-x:auto;padding-bottom:3px}
.tabchip{display:flex;align-items:center;flex:none}
.tabchip-btn{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--mut);
  padding:7px 4px 7px 11px;border-radius:8px 0 0 8px;white-space:nowrap;max-width:160px;
  overflow:hidden;text-overflow:ellipsis}
.tabchip.on .tabchip-btn{color:var(--ink);font-weight:600;background:var(--line2)}
.tabchip:hover .tabchip-btn{color:var(--ink)}
.tabchip-x{color:var(--mut);padding:6px 9px 6px 3px;border-radius:0 8px 8px 0}
.tabchip.on .tabchip-x{background:var(--line2)}
.tabchip-x:hover{color:var(--bad)}
.tabchip-add{flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:27px;height:27px;border-radius:99px;color:var(--mut);margin-left:5px}
.tabchip-add:hover{background:var(--line2);color:var(--ink)}

/* ---- API 设置页 ---- */
.setup{max-width:600px;margin:0 auto;padding:64px 24px 100px}
.setup-card{background:var(--card);border-radius:20px;padding:34px 30px;
  box-shadow:0 4px 26px rgba(28,43,69,.08)}
.setup-head{display:flex;align-items:center;gap:10px;font-family:var(--serif);font-size:25px;font-weight:700}
.setup-sub{margin-top:12px;color:var(--ink2);font-size:14.5px;line-height:1.75}
.setup-steps{margin:20px 0 0 20px;font-size:14.5px;line-height:2.15}
.setup-steps code{background:var(--line2);border-radius:5px;padding:1px 6px;font-size:13px}
.setup-l{margin-top:16px;font-size:12px;color:var(--mut)}
.setup-row{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
.setup-in{flex:1;min-width:200px;font-size:14px;padding:12px 14px;border:none;
  border-bottom:2px solid var(--line);border-radius:0;background:none;color:var(--ink);outline:none}
.setup-in.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.setup-in:focus{border-bottom-color:var(--ink)}
.setup-note{margin-top:16px;font-size:12px;color:var(--mut);line-height:1.75}
.setup-note code{background:var(--line2);border-radius:5px;padding:1px 5px}
.setup-acts{display:flex;gap:10px;margin-top:20px}
.danger-t{color:var(--bad)}
.danger-t:hover{background:var(--bad-bg)}

/* ---- 桌面端：手动收起词典 ----
   880px 以上才生效，正好和下面的移动端断点错开，收起状态不会波及手机的抽屉。 */
@media (min-width:881px){
  .layout.nodict{grid-template-columns:minmax(0,1fr)}
  .layout.nodict .dictwrap{display:none}
  .dict-fab.show{display:flex}
}

/* ---- 移动端 ---- */
@media (max-width:880px){
  .layout{display:block;padding:20px 16px 150px}
  .top-in{gap:12px;padding:13px 16px}
  .nav2{gap:14px}
  .dict-fab{display:flex}
  .pop{right:-8px}
  .art-body p{font-size:calc(var(--read-size) - 1.5px);line-height:1.9}
  .lv-mini{margin:0}
  .fc-word{font-size:31px}
  .dictwrap{position:fixed;left:0;right:0;bottom:0;z-index:60;
    transform:translateY(112%);transition:transform .26s ease}
  .dictwrap.open{transform:translateY(0)}
  .dict{border-radius:18px 18px 0 0;max-height:64vh;position:relative;
    box-shadow:0 -10px 34px rgba(28,43,69,.22);padding-top:24px}
  .dict-close{display:flex}
  .shadowbar{bottom:14px}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important}
}
`;
