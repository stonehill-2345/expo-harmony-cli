# M0 高影响来源上下文合批设计

按用户要求继续合批，优先React Native、React声明、Node声明、Metro和必要传递类型，集中解决共同来源。不修改M0原范围、阶段分母、旧报告或接受记录；当前66%(4/6)。

固定Expo commit 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1、原始yarn.lock和manifest。核心候选为react-native0.81.5、@types/react19.1.10、@types/node22.14.0、@expo/metro54.2.0、csstype3.0.11、undici-types6.21.0及@react-native/virtualized-lists0.81.5，以固定锁实际identity为准；不请求latest，不执行安装或包脚本。下载前冻结selector/SRI/SHA1，归档逐字节验证，安全读取manifest和声明；单文件64MB、总展开512MB，拒绝穿越/链接/重复/混合根。@types归档允许实际node/react根但须核包身份。

建立只读虚拟外部声明上下文，保留实际归档文件和manifest不改名/不覆写。react请求到@types/react为显式声明投影，与React19.1.0运行身份分开；Node全局以固定index.d.ts为分析上下文，不声称每包真实tsconfig已验证。相对与裸包引用通过TypeScript解析器仅访问所核声明；归档内依赖选择必须受固定selector及声明范围约束，缺失或多版本歧义保留。typesVersions按实际TS5.9.3处理，不凭宿主包补齐。

扩展m0-consolidated的可选externalContext参数，默认输出保持字节等价；执行前保留其原代码副本及hash，旧产物仍用默认模式重建，历史证据不改写。新m0-source-context工具组合固定源和归档，重新生成全部类型/属性/推断/插件映射，保留每条解析来源、声明投影、外部诊断及前后对照。原图的EVALUATED不是完整项目编译结论，新图也不把工具成功当M0关闭。

先冻结用例/设计/执行卡/来源集合，fixture先红；实际归档与坏字节负例、源重复和多变异一次重建，最后一次完整工具/CLI/类型、历史及仓库/当前归属/阶段回归。增加源解析规模若触及预算须明确失败，不能静默截断。设计/执行卡和原始证据仅本机，不提交、不发布，不使用子代理。
