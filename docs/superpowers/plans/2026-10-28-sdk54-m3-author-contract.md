# SDK54 Harmony M3 实施与验收计划

> 使用superpowers:subagent-driven-development执行已授权总计划；各责任独立实施并由最终审查覆盖。不提交。

目标：交付总计划M3-01～05；Spec：docs/superpowers/specs/2026-10-28-sdk54-m3-author-contract-design.md。

## 固定输入与规则

- 基线7852015，M2已关闭，工作区初始干净。保留M0/M0A/M1/M2冻结接受记录。
- Expo SDK54/Core3.0.30/RNOH0.82.30身份与既有发行集合不升级。
- 调用接口维持queryAutolinkingModulesFromProjectAsync与syncHarmonyNativeProjectAsync；新fixture不得加入固定release包列表。
- 用户已按总计划授权继续；本轮细化实现无需例行重新审批。沿用当前分支以保留本机候选与依赖；没有自动commit步骤。
- 初始设备列表为空，设备用例须真实执行才接受，不能以宿主mock替代。

## Task 1：M3-01/03 元数据与发现（metadata worker）

所有权：findModules.ts、types.ts、platforms/harmony/harmony.ts、rnohConfig.ts、新scripts/sdk54/__tests__/harmony-module-metadata.test.mjs；不得改nativeProject和Core。

- [ ] 用真实临时npm包和loadM1Source先复现：未知导航版本被忽略、显式RNOH缺HAR被忽略、其他平台Expo声明遮挡合法Harmony声明、歧义多HAR映射、缺路径和多版本。
- [ ] 命令：node --test scripts/sdk54/__tests__/harmony-module-metadata.test.mjs，保留红/绿日志。
- [ ] 实现合法Expo Harmony优先→显式RNOH→固定版本fallback，false停用、未知普通JS无声明忽略；版本不符及非法显式声明拒绝。
- [ ] 输出保持ModuleDescriptor.packageName逻辑名；新增可选npmPackageName/npmPackageVersion真实身份，预检源路径与标识符，重复实际原生身份拒绝并列根/版本。
- [ ] 用同入口全部绿测及旧harmony-platform-identity/生成专项回归证明兼容，保存源码hash。

## Task 2：M3-02 写入前冲突（native worker）

所有权：platforms/harmony/nativeProject.ts，必要时新增同目录moduleValidation.ts，新scripts/sdk54/__tests__/harmony-module-conflicts.test.mjs；不改metadata worker文件。

- [ ] 读现有generatePackageList/render/collect逻辑，真实文件系统先复现Package/CMake/ETS/生命周期/overlay冲突，检查错误含双方package/root与字段。
- [ ] 命令：node --test scripts/sdk54/__tests__/harmony-module-conflicts.test.mjs；记录红测，不用mock写入次数代替旧树完整比较。
- [ ] 以现有ModuleDescriptor输入实现validateHarmonyModuleGraph或等价预检，在sync/prepare事务前执行；所有render出口使用一致校验，保留同来源共享符号合法场景。
- [ ] 测非法生成标识符、原生source缺失、直接描述符绕过query、传递引用保留与最终卸载，旧工程及依赖全树不变。
- [ ] 回归M2 state/transaction/prebuild与元数据集成后再次验收。

## Task 3：M3-04/05 Core作者契约与独立探针（Core worker）

所有权：新packages/expo-modules-core/harmony/m3-fixture/、docs/harmony-module-authoring.md、Core README相关陈旧状态、新scripts/sdk54/__tests__/harmony-author-fixture.test.mjs；需要修改Core运行实现必须先报告具体红测。不要改Autolinking或release中央清单。

- [ ] 以现有Runtime/Async/ViewBinding/原生example公共API明确同步/异步/错误/事件/UI/销毁/SharedObject/Ref契约。
- [ ] 制作自包含测试模块package.json、expo-module.config.json、C++/ETS/CMake、app.plugin.js与JS/device探针；npm pack发布本地tgz，不向公共registry发布。
- [ ] 用node --test scripts/sdk54/__tests__/harmony-author-fixture.test.mjs先验证包结构/实际pack文件、真实metadata解析、checker拒绝缺失/错误/旧runtime事件。
- [ ] 提供安装→配置→调用→移除→重装范例与明确设备assertions；设备未执行时写NOT_RUN/BLOCKED，不把纯源码检查计作行为通过。

## Task 4：主线程集成/候选/独审

- [ ] 整合三个任务；跑node --test scripts/sdk54/__tests__/harmony-module-*.test.mjs scripts/sdk54/__tests__/harmony-author-fixture.test.mjs与M2回归，保留全部原始结果。
- [ ] 在outputs/sdk54/ai-e2e/20261028-m3-author-contract冻结本轮来源文件hash、原验收集合和设备预检；使用既有prepare-npm-release实际构建Autolinking/Core候选，核对JS出口及tgz内容。
- [ ] 仓库外npm/pnpm安装第三方tgz，实际query/prebuild，移除/重装和负例验证不修改依赖；按环境实测hvigor和设备，未执行部分保留具体原因。
- [ ] 独立reviewer按原五单元/A01～05审查实现与证据；有问题先红测再修。
- [ ] docs/releases/2026-10-28-sdk54-m3-author-contract-acceptance.md记录每原单元状态及边界；只登记全部满足的原单元，设备缺失不得关闭M3。
