#!/bin/bash
# scripts/pre-commit-check.sh
# 提交前检查脚本 - 确保 dealer-profile 数据一致性
# 用法：bash scripts/pre-commit-check.sh

echo "🔍 执行 Dealer-Profile 一致性检查..."
echo ""

node scripts/validateDealerProfileConsistency.mjs

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 检查失败！请修复问题后再提交"
  echo "💡 建议运行："
  echo "   node scripts/fixDealerProfileConsistency.mjs"
  exit 1
fi

echo ""
echo "✅ 所有检查通过！可以安全提交"
exit 0
