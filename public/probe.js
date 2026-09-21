const results = document.getElementById("results");

function report(label, state, detail) {
  const item = document.createElement("div");
  item.className = "status";
  item.dataset.state = state;
  const labelElement = document.createElement("strong");
  labelElement.textContent = label;
  item.append(labelElement, `: ${state.toUpperCase()} — ${detail}`);
  results.append(item);
}

function checkBrowserCapabilities() {
  report(
    "Cross-Origin Isolation",
    globalThis.crossOriginIsolated ? "pass" : "fail",
    globalThis.crossOriginIsolated ? "crossOriginIsolated is true" : "crossOriginIsolated is false",
  );
  report(
    "SharedArrayBuffer",
    typeof SharedArrayBuffer === "function" ? "pass" : "fail",
    typeof SharedArrayBuffer === "function"
      ? "SharedArrayBuffer is available"
      : "SharedArrayBuffer is unavailable",
  );
  report(
    "Worker",
    typeof Worker === "function" ? "pass" : "fail",
    typeof Worker === "function" ? "Worker is available" : "Worker is unavailable",
  );
}

async function checkOpfs() {
  if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    report("OPFS", "fail", "StorageManager.getDirectory is unavailable");
    return;
  }

  try {
    await navigator.storage.getDirectory();
    report("OPFS", "pass", "StorageManager.getDirectory succeeded");
  } catch (error) {
    report("OPFS", "fail", error instanceof Error ? error.message : String(error));
  }
}

async function checkWorkerRoundTrip() {
  if (typeof Worker !== "function") {
    report("Worker round trip", "fail", "Worker is unavailable");
    return;
  }

  const workerUrl = URL.createObjectURL(
    new Blob(["self.postMessage('ok')"], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl);

  try {
    await new Promise((resolve, reject) => {
      worker.onmessage = (event) =>
        event.data === "ok" ? resolve() : reject(new Error("Unexpected worker response"));
      worker.onerror = () => reject(new Error("Worker failed to start"));
    });
    report("Worker round trip", "pass", "Worker started and returned a message");
  } catch (error) {
    report("Worker round trip", "fail", error instanceof Error ? error.message : String(error));
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  }
}

async function checkProbeApi() {
  try {
    const response = await fetch("/api/sync/probe", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = await response.json();

    report(
      "Authenticated same-origin API",
      response.ok && body.ready === true ? "pass" : "fail",
      `HTTP ${response.status}; response ${JSON.stringify(body)}`,
    );
  } catch (error) {
    report(
      "Authenticated same-origin API",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
  }
}

checkBrowserCapabilities();
checkOpfs();
checkWorkerRoundTrip();
checkProbeApi();
