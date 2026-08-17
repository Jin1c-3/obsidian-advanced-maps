# Tracks and areas

**English** · [简体中文](tracks-and-areas.zh-CN.md) · [Guide index](README.md)

Advanced Maps reads GPX, GeoJSON, KML, and TCX files. A track file can be a
direct Base result or be linked from a matched note. Linked files inherit their
owning note's marker colour.

## Draw a route on an existing Base map

Use a normal link—no `!`—when you want the route on the Base map without
creating another map in the note:

```markdown
---
coords: 30.215709,120.130799
---

[[track.gpx]]
```

When the Base includes this note, its map draws the route. A frontmatter link
works the same way:

```yaml
track: '[[track.gpx]]'
```

Use an embed only when you deliberately want a second, inline route map:

```markdown
![[track.gpx]]
```

| Syntax                   | Base or Around map | Inline route map in the note |
| ------------------------ | ------------------ | ---------------------------- |
| `[[track.gpx]]`          | Draws the route    | No                           |
| `track: "[[track.gpx]]"` | Draws the route    | No                           |
| `![[track.gpx]]`         | Draws the route    | Yes                          |

Normal body links, embeds, and file links in frontmatter are resolved
separately and de-duplicated. An actual embed is the only form that creates the
inline map.

## Route markers

Routes get distinct start and end markers, direction arrows, and named
waypoints. **Show track markers** turns these extras off.

![A GPX route with a green start, red ring end, and arrows showing direction](../track-markers.png)

## GeoJSON and KML areas

GeoJSON and KML can hold an area rather than a route. An area is filled in the
owning note's colour and outlined at the same width, and a hole stays a hole.

An area gets no direction arrows or start/end markers and adds nothing to the
statistics below an inline map. It is also the last thing a click reaches: a
marker, waypoint, or photo inside an area keeps its own click.

![Areas read from GeoJSON and KML: filled regions in their note's colour, two with unfilled holes, and a route with a green start, red ring end and direction arrows crossing one of them](../area-fill.png)

## Inline route maps and statistics

An inline `![[track.gpx]]` is a live map with distance, ascent and descent,
elevation range, elapsed and moving time, pace, and an elevation profile.
Missing source data is omitted instead of shown as zero. Hovering the profile
moves a cursor along the route and vice versa.

![A live GPX embed followed by distance, ascent, times, pace, and a hoverable elevation profile](../inline-embed.png)

Ascent ignores changes below 5 m to suppress GPS drift. Moving time counts
speeds above 0.9 km/h so slow walking and stairs still count.

An inline track map also draws geotagged photos linked from its host note. Route
statistics continue to describe the route alone.

![An inline GPX map with the host note's photo thumbnails placed along the route](../photo-embed.png)
