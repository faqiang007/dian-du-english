/* 所有落到浏览器 localStorage 的东西都从这里过。
   键名一个都不许改——改了用户的数据会静默「消失」（见 specs/constitution.md）。 */

export const VOCAB_KEY = "dd-vocab-v1";
export const ARTICLE_KEY = "dd-article-v1";
export const STATS_KEY = "dd-stats-v1";
export const TABS_KEY = "dd-tabs-v1";

export const APIKEY_STORE = "dd-or-key";      // 旧版单一 Key（仅用于迁移）
export const MODEL_STORE = "dd-or-model";     // 旧版单一模型（仅用于迁移）
export const PROVIDER_STORE = "dd-provider";  // 当前选中的服务商 id
export const KEYS_STORE = "dd-keys-v1";       // { 服务商id: apiKey }
export const MODELS_STORE = "dd-models-v1";   // { 服务商id: 模型名 }
export const PREFS_KEY = "dd-prefs-v1";

export function sGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
/* 返回是否写入成功。存储写满时浏览器抛 QuotaExceededError，
   以前这里静默吞掉，用户会以为存上了、下次打开却没了。 */
export function sSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
}

/* ---- 读过的文章 ----
   以前关掉标签页或「换一篇」就把原文永久删掉了，读过的东西除了当下开着的
   6 篇之外一律不存在。而重读旧文章巩固词汇的效果比读新文章更好——同一批
   词在同一个语境里再见一次。所以关掉/替换时先归档。
   只留最近 HISTORY_MAX 篇、总量不超过 HISTORY_CHARS，超了丢最旧的；
   译文不归档（占地方且能随时重新生成）。 */
export const HISTORY_KEY = "dd-history-v1";
export const HISTORY_MAX = 20;
export const HISTORY_CHARS = 400000;

export function trimHistory(list) {
  const out = [];
  let chars = 0;
  for (const h of list) {
    if (out.length >= HISTORY_MAX) break;
    const n = (h.chapters || []).join("").length;
    /* 第一条（最近的这篇）哪怕自己就超预算也要留下。
       原来的写法是「放不下就 break」，而归档恰恰是最近这篇排在最前——
       于是关掉一本 40 万字符以上的书（约 7 万词，常见的整本小说），
       第一轮就 break，返回空数组，「读过的」连同以前攒的一起被清空。
       宁可这一篇让总量超一点，也不能静默抹掉整份历史。
       后面那些仍按原意「预算用完就停」——它们都比第一条更旧。 */
    if (out.length > 0 && chars + n > HISTORY_CHARS) break;
    out.push(h);
    chars += n;
  }
  return out;
}

/* ---- 词级词典缓存 ----
   只存单词条目本身（释义/音标/例句），不存语境。上限 DICT_CACHE_MAX 条，
   超了丢最早写入的那批——词典条目丢了只是下次重查一次，不是数据损失，
   所以这里不跟生词本抢 localStorage 配额。 */
export const DICT_CACHE_KEY = "dd-dict-cache-v1";
export const DICT_CACHE_MAX = 400;

export function stripCtx(d) {
  return d && d.context_cn ? { ...d, context_cn: null } : d;
}
/* 生词本里的条目来源不一：查词存的是完整词条，从单词问答收藏的、
   Markdown 导入的可能只有一条释义没音标没例句。拿这种「瘦身版」顶替
   一次真查询，用户会永远看到残缺的卡片——所以只有完整的才配当缓存用。 */
export function isFullEntry(d) {
  if (!d) return false;
  if (d.type === "en") return !!d.phonetic_us && (d.senses || []).length > 0 && (d.examples || []).length > 0;
  if (d.type === "zh") return (d.translations || []).length > 0 && (d.examples || []).length > 0;
  return false;
}
export function loadDictCache() {
  const raw = sGet(DICT_CACHE_KEY);
  return new Map(Array.isArray(raw) ? raw : []);
}
export function saveDictCache(map) {
  let entries = [...map.entries()];
  if (entries.length > DICT_CACHE_MAX) entries = entries.slice(-DICT_CACHE_MAX);
  sSet(DICT_CACHE_KEY, entries);
}

/* ---- 教材正文缓存 ----
   和词典缓存同一个道理：抓一次要真联网、要花钱，抓到的正文就该留在本地，
   下次点开直接读、离线也能读，也能当复习材料反复用。

   条目比词条大得多（一节课文上千词），所以上限卡得紧，而且同时按条数和
   总字数两头限——localStorage 是全应用共用的，教材不能把生词本挤掉。 */
export const BOOK_CACHE_KEY = "dd-book-cache-v1";
export const BOOK_CACHE_MAX = 20;
export const BOOK_CACHE_CHARS = 300000;

