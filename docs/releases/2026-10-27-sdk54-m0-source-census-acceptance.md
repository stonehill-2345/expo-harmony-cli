# SDK54 M0 独立源码来源集合验收

本批实现固定 Git tree 的独立文件期望集、内容核验和共享用途补读。**M0 仍未关闭，完成 66%（4/6）**；M0-02/03 尚待按原接受单位验收。

## 逐步实现与结论

| 步骤 | 具体实现 | 验收证据 | 结论 |
| --- | --- | --- | --- |
| SC-01 | 直接从固定 tree、根 workspace 声明和模板 manifest 发现 owner；逐文件登记身份、最长 owner、路径角色及输入引用；全字段校验 | 正式12/12，独立探针16/16；19546项与141 workspace+5模板守恒 | PASS_WITH_BOUNDARIES |
| SC-02 | 固定索引、135个相关分片及来源核验；全部普通blob实读；补读与旧input分离；CLI与输出别名保护 | 正式9/9；真实生成、重复、check exit0且重复字节一致；三负例exit1并定位 | PASS |
| SC-03 | 补8指定未读文件；原9共享用途逐ID登记15事实；17剩余源码条件与后续支持义务分离 | 62固定来源、197嵌套引用核验；15负例拒绝；原9复合用途未假关闭 | PASS_WITH_BOUNDARIES |
| SC-04 | 独立tree/owner/输入/内容/共享事实审查，工具回归、逐步结论及封存工具 | 工具726/726；独立来源探针13/13；独立内容实读19538项；终验查看review-final.json和evidence-verification.json | PASS_WITH_BOUNDARIES，须最终封存复验 |

证据目录：`outputs/sdk54/ai-e2e/20261027-m0-source-census/`。每次真实CLI的精确命令、起止时间、退出码与工具hash记录在`cli-*.json`，诊断保存在同名log。最终是否封存成功以`evidence-verification.json`为准。

## 集合与内容边界

| 项目 | 实测数量 | 含义 |
| --- | ---: | --- |
| 固定tree项 | 19546 | 每项保留path、mode、type、OID |
| owner内文件 | 16939 | 141 workspace与5模板 |
| owner根外文件 | 2607 | 全部保留待审，不静默排除 |
| 普通文件实读 | 19538 | Git blob SHA1与SHA256核验；独立实读326762783字节 |
| 特殊项 | 8 | 7 symlink、1 gitlink，只保留tree身份 |
| 原固定Git分析输入 | 4629 | 原input身份与内容保持 |
| 原非Git上下文输入 | 12044 | 归档/编译器等上下文，不冒充tree文件 |
| 补充实读 | 14909 | 独立supplementalRefs；不提高旧input覆盖 |
| 规范语义待核检查格 | 2628 | 146 owner × 18类别，不是已证明缺失API数量 |

全部普通文件可读且hash一致，只证明来源集合和内容身份可核。路径角色仍是候选；owner到能力组仍是归属关联；两者都不证明完整公开语义或Harmony支持。

固定commit为`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree为`5457e824b21d968e55c8f533cdf1751860160a92`。正式索引SHA256为`42a1b8b584d042e29952f83a4f1b1c90fe49204a76cd41bfaa62f3658d3653e2`。旧公开面、能力图与semantic只读复用，不重建、不回写。

## 边缘情况与修改点

| 情况 | 修改或验收行为 |
| --- | --- |
| 嵌套workspace、负glob与正extglob | 最长owner优先；`!`排除与`!(...)`一致处理，保留红绿测试 |
| symlink/gitlink及根外文件 | 保留身份和待审状态，不当作普通内容实读 |
| 本地receipt与固定Git同路径但内容不同 | 强制匹配固定blob/hash，拒绝来源替换；先红后绿 |
| 未列入旧input的实际补读 | 只记supplementalRefs，不能冒充旧inputRefs；缺普通blob直接失败 |
| 输出直接或间接覆盖输入 | realpath与dev/ino保护索引、分片、receipt、parts目录与source目录及其别名 |
| 删除原生目录文件 | 删除`apps/bare-expo/android/.gitignore`并同步计数；真实check exit1定位原ID/path |
| 伪造特殊项实读 | 将`.prettierignore`伪标READ并改hash/计数；真实check exit1定位原ID/path |
| 丢失owner | 删除`apps/bare-expo` owner并同步计数；真实check exit1定位owner ID/root |
| M0调查与后续支持混写 | 17条件拆分两类义务，运行/设备/完整实现不增加M0来源调查门槛；先红后绿 |
| 汇总计数过期 | 从最终独立审查读取探针数，避免手工数字过期 |

整批直连TLS与代理整批HTTP408失败后，按200项固定OID补取；中途传输截断从缓存继续，最终19538/19538正常退出。官方归档备用下载失败，未导入或用其替代来源。失败日志保留，不计作通过。

## 剩余工作

1. 逐owner核对原规范公开成员、选项、事件、错误、权限、平台、原生接口、生命周期、资源及安装移除语义，并记录不适用依据与公开边界。
2. 完成9共享用途的17源码映射条件、具体能力范围及预分批最终裁决；普通认证、Debug、Metro、本地构建和资源仍必评。
3. 独立双向查漏并按原M0-02/03及A01/A02接受，满足后更新原进度。

不要求全部TS诊断归零、泛型无限展开、恢复历史安装现场或后续真机全部通过才允许M0退出。编译/运行/设备结论仍为NOT_VERIFIED/NOT_VERIFIED/NOT_RUN。

仓库文本门禁保留唯一旧失败：已封存的`docs/releases/sdk54-m0-export-patterns-summary.json`含本地绝对路径。新摘要使用相对路径；不修改旧封存，不提交代码。

```sh
node outputs/sdk54/ai-e2e/20261027-m0-source-census/finalize.mjs verify
node outputs/sdk54/ai-e2e/20261027-m0-source-census/run-cli.mjs check
```
