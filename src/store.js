/* ============================================================
   大脑：全部状态和动作都在这里，界面（views/）只负责画和转发点击。

   这一整块是从旧版 App 组件里**逐行原样**搬过来的。里面每个计数器
   （xxxReqRef）、每次 reset 都对应一个修过的 bug——慢请求盖掉新结果、
   换文章后旧译文写回来之类。改这里之前先读懂它在防什么。
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { LEVELS } from "./data/levels.js";
import { FETCH_WORDS, MAX_DOC_CHARS, MAX_TABS } from "./data/limits.js";
import { loadKeyMap, loadModelMap, loadProviderId, providerOf } from "./data/providers.js";
import { THEMES } from "./data/themes.js";
import { TOPIC_CATS, catOf } from "./data/topics.js";
import { LIB_KEY, callClaude, errText, fetchPageText, libFetch } from "./lib/api.js";
import { epubToText } from "./lib/epub.js";
import { clampRate, scoreVoice } from "./lib/speech.js";
import {
  ARTICLE_KEY, HISTORY_KEY, KEYS_STORE, MODELS_STORE, PREFS_KEY, PROVIDER_STORE, STATS_KEY,
  TABS_KEY, VOCAB_KEY, isFullEntry, loadBookCache, loadDictCache, loadSeen, sGet, sSet,
  saveBookCache, saveDictCache, saveSeen, stripCtx, trimHistory,
} from "./lib/storage.js";
import {
  DAY, calcStreak, countWords, dateStr, escapeReg, hostOf, looksLikeSentence, normalizeTab,
  pickChips, samePage, splitChapters, splitSentences,
} from "./lib/text.js";
import {
  WEAVE_MAX, buildVocabMd, isMastered, parseVocabMd, rvOf, validQuizQuestions, weaveTermOf,
} from "./lib/vocab.js";
import mammoth from "mammoth";

export function useStore() {
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
  /* 「我正在主页」是一件独立的事，不能拿 activeId=null 表示——那样一进主页
     就把「我在读哪篇」一起丢了，再点「阅读」没东西可回。文章始终留着。 */
  const [homeMode, setHomeMode] = useState(false);
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
    resetReadingContext();
    setTabs((ts) => ts.map((x) => (x.id === article.id ? { ...x, ch: n } : x)));
    window.scrollTo({ top: 0 });
  }

  function canOpenNewTab() {
    if (tabs.length >= MAX_TABS) {
      showToast(`最多同时开 ${MAX_TABS} 个标签页，先关掉几个吧`);
      return false;
    }
    return true;
  }
  /* 不猜 localStorage 的剩余空间：浏览器配额以及其他应用数据都不稳定。
     先尝试保存候选快照；失败时不更新内存 UI，避免刷新后“文章消失”。 */
  function persistTabs(nextTabs, nextActiveId) {
    if (sSet(TABS_KEY, { tabs: nextTabs, activeId: nextActiveId })) return true;
    showToast("浏览器存储空间不足：这篇文章没有打开。请先关闭或删除一些长文后再试");
    return false;
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
    // 即使关闭的是后台标签，也不能让待返回的译文用旧 tabs 快照把它写回来。
    ++transReqRef.current;
    setTransBusy(false);
    if (id === activeId) {
      resetReadingContext();
      cancelArticleGeneration();
    }
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
    const nextTabs = [...tabs, art];
    if (!persistTabs(nextTabs, h.id)) return;
    resetReadingContext();
    cancelArticleGeneration();
    setTabs(nextTabs);
    setActiveId(h.id);
    setView("read");
    window.scrollTo({ top: 0 });
  }

  function removeHistory(id) {
    setHistory((hs) => hs.filter((h) => h.id !== id));
    showToast("已从「读过的」移除");
  }

  /* 生成、导入、教材取来读、点继续读……凡是换了文章的地方都会动 activeId，
     在这里统一退出主页模式，比在每个入口补一句可靠——漏一处就会出现
     「文章已经生成好了，却还停在主页」。 */
  useEffect(() => { if (activeId) setHomeMode(false); }, [activeId]);

  function switchTab(id) {
    setHomeMode(false);
    if (id === activeId) return;
    hardStop();
    resetReadingContext();
    cancelArticleGeneration();
    setActiveId(id);
  }
  function openBlankTab() {
    hardStop();
    resetReadingContext();
    cancelArticleGeneration();
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

  const [prefs, setPrefs] = useState({ theme: "paper", font: "serif", size: 19, voiceURI: "", rate: 1, dictOff: false, navFold: false });
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
  // 每条异步通道只允许最新请求更新界面，避免慢请求覆盖新操作的结果。
  const dictReqRef = useRef(0);
  const articleReqRef = useRef(0);
  const importReqRef = useRef(0);
  const quizReqRef = useRef(0);
  const transReqRef = useRef(0);
  const wordChatReqRef = useRef(0);
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

  function resetReadingContext() {
    ++dictReqRef.current;
    ++quizReqRef.current;
    ++transReqRef.current;
    ++wordChatReqRef.current;
    setDict({ status: "idle" });
    setCtxBusy(false);
    setWchat({ word: null, msgs: [], busy: false });
    setQuiz({ st: "idle" });
    setTransBusy(false);
    setShowTrans(false);
    clickedRef.current = new Set();
    setClicks(0);
    setLvHint(null);
    setSelTip(null);
    lastLookupRef.current = null;
    lastWordRef.current = null;
  }

  function cancelArticleGeneration() {
    if (!genLoading) return;
    ++articleReqRef.current;
    setGenLoading(false);
    setGenError("");
  }

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

  /* 配色写在样式表里（styles/tokens.css 的 [data-theme]），这里只把「选了哪套」
     挂到 <html> 上——挂在最外层，页面边缘和滚动回弹处的底色才会跟着变。 */
  useEffect(() => {
    document.documentElement.dataset.theme = THEMES[prefs.theme] ? prefs.theme : "paper";
  }, [prefs.theme]);
  const appStyle = useMemo(() => ({
    "--read-size": prefs.size + "px",
    "--read-font": prefs.font === "serif" ? "var(--read-serif)" : "var(--sans)",
  }), [prefs.size, prefs.font]);

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
    const request = ++articleReqRef.current;

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
      if (request !== articleReqRef.current) return;
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
      const nextTabs = wantNewTab ? [...tabs, art] : tabs.map((x) => (x.id === activeId ? art : x));
      if (!persistTabs(nextTabs, tabId)) return;
      // 原地替换会把当前这篇彻底覆盖掉，确认新快照能存下后再归档。
      if (!wantNewTab) archive(tabs.find((t) => t.id === activeId));
      resetReadingContext();
      setTabs(nextTabs);
      setActiveId(tabId);
      setLevel(theLevel);
      setView("read");
      /* 原地替换时文章的 id 没变，上面那个「activeId 变了就退出主页」的统一出口
         不会触发——不补这一句，在主页点完「现写」，文章写好了人却还停在主页。 */
      setHomeMode(false);
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
      if (request === articleReqRef.current) setGenError(errText(e, providerId));
    } finally {
      if (request === articleReqRef.current) setGenLoading(false);
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
    const request = ++dictReqRef.current;
    ++wordChatReqRef.current;
    setCtxBusy(false);
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
      if (request !== dictReqRef.current) return;
      /* 计数只能先按「你输进去的那串字」记——查之前谁也不知道正确的词是什么。
         模型判定拼错了，就把这一笔挪到正确拼写名下：不然 recieve 和 receive
         各算一次，「这个词你查过 N 次」永远凑不齐，统计里还会多出一个
         根本不存在的词。只认 typo，词形变化（running→run）不并，
         那是两个都真实存在的形态。 */
      let cnt = ql;
      const fixed = (data.typo || "").toLowerCase();
      if (fixed && fixed !== ql) {
        seenRef.current[fixed] = (seenRef.current[fixed] || 0) + (seenRef.current[ql] || 1);
        delete seenRef.current[ql];
        seenRef.current = saveSeen(seenRef.current);
        if (clickedRef.current.delete(ql)) {
          clickedRef.current.add(fixed);
          setClicks(clickedRef.current.size);
        }
        cnt = fixed;
      }
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
          seen: seenRef.current[cnt] || 1,
          // 卡片要拿它跟 typo 比：只有「这次真的输错了」才提示。
          // 后来直接输正确拼写命中同一条缓存时，不该再跳纠错条
          raw: q,
        },
      };
      setDict(next);
      if (data.type === "en" || data.type === "zh") lastWordRef.current = next;
      if (data.type === "en") setWchat((w) => w.word === data.word
        ? { ...w, busy: false }
        : { word: data.word, msgs: [], busy: false });
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
{"type":"en","word":"单词原形","typo":"若查询词拼写有误，填正确拼写；拼写本身没问题就填 null","form":"查询词相对原形是什么词形，如 现在分词／过去式／过去分词／复数／第三人称单数／比较级／最高级；查询词本身就是原形就填 null","phonetic_us":"美式音标，含斜杠","phonetic_uk":"英式音标，含斜杠","context_cn":${sentence ? '"该词在上面句子中的准确中文含义，一句话说清"' : "null"},"tech_cn":"该词在计算机／IT 领域的专门含义，白话说清，不超过 40 字；没有专门含义就填 null","senses":[{"pos":"词性缩写如 n. / v. / adj.","cn":"中文释义"}],"examples":[{"en":"英文例句","cn":"中文翻译"}]}

