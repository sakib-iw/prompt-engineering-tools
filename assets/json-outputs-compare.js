const MIN_OUTPUTS = 2;
const MAX_OUTPUTS = 8;
const TRUNC = 96;

/** @param {unknown} v */
function stableStringify(v) {
  if (v === undefined) return "undefined";
  return JSON.stringify(v);
}

/**
 * @param {unknown} val
 * @param {string} prefix
 * @param {Map<string, unknown>} out
 */
function flattenLeaves(val, prefix, out) {
  if (val === null || typeof val !== "object") {
    out.set(prefix === "" ? "$" : prefix, val);
    return;
  }
  if (Array.isArray(val)) {
    val.forEach((item, i) => flattenLeaves(item, `${prefix}[${i}]`, out));
    return;
  }
  for (const k of Object.keys(val)) {
    const next = prefix === "" ? k : `${prefix}.${k}`;
    flattenLeaves(val[k], next, out);
  }
}

/**
 * @param {unknown} val
 * @returns {Map<string, unknown>}
 */
function leafMap(val) {
  const m = new Map();
  flattenLeaves(val, "", m);
  return m;
}

/**
 * @param {unknown[]} parsed
 * @returns {Set<string>}
 */
function unionLeafPaths(parsed) {
  const s = new Set();
  for (const p of parsed) {
    for (const k of leafMap(p).keys()) s.add(k);
  }
  return s;
}

/**
 * @typedef {{ path: string; outputIndex: number; message: string }} StructIssue
 * @param {unknown} ref
 * @param {unknown} other
 * @param {string} path
 * @param {number} outIdx
 * @param {StructIssue[]} issues
 */
function compareStructure(ref, other, path, outIdx, issues) {
  const pathLabel = path === "" ? "(root)" : path;
  const refT = ref === null ? "null" : Array.isArray(ref) ? "array" : typeof ref;
  const oT = other === null ? "null" : Array.isArray(other) ? "array" : typeof other;

  if (refT !== oT) {
    issues.push({
      path: pathLabel,
      outputIndex: outIdx,
      message: `Type mismatch: reference has ${refT}, this output has ${oT}`,
    });
    return;
  }

  if (ref === null || refT !== "object") {
    return;
  }

  if (Array.isArray(ref)) {
    if (!Array.isArray(other)) return;
    if (ref.length !== other.length) {
      issues.push({
        path: pathLabel,
        outputIndex: outIdx,
        message: `Array length: reference ${ref.length}, this output ${other.length}`,
      });
    }
    const n = Math.min(ref.length, other.length);
    for (let i = 0; i < n; i++) {
      const seg = `${path}[${i}]`;
      compareStructure(ref[i], other[i], path === "" ? `[${i}]` : seg, outIdx, issues);
    }
    return;
  }

  const rkeys = Object.keys(ref);
  const okeys = Object.keys(other);
  const rset = new Set(rkeys);
  const oset = new Set(okeys);
  for (const k of rkeys) {
    const child = path === "" ? k : `${path}.${k}`;
    if (!oset.has(k)) {
      issues.push({
        path: child,
        outputIndex: outIdx,
        message: `Missing key "${k}" (present in reference)`,
      });
    } else {
      compareStructure(ref[k], other[k], child, outIdx, issues);
    }
  }
  for (const k of okeys) {
    if (!rset.has(k)) {
      const child = path === "" ? k : `${path}.${k}`;
      issues.push({
        path: child,
        outputIndex: outIdx,
        message: `Extra key "${k}" (not in reference)`,
      });
    }
  }
}

/**
 * @param {unknown} v
 * @param {number} max
 */
function cellKey(v) {
  if (v === undefined) return "__absent__";
  return stableStringify(v);
}

function previewCell(v, max) {
  if (v === undefined) {
    return { text: "—", full: "(absent at this path)" };
  }
  const s = stableStringify(v);
  if (s.length <= max) return { text: s, full: s };
  return { text: s.slice(0, max - 1) + "…", full: s };
}

