#!/bin/bash
set -e

echo "🔍 运行 pre-commit 检查..."

# 检查 TypeScript 类型
echo "📦 检查 TypeScript 类型..."
npx tsc --noEmit

# 检查 ESLint
echo "🧹 检查 ESLint..."
npm run lint

echo "✅ Pre-commit 检查通过"
