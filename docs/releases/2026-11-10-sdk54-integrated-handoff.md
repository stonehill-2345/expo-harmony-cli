# SDK54 A/B 本机集成交接

日期：2026-11-10。源码基准：`0fcde7242944ead1b2dfbb817b6f76aa13410f27`，已包含 B 的 `5526a30`。本轮身份还包含工作区 7 项审查修复及交接文档修改，不能仅用 HEAD 代替候选身份。未暂存、提交、推送或发送外部消息。

主交付：[独立 HTML 报告](../../outputs/handoff-20261110/report.html)。目录 `outputs/handoff-20261110/`；便携归档 `outputs/sdk54-ab-handoff-20261110.tar`。忽略目录内的证据不会随普通 Git 提交传递，交接需同时携带归档。

## 交付内容

- `source-snapshot.tar.gz`：当前实际源码、测试、夹具、已跟踪生成物及文档；`source-index.json` 记录完整文件 SHA-256；`working-tree.patch` 保留相对 HEAD 的已跟踪修改。未跟踪的新文件包含在源码快照中，不能只应用 patch。
- `candidates/`：15 个 `@expo-oh/*` 正式命名候选及独立产品 CLI。`release.json` 为 15 包的 SHA-512 身份；`candidate-identity.json` 绑定源码清单、工作区修复和每个候选的 SHA-256。
- `inputs/`：核验过的 Screens 上游 tgz、RNOH/Worklets 原始 HAR，可按固定输入重新生成。
- `historical-evidence.tar.gz`：10 组 A 原始证据、原有来源重建归档、此前审查和 7 项修复验证记录。10 组清单 2875 条已重新核验。Core 的 773 条保留在原有内层封存归档中。
- `supplemental-fixtures.tar.gz`：A05 消费夹具与 8 个旧源码包、ExpoImage 官方 npm 包。全部是历史身份，不与本轮正式命名候选混用。
- `historical-recovered/`：4 份由 Git 找回、与旧收据 SHA-256 完全一致的文件；恢复来源见 `history-recovery.json`。保留在独立目录，不覆盖当前文档，不篡改验收收据。
- `validation/`：本轮包校验、CLI 构建、A 主机测试、安装矩阵、阶段审计及 A07 入口判断。安装矩阵的精确结果见 `candidates/peer-install-report.json`；本轮为 `--full`、禁用生命周期脚本的安装与锁文件重装，不等同设备或原生构建验收。
- `b-evidence-request.json`：B 三组缺失原始汇总的路径、预期哈希和关联工件要求。

## 接收与复核

在空目录解开外层 tar 后进入 `handoff-20261110/`：

```sh
python3 verify-bundle.py
mkdir source
tar -xzf source-snapshot.tar.gz -C source
cd source
corepack pnpm install --frozen-lockfile
node scripts/sdk54/verify-npm-release.mjs ../candidates
pnpm build
node scripts/sdk54/test-release-install.mjs --directory ../candidates --full
```

Node 使用 22.20.0，pnpm 使用 10.19.0。安装测试需要网络，将启动只读本地候选 registry；依赖生命周期关闭。新跑结果会更新接收方的安装报告，原交付目录应保留一份只读副本。源码快照没有依赖安装目录。

完整重新打包命令：

```sh
node scripts/sdk54/prepare-npm-release.mjs --output ../repacked \
  --screens-archive ../inputs/screens-4.9.0-upstream.tgz \
  --rnoh-har ../inputs/rnoh-0.82.30.har \
  --worklets-har ../inputs/worklets-1.0.0.har
```

交接校验器校验外层文件及三份内层归档的逐文件哈希和成员集合。历史日志中的绝对路径仅保留为来源记录；校验通过包内相对路径和归档索引完成，不依赖原机 `/Users/zhansh`。

## 当前进度与明确边界

| 任务 | 当前结论 | 仍需完成 |
| --- | --- | --- |
| A01 | PARTIAL：202 插件、1091 选项路径、7724 M4 记录 | 最终公开范围与生成物/原生/发行闭包 |
| A02 | PARTIAL：历史 Core 四组合、reload、离线冷启动专项通过 | 本轮候选完整正式设备组合 |
| A03 | PARTIAL：Font/Asset 运行时、TTF/CFF-OTF/PNG 专项通过 | 声明式资源嵌入、移除与全组合 |
| A04 | PARTIAL：UI/导航/浏览器多个 npm Release 专项通过 | Sheet detents 失败、旋转、Drawer、全组合 |
| A05 | A 侧 LOCAL PASS，正式命名候选已生成 | B 接入统一 runner、最终候选设备与新鲜度闭环 |
| A06 | PREPARATION PASS；IMPLEMENTATION NOT_STARTED | ExpoImage Harmony 实现未开始 |
| A07 / A08 | BLOCKED / NOT_STARTED | M4/M5/V/M6 关闭及 ExpoImage 发行身份等 6 项阻塞 |
| B01 / B03 / B04 | B 自验 PASS；A 交叉复核待原件 | 三组汇总及关联日志、候选、HAP、设备/性能原件 |
| B02 / B05 | 现有本机交接材料可接入 | 完整场景注册、统一候选复验；不再笼统写“A 无交付” |

历史阶段收据引用 80 个唯一文件：原路径 19 个匹配、60 个缺失、1 个哈希变化。本轮在隔离目录找回 4 份精确旧文件后仍有 57 份无法恢复；原路径收据审计仍不通过。已有 2026-10-29 新身份来源重建记录仅证明来源重建，不能替代丢失的设备/性能/最终验收。不能通过修改百分比或回填新哈希关闭阶段。

B 下一步应先校验本交接，再将适用 A 夹具、断言与 15 包新身份接入统一 runner。B 提供三组原件后，A 校验汇总 SHA-256 和全部引用文件，再决定哪些结果可交叉确认、哪些必须随新候选重跑。default 仍受 ExpoImage 缺失阻塞；blank 成功不得替代 default。
