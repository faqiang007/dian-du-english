#!/bin/bash
# 双击我，就会用当前源码重新打包出 dian-du-openrouter.html
cd "$(dirname "$0")" || exit 1

echo "正在打包……"
echo ""
npm run build
code=$?
echo ""
if [ $code -eq 0 ]; then
  echo "✅ 完成。回到浏览器按 Cmd+Shift+R 强制刷新。"
else
  echo "❌ 构建失败（错误码 $code），把上面的红字截图发给 001。"
  echo "   上一版产物仍在 dian-du-openrouter.html.bak，可改名恢复。"
fi
echo ""
echo "按任意键关闭这个窗口……"
read -r -n 1 -s
