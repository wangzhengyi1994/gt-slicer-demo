# GT Slicer Demo - 拓竹 Bambu Studio 风格重构

## 参考
按照 Bambu Studio 的 UI 风格重构以下模块。参考截图在项目外部,以下文字描述即为需求。

## 模块 1: 托盘(Build Plate)重构

当前: 金属灰色托盘 + 粗/细网格 + 四角圆柱装饰 + "GT Carbon S800" 文字

改为拓竹风格:
- **深色 PEI 纹理**: 托盘颜色改为深炭灰色(接近 #1A1D25),带轻微的纹理质感(roughness 高,metalness 低)
- **细密网格**: 只保留细网格(10mm 间距),去掉粗网格,线条颜色极淡(与底板几乎融为一体)
- **边框**: 四周深色边框(比托盘更深一点,#101218),不要圆柱角装饰,改为方形边框
- **四角夹具**: 四个角上添加小矩形夹具缺口(模拟 3D 打印机固定夹),可以用 BoxGeometry 挖出缺口效果,或直接在角上放小方块
- **品牌刻字**: "GT Carbon HT440" 文字保持在后边缘,字色改为极淡(跟底板几乎一样,只是微微亮一点)
- **表面微光泽**: 加一点点 metalness(0.15)让表面有轻微反光,模拟 PEI 质感
- **去掉体积框线**: 去掉 Volume box outline(浅色线框)和高度刻度线

## 模块 2: ViewCube 改为拓竹风格

当前: 右上角 SVG 立方体,轴线从中心穿过

改为拓竹风格:
- **位置**: 从右上角移到**左下角**(viewport 左下方)
- **立方体样式**: 保持现有 SVG 渲染,面标签改中文: "顶部"/"底部"/"前面"/"后面"/"左面"/"右面"
- **轴指示器分离**: 轴线不再从立方体中心穿过,改为在立方体**左下方**独立显示
  - 三色箭头从公共原点延伸: 红=X(右), 绿=Y(前/左上), 蓝=Z(上)
  - 箭头带小三角箭头 + 小写字母标签(x, y, z)
  - 轴指示器与立方体保持同步旋转
- **齿轮按钮**: 在 ViewCube 右下方添加一个小齿轮图标(⚙),点击弹出视图设置 toast(暂时只做 UI,不做功能)
- **尺寸**: 立方体可以稍小一点(CUBE_SIZE 从 32 改为 28)

对应 CSS 修改:
- `.viewcube-container` 的 position 从 `top: 12px; right: 12px` 改为 `bottom: 60px; left: 12px`

## 模块 3: Gizmo 虚线延长线

当前: TransformControls 标准 Gizmo

增强:
- 在模型上的 Gizmo 箭头两端,添加虚线辅助线(dashed line),从 Gizmo 箭头末端延伸到视口边缘方向(长度约 500 单位)
- 虚线颜色与轴色一致(红/绿/蓝),但更淡(opacity 0.3)
- 用 THREE.LineDashedMaterial + setFromPoints 实现
- 只在移动模式(translate)下显示虚线
- Gizmo 拖拽时虚线跟随更新

实现方法:
```javascript
// 为每个轴创建虚线
const dashMat = new THREE.LineDashedMaterial({
    color: 0xff0000, // 红色 for X
    dashSize: 5,
    gapSize: 3,
    transparent: true,
    opacity: 0.3
});
const points = [new THREE.Vector3(-500, 0, 0), new THREE.Vector3(500, 0, 0)];
const geo = new THREE.BufferGeometry().setFromPoints(points);
const line = new THREE.Line(geo, dashMat);
line.computeLineDistances();
scene.add(line);
```

虚线的位置要跟随模型的当前位置(每帧更新 line.position = model.position)

## 模块 4: 坐标面板重构(移动工具面板)

当前: 移动工具面板有 XYZ 位置输入

改为拓竹风格:
- **标题**: "世界坐标" (折叠标题,可展开/收起)
- **XYZ 行**: 每行一个轴,格式: [轴色标签] [输入框] [mm单位]
  - X 标签红色背景圆角小标签
  - Y 标签绿色背景
  - Z 标签蓝色背景
- **"对齐盘" 区块**: 在位置输入下方,添加新折叠区块 "对齐盘"
  - 6 个对齐按钮(2行3列): 左前/中前/右前 + 左后/中后/右后
  - 每个按钮是小方块图标,点击将模型移动到托盘对应位置
  - 额外一个"网格对齐"按钮(类似磁铁图标)
- 面板位置: 浮动在工具栏右侧(保持现有逻辑)

## 模块 5: 模型信息卡片(右下角)

新增功能:
- 在 viewport 右下角添加模型信息浮层
- 显示内容:
  - 对象名称: "3D Model" (或 "实体1")
  - 大小: X × Y × Z 毫米(从 model bounding box 计算)
  - 体积: 计算模型体积(mm³)
  - 三角形: 计算模型面数
- 样式: 半透明卡片,小字号,不遮挡主视图
- 当模型变换(移动/缩放/旋转)时实时更新尺寸信息

## 技术约束
- 纯 HTML/CSS/JS + Three.js r128,不添加新依赖
- 保持所有现有功能正常
- ViewCube 的 CSS 和 SVG 都在同一个文件里(app.js 的 _viewCube IIFE + style.css)
- TransformControls 已加载: `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js`
- 全局变量: scene, camera, renderer, controls (OrbitControls), model (THREE.Group), buildPlate, transformControls, gridHelper

## 完成后
运行: openclaw system event --text "Done: GT Slicer 拓竹风格重构全部完成(托盘+ViewCube+虚线+面板+模型信息)" --mode now