若查询词只是拼错了（如 recieve、beleive、occassion、seperate），按你判断出的正确单词查，word 填正确的词，同时把正确拼写填进 typo。词形变化不算拼错：running、went、better、mice 这类一律 typo 填 null。
查询词是变形时，word 一律还原成原形，并把变形的名称填进 form：查 shaking → word 填 shake、form 填「现在分词」；查 went → word 填 go、form 填「过去式」；查 shake 本身 → form 填 null。
若查询词根本不是英文单词或词组（随手敲的乱码、无意义字母串），只返回 {"type":"none"} 这一个字段，不要编造任何释义。

senses 按常用程度排列，最多 4 条；examples 恰好 2 条且包含查询词，难度适中。若词条是短语，phonetic 可为 null。

tech_cn 只在该词是计算机／编程／软件界面的常用术语时才填（如 artifact、default、thread、cache、prompt）。日常词在计算机里没有区别于字面的专门用法时一律填 null，不要为了凑内容硬扯。`;
    }
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (request !== dictReqRef.current) return;
      if (!data.type) throw new Error("bad");
      /* 模型认定这压根不是个词。到此为止：不写缓存、不留计数、不给收藏。
         给一串乱码编一条像模像样的释义，比查不到糟得多——用户会当真。 */
      if (data.type === "none") {
        delete seenRef.current[ql];
        seenRef.current = saveSeen(seenRef.current);
        if (clickedRef.current.delete(ql)) setClicks(clickedRef.current.size);
        setDict({ status: "none", term: q, key, sent: sentence });
        return;
      }
      cacheRef.current.set(cacheKey, data);
      // 按词原形和用户点的形态各存一份：点 running 下次直接命中，
      // 点 run 也命中同一条，省得同一个词的不同变形各查一次
      const lemma = (data.word || data.input || q).toLowerCase();
      dictCacheRef.current.set(ql, stripCtx(data));
      if (lemma && lemma !== ql) dictCacheRef.current.set(lemma, stripCtx(data));
      saveDictCache(dictCacheRef.current);
      finish(data);
    } catch (e) {
      if (request === dictReqRef.current) setDict({ status: "error", term: q, key, sent: sentence, msg: errText(e, providerId) });
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
    const request = dictReqRef.current;
    const term = dict.term;
    const sent = dict.sent;
    setCtxBusy(true);
    try {
      const data = await callClaude(
        `单词「${dict.term}」出现在这句话里："${dict.sent}"

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"context_cn":"该词在这句话中的准确中文含义，一句话说清"}`,
        apiKey, model, null, providerId
      );
      if (request === dictReqRef.current && data.context_cn) {
        setDict((x) => (x.status === "ok" && x.term === term && x.sent === sent && x.data === d
          ? { ...x, data: { ...x.data, context_cn: data.context_cn } }
          : x));
      }
    } catch (e) {
      if (request === dictReqRef.current) showToast(errText(e, providerId));
    } finally {
      if (request === dictReqRef.current) setCtxBusy(false);
    }
  }

  function retryLookup() {
    if (lastLookupRef.current) lookup(...lastLookupRef.current);
  }

  /* ---- 句子/段落翻译 ---- */
  async function translateText(raw) {
    let text = (raw || "").trim();
    if (!text) return;
    const request = ++dictReqRef.current;
    ++wordChatReqRef.current;
    setCtxBusy(false);
    const trunc = text.length > 700;
    if (trunc) text = text.slice(0, 700);
    setSelTip(null);
    const short = text.length > 16 ? text.slice(0, 16) + "…" : text;
    setDict({ status: "loading", term: short, trMode: true });
    openDict();
    const cacheKey = "T||" + text;
    if (cacheRef.current.has(cacheKey)) {
      if (request === dictReqRef.current) setDict({ status: "ok", term: short, data: cacheRef.current.get(cacheKey) });
      return;
    }
    const zh = /[\u4e00-\u9fff]/.test(text);
    const prompt = `把下面的${zh ? "中文翻译成自然地道的英文" : "英文翻译成简洁流畅的中文"}：
