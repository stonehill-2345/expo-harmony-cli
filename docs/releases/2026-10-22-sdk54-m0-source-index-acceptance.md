# SDK54 M0 第一轮：固定来源与包级索引验收

日期：2026-10-22；run ID：`20261022-m0-source-index`。

结论：本轮固定来源和包级索引子步骤已实现并实际验收；**M0 仍进行中，不允许关闭 M0 或进入依赖 M0 关闭的交付节点**。
未修改 SDK54 运行时、SDK52 流程或历史基线报告，未提交、未写生产 registry。

## 1. 定义、来源和适配身份

- 总计划：[SDK54 Harmony 新架构阶段开发与验收计划](../superpowers/plans/2026-10-21-sdk54-architecture-completion.md)。
- 本轮设计：[M0 来源索引设计](../superpowers/specs/2026-10-22-sdk54-m0-source-index-design.md)。
- 本轮执行卡：[M0 来源索引执行卡](../superpowers/plans/2026-10-22-sdk54-m0-source-index.md)。
- 必达定义：[14 个包级子用例](sdk54-m0-source-index-cases.json)，SHA256：`a3d2822c44326c076a26fdfc1530832f62ed1d91400d926a76224c734aa02733`；最终验证开始前已采集 hash。
- 适配 HEAD：`22cb245f383a194b52f94127f95bce534258b8cc`；本轮新增/修改文件的内容 hash 见证据目录 `input-snapshot.json`，不能仅凭 HEAD 重建本轮源码。
- Expo 来源：`expo/expo@5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`。
- 来源 tree：`5457e824b21d968e55c8f533cdf1751860160a92`；完整 tree 为 19,546 条记录。
- [结构化包清单](sdk54-source-package-inventory.json)：141 workspace 包、5 模板，SHA256：`fc95e76892e2c8c1a11664955de9e38825ba7c87d2d4ceb21ba4a0330056c6cc`。
- [种子差异](sdk54-source-seed-diff.json)：SHA256 `166016aa5d489ca2a4d6fafad4090756a2ddf9dde6082a08c4cde80569ed5f3f`。
- [create/模板来源与真实发行身份](sdk54-source-provenance.json)：分别记录 source revision、registry gitHead、tgz integrity/SHA256，不把不同 commit 视为相同产物。

本地取得完整 Git tree 和 package manifests，其余源码 blob 尚未全部下载；工具读取固定对象，后续按固定 blob ID 获取 API/插件源码。
这里的 141 项包含私有应用、测试与构建工具，**不是 141 个已经适配的 Expo 模块**。

## 2. 每一步实现及实际结论

所有命令在仓库根目录执行。原始证据统一位于：
`outputs/sdk54/ai-e2e/20261022-m0-source-index/`。

| 步骤/任务 | 具体实现 | 验收及实际结果 | 结论/限制 |
| --- | --- | --- | --- |
| S1 / M0-01 来源索引 | `source-inventory.mjs` 从固定 commit 读取 tree/blob，校验 blob SHA1，再保存 SHA256 和相对路径；默认离线，显式预取缺失 manifests | PKG-01/06、EDGE-MISSING-BLOB；实际 tree 和根 manifest 固定；dirty/删除 checkout 不改变结果；缺 blob 明确失败 | PASS：仅来源与包级输入固定；未宣布完整公开面源码已到齐 |
| S1 / M0-01 创建来源核定 | 固定同源 `create-expo@3.5.11`；default `54.0.63`、blank-typescript `54.0.47`；分别登记原始依赖 | CREATE-IDENTITY；三个调查 tgz 的 SHA512 均匹配 registry 元数据，包身份与 entry 已读取 | PASS：来源核定；create 适配、打包与真实创建仍未做 |
| S2 / M0-02 包级枚举 | 遍历 workspaces 与 templates 根 manifests，稳定 ID，保存版本/入口/scripts/依赖/文件摘要；不把 nested fixtures 误当 workspace | PKG-04、EDGE-RECURSIVE；真实来源 141 + 5，两次独立生成字节一致 | PASS：仅包级索引；全部 API、属性和插件选项仍未枚举 |
| S2 / M0-02 种子差异 | `source-seed-diff.mjs` 重建 130 种子，与完整来源双向列出位置、版本和待评估项 | SEED-DIFF；88 项同名、42 项 workspace 中缺失、53 项仅来源存在；重复生成字节一致 | PASS：差异调查；逐项用途、外部来源、废弃/重命名及范围结论尚未完成，M0-A02 不关闭 |
| S3 / M0-03 完整性校验 | 重新枚举固定来源，逐 ID 比较记录和元数据，不信任清单自报 hash | PKG-02/03/05、EDGE-SYMLINK/CLI、REAL-CHECK；正常退出 0，删 config/改 expo 版本/重复 app-integrity 均退出 1 并定位来源 | PASS：包级双向校验；公开能力级完整性未实现 |

