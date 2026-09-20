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
      const models = await page.locator("#modelSelect option").evaluateAll((options) =>
        options.map((option) => option.value).filter((value) => value && value !== "全部")
      );
      for (const model of models) {
        await page.locator("#modelSelect").selectOption(model);
        await page.waitForFunction(
          (expectedModel) =>
            document.querySelector("#computeStatusText")?.textContent.includes("计算完成") &&
            document.querySelector("#drillViewTitle")?.textContent.trim() === `${expectedModel} 车型分析`,
          model
        );
        assert.ok(await readMetricValue(page) > 0, `${model} 指标应大于 0`);
      }
      console.log(`上传数据车型验证通过：${models.join("、")}`);
    }
    assert.deepEqual(pageErrors, []);
    console.log("车型切换验证通过：N7 → N6，路由、标题、筛选与指标保持一致。");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
