/* 打包入口：把 App 组件挂到页面的 #root 上。
   改功能请改 dian-du-openrouter-source.jsx，这个文件基本不用动。 */
import { createRoot } from "react-dom/client";
import App from "./dian-du-openrouter-source.jsx";

createRoot(document.getElementById("root")).render(<App />);
