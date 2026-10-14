# 王权业 · 神经元空间

一个黑白灰极简风格的 3D 神经网络个人主页：纸白底色、墨点、细线与浅灰的「面」，
画面里有一盏会慢慢移动的光，节点的影子跟着光转向。点击任意一个神经元，
就会展开对应的内容（爱好、技术探索、社团协作、账号入口）。

- 纯静态页面：无框架、无外部依赖、无网络请求，双击 `index.html` 即可打开
- 鼠标拖动旋转、滚轮缩放；键盘可用：方向键旋转、`+` / `-` 缩放、数字键 1–5 切换主题、`Esc` 关闭
- 自适应手机与电脑，尊重系统的「减少动态效果」偏好
- 内容集中在 `assets/app.js` 顶部的 `PROFILE` 与 `TOPICS` 两处，改完保存刷新即可生效

## 本地预览

直接双击 `index.html`；或者用任意静态服务器打开：

```
npx serve .
```

## 部署

本仓库开启 GitHub Pages 后即可直接访问：

> Settings → Pages → Source 选择 `Deploy from a branch` → 分支 `main`、目录 `/ (root)` → Save

页面全部使用相对路径（`./assets/...`）引用资源，放在仓库子目录下也能正常显示。

## 文件结构

```
index.html          页面入口
assets/style.css    样式（黑白灰配色都在文件顶部的 :root 里）
assets/engine.js    神经网络引擎：节点布局、旋转投影、光源与影子、点击命中
assets/app.js       页面内容与交互逻辑（要改昵称、爱好、链接就改这里）
assets/avatar.jpg   头像
assets/avatar.svg   备用图形徽章（头像加载失败时自动使用）
.nojekyll           让 GitHub Pages 原样发布所有文件
```

---

光圈科技实验室（ApertureLab）首次活动作品。
