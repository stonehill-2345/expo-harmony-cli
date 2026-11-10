# SDK54 源码与公开面证据重建

日期：2026-10-29。责任人：A。用户已确认旧 `public-surface.json`、`source-census.json` 丢失，并授权按当前实现重新生成。

**两份索引已重建并通过来源重放校验，下游公开范围裁定构建器已成功消费。** 这是新证据，不是旧文件的字节恢复；旧哈希、人工裁定和阶段结论不沿用。M4 范围尚未冻结，功能/设备验收状态不变。

## 来源与产物

工作区：`/Users/zhansh/project/expo-harmony-cli-a`，分支 `feat/sdk54-a-modules`，代码基点 `19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`。

证据目录：`outputs/sdk54/ai-e2e/20261029-a-evidence-rebuild/`，以下路径均相对该目录。

- 官方源码：[Expo 固定 SDK 54 提交](https://github.com/expo/expo/commit/5b42e3d21e0ac5e086752361ca8a5cb4de53bec1)，包含 `expo@54.0.37` 等发布。没有改用不断变化的 SDK 54 分支头。
- Git commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。
- 本地固定源码仓库：`expo-official.git`。通过官方 GitHub API/Raw 获取对象；每个 tree、commit、blob 均与固定 Git SHA-1 核对。API 规范化后的提交时间偏移仅在完整提交字节能匹配既定 SHA-1 时接受。`git fsck --full` 通过。
- TypeScript 5.9.3、Node 23.5.0。A 的依赖目录改为 macOS 写时复制副本，修改隔离；原项目未修改。磁盘余量随后恢复，未删除历史证据。

| 文件 | 实际内容 | SHA-256 |
| --- | --- | --- |
| `public-surface.json` + `public-surface.json.parts/` | 146 个包、629 条入口、13,942 条导出候选、159,194 个类型、371,240 条成员记录 | `6beb636b564eea1a7d86f54f508b4c4e7a6acc5b02e54e153714c5be49fc83ff`（索引） |
| `source-census.json` | 19,546 项；141 个 workspace + 5 个模板 owner；19,538 个普通文件实读/hash 核验 | `f25f181b03d267d1e67b4d8791024dc457a7ba1a7a80dfd51c5fd722f30b848c` |
| `semantic.json.gz` + 同名 `.parts/` | 重新计算的上游语义图，不依赖丢失的旧语义工件 | `e16cd411123023a4cad49bfe3329dc8b1f3b9f90cc5443820f66fade4361f6ed`（索引） |
| `public-dispositions.json` | 使用以上新证据，由现有公开范围裁定构建器实际生成 | `00c8f7f12efacaf2867c32fb8bdd8159e4e68f966568e7e7b57275209e4b2c0d` |

导出/类型/成员数量包含条件入口、内部模块和分析节点，不等于独立公开 API 数或 Harmony 支持数量。分片是索引的必要组成部分，不能只复制 JSON 主文件。

源码普查中的 8 个特殊项为 7 个符号链接和 1 个 gitlink；其普查状态仍为 `GIT_TREE_OID_ONLY`，没有冒充普通文件内容验收。根 owner 外的 2,607 项全部保留，2,628 个语义类别检查格保持待审。

## 真实生成与验收

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 官方固定源码身份与完整性 | PASS | `official-commit.json`、`official-tree.json`、`source-acquisition.json`、`source-fsck.log` |
| 既有索引/来源校验器回归 | 66/66 PASS，0 跳过 | `analyzer-tests.log` |
| 新增获取/重建工具负例 | 3/3 PASS | `reconstruction-tests-final.log`；字节/对象类型/提交变化拒绝，输出不得覆盖源码 |
| 公开面生成与分片回读 | PASS | `public-generate.log`、`public-summary.json` |
| 公开面独立重建比较 | PASS | `check-surface.log`、`public-source-check.json`；实际从固定来源/归档/语义图重新生成后逐字段比较 |
| 源码普查独立重建比较 | PASS | `check-census.log`、`census-source-check.json`；再次从 Git tree 实读全部普通文件 |
| 四个真实工件负例 | 4/4 正确拒绝 | `negative-checks.json`、`negative-checks.log`；删 Core 导出、删源码且改计数、伪造 symlink 实读、改分片字节 |
| 下游构建器消费 | PASS | `dispositions.log`、`downstream-check.json`；调用现有 `buildFinalPublicDispositions`，固定新输入哈希 |
| 旧 CLI 不改参数直接重放 | 不兼容，未宣称通过 | 旧 loader 保留历史路径和旧哈希；没有通过复制到历史目录或放宽校验来绕过 |
| 历史范围决议/功能/设备 | 未恢复 / NOT_RUN | 不由新索引推定 M0/M4 或模块功能通过 |

依赖归档按固定 `yarn.lock` 身份获取：先恢复 233 个历史摘要登记的归档，再补 147 个声明依赖身份；根据实际解析请求补取 71、15、9、2 个身份，最后一轮新增为 0。最终 477 个身份中，476 个通过归档结构检查；`@react-native-community/datetimepicker@8.4.4` 因重复 `package/src/index.js` 条目被拒绝，保留验证结果，不纳入合法声明上下文。

收敛后仍有 712 条解析边界记录；不等于 712 个独立缺失功能。公开索引保留 122 个 `compiler-error-type` 节点及泛型/实例化预算等边界。`publicSurfaceComplete`、`stageClosable`、`publicSemanticCoverageProven` 仍为 false。

## 与历史证据的差别

旧哈希分别为公开索引 `76e245…`、源码普查 `42a1b8…`。本轮明确创建新的输入集合与哈希，不修改它们的历史记录。

新公开输入为 16,667 条（4,623 条固定 Git 输入、12,044 条非 Git 上下文），旧报告为 16,673 条。旧人工范围证据及部分补充来源已丢失，无法证明原集合逐项相等；本轮没有为了凑旧数量而添加记录。所有固定 tree 普通文件均在新的源码普查中实读覆盖。

未重建的内容明确记录在元数据中：

- `scope-reviewed-*.json` 和历史 scope decisions；M4/M7 归属需要 A 继续按原验收目标逐项复核。
- 历史 capability map 与 shared followup：`source-census.json` 的 capability 关联为空且标记 `NOT_RECONSTRUCTED`，不表示这些能力不存在。
- `plugin-contracts.json`、`final-public-closure.json` 及其阶段验收尚未由本轮关闭。
- 当前 Harmony 修改、生成声明和最终候选的双向核对仍是 A-01/A-05 的后续工作；固定 Expo 来源清单不能代替当前发行物验证。

## 重放方法

从 A 工作区根目录执行。新脚本是 A 命名的重建入口；公共分析器、历史固定哈希及 B 的发行工具未修改。

```sh
export SDK54_REBUILD=outputs/sdk54/ai-e2e/20261029-a-evidence-rebuild
export SDK54_FIXED_SOURCE="$SDK54_REBUILD/expo-official.git"

# 新机器从官方来源获取固定 Git 对象；本机已有对象会复用。
node scripts/sdk54/a-fetch-sdk54-source.mjs "$SDK54_REBUILD"

node scripts/sdk54/a-rebuild-source-evidence.mjs prepare "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
node --max-old-space-size=6144 scripts/sdk54/a-rebuild-source-evidence.mjs semantic "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
node --max-old-space-size=6144 scripts/sdk54/a-rebuild-source-evidence.mjs transitive "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
# 查看 transitive-status.json；added > 0 时重复 semantic → transitive，直到 added = 0。

node --max-old-space-size=6144 scripts/sdk54/a-rebuild-source-evidence.mjs surface "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
node --max-old-space-size=6144 scripts/sdk54/a-rebuild-source-evidence.mjs census "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
node --max-old-space-size=6144 scripts/sdk54/a-rebuild-source-evidence.mjs check-surface "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
node --max-old-space-size=6144 scripts/sdk54/a-rebuild-source-evidence.mjs check-census "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
node --max-old-space-size=6144 scripts/sdk54/a-rebuild-source-evidence.mjs dispositions "$SDK54_FIXED_SOURCE" "$SDK54_REBUILD"
```

完整输入目录与校验记录由 `reconstruction-manifest.json` 登记。`source-evidence-bundle.tar.gz` 保存索引/分片、固定源码仓库、归档、日志及本轮工具副本；其校验文件为同名 `.sha256`。`outputs/` 被 Git 忽略，B 汇总时应保存证据包或按命令重建，不能把文档里的路径当作已经入库。

普通 Git 下载断流、整包超时、大二进制 Raw 超时及 Skia 超过默认下载限制的失败日志均保留。最终从官方 API 补齐源码，Skia 官方 npm 归档采用完整性验证后的分段下载；没有使用未核验镜像或跳过哈希。

下一步由 B 接入显式的新证据路径/哈希契约，A 继续范围裁定。此前 [A→B 交接单](2026-10-29-sdk54-a-to-b-handoff.md) 中“这两个来源文件缺失”已有新证据替代，但 A-01 完整范围冻结尚未完成。未暂存、提交、推送或发布。
