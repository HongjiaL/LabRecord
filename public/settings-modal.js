/* ===== SettingsModal — 显示 Supabase Storage 状态 ===== */

const STORAGE_ICONS = {
  settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  cloud: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
  alert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

// ─── Supabase Storage — 调用服务端 API（无用户侧 token） ─────────────────────
const StorageClient = {
  async getSharedStatus() {
    try {
      const res = await fetch('/api/storage/status');
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error };
      return data;
    } catch (err) {
      return { ok: false, error: err.message || '网络错误' };
    }
  },

  async upload(fileName, meetingId, base64Content) {
    try {
      const res = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, meetingId, base64: base64Content })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { success: false, error: data.error || `上传失败 (HTTP ${res.status})` };
      }
      return { success: true, path: `supabase:${data.path}` };
    } catch (err) {
      return { success: false, error: err.message || '网络错误' };
    }
  },

  async download(fileName, meetingId) {
    try {
      const res = await fetch(
        `/api/storage/download?fileName=${encodeURIComponent(fileName)}&meetingId=${encodeURIComponent(meetingId)}`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || `下载失败 (HTTP ${res.status})`, status: res.status };
      return { ok: true, content: data.content };
    } catch (err) {
      return { ok: false, error: err.message || '网络错误' };
    }
  }
};

// ─── Settings Modal ─────────────────────────────────────────────────────────
let _modalStatus = { type: 'loading', msg: '' };

async function renderSettingsModalContent() {
  const modalBody = document.getElementById('sf-modal-body');
  if (!modalBody) return;

  let alertHtml = '';
  if (_modalStatus.type === 'loading') {
    alertHtml = `<div class="alert alert-info" style="margin-bottom:16px">${STORAGE_ICONS.cloud}<span>正在检查云盘连接状态...</span></div>`;
  } else if (_modalStatus.type === 'configured') {
    alertHtml = `<div style="margin-bottom:16px;padding:12px 16px;background:#F0FFF4;color:#276749;border:1px solid #9AE6B4;border-radius:8px;font-size:0.875rem;display:flex;gap:8px;align-items:center">${STORAGE_ICONS.check}<span>${escapeHtml(_modalStatus.msg)}</span></div>`;
  } else if (_modalStatus.type === 'unconfigured') {
    alertHtml = `<div class="alert alert-warning" style="margin-bottom:16px">${STORAGE_ICONS.alert}<span>${escapeHtml(_modalStatus.msg)}</span></div>`;
  } else if (_modalStatus.type === 'error') {
    alertHtml = `<div class="alert alert-warning" style="margin-bottom:16px">${STORAGE_ICONS.info}<span>${escapeHtml(_modalStatus.msg)}</span></div>`;
  }

  modalBody.innerHTML = `
    ${alertHtml}
    <div class="alert alert-info">
      ${STORAGE_ICONS.info}
      <span>PPT/PDF 文件存储在 Supabase 云存储中，组会元数据存储在 Supabase 数据库中，无需个人配置。</span>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-secondary btn-sm" id="sf-refresh">${STORAGE_ICONS.cloud} 刷新状态</button>
    </div>`;

  document.getElementById('sf-refresh').addEventListener('click', loadAndShowStatus);
}

async function loadAndShowStatus() {
  _modalStatus = { type: 'loading', msg: '' };
  renderSettingsModalContent();
  const result = await StorageClient.getSharedStatus();

  if (result.configured === false) {
    _modalStatus = { type: 'unconfigured', msg: 'Supabase 尚未配置。请联系管理员在 Vercel 环境变量中添加 SUPABASE_URL 和 SUPABASE_ANON_KEY。' };
    updateStorageIndicator(false, '未配置');
  } else if (result.ok) {
    const repoInfo = result.message || '已连接到 Supabase 云存储';
    _modalStatus = { type: 'configured', msg: repoInfo };
    updateStorageIndicator(true, '云存储');
  } else {
    _modalStatus = { type: 'error', msg: result.error || '连接失败' };
    updateStorageIndicator(false, '错误');
  }

  renderSettingsModalContent();
}

function openSettingsModal() {
  loadAndShowStatus();
  document.getElementById('settings-modal').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}

function updateStorageIndicator(connected, label) {
  const el = document.getElementById('storage-indicator');
  if (!el) return;
  el.innerHTML = connected
    ? `<span style="color:#38A169;font-size:0.7rem;display:flex;align-items:center;gap:3px">${STORAGE_ICONS.check}<span>${label || '云盘已连接'}</span></span>`
    : `<span style="color:var(--text-muted);font-size:0.7rem;display:flex;align-items:center;gap:3px">${STORAGE_ICONS.cloud}<span>${label || '本地存储'}</span></span>`;
}

function init() {
  if (document.getElementById('settings-modal')) return;
  const navActions = document.querySelector('.navbar-actions');
  if (!navActions) return;

  const indicator = document.createElement('span');
  indicator.id = 'storage-indicator';
  indicator.style.display = 'inline-flex';
  indicator.style.alignItems = 'center';
  navActions.insertBefore(indicator, navActions.firstChild);

  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm';
  btn.id = 'btn-settings';
  btn.title = '存储设置';
  btn.innerHTML = `${STORAGE_ICONS.settings} 存储设置`;
  btn.style.cssText = 'display:flex;align-items:center;gap:4px';
  navActions.insertBefore(btn, navActions.firstChild);
  btn.addEventListener('click', openSettingsModal);

  updateStorageIndicator(false, '检查中...');

  const container = document.getElementById('app-root');
  if (container) {
    container.insertAdjacentHTML('beforebegin', `
      <div class="modal-overlay" id="settings-modal">
        <div class="modal" style="max-width:520px">
          <div class="modal-header">
            <h2>${STORAGE_ICONS.cloud} 云存储设置</h2>
            <button class="btn btn-ghost btn-sm" id="sf-close">${STORAGE_ICONS.x}</button>
          </div>
          <div class="modal-body" id="sf-modal-body"></div>
        </div>
      </div>`);
    document.getElementById('settings-modal').addEventListener('click', e => { if (e.target.id === 'settings-modal') closeSettingsModal(); });
    document.getElementById('sf-close').addEventListener('click', closeSettingsModal);

    // 初始化时自动检查状态
    StorageClient.getSharedStatus().then(result => {
      if (result.configured === false) {
        updateStorageIndicator(false, '未配置');
      } else if (result.ok) {
        updateStorageIndicator(true, '云存储');
      } else {
        updateStorageIndicator(false, '错误');
      }
    }).catch(() => {
      updateStorageIndicator(false, '离线');
    });
  }
}

document.addEventListener('DOMContentLoaded', init);

window.StorageClient = StorageClient;
