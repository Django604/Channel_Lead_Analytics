# Channel Lead Analytics

东风日产渠道线索分析静态网站。仓库只包含网站本体，不包含默认业务数据、Excel 模板或上传文件。

## 在线站点

- GitHub Pages：`https://django604.github.io/Channel_Lead_Analytics/`
- Cloudflare Pages：`https://django604-channel-lead-analytics.pages.dev/`

## 数据说明

- 首次打开为空数据状态，需要点击“上传 Excel”加载数据。
- 支持 `.xlsx` / `.xls`、拖拽上传、多文件同级数据合并和按表头名称识别字段。
- 当前固定统计口径会排除车型名称中包含“探陆”的全部记录；上传反馈会同时显示源数据行数、参与统计行数和排除行数。
- 区域分析的大区排名按车型堆积展示，并在柱形末端保留大区合计；所有非零分段数字固定显示在对应色块内，并按分段宽度自适应字号，未标注车型的有效数据单列为“未标注车型”。
- Excel 由浏览器本地解析，文件不会上传到 GitHub 或 Cloudflare。
- 浏览器会将最近一次成功解析的数据保存在当前设备的 IndexedDB；更换设备或清理站点数据后需要重新上传。

## 发布方式

推送 `main` 分支后，两个独立 GitHub Actions 工作流分别部署 GitHub Pages 与 Cloudflare Pages。项目不包含定时取数或自动更新任务。

Cloudflare 工作流会自动创建 Pages 项目；新仓库只需配置 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 两个 Actions Secret。
