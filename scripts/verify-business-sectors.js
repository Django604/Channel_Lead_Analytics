const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const XLSX = require("xlsx");

// Execute the page's actual import, cache and workspace functions. Only the DOM,
// IndexedDB transport and chart painting are substituted; business code is shared.
const html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find((match) => match[1].includes("const METRICS"))[1];
new vm.Script(inline);
const markup = html.slice(0, html.indexOf("<script"));
const startupIds = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(startupIds).size, startupIds.length, "Static element IDs must be unique");
const elementsDeclaration = inline.match(/const els = \{[\s\S]*?\r?\n        \};/)[0];
for (const match of elementsDeclaration.matchAll(/document\.getElementById\("([^"]+)"\)/g)) {
  assert.ok(startupIds.includes(match[1]), `Missing startup element: ${match[1]}`);
}

class Element {
  constructor(tag = "DIV", id = "") {
    this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.dataset = {};
    this._value = null; this._html = ""; this.hidden = true; this.attributes = {}; this.style = {};
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  get options() { return this.children.filter((child) => child.tagName === "OPTION"); }
  get selectedOptions() { return this.options.filter((child) => child.value === this.value || child.selected); }
  get value() {
    if (this.tagName !== "SELECT") return this._value || "";
    if (this._value === null) return this.options[0]?.value || "";
    return this.options.some((item) => item.value === this._value) ? this._value : "";
  }
  set value(value) { this._value = String(value); }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = value; this.children = []; if (this.tagName === "SELECT") this._value = null; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  matches(selector) { return selector === ".compare-model-options" && this.id === "compareModelSelect"; }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
    if (selector === "*") return descendants;
    if (selector.startsWith('input[type="checkbox"]')) return descendants.filter((child) => child.tagName === "INPUT" && child.type === "checkbox" && (!selector.endsWith(":checked") || child.checked));
    if (selector === "[data-business]") return descendants.filter((child) => child.dataset.business);
    return [];
  }
  querySelector(selector) { return this.children.find((child) => selector === "[data-business-upload-status]" ? child.dataset.businessUploadStatus : child.tagName === selector.toUpperCase()) || null; }
  focus() {}
  addEventListener() {}
}

function fakeIndexedDB(records) {
  const db = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction() {
      const transaction = { objectStore: () => ({
        get(key) {
          const request = {};
          queueMicrotask(() => { request.result = structuredClone(records.get(key)); request.onsuccess?.(); transaction.oncomplete?.(); });
          return request;
        },
        put(value, key) { records.set(key, structuredClone(value)); queueMicrotask(() => transaction.oncomplete?.()); },
        delete(key) { records.delete(key); queueMicrotask(() => transaction.oncomplete?.()); },
      }) };
      return transaction;
    },
  };
  return { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } };
}

function createApp(records = new Map()) {
  const nodes = new Map();
  const selectIds = new Set([...html.matchAll(/<select\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]));
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element(selectIds.has(id) ? "SELECT" : "DIV", id)); return nodes.get(id); };
  for (const business of ["NEV", "ICE"]) {
    const button = new Element("BUTTON"); button.dataset.business = business; node("businessSwitch").appendChild(button);
    const status = new Element("SPAN"); status.dataset.businessUploadStatus = business; node(`${business.toLowerCase()}UploadPanel`).appendChild(status);
  }
  const document = { getElementById: node, createElement: (tag) => new Element(tag), querySelector: () => new Element(), querySelectorAll: () => [], body: new Element() };
  const window = { REPORT_DATA: { rows: [], schema: ["newLead", "validLead", "newStoreVisit", "validTestDrive", "bigOrder", "lockOrder", "delivery"], generatedAt: "", sourceFile: "", rowCount: 0, availableDimensions: [] }, indexedDB: fakeIndexedDB(records), location: { hash: "#home", href: "http://localhost/" } };
  window.history = { replaceState: (_a, _b, hash) => { window.location.hash = hash; } };
  const context = vm.createContext({ structuredClone, TextDecoder, TextEncoder, URL, URLSearchParams, Uint8Array, ArrayBuffer, Blob, XLSX, setTimeout, clearTimeout, console: { warn() {}, log() {} }, performance, document, window, indexedDB: window.indexedDB, requestAnimationFrame: (callback) => callback() });
  const exports = ["state", "els", "ICE_MODEL_NAMES", "METRICS", "CHART_STUDIO_CALCULATED_METRICS", "getDatasetHeaderFields", "cleanUploadedChannel", "cleanUploadedModel", "getUploadMonth", "buildDatasetFromWorkbook", "buildDatasetFromWorkbookFiles", "mergeDatasets", "decodeDataset", "createExcelUploadWorkerSource", "parseUploadedFilesOnMainThread", "processUploadedFiles", "initDataset", "bootDataset", "activateBusiness", "captureBusinessWorkspace", "getUploadWorkspace", "getUploadPanelElements", "selectUploadFiles", "removePendingUploadFile", "clearDatasetCache", "readDatasetCache", "saveDatasetCache", "getChartStudioMetricKeys", "getDealerFocusRows", "getAreaMetricKeys", "getMainFilters", "filterRowsByFilters", "getCostMethods", "getCostChannels", "normalizeCostChannel", "parseCostFeePaste", "formatDimensionValue", "getCostPeriodSummaries", "captureCostPeriodFromMainRange", "getDealerFocusBaseRows", "computeSummaryFromRows", "renderSubregionTable", "renderAreaChannelTable", "renderDrillDetailTable", "getBusinessDefaultStages", "resetBusinessDataset", "getDailySeries"];
  exports.push("ICE_DISPLAY_MODELS", "getDisplayedModels", "getDefaultOverviewModels", "getDefaultCompareModels", "getDealerFocusDimensionValues", "summarizeByDimension", "computeViewModel", "computeAreaViewModel", "renderAreaRankingChart", "renderCostCalculator", "createDefaultChartCanvas", "normalizeChartCanvasConfig", "computeChartStudioData", "buildChartStudioDataView", "getChartStudioCanvasError", "syncFocusedModel", "applyRoute");
  const instrumented = inline.replace("        bindEvents();", `
    globalThis.app = {${exports.join(",")}};
    renderAll = () => { renderBusinessControls(); };
    showUploadWorkspaceLoading = () => {};
    setComputeState = () => {};
    showToast = () => {};
  `).replace("        bootDataset();", "");
  vm.runInContext(instrumented, context);
  return { app: context.app, context, records, window };
}

