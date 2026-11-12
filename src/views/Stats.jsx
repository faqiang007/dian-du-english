/* 学习统计：四个数字 + 两张 14 天的小柱图。
   「已掌握」排在显眼处——生词总数只增不减，衡量的是欠债；让人看见自己拿下了多少才有劲。 */

import { ArrowRight, Flame } from "lucide-react";
import { LEVELS } from "../data/levels.js";
import { DAY, dateStr } from "../lib/text.js";
import { MASTER_STREAK, isMastered } from "../lib/vocab.js";

export function StatsView({ app }) {
  const { stats, streak, vocab, dueList, level, startReview } = app;
  const vocabCount = vocab.length;
  const dueCount = dueList.length;
  const lv = LEVELS.find((l) => l.id === level);

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

  /* 没记快照的日子沿用上一个已知值——那几天不是「掌握了 0 个」，
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
    <div className="page">
      <div className="page-h"><h1>学习统计</h1></div>

      {empty ? (
        <div className="empty">
          <span className="stamp">007</span>
          <p>读完第一篇文章，这里就会热闹起来</p>
        </div>
      ) : (
        <>
          <div className="figs">
            <div className="fig"><b><Flame size={20} />{streak}</b><span>连续天数</span></div>
            <div className="fig"><b>{learning}</b><span>学习中</span></div>
            <div className="fig"><b className="ok-t">{mastered}</b><span>已掌握</span></div>
            <button className="fig go" onClick={startReview}>
              <b>{dueCount}</b><span>待复习 <ArrowRight size={12} /></span>
            </button>
          </div>

          <section className="chart">
            <div className="lbl">最近 14 天活跃（读文 + 小测 + 复习 + 对话）</div>
            <div className="bars">
              {days.map((d, i) => (
                <div className="barcol" key={i} title={`${d.label}日：${d.val} 次`}>
                  <div
                    className={d.today ? "bar today" : "bar"}
                    style={{ height: `${Math.max(3, (d.val / max) * 84)}px`, opacity: d.val ? 1 : 0.22 }}
                  />
                  <span>{i % 3 === 0 || d.today ? d.label : ""}</span>
                </div>
              ))}
            </div>
          </section>

          {hasCurve && (
            <section className="chart">
              <div className="lbl">已掌握词数（连对 {MASTER_STREAK} 次即算掌握）</div>
              <div className="bars">
                {mDays.map((d, i) => (
                  <div className="barcol" key={i}
                    title={d.mv === null ? `${d.label}日：无记录` : `${d.label}日：掌握 ${d.mv} 个`}>
                    <div
                      className={d.today ? "bar ok today" : "bar ok"}
                      style={{ height: `${Math.max(3, ((d.mv || 0) / mMax) * 84)}px`, opacity: d.mv === null ? 0.18 : 1 }}
                    />
                    <span>{i % 3 === 0 || d.today ? d.label : ""}</span>
                  </div>
                ))}
              </div>
              <p className="hint">这条曲线从你装上这个版本那天开始记，之前的日子补不出来。</p>
            </section>
          )}

          {lv && <p className="hint foot">当前难度：<b>{lv.label}</b>（{lv.tag}）— 读后小测会自动帮你升降档</p>}
        </>
      )}
    </div>
  );
}
