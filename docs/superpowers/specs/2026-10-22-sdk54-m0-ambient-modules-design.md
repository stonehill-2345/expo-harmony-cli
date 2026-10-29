# M0 声明模块来源索引设计

任务M0-02/03，原M0-A01/A02子集。固定Expo commit 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1和tree5457e824b21d968e55c8f533cdf1751860160a92，沿用146根/4088文件选择规则。原导出图7处external-star包含同包declare module来源，需要独立审阅，不能直接等同缺外部归档，也不能把声明当作运行包实现。

新增ambient-modules.mjs及契约测试。TypeScript5.9.3隔离Program按所属package构造分析上下文，只用固定输入、无默认库/宿主node_modules。枚举字符串module声明及来源/语法成员，通过checker展开同包ambient符号与重导出；类型、值、显式type-only、默认与export=分开记录。全局ambient、外部文件augmentation、wildcard、无body和嵌套不混用。跨包同名不会自动合并；相对/跨包来源未审阅、未解star、别名缺失、导出冲突与export=等均保留边界，循环通过有限集合传播收敛。

原7处external-star从固定语法摘要对应位置映射到声明目标，逐项列出来源声明、命名导出、边界和含义；仅声明拓扑完整时标EXPANDED_AMBIENT_DECLARATION，不声称类型属性全量、发行/运行或Harmony支持。本轮不改上一轮图/来源清单/接受hash，publicSurfaceComplete和stageClosable固定false，M0仍66%(4/6)。

先冻结用例/设计/执行卡hash，fixture先红再实现，重复源生成与真实CLI篡改负例。工具/CLI/类型、旧清单/基线及当前归属/仓库/阶段回归，报告逐用例结论并保存最终hash。docs/superpowers和outputs仅本机；不提交、不发布、不新增依赖。
