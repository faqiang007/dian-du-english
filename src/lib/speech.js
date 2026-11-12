/* 给设备语音打分：神经/在线/云端音色优先，机器人音色靠后 */

export function scoreVoice(v) {
  const n = (v.name || "").toLowerCase();
  let sc = 0;
  if (/natural|neural/.test(n)) sc += 100;
  if (/google/.test(n)) sc += 60;
  if (/premium|enhanced/.test(n)) sc += 50;
  if (/siri/.test(n)) sc += 45;
  if (/online/.test(n)) sc += 30;
  if (v.localService === false) sc += 25;
  if (/aria|jenny|guy|ava|samantha|allison|libby|sonia|ryan|emma|karen|daniel|serena|zira/.test(n)) sc += 18;
  if (/espeak|compact|whisper|novelty|albert|zarvox|trinoids/.test(n)) sc -= 90;
  return sc;
}
export const clampRate = (r) => Math.min(1.4, Math.max(0.5, r || 1));