const iceHeaders = ["大区", "小区", "专营店名称", "专营店编码", "集团名称", "车系名称", "渠道", "大项目名", "媒体名称", "线索总量", "有效线索量", "到店量", "订单总量", "成交量", "总交车量"];
const iceRows = [
  ["西区", "西一", "甲店", "A", "集团", "第七代天籁", "R6新媒体", "总部员工号-R5", "媒体", 10, 8, 4, 3, 2, 30],
  ["西区", "西一", "甲店", "A", "集团", "轩逸", "R6总部新媒体", "R5经销商", "媒体", 20, 12, 6, 5, 4, 30],
  ["东区", "东一", "乙店", "B", "集团", "探陆", "R3天网行动", "项目", "媒体", 5, 3, 1, 2, -1, 10],
];
const nevHeaders = ["日期", "大区", "小区", "专营店", "集团", "意向基准车系", "渠道", "大项目名", "媒体名称", "新增线索量", "有效线索量", "新增到店量", "有效试驾量", "大定量", "锁单量", "交车量"];
const nevRows = [
  ["2026-09-01", "西区", "西一", "甲店", "集团", "N7", "R6新媒体", "项目", "经销商直播", 50, 40, 20, 10, 8, 6, 4],
  ["2026-09-02", "东区", "东一", "乙店", "集团", "探陆", "R8线下活动", "商超", "媒体", 7, 5, 3, 2, 1, 1, 1],
];
function workbook(headers, rows) {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "明细"); return wb;
}
function file(name, wb) { const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }); return { name, size: bytes.length, lastModified: 1, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } }; }
const plain = (value) => JSON.parse(JSON.stringify(value));

