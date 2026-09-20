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

    await page.goto(`http://127.0.0.1:${port}/index.html#model-drill?model=N7`, {
      waitUntil: "load",
      timeout: 120000,
    });
    await page.waitForFunction(() => document.querySelector("#computeStatusText")?.textContent.includes("计算完成"));

    if (uploadFiles.length) {
      if (await page.locator("#introGuide:not(.is-hidden)").count()) {
        await page.locator("#introGuideSkip").click();
      }
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
        return {
          title: document.querySelector("#areaChartTitle")?.textContent || "",
          note: document.querySelector("#areaSection .panel-note")?.textContent || "",
          categories: option.yAxis?.[0]?.data || [],
          series: (option.series || []).map((series) => ({
            name: series.name,
            type: series.type,
            stack: series.stack,
            data: (series.data || []).map((item) => item?.value ?? item),
          })),
        };
      });
      const stackedSeries = areaChart.series.filter((series) => series.type === "bar");
      const totalSeries = areaChart.series.find((series) => series.type === "scatter" && series.name === "合计");
      assert.match(areaChart.title, /车型堆积/);
      assert.match(areaChart.note, /柱形按车型堆积/);
      assert.ok(areaChart.categories.length > 1, "区域排名应包含多个大区");
      assert.ok(stackedSeries.length > 1, "区域排名应按多个车型生成堆积系列");
      assert.ok(stackedSeries.every((series) => series.stack === "area-models"), "车型系列应使用同一堆积组");
      assert.ok(stackedSeries.every((series) => !series.name.includes("探陆")), "区域堆积图不应包含探陆车型");
      assert.ok(totalSeries, "区域堆积图应保留合计标签系列");
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
