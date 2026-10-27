# SDK54 M0 第五轮：旧代码归属与引用验收

日期：2026-10-22；run ID：`20261022-m0-ownership`。

**M0 仍未关闭，完成50%（3/6）：M0-01、M0-05、M0-06 已完整验收。**
本轮完成 M0-05 调查及 M0-A05 的归属/回归映射。实际删除或迁移文件数为0；调查通过不代表旧入口已经清理、SDK52真实消费已回归或新架构可关闭。

## 1. 输入与范围

- [冻结用例](sdk54-m0-ownership-cases.json)、[逐文件处置表](sdk54-legacy-ownership.json)；实现为 `scripts/sdk54/legacy-ownership.mjs`、`legacy-ownership-policy.mjs`。
- 设计/执行卡：`docs/superpowers/specs/2026-10-22-sdk54-m0-ownership-design.md`、`docs/superpowers/plans/2026-10-22-sdk54-m0-ownership.md`。
- 适配 HEAD：`22cb245f383a194b52f94127f95bce534258b8cc` 加当前未提交修改；实际内容由 `input-snapshot.json` 固定。
- Expo commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。固定create来源为同commit的packages/create-expo 3.5.11，本地尚未纳入。
- git可见范围：apps/cli/、scripts/sdk54/、.github/workflows/，以及根package.json、pnpm-workspace.yaml、pnpm-lock.yaml、README.md；含未跟踪实现，排除node_modules、dist、coverage、生成的apps/cli/README.md。
- 环境：Node v22.20.0、pnpm 10.19.0、TypeScript 5.9.3。新增开发依赖yaml 2.9.1，复用锁内版本，仅离线安装根工具依赖；未重装整个workspace。
- 原始证据：`outputs/sdk54/ai-e2e/20261022-m0-ownership/`，以下日志均相对此目录。

## 2. 实现与逐项验收

| 步骤/用例 | 实现及实际结果 | 验收 |
| --- | --- | --- |
| P1 / OWN-01 | git枚举441文件；逐文件稳定ID、SHA256及归属；新文件发现、生成目录排除和符号链接拒绝通过 | PASS；contract-final-2.tap.log、generate-final.log |
| P1 / OWN-02 | TS AST记录import/export、类型引用、import-equals、动态import、require/resolve及createRequire别名；静态相对引用无缺失，动态保留表达式/行列 | PASS；named type export和import-type复现回归；8处动态引用仍标未解析 |
| P2 / OWN-03 | 保护SDK52解析器、创建参数、共享生成器、patch/shim/模板；Screens发行overlay单列移交，混合文件保存源码锚点 | PASS；KEEP_SDK52为249文件 |
| P2 / OWN-04 | 107文件的SDK54职责待退出；记录已发现入边、后续任务、SDK52影响及回归路径/hash；441文件均readyToDelete:false | PASS；cleanupExecuted:false，没有执行清理 |
| P2 / OWN-05 | 29文件的有效能力移交，记录目标及existing/planned状态；固定create来源关联provenance；56文件保留工具职责 | PASS；计划目标不计已实现 |
| P2 / OWN-06 | JSON读取root/app scripts与package files，YAML读取workflow run；48条命令、构建入口、资源目录与dist源码投影 | PASS；1763引用；投影标记artifactFreshness:NOT_VERIFIED |
| P3 / OWN-07 | 两次独立生成逐字节一致；九类变异拒绝；伪造readyToDelete的CLI负例实际退出1 | PASS；generate-repeat.log、ownership-check.log、ownership-negative.log、verification-results.json |
| P3/P4 / OWN-08 | 工具、CLI、类型、打包及历史清单/缺陷基线复核通过；报告、输入和原始证据hash、阶段接受记录绑定 | PASS；regression-results.json、closure-checks.json、evidence-index.json |

## 3. 重点处置与依赖

下表路径相对仓库；441文件完整表另含调用方、策略ID、源码锚点、回归命令/hash和删除门槛。

| 当前文件 | 已确认调用/能力 | 后续处置与退出前提 |
| --- | --- | --- |
| apps/cli/src/sdk54/npm-spec.ts | version-matrix.ts调用expoSdkMajor，SDK52依赖 | KEEP；计划提取到apps/cli/src/lib/npm-spec.ts，目标尚未创建 |
| apps/cli/src/sdk54/create-options.ts | creator共用parseCreateArgs及SDK52选择校验 | KEEP；SDK52解析计划提取到lib/create-options.ts；SDK54参数归固定create来源 |
| apps/cli/src/sdk54/release-manifest.ts、patch-manifest.ts | release-runtime和发行脚本依赖schema、requiredFiles/probes | TRANSFER；承接位置scripts/sdk54/release-catalog.mjs已存在；先迁契约，再退旧patch加载、固定15包与CLI版本耦合 |
| apps/cli/src/sdk54/release-runtime.ts | test-release-install动态加载对应dist；依赖身份检查有效 | TRANSFER；承接位置packages/@expo/cli/src/harmony/release.ts已存在；旧managed-state准入须退出 |
| apps/cli/src/sdk54/file-transaction.ts | 文本事务/回滚 | TRANSFER；归适配Expo发行维护，退出消费端图像改写用途 |
| apps/cli/src/sdk54/create-release.ts、template-contract.ts | 旧创建编排和模板身份校验 | TRANSFER；固定packages/create-expo尚未纳入；不复制创建后改依赖、旧state及expo-image替换 |
| apps/cli/src/sdk54/project-state.ts | 混合命令识别旧SDK54子类型 | REMOVE；先解除命令入边；SDK52识别及lifecycle/managed-state.ts保留 |
| scripts/sdk54/generate-external-screens-patch.mjs | prepare-npm-release调用applyScreensOverlay | TRANSFER；保留发行前overlay，只退消费端patch输出，不能按文件名整删 |
| scripts/sdk54/release-catalog.mjs | 读取旧patch manifest及apps/cli/package.json版本 | TRANSFER；先迁发行契约并解除旧内容/版本耦合 |
| scripts/sdk54/test-release-install.mjs | 加载CLI dist/sdk54/release-manifest.js及release-runtime.js | TRANSFER；人工映射至源码并标投影；先迁能力再解除CLI产物依赖 |
| apps/cli/content/patches/sdk-54/、content/docs/sdk-54/、templates/harmony-sdk-54/ | 内容复制、发行读取及package files引用 | REMOVE；schema、探针、许可证先移交，再清理内容/打包/CI入边 |
| apps/cli/src/commands/、src/scanner/、src/lifecycle/及SDK52内容/通用harmony模板 | SDK52命令、生成和生命周期仍使用 | KEEP；只拆SDK54分支；通用模板未证明可删，待SDK52实际回归 |

