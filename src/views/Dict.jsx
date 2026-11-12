/* 词典：宽屏时是正文右边的「页边批注」，窄屏时是盖满全屏的一页。
   里面按查到的东西换四种卡：英文词、中文词、整段翻译、整句解析。 */

import { useState } from "react";
import { Check, ChevronLeft, Loader2, Plus, Puzzle, Sparkles, Volume2, X } from "lucide-react";
import { Boldify } from "../ui/Boldify.jsx";

export function DictPanel({ app, open, onClose }) {
  const {
    dict, translateText, analyzeSentence, retryLookup, speak,
    dictIsSaved, saveCurrent, fetchContext, ctxBusy,
    wchat, askWord, addChatWord, savedKeys, backToWord,
  } = app;

  return (
    <aside className={open ? "drawer open" : "drawer"} aria-hidden={!open}>
      <button className="drawer-x iconbtn" onClick={onClose} aria-label="收起词典">
        <X size={16} />
      </button>

      {dict.status === "idle" && (
        <div className="dict-idle">
          <span className="ge">词</span>
          <p>点文中任意单词，释义就浮在它旁边</p>
        </div>
      )}

      {dict.status === "loading" && (
        <div className="dict-wait">
          <div className="hw">{dict.sentMode ? "整句解析" : dict.term}</div>
          <p className="mut"><Loader2 size={14} className="spin" /> {dict.sentMode ? "拆句中…" : "查询中…"}</p>
        </div>
      )}

      {dict.status === "error" && (
        <div className="dict-wait">
          <div className="hw">{dict.term}</div>
          <p className="mut">{dict.msg || "查询失败了。"}</p>
          <button className="link" onClick={() =>
            dict.trFail ? translateText(dict.trFail)
            : dict.sentFail ? analyzeSentence(dict.sentFail)
            : retryLookup()
          }>重试</button>
        </div>
      )}

      {/* 不是个词。这里刻意不给「重试」——重试只会让模型再编一次，问题不在网络上。 */}
      {dict.status === "none" && (
        <div className="dict-wait">
          <div className="hw">{dict.term}</div>
          <p className="mut">词典里没有这个词，检查一下拼写。</p>
        </div>
      )}

      {dict.status === "ok" && dict.data.type === "en" && (
        <>
          <EnCard
            d={dict.data}
            meta={dict.meta}
            sent={dict.sent}
            onAnalyze={() => analyzeSentence(dict.sent)}
            onSpeak={speak}
            saved={dictIsSaved}
            onSave={saveCurrent}
            onCtx={fetchContext}
            ctxBusy={ctxBusy}
          />
          <WordChat
            word={wchat.word}
            msgs={wchat.msgs}
            busy={wchat.busy}
            onAsk={askWord}
            onAdd={addChatWord}
            onSpeak={speak}
            savedKeys={savedKeys}
          />
        </>
      )}
      {dict.status === "ok" && dict.data.type === "tr" && <TrCard d={dict.data} onSpeak={speak} />}
      {dict.status === "ok" && dict.data.type === "zh" && (
        <ZhCard d={dict.data} onSpeak={speak} saved={dictIsSaved} onSave={saveCurrent} />
      )}
      {dict.status === "ok" && dict.data.type === "sent" && (
        <SentCard d={dict.data} onSpeak={speak} onBack={backToWord} />
      )}
    </aside>
  );
}

/* 小喇叭：例句、译词后面那个 */
function Say({ onClick, label = "发音", size = 13 }) {
  return (
    <button className="say" onClick={onClick} aria-label={label}><Volume2 size={size} /></button>
  );
}

function SaveButton({ saved, onSave }) {
  return (
    <button className={saved ? "btn sec block" : "btn pri block"} onClick={onSave}>
      {saved ? <Check size={15} /> : <Plus size={15} />}
      {saved ? "已在生词本 · 点击移除" : "加入生词本"}
    </button>
  );
}

function Examples({ list, word, alt, onSpeak }) {
  if (!list?.length) return null;
  return (
    <>
      <div className="lbl">例句</div>
      {list.map((ex, i) => (
        <div className="ex" key={i}>
          <p>
            {word ? <Boldify text={ex.en} word={word} alt={alt} /> : ex.en}
            <Say onClick={() => onSpeak(ex.en, "en-US", 0.9)} label="朗读例句" size={12} />
          </p>
          <span>{ex.cn}</span>
        </div>
      ))}
    </>
  );
}

