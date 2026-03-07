# GT Slicer Demo - 模型操控联动 + 3D Gizmo

## 任务
实现工具面板与 3D 模型的双向联动,并在模型上显示变换 Gizmo

## 当前状态
- 全局变量 `model` (THREE.Group) 是场景中的模型
- Three.js r128, 已引入 OrbitControls
- 工具面板(移动/缩放/旋转/镜像)已有 UI,但参数是静态写死的
- 需要: 面板参数 ↔ 模型实际变换 双向联动 + 3D Gizmo 可视化

## 需要实现

### 1. 引入 TransformControls
- 添加 CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js`
- 创建 TransformControls 实例,attach 到 model
- 切换工具时切换 TransformControls 的 mode:
  - 移动工具 → mode = "translate"
  - 缩放工具 → mode = "scale"  
  - 旋转工具 → mode = "rotate"
  - 选择工具/镜像/其他 → detach (不显示 gizmo)
- TransformControls 拖拽时禁用 OrbitControls(dragging-changed 事件)

### 2. 面板 → 模型联动
当用户在面板输入框修改数值时,更新模型:
- **移动面板**: 修改 X/Y/Z 值 → 更新 model.position
- **缩放面板**: 修改 mm 值或百分比 → 更新 model.scale(基于初始尺寸计算)
- **旋转面板**: 修改角度 → 更新 model.rotation (角度转弧度)

### 3. 模型 → 面板联动
当用户通过 TransformControls 拖拽模型时,更新面板数值:
- TransformControls 的 change/objectChange 事件 → 读取 model.position/rotation/scale → 更新面板 input 值
- 保持数值格式: 位置保留4位小数,角度显示整数度,百分比显示整数

### 4. 镜像功能
- 点击镜像面板的方向按钮时:
  - X+ / X-: model.scale.x *= -1
  - Y+ / Y-: model.scale.y *= -1
  - Z+ / Z-: model.scale.z *= -1
- 镜像后立刻 toast "已沿 X 轴镜像"

### 5. 移动面板特殊功能
- "锁定模型" 复选框: 勾选后禁用 TransformControls 拖拽
- "Drop Down Model" 按钮/复选框: 点击后设置 model.position.y = 0(落到平台)

### 6. 缩放面板特殊功能
- "等比例缩放" 复选框: 勾选时修改任意轴,其他轴同步缩放
- 重置按钮: model.scale.set(1, 1, 1),更新面板
- 模型初始包围盒尺寸用 THREE.Box3 计算,作为 100% 的基准

### 7. 旋转面板特殊功能
- 重置按钮: model.rotation.set(0, 0, 0)
- 自动摆放: 随机旋转一个小角度模拟(demo用途)
- 放平: model.rotation.set(0, 0, 0) + toast "已放平到底面"

### 8. 面板初始值
- 打开面板时,从 model 的当前 position/rotation/scale 读取真实值填入输入框
- 不要用写死的数值

## 技术要求
- 在 index.html 添加 TransformControls CDN script 标签
- 在 app.js 中修改 initThreeJS 函数创建 TransformControls
- 修改工具面板的 render 函数和事件绑定逻辑
- TransformControls 操控时要与 OrbitControls 协调(拖拽时禁用轨道控制)
- 保持现有所有功能不被破坏

## 完成后
运行: openclaw system event --text "Done: GT Slicer 模型操控联动+Gizmo全部实现" --mode now
