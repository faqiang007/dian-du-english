/* 藏：攒下来的东西。三页——
   词（生词本，一面「描红墙」加一张清单）、书（教材库）、迹（足迹：每天写了几格）。 */

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { LEVELS } from "../data/levels.js";
import { dayMarks, squaresOn, weeklyWords } from "../lib/day.js";
import { DAY, dateStr } from "../lib/text.js";
import { MASTER_DAYS, isMastered, rvOf, vbWord } from "../lib/vocab.js";
import { BooksView } from "./Books.jsx";
import { VocabView } from "./Vocab.jsx";

export function KeepView({ app }) {
  const { view, go, vocab } = app;
  const [pick, setPick] = useState(null); // 在描红墙上点中的词，交给下面的清单去定位

  const tabs = [
    ["vocab", "词", `生词本 · ${vocab.length}`],
    ["books", "书", "教材库"],
    ["stats", "迹", "足迹"],
  ];
  return (
    <div className="keep">
      <div className="keep-tabs" role="tablist">
        {tabs.map(([id, ch, name]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? "keep-tab on" : "keep-tab"} onClick={() => go(id)}>
            <span className="ge sm plain">{ch}</span>{name}
          </button>
        ))}
      </div>

      {view === "vocab" && (
        <>
          <WordWall vocab={vocab} onPick={(v) => setPick({ w: vbWord(v.data), key: v.key, at: Date.now() })} />
          <VocabView app={app} pick={pick} />
        </>
      )}
      {view === "books" && <BooksView app={app} />}
      {view === "stats" && <TraceView app={app} />}
    </div>
  );
}

/* ---------- 描红墙 ----------
   所有生词排成一面墙：红的还在描，黑的已经会写，带圆点的今天到期。
   一眼看出自己拿下了多少——「生词总数」只增不减，看着像欠债；这面墙越来越黑，看着像收成。 */

