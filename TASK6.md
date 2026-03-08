# TASK6: 模型实体化 + 双模型 + 选中样式 + 地板清晰

## 问题
当前模型太透明/半透明, 看起来像玻璃不像实体, 需要更实体化的外观

## 需求

### 1. 模型材质实体化
- 去掉透明度, 模型必须是不透明的实体感
- 材质改为标准 PBR: MeshStandardMaterial, opacity: 1.0, transparent: false
- 适当的 roughness(0.4-0.6) 和 metalness(0.1-0.2), 让模型有质感
- 颜色用切片软件常见的浅灰/白灰色(#C8C8C8 或类似), 不要紫色/粉色
- 确保光照充足: 环境光 + 方向光, 让模型表面明暗分明有立体感
- 如果有 Gizmo 小方块(红黄绿蓝等), 那些也要不透明实体

### 2. 双模型
- 场景中默认放两个模型(不需要用户拖拽STL)
- 模型1: 现有的默认模型(比如一个立方体+圆柱的组合体), 放在托盘偏左位置
- 模型2: 不同形状(比如一个齿轮或球体或L形支架), 放在托盘偏右位置
- 两个模型都用实体材质, 颜色可以略有区分(一个浅灰, 一个稍深灰)

### 3. 选中高亮样式
- 点击某个模型时, 该模型外围出现白色发光轮廓线(outline)
- 用 OutlinePass 或 自定义 edge shader 实现
- 选中轮廓: 白色, 宽度 2-3px, 有轻微发光效果
- 同一时间只有一个模型被选中
- 点击空白处取消选中
- 如果 OutlinePass 不可用(需要额外导入), 可以用备选方案:
  - 方案A: 给选中模型套一个略大的半透明白色 wireframe 外壳
  - 方案B: 改变选中模型的 emissive 颜色让它微微发亮 + 加白色 EdgesGeometry 线框
- 推荐方案B, 不需要额外依赖

### 4. 地板/托盘清晰
- 托盘表面的网格线要清晰可见, 不能跟底色融为一体
- 网格线颜色与托盘底色要有足够对比度
- 如果当前是深色托盘 + 极淡网格(TASK5 做的), 把网格线调亮一点(opacity 或颜色)
- 托盘边框要清晰, 整体看起来像一个真实的3D打印机底板

## 技术约束
- 纯 HTML/CSS/JS + Three.js r128, 不添加新依赖(除非 CDN 上有)
- 保持所有现有功能正常(ViewCube/Gizmo/菜单/面板等)
- Raycaster 点击检测要区分两个模型
- 全局变量: scene, camera, renderer, controls, model, buildPlate, transformControls

## 完成后
1. git add + commit
2. 运行: openclaw system event --text "Done: GT Slicer TASK6 完成 - 实体模型+双模型+选中高亮+地板清晰" --mode now
