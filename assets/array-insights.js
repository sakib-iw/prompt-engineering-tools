/**
 * @param {string} text
 * @returns {number[]}
 */
function parseNumberArray(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Input is empty.");
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(
      e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : String(e)
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Input must be a JSON array (e.g. [1, 2, 3]).");
  }
  return parsed.map((v, i) => {
    if (typeof v !== "number" || Number.isNaN(v)) {
      throw new Error(`Index ${i}: expected a number, got ${JSON.stringify(v)}.`);
    }
    if (!Number.isFinite(v)) {
      throw new Error(`Index ${i}: value must be finite (not Infinity).`);
    }
    return v;
  });
}

/** @param {number[]} values */
function orderKind(values) {
  if (values.length <= 1) {
    return { label: "single or empty", detail: "Not enough values to compare order." };
  }
  let strictInc = true;
  let nonDec = true;
  let strictDec = true;
  let nonInc = true;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a >= b) strictInc = false;
    if (a > b) nonDec = false;
    if (a <= b) strictDec = false;
    if (a < b) nonInc = false;
  }
  if (strictInc) return { label: "strictly increasing", detail: "Each value is greater than the previous." };
  if (nonDec) return { label: "non-decreasing", detail: "Equal or increasing; duplicates allowed." };
  if (strictDec) return { label: "strictly decreasing", detail: "Each value is less than the previous." };
  if (nonInc) return { label: "non-increasing", detail: "Equal or decreasing." };
  return { label: "not monotonic", detail: "Order changes direction or is irregular." };
}

/** @param {number[]} sortedWithDupes */
function median(sortedWithDupes) {
  const n = sortedWithDupes.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sortedWithDupes[mid];
  return (sortedWithDupes[mid - 1] + sortedWithDupes[mid]) / 2;
}

/**
 * @param {number[]} sortedUnique ascending
 * @returns {string}
 */
