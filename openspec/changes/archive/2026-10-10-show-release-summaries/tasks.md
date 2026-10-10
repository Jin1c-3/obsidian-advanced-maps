# Tasks

## 1. 双语版本摘要

- [x] 1.1 在 `src/releases.json` 为现有 CHANGELOG 各版整理中英文一句话摘要，并核对版本与主要变化一致。
- [x] 1.2 在 `src/releases.ts` 提供当前版本与旧版本摘要选择，并通过 `tests/releases.test.ts` 验证精确匹配、数字版本排序、预发行版本、缺失版本及语言选择。

## 2. 设置首页

- [x] 2.1 在 `src/settings.ts`、`src/i18n.ts` 和 `styles.css` 添加顶部版本摘要、默认折叠历史和完整日志链接，并通过设置测试验证首页位置、语言、缺失摘要回退及无历史入口。
- [x] 2.2 在两种语言的现有 `docs/guide/*/getting-started.md` 说明首页的更新摘要与历史入口，并通过文档链接检查确认指南仍完整。

## 3. 发布维护

- [x] 3.1 扩展 `.github/scripts/check-manifest.mjs` 检查当前版本双语摘要与重复版本，并验证正常记录通过、缺失摘要和重复记录失败。
- [x] 3.2 在 `CONTRIBUTING.md` 的发行流程写明更新 `src/releases.json`，并核对该路径和版本检查命令有效。

## 4. 集成验证

- [x] 4.1 运行 `npm run check`、`npm run test:coverage` 和 `npm run docs:build`，确认功能及既有清理的所有检查通过。
- [x] 4.2 在演示 vault 验证设置首页的摘要、展开历史和双语切换，并记录桌面与手机宽度的显示和操作结果。
