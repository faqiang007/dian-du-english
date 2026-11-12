/* 最外层：还没连上模型服务就显示「首次设置」，连上了显示主界面。
   状态和动作全在 store.js，这里和 views/ 里只管画。 */

import { useStore } from "./store.js";
import { SetupView } from "./views/Setup.jsx";
import { Shell } from "./views/Shell.jsx";

export default function App() {
  const app = useStore();
  const { apiKey, showSetup, appStyle, toast } = app;

  if (!apiKey || showSetup) {
    // 设置页没有侧栏，用 solo 关掉两列布局，否则左边会空出一条
    return (
      <div className="app solo" style={appStyle}>
        <SetupView app={app} />
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }
  return <Shell app={app} />;
}
