# 官方优先、mapping 补充实现计划

- 对应规范：[设计规范](../specs/2026-09-09-official-autolink-first-design.md)
- 状态：六个任务已全部实现并验证（2026-09-09）。契约结论见 [official-autolink-contract.md](../specs/2026-09-09-official-autolink-contract.md)；真实 fixture smoke（CLI 0.77.71 + pnpm）三轮幂等通过。未执行 DevEco 构建验证（无 Harmony 构建环境）。
- 固定流程：官方优先，未覆盖时自研补充，仍未覆盖则提示 skill

## 1. 范围约束

不增加模式开关、策略参数、覆盖率门槛或 mapping 退役机制。两个项目仅作参考，在当前 CLI 实现，不复制其完整基础设施。

不预建双 descriptor、完整 scanner、通用解析器或独立发布器。normalization 延后，不提前创建兼容模块。复用当前模板、AutolinkingResult、managed-state、drift 和事务写入。

## 2. 任务一：实际调用契约

先在临时 fixture 中验证当前矩阵的 RNOH CLI（version-matrix 的 rnohCli 0.77.71）。fixture 用真实 Expo 测试项目，以 `require.resolve('@react-native-oh/react-native-harmony-cli')` 从项目内解析实际安装版本并与矩阵对照；契约结论必须来自真实调用，不得凭参考项目源码推断：

- commandLinkHarmony.func 的调用形状、rawArgs 驼峰路径键。
- includeNpmPackages 为空、单包、多包、单元素含分号的行为。
- metadata 有效、缺失、禁用或非法时的结果。
- 临时输出与真实项目 node_modules 在 pnpm symlink/workspace 下的解析。
- 一个官方包、一个 mapping 缺口包、官方整体失败。

产出聚焦契约测试和代表性产物，不创建覆盖率框架；失败先留复现，再修正调用。

## 3. 任务二：最小官方调用适配器

主要文件：新增 src/harmony-project/official-autolinking.ts 及对应测试。

1. 从用户项目解析实际官方 CLI，按任务一验证的协议调用。
2. 官方候选包不局限于 mapping；只读取必要 metadata。
3. 输出到临时 Harmony 目录，不修改已安装包，不镜像整棵依赖树。
4. 检查产物存在、非空、路径有效与 JSON5 可解析。
5. 根据实际 metadata 和输出确认覆盖，不与 mapping 做全量比较。
6. 返回产物、未覆盖包及原因，finally 清理临时目录。

轻量 helper 先放模块内部，不预拆 scanner、descriptor、verify 等基础库。

测试：CLI 缺失、加载失败、部分产物、官方独有包、pnpm 路径。

## 4. 任务三：自研只补缺口

主要文件：src/harmony-project/autolinking.ts、现有 mapping 类型与测试。

1. 提取现有必要的 import、实例、include 和 CMake 片段生成 helper。
2. 对官方未覆盖项查询 mapping，复用 HAR 检查和批量片段生成。
3. 在官方已验证锚点补充片段，不改写已经成功的官方包。
4. 官方整体不可用时直接复用当前批量模板。
5. 验证补充片段、重复注册和跨包冲突。
6. 部分注册判定：官方产物中该包的片段若能凭包名或 import 路径唯一定位，则替换残留后补充；无法唯一定位则报错并保留原工程，不得发布损坏文件。

不把官方内容重新交给完整自研模板生成，不增加双 descriptor。膨胀防线：autolinking.ts 改造中超过约 400 行时，将锚点插入与合并逻辑拆至独立模块（如 autolinking-patch.ts）；片段生成 helper 留在原处供两条路径共用，不预拆但允许顺拆。

测试：三类包共存、同包优先、多 Package、namespace、缺 HAR、缺锚点及部分注册冲突。

## 5. 任务四：OHPM 与现有同步接入

主要文件：src/harmony-project/standalone.ts、autolinking.ts；必要时调整 src/lifecycle/managed-state.ts。

1. 在现有同步入口编排官方调用、自研补充和最终结果。
2. 以真实项目路径合并 HAR，保留 npm/OHPM 名称差异及多 HAR。
3. 用持久化 managed entries 判断归属，取消仅凭 mapping 键集的清理规则。
4. 首次同名相同值可接管，不同值沿用冲突保护；保留非受管依赖。
5. 确认卸载才清除旧项，扫描异常不能当作卸载。
6. 将最终文件交给既有 drift、替换、基线及回滚流程，不另建发布器。

测试：用户依赖、首次冲突、扫描失败不误删、卸载清理、文件和基线失败回滚；显式断言官方临时产物的 oh-package 引用路径已改写为真实项目相对路径（含 root 与 entry 两个前缀层级）。

## 6. 任务五：命令入口

主要文件：src/installer/installer.ts、adapt-package.ts、uninstaller.ts、src/commands/sync.ts、list.ts、src/env-checks/project-checks.ts；按需涉及 src/scanner/scan.ts。

- prebuild、sync、install、uninstall 共享现有同步入口。
- 安装未列入 COMPAT_TABLE 但有有效官方 metadata 的新包时，也尝试官方链接。
- 原生依赖独立识别，保留 alias、patch、codegen、跳过同步和强制覆盖职责。
- 未覆盖项明确提示，不输出误导性的全部注册成功信息。
- list 只列清单及提示，不执行链接；doctor/preflight 维持只读与相同归属规则。

测试：官方独有包安装、alias 包、适配项额外原生依赖、跳过同步、卸载及未覆盖提示。

## 7. 任务六：模板与文档

主要文件：content/docs/HARMONY.md、content/skills/expo-harmony-adapter/SKILL.md、实际 entry Hvigor 模板。

- 统一提示：不是所有 Expo / React Native 原生模块都已适配 HarmonyOS；请以 list 输出、生成项目的 docs/HARMONY.md 和 .agent/skills/expo-harmony-adapter/SKILL.md 为准。
- 检查是否需要关闭 Hvigor 对同一组受管文件的二次链接。
- 明确手动安装原生依赖后运行 sync；构建不会代替 CLI 更新注册。
- 不加入策略选择，也不把链接成功描述成运行时兼容保证。

## 8. 完成检查

1. 一次真实 fixture 验证官方协议和 pnpm 路径。
2. 官方、自研和未覆盖插件共存时不遗漏、不重复注册。
3. 官方整体不可用时复用 mapping 批量兜底，仍明确报告缺口。
4. 非受管依赖保留，失败时旧文件和基线一致。
5. 运行相关测试，再执行 pnpm type-check、pnpm test、pnpm build。
6. 具备 Harmony 环境时执行构建 smoke test，否则记录限制。

以上任务先补有意义的行为测试再实现；不主动提交代码。
