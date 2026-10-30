# PathoAlign

一个本地优先的 HE / IHC 病理切片双屏对比与像素级配准工作台。使用 React（Vite）+ Tailwind CSS + Leaflet 构建，支持普通 TIFF / BigTIFF、HE / IHC 双侧 GeoJSON、分角色目录导入，以及图像 / 标注的独立像素级微调。所有数据均在浏览器内解析，不上传服务器。

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://ZhangTingwei-ggb.github.io/image_view/)

## 快速开始

```bash
npm install
npm run dev
# http://localhost:5173
```

生产构建：

```bash
npm run build
npm run preview
```

首次打开会加载 3 个内置演示病例。

## 导入数据

点击顶部 **导入数据** 打开导入窗口，支持三种方式：

1. **四个目录**：分别选择 HE 图像、HE GeoJSON、IHC 图像、IHC GeoJSON 目录。
2. **四个单文件**：每个角色点“单文件”，选择一张 TIFF 或一份 GeoJSON；系统将它们作为一组手动配对导入，不要求文件名相同。
3. **拖放**：
   - 把文件/文件夹拖到导入窗口顶部的虚线区域，自动识别并分配角色。
   - 也可以直接拖到对应的四张卡片上，手动指定角色。
   - 关闭导入窗口后，直接把文件或文件夹拖到整个应用窗口，也会识别并自动导入。

封闭式目录导入会先按 **病例根名 + `cx / cy` 切片坐标** 的切片身份精确配对，再回退到文件名、数字编号和最长公共前缀。同时支持 `he_all / ihc_all / he_geo_all / ihc_geo_all` 这类扁平目录，以及 `he/<case>/`、`he_geo/<case>/` 这类按病例分层的目录。单文件模式下四份文件组成一组“手动配对”切片。

也可以点击导入窗口底部的 **快速选择单个上级目录自动识别**，选择包含 `he / ihc / he_geo / ihc_geo` 子目录的父目录：

```text
.../20260924_gd_he_ihc/test/image
.../20260924_gd_he_ihc/test/image_all
```

## 功能一览

- 浏览器内解码普通 TIFF 与 **BigTIFF**（`geotiff`，失败回退 `utif`）
- 导入阶段只扫描元数据，图像与 GeoJSON 在选中切片时按需加载
- HE / IHC 图像自动配对，支持两个 GeoJSON 同时归档到同一切片组
- 双屏独立图层
  - HE 视图默认同时显示 HE 标测（红）和 IHC 标测（绿）
  - IHC 视图默认只显示 IHC 标测，可通过图层面板开启 HE 标测
  - 两侧视图的每个图层都可以单独显示/隐藏
- 图像级配准
  - 微调目标切换：`IHC 图像` / `IHC 标测`
  - 移动 IHC 图像时，HE 图像与所有 GeoJSON 保持不动，便于利用标测参考手动配准
  - 移动 IHC 标测时，该标测在两侧视图同步移动；HE 标测保持不动
- 两点锚点配准：在任一侧点击放置基准锚点，拖动另一侧锚点对齐后一键应用偏移
- 1 px 键盘微调
- 统一 Y↓ 图像坐标，无需手动切换 Y 轴
- 双屏同步缩放与平移；缩放使用双图同步动画
- 导出应用了当前标测偏移的 `原名_registered.geojson`
- 深色三栏界面、切片树、搜索、未分组文件提示

## 文件结构

```text
.
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── README.md
├── scripts/
│   └── generate-demo.mjs
├── public/
│   ├── favicon.svg
│   └── demo/
│       ├── HE_patient01.svg
│       ├── IHC_patient01.svg
│       ├── pat01.geojson
│       └── ...
└── src/
    ├── main.jsx
    ├── App.jsx                     # 导入、懒加载、同步、标测/图像偏移、键盘、导出
    ├── index.css
    ├── components/
    │   ├── TopBar.jsx
    │   ├── Sidebar.jsx
    │   ├── CaseStrip.jsx           # 微调目标、偏移、锚点
    │   ├── SliceViewer.jsx         # Leaflet 双图、双标测图层、图像偏移
    │   ├── ImportSourcesDialog.jsx # 四目录/四单文件/拖放导入
    │   ├── WorkspaceEmpty.jsx
    │   ├── ImportOverlay.jsx
    │   └── ToastViewport.jsx
    ├── data/
    │   ├── demo.js
    │   └── demoGeoJSON.js
    └── utils/
        ├── grouping.js             # LCP、数字/切片坐标匹配、手动配对
        ├── files.js                # 目录扫描、角色识别、TIFF/GeoJSON 解析
        ├── importSources.js        # 拖放目录遍历与角色推断
        └── geojson.js              # 规范化、坐标平移/翻转、导出
```

