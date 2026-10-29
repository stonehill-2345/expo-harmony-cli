# SDK54 Harmony M0A 实施与验收计划

> 按已授权总计划连续实施；使用 subagent-driven-development 分工及独立复核。当前 feat/V1.7.0 现场续做，不提交。Spec：docs/superpowers/specs/2026-10-27-sdk54-m0a-creation-design.md。

## 固定约束

原 M0A-01～05 分母 5 不变；创建器与模板来源固定 Expo 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1。使用真实上游源码和打包产物，不以 wrapper、mock 创建器或事后补丁代替。每项先测试复现，再实现，再实跑对应验收；保留真实失败及设备未运行状态。

- [x] M0A-01：导入 packages/create-expo 全 subtree，固定来源记录；适配默认模板发行身份，保留上游 template/PM 接口，安装失败非零。运行源码/契约测试与 ncc build，两次候选打包及仓库外 help/version/创建无安装验收，保存源码与候选 hash。
- [x] M0A-02：导入 templates 两 subtree；按 scripts/sdk54/creation-catalog.mjs 发行映射直接声明完整依赖，保持应用源码。运行映射/缺依赖/资产守恒测试，打包两真实模板并由真实创建器消费，检查项目依赖与模板一致且无 native/state/injector 修补。
- [x] M0A-03：真实安装身份修复 CLI/Metro；24项身份正负检查通过。npm/pnpm blank 独立prebuild、两轮普通start/无state重启HTTP200、模拟器真实run和原始首屏通过；独审9/9、171输入稳定，已登记80%。
- [x] M0A-04：核对调用图后将创建与版本能力移入真实工具链，移除独立 CLI SDK54 创建入口和四个无消费者实现及专属测试，保留 SDK52。SDK52 创建主体/共享资产守恒，CLI471/471、pack5/5及真实tgz拒绝SDK54无文件副作用通过；README/guide改为候选入口。M0原字节证据归档，历史hash不变。
- [x] M0A-05：18真实候选归档固定，四组合仓库外完整安装成功，126依赖身份及15474候选文件通过；独审10/10、475输入稳定。同候选跨轮次验收，非单轮全绿或空缓存冷下载。default原样两PM各两轮bundle通过，原生行为按原M7/M8义务保留。

阶段结论：M0A已关闭100%（5/5），五项原退出产物逐一核对见正式验收报告末尾；ledger追加03/05及独立closure，原分母与历史hash不变。本阶段不提交。下一阶段M1统一配置快照与Harmony插件。

## 落点与检查

创建器 worker 独占 packages/create-expo、create-source/build-create 及其测试；平台 worker 独占 CLI start、Harmony project detection、Metro detection 及其测试。主线程负责模板、候选打包/消费、根依赖与锁、旧入口、文档与阶段接受。所有参与者保留他人修改。

证据目录：outputs/sdk54/ai-e2e/20261027-m0a-creation/。阶段计算继续使用 node scripts/sdk54/stage-progress.mjs --output/--check；接受文件仅追加真正完成的原 M0A 单元与实际证据 hash。Catalog/Repository 对创建器新增 workspace 与候选发行的现有约束按必要事实更新，不能豁免构建产物或绝对路径违规。
