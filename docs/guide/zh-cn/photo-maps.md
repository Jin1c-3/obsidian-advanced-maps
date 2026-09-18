---
title: '照片地图'
description: '把整个照片目录或笔记里链接的照片画到地图上，控制缩略图与抽稀，并管理照片索引。'
---

# 照片地图

<!-- nav:start -->

[English](../en/photo-maps.md) · **简体中文** · [指南首页](README.md)

<!-- nav:end -->

照片文件直接成为 Base 结果，或者被命中的笔记链接时，Advanced Maps 都可以把它放到地
图上。两种情况下都只有可读 GPS 标签才会产生位置；插件绝不会编造位置。

## 渲染整个照片目录

可以直接使用[快速开始](getting-started.md)里的完整地图相册配方，也可以给已有 Base
增加一个照片目录分支：

```yaml
- file.inFolder("assets/onedrive/Pictures")
```

JPG、JPEG、PNG、WebP、HEIC、HEIF 和 AVIF 文件可以直接参与。照片只要带 GPS，即使
没有可用的内嵌缩略图，仍会显示为一个圆点。

### 把 OneDrive 等库外相册接进 Obsidian

不用把照片复制进库。在库内建立一个指向外部目录的软链接，让 Obsidian 建立索引，再把这
个库内路径写进 Base 筛选器即可。

macOS 或 Linux：

```bash
mkdir -p "/path/to/MyVault/assets/onedrive"
ln -s "/path/to/OneDrive/Pictures" "/path/to/MyVault/assets/onedrive/Pictures"
```

Windows PowerShell（目录联接通常不需要符号链接可能要求的管理员权限）：

```powershell
$vault = "C:\Users\you\Documents\MyVault"
New-Item -ItemType Directory -Force -Path "$vault\assets\onedrive"
New-Item -ItemType Junction `
  -Path "$vault\assets\onedrive\Pictures" `
  -Target "$env:USERPROFILE\OneDrive\Pictures"
```

重新加载库，再把这个库内路径写进 Base。

> [!IMPORTANT]
> 这是桌面文件系统配置。每台需要看到相册的桌面设备都要建立对应链接；移动端不能复
> 用桌面链接。请确保云盘文件已经下载到本机，并避免目录链接形成循环。源目录仍在库
> 外，所以要确认备份和同步工具是否会跟随这个链接，不能默认照片已经包含在库的备份
> 中。Advanced Maps 只读取照片，不会修改它们。

## 只渲染命中笔记所链接的照片

不要把照片目录放进 Base，只筛选笔记：

```yaml
filters:
  and:
    - file.inFolder("places")
views:
  - type: map
    name: 地点
    coordinates: coords
    trackWeight: 4
    trackOpacity: 85
    fitMaxZoom: 16
```

然后在命中的笔记里链接照片：

```markdown
---
coords: 30.2600,120.1500
---

[[IMG_1234.jpg]]
[[IMG_1235.heic]]
```

正文普通链接、`![[IMG_1234.jpg]]` 这种嵌入，以及属性里的文件链接都算。同一张解析成功的
照片只参与一次。Base 不需要包含附件目录；只有希望照片本身也显示在笔记里时，才需要加
`!` 做实际嵌入。

### 链接库外的单张照片

Markdown 正文里的 `file:` 目标可以指向 Obsidian 没有建立索引的受支持照片。普通链接只
把照片放上地图；前面加 `!`，则要求 Obsidian 同时在笔记里显示它。两种写法都会参与地
图，但宿主不一定能在每个平台渲染原始的库外嵌入：

```markdown
[桌面照片](<file:///G:\My Drive\Camera\P 20260911 091346.jpg>)
![手机照片](file:///storage/emulated/0/DCIM/Camera/P_20260911_091346.jpg)
```

这些都是绝对路径，而且取决于设备。同一篇同步笔记可以为每台设备各放一个目标：Advanced
Maps 使用当前设备能读取的受支持文件，跳过其余目标，不会因此丢掉这篇笔记的轨迹或库内
照片。同一个目标同时写成链接和嵌入，仍只会在地图上出现一次。