/** @param {string} s */
function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function tryLoadAjv() {
  try {
    const mod = await import("https://esm.sh/ajv@8.17.1?bundle");
    const Ajv = mod.default;
    return new Ajv({ allErrors: true, strict: false, validateSchema: false });
  } catch {
    try {
      const mod = await import("https://esm.sh/ajv@8.17.1");
      const Ajv = mod.default;
      return new Ajv({ allErrors: true, strict: false, validateSchema: false });
    } catch {
      return null;
    }
  }
}

const listEl = document.getElementById("output-list");
const schemaEl = document.getElementById("schema");
const refSelect = document.getElementById("reference");
const highlightMode = document.getElementById("highlightMode");
const filterDiff = document.getElementById("filterDiff");
const pathFilter = document.getElementById("pathFilter");
const runBtn = document.getElementById("run");
const copyBtn = document.getElementById("copy");
const addBtn = document.getElementById("add-output");
const statusEl = document.getElementById("status");
const reportEl = document.getElementById("report");

/** @type {string | null} */
let lastReport = null;

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "status";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "err") statusEl.classList.add("status--err");
}

function countSlots() {
  return listEl.querySelectorAll(".output-slot").length;
}

function renumberOutputs() {
  const slots = listEl.querySelectorAll(".output-slot");
  slots.forEach((slot, i) => {
    const n = slot.querySelector(".output-slot__n");
    if (n) n.textContent = String(i + 1);
    const ta = slot.querySelector("textarea");
    if (ta) ta.setAttribute("aria-label", `JSON output ${i + 1}`);
  });
  const prev = refSelect.value;
  refSelect.innerHTML = "";
  slots.forEach((_, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Output ${i + 1}`;
    refSelect.appendChild(opt);
  });
  if (prev && Number(prev) < slots.length) refSelect.value = prev;
}

function addOutputSlot() {
  if (countSlots() >= MAX_OUTPUTS) return;
  const wrap = document.createElement("div");
  wrap.className = "output-slot";
  wrap.innerHTML = `
    <div class="output-slot__head">
      <label class="output-slot__label">Output <span class="output-slot__n"></span></label>
      <button type="button" class="output-slot__remove secondary" aria-label="Remove this output">Remove</button>
    </div>
    <textarea class="output-slot__ta" spellcheck="false" rows="10" placeholder='{ "example": true }'></textarea>
  `;
  const rm = wrap.querySelector(".output-slot__remove");
  rm.addEventListener("click", () => {
    if (countSlots() <= MIN_OUTPUTS) {
      setStatus(`Keep at least ${MIN_OUTPUTS} output slots.`, "err");
      return;
    }
    wrap.remove();
    renumberOutputs();
    setStatus("", "");
  });
  listEl.appendChild(wrap);
  renumberOutputs();
}

function initSlots() {
  for (let i = 0; i < 3; i++) addOutputSlot();
}

/**
 * Every visible slot must contain non-empty valid JSON (remove unused slots with “Remove”).
 * @returns {{ values: unknown[] } | { err: string }}
 */
function gatherStrict() {
  const slots = [...listEl.querySelectorAll(".output-slot")];
  if (slots.length < MIN_OUTPUTS) {
    return { err: `Use at least ${MIN_OUTPUTS} output slots (add more if needed).` };
  }
  /** @type {unknown[]} */
  const values = [];
  for (let i = 0; i < slots.length; i++) {
    const ta = slots[i].querySelector("textarea");
    const text = (ta?.value || "").trim();
    if (!text) {
      return { err: `Output ${i + 1} is empty. Fill every slot, or remove slots you do not need.` };
    }
    try {
      values.push(JSON.parse(text));
    } catch (e) {
      const msg = e instanceof SyntaxError ? e.message : String(e);
      return { err: `Output ${i + 1}: invalid JSON (${msg})` };
    }
  }
  return { values };
}

/**
 * @param {unknown} schemaRaw
 * @param {unknown[]} values
 */
async function schemaBlock(schemaRaw, values) {
  const ajv = await tryLoadAjv();
  if (!ajv) {
    return {
      html: `<p class="report-muted">JSON Schema validator could not load (network or CDN). Try again online, or rely on structural comparison only.</p>`,
      lines: ["[Schema] Validator not loaded."],
    };
  }
  let validate;
  try {
    validate = ajv.compile(schemaRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      html: `<p class="status--err" style="margin:0">Invalid JSON Schema: ${esc(msg)}</p>`,
      lines: [`[Schema] Compile error: ${msg}`],
    };
  }

  const lines = [];
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const ok = validate(values[i]);
    if (ok) {
      rows.push(`<tr><th scope="row">Output ${i + 1}</th><td class="cell-ok">Valid</td><td>—</td></tr>`);
      lines.push(`[Schema] Output ${i + 1}: valid`);
    } else {
      const errs = validate.errors || [];
      const detail = errs
        .slice(0, 40)
        .map(
          (er) =>
            `${er.instancePath || "/"} ${er.message}${er.params ? " " + JSON.stringify(er.params) : ""}`
        )
        .join("\n");
      const more = errs.length > 40 ? `\n… and ${errs.length - 40} more` : "";
      rows.push(
        `<tr><th scope="row">Output ${i + 1}</th><td class="cell-bad">Invalid</td><td><pre class="schema-err-pre">${esc(
          detail + more
        )}</pre></td></tr>`
      );
      lines.push(`[Schema] Output ${i + 1}: invalid\n${detail}${more}`);
    }
  }

  return {
    html: `<table class="data-table"><thead><tr><th>Output</th><th>Result</th><th>Issues</th></tr></thead><tbody>${rows.join(
      ""
    )}</tbody></table>`,
    lines,
  };
}

function buildMatrix(values, refIdx, mode, onlyDiff, pathNeedle) {
  const maps = values.map((v) => leafMap(v));
  const paths = [...unionLeafPaths(values)].sort((a, b) => a.localeCompare(b));
  const needle = pathNeedle.trim().toLowerCase();

  /** @type { { path: string; rowDiff: boolean; html: string }[] } */
  const rowObjs = [];
  for (const path of paths) {
    if (needle && !path.toLowerCase().includes(needle)) continue;
    const cells = values.map((_, i) => maps[i].get(path));
    const refVal = cells[refIdx];
    const refK = cellKey(refVal);

    let rowDiff = false;
    if (mode === "ref") {
      rowDiff = cells.some((c) => cellKey(c) !== refK);
    } else {
      const firstK = cellKey(cells[0]);
      rowDiff = cells.some((c) => cellKey(c) !== firstK);
    }

    if (onlyDiff && !rowDiff) continue;

    const tds = cells.map((c) => {
      const { text, full } = previewCell(c, TRUNC);
      let cls = "matrix-cell";
      if (mode === "ref") {
        if (cellKey(c) !== refK) cls += " matrix-cell--diff";
      } else if (cellKey(c) !== cellKey(cells[0])) {
        cls += " matrix-cell--diff";
      }
      return `<td class="${cls}" title="${esc(full)}">${esc(text)}</td>`;
    });

    rowObjs.push({
      path,
      rowDiff,
      html: `<tr class="${rowDiff ? "matrix-row--diff" : ""}"><th scope="row" class="matrix-path" title="${esc(
        path
      )}">${esc(path)}</th>${tds.join("")}</tr>`,
    });
  }

  rowObjs.sort((a, b) => {
    if (a.rowDiff !== b.rowDiff) return a.rowDiff ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  const rows = rowObjs.map((r) => r.html);

  const head = values
    .map((_, i) => `<th scope="col" class="matrix-col-head">Out ${i + 1}${i === refIdx ? " (ref)" : ""}</th>`)
    .join("");

  return {
    html:
      rows.length === 0
        ? `<p class="report-muted">No paths to show (try turning off “only differing” or clear the path filter).</p>`
        : `<div class="matrix-wrap"><table class="matrix"><thead><tr><th scope="col" class="matrix-path matrix-path-head">Path</th>${head}</tr></thead><tbody>${rows.join(
            ""
          )}</tbody></table></div>`,
    pathCount: paths.length,
    rowCount: rows.length,
  };
}

async function run() {
  lastReport = null;
  reportEl.hidden = true;
  reportEl.innerHTML = "";

  const gathered = gatherStrict();
  if ("err" in gathered) {
    setStatus(gathered.err, "err");
    return;
  }
  const { values } = gathered;
  const refIdx = Math.min(Math.max(0, Number(refSelect.value) || 0), values.length - 1);
  const refVal = values[refIdx];

  /** @type {StructIssue[]} */
  const structIssues = [];
  values.forEach((v, i) => {
    if (i !== refIdx) compareStructure(refVal, v, "", i, structIssues);
  });

  const schemaText = schemaEl.value.trim();
  let schemaSection = { html: "", lines: [] };
  if (schemaText) {
    let schemaObj;
    try {
      schemaObj = JSON.parse(schemaText);
    } catch (e) {
      setStatus(`Schema is not valid JSON: ${e instanceof SyntaxError ? e.message : e}`, "err");
      return;
    }
    schemaSection = await schemaBlock(schemaObj, values);
  }

  const mode = highlightMode.value === "row" ? "row" : "ref";
  const onlyDiff = filterDiff.checked;
  const matrix = buildMatrix(values, refIdx, mode, onlyDiff, pathFilter.value);

  const structRows = structIssues.length
    ? structIssues
        .map(
          (it) =>
            `<tr><td>${it.outputIndex + 1}</td><td><code>${esc(it.path)}</code></td><td>${esc(it.message)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="report-muted">No structural differences vs reference (shapes and array lengths align).</td></tr>`;

  const lines = [];
  lines.push("=== Multi-output JSON compare ===");
  lines.push(`Reference: output ${refIdx + 1}`);
  lines.push(`Structural issues: ${structIssues.length}`);
  structIssues.forEach((it) => {
    lines.push(`  [Out ${it.outputIndex + 1}] ${it.path}: ${it.message}`);
  });
  lines.push("");
  schemaSection.lines.forEach((l) => lines.push(l));
  lines.push("");
  lines.push(`Value matrix rows shown: ${matrix.rowCount} (of ${matrix.pathCount} leaf paths total)`);
  lastReport = lines.join("\n");

  reportEl.innerHTML = `
    <section class="report-block">
      <h2>Structural check vs reference (output ${refIdx + 1})</h2>
      <p class="report-muted">Same types, object keys, and array lengths as the reference. Value differences on matching shapes appear in the matrix below.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Output</th><th>Path</th><th>Issue</th></tr></thead>
          <tbody>${structRows}</tbody>
        </table>
      </div>
    </section>
    ${
      schemaText
        ? `<section class="report-block"><h2>JSON Schema validation</h2>${schemaSection.html}</section>`
        : `<section class="report-block"><h2>JSON Schema validation</h2><p class="report-muted">No schema pasted — skipped. Paste a JSON Schema object to validate every output.</p></section>`
    }
    <section class="report-block">
      <h2>Value matrix (leaf paths)</h2>
      <p class="report-muted">Each row is one path into the JSON (dot + <code>[index]</code> notation). Hover cells for full values. Highlight mode is set above the button.</p>
      ${matrix.html}
    </section>
  `;
  reportEl.hidden = false;
  setStatus(
    `Compared ${values.length} outputs; ${structIssues.length} structural issue(s); matrix shows ${matrix.rowCount} row(s).`,
    "ok"
  );
}

runBtn.addEventListener("click", () => run());
copyBtn.addEventListener("click", async () => {
  if (!lastReport) {
    setStatus("Run compare first.", "err");
    return;
  }
  try {
    await navigator.clipboard.writeText(lastReport);
    setStatus("Copied summary text.", "ok");
  } catch {
    setStatus("Clipboard unavailable.", "err");
  }
});
addBtn.addEventListener("click", () => {
  addOutputSlot();
  setStatus("", "");
});

initSlots();
renumberOutputs();
