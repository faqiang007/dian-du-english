/* 今：每天打开先看到的这一屏。
   四个大格子就是今天的一课——红字是还没写的，黑字是写过的。
   下面那个输入框管其余所有事。 */

import { ArrowRight } from "lucide-react";
import { FOUR, todayFour } from "../lib/day.js";
import { Omni } from "./Omni.jsx";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function TodayView({ app }) {
  const { stats, dueList, article, streak, startReview, go, setHomeMode, tabs, switchTab } = app;
  const { e, done, free, full } = todayFour(stats, dueList.length);
  const now = new Date();

  /* 每格下面那行小字：做过了说做了多少，没做说现在能做什么 */
  const note = {
    温: e.r > 0 ? `已温 ${e.r} 个词` : free ? "今天没有到期的词" : `${dueList.length} 个词到期了`,
    读: (e.a || 0) + (e.c || 0) > 0
      ? (e.a ? `新读了 ${e.a} 篇` : "接着读了一段")
      : article ? `接着读《${article.title}》` : "找一篇来读",
    测: e.q > 0 ? `测过 ${e.q} 次` : article ? "测一测刚读的" : "读完再来",
    说: e.t > 0 ? `说了 ${e.t} 句` : "找个场景开口",
  };
  const act = {
    温: () => (dueList.length ? startReview() : go("review")),
    读: () => { setHomeMode(false); go("read"); },
    测: () => go("quiz"),
    说: () => go("talk"),
  };
  // 下一格：按顺序第一个还没写的。没文章时「测」做不了，跳过它
  const next = FOUR.find((k) => !done[k] && !(k === "测" && !article));
  const left = FOUR.filter((k) => !done[k]).length;

  return (
    <div className="today">
      <header className="today-h">
        <span>{now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{WEEKDAYS[now.getDay()]}</span>
        <span>{streak > 0 ? `连续第 ${streak} 天` : "写下一格，就算开始"}</span>
      </header>

      <h1 className="today-t">
        {full ? "今日四格，写满了。" : left === 4 ? "今日四格，还没动笔。" : `今日四格，还差 ${left} 格。`}
      </h1>

      <div className="four-row">
        {FOUR.map((k) => (
          <button key={k} className={"four-b" + (k === next ? " next" : "")} onClick={act[k]}>
            <span className={"ge big" + (done[k] ? " done" : "")}>{k}</span>
            <span className="four-n">{note[k]}</span>
            {k === next && <span className="four-go">从这里写起 <ArrowRight size={13} /></span>}
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
