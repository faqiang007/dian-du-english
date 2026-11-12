/* 骨架：左边一列格子（今 温 读 测 说 藏），中间是当前这一格的内容。
   词典是从右边滑出来的抽屉，统一输入框是盖在最上面的一层——
   它们不属于任何一格，所以放在这里。 */

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Languages, RotateCcw, Search, Settings, Turtle, X } from "lucide-react";
import { FOUR, todayFour } from "../lib/day.js";
import { DeskView } from "./Desk.jsx";
import { DictPanel } from "./Dict.jsx";
import { KeepView } from "./Keep.jsx";
import { Omni } from "./Omni.jsx";
import { QuizView } from "./Quiz.jsx";
import { ReaderView } from "./Reader.jsx";
import { SettingsView } from "./Settings.jsx";
import { TalkView } from "./Talk.jsx";
import { TodayView } from "./Today.jsx";
import { WarmView } from "./Warm.jsx";

/* 窄屏判断：手机上没有地方放「浮在词旁边的小卡」，直接用整屏的词典 */
function useNarrow() {
  const q = "(max-width: 880px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function Shell({ app }) {
  const {
    appStyle, view, article, homeMode, genLoading, dict, dictOpen, closeDict,
    selTip, translateText, shadow, setShadow, flatSents, playShadow, advanceShadow, exitShadow, toast,
  } = app;
  const narrow = useNarrow();
  const [omni, setOmni] = useState(false);
  /* 词典的两种样子：点文中的词，先是浮在词旁边的小卡；点「展开」才滑出抽屉。
     展开过一次就一直用抽屉，直到你把抽屉关上——说明你这会儿想细看。 */
  const [expanded, setExpanded] = useState(false);

  /* 现在在哪一格。store 里的 view 是老名字，在这里翻译成格子。 */
  const station = view === "review" ? "温"
    : view === "quiz" ? "测"
    : view === "talk" ? "说"
    : view === "vocab" || view === "books" || view === "stats" ? "藏"
    : view === "settings" ? "设"
    : homeMode && !genLoading ? "今" : "读";
  const reading = station === "读" && (article || genLoading);

  const hasDict = dictOpen && dict.status !== "idle";
  /* 能用小卡的情况：正在读文章、宽屏、查的是文中点的那个词（有位置可挂）。
     整句解析、划词翻译、从输入框查的词没有位置，直接进抽屉。 */
  const peek = hasDict && reading && !narrow && !expanded && !!dict.key && !dict.sentMode
    && (dict.status !== "ok" || dict.data.type === "en");
  const drawer = hasDict && !peek;
  const shutDict = () => { closeDict(); setExpanded(false); };

  // ⌘K / Ctrl+K 随时唤出输入框；Esc 关掉
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOmni((o) => !o); }
      else if (e.key === "Escape") { if (omni) setOmni(false); else if (drawer) shutDict(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [omni, drawer]);

  return (
    <div className="app" style={appStyle}>
      <Rail app={app} station={station} onOmni={() => setOmni(true)} />

      <main className={drawer ? "stage with-drawer" : "stage"}>
        {station === "今" ? <TodayView app={app} />
          : station === "温" ? <WarmView app={app} />
          : station === "测" ? <QuizView app={app} />
          : station === "说" ? <TalkView app={app} />
          : station === "藏" ? <KeepView app={app} />
          : station === "设" ? <SettingsView app={app} />
          : reading ? <ReaderView app={app} peek={peek} onExpand={() => setExpanded(true)} />
          : <DeskView app={app} />}
      </main>

      <DictPanel app={app} open={drawer} onClose={shutDict} />

      {omni && (
        <div className="omni-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) setOmni(false); }}>
          <div className="omni-box">
            <Omni app={app} autoFocus onDone={() => setOmni(false)} />
            <p className="hint">回车执行第一项 · Tab 换一项 · Esc 关闭</p>
          </div>
        </div>
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

/* ---------- 左边那列格子 ----------
   温读测说四格的颜色就是今天的进度：红字是还没写的，黑字是写过的。 */

function Rail({ app, station, onOmni }) {
  const { go, setHomeMode, stats, dueList, streak, view } = app;
  const { done } = todayFour(stats, dueList.length);
  // 记住上次在「藏」里看的是哪一页，回来时还在那一页
  const keepRef = useRef("vocab");
  if (station === "藏") keepRef.current = view;

  const goto = {
    今: () => { setHomeMode(true); go("read"); },
    温: () => go("review"),
    读: () => { setHomeMode(false); go("read"); },
    测: () => go("quiz"),
    说: () => go("talk"),
    藏: () => go(keepRef.current),
  };
  const label = { 今: "今天", 温: "温故：复习到期的词", 读: "阅读", 测: "读后小测", 说: "开口：情景对话", 藏: "收藏：生词、教材、足迹" };
  const cell = (ch) => {
    const on = station === ch;
    const written = FOUR.includes(ch) && done[ch];
    return (
      <button key={ch} className={"rail-b" + (on ? " on" : "")} onClick={goto[ch]}
        aria-label={label[ch]} aria-current={on ? "page" : undefined} title={label[ch]}>
        <span className={"ge" + (written ? " done" : "") + (FOUR.includes(ch) ? "" : " plain")}>{ch}</span>
        {ch === "温" && dueList.length > 0 && <i className="rail-n">{dueList.length}</i>}
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="今日四格与导航">
      <button className="seal" onClick={goto.今} aria-label="007学英语 · 回到今天">007</button>
      <div className="rail-main">
        {cell("今")}
        <span className="rail-gap" />
        {FOUR.map(cell)}
        <span className="rail-gap" />
        {cell("藏")}
      </div>
      <div className="rail-foot">
        <button className="rail-b" onClick={onOmni} aria-label="查词、找文章、导入（⌘K）" title="查词 / 找文章 / 导入  ⌘K">
          <Search size={18} />
        </button>
        <button className={"rail-b" + (station === "设" ? " on" : "")} onClick={() => go("settings")}
          aria-label="设置" title="设置">
          <Settings size={18} />
        </button>
        {streak > 0 && <div className="rail-streak" title={`连续 ${streak} 天`}><b>{streak}</b>天</div>}
      </div>
    </nav>
  );
}
