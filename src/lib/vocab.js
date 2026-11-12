/* 生词本相关的纯函数：导出导入、复习进度、织入词、列表显示用的小工具。 */

export function buildVocabMd(vocab) {
  const lines = [`# 生词本 · ${new Date().toLocaleDateString("zh-CN")}`, ""];
  vocab.forEach((v) => {
    const d = v.data;
    if (d.type === "en") {
      lines.push(`## ${d.word}  ${d.phonetic_us || ""}`);
      (d.senses || []).forEach((x) => lines.push(`- ${x.pos} ${x.cn}`));
      // 计算机含义要一起导出，否则换机器搬家就丢了
      if (d.tech_cn) lines.push(`- 计算机：${d.tech_cn}`);
      if (d.examples?.[0]) lines.push(`- 例：${d.examples[0].en} — ${d.examples[0].cn}`);
    } else {
      lines.push(`## ${d.input}`);
      (d.translations || []).forEach((t) =>
        lines.push(`- ${t.en} ${t.phonetic_us || ""} ${t.pos || ""}${t.note ? " · " + t.note : ""}`)
      );
    }
    lines.push("");
  });
  return lines.join("\n");
}

/* 解析「复制为 Markdown」导出的生词本文本 */
export function parseVocabMd(text) {
  const out = [];
  const blocks = String(text).split(/\n(?=##\s)/).map((b) => b.trim()).filter((b) => b.startsWith("## "));
  for (const block of blocks) {
    const lines = block.split("\n");
    const head = lines[0].replace(/^##\s*/, "").trim();
    if (!head) continue;
    const hm = head.match(/^(.*?)\s+(\/.*)$/);
    const word = (hm ? hm[1] : head).trim();
    const phon = hm ? hm[2].trim() : "";
    if (!word) continue;
    const zh = /[\u4e00-\u9fff]/.test(word);
    if (zh) {
      const translations = [];
      for (const ln of lines.slice(1)) {
        if (!ln.startsWith("- ")) continue;
        const body = ln.slice(2).trim();
        const mm = body.match(/^([A-Za-z][A-Za-z '\-]*?)\s*(\/[^/]*\/)?\s*([a-z]{1,6}\.)?\s*(?:·\s*(.*))?$/);
        if (mm && mm[1]) {
          translations.push({ en: mm[1].trim(), phonetic_us: mm[2] || "", pos: mm[3] || "", note: mm[4] || "" });
        }
      }
      if (!translations.length) continue;
      out.push({ word, data: { type: "zh", input: word, translations, examples: [] } });
    } else {
      const senses = [];
      let example = null;
      let tech = null;
      for (const ln of lines.slice(1)) {
        if (!ln.startsWith("- ")) continue;
        const body = ln.slice(2).trim();
        // 这一条要在「当成释义」之前判，否则会被兜底分支收成一条没有词性的释义
        if (/^计算机[：:]/.test(body)) {
          tech = body.replace(/^计算机[：:]\s*/, "").trim() || null;
          continue;
        }
        if (/^例[：:]/.test(body)) {
          const ex = body.replace(/^例[：:]\s*/, "");
          const seg = ex.split(/\s+—\s+/);
          example = { en: (seg[0] || "").trim(), cn: (seg[1] || "").trim() };
        } else {
          const mm = body.match(/^([a-z]{1,6}\.)\s+(.*)$/i);
          if (mm) senses.push({ pos: mm[1], cn: mm[2] });
          else if (body) senses.push({ pos: "", cn: body });
        }
      }
      if (!senses.length && !example) continue;
      out.push({
        word,
        data: { type: "en", word, phonetic_us: phon, phonetic_uk: "", context_cn: null, tech_cn: tech, senses, examples: example ? [example] : [] },
      });
    }
  }
  return out.map((x) => ({
    key: x.word.toLowerCase(), data: x.data, surface: x.word,
    savedAt: Date.now(), meet: 1, rv: { due: Date.now(), iv: 0, streak: 0 },
  }));
}

export function validQuizQuestions(qs) {
  return Array.isArray(qs) && qs.length === 3 && qs.every((q) =>
    q && typeof q.q === "string" && q.q.trim() &&
    Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every((o) => typeof o === "string" && o.trim()) &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4
  );
}

/* 复习进度：没有记录的旧词视为"到期" */
export const rvOf = (v) => v.rv || { due: v.savedAt || 0, iv: 0, streak: 0 };

/* 连对 3 次即视为已掌握。这个数才是学习的收获——「生词总数」只增不减，
   衡量的是欠债，越努力看着越吓人；界面上得让人看见自己拿下了多少。 */
export const MASTER_STREAK = 3;
export const isMastered = (v) => rvOf(v).streak >= MASTER_STREAK;

/* 能织进文章的英文表达：英文词条取词本身，中文词条取第一个英文译词。
   生词本只存这两类（句子 type:"sent" 不入库），别的一律返回空跳过。 */
export const WEAVE_MAX = 6;
export function weaveTermOf(v) {
  const d = v && v.data;
  if (!d) return "";
  if (d.type === "en") return String(d.word || v.surface || "").trim();
  if (d.type === "zh") {
    const t = (d.translations || [])[0];
    return String((t && (t.en || t.word)) || "").trim();
  }
  return "";
}

export function vbWord(d) { return d.type === "en" ? d.word : d.input; }
export function vbPhon(d) {
  return d.type === "en" ? d.phonetic_us : (((d.translations || [])[0]) || {}).phonetic_us;
}
export function vbBrief(d) {
  if (d.type === "en") {
    const s = (d.senses || [])[0];
    return s ? ((s.pos ? s.pos + " " : "") + (s.cn || "")) : "";
  }
  return ((d.translations || []).map((t) => t.en).join(" / ")) || "";
}
export function vbHay(d) {
  // 搜索要能用中文释义命中，不能只匹配单词本身
  const parts = [vbWord(d)];
  if (d.type === "en") {
    for (const x of d.senses || []) parts.push(x.cn, x.pos);
  } else {
    for (const t of d.translations || []) parts.push(t.en, t.pos);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}
