# M0 声明消费与继承配置来源投影

固定 Expo revision 沿用原来源，处理 M0-02/03；不改变原接受条件。旧 exact 模式保持兼容，新增显式 source-provenance 模式。

1. 已发布外部声明优先消费 dependencies/optionalDependencies/peerDependencies，存在这些声明时不使用发布者自身 devDependencies 选择消费者的类型；仅 dev 声明仍按现有精确身份分析。
2. 直接依赖及 optional 有精确锁时必须使用该身份，归档缺失不能由兼容或更高版本代替。只有 peer-only 请求可在已核验归档中选择唯一满足所有有效 peer 范围的候选；多个候选、无候选、非semver一律保留边界。该结果为来源投影，增加 contextBoundary、候选版本及原manifest字段，不认定安装身份。
3. 外部配置仅在声明者没有直接声明该配置包时，允许通过固定manifest/lock依赖图选择唯一身份；所有可达身份先去重再对照可用归档，存在另一个缺失版本也不能择一。保留完整消费链、输入hash及安装未验收标记。配置包本身的嵌套继承适用同一规则。
4. CLI `--context-selection exact|source-provenance`接入全图；项目来源审计提供显式同义开关。默认命令不得改变历史产物。新图继续保留结构类型及有限预算。

边界：peer来源可用不代表平台支持；无依赖声明不借宿主包。Router Modal源码不存在、App由消费工程提供、模板未实例化等事实保持。安全归档结构规则保持。
