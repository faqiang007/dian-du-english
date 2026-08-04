/* 构建脚本：把 main.jsx 及其依赖打包压缩，内联进 template.html，
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

// 2. 打包
const result = await build({
  entryPoints: ["main.jsx"],
  bundle: true,
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
  outfile: "bundle.js",
  logLevel: "info",
});

let js = result.outputFiles[0].text;

// 3. 防止代码里出现 </script 提前闭合标签
js = js.replace(/<\/script/gi, "<\\/script");

// 4. 注入模板。
//    注意：replace 的第二个参数必须用函数，否则 JS 代码里的 $& $1 等
//    会被当成替换模式解释，产物会被悄悄改坏。
const tpl = readFileSync(TPL, "utf8");
if (!tpl.includes("__BUNDLE__")) {
  console.error("模板里找不到 __BUNDLE__ 占位符，已中止");
  process.exit(1);
}
const html = tpl.replace("__BUNDLE__", () => js);
writeFileSync(OUT, html, "utf8");

// 5. 体检：产物太小说明打包不完整
const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
if (kb < 300) {
  console.error(`产物只有 ${kb}KB，明显偏小，可能打包失败，请检查`);
  process.exit(1);
}
console.log(`\n构建完成 → ${OUT}  (${kb}KB)`);
console.log("回到浏览器按 Cmd+Shift+R 强制刷新即可看到新版本。");
