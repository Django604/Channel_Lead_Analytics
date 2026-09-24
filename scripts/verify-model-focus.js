const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.message);
        return;
      }
      response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
      response.end(content);
    });
  });
}

async function readMetricValue(page) {
  const text = await page.locator("#focusMetricRail .metric-card-value").first().innerText();
  return Number(text.replace(/,/g, ""));
}

async function verifyIntroGuide(page) {
  const steps = [
    { title: "数营总览", target: '[data-ui-context="home"] [data-ui-route="home"]' },
    { title: "区域分析", target: '[data-ui-context="home"] [data-ui-route="area"]' },
    { title: "专店聚焦", target: '[data-ui-context="home"] [data-ui-route="dealer-focus"]' },
    { title: "成本计算器", target: '[data-ui-context="home"] [data-ui-route="cost-calculator"]' },
    { title: "图表生成", target: '[data-ui-context="home"] [data-ui-route="chart-studio"]' },
    { title: "车型分析", target: '[data-ui-context="home"] [data-ui-route="model"]' },
    { title: "上传你的第一份数据，开始使用吧！", target: "#uploadTrigger" },
  ];
  await page.locator("#introGuide:not(.is-hidden)").waitFor({ timeout: 120000 });
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    await page.waitForTimeout(260);
    assert.equal(await page.locator("#introGuideKicker").innerText(), `${index + 1} / ${steps.length}`);
    assert.equal(await page.locator("#introGuideTitle").innerText(), step.title);
    const [spot, target] = await Promise.all([
      page.locator("#introGuideSpot").boundingBox(),
      page.locator(step.target).boundingBox(),
    ]);
    assert.ok(spot && target, `${step.title} 应存在可见引导目标`);
    assert.ok(spot.x <= target.x && spot.y <= target.y, `${step.title} 的高亮框应覆盖目标左上角`);
    assert.ok(
      spot.x + spot.width >= target.x + target.width && spot.y + spot.height >= target.y + target.height,
      `${step.title} 的高亮框应完整覆盖目标`
    );
    if (index < steps.length - 1) await page.locator("#introGuideNext").click();
  }
  assert.equal(await page.locator("#introGuideNext").innerText(), "上传 Excel");
  await page.locator("#introGuideNext").click();
  await page.locator("#uploadModal.is-open").waitFor();
  assert.ok(await page.locator("#introGuide").evaluate((element) => element.classList.contains("is-hidden")));
  await page.locator("#uploadModalCancel").click();
  console.log("侧边栏引导与最终上传入口验证通过。");
}

