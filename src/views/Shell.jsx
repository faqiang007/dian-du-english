/* 骨架：左边一列格子（今 温 读 测 说 藏），中间是当前这一格的内容。
   词典是从右边滑出来的抽屉，统一输入框是盖在最上面的一层——
   它们不属于任何一格，所以放在这里。 */

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Languages, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, Settings, Turtle, X } from "lucide-react";
import { SQUARES, todayMarks } from "../lib/day.js";
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
    prefs, setPrefs, selTip, setSelTip, lookup, translateText, shadow, setShadow, flatSents, playShadow, advanceShadow, exitShadow, toast,
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
    <div className={prefs.navFold ? "app folded" : "app"} style={appStyle}>
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

      {/* 划了两到四个词：多半是个词组（carry out、in terms of），给「查词组」——
          查出来的词条能收进生词本；只能翻译的话，这类搭配永远进不了本子。 */}
      {selTip && (
        <div className="seltip"
          /* 划的词贴着屏幕边时，气泡别跟着伸出去半截 */
          style={{ left: `clamp(72px, ${Math.round(selTip.x)}px, calc(100vw - 72px))`, top: Math.max(8, selTip.y - 42) }}>
          {selTip.kind === "phrase" && (
            <button onClick={() => { const t = selTip; setSelTip(null); lookup(t.text, t.sent || undefined); }}>
              <Search size={13} /> 查词组
            </button>
          )}
          <button onClick={() => translateText(selTip.text)}>
            <Languages size={13} /> 译
          </button>
        </div>
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
   温读测三格的颜色就是今天的进度：红字是还没写的，黑字是写过的。
   今、说、藏不算每天的格子，是普通的灰格。 */

function Rail({ app, station, onOmni }) {
  const { go, setHomeMode, stats, dueList, streak, view, prefs, setPrefs } = app;
  /* 收起状态记在偏好里（dd-prefs-v1 的 navFold），下次打开还是收着的。
     这个字段早就留着，只是一直没接上按钮。 */
  const folded = !!prefs.navFold;
  const fold = () => setPrefs((p) => ({ ...p, navFold: !p.navFold }));
  const { done } = todayMarks(stats, dueList.length);
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
    const written = SQUARES.includes(ch) && done[ch];
    return (
      <button key={ch} className={"rail-b" + (on ? " on" : "")} onClick={goto[ch]}
        aria-label={label[ch]} aria-current={on ? "page" : undefined} title={label[ch]}>
        <span className={"ge" + (written ? " done" : "") + (SQUARES.includes(ch) ? "" : " plain")}>{ch}</span>
        {ch === "温" && dueList.length > 0 && <i className="rail-n">{dueList.length}</i>}
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="今日三格与导航">
      {folded ? (
        // 收起后只剩这一格：图标朝右，点是展开
        <button className="rail-b rail-fold" onClick={fold} aria-label="展开左侧栏" title="展开左侧栏">
          <PanelLeftOpen size={17} />
        </button>
      ) : (
        <>
          <button className="seal" onClick={goto.今} aria-label="007学英语 · 回到今天">007</button>
          <button className="rail-fold" onClick={fold} aria-label="收起左侧栏" title="收起左侧栏">
            <PanelLeftClose size={17} />
          </button>
        </>
      )}
      <div className="rail-main">
        {cell("今")}
        <span className="rail-gap" />
        {SQUARES.map(cell)}
        <span className="rail-gap" />
        {cell("说")}
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