/* ---------- 英 → 中 ---------- */

function EnCard({ d, meta, sent, onAnalyze, onSpeak, saved, onSave, onCtx, ctxBusy }) {
  return (
    <div className="entry">
      {meta?.saved && <div className="meet">你的生词 · 第 {meta.meet} 次见面</div>}

      {/* 同一个词查到第二次，基本可以断定是真不认识。此刻你正看着释义，
          提醒一句不算打断——比让你在读得投入时自己想起来按收藏靠谱得多。 */}
      {!meta?.saved && meta?.seen >= 2 && (
        <div className="callout hi row">
          <span>这个词你查过 {meta.seen} 次了</span>
          <button className="btn sec sm" onClick={onSave}>收进生词本</button>
        </div>
      )}

      {/* 拼错了必须说一句。不说的话，搜索框里还留着 recieve、卡片上却写着
          receive，看起来像查串了词。只比对「这一次输进去的」：以后直接输正确
          拼写命中同一条缓存时，data.typo 还在，但已经不是纠错，不该再跳这一条。 */}
      {d.typo && meta?.raw && d.typo.toLowerCase() !== meta.raw.toLowerCase() && (
        <div className="typofix">
          <s>{meta.raw}</s> → <b>{d.typo}</b>
          <span>拼写有误，已按正确的词查</span>
        </div>
      )}

      {/* 你点的是 shaking，卡片却只写 shake，会以为查串了词。所以大标题保持你
          输进去的那个形态，原形降到下面一行。拼错是另一回事：那时大标题必须是
          正确拼写，输错的那个已经在上面的纠错条里交代过了。 */}
      <div className="hw"><span className="four">{d.typo ? d.word : meta?.raw || d.word}</span></div>
      {!d.typo && meta?.raw && d.word && meta.raw.toLowerCase() !== d.word.toLowerCase() && (
        <div className="lemma">
          原形 <b>{d.word}</b>
          {d.form && <span> · {d.form}</span>}
        </div>
      )}

      <div className="phon">
        {d.phonetic_us && (
          <button className="ph" onClick={() => onSpeak(d.word, "en-US")}>
            <small>美</small>{d.phonetic_us}<Volume2 size={13} />
          </button>
        )}
        {d.phonetic_uk && (
          <button className="ph" onClick={() => onSpeak(d.word, "en-GB")}>
            <small>英</small>{d.phonetic_uk}<Volume2 size={13} />
          </button>
        )}
        {!d.phonetic_us && !d.phonetic_uk && (
          <button className="ph" onClick={() => onSpeak(d.word, "en-US")}>
            <Volume2 size={13} /> 发音
          </button>
        )}
      </div>

      {d.context_cn && (
        <div className="ctx"><small>在这句话里</small>{d.context_cn}</div>
      )}

      <div className="entry-acts">
        {/* 词条来自本地（生词本或缓存），没花 API，也就没有这句话的语境。
            想看就点，点了才发一次请求。 */}
        {!d.context_cn && sent && meta?.local && (
          <button className="chip" onClick={onCtx} disabled={ctxBusy}>
            {ctxBusy
              ? <><Loader2 size={13} className="spin" /> 正在看这句…</>
              : <><Sparkles size={13} /> 看它在这句里是什么意思</>}
          </button>
        )}
        {sent && (
          <button className="chip" onClick={onAnalyze}><Puzzle size={13} /> 解析这句话</button>
        )}
      </div>

      <ol className="senses">
        {(d.senses || []).map((s, i) => (
          <li key={i}><i>{s.pos}</i><span>{s.cn}</span></li>
        ))}
      </ol>

      {/* 计算机领域的专门含义。放在释义之后：释义才是查词的主角。
          日常词模型返回 null，整块不渲染——挂一行「无特殊含义」纯属噪音。 */}
      {d.tech_cn && (
        <div className="ctx tech"><small>计算机里</small>{d.tech_cn}</div>
      )}

      <Examples list={d.examples} word={d.word} alt={meta?.raw} onSpeak={onSpeak} />
      <SaveButton saved={saved} onSave={onSave} />
    </div>
  );
}

/* ---------- 中 → 英 ---------- */

