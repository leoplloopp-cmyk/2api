export function generateDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>2api Gateway</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5}
a{color:#58a6ff;text-decoration:none}
.container{max-width:1200px;margin:0 auto;padding:16px}
header{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid #21262d;margin-bottom:20px;flex-wrap:wrap;gap:12px}
header h1{font-size:20px;font-weight:600;color:#f0f6fc;display:flex;align-items:center;gap:8px}
.header-stats{display:flex;gap:16px;align-items:center;font-size:13px;color:#8b949e}
.header-stats span{display:flex;align-items:center;gap:4px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.dot.green{background:#3fb950}.dot.red{background:#f85149}.dot.yellow{background:#d29922}
.section{margin-bottom:24px}
.section-title{font-size:15px;font-weight:600;color:#f0f6fc;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px}
.card-header{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.card-name{font-weight:600;color:#f0f6fc;font-size:14px}
.card-stats{display:flex;gap:12px;font-size:12px;color:#8b949e;margin:6px 0}
.card-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.btn{padding:4px 10px;border-radius:6px;border:1px solid #30363d;background:#21262d;color:#c9d1d9;font-size:12px;cursor:pointer;transition:background .15s}
.btn:hover{background:#30363d}
.btn.primary{background:#238636;border-color:#238636;color:#fff}.btn.primary:hover{background:#2ea043}
.btn.danger{border-color:#f85149;color:#f85149}.btn.danger:hover{background:#f8514922}
.add-form{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px;margin-bottom:16px}
.form-row{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
.form-group{display:flex;flex-direction:column;gap:3px;flex:1;min-width:140px}
.form-group label{font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px}
.form-group input{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:6px 10px;color:#c9d1d9;font-size:13px;outline:none}
.form-group input:focus{border-color:#58a6ff}
.log-panel{background:#161b22;border:1px solid #21262d;border-radius:8px;max-height:300px;overflow-y:auto;font-family:'SF Mono',SFMono-Regular,Consolas,monospace;font-size:12px}
.log-entry{padding:4px 12px;border-bottom:1px solid #21262d1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log-entry:nth-child(odd){background:#161b22}.log-entry:nth-child(even){background:#0d1117}
.log-ok{color:#3fb950}.log-err{color:#f85149}.log-time{color:#484f58}.log-acct{color:#d2a8ff}.log-model{color:#79c0ff}
.config-section{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px}
.config-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #21262d;font-size:13px}
.config-row:last-child{border-bottom:none}
.config-label{color:#8b949e}.config-value{color:#c9d1d9;font-family:monospace}
.collapsible-header{cursor:pointer;user-select:none}
.collapsible-header::before{content:'\\25B6';margin-right:8px;font-size:10px;transition:transform .2s;display:inline-block}
.collapsible-header.open::before{transform:rotate(90deg)}
.collapsible-body{display:none}.collapsible-body.open{display:block}
.mask-toggle{cursor:pointer;color:#58a6ff;font-size:11px;margin-left:6px}
.empty-state{text-align:center;padding:40px;color:#484f58}
@media(max-width:640px){.card-grid{grid-template-columns:1fr}.form-row{flex-direction:column}}
</style>
</head>
<body>
<div class="container">
<header>
  <h1><span class="dot" id="globalDot"></span> 2api Gateway</h1>
  <div class="header-stats">
    <span>Requests: <strong id="totalReqs">0</strong></span>
    <span>Active: <strong id="activeCount">0</strong></span>
    <span>Uptime: <strong id="uptime">0s</strong></span>
  </div>
</header>

<div class="section">
  <div class="section-title">Accounts</div>
  <div class="add-form">
    <form id="addForm" class="form-row">
      <div class="form-group"><label>Name</label><input id="fName" placeholder="my-account" required></div>
      <div class="form-group"><label>Token</label><input id="fToken" placeholder="capy_xxxx" required></div>
      <div class="form-group"><label>Project ID</label><input id="fProject" placeholder="249a5fef-..."></div>
      <div class="form-group" style="flex:0"><label>&nbsp;</label><button type="submit" class="btn primary">Add Account</button></div>
    </form>
  </div>
  <div class="card-grid" id="accountGrid"></div>
</div>

<div class="section">
  <div class="section-title">Request Log</div>
  <div class="log-panel" id="logPanel"><div class="empty-state">No requests yet</div></div>
</div>

<div class="section">
  <div class="section-title collapsible-header" id="configToggle">Configuration</div>
  <div class="collapsible-body" id="configBody">
    <div class="config-section" id="configPanel"></div>
  </div>
</div>
</div>

<script>
const $ = s => document.querySelector(s);
let apiKeyRevealed = false;

function relTime(iso) {
  if (!iso) return 'never';
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return Math.floor(d/1000) + 's ago';
  if (d < 3600000) return Math.floor(d/60000) + ' min ago';
  if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
  return Math.floor(d/86400000) + 'd ago';
}

function fmtUptime(s) {
  if (s < 60) return Math.floor(s) + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + Math.floor(s%60) + 's';
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  return h + 'h ' + m + 'm';
}

function statusIcon(st) {
  const m = {active:'\\u{1F7E2}',cooling:'\\u{1F534}',no_credits:'\\u{1F534}',auth_failed:'\\u{1F534}',disabled:'\\u26AB',initializing:'\\u{1F535}'};
  return m[st] || '\\u26AA';
}

function renderAccounts(accounts) {
  const grid = $('#accountGrid');
  if (!accounts || accounts.length === 0) {
    grid.innerHTML = '<div class="empty-state">No accounts configured. Add one above.</div>';
    return;
  }
  grid.innerHTML = accounts.map(a => {
    return \`<div class="card">
      <div class="card-header">\${statusIcon(a.status)} <span class="card-name">\${esc(a.name)}</span></div>
      <div class="card-stats">
        <span>Requests: \${a.requestCount}</span>
        <span>Errors: \${a.errorCount}</span>
        <span>Last: \${relTime(a.lastUsed)}</span>
      </div>
      <div class="card-actions">
        <button class="btn" onclick="\${a.enabled ? "disable" : "enable"}('\${esc(a.name)}')">\${a.enabled ? 'Disable' : 'Enable'}</button>
        <button class="btn danger" onclick="remove('\${esc(a.name)}')">Remove</button>
      </div>
    </div>\`;
  }).join('');
}

function renderLogs(logs) {
  const panel = $('#logPanel');
  if (!logs || logs.length === 0) { panel.innerHTML = '<div class="empty-state">No requests yet</div>'; return; }
  panel.innerHTML = logs.map(l => {
    const t = new Date(l.timestamp).toLocaleTimeString();
    const ok = l.success;
    return \`<div class="log-entry"><span class="log-time">\${t}</span> \${l.method} \${l.path} <span class="log-model">\${l.model||''}</span> \\u2192 <span class="log-acct">\${l.accountName||'?'}</span> route=\${l.route||'?'} \${l.duration?l.duration+'ms':''} <span class="\${ok?'log-ok':'log-err'}">\${ok?'\\u2713':'ERROR'}</span>\${l.error?' '+l.error:''}</div>\`;
  }).join('');
  panel.scrollTop = panel.scrollHeight;
}

function renderConfig(data) {
  const p = $('#configPanel');
  const key = data.proxyApiKey || '';
  const masked = key.slice(0,8) + '****';
  p.innerHTML = \`
    <div class="config-row"><span class="config-label">Stream Mode</span><span class="config-value">\${data.streamMode||'auto'}</span></div>
    <div class="config-row"><span class="config-label">Default Model</span><span class="config-value">\${data.defaultModel||'auto'}</span></div>
    <div class="config-row"><span class="config-label">Proxy API Key</span><span class="config-value" id="apiKeyVal">\${apiKeyRevealed?esc(key):masked}</span><span class="mask-toggle" onclick="toggleKey()">\${apiKeyRevealed?'hide':'reveal'}</span></div>
    <div class="config-row"><span class="config-label">Poll Timeout</span><span class="config-value">\${data.pollTimeout||120000}ms</span></div>
  \`;
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let _fullKey = '';
function toggleKey() { apiKeyRevealed = !apiKeyRevealed; if (_fullKey) { const el=$('#apiKeyVal'); el.textContent=apiKeyRevealed?_fullKey:_fullKey.slice(0,8)+'****'; } }

async function poll() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    _fullKey = d.proxyApiKey || '';
    renderAccounts(d.accounts);
    renderConfig(d);
    const active = (d.accounts||[]).filter(a=>a.status==='active').length;
    const total = (d.accounts||[]).length;
    $('#activeCount').textContent = active + '/' + total;
    $('#totalReqs').textContent = d.stats?.totalRequests || 0;
    $('#uptime').textContent = fmtUptime(d.uptime || 0);
    const dot = $('#globalDot');
    dot.className = 'dot ' + (active > 0 ? 'green' : 'red');
  } catch(e) {}
  try {
    const r2 = await fetch('/api/logs');
    const logs = await r2.json();
    renderLogs(logs);
  } catch(e) {}
}

$('#addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = { name: $('#fName').value, token: $('#fToken').value, projectId: $('#fProject').value };
  try {
    const r = await fetch('/api/accounts/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) alert(d.error || 'Failed');
    else { $('#fName').value=''; $('#fToken').value=''; $('#fProject').value=''; poll(); }
  } catch(e) { alert('Network error'); }
});

$('#configToggle').addEventListener('click', () => {
  $('#configToggle').classList.toggle('open');
  $('#configBody').classList.toggle('open');
});

async function disable(n) { await fetch('/api/accounts/'+encodeURIComponent(n)+'/disable',{method:'POST'}); poll(); }
async function enable(n) { await fetch('/api/accounts/'+encodeURIComponent(n)+'/enable',{method:'POST'}); poll(); }
async function remove(n) { if(!confirm('Remove '+n+'?')) return; await fetch('/api/accounts/'+encodeURIComponent(n)+'/remove',{method:'POST'}); poll(); }

poll();
setInterval(poll, 3000);
</script>
</body>
</html>`;
}
