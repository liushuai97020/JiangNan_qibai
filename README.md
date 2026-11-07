# 樱落 · 栖白｜江南两层小别墅 3D 交互网站

一个可直接在本地打开的单页 3D 住宅展示站。白墙黛瓦、樱花庭院、白色轿车与暖木室内均为程序化几何与 Canvas 材质生成，不依赖外部图片或网络资源。

## 启动

环境要求：Node.js 18+，支持 WebGL2 的现代浏览器。

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:4173
```

也可以直接双击 `start.bat`（Windows），或在项目目录执行 `node server.mjs`。

> 不建议直接双击 `index.html`。ES Modules 需要通过本地 HTTP 服务加载。

## 场景内容

- 两层江南小别墅：白灰泥外墙、深灰黛瓦、微翘檐口、木格栅窗、二层露台、入口门廊与“栖白”门匾。
- 庭院：石板路径、樱花树、竹丛、石灯笼、石水钵、木凳、低矮院墙与月洞门。
- 停车区：独立车行入口、木质格栅屏风、挡车石，停一辆白色轿车。
- 车辆交互：点击右下角“车辆驶出”按钮，白色轿车会沿车道驶出院门、停在院外道路上；再次点击“泊回院子”即可倒车入库。过程中自动切换到车道视角，车轮会随行驶方向转动。
- 车牌：前后牌照均为新能源绿牌样式，文字严格为 `苏EG59122`。
- 樱花：约 1000 个花簇、动态飘落花瓣、地面落樱与车顶花瓣；支持风力调节。
- 室内：会客厅、餐厅、厨房、茶室、楼梯、二层主卧与次卧；白蜡木、胡桃木、亚麻、洞石与 2700K 暖光。
- 剖切模式：隐藏屋顶与前立面，可查看室内家具与暖光。
- 光照：晨光 / 黄昏 / 夜幕三种模式，联动天空、雾、曝光、室内灯、窗光与庭院灯。

## 交互

- 鼠标拖动旋转，滚轮缩放，右键/双指平移。
- 右侧视角：庭院、建筑、会客厅、主卧、鸟瞰。
- 点击庭院中的光点：打开樱花庭、停车位、会客厅、茶室、主卧详情卡片。
- 底部控制台：光照模式、樱花雨开关、风力滑块、剖切、自动环游。
- 自动环游默认开启；拖动场景或切换视角后暂停，可再次点击“环游”恢复。
- 右下角车辆按钮：车辆驶出 / 泊回院子，自动切换车道镜头并播放车轮滚动。
- 支持 URL 深链，例如：

```text
http://127.0.0.1:4173/?view=parking&light=dusk&cutaway=0&petals=1&wind=0.55
```

- 自动环游开启后，拖动场景会自动暂停。
- 遵循 `prefers-reduced-motion`，并支持键盘焦点与按钮 `aria` 状态。

## 目录

```text
index.html
styles.css
server.mjs
package.json
src/
  main.js
  state.js
  scene/
    renderer.js      WebGL 渲染器、相机、OrbitControls、PMREM
    materials.js     程序化贴图与共享材质
    sky.js           天空 Shader
    lighting.js      三种光照模式与暖光注册
    villa.js         建筑外壳、屋顶、门窗、露台、剖切分组
    interior.js      室内空间、家具、楼梯、灯具
    courtyard.js     院墙、院门、铺地、停车区、竹与庭院景观
    cherry.js        樱花树、花簇、飘落花瓣
    car.js           白色轿车、车牌、轮毂与灯组
  ui/
    controls.js      控制台与导航状态
    hotspots.js      3D 热点投影
    panels.js        空间详情、设计说明、加载层
vendor/three/        Three.js 0.171.0（MIT License）
tools/verify.mjs     Chrome CDP 冒烟测试与截图脚本
artifacts/           验收截图
```

## 验收

```bash
npm run check   # Node 语法检查
npm run verify  # 启动 Chrome 无头渲染并输出截图与交互检查
```

## 部署到 Vercel

项目已包含 `vercel.json` 和静态构建脚本，Vercel 会执行 `npm run build` 并把 `dist/` 作为输出目录。

在 Vercel 项目中确认以下设置：

- **Root Directory**：仓库根目录（留空或 `.`，不要选 `src`、`artifacts` 或 `scripts`）
- **Framework Preset**：Other
- **Build Command**：`npm run build`
- **Output Directory**：`dist`
- **Install Command**：`npm install`

然后重新部署。`server.mjs` 只用于本地预览，Vercel 不需要它。

本地验证生产构建：

```bash
npm run build
npm run preview
# http://127.0.0.1:4174
```

如果部署后仍然显示 404，优先检查 Vercel 的 **Root Directory** 是否指向了错误的子目录，以及 **Output Directory** 是否仍保留旧的 `public`/`dist` 设置。

`verify` 需要本机安装 Chrome，路径默认为：

```text
C:\Program Files\Google\Chrome\Application\chrome.exe
```

可通过环境变量 `CHROME_PATH` 覆盖。

## 性能与兼容

- 使用 InstancedMesh 渲染花簇、花瓣、竹叶、灌木、铺地等重复元素。
- 桌面端 DPR 上限 1.8，移动端 1.5；阴影贴图桌面 2048、移动端由浏览器自动降级。
- 页面隐藏时暂停渲染。
- 仅依赖 Three.js，无外部字体、图片、CDN 请求。
- WebGL2 不可用时显示纸面风格提示。

## 许可

Three.js 以 MIT License 使用，许可证文件位于 [vendor/three/LICENSE](./vendor/three/LICENSE)。

本项目中的建筑、景观、汽车、室内与 UI 均为原创程序化实现。