## 自动匹配算法

实现位于 [`src/utils/grouping.js`](src/utils/grouping.js)。

### 文件名规范化

```text
HE_patient01.tif  -> patient01
IHC_patient01.tif -> patient01
pat01.geojson     -> pat01
```

真实切片示例：

```text
2615446-1_he_tile_cx49117_cy66250_1000_m50_mpp0.5.tif
2615446-1_he_tile_cx49117_cy66250_1000_m50_mpp0.5_IHC_tile_HER2.tif
2615446-1_he_tile_cx49117_cy66250_1000_m50_mpp0.5_HE.geojson
2615446-1_he_tile_cx49117_cy66250_1000_m50_mpp0.5_IHC_HER2.geojson
```

规范化步骤：

1. 移除 `he_tile` / `IHC_tile` 等模态与 tile 标记。
2. 移除 `HER2`、`KI67`、`ER`、`PR` 等检测指标后缀，避免指标里的数字（如 `HER2` 的 `2`、`KI67` 的 `67`）干扰病例编号比较。
3. 截断到 `tile_cx…_cy…` 之前，得到病例根名，例如 `2615446-1`。
4. 用 `病例根名|cx|cy` 组成切片身份，先做精确配对。

因此上面四个文件会归入同一个切片组，并分别显示 HE 与 IHC 两份标测。若同一病例下 HE / IHC 的切片坐标集合不完全一致，多出来的切片会各自保留为单图组，而不是错配到相邻切片。

### 最长公共前缀

```js
export function longestCommonPrefix(strings = []) {
  if (!strings.length) return ''
  let prefix = strings[0]

  for (let i = 1; i < strings.length; i += 1) {
    let cursor = 0
    while (
      cursor < prefix.length &&
      cursor < strings[i].length &&
      prefix[cursor] === strings[i][cursor]
    ) cursor += 1
    prefix = prefix.slice(0, cursor)
    if (!prefix) break
  }
  return prefix
}
```

原始示例三个文件名的整体 LCP 为空，因此程序会先移除 HE / IHC 模态词，配对图像，再用 LCP、数字签名、`cx/cy` 坐标与标注侧别将 GeoJSON 归属到正确的切片组。

### 手动四文件配对

如果导入窗口中的每个角色只有一个文件（或标注目录留空），系统使用 `forceSingleGroup` 模式：

- HE 图像与 IHC 图像直接组成一个组，不要求文件名相同
- HE / IHC GeoJSON 按角色分别关联
- 组上会显示“手动配对”
- 适合文件名没有共同前缀、但用户明确知道四个文件属于同一区域的情况

## 双标测与图像配准

### 图层

每个切片的两个 GeoJSON 会分别加载：

- HE 标测：红色半透明
- IHC 标测：绿色半透明

下方图层面板按视图独立控制显示：

- HE 图像视图默认：HE 标测 + IHC 标测
- IHC 图像视图默认：IHC 标测
- 点击图层标签可以显示/隐藏对应图层

### 微调目标

CaseStrip 右侧提供：

- **图像**：方向键移动 IHC 图像
- **标测**：方向键移动 IHC GeoJSON

两种偏移完全独立，每个切片组分别保存。HE 标测固定不动，用作配准参照。

### 锚点配准

CaseStrip 的 **锚点** 按钮提供两点配准流程：

