/* 「今日四格」：温、读、测、说。
   不另存任何东西——全是从学习统计（dd-stats-v1 的 log）里现算出来的：
     r 复习了几个词   a 新开了几篇   c 接着读/重读了几次   q 做了几次小测   t 对话说了几句 */

import { dateStr } from "./text.js";

export const FOUR = ["温", "读", "测", "说"];

/* 某一天的四格各写了没有 */
export function fourOf(e) {
  e = e || {};
  return {
    温: (e.r || 0) > 0,
    读: (e.a || 0) + (e.c || 0) > 0,
    测: (e.q || 0) > 0,
    说: (e.t || 0) > 0,
  };
}

export function todayOf(stats) {
  return (stats.log || {})[dateStr()] || {};
}

/* 今天的四格。「温」有个例外：今天根本没有到期的词，这一格就算免写——
   不能因为没东西可温，就让人永远写不满这一课。 */
export function todayFour(stats, dueCount) {
  const e = todayOf(stats);
  const f = fourOf(e);
  const free = !f.温 && dueCount === 0;
  const done = { ...f, 温: f.温 || free };
  return { e, f, free, done, full: FOUR.every((k) => done[k]) };
}
