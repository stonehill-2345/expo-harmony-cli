# Monorepo 目录迁移设计

## 已确认范围

仓库保持 expo-harmony-cli 名称和 Git 历史，现有 CLI 完整迁入 apps/cli。
按用户 HTML 规划预建 apps/example、A/B 组以及全部列出的按需扩展包目录。
空目录以 .gitkeep 跟踪，不创建虚假的模块实现或官方包发布声明。

## 目录与所有权

- 根目录：私有 package.json、pnpm-workspace.yaml、唯一锁文件、CI、仓库文档和 scripts。
- apps/cli：src、__tests__、templates、content、assets、tsconfig、vitest、发布清单与 CLI 使用文档。
- apps/cli/src：保留既有模块，补 config、build、devices 空目录；已有 prebuild 继续使用。
- apps/example：空目录，等待后续示例实现。
- packages：expo、expo-modules-core、expo-router、expo-constants、expo-linking、expo-splash-screen、expo-asset、babel-preset-expo、expo-modules-autolinking。
- packages/@expo：metro-runtime、config、config-plugins、prebuild-config、metro-config。
- packages 按需目录：expo-file-system、expo-font、expo-keep-awake、expo-status-bar、expo-image、expo-haptics、expo-web-browser。

## 工作区与发布

工作区匹配 apps/*、packages/*、packages/@expo/*。尚无 package.json 的预留目录不参与安装。
根包使用私有名称 expo-harmony-workspace，CLI 保留 expo-harmony-cli@1.4.0。
根脚本转发到 CLI，CLI 依赖声明与版本保持原样，锁文件仅调整 importer。
模板和物料与 CLI 一起移动，保持现有包内相对路径有效。
CLI README、CHANGELOG、NOTICE、LICENSE 和 guide 在 CLI 包内自包含，根目录保留仓库说明和法律文件。

## 验收

执行迁移前后现有测试、迁移后类型检查与构建；验证 tarball 内容和 CLI 帮助入口。
验证 frozen lockfile 安装、工作区识别、占位目录未被忽略、CLI 包不夹带未来模块目录。
不更改运行时能力、依赖版本或命令行为，不提交代码。
