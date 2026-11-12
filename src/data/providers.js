import {
  APIKEY_STORE, KEYS_STORE, MODELS_STORE, MODEL_STORE, PROVIDER_STORE, sGet, sSet,
} from "../lib/storage.js";

/* ---------- 模型服务商 ----------
   加新服务商：只要它的接口兼容 OpenAI 的 /chat/completions 格式，
   在下面的 PROVIDERS 里加一条就行，不用改其他任何代码。
   前提是该服务商的 CORS 要放行 file:// 的 null 来源——
   现有 9 家都实测通过，新增时可以这样验证：
     curl -X OPTIONS <接口地址> -H "Origin: null" \
       -H "Access-Control-Request-Method: POST" \
       -H "Access-Control-Request-Headers: authorization,content-type" -D -
   返回头里有 access-control-allow-origin 就说明可以直连。

   全部实测支持浏览器直连（CORS 放行 file:// 的 null 来源）。
   protocol: "openai" = 标准 /chat/completions；"anthropic" = Messages API。
   modelsUrl 存在时，设置页可一键拉取该服务商的真实模型列表，
   所以 defaultModel 只是初始建议，过时了点一下按钮就能更新。 */
export const PROVIDERS = {
  openrouter: {
    name: "OpenRouter", protocol: "openai", webSearch: true,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    defaultModel: "deepseek/deepseek-v4-pro",
    keyHint: "sk-or-...", site: "openrouter.ai",
    blurb: "一把钥匙调用几十家模型，模型名格式是「厂商/模型」。国内需要开代理。",
    proxy: true,
  },
  deepseek: {
    name: "DeepSeek 深度求索", protocol: "openai",
    endpoint: "https://api.deepseek.com/chat/completions",
    modelsUrl: "https://api.deepseek.com/models",
    defaultModel: "deepseek-chat",
    keyHint: "sk-...", site: "platform.deepseek.com",
    blurb: "国内直连不用代理，价格便宜，是日常使用的推荐选择。",
  },
  moonshot: {
    name: "月之暗面 Kimi", protocol: "openai",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    modelsUrl: "https://api.moonshot.cn/v1/models",
    defaultModel: "kimi-latest",
    keyHint: "sk-...", site: "platform.moonshot.cn",
    blurb: "国内直连不用代理，中文语感好。",
  },
  zhipu: {
    name: "智谱 GLM", protocol: "openai",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    modelsUrl: "",
    defaultModel: "glm-4-plus",
    keyHint: "一串带「.」的密钥", site: "bigmodel.cn",
    blurb: "国内直连不用代理。该平台不提供模型列表接口，模型名请照官网文档填写。",
  },
  qwen: {
    name: "阿里通义千问", protocol: "openai",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    modelsUrl: "",
    defaultModel: "qwen-plus",
    keyHint: "sk-...", site: "bailian.console.aliyun.com",
    blurb: "国内直连不用代理。在阿里云百炼平台开通后获取密钥。",
  },
  siliconflow: {
    name: "硅基流动 SiliconFlow", protocol: "openai",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    modelsUrl: "https://api.siliconflow.cn/v1/models",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    keyHint: "sk-...", site: "siliconflow.cn",
    blurb: "国内直连不用代理，聚合了很多开源模型，注册送额度。",
  },
  anthropic: {
    name: "Anthropic Claude", protocol: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    modelsUrl: "https://api.anthropic.com/v1/models",
    defaultModel: "claude-sonnet-5",
    keyHint: "sk-ant-...", site: "console.anthropic.com",
    blurb: "Claude 官方接口。国内需要开代理，且代理必须是家宽/住宅 IP，机房 IP 会被拒。",
    proxy: true,
  },
  openai: {
    name: "OpenAI", protocol: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    modelsUrl: "https://api.openai.com/v1/models",
    defaultModel: "gpt-4o",
    keyHint: "sk-...", site: "platform.openai.com",
    blurb: "OpenAI 官方接口。国内需要开代理，且代理必须是家宽/住宅 IP，机房 IP 会被拒。",
    proxy: true,
  },
  gemini: {
    name: "Google Gemini", protocol: "openai",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    defaultModel: "gemini-2.5-flash",
    keyHint: "AIza...", site: "aistudio.google.com",
    blurb: "Google AI Studio 提供免费额度。国内需要开代理。",
    proxy: true,
  },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS);
export const DEFAULT_PROVIDER = "openrouter";

export function providerOf(id) { return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER]; }

/* 读取「每个服务商各存一份」的 Key / 模型，并把旧版单 Key 数据迁移进来 */
export function loadKeyMap() {
  const m = sGet(KEYS_STORE) || {};
  if (!m[DEFAULT_PROVIDER]) {
    try {
      const old = localStorage.getItem(APIKEY_STORE);
      if (old) { m[DEFAULT_PROVIDER] = old; sSet(KEYS_STORE, m); }
    } catch (e) {}
  }
  return m;
}
export function loadModelMap() {
  const m = sGet(MODELS_STORE) || {};
  if (!m[DEFAULT_PROVIDER]) {
    try {
      const old = localStorage.getItem(MODEL_STORE);
      if (old) { m[DEFAULT_PROVIDER] = old; sSet(MODELS_STORE, m); }
    } catch (e) {}
  }
  return m;
}
export function loadProviderId() {
  try {
    const p = localStorage.getItem(PROVIDER_STORE);
    if (p && PROVIDERS[p]) return p;
  } catch (e) {}
  return DEFAULT_PROVIDER;
}