function formatRuns(sortedUnique) {
  if (sortedUnique.length === 0) return "(none)";
  const runs = [];
  let start = sortedUnique[0];
  let prev = sortedUnique[0];
  for (let i = 1; i < sortedUnique.length; i++) {
    const x = sortedUnique[i];
    if (x === prev + 1) {
      prev = x;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = x;
  }
  runs.push(start === prev ? `${start}` : `${start}–${prev}`);
  return runs.join(", ");
}

/**
 * @param {number[]} values
 * @param {number | null} rangeFrom
 * @param {number | null} rangeTo
 */
function analyze(values, rangeFrom, rangeTo) {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const uniqueSorted = [...new Set(sorted)];
  const setAll = new Set(values);
  let allIntegers = values.every((v) => Number.isInteger(v));

  const min = n ? Math.min(...values) : null;
  const max = n ? Math.max(...values) : null;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : null;

  /** @type {Map<number, number[]>} */
  const indexByValue = new Map();
  values.forEach((v, i) => {
    if (!indexByValue.has(v)) indexByValue.set(v, []);
    indexByValue.get(v).push(i);
  });
  const duplicates = [...indexByValue.entries()].filter(([, idx]) => idx.length > 1);

  let missingFrom = rangeFrom;
  let missingTo = rangeTo;
  if (missingFrom === null && missingTo === null && min !== null && max !== null) {
    missingFrom = Math.floor(min);
    missingTo = Math.ceil(max);
  }

  /** @type {number[]} */
  let missing = [];
  let missingNote = "";
  if (missingFrom === null || missingTo === null) {
    missingNote = "Could not determine range for missing scan.";
  } else if (!Number.isInteger(missingFrom) || !Number.isInteger(missingTo)) {
    missingNote = "Range bounds must be integers.";
  } else if (missingFrom > missingTo) {
    missingNote = "Range start must be ≤ range end.";
  } else {
    for (let k = missingFrom; k <= missingTo; k++) {
      if (!setAll.has(k)) missing.push(k);
    }
  }

  const runsLabel = allIntegers
    ? formatRuns(uniqueSorted)
    : "(not computed — array contains non-integers)";

  return {
    n,
    min,
    max,
    sum,
    mean,
    median: median(sorted),
    uniqueCount: uniqueSorted.length,
    allIntegers,
    order: orderKind(values),
    sortedAsc: sorted,
    sortedDesc: [...sorted].reverse(),
    uniqueAsc: uniqueSorted,
    uniqueDesc: [...uniqueSorted].reverse(),
    missing,
    missingRange:
      missingFrom !== null && missingTo !== null && Number.isInteger(missingFrom) && Number.isInteger(missingTo)
        ? { from: missingFrom, to: missingTo }
        : null,
    missingNote,
    duplicates,
    indexByValue,
    runsLabel,
  };
}

function buildPlainReport(values, a) {
  const lines = [];
  lines.push("=== Number array report ===");
  lines.push(`Length: ${a.n}  |  Unique values: ${a.uniqueCount}`);
  if (a.min !== null) {
    lines.push(`Min: ${a.min}  |  Max: ${a.max}  |  Span: ${a.max - a.min}`);
    lines.push(`Sum: ${a.sum}  |  Mean: ${a.mean}  |  Median: ${a.median}`);
  }
  lines.push(`Order (as given): ${a.order.label} — ${a.order.detail}`);
  lines.push("");
  lines.push("Consecutive runs (unique sorted integers):");
  lines.push(a.runsLabel);
  lines.push("");
  if (a.missingRange && !a.missingNote) {
    lines.push(
      `Missing integers in [${a.missingRange.from}, ${a.missingRange.to}]: ` +
        (a.missing.length ? a.missing.join(", ") : "(none — full coverage)")
    );
  } else if (a.missingNote) {
    lines.push(`Missing integers: ${a.missingNote}`);
  }
  lines.push("");
  lines.push("Ascending (all elements, with duplicates):");
  lines.push(JSON.stringify(a.sortedAsc));
  lines.push("");
  lines.push("Descending (all elements):");
  lines.push(JSON.stringify(a.sortedDesc));
  lines.push("");
  lines.push("Unique ascending:");
  lines.push(JSON.stringify(a.uniqueAsc));
  lines.push("");
  if (a.duplicates.length) {
    lines.push("Duplicates:");
    for (const [val, idx] of a.duplicates) {
      lines.push(`  ${val} at indices: ${idx.join(", ")}`);
    }
  } else {
    lines.push("Duplicates: none");
  }
  lines.push("");
  lines.push("Index → value:");
  values.forEach((v, i) => lines.push(`  [${i}] = ${v}`));
  return lines.join("\n");
}

const inputEl = document.getElementById("input");
const rangeFromEl = document.getElementById("rangeFrom");
const rangeToEl = document.getElementById("rangeTo");
const statusEl = document.getElementById("status");
const reportEl = document.getElementById("report");
const runBtn = document.getElementById("run");
const copyBtn = document.getElementById("copy");

/** @type {string | null} */
let lastPlainReport = null;

function parseOptionalInt(el) {
  const t = el.value.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`"${el.id === "rangeFrom" ? "Range from" : "Range to"}" must be a whole number or empty.`);
  }
  return n;
}

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "status";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "err") statusEl.classList.add("status--err");
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(values, a) {
  const dupRows =
    a.duplicates.length === 0
      ? "<tr><td colspan=\"2\">None</td></tr>"
      : a.duplicates
          .map(
            ([val, idx]) =>
              `<tr><td>${esc(val)}</td><td>${idx.map((i) => `[${i}]`).join(", ")}</td></tr>`
          )
          .join("");

  const idxRows = values.map((v, i) => `<tr><td>${i}</td><td>${esc(v)}</td></tr>`).join("");

  let missingHtml = "";
  if (a.missingNote) {
    missingHtml = `<p class="report-muted">${esc(a.missingNote)}</p>`;
  } else if (a.missingRange) {
    const list =
      a.missing.length === 0
        ? "<p>None — every integer in the range appears at least once.</p>"
        : `<pre class="report-pre">${esc(a.missing.join(", "))}</pre>`;
    missingHtml = `<p class="report-lead">Integers from <strong>${a.missingRange.from}</strong> to <strong>${a.missingRange.to}</strong> that never appear:</p>${list}`;
  }

  reportEl.innerHTML = `
    <section class="report-block">
      <h2>Summary</h2>
      <table class="data-table">
        <tbody>
          <tr><th scope="row">Count</th><td>${a.n}</td></tr>
          <tr><th scope="row">Unique count</th><td>${a.uniqueCount}</td></tr>
          <tr><th scope="row">Min / max</th><td>${a.min ?? "—"} / ${a.max ?? "—"}</td></tr>
          <tr><th scope="row">Sum</th><td>${a.sum}</td></tr>
          <tr><th scope="row">Mean</th><td>${a.mean !== null ? a.mean : "—"}</td></tr>
          <tr><th scope="row">Median</th><td>${a.median !== null ? a.median : "—"}</td></tr>
          <tr><th scope="row">All integers?</th><td>${a.allIntegers ? "Yes" : "No"}</td></tr>
        </tbody>
      </table>
    </section>
    <section class="report-block">
      <h2>Order as given</h2>
      <p><strong>${esc(a.order.label)}</strong> — ${esc(a.order.detail)}</p>
    </section>
    <section class="report-block">
      <h2>Consecutive runs (unique integers)</h2>
      <p class="report-muted">Each segment is a run of consecutive integers after sorting and deduplicating. Requires all values to be whole numbers.</p>
      <pre class="report-pre">${esc(a.runsLabel)}</pre>
    </section>
    <section class="report-block">
      <h2>Missing integers in range</h2>
      ${missingHtml}
    </section>
    <section class="report-block">
      <h2>Sorted orders</h2>
      <h3 class="report-h3">Ascending (with duplicates)</h3>
      <pre class="report-pre">${esc(JSON.stringify(a.sortedAsc))}</pre>
      <h3 class="report-h3">Descending (with duplicates)</h3>
      <pre class="report-pre">${esc(JSON.stringify(a.sortedDesc))}</pre>
      <h3 class="report-h3">Unique ascending</h3>
      <pre class="report-pre">${esc(JSON.stringify(a.uniqueAsc))}</pre>
      <h3 class="report-h3">Unique descending</h3>
      <pre class="report-pre">${esc(JSON.stringify(a.uniqueDesc))}</pre>
    </section>
    <section class="report-block">
      <h2>Duplicates</h2>
      <table class="data-table">
        <thead><tr><th>Value</th><th>Indices</th></tr></thead>
        <tbody>${dupRows}</tbody>
      </table>
    </section>
    <section class="report-block">
      <h2>Index → value</h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Index</th><th>Value</th></tr></thead>
          <tbody>${idxRows}</tbody>
        </table>
      </div>
    </section>
  `;
  reportEl.hidden = false;
}

function run() {
  try {
    const values = parseNumberArray(inputEl.value);
    if (values.length === 0) {
      throw new Error("Array is empty.");
    }
    const rf = parseOptionalInt(rangeFromEl);
    const rt = parseOptionalInt(rangeToEl);
    if ((rf === null) !== (rt === null)) {
      throw new Error('Set both "Range from" and "Range to", or leave both blank for min–max of the array.');
    }
    const a = analyze(values, rf, rt);
    lastPlainReport = buildPlainReport(values, a);
    render(values, a);
    setStatus("Analysis updated.", "ok");
  } catch (e) {
    reportEl.hidden = true;
    reportEl.innerHTML = "";
    lastPlainReport = null;
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
}

runBtn.addEventListener("click", run);

copyBtn.addEventListener("click", async () => {
  if (!lastPlainReport) {
    setStatus("Nothing to copy; fix errors and run Analyze first.", "err");
    return;
  }
  try {
    await navigator.clipboard.writeText(lastPlainReport);
    setStatus("Copied plain-text report.", "ok");
  } catch {
    setStatus("Clipboard blocked; copy from the page manually.", "err");
  }
});

inputEl.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
    ev.preventDefault();
    run();
  }
});
