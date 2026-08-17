# Advanced Maps

[![CI](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml/badge.svg)](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml)
[![许可证：MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · **简体中文** · [用户指南](docs/guide/README.zh-CN.md)

把 Obsidian 原生 **Maps** 视图变成地图相册、轨迹浏览器，以及当前笔记的关联笔记地图。

Advanced Maps 可以从整个照片目录读取 GPS，绘制 GPX、GeoJSON、KML、TCX 轨迹与区
域，并从普通 Obsidian 链接创建**周围**视图。它扩展第一方 Maps，而不是替换它：
MapLibre、底图、图钉、气泡和所有内置地图选项仍然原生提供。不使用 Leaflet，不附带渲
染器，也没有运行时依赖。

![同一个 Base 同时包含照片目录和笔记目录：16,273 条结果——笔记显示为红色图钉，照片按 EXIF 位置显示缩略图，中间是一条步行 GPX 轨迹，当前缩放放不下缩略图的照片仍保留圆点](docs/photo-album.png)

_一个 Base，一张地图：红色图钉是地点笔记，缩略图按照片自己的 EXIF 落点，线是某篇笔记
链接的 `.gpx`，共 16,273 条结果。_

## 三个核心用法

| 把 Advanced Maps 当作…… | Base 里筛选什么                                                | 地图上出现什么                                         |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| **地图相册**            | 一个照片目录，也可以是指向外部相册的目录链接                   | 每张带可读 GPS 的照片，按 EXIF 位置显示                |
| **轨迹浏览器**          | 链接了 `.gpx`、`.geojson`、`.kml` 或 `.tcx` 的笔记，或文件本身 | 轨迹、区域、标记、照片、高程，以及能让 Base 排序的统计 |
| **周围地图**            | 平时使用的地点笔记集合                                         | 本篇、它的链接与反向链接，以及这些笔记的轨迹和照片     |

三者可以叠加：同一张地图同时显示地点笔记、多日轨迹和沿途所有定位照片。

## 环境要求与安装

需要 Obsidian 1.13.1 或更高版本，并启用 **Bases** 和第一方 **Maps** 插件。没有这个原生
视图时，Advanced Maps 会说明或跳过不可用的增强，让 Obsidian 保持可用。

- **Release：**从 [Releases](https://github.com/Jin1c-3/obsidian-advanced-maps/releases)
  下载 `main.js`、`manifest.json` 和 `styles.css`，放进
  `<库>/.obsidian/plugins/advanced-maps/`，然后启用插件。
- **BRAT：**添加 `Jin1c-3/obsidian-advanced-maps`。

## 快速开始

把下面内容保存为 `地图相册.base`，替换目录路径，打开文件并切换到地图视图：

```yaml
filters:
  or:
    - file.inFolder("places")
    - file.inFolder("assets/onedrive/Pictures")
views:
  - type: map
    name: 地图相册
    coordinates: coords
    trackWeight: 4
    trackOpacity: 85
    fitMaxZoom: 16
```

第一个分支显示 `coords` 属性中带坐标的笔记，第二个分支直接按 GPS 元数据显示支持的照
片。Base 边界、视图键、照片格式和后续配方见[快速开始指南](docs/guide/getting-started.zh-CN.md)。

## 用户指南

| 主题                                                           | 内容                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| [快速开始](docs/guide/getting-started.zh-CN.md)                | 安装、Base 边界、第一张地图、视图键                       |
| [照片地图](docs/guide/photo-maps.zh-CN.md)                     | 照片目录、OneDrive、链接照片、缩略图、索引                |
| [轨迹与区域](docs/guide/tracks-and-areas.zh-CN.md)             | 轨迹链接、内联地图、GPX/GeoJSON/KML/TCX、面、统计写进属性 |
| [周围视图与导航](docs/guide/around-and-navigation.zh-CN.md)    | 周围视图、复用 Base、在地图中打开、跟随、重合图钉         |
| [地点的进出](docs/guide/places-in-and-out.zh-CN.md)            | 把地标文件导入成笔记，把 Base 导出成 GPX/KML/CSV          |
| [离线底图](docs/guide/offline-basemap.zh-CN.md)                | 磁盘上现成的瓦片当底图、层级边界、按视图关闭              |
| [坐标与地图服务](docs/guide/coordinates-and-services.zh-CN.md) | WGS-84/GCJ-02/BD-09、外部地图、搜索、地理编码、定位       |
| [参考与隐私](docs/guide/reference-and-privacy.zh-CN.md)        | 支持输入、选项职责、使用边界、网络披露                    |

笔记、轨迹和照片内容不会自行离开。插件没有遥测、更新检查或自己的服务器；
[隐私说明](docs/guide/reference-and-privacy.zh-CN.md#什么会离开你的库)列出了使用地图或外
部服务时发出的请求。

## 项目文档

- [CONTRIBUTING.md](CONTRIBUTING.md)：开发环境、测试、PR 与发布。
- [OpenSpec capabilities](openspec/specs)：稳定技术契约。
- [CHANGELOG.md](CHANGELOG.md)：已发布行为。
- [ROADMAP.md](ROADMAP.md)：未来方向和明确不做的内容。

## 许可

[MIT](LICENSE)。