export function loadBookCache() {
  const raw = sGet(BOOK_CACHE_KEY);
  return new Map(Array.isArray(raw) ? raw : []);
}
export function saveBookCache(map) {
  // 从最近写入的往回留，两个上限谁先到算谁
  let out = [];
  let chars = 0;
  for (const e of [...map.entries()].reverse()) {
    const n = ((e[1] && e[1].chapters) || []).join("").length;
    if (out.length >= BOOK_CACHE_MAX || chars + n > BOOK_CACHE_CHARS) break;
    out.push(e);
    chars += n;
  }
  out.reverse();
  const ok = sSet(BOOK_CACHE_KEY, out);
  return { map: new Map(out), ok };
}

/* ---- 查过几次 ----
   「我点了这个词」是本应用能拿到的最强信号：它精确说明了你不认识哪个词。
   以前这个信号只喂给小测（clickedRef），换篇文章就清空。现在按词累计并落盘，
   查到第 SEEN_NUDGE 次就提醒收进生词本——同一个词查两次，基本可以断定
   你是真不认识，而不是手滑。 */
export const SEEN_KEY = "dd-seen-v1";
export const SEEN_MAX = 800;
export const SEEN_NUDGE = 2;

export function loadSeen() {
  const raw = sGet(SEEN_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}
export function saveSeen(obj) {
  let o = obj;
  const keys = Object.keys(o);
  if (keys.length > SEEN_MAX) {
    // 满了先丢只查过一次的——那些多半是扫一眼就懂的词，留着没意义
    o = {};
    for (const k of keys) if (obj[k] > 1) o[k] = obj[k];
  }
  sSet(SEEN_KEY, o);
  return o;
}

/* ---- 完整备份 ----
   以前唯一的备份是把生词本导出成 Markdown：只带词和释义，复习进度、足迹、
   读过的文章全不带。清一次浏览器数据，几个月的积累就归零了。
   这里把「学习数据」整份装进一个 JSON 文件。刻意不装两样东西：
     API Key —— 备份文件会被拷来拷去、传网盘，密钥不该跟着走；
     各种缓存（词典、教材正文、教材清单）—— 丢了只是重取一次，不是损失。 */
export const BACKUP_MARK = "007-english-backup";
export const BACKUP_KEYS = [VOCAB_KEY, STATS_KEY, SEEN_KEY, HISTORY_KEY, TABS_KEY, PREFS_KEY];

/* 读一份备份文件的文字。返回 { data, at, words, days, arts }；不是备份就抛错。 */
export function parseBackup(text) {
  let j = null;
  try { j = JSON.parse(text); } catch (e) { throw new Error("notjson"); }
  if (!j || j.app !== BACKUP_MARK || !j.data || typeof j.data !== "object") throw new Error("notbackup");
  const d = {};
  for (const k of BACKUP_KEYS) if (j.data[k] != null) d[k] = j.data[k];
  const v = d[VOCAB_KEY];
  if (v != null && !(Array.isArray(v) && v.every((x) => x && typeof x.key === "string" && x.data))) throw new Error("broken");
  if (d[TABS_KEY] != null && !Array.isArray(d[TABS_KEY].tabs)) throw new Error("broken");
  if (d[HISTORY_KEY] != null && !Array.isArray(d[HISTORY_KEY])) throw new Error("broken");
  if (d[STATS_KEY] != null && typeof d[STATS_KEY] !== "object") throw new Error("broken");
  if (!Object.keys(d).length) throw new Error("broken");
  return {
    data: d,
    at: Number(j.at) || 0,
    words: Array.isArray(v) ? v.length : 0,
    days: Object.keys((d[STATS_KEY] && d[STATS_KEY].log) || {}).length,
    arts: ((d[TABS_KEY] && d[TABS_KEY].tabs) || []).length + (d[HISTORY_KEY] || []).length,
  };
}

/* 把备份写回去。要么全写进去，要么一个都不动：中途哪一项写不下
   （存储满了），就把已经写的几项退回原样——半新半旧比不恢复更糟。 */
export function applyBackup(data) {
  const old = {};
  for (const k of BACKUP_KEYS) old[k] = localStorage.getItem(k);
  try {
    for (const k of BACKUP_KEYS) {
      if (data[k] != null) localStorage.setItem(k, JSON.stringify(data[k]));
      else localStorage.removeItem(k);
    }
    return true;
  } catch (e) {
    for (const k of BACKUP_KEYS) {
      try {
        if (old[k] == null) localStorage.removeItem(k);
        else localStorage.setItem(k, old[k]);
      } catch (e2) {}
    }
    return false;
  }
}
