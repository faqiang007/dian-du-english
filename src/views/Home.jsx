/* 主页：「今天想读点什么」。
   从上到下只有四件事：今天先做什么 → 让 AI 现写一篇 → 接着读 → 找一篇真实文章。 */

import {
  ArrowRight, BookOpen, Brain, ChevronDown, Dices, FileUp, Globe, Loader2, Sparkles, Upload, X,
} from "lucide-react";
import { LEVELS } from "../data/levels.js";
import { providerOf } from "../data/providers.js";
import { TOPIC_CATS, catOf } from "../data/topics.js";
import { agoText, countWords, pickChips } from "../lib/text.js";
import { WEAVE_MAX } from "../lib/vocab.js";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/* 文章的三种来历。「AI 现写」必须是琥珀色、「真实来源」必须是绿色——
   这是诚实性的约定（见 specs/constitution.md 第五条），不是装饰。 */
export function KindTag({ a }) {
  if (a.srcUrl) return <span className="tag real">真实来源</span>;
  if (a.imported) return <span className="tag">导入</span>;
  return <span className="tag ai">AI · {LEVELS.find((l) => l.id === a.level)?.label || "现写"}</span>;
}

export function HomeView({ app }) {
  const {
    dueList, article, startReview, weaveCands, weavePicked, weaveOn, setWeaveOn, toggleWeave,
    topic, setTopic, generateArticle, genLoading, genError, setHomeMode, setView,
    providerId, go, level, setLevel, setStats, impOpen, setImpOpen, setImpErr,
    tabs, switchTab, pastRead, weekRead, reread, removeHistory,
    chips, setChips, chipCat, setChipCat, fetchRealArticle, realBusy, realErr, setRealErr,
  } = app;

  const now = new Date();
  const lv = LEVELS.find((l) => l.id === level);
  const canSearch = providerOf(providerId).webSearch;

  return (
    <div className="page home">
      <div className="dateline">
        <span>{now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{WEEKDAYS[now.getDay()]}</span>
        <span>{lv?.label} {lv?.id}{weekRead > 0 ? ` · 本周读过 ${weekRead} 篇` : ""}</span>
      </div>
      <h1 className="h1">今天想读点什么？</h1>

      {/* 当日主线：先给一个默认动作。下面几块都在喊「从我这儿开始」，
          每次打开都要重新决策一遍，累的是人。有到期的词就先复习，否则接着上次读。 */}
      {(dueList.length > 0 || article) && (
        <section className="lead">
          {dueList.length > 0 ? (
            <>
              <div className="lead-n">{dueList.length}</div>
              <div className="lead-t">
                <b>个词到期了</b>
                <span>先复习，再读新的</span>
              </div>
              <div className="lead-a">
                <button className="btn pri lg" onClick={startReview}>
                  <Brain size={16} /> 复习 {dueList.length} 个词
                </button>
                {weaveCands.length > 0 && (
                  <button className="btn sec lg"
                    onClick={() => { setWeaveOn(true); setTopic(""); generateArticle("", null, { weave: weavePicked }); }}
                    disabled={genLoading}>
                    <Sparkles size={16} /> 读一篇织入它们的文章
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="lead-t">
                <span className="lbl">接着读</span>
                <b className="lead-title">{article.title}</b>
                {(article.chapters || []).length > 1 && (
                  <span>第 {(article.ch || 0) + 1} / {article.chapters.length} 章</span>
                )}
              </div>
              <div className="lead-a">
                <button className="btn pri lg" onClick={() => { setHomeMode(false); setView("read"); }}>
                  <BookOpen size={16} /> 继续读
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---- AI 现写：整页唯一一张「卡」，因为它是唯一要填的表单 ---- */}
      <section className="compose">
        <div className="compose-h">
          <span className="tag ai"><Sparkles size={12} /> AI 现写</span>
          <span>按下面的设定当场写一篇。只写公认的知识，但具体数字、年份可能有出入，别直接引用</span>
        </div>
        <input
          className="compose-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") generateArticle(); }}
          placeholder="想读什么？留空则由 AI 照着你选的生词自己定"
          aria-label="主题"
        />

        <div className="compose-row">
          <span className="compose-l">难度</span>
          <div className="seg">
            {LEVELS.map((l) => (
              <button key={l.id} className={l.id === level ? "on" : ""} title={l.tag}
                onClick={() => { setLevel(l.id); setStats((st) => ({ ...st, lv: l.id })); }}
              >{l.label}</button>
            ))}
          </div>
          <span className="hint">{lv?.tag} · 约 {lv?.words} 词</span>
        </div>

        <div className="compose-row">
          <span className="compose-l">复习生词</span>
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
                ? `已选 ${weavePicked.length} 个，点词可增减（最多 ${WEAVE_MAX} 个）`
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

        <div className="compose-f">
          <button className="btn pri lg" onClick={() => generateArticle()} disabled={genLoading}>
            <Sparkles size={16} /> 让 AI 现写一篇
          </button>
          <span className="hint">
            {topic.trim()
              ? ""
              : weaveOn && weavePicked.length
                ? `不限主题，AI 会围绕这 ${weavePicked.length} 个生词找个合适的情境`
                : "写个主题，或者打开上面的「复习生词」选几个词"}
          </span>
          <button className="link compose-imp" aria-expanded={impOpen}
            onClick={() => { setImpOpen((o) => !o); setImpErr(""); }}>
            <Upload size={13} /> 导入自己的材料
            <ChevronDown size={13} className={impOpen ? "flip" : ""} />
          </button>
        </div>

        {genError && (
          <div className="callout bad in-card">
            {genError} <button className="link" onClick={() => generateArticle()}>重试</button>
          </div>
        )}
        {impOpen && <ImportPanel app={app} />}
      </section>

      {tabs.length > 0 && (
        <>
          <div className="sect"><h2>继续读</h2></div>
          <ul className="shelf">
            {tabs.map((t) => (
              <li key={t.id}>
                <button className="bk" onClick={() => switchTab(t.id)}>
                  <div className="bk-main">
                    <div className="bk-t">{t.title || "未命名"}</div>
                    <div className="bk-m">
                      <KindTag a={t} />
                      {t.topic || "未分类"} · 约 {countWords((t.chapters || []).join(" "))} 词
                    </div>
                  </div>
                  <div className="bk-p">
                    {t.chapters?.length > 1 && (
                      <>
                        <div className="prog"><i style={{ width: `${(((t.ch || 0) + 1) / t.chapters.length) * 100}%` }} /></div>
                        读到第 {(t.ch || 0) + 1} / {t.chapters.length} 章
                      </>
                    )}
                  </div>
                  <span className="bk-go">接着读 <ArrowRight size={14} /></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 读过的文章。重读旧文比读新文更能巩固词汇——同一批词在同一个
          语境里再见一次。 */}
      {pastRead.length > 0 && (
        <>
          <div className="sect">
            <h2>读过的</h2>
            <p>{weekRead > 0 ? `本周读过 ${weekRead} 篇 · ` : ""}重读一遍比读新的更能记住词</p>
          </div>
          <ul className="shelf">
            {pastRead.slice(0, 8).map((h) => (
              // 整行是个按钮，删除键不能嵌在里面（按钮套按钮不合法），所以并排放
              <li key={h.id} className="has-x">
                <button className="bk" onClick={() => reread(h)}>
                  <div className="bk-main">
                    <div className="bk-t">{h.title || "未命名"}</div>
                    <div className="bk-m">
                      <KindTag a={h} />
                      {h.topic || "未分类"} · {countWords((h.chapters || []).join(" "))} 词
                    </div>
                  </div>
                  <div className="bk-p">
                    {agoText(h.readAt)}
                    {h.woven?.length ? ` · 织入过 ${h.woven.length} 个生词` : ""}
                  </div>
                  <span className="bk-go">重读 <ArrowRight size={14} /></span>
                </button>
                <button className="bk-x" onClick={() => removeHistory(h.id)}
                  aria-label={`从「读过的」移除《${h.title || "未命名"}》`} title="移除">
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="sect">
        <h2>找一篇真实文章</h2>
        <p>点话题去联网搜，带可核对的原文链接</p>
        <div className="sect-r">
          <button className="btn txt" onClick={() => setChips(pickChips(catOf(chipCat).pool))}>
            <Dices size={14} /> 换一批
          </button>
          <button className="btn sec" onClick={() => fetchRealArticle()} disabled={realBusy}>
            {realBusy
              ? <><Loader2 size={14} className="spin" /> 搜索中…</>
              : <><Globe size={14} /> 本类随机一篇</>}
          </button>
        </div>
      </div>

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
    </div>
  );
}

/* ---------- 导入自己的材料：粘贴 / 文件 / 网址 ---------- */

function ImportPanel({ app }) {
  const {
    impTab, setImpTab, impText, setImpText, impUrl, setImpUrl, impBusy, impErr,
    importFromText, importFromUrl, handleImportFile,
  } = app;
  return (
    <div className="imp">
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
