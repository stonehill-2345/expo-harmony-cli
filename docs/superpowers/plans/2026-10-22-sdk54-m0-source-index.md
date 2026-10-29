# M0 第一轮执行卡：固定来源与包级完整性

日期：2026-10-22；状态：本轮包级子步骤已验收，M0 仍进行中。
设计：`../specs/2026-10-22-sdk54-m0-source-index-design.md`。
适配基线：`22cb245f383a194b52f94127f95bce534258b8cc`。
开始时已有未跟踪文件：`docs/releases/2026-10-21-sdk54-architecture-baseline-acceptance.md`，不覆盖。

### S1 / M0-01：来源与范围

- 输入：固定 Expo commit；当前 catalog、覆盖种子文档、create 5.0.0 的 registry 信息。
- 文件：`scripts/sdk54/source-inventory.mjs`；来源索引及报告。
- 验收：M0-A01/source；核对 commit、根 workspace、模板路径；不得用参考 fork 替代固定来源。
- 操作：取得完整 Git tree，按固定对象获取清单；真实 create wrapper/executor 分开记录。
- 超时：单 Git 子进程 120 秒，下载重试单独保留失败记录。
- 退出：固定 tree 可重读；缺内容明确失败；不宣布真实创建工具已完成适配。
- [x] 来源核验并记录真实身份；141 workspace / 5 templates；创建源码选定同源 create-expo 3.5.11。

### S2 / M0-02：包级结构化清单

- 文件：同上；`docs/releases/sdk54-source-package-inventory.json`。
- 验收：M0-A01/packages、M0-A02/packages；覆盖能力为 SOURCE-WORKSPACE / SOURCE-TEMPLATES。
- 操作：按 workspaces 与模板路径枚举；记录版本、入口、依赖、scripts、位置、blob/hash。
- 断言：两次生成完全一致；fixture 不误收、scoped/private/templates 不漏。
- 退出：只有包级清单已实现；API 与选项仍未完成。
- [x] 先写契约测试并保存失败：`red.tap.log`；后续 symlink/glob 缺陷记录 `edge-red.tap.log`。
- [x] 实现并生成真实来源清单；包级重复输出 hash 一致，公开面仍未完成。

### S3 / M0-03：双向校验

- 文件：`scripts/sdk54/__tests__/source-inventory.test.mjs`；根脚本新增独立入口。
- 用例预先定义如下，不按运行结果删减：
  - PKG-01：来源 revision/tree 固定且重复输出一致。
  - PKG-02：删除记录并重算清单自身摘要仍拒绝，指出 manifest 位置。
  - PKG-03：多余记录、重复 ID、篡改版本/依赖/来源分别拒绝。
  - PKG-04：scoped/private/template、workspace 排除和 fixture 边界。
  - PKG-05：不支持 glob、错误 revision、缺失/非法 manifest 拒绝。
  - PKG-06：只读取 commit 内容，工作区修改不影响结果。
  - PKG-07：真实固定来源生成两次、校验正常清单成功，删改样本校验退出 1。
- 命令：根目录 `node --test scripts/sdk54/__tests__/source-inventory.test.mjs`，预期退出 0；负例子进程预期退出 1。
- 证据：red/green TAP、真实生成/验证命令和输出、清单 hash；原始证据目录见设计。
- [x] RED 契约运行。
- [x] GREEN 契约及真实来源运行；真实删除/篡改/重复均退出 1，结果见报告。
- [x] 填写每步实际结论及 M0 尚缺项：[本轮验收报告](../../releases/2026-10-22-sdk54-m0-source-index-acceptance.md)。

执行前机器可读用例集：`docs/releases/sdk54-m0-source-index-cases.json`，SHA256
`a3d2822c44326c076a26fdfc1530832f62ed1d91400d926a76224c734aa02733`。
新增文件：`source-seed-diff.mjs`（双向差异、无范围推断）、来源 provenance、结构化包清单、种子差异。

### 本轮关闭限制

只允许关闭已实际运行的包级子步骤。M0-A01/A02 的公开能力枚举、M0-04/05/06 以及 M0 阶段不能据此关闭。
日志仅本机，源码和小型结构化清单/报告可随工作区交接；不生成设备 PASS，不写生产 registry。
