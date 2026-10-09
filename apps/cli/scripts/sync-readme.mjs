import { readFileSync, writeFileSync } from 'node:fs';

// npm 包页面使用根 README 作为门面：复制到包根并改写仓库相对路径。
// 包内存在：assets/、docs/guide.md、CHANGELOG.md、NOTICE.md；
// 仅存在于仓库的文件（docs/、CONTRIBUTING 等）改写为 GitHub 绝对链接。
const GITHUB = 'https://github.com/stonehill-2345/expo-harmony-cli';

const source = new URL('../../../README.md', import.meta.url);
const target = new URL('../README.md', import.meta.url);

let text = readFileSync(source, 'utf8');
text = text
  .replace(/apps\/cli\/assets\//g, 'assets/')
  .replace(/apps\/cli\/docs\//g, 'docs/')
  .replace(/apps\/cli\/CHANGELOG\.md/g, 'CHANGELOG.md')
  .replace(/\(docs\/\)/g, `(${GITHUB}/tree/main/docs)`)
  .replace(/\(CONTRIBUTING\.md\)/g, `(${GITHUB}/blob/main/CONTRIBUTING.md)`)
  .replace(/\(SECURITY\.md\)/g, `(${GITHUB}/blob/main/SECURITY.md)`)
  .replace(/\(CODE_OF_CONDUCT\.md\)/g, `(${GITHUB}/blob/main/CODE_OF_CONDUCT.md)`);
writeFileSync(target, text);
