/* 设置：外观 / 朗读 / 模型服务 / 数据 四组，每组一句说明——
   设置项的意义比设置项本身重要。 */

import { Copy, Download, KeyRound, Trash2, Upload, Volume2 } from "lucide-react";
import { DAY } from "../lib/text.js";
import { providerOf } from "../data/providers.js";
import { FONT_SIZES, THEMES } from "../data/themes.js";

export function SettingsView({ app }) {
  const {
    prefs, setPrefs, enVoices, speak, providerId, model, openSetup,
    vocab, copyVocab, downloadVocab, confirmClear, setConfirmClear, clearVocab,
    exportBackup, pickBackupFile, restore, setRestore, confirmRestore,
  } = app;
  const vocabCount = vocab.length;
  const backupDays = prefs.backupAt ? Math.floor((Date.now() - prefs.backupAt) / DAY) : null;
  const dayText = (ts) => { const d = new Date(ts); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

  /* 必须用函数式更新读 p.size：从渲染闭包里读 prefs.size 的话，
     连点两次「A＋」时第二次拿到的还是旧值，只会加一档。 */
  const bumpSize = (d) => setPrefs((p) => {
    const i = FONT_SIZES.indexOf(p.size);
    return { ...p, size: FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, i + d))] };
  });

  return (
    <div className="page narrow-l">
      <div className="page-h"><h1>设置</h1></div>

      <section className="setgrp">
        <h2>外观</h2>
        <p className="setgrp-h">只影响这台电脑上的显示，不会动到你的生词和文章。</p>

        <div className="setrow">
          <span className="setl">背景</span>
          <div className="swatches">
            {Object.entries(THEMES).map(([id, t]) => (
              <button key={id}
                className={prefs.theme === id ? "swatch on" : "swatch"}
                style={{ background: t.swatch }}
                aria-label={t.name}
                aria-pressed={prefs.theme === id}
                onClick={() => setPrefs((p) => ({ ...p, theme: id }))}
              ><span>{t.name}</span></button>
            ))}
          </div>
        </div>

        <div className="setrow">
          <span className="setl">正文字体</span>
          <div className="seg">
            <button className={prefs.font === "serif" ? "on" : ""} style={{ fontFamily: "var(--read-serif)" }}
              onClick={() => setPrefs((p) => ({ ...p, font: "serif" }))}>衬线 Aa</button>
            <button className={prefs.font === "sans" ? "on" : ""}
              onClick={() => setPrefs((p) => ({ ...p, font: "sans" }))}>黑体 Aa</button>
          </div>
        </div>

        <div className="setrow">
          <span className="setl">正文字号</span>
          <div className="stepper">
            <button className="btn sec sm" aria-label="调小" onClick={() => bumpSize(-1)}>A−</button>
            <span>{prefs.size}</span>
            <button className="btn sec sm" aria-label="调大" onClick={() => bumpSize(1)}>A＋</button>
          </div>
        </div>
      </section>

      <section className="setgrp">
        <h2>朗读</h2>
        <p className="setgrp-h">
          用的是设备自带的语音合成，不消耗 API 额度。音质取决于系统——苹果设备和 Windows 上的 Edge 最好。
        </p>

        <div className="setrow">
          <span className="setl">语速</span>
          <div className="seg">
            {[[0.75, "慢"], [0.9, "稍慢"], [1, "正常"], [1.15, "快"]].map(([val, lb]) => (
              <button key={lb}
                className={Math.abs((prefs.rate || 1) - val) < 0.01 ? "on" : ""}
                onClick={() => setPrefs((p) => ({ ...p, rate: val }))}
              >{lb}</button>
            ))}
          </div>
        </div>

        <div className="setrow">
          <span className="setl">声音</span>
          <div className="setctl">
            <select
              className="field"
              value={prefs.voiceURI || ""}
              onChange={(e) => setPrefs((p) => ({ ...p, voiceURI: e.target.value }))}
            >
              <option value="">自动（已挑选设备里最佳）</option>
              {enVoices.slice(0, 12).map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>
              ))}
            </select>
            <button className="btn sec"
              onClick={() => speak("Hello! I will be your reading voice. Let's read something together.", "en-US")}>
              <Volume2 size={14} /> 试听
            </button>
          </div>
        </div>
      </section>

      <section className="setgrp">
        <h2>模型服务</h2>
        <p className="setgrp-h">
          API Key 只存在这台电脑的浏览器里，只发给你选的这一家。每家的 Key 分开保存，切换不用重填。
        </p>
        <div className="setrow">
          <span className="setl">当前</span>
          <div className="setctl">
            <span>{providerOf(providerId).name} · <code>{model}</code></span>
            <button className="btn sec" onClick={openSetup}>
              <KeyRound size={14} /> 更换服务商 / 模型
            </button>
          </div>
        </div>
      </section>

      <section className="setgrp">
        <h2>数据</h2>
        <p className="setgrp-h">
          全部数据只存在本浏览器里，<b>清除浏览器数据会一并清掉</b>。隔一阵下载一份完整备份
          （不含 API Key），放到网盘或别的硬盘上。
        </p>
        <div className="setrow">
          <span className="setl">完整备份</span>
          <div className="setctl">
            <span>
              {backupDays === null ? "还没备份过" : backupDays === 0 ? "今天备份过" : `上次备份在 ${backupDays} 天前`}
            </span>
            <button className="btn pri" onClick={exportBackup}>
              <Download size={14} /> 下载完整备份
            </button>
            <label className="btn sec">
              <Upload size={14} /> 从备份恢复
              <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={pickBackupFile} />
            </label>
          </div>
        </div>
        {/* 恢复会整份覆盖，所以先把备份里有什么、会盖掉什么摆出来，确认了才动 */}
        {restore && restore.err && (
          <div className="callout bad row">
            <span>{restore.err}</span>
            <button className="btn sec sm" onClick={() => setRestore(null)}>知道了</button>
          </div>
        )}
        {restore && restore.data && (
          <div className="callout hi row">
            <span>
              这份备份{restore.at ? `存于 ${dayText(restore.at)}` : ""}：{restore.words} 个生词、{restore.days} 天足迹、{restore.arts} 篇文章。
              恢复会<b>整份覆盖</b>现在的 {vocabCount} 个生词和全部进度，回到备份那一刻。
            </span>
            <span className="callout-a">
              <button className="btn danger" onClick={confirmRestore}>确认覆盖</button>
              <button className="btn sec" onClick={() => setRestore(null)}>取消</button>
            </span>
          </div>
        )}
        <div className="setrow">
          <span className="setl">生词本</span>
          <div className="setctl">
            <span>共 {vocabCount} 个词</span>
            <button className="btn sec" onClick={copyVocab} disabled={!vocabCount}>
              <Copy size={14} /> 复制为 Markdown
            </button>
            <button className="btn sec" onClick={downloadVocab} disabled={!vocabCount}>
              <Download size={14} /> 下载 .md
            </button>
          </div>
        </div>
        <div className="setrow">
          <span className="setl">危险操作</span>
          <div className="setctl">
            {confirmClear ? (
              <>
                <span className="bad-t">清空后无法恢复，确定？</span>
                <button className="btn danger" onClick={clearVocab}>确认清空</button>
                <button className="btn sec" onClick={() => setConfirmClear(false)}>取消</button>
              </>
            ) : (
              <button className="btn sec danger-t" onClick={() => setConfirmClear(true)} disabled={!vocabCount}>
                <Trash2 size={14} /> 清空生词本
              </button>
            )}
          </div>
        </div>
      </section>

      <button className="btn txt"
        onClick={() => setPrefs((p) => ({ ...p, theme: "paper", font: "serif", size: 19, voiceURI: "", rate: 1, dictOff: false }))}
      >恢复默认外观</button>
    </div>
  );
}
