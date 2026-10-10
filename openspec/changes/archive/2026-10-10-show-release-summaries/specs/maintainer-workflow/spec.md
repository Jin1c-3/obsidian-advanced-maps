## ADDED Requirements

### Requirement: Settings show release summaries

设置首页 SHALL 在主题入口之前显示当前安装版本及其一句话更新摘要，并提供完整更新记录链接。摘要 SHALL 随安装包提供，跟随界面语言，不通过网络获取。首页每次打开 SHALL 显示该信息，不读写已读状态；信息块 SHALL 不参与设置搜索。

#### Scenario: Reader opens the settings home

- **WHEN** 用户打开设置首页，安装版本有对应摘要
- **THEN** 最上方显示该版本及界面语言的一句话摘要，并保留现有指南入口和主题页

#### Scenario: Installed version has no summary

- **WHEN** 安装版本在摘要记录中不存在
- **THEN** 首页只显示该版本和完整更新记录入口，不用其他版本的摘要替代

#### Scenario: Settings are indexed or reopened

- **WHEN** 设置被搜索索引读取，或用户重新打开首页
- **THEN** 摘要不进入搜索结果，不写入任何设置或已读状态，重新打开首页仍可看到更新信息

### Requirement: Release history remains compact and version appropriate

设置首页 SHALL 提供默认折叠的历史更新列表，每个版本以一行双语本地化摘要呈现。历史 SHALL 按版本从新到旧排列，仅包含当前安装版本之前的记录，不重复当前摘要，也不显示更高版本。窄屏 SHALL 允许摘要换行，并保留可访问的展开入口。

#### Scenario: Reader expands previous releases

- **WHEN** 用户展开历史更新
- **THEN** 可以看到旧版本的版本号及一句话摘要，按版本倒序排列

#### Scenario: Reader runs an older version

- **WHEN** 摘要数据包含高于当前安装版本的记录
- **THEN** 该版本及后续版本的记录都不进入历史列表

#### Scenario: No previous release is recorded

- **WHEN** 当前版本之前没有摘要记录
- **THEN** 信息块不显示空的历史展开入口

#### Scenario: Reader opens settings on a narrow screen

- **WHEN** 设置首页在手机宽度显示
- **THEN** 版本、摘要、历史展开入口和完整记录链接均可读且可操作，不产生横向溢出

### Requirement: Release summaries are checked before publication

版本验证 SHALL 要求当前发行版本有非空的英文和简体中文一句话摘要，并拒绝重复版本记录。每次发行 SHALL 随对应的详细更新记录维护摘要，既有版本、标签和发行资产校验 SHALL 继续生效。

#### Scenario: Current release summary is missing or incomplete

- **WHEN** 当前版本缺少摘要记录，或其任一支持语言的摘要为空
- **THEN** 本地及发行流程的版本检查失败，并指出缺失的摘要

#### Scenario: A version is listed twice

- **WHEN** 摘要数据包含重复版本
- **THEN** 版本检查失败并指出重复版本

#### Scenario: Release summary is complete

- **WHEN** 当前版本有完整双语摘要，且版本元数据一致
- **THEN** 版本检查通过，安装包可在离线时显示该摘要
