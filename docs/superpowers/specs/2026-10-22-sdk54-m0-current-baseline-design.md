# M0 第九轮：当前CLI真实现状回放

目标为M0-04的现状基线，不修复旧create、不把已有历史报告当本轮通过。

构建当前CLI后npm pack --ignore-scripts，保存tgz SHA256及构建日志。runner只接受实际tgz，创建新的独立工作目录，从tgz进行真实npm install --ignore-scripts。禁止以workspace源码链接替换安装物。

四个SDK54场景：blank-typescript/default × npm/pnpm；两个SDK52 default场景：npm/pnpm。每项真实调用已安装CLI create；有package.json才执行实际生产classifyHarmonyProject与doctor/scan。create成功后才继续prebuild。SDK52 native/device单列NOT_RUN，原生运行尚未建立，不关闭M0-04。

不更改产品发起的create-expo-app版本或模板tag，保留当前实际行为。记录隔离npm cache中实际create-expo-app/create-expo manifest及lock hash；成功或失败项目均保存package/app/managed-state/锁文件及顶层已装包身份。

独立工作目录先git init空仓库，使create工具跳过自动初始提交；全程不提交，结束确认HEAD仍不存在。该设置只抑制自动提交，不替换网络、模板、安装命令或源码。

子进程使用参数数组、流式日志、独占进程组；超时先TERM后KILL，仅清理自身组，保存退出/信号。逐步原子落盘结果，缺前置NOT_RUN。已有非空目录/结果拒绝，重试使用新目录保留原尝试。

先做fixture runner契约测试，再执行真实网络与创建。runner门禁检查预定义场景/步骤集合、候选/日志/快照hash和状态规则；允许真实FAIL/NOT_RUN保留为基线，但单独报告productAllPassed:false，不得宣称产品成功或关闭阶段。
