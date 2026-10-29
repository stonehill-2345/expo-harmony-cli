# M0 全量 workspace 结构类型关系设计

固定来源为 Expo `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，输入沿用配置继承批次的源码、233 份声明归档计划和两份配置归档。继续 M0-02/M0-03，不改变原接受单元及分母。

## 接口与范围

- `buildConsolidated`、`buildSourceContext`增加 `structuralTypeOperations=false`，传递给现有语义索引器。
- 来源上下文 CLI 增加成对参数 `--type-operations legacy|structural`，默认 legacy；非法值、重复及缺值在读取来源前拒绝。
- structural 保存条件分支、索引访问、keyof、声明约束/基础约束、别名参数与真实元组参数。沿用现有 symbolic generic、16 实例族上限、250000 总预算，所有截断及未实例化边界保留。
- 不把全量候选当作公共 API 数量；不因图内有边而宣称泛型替换或设备能力通过。

## 验收边界

原图 13942 导出、9312 推断、202 插件必须逐 ID 和来源保留；新增条目独立列出。原 49 条来源阻塞、项目配置和动态入口问题继续保留。新增结构模式必须通过源重建及变异拒绝，默认模式必须重建历史完整图。
