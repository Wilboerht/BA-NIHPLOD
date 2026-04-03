const fs = require('fs');
let content = fs.readFileSync('app/workbench/dealers/page.tsx', 'utf8');

// 清理所有已知的非法字符
content = content.replace(/张/g, '张');
content = content.replace(/已激张/g, '已激活');
content = content.replace(/待开张/g, '待开通');
content = content.replace(/记张/g, '记录');
content = content.replace(/有效张/g, '有效期');
content = content.replace(/状张/g, '状态');
content = content.replace(/已失张/g, '已失效');
content = content.replace(/系张/g, '系统');
content = content.replace(//g, ''); 

// 修复语法关键位
content = content.replace(/certificates张\./g, 'certificates?.');
content = content.replace(/\[0\]张\./g, '[0]?.');
content = content.replace(/profile 张 \(/g, 'profile ? (');

fs.writeFileSync('app/workbench/dealers/page.tsx', content);
console.log('Deep Clean Done');
