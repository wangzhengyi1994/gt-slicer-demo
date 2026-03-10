# TASK7: 预览模式G-Code编辑器面板

## 需求
切换到预览(PREVIEW) tab时，右侧面板从"打印设置"变成"G-Code Preview"面板。

## 参考截图描述
GT Slicer桌面端预览模式下的右侧面板:

### G-Code Preview 面板结构:
1. **标题栏**: "G-Code Preview" 标题 + 右上角 × 关闭按钮
2. **副标题行**: "Generated G-Code" + "Save File" 按钮(右对齐)
3. **搜索栏**: Find输入框 + Cc复选框 + Find/Prev/Next 按钮
4. **G-Code文本区**: 可滚动的代码区域，等宽字体，显示模拟的G-Code内容
   - 包含真实的G-Code示例: M105, M109 T0 S200, G92 E0, G1 F600 Z0.4 等
   - 注释用分号开头: ;LAYER:0, ;TYPE:SKIRT, ;LAYER_COUNT:199
   - 右侧有垂直滚动条，带层号标记(如 "117")
5. **底部切换**: "< Custom" 和 "> Recommended" 两个按钮

### 底部信息栏(面板底部):
- 打印预估时间: "14 hours 33 minutes" (带时钟图标)
- 材料用量: "404g · 135.42m" (带称重图标)
- "Save to Disk" 按钮(蓝色/深色主题色)

## 实现要求:
1. 在 index.html 中，lp-process-panel 内部添加 G-Code Preview 面板 HTML
2. 准备(prepare) tab激活时显示打印设置，预览(preview) tab激活时显示G-Code面板
3. G-Code内容用模拟数据即可(静态文本)
4. 样式要和现有GT Slicer深色/亮色主题适配
5. Find搜索功能可以是纯UI(不需要真正搜索)
6. 修改 app.js 中 viewport tabs 切换逻辑，控制右侧面板内容切换
7. 底部 "Save to Disk" 和 "Save File" 按钮点击显示toast提示即可

## 技术细节:
- 现有tab切换在 app.js ~2750行, 通过 data-tab-icon 属性判断
- 右侧面板是 .lp-process-panel
- 面板内已有打印设置内容(gt-custom-material, gt-header, lp-tab-content等)
- 预览模式时隐藏这些，显示G-Code面板
- 样式写在 index.html 底部的 <style> 标签内

## 不要:
- 不要修改Three.js场景代码
- 不要改动已有的打印设置面板结构
- 不要删除任何现有功能