async function verifyIceModelVisibility() {
  const fixture = createApp();
  const app = fixture.app;
  const expectedModels = ["十五代轩逸", "轩逸经典", "第14代轩逸", "P32S MC Refresh逍客", "P32R-e 奇骏经典", "P42R 探陆", "B12L 骐达"];
  const sourceModels = ["十五代轩逸", "轩逸", "第14代轩逸", "逍客", "奇骏", "探陆", "新骐达", "第七代天籁", "劲客", "未列入车型", ""];
  const sourceRows = sourceModels.map((model, index) => [index % 2 ? "西区" : "东区", "小区", "甲店", "A", "集团", model, "R3天网行动", "项目", "媒体", (index + 1) * 10, (index + 1) * 5, (index + 1) * 2, index + 1, 1, 30]);
  const sourceWb = workbook(iceHeaders, sourceRows);
  const september = await app.buildDatasetFromWorkbook(sourceWb, "ICE-2026-09.xlsx", { business: "ICE" });
  const august = await app.buildDatasetFromWorkbook(sourceWb, "ICE-2026-08.xlsx", { business: "ICE" });
  const raw = app.mergeDatasets([september, august]);
  const original = plain(raw);
  app.activateBusiness("ICE");
  app.initDataset(app.decodeDataset(raw, "展示名单测试"));
  assert.deepEqual(plain(app.ICE_DISPLAY_MODELS), expectedModels);
  assert.deepEqual(plain(app.getDisplayedModels()), expectedModels);
  assert.deepEqual(plain(app.els.modelSelect.options.map((option) => option.value)), ["全部", ...expectedModels]);
  assert.deepEqual(plain(app.els.compareModelSelect.querySelectorAll('input[type="checkbox"]').map((input) => input.value)), expectedModels);
  assert.deepEqual(plain(app.getDefaultOverviewModels()), expectedModels);
  assert.ok(app.getDefaultCompareModels().every((model) => expectedModels.includes(model)));
  assert.deepEqual(plain(app.getDealerFocusDimensionValues("model")), expectedModels);
  assert.match(app.els.metaModelCount.textContent, /展示 7 个 \/ 统计 10 个/);
  assert.equal(app.state.dataset.rowCount, 22);
  assert.equal(app.computeSummaryFromRows(app.filterRowsByFilters(app.state.dataset.rows, app.getMainFilters())).newLead, 1320);
  assert.equal(app.computeSummaryFromRows(app.state.dataset.rows).lockOrder, 22);
  const overview = app.computeViewModel({ includeFocus: false });
  assert.deepEqual(plain(overview.overviewModels.map((item) => item.name)), expectedModels);
  assert.equal(overview.overviewModels.reduce((sum, item) => sum + item.summary.newLead, 0), 560);
  assert.deepEqual(new Set(plain(app.summarizeByDimension(app.state.dataset.rows, [], "model").map((item) => item.name))), new Set(expectedModels));
  assert.equal(app.summarizeByDimension(app.state.dataset.rows, [], "channel")[0].summary.newLead, 1320);
  app.state.view = "cost-calculator";
  app.renderCostCalculator();
  assert.deepEqual(plain(app.els.costCalculatorModelSelect.options.map((option) => option.value)), ["全部", ...expectedModels]);
  assert.deepEqual(plain(app.getCostPeriodSummaries(app.state.costCalculator.periods[0])), { R3: 1320 });
  app.state.view = "home";

  const area = app.computeAreaViewModel();
  assert.equal(area.activeSummary.newLead, 1320);
  assert.equal(area.regionRows.reduce((sum, row) => sum + row.summary.newLead, 0), 1320);
  assert.deepEqual(plain(area.regionModelRows.map((row) => row.name)), expectedModels);
  fixture.context.areaChartStub = { off() {}, clear() {}, on() {}, dispose() {}, getDom: () => app.els.areaRankingChart, setOption(option) { this.option = option; } };
  fixture.context.echarts = { init: () => fixture.context.areaChartStub };
  app.renderAreaRankingChart(area);
  const areaOption = fixture.context.areaChartStub.option;
  assert.deepEqual(plain(areaOption.legend.data), expectedModels);
  assert.deepEqual(plain(areaOption.series.filter((series) => series.type === "bar").map((series) => series.name)), expectedModels);
  assert.equal(areaOption.series.find((series) => series.type === "scatter").data.reduce((sum, item) => sum + item.value[0], 0), 1320);
  assert.match(app.els.areaChartTitle.textContent, /合计含全部车型/);

  const chart = app.createDefaultChartCanvas(1);
  Object.assign(chart, { type: "bar", xFields: ["model"], yFields: ["newLead", "leadToStoreRate"], selectedCategories: null });
  app.normalizeChartCanvasConfig(chart);
  let chartData = app.computeChartStudioData(chart);
  assert.deepEqual(new Set(plain(chartData.rows.map((row) => row.name))), new Set(expectedModels));
  assert.deepEqual(new Set(plain(chartData.categoryOptions.map((option) => option.key))), new Set(expectedModels));
  assert.equal(chartData.filteredRowCount, 22);
  assert.equal(chartData.summary.newLead, 1320);
  assert.equal(chartData.summary.leadToStoreRate, 0.2);
  assert.equal(chartData.summaryIncludesHiddenModels, true);
  const allDataTable = app.buildChartStudioDataView(chart, chartData);
  assert.doesNotMatch(allDataTable, /L42P 天籁|P02F 劲客|未列入车型|未标注车型/);
  assert.match(allDataTable, /合计包含全部车型/);
  assert.match(allDataTable, /1,320/);
  chart.monthSplit = true;
  chartData = app.computeChartStudioData(chart);
  assert.equal(chartData.monthlySummaries["2026-08"].newLead, 660);
  assert.equal(chartData.monthlySummaries["2026-09"].newLead, 660);
  chart.selectedMonths = ["2026-09"];
  chartData = app.computeChartStudioData(chart);
  assert.equal(chartData.summary.newLead, 660); assert.equal(chartData.filteredRowCount, 11);
  assert.equal(chartData.rows.reduce((sum, row) => sum + row.values.newLead, 0), 280);
  chart.selectedCategories = ["十五代轩逸"];
  chartData = app.computeChartStudioData(chart);
  assert.deepEqual(plain(chartData.rows.map((row) => row.name)), ["十五代轩逸"]);
  assert.equal(chartData.summary.newLead, 10); assert.equal(chartData.summaryIncludesHiddenModels, false);
  chart.selectedCategories = [];
  assert.equal(app.computeChartStudioData(chart).summary.newLead, 0);
  chart.selectedCategories = ["L42P 天籁"];
  assert.equal(app.computeChartStudioData(chart).rows.length, 0);
  assert.equal(app.computeChartStudioData(chart).summary.newLead, 0);
  Object.assign(chart, { selectedCategories: null, selectedMonths: null, monthSplit: false, xFields: ["channel"] });
  app.normalizeChartCanvasConfig(chart);
  assert.equal(app.computeChartStudioData(chart).rows[0].values.newLead, 1320);
  Object.assign(chart, { xFields: ["newLead"], yFields: ["model"] });
  app.normalizeChartCanvasConfig(chart);
  assert.equal(app.computeChartStudioData(chart).rows.length, 7);
  assert.equal(app.computeChartStudioData(chart).summary.newLead, 1320);

  app.syncFocusedModel("L42P 天籁"); assert.equal(app.state.drill.model, "全部");
  fixture.window.location.hash = `#model-drill?model=${encodeURIComponent("L42P 天籁")}`;
  app.applyRoute(); assert.equal(app.state.view, "home");
  assert.deepEqual(plain(raw), original, "Display rules must not mutate source or cache data");
  await app.saveDatasetCache(raw, "ICE");
  const reloaded = createApp(fixture.records); await reloaded.app.bootDataset();
  reloaded.app.activateBusiness("ICE");
  assert.equal(reloaded.app.state.dataset.rowCount, 22);
  assert.equal(reloaded.app.computeSummaryFromRows(reloaded.app.state.dataset.rows).newLead, 1320);
  assert.deepEqual(plain(reloaded.app.getDisplayedModels()), expectedModels);

  // Hidden-only uploads retain totals and offer no hidden model choices.
  const hiddenOnly = await app.buildDatasetFromWorkbook(workbook(iceHeaders, sourceRows.slice(7)), "ICE-2026-09.xlsx", { business: "ICE" });
  app.initDataset(app.decodeDataset(hiddenOnly, "仅含隐藏车型"));
  assert.deepEqual(plain(app.getDisplayedModels()), []);
  assert.deepEqual(plain(app.getDefaultOverviewModels()), ["全部"]);
  assert.equal(app.computeViewModel({ includeFocus: false }).overviewModels[0].summary.newLead, 380);
  Object.assign(chart, { xFields: ["model"], yFields: ["newLead"] });
  app.normalizeChartCanvasConfig(chart);
  chartData = app.computeChartStudioData(chart);
  assert.equal(chartData.rows.length, 0); assert.equal(chartData.summary.newLead, 380);
  assert.match(app.getChartStudioCanvasError(chart, chartData), /数据仍计入全车型汇总/);
  assert.match(app.buildChartStudioDataView(chart, chartData), /380/);
  await app.processUploadedFiles([file("ICE-2026-09.xlsx", workbook(iceHeaders, sourceRows.slice(7)))], "ICE");
  const upload = app.getUploadWorkspace("ICE");
  assert.equal(upload.uploadStatus, "success");
  assert.doesNotMatch(upload.uploadSummary, /未列入车型/);
  assert.match(upload.uploadSummary, /未匹配车型 1 个，保留参与统计/);

  // NEV continues showing its own models, including models outside the ICE list.
  const nev = await app.buildDatasetFromWorkbook(workbook(nevHeaders, [nevRows[0], nevRows[0].map((value, index) => index === 5 ? "L42P 天籁" : value)]), "NEV.xlsx", { business: "NEV" });
  app.activateBusiness("NEV"); app.initDataset(app.decodeDataset(nev, "NEV"));
  assert.deepEqual(plain(app.getDisplayedModels()), ["N7", "L42P 天籁"]);
  console.log("ICE 指定 7 个车型展示、全车型及分月汇总、成本与区域总量、图表明细、隐藏车型入口、缓存保留和 NEV 隔离验证通过。");
}