"${text.replace(/"/g, "'")}"

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"type":"tr","dir":"${zh ? "zh2en" : "en2zh"}","src":"原文","dst":"译文","note":"一句话点出翻译要点或地道表达（没有可为 null）"}`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (request !== dictReqRef.current) return;
      if (data.type !== "tr" || !data.dst) throw new Error("bad");
      if (trunc) data.trunc = true;
      cacheRef.current.set(cacheKey, data);
      setDict({ status: "ok", term: short, data });
    } catch (e) {
      if (request === dictReqRef.current) setDict({ status: "error", term: short, trFail: raw, msg: errText(e, providerId) });
    }
  }

  /* ---- 词卡追问对话 ---- */
  async function askWord(q) {
    const question = (q || "").trim();
    if (!question || wchat.busy || !wchat.word) return;
    const word = wchat.word;
    const request = ++wordChatReqRef.current;
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
      if (request !== wordChatReqRef.current) return;
      if (!data.answer) throw new Error("bad");
      setWchat((w) => ({
        ...w, busy: false,
        msgs: [...w.msgs, { role: "a", t: data.answer, words: Array.isArray(data.words) ? data.words.slice(0, 5) : [] }],
      }));
    } catch (e) {
      if (request !== wordChatReqRef.current) return;
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
    const request = ++dictReqRef.current;
    ++wordChatReqRef.current;
    setCtxBusy(false);
    setDict({ status: "loading", term: "整句解析", sentMode: true });
    openDict();
    const cacheKey = "S||" + s;
    if (cacheRef.current.has(cacheKey)) {
      if (request === dictReqRef.current) setDict({ status: "ok", term: s, data: cacheRef.current.get(cacheKey) });
      return;
    }
    const prompt = `你是耐心的英语语法老师。为中国学习者解析这个句子：
