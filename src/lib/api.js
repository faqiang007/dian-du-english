/* 和模型服务商、教材库打交道的全部网络请求。 */

import { providerOf } from "../data/providers.js";
import { samePage } from "./text.js";

/* ---------- helpers ---------- */

/* 把 HTTP 状态码归类成应用内部的错误代号。
   注意不能只看状态码：Google Gemini 把「密钥无效」报成 400，
   只靠状态码会归到「未知错误」，给用户毫无帮助的提示。 */
export function codeToErr(code, msg) {
  if (code === 403 && /terms? of service|prohibit|region|country|location|geo.?restrict|ip address/i.test(msg || "")) return "ACCESS";
  if (/api[\s_-]?key|unauthoriz|authenticat|invalid.*credential/i.test(msg || "")) return "KEY";
  if (/quota|insufficient|balance|billing|欠费|余额/i.test(msg || "")) return "CREDIT";
  if (code === 401) return "KEY";
  if (code === 403) return "ACCESS";
  if (code === 402) return "CREDIT";
  if (code === 429) return "RATE";
  return "API";
}

/* 有的服务商（如 Gemini）出错时把内容包在数组里，先拆开再看 */
export function unwrap(data) {
  return Array.isArray(data) ? (data[0] || {}) : (data || {});
}

/* 发一次请求。抛出的 Error 里带 detail 字段，方便判断要不要重试 */
export async function postOnce(url, headers, body) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    // fetch 抛异常有两种：真的连不上，或请求本身构造非法（如头部含非 ASCII）
    throw new Error("NET");
  }
  let data;
  try { data = unwrap(await res.json()); } catch (e) { throw new Error("API"); }
  // OpenRouter 等会在 HTTP 200 的响应体里放 error；多数服务商用 HTTP 状态码
  const errObj = data.error;
  if (errObj || !res.ok) {
    const msg = (errObj && (errObj.message || errObj.type)) || "";
    const err = new Error(codeToErr(res.ok ? (errObj && errObj.code) || res.status : res.status, msg));
    err.detail = msg;
    throw err;
  }
  return data;
}

/* web=true 时开启联网搜索（目前只有 OpenRouter 支持）。
   返回的对象上挂一个不可枚举的 __cites，装搜索引擎实际访问过的页面。 */
export async function callClaude(prompt, apiKey, model, web, providerId) {
  const p = providerOf(providerId);
  const useModel = model || p.defaultModel;
  let data;

  if (p.protocol === "anthropic") {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // 没有这个头，浏览器直连会被 Anthropic 拒绝
      "anthropic-dangerous-direct-browser-access": "true",
    };
    const base = {
      model: useModel,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    };
    try {
      // 本应用只要一段 JSON，关掉思考模式更快也更省钱
      data = await postOnce(p.endpoint, headers, { ...base, thinking: { type: "disabled" } });
    } catch (e) {
      // 少数模型不接受关闭思考（会返回 400），去掉这个参数再试一次
      if (e.message === "API" && /thinking/i.test(e.detail || "")) {
        data = await postOnce(p.endpoint, headers, base);
      } else throw e;
    }
  } else {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
      // 注意：HTTP 头的值只能是 ASCII，写中文会让 fetch 直接抛 TypeError
      "X-Title": "007 English Reader",
    };
    data = await postOnce(p.endpoint, headers, {
      model: useModel,
      messages: [{ role: "user", content: prompt }],
      // OpenRouter 的联网搜索走 plugins，不是 tools。
      // tools 是给自定义函数调用用的，塞个 {type:"..."} 进去不会报错，
      // 会被静默忽略——模型压根没搜网，只是凭记忆编。这个坑踩过一次。
      ...(web && p.webSearch ? { plugins: [{ id: "web", max_results: 5 }] } : {}),
    });
  }

  const text = extractText(data);
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  // 模型没按 JSON 返回时，把它实际说了什么带上——空字符串说明这个模型
  // 根本没吐正文（推理模型常把内容放在别的字段），有正文则是格式跑偏了
  if (s === -1 || e === -1) {
    const err = new Error("API");
    err.detail = clean ? `模型没按 JSON 返回：${clean.slice(0, 200)}` : "模型返回了空内容（换个模型试试）";
    throw err;
  }
  let out;
  try {
    out = JSON.parse(clean.slice(s, e + 1));
  } catch (pe) {
    const err = new Error("API");
    err.detail = `模型返回的 JSON 有语法错误：${pe.message}`;
    throw err;
  }
  // 挂成不可枚举，免得混进正文字段或被 JSON.stringify 存进 localStorage
  Object.defineProperty(out, "__cites", { value: citesOf(data), enumerable: false });
  return out;
}

/* 取出搜索引擎真正访问过的页面。
   这是 OpenRouter 附加的，不是模型自己写的——比让模型「标明出处」可信得多，
   因为模型能编出一个格式完全合法、但根本不存在的网址。 */
export function citesOf(data) {
  const ann = data.choices?.[0]?.message?.annotations;
  if (!Array.isArray(ann)) return [];
  return ann
    .filter((a) => a && a.type === "url_citation" && a.url_citation)
    .map((a) => a.url_citation)
    .filter((c) => /^https?:\/\/\S+\.\S+/i.test(c.url || ""));
}

/* 两种协议的正文位置不一样，统一取出纯文本 */
export function extractText(data) {
  if (Array.isArray(data.content)) {
    return data.content.filter((b) => b && b.type === "text").map((b) => b.text).join("");
  }
  return data.choices?.[0]?.message?.content || "";
}

