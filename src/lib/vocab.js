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

/* 间隔拉到 21 天以上才算已掌握。间隔序列是 1 → 3 → 8 → 20 → 50 → 60 天，
   所以这等于「隔了 20 天再考还记得」。以前是连对 3 次就算，而新词当天就能温，
   最快第 5 天就「写黑」了——那只是短期记忆，文中却从此不再标红。
   这个数才是学习的收获——「生词总数」只增不减，衡量的是欠债，越努力看着
   越吓人；界面上得让人看见自己拿下了多少，但也不能夸大。 */
export const MASTER_DAYS = 21;
export const isMastered = (v) => rvOf(v).iv >= MASTER_DAYS;

/* 一轮最多温几个。停了一周回来一口气摆出 80 张卡，人会直接关掉页面；
   先温最该温的 20 个，做完想继续再来一轮。 */
export const REVIEW_BATCH = 20;

/* 一张卡什么时候从「认」升到「写」：连对到这个数之后，有原句的词改成
   原句挖空、让你把词填回去。先认得、再写得出——描红本的顺序。 */
export const CLOZE_FROM = 2;

/* 新词第一次到期的时间：明天零点。当天就温等于白送一次「记住了」——
   刚查完的词谁都记得，那一次证明不了任何事。 */
export function firstDue() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/* 一个词常见的变形：复数、三单、过去式、进行时。只按拼写规则推，不查表，
   所以不规则变化（go → went）推不出来——那种靠 surface（你当时点的形态）兜。
   用途有两处：文中把 eroded 也认成你存过的 erode；复习卡在原句里找到该挖哪个词。
   偶尔会多认（存了 even，evening 也会跟着红），词少、可接受。 */
export function formsOf(word) {
  const w = String(word || "").toLowerCase().trim();
  const out = new Set(w ? [w] : []);
  if (!/^[a-z]{3,}$/.test(w)) return out; // 词组、带连字符的、太短的，只认原样
  const vowel = (c) => "aeiou".includes(c);
  const last = w.slice(-1);
  const prev = w.slice(-2, -1);
  const stem = w.slice(0, -1);

  out.add(w + "s");
  if (/(s|x|z|ch|sh|o)$/.test(w)) out.add(w + "es");

  if (last === "y" && !vowel(prev)) {
    out.add(stem + "ies"); out.add(stem + "ied"); out.add(w + "ing");
  } else if (w.endsWith("ie")) {
    out.add(w + "d"); out.add(w.slice(0, -2) + "ying");
  } else if (w.endsWith("ee")) {
    if (w.length > 3) out.add(w + "d");   // see → seed、fee → feed 是别的词，不认
    out.add(w + "ing");
  } else if (last === "e") {
    out.add(w + "d"); out.add(stem + "ing");
  } else {
    out.add(w + "ed"); out.add(w + "ing");
    // 辅音-元音-辅音结尾要双写：stop → stopped
    if (!vowel(last) && vowel(prev) && !vowel(w.slice(-3, -2)) && !"wxy".includes(last)) {
      out.add(w + last + "ed"); out.add(w + last + "ing");
    }
  }
  return out;
}

/* 在原句里找到这个词出现的位置。先找你当时点的那个形态，再找各种变形。
   找不到返回 null——复习卡就不挖空，照旧按整词考。 */
export function spotIn(sent, v) {
  const d = v && v.data;
  const s = String(sent || "");
  if (!s || !d || d.type !== "en") return null;
  const low = s.toLowerCase();
  const whole = (p) => {
    const t = String(p || "").toLowerCase().trim();
    if (!t) return null;
    let from = 0;
    for (;;) {
      const i = low.indexOf(t, from);
      if (i < 0) return null;
      const before = low[i - 1], after = low[i + t.length];
      if (!/[a-z]/.test(before || "") && !/[a-z]/.test(after || "")) {
        return { start: i, end: i + t.length, text: s.slice(i, i + t.length) };
      }
      from = i + 1;
    }
  };
  const hit = whole(v.surface) || whole(d.word);
  if (hit) return hit;
  for (const f of formsOf(d.word)) {
    const h = whole(f);
    if (h) return h;
  }
  return null;
}

/* 原句太长就不存：存下来也当不了复习卡，还白占生词本的空间。 */
export const SENT_MAX = 400;
export function keepSent(s) {
  const t = String(s || "").trim();
  return t && t.length <= SENT_MAX ? t : "";
}

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
