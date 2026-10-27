# SDK54 M0 显式声明依赖合批验收

M0 仍未关闭，完成 **66%（4/6）**；M0-02/03 未接受。无提交或发布。本批不新增阶段接受单元。

固定 Expo `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree `5457e824b21d968e55c8f533cdf1751860160a92`。详细设计和执行卡见 `docs/superpowers/{specs,plans}/2026-10-23-sdk54-m0-declared-types*.md`。

| 步骤 | 实现及实际验收 | 结论 |
| --- | --- | --- |
| DT-01 | 361 条原 manifest 声明根、226 条锁依赖边；147 份新增归档全部 SHA512/SHA1、包身份和结构核验；204 个缺锁/完整性边界保留。跨计划同名同版本的 hash 冲突拒绝 | PASS |
| DT-02 | 207 条请求通过显式 @types 映射补来源；原生声明优先，运行身份与声明身份分开，保存 manifest 原字节 hash 和 NOT_VERIFIED。exports 封锁、未声明、错误版本、scoped/subpath、路径逃逸均有契约 | PASS |
| DT-03 | 全源 4390 输入、148975 类型；13942 导出、9312 推断、202 插件逐 ID 零丢失。固定源重建检查通过，10 类图篡改拒绝；4656 个类型分片逐份核验，不裁掉类型 | PASS |
| DT-04 | 工具 478/478；前批来源图重建一致；真实旧图写回 gzip 与原字节 SHA256 一致，JSON/gzip fixture 字节一致；catalog、仓库、阶段检查通过 | PASS |
| DT-05 | 输入、工具、382 归档（含原拒绝项及2配置）、编译器库、分片和证据独立封存核验；公开入口下界审计重复字节一致 | PASS |
| DT-06 | 完整公开面、隐式深导入/独立插件入口、真实公开字段类型及逐项范围仍需闭合 | BLOCKED |

## 来源与语义差异

- 原 1228 条未解析引用逐条对照，183 条得到来源、1045 条仍未解析；新展开声明又暴露25条，总未解析量 **1228→1070**，净减少158。不能把新增的全部1508条来源解析都认定为旧缺口修复。
- 4 个原导出的声明来源变化完整落表；5 个推断候选解除图内类型边界，插件状态保持140 EVALUATED/62 WITH_BOUNDARY，18个隔离推断保持。
- 直接类型边界36882（31796实例细节预算、3672 symbolic generic、926未实例化操作、233映射修饰、178错误类型、74其他泛型、2 any、1 unknown），模块边界2875。类型边界总量增加来自声明展开，不代表漏API数量或质量倒退已被排除。
- 原来源队列48条阻塞未由本批裁决；204个声明身份边界主要来自上游开发约束及传递依赖，不能当作已安装身份，也不能靠兼容版本猜测补绿。

## 已复现并修复的缺陷

1. 五份旧 DefinitelyTyped 归档根目录为 `name vmajor.minor`；只对固定 @types 包名及主次版本一致的根支持，重复路径/链接/逃逸仍拒绝。保存 `legacy-root-red.log`。
2. 声明回退可绕过 runtime exports 的 null/未列出入口；现用 TypeScript NodeNext 的导出表探测保留封锁。保存 `export-denial-red.log`。
3. 跨基础/新增归档计划只按 name/version 去重会隐藏字节冲突；现先比较 SHA512/SHA1。保存 `archive-conflict-red.log`。
4. 新图类型紧凑 JSON 约624MB，整体 stringify 触发 Node 单串上限；改为 SHA256 绑定的32记录类型分片，完整保留记录。保存原 `semantic-build.log`、体积诊断、分片红绿测试。规范索引为 `semantic-final.json.gz`，同名 `.parts/` 是必需组成，使用 `readSemanticArtifact` 读取。
5. 初版通用写入器漏了旧 slash escape；已补真实旧图字节回放与含路径/URL的JSON/gzip红绿测试。今后兼容验收同时检查语义和字节，避免只比较解析对象。

## 公开面验收口径

原M0要求公开能力清单完整，不要求无限展开整个上游类型系统。旧图是全部源码模块候选，其统一保守阻塞不能直接充当原阶段接受条件。保留旧图及全部边界，另提供 `public-entry-audit.json`：146份manifest匹配，机械入口投影得到259模块、2781导出、45305可达类型及8622直接边界。此集合尚缺隐式深导入、独立插件、bin及发行排除规则，只是下界，**不能据此关闭M0或将闭包外11063边界一律豁免**。

React的296条旧缺引用中285条来自25个外部发布者的devDependencies，11条来自模板消费者；下一步应绑定真实消费类型上下文，并对实际公开字段建立入口→导出→成员→源码/解析引用的覆盖账本，避免继续把发布者开发树扩张作为唯一关闭路径。本批未擅自替换React身份。

## 证据

目录：`outputs/sdk54/ai-e2e/20261023-m0-declared-types/`（本机保留，受既有忽略规则影响）。

主要文件：`archive-plan.json`、`download-results.json`、`semantic-final.json.gz`及`.parts/`、`semantic-source-rebuild.log`、`coverage-audit.json`、`remaining-work.json`、`mutation-results.json`、`public-entry-audit.{mjs,json}`、`legacy-byte-compatibility.log`、`acceptance-results.json`、`input-snapshot.json`、`evidence-index.json`、`evidence-verification.json`。

本批未执行原生mod、设备或完整CLI产品流程；声明来源投影不认定安装、平台兼容或运行通过。
