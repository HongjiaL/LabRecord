/* ===== SettingsModal — 南大云盘存储设置 ===== */

const SEAFILE_ICONS = {
  settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  cloud: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
}

// ─── Seafile Storage Client (pure JS, no build step) ────────────────────────
const SEAFILE_API_BASE = 'https://box.nju.edu.cn/api2'
const SEAFILE_WEBDAV_BASE = 'https://box.nju.edu.cn/seafdav'

const SeafileStorage = {
  getConfig() {
    try { return JSON.parse(localStorage.getItem('seafileConfig') || 'null') }
    catch { return null }
  },

  saveConfig(cfg) {
    localStorage.setItem('seafileConfig', JSON.stringify(cfg))
  },

  clearConfig() {
    localStorage.removeItem('seafileConfig')
  },

  async testConnection(cfg) {
    try {
      const creds = btoa(`${cfg.username}:${cfg.password}`)
      const res = await fetch(`${SEAFILE_API_BASE}/repos/`, {
        headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' }
      })
      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `连接失败 (HTTP ${res.status}): ${text}` }
      }
      const data = await res.json()
      return { ok: true, repos: data.map(r => ({ id: r.id, name: r.name })) }
    } catch (err) {
      return { ok: false, error: err.message || '网络错误' }
    }
  },

  buildFilePath(fileName, meetingId) {
    return `/${meetingId}/${fileName}`
  },

  // Upload: two-step Seafile API
  async upload(cfg, fileName, meetingId, base64Content) {
    try {
      const creds = btoa(`${cfg.username}:${cfg.password}`)
      const dirPath = `/${meetingId}`

      // Step 1: get upload link
      const linkRes = await fetch(
        `${SEAFILE_API_BASE}/repos/${cfg.repoId}/upload-link/?p=${encodeURIComponent(dirPath)}`,
        { headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' } }
      )
      if (!linkRes.ok) {
        const text = await linkRes.text()
        return { success: false, error: `获取上传链接失败: HTTP ${linkRes.status} ${text}` }
      }
      const uploadUrl = await linkRes.json()

      // Step 2: upload via multipart form
      const binary = atob(base64Content)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes])

      const formData = new FormData()
      formData.append('file', blob, fileName)
      formData.append('parent_dir', dirPath)
      formData.append('replace', '1')
      formData.append('ret-json', '1')

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}` },
        body: formData
      })

      if (!uploadRes.ok) {
        const text = await uploadRes.text()
        return { success: false, error: `上传失败: HTTP ${uploadRes.status} ${text}` }
      }

      const result = await uploadRes.json()
      return result.success
        ? { success: true, path: this.buildFilePath(fileName, meetingId) }
        : { success: false, error: JSON.stringify(result) }
    } catch (err) {
      return { success: false, error: err.message || '网络错误' }
    }
  },

  // Download via WebDAV
  async download(cfg, fileName, meetingId) {
    try {
      const creds = btoa(`${cfg.username}:${cfg.password}`)
      const filePath = this.buildFilePath(fileName, meetingId)

      const res = await fetch(`${SEAFILE_WEBDAV_BASE}${filePath}`, {
        headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/octet-stream' }
      })

      if (!res.ok) {
        return {
          ok: false,
          error: `文件不存在或无权限访问: HTTP ${res.status}`,
          status: res.status
        }
      }

      const arrayBuffer = await res.arrayBuffer()
      const binary = String.fromCharCode(...new Uint8Array(arrayBuffer))
      return { ok: true, content: btoa(binary) }
    } catch (err) {
      return { ok: false, error: err.message || '网络错误' }
    }
  }
}

// ─── Settings Modal Manager ───────────────────────────────────────────────────
let _onSavedCallback = null
let _currentRepos = []
let _settingsStatus = { type: 'idle', msg: '' }

function renderSettingsModalContent() {
  const cfg = SeafileStorage.getConfig()
  const existing = !!cfg
  let reposHtml = ''

  if (_currentRepos.length > 0) {
    reposHtml = `
      <div class="form-group">
        <label class="form-label">选择存储资料库 <span class="required">*</span></label>
        <select class="form-input" id="sf-repo-select" style="font-size:0.875rem">
          <option value="">请选择...</option>
          ${_currentRepos.map(r => `<option value="${r.id}" ${cfg?.repoId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
        </select>
        <div class="form-hint">
          PPT 文件将存储在该资料库中。建议创建一个专用资料库（如「组会PPT」），
          每个组会的数据会存放在以组会ID命名的子文件夹中。
        </div>
      </div>`
  }

  let alertHtml = ''
  if (_settingsStatus.type === 'error') {
    alertHtml = `<div class="alert alert-warning" style="margin-bottom:16px">${SEAFILE_ICONS.info}<span>${escapeHtml(_settingsStatus.msg)}</span></div>`
  } else if (_settingsStatus.type === 'success') {
    alertHtml = `<div style="margin-bottom:16px;padding:12px 16px;background:#F0FFF4;color:#276749;border:1px solid #9AE6B4;border-radius:8px;font-size:0.875rem;display:flex;gap:8px;align-items:center">${SEAFILE_ICONS.check}<span>${escapeHtml(_settingsStatus.msg)}</span></div>`
  } else if (existing && _settingsStatus.type === 'idle') {
    alertHtml = `<div class="alert alert-info" style="margin-bottom:16px">${SEAFILE_ICONS.info}<span>当前已连接到南大云盘。</span></div>`
  }

  const modalBody = document.getElementById('sf-modal-body')
  if (!modalBody) return
  modalBody.innerHTML = `
    ${alertHtml}
    <div class="form-group">
      <label class="form-label">南大学工号 <span class="required">*</span></label>
      <input type="text" class="form-input" id="sf-username" placeholder="如：0123456@nju.edu.cn" value="${escapeHtml(cfg?.username || '')}" autocomplete="off" style="font-size:0.875rem">
      <div class="form-hint">格式：学工号@nju.edu.cn（如 0123456@nju.edu.cn）</div>
    </div>
    <div class="form-group">
      <label class="form-label">WebDAV 密码 <span class="required">*</span></label>
      <input type="password" class="form-input" id="sf-password" placeholder="南大云盘 WebDAV 独立密码" autocomplete="new-password" style="font-size:0.875rem">
      <div class="form-hint">
        WebDAV 独立密码不是统一身份认证密码。请在
        <a href="https://box.nju.edu.cn" target="_blank" rel="noopener noreferrer" style="color:var(--primary-light)">box.nju.edu.cn</a>
        的「账户设置 → 通用设置 → WebDAV 密码」中生成。
      </div>
    </div>
    ${reposHtml}
    <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      ${existing ? `<button class="btn btn-danger btn-sm" id="sf-disconnect">${SEAFILE_ICONS.trash} 断开连接</button>` : ''}
      <button class="btn btn-secondary btn-sm" id="sf-test">${_settingsStatus.type === 'loading' ? '连接中...' : '测试连接'}</button>
      ${_currentRepos.length > 0 ? `<button class="btn btn-primary btn-sm" id="sf-save">${SEAFILE_ICONS.check} 保存配置</button>` : ''}
    </div>`

  // Bind events
  document.getElementById('sf-test').addEventListener('click', handleTest)
  if (document.getElementById('sf-save')) {
    document.getElementById('sf-save').addEventListener('click', handleSave)
  }
  if (document.getElementById('sf-disconnect')) {
    document.getElementById('sf-disconnect').addEventListener('click', handleDisconnect)
  }
}

