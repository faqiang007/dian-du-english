/* 四套配色的名字和色块。具体颜色不在这里——全部写在 styles/tokens.css，
   按 <html data-theme="…"> 切换。这里的 id 存在用户的偏好里，不能改名。 */
export const THEMES = {
  paper: { name: "纸白", swatch: "#F7F6F2" },
  cream: { name: "米黄", swatch: "#F3EBDA" },
  green: { name: "豆绿", swatch: "#E4EDDE" },
  dark: { name: "夜间", swatch: "#131417" },
};

/* 正文字号的五档 */
export const FONT_SIZES = [15, 17, 19, 21, 23];