包级依赖记录保留原始 spec。npm alias 的 `targetId` 保留 null，不伪造真实身份；完整 alias、同包多版本及传递依赖解析归后续 M0/M3/M6 契约。
所有条目仍为“未评估”；`completeness.publicSurface=false`、`stageClosable=false`，校验器拒绝伪改这两个字段。

## 3. 14 个必达子用例结果

| 用例 | 实际断言/证据 | 状态 |
| --- | --- | --- |
| PKG-01 | commit/tree、确定性、无绝对路径；`sdk54-tools-final.tap.log` 对应用例 | PASS |
| PKG-02 | 删除并重算自报 hash 后仍定位缺失 manifest；同上 | PASS |
| PKG-03 | 额外/重复记录及版本、依赖、revision、completeness 改动拒绝；同上 | PASS |
| PKG-04 | scoped/private/template、排除、fixture 和 alias 原 spec 保留；同上 | PASS |
| PKG-05 | 非支持 glob、非法 JSON、错误 revision、重名 workspace 拒绝；同上 | PASS |
| PKG-06 | 工作区内容改变或删除不影响固定对象枚举；同上 | PASS |
| EDGE-SYMLINK | symlink manifest 明确失败，不遗漏后成功；同上 | PASS |
| EDGE-MISSING-BLOB | 删除源 blob 后明确失败并定位；同上 | PASS |
| EDGE-RECURSIVE | `packages/**` 与排除规则按层级枚举；同上 | PASS |
| EDGE-CLI | 缺/未知参数与非固定来源 CLI 退出 1；同上 | PASS |
| REAL-REPEAT | 最终 A/B 输出与落盘清单逐字节相同；`real-source-final-results.json`、`final-generate-a/b.log` | PASS |
| REAL-CHECK | 正常 0；删除、篡改、重复分别 1；`final-check/deleted/changed/duplicate.log` | PASS |
| SEED-DIFF | 双向集合计数与条目、范围未评估状态、重复输出一致；`seed-diff-final.json/log` 及最终 TAP | PASS |
| CREATE-IDENTITY | 真实 tgz 的 SHA512/SHA256、manifest 与 wrapper entry；`create-integrity.json` 及三个 tgz | PASS |

本轮定义集合：应有 14，PASS 14，FAIL 0，BLOCKED 0，NOT_RUN 0，缺失 0，重复 0。
这只汇总本轮包级子用例；M0 总验收集合仍有未完成项，不能据此关闭阶段。
统一 V runner 尚未交付；本报告依据实际自动化日志人工汇总，不冒充 V 的自动关闭报告。

## 4. 实际命令与回归

```bash
# 已存在的临时 Git 来源；重建时先 git init，再 fetch 固定 commit
git -C /tmp/sdk54-expo-source fetch --depth=1 --filter=blob:none \
  https://github.com/expo/expo.git 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1

node scripts/sdk54/source-inventory.mjs --source /tmp/sdk54-expo-source \
  --prefetch --output docs/releases/sdk54-source-package-inventory.json
node scripts/sdk54/source-inventory.mjs --source /tmp/sdk54-expo-source \
  --check docs/releases/sdk54-source-package-inventory.json
node scripts/sdk54/source-seed-diff.mjs \
  --inventory docs/releases/sdk54-source-package-inventory.json \
  --bundle packages/expo/bundledNativeModules.json \
  --output docs/releases/sdk54-source-seed-diff.json
pnpm test:sdk54-tools
pnpm type-check
node scripts/sdk54/validate-catalog.mjs
node scripts/sdk54/check-repository.mjs
```

