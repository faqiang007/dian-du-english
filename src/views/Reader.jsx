/* 读 · 正文。
   点哪个词，释义小卡就浮在那个词下面，眼睛不用离开这一行；
   你自己的生词在文中是红的（还在描），掌握了的是黑的（已经会写）。
   工具收在底部一条悬浮的小坞里，读的时候不占地方。 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Globe, Languages, Loader2,
  Mic, Play, Plus, Puzzle, RefreshCw, Sparkles, Square, Volume2, X,
} from "lucide-react";
import { LEVELS } from "../data/levels.js";
import { hostOf, splitSentences } from "../lib/text.js";
import { formsOf, isMastered } from "../lib/vocab.js";

export function ReaderView({ app, peek, onExpand }) {
  const {
    article, tabs, activeId, switchTab, closeTab, openBlankTab,
    genLoading, genError, topic, reTopicOf, generateArticle, continueSeries,
    reading, toggleReadArticle, toggleTrans, transBusy, showTrans, startShadow, shadow,
    quiz, go, lvHint, setLvHint, clicks, clickedRef, setLevel, setStats, showToast, lvMenu, setLvMenu,
    curWords, curMins, chapters, chIdx, gotoCh, curText, curTrans,
    dict, dictOpen, savedSurfaces, wovenSet, vocab, flatSents, readIdx, lookup, setSelTip,
    markRead, chRead,
  } = app;
  const box = useRef(null);
  const recapRef = useRef(null);

  /* 这一章算不算「读完了」：文末那一栏滚进了屏幕，而且从打开到现在的时间
     够读完它——按每秒 8 个词算（一分钟 480 词，比谁读得都快），所以真读了的人
     一定够，只有打开就拉到底的不够。够了才记词数、才算今天的「读」。 */
  const openedAt = useRef(Date.now());
  useEffect(() => { openedAt.current = Date.now(); }, [article?.id, chIdx, curText]);
  useEffect(() => {
    const el = recapRef.current;
    if (!el || !article || chRead || genLoading || !curWords) return;
    const need = Math.min(180, Math.max(8, curWords / 8)) * 1000;
    let timer = null;
    let seen = false;
    const check = () => {
      clearTimeout(timer);
      if (!seen) return;
      const left = need - (Date.now() - openedAt.current);
      if (left <= 0) markRead();
      else timer = setTimeout(check, left + 50);
    };
    const io = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; check(); });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [article?.id, chIdx, curText, chRead, genLoading]);

  /* 划词之后冒什么：两到四个英文词多半是词组，给「查词组」（查得到就能收藏）；
     更长的是句子，只给「译」。sent 是它所在的那句话，查词组时当语境。 */
  const tipFor = (minLen, needSpace) => {
    try {
      const sel = window.getSelection();
      const t = sel ? sel.toString().trim() : "";
      const phrase = /^[A-Za-z][A-Za-z'’-]*(\s+[A-Za-z'’-]+){1,3}$/.test(t);
      const long = t.length >= minLen && (!needSpace || /\s/.test(t) || /[一-鿿]/.test(t));
      if (!t || !(phrase || long)) { setSelTip(null); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      const sen = node && node.closest ? node.closest(".sen") : null;
      setSelTip({
        x: r.left + r.width / 2, y: r.top, text: t,
        kind: phrase ? "phrase" : "tr",
        sent: phrase && sen ? sen.textContent.trim() : "",
      });
    } catch (e) { setSelTip(null); }
  };

  /* 已经掌握的生词：文中不再标红。和 savedSurfaces 用同一套取词办法。 */
  const inkSet = useMemo(() => {
    const s = new Set();
    vocab.forEach((v) => {
      if (v.data?.type === "en" && isMastered(v)) {
        for (const f of formsOf(v.data.word)) s.add(f);
        if (v.surface) s.add(v.surface.toLowerCase());
      }
    });
    return s;
  }, [vocab]);

  /* 正在现写：文章还没来，只画骨架。此时 article 可能还是上一篇，也可能是空的，
     所以这一支里不碰 article 的任何字段。 */
  if (genLoading) {
    return (
      <article className="art">
        <Skeleton topic={topic || reTopicOf(article)} />
      </article>
    );
  }

  const lvOf = (id) => LEVELS.find((l) => l.id === id);
  const part = article.part || 1;   // 连载里的第几部分；普通文章是 1
  const looked = [...clickedRef.current]; // 本章点过的词；clicks 变了会重画，所以这里读得到最新的
  const last = chIdx >= chapters.length - 1;

  return (
    <article className="art" ref={box}>
      {/* 桌上摊着的几篇，随手换 */}
      <div className="art-tabs">
        <button className="btn txt sm" onClick={openBlankTab}><ChevronLeft size={14} /> 书桌</button>
        {tabs.map((t) => (
          <span key={t.id} className={t.id === activeId ? "art-tab on" : "art-tab"}>
            <button onClick={() => switchTab(t.id)} title={t.title}>{t.title || "未命名"}</button>
            <button onClick={() => closeTab(t.id)} aria-label={`收起《${t.title}》`}><X size={11} /></button>
          </span>
        ))}
      </div>

      {/* 点词密度给出的难度建议。只提示不自动改——难度改了下一篇才生效，
          替用户默默改掉会让人莫名其妙。 */}
      {lvHint && (
        <div className="callout hi row">
          <span>
            {lvHint.dir === "down"
              ? `这篇你点了 ${clicks} 个词，可能偏难了`
              : `上一篇你几乎没查词，也许可以再难一点`}
          </span>
          <span className="callout-a">
            <button className="btn sec sm" onClick={() => {
              setLevel(lvHint.to);
              setStats((s) => ({ ...s, lv: lvHint.to }));
              showToast(`难度已调到「${lvHint.label}」，下一篇生效`);
              setLvHint(null);
            }}>调到{lvHint.label}</button>
            <button className="iconbtn" onClick={() => setLvHint(null)} aria-label="不用了">
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      <div className="kicker">
        {article.srcUrl ? (
          <>
            <span className="tag real"><Globe size={11} /> 真实来源</span>
            <a className="link" href={article.srcUrl} target="_blank" rel="noreferrer">
              {article.srcSite || hostOf(article.srcUrl)} <ExternalLink size={11} />
            </a>
            {article.srcDate && <><i>·</i>{article.srcDate}</>}
            <i>·</i>约 {curWords} 词
            <i>·</i>{curMins} 分钟
          </>
        ) : article.imported ? (
          <>
            <span className="tag">导入</span>
            来源「{article.topic}」
            <i>·</i>约 {curWords} 词
            <i>·</i>{curMins} 分钟
          </>
        ) : (
          <>
            <span className="tag ai" title="内容由 AI 现写，不是真实报道，不要当作事实引用">AI 现写</span>
            <span className="pop">
              <button className="link" onClick={() => setLvMenu((o) => !o)} aria-expanded={lvMenu}>
                {lvOf(article.level)?.label} {article.level} <ChevronDown size={12} />
              </button>
              {lvMenu && (
                <>
                  <div className="popmask" onClick={() => setLvMenu(false)} />
                  <div className="menu">
                    {LEVELS.map((l) => (
                      <button key={l.id} className={l.id === article.level ? "mi on" : "mi"}
                        onClick={() => { setLvMenu(false); generateArticle(reTopicOf(article), l.id); }}>
                        <span>{l.label}</span>
                        <span className="mi-tag">{l.tag}</span>
                        {l.id === article.level && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </span>
            <i>·</i>约 {curWords} 词
            <i>·</i>{curMins} 分钟
            <i>·</i>主题「{article.topic}」
            {part > 1 && <><i>·</i><span title="接着上一篇往下写">连载第 {part} 部分</span></>}
            <i>·</i>
            <button className="link quiet"
              onClick={() => generateArticle(reTopicOf(article), article.level, { newTab: true })}>
              <Copy size={12} /> 对比一篇
            </button>
          </>
        )}
      </div>

      <h1 className="title">{article.title}</h1>

      {chapters.length > 1 && (
        <div className="chbar">
          <button className="btn txt sm" onClick={() => gotoCh(chIdx - 1)} disabled={chIdx === 0}>
            <ChevronLeft size={14} /> 上一章
          </button>
          <div className="chprog">
            <span>第 {chIdx + 1} / {chapters.length} 章</span>
            <div className="prog"><i style={{ width: `${((chIdx + 1) / chapters.length) * 100}%` }} /></div>
          </div>
          <button className="btn txt sm" onClick={() => gotoCh(chIdx + 1)} disabled={last}>
            下一章 <ChevronRight size={14} />
          </button>
        </div>
      )}

      {article.cn_intro && chIdx === 0 && <p className="intro">{article.cn_intro}</p>}
      {article.woven?.length > 0 && (
        <p className="woven">
          这篇里织进了你正在描的词：
          {article.woven.map((w, i) => <span key={w}>{i > 0 && "、"}<b>{w}</b></span>)}
          ，留意重逢
        </p>
      )}

      {/* 划一段话 → 冒出「译」。鼠标和触屏的判定条件不一样，所以分开写。 */}
      <div
        onMouseUp={() => setTimeout(() => tipFor(8, true), 0)}
        onTouchEnd={() => setTimeout(() => tipFor(8, false), 60)}
      >
        <ArticleBody
          content={curText}
          trans={curTrans}
          showTrans={showTrans}
          activeKey={dictOpen ? dict.key : null}
          savedSurfaces={savedSurfaces}
          inkSet={inkSet}
          wovenSet={wovenSet}
          shadowId={
            shadow.on ? flatSents[shadow.idx]?.id
            : reading && readIdx >= 0 ? flatSents[readIdx]?.id
            : null
          }
          onWord={(w, sent, key) => lookup(w, sent, key)}
        />
      </div>

      {peek && <Peek app={app} box={box} onExpand={onExpand} />}

      {/* 读到这儿：这一章查过哪些词，然后去哪一格 */}
      <section className="recap" ref={recapRef}>
        {chRead && <p className="recap-done"><Check size={14} /> 这一章读完了，记 {curWords} 词</p>}
        {looked.length > 0 && (
          <>
            <div className="lbl">这一章你查过 {looked.length} 个词</div>
            <div className="recap-ws">
              {looked.map((w) => (
                <button key={w} className={savedSurfaces.has(w) ? "wd on" : "wd"} onClick={() => lookup(w)}>{w}</button>
              ))}
            </div>
          </>
        )}
        <div className="recap-go">
          {!last && (
            <button className="btn pri lg" onClick={() => gotoCh(chIdx + 1)}>
              下一章 <ChevronRight size={15} />
            </button>
          )}
          {/* AI 现写的文章：读完直接接着写下一篇，同一个主题、同一批词。
              不用再想读什么——想停就停，想读就一直往下读。 */}
          {last && !article.imported && (
            <button className="btn pri lg" onClick={continueSeries} disabled={genLoading}>
              <BookOpen size={15} /> 接着读第 {part + 1} 部分
            </button>
          )}
          <button className="next-ge" onClick={() => go("quiz")}>
            <span className="ge">测</span>
            <span><b>{quiz.st === "on" ? "接着答题" : quiz.st === "done" ? "看小测结果" : "读完了，去测一测"}</b><small>3 道题，优先考你查过的词</small></span>
          </button>
        </div>
      </section>

      {genError && (
        <div className="callout bad">
          {genError} <button className="link" onClick={() => generateArticle(reTopicOf(article))}>重试</button>
        </div>
      )}

      {/* 底部小坞：跟读时让位给跟读条 */}
      {!shadow.on && (
        <div className="dock" role="toolbar" aria-label="阅读工具">
          <button className="dock-b main" onClick={toggleReadArticle}>
            {reading ? <Square size={15} /> : <Play size={15} />}
            {reading ? "停止" : "朗读"}
          </button>
          <button className={showTrans ? "dock-b on" : "dock-b"} onClick={toggleTrans} disabled={transBusy}>
            {transBusy ? <Loader2 size={15} className="spin" /> : <Languages size={15} />}
            {transBusy ? "翻译中" : "中文"}
          </button>
          <button className="dock-b" onClick={startShadow}><Mic size={15} /> 跟读</button>
          {!article.imported && (
            <button className="dock-b" onClick={() => generateArticle(reTopicOf(article))}>
              <RefreshCw size={15} /> 换一篇
            </button>
          )}
          <i />
          <button className="dock-b ge-b" onClick={() => go("quiz")} title="读后小测"><span className="ge sm">测</span></button>
        </div>
      )}
    </article>
  );
}

/* ---------- 浮在词旁边的小卡 ----------
   只放「此刻读下去需要的」：这个词在这句里什么意思、怎么读、最常见的几个义项。
   例句、追问、整句解析都在「展开」后的抽屉里。 */

function Peek({ app, box, onExpand }) {
  const {
    dict, closeDict, speak, dictIsSaved, saveCurrent, analyzeSentence, retryLookup, fetchContext, ctxBusy,
  } = app;
  const [pos, setPos] = useState(null);
  const self = useRef(null);

  // 找到被点的那个词，把卡片挂在它正下方
  useLayoutEffect(() => {
    const place = () => {
      const host = box.current;
      const el = host && host.querySelector(`[data-k="${dict.key}"]`);
      if (!el) { setPos(null); return; }
      const r = el.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      const W = 348;
      const left = Math.max(0, Math.min(r.left - b.left - 18, b.width - W));
      setPos({ top: r.bottom - b.top + 10, left, tip: r.left - b.left + r.width / 2 - left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [dict.key]);

  // 卡片要是伸到屏幕外面去了，把它滚进来
  useEffect(() => {
    if (pos && self.current) self.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pos && pos.top, dict.status]);

  // 点别处、按 Esc 就收起。点另一个词不算「别处」——那是换一个词查
  useEffect(() => {
    const down = (e) => { if (!e.target.closest(".peek") && !e.target.closest(".w")) closeDict(); };
    const key = (e) => { if (e.key === "Escape") closeDict(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, []);

  if (!pos) return null;
  const d = dict.data;
  const meta = dict.meta;

  return (
    <div className="peek" ref={self} style={{ top: pos.top, left: pos.left, "--tip": pos.tip + "px" }} role="dialog" aria-label="释义">
      {dict.status === "loading" && (
        <p className="peek-wait"><b>{dict.term}</b><Loader2 size={14} className="spin" /> 查询中…</p>
      )}
      {dict.status === "error" && (
        <p className="peek-wait"><b>{dict.term}</b>{dict.msg || "查询失败了。"}
          <button className="link" onClick={retryLookup}>重试</button></p>
      )}
      {/* 不是个词。刻意不给「重试」——重试只会让模型再编一次。 */}
      {dict.status === "none" && (
        <p className="peek-wait"><b>{dict.term}</b>词典里没有这个词，检查一下拼写。</p>
      )}

      {dict.status === "ok" && (
        <>
          {meta?.saved && <div className="meet">你正在描的词 · 第 {meta.meet} 次见面</div>}
          {/* 同一个词查到第二次，基本可以断定是真不认识——此刻提醒一句不算打断 */}
          {!meta?.saved && meta?.seen >= 2 && <div className="meet">这个词你查过 {meta.seen} 次了，收下吧</div>}
          {d.typo && meta?.raw && d.typo.toLowerCase() !== meta.raw.toLowerCase() && (
            <div className="typofix"><s>{meta.raw}</s> → <b>{d.typo}</b><span>拼写有误，已按正确的词查</span></div>
          )}

          <div className="peek-head">
            <div className="hw"><span className="four">{d.typo ? d.word : meta?.raw || d.word}</span></div>
            <button className="ph" onClick={() => speak(d.word, "en-US")} aria-label="美式发音">
              {d.phonetic_us || "发音"} <Volume2 size={13} />
            </button>
          </div>
          {!d.typo && meta?.raw && d.word && meta.raw.toLowerCase() !== d.word.toLowerCase() && (
            <div className="lemma">原形 <b>{d.word}</b>{d.form && <span> · {d.form}</span>}</div>
          )}

          {d.context_cn && <div className="ctx"><small>在这句话里</small>{d.context_cn}</div>}
          {/* 词条来自本地（生词本或缓存），没花 API，也就没有这句话的语境。想看才发请求。 */}
          {!d.context_cn && dict.sent && meta?.local && (
            <button className="chip" onClick={fetchContext} disabled={ctxBusy}>
              {ctxBusy
                ? <><Loader2 size={13} className="spin" /> 正在看这句…</>
                : <><Sparkles size={13} /> 看它在这句里是什么意思</>}
            </button>
          )}

          <ol className="senses tight">
            {(d.senses || []).slice(0, 3).map((s, i) => <li key={i}><i>{s.pos}</i><span>{s.cn}</span></li>)}
          </ol>

          <div className="peek-f">
            <button className={dictIsSaved ? "btn sec sm" : "btn pri sm"} onClick={saveCurrent}>
              {dictIsSaved ? <Check size={13} /> : <Plus size={13} />}
              {dictIsSaved ? "已在生词本" : "收进生词本"}
            </button>
            {dict.sent && (
              <button className="btn txt sm" onClick={() => { onExpand(); analyzeSentence(dict.sent); }}>
                <Puzzle size={13} /> 解析这句
              </button>
            )}
            <button className="btn txt sm peek-more" onClick={onExpand}>
              例句 · 追问 <ChevronRight size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 文章正文：分句 + 可点击单词 + 朗读/跟读高亮 ----------
   每句的 id（sen-段号-句号）是朗读和跟读用来滚动定位的，别改格式。
   每个词的 data-k 是小卡用来找位置的。 */

function ArticleBody({ content, trans, showTrans, onWord, activeKey, savedSurfaces, inkSet, wovenSet, shadowId }) {
  const paras = content.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const tokenRe = /([A-Za-z]+(?:['’-][A-Za-z]+)*)/;
  return (
    <div className="prose">
      {paras.map((para, pi) => (
        <div className="para" key={pi}>
          <p>
            {splitSentences(para).map((sent, si) => {
              const sid = `${pi}-${si}`;
              const parts = sent.split(new RegExp(tokenRe, "g"));
              return (
                <span key={si} id={"sen-" + sid} className={"sen" + (shadowId === sid ? " on" : "")}>
                  {parts.map((tk, ti) => {
                    if (!tokenRe.test(tk) || !/[A-Za-z]/.test(tk)) {
                      return <span key={ti}>{tk}</span>;
                    }
                    const low = tk.toLowerCase();
                    const key = `${pi}-${si}-${ti}`;
                    const isWov = [...wovenSet].some((w) => low === w || low.startsWith(w));
                    const cls =
                      "w" +
                      (activeKey === key ? " act" : "") +
                      (savedSurfaces.has(low) ? (inkSet.has(low) ? " ink" : " sav") : "") +
                      (isWov ? " wov" : "");
                    return (
                      <span
                        key={ti}
                        data-k={key}
                        className={cls}
                        role="button"
                        tabIndex={0}
                        onClick={() => onWord(tk, sent.trim(), key)}
                        onKeyDown={(e) => { if (e.key === "Enter") onWord(tk, sent.trim(), key); }}
                      >{tk}</span>
                    );
                  })}
                </span>
              );
            })}
          </p>
          {showTrans && trans && trans[pi] ? <p className="cn">{trans[pi]}</p> : null}
        </div>
      ))}
    </div>
  );
}

/* ---------- 骨架屏：现写的那几秒 ---------- */

function Skeleton({ topic }) {
  return (
    <div className="skel">
      <div className="skel-note">
        <Loader2 size={15} className="spin" />{" "}
        {topic && topic.trim()
          ? <>正在为你现写一篇「{topic.trim()}」…</>
          : <>正在照着你的生词现写一篇…</>}
      </div>
      <div className="sk sk-t" />
      <div className="sk" /><div className="sk" /><div className="sk w80" />
      <div className="sk-gap" />
      <div className="sk" /><div className="sk" /><div className="sk w60" />
    </div>
  );
}
