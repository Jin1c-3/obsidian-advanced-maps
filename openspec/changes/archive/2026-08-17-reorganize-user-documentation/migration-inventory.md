# User documentation migration inventory

This inventory records where every section and supporting detail in the two root READMEs moves. A root entry means the concise landing page retains the content; a guide entry names the canonical long-form destination. Contributor-only material points to the repository document that already owns it.

## English README

| Current heading                                               | Destination                            | Notes                                                                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `# Advanced Maps`                                             | Root `README.md`                       | Badges, language switch, product promise, native-view boundary, hero and caption                                                                                         |
| `The three big workflows`                                     | Root `README.md`; guide index          | Three-workflow table and composability; secondary `map-view.png` moves to the guide index                                                                                |
| `Requirements and install`                                    | Root `README.md`; `getting-started.md` | Minimum Obsidian version, Bases/Maps requirements, graceful stand-down, Release and BRAT                                                                                 |
| `Choose the Base recipe you want`                             | `getting-started.md`                   | Base filter boundary, direct photo results, complete-file explanation                                                                                                    |
| `Map every photo in a folder, together with place notes`      | Root `README.md`; `getting-started.md` | Minimal atlas recipe remains at root; full explanation, image extensions, view keys, no-GPS behavior move to guide                                                       |
| `Put a OneDrive or other external album inside the vault`     | `photo-maps.md`                        | macOS/Linux and PowerShell examples, reload/filter step, desktop/mobile/backup warnings, bounded read and persistent metadata index                                      |
| `Map only the photos linked from matched notes`               | `photo-maps.md`                        | Notes-only Base, note links, embed/frontmatter semantics, de-duplication, `photo-map.jpg`                                                                                |
| `Show a route on one map without creating another inline map` | `tracks-and-areas.md`                  | Markdown/frontmatter/embed examples and behavior table                                                                                                                   |
| `Show only the notes and routes around the current note`      | `around-and-navigation.md`             | Settings/command flow, retained relationship set, trip-note example, Base intersection and view-rename warning, `around-map.png`                                         |
| `What photo maps do`                                          | `photo-maps.md`                        | Photo datum override, dot/thumbnail controls, thinning, hover/click/Ctrl-click, set-coordinate and clear-index commands, two screenshots                                 |
| `What route maps do`                                          | `tracks-and-areas.md`                  | Track formats and ownership colour, markers, polygon semantics and click priority, inline statistics thresholds, profile interaction, host-note photos, four screenshots |
| `Reuse one Base everywhere`                                   | `around-and-navigation.md`             | Shared Base settings and responsibility table                                                                                                                            |
| `Open in map`                                                 | `around-and-navigation.md`             | Coordinate-property menu item, tab versus pop-up persistence, screenshot                                                                                                 |
| `Follow the active note`                                      | `around-and-navigation.md`             | Follow control, retained zoom/query, screenshot                                                                                                                          |
| `Pins at the same coordinate`                                 | `around-and-navigation.md`             | Zoom-dependent fan, no vault/copy mutation, setting name                                                                                                                 |
| `Coordinate systems`                                          | `coordinates-and-services.md`          | WGS-84 storage, automatic/forced map-boundary conversions, screenshot                                                                                                    |
| `Open a spot in another map app`                              | `coordinates-and-services.md`          | Built-in providers, ordering, custom templates, app schemes, explicit datum warning, screenshot                                                                          |
| `Fill coordinates without typing them`                        | `coordinates-and-services.md`          | Map-link formats, search providers, reverse geocoding, desktop/mobile location and template skip, two screenshots                                                        |
| `What leaves your vault`                                      | `reference-and-privacy.md`             | No telemetry/server claim, five-row disclosure table, secret storage trade-off                                                                                           |
| `Attribution`                                                 | `reference-and-privacy.md`             | Basemap/service attribution, screenshot provenance/privacy, map-data rights and issue link                                                                               |
| `Development`                                                 | Root `README.md`; `CONTRIBUTING.md`    | Root keeps maintainer links; setup commands and translation ownership already live in `CONTRIBUTING.md`                                                                  |
| `Licence`                                                     | Root `README.md`                       | MIT link                                                                                                                                                                 |

## Simplified Chinese README