Android 只有在 Obsidian 获得**所有文件访问权限**后，才能读取库外路径。使用**设备存储**
的库会在设置时请求这项权限；使用**应用存储**则不会。使用
`/storage/emulated/0/...` 目标前，请在 Android 的特殊应用权限设置里为 Obsidian 开启它。
即使地图能够读取，`file:` 图片嵌入在正文里仍可能显示为破图，因为 Android WebView 不会
直接显示这个原始 URL；Advanced Maps 会为地图改用宿主的本地资源路由。只需让照片参与地
图时，请使用普通链接。

只有正文里的 Markdown 行内链接和图片嵌入参与。原始 HTML、引用式链接、属性值、网络
URL、库外轨迹和代码里的文字都不参与。**从照片填写坐标**也仍然只解析库内附件。

> [!IMPORTANT]
> 绝对路径保存在笔记中，会跟随笔记同步到其他地方；请确认路径里的目录名称是否会暴露
> 不希望公开的信息。指向目录的 `file:` URL 并不是相册：Advanced Maps 绝不会遍历它。
> 桌面端要让整个外部目录参与 Base，请使用[上面的目录链接方案](#把-onedrive-等库外相册接进-obsidian)。

库外文件不会产生 Obsidian 的库事件。其他程序修改照片后，Advanced Maps 会在下一次地图
数据刷新或重新打开地图时验证它，不会通过文件监视立即重绘。设备能提供可信文件版本时，
照片索引可以恢复没有变化的派生元数据；不能提供时，插件会重新有限读取照片开头，而不会
盲目信任无法验证的旧结果。

已在维护中的 Android 16 模拟器和 Obsidian 1.13.7 上验证：可读的
`file:///storage/emulated/0/...` 照片会通过宿主派生的
`http://localhost/_capacitor_file_/storage/emulated/0/...` 路由提供，并和库内 GPX 一起绘制；
同一笔记里不可用的 `file:///G:\...` 桌面链接则会被跳过。

![一篇笔记的徒步轨迹叠在卫星影像上，照片按各自 EXIF 位置画成缩略图](../../images/photo-map.jpg)

## 坐标与显示

照片坐标在库中保持 WGS-84，只在地图边界与笔记图钉、轨迹一起换算到底图坐标系。某台相
机把未标注的坐标写成了非标准格式时，可以用**照片坐标系**强制指定 WGS-84 或 GCJ-02。

缩小地图时，互相碰撞的缩略图会稳定地变稀疏，不会堆成看不清的一团；每张已定位照片仍有
一个圆点。放大后，有空间的缩略图会回来。**显示照片**和**显示照片缩略图**可以
分别关闭这两个图层。

![同一批照片在三级缩放下的表现：放大时缩略图铺满，缩小后只剩稳定的几张，下面是一片圆点](../../images/photo-thinning.gif)

## 打开照片或所属笔记

悬停照片会显示它所属笔记的卡片（如果有），卡片里还会带上这张照片本身的预览，密集的地
图上不用点开就能认出是哪一张。点击会在地图上方打开原图，并提供**打开笔记**；Ctrl/Cmd
点击则在新标签页打开图片文件。

手机上点一下就直接到原图，所以中间那张预览卡片是拿不到的一步。去笔记的路并没有断：
**打开笔记**就在你刚打开的那张照片里。

![从地图图钉打开的定位照片，弹窗中有图片、文件名与打开笔记操作](../../images/photo-popup.jpg)

**从照片填写坐标**可以把同一个 GPS 标签写进当前笔记的 `coords` 属性。

## 照片索引与文件读取

首次扫描每张照片最多只读开头 64 KiB。解析出的坐标、时间、方向和缩略图可用性会被缓
存，之后打开大型相册时，无需再次读取每一个没有变化的文件。

**清空照片索引**只会删除这份可重建缓存。地图继续工作，需要时会重新读取元数据；照片字
节绝不会被修改。
