function t(key) {
  return labels[key] || key;
}

function setLocale(nextLocale) {
  locale = window.HarnessI18n?.[nextLocale] ? nextLocale : "en";
  labels = window.HarnessI18n?.[locale] || {};
  localStorage.setItem("harness.locale", locale);
}

function app() {
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme === "system" ? systemTheme : state.theme;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  const root = document.getElementById("app");
  root.innerHTML = shell();
  bind();
}

function shell() {
  return `<div class="visibility-shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t("eyebrow")}</p>
        <h1>${escapeHtml(projectName())} ${t("projectCockpit")}</h1>
      </div>
      <div class="hero-actions">
        ${routeLink("#/", t("overview"), "overview")}
        ${routeLink("#/tasks", t("taskIndex"), "tasks")}
        ${routeLink("#/review", t("reviewQueue"), "review")}
        ${routeLink("#/modules", t("moduleView"), "modules")}
        <button data-language-toggle>${locale === "zh" ? "EN" : "中文"}</button>
        <button data-theme-toggle>${themeLabel()}</button>
      </div>
    </header>
    ${runtimeModeBanner()}
    ${renderRoute()}
    <div id="drawer-overlay" class="drawer-overlay"></div>
    <div id="task-drawer" class="task-drawer"></div>
  </div>`;
}

function runtimeModeBanner() {
  if (window.__HARNESS_WORKBENCH__ === true) return "";
  return `<section class="runtime-banner">
    <strong>${t("staticReadOnly")}</strong>
    <span>${t("staticReadOnlyDetail")}</span>
    <code>harness dev</code>
  </section>`;
}

function renderRoute() {
  const route = currentRoute();
  if (route.name === "task") return taskDetail(route);
  if (route.name === "reviewTask") return reviewWorkspace(route);
  if (route.name === "review") return reviewQueue();
  if (route.name === "modules") return modulesView(route.id);
  if (route.name === "tasks") return taskIndex();
  return overview();
}

function currentRoute() {
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "tasks" && parts[1]) return { name: "task", id: parts[1], doc: parts[2] === "docs" ? parts[3] || "" : "" };
  if (parts[0] === "review" && parts[1]) return { name: "reviewTask", id: parts[1] };
  if (parts[0] === "review") return { name: "review" };
  if (parts[0] === "modules") return { name: "modules", id: parts[1] || "" };
  if (parts[0] === "tasks") return { name: "tasks" };
  return { name: "overview" };
}

function routeLink(hash, text, routeName) {
  const active = currentRoute().name === routeName;
  return `<a class="${active ? "active" : ""}" href="${hash}">${escapeHtml(text)}</a>`;
}
