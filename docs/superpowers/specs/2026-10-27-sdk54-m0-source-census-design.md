# M0 独立固定tree来源期望集设计

目标：直接从固定Git tree和根workspace声明建立独立文件期望集，对照现有公开面输入与能力账本；补读上一批明确缺失的8个共享blob，并逐9个未决用途记录新增事实。本批不声称路径枚举等于全量公开能力语义覆盖。

固定revision为5b42e3d21e0ac5e086752361ca8a5cb4de53bec1，tree为5457e824b21d968e55c8f533cdf1751860160a92。上一批public索引SHA256为76e245276c7fbbfd4b7607c033f5406475b35243196d947a1b9f47ba286b7d17；能力索引从其已封存evidence-index读取hash。本地选择性blob缓存不是完整源码可读性的证据。

方案：使用根package.json的workspace globs和固定tree里的manifest独立发现141 workspace和5模板，采用标准path.posix.matchesGlob，正负模式分别处理。不从现有146包列表反推期望根。保留所有tree条目，最长根匹配划分owner，根外文件明确保留待范围审查，symlink/gitlink不能当普通可读blob。发现重名、重复path、非法路径/模式、固定来源冲突直接拒绝。

输出单一确定性JSON（当前tree19546项，无需引入新分片格式），包含owners、files、categoryGaps与unmatchedInputs，原17表和六表均只读。文件ID由完整path派生；逐文件保留oid/mode/type、路径类别、原input来源引用与能力组ID；路径类别包括JS/TS/声明/原生/资源/平台配置/构建安装/测试文档/其他，可多类，分类依据仅为文件角色候选。按owner列规范类别语义待核，不将它们当作已发现公开API或缺失能力。

source类别与公开语义类别分开：函数/类/常量/组件属性/事件/回调/错误/权限/插件选项/平台判断/类型/原生接口/生命周期/资源/安装移除/Autolinking/Prebuild不能仅凭扩展名关闭。input差异表示未纳入现有分析输入，不证明API缺失。没有内容读取hash的文件标GIT_TREE_OID_ONLY，不能借tree hash标成READ_AND_HASH_VERIFIED。

纯接口：buildSourceCensus({source,treeEntries,manifests,coveredInputs,publicPackages,capabilities})；validateSourceCensus(actual,expected)->{valid,failures}；serializeSourceCensus(value)。manifests为[{path,blob,sha256,value}]，必须含根manifest与独立workspace候选manifest；coveredInputs为既有固定Git来源记录，不包含编译器/归档虚拟路径；source loader先验输入索引/分片/实际Git来源，再调用builder。builder只生成关系，不持有读盘副作用。

主线程新增m0-source-census-source.mjs负责loader/CLI，参数--source/--surface/--capability-map/--shared-followup（可选）与--output或--check。固定surface/hash/tree及capability封存hash必须匹配；真实缺文件/假覆盖/丢owner负例均定位原ID和path并非零，重复输出必须字节一致。新输出不能覆盖直接或间接输入及分片，至少校验realpath和dev/ino。保持默认旧命令与封存不变。

共享补充报告独立保存shared-use-followup.json，不回写旧review。使用原9个unresolved ID，补读8个固定tree blob并列出逐用途哪些断言已核、哪些尚缺；允许关闭“指定文件未读”子问题，不将9个复合用途因补读文件而全部关闭。普通认证/Debug/Metro/本地构建/资源仍必评，原五暂缓范围不扩大。

验收：纯契约红绿、独立枚举/分类/原ID审查、实际源生成/重复/check、三种真实合法变异、全工具一次回归、原封存hash不变、新证据封存可复验。M0仍按原4/6和原M0-02/03接受条款判断；不改阶段分母，不提升支持率。