async function handleTest() {
  const username = document.getElementById('sf-username')?.value.trim()
  const password = document.getElementById('sf-password')?.value
  if (!username || !password) {
    _settingsStatus = { type: 'error', msg: '请输入用户名和密码' }
    renderSettingsModalContent()
    return
  }
  _settingsStatus = { type: 'loading', msg: '正在连接南大云盘...' }
  renderSettingsModalContent()
  const result = await SeafileStorage.testConnection({ username, password, repoId: '', folder: '' })
  if (result.ok && result.repos) {
    _currentRepos = result.repos
    _settingsStatus = { type: 'success', msg: `连接成功！找到 ${result.repos.length} 个资料库，请选择存储位置后保存。` }
  } else {
    _currentRepos = []
    _settingsStatus = { type: 'error', msg: result.error || '连接失败，请检查用户名和密码' }
  }
  renderSettingsModalContent()
}

function handleSave() {
  const username = document.getElementById('sf-username')?.value.trim()
  const password = document.getElementById('sf-password')?.value
  const repoId = document.getElementById('sf-repo-select')?.value
  if (!username || !password || !repoId) {
    _settingsStatus = { type: 'error', msg: '请完整填写信息并选择一个资料库' }
    renderSettingsModalContent()
    return
  }
  SeafileStorage.saveConfig({ username, password, repoId, folder: '' })
  _settingsStatus = { type: 'success', msg: '配置已保存！' }
  renderSettingsModalContent()
  // Show connected indicator
  updateStorageIndicator(true)
  if (_onSavedCallback) _onSavedCallback()
}

