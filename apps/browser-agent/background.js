const DEFAULT_API_BASE = "https://mboqara-api-angisoft.fly.dev/v1";
const POLL_ALARM = "mboqara-browser-agent-poll";
const HEARTBEAT_ALARM = "mboqara-browser-agent-heartbeat";
const frames = new Map();

function apiBase() {
  return (chrome.storage.local.get("apiBase").then((value) => value.apiBase || DEFAULT_API_BASE))
    .catch(() => DEFAULT_API_BASE);
}

async function state() {
  const value = await chrome.storage.local.get([
    "apiBase",
    "deviceToken",
    "activeRunId",
  ]);
  return {
    apiBase: value.apiBase || DEFAULT_API_BASE,
    deviceToken: value.deviceToken || "",
    activeRunId: value.activeRunId || "",
  };
}

async function request(path, options = {}) {
  const current = await state();
  const response = await fetch(`${current.apiBase}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      ...(current.deviceToken ? { authorization: `Bearer ${current.deviceToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.blob();
}

function hostAllowed(host, allowedHosts) {
  const normalized = String(host || "").toLowerCase();
  return allowedHosts.some((allowed) => {
    const target = String(allowed || "").toLowerCase();
    return normalized === target || normalized.endsWith(`.${target}`);
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "MBOQARA_FRAME_READY" && sender.tab?.id !== undefined) {
    const frameId = sender.frameId ?? 0;
    frames.set(`${sender.tab.id}:${frameId}`, {
      tabId: sender.tab.id,
      frameId,
      url: message.url || "",
    });
  }
  return false;
});

async function sendToMatchingFrames(command) {
  const matches = [...frames.values()].filter((frame) => {
    try {
      return hostAllowed(new URL(frame.url).hostname, command.allowedHosts || []);
    } catch {
      return false;
    }
  });

  if (matches.length === 0) {
    return {
      ok: false,
      blocked: true,
      error: "Open the employer page inside MboQara, then resume the application.",
      fields: [],
    };
  }

  const current = await state();
  const responses = [];
  for (const frame of matches) {
    try {
      const response = await chrome.tabs.sendMessage(
        frame.tabId,
        {
          type: "MBOQARA_FRAME_COMMAND",
          command: {
            ...command,
            apiBase: current.apiBase,
            deviceToken: current.deviceToken,
          },
        },
        { frameId: frame.frameId },
      );
      if (response) responses.push(response);
    } catch {
      // A frame can disappear while a multi-step form navigates.
    }
  }

  const blocked = responses.find((response) => response.blocked);
  const failed = responses.find((response) => response.failed);
  if (blocked) return blocked;
  if (failed) return failed;
  return {
    ok: true,
    fields: responses.flatMap((response) => response.fields || []),
    result: responses.map((response) => response.result || {}),
  };
}

async function report(runId, command, response) {
  const status = response.blocked
    ? "blocked"
    : response.failed
      ? "failed"
      : response.needsInput
        ? "needs_input"
        : "ok";
  await request(`/agent/browser/runs/${runId}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idempotencyKey: command.commandId || `${runId}:${command.type}`,
      step: command.type.toUpperCase(),
      status,
      url: response.url,
      fields: response.fields || {},
      result: response.result || {},
      error: response.error,
    }),
  });
}

async function execute(command) {
  const response = await sendToMatchingFrames(command);
  await report(command.runId, command, response);
}

async function poll() {
  const current = await state();
  if (!current.deviceToken) return;

  try {
    if (current.activeRunId) {
      const payload = await request(`/agent/browser/runs/${current.activeRunId}/next`);
      if (!payload?.command) {
        await chrome.storage.local.remove("activeRunId");
        return;
      }
      await execute(payload.command);
      return;
    }

    const payload = await request("/agent/browser/runs/next", { method: "POST" });
    if (!payload?.runId) return;
    await chrome.storage.local.set({ activeRunId: payload.runId });
    if (payload.command) await execute(payload.command);
  } catch (error) {
    console.warn("MboQara browser agent poll failed", error);
  }
}

async function heartbeat() {
  const current = await state();
  if (!current.deviceToken || !current.activeRunId) return;
  try {
    await request(`/agent/browser/runs/${current.activeRunId}/heartbeat`, { method: "POST" });
  } catch {
    // A failed heartbeat is visible in the next command request.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void poll();
  if (alarm.name === HEARTBEAT_ALARM) void heartbeat();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "MBOQARA_POLL_NOW") {
    void poll();
  }
});
