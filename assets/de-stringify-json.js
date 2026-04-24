const MAX_PARSE_DEPTH = 64;

/**
 * Parse JSON; if the result is a string, parse again until not a string or limit hit.
 * @param {string} raw
 * @returns {{ value: unknown, depth: number }}
 */
function deStringify(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Input is empty.");
  }

  let value = JSON.parse(trimmed);
  let depth = 1;

  while (typeof value === "string" && depth < MAX_PARSE_DEPTH) {
    const s = value.trim();
    if (!s) {
      break;
    }
    value = JSON.parse(s);
    depth += 1;
  }

  if (typeof value === "string" && depth >= MAX_PARSE_DEPTH) {
    throw new Error(
      `Still a string after ${MAX_PARSE_DEPTH} parse steps; input may be malformed or extremely nested.`
    );
  }

  return { value, depth };
}

function formatOutput(value) {
  return JSON.stringify(value, null, 2);
}

const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run");
const copyBtn = document.getElementById("copy");
const swapBtn = document.getElementById("swap");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status";
  if (kind === "ok") {
    statusEl.classList.add("status--ok");
  } else if (kind === "err") {
    statusEl.classList.add("status--err");
  }
}

function run() {
  try {
    const { value, depth } = deStringify(inputEl.value);
    outputEl.value = formatOutput(value);
    const layers = depth > 1 ? ` (${depth} parse layers)` : "";
    setStatus(`Done${layers}.`, "ok");
  } catch (e) {
    outputEl.value = "";
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(msg, "err");
  }
}

runBtn.addEventListener("click", run);

copyBtn.addEventListener("click", async () => {
  const text = outputEl.value;
  if (!text) {
    setStatus("Nothing to copy.", "err");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.", "ok");
  } catch {
    setStatus("Clipboard permission denied; select output and copy manually.", "err");
  }
});

swapBtn.addEventListener("click", () => {
  const a = inputEl.value;
  const b = outputEl.value;
  inputEl.value = b;
  outputEl.value = a;
  setStatus("Swapped.", "ok");
});

inputEl.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
    ev.preventDefault();
    run();
  }
});
