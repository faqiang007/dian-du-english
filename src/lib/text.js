/* 纯文字处理：分句、分章、数词、相对时间……不碰网络也不碰存储。 */

import { CHAPTER_WORDS } from "../data/limits.js";

export function pickChips(pool) {
  const p = [...pool];
  const out = [];
  while (out.length < 6 && p.length) {
    out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
  }
  return out;
}

export function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitSentences(para) {
  return para.match(/[^.!?…]+[.!?…]+[\s"')\]]*|[^.!?…]+$/g) || [para];
}

/* 按完整句子截取到约 maxW 词 */
/* 把长文按段落切成若干「章」，每章约 perCh 个英文单词。
   段落不劈开——译文对照和跟读都按段落编号对齐，
   一段被切成两半会让下半段的译文错位。 */
export function splitChapters(text, perCh = CHAPTER_WORDS) {
  const paras = String(text).replace(/\r/g, "").split(/\n{2,}|\n/)
    .map((p) => p.trim()).filter(Boolean);
  const chs = [];
  let buf = [], n = 0;
  const flush = () => { if (buf.length) { chs.push(buf.join("\n\n")); buf = []; n = 0; } };
  for (const p of paras) {
    const w = (p.match(/[A-Za-z]+/g) || []).length;
    // 整章不分段的情况（常见于字幕、扫描件），只能退一步按句子切
    if (w > perCh * 1.6) {
      flush();
      for (const piece of splitLongPara(p, perCh)) chs.push(piece);
      continue;
    }
    if (n + w > perCh && buf.length) flush();
    buf.push(p); n += w;
  }
  flush();
  return chs.length ? chs : [String(text).trim()];
}

export function splitLongPara(para, perCh) {
  const out = [];
  let buf = [], n = 0;
  for (const s of splitSentences(para)) {
    const w = (s.match(/[A-Za-z]+/g) || []).length;
    if (n + w > perCh && buf.length) { out.push(buf.join("").trim()); buf = []; n = 0; }
    buf.push(s); n += w;
  }
  if (buf.length) out.push(buf.join("").trim());
  return out;
}

export function countWords(text) {
  return (String(text).match(/[A-Za-z]+/g) || []).length;
}

/* 老版本的标签页只有 content、trans 是个数组。
   统一成「chapters 数组 + ch 章号 + trans 按章号存」，
   后面所有代码只认这一种形状，不用到处判断有没有分章。 */
export function normalizeTab(t) {
  if (Array.isArray(t.chapters) && t.chapters.length) {
    return {
      ...t,
      ch: Math.min(Math.max(0, t.ch || 0), t.chapters.length - 1),
      trans: t.trans && !Array.isArray(t.trans) ? t.trans : {},
    };
  }
  return {
    ...t,
    chapters: [t.content || ""],
    ch: 0,
    trans: Array.isArray(t.trans) ? { 0: t.trans } : {},
  };
}

export function looksLikeSentence(q) {
  const zh = /[\u4e00-\u9fff]/.test(q);
  if (zh) return q.replace(/\s/g, "").length >= 10 || /[，。！？；]/.test(q);
  const words = q.trim().split(/\s+/).length;
  return words >= 5 || /[.!?;]\s/.test(q.trim());
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return "网页"; }
}

export function samePage(a, b) {
  try {
    const clean = (u) => {
      const x = new URL(u);
      return `${x.protocol}//${x.hostname.toLowerCase()}${x.pathname.replace(/\/$/, "")}${x.search}`;
    };
    return clean(a) === clean(b);
  } catch (e) { return false; }
}

export const DAY = 86400000;

/* 「3 天前」这类相对时间。读过的文章列表里，具体日期没意义，
   "多久没碰了"才是决定要不要重读的依据。 */
export function agoText(ts) {
  if (!ts) return "";
  const d = Math.floor((Date.now() - ts) / DAY);
  if (d <= 0) return "今天读过";
  if (d === 1) return "昨天读过";
  if (d < 7) return `${d} 天前读过`;
  if (d < 30) return `${Math.floor(d / 7)} 周前读过`;
  return `${Math.floor(d / 30)} 个月前读过`;
}

export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function calcStreak(log) {
  const active = (d) => {
    const e = log[dateStr(d)];
    return e && (e.a || 0) + (e.q || 0) + (e.r || 0) + (e.t || 0) > 0;
  };
  let t = new Date(); t.setHours(0, 0, 0, 0);
  if (!active(t)) t = new Date(t.getTime() - DAY);
  let n = 0;
  while (active(t)) { n++; t = new Date(t.getTime() - DAY); }
  return n;
}
