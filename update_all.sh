#!/bin/zsh
# 同时更新主仓库和子目录 Git 仓库的脚本

set -e  # 遇到错误立即退出

echo "📦 开始更新 Hexo 主仓库..."
git pull

echo ""
echo "🎨 开始更新 themes/next 主题仓库..."
cd themes/next
git pull
cd ../..

echo ""
echo "✅ 所有仓库更新完成！"
