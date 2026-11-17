/* 今：每天打开先看到的这一屏。
   三个大格子就是今天的一课——红字是还没写的，黑字是写过的。
   下面那个输入框管其余所有事。 */

import { ArrowRight } from "lucide-react";
import { SQUARES, todayMarks } from "../lib/day.js";
import { Omni } from "./Omni.jsx";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function TodayView({ app }) {
  const { stats, dueList, article, streak, startReview, go, setHomeMode, tabs, switchTab } = app;
  const { e, done, free, full } = todayMarks(stats, dueList.length);
  const now = new Date();

  /* 每格下面那行小字：做过了说做了多少，没做说现在能做什么 */
  /* 做到一半的格子要说清还差多少——格子按「做了」算，不是点一下就写上。 */
  const note = {
    温: done.温 && e.r > 0 ? `已温 ${e.r} 个词`
      : free ? "今天没有到期的词"
      : e.r > 0 ? `温了 ${e.r} 个，还有 ${dueList.length} 个`
      : `${dueList.length} 个词到期了`,
    读: e.w > 0 ? `读完 ${e.w} 词`
      : article ? `接着读《${article.title}》，读到文末` : "找一篇来读",
    测: e.q > 0 ? `测过 ${e.q} 次` : article ? "测一测刚读的" : "读完再来",
  };
  const act = {
    温: () => (dueList.length ? startReview() : go("review")),
    读: () => { setHomeMode(false); go("read"); },
    测: () => go("quiz"),
  };
  // 下一格：按顺序第一个还没写的。没文章时「测」做不了，跳过它
  const next = SQUARES.find((k) => !done[k] && !(k === "测" && !article));
  const left = SQUARES.filter((k) => !done[k]).length;

  return (
    <div className="today">
      <header className="today-h">
        <span>{now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{WEEKDAYS[now.getDay()]}</span>
        <span>{streak > 0 ? `连续第 ${streak} 天` : "写下一格，就算开始"}</span>
      </header>

      <h1 className="today-t">
        {full ? "今日三格，写满了。" : left === SQUARES.length ? "今日三格，还没动笔。" : `今日三格，还差 ${left} 格。`}
      </h1>

      <div className="ge-row">
        {SQUARES.map((k) => (
          <button key={k} className={"ge-b" + (k === next ? " next" : "")} onClick={act[k]}>
            <span className={"ge big" + (done[k] ? " done" : "")}>{k}</span>
            <span className="ge-n">{note[k]}</span>
            {k === next && <span className="ge-go">从这里写起 <ArrowRight size={13} /></span>}
          </button>
        ))}
      </div>

      <Omni app={app} />

      {tabs.length > 0 && (
        <div className="today-desk">
          <span className="lbl">桌上摊着</span>
          {tabs.map((t) => (
            <button key={t.id} className="today-tab" onClick={() => switchTab(t.id)}>
              {t.title || "未命名"}
              {t.chapters?.length > 1 && <em>{(t.ch || 0) + 1}/{t.chapters.length}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
