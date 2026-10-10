# Proposal

## Why

你打开 Advanced Maps 设置时，需要能直接看到当前版本带来了什么变化。把每次更新压缩成一句话，也能让你补看跳过的版本。

## What Changes

- 在设置首页最上方显示当前安装版本和对应的一句话更新摘要。
- 在同一信息块中提供默认折叠的历史，每个版本一行，并提供完整更新记录链接。
- 随安装包提供英文和简体中文摘要，跟随界面语言，不联网读取更新信息。
- 每次打开首页都显示摘要，不保存已读或关闭状态。
- 在版本检查中要求当前发行版本有完整双语摘要。
- 在两种语言的现有指南中说明更新记录的入口。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `maintainer-workflow`：增加设置首页更新摘要的展示契约和发行版本摘要完整性检查。

## Impact

涉及 `src/settings.ts`、`src/i18n.ts`、`styles.css`、新增静态版本摘要数据和选择逻辑、相关测试、`.github/scripts/check-manifest.mjs`、`CONTRIBUTING.md` 及两种语言的指南。使用现有公开声明式设置 API，不增加依赖，不修改存储的设置或版本号。上一轮尚未提交的代码清理不属于本变更的行为范围。
