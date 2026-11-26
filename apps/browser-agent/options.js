const DEFAULT_API_BASE = "https://api.mboqara.angisoft.co.ke/v1";
const form = document.getElementById("pairing-form");
const apiBaseInput = document.getElementById("api-base");
const pairingCodeInput = document.getElementById("pairing-code");
const status = document.getElementById("status");

chrome.storage.local.get(["apiBase", "deviceToken"]).then((stored) => {
  apiBaseInput.value = stored.apiBase || DEFAULT_API_BASE;
  if (stored.deviceToken) status.textContent = "This browser is already paired.";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Pairing…";
  const apiBase = apiBaseInput.value.replace(/\/+$/, "");
  try {
    const response = await fetch(`${apiBase}/agent/browser/devices/claim`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ pairingCode: pairingCodeInput.value.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The pairing code is invalid or expired.");
    }
    await chrome.storage.local.set({
      apiBase,
      deviceToken: payload.deviceToken,
      activeRunId: "",
    });
    pairingCodeInput.value = "";
    status.textContent = "Paired. Keep this page open and MboQara will hand it the next approved application.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});
