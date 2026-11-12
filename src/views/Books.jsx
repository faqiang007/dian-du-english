/* 教材库：随应用发布的公版语料，按难度分五档。取回来的正文存在本地，离线也能读。 */

import { useMemo, useState } from "react";
import { BookOpen, Check, Download, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { LEVELS } from "../data/levels.js";

export function BooksView({ app }) {
  const { books, booksBusy, booksErr, level, loadLibrary, readBook, readBusy, readErr, cachedBooks } = app;

  // 只在本页选难度，不改全局设置——来看看别的水平有什么，不该顺手把阅读难度也改了
  const [lv, setLv] = useState(level);
  const [q, setQ] = useState("");
  const cur = LEVELS.find((l) => l.id === lv) || LEVELS[1];
  const all = (books && books.items) || [];

  // 筛选全在本地做，索引已经在手上了，敲字不发任何请求
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all
      .filter((x) => x.lv === lv)
      .filter((x) => !kw || (x.title + " " + x.book + " " + x.author).toLowerCase().includes(kw))
      .sort((x, y) => x.words - y.words);
  }, [all, lv, q]);

  const counts = useMemo(() => {
    const m = {};
    for (const x of all) m[x.lv] = (m[x.lv] || 0) + 1;
    return m;
  }, [all]);

  return (
    <div className="page">
      <div className="page-h">
        <h1>教材库 {all.length > 0 && <span className="count">{list.length} / {all.length} 篇</span>}</h1>
        <div className="page-a">
          <button className="btn sec" onClick={() => loadLibrary(true)} disabled={booksBusy}>
            {booksBusy ? <><Loader2 size={15} className="spin" /> 更新中…</> : <><RefreshCw size={15} /> 更新清单</>}
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l.id} className={l.id === lv ? "on" : ""} onClick={() => setLv(l.id)}>
              {l.label}{counts[l.id] ? <small>{counts[l.id]}</small> : null}
            </button>
          ))}
        </div>
        <label className="search grow">
          <Search size={14} />
          <input value={q} placeholder="按标题、作者、书名筛（不联网）" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <p className="hint">{cur.tag} · {cur.spec}</p>

      <details className="about">
        <summary>这些材料是哪来的</summary>
        <p>
          全部是<b>版权已过期的公版文学</b>（伊索寓言、格林/安徒生童话、爱丽丝、丛林之书、
          汤姆索亚、福尔摩斯、欧亨利短篇、圣诞颂歌、傲慢与偏见）和
          <b>Simple English Wikipedia</b>（CC BY-SA 4.0）。每篇都标了作者、出处和许可，
          点开能核对。
        </p>
        <p>
          语料随应用一起发布，从 jsDelivr 取，<b>国内直连可用，不需要代理</b>。
          这是刻意的选择：能实时抓的第三方站要么国内连不上，要么不放行跨域，没有交集。
        </p>
        <p>
          难度按来源类型定区间、再用可读性指标（句长、长词比例）在区间内选一档。
          点「取来读」会把正文取回来<b>存在本地</b>，之后离线也能读，
          和你自己导入的文章一样能点词查词、做小测。
        </p>
      </details>

      {booksErr && <div className="callout bad">{booksErr}</div>}
      {readErr && <div className="callout bad">{readErr}</div>}

      {all.length === 0 && !booksBusy && !booksErr && (
        <div className="empty"><span className="ge">书</span><p>正在取教材清单…</p></div>
      )}
      {all.length > 0 && list.length === 0 && (
        <div className="empty"><p>这个难度下没有匹配「{q}」的篇目，换个词或换个难度</p></div>
      )}

      {list.length > 0 && (
        <>
          <ul className="shelf books">
            {list.map((b) => {
              const saved = cachedBooks[b.id] > 0;
              return (
                <li key={b.id}>
                  <div className="bk static">
                    <div className="bk-main">
                      <div className="bk-t">{b.title}</div>
                      <div className="bk-m">
                        <span className="tag">{b.kind}</span>
                        {b.author} · {b.book}
                      </div>
                    </div>
                    <div className="bk-p">
                      约 {b.words} 词 · {b.lic}
                      {saved && <span className="saved"><Check size={12} /> 已存本地 · 离线也能读</span>}
                    </div>
                    <div className="bk-acts">
                      <a className="link quiet" href={b.srcUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> 出处
                      </a>
                      <button className={saved ? "btn pri" : "btn sec"} onClick={() => readBook(b)} disabled={!!readBusy}>
                        {readBusy === b.id
                          ? <><Loader2 size={14} className="spin" /> 取正文…</>
                          : saved
                            ? <><BookOpen size={14} /> 读这篇</>
                            : <><Download size={14} /> 取来读</>}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="hint foot">共 {all.length} 篇，按 CEFR 分五档。内容随应用发布，读过的存在本地</p>
        </>
      )}
    </div>
  );
}
