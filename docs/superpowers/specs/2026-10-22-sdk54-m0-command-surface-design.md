# M0 第八轮：CLI命令及参数声明索引

范围：固定Expo commit 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1的@expo/cli manifest、bin/*.ts、src非测试index.ts/resolveOptions.ts，以及utils/args.ts、resolveArgs.ts、variadic.ts。本地适配使用相同选择规则，两个来源分别保存，不执行源码。

TypeScript AST读取commands/defaultCmd/migrationMap/deprecated，分发项严格接受静态import(...).then(i=>i.export)形态；目标必须在索引范围且具有相应导出。add与install分别保留，共享handler另行关联。run分支、帮助和后续解析源码按位置保留，命令执行不作已验收。

读取arg/assertArgs/assertWithOptionsArgs的spec，支持内联对象和同词法作用域const引用，Boolean/String/Number、数组和别名。额外解析器的base/extra分层保存并关联别名；variadic允许列表和非布尔列表分开，不推断最终值类型。辅助函数参数化spec不计公开参数；命令内动态spec、展开属性和未知类型须报错，不以空记录代替。

别名目标缺失或循环保存为来源异常及后续动作，不修正固定来源、不删除别名；适配新增/删除/变更命令与参数逐项比较。差异仅证实声明变化，不是设备行为或支持承诺。

稳定ID采用来源路径、所属函数、解析器及调用序号、参数名分段编码；保存行列和原始文本。检查从固定对象和明确适配输入重建整个结果，元数据及范围标志也须匹配。

先冻结用例、fixture测试先红；多类真实CLI变异拒绝；运行工具/CLI/类型、历史清单和进度检查，归属另生成本轮清单，保留历史记录。M0仍50%（3/6），其他阶段不关闭。