/* 拉取某个服务商当前可用的模型列表 */
export async function fetchModels(apiKey, providerId) {
  const p = providerOf(providerId);
  if (!p.modelsUrl) throw new Error("NOLIST");
  const headers = p.protocol === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true" }
    : { "Authorization": "Bearer " + apiKey };
  let res;
  try { res = await fetch(p.modelsUrl, { headers }); } catch (e) { throw new Error("NET"); }
  let data;
  try { data = unwrap(await res.json()); } catch (e) { throw new Error("API"); }
  if (!res.ok || data.error) {
    const msg = (data.error && (data.error.message || data.error.type)) || "";
    throw new Error(codeToErr(res.ok ? (data.error && data.error.code) || res.status : res.status, msg));
  }
  const list = data.data || data.models || [];
  const ids = list.map((m) => (typeof m === "string" ? m : m.id || m.name)).filter(Boolean);
  // Gemini 的兼容接口返回 "models/xxx"，去掉前缀好读
  return Array.from(new Set(ids.map((id) => id.replace(/^models\//, "")))).sort();
}

export function errText(e, providerId) {
  const p = providerOf(providerId);
  switch (e.message) {
    case "KEY": return `API Key 无效或没有权限，去设置里检查一下（应该是 ${p.keyHint} 这样的格式）。`;
    case "CREDIT": return `${p.name} 账户余额不足，去 ${p.site} 充值后再试。`;
    case "RATE": return "请求太频繁，等几秒再试一次。";
    case "ACCESS": return `${p.name} 拒绝了请求，可能是地区、网络出口或模型权限限制。请查看服务商返回的限制说明，或换一个可用的模型或网络。`;
    case "NET": return p.proxy
      ? `连不上 ${p.name} 服务器，检查网络（国内使用需要开代理），然后重试。`
      : `连不上 ${p.name} 服务器，检查一下网络再重试。`;
    case "NOLIST": return `${p.name} 没有提供模型列表接口，请照官网文档手填模型名。`;
    default: {
      // 服务商原文（模型不存在、参数不被支持之类）都在 detail 里。以前这里
      // 一律显示"出了点问题"，把唯一能定位的线索丢了，用户和作者都无从查起。
      const d = (e.detail || "").trim();
      return d ? `出了点问题：${d.slice(0, 300)}` : "出了点问题，重试一下。";
    }
  }
}

/* ---- 教材语料库 ----
   语料是本仓库自带的（教材/索引.json + 教材/篇目/*.json，由 工具/建教材库.py
   生成），通过 jsDelivr 发给前端。

   为什么不实时抓第三方网站：纯前端取正文只能靠浏览器 fetch，于是同时被两个
   条件卡死——国内能直连的站（古登堡、OpenStax、中国日报）不放行跨域；放行
   跨域的站（维基百科系）在国内连不上。两边没有交集，这条路是死的。

   jsDelivr 两个条件同时满足：实测国内不走代理 HTTP 200，且回
   access-control-allow-origin: *。中文路径也实测可用。

   以后自己上线了，把 LIB_BASE 换成自己域名下的同一份文件即可，连 jsDelivr
   也不用依赖。 */
export const LIB_BASE = "https://cdn.jsdelivr.net/gh/faqiang007/dian-du-english@main/教材/";
export const LIB_KEY = "dd-lib-v1";

export async function libFetch(path) {
  // 路径里有中文，必须编码；encodeURI 不动 / 和 : ，正好
  const r = await fetch(encodeURI(LIB_BASE + path), { cache: "force-cache" });
  if (!r.ok) throw new Error("net");
  return r.json();
}

/* 联网抓一个网页的正文。「从网址导入」和教材页的「抓来读」共用这一条管线——
   两边要的是同一件事：真去读那个页面，把原文摘回来，绝不让模型自己编。

   抛出的错误码由调用方翻成人话：
     nocite 没有任何访问记录（等于没真去读）／ empty 没拿到内容 ／ thin 内容太少不像正文 */
export async function fetchPageText(url, opts) {
  const { apiKey, model, providerId, maxWords, hint } = opts;
  const prompt = `请用网络搜索工具获取并阅读这个网页的内容：${url}
${hint || ""}

关于 content：
- 只摘录你**实际读到**的原文，保持原文措辞，不要改写、不要总结
- 尽量完整，上限 ${maxWords} 词；从开头连续往下取，不要东拼西凑
- **实际读到多少就给多少。宁可只有两段，也绝不自己补写凑长度**

只返回 JSON，不要任何其他文字或 markdown 代码块：
{"title":"内容的英文标题","content":"提取的英文原文，段落用\\n\\n分隔"}

如果实在无法获取该页面的英文内容，返回：{"error":"一句话中文原因"}`;
  const data = await callClaude(prompt, apiKey, model, true, providerId);
  if (data.error || !data.content) throw new Error("empty");
  /* 任意搜索引用不能证明模型读的是用户给的这页。必须有同源、同路径、
     同查询参数的引用，才允许把内容标作该网址的来源。 */
  const cite = (data.__cites || []).find((c) => samePage(c.url, url));
  if (!cite) throw new Error("sourceMismatch");
  if ((data.content.match(/[A-Za-z]/g) || []).length < 40) throw new Error("thin");
  return { title: data.title || "", content: data.content, cite };
}
