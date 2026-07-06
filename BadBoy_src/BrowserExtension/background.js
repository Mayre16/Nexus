const BRIDGE = "http://127.0.0.1:19642/browser-visit";
let lastSent = "";

async function sendVisit(tab) {
  if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
    return;
  }

  const key = `${tab.url}|${tab.title || ""}`;
  if (key === lastSent) return;
  lastSent = key;

  const browser = navigator.userAgent.includes("Edg/") ? "Edge" : "Chrome";

  try {
    await fetch(BRIDGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: tab.url,
        title: tab.title || tab.url,
        browser,
      }),
    });
  } catch {
    // Agente BadBoy no está corriendo — ignorar silenciosamente.
  }
}

function onTab(tab) {
  if (tab?.active) sendVisit(tab);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, onTab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) onTab(tab);
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) sendVisit(tabs[0]);
});