| Current heading                               | Destination                                        | Notes                                                                                     |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `# Advanced Maps`                             | Root `README.zh-CN.md`                             | 徽章、语言切换、产品定位、原生视图边界、主图与说明                                        |
| `三个核心用法`                                | Root `README.zh-CN.md`; Chinese guide index        | 三种用法表、组合说明；`map-view.png` 移至指南首页                                         |
| `环境要求与安装`                              | Root `README.zh-CN.md`; `getting-started.zh-CN.md` | 最低 Obsidian 版本、Bases/Maps 要求、缺失时退场、Release 与 BRAT                          |
| `选择你需要的 Base 配方`                      | `getting-started.zh-CN.md`                         | Base 筛选边界、照片直接结果、完整文件说明                                                 |
| `渲染整个照片目录，并与地点笔记同图显示`      | Root `README.zh-CN.md`; `getting-started.zh-CN.md` | 根页面保留最小配方；完整说明、照片扩展名、视图键、无 GPS 行为移入指南                     |
| `把 OneDrive 等库外相册接进 Obsidian`         | `photo-maps.zh-CN.md`                              | macOS/Linux 与 PowerShell 示例、重新加载/筛选步骤、桌面/移动/备份警告、限制读取与持久索引 |
| `只渲染命中笔记所链接的照片`                  | `photo-maps.zh-CN.md`                              | 仅笔记 Base、链接/嵌入/属性语义、去重、`photo-map.jpg`                                    |
| `只保留一张地图，不让 GPX 再生成一张内联地图` | `tracks-and-areas.zh-CN.md`                        | Markdown/属性/嵌入示例与行为表                                                            |
| `只显示本篇相关笔记的位置与路线`              | `around-and-navigation.zh-CN.md`                   | 设置/命令流程、关系集合、游记示例、Base 交集与视图改名警告、`around-map.png`              |
| `照片地图会做什么`                            | `photo-maps.zh-CN.md`                              | 照片坐标系、圆点/缩略图控制、稀疏显示、悬停/点击、照片填坐标与清索引、两张图              |
| `轨迹地图会做什么`                            | `tracks-and-areas.zh-CN.md`                        | 轨迹格式/颜色、标记、面及点击优先级、内联统计阈值、剖面联动、宿主照片、四张图             |
| `一个 Base，处处复用`                         | `around-and-navigation.zh-CN.md`                   | 复用设置与职责表                                                                          |
| `在地图中打开`                                | `around-and-navigation.zh-CN.md`                   | 坐标属性菜单、标签页与弹窗持久性、截图                                                    |
| `跟随当前笔记`                                | `around-and-navigation.zh-CN.md`                   | 跟随控件、缩放/查询保持、截图                                                             |
| `位置重合的图钉`                              | `around-and-navigation.zh-CN.md`                   | 随缩放散开、不修改库/复制值、设置名                                                       |
| `坐标系`                                      | `coordinates-and-services.zh-CN.md`                | WGS-84 存储、自动/强制地图边界换算、截图                                                  |
| `在其他地图应用里打开`                        | `coordinates-and-services.zh-CN.md`                | 内置服务、排序、自定义模板、App 协议、明写坐标系警告、截图                                |
| `不用手打坐标`                                | `coordinates-and-services.zh-CN.md`                | 地图链接格式、搜索服务、反向解析、桌面/移动定位和模板跳过、两张截图                       |
| `什么会离开你的库`                            | `reference-and-privacy.zh-CN.md`                   | 无遥测/服务器、五行披露表、secret storage 权衡                                            |
| `版权与致谢`                                  | `reference-and-privacy.zh-CN.md`                   | 底图/服务署名、截图来源与隐私、地图数据权利和 issue 链接                                  |
| `开发`                                        | Root `README.zh-CN.md`; `CONTRIBUTING.md`          | 根页面保留维护者入口；安装命令和翻译约束由 `CONTRIBUTING.md` 持有                         |
| `许可`                                        | Root `README.zh-CN.md`                             | MIT 链接                                                                                  |

## Cross-cutting content audit

| Content class                   | Accounted for                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete examples               | Atlas Base, notes-only Base, linked photos, route/body/frontmatter/embed variants, Around trip note, OneDrive symlink/junction, external-map URL templates                                                                      |
| Warnings and boundaries         | Native Maps absence, photos without GPS, desktop-only directory links, backup/sync behavior, view rename, Base/Around intersection, datum mismatch, missing statistics data, no runtime mutation of notes/photos                |
| Named options and commands      | `trackWeight`, `trackOpacity`, `fitMaxZoom`, `coordSystem`; photo visibility/thumbnails/datum/index; track markers; Base path/view name/open mode; follow; pin fan; map-link/search/reverse/location commands and template skip |
| Supported inputs                | JPG, JPEG, PNG, WebP, HEIC, HEIF, AVIF; GPX, GeoJSON, KML, TCX; normal links, embeds and frontmatter links                                                                                                                      |
| Network and privacy disclosures | Tiles, search, reverse geocoding, external maps, device location, telemetry/server absence, secret storage, screenshot provenance                                                                                               |
| Screenshots                     | `photo-album.png` root hero; `map-view.png` guide index; photo assets on photo page; track/area/embed assets on track page; Around/open/follow assets on navigation page; datum/external/link/search assets on coordinate page  |
| Maintainer links                | `CONTRIBUTING.md`, `openspec/specs`, `ROADMAP.md`, `CHANGELOG.md`, `LICENSE`, Releases and Issues                                                                                                                               |
