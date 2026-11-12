/* 复习：一次一张卡。规矩是「先回想、再对答案」——
   正面只有词，翻过来才有释义，翻面之后只能回答记没记住。 */

import { BookOpen, Check, ChevronLeft, ChevronRight, Sparkles, Volume2, X } from "lucide-react";
import { Boldify } from "../ui/Boldify.jsx";

export function ReviewView({ app }) {
  const { rev, setRev, vocab, speak, answerReview, skipReview, setView, openBlankTab } = app;
  const onExit = () => setView("vocab");

  if (!rev) {
    return (
      <div className="page narrow">
        <button className="btn txt back" onClick={onExit}><ChevronLeft size={14} /> 返回生词本</button>
        <p className="mut">没有正在进行的复习。</p>
      </div>
    );
  }

  if (rev.i >= rev.queue.length) {
    const skipped = rev.sk || 0;
    const allSkipped = skipped > 0 && rev.ok === 0 && rev.ng === 0;
    return (
      <div className="page narrow">
        <div className="rv-done">
          {/* 一个词都没答、全跳过了，就别恭喜人家——什么也没做却被撒花，是假反馈。 */}
          <div className="lbl">{allSkipped ? "这一轮" : "今日复习"}</div>
          <h1>{allSkipped ? "这轮都跳过了" : "复习完成"}</h1>
          {!allSkipped && (
            <div className="rv-tally">
              <div><b className="ok-t">{rev.ok}</b><span>记住了</span></div>
              <div><b className={rev.ng > 0 ? "bad-t" : ""}>{rev.ng}</b><span>还不熟</span></div>
            </div>
          )}
          <p className="mut">
            {allSkipped
              ? "它们还在等你，什么时候想看随时回来。"
              : rev.ng > 0 ? "还不熟的那几个很快会再来见你。" : ""}
          </p>
          {/* 跳过不动到期时间，所以侧栏的数字不会减少。不说这句，用户会以为刚才那轮没保存。 */}
          {skipped > 0 && !allSkipped && (
            <p className="mut">跳过 {skipped} 个 —— 它们仍在待复习里，随时可以再来</p>
          )}
          <div className="rv-acts">
            <button className="btn sec lg" onClick={onExit}><BookOpen size={15} /> 返回生词本</button>
            <button className="btn pri lg" onClick={() => { setView("read"); openBlankTab(); }}>
              <Sparkles size={15} /> 读一篇织入生词的新文章
            </button>
          </div>
        </div>
      </div>
    );
  }

  const key = rev.queue[rev.i];
  const v = vocab.find((x) => x.key === key);
  if (!v) {
    return (
      <div className="page narrow">
        <div className="card-flip">
          <p className="mut">这个词刚被移除了。</p>
          <button className="btn sec" onClick={skipReview}>跳过 <ChevronRight size={14} /></button>
        </div>
      </div>
    );
  }

  const d = v.data;
  const en = d.type === "en";
  return (
    <div className="page narrow">
      <div className="rv-top">
        <button className="btn txt back" onClick={onExit}><ChevronLeft size={14} /> 退出</button>
        <span className="mut">{rev.i + 1} / {rev.queue.length}</span>
      </div>
      <div className="prog"><i style={{ width: `${(rev.i / rev.queue.length) * 100}%` }} /></div>

      <div className="card-flip">
        <div className="rv-word">{en ? d.word : d.input}</div>
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
