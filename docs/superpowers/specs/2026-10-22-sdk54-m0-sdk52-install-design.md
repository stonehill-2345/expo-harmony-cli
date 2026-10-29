# M0 第十轮：SDK52安装与生成补验

只使用第九轮真实创建的两个SDK52 default输出，以及同一TGZ安装的CLI1.6.0。先核验原结果、候选、项目快照，再复制到新的独立目录；原项目和历史接受记录不改。

正常npm install --no-audit --no-fund或pnpm install --reporter=append-only，含postinstall，不绕过peer/脚本。每个安装上限600秒；共享本轮隔离缓存但项目及锁文件独立。日志用既有executeBaselineCommand流式保存并按本次进程组清理。失败不继续prebuild。

安装后校验expo/react/react-native/RNOH/CLI的实际包身份和隔离解析；真实prebuild --platform harmony后检查harmony/entry、AppScope/app.json5及build-profile.json5；再运行一次prebuild并比较原生文件hash，不能把退出0当生成成功。原模板bundle:harmony:release仅在前置满足时执行，检查非空新bundle和hash；仍不是HAP或设备成功。

工具和设备只读探测，不调用会清理已有转发规则的start:harmony脚本。没有本轮签名构建物与明确设备候选，原生运行保留NOT_RUN；后续独立验收。

先写fixture契约测试，再实现复制/身份/生成证据检查；真实结果允许FAIL/NOT_RUN但productAllPassed:false，不能关闭M0-04。集合/路径/hash/状态校验及真实CLI变异拒绝；当前归属另生成，历史清单不覆盖。
