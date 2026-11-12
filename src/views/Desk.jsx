/* 读 · 书桌：手边没摊开文章时看到的这一屏。
   左边三扇门——让 AI 现写、找真实文章、读自己的材料；右边是桌上摊着的和读过的。 */

import { useState } from "react";
import { BookOpen, Dices, FileUp, Globe, Loader2, Sparkles, X } from "lucide-react";
import { LEVELS } from "../data/levels.js";
import { providerOf } from "../data/providers.js";
import { TOPIC_CATS, catOf } from "../data/topics.js";
import { agoText, countWords, pickChips } from "../lib/text.js";
import { WEAVE_MAX } from "../lib/vocab.js";

/* 文章的三种来历。「AI 现写」必须是琥珀色、「真实来源」必须是绿色——
   这是诚实性的约定（见 specs/constitution.md 第五条），不是装饰。 */
export function KindTag({ a }) {
  if (a.srcUrl) return <span className="tag real">真实来源</span>;
  if (a.imported) return <span className="tag">导入</span>;
  return <span className="tag ai">AI · {LEVELS.find((l) => l.id === a.level)?.label || "现写"}</span>;
}

export function DeskView({ app }) {
  const { tabs, switchTab, closeTab, pastRead, weekRead, reread, removeHistory, go, impOpen } = app;
  const [door, setDoor] = useState(impOpen ? "own" : "ai");

  return (
    <div className="desk">
      <section className="desk-main">
        <h1 className="kai-h">读点什么</h1>
        <div className="doors" role="tablist">
          <button role="tab" aria-selected={door === "ai"} className={door === "ai" ? "door on" : "door"} onClick={() => setDoor("ai")}>
            <b>现写</b><span>AI 按你的难度和生词当场写</span>
          </button>
          <button role="tab" aria-selected={door === "real"} className={door === "real" ? "door on" : "door"} onClick={() => setDoor("real")}>
            <b>真文章</b><span>联网找一篇，带原文链接</span>
          </button>
          <button role="tab" aria-selected={door === "own"} className={door === "own" ? "door on" : "door"} onClick={() => setDoor("own")}>
            <b>自己的</b><span>粘贴、上传文件、给个网址</span>
          </button>
          <button className="door" onClick={() => go("books")}>
            <b>教材库</b><span>公版读物，按难度分好了</span>
          </button>
        </div>

        {door === "ai" && <ComposePanel app={app} />}
        {door === "real" && <RealPanel app={app} />}
        {door === "own" && <ImportPanel app={app} />}
      </section>

      <aside className="desk-side">
        <div className="lbl">桌上摊着</div>
        {tabs.length === 0 && <p className="hint">还没有文章。</p>}
        <ul className="pile">
          {tabs.map((t) => (
            <li key={t.id}>
              <button className="pile-b" onClick={() => switchTab(t.id)}>
                <b>{t.title || "未命名"}</b>
                <span>
                  <KindTag a={t} />
                  {t.chapters?.length > 1
                    ? `第 ${(t.ch || 0) + 1} / ${t.chapters.length} 章`
                    : `约 ${countWords((t.chapters || []).join(" "))} 词`}
                </span>
                {t.chapters?.length > 1 && (
                  <div className="prog"><i style={{ width: `${(((t.ch || 0) + 1) / t.chapters.length) * 100}%` }} /></div>
                )}
              </button>
              <button className="iconbtn danger" onClick={() => closeTab(t.id)} aria-label={`收起《${t.title}》`} title="收起（会留在「读过的」里）">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>

        {/* 读过的文章。重读旧文比读新文更能巩固词汇——同一批词在同一个语境里再见一次。 */}
        {pastRead.length > 0 && (
          <>
            <div className="lbl">读过的{weekRead > 0 ? ` · 本周 ${weekRead} 篇` : ""}</div>
            <p className="hint">重读一遍比读新的更能记住词</p>
            <ul className="pile">
              {pastRead.slice(0, 8).map((h) => (
                <li key={h.id}>
                  <button className="pile-b" onClick={() => reread(h)}>
                    <b>{h.title || "未命名"}</b>
                    <span>
                      <KindTag a={h} />
                      {agoText(h.readAt)}{h.woven?.length ? ` · 织入过 ${h.woven.length} 个生词` : ""}
                    </span>
                  </button>
                  <button className="iconbtn danger" onClick={() => removeHistory(h.id)}
                    aria-label={`从「读过的」移除《${h.title || "未命名"}》`} title="移除">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

/* ---------- 现写 ---------- */

function ComposePanel({ app }) {
  const {
    topic, setTopic, generateArticle, genLoading, genError, level, setLevel, setStats,
    weaveCands, weavePicked, weaveOn, setWeaveOn, toggleWeave,
  } = app;
  const lv = LEVELS.find((l) => l.id === level);
  return (
    <div className="panel">
      <p className="panel-note">
        <span className="tag ai"><Sparkles size={12} /> AI 现写</span>
        只写公认的知识，但具体数字、年份可能有出入，别直接引用
      </p>
      <input
        className="big-in"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) generateArticle(); }}
        placeholder="想读什么？留空则由 AI 照着你选的生词自己定"
        aria-label="主题"
      />

      <div className="panel-row">
        <span className="panel-l">难度</span>
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l.id} className={l.id === level ? "on" : ""} title={l.tag}
              onClick={() => { setLevel(l.id); setStats((st) => ({ ...st, lv: l.id })); }}
            >{l.label}</button>
          ))}
        </div>
        <span className="hint">{lv?.tag} · 约 {lv?.words} 词</span>
      </div>

      <div className="panel-row">
        <span className="panel-l">描红</span>
        <button
          className={weaveOn ? "switch on" : "switch"}
          onClick={() => setWeaveOn((o) => !o)}
          aria-pressed={weaveOn}
          aria-label="把生词织进文章"
          title="把生词本里的词织进文章，在上下文里再见一次"
        />
        <span className="hint">
          {!weaveCands.length
            ? "生词本还空着——查几个词存起来，之后就能织进文章里复习"
            : weaveOn
              ? `把这 ${weavePicked.length} 个还没写熟的词织进文章，点词可增减（最多 ${WEAVE_MAX} 个）`
              : "关着，文章不会特意用你的生词"}
        </span>
        {weaveOn && weaveCands.length > 0 && (
          <div className="weave">
            {weaveCands.map((w) => (
              <button key={w} className={weavePicked.includes(w) ? "wd on" : "wd"}
                aria-pressed={weavePicked.includes(w)} onClick={() => toggleWeave(w)}>{w}</button>
            ))}
          </div>
        )}
      </div>

      <div className="panel-f">
        <button className="btn pri lg" onClick={() => generateArticle()} disabled={genLoading}>
          <Sparkles size={16} /> 让 AI 现写一篇
        </button>
        <span className="hint">
          {topic.trim()
            ? ""
            : weaveOn && weavePicked.length
              ? `不限主题，AI 会围绕这 ${weavePicked.length} 个生词找个合适的情境`
              : "写个主题，或者打开上面的「描红」选几个词"}
        </span>
      </div>
      {genError && (
        <div className="callout bad">
          {genError} <button className="link" onClick={() => generateArticle()}>重试</button>
        </div>
      )}
    </div>
  );
}

/* ---------- 找真实文章 ---------- */

function RealPanel({ app }) {
  const { providerId, go, chips, setChips, chipCat, setChipCat, setTopic, fetchRealArticle, realBusy, realErr, setRealErr } = app;
  const canSearch = providerOf(providerId).webSearch;
  return (
    <div className="panel">
      <p className="panel-note">
        <span className="tag real"><Globe size={12} /> 真实来源</span>
        点一个话题去联网搜；出处只认搜索引擎真访问过的页面，拿不到就不收
      </p>
      {!canSearch && (
        <div className="callout hi">
          当前服务商 <b>{providerOf(providerId).name}</b> 不支持联网搜索，找不了真实文章。
          去<button className="link" onClick={() => go("settings")}>设置</button>换成 OpenRouter 即可。
        </div>
      )}
      {realErr && <div className="callout bad">{realErr}</div>}

      <div className="cats">
        {TOPIC_CATS.map((c) => (
          <button key={c.id} className={c.id === chipCat ? "cat on" : "cat"}
            onClick={() => { setChipCat(c.id); setChips(pickChips(c.pool)); setRealErr(""); }}
          >{c.name}</button>
        ))}
      </div>
      <div className="idx">
        {chips.map((c, i) => (
          <button key={c} className="tp" onClick={() => { setTopic(c); fetchRealArticle(c); }}>
            <b>{String(i + 1).padStart(2, "0")}</b><span>{c}</span>
          </button>
        ))}
      </div>
      <div className="panel-f">
        <button className="btn pri lg" onClick={() => fetchRealArticle()} disabled={realBusy}>
          {realBusy
            ? <><Loader2 size={15} className="spin" /> 搜索中…</>
            : <><Globe size={15} /> 本类随机一篇</>}
        </button>
        <button className="btn txt" onClick={() => setChips(pickChips(catOf(chipCat).pool))}>
          <Dices size={14} /> 换一批话题
        </button>
      </div>
    </div>
  );
}

/* ---------- 自己的材料：粘贴 / 文件 / 网址 ---------- */

function ImportPanel({ app }) {
  const {
    impTab, setImpTab, impText, setImpText, impUrl, setImpUrl, impBusy, impErr,
    importFromText, importFromUrl, handleImportFile,
  } = app;
  return (
    <div className="panel imp">
      <div className="seg">
        <button className={impTab === "paste" ? "on" : ""} onClick={() => setImpTab("paste")}>粘贴文本</button>
        <button className={impTab === "file" ? "on" : ""} onClick={() => setImpTab("file")}>上传文件</button>
        <button className={impTab === "url" ? "on" : ""} onClick={() => setImpTab("url")}>网址 / 视频</button>
      </div>

      {impTab === "paste" && (
        <>
          <textarea
            className="field area"
            value={impText}
            onChange={(e) => setImpText(e.target.value)}
            placeholder="把英文文章、视频字幕、邮件……任何想读的英文内容粘贴到这里"
          />
          <div className="imp-row">
            <button className="btn pri" onClick={() => importFromText(impText, "粘贴的文本")}>
              <BookOpen size={14} /> 开始阅读
            </button>
            <span className="hint">长文会按段落自动分章，每章约 350 词，查词和小测只针对当前这一章</span>
          </div>
        </>
      )}

      {impTab === "file" && (
        <>
          <label className="filebtn">
            {impBusy ? <Loader2 size={15} className="spin" /> : <FileUp size={15} />}
            {impBusy ? " 解析中…" : " 选择文件（.txt / .md / .docx / .epub）"}
            <input type="file" accept=".txt,.md,.docx,.epub"
              style={{ display: "none" }} onChange={handleImportFile} />
          </label>
          <p className="hint">EPUB 会按书里的正文顺序整本导入，自动分章。PDF 暂不支持——把文字复制出来，用「粘贴文本」导入即可。</p>
        </>
      )}

      {impTab === "url" && (
        <>
          <div className="imp-row">
            <input
              className="field grow"
              value={impUrl}
              onChange={(e) => setImpUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") importFromUrl(); }}
              placeholder="https://…  文章或视频链接"
            />
            <button className="btn pri" onClick={importFromUrl} disabled={impBusy}>
              {impBusy ? <><Loader2 size={14} className="spin" /> 抓取中…</> : "抓取并阅读"}
            </button>
          </div>
          <p className="hint">通过网络搜索抓取公开页面正文；视频会尽力找英文字幕或简介。抓不到时，复制正文用「粘贴文本」最稳。</p>
        </>
      )}

      {impErr && <div className="callout bad">{impErr}</div>}
    </div>
  );
}