async function main() {
  await verifyIceModelVisibility();
  const { app, records, context } = createApp();
  const iceWb = workbook(iceHeaders, iceRows);
  const nevWb = workbook(nevHeaders, nevRows);
  const ice = await app.buildDatasetFromWorkbook(iceWb, "区域-2026-09.xlsx", { business: "ICE" });
  const nev = await app.buildDatasetFromWorkbook(nevWb, "NEV.xlsx", { business: "NEV" });
  assert.deepEqual(plain(ice.availableMetrics), ["newLead", "validLead", "newStoreVisit", "bigOrder", "lockOrder"]);
  assert.deepEqual(plain(ice.months), ["2026-09"]);
  assert.deepEqual(plain(ice.models), ["L42P 天籁", "轩逸经典", "P42R 探陆"]);
  assert.deepEqual(plain(ice.channels), ["R11总部自媒体", "R10经销商新媒体", "R3天网行动"]);
  assert.equal(ice.cleanedModelRows, 3); assert.equal(ice.cleanedChannelRows, 2); assert.equal(ice.ignoredRepeatedDelivery, true);
  assert.equal(app.decodeDataset(ice, "ICE").raw.rowCount, 3);
  assert.equal(app.decodeDataset(nev, "NEV").raw.rowCount, 1);
  assert.deepEqual(plain(nev.channels), ["R10经销商新媒体", "R8商超"]);
  const channels = [
    ["R8", "总部员工号", "", "R11总部自媒体"], ["R6", "YSY", "", "R11总部自媒体"],
    ["R10新媒体", "R5专案", "", "R10经销商新媒体"], ["r6", "d直播", "", "R10经销商新媒体"],
    ["R6", "项目", "经销商新媒体", "R6总部新媒体"], ["R4", "经销商", "", "R4"],
    ["R8线下活动", "商超", "", "R8线下活动"], ["R3", "", "总部自媒体", "R11总部自媒体"],
  ];
  channels.forEach(([channel, project, media, expected]) => assert.equal(app.cleanUploadedChannel(channel, project, media, "ICE"), expected));
  assert.equal(app.cleanUploadedModel("toString", "ICE"), "toString");
  assert.equal(app.cleanUploadedModel("未匹配车型", "ICE"), "未匹配车型");
  assert.equal(app.cleanUploadedModel("探陆", "NEV"), "探陆");
  assert.equal(app.getUploadMonth("区域-2026-9.xlsx"), "2026-09");
  assert.equal(app.getUploadMonth("区域-2026-19.xlsx"), "");
  await assert.rejects(app.buildDatasetFromWorkbook(iceWb, "无时间.xlsx", { business: "ICE" }), /指定月份/);
  await assert.rejects(app.buildDatasetFromWorkbook(iceWb, "ICE.xlsx", { business: "NEV" }), /未找到线索明细表/);
  const overridden = await app.buildDatasetFromWorkbook(iceWb, "2026-09.xlsx", { business: "ICE", month: "2026-08" });
  assert.deepEqual(plain(overridden.months), ["2026-08"]);
  const dated = await app.buildDatasetFromWorkbook(workbook(["年月", ...iceHeaders], iceRows.map((row) => ["2026-07", ...row])), "2026-09.xlsx", { business: "ICE", month: "2026-08" });
  assert.deepEqual(plain(dated.months), ["2026-07"]);
  const compactMonth = await app.buildDatasetFromWorkbook(workbook(["年月", ...iceHeaders], iceRows.map((row) => [202609, ...row])), "ICE.xlsx", { business: "ICE" });
  assert.deepEqual(plain(compactMonth.months), ["2026-09"]);
  assert.throws(() => app.mergeDatasets([ice, nev]), /表头层级不一致/);
  const merged = app.mergeDatasets([ice, overridden]);
  assert.deepEqual(plain(merged.months), ["2026-09", "2026-08"]);
  assert.equal(merged.business, "ICE"); assert.equal(merged.rowCount, 6);

  // Streaming XML path and generated worker must match main-thread parsing.
  const iceFile = file("区域-2026-09.xlsx", iceWb);
  const streaming = await app.buildDatasetFromWorkbookFiles(XLSX.read(await iceFile.arrayBuffer(), { type: "array", bookFiles: true }), iceFile.name, { business: "ICE" });
  assert.deepEqual(plain(streaming.rows), plain(ice.rows));
  const workerMessages = [];
  const workerContext = vm.createContext({ XLSX, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, setTimeout, importScripts() {}, self: { postMessage: (message) => workerMessages.push(message) } });
  vm.runInContext(app.createExcelUploadWorkerSource(), workerContext);
  await workerContext.self.onmessage({ data: { files: [iceFile], options: { business: "ICE" } } });
  assert.equal(workerMessages.at(-1).type, "complete", JSON.stringify(workerMessages.at(-1)));
  const workerData = JSON.parse(workerMessages.at(-1).payload);
  assert.deepEqual(workerData.rows, plain(app.mergeDatasets([ice]).rows));
  assert.deepEqual(workerData.models, plain(ice.models));
  assert.deepEqual(workerData.channels, plain(ice.channels));

  app.initDataset(app.decodeDataset(nev, "NEV"));
  const nevSnapshot = app.state.dataset;
  app.els.regionSelect.value = "西区"; app.els.subregionSelect.value = "西一"; app.els.modelSelect.value = "N7";
  app.els.channelSelect.value = "R10经销商新媒体";
  app.state.chartCanvases[0].selectedMonths = ["2026-09"];
  app.state.costCalculator.fees[app.state.costCalculator.periods[0].id].R3 = 123;
  app.state.dealerFocus.columns[0].count = 77;
  app.state.drill.channel = "NEV独立下钻";
  app.activateBusiness("ICE");
  assert.equal(app.state.dataset.rowCount, 0); assert.equal(app.els.regionSelect.value, "全部");
  app.initDataset(app.decodeDataset(merged, "ICE"));
  assert.equal(app.state.business, "ICE"); assert.equal(app.METRICS.lockOrder.label, "成交量");
  assert.equal(app.CHART_STUDIO_CALCULATED_METRICS.leadToLockRate.label, "线索-成交率");
  assert.deepEqual(plain(app.getBusinessDefaultStages().map((stage) => stage.expression)), ["newLead", "newStoreVisit", "lockOrder"]);
  assert.equal(app.getChartStudioMetricKeys().includes("validTestDrive"), false);
  assert.equal(app.getChartStudioMetricKeys().includes("leadToDriveRate"), false);
  assert.equal(app.getDealerFocusRows().some((row) => /Drive/.test(row.key)), false);
  assert.equal(app.getCostMethods().CPTD, undefined); assert.equal(app.getCostMethods().CPS, undefined);
  assert.equal(app.getCostMethods().CPO.label, "单个成交成本");
  assert.deepEqual(plain(app.getCostChannels()), ["R3", "R10", "R11"]);
  const renamedChannels = [
    ["R6-1总部新媒体", "R6总部新媒体", "R6"],
    ["R6-2经销商新媒体", "R10经销商新媒体", "R10"],
    ["R6-3总部自媒体", "R11总部自媒体", "R11"],
  ];
  renamedChannels.forEach(([oldName, newName, code]) => {
    assert.equal(app.formatDimensionValue("channel", oldName), newName);
    assert.equal(app.formatDimensionValue("channel", newName), newName);
    assert.equal(app.normalizeCostChannel(oldName), code);
    assert.equal(app.normalizeCostChannel(newName), code);
    assert.equal(app.normalizeCostChannel(oldName.match(/^R6-[123]/)[0]), code);
    assert.equal(app.normalizeCostChannel(` ${code.toLowerCase()} `), code);
  });
  assert.equal(app.formatDimensionValue("channel", "toString"), "toString");
  const legacyFees = app.parseCostFeePaste("R6-1总部新媒体\t100\nR6-2经销商新媒体\t200\nR6-3总部自媒体\t300");
  const renamedFees = app.parseCostFeePaste("R6总部新媒体\t100\nR10经销商新媒体\t200\nR11总部自媒体\t300");
  assert.deepEqual(plain(Object.fromEntries(legacyFees.accepted)), { R6: 100, R10: 200, R11: 300 });
  assert.deepEqual(plain(Object.fromEntries(renamedFees.accepted)), plain(Object.fromEntries(legacyFees.accepted)));
  assert.equal(legacyFees.ignored, 0); assert.equal(renamedFees.ignored, 0);
  const monthlySeries = app.getDailySeries(app.state.dataset.rows);
  assert.deepEqual(plain(monthlySeries.map((point) => point.date)), ["2026-08", "2026-09"]);
  assert.deepEqual(plain(monthlySeries.map((point) => point.summary.lockOrder)), [5, 5]);
  const summary = app.computeSummaryFromRows(app.state.dataset.rows);
  const tableRow = { name: "西一", summary, effectiveLeadRate: 0.5, leadToLockRate: 0.1 };
  const filters = { region: "全部", subregion: "全部", channel: "全部" };
  app.renderSubregionTable({ filters, subregionRows: [tableRow], subregionScopeSummary: summary });
  assert.equal((app.els.subregionTableBody.innerHTML.match(/<td\b/g) || []).length, 18);
  app.renderAreaChannelTable({ filters, channelRows: [{ ...tableRow, name: "R3" }], channelScopeSummary: summary });
  assert.equal((app.els.areaChannelTableBody.innerHTML.match(/<td\b/g) || []).length, 16);
  app.renderDrillDetailTable({ focusVisible: true, activeStage: { name: "成交量", expression: "lockOrder" }, detailRows: [{ name: "项目", summary, medias: [], activeValue: 10 }] });
  assert.equal((app.els.drillTableBody.innerHTML.match(/<td\b/g) || []).length, 7);
  app.els.businessMonthSelect.value = "2026-09";
  assert.equal(app.filterRowsByFilters(app.state.dataset.rows, app.getMainFilters()).length, 3);
  app.captureCostPeriodFromMainRange();
  app.state.costCalculator.method = "CPO";
  assert.deepEqual(plain(app.getCostPeriodSummaries(app.state.costCalculator.periods.at(-1))), { R3: -1, R10: 4, R11: 2 });
  assert.equal(app.computeSummaryFromRows(app.getDealerFocusBaseRows("2026-08")).newLead, 35);
  app.els.regionSelect.value = "东区"; app.els.subregionSelect.value = "东一";
  app.state.chartCanvases[0].selectedMonths = ["2026-08"];
  app.state.costCalculator.fees[app.state.costCalculator.periods[0].id].R3 = 456;
  app.activateBusiness("NEV");
  assert.equal(app.state.dataset, nevSnapshot); assert.equal(app.state.dataset.rowCount, 1);
  assert.equal(app.METRICS.lockOrder.label, "锁单量"); assert.equal(app.els.modelSelect.value, "N7");
  assert.equal(app.els.regionSelect.value, "西区"); assert.equal(app.els.subregionSelect.value, "西一");
  assert.equal(app.els.channelSelect.value, "R10经销商新媒体");
  assert.equal(app.state.drill.channel, "NEV独立下钻");
  assert.equal(app.state.costCalculator.fees[app.state.costCalculator.periods[0].id].R3, 123);
  assert.equal(app.state.dealerFocus.columns[0].count, 77);
  assert.deepEqual(plain(app.state.chartCanvases[0].selectedMonths), ["2026-09"]);
  app.activateBusiness("ICE");
  assert.equal(app.els.regionSelect.value, "东区"); assert.equal(app.els.subregionSelect.value, "东一");
  assert.equal(app.els.businessMonthSelect.value, "2026-09");
  assert.equal(app.state.costCalculator.fees[app.state.costCalculator.periods[0].id].R3, 456);
  assert.deepEqual(plain(app.state.chartCanvases[0].selectedMonths), ["2026-08"]);
  const nevUpload = app.getUploadWorkspace("NEV");
  let iceUpload = app.getUploadWorkspace("ICE");
  app.selectUploadFiles([file("NEV.xlsx", nevWb)], "NEV");
  app.selectUploadFiles([iceFile], "ICE"); iceUpload.uploadMonth = "2026-08";
  assert.equal(nevUpload.pendingUploadFiles[0].name, "NEV.xlsx"); assert.equal(nevUpload.uploadMonth, "");
  assert.equal(iceUpload.pendingUploadFiles[0].name, iceFile.name); assert.equal(iceUpload.uploadMonth, "2026-08");
  assert.notEqual(app.getUploadPanelElements("NEV").input, app.getUploadPanelElements("ICE").input);
  assert.notEqual(app.getUploadPanelElements("NEV").zone, app.getUploadPanelElements("ICE").zone);
  assert.notEqual(app.getUploadPanelElements("NEV").feedback, app.getUploadPanelElements("ICE").feedback);
  app.removePendingUploadFile(0, "ICE"); assert.equal(nevUpload.pendingUploadFiles.length, 1);
  app.selectUploadFiles([iceFile], "ICE");

  // Mixed old/new cached names must form one filter group without changing metrics.
  const legacyIce = plain(ice);
  legacyIce.channels = ["R6-2经销商新媒体", "R10经销商新媒体", "R6-1总部新媒体", "R6总部新媒体", "R6-3总部自媒体", "R11总部自媒体", "R3天网行动", "toString"];
  const channelIndex = legacyIce.schema.indexOf("channelId");
  legacyIce.rows = legacyIce.channels.map((_, id) => {
    const row = [...ice.rows[id % ice.rows.length]]; row[channelIndex] = id; return row;
  });
  legacyIce.rowCount = legacyIce.rows.length;
  const legacyIceBefore = plain(legacyIce);
  const migratedIce = app.decodeDataset(legacyIce, "旧 ICE 缓存").raw;
  assert.deepEqual(plain(migratedIce.channels), ["R10经销商新媒体", "R6总部新媒体", "R11总部自媒体", "R3天网行动", "toString"]);
  assert.deepEqual(plain(migratedIce.rows.map((row) => row[channelIndex])), [0, 0, 1, 1, 2, 2, 3, 4]);
  assert.deepEqual(plain(migratedIce.rows.map((row) => row.filter((_, index) => index !== channelIndex))), legacyIceBefore.rows.map((row) => row.filter((_, index) => index !== channelIndex)));
  assert.deepEqual(plain(legacyIce), legacyIceBefore);
  assert.deepEqual(plain(app.decodeDataset(migratedIce, "再次读取").raw), plain(migratedIce));
  await app.saveDatasetCache(nev, "NEV"); await app.saveDatasetCache(legacyIce, "ICE");
  assert.equal(records.get("latest-upload").raw.business, "NEV");
  assert.equal(records.get("latest-upload-ICE").raw.business, "ICE");
  const reloaded = createApp(records); await reloaded.app.bootDataset();
  assert.equal(reloaded.app.state.business, "NEV"); assert.equal(reloaded.app.state.dataset.rowCount, 1);
  reloaded.app.activateBusiness("ICE"); assert.equal(reloaded.app.state.dataset.rowCount, 8);
  assert.deepEqual(plain(reloaded.app.state.dataset.channels), plain(migratedIce.channels));
  assert.deepEqual(plain(reloaded.app.getCostChannels()), ["R3", "R6", "R10", "R11"]);
  reloaded.app.state.costCalculator.method = "CPO";
  assert.deepEqual(plain(reloaded.app.getCostPeriodSummaries(reloaded.app.state.costCalculator.periods[0])), { R3: 2, R6: 1, R10: 6, R11: 3 });
  reloaded.app.els.channelSelect.value = "R10经销商新媒体";
  const renamedFilterSummary = reloaded.app.computeSummaryFromRows(reloaded.app.filterRowsByFilters(reloaded.app.state.dataset.rows, reloaded.app.getMainFilters()));
  assert.equal(renamedFilterSummary.newLead, 30); assert.equal(renamedFilterSummary.lockOrder, 6);
  assert.deepEqual(plain(records.get("latest-upload-ICE").raw), legacyIceBefore);
  await app.clearDatasetCache("ICE"); assert.ok(records.has("latest-upload")); assert.equal(await app.readDatasetCache("ICE"), null);
  await app.saveDatasetCache(ice, "ICE"); await app.clearDatasetCache("NEV"); assert.ok(records.has("latest-upload-ICE"));
  const legacy = structuredClone(nev); delete legacy.business;
  records.set("latest-upload", { raw: legacy, cleaningVersion: 1, sourceLabel: "旧版缓存" });
  const migrated = createApp(records); await migrated.app.bootDataset();
  assert.equal(migrated.app.state.dataset.business, "NEV"); assert.equal(migrated.app.state.dataset.rowCount, 1);
  assert.equal(migrated.app.state.sourceLabel, "旧版缓存");

  // Actual upload orchestration saves only the selected sector, including failure rollback.
  const nevCacheBefore = plain(records.get("latest-upload"));
  iceUpload.uploadMonth = ""; iceUpload.uploadStatus = "idle";
  await app.processUploadedFiles([iceFile], "ICE");
  assert.equal(iceUpload.uploadStatus, "success", iceUpload.uploadError);
  assert.deepEqual(plain(records.get("latest-upload")), nevCacheBefore);
  assert.equal(app.state.dataset.rowCount, 3);
  const successfulIce = app.state.dataset;
  iceUpload.uploadStatus = "idle";
  await app.processUploadedFiles([file("失败.xlsx", workbook(["无效表头"], [[1]]))], "ICE");
  assert.equal(iceUpload.uploadStatus, "error"); assert.equal(app.state.dataset, successfulIce);
  assert.deepEqual(plain(records.get("latest-upload")), nevCacheBefore);
  await app.resetBusinessDataset();
  iceUpload = app.getUploadWorkspace("ICE");
  assert.equal(iceUpload.pendingUploadFiles.length, 0);
  assert.equal(nevUpload.pendingUploadFiles.length, 1);
  assert.equal(app.state.business, "ICE"); assert.equal(app.state.dataset.rowCount, 0);
  assert.equal(records.has("latest-upload-ICE"), false);
  assert.deepEqual(plain(records.get("latest-upload")), nevCacheBefore);
  app.activateBusiness("NEV"); assert.equal(app.state.dataset.rowCount, 1);
  const activeNev = app.state.dataset;
  iceUpload.uploadStatus = "idle";
  await app.processUploadedFiles([iceFile], "ICE");
  assert.equal(app.state.business, "NEV"); assert.equal(app.state.dataset, activeNev);
  assert.equal(app.state.businesses.ICE.decoded.raw.rowCount, 3);
  nevUpload.uploadStatus = "idle"; iceUpload.uploadStatus = "idle";
  await Promise.all([app.processUploadedFiles([file("NEV.xlsx", nevWb)], "NEV"), app.processUploadedFiles([iceFile], "ICE")]);
  assert.equal(nevUpload.uploadStatus, "success"); assert.equal(iceUpload.uploadStatus, "success");
  assert.equal(records.get("latest-upload").raw.business, "NEV"); assert.equal(records.get("latest-upload-ICE").raw.business, "ICE");
  assert.equal(app.state.dataset.business, "NEV"); assert.equal(app.state.dataset.rowCount, 1);
  const iceCacheBeforeFailure = plain(records.get("latest-upload-ICE"));
  nevUpload.uploadStatus = "idle"; iceUpload.uploadStatus = "idle";
  await Promise.all([
    app.processUploadedFiles([file("NEV.xlsx", nevWb)], "NEV"),
    app.processUploadedFiles([file("错误-2026-09.xlsx", workbook(["错误表头"], [[1]]))], "ICE"),
  ]);
  assert.equal(nevUpload.uploadStatus, "success"); assert.equal(iceUpload.uploadStatus, "error");
  assert.deepEqual(plain(records.get("latest-upload-ICE")), iceCacheBeforeFailure);
  assert.equal(app.state.dataset.business, "NEV"); assert.equal(app.state.dataset.rowCount, 1);

  // Optional real files: read-only verification of every mapped source row and aggregates.
  const [sourceFile, knowledgeFile] = process.argv.slice(2);
  if (knowledgeFile) {
    const knowledge = XLSX.readFile(knowledgeFile);
    const mapping = XLSX.utils.sheet_to_json(knowledge.Sheets["ICE车型匹配"], { header: 1, defval: "" }).slice(1);
    for (const row of mapping) if (row[1]) assert.equal(app.cleanUploadedModel(row[1], "ICE"), row[0]);
    assert.equal(Object.keys(app.ICE_MODEL_NAMES).length, mapping.filter((row) => row[1]).length);
  }
  if (sourceFile) {
    const wb = XLSX.readFile(sourceFile, { cellDates: true });
    const parsed = await app.buildDatasetFromWorkbook(wb, path.basename(sourceFile), { business: "ICE" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const headers = rows.shift();
    const sourceModelIndex = headers.indexOf("车系名称");
    const schema = Object.fromEntries(parsed.schema.map((key, index) => [key, index]));
    for (let i = 0; i < rows.length; i++) assert.equal(parsed.models[parsed.rows[i][schema.modelId]], app.cleanUploadedModel(rows[i][sourceModelIndex], "ICE") || "(空)");
    for (const [key, name] of [["newLead", "线索总量"], ["validLead", "有效线索量"], ["newStoreVisit", "到店量"], ["bigOrder", "订单总量"], ["lockOrder", "成交量"]]) {
      const column = headers.indexOf(name);
      const expected = rows.reduce((sum, row) => sum + Number(row[column] || 0), 0);
      assert.equal(parsed.rows.reduce((sum, row) => sum + row[schema[key]], 0), expected, name);
    }
    console.log(`真实 ICE 文件只读验证通过：${parsed.rowCount} 行，车型转换 ${parsed.cleanedModelRows} 行，渠道调整 ${parsed.cleanedChannelRows} 行。`);
  }
  console.log("NEV/ICE 表头、车型和渠道匹配、ICE 渠道新旧命名兼容、月度归属、缺失指标、Worker/流式解析一致性、板块状态隔离、上传草稿、缓存兼容及上传失败回退验证通过。");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
