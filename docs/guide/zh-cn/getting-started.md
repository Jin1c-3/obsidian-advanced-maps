---
title: '快速开始'
description: '从社区插件市场安装 Advanced Maps，理解 Base 如何变成地图，并复制一份完整的 base 文件开始使用。'
---

# 快速开始

<!-- nav:start -->

[English](../en/getting-started.md) · **简体中文** · [指南首页](README.md)

<!-- nav:end -->

## 环境要求

需要 Obsidian 1.13.1 或更高版本，并启用 **Bases** 和第一方 **Maps** 插件。Advanced
Maps 扩展这个原生注册，而不是替换它；MapLibre、底图、控件、图钉、气泡和内置地图选
项仍由原生视图提供。找不到预期的 Maps 视图时，Advanced Maps 会说明或跳过不可用的增
强，让 Obsidian 保持可用，而不是加载一半。

## 安装

Advanced Maps 已经上架 Obsidian 的社区插件市场。

1. 打开 **设置 → 第三方插件**。
2. 如果 Obsidian 正处于**安全模式**，先把它关掉。Obsidian 会先说明第三方插件能在你的
   设备上做什么，再请你**允许社区插件**。
3. 在**社区插件市场**这一行点**浏览**，搜索 `Advanced Maps`。
4. 点**安装**，再点**启用**。

市场页面也可以在网页上直接看：
[community.obsidian.md/plugins/advanced-maps](https://community.obsidian.md/plugins/advanced-maps)。

<details>
<summary>安装市场里还没有的版本</summary>

- **Release：**从 [Releases](https://github.com/Jin1c-3/obsidian-advanced-maps/releases)
  下载 `main.js`、`manifest.json` 和 `styles.css`，放进
  `<库>/.obsidian/plugins/advanced-maps/`，然后启用插件。
- **BRAT：**添加 `Jin1c-3/obsidian-advanced-maps` 作为测试版插件。

</details>

## 在手机上

Advanced Maps 在 Obsidian 手机端一样跑得起来，桌面端画什么，手机上就画什么：带图标和
颜色的笔记标记、GPX/GeoJSON/KML/TCX 轨迹和它的方向箭头、按 EXIF 位置摆好的照片缩略
图、卷尺，以及带统计和高程剖面的 `![[track.gpx]]` 内联地图。

![Obsidian 手机端里打开的一张 Base 地图：环西湖的轨迹带着方向箭头，几个带颜色的笔记标记，两张照片缩略图，右边一列是地图的控件](../../images/mobile-map-view.png)

手机没有鼠标，所以本指南里有两个词要边读边换。

- 凡是写**右键**的地方，**长按**。地图自己的菜单这样打开，文件列表里某个文件的菜单也
  是。
- 凡是写**悬停**的地方，**点一下**。点轨迹会打开气泡，点高程剖面会移动游标。有两处比
  悬停走得更远：点笔记的标记是直接打开那篇笔记，而不是先给你看一眼；点照片是直接打开
  照片本身，**打开笔记**在照片里面。

[离线底图](offline-basemap.md)在手机上一样画得出来，读的是设备自己存储里的瓦片包；那
一页写了这个结论是在哪个平台上实测的。

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

- [照片地图](photo-maps.md)：笔记链接的照片、外部目录、显示控制和照片索引。
- [轨迹与区域](tracks-and-areas.md)：选择普通链接还是内联地图。
- [周围视图与导航](around-and-navigation.md)：配置一份供笔记导航复用的 Base。
- [坐标与地图服务](coordinates-and-services.md)：处理底图坐标系和外部服务。
