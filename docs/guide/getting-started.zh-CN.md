# 快速开始

[English](getting-started.md) · **简体中文** · [指南首页](README.zh-CN.md)

## 环境要求

需要 Obsidian 1.13.1 或更高版本，并启用 **Bases** 和第一方 **Maps** 插件。Advanced
Maps 扩展这个原生注册，而不是替换它；MapLibre、底图、控件、图钉、气泡和内置地图选
项仍由原生视图提供。找不到预期的 Maps 视图时，Advanced Maps 会说明或跳过不可用的增
强，让 Obsidian 保持可用，而不是加载一半。

## 安装

- **Release：**从 [Releases](https://github.com/Jin1c-3/obsidian-advanced-maps/releases)
  下载 `main.js`、`manifest.json` 和 `styles.css`，放进
  `<库>/.obsidian/plugins/advanced-maps/`，然后启用插件。
- **BRAT：**添加 `Jin1c-3/obsidian-advanced-maps`。

## Base 怎样变成地图

Base 的筛选器决定地图的边界。Advanced Maps 再把命中的每篇笔记展开成它链接的轨迹和照
片。支持的照片或轨迹文件也可以直接成为 Base 结果；整目录照片相册和按文件整理的轨迹集
合就是这样实现的。

下面是完整的 `.base` 文件。把它作为 `地图相册.base` 保存到库根目录，替换两个目录，
打开文件并切换到地图视图。之后仍然可以在 Bases 界面继续编辑筛选器和视图选项。

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

第一个分支提供地点笔记，笔记的 `coords` 属性变成普通图钉；第二个分支直接提供照片文
件。支持 JPG、JPEG、PNG、WebP、HEIC、HEIF 和 AVIF。

这里的「所有照片」准确地说是**所有带可读 GPS 元数据的照片**。没有 GPS 的文件仍会留
在 Base 结果中，但地图不会编造图钉。带 GPS 却没有可用内嵌缩略图的照片仍会显示为普通
圆点。

## Advanced Maps 添加的视图键

示例里的后三个键，就是本插件追加到 Bases 界面**轨迹**和**坐标系**分组下的选项。省
略时由插件设置决定。

| 键             | 视图中的选项 | 含义                     |
| -------------- | ------------ | ------------------------ |
| `trackWeight`  | 线宽         | 轨迹线宽                 |
| `trackOpacity` | 线条透明度   | 轨迹线透明度             |
| `fitMaxZoom`   | 自动缩放上限 | 自动取景最多放大到哪一级 |
| `coordSystem`  | 瓦片坐标系   | 留空则跟随插件默认值     |

## 接下来

- [照片地图](photo-maps.zh-CN.md)：笔记链接的照片、外部目录、显示控制和照片索引。
- [轨迹与区域](tracks-and-areas.zh-CN.md)：选择普通链接还是内联地图。
- [周围视图与导航](around-and-navigation.zh-CN.md)：配置一份供笔记导航复用的 Base。
- [坐标与地图服务](coordinates-and-services.zh-CN.md)：处理底图坐标系和外部服务。