处置顺序：保留/提取SDK52共享能力，移交发行schema和有效运行检查，解除脚本/CI/内容/构建入边，再执行M0A-04/M6-05清理与SDK52实际识别/创建/运行回归。所有文件均保留这些门槛。

8处动态依赖分别为：official-autolinking的RNOH包解析/入口2处、release-runtime清单解析1处、Metro临时打包测试1处、误报复现加载器2处、test-release-install旧CLI产物2处。全部已审阅，仍为UNRESOLVED_DYNAMIC；审阅不等于解析到实际安装身份。

本图是范围内模块/资源/命令引用图，不是完整动态调用图。bare包/内建只记外部；命令中的路径/脚本名/glob只记文本引用；人工目录关联保存唯一源码锚点。无静态调用方不能直接判可删；构建投影不证明产物新鲜度或分支执行。

## 4. 实际回归

| 命令 | 实际结果 | 日志 |
| --- | --- | --- |
| pnpm test:sdk54-tools | 283/283，退出0 | tools-final.log |
| pnpm test | 53文件、500/500，退出0 | cli-final.log |
| pnpm type-check | 退出0 | types-final.log |
| pnpm test:pack | 2文件、4/4，退出0 | pack-final.log |
| legacy-ownership.mjs --check | 正常退出0；伪可删变异退出1 | ownership-check.log、ownership-negative.log |
| verify-validation-baseline.mjs | 历史缺陷复现、矩阵、结果日志/hash复核退出0；产品误报仍未修复 | validation-baseline-check.log |
| 三份来源清单 --source /tmp/sdk54-expo-source --check | source-inventory、plugin-surface、plugin-source-index均退出0 | source-inventory-check.log、plugin-surface-check.log、plugin-index-check.log |
| validate-catalog.mjs、check-repository.mjs | 均退出0 | catalog-check.log、repository-check.log |
| stage-progress.mjs --check、git diff --check、证据hash复核 | 均退出0 | closure-checks.json、evidence-verification.json |

打包测试验证当前CLI发行内容仍在，不能计为旧SDK54清理完成。本轮未重跑设备/原生编译或SDK52真实创建链路。第四轮5组环境失败、2项NOT_RUN继续有效，历史输入快照不改写。

## 5. 失败、边缘情况与修改点

1. contract-red.tap.log保存实现前失败；contract-green-1.tap.log记录泛化interface锚点不唯一。改为具体接口名后通过；后续锚点缺失/歧义均拒绝。
2. type-edge-red.tap.log先复现named type export/import-type漏记；补充AST识别后type-edge-green.tap.log通过，防止类型依赖被当成无调用方。
3. discovery-edge-red.tap.log先固定发现函数契约；contract-final-2.tap.log最终5/5。新增未跟踪文件可发现，scope内符号链接拒绝，生成目录排除。
4. 少文件、多文件、重复ID、hash篡改、缺回归、缺目标、错分类、伪可删、少引用九类变异均被重建比较拒绝。未审阅动态依赖或过时审阅同样拒绝。
5. yaml使用结构化解析，锁文件仅增加root importer对应项；不把脚本文本匹配表述为完整shell解析。
6. existing只表示承接位置存在，不代表迁移完成；planned目标尚待创建。后续清理须执行SDK52真实回归，不能用mock/打包测试替代。

## 6. 进度与证据保存

M0按冻结六项分母计数，M0-01、M0-05、M0-06通过，为50%（3/6），仍未关闭。M0-02/03全量公开面与差异范围、M0-04四项目现状及SDK52实际回归尚未完成。M0A/M1/M2/M3/M4/M5/V/M6/M7/M8按完整单元均0%，均未关闭。

definitions-before.json保存实施前定义/设计/执行卡hash；input-snapshot.json固定当前输入、实现、文档和环境；evidence-index.json索引原始证据；report.sha256单独固定本报告，避免自引用。sdk54-stage-acceptance.json绑定报告及处置表hash，stage-progress.mjs重验接受记录。

docs/superpowers/及outputs/受现有忽略规则影响，设计、执行卡、原始证据目前仅本机可复核。工具、用例、处置表和报告可跟踪但未提交；没有registry发布。
