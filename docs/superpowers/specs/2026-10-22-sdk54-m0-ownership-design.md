# M0-05 旧代码归属与引用设计

本轮只调查与形成处置依据，不删除/迁移运行时代码。关联 M0-05、M0-A05 的归属和回归映射；M0-06 的测试矩阵已交付，但不代表各原生套件通过。

## 输入与范围

适配HEAD为22cb245f383a194b52f94127f95bce534258b8cc加前四轮未提交修改。Expo/create/模板沿用 sdk54-source-provenance.json。进度固定六项分母，当前2/6；完整交付本轮后为3/6，不关闭M0。

发现集合使用git可见文件（包括当前未跟踪实现），限定apps/cli、scripts/sdk54、.github/workflows，以及根package.json/pnpm-workspace.yaml/pnpm-lock.yaml/README.md；忽略node_modules、dist和生成README。保留清楚的范围定义，不能把该集合当全仓库或动态程序完整调用图。

新增legacy-ownership-policy.mjs声明审阅后的处置规则/资源引用/源码锚点，legacy-ownership.mjs生成与重建校验。每个文件独立输出id、sha256、类别、策略、调用方、SDK52影响、目标、后续任务和回归。分类为KEEP_SDK52、REMOVE_SDK54、TRANSFER_SDK54、RETAIN_TOOLING；混合文件通过split描述精确锚点和保留内容。新增文件必须显式匹配有限范围规则，不以“无调用方”推断删除。

## 已确认的决定

- sdk54/npm-spec.ts 的expoSdkMajor被SDK52的version-matrix调用；保留并计划迁到apps/cli/src/lib/npm-spec.ts，不移植SDK52到新架构。
- sdk54/create-options.ts的parseCreateArgs/assertCreateSelectionSupported服务SDK52；SDK52解析计划迁到apps/cli/src/lib/create-options.ts，SDK54模板类型/参数由固定来源packages/create-expo承接，后者尚未纳入本地。
- release-manifest/release-runtime/file-transaction/template-contract中的有效身份/事务/模板能力移交scripts/sdk54发行工具、适配Expo与固定create来源；旧state/图像替换/消费端patch逻辑退出，不直接复制旧支持承诺。
- project-state.ts是旧SDK54子类型识别；后续删除SDK54状态分支时，SDK52识别由原version-matrix能力保留。lifecycle/managed-state.ts不能整删。
- generate-external-screens-patch.mjs的applyScreensOverlay被prepare-npm-release导入，保留发行前overlay，退出消费端patch输出分支。
- release-catalog.mjs读取旧patch manifest和CLI包版本；test-release-install.mjs加载apps/cli/dist/sdk54的两个产物。这些引用必须先解除，再删旧内容与构建输出。
- SDK52 patch/shim、生成器、原生模板、shared CLI命令保留；混合命令仅移除SDK54分流，后续需SDK52实际识别/创建/运行回归。
- package scripts、files、CI的run用结构化JSON/YAML读取；新增根yaml@2.9.1直接开发依赖，复用锁内版本，仅离线安装根工具依赖。

## 引用与验收边界

TypeScript AST枚举模块依赖（包含类型依赖），源码相对路径与.js到.ts投影单独记录。require/import的非字面量保留表达式，标记未静态解析；已确认的内容目录/编译产物跨界通过带源码锚点的审阅映射补充，不能伪装自动解析。脚本命令的路径/名称匹配仅记文本引用，不执行shell也不声称解析全部命令语义。

资源选择器与package files展开到当前文件，逐条保存来源；发行编译产物投影回源码但标记projection，不把dist当新鲜候选。每文件保留所有入边、回归文件与对应来源hash。没有入边的文件标记NO_STATIC_CALLER，仍须人工处置，不产生readyToDelete:true。

验收针对调查/表格/引用与防漏工具；后续真正清理归M0A-04/M6-05，设备/发行包回归另行执行。OWN-01至08须全部落实；进度接受记录仅在报告和证据通过后增加M0-05。
