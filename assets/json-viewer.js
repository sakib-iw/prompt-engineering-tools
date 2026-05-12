const inputEl = document.getElementById("input");
const normalizedEl = document.getElementById("normalized");
const statusEl = document.getElementById("status");
const treeEl = document.getElementById("tree");

const validateBtn = document.getElementById("validate");
const formatBtn = document.getElementById("format");
const minifyBtn = document.getElementById("minify");
const expandBtn = document.getElementById("expand");
const collapseBtn = document.getElementById("collapse");
const fullscreenBtn = document.getElementById("fullscreen");
const copyBtn = document.getElementById("copy");
const treePanelEl = document.getElementById("tree-panel");

/**
 * @param {string} message
 * @param {"ok" | "err" | undefined} kind
 */
function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "err") statusEl.classList.add("status--err");
}

/**
 * @returns {unknown}
 */
function parseInput() {
  const raw = inputEl.value.trim();
  if (!raw) {
    throw new Error("Input is empty.");
  }
  return JSON.parse(raw);
}

/**
 * @param {unknown} value
 */
function applyNormalized(value) {
  normalizedEl.value = JSON.stringify(value, null, 2);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatPrimitive(value) {
  if (typeof value === "string") return `"${value}"`;
  if (value === null) return "null";
  return String(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function primitiveTypeClass(value) {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "other";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function getPreview(value) {
  if (value === null || typeof value !== "object") {
    return formatPrimitive(value);
  }

  if (Array.isArray(value)) {
    const first = value.slice(0, 2).map(formatPrimitive).join(", ");
    return value.length ? `[${first}${value.length > 2 ? ", ..." : ""}]` : "[]";
  }

  const entries = Object.entries(value);
  const first = entries
    .slice(0, 2)
    .map(([key, item]) => `${key}: ${formatPrimitive(item)}`)
    .join(", ");
  return entries.length ? `{ ${first}${entries.length > 2 ? ", ..." : ""} }` : "{}";
}

/**
 * @param {unknown} value
 * @returns {HTMLElement}
 */
function renderNode(value) {
  if (value === null || typeof value !== "object") {
    const leaf = document.createElement("div");
    leaf.className = "json-leaf";
    leaf.textContent =
      typeof value === "string" ? `"${value}"` : value === null ? "null" : String(value);
    return leaf;
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  const details = document.createElement("details");
  details.className = "json-node";
  details.open = true;
  details.dataset.kind = isArray ? "array" : "object";

  const summary = document.createElement("summary");
  summary.className = "json-summary";
  const nodeType = document.createElement("span");
  nodeType.className = "json-summary__type";
  nodeType.textContent = isArray ? "Array" : "Object";

  const nodeCount = document.createElement("span");
  nodeCount.className = "json-summary__count";
  nodeCount.textContent = String(entries.length);

  const preview = document.createElement("span");
  preview.className = "json-summary__preview";
  preview.textContent = getPreview(value);

  summary.append(nodeType, nodeCount, preview);
  details.appendChild(summary);

  const children = document.createElement("div");
  children.className = "json-children";

  entries.forEach(([key, childValue]) => {
    const row = document.createElement("div");
    row.className = "json-row";

    const keyEl = document.createElement("span");
    keyEl.className = "json-key";
    keyEl.textContent = isArray ? `[${key}]` : key;
    row.appendChild(keyEl);

    if (childValue !== null && typeof childValue === "object") {
      row.appendChild(renderNode(childValue));
    } else {
      const valueEl = document.createElement("span");
      valueEl.className = `json-value json-value--${primitiveTypeClass(childValue)}`;
      valueEl.textContent = formatPrimitive(childValue);
      row.appendChild(valueEl);
    }

    children.appendChild(row);
  });

  details.appendChild(children);
  return details;
}

/**
 * @param {unknown} value
 */
function renderTree(value) {
  treeEl.replaceChildren(renderNode(value));
}

function validateAndRender() {
  try {
    const parsed = parseInput();
    applyNormalized(parsed);
    renderTree(parsed);
    setStatus("Valid JSON.", "ok");
  } catch (error) {
    normalizedEl.value = "";
    treeEl.replaceChildren();
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "err");
  }
}

validateBtn.addEventListener("click", validateAndRender);

formatBtn.addEventListener("click", () => {
  try {
    const parsed = parseInput();
    const pretty = JSON.stringify(parsed, null, 2);
    inputEl.value = pretty;
    applyNormalized(parsed);
    renderTree(parsed);
    setStatus("Formatted.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "err");
  }
});

minifyBtn.addEventListener("click", () => {
  try {
    const parsed = parseInput();
    const minified = JSON.stringify(parsed);
    inputEl.value = minified;
    normalizedEl.value = minified;
    renderTree(parsed);
    setStatus("Minified.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "err");
  }
});

expandBtn.addEventListener("click", () => {
  treeEl.querySelectorAll("details").forEach((el) => {
    el.open = true;
  });
});

collapseBtn.addEventListener("click", () => {
  treeEl.querySelectorAll("details").forEach((el) => {
    el.open = false;
  });
});

function updateFullscreenButtonState() {
  const inFullscreen = document.fullscreenElement === treePanelEl;
  fullscreenBtn.textContent = inFullscreen ? "Exit full screen" : "Full screen tree";
}

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenEnabled) {
    setStatus("Fullscreen is not supported in this browser.", "err");
    return;
  }

  try {
    if (document.fullscreenElement === treePanelEl) {
      await document.exitFullscreen();
    } else {
      await treePanelEl.requestFullscreen();
    }
    updateFullscreenButtonState();
  } catch {
    setStatus("Could not change fullscreen mode.", "err");
  }
});

document.addEventListener("fullscreenchange", () => {
  updateFullscreenButtonState();
});

copyBtn.addEventListener("click", async () => {
  const text = normalizedEl.value.trim();
  if (!text) {
    setStatus("Nothing to copy. Validate first.", "err");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.", "ok");
  } catch {
    setStatus("Clipboard permission denied; copy manually.", "err");
  }
});

inputEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    validateAndRender();
  }
});

updateFullscreenButtonState();