function ZhCard({ d, onSpeak, saved, onSave }) {
  return (
    <div className="entry">
      <div className="hw zh">{d.input}</div>
      <div className="trs">
        {(d.translations || []).map((t, i) => (
          <div className="tr" key={i}>
            <div className="tr-top">
              <b>{t.en}</b>
              {t.phonetic_us && <span className="tr-ph">{t.phonetic_us}</span>}
              <Say onClick={() => onSpeak(t.en, "en-US")} size={12} />
              {t.pos && <i>{t.pos}</i>}
            </div>
            {t.note && <p>{t.note}</p>}
          </div>
        ))}
      </div>
      <Examples list={d.examples} onSpeak={onSpeak} />
      <SaveButton saved={saved} onSave={onSave} />
    </div>
  );
}

/* ---------- 划词 / 整段翻译 ---------- */

function TrCard({ d, onSpeak }) {
  const enSrc = d.dir === "en2zh";
  return (
    <div className="entry">
      <div className="lbl first">原文</div>
      <p className={enSrc ? "tr-src en" : "tr-src"}>
        {d.src}
        {enSrc && <Say onClick={() => onSpeak(d.src, "en-US", 0.92)} label="朗读原文" size={12} />}
      </p>
      <div className="lbl">译文</div>
      <p className={enSrc ? "tr-dst" : "tr-dst en"}>
        {d.dst}
        {!enSrc && <Say onClick={() => onSpeak(d.dst, "en-US", 0.92)} label="朗读译文" size={12} />}
      </p>
      {d.trunc && <p className="hint">内容较长，已截取前段翻译。</p>}
      {d.note && <div className="ctx"><small>要点</small>{d.note}</div>}
    </div>
  );
}

/* ---------- 整句解析 ---------- */

function SentCard({ d, onSpeak, onBack }) {
  return (
    <div className="entry">
      <button className="btn txt back" onClick={onBack}><ChevronLeft size={14} /> 返回单词</button>
      <p className="sent-src">
        {d.sentence}
        <Say onClick={() => onSpeak(d.sentence, "en-US", 0.9)} label="朗读" size={12} />
      </p>

      <div className="lbl">句子结构</div>
      <div className="parts">
        {(d.parts || []).map((p, i) => (
          <div className="part" key={i}><small>{p.r}</small><span>{p.t}</span></div>
        ))}
      </div>

      {d.grammar && <div className="ctx"><small>语法</small>{d.grammar}</div>}

      <div className="lbl">翻译</div>
      <p className="tr-dst">{d.translation}</p>
    </div>
  );
}

/* ---------- 对着这个词继续问 ---------- */

const QUICK_QS = ["近义词", "反义词", "引申含义", "常见搭配", "词源记忆"];

function WordChat({ word, msgs, busy, onAsk, onAdd, onSpeak, savedKeys }) {
  const [q, setQ] = useState("");
  if (!word) return null;
  const send = () => {
    if (!q.trim()) return;
    onAsk(q);
    setQ("");
  };
  return (
    <div className="wchat">
      <div className="lbl">问问它</div>
      <div className="chips">
        {QUICK_QS.map((c) => (
          <button key={c} className="chip" disabled={busy}
            onClick={() => onAsk(`${word} 的${c}是什么？`)}>{c}</button>
        ))}
      </div>

      {msgs.map((m, i) =>
        m.role === "q" ? (
          <p className="wc-q" key={i}>{m.t}</p>
        ) : (
          <div className="wc-a" key={i}>
            <p>{m.t}</p>
            {m.words?.length > 0 && (
              <div className="wc-words">
                {m.words.map((cw, j) => (
                  <div className="wcw" key={j}>
                    <b>{cw.w}</b>
                    {cw.p && <i>{cw.p}</i>}
                    <span>{cw.cn}</span>
                    <Say onClick={() => onSpeak(cw.w, "en-US")} size={11} />
                    <button className="wcw-add" onClick={() => onAdd(cw)} aria-label="加入生词本">
                      {savedKeys.has((cw.w || "").toLowerCase()) ? <Check size={12} /> : <Plus size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
      {busy && <p className="wc-a mut"><Loader2 size={13} className="spin" /> 想想…</p>}

      <div className="wc-in">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={`关于 ${word}，随便问`}
          disabled={busy}
        />
        <button className="btn pri sm" onClick={send} disabled={busy}>问</button>
      </div>
    </div>
  );
}
