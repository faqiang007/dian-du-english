/* 连接模型服务：第一次打开、或在设置里点「更换服务商」时看到的那一页。 */

import { useEffect, useState } from "react";
import { PROVIDERS, PROVIDER_IDS, providerOf } from "../data/providers.js";
import { errText, fetchModels } from "../lib/api.js";

export function SetupView({ app }) {
  const {
    apiKey, providerDraft, pickSetupProvider, keyDraft, setKeyDraft,
    modelDraft, setModelDraft, showToast, saveSetup, clearSetupKey, setShowSetup,
  } = app;
  const hasKey = !!apiKey;
  const p = providerOf(providerDraft);

  const [models, setModels] = useState([]);
  const [listBusy, setListBusy] = useState(false);
  const [filter, setFilter] = useState("");

  // 换服务商后，上一家的模型列表就没意义了
  useEffect(() => { setModels([]); setFilter(""); }, [providerDraft]);

  async function loadModels() {
    const k = keyDraft.trim();
    if (!k) { showToast("请先粘贴 API Key"); return; }
    setListBusy(true);
    try {
      const list = await fetchModels(k, providerDraft);
      setModels(list);
      showToast(list.length ? `找到 ${list.length} 个可用模型` : "没有拿到模型列表");
    } catch (e) {
      showToast(errText(e, providerDraft));
    } finally {
      setListBusy(false);
    }
  }

  const shown = filter.trim()
    ? models.filter((m) => m.toLowerCase().includes(filter.trim().toLowerCase()))
    : models;

  return (
    <div className="setup">
      <div className="mark"><i>007</i>学英语</div>
      <h1 className="h1">连接模型服务</h1>
      <p className="page-sub">
        先选一家模型服务商，填上它的 API Key 就能用。密钥只存在这台电脑的浏览器里，
        不会发到你选的这家服务商以外的任何地方。每家的密钥分开保存，随时可以切换。
      </p>

      <div className="setup-step">
        <div className="lbl"><b>1</b>选择服务商</div>
        <div className="chips">
          {PROVIDER_IDS.map((id) => (
            <button key={id} className={id === providerDraft ? "chip big on" : "chip big"}
              aria-pressed={id === providerDraft} onClick={() => pickSetupProvider(id)}>
              {PROVIDERS[id].name}
              {!PROVIDERS[id].proxy && <span className="tag ok">免代理</span>}
            </button>
          ))}
        </div>
        <p className="hint">{p.blurb}</p>
      </div>

      <div className="setup-step">
        <div className="lbl"><b>2</b>API Key</div>
        <p className="hint">去 <b>{p.site}</b> 注册后创建，格式类似 <code>{p.keyHint}</code></p>
        <input
          className="field block"
          type="password"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          placeholder={p.keyHint}
          aria-label="API Key"
        />
      </div>

      <div className="setup-step">
        <div className="lbl"><b>3</b>模型</div>
        <p className="hint">留空则用默认的 {p.defaultModel}</p>
        <div className="imp-row">
          <input
            className="field mono grow"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveSetup(); }}
            placeholder={p.defaultModel}
            aria-label="模型"
          />
          {p.modelsUrl && (
            <button className="btn sec" onClick={loadModels} disabled={listBusy}>
              {listBusy ? "获取中…" : "获取可用模型"}
            </button>
          )}
        </div>

        {models.length > 0 && (
          <div className="models">
            <input
              className="field block"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="输入关键词筛选，比如 deepseek"
              aria-label="筛选模型"
            />
            <div className="model-list">
              {shown.slice(0, 300).map((m) => (
                <button key={m} className={m === modelDraft ? "on" : ""} onClick={() => setModelDraft(m)}>{m}</button>
              ))}
              {shown.length === 0 && <p className="hint">没有匹配的模型名。</p>}
            </div>
          </div>
        )}
        <p className="hint">
          不确定填哪个模型时，先填好 Key 点「获取可用模型」，列表是从服务商那里实时取的，
          点一下就能选中。{p.proxy ? "这家服务商在国内需要先开启代理。" : "这家服务商国内可以直接连，不用代理。"}
        </p>
      </div>

      <div className="setup-acts">
        <button className="btn pri lg" onClick={saveSetup}>保存并开始</button>
        {hasKey && (
          <>
            <button className="btn sec lg" onClick={() => setShowSetup(false)}>返回</button>
            <button className="btn txt danger-t" onClick={clearSetupKey}>清除这家的密钥</button>
          </>
        )}
      </div>
    </div>
  );
}