async function verifyMetricFunnelLayout(page) {
  await page.evaluate(() => { window.location.hash = "#chart-studio"; });
  await page.waitForURL(/#chart-studio$/);
  await page.locator("#chartStudioSection:not(.is-hidden)").waitFor();
  await page.locator("#addChartCanvasBtn").click();
  const card = page.locator("[data-chart-canvas-id]").last();
  await card.locator('[data-chart-control="type"]').selectOption("metric-funnel");
  await card.locator('[data-action="toggle-chart-axis-picker"][data-chart-axis="y"]').click();
  const metricKeys = [
    "newLead",
    "validLead",
    "newStoreVisit",
    "validTestDrive",
    "lockOrder",
    "leadToStoreRate",
    "leadToDriveRate",
    "leadToLockRate",
  ];
  for (const metricKey of metricKeys) {
    await card.locator(`[data-chart-axis-library="y"] [data-chart-field-key="${metricKey}"]`).click();
  }
  await page.waitForTimeout(420);
  const result = await card.evaluate((element) => {
    const dom = element.querySelector("[id^='chartStudioCanvas-']");
    const chart = window.echarts.getInstanceByDom(dom);
    const option = chart.getOption();
    const funnel = option.series.find((series) => series.type === "funnel");
    const graphicTexts = [];
    const graphicRects = [];
    const collectText = (element) => {
      if (element?.style?.text) graphicTexts.push(element.style.text);
      if (element?.type === "rect" && element?.shape?.width) graphicRects.push(element.shape);
      (element?.children || element?.elements || []).forEach(collectText);
    };
    (option.graphic || []).forEach(collectText);
    const renderedRateCards = chart.getZr().storage.getDisplayList()
      .filter((element) => element.type === "rect" && element.shape?.width >= 198 && element.shape?.height >= 52 && element.shape?.height <= 64)
      .map((element) => {
        const bounds = element.getBoundingRect().clone();
        bounds.applyTransform(element.getComputedTransform());
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      });
    return {
      funnelNames: (funnel?.data || []).map((item) => item.name),
      funnelLeft: funnel?.left,
      funnelWidth: funnel?.width,
      funnelTop: funnel?.top,
      funnelBottom: funnel?.bottom,
      graphicTexts,
      graphicRects,
      renderedRateCards,
      graphicCount: (option.graphic || []).length,
      canvasHeight: dom.clientHeight,
    };
  });
  assert.deepEqual(result.funnelNames, ["新增线索量", "有效线索量", "新增到店量", "有效试驾量", "锁单量"]);
  assert.ok(result.funnelNames.every((name) => !name.includes("率")), "转化率不应成为漏斗阶段");
  assert.equal(result.funnelLeft, "5%");
  assert.equal(result.funnelWidth, "62%");
  assert.equal(result.graphicCount, 1, "指标漏斗右侧应生成一个转化效率面板");
  ["线索-到店率", "线索-试驾率", "线索-锁单率"].forEach((label) => {
    assert.ok(result.graphicTexts.includes(label), `右侧转化效率面板应显示${label}`);
  });
  assert.equal(result.graphicTexts.filter((text) => /%$/.test(text)).length, 3, "右侧应显示三个百分比值");
  const rateCards = result.graphicRects.filter((shape) => shape.width >= 198 && shape.height >= 52 && shape.height <= 64);
  assert.equal(rateCards.length, 3, "右侧应显示三张放大的转化效率卡片");
  assert.ok(rateCards.every((shape) => shape.width >= 198), "转化效率卡片应放大展示");
  assert.equal(result.renderedRateCards.length, 3, "应渲染三张可见的转化效率卡片");
  const stageHeight = (result.canvasHeight - result.funnelTop - result.funnelBottom - 3 * (result.funnelNames.length - 1)) / result.funnelNames.length;
  [2, 3, 4].forEach((stageIndex, index) => {
    const expectedCenter = result.funnelTop + stageIndex * (stageHeight + 3) + stageHeight / 2;
    const cardCenter = result.renderedRateCards[index].y + result.renderedRateCards[index].height / 2;
    assert.ok(Math.abs(cardCenter - expectedCenter) < 0.6, `${result.funnelNames[stageIndex]}右侧的转化效率卡片应与该阶段居中对齐`);
  });
  console.log("指标漏斗数量阶段与右侧转化效率验证通过。");
}

async function verifyWaterfallChart(page) {
  await page.locator("#addChartCanvasBtn").click();
  const card = page.locator("[data-chart-canvas-id]").last();
  await card.locator('[data-chart-control="type"]').selectOption("waterfall");
  await card.locator('[data-action="toggle-chart-axis-picker"][data-chart-axis="x"]').click();
  await card.locator('[data-chart-axis-library="x"] [data-chart-field-key="channel"]').click();
  await card.locator('[data-action="toggle-chart-axis-picker"][data-chart-axis="y"]').click();
  await card.locator('[data-chart-axis-library="y"] [data-chart-field-key="newLead"]').click();
  await page.waitForTimeout(420);
  const result = await card.evaluate((element) => {
    const dom = element.querySelector("[id^='chartStudioCanvas-']");
    const option = window.echarts.getInstanceByDom(dom).getOption();
    const categories = option.xAxis?.[0]?.data || [];
    const getSeries = (name) => option.series.find((series) => series.name === name);
    return {
      categories,
      seriesNames: option.series.map((series) => series.name),
      increase: getSeries("增加")?.data || [],
      decrease: getSeries("减少")?.data || [],
      connector: getSeries("连接线")?.data || [],
      increaseColor: getSeries("增加")?.itemStyle?.color,
      decreaseColor: getSeries("减少")?.itemStyle?.color,
      connectorColor: getSeries("连接线")?.lineStyle?.color,
    };
  });
  assert.ok(result.categories.length > 1, "瀑布图应包含多个分类台阶");
  assert.ok(!result.categories.includes("合计"), "Excel 风格瀑布图不应自动追加合计柱");
  assert.deepEqual(result.seriesNames, ["辅助", "连接线", "增加", "减少"]);
  assert.equal(result.increaseColor, "#2563eb");
  assert.equal(result.decreaseColor, "#c3002f");
  assert.equal(result.connectorColor, "#b8c3cf");
  assert.equal(result.connector.length, result.categories.length, "每个瀑布台阶都应具有累计连接点");
  assert.equal(await card.locator(".chart-color-option").count(), 2, "瀑布图颜色面板应提供增加与减少两个颜色项");
  console.log("Excel 风格瀑布图台阶、连接线与配色验证通过。");
}

async function verifyCostCalculator(page) {
  await page.evaluate(() => { window.location.hash = "#cost-calculator"; });
  await page.waitForURL(/#cost-calculator$/);
  await page.locator("#costCalculatorSection:not(.is-hidden)").waitFor();
  assert.equal(await page.locator("#uiSidebarBrandName").innerText(), "成本计算器");
  assert.equal(await page.locator('[data-ui-context="home"] .ui-sidebar-link.is-active').count(), 1, "成本页侧栏只能高亮一个入口");
  assert.ok(await page.locator('[data-ui-route="cost-calculator"]').evaluate((link) => link.classList.contains("is-active")), "成本页应高亮成本计算器入口");
  assert.ok(!(await page.locator('[data-ui-context="home"] [data-ui-route="home"]').evaluate((link) => link.classList.contains("is-active"))), "成本页不应继续高亮数营总览");
  assert.equal(await page.locator('#costCalculatorModelSelect option[value="全部"]').innerText(), "全车系（不含探陆）");
  assert.equal(await page.locator("#costCalculatorModelSelect").inputValue(), "全部");
  assert.deepEqual(
    await page.locator("#costCalculatorTableMount tbody .cost-table-channel").allTextContents(),
    ["R3", "R4", "R5", "R6", "R8车巡展", "R8商超", "R10", "R11"],
    "成本计算器应拆分展示 R8 车巡展和商超"
  );
  assert.equal(await page.locator("#costMethodList [data-cost-method]").count(), 6);
  await page.locator('#costMethodList [data-cost-method="CPT"]').click();
  assert.match(await page.locator("#costFormulaText").innerText(), /^CPT = 渠道费用 ÷ 渠道新增到店量$/);
  assert.ok(
    (await page.locator("#costCalculatorTableMount .cost-performance span").first().innerText()) === "新增到店量",
    "CPT 应使用新增到店量作为实绩"
  );

  const dateState = await page.locator("#startDate").evaluate((start, endSelector) => {
    const end = document.querySelector(endSelector);
    return { min: start.min, max: start.max, start: start.value, end: end?.value || "" };
  }, "#endDate");
  if (dateState.min && dateState.max) {
    const targetDate = dateState.start === dateState.min && dateState.end === dateState.min ? dateState.max : dateState.min;
    await page.locator("#startDate").fill(targetDate);
    await page.locator("#endDate").fill(targetDate);
    await page.locator("#startDate").dispatchEvent("change");
    await page.locator("#endDate").dispatchEvent("change");
    const beforeCount = await page.locator("#costCalculatorTableMount .cost-period-head").count();
    await page.locator("#addCostPeriodBtn").click();
    assert.equal(await page.locator("#costCalculatorTableMount .cost-period-head").count(), beforeCount + 1, "应向右新增时间范围");
  }

  await page.locator("#openCostFeeModalBtn").click();
  await page.locator("#costFeeModal.is-open").waitFor();
  const periodOptions = await page.locator("#costFeePeriodSelect option").count();
  await page.locator("#costFeePeriodSelect").selectOption({ index: periodOptions - 1 });
  await page.locator("#costFeePasteInput").fill([
    "R3\t2,777,483",
    "R4\t44,214,168",
    "R5\t4,260,000",
    "R6\t27,712,844",
    "R8车巡展\t19,901,822",
    "R8商超\t10,000,000",
    "\t6,800,000",
    "R10\t55,956,038",
    "R11\t5,776,374",
    "R1\t99,999",
  ].join("\n"));
  assert.match(await page.locator("#costFeePastePreview").innerText(), /识别 8 个成本渠道/);
  assert.match(await page.locator("#costFeePastePreview").innerText(), /已忽略 2 行/);
  await page.locator("#applyCostFeesBtn").click();
  await page.locator("#costFeeModal").waitFor({ state: "hidden" });
  const r3Row = page.locator("#costCalculatorTableMount tbody tr").filter({ has: page.locator("th", { hasText: /^R3$/ }) });
  assert.equal(await r3Row.locator(".cost-fee-input").last().inputValue(), "2777483");
  const r8ExhibitionRow = page.locator("#costCalculatorTableMount tbody tr").filter({ has: page.locator("th", { hasText: /^R8车巡展$/ }) });
  const r8MallRow = page.locator("#costCalculatorTableMount tbody tr").filter({ has: page.locator("th", { hasText: /^R8商超$/ }) });
  assert.equal(await r8ExhibitionRow.locator(".cost-fee-input").last().inputValue(), "19901822");
  assert.equal(await r8MallRow.locator(".cost-fee-input").last().inputValue(), "10000000");
  const performance = Number((await r3Row.locator(".cost-performance strong").last().innerText()).replace(/,/g, ""));
  if (performance > 0) assert.match(await r3Row.locator(".cost-result strong").last().innerText(), /^¥/);
  console.log("成本计算器渠道范围、CPT、时间对比及 Excel 费用粘贴验证通过。");
}

async function main() {
  const uploadFiles = process.argv.slice(2).map((filePath) => path.resolve(filePath));
  uploadFiles.forEach((filePath) => assert.ok(fs.existsSync(filePath), `文件不存在：${filePath}`));
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`http://127.0.0.1:${port}/index.html#home`, {
      waitUntil: "load",
      timeout: 120000,
    });
    await page.waitForFunction(() => document.querySelector("#computeStatusText")?.textContent.includes("计算完成"));
    await verifyIntroGuide(page);
    await verifyMetricFunnelLayout(page);
    await verifyWaterfallChart(page);
    await verifyCostCalculator(page);
    await page.evaluate(() => { window.location.hash = "#model-drill?model=N7"; });
    await page.waitForURL(/#model-drill\?model=N7$/);
    await page.waitForFunction(() =>
      document.querySelector("#computeStatusText")?.textContent.includes("计算完成") &&
      document.querySelector("#drillViewTitle")?.textContent.trim() === "N7 车型分析"
    );

    if (uploadFiles.length) {
      await page.locator("#uploadTrigger").click();
      await page.locator("#fileInput").setInputFiles(uploadFiles);
      await page.locator("#uploadStartBtn").click();
      await page.locator("#uploadFeedback.is-success").waitFor({ timeout: 240000 });
      await page.waitForFunction(() => document.querySelector("#computeStatusText")?.textContent.includes("计算完成"));
    }

    const visibleModels = await page.locator("#modelSelect option").evaluateAll((options) =>
      options.map((option) => option.value).filter((value) => value && value !== "全部")
    );
    assert.ok(visibleModels.length > 1, "默认统计口径应保留多个 NEV 车型");
    assert.ok(visibleModels.every((model) => !model.includes("探陆")), "探陆相关车型不应出现在固定统计口径中");
    const sourceNote = await page.locator("#sourceNote").innerText();
    assert.match(sourceNote, /固定口径：排除探陆相关车型（[\d,]+ 行）/);
    if (uploadFiles.length) {
      const excludedRowCount = Number(sourceNote.match(/排除探陆相关车型（([\d,]+) 行）/)?.[1].replace(/,/g, "") || 0);
      assert.ok(excludedRowCount > 0, "实测文件应命中并排除探陆相关数据");
    }

    assert.equal(await page.locator("#modelSelect").inputValue(), "N7");
    assert.match(await page.locator("#drillViewTitle").innerText(), /^N7 车型分析$/);
    assert.match(await page.locator("#uiSidebarBrandName").innerText(), /^N7 车型分析$/);
    assert.ok(await readMetricValue(page) > 0, "N7 指标应大于 0");

    await page.locator("#modelSelect").selectOption("N6");
    await page.waitForURL(/#model-drill\?model=N6$/);
    await page.waitForFunction(() =>
      document.querySelector("#computeStatusText")?.textContent.includes("计算完成") &&
      document.querySelector("#drillViewTitle")?.textContent.trim() === "N6 车型分析"
    );

    assert.equal(await page.locator("#modelSelect").inputValue(), "N6");
    assert.match(await page.locator("#uiSidebarBrandName").innerText(), /^N6 车型分析$/);
    assert.ok(await readMetricValue(page) > 0, "切换到 N6 后指标不应归零");
    assert.match(await page.locator("#analysisCapsule").innerText(), /^N6 ·/);
    assert.match(await page.locator("#drillBreadcrumb .crumb.is-fixed").innerText(), /车型：N6/);
    if (uploadFiles.length) {
      for (const model of visibleModels) {
        await page.locator("#modelSelect").selectOption(model);
        await page.waitForFunction(
          (expectedModel) =>
            document.querySelector("#computeStatusText")?.textContent.includes("计算完成") &&
            document.querySelector("#drillViewTitle")?.textContent.trim() === `${expectedModel} 车型分析`,
          model
        );
        assert.ok(await readMetricValue(page) > 0, `${model} 指标应大于 0`);
      }
      console.log(`上传数据车型验证通过：${visibleModels.join("、")}`);
    }

    await page.locator("#modelSelect").selectOption("全部");
    await page.waitForFunction(() => decodeURIComponent(window.location.hash) === "#model-drill?model=全部");
    await page.evaluate(() => { window.location.hash = "#area"; });
    await page.waitForURL(/#area$/);
    try {
      await page.waitForFunction(() =>
        document.querySelector("#computeStatusText")?.textContent.includes("计算完成") &&
        (
          window.echarts?.getInstanceByDom(document.querySelector("#areaRankingChart")) ||
          document.querySelector("#areaRankingChart")?.textContent.includes("当前数据未提供大区维度")
        )
      );
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        computeStatus: document.querySelector("#computeStatusText")?.textContent || "",
        areaContent: document.querySelector("#areaRankingChart")?.textContent || "",
        areaHidden: document.querySelector("#areaSection")?.classList.contains("is-hidden"),
      }));
      throw new Error(`${error.message}\n区域图诊断：${JSON.stringify(diagnostics)}\n页面错误：${pageErrors.join(" | ")}`);
    }
    const hasAreaChart = await page.evaluate(() => Boolean(
      window.echarts.getInstanceByDom(document.querySelector("#areaRankingChart"))
    ));
    if (!hasAreaChart) {
      assert.equal(uploadFiles.length, 0, "实测文件应生成区域车型堆积图");
    } else {
      const areaChart = await page.evaluate(() => {
        const chart = window.echarts.getInstanceByDom(document.querySelector("#areaRankingChart"));
        const option = chart.getOption();
        const panels = [...document.querySelectorAll("#areaSection .area-analysis-grid > .panel")];
        return {
          title: document.querySelector("#areaChartTitle")?.textContent || "",
          note: document.querySelector("#areaSection .panel-note")?.textContent || "",
          rankingPanelWidth: panels[0]?.getBoundingClientRect().width || 0,
          detailPanelWidth: panels[1]?.getBoundingClientRect().width || 0,
          categories: option.yAxis?.[0]?.data || [],
          series: (option.series || []).map((series) => ({
            name: series.name,
            type: series.type,
            stack: series.stack,
            color: series.itemStyle?.color || "",
            data: (series.data || []).map((item) => item?.value ?? item),
            displayValues: (series.data || []).map((item) => item?.displayValue || ""),
            labelVisibility: (series.data || []).map((item) => item?.label?.show ?? true),
            labelPositions: (series.data || []).map((item) => item?.label?.position || series.label?.position || ""),
            labelFontSizes: (series.data || []).map((item) => item?.label?.fontSize || series.label?.fontSize || 0),
          })),
        };
      });
      const stackedSeries = areaChart.series.filter((series) => series.type === "bar");
      const totalSeries = areaChart.series.find((series) => series.type === "scatter" && series.name === "合计");
      assert.match(areaChart.title, /车型堆积/);
      assert.match(areaChart.note, /柱形按车型堆积/);
      assert.ok(areaChart.rankingPanelWidth >= 550, `大区排名面板应向右扩展，当前宽度 ${areaChart.rankingPanelWidth}px`);
      assert.ok(areaChart.rankingPanelWidth / areaChart.detailPanelWidth >= 0.68, "大区排名与小区明细的宽度比例应更均衡");
      assert.ok(areaChart.categories.length > 1, "区域排名应包含多个大区");
      assert.ok(stackedSeries.length > 1, "区域排名应按多个车型生成堆积系列");
      assert.ok(stackedSeries.every((series) => series.stack === "area-models"), "车型系列应使用同一堆积组");
      assert.ok(stackedSeries.every((series) => !series.name.includes("探陆")), "区域堆积图不应包含探陆车型");
      assert.ok(totalSeries, "区域堆积图应保留合计标签系列");
      const expectedColors = {
        NX8: "#405a70",
        "天籁·鸿蒙座舱": "#876477",
        N7: "#c3002f",
        N6: "#b7791f",
        未标注车型: "#8793a1",
      };
      stackedSeries.forEach((series) => {
        if (expectedColors[series.name]) assert.equal(series.color, expectedColors[series.name], `${series.name} 应使用页面综合色调`);
      });
      assert.ok(
        totalSeries.displayValues.every((value) => !value || /^-?[\d.]+K?$/.test(value)),
        "区域合计应使用 K 单位的紧凑数字格式"
      );
      if (uploadFiles.length) {
        stackedSeries.forEach((series) => {
          series.data.forEach((value, index) => {
            if (Number(value) > 0) assert.equal(series.labelVisibility[index], true, `${series.name} 的非零分段应完整显示数字`);
          });
        });
        stackedSeries.forEach((series) => {
          series.data.forEach((value, index) => {
            if (Number(value) <= 0) return;
            assert.equal(series.labelPositions[index], "inside", `${series.name} 的非零分段数字应固定显示在柱内`);
            assert.ok(
              series.labelFontSizes[index] >= 7 && series.labelFontSizes[index] <= 9,
              `${series.name} 的柱内数字字号应在 7px 至 9px 之间`
            );
          });
        });
      }
      areaChart.categories.forEach((_, index) => {
        const stackedTotal = stackedSeries.reduce((sum, series) => sum + Number(series.data[index] || 0), 0);
        const displayedTotal = Number(totalSeries.data[index]?.[0] || 0);
        assert.equal(stackedTotal, displayedTotal, `第 ${index + 1} 个大区的车型堆积合计应一致`);
      });
    }
    assert.deepEqual(pageErrors, []);
    console.log("车型切换、探陆固定排除与区域车型堆积验证通过。");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
