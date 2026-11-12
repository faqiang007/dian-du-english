/* 生词本：一行一词的紧凑列表，点开才看详情。
   分三组——待复习 / 学习中 / 已掌握；已掌握的默认折起来，第一屏留给真正要看的。 */

import { useMemo, useState } from "react";
import {
  Brain, ChevronDown, Copy, Download, MoreHorizontal, Search, Trash2, Upload, Volume2, X,
} from "lucide-react";
import { isMastered, rvOf, vbBrief, vbHay, vbPhon, vbWord } from "../lib/vocab.js";
import { Boldify } from "../ui/Boldify.jsx";

export function VocabView({ app }) {
  const {
    vocab, dueList, startReview, speak, removeWord, copyVocab, downloadVocab,
    vImpOpen, setVImpOpen, vImpText, setVImpText, importVocabMd,
    confirmClear, setConfirmClear, clearVocab, lookup,
  } = app;
  const dueCount = dueList.length;

  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [fold, setFold] = useState({ done: true });

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const hit = kw ? vocab.filter((v) => vbHay(v.data).includes(kw)) : vocab;
    const now = Date.now();
    const due = [], learn = [], done = [];
    for (const v of hit) {
      if (rvOf(v).due <= now) due.push(v);
      else if (isMastered(v)) done.push(v);
      else learn.push(v);
    }
    due.sort((a, b) => rvOf(a).due - rvOf(b).due);
    const recent = (a, b) => (b.savedAt || 0) - (a.savedAt || 0);
    learn.sort(recent);
    done.sort(recent);
    return [
      { id: "due", name: "待复习", items: due },
      { id: "learn", name: "学习中", items: learn },
      { id: "done", name: "已掌握", items: done },
    ];
  }, [vocab, q]);

  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="page">
      <div className="page-h">
        <h1>生词本 <span className="count">{vocab.length}</span></h1>
        <div className="page-a">
          {vocab.length > 0 && (
            <button className={dueCount ? "btn pri" : "btn sec"} onClick={startReview}>
              <Brain size={14} /> {dueCount ? `开始复习 · ${dueCount}` : "今日无待复习"}
            </button>
          )}
          <span className="pop">
            <button className="btn sec" onClick={() => setMenu((o) => !o)} aria-expanded={menu}>
              <MoreHorizontal size={15} /> 导入 / 导出
            </button>
            {menu && (
              <>
                <div className="popmask" onClick={() => { setMenu(false); setConfirmClear(false); }} />
                <div className="menu right">
                  <button className="mi" onClick={() => { setMenu(false); copyVocab(); }}>
                    <Copy size={14} /> 复制为 Markdown
                  </button>
                  <button className="mi" onClick={() => { setMenu(false); downloadVocab(); }}>
                    <Download size={14} /> 下载 .md 文件
                  </button>
                  <button className="mi" onClick={() => { setMenu(false); setVImpOpen(true); }}>
                    <Upload size={14} /> 导入生词（粘贴 md）
                  </button>
                  {vocab.length > 0 && (
                    <>
                      <div className="mi-div" />
                      {confirmClear ? (
                        <button className="mi danger" onClick={() => { setMenu(false); clearVocab(); }}>
                          确认清空全部？
                        </button>
                      ) : (
                        <button className="mi danger"
                          onClick={() => { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }}>
                          <Trash2 size={14} /> 清空生词本
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </span>
        </div>
      </div>

      {vImpOpen && (
        <div className="imp boxed">
          <textarea
            className="field area"
            value={vImpText}
            onChange={(e) => setVImpText(e.target.value)}
            placeholder={'粘贴之前用「复制 md / 下载 .md」导出的生词本内容，例如：\n## resilient  /rɪˈzɪliənt/\n- adj. 有韧性的\n- 例：She is resilient. — 她很有韧性。'}
          />
          <div className="imp-row">
            <button className="btn pri" onClick={importVocabMd}><Upload size={14} /> 导入</button>
            <span className="hint">已存在的词会自动跳过 · 换版本搬家就靠它</span>
          </div>
        </div>
      )}

      {vocab.length === 0 ? (
        <div className="empty">
          <span className="stamp">007</span>
          <p>还没有生词。</p>
          <p className="mut">读文章时点击单词，或在顶部搜索，然后点「加入生词本」。</p>
        </div>
      ) : (
        <>
          <label className="search wide">
            <Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜单词或中文释义" />
            {q && <button className="iconbtn" onClick={() => setQ("")} aria-label="清空"><X size={13} /></button>}
          </label>

          {q && shown === 0 && <div className="empty"><p>没有匹配「{q}」的词</p></div>}

          {groups.map((g) => {
            if (!g.items.length) return null;
            // 搜索时一律展开，否则搜出来的东西藏在折叠组里等于没搜
            const folded = q ? false : !!fold[g.id];
            return (
              <section className="vgrp" key={g.id}>
                <button className="vgrp-h" aria-expanded={!folded}
                  onClick={() => setFold((f) => ({ ...f, [g.id]: !f[g.id] }))}>
                  <ChevronDown size={14} className={folded ? "turn" : ""} />
                  <b className={g.id}>{g.name}</b>
                  <span>{g.items.length}</span>
                </button>
                {!folded && (
                  <div className="vrows">
                    {g.items.map((v) => (
                      <VocabRow key={v.key} v={v} on={openKey === v.key}
                        onToggle={() => setOpenKey(openKey === v.key ? null : v.key)}
                        onSpeak={speak} onRemove={removeWord} onLookup={(w) => lookup(w)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function VocabRow({ v, on, onToggle, onSpeak, onRemove, onLookup }) {
  const d = v.data;
  const r = rvOf(v);
  const ph = vbPhon(d);
  return (
    <div className={on ? "vrow on" : "vrow"}>
      <button className="vrow-main" onClick={onToggle} aria-expanded={on}>
        <span className="vrow-w">{vbWord(d)}</span>
        {ph && <span className="vrow-ph">{ph}</span>}
        <span className="vrow-brief">{vbBrief(d)}</span>
      </button>
      <button className="iconbtn" aria-label="发音"
        onClick={() => onSpeak(d.type === "en" ? d.word : ((d.translations || [])[0] || {}).en || d.input, "en-US")}>
        <Volume2 size={13} />
      </button>
      <button className="iconbtn danger" onClick={() => onRemove(v.key)} aria-label="移除">
        <X size={13} />
      </button>

      {on && (
        <div className="vrow-det">
          {d.type === "en" ? (
            <>
              <ol className="senses tight">
                {(d.senses || []).map((x, i) => <li key={i}><i>{x.pos}</i><span>{x.cn}</span></li>)}
              </ol>
              {/* 计算机含义是特意查出来的东西，收进生词本却看不到，等于白查。
                  位置和查词卡保持一致：释义之后、例句之前 */}
              {d.tech_cn && <div className="ctx tech"><small>计算机里</small>{d.tech_cn}</div>}
              {(d.examples || []).slice(0, 2).map((ex, i) => (
                <p className="exline" key={i}>
                  <Boldify text={ex.en} word={d.word} />
                  <small> — {ex.cn}</small>
                </p>
              ))}
            </>
          ) : (
            (d.translations || []).map((t, i) => (
              <div className="tr-top" key={i}>
                <b>{t.en}</b>
                {t.phonetic_us && <span className="tr-ph">{t.phonetic_us}</span>}
                <button className="say" onClick={() => onSpeak(t.en, "en-US")} aria-label="发音">
                  <Volume2 size={12} />
                </button>
                {t.pos && <i>{t.pos}</i>}
              </div>
            ))
          )}
          <div className="vrow-meta">
            {r.due <= Date.now()
              ? <span className="tag hot">待复习</span>
              : <span className="mut">连对 {r.streak} 次 · 见过 {v.meet || 1} 次</span>}
            <button className="link quiet" onClick={() => onLookup(vbWord(d))}>
              <Search size={12} /> 重新查这个词
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
