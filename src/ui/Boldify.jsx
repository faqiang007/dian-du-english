import { escapeReg } from "../lib/text.js";

/* alt 是「你实际查的那个形态」。只按原形匹配不够：正则从词头往后吃，
   shake 吃不到 shaking（中间掉了个 e），于是你点了 shaking，例句里的
   shaking 反而不加粗。两个都给，谁命中算谁。 */
export function Boldify({ text, word, alt }) {
  const ws = [...new Set([word, alt].filter(Boolean).map(escapeReg))];
  if (!ws.length) return <>{text}</>;
  const src = ws.join("|");
  const re = new RegExp(`((?:${src})[a-zA-Z]*)`, "ig");
  const isWord = new RegExp(`^(?:${src})[a-zA-Z]*$`, "i");
  const parts = String(text).split(re);
  return (
    <>
      {parts.map((p, i) =>
        isWord.test(p) ? <b key={i}>{p}</b> : <span key={i}>{p}</span>
      )}
    </>
  );
}
