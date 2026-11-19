#!/usr/bin/env node
// 校验双展示位文档一致性（GitHub 根目录 / npm 包 apps/cli）：
// 1) CHANGELOG.md 与 apps/cli/CHANGELOG.md 必须字节级一致（两处均完整展示，不允许指针）
// 2) README.md 与 apps/cli/README.md 忽略图片 URL 行后必须一致（唯一允许差异：图片地址）
// 用法：node scripts/check-docs-sync.mjs   一致 exit 0，否则打印差异并 exit 1
import { readFileSync } from 'node:fs';

const pairs = [
  { root: 'CHANGELOG.md', pkg: 'apps/cli/CHANGELOG.md', mode: 'exact' },
  { root: 'README.md', pkg: 'apps/cli/README.md', mode: 'ignore-image-lines' },
];

const IMAGE = /(!\[[^\]]*\]\([^)]*\)|<img[^>]*src=[^>]*>)/;
let failed = false;

for (const { root, pkg, mode } of pairs) {
  const a = readFileSync(root, 'utf8').split('\n');
  const b = readFileSync(pkg, 'utf8').split('\n');
  const norm = mode === 'ignore-image-lines'
    ? (ls) => ls.map(l => IMAGE.test(l) ? l.replace(/https?:\/\/[^ )"'"]+/g, '<URL>') : l)
    : (ls) => ls;
  const na = norm(a), nb = norm(b);
  if (na.length !== nb.length || na.some((l, i) => l !== nb[i])) {
    failed = true;
    console.error(`✗ 不一致: ${root} vs ${pkg} (${mode})`);
    const max = Math.max(na.length, nb.length);
    let shown = 0;
    for (let i = 0; i < max && shown < 10; i++) {
      if (na[i] !== nb[i]) {
        console.error(`  L${i + 1}:`);
        console.error(`    根 : ${(na[i] ?? '<缺失>').slice(0, 120)}`);
        console.error(`    包 : ${(nb[i] ?? '<缺失>').slice(0, 120)}`);
        shown++;
      }
    }
    console.error('  同步方法：以根目录为准复制到 apps/cli（图片用 GitHub raw 绝对 URL）');
  } else {
    console.log(`✓ ${root} = ${pkg} (${mode})`);
  }
}

// 附检：两份 README 图片必须用绝对 URL（npm 渲染），禁止相对路径图片
// 注意只检查图片源（![alt](src) 的 src / <img src>），外层链接目标允许相对路径
for (const f of ['README.md', 'apps/cli/README.md']) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const mdImgs = [...l.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)].map(m => m[1]);
    const htmlImgs = [...l.matchAll(/<img[^>]*src=["']([^"']+)["']/g)].map(m => m[1]);
    for (const src of [...mdImgs, ...htmlImgs]) {
      if (!/^https?:\/\//.test(src)) {
        failed = true;
        console.error(`✗ ${f} L${i + 1} 图片为相对路径（npm 页面会裂图）: ${src}`);
      }
    }
  });
}

process.exit(failed ? 1 : 0);
