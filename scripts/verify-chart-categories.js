const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the actual page functions with synthetic data; no browser or business files are needed.
const source = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
for (const [index, match] of [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `index.html:script-${index + 1}` });
}

function declaration(name, kind = "function") {
  if (kind === "const") {
    const match = source.match(new RegExp(`        const ${name} = [\\s\\S]*?;(?=\\r?\\n)`));
    assert.ok(match, `Missing constant ${name}`);
    return match[0];
  }
  const start = source.indexOf(`        function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const end = source.indexOf("\n        function ", start + 1);
  assert.ok(end > start, `Missing boundary after ${name}`);
  return source.slice(start, end);
}

const constants = [
  "METRICS", "CHART_STUDIO_CALCULATED_METRICS", "CHART_STUDIO_METRICS", "DATASET_DIMENSION_FIELDS",
  "DATASET_METRIC_FIELDS", "AREA_METRIC_KEYS", "CHART_STUDIO_TYPE_GROUPS", "CHART_STUDIO_TYPES",
  "CHART_STUDIO_DEFAULT_COLORS", "CHART_STUDIO_FILTER_KEYS", "CHANNEL_DISPLAY_NAMES", "UI_FONT_FAMILY", "ICE_DISPLAY_MODELS",
];
const functions = [
  "createDefaultChartCanvas", "hasDatasetDimension", "hasCompleteDatasetDimension", "hasUsableDateDimension",
  "isEmptyDimensionValue", "getVisibleDimensionValues", "isDisplayedModel", "getDimensionValue", "formatDimensionValue",
  "formatDimensionText", "compareNaturalDimensionText", "normalizeHeaderName", "escapeHtml", "formatNumber",
  "getChartStudioDimensions", "getChartStudioMetricKeys", "getChartStudioFields", "getChartStudioAxisModel",
  "getChartStudioFilterFields", "getChartStudioToolbarModel", "getChartStudioFilterOptions",
  "hasChartStudioMonthSource", "getChartStudioRowMonth", "canSplitChartStudioByMonth",
  "getChartStudioDisplaySeries", "getChartStudioSeriesColor",
  "getChartStudioMetricLabel", "isChartStudioPercentMetric", "getChartStudioMetricValue", "formatChartStudioMetricValue",
  "isChartStudioComboType", "getChartStudioComboMetricGroups", "getChartStudioRenderMetricKeys",
  "normalizeChartCanvasConfig", "filterRowsByFilters", "filterRowsByChartStudioFilters", "groupRows",
  "groupRowsByChartStudioMonth", "formatChartStudioMonth", "calcRate", "createEmptySummary", "aggregateRows",
  "enrichSummary", "computeSummaryFromRows", "computeChartStudioData", "getChartStudioDimensionLabel",
  "buildChartStudioDataView", "renderChartStudioCategoryPicker", "getChartStudioCanvasError",
  "getChartCanvasConfig", "updateChartStudioCategorySelection", "resetChartStudioCategorySelection", "addChartCanvas",
  "updateChartStudioValueSelection", "resetChartStudioValueSelection", "renderChartStudioValuePicker", "renderChartStudioMonthPicker",
  "renderChartStudioFieldChip", "renderChartStudioAxisField", "renderChartStudioAxisPicker",
  "renderChartStudioFilterPicker", "renderChartStudioColorPicker", "renderChartStudioCard",
  "getChartStudioName", "getChartStudioDomId", "renderChartStudioCanvas",
];
const context = vm.createContext({
  state: { dataset: null, chartCanvases: [], chartStudioSerial: 1 },
  document: { querySelector: () => null },
  requestAnimationFrame: () => {},
  renderChartStudio: () => {},
  getMainFilters: () => context.mainFilters,
});
vm.runInContext([...constants.map((name) => declaration(name, "const")), ...functions.map((name) => declaration(name))].join("\n"), context);
const run = (code) => vm.runInContext(code, context);
const plain = (value) => JSON.parse(JSON.stringify(value));
const metrics = plain(run("Object.keys(METRICS)"));
const schema = ["dateId", "monthId", "channelId", "regionId", "subregionId", ...metrics];
const schemaIndex = Object.fromEntries(schema.map((key, index) => [key, index]));
const fixture = [
  [0, 0, 0, 0, 10, 2], [1, 0, 0, 0, 5, 3], [2, 1, 0, 0, 30, 6],
  [3, 2, 1, 1, 70, 7], [4, 3, 1, 1, 90, 9],
];
context.state.dataset = {
  schemaIndex, availableDimensions: ["date", "month", "channel", "region", "subregion"],
  completeDimensions: ["date", "month", "channel", "region", "subregion"], availableMetrics: metrics,
  dates: ["2026-01-01", "2026-01-02", "2026-03-01", "2026-07-01", "2026-09-01"],
  months: ["2026-01", "2026-03", "2026-07", "2026-09"],
  channels: ["R3", "R4"], regions: ["东区", "西区"], subregions: ["东一", "西一"],
  dateMin: "2026-01-01", dateMax: "2026-09-01",
  rows: fixture.map(([date, month, channel, region, leads, visits]) => {
    const row = Array(schema.length).fill(0);
    [date, month, channel, region].forEach((value, index) => { row[index] = value; });
    row[schemaIndex.subregionId] = region;
    row[schemaIndex.newLead] = leads;
    row[schemaIndex.newStoreVisit] = visits;
    return row;
  }),
};
context.mainFilters = { startDate: "2026-01-01", endDate: "2026-09-01", region: "全部", subregion: "全部", channel: "全部", model: "全部" };
context.config = run("createDefaultChartCanvas(1)");
Object.assign(context.config, { type: "bar", xFields: ["month"], yFields: ["newLead", "leadToStoreRate"] });
context.state.chartCanvases = [context.config];
const normalize = () => run("normalizeChartCanvasConfig(config)");
const data = () => plain(run("computeChartStudioData(config)"));
const picker = () => run("renderChartStudioCategoryPicker(config, computeChartStudioData(config))");
normalize();
assert.deepEqual(data().rows.map((row) => row.name), ["2026年01月", "2026年03月", "2026年07月", "2026年09月"]);
assert.equal(data().summary.newLead, 205);
assert.match(picker(), /展示月份/);
assert.equal((picker().match(/ checked/g) || []).length, 4);

context.config.selectedCategories = ["2026-03", "2026-09"];
let result = data();
assert.deepEqual(result.rows.map((row) => row.name), ["2026年03月", "2026年09月"]);
assert.deepEqual(result.rows.map((row) => row.values.newLead), [30, 90]);
assert.equal(result.filteredRowCount, 2);
assert.equal(result.categoryOptions.length, 4, "Unselected months must remain available");
assert.equal(result.summary.newLead, 120);
assert.equal(result.summary.leadToStoreRate, 0.125, "Totals must recompute the rate from selected source rows");
const table = run("buildChartStudioDataView(config, computeChartStudioData(config))");
assert.match(table, /当前展示 2 项，共 4 项/);
assert.match(table, /120/);
assert.match(table, /12.5%/);
assert.doesNotMatch(table, /2026年01月|2026年07月|展示前/);
context.config.sort = "value-desc";
assert.deepEqual(data().rows.map((row) => row.name), ["2026年09月", "2026年03月"]);
assert.deepEqual(data().rows.map((row) => row.values.newLead), [90, 30]);
context.config.sort = "category-asc";
assert.deepEqual(data().rows.map((row) => row.name), ["2026年03月", "2026年09月"]);

context.config.filters.channel = ["R3"];
assert.deepEqual(data().categoryOptions.map((option) => option.key), ["2026-01", "2026-03"]);
assert.equal(data().summary.newLead, 30);
assert.match(picker(), /1 \/ 2 项/);
context.config.filters.channel = ["R4"];
assert.deepEqual(data().rows.map((row) => row.name), ["2026年09月"]);
context.config.filters.channel = [];
context.mainFilters.endDate = "2026-01-31";
assert.equal(data().rows.length, 0, "An unavailable selection must not revert to all categories");
assert.equal(data().summary.newLead, 0);
assert.match(run("getChartStudioCanvasError(config, computeChartStudioData(config))"), /没有所选分类/);
context.mainFilters.endDate = "2026-09-01";
assert.equal(data().rows.length, 2, "Returning to the original scope must restore chosen months");

run("resetChartStudioCategorySelection(1, false)");
assert.equal(data().rows.length, 0);
assert.equal(data().summary.newLead, 0);
assert.match(run("getChartStudioCanvasError(config, computeChartStudioData(config))"), /至少选择一个/);
run('updateChartStudioCategorySelection(1, "2026-09", true)');
assert.deepEqual(data().rows.map((row) => row.name), ["2026年09月"]);
run('updateChartStudioCategorySelection(1, "2026-03", true)');
assert.equal(data().summary.newLead, 120);
run("addChartCanvas(config)");
const copy = context.state.chartCanvases[1];
assert.deepEqual(plain(copy.selectedCategories), ["2026-09", "2026-03"]);
assert.notEqual(copy.selectedCategories, context.config.selectedCategories, "Copies must own their selection arrays");
copy.selectedCategories.pop();
assert.equal(context.config.selectedCategories.length, 2);
run("resetChartStudioCategorySelection(1, true)");
assert.equal(context.config.selectedCategories, null);
run('updateChartStudioCategorySelection(1, "2026-01", false)');
assert.equal(data().rows.length, 3, "Unchecking one item from all must retain the others");

context.config.xFields = ["channel"];
normalize();
assert.equal(context.config.selectedCategories, null, "Switching dimensions must reset selection");
assert.match(picker(), /展示渠道/);
assert.equal(data().rows.length, 2);
context.config.selectedCategories = ["R4"];
context.config.xFields = ["newLead"];
context.config.yFields = ["channel"];
normalize();
assert.deepEqual(data().rows.map((row) => row.name), ["R4"], "Moving the same dimension to Y must retain selection");

context.config.xFields = ["date"];
context.config.yFields = ["newLead"];
context.config.dateAggregation = "month";
normalize();
assert.equal(data().categoryOptions.length, 4);
context.config.selectedCategories = ["2026-01", "2026-09"];
assert.deepEqual(data().rows.map((row) => row.values.newLead), [15, 90]);
context.config.dateAggregation = "day";
normalize();
assert.equal(context.config.selectedCategories, null, "Changing date granularity must reset selection");
assert.equal(data().categoryOptions.length, 5);

context.config.categorySearch = "不存在";
assert.doesNotMatch(picker(), /class="chart-category-no-match" hidden/);
context.config.categorySearch = "2026-09";
assert.match(picker(), /class="chart-category-no-match" hidden/);
context.state.dataset.channels = ['R3"><img src=x>', "R4"];
context.config.xFields = ["channel"];
normalize();
assert.match(picker(), /&quot;&gt;&lt;img/);
assert.doesNotMatch(picker(), /<img src=x>/);

context.state.dataset.channels = ["R3", "R4"];
context.config.yFields = ["newLead"];
context.config.filters.channel = ["R4"];
normalize();
assert.deepEqual(plain(context.config.selectedCategories), ["R4"], "An existing channel filter must transfer to the only visible picker");
assert.deepEqual(plain(context.config.filters.channel), [], "The hidden duplicate must stop filtering candidates");
assert.equal(data().categoryOptions.length, 2, "The visible picker must still allow broadening selection");
assert.equal(data().summary.newLead, 160);
const toolbar = () => plain(run("getChartStudioToolbarModel(config)"));
const cardMarkup = () => run("renderChartStudioCard(config)");
assert.deepEqual(toolbar().filterFields.map((field) => field.key), ["region", "subregion"]);
assert.doesNotMatch(cardMarkup(), /data-chart-filter-field="channel"/);
assert.equal((cardMarkup().match(/data-chart-category-picker/g) || []).length, 1);
context.config.selectedCategories = ["R3"];
context.config.filters.channel = ["R4"];
normalize();
assert.equal(data().rows.length, 0, "Disjoint old filters must preserve an explicit empty intersection");
run("resetChartStudioCategorySelection(1, true)");
assert.equal(data().summary.newLead, 205, "Showing all must remove both former restrictions");

context.config.xFields = ["region"];
context.config.filters.region = ["东区"];
normalize();
assert.deepEqual(plain(context.config.selectedCategories), ["东区"]);
assert.equal(data().summary.newLead, 45);
assert.doesNotMatch(cardMarkup(), /data-chart-filter-field="region"/);
context.config.xFields = ["newLead"];
context.config.yFields = ["region"];
normalize();
assert.deepEqual(data().rows.map((row) => row.name), ["东区"]);
assert.doesNotMatch(cardMarkup(), /data-chart-filter-field="region"/, "Y-axis grouping must also have a single entry");

context.config.xFields = ["subregion"];
context.config.yFields = ["newLead"];
context.config.filters.subregion = ["西一"];
normalize();
assert.deepEqual(plain(context.config.selectedCategories), ["西一"]);
assert.equal(data().summary.newLead, 160);
assert.doesNotMatch(cardMarkup(), /data-chart-filter-field="subregion"/);
context.config.xFields = [];
normalize();
assert.equal(toolbar().showCategories, false);
assert.equal(toolbar().showSort, false);
assert.equal(toolbar().filterFields.length, 3);
assert.equal(toolbar().controlCount, 5);
assert.doesNotMatch(cardMarkup(), /data-chart-category-picker|aria-label="分类排序"/);

context.config.xFields = ["month"];
context.config.type = "metric-funnel";
context.config.yFields = ["newLead", "newStoreVisit"];
context.config.sort = "value-desc";
normalize();
assert.equal(context.config.sort, "");
assert.equal(toolbar().showCategories, true);
assert.doesNotMatch(cardMarkup(), /aria-label="分类排序"/);
context.config.type = "scatter";
context.config.xFields = ["date", "newLead"];
context.config.yFields = ["newStoreVisit"];
normalize();
assert.equal(toolbar().showSort, false);
assert.equal(toolbar().hasDateAxis, true);
assert.doesNotMatch(cardMarkup(), /aria-label="分类排序"/);

context.document.getElementById = () => ({ clientWidth: 1200, clientHeight: 600 });
context.ensureChart = () => ({ clear: () => {}, setOption: (option) => { context.chartOption = option; } });
context.config.xFields = ["month"];
context.config.yFields = ["newLead"];
for (const type of ["pie", "donut"]) {
  context.config.type = type;
  run("renderChartStudioCanvas(config)");
  assert.equal(context.chartOption.legend.selectedMode, false, `${type} must use the picker as its only category selector`);
  assert.equal(context.chartOption.series[0].data.length, 4);
}
context.config.type = "bar";
context.config.xFields = ["channel"];
normalize();

// Month is a second analysis dimension, independent of the category axis.
context.config.yFields = ["newLead", "leadToStoreRate"];
context.config.monthSplit = true;
normalize();
const monthSeries = () => plain(run("getChartStudioDisplaySeries(config, computeChartStudioData(config))"));
assert.equal(toolbar().showMonths, true);
assert.equal(toolbar().showMonthSplit, true);
assert.equal(data().monthSplit, true);
assert.deepEqual(data().rows.map((row) => row.name), ["R3", "R4"]);
assert.deepEqual(data().months.map((month) => month.key), ["2026-01", "2026-03", "2026-07", "2026-09"]);
assert.equal(monthSeries().length, 8);
assert.deepEqual(monthSeries()[0].values, [15, null]);
assert.deepEqual(monthSeries()[1].values, [33.3, null], "Monthly rates must use the sums of numerators and denominators");
assert.deepEqual(monthSeries()[6].values, [null, 90]);
assert.match(cardMarkup(), /data-chart-control="monthSplit"/);
assert.equal((cardMarkup().match(/data-chart-month-picker/g) || []).length, 1);
assert.doesNotMatch(cardMarkup(), /data-chart-filter-field="channel"/);
run("renderChartStudioCanvas(config)");
assert.equal(context.chartOption.series.length, 8);
assert.equal(context.chartOption.legend.selectedMode, false, "Month filtering must stay in one visible picker");
assert.deepEqual(plain(context.chartOption.xAxis.data), ["R3", "R4"]);
assert.deepEqual(plain(context.chartOption.series[0].data), [15, null]);
assert.match(context.chartOption.tooltip.formatter([{ axisValue: "R3", seriesIndex: 1, seriesName: "1月转化率", marker: "", value: 33.3 }]), /33.3%/);
const monthlyTable = run("buildChartStudioDataView(config, computeChartStudioData(config))");
assert.match(monthlyTable, /渠道 · 按月拆分/);
assert.match(monthlyTable, /2026年01月 · 新增线索量/);
assert.match(monthlyTable, /33.3%/);
assert.match(monthlyTable, /<td>—<\/td>/, "Missing category-month records must remain empty");
context.config.dataViewTransposed = true;
assert.match(run("buildChartStudioDataView(config, computeChartStudioData(config))"), /月份 \/ 指标/);
context.config.dataViewTransposed = false;
context.config.xFields = ["newLead", "leadToStoreRate"];
context.config.yFields = ["channel"];
normalize();
run("renderChartStudioCanvas(config)");
assert.deepEqual(plain(context.chartOption.yAxis.data), ["R3", "R4"]);
assert.deepEqual(plain(context.chartOption.series[0].data), [15, null]);
context.config.xFields = ["region"];
context.config.yFields = ["newLead", "leadToStoreRate"];
normalize();
assert.deepEqual(data().rows.map((row) => row.name), ["东区", "西区"]);
assert.deepEqual(monthSeries()[0].values, [15, null]);
assert.equal(data().monthSplit, true, "Changing between non-date dimensions must retain the monthly mode");
context.config.xFields = ["channel"];
normalize();

run('resetChartStudioValueSelection(1, false, "month")');
assert.equal(data().rows.length, 0);
assert.match(run("getChartStudioCanvasError(config, computeChartStudioData(config))"), /至少选择一个要展示的月份/);
run('updateChartStudioValueSelection(1, "2026-01", true, "month")');
run('updateChartStudioValueSelection(1, "2026-09", true, "month")');
assert.equal(monthSeries().length, 4);
assert.equal(data().summary.newLead, 105);
assert.deepEqual(monthSeries().map((series) => series.total), [15, 33.3, 90, 10]);
const septemberColor = monthSeries()[2].colorIndex;
assert.equal(septemberColor, 6, "Month colors must remain stable when earlier months are deselected");
context.config.selectedCategories = ["R3"];
assert.deepEqual(monthSeries()[2].values, [null]);
assert.equal(monthSeries()[2].total, null);
assert.equal(data().monthOptions.length, 4, "Month candidates must not disappear when a category is selected");
context.mainFilters.startDate = "2026-03-01";
context.mainFilters.endDate = "2026-07-31";
assert.equal(data().rows.length, 0, "Unavailable selected months must not silently fall back to all months");
context.mainFilters.startDate = "2026-01-01";
context.mainFilters.endDate = "2026-09-01";
context.config.selectedCategories = null;
context.config.filters.region = ["东区"];
assert.equal(data().summary.newLead, 15);
context.config.filters.region = [];
run("addChartCanvas(config)");
const monthCopy = context.state.chartCanvases.at(-1);
assert.notEqual(monthCopy.selectedMonths, context.config.selectedMonths);
monthCopy.selectedMonths.pop();
assert.equal(context.config.selectedMonths.length, 2);

// Monthly sources work with either 年月 or date, without requiring both columns.
const originalDataset = context.state.dataset;
context.state.dataset = { ...originalDataset, dates: ["(空)"], schemaIndex: { ...schemaIndex },
  availableDimensions: originalDataset.availableDimensions.filter((key) => key !== "date"),
  completeDimensions: originalDataset.completeDimensions.filter((key) => key !== "date") };
delete context.state.dataset.schemaIndex.dateId;
normalize();
assert.equal(data().summary.newLead, 105);
assert.deepEqual(data().months.map((month) => month.key), ["2026-01", "2026-09"]);
context.state.dataset = { ...originalDataset, months: ["(空)"], schemaIndex: { ...schemaIndex },
  availableDimensions: originalDataset.availableDimensions.filter((key) => key !== "month") };
delete context.state.dataset.schemaIndex.monthId;
normalize();
assert.equal(data().summary.newLead, 105);
context.state.dataset = originalDataset;

// Monthly totals are weighted across categories, and a real zero differs from missing data.
run('resetChartStudioValueSelection(1, true, "month")');
const extraJanuary = [...originalDataset.rows[0]];
extraJanuary[schemaIndex.channelId] = 1;
extraJanuary[schemaIndex.newLead] = 100;
extraJanuary[schemaIndex.newStoreVisit] = 1;
context.state.dataset = { ...originalDataset, rows: [...originalDataset.rows, extraJanuary] };
assert.equal(monthSeries()[1].total, 5.2, "Monthly total rates must be recomputed across all displayed categories");
extraJanuary[schemaIndex.newLead] = 0;
extraJanuary[schemaIndex.newStoreVisit] = 0;
assert.deepEqual(monthSeries()[0].values, [15, 0]);
assert.deepEqual(monthSeries()[2].values, [30, null]);

const december = [...originalDataset.rows[4]];
december[schemaIndex.dateId] = 5;
december[schemaIndex.monthId] = 4;
context.state.dataset = { ...originalDataset,
  rows: [...originalDataset.rows, december], dates: [...originalDataset.dates, "2025-12-01"],
  months: [...originalDataset.months, "2025-12"], dateMin: "2025-12-01" };
context.mainFilters.startDate = "2025-12-01";
assert.equal(data().months[0].key, "2025-12", "Month series must sort correctly across years");
context.mainFilters.startDate = "2026-01-01";
context.state.dataset = { ...originalDataset, months: [...originalDataset.months, "(空)"],
  dates: [...originalDataset.dates, "(空)"], rows: [...originalDataset.rows, december],
  completeDimensions: originalDataset.completeDimensions.filter((key) => key !== "date") };
assert.equal(data().months.at(-1).key, "未标注月份");
assert.equal(data().summary.newLead, 295, "Rows without a known month must not be silently discarded");
context.state.dataset = originalDataset;

run('resetChartStudioValueSelection(1, true, "month")');
context.config.type = "stacked-bar-percent";
context.config.yFields = ["newLead", "newStoreVisit"];
normalize();
run("renderChartStudioCanvas(config)");
assert.equal(context.chartOption.series[0].stack, "month:2026-01");
assert.equal(context.chartOption.series[1].stack, "month:2026-01");
assert.equal(context.chartOption.series[2].stack, "month:2026-03");
assert.equal(context.chartOption.series[0].data[0], 75);
assert.equal(context.chartOption.series[1].data[0], 25);
assert.equal(context.chartOption.series[0].data[1], null);
context.config.type = "combo-bar-line";
context.config.comboSeriesTypes = { newLead: "bar", newStoreVisit: "line" };
normalize();
run("renderChartStudioCanvas(config)");
assert.deepEqual(plain(context.chartOption.series.map((series) => series.type)), ["bar", "bar", "bar", "bar", "line", "line", "line", "line"]);
assert.ok(context.chartOption.series.slice(4).every((series) => series.yAxisIndex === 1));
assert.equal(context.chartOption.legend.selectedMode, false);
context.config.type = "pie";
normalize();
assert.equal(context.config.monthSplit, false);
assert.equal(toolbar().showMonths, true, "Pie charts still allow viewing any single month through the month picker");
context.config.type = "bar";
context.config.monthSplit = true;
context.config.xFields = ["month"];
normalize();
assert.equal(toolbar().showMonths, false, "The month axis must not get a duplicate month filter");
assert.equal(context.config.monthSplit, false);
assert.equal(context.config.selectedMonths, null);
assert.equal((cardMarkup().match(/data-chart-month-picker/g) || []).length, 0);
context.config.xFields = ["channel"];
context.config.yFields = ["newLead"];
normalize();

context.state.dataset.rows = Array.from({ length: 205 }, (_, index) => {
  const row = Array(schema.length).fill(0);
  row[schemaIndex.channelId] = index;
  row[schemaIndex.newLead] = index + 1;
  return row;
});
context.state.dataset.channels = Array.from({ length: 205 }, (_, index) => `渠道${index + 1}`);
assert.equal(data().rows.length, 205, "All categories must be available without the old 200-item cap");
context.config.selectedCategories = ["渠道201", "渠道205"];
assert.deepEqual(data().rows.map((row) => row.values.newLead), [201, 205]);
console.log("页面脚本语法、原有分类选择与去重、渠道/大区按月拆分、月份筛选、空值与转化率、分月表格与转置、横向图、分月百分比堆积、组合图、年月/日期来源兼容和复制隔离回归通过。");
