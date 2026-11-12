/* 温：复习到期的词。规矩是「先回想、再对答案」——
   正面只有写在四线格上的那个词，翻过来才有释义，翻面之后只能回答记没记住。 */

import { Check, ChevronLeft, ChevronRight, RotateCcw, Volume2, X } from "lucide-react";
import { vbWord } from "../lib/vocab.js";
import { Boldify } from "../ui/Boldify.jsx";

export function WarmView({ app }) {
  const { rev, setRev, vocab, dueList, speak, startReview, answerReview, skipReview, go, setHomeMode, openBlankTab, setView } = app;

  /* 还没开始：门厅 */
  const finished = rev && rev.i >= rev.queue.length;
  if (!rev) return <Lobby app={app} />;

  if (finished) {
    const skipped = rev.sk || 0;
    const allSkipped = skipped > 0 && rev.ok === 0 && rev.ng === 0;
    return (
      <div className="hall">
        {/* 一个词都没答、全跳过了，就别恭喜人家——什么也没做却被夸，是假反馈。 */}
        <span className={allSkipped ? "ge huge" : "ge huge done"}>温</span>
        <h1 className="kai-h">{allSkipped ? "这轮都跳过了" : "这一格，写上了"}</h1>
        {!allSkipped && (
          <div className="tally">
            <div><b>{rev.ok}</b><span>记住了</span></div>
            <div><b className="red">{rev.ng}</b><span>还不熟</span></div>
          </div>
        )}
        <p className="page-sub">
          {allSkipped
            ? "它们还在等你，什么时候想看随时回来。"
            : rev.ng > 0 ? "还不熟的那几个，12 小时后会再来见你。" : "记住的词，下次见面会隔得更久。"}
        </p>
        {/* 跳过不动到期时间，所以待复习的数字不会减少。不说这句，用户会以为刚才那轮没保存。 */}
        {skipped > 0 && !allSkipped && (
          <p className="hint">跳过 {skipped} 个 —— 它们仍在待复习里，随时可以再来</p>
        )}
        <div className="hall-a">
          {dueList.length > 0 && (
            <button className="btn sec lg" onClick={startReview}><RotateCcw size={15} /> 再温 {dueList.length} 个</button>
          )}
          <button className="next-ge" onClick={() => { setView("read"); openBlankTab(); }}>
            <span className="ge">读</span>
            <span><b>下一格：读一篇</b><small>把还没写熟的词织进新文章</small></span>
          </button>
          <button className="btn txt" onClick={() => go("vocab")}>看生词本</button>
        </div>
      </div>
    );
  }

  const key = rev.queue[rev.i];
  const v = vocab.find((x) => x.key === key);
  const quit = () => { setHomeMode(true); go("read"); };

  if (!v) {
    return (
      <div className="hall">
        <p className="page-sub">这个词刚被移除了。</p>
        <button className="btn sec" onClick={skipReview}>跳过 <ChevronRight size={14} /></button>
      </div>
    );
  }

  const d = v.data;
  const en = d.type === "en";
  return (
    <div className="hall wide">
      <div className="warm-top">
        <button className="btn txt sm" onClick={quit}><ChevronLeft size={14} /> 先停一下</button>
        <span className="mut">{rev.i + 1} / {rev.queue.length}</span>
      </div>
      <div className="prog"><i style={{ width: `${(rev.i / rev.queue.length) * 100}%` }} /></div>

      <div className="card-flip">
        <div className={en ? "rv-word" : "rv-word zh"}>
          {en ? <span className="four">{d.word}</span> : d.input}
        </div>
        {en && (
          <button className="ph" onClick={() => speak(d.word, "en-US")}>
            {d.phonetic_us || ""} <Volume2 size={13} />
          </button>
        )}

        {rev.flip ? (
          <div className="rv-back">
            {en ? (
              <>
                <ol className="senses tight">
                  {(d.senses || []).slice(0, 3).map((s, i) => <li key={i}><i>{s.pos}</i><span>{s.cn}</span></li>)}
                </ol>
                {/* 只放在翻面之后。放正面等于直接把答案给出去了。 */}
                {d.tech_cn && <div className="ctx tech"><small>计算机里</small>{d.tech_cn}</div>}
                {d.examples?.[0] && (
                  <p className="exline">
                    <Boldify text={d.examples[0].en} word={d.word} />
                    <small> — {d.examples[0].cn}</small>
                  </p>
                )}
              </>
            ) : (
              (d.translations || []).map((t, i) => (
                <div className="tr-top" key={i}>
                  <b>{t.en}</b>
                  {t.phonetic_us && <span className="tr-ph">{t.phonetic_us}</span>}
                  <button className="say" onClick={() => speak(t.en, "en-US")} aria-label="发音">
                    <Volume2 size={12} />
                  </button>
                </div>
              ))
            )}
            <div className="rv-btns">
              <button className="rv-ng" onClick={() => answerReview(false)}><X size={16} /> 还不熟</button>
              <button className="rv-ok" onClick={() => answerReview(true)}><Check size={16} /> 记住了</button>
            </div>
          </div>
        ) : (
          <>
            <button className="rv-flip" onClick={() => setRev((x) => ({ ...x, flip: true }))}>
              想好意思了？点开看释义
            </button>
            {/* 只在正面给这个出口。翻面后已经看到答案，此时该给的是判断，
                再留一个跳过只会让人逃避判断，复习质量反而下降。 */}
            <button className="link quiet rv-skip" onClick={skipReview}>这个词先跳过</button>
          </>
        )}
      </div>
    </div>
  );
}

/* 门厅：今天有多少要温，点一下开始 */
function Lobby({ app }) {
  const { dueList, startReview, vocab, go, setView, openBlankTab } = app;
  const n = dueList.length;
  return (
    <div className="hall">
      <span className="ge huge">温</span>
      {n > 0 ? (
        <>
          <h1 className="kai-h">{n} 个词到期了</h1>
          <p className="page-sub">一次一张卡：先自己想，再翻过来对。记住的，下次隔得更久；不熟的，12 小时后再来。</p>
          <div className="warm-due">
            {dueList.slice(0, 14).map((v) => <span key={v.key}>{vbWord(v.data)}</span>)}
            {n > 14 && <span>… 还有 {n - 14} 个</span>}
          </div>
          <div className="hall-a">
            <button className="btn pri lg" onClick={startReview}><RotateCcw size={16} /> 开始温故</button>
          </div>
        </>
      ) : (
        <>
          <h1 className="kai-h">今天没有到期的词</h1>
          <p className="page-sub">
            {vocab.length
              ? "这一格今天免写。想提前看看，可以去生词本翻翻。"
              : "生词本还是空的。读文章时点一个不认识的词，收下它，它就会按时回来找你。"}
          </p>
          <div className="hall-a">
            <button className="next-ge" onClick={() => { setView("read"); openBlankTab(); }}>
              <span className="ge">读</span>
              <span><b>去读一篇</b><small>遇到生词就收下</small></span>
            </button>
            {vocab.length > 0 && <button className="btn txt" onClick={() => go("vocab")}>看生词本</button>}
          </div>
        </>
      )}
    </div>
  );
}
