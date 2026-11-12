/* 构建脚本：把 src/ 里的代码和样式打包压缩，内联进 template.html，
   生成可直接双击打开的单文件 dian-du-openrouter.html。

   用法：npm run build   或   双击「构建.command」        */

import { build } from "esbuild";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";

const OUT = "dian-du-openrouter.html";
const TPL = "template.html";

// 1. 先备份上一版产物，改坏了还能退回
if (existsSync(OUT)) {
  copyFileSync(OUT, OUT + ".bak");
  console.log("已备份上一版 →", OUT + ".bak");
}

// 2. 打包。入口里 import 了样式，所以会同时产出一份 JS 和一份 CSS
const result = await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
  outdir: "out",
  logLevel: "info",
});
const pick = (ext) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text;
let js = pick(".js");
let css = pick(".css");
if (!js || !css) {
  console.error("打包结果里缺少 JS 或 CSS，已中止");
  process.exit(1);
}

// 3. 防止内容里出现 </script 或 </style 提前闭合标签
js = js.replace(/<\/script/gi, "<\\/script");
css = css.replace(/<\/style/gi, "<\\/style");

// 4. 注入模板。
//    注意：replace 的第二个参数必须用函数，否则代码里的 $& $1 等
//    会被当成替换模式解释，产物会被悄悄改坏。
const tpl = readFileSync(TPL, "utf8");
for (const mark of ["__BUNDLE__", "__STYLE__"]) {
  if (!tpl.includes(mark)) {
    console.error(`模板里找不到 ${mark} 占位符，已中止`);
    process.exit(1);
  }
}
const html = tpl.replace("__STYLE__", () => css.trim()).replace("__BUNDLE__", () => js);
writeFileSync(OUT, html, "utf8");

// 5. 体检：产物太小说明打包不完整
const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
if (kb < 300) {
  console.error(`产物只有 ${kb}KB，明显偏小，可能打包失败，请检查`);
  process.exit(1);
}
console.log(`\n构建完成 → ${OUT}  (${kb}KB)`);
console.log("回到浏览器按 Cmd+Shift+R 强制刷新即可看到新版本。");
