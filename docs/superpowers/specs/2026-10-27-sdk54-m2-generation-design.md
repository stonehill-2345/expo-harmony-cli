# SDK54 Harmony M2 工程生成设计

依据已授权总计划第6节；M1已由用户提交于422fd26。沿用feat/V1.7.0现场，不提交、不推送、不公开发布。M2原六单元等权，不按新增测试数量计分。

## 生成事务

所有native prepare/sync与CLI clean统一经过事务入口。项目根.expo-harmony-generation为固定事务目录，原子mkdir持锁；owner.json记录pid、进程启动标识和随机token。锁存活即拒绝并发；失活owner才能恢复旧事务。生成目标是同文件系统的stage/harmony，不直接写当前harmony。先构造、校验、合并用户内容，再写PREPARED日志；旧harmony rename到backup，stage rename到harmony，记录COMMITTED后清理。任何异常恢复backup；下一进程从日志确定恢复，不能按超时强占活锁。校验源目标路径和软链，拒绝事务目录或目标根软链。

成功普通生成保留用户文件与非受管JSON字段；无变化不替换当前工程。clean始终保留当前完整工程到用户可见.expo/harmony-backups/<token>/harmony，成功后才报告备份路径；失败旧工程完整恢复。clean重建模板、快照与声明式插件内容，备份中的手工扩展可恢复；项目harmony外不修改。

事务导出runHarmonyGenerationTransactionAsync<T>({projectRoot,clean?,prepareOnly?,generate(stageRoot):Promise<T>,validate?(stageRoot):Promise<void>,fault?(point):Promise<void>}):Promise<{value:T,harmonyRoot:string,backupPath?:string}>。故障点至少after-generate、after-validate、after-backup、after-install，用真实文件系统和子进程退出验收。值中输出路径由调用方映射为最终harmonyRoot。

## 归属与确定性

stage内.expo-harmony-state.json schemaVersion1记录相对路径、SHA256、owner，以及受管JSON上次生成值，不含时间戳和机器绝对路径。JSON5文件使用直接依赖json5解析，输出稳定JSON（JSON5合法子集），保证非受管字段/数组项语义保留；不承诺保留注释排版。

每次从完整模板生成期望树，再与旧工程和上次归属做三方合并。文件只在有归属且旧内容未被用户修改时更新/删除；用户修改与新生成冲突应在提交前失败。JSON对象字段递归合并，命名数组按name键、skills等无name数组按稳定内容键归属；移除本次不再声明的旧受管项，保留额外用户项及仍由其他来源声明的共享项。首次从无归属的M1工程迁移必须完整备份且保守保留无法证明归属的用户内容，不凭目录名前缀批量删除。

有效模块列表按packageName稳定排序，来自既有传递依赖图；同一OHPM名的冲突明确失败。生成源码内所有路径相对stage计算，禁止记录stage绝对路径。将模块副本、HAR、注册、资源和清单作为同一事务提交，失去最后有效引用才清理受管产物。

## 发行端兼容

RNOH/Screens/Worklets兼容转换只发生在候选发行staging，保留工具、输入输出hash及兼容ID。消费端校验已发行兼容产物并复制，禁止启动Python或修改node_modules。Core发行包携带已验证RNOH兼容HAR及manifest；外部Screens/Worklets兼容HAR由发行流程预生成，消费端transform元数据仅用于定位和验证，缺产物明确失败。现有来源包、版本锁与正式发布边界保持既定集合；遇到不在发行集合的Worklets必须形成可追溯可分发兼容产物，不能在消费端偷偷回退转换。

## 验收

M2-A01：连续相同输入生成树/状态无差异；变更/删除版本、图标、scheme、权限和插件字段生效。
M2-A02：生成资源、JSON5、链接和commit各故障点旧树完整保留；发生退出后下一次可恢复。
M2-A03：两个真实进程竞争只能一者持锁；遗留stage/backup确定性恢复，活锁不强占。
M2-A04：用户文件和非受管JSON普通生成保留；clean声明备份并可字节恢复，目录外不变。
M2-A05：直接依赖移除而传递引用保留时模块仍链接，最后引用移除才清理，用户资源和共享权限保留。
M2-A06：仓库外候选安装/prebuild前后依赖源码/HAR全树hash不变，Python不可执行仍成功；真实hvigor构建。

退出产物：归属文档、红绿测试/故障注入报告、生成差异、兼容发行hash、扩展恢复范例、独审报告和原六单元进度。未满足整个单元只记OPEN。
