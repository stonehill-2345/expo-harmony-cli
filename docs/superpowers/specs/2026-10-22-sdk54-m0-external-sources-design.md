# M0 外部锁定来源与 MetroConfig 类型来源设计

任务M0-02/03、验收M0-A01/A02的来源/类型子集；M0仍66%（4/6），本轮不预设完整任务接受。

输入固定Expo commit 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1、tree 5457e824b21d968e55c8f533cdf1751860160a92。已实际取得原始yarn.lock（blob c56601d22fdc3860d92f63614bcc17aab46659fc）及bundledNativeModules（blob 823eabe7eafb2bb497682e04bf946275c9edd70f）。Git TLS下载失败日志保留，raw固定提交下载逐blob验证并写回仅本机Git对象缓存，不改变来源。

第一交付：用明确依赖@yarnpkg/lockfile1.1.0解析Yarn v1，从旧42外部种子与固定原始bundle/根和workspace manifests/锁文件建立逐项证据。精确selector匹配、仅版本兼容候选、多版本、不满足bundle的锁版本和无lock分别登记。React19.1.0/RN0.81.5与Harmony19.1.1/0.82.1/RNOH0.82.30分开；旧包在bundle存在但lock缺失不得猜废弃/重命名，未知范围保留待审。显式逐包职责/批次审阅是来源工作，不等于API或平台验收。校验从固定Git对象重建，删源/改版本/伪锁闭合拒绝。

第二交付：固定源码@expo/metro-config依赖@expo/metro~54.2.0，原锁精确解析54.2.0、SHA512及resolved URL。只下载该固定tgz，先核SRI与SHA1，再从安全相对归档条目读取package.json和发布的.d.ts；不执行包脚本、不依赖宿主安装内容。原声明链@expo/metro/metro-config的index.d.ts→index.flow.d.ts→types.d.ts逐源确认ConfigT/MetroConfig来源，结构化登记成员及类型引用、未展开的外部类型。通过独立虚拟Program或显式声明链核验原别名，不将类型名字找到当作所有属性语义完成。

实现新外部来源工具、归档类型来源工具及契约测试；不修改过去清单、报告和已接受工具。通用依赖只新增固定lockfile parser为根devDependency，semver复用CLI已声明依赖。先冻结用例/设计/计划hash，再契约先红，运行真实生成/双向校验/重复及CLI篡改负例。工具/CLI/类型、历史源索引/基线/接受hash、仓库和当前归属回归，报告明确未完成项。

证据目录outputs/sdk54/ai-e2e/20261022-m0-external-sources/。docs/superpowers及outputs仍仅本机；不提交、不发布、不改产品运行依赖。外部包、别名、属性和版本兼容仍需后续真实消费；本轮不关闭M0。
