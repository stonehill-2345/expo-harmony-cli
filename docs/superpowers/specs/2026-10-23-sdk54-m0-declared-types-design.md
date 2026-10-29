# M0 显式声明依赖设计

任务：M0-02/03 的声明来源子集合，不新增阶段接受单元。

固定输入沿用 Expo 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1、前批 233 份归档计划及其源码来源投影。

新增显式 `--declared-types <目录>`：从固定 workspace 和已核验归档的原始 manifest 收集声明的 @types 依赖，按原 yarn.lock 精确 selector 规划，并递归跟踪锁内 dependencies/optionalDependencies。记录每条根来源 manifest 的原始字节 hash 和锁边；缺 selector、弱完整性、多身份冲突保持边界，不猜版本。

独立声明映射仅在显式模式开启。优先运行包自身声明；缺少入口时，仅使用消费方明确声明的对应 @types 包（含 scoped 到 scope__name 的标准映射）。保留运行包与声明包独立身份、原始 manifest hash、声明选择证据和 NOT_VERIFIED 运行结论。相对请求、路径逃逸、缺少声明、版本歧义不能借宿主依赖补齐。

旧模式和旧归档计划保持可重建。新增归档只从固定锁给出的 HTTPS registry URL 获取，核验 SHA512/SHA1、包身份及路径结构后加载。可解析引用数仅作差异证据，不等同 API 覆盖或阶段进度。

实际遇到五份 DefinitelyTyped 旧根目录 `name vmajor.minor`；仅在 @types 身份、包名及固定主次版本一致时支持，重复路径/链接/逃逸仍拒绝。审查补入运行包 exports 封锁探测，以及跨基础/新增计划同名同版本的 SHA512/SHA1 冲突拒绝。

全图诊断确认类型数组紧凑 JSON 624150752 字节，整体 JSON.stringify 超过 Node 字符串上限。显式声明模式改输出 `sdk54-semantic-shards-v1` 索引，类型记录每 32 条一份 gzip 分片，文件名及索引均绑定 SHA256；读取逐份核验路径/hash/记录数/首尾ID及总数后恢复原图。旧模式保留原单文件编码。整体比较改为分字段及逐记录比较，保留 JSON 中 undefined 字段省略语义，避免再次构造巨型字符串。此格式只改变存储，不减少任何类型或来源记录。

验收：DT-01 固定锁规划与递归；DT-02 显式声明映射及边界；DT-03 全源重建/候选保留/变异拒绝；DT-04 历史模式兼容和工具回归；DT-05 逐项结果及证据封存。
