# M0 最终来源与清单接受设计

承接原2026-10-21平台覆盖规范与architecture-completion计划、consumer-sources/m0-exit-audit，用户授权继续完成M0。只在原范围内执行剩余接受条件，不增加暂缓、不把M0清单接受当Harmony支持。

固定commit/tree、旧public/capability/source-census索引及原ID只读。19538普通blob已缓存。原2628类别检查格仅是待审提示，最终判断依据具体来源语义与公开影响，不能要求所有诊断或泛型实例清零。

## 三条并行工作

1. 共享用途：逐原9用途/17条件查完整源文件集合、公开成员/资源/依赖/生命周期，按用途裁决scope与M7批次。固定树确实缺入口/生成器时提供完整负证据、产品缺陷和后续任务；M0调查可接受真实失败，不能虚构源码或交付状态。
2. 语义来源：JS/TS使用TypeScript/Babel AST，原生使用成熟tree-sitter/ast-grep语法；XML/plist/JSON用结构化解析器。记录每个有限声明、调用规则、参数、资源引用、错误/条件分支及精确范围。动态表达式保存有限源码规则，解析失败/无法归属的真实公开能力保留阻断，不能以路径或关键字命中认定语义完整。
3. 公开影响与裁决：独立复核真实public根可达关系、插件候选公开性、4缺来源export、26错误类型与预算影响。派生类型通过声明/用途/构造规则追源，不要求每个内部分析节点独立发包。所有真实公开成员、插件选项与非TS能力关联稳定capability、scope、dependencies和最终milestone。

## 接口与所有权

- native worker：`scripts/sdk54/m0-native-semantics.mjs`及对应测试；`analyzeNativeSource({path,content})`返回language/parser/facts/boundaries/coverage。fact含kind/name/line/endLine/details；boundaries不能隐去。
- shared worker：本批证据目录的`shared-*`，闭合条件保留原useId和条件序号、原条件hash、逐来源锚点、有限成员集合和范围/批次；不写旧文件。
- 主线程：`m0-source-semantics.mjs`及测试、source loader/CLI/总集成、依赖声明、报告与封存；不与native worker重叠。
- reviewer：只写新目录`review-*`，独立来源与公开影响集合，检查最终接受依据；不将主线程真实CLI或全回归写成自己执行。

## 接受门槛

原M0-02/03、A01/A02与MAP-01～12逐条记录结果。真实生成/重复/check、删公开深层成员/原生能力/插件选项、改scope、悬空依赖、缺来源均需非零并定位。实现和来源实读具备先红后绿与独立审查。M0进度只有在全部原接受单位满足后才可更新，不能因补了更多文件或工具就提升。

先完成具体证据与可审查结果；最终剩余集合非空则真实保持未关闭并继续修复。历史封存是历史快照，不能回写以追求全绿；旧仓库摘要绝对路径失败单独保留。
