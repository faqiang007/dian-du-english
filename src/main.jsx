/* 打包入口：把样式带进来，把 App 挂到页面的 #root 上。 */
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
