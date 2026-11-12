/* 测：读后小测自己占一格。一屏一道题，三道题对应三个小格——
   答对的格子里是黑色的勾，答错的是红色的叉（老师的红笔）。 */

import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, ClipboardCheck, Loader2, Plus, RefreshCw } from "lucide-react";

export function QuizView({ app }) {
  const {
    article, quiz, startQuiz, pickOption, nextQuestion, saveMissedWords, savedKeys,
    generateArticle, reTopicOf, setHomeMode, go, chapters, chIdx,
  } = app;

  /* 每道题对没对。store 里只记总分，这里自己记一份用来画三个格子。
     题目换了一套（qs 变了）就清空重记。 */
  const [marks, setMarks] = useState([]);
  useEffect(() => { setMarks([]); }, [quiz.qs]);
  useEffect(() => {
    if (quiz.st !== "on" || quiz.sel === null) return;
    setMarks((m) => { const n = [...m]; n[quiz.i] = quiz.sel === quiz.qs[quiz.i].answer; return n; });
  }, [quiz.st, quiz.sel, quiz.i]);

  const backToText = () => { setHomeMode(false); go("read"); };

  if (!article) {
    return (
      <div className="hall">
        <span className="ge huge">测</span>
        <h1 className="kai-h">先读一篇，再来测</h1>
        <p className="page-sub">小测是照着你刚读的那一章出的，优先考你查过的词。</p>
        <button className="btn pri lg" onClick={backToText}><BookOpen size={16} /> 去读一篇</button>
      </div>
    );
  }

  const where = <>《{article.title}》{chapters.length > 1 ? ` · 第 ${chIdx + 1} 章` : ""}</>;

  if (quiz.st === "idle" || quiz.st === "loading" || quiz.st === "err") {
    return (
      <div className="hall">
        <span className="ge huge">测</span>
        <h1 className="kai-h">三道题，测一测刚读的</h1>
        <p className="page-sub">{where}。全对自动升一档难度，答对不足两题降一档。</p>
        {quiz.st === "err" && <div className="callout bad">出题失败了，再试一次。</div>}
        <div className="hall-a">
          <button className="btn pri lg" onClick={startQuiz} disabled={quiz.st === "loading"}>
            {quiz.st === "loading"
              ? <><Loader2 size={16} className="spin" /> 出题中…</>
              : <><ClipboardCheck size={16} /> 出题</>}
          </button>
          <button className="btn txt" onClick={backToText}>回去再看看原文</button>
        </div>
      </div>
    );
  }

  const total = quiz.qs.length;
  const cells = (
    <div className="marks" aria-label="答题情况">
      {quiz.qs.map((_, i) => (
        <span key={i} className={"ge" + (marks[i] === true ? " done" : marks[i] === false ? " miss" : "") + (quiz.st === "on" && i === quiz.i ? " now" : "")}>
          {marks[i] === true ? "✓" : marks[i] === false ? "✗" : i + 1}
        </span>
      ))}
    </div>
  );

  if (quiz.st === "done") {
    return (
      <div className="hall wide">
        {cells}
        <h1 className="kai-h">答对 {quiz.score} / {total}</h1>
        {quiz.adj?.dir === "up" && (
          <p className="page-sub">全对！难度已升到「{quiz.adj.label} · {quiz.adj.tag}」，下一篇生效。</p>
        )}
        {quiz.adj?.dir === "down" && (
          <p className="page-sub">我们放缓一点，难度已调到「{quiz.adj.label} · {quiz.adj.tag}」，稳扎稳打。</p>
        )}
        {!quiz.adj && <p className="page-sub">这个难度刚刚好，保持。</p>}

        {/* 答错的词单独列出来。这是全应用最硬的一条证据——不是「你点过它」，
            是「你确实答错了」，不收进生词本等于白测一场。 */}
        {(quiz.missed || []).length > 0 && (
          <div className="missed">
            <div className="lbl">这几个词答错了，收进生词本接着描？</div>
            <div className="missed-ws">
              {quiz.missed.map((m) => (
                <span key={m.w}>
                  <b>{m.w}</b>{m.cn ? ` · ${m.cn}` : ""}
                  {savedKeys?.has(m.w.toLowerCase()) && <em>已在本子里</em>}
                </span>
              ))}
            </div>
            <button className="btn pri" onClick={() => saveMissedWords(quiz.missed)}>
              <Plus size={14} /> 全部收进生词本
            </button>
          </div>
        )}

        <div className="hall-a">
          <button className="btn sec lg" onClick={() => generateArticle(reTopicOf(article))}>
            <RefreshCw size={15} /> 按新难度再来一篇
          </button>
          <button className="next-ge" onClick={() => go("talk")}>
            <span className="ge">说</span>
            <span><b>下一格：开口</b><small>把刚学的词用出来</small></span>
          </button>
        </div>
      </div>
    );
  }

  const q = quiz.qs[quiz.i];
  return (
    <div className="hall wide left">
      <div className="quiz-top">
        {cells}
        <button className="btn txt sm" onClick={backToText}>回看原文（题目会留着）</button>
      </div>
      <p className="lbl">{where}</p>
      <h1 className="quiz-q">{q.q}</h1>
      <div className="qopts">
        {q.options.map((op, oi) => {
          let cls = "qopt";
          if (quiz.sel !== null) {
            if (oi === q.answer) cls += " right";
            else if (oi === quiz.sel) cls += " wrong";
            else cls += " dim";
          }
          return (
            <button key={oi} className={cls} onClick={() => pickOption(oi)}>
              <span className="qletter">{"ABCD"[oi]}</span> {op}
            </button>
          );
        })}
      </div>
      {quiz.sel !== null && (
        <div className="qexp">
          <p>
            <b>{quiz.sel === q.answer ? "答对了。" : "正确答案是 " + "ABCD"[q.answer] + "。"}</b>
            {q.explain}
          </p>
          <button className="btn pri lg" onClick={nextQuestion}>
            {quiz.i + 1 < total ? "下一题" : "看结果"} <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