"${s}"

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"type":"sent","sentence":"${s.replace(/"/g, "'")}","translation":"自然流畅的中文翻译","parts":[{"r":"成分名（主语/谓语/宾语/状语/定语从句等）","t":"对应的原文片段"}],"grammar":"用一两句口语化中文点出本句关键语法（从句类型、时态、固定搭配等）"}

parts 按语序给 3-6 项，覆盖整句主干和关键修饰。`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (request !== dictReqRef.current) return;
      if (data.type !== "sent") throw new Error("bad");
      cacheRef.current.set(cacheKey, data);
      setDict({ status: "ok", term: s, data });
    } catch (e) {
      if (request === dictReqRef.current) setDict({ status: "error", term: "整句解析", sentFail: s, msg: errText(e, providerId) });
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
    const request = ++quizReqRef.current;
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
      if (request !== quizReqRef.current) return;
      if (!validQuizQuestions(data.questions)) throw new Error("bad");
      const qs = data.questions;
      setQuiz({ st: "on", qs, i: 0, sel: null, score: 0, missed: [] });
    } catch (e) {
      if (request === quizReqRef.current) setQuiz({ st: "err" });
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
    const nextTabs = [...tabs, { ...art, id }];
    if (!persistTabs(nextTabs, id)) return false;
    resetReadingContext();
    cancelArticleGeneration();
    setTabs(nextTabs);
    setActiveId(id);
    setView("read");
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
    return true;
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
    const request = ++importReqRef.current;
    setImpBusy(true);
    setImpErr("");
    try {
      const data = await fetchPageText(url, {
        apiKey, model, providerId, maxWords: FETCH_WORDS,
        hint: "如果它是视频页面，请尽力找到其英文字幕、台词或内容简介。",
      });
      if (request !== importReqRef.current) return;
      const chs = splitChapters(data.content);
      finishImport({
        title: data.title || hostOf(url),
        chapters: chs, ch: 0, trans: {},
        srcUrl: url, srcSite: hostOf(url),
        cn_intro: `AI 从可核对来源摘录约 ${countWords(data.content)} 词，建议打开原文核对`
          + (chs.length > 1 ? `，已分成 ${chs.length} 章` : ""),
        topic: hostOf(url), level, imported: true,
      });
    } catch (e) {
      if (request !== importReqRef.current) return;
      setImpErr(
        e.message === "sourceMismatch"
          ? "没有拿到这个网址本身的可核对引用，不能把模型返回内容冒充为该页正文。请复制正文后用「粘贴文本」导入"
          : "没抓到这个页面的英文内容——最稳的办法：把正文（或视频字幕）复制过来，用「粘贴文本」导入"
      );
    } finally {
      if (request === importReqRef.current) setImpBusy(false);
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
    const request = ++importReqRef.current;
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
      if (request !== importReqRef.current) return;
      if (data.error || !data.content) throw new Error("empty");

      /* 出处以搜索引擎实际访问过的页面为准。
         模型自报的 url 只在能和引用列表对上时才用——它完全有能力
         编出一个格式合法却不存在的网址，光校验格式挡不住。 */
      const cites = data.__cites || [];
      if (!cites.length) throw new Error("nocite");
      const said = String(data.url || "");
      const hit = cites.find((c) => samePage(c.url, said));
      if (!hit) throw new Error("sourceMismatch");

      if ((data.content.match(/[A-Za-z]/g) || []).length < 200) throw new Error("thin");
      const chs = splitChapters(data.content);
      const site = hostOf(hit.url);
      finishImport({
        title: data.title || hit.title || "Untitled",
        chapters: chs, ch: 0, trans: {},
        srcUrl: hit.url,
        srcSite: site,
        srcDate: data.date || "",
        cn_intro: `来自 ${site} 的真实文章${data.date ? `（${data.date}）` : ""}，`
          + `正文由 AI 摘录，约 ${countWords(data.content)} 词，请打开来源核对`
          + (chs.length > 1 ? `，已分成 ${chs.length} 章。` : "。")
          + "点上方来源链接可核对原文",
        topic: (typeof theTopic === "string" && theTopic.trim()) || cat.name, level, imported: true,
      });
    } catch (e) {
      if (request !== importReqRef.current) return;
      setRealErr(
        e.message === "nocite"
          ? "这次没有真正联网搜索（没拿到任何搜索结果），拿不到可核对的出处，不予采用。再点一次试试；一直这样的话检查服务商是否支持联网"
          : e.message === "sourceMismatch"
            ? "模型给出的文章网址与搜索引用不一致，无法核对正文来源，未导入。请重试或换个主题"
          : "没搜到合适的真实文章。换个说法或换个分类再试；实在找不到就用「AI 现写」，但那是编的"
      );
    } finally {
      if (request === importReqRef.current) setRealBusy(false);
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
      if (finishImport({
        title: hit.title, chapters: hit.chapters, ch: 0, trans: {},
        srcUrl: b.srcUrl, srcSite: b.src,
        cn_intro: `本地已存的正文（约 ${hit.words} 词${hit.chapters.length > 1 ? `，${hit.chapters.length} 章` : ""}），没有重新联网`,
        topic: hit.title, level, imported: true,
      })) go("read");
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

      if (finishImport({
        title: b.title, chapters: chs, ch: 0, trans: {},
        srcUrl: b.srcUrl, srcSite: b.src,
        cn_intro: `${b.author} · ${b.book}，约 ${words} 词`
          + (chs.length > 1 ? `，已分成 ${chs.length} 章` : "")
          + `。许可：${b.lic}`
          + (ok ? "。已存本地，下次点开不用再联网" : ""),
        topic: b.title, level, imported: true,
      })) go("read");
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
    const request = ++transReqRef.current;
    setTransBusy(true);
    const paras = curText.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const prompt = `把下面的英文文章逐段翻译成简洁、自然的中文。原文共 ${paras.length} 段，请保持相同的分段。

