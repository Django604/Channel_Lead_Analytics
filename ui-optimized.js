(() => {
  const homeNav = document.querySelector('[data-ui-context="home"]');
  const modelNav = document.querySelector('[data-ui-context="model"]');
  const modelLinks = [...document.querySelectorAll("[data-ui-model-target]")];
  const areaRouteLink = document.querySelector('[data-ui-route="area"]');
  const dealerFocusRouteLink = document.querySelector('[data-ui-route="dealer-focus"]');
  const costCalculatorRouteLink = document.querySelector('[data-ui-route="cost-calculator"]');
  const chartStudioRouteLink = document.querySelector('[data-ui-route="chart-studio"]');
  const modelRouteLink = document.querySelector('[data-ui-route="model"]');
  const homeRouteLinks = [...document.querySelectorAll('[data-ui-route="home"]')];
  const homeMainRouteLink = homeNav?.querySelector('[data-ui-route="home"]');
  const skipLink = document.querySelector(".ui-skip-link");
  const brandName = document.getElementById("uiSidebarBrandName");
  const brandSub = document.getElementById("uiSidebarBrandSub");
  const sidebarLabel = document.getElementById("uiSidebarLabel");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactMarkerSelector = ".alert-gantt-marker.is-compact";
  let expandedCompactMarker = null;

  function setExpandedCompactMarker(marker) {
    if (expandedCompactMarker === marker) return;
    expandedCompactMarker?.classList.remove("is-hover-expanded");
    expandedCompactMarker = marker instanceof HTMLElement ? marker : null;
    expandedCompactMarker?.classList.add("is-hover-expanded");
  }

  function isPointInsideRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function maintainCompactMarkerHover(event) {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const directMarker = event.target instanceof Element ? event.target.closest(compactMarkerSelector) : null;
    if (directMarker instanceof HTMLElement) {
      setExpandedCompactMarker(directMarker);
      return;
    }

    if (!(expandedCompactMarker instanceof HTMLElement) || !expandedCompactMarker.isConnected) {
      setExpandedCompactMarker(null);
      return;
    }

    const markerRect = expandedCompactMarker.getBoundingClientRect();
    const label = expandedCompactMarker.querySelector(".alert-gantt-marker-label");
    if (!(label instanceof HTMLElement)) {
      setExpandedCompactMarker(null);
      return;
    }

    const markerCenterX = markerRect.left + markerRect.width / 2;
    const markerCenterY = markerRect.top + markerRect.height / 2;
    const insideMarkerTarget =
      event.clientX >= markerCenterX - 8 &&
      event.clientX <= markerCenterX + 8 &&
      event.clientY >= markerCenterY - 14 &&
      event.clientY <= markerCenterY + 14;
    const insideExpandedLabel = isPointInsideRect(event.clientX, event.clientY, label.getBoundingClientRect());
    if (!insideMarkerTarget && !insideExpandedLabel) setExpandedCompactMarker(null);
  }

  function setActive(links, activeLink) {
    links.forEach((link) => {
      const active = link === activeLink;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function scrollToTarget(selector) {
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement) || target.classList.contains("is-hidden")) return;
    target.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  }

  function parseRoute() {
    const raw = window.location.hash.replace(/^#/, "");
    const [view = "home", query = ""] = raw.split("?");
    return { view: view || "home", params: new URLSearchParams(query) };
  }

  function navigateToHash(nextHash) {
    if (window.location.hash === nextHash) {
      window.dispatchEvent(new Event("hashchange"));
      return;
    }
    window.location.hash = nextHash;
  }

  function getFirstAvailableModel() {
    const selectedModel = document.querySelector("#modelSelect")?.value;
    if (selectedModel && selectedModel !== "全部") return selectedModel;

    const firstOverviewModel = document.querySelector(".overview-card[data-model]")?.dataset.model;
    if (firstOverviewModel) return firstOverviewModel;

    const options = [...document.querySelectorAll("#modelSelect option")]
      .map((option) => option.value)
      .filter((value) => value && value !== "全部");
    return options[0] || "N7";
  }

  function applyNavigationContext() {
    const route = parseRoute();
    const isModelView = route.view === "model-drill";
    const isAreaView = route.view === "area";
    const isDealerFocusView = route.view === "dealer-focus";
    const isCostCalculatorView = route.view === "cost-calculator";
    const isChartStudioView = route.view === "chart-studio";
    homeNav.hidden = isModelView;
    modelNav.hidden = !isModelView;
    areaRouteLink?.classList.remove("is-active");
    areaRouteLink?.removeAttribute("aria-current");
    dealerFocusRouteLink?.classList.remove("is-active");
    dealerFocusRouteLink?.removeAttribute("aria-current");
    costCalculatorRouteLink?.classList.remove("is-active");
    costCalculatorRouteLink?.removeAttribute("aria-current");
    chartStudioRouteLink?.classList.remove("is-active");
    chartStudioRouteLink?.removeAttribute("aria-current");
    setActive(homeRouteLinks, null);

    if (isModelView) {
      const model = route.params.get("model") || getFirstAvailableModel();
      brandName.textContent = model === "全部" ? "全车型分析" : `${model} 车型分析`;
      brandSub.textContent = "MODEL INTELLIGENCE";
      sidebarLabel.textContent = "车型工作台";
      if (skipLink) skipLink.href = "#focusSection";
      setActive(modelLinks, modelLinks[0]);
      return;
    }

    if (isAreaView) {
      brandName.textContent = "区域分析";
      brandSub.textContent = "AREA INTELLIGENCE";
      sidebarLabel.textContent = "";
      if (skipLink) skipLink.href = "#areaSection";
      areaRouteLink?.classList.add("is-active");
      areaRouteLink?.setAttribute("aria-current", "page");
      return;
    }

    if (isDealerFocusView) {
      brandName.textContent = "专店聚焦";
      brandSub.textContent = "DEALER FOCUS";
      sidebarLabel.textContent = "";
      if (skipLink) skipLink.href = "#dealerFocusSection";
      dealerFocusRouteLink?.classList.add("is-active");
      dealerFocusRouteLink?.setAttribute("aria-current", "page");
      return;
    }

    if (isCostCalculatorView) {
      brandName.textContent = "成本计算器";
      brandSub.textContent = "COST CALCULATOR";
      sidebarLabel.textContent = "渠道成本工作台";
      if (skipLink) skipLink.href = "#costCalculatorSection";
      costCalculatorRouteLink?.classList.add("is-active");
      costCalculatorRouteLink?.setAttribute("aria-current", "page");
      return;
    }

    if (isChartStudioView) {
      brandName.textContent = "图表生成";
      brandSub.textContent = "CHART STUDIO";
      sidebarLabel.textContent = "图表工作台";
      if (skipLink) skipLink.href = "#chartStudioSection";
      chartStudioRouteLink?.classList.add("is-active");
      chartStudioRouteLink?.setAttribute("aria-current", "page");
      return;
    }

    brandName.textContent = "东风日产";
    brandSub.textContent = "LEAD INTELLIGENCE";
    sidebarLabel.textContent = "经营工作台";
    if (skipLink) skipLink.href = "#overviewSection";
    setActive(homeRouteLinks, homeMainRouteLink);
  }

  areaRouteLink?.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToHash("#area");
  });

  dealerFocusRouteLink?.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToHash("#dealer-focus");
  });

  costCalculatorRouteLink?.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToHash("#cost-calculator");
  });

  chartStudioRouteLink?.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToHash("#chart-studio");
  });

  modelLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const selector = link.dataset.uiModelTarget;
      if (!selector) return;
      scrollToTarget(selector);
      setActive(modelLinks, link);
    });
  });

  modelRouteLink?.addEventListener("click", (event) => {
    event.preventDefault();
    const model = getFirstAvailableModel();
    navigateToHash(`#model-drill?model=${encodeURIComponent(model)}`);
  });

  homeRouteLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateToHash("#home");
    });
  });

  document.addEventListener("pointermove", maintainCompactMarkerHover, { passive: true });
  document.addEventListener("pointerleave", () => setExpandedCompactMarker(null));
  window.addEventListener("blur", () => setExpandedCompactMarker(null));
  window.addEventListener("hashchange", applyNavigationContext);
  applyNavigationContext();
})();
