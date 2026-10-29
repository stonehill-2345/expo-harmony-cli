# M0 第二轮执行卡：首批插件公开选项

日期：2026-10-22；状态：本轮子步骤已实现并验收，M0 未关闭。
验收报告：`../../releases/2026-10-22-sdk54-m0-plugin-surface-acceptance.md`。
关联设计：`../specs/2026-10-22-sdk54-m0-plugin-surface-design.md`。

### P1 / M0-02：固定来源与选项展开

- 输入：固定 commit、首轮包级清单；六插件 plugin 源码、prebuild-config/src、config-types/src。
- 文件：新增 `plugin-surface.mjs`、插件来源描述；第一轮工具只导出 Git 读取函数；根 TypeScript devDependency 与 lock。
- 断言：跨包 Splash dark/drawable/tablet/density、Font 对象数组与枚举均完整且定位；SystemUI 保留配置读取。
- 验收映射：M0-A01/plugin-options，M0-A02/PLG-ASSET/FONT/SPLASH/SYSTEM-UI/ROUTER/WEB-BROWSER。
- 命令：`node --test scripts/sdk54/__tests__/plugin-surface.test.mjs`；单个子进程上限 120 秒。
- [x] 保存输入与用例定义 hash；原定义 hash 未变，输入快照见本轮证据。
- [x] 先写契约、记录 RED；所有失败尝试保留。
- [x] 实现类型展开与源码追踪，实际固定来源生成；83 输入、六插件、105 路径记录。

### P2 / M0-02：Router schema 与差异

- 文件：同上；结构化输出同时保存 TS/schema 的所有路径、枚举、required、开放字典和 JSON pointer。
- 断言：schema-only platformRoutes/partialRouteTypes/redirects/rewrites；TS-only partialTypedGroups；origin/asyncRoutes、headers required 差异可见。
- 边缘：数组 items、escaped JSON Pointer、本地/外部/循环/缺失 refs、未知类型不可忽略。
- [x] 解析 schema 并加入真实差异验收；保留 Router 双方声明与 26 条差异，PLG-08 通过。

### P3 / M0-03：双向完整性校验与回归

- 文件：契约测试、真实负例、结构化清单与报告；不为当前源码支持状态赋 PASS。
- 预定义必达用例见 `docs/releases/sdk54-m0-plugin-surface-cases.json`。
- 断言：两次真实输出字节一致；正常退出 0；删除嵌套记录、篡改、重复和伪改关闭标记均退出 1。
- 回归：`pnpm test:sdk54-tools`；固定来源第一轮清单重新校验；根类型检查仅代表 CLI 范围。
- [x] 实施校验及边缘失败用例；13 项单测通过，新增结构/路径歧义先复现后修复。
- [x] 完成实际生成/负例/工具回归并保存每次尝试；两次字节相同，正常 0、五类负例各 1，工具回归 262/262。
- [x] 报告每步结果、未完成范围、证据 hash，更新总进度；PLG-01 至 PLG-10 均通过，仅本轮来源枚举子集合。
