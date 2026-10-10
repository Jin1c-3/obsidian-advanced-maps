# Design

## Context

动机见 `proposal.md`。设置首页由 `AdvancedMapsSettingTab.getSettingDefinitions()` 声明，顶部 `aboutItem()` 已使用公开 `render(setting)` 绘制非搜索信息行。现有 `CHANGELOG.md` 保存每版详细说明，发行脚本从中取正文，但没有稳定的双语一句话字段。发行资产只包含 bundle、manifest 和样式。

## Goals / Non-Goals

**Goals:**

- 用现有声明式设置入口提供离线可读的版本摘要。
- 用同一份数据服务界面和发行检查，避免两处文案漂移。
- 在桌面和手机宽度中保持紧凑、可访问的布局。

**Non-Goals:**

- 不新增更新检测、升级弹窗、已读状态或远程请求。
- 不改变现有设置键、保存路径和主题页结构。
- 不发布新版本；本次功能先以当前仓库版本验证。

## Decisions

### 静态双语数据与详细日志分别维护

采用 `src/releases.json` 保存 `{ version, en, zh }` 条目，`src/releases.ts` 提供类型和当前版本/历史选择。JSON 可直接由 Node 版本检查读取，也可由 esbuild 打包；若 TypeScript 尚未允许 JSON 导入，开启 `resolveJsonModule`。页面标签仍使用现有 `i18n.ts`，摘要通过现有 locale 选择语言。首批摘要从现有 CHANGELOG 中按版本整理，每版概括用户可见的主要变化；同版的多个修复合为一句，不沿用提交标题。完整 CHANGELOG 继续作为发行正文来源。

运行时截取 changelog 首句会遗漏同版重点，也不能提供中文。联网获取发行说明会让设置依赖网络并可能展示尚未安装的功能，因此不采用。

### 当前版本精确匹配，历史按版本过滤

当前摘要按 `plugin.manifest.version` 精确选择。使用有限的 semver 比较规则处理仓库现有版本和预发行版本，按版本倒序返回严格早于安装版本的条目。当前记录缺失时仍显示版本和完整日志链接，不借用列表首项。测试覆盖版本排序、未来记录、缺失版本和语言选择。

### 原生 render 信息行与 details 折叠历史

新增 `releaseItem()` 放在 `aboutItem()` 之前，设置 `name: ''` 和 `searchable: false`。以主题变量绘制轻量卡片，标题显示版本，正文显示一句摘要；原生 `details/summary` 提供键盘和触摸展开历史。没有历史时不绘制空的 details。完整记录链接指向 `REPO_URL` 下的 CHANGELOG。DOM 用文本 API 写摘要，不把文案作为 HTML 解释。

相比新模态框或专题页，折叠历史让用户无需离开当前设置首页；不存展开和已读状态，避免索引调用产生写入。

### 发布检查使用同一数据

扩展 `.github/scripts/check-manifest.mjs`，读取摘要 JSON 并检查重复版本、当前版本双语非空。现有本地 check、CI、release 都调用此脚本，无需重复添加检查步骤。`CONTRIBUTING.md` 发版流程说明先补双语摘要，再执行现有版本命令和校验。两种语言的现有指南补充首页更新入口说明，不新增指南页面。

## Risks / Trade-offs

- [摘要漏写或与版本错配] → 版本检查阻止缺少当前版本双语记录的发行；数据选择按精确版本匹配。
- [历史列表过长] → 默认折叠，一版一句，首页只显示当前摘要。
- [一句话丢失细节] → 保留完整日志链接，限制和详细修复继续放在 CHANGELOG。
- [窄屏溢出] → 使用主题尺寸、自然换行和局部布局；在演示 vault 的桌面和手机宽度验证。

## Migration Plan

无需设置迁移。随正常安装包交付；撤销本次摘要模块、信息行及对应检查即可回退。上一轮代码清理继续保留，不属于此功能的迁移范围。