| 检查 | 最终实际结果 | 证据 |
| --- | --- | --- |
| SDK54 工具测试 | 249 tests、249 pass、0 fail/skip/cancel/todo；其中新增 11 tests | `sdk54-tools-final.tap.log`，约 27 秒，退出 0 |
| CLI 类型检查 | 退出 0；只覆盖现有产品 CLI 的 tsc 范围 | `type-check.log` |
| 现有 catalog | 14 packages、22 internalEdges、failures 空，退出 0 | `catalog-check.log`；不是全量支持结论 |
| 仓库边界 | forbiddenFiles/forbiddenText/failures 均空，退出 0 | `repository-check.log` |
| 原始来源重复与负例 | 所有预期退出码一致，重复 hash 一致 | `real-source-final-results.json` |

环境：macOS、Node `v22.20.0`、pnpm `10.19.0`。未检查签名或设备，不记 BLOCKED；本轮没有构建/安装/设备 PASS。

## 5. 失败尝试及修正

1. 初次新增契约：工具不存在，退出 1，保留 `red.tap.log`。
2. 第一轮实现：child_process 的 Buffer 编码参数错误，已有复现测试失败；改为 `encoding: null`，保留 `green-1.tap.log`。
3. 第二轮：篡改测试误改本来为空的依赖对象；改为篡改 expo 的非空依赖，保留 `green-2.tap.log`，第三轮 7/7 通过。
4. 边缘补测：未知 extglob、symlink manifest 被静默跳过，两条复现失败；实现明确拒绝，`edge-red.tap.log` / `edge-green.tap.log` 保留。
5. 后续补种子差异断言；最终新增 11 项、总工具 249 项通过。此前 248 项记录保留为 `sdk54-tools.tap.log`。
6. 来源下载曾遇 DNS 失败、官方 registry/完整 codeload/API 下载超时；未采用不完整归档。随后使用 Git 固定 tree 与批量 manifests 成功，最终输出未依赖这些失败下载。

改进约束：二进制子进程固定用 null 编码；变异测试先确认修改了有效值；workspace 语法和 symlink 采用明确支持集合，新增形式先测拒绝行为，再扩展支持。

## 6. 未完成项与下一步

| 总任务/验收 | 当前状态与补验条件 |
| --- | --- |
| M0-01 | 来源/包级身份已核定；完整公开面相关源码须按固定对象取得；create 与模板候选构建/消费尚未开始 |
| M0-02 / M0-A02 | 141 workspace / 5 template 包级索引已生成；53 新增/42 缺失差异逐项评估、全部 API/组件属性/插件选项仍未完成 |
| M0-03 / M0-A01 | 包级双向校验通过；API、嵌套属性、Splash/Router 类型/schema 及依赖完整性校验仍未完成 |
| M0-04 / M0-A03 | 四项目现状与 SDK52 原流程真实回放 NOT_RUN；现有工具测试通过不替代它 |
| M0-05 / M0-A05 | SDK54 旧调用图、SDK52 共享归属与逐文件处置未实施 |
| M0-06 / M0-A04 | semver/alias/传递依赖误报最小复现、Core 文档与分包测试矩阵未实施 |
| M0A-M8、V | 本轮未进入；真实创建、配置插件、构建与设备验收未执行 |

下一轮继续 M0-02/03 的公开面、插件入口/嵌套类型/schema 枚举及上述差异逐项来源评估，再完成 M0-04/05/06；M0 未关闭前不跳过前置条件。

## 7. 证据保存与复取

- `docs/releases/` 的报告、定义、provenance、结构化包清单和差异是可跟踪的小型交付物，当前尚未提交。
- `docs/superpowers/` 受既有 ignore 规则影响；详细设计/执行卡仍仅本机保存，未更改忽略规则或强制暂存。
- 大体积日志、原始 tgz、负例和输入 hash 保存在上述 `outputs/`，同样受 ignore 规则影响，**目前仅本机可复核**。没有宣称已提供团队共享归档。
- `evidence-index.json` 保存本轮证据文件 SHA256；报告索引另保存在 `report.sha256`，避免自引用。
- 原始来源可按第 4 节重新 fetch 固定 commit，再显式预取 manifests；registry 包按 provenance 的固定版本重新获取并核对 integrity，不依赖 latest。
