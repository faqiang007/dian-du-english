/* 「今日三格」：温、读、测。
   不另存任何东西——全是从学习统计（dd-stats-v1 的 log）里现算出来的：
     r  复习了几个词        rd 这天把到期的词温完过（1 = 是）
     a  新开了几篇          c  接着读/重读了几次
     w  读到章末的词数（一章读完才记，记的是那一章的词数）
     q  做了几次小测        t  对话里你自己说了几句（仍在记，但不再算进每日的格子） */

import { dateStr } from "./text.js";

/* 每天要写的格子。原来是四格，带一个「说」；2026-11-14 起拿掉——
   这个应用要练的是词汇量和阅读理解，开口是另一件事，不该卡着一课写不写得满。
   「说」那一页还在，左栏照样能进，只是不再计入每天的格子。 */
export const SQUARES = ["温", "读", "测"];
const OLD_SQUARES = ["温", "读", "测", "说"];

/* 从这一天起有两处变化：格子从四个变成三个；并且按「做了」算，不再按「碰过」算。
   以前：打开一篇文章就算读了、温 1 个词就算温了——格子写满，可能什么都没学。
   这天之前的日子仍按老规矩（四格、碰过就算）：那时候只记了那么多，拿新标准
   回头去卡，足迹里写满的日子会凭空变样，等于改写历史。 */
export const STRICT_FROM = "2026-11-14";
export const WARM_GOAL = 10;  // 到期的太多温不完时，温满这么多也算

/* 某一天该写哪几格。day 是 "2026-11-14" 这样的日期，不传按今天算。 */
export function squaresOn(day) {
  return (day || dateStr()) < STRICT_FROM ? OLD_SQUARES : SQUARES;
}

/* 某一天的各格写了没有 */
export function dayMarks(e, day) {
  e = e || {};
  if ((day || dateStr()) < STRICT_FROM) {
    return {
      温: (e.r || 0) > 0,
      读: (e.a || 0) + (e.c || 0) > 0,
      测: (e.q || 0) > 0,
      说: (e.t || 0) > 0,
    };
  }
  return {
    温: (e.rd || 0) > 0 || (e.r || 0) >= WARM_GOAL,
    读: (e.w || 0) > 0,
    测: (e.q || 0) > 0,
  };
}

export function todayOf(stats) {
  return (stats.log || {})[dateStr()] || {};
}

/* 今天的三格。「温」有个例外：今天根本没有到期的词，这一格就算免写——
   不能因为没东西可温，就让人永远写不满这一课。 */
export function todayMarks(stats, dueCount) {
  const e = todayOf(stats);
  const f = dayMarks(e);
  const free = !f.温 && dueCount === 0;
  const done = { ...f, 温: f.温 || free };
  return { e, f, free, done, full: SQUARES.every((k) => done[k]) };
}

/* 最近 n 周每周读了多少词（只算读到章末的）。最后一项是本周。 */
export function weeklyWords(log, n = 8) {
  const DAY = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY); // 本周一
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const start = new Date(monday.getTime() - k * 7 * DAY);
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      sum += ((log || {})[dateStr(day)] || {}).w || 0;
    }
    out.push({ start, words: sum, cur: k === 0 });
  }
  return out;
}
