/* 温：复习到期的词。规矩是「先回想、再对答案」——
   正面不给释义，翻过来才有，翻面之后只能回答记没记住。
   有原句的词带着原句考；连对两次以后改成原句挖空、把词填回去（见下面的 Card）。 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, RotateCcw, Volume2 } from "lucide-react";
import { CLOZE_FROM, REVIEW_BATCH, formsOf, rvOf, spotIn, vbWord } from "../lib/vocab.js";
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

  return (
    <div className="hall wide">
      <div className="warm-top">
        <button className="btn txt sm" onClick={quit}><ChevronLeft size={14} /> 先停一下</button>
        <span className="mut">{rev.i + 1} / {rev.queue.length}</span>
      </div>
      <div className="prog"><i style={{ width: `${(rev.i / rev.queue.length) * 100}%` }} /></div>
      {/* key 换了整张卡重来：填了一半的字、焦点，都不带到下一张 */}
      <Card key={key + ":" + rev.i} v={v} flip={rev.flip} speak={speak}
        onFlip={() => setRev((x) => ({ ...x, flip: true }))}
        onAnswer={answerReview} onSkip={skipReview} />
    </div>
  );
}

/* ---------- 一张卡 ----------
   三种考法，由这个词自己的情况决定：
     认（带原句）  有原句、还没连对两次：看词和它所在的那句话，想意思。
     写（挖空）    有原句、已经连对两次：原句里把它挖掉，给中文义，把词填回去。
                   认得出不等于想得起，先认后写，写得出才慢慢「写黑」。
     认（只有词）  老词、输入框里查的词没有原句，照旧只给词。
   键盘：空格/回车翻面；翻面后 ← 或 1 还不熟，→ 或 2 记住了。 */

function Card({ v, flip, speak, onFlip, onAnswer, onSkip }) {
  const d = v.data;
  const en = d.type === "en";
  const sent = en ? v.sent || "" : "";
  const spot = useMemo(() => (sent ? spotIn(sent, v) : null), [sent, v]);
  const cloze = !!spot && rvOf(v).streak >= CLOZE_FROM;
  const [typed, setTyped] = useState("");

  // 填句子里那个形态、原形、别的时态，都算对——考的是想不想得起这个词，不是语法
  const t = typed.trim().toLowerCase();
  const right = cloze && !!t && (t === spot.text.toLowerCase() || formsOf(d.word).has(t));

  useEffect(() => {
    const key = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName || "");
      if (!flip) {
        if (!typing && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onFlip(); }
        return;
      }
      if (typing) return;
      if (e.key === "ArrowLeft" || e.key === "1") { e.preventDefault(); onAnswer(false); }
      else if (e.key === "ArrowRight" || e.key === "2") { e.preventDefault(); onAnswer(true); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [flip, onFlip, onAnswer]);

  /* 原句。gap=true 时把那个词换成一条横线（长度固定，不泄露词有多长） */
  const line = (gap) => spot ? (
    <p className="rv-sent">
      {sent.slice(0, spot.start)}
      {gap ? <span className="rv-gap" aria-label="挖掉的词" /> : <b>{spot.text}</b>}
      {sent.slice(spot.end)}
    </p>
  ) : sent ? <p className="rv-sent">{sent}</p> : null;

  const first = (d.senses || [])[0];

  return (
    <div className="card-flip">
      {/* ---- 正面 ---- */}
      {cloze && !flip ? (
        <>
          {line(true)}
          {first && <p className="rv-cue">{first.pos ? first.pos + " " : ""}{first.cn}</p>}
          <input
            className="rv-in" autoFocus value={typed} spellCheck={false} autoCapitalize="off" autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onFlip(); } }}
            placeholder="把这个词填回去" aria-label="把挖掉的词填回去"
          />
        </>
      ) : (
        <>
          <div className={en ? "rv-word" : "rv-word zh"}>
            {en ? <span className="four">{d.word}</span> : d.input}
          </div>
          {en && (
            <button className="ph" onClick={() => speak(d.word, "en-US")}>
              {d.phonetic_us || ""} <Volume2 size={13} />
            </button>
          )}
          {/* 写对写错，翻面后第一眼就该看到 */}
          {cloze && flip && (
            <p className={right ? "rv-mark ok" : "rv-mark"}>
              {right ? "写对了" : t ? <>你写的是 <s>{typed.trim()}</s></> : "没写出来"}
            </p>
          )}
          {line(false)}
        </>
      )}

      {flip ? (
        <div className="rv-back">
          {en ? (
            <>
              {/* 存词那一刻查到的「它在这句里的意思」，比泛泛的释义更对得上这句话 */}
              {sent && d.context_cn && <div className="ctx"><small>在这句话里</small>{d.context_cn}</div>}
              <ol className="senses tight">
                {(d.senses || []).slice(0, 3).map((s, i) => <li key={i}><i>{s.pos}</i><span>{s.cn}</span></li>)}
              </ol>
              {/* 只放在翻面之后。放正面等于直接把答案给出去了。 */}
              {d.tech_cn && <div className="ctx tech"><small>计算机里</small>{d.tech_cn}</div>}
              {!sent && d.examples?.[0] && (
                <p className="exline">
                  <Boldify text={d.examples[0].en} word={d.word} />
                  <small> — {d.examples[0].cn}</small>
                </p>
              )}
              {sent && v.from && <p className="hint">出自《{v.from}》</p>}
            </>
          ) : (
            (d.translations || []).map((t2, i) => (
              <div className="tr-top" key={i}>
                <b>{t2.en}</b>
                {t2.phonetic_us && <span className="tr-ph">{t2.phonetic_us}</span>}
                <button className="say" onClick={() => speak(t2.en, "en-US")} aria-label="发音">
                  <Volume2 size={12} />
                </button>
              </div>
            ))
          )}
          <div className="rv-btns">
            <button className="rv-ng" onClick={() => onAnswer(false)} title="← 或 1"><ArrowLeft size={15} /> 还不熟</button>
            <button className="rv-ok" onClick={() => onAnswer(true)} title="→ 或 2">记住了 <ArrowRight size={15} /></button>
          </div>
        </div>
      ) : (
        <>
          <button className="rv-flip" onClick={onFlip}>
            {cloze ? "对答案" : sent ? "想好它在这句里的意思了？点开看释义" : "想好意思了？点开看释义"}
          </button>
          {/* 只在正面给这个出口。翻面后已经看到答案，此时该给的是判断，
              再留一个跳过只会让人逃避判断，复习质量反而下降。 */}
          <button className="link quiet rv-skip" onClick={onSkip}>这个词先跳过</button>
        </>
      )}
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
          <p className="page-sub">
            一次一张卡：先自己想，再翻过来对。记住的，下次隔得更久；不熟的，12 小时后再来。
            {n > REVIEW_BATCH && <> 这一轮先温拖得最久的 {REVIEW_BATCH} 个。</>}
          </p>
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
