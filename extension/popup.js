let interceptionActive = true;

function blockTab(tabId, url, risk = 100) {
  const target = chrome.runtime.getURL('block.html') + 
    '?url=' + encodeURIComponent(url) + 
    '&risk=' + encodeURIComponent(risk);
  return chrome.tabs.update(tabId, { url: target });
}

function renderInterceptionUI(active) {
  interceptionActive = active;
  const btn = document.getElementById('toggleInterception');
  const desc = document.getElementById('policy-desc');
  if (btn) {
    btn.textContent = active ? 'Active' : 'Disabled';
    btn.className = `toggle-btn ${active ? 'active' : 'disabled'}`;
  }
  if (desc) {
    desc.textContent = active
      ? 'Suspicious pages and credential harvesters will be intercepted automatically.'
      : 'Monitoring mode only. Automatic redirection is disabled; you can view real sites.';
  }
}

async function loadInterceptionSetting() {
  if (chrome?.storage?.local) {
    chrome.storage.local.get(['interception_active'], (res) => {
      if (res && typeof res.interception_active === 'boolean') {
        renderInterceptionUI(res.interception_active);
      }
    });
  }
  try {
    const r = await fetch('http://127.0.0.1:5000/api/settings');
    if (r.ok) {
      const d = await r.json();
      if (typeof d.interception_active === 'boolean') {
        renderInterceptionUI(d.interception_active);
        if (chrome?.storage?.local) {
          chrome.storage.local.set({ interception_active: d.interception_active });
        }
      }
    }
  } catch (_) {}
}

const toggleBtn = document.getElementById('toggleInterception');
if (toggleBtn) {
  toggleBtn.onclick = async () => {
    const nextVal = !interceptionActive;
    renderInterceptionUI(nextVal);
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ interception_active: nextVal });
    }
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'set_interception', interception_active: nextVal });
    }
    try {
      await fetch('http://127.0.0.1:5000/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interception_active: nextVal })
      });
    } catch (_) {}
  };
}

document.getElementById('scan').onclick = async () => {
  const status = document.getElementById('status');
  status.innerHTML = '<span class="ext-spinner"></span> Scanning…';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const r = await fetch('http://127.0.0.1:5000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url })
    });
    const d = await r.json();
    if (typeof d.interception_active === 'boolean') {
      renderInterceptionUI(d.interception_active);
    }
    status.innerHTML = `<div class="status-box ${d.decision === 'block' ? 'status-danger' : (d.decision === 'review' ? 'status-warning' : 'status-safe')}"><strong>${d.label}</strong> — ${d.risk_score}% risk (${d.decision}).</div>`;
    if (d.decision === 'block' && interceptionActive) {
      await blockTab(tab.id, tab.url, d.risk_score);
    }
  } catch(e) {
    status.innerHTML = '<div class="status-box status-warning">Start the Flask backend first on port 5000.</div>';
  }
};

loadInterceptionSetting();
