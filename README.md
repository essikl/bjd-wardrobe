---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 38b40b4706328bee50b595cd2ebecb0d_56fc6b53a6c511f1b87f525400461939
    ReservedCode1: O+QrJL8rDqMLP0runHWBAHkgi+0cITTmO8ll3Uf6nrjHtCqq82h4A+Bpkzi7IXECygF1oLhbcK+FbWOZxfAAP7oMAqVzsZa15krhsFxnhFdKOwMcEubgEy4KOQOrFFML/lJaen22ztB9yctL0UaDNbqsRbWpvkoKQEnUxOw82WRgBNNjGcseu4CONo8=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 38b40b4706328bee50b595cd2ebecb0d_56fc6b53a6c511f1b87f525400461939
    ReservedCode2: O+QrJL8rDqMLP0runHWBAHkgi+0cITTmO8ll3Uf6nrjHtCqq82h4A+Bpkzi7IXECygF1oLhbcK+FbWOZxfAAP7oMAqVzsZa15krhsFxnhFdKOwMcEubgEy4KOQOrFFML/lJaen22ztB9yctL0UaDNbqsRbWpvkoKQEnUxOw82WRgBNNjGcseu4CONo8=
---

# 娃衣柜（BJD 衣物管理）使用与部署说明

一款面向 BJD 玩家的私人衣物管理工具：衣柜、照片、娃娃档案、付款/尾款记录、到期提醒、支出统计。
纯本地运行，数据只存在你自己的设备上，不上传任何服务器。

## 功能一览

| 模块 | 说明 |
|------|------|
| 看板 | 统计卡（衣物数/在途/待补尾款/累计支出）、到期提醒条、待办列表 |
| 衣柜 | 衣物卡片墙：照片、状态、所属娃娃、品牌、购入时间；分类支持多选，支持搜索与娃娃/状态/分类（可多选）筛选 |
| 娃娃 | 娃娃档案（名字/尺寸/状态/购入日期/购入金额/店名/照片/备注），按娃看衣物与支出 |
| 衣物详情 | 多张照片、品牌/店铺/单号、状态（在途/已到货/穿着中/出闲置中/已出）、标签备注 |
| 付款记录 | 每件衣物可记多笔：定金/尾款/补款/全款/邮费，自动计入支出统计 |
| 尾款/发货提醒 | 补款、发货等事项；支持"N 个工作日 → 到期日"自动换算（跳过周末，并提示约等于几个月） |
| 统计 | 近 12 个月支出柱状、按分类、按娃娃汇总 |
| 备份 | 一键导出 JSON（可选含照片）、导入恢复 |

## 使用方式（手机）

### 方案 A：本地局域网预览（最快）
电脑和手机连同一个 WiFi：
1. 在项目目录启动静态服务器，例如：`python -m http.server 8017`
2. 手机浏览器访问 `http://电脑局域网IP:8017`
3. 可"添加到主屏幕"（Safari/Chrome 均可），之后从主屏幕图标进入

局限：电脑关机后不可用；Service Worker 离线缓存需要 HTTPS 或 localhost 才生效。

### 方案 B：部署到免费静态托管（推荐长期用）
把整个 `bjd-wardrobe` 文件夹里的文件上传到任意静态托管即可：
- Vercel / Netlify：直接拖拽文件夹上传
- GitHub Pages：仓库根目录放这些文件，开启 Pages
- 腾讯云 COS / 阿里云 OSS：开启静态网站托管后上传

部署成功后手机打开网址，再"添加到主屏幕"，即获得接近 App 的体验。

## 数据与隐私

- 数据保存在当前浏览器本地（IndexedDB + localStorage）
- 换手机 / 清浏览器缓存前，务必在「设置」里先导出备份
- 删除应用数据或换浏览器 = 数据消失，请保管好导出的 JSON 文件
- 纯本地网页无法在应用完全关闭时后台推送通知；打开应用时看板顶部会醒目提示到期事项

## 开发与维护

文件结构：
```
index.html           页面骨架
css/style.css        样式
js/utils.js          日期/工作日换算等工具
js/db.js             localStorage + IndexedDB 封装
js/ui.js             模态框/提示
js/app.js            主逻辑
manifest.webmanifest PWA 清单
sw.js                离线缓存
icons/               应用图标
```

工作日换算规则：从起始日次日开始，跳过周六周日累计 N 个工作日；显示时按每周 5/7 估算自然日并换算成"约 X 个月"，法定节假日未扣除，仅供参考，请以商家公告为准。
*（内容由AI生成，仅供参考）*
