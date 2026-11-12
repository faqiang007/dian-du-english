/* 主界面的骨架：左侧栏 + 顶条 + 中间舞台 + 右侧词典，
   外加几个浮在最上层的小东西（划词翻译、跟读条、提示条）。 */

import {
  BarChart3, BookOpen, Bookmark, ChevronRight, FileUp, GraduationCap, Home, Languages, Menu,
  MessagesSquare, PanelLeft, Plus, RotateCcw, Search, Settings, Turtle, X,
} from "lucide-react";
import { BooksView } from "./Books.jsx";
import { DictPanel } from "./Dict.jsx";
import { HomeView } from "./Home.jsx";
import { ReaderView } from "./Reader.jsx";
import { ReviewView } from "./Review.jsx";
import { SettingsView } from "./Settings.jsx";
import { StatsView } from "./Stats.jsx";
import { TalkView } from "./Talk.jsx";
import { VocabView } from "./Vocab.jsx";

export function Shell({ app }) {
  const {
    prefs, setPrefs, appStyle, navOpen, setNavOpen, setDictOpen, view, article, homeMode, genLoading,
    dict, dictOpen, openDict, search, setSearch, doSearch,
    selTip, translateText, shadow, setShadow, flatSents, playShadow, advanceShadow, exitShadow, toast,
  } = app;

  const atHome = view === "read" && (homeMode || !article) && !genLoading;
  /* 词典栏什么时候占位：读文章时常驻；主页上只有真查了东西才出现——
     空着的词典栏会把主页挤窄，却什么也没给。其他页面一律让出整幅宽度。 */
  const dockDict = view === "read" && !prefs.dictOff && (!atHome || dict.status !== "idle");

  return (
    <div className={prefs.navFold ? "app navfold" : "app"} style={appStyle}>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <Sidebar app={app} />

      <div className="main">
        <header className="top">
          {/* 开侧栏时收起词典抽屉：两个浮层不能同时占屏 */}
          <button
            className="menubtn"
            onClick={() => {
              // 宽屏时它负责「展开被收起的侧栏」，窄屏时负责「拉出抽屉」。
              // 两件事一起做，不用判断当前视口——另一件在当前视口本来就是空操作。
              setPrefs((p) => (p.navFold ? { ...p, navFold: false } : p));
              setNavOpen(true);
              setDictOpen(false);
            }}
            aria-label="展开菜单"
          >
            <Menu size={18} className="mb-menu" />
            <PanelLeft size={18} className="mb-panel" />
          </button>
          <label className="search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
              placeholder="查词 / 翻译句子 · 中英互查"
              aria-label="查词"
            />
          </label>
        </header>

        <main className={dockDict ? "stage" : "stage nodict"}>
          <section className="stage-main">
            {view === "review" ? <ReviewView app={app} />
              : view === "talk" ? <TalkView app={app} />
              : view === "books" ? <BooksView app={app} />
              : view === "stats" ? <StatsView app={app} />
              : view === "settings" ? <SettingsView app={app} />
              : view === "vocab" ? <VocabView app={app} />
              : atHome ? <HomeView app={app} />
              : <ReaderView app={app} />}
          </section>
          <DictPanel app={app} />
        </main>
      </div>

      {!dictOpen && (
        <button className={prefs.dictOff ? "fab show" : "fab"} onClick={openDict} aria-label="打开词典">
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

      {/* 跟读控制条 */}
      {shadow.on && (
        <div className="shadowbar">
          <span className="sh-idx">{shadow.idx + 1}/{flatSents.length}</span>
          <span className="sh-hint">{shadow.waiting ? "跟读一遍，然后下一句 →" : "听…"}</span>
          <button className="sh-btn" onClick={() => playShadow(shadow.idx, shadow.slow)} aria-label="重听">
            <RotateCcw size={15} />
          </button>
          <button
            className={shadow.slow ? "sh-btn on" : "sh-btn"}
            onClick={() => {
              const slow = !shadow.slow;
              setShadow((x) => ({ ...x, slow }));
              playShadow(shadow.idx, slow);
            }}
            aria-label="慢速"
            title="慢速"
          ><Turtle size={15} /></button>
          <button className="sh-btn go" onClick={() => advanceShadow(shadow.idx, shadow.slow)}>
            下一句 <ChevronRight size={15} />
          </button>
          <button className="sh-btn" onClick={exitShadow} aria-label="退出跟读"><X size={15} /></button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------- 左侧栏 ---------- */

function Sidebar({ app }) {
  const {
    navOpen, setNavOpen, setPrefs, go, view, article, homeMode, setHomeMode,
    vocab, dueList, startReview, tabs, activeId, switchTab, closeTab, openBlankTab, streak,
  } = app;
  const atHome = view === "read" && (homeMode || !article);
  const nav = (on) => (on ? "nv on" : "nv");

  return (
    <aside className={navOpen ? "side open" : "side"}>
      {/* 窄屏下侧栏占满整屏、没有遮罩可点，得给一个明确的关闭出口 */}
      <button className="side-x" onClick={() => setNavOpen(false)} aria-label="关闭菜单">
        <X size={18} />
      </button>
      {/* 宽屏专用：把侧栏整个收起，正文占满 */}
      <button
        className="side-fold"
        onClick={() => setPrefs((p) => ({ ...p, navFold: true }))}
        aria-label="收起侧栏"
        title="收起侧栏"
      >
        <PanelLeft size={16} />
      </button>

      <button className="mark" onClick={() => go("read")}><i>007</i>学英语</button>

      <nav className="nav" aria-label="视图切换">
        {/* 主页就是「今天想读点什么」那一屏，和阅读共用 read 视图。
            进主页只是把正文暂时盖住，正在读的那篇原封不动，点「阅读」就回去。 */}
        <button className={nav(atHome)} onClick={() => { setHomeMode(true); go("read"); }}>
          <Home size={16} /> 主页
        </button>
        <button className={nav(view === "read" && article && !homeMode)}
          onClick={() => { setHomeMode(false); go("read"); }}>
          <BookOpen size={16} /> 阅读
        </button>
        <button className={nav(view === "vocab")} onClick={() => go("vocab")}>
          <Bookmark size={16} /> 生词本
          {vocab.length > 0 && <span className="n">{vocab.length}</span>}
        </button>
        <button className={nav(view === "review")} onClick={() => { startReview(); setNavOpen(false); }}>
          <RotateCcw size={16} /> 复习
          {dueList.length > 0 && <span className="n due">{dueList.length}</span>}
        </button>
        <button className={nav(view === "talk")} onClick={() => go("talk")}>
          <MessagesSquare size={16} /> 对话
        </button>
        <button className={nav(view === "books")} onClick={() => go("books")}>
          <GraduationCap size={16} /> 教材
        </button>
        <button className={nav(view === "stats")} onClick={() => go("stats")}>
          <BarChart3 size={16} /> 统计
        </button>
      </nav>

      <div className="side-cap">
        最近打开
        <button onClick={() => { openBlankTab(); go("read"); }} aria-label="新开一页" title="新开一页">
          <Plus size={13} />
        </button>
      </div>
      <div className="side-tabs">
        {tabs.length === 0 && <p className="side-empty">还没有文章</p>}
        {tabs.map((t) => (
          <div key={t.id} className={view === "read" && t.id === activeId ? "tab on" : "tab"}>
            <button className="tab-b" title={t.title}
              onClick={() => { switchTab(t.id); setHomeMode(false); go("read"); }}>
              {t.imported && <FileUp size={11} />}
              <span>{t.title || "未命名"}</span>
              {t.chapters?.length > 1 && <em>{(t.ch || 0) + 1}/{t.chapters.length}</em>}
            </button>
            <button className="tab-x" onClick={() => closeTab(t.id)} aria-label={`关闭「${t.title}」`}>
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      <div className="side-foot">
        <button className={nav(view === "settings")} onClick={() => go("settings")}>
          <Settings size={16} /> 设置
        </button>
        {streak > 0 && <div className="streak"><b>{streak}</b>天连续学习</div>}
      </div>
    </aside>
  );
}
