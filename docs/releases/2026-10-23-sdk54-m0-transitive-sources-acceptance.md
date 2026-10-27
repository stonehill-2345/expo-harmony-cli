# M0 传递声明来源验收

M0 仍未关闭，完成 **66%（4/6）**。M0-01/04/05/06保持接受，M0-02/03未接受；本批步骤不增加阶段分子。未提交、推送或发布。

## 实现与实际结论

| 步骤 | 实现 | 实际验收结论 |
| --- | --- | --- |
| TS-01 | 从真实missing-exact观察、消费方原manifest和固定锁精确selector规划归档；原SHA512/SHA1、结构及不可变收据分别验 | PASS_WITH_BOUNDARIES：5轮调查，新增可加载归档依次68、14、9、2、0，共93个。最后仅datetimepicker原重复路径拒绝，当前策略达到固定点；未取得0，不推断兼容版本 |
| TS-02 | 默认关闭的API transitiveSourceProvenance及CLI --transitive-sources locked-v1；只允许归档消费方、无该name任何直接声明、所有合法锁身份唯一时投影 | PASS_WITH_BOUNDARIES：实际23个解析记录保留manifest/归档hash、完整锁链及未安装边界；独立审查发现P1开发短链遮蔽运行候选，先红测再修复为遍历前rootSections过滤，72/72独立回归通过 |
| TS-03 | 新目录合并93来源，真实全量重建上游与公开账本；比对旧候选身份和引用变化 | PASS_WITH_BOUNDARIES：146包、3959模块、629入口、13942导出、9312推断、202插件候选ID零丢失；159194类型、155211声明、71631实际引用；363条保留旧USE转source，其中208条原公开USE |
| TS-04 | 工具回归、来源重建、重复、来源/链变异、实际CLI拒绝及独立账本复核 | PASS：工具617/617、21类变异拒绝、独立账本复核通过；公开重复字节一致，上游及公开来源重建检查均通过；实际CLI删除传递来源记录exit=1；封存复核见evidence-verification.json |
| M0退出 | 按原6个单元复核 | BLOCKED：公开/发行范围、完整类型与来源边界尚未全部接受，维持66% |

## 引用变化与边界

| 原入口闭包实际观察 | 上批 | 本批 |
| --- | ---: | ---: |
| missing-exact-archive引用 | 257 | 47 |
| missing-declared-identity引用 | 46 | 6 |
| unresolved-declaration-entry引用 | 257 | 295 |
| missing-compatible-peer-source引用 | 10 | 10 |
| compiler-error-type节点 | 37 | 26 |
| declaration-instantiation-detail-budget节点 | 22480 | 22590 |

原routers missing-exact共261条USE，259条保留并转source；其中原公开210条，208条保留转source。另2条原公开TypeParameter声明不再被新语义图引用，其USE保留于上批账本，对应resolutionKey在新图为source；不能写成210条USE都在新图闭合。全部旧位置、原声明全文/切片hash及当前解析见transition-diagnosis.json和before-after.json。

补齐声明后，原38条公开connect使用由未声明转为已核运行包无声明入口；没有借用未证明的@types/connect。因此无声明入口计数上升，不以补档数量冒充类型完整性。数值型type ID分配及推断字段随重建变化，changed-*.json逐项保留差异；候选ID保留不等于所有字段语义相同。

最后一轮仍有712条规划边界关系：无精确锁371、未声明233、peer不兼容90、invalid peer范围14、原完整校验不足4；这些是全图规划关系，不与公开引用或独立API数量混算。5条missing-exact-transitive-source另保留原锁链缺档边界，当前规划器不因链文本直接取档。

## 边缘情况与修改点

- 实际@expo/metro只有顶层manifest，未捏造内嵌manifest或安装身份。锁链只建立声明来源，build/runtime保持NOT_VERIFIED，device保持NOT_RUN。
- 唯一性检查包含未取得归档的合法锁身份；多版本不能只从已加载档中选一个。直接依赖缺档、peer不兼容、dev根链不能借传递投影绕过。
- P1修复：在findDependencyProvenance入队前限制rootSections；默认仍沿用原section列表。永久回归覆盖短dev链遮蔽长运行链、另一身份归档缺失两类反例。反思约束：影响可达性的过滤必须先于路径去重。
- 真实直接dev spec允许作为来源调查补档，不接受安装/运行；无锁React开发selector、原SHA1-only、重复归档结构分别拒绝，不推断替代。
- 归档overlay逐文件SHA256冲突拒绝；收据离线重放不变。中间图原输出路径已另存semantic-round-*.json.gz及.parts，原获取输入hash通过input-snapshot中的preservedPath关联精确历史字节。
- 10月27日最终复核发现临时Git缓存的仓库元数据缺失，原对象包仍在；重新初始化该临时缓存后固定commit可读，无需重新下载或替换对象。首次失败日志另存cache-metadata-missing-verification.log，最终仍须逐blob/hash复验。
- 仍有14个BLOCKED入口、518个SOURCE_WITH_BOUNDARY入口；typeRoots原194条公开使用尚未隔离加载，13种子历史身份仍待裁决。当前补档策略固定点不表示M0来源闭包完整。

证据目录：`outputs/sdk54/ai-e2e/20261023-m0-transitive-sources/`。公开索引与同名.parts一起保留；最终上游为semantic-final.json.gz及.parts。逐步骤机器结果见acceptance-results.json，封存复核见evidence-verification.json。上一批证据保持原字节。
