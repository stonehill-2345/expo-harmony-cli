# SDK54 Harmony M3 通用模块与作者契约

依据已授权总计划第7节。基线7852015，M2关闭；沿用当前非main工作分支与已冻结本机发行来源。不提交、不推送、不公开发布。元数据发现、生成预检与Core作者范例各有明确所有权，通过真实候选消费与独审再登记原五单元。

## 元数据与身份

Expo配置中显式支持Harmony时优先，且无效配置必须报错，不能回退覆盖错误；Expo只声明其他平台时允许使用该包的RNOH Harmony声明。RNOH显式autolinking=false为停用；true或合法对象为启用，非法类型、缺HAR、缺映射目标、重名HAR与未知固定导航版本均明确失败。没有Harmony声明且不属于已知导航家族的普通JS包继续忽略。合法显式声明优先于固定版本兼容表，不以包名硬编码扩展新测试模块。

发现保留安装逻辑名、实际package.json身份与版本、真实根；ModuleDescriptor保持现有packageName为安装逻辑名以兼容Core查询，并增加可选实际身份字段。同一原生包多个真实版本/路径须写入前拒绝，错误包含双方根、版本及冲突字段。不得改变Android/iOS的发现语义。

HAR多文件的顺序与primary必须确定；ohPackageName数组逐项精确匹配，遗漏映射允许按现有默认名补全，但重复basename或悬空/重复映射不可静默消失。路径约束现有真实包根（允许pnpm包根链接），禁止路径/软链逃逸。保留既有RNOH多HAR推导兼容性。

消费裁决：固定上游RNOH0.82.30实际发布`harmony.autolinking: null`作为宿主包停用标识，null与false均显式停用，不回退兼容表；其他非法类型继续拒绝。本轮首个候选真实npm/pnpm安装成功而prebuild因此失败，保留consumers/m1-regression原失败。补固定身份null复现测试后修复，不编辑安装依赖。今后将当前发行组合的实际元数据纳入回归，不能仅凭新造fixture定义合法值。

## 预检与写入

query/resolve及native预检在事务写入前拒绝Package/CMake target/header注册别名、ETS import/class、本地生命周期名、storage key、overlay类名冲突；诊断双方来源。共享同一ETS符号同一来源允许复用，不同来源同名拒绝。非法标识符和插入生成代码的换行/引号应在预检拒绝，不依赖编译器发现。HAR本身不按文本解析，预制HAR内部符号以声明契约与真实构建验收。

所有新增行为继承M2事务，错误不修改上次可用工程。移除后从有效图重建，第三方包不进入release中央清单；同包传递引用保留，最终引用消失才删除。卸载但仍配置的插件继续由真实config-plugins解析失败。

## Core与第三方作者面

沿用现有C++ RuntimeState、startAsync、NativeAsyncError、SharedObject/Ref及ViewBinding公共实现，不另造Promise运行时/DSL。明确JS线程、工作线程数据捕获、UI调度、取消、runtime销毁、view卸载及事件退订契约。新独立测试包置于Core example之外的独立fixture目录，npm pack产生tgz，通过自带expo-module.config.json和插件接入，C++/ETS/CMake自包含，禁止将逻辑塞入CLI/EntryAbility或中央包列表。

独立包需有同步值/异常、异步resolve/reject、事件订阅退订、真实view及延迟异步/卸载/reload探针。复用现有Core公共API和已验证的原生组件模式；设备checker严格检查所需结果、失败、缺失及旧runtime回调。只写范例或模拟输出不计设备通过。

## 验收与边界

M3-A01双PM真实tgz安装、query/prebuild/调用；A02冲突双方来源及旧树不变；A03卸载/移除插件/重装完整树和注册核对；A04悬空插件/未知导航/缺原生文件定位报错；A05异步未完成reload/view卸载/事件退订的自动化与设备证据分别保存。

2026-10-28预检hdc list targets为[Empty]，设备项BLOCKED，继续全部不依赖设备的实现与真实消费。无设备时不登记依赖设备的原单元或closure；不改M2冻结候选及验收hash。新增候选独立目录outputs/sdk54/ai-e2e/20261028-m3-author-contract。若本机宿主权限阻断构建/安装，保留原失败后按实际需要提升重试。
