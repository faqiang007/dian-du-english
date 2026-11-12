/* 阅读页：一篇文章。正文直接铺在纸上，不套卡片；
   工具排成标题下面的一行，读后小测接在文末。 */

import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Copy, ExternalLink, Globe,
  Languages, Loader2, Mic, Play, Plus, RefreshCw, Square, X,
} from "lucide-react";
import { LEVELS } from "../data/levels.js";
import { hostOf, splitSentences } from "../lib/text.js";

export function ReaderView({ app }) {
  const {
    article, genLoading, genError, topic, reTopicOf, generateArticle,
    reading, toggleReadArticle, toggleTrans, transBusy, showTrans, startShadow, shadow,
    startQuiz, quiz, pickOption, nextQuestion, saveMissedWords, savedKeys,
    lvHint, setLvHint, clicks, setLevel, setStats, showToast, lvMenu, setLvMenu,
    curWords, curMins, chapters, chIdx, gotoCh, curText, curTrans,
    dict, savedSurfaces, wovenSet, flatSents, readIdx, lookup, setSelTip,
  } = app;

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
  const quizBusy = quiz.st === "loading" || quiz.st === "on";

  return (
    <article className="art">
      {/* 点词密度给出的难度建议。只提示不自动改——难度改了下一篇才生效，
          替用户默默改掉会让人莫名其妙。 */}
      {lvHint && (
        <div className={lvHint.dir === "down" ? "callout hi row" : "callout ok row"}>
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
            <i>·</i>
            <button className="link quiet"
              onClick={() => generateArticle(reTopicOf(article), article.level, { newTab: true })}
              disabled={genLoading}>
              <Copy size={12} /> 对比一篇
            </button>
          </>
        )}
      </div>

      <h1 className="title">{article.title}</h1>

      <div className="tools">
        <button className="btn pri" onClick={toggleReadArticle}>
          {reading ? <Square size={14} /> : <Play size={14} />}
          {reading ? "停止朗读" : "朗读全文"}
        </button>
        <button className="btn txt" onClick={toggleTrans} disabled={transBusy}>
          {transBusy ? <Loader2 size={14} className="spin" /> : <Languages size={14} />}
          {transBusy ? "翻译中…" : showTrans ? "隐藏中文" : "显示中文"}
        </button>
        <button className="btn txt" onClick={startShadow} disabled={shadow.on}>
          <Mic size={14} /> 跟读练习
        </button>
        <button className="btn txt" onClick={startQuiz} disabled={quizBusy}>
          {quiz.st === "loading"
            ? <><Loader2 size={14} className="spin" /> 出题中…</>
            : <><ClipboardCheck size={14} /> 做小测</>}
        </button>
        {!article.imported && (
          <button className="btn txt" onClick={() => generateArticle(reTopicOf(article))}>
            <RefreshCw size={14} /> 换一篇
          </button>
        )}
      </div>

      {chapters.length > 1 && (
        <div className="chbar">
          <button className="btn txt" onClick={() => gotoCh(chIdx - 1)} disabled={chIdx === 0}>
            <ChevronLeft size={14} /> 上一章
          </button>
          <div className="chprog">
            <span>第 {chIdx + 1} / {chapters.length} 章</span>
            <div className="prog"><i style={{ width: `${((chIdx + 1) / chapters.length) * 100}%` }} /></div>
          </div>
          <button className="btn txt" onClick={() => gotoCh(chIdx + 1)} disabled={chIdx === chapters.length - 1}>
            下一章 <ChevronRight size={14} />
          </button>
        </div>
      )}

      {article.cn_intro && chIdx === 0 && <p className="intro">{article.cn_intro}</p>}
      {article.woven?.length > 0 && (
        <p className="woven">
          本篇织入了你的生词：
          {article.woven.map((w, i) => <span key={w}>{i > 0 && "、"}<b>{w}</b></span>)}
          ，留意重逢
        </p>
      )}

      {/* 划一段话 → 冒出「译」。鼠标和触屏的判定条件不一样，所以分开写。 */}
      <div
        onMouseUp={() => {
          setTimeout(() => {
            try {
              const sel = window.getSelection();
              const t = sel ? sel.toString().trim() : "";
              if (t && t.length >= 8 && (/\s/.test(t) || /[一-鿿]/.test(t))) {
                const r = sel.getRangeAt(0).getBoundingClientRect();
                setSelTip({ x: r.left + r.width / 2, y: r.top, text: t });
              } else setSelTip(null);
            } catch (e) { setSelTip(null); }
          }, 0);
        }}
        onTouchEnd={() => {
          setTimeout(() => {
            try {
              const sel = window.getSelection();
              const t = sel ? sel.toString().trim() : "";
              if (t && t.length >= 8) {
                const r = sel.getRangeAt(0).getBoundingClientRect();
                setSelTip({ x: r.left + r.width / 2, y: r.top, text: t });
              } else setSelTip(null);
            } catch (e) { setSelTip(null); }
          }, 60);
        }}
      >
        <ArticleBody
          content={curText}
          trans={curTrans}
          showTrans={showTrans}
          activeKey={dict.key}
          savedSurfaces={savedSurfaces}
          wovenSet={wovenSet}
          shadowId={
            shadow.on ? flatSents[shadow.idx]?.id
            : reading && readIdx >= 0 ? flatSents[readIdx]?.id
            : null
          }
          onWord={(w, sent, key) => lookup(w, sent, key)}
        />
      </div>

      {/* 读后动作：还有下一章就往下读；小测随时能做，读到这里正是时候 */}
      {(chIdx < chapters.length - 1 || quiz.st === "idle") && (
        <div className="after">
          {chIdx < chapters.length - 1 && (
            <button className="btn pri lg" onClick={() => gotoCh(chIdx + 1)}>
              下一章 <ChevronRight size={15} />
            </button>
          )}
          {quiz.st === "idle" && (
            <button className="btn sec lg" onClick={startQuiz}>
              <ClipboardCheck size={15} /> 读完了，做 3 道小测
            </button>
          )}
        </div>
      )}

      {quiz.st === "err" && (
        <div className="callout bad">出题失败了。<button className="link" onClick={startQuiz}>重试</button></div>
      )}
      {(quiz.st === "on" || quiz.st === "done") && (
        <QuizBlock quiz={quiz} onPick={pickOption} onNext={nextQuestion}
          onRetryArticle={() => generateArticle(reTopicOf(article))}
          onSaveMissed={saveMissedWords} savedKeys={savedKeys} />
      )}

      {genError && (
        <div className="callout bad">
          {genError} <button className="link" onClick={() => generateArticle(reTopicOf(article))}>重试</button>
        </div>
      )}
    </article>
  );
}

