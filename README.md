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
- 图表生成的指标漏斗仅使用数量指标绘制漏斗阶段；所选到店率、试驾率、锁单率等转化效率放大显示在漏斗右侧，并与对应的到店、有效试驾和锁单阶段对齐。
- 图表生成支持 Excel 式瀑布图：按分类依次累计第一项数量指标，用蓝色台阶柱与连接线展示承接关系，负数项使用红色向下展示。
- 成本计算器默认统计除探陆外全车系，只展示 R3、R4、R5、R6、R8车巡展、R8商超、R10、R11 八个成本渠道；支持 CPL、CPQL、CPT、CPTD、CPO、CPS 六种费用/实绩口径、多个时间范围横向对比，以及从 Excel 直接粘贴“渠道 + 费用”两列数据。
- Excel 由浏览器本地解析，文件不会上传到 GitHub 或 Cloudflare。
- 浏览器会将最近一次成功解析的数据保存在当前设备的 IndexedDB；更换设备或清理站点数据后需要重新上传。

## 发布方式

推送 `main` 分支后，两个独立 GitHub Actions 工作流分别部署 GitHub Pages 与 Cloudflare Pages。项目不包含定时取数或自动更新任务。

Cloudflare 工作流会自动创建 Pages 项目；新仓库只需配置 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 两个 Actions Secret。
