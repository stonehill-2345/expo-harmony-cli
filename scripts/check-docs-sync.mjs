#!/usr/bin/env node
// 校验双展示位文档一致性（GitHub 根目录 / npm 包 apps/cli）：
// 1) CHANGELOG.md 与 apps/cli/CHANGELOG.md 必须字节级一致（两处均完整展示，不允许指针）
// 2) README.md 与 apps/cli/README.md 忽略图片 URL 行后必须一致（唯一允许差异：图片地址）
// 用法：node scripts/check-docs-sync.mjs   一致 exit 0，否则打印差异并 exit 1
import { readFileSync } from 'node:fs';

const pairs = [
  { root: 'CHANGELOG.md', pkg: 'apps/cli/CHANGELOG.md', mode: 'exact' },
  { root: 'README.md', pkg: 'apps/cli/README.md', mode: 'exact' },
];

const IMAGE = /(!\[[^\]]*\]\([^)]*\)|<img[^>]*src=[^>]*>)/;
let failed = false;

for (const { root, pkg, mode } of pairs) {
  const a = readFileSync(root, 'utf8').split('\n');
  const b = readFileSync(pkg, 'utf8').split('\n');
  // 图片行差异策略：根 README 用相对路径（本地/GitHub/GitLab 预览），apps/cli 用
  // GitHub raw 绝对 URL（npm 渲染）。规范化把图片源整体归一为 <IMG> 再比对。
  const norm = mode === 'ignore-image-lines'
    ? (ls) => ls.map(l => {
        if (!IMAGE.test(l)) return l;
        return l
          .replace(/!\[[^\]]*\]\([^)\s]+[^)]*\)/g, '<IMG>')
          .replace(/<img[^>]*src=["'][^"']+["'][^>]*>/g, (m) => m.replace(/src=["'][^"']+["']/, 'src="<IMG>"'));
      })
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

// 附检：素材双副本必须一致（仓库根 docs/assets ↔ 包内 apps/cli/docs/assets）
import { createHash } from 'node:crypto';
for (const f of ['demo-overview.gif', 'community-wechat-qr.png', 'community-qq-qr.png']) {
  const a = `docs/assets/${f}`, b = `apps/cli/docs/assets/${f}`;
  try {
    const ha = createHash('md5').update(readFileSync(a)).digest('hex');
    const hb = createHash('md5').update(readFileSync(b)).digest('hex');
    if (ha !== hb) { failed = true; console.error(`✗ 素材不一致: ${a} vs ${b}`); }
  } catch { failed = true; console.error(`✗ 素材缺失: ${a} / ${b}`); }
}

// 附检：图片源必须真实存在（npm 渲染相对路径走包内文件，仓库页走仓库路径）
// 根 README 相对 docs/assets/，apps/cli/README.md 相对包内 assets/
import { existsSync } from 'node:fs';
for (const [f, dir] of [['README.md', ''], ['apps/cli/README.md', 'apps/cli/']]) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const mdImgs = [...l.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)].map(m => m[1]);
    const htmlImgs = [...l.matchAll(/<img[^>]*src=["']([^"']+)["']/g)].map(m => m[1]);
    for (const src of [...mdImgs, ...htmlImgs]) {
      if (/^https?:\/\//.test(src)) continue; // 绝对 URL 不在此校验
      const path = dir + src.replace(/^\.\.\//g, m => m); // 根 README 不应出现 ../
      if (!existsSync(dir + src)) {
        failed = true;
        console.error(`✗ ${f} L${i + 1} 引用的图片不存在: ${dir}${src}`);
      }
    }
  });
}

process.exit(failed ? 1 : 0);