function handleDisconnect() {
  SeafileStorage.clearConfig()
  _currentRepos = []
  _settingsStatus = { type: 'idle', msg: '' }
  updateStorageIndicator(false)
  renderSettingsModalContent()
  if (_onSavedCallback) _onSavedCallback()
}

function openSettingsModal(onSaved) {
  _onSavedCallback = onSaved || null
  _settingsStatus = { type: 'idle', msg: '' }
  const cfg = SeafileStorage.getConfig()
  if (cfg) {
    document.getElementById('sf-username').value = cfg.username
  }
  renderSettingsModalContent()
  document.getElementById('settings-modal').classList.add('active')
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active')
}

function updateStorageIndicator(connected) {
  const indicator = document.getElementById('storage-indicator')
  if (!indicator) return
  if (connected) {
    indicator.innerHTML = `<span style="color:#38A169;font-size:0.7rem;display:flex;align-items:center;gap:3px">${SEAFILE_ICONS.check}<span>云盘已连接</span></span>`
  } else {
    indicator.innerHTML = `<span style="color:var(--text-muted);font-size:0.7rem;display:flex;align-items:center;gap:3px">${SEAFILE_ICONS.cloud}<span>本地存储</span></span>`
  }
}

// Initialize: inject HTML into index.html
function init() {
  // Already initialized
  if (document.getElementById('settings-modal')) return

  // Inject settings button into navbar
  const navActions = document.querySelector('.navbar-actions')
  if (navActions) {
    const btn = document.createElement('button')
    btn.className = 'btn btn-ghost btn-sm'
    btn.id = 'btn-settings'
    btn.title = '存储设置'
    btn.innerHTML = `${SEAFILE_ICONS.settings} 存储设置`
    btn.style.display = 'flex'
    btn.style.alignItems = 'center'
    btn.style.gap = '4px'
    navActions.insertBefore(btn, navActions.firstChild)

    // Storage indicator
    const indicator = document.createElement('span')
    indicator.id = 'storage-indicator'
    indicator.style.display = 'inline-flex'
    indicator.style.alignItems = 'center'
    navActions.insertBefore(indicator, navActions.firstChild)

    btn.addEventListener('click', () => openSettingsModal())

    const cfg = SeafileStorage.getConfig()
    updateStorageIndicator(!!cfg)
  }

  // Inject modal HTML before app-root
  const container = document.getElementById('app-root')
  if (container) {
    container.insertAdjacentHTML('beforebegin', `
      <div class="modal-overlay" id="settings-modal">
        <div class="modal" style="max-width:520px">
          <div class="modal-header">
            <h2>${SEAFILE_ICONS.cloud} 南大云盘存储设置</h2>
            <button class="btn btn-ghost btn-sm" id="sf-close">${SEAFILE_ICONS.x}</button>
          </div>
          <div class="modal-body" id="sf-modal-body">
          </div>
        </div>
      </div>`)

    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal') closeSettingsModal()
    })
    document.getElementById('sf-close').addEventListener('click', closeSettingsModal)
  }
}

document.addEventListener('DOMContentLoaded', init)

// ─── Export for use in app.js ─────────────────────────────────────────────────
window.SeafileStorage = SeafileStorage