/* ---------- 文章正文：分句 + 可点击单词 + 朗读/跟读高亮 ----------
   每句的 id（sen-段号-句号）是朗读和跟读用来滚动定位的，别改格式。 */

function ArticleBody({ content, trans, showTrans, onWord, activeKey, savedSurfaces, wovenSet, shadowId }) {
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
                      (savedSurfaces.has(low) ? " sav" : "") +
                      (isWov ? " wov" : "");
                    return (
                      <span
                        key={ti}
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

/* ---------- 读后小测 ---------- */

function QuizBlock({ quiz, onPick, onNext, onRetryArticle, onSaveMissed, savedKeys }) {
  if (quiz.st === "done") {
    const total = quiz.qs.length;
    return (
      <section className="quiz done">
        <div className="lbl">读后小测</div>
        <div className="quiz-score"><b>{quiz.score}</b> / {total}<span>答对</span></div>
        {quiz.adj?.dir === "up" && (
          <p className="quiz-adj up">全对！难度已升到「{quiz.adj.label} · {quiz.adj.tag}」，下一篇生效</p>
        )}
        {quiz.adj?.dir === "down" && (
          <p className="quiz-adj down">我们放缓一点，难度已调到「{quiz.adj.label} · {quiz.adj.tag}」，稳扎稳打</p>
        )}
        {!quiz.adj && <p className="quiz-adj">这个难度刚刚好，保持！</p>}

        {/* 答错的词单独列出来。这是全应用最硬的一条证据——不是「你点过它」，
            是「你确实答错了」，不收进生词本等于白测一场。 */}
        {(quiz.missed || []).length > 0 && (
          <div className="missed">
            <div className="missed-t">这几个词答错了，收进生词本？</div>
            <div className="missed-ws">
              {quiz.missed.map((m) => (
                <span key={m.w}>
                  <b>{m.w}</b>{m.cn ? ` · ${m.cn}` : ""}
                  {savedKeys?.has(m.w.toLowerCase()) && <em>已在本子里</em>}
                </span>
              ))}
            </div>
            <button className="btn pri" onClick={() => onSaveMissed(quiz.missed)}>
              <Plus size={14} /> 全部收进生词本
            </button>
          </div>
        )}

        <button className="btn sec" onClick={onRetryArticle}>
          <RefreshCw size={14} /> 按新难度再来一篇
        </button>
      </section>
    );
  }

  const q = quiz.qs[quiz.i];
  return (
    <section className="quiz">
      <div className="lbl">读后小测 · {quiz.i + 1} / {quiz.qs.length}</div>
      <p className="quiz-q">{q.q}</p>
      <div className="qopts">
        {q.options.map((op, oi) => {
          let cls = "qopt";
          if (quiz.sel !== null) {
            if (oi === q.answer) cls += " right";
            else if (oi === quiz.sel) cls += " wrong";
            else cls += " dim";
          }
          return (
            <button key={oi} className={cls} onClick={() => onPick(oi)}>
              <span className="qletter">{"ABCD"[oi]}</span> {op}
            </button>
          );
        })}
      </div>
      {quiz.sel !== null && (
        <div className="qexp">
          <p>
            <b className={quiz.sel === q.answer ? "ok-t" : "bad-t"}>
              {quiz.sel === q.answer ? "答对了。" : "正确答案是 " + "ABCD"[q.answer] + "。"}
            </b>
            {q.explain}
          </p>
          <button className="btn pri" onClick={onNext}>
            {quiz.i + 1 < quiz.qs.length ? "下一题" : "查看结果"} <ChevronRight size={14} />
          </button>
        </div>
      )}
    </section>
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
