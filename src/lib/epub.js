import { strFromU8, unzipSync } from "fflate";

/* ---- EPUB 解析 ----
   EPUB 就是一个 zip：META-INF/container.xml 指向 .opf 目录文件，
   .opf 里的 <spine> 规定正文顺序（manifest 里则是全部资源，含封面、
   版权页、目录页这些不该按顺序读的东西，所以必须走 spine）。
   正文是 XHTML，用浏览器自带的 DOMParser 解析，不引额外的库。 */
export function epubToText(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const read = (p) => (files[p] ? strFromU8(files[p]) : "");
  const parse = (s, type) => new DOMParser().parseFromString(s, type || "application/xml");

  const container = parse(read("META-INF/container.xml"));
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("epub");
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const opf = parse(read(opfPath));
  const title = opf.querySelector("metadata > title, title")?.textContent?.trim() || "";

  // manifest: id → href；spine 只给 idref，得查表
  const hrefById = {};
  opf.querySelectorAll("manifest > item").forEach((it) => {
    const id = it.getAttribute("id");
    const href = it.getAttribute("href");
    if (id && href) hrefById[id] = href;
  });

  const parts = [];
  opf.querySelectorAll("spine > itemref").forEach((ref) => {
    const href = hrefById[ref.getAttribute("idref")];
    if (!href) return;
    // href 里可能带 #锚点，也可能有 %20 这类转义
    const clean = decodeURIComponent(href.split("#")[0]);
    const raw = read(baseDir + clean) || read(clean);
    if (!raw) return;

    const doc = parse(raw, "application/xhtml+xml");
    // 解析失败时 DOMParser 不抛异常，而是返回一棵含 parsererror 的树
    const body = doc.querySelector("parsererror") ? parse(raw, "text/html").body : doc.body;
    if (!body) return;
    body.querySelectorAll("script, style, nav, header, footer").forEach((n) => n.remove());
    // 块级元素之间补换行，否则整章会挤成一坨没有分段
    body.querySelectorAll("p, div, br, h1, h2, h3, h4, li, blockquote").forEach((n) => {
      n.append("\n");
    });
    const t = (body.textContent || "").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (t) parts.push(t);
  });

  if (!parts.length) throw new Error("epub");
  return { title, text: parts.join("\n\n") };
}
