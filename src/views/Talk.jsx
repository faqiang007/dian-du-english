/* 情景对话：挑个场景，AI 扮演对方一来一回。
   说得不地道时它不打断，在回复下面给一句更自然的说法。 */

import { useEffect, useRef } from "react";
import { ArrowRight, CornerDownLeft, Loader2, Send, Volume2, X } from "lucide-react";
import { LEVELS } from "../data/levels.js";
import { SCENES } from "../data/scenes.js";

export function TalkView({ app }) {
  const { talk, setTalk, dueList, level, startTalk, sendTalk, exitTalk, speak, article, startShadow, setHomeMode, go } = app;
  const lv = LEVELS.find((l) => l.id === level);

  const endRef = useRef(null);
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [talk.msgs.length, talk.busy]);

  if (!talk.scene) {
    return (
      <div className="page">
        <div className="page-h"><h1>开口</h1></div>
        <p className="page-sub">
          挑个场景，AI 扮演对方跟你一来一回。你说得不地道时它不会打断，
          会在回复下面给一句更自然的说法。
          {dueList.length > 0 && <> 它还会顺手用上你今天要复习的词。</>}
        </p>
        <div className="scenes">
          {SCENES.map((s) => (
            <button key={s.id} className="scene" onClick={() => startTalk(s)}>
              <span className="scene-i">{s.icon}</span>
              <b>{s.label}</b>
              <span>AI 扮演{s.role}</span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
        {article && (
          <button className="next-ge" onClick={() => { setHomeMode(false); go("read"); startShadow(); }}>
            <span className="ge">读</span>
            <span><b>不想对话？跟读《{article.title}》</b><small>一句一停，听完跟着念，可以放慢</small></span>
          </button>
        )}
        <p className="hint">按你当前的难度「{lv?.label || "基础"}」说话，不会超纲。练完随时能换场景。</p>
      </div>
    );
  }

  return (
    <div className="page talk">
      <div className="talk-h">
        <h1>{talk.scene.icon} {talk.scene.label}</h1>
        <button className="btn sec" onClick={exitTalk}><X size={14} /> 换个场景</button>
      </div>

      <div className="talk-body">
        {talk.msgs.map((m, i) => (
          m.role === "u" ? (
            <div className="bub u" key={i}>{m.t}</div>
          ) : (
            <div className="bub-wrap" key={i}>
              <div className="bub a">
                {m.t}
                <button className="say" onClick={() => speak(m.t, "en-US", 0.95)} aria-label="朗读">
                  <Volume2 size={13} />
                </button>
              </div>
              {m.cn && <div className="bub-cn">{m.cn}</div>}
              {m.used?.length > 0 && <div className="bub-used">用到你在复习的：{m.used.join(" · ")}</div>}
              {m.fix && (
                <div className="fix">
                  <small>更地道</small>
                  <b>{m.fix}</b>
                  {m.why && <span>{m.why}</span>}
                </div>
              )}
            </div>
          )
        ))}
        {talk.busy && <div className="bub a busy"><Loader2 size={14} className="spin" /> 正在想…</div>}
        <div ref={endRef} />
      </div>

      <div className="talk-in">
        <input
          className="field grow"
          value={talk.draft}
          onChange={(e) => setTalk((s) => ({ ...s, draft: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendTalk(talk.draft); }}
          placeholder="用英文回他一句…"
          disabled={talk.busy}
        />
        <button className="btn pri" onClick={() => sendTalk(talk.draft)} disabled={talk.busy || !talk.draft.trim()}>
          <Send size={15} /> 发送
        </button>
      </div>
      <p className="hint"><CornerDownLeft size={12} /> 回车发送。说错不要紧，改进版会跟在它的回复下面。</p>
    </div>
  );
}
