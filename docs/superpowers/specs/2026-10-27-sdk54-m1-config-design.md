# SDK54 Harmony M1 配置与插件设计

依据已授权总计划第5节实施，M1原五单元不拆分计分。沿用feat/V1.7.0现场，M0/M0A已由用户提交；本阶段不提交、不推送、不发布。

## 数据流

配置求值一次（getConfig的isModdedConfig模式）→注册插件及校验→模块发现→内存Harmony mods编译和配置快照→原生同步→Debug入口更新。getConfig不再skipPlugins，不重新读取app.json或通过Constants子进程再次执行动态配置。

使用原@expo/config-plugins的withMod、BaseMods.withGeneratedBaseMods和compileModsAsync，仅编译harmony平台；原型证实公开运行期接口足够时不增加fork包。类型扩展在expo/harmony-config受控表达，不伪装上游ModPlatform或ExpoConfig已经支持Harmony。CLI已采用的plugin-resolver用于精确解析身份与诊断。

## 公开接口及配置

expo/harmony-config提供HarmonyExpoConfig、HarmonyOptions、HarmonyConfigSnapshot类型及resolveHarmonyConfig、withHarmonyApp、withHarmonyModule、defineHarmonyPlugin函数；expo/harmony-config.schema.json公开Harmony字段schema，CLI复用现有@expo/schema-utils校验。运行期实现置于CLI，Expo根CJS入口转发已构建CLI，类型声明由Expo独立提供。

Harmony字段：name、bundleName、version、versionCode、icon、foregroundImage、splash（image/backgroundColor）、scheme、querySchemes、permissions（name/reason/usedScene）、orientation、userInterfaceStyle、extensions（app/module JSON）。显式CLI bundleName优先于harmony.bundleName，再按slug派生；Harmony字段优先于对应通用Expo字段，未覆盖字段沿用通用语义，默认版本1.0.0/versionCode1。禁止无效枚举、空身份、非法scheme、重复权限及未知Harmony字段；extensions为公开JSON扩展位置。

resolveHarmonyConfig(exp,{bundleName?})返回{expoConfig,harmony}；expoConfig是脱离mods/_internal/hooks和平台私有config的可序列化公开快照，harmony为规范化配置。应用身份、媒体、Constants来自此同一结果，不再次求值。

插件以标准expo.plugins模块请求注册。defineHarmonyPlugin声明函数支持Harmony；平台专属声明明确限制在ios/android的插件可以只注册而不编译其他平台mods，输出定位诊断。配置了本次Harmony功能但无实现的插件明确失败，不能静默成功。重复插件按解析后的实际文件身份拒绝，缺包/无效导出/抛错带请求来源。第三方使用withHarmonyApp/withHarmonyModule修改内存manifest，provider仅收集计划，不直接写工程；原生同步之前编译或校验失败不能执行clean删除。

## 消费边界

Autolinking的原生同步接收appConfig公开快照及nativeConfig（app/module JSON计划），媒体仅读取传入appConfig；Constants直接写同一appConfig。原生计划合并到生成工程，应用version、versionCode、scheme/querySchemes、权限、方向、主题均有具体字段映射。M2继续承担全量事务、并发、用户扩展归属及消费端HAR修补退出，M1不宣称这些已完成。

## 验收

先红后绿复现动态配置与插件绕过。测试真实app.config.js/ts和环境变量、无app.json、求值次数；检查身份、媒体hash和Constants字节同源。以独立第三方tgz消费真实发行候选，确认Harmony mods生效且Android/iOS回调不运行；缺包、无实现、重复别名、异步失败均不能开始生成。有效/无效TS、schema、运行期配置保持一致。每原单元独审后登记20%，未完成计0；默认内置插件的M4/M7义务不随底座通过而关闭。