function WordWall({ vocab, onPick }) {
  const words = useMemo(() => {
    const now = Date.now();
    return vocab
      .map((v) => ({ v, w: vbWord(v.data), due: rvOf(v).due <= now, done: isMastered(v) }))
      .filter((x) => x.w)
      .sort((a, b) => a.w.localeCompare(b.w, "en", { sensitivity: "base" }));
  }, [vocab]);
  if (!words.length) return null;
  const black = words.filter((x) => x.done).length;

  return (
    <section className="wall">
      <div className="wall-h">
        <h1 className="kai-h">描红墙</h1>
        <p className="hint">
          {words.length} 个词，<b>{black}</b> 个已经写黑了。
          <span className="wall-key"><i className="k red" />还在描<i className="k ink" />已掌握<i className="k dot" />今天到期</span>
        </p>
      </div>
      <div className="wall-ws">
        {words.map((x) => (
          <button key={x.v.key} className={"ww" + (x.done ? " ink" : "") + (x.due ? " due" : "")} onClick={() => onPick(x.v)}>
            {x.w}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- 足迹 ----------
   半年的日历格子：一天一格，写了几格颜色就深几分，写满的那天是黑的。
   「写满」按那一天的规矩算：2026-11-14 之前是四格，之后是三格（见 lib/day.js）。 */

function TraceView({ app }) {
  const { stats, streak, vocab, dueList, level, startReview } = app;
  const lv = LEVELS.find((l) => l.id === level);
  const mastered = vocab.filter(isMastered).length;
  const learning = vocab.length - mastered;
  const empty = (stats.total || 0) === 0 && vocab.length === 0;

  /* 26 周，按周排成列。最后一列是本周，还没到的日子留空。 */
  const weeks = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today.getTime() + (6 - today.getDay()) * DAY); // 本周六
    const cols = [];
    for (let w = 25; w >= 0; w--) {
      const col = [];
      for (let d = 6; d >= 0; d--) {
        const day = new Date(end.getTime() - (w * 7 + d) * DAY);
        if (day > today) { col.push(null); continue; }
        const ds = dateStr(day);
        const f = dayMarks(stats.log[ds], ds);
        const need = squaresOn(ds);
        const got = need.filter((k) => f[k]);
        const full = got.length === need.length;
        // 颜色档位：写满固定用最深的黑（l4），没写满的按写了几格
        col.push({ day, n: got.length, got, full, lv: full ? 4 : got.length });
      }
      cols.push(col);
    }
    return cols;
  }, [stats.log]);
  const fullDays = weeks.flat().filter((c) => c && c.full).length;
  const anyDays = weeks.flat().filter((c) => c && c.n > 0).length;

  /* 最近 14 天的已掌握词数。没记快照的日子沿用上一个已知值——
     那几天不是「掌握了 0 个」，是没打开过应用。 */
  const mDays = useMemo(() => {
    let carry = null;
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      const e = stats.log[dateStr(d)] || {};
      if (typeof e.m === "number") carry = e.m;
      out.push({ label: d.getDate(), mv: carry, today: i === 0 });
    }
    return out;
  }, [stats.log]);
  const mMax = Math.max(1, ...mDays.map((d) => d.mv || 0));

  /* 每周读了多少词。读得多，词汇和理解才会涨——这是阅读这件事最老实的进度。
     只算读到章末的那些章，打开没读完的不算。 */
  const wk = useMemo(() => weeklyWords(stats.log, 8), [stats.log]);
  const wkMax = Math.max(1, ...wk.map((x) => x.words));
  const wkNow = wk[wk.length - 1].words;
  const hasCurve = mDays.some((d) => d.mv !== null);

  return (
    <div className="page">
      <div className="page-h"><h1>足迹</h1></div>

      {empty ? (
        <div className="empty">
          <span className="ge">迹</span>
          <p>写下第一格，这里就开始有痕迹了</p>
        </div>
      ) : (
        <>
          <div className="figs">
            <div className="fig"><b>{streak}</b><span>连续天数</span></div>
            <div className="fig"><b className="red">{learning}</b><span>还在描</span></div>
            <div className="fig"><b>{mastered}</b><span>已写黑</span></div>
            <button className="fig go" onClick={startReview}>
              <b>{dueList.length}</b><span>今天到期 <ArrowRight size={12} /></span>
            </button>
          </div>

          <section className="chart">
            <div className="lbl">近半年 · 动笔 {anyDays} 天，其中 {fullDays} 天写满</div>
            <div className="heat">
              {weeks.map((col, i) => (
                <div className="heat-col" key={i}>
                  {col.map((c, j) => c
                    ? <i key={j} className={"hc l" + c.lv}
                        title={`${c.day.getMonth() + 1}月${c.day.getDate()}日：${c.n ? c.got.join(" ") : "没动笔"}`} />
                    : <i key={j} className="hc none" />)}
                </div>
              ))}
            </div>
            <p className="hint heat-key">
              <i className="hc l0" />没动笔<i className="hc l1" /><i className="hc l2" /><i className="hc l3" />写了几格<i className="hc l4" />写满
            </p>
          </section>

          <section className="chart">
            <div className="lbl">每周读了多少词 · 本周 {wkNow} 词</div>
            <div className="bars">
              {wk.map((x, i) => (
                <div className="barcol" key={i}
                  title={`${x.start.getMonth() + 1}月${x.start.getDate()}日这一周：${x.words} 词`}>
                  <div className={x.cur ? "bar cur" : "bar"}
                    style={{ height: `${Math.max(3, (x.words / wkMax) * 84)}px`, opacity: x.words ? 1 : 0.18 }} />
                  <span>{x.cur ? "本周" : `${x.start.getMonth() + 1}/${x.start.getDate()}`}</span>
                </div>
              ))}
            </div>
            <p className="hint">一章读到末尾才记数。从这个版本开始记，之前的周是空的。</p>
          </section>

          {hasCurve && (
            <section className="chart">
              <div className="lbl">已写黑的词 · 最近 14 天（复习间隔拉到 {MASTER_DAYS} 天以上才算）</div>
              <div className="bars">
                {mDays.map((d, i) => (
                  <div className="barcol" key={i} title={d.mv === null ? `${d.label}日：无记录` : `${d.label}日：掌握 ${d.mv} 个`}>
                    <div className={d.today ? "bar cur" : "bar"}
                      style={{ height: `${Math.max(3, ((d.mv || 0) / mMax) * 84)}px`, opacity: d.mv === null ? 0.18 : 1 }} />
                    <span>{i % 3 === 0 || d.today ? d.label : ""}</span>
                  </div>
                ))}
              </div>
              <p className="hint">这条曲线从你装上这个版本那天开始记，之前的日子补不出来。</p>
            </section>
          )}

          {lv && <p className="hint foot">当前难度：<b>{lv.label}</b>（{lv.tag}）— 小测全对或错得多时，会问你要不要换一档</p>}
        </>
      )}
    </div>
  );
}