1. 点击 **锚点** 进入配准模式。
2. 在 HE 或 IHC 任一侧点击一个解剖结构，两侧同一图像坐标会出现一对锚点；被点击的一侧是固定基准。
3. 拖动另一侧的橙色锚点，把它对齐到同一个解剖结构；固定锚点不会移动。顶部会实时显示将应用的 `ΔX / ΔY`。
4. 点击 **完成**，系统计算 `HE 锚点 − IHC 锚点` 的像素偏移，并把该偏移作为 IHC 标测的绝对偏移应用。标测会移动到 HE 基准锚点所在的结构上。
5. 点击 **取消** 或按 `Esc` 放弃，不修改现有偏移。

配准过程中方向键微调会暂停，避免误移动。切换切片组或重新导入都会自动退出锚点模式并清除临时锚点。

### 坐标系

所有图像与标测统一使用 **Y↓ 图像坐标**（左上角原点，y 向下增大），与 QuPath / OpenSlide 导出的坐标一致。显示到 Leaflet 时统一做一次翻转：

```text
leafletLat = imageHeight - y
```

因此方向键、锚点、偏移量与导出的 GeoJSON 都在同一套坐标中计算：

- `ArrowUp` 让 y 减 1，`ArrowDown` 让 y 加 1
- 不需要再手动切换 Y 轴方向

### 性能与偏移

- 每个标测层使用独立 Leaflet pane 与独立 SVG renderer
- 方向键只修改 pane 的 CSS `translate3d`，不重新创建/重绘整套 GeoJSON 多边形
- 标测 renderer 使用 `padding: 1.2`：默认 `0.1` 的裁剪范围在放大后不足以覆盖平移后的内容，会表现为一侧空白
- 一个视口以上的额外 padding 可以保证只要平移后的标测仍在屏幕内，SVG 裁剪范围就覆盖整个视口
- 图像偏移使用另一个独立 pane 的 CSS 位移，只移动 IHC 图像
- 偏移按当前缩放级别换算屏幕像素
- 导出时直接复用同一套数据坐标偏移，显示与导出结果一致

## 双屏同步与缩放

### 平移

`move` 事件中同步调用另一张地图：

```js
target.setView(center, zoom, { animate: false })
```

两张地图在同一事件循环内更新，无额外帧等待。

### 缩放

开启 Leaflet zoom animation，并监听源地图的 `zoomanim`：

- 源地图开始缩放动画后，目标地图以相同 target center / zoom 开始动画
- 动画期间暂停普通 move 同步，避免中断动画
- 动画结束后再进行最终视图校正
- 保留同步 flag，防止 target 的 `zoomanim` 回声造成来回触发

这使得两侧缩放同时进行，而不是一侧瞬间跳到目标倍率。

## 导出

- 当前工具栏导出 **IHC 标测**
- 应用 IHC 标测的偏移，而不是图像配准偏移
- 下载文件名：`原名_registered.geojson`
- 深拷贝 FeatureCollection，递归平移所有坐标
- 保留 properties、z 值与 foreign members

## 已验证

- 普通 TIFF 与实际数据中的 **BigTIFF** 解码
- 四目录导入、四单文件手动配对、拖入导入
- 两个 GeoJSON 同时显示在一张 HE 图像上
- 每个视图独立切换 HE / IHC 标测图层
- IHC 图像独立偏移与 IHC 标测独立偏移
- 两点锚点配准与偏移应用
- 高倍率下移动标测不再出现边缘空白
- 切片切换、偏移按切片独立保存与恢复
- 真实数据 1100 × 1100 TIFF、698 / 1394 个标注多边形
- `image_all` 664 个文件：167 组（165 对 HE/IHC + 2 个真实单图切片），332/332 GeoJSON 全部关联，0 个未分组
- `npm run build` 通过

## TIFF 说明

- 使用 `geotiff` 读取 BigTIFF，失败时回退 `utif`
- 支持常见 JPEG / LZW / Deflate / 部分 tile 压缩
- 仅当前切片解码，不会在导入时加载全部 TIFF
- 超大千兆像素 WSI 金字塔仍建议使用专用瓦片服务
- 所有数据保存在浏览器内存中，刷新即释放
