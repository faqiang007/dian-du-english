/* 统一输入框：一个框管所有入口。
   输主题 → 现写一篇；输单词 → 查词；贴网址 → 抓来读；贴整段英文 → 当文章导入。
   它不替你做决定，而是把能做的事排成一行，回车走第一项，想换就点别的。 */

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2, Search } from "lucide-react";
import { providerOf } from "../data/providers.js";
import { countWords, looksLikeSentence } from "../lib/text.js";

/* 看一眼输入的东西像什么，排出能做的事。第一项是回车默认执行的。 */
function routesOf(raw, app) {
  const {
    lookup, translateText, generateArticle, fetchRealArticle, importFromText, importFromUrl,
    setTopic, setImpUrl, providerId,
  } = app;
  const t = raw.trim();
  if (!t) return [];
  const words = countWords(t);
  const hasZh = /[一-鿿]/.test(t);
  const canSearch = providerOf(providerId).webSearch;

  const write = { id: "write", label: "以此为题，AI 现写一篇", wait: false, run: () => { setTopic(t); generateArticle(t); } };
  const real = canSearch
    ? { id: "real", label: "联网找一篇真实文章", wait: true, run: () => { setTopic(t); fetchRealArticle(t); } }
    : null;
  const look = (label) => ({ id: "look", label, wait: false, run: () => lookup(t) });
  const tr = { id: "tr", label: "翻译", wait: false, run: () => translateText(t) };

  // 网址
  if (/^https?:\/\/\S+$/i.test(t)) {
    return [{ id: "url", label: "把这个网页抓来读", wait: true, run: () => { setImpUrl(t); importFromUrl(t); } }];
  }
  // 整段英文：有换行，或者够长
  if (!hasZh && (t.includes("\n") || words >= 40)) {
    return [
      { id: "imp", label: `当作一篇文章来读（约 ${words} 词）`, wait: true, run: () => importFromText(t, "粘贴的文本") },
      t.length <= 700 ? tr : null,
    ].filter(Boolean);
  }
  // 一个英文单词
  if (/^[A-Za-z][A-Za-z'’-]*$/.test(t)) return [look("查这个词"), write, real].filter(Boolean);
  // 一句话（中英都算）
  if (looksLikeSentence(t)) return [tr, write].filter(Boolean);
  // 很短的中文：多半是想问「这个用英文怎么说」
  if (hasZh && t.replace(/\s/g, "").length <= 4) return [look("查它的英文说法"), write, real].filter(Boolean);
  // 英文短语
  if (!hasZh) return [look("查这个短语"), write, real].filter(Boolean);
  // 其余当主题
  return [write, real, look("翻成英文")].filter(Boolean);
}

export function Omni({ app, autoFocus, onDone }) {
  const { impBusy, realBusy, genLoading, impErr, realErr, genError, setImpErr, setRealErr } = app;
  const [text, setText] = useState("");
  const [sel, setSel] = useState(0);
  const [waiting, setWaiting] = useState(false); // 跑的是要等结果的事（联网搜、抓网页）
  const ref = useRef(null);

  const routes = routesOf(text, app);
  const cur = Math.min(sel, Math.max(0, routes.length - 1));
  const busy = impBusy || realBusy;
  const err = impErr || realErr || genError;

  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  // 输入框跟着内容长高，贴进来一整篇也看得见
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);
  // 要等的事做完了：没出错就收工，出错就留着把错误给人看
  useEffect(() => {
    if (!waiting || busy) return;
    setWaiting(false);
    if (!(impErr || realErr)) { setText(""); onDone && onDone(); }
  }, [waiting, busy, impErr, realErr]);

  function run(r) {
    if (!r || busy || genLoading) return;
    setImpErr(""); setRealErr("");
    r.run();
    if (r.wait) setWaiting(true);
    else { setText(""); setSel(0); onDone && onDone(); }
  }

  return (
    <div className="omni">
      <div className="omni-in">
        {busy ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => { setText(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            // 中文输入法正在选字时的回车不算
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(routes[cur]); }
            else if (e.key === "Tab" && routes.length > 1) { e.preventDefault(); setSel((cur + 1) % routes.length); }
          }}
          placeholder="想读什么？查哪个词？也可以贴一段英文或一个网址"
          aria-label="想读什么、查什么词，或贴一段英文、一个网址"
          disabled={busy}
        />
      </div>
      {routes.length > 0 && (
        <div className="omni-routes">
          {routes.map((r, i) => (
            <button key={r.id} className={i === cur ? "omni-r on" : "omni-r"} onClick={() => run(r)} disabled={busy}>
              {i === cur && <CornerDownLeft size={12} />}{r.label}
            </button>
          ))}
        </div>
      )}
      {busy && <p className="hint">{realBusy ? "正在联网找真实文章…" : "正在抓取网页…"}</p>}
      {err && !busy && <div className="callout bad">{err}</div>}
    </div>
  );
}