${paras.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"trans":["第1段中文译文","第2段中文译文"]}
数组长度必须为 ${paras.length}。`;
    try {
      const data = await callClaude(prompt, apiKey, model, null, providerId);
      if (request !== transReqRef.current) return;
      let tr = data.trans;
      if (!Array.isArray(tr) || !tr.length) throw new Error("bad");
      if (tr.length > paras.length) {
        tr = tr.slice(0, paras.length - 1).concat(tr.slice(paras.length - 1).join(" "));
      }
      while (tr.length < paras.length) tr.push("");
      // 译文按章号存，换章不会串台
      const nextTabs = tabs.map((x) => (x.id === article.id ? { ...x, trans: { ...x.trans, [chIdx]: tr } } : x));
      if (!persistTabs(nextTabs, activeId)) return;
      setTabs(nextTabs);
      setShowTrans(true);
    } catch (e) {
      if (request === transReqRef.current) showToast("翻译失败了，再点一次重试");
    } finally {
      if (request === transReqRef.current) setTransBusy(false);
    }
  }

  /* ---- 复习 ---- */
  function startReview() {
    if (!dueList.length) { showToast("今天没有到期的词，先去读一篇吧"); return; }
    hardStop();
    setRev({ queue: dueList.map((v) => v.key), i: 0, flip: false, ok: 0, ng: 0, sk: 0 });
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

  /* 跳过 = 这次没问。既不是记住也不是没记住，所以一个字段都不许动：
     rv 不动（due 不变，它今天还是到期状态，待会儿还会再来）、meet 不动、
     统计不加。故意不写成 answerReview 的一个参数——那个函数每一行都在
     写数据，混进来以后改动时很容易手滑让跳过污染复习进度。 */
  function skipReview() {
    if (!rev) return;
    setRev((x) => ({ ...x, i: x.i + 1, flip: false, sk: (x.sk || 0) + 1 }));
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
        // surface 记的是「你当时看到的那个形态」，拼错的那个不配留下来
        key, data: dict.data, surface: dict.data.typo || dict.term, savedAt: Date.now(),
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

  /* ---- 连接模型服务（首次设置页）----
     这几段原来直接写在界面里，现在收进来，界面只管调用。 */
  function pickSetupProvider(id) {
    // 换服务商时，自动带出之前给这家存过的 Key 和模型
    setProviderDraft(id);
    setKeyDraft(keyMap[id] || "");
    setModelDraft(modelMap[id] || "");
  }
  function saveSetup() {
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
  }
  function clearSetupKey() {
    // 只清掉当前这一家的密钥，其他服务商的保留
    const pid = providerDraft;
    const nextKeys = { ...keyMap };
    delete nextKeys[pid];
    sSet(KEYS_STORE, nextKeys);
    setKeyMap(nextKeys);
    setKeyDraft("");
    showToast(`已清除 ${providerOf(pid).name} 的密钥`);
  }
  function openSetup() {
    setProviderDraft(providerId);
    setKeyDraft(apiKey);
    setModelDraft(model);
    setShowSetup(true);
  }
  function clearVocab() {
    setVocab([]);
    setConfirmClear(false);
    showToast("已清空生词本");
  }

  /* 交给界面用的全部东西。界面要用到新的状态或动作时，把名字加进这张清单。 */
  return {
    activeId, addChatWord, advanceShadow, analyzeSentence, answerReview, apiKey, appStyle, article,
    askWord, backToWord, books, booksBusy, booksErr, cachedBooks, chapters, chIdx, chipCat, chips,
    clearSetupKey, clearVocab, clicks, closeDict, closeTab, confirmClear, copyVocab, ctxBusy,
    curMins, curText, curTrans, curWords, dict, dictIsSaved, dictOpen, doSearch, downloadVocab,
    dueList, enVoices, exitShadow, exitTalk, fetchContext, fetchRealArticle, flatSents,
    generateArticle, genError, genLoading, go, gotoCh, handleImportFile, homeMode, impBusy, impErr,
    impOpen, importFromText, importFromUrl, importVocabMd, impTab, impText, impUrl, keyDraft, level,
    loadLibrary, lookup, lvHint, lvMenu, model, modelDraft, navOpen, nextQuestion, openBlankTab,
    openDict, openSetup, pastRead, pickOption, pickSetupProvider, playShadow, prefs, providerDraft,
    providerId, quiz, readBook, readBusy, readErr, readIdx, reading, realBusy, realErr,
    removeHistory, removeWord, reread, reTopicOf, retryLookup, rev, saveCurrent, savedKeys,
    savedSurfaces, saveMissedWords, saveSetup, search, selTip, sendTalk, setChipCat, setChips,
    setConfirmClear, setDictOpen, setHomeMode, setImpErr, setImpOpen, setImpTab, setImpText,
    setImpUrl, setKeyDraft, setLevel, setLvHint, setLvMenu, setModelDraft, setNavOpen, setPrefs,
    setRealErr, setRev, setSearch, setSelTip, setShadow, setShowSetup, setStats, setTalk, setTopic,
    setView, setVImpOpen, setVImpText, setWeaveOn, shadow, showSetup, showToast, showTrans,
    skipReview, speak, startQuiz, startReview, startShadow, startTalk, stats, streak, switchTab,
    tabs, talk, toast, toggleReadArticle, toggleTrans, toggleWeave, topic, transBusy, translateText,
    view, vImpOpen, vImpText, vocab, wchat, weaveCands, weaveOn, weavePicked, weekRead, wovenSet,
  };
}
