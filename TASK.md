# GT Slicer Demo - 模型操作工具实现

## 任务
为 GT Slicer Demo 实现完整的模型操作工具系统。参考截图在 reference/ 目录下。

## 当前状态
- 左侧浮动工具栏(floatingToolbar)已有按钮: select/move/scale/rotate/add/support/cut/measure
- 点击按钮只切换 active 状态，没有实际面板和功能
- 需要: 点击工具按钮时，左侧弹出对应的参数面板

## 需要实现的工具(参考截图)

### 1. 移动工具 (Move) - 参考 01-move.jpg, 02-move-2.jpg
左侧面板内容:
- X / Y / Z 坐标输入框 (数值，默认0)
- "锁定模型" 复选框
- "Drop Down Model" 按钮（落到平台）
面板标题: "移动"，快捷键显示 T

### 2. 缩放工具 (Scale) - 参考 03-scale.jpg
左侧面板内容:
- X / Y / Z 三行，每行显示: 尺寸mm + 百分比%
- "等距缩放 (Snap Scaling)" 复选框
- "等比例缩放" 复选框(默认勾选)
- 重置按钮
面板标题: "缩放"，快捷键 S

### 3. 旋转工具 (Rotate) - 参考 04-rotate.jpg
左侧面板内容:
- X / Y / Z 角度输入框
- "等距旋转 (Snap Rotation)" 复选框
- 三个快捷按钮: 重置旋转 / 自动摆放 / 放平到底面
面板标题: "旋转"，快捷键 R

### 4. 镜像工具 (Mirror) - 参考 05-mirror.jpg
- 在工具栏中添加镜像按钮(在旋转后面)
左侧面板内容:
- 六个方向按钮: X正/X负, Y正/Y负, Z正/Z负
- 用红(X)/绿(Y)/蓝(Z)颜色区分
面板标题: "镜像"，快捷键 M

### 5. 单独设置 (Per Model Settings) - 参考 06-per-model.jpg
左侧面板内容:
- 四个网格类型图标按钮(正常/填充/线框/自定义)
- "网格类型: 正常模式" 文字说明
- "选择设置" 按钮
面板标题: "单独设置"

### 6. 支撑拦截器 (Support Blocker) - 参考 07-support-blocker.jpg
左侧面板内容:
- 简单说明文字: "在模型表面绘制区域以阻止生成支撑"
- "启用支撑拦截" 复选框
面板标题: "支撑拦截器"，快捷键 E

### 7. 挤出机选择 - 参考 08-extruder.jpg
- 在工具栏底部添加两个圆形挤出机按钮(1号/2号)
- 用分割线与上面的工具按钮隔开
- 1号默认高亮

## UI 规范
- 面板出现在浮动工具栏右侧，紧贴工具栏
- 面板宽度约 240px
- 深色主题配色与现有 style.css 一致（使用 CSS 变量）
- 面板有标题栏，显示工具名和快捷键
- 切换工具时面板平滑过渡
- 点击同一个工具或点击 select 时关闭面板
- 输入框样式与右侧 Print Settings 面板一致

## 技术要求
- 只修改 index.html / style.css / app.js 三个文件
- 不引入新的依赖
- 保持现有功能不被破坏
- 面板数据是展示性的（demo用途），不需要真正操控3D模型
- 但输入框要可交互（可输入数值，有 hover/focus 状态）

## 完成后
运行: openclaw system event --text "Done: GT Slicer 模型操作工具面板全部实现" --mode now
