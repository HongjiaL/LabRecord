/* ===== Lab Meeting Records App ===== */
'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── PPT Download Button Helper ────────────────────────────────────────────
function _pptDownloadBtn(raw, fileName, meetingId) {
  if (!raw) return '';
  const label = Icon.paperclip + ' 下载PPT';
  if (raw.startsWith('local:')) {
    const mimeType = _getMimeType(fileName);
    const dataUrl = `data:${mimeType};base64,${raw.slice(6)}`;
    return `<a href="${dataUrl}" download="${escapeHtml(fileName)}" class="ppt-download-btn" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:0.75rem;font-weight:600;border-radius:20px;background:rgba(255,255,255,0.2);color:#fff;text-decoration:none;white-space:nowrap">${label}</a>`;
  }
  if (raw.startsWith('repo:') || raw.startsWith('seafile:')) {
    return `<a href="#" class="ppt-download-btn repo-download" data-meeting="${meetingId}" data-file="${escapeHtml(fileName)}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:0.75rem;font-weight:600;border-radius:20px;background:rgba(255,255,255,0.2);color:#fff;text-decoration:none;white-space:nowrap">${label}</a>`;
  }
  return `<a href="${escapeHtml(raw)}" download="${escapeHtml(fileName)}" class="ppt-download-btn" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:0.75rem;font-weight:600;border-radius:20px;background:rgba(255,255,255,0.2);color:#fff;text-decoration:none;white-space:nowrap">${label}</a>`;
}

// ─── MIME Type ─────────────────────────────────────────────────────────────
function _getMimeType(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const map = {
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pptm': 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  };
  return map[ext] || 'application/octet-stream';
}

const MAX_LOCAL_FALLBACK_B64_CHARS = 2_800_000;

// ─── File API ──────────────────────────────────────────────────────────────
const FileAPI = {
  async upload(base64Content, fileName, meetingId) {
    // ── 优先使用南大云盘（管理员配置，全员共用）───────────────────────────
    try {
      const result = await window.SeafileStorage.upload(fileName, meetingId, base64Content);
      if (result.success) {
        return { sha: `seafile:${result.path}` };
      }
      // 云盘上传失败不抛错，降级到本地存储
      console.warn('[FileAPI.upload] Seafile upload failed, falling back to local:', result.error);
      return { sha: `local:${base64Content}` };
    } catch (err) {
      console.warn('[FileAPI.upload] Seafile call failed, falling back to local:', err);
      return { sha: `local:${base64Content}` };
    }
  },

  async download(fileName, meetingId) {
    // ── 优先尝试南大云盘 ────────────────────────────────────────────────
    try {
      const result = await window.SeafileStorage.download(fileName, meetingId);
      if (result.ok && result.content) {
        return { ok: true, content: result.content };
      }
      if (result.status !== 404) {
        console.warn('[FileAPI.download] Seafile failed:', result.error);
      }
    } catch (err) {
      console.warn('[FileAPI.download] Seafile call failed:', err);
    }

    // ── 降级：GitHub ───────────────────────────────────────────────────
    try {
      const res = await fetch(`/api/files/download?meetingId=${encodeURIComponent(meetingId)}&fileName=${encodeURIComponent(fileName)}`);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      if (res.status !== 404) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || `HTTP ${res.status}`, status: res.status };
      }
    } catch (_) { /* fall through */ }

    return { ok: false, error: '文件未找到', status: 404 };
  }
};

// ─── Storage ───────────────────────────────────────────────────────────────
const Storage = {
  KEY: 'labMeetingRecords',

  async load() {
    try {
      const res = await fetch('/api/meetings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('[Storage.load] API failed, falling back to localStorage', e);
      try {
        const raw = localStorage.getItem(this.KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  },

  async getMeeting(id) {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn('[Storage.getMeeting] API failed, falling back to localStorage', e);
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data.find(m => m.id === id) || null;
    }
  },

  async addMeeting(data) {
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Password': sessionStorage.getItem('appPassword') || ''
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('[Storage.addMeeting]', e);
      alert('保存失败，请检查网络连接。\n' + e.message);
      return null;
    }
  },

  async updateMeeting(id, data) {
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Password': sessionStorage.getItem('appPassword') || ''
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (e) {
      console.error('[Storage.updateMeeting]', e);
      alert('保存失败，请检查网络连接。\n' + e.message);
      return false;
    }
  },

  async deleteMeeting(id) {
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'DELETE',
        headers: { 'X-App-Password': sessionStorage.getItem('appPassword') || '' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (e) {
      console.error('[Storage.deleteMeeting]', e);
      alert('删除失败，请检查网络连接。\n' + e.message);
      return false;
    }
  },

  async exportJSON() {
    let data;
    try {
      data = await Storage.load();
    } catch {
      data = [];
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `组会记录_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importJSON(file) {
    return new Promise(async (resolve, reject) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('格式错误');
        let successCount = 0;
        for (const meeting of data) {
          const { date, topic, notes, participants } = meeting;
          const res = await fetch('/api/meetings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, topic, notes, participants })
          });
          if (res.ok) successCount++;
        }
        resolve(successCount);
      } catch (err) {
        reject(new Error('文件格式不正确，请选择正确的 JSON 文件。'));
      }
    });
  }
};

// ─── Icons ────────────────────────────────────────────────────────────────
const Icon = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  fileText: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
};

// ─── Confirm Dialog ────────────────────────────────────────────────────────
let _confirmResolve = null;
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');

// ─── Password Modal ────────────────────────────────────────────────────────
let _passwordResolve = null;
const passwordModal = document.getElementById('password-modal');
const passwordInput = document.getElementById('password-input');
const passwordError = document.getElementById('password-error');
const passwordSubmit = document.getElementById('password-submit');

function showPasswordModal() {
  return new Promise(resolve => {
    passwordError.style.display = 'none';
    passwordInput.value = '';
    passwordInput.focus();
    passwordModal.classList.add('active');
    _passwordResolve = resolve;
  });
}

function hidePasswordModal() {
  passwordModal.classList.remove('active');
  _passwordResolve = null;
}

passwordSubmit.addEventListener('click', () => {
  const pw = passwordInput.value;
  if (!pw) {
    passwordError.textContent = '请输入密码';
    passwordError.style.display = 'block';
    return;
  }
  sessionStorage.setItem('appPassword', pw);
  hidePasswordModal();
  if (_passwordResolve) _passwordResolve(pw);
  _passwordResolve = null;
});

passwordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') passwordSubmit.click();
});

passwordModal.addEventListener('click', e => {
  if (e.target === passwordModal) {
    if (_passwordResolve) _passwordResolve(null);
    _passwordResolve = null;
    hidePasswordModal();
  }
});

function showConfirm(title, message) {
  return new Promise(resolve => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmModal.classList.add('active');
    _confirmResolve = resolve;
  });
}

confirmCancel.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  if (_confirmResolve) _confirmResolve(false);
  _confirmResolve = null;
});

confirmOk.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  if (_confirmResolve) _confirmResolve(true);
  _confirmResolve = null;
});

confirmModal.addEventListener('click', e => {
  if (e.target === confirmModal) {
    confirmModal.classList.remove('active');
    if (_confirmResolve) _confirmResolve(false);
    _confirmResolve = null;
  }
});

// ─── App ───────────────────────────────────────────────────────────────────
class MeetingApp {
  constructor() {
    this._bindNav();
    this._bindImportExport();
    window.addEventListener('hashchange', () => this._route());
    this._route();
  }

  _bindNav() {
    document.getElementById('btn-new-meeting').addEventListener('click', () => {
      location.hash = '#new-meeting';
    });
  }

  _bindImportExport() {
    document.getElementById('btn-export').addEventListener('click', async () => {
      const data = await Storage.load();
      if (data.length === 0) { alert('暂无数据可导出。'); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `组会记录_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      try {
        const count = await Storage.importJSON(file);
        alert(`成功导入 ${count} 条组会记录！`);
        await this._renderList();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  _route() {
    const hash = location.hash || '#meeting-list';
    if (hash === '#meeting-list') {
      this._renderList();
    } else if (hash === '#new-meeting') {
      this._renderMeetingForm();
    } else if (hash.startsWith('#meeting/')) {
      this._renderMeetingDetail(hash.split('/')[1]);
    } else if (hash.startsWith('#edit-meeting/')) {
      this._renderMeetingForm(hash.split('/')[1]);
    } else if (hash.startsWith('#add-literature/')) {
      this._renderAddLiteratureForm(hash.split('/')[1]);
    } else {
      this._renderList();
    }
  }

  // ── Dashboard / Meeting List ──────────────────────────────────────────────
  async _renderList() {
    let records;
    try { records = await Storage.load(); }
    catch { records = []; }

    document.getElementById('app-root').innerHTML = `
      <div class="dashboard">
        <div>
          <div class="card">
            <div class="card-header">
              <h2>${Icon.book} 组会记录</h2>
              <span class="stat-chip stat-chip-blue">${records.length} 次</span>
            </div>
            <div class="card-body">
              ${records.length === 0 ? this._emptyState(Icon.book, '还没有组会记录', '<strong>点击右上角「新建组会」</strong>，开始记录第一次组会吧') :
                `<div class="meeting-list" id="meeting-list-container"></div>`}
            </div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-header">
              <h2>${Icon.library} 文献资料库</h2>
            </div>
            <div class="card-body">
              ${records.length === 0 ? this._emptyState(Icon.library, '文献资料库为空', '添加组会并录入文献后，所有文献将汇总显示在这里') : `
                <div class="literature-search">
                  ${Icon.search}
                  <input type="text" id="lit-search" placeholder="搜索文献名、作者或关键词..." autocomplete="off">
                </div>
                <div class="alert alert-info" style="margin-bottom:12px">
                  ${Icon.info}
                  <span>共收录 <strong>${this._totalLitCount(records)}</strong> 篇文献</span>
                </div>
                <div class="literature-list" id="lit-list-container"></div>
              `}
            </div>
          </div>
        </div>
      </div>`;

    if (records.length > 0) {
      this._renderMeetingCards(records);
      this._renderLiteratureLibrary(records);
    }
  }

  _renderMeetingCards(records) {
    const container = document.getElementById('meeting-list-container');
    if (!container) return;

    container.innerHTML = records.map(m => {
      const totalLit = (m.participants || []).reduce((s, p) => s + (p.literature || []).length, 0);
      const d = new Date(m.date);
      const hasNotes = m.notes && m.notes.trim();
      return `
        <div class="meeting-card fade-in" data-id="${m.id}">
          <div class="meeting-card-date">
            <span class="month">${d.toLocaleString('zh-CN', { month: 'short' })}</span>
            <span class="day">${d.getDate()}</span>
          </div>
          <div class="meeting-card-info">
            <h3>${escapeHtml(m.topic || formatDate(m.date))}</h3>
            <div class="meeting-card-meta">
              <span>${Icon.clock} ${formatTime(m.date)}</span>
              <span>${Icon.users} ${(m.participants || []).length} 人</span>
              <span>${Icon.fileText} ${totalLit} 篇文献</span>
              ${hasNotes ? '<span>' + Icon.note + ' 有备注</span>' : ''}
            </div>
          </div>
          <div class="meeting-card-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${m.id}" title="编辑">${Icon.edit}</button>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${m.id}" title="删除" style="color:var(--danger)">${Icon.trash}</button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.meeting-card').forEach(card => {
      card.addEventListener('click', e => {
        const action = e.target.closest('[data-action]');
        const id = card.dataset.id;
        if (action) {
          e.stopPropagation();
          if (action.dataset.action === 'edit') location.hash = `#edit-meeting/${id}`;
          else if (action.dataset.action === 'delete') this._deleteMeeting(id);
        } else {
          location.hash = `#meeting/${id}`;
        }
      });
    });
  }

  async _deleteMeeting(id) {
    const ok = await showConfirm('确认删除', '删除后数据无法恢复，确定要删除这条组会记录吗？');
    if (!ok) return;
    const pw = sessionStorage.getItem('appPassword');
    if (!pw) {
      const entered = await showPasswordModal();
      if (!entered) return;
    }
    await Storage.deleteMeeting(id);
    await this._renderList();
  }

  _renderLiteratureLibrary(records) {
    const allLit = this._collectLiterature(records);
    const container = document.getElementById('lit-list-container');
    if (!container) return;

    const renderItems = (items) => {
      if (items.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:32px 0">${Icon.search}<p>没有找到匹配的文献</p></div>`;
        return;
      }
      container.innerHTML = items.map(lit => `
        <div class="literature-item" data-meeting="${lit.meetingId}">
          <div class="literature-item-title">${escapeHtml(lit.title || '（无标题）')}</div>
          <div class="literature-item-meta">
            ${lit.authors ? `<span>${escapeHtml(lit.authors)}</span>` : ''}
            ${lit.journal ? `<span>${escapeHtml(lit.journal)}</span>` : ''}
            <span class="literature-item-badge">${Icon.calendar} ${formatDate(lit.meetingDate)}</span>
          </div>
          ${(lit.keywords || []).length > 0 ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">${lit.keywords.map(k => `<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
        </div>`).join('');

      container.querySelectorAll('.literature-item').forEach(item => {
        item.addEventListener('click', () => { location.hash = `#meeting/${item.dataset.meeting}`; });
      });
    };

    renderItems(allLit);

    let timer;
    document.getElementById('lit-search').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderItems(allLit); return; }
        const filtered = allLit.filter(l =>
          (l.title || '').toLowerCase().includes(q) ||
          (l.authors || '').toLowerCase().includes(q) ||
          (l.journal || '').toLowerCase().includes(q) ||
          (l.keywords || []).some(k => k.toLowerCase().includes(q))
        );
        renderItems(filtered);
      }, 300);
    });
  }

  _collectLiterature(records) {
    const items = [];
    for (const m of records) {
      for (const p of (m.participants || [])) {
        for (const l of (p.literature || [])) {
          items.push({ ...l, meetingId: m.id, meetingDate: m.date });
        }
      }
    }
    return items;
  }

  _totalLitCount(records) { return this._collectLiterature(records).length; }

  _emptyState(icon, title, message) {
    return `<div class="empty-state">${icon}<strong>${title}</strong><p>${message}</p></div>`;
  }

  // ── Meeting Detail ─────────────────────────────────────────────────────────
  async _renderMeetingDetail(id) {
    const meeting = await Storage.getMeeting(id);
    if (!meeting) {
      document.getElementById('app-root').innerHTML = `
        <div class="empty-state" style="padding:80px 0">
          ${Icon.info}<strong>记录未找到</strong>
          <p>该组会记录可能已被删除。</p>
          <a href="#meeting-list" class="btn btn-primary" style="margin-top:12px">返回首页</a>
        </div>`;
      return;
    }

    const participants = meeting.participants || [];
    const totalLit = participants.reduce((s, p) => s + (p.literature || []).length, 0);

    document.getElementById('app-root').innerHTML = `
      <a class="back-link" href="#meeting-list">${Icon.chevronLeft} 返回组会列表</a>
      <div class="detail-header fade-in">
        <h1 style="margin-bottom:8px">${escapeHtml(meeting.topic || '第 X 次组会')}</h1>
        <div class="detail-meta">
          <span class="detail-meta-item">${Icon.calendar} ${formatDate(meeting.date)}</span>
          <span class="detail-meta-item">${Icon.clock} ${formatTime(meeting.date)}</span>
          <span class="detail-meta-item">${Icon.users} ${participants.length} 位成员</span>
          <span class="detail-meta-item">${Icon.fileText} ${totalLit} 篇文献</span>
        </div>
        ${meeting.notes && meeting.notes.trim() ? `<div class="detail-notes">${escapeHtml(meeting.notes)}</div>` : ''}
        <div style="margin-top:16px;display:flex;gap:8px">
          <a href="#add-literature/${id}" class="btn btn-primary btn-sm">${Icon.plus} 上传我的文献</a>
          <a href="#edit-meeting/${id}" class="btn btn-secondary btn-sm">${Icon.edit} 编辑</a>
          <button class="btn btn-danger btn-sm" id="detail-delete-btn">${Icon.trash} 删除此记录</button>
        </div>
      </div>
      ${participants.length === 0 ? `
        <div class="empty-state">
          ${Icon.users}<strong>暂无参与者记录</strong>
          <p>点击下方「上传我的文献」添加你的文献</p>
          <a href="#add-literature/${id}" class="btn btn-primary" style="margin-top:12px">${Icon.plus} 上传我的文献</a>
        </div>` : participants.map(p => this._renderParticipantCard(p, id)).join('')}
    `;

    document.getElementById('detail-delete-btn').addEventListener('click', async () => {
      const ok = await showConfirm('确认删除', '删除后数据无法恢复，确定要删除这条组会记录吗？');
      if (!ok) return;
      const pw = sessionStorage.getItem('appPassword');
      await Storage.deleteMeeting(id);
      location.hash = '#meeting-list';
    });

    // Delegate: download PPT button in participant card header
    document.getElementById('app-root').addEventListener('click', async (e) => {
      const btn = e.target.closest('.ppt-download-btn');
      if (!btn) return;
      const name = btn.dataset.name;
      const meeting = await Storage.getMeeting(id);
      const participant = (meeting.participants || []).find(p => p.name === name);
      const lit = (participant?.literature || []).find(l => l.pptDataUrl);
      if (!lit) { alert('未找到关联的 PPT 文件'); return; }
      const raw = lit.pptDataUrl;
      if (raw.startsWith('repo:') || raw.startsWith('seafile:')) {
        btn.textContent = '下载中...';
        btn.disabled = true;
        try {
          const result = await FileAPI.download(lit.pptFileName, id);
          if (result.ok && result.content) {
            const mimeType = _getMimeType(lit.pptFileName);
            const binary = atob(result.content);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: mimeType });
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = lit.pptFileName;
            a.click();
            URL.revokeObjectURL(objectUrl);
          } else {
            alert('文件下载失败。\n\n' + (result.error || '未知错误'));
          }
        } catch (err) { alert('下载失败: ' + err.message); }
        btn.disabled = false;
        btn.textContent = Icon.paperclip + ' 下载PPT';
      } else if (raw.startsWith('local:')) {
        const mimeType = _getMimeType(lit.pptFileName);
        const dataUrl = `data:${mimeType};base64,${raw.slice(6)}`;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = lit.pptFileName || 'PPT文件';
        a.click();
      } else {
        const a = document.createElement('a');
        a.href = raw;
        a.download = lit.pptFileName || 'PPT文件';
        a.click();
      }
    });

    document.getElementById('app-root').addEventListener('click', async (e) => {
      const link = e.target.closest('.repo-download');
      if (!link) return;
      e.preventDefault();
      const meetingId = link.dataset.meeting;
      const fileName = link.dataset.file;
      link.textContent = '加载中...';
      link.disabled = true;
      try {
        const result = await FileAPI.download(fileName, meetingId);
        if (result.ok && result.content) {
          const mimeType = _getMimeType(fileName);
          const binary = atob(result.content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: mimeType });
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(objectUrl);
        } else {
          alert('文件下载失败。\n\n' + (result.error || '未知错误'));
        }
      } catch (err) {
        alert('下载失败: ' + err.message);
      }
      link.disabled = false;
      link.textContent = Icon.paperclip + ' 下载PPT';
    });
  }

  _renderParticipantCard(participant, meetingId) {
    const literature = participant.literature || [];

      // Check if this participant has any literature with a PPT attached
    const litWithPpt = literature.some(lit => lit.pptDataUrl);

    return `
      <div class="participant-detail-card fade-in">
        <div class="participant-detail-header">
          <h3>${Icon.users} ${escapeHtml(participant.name || '未命名成员')}</h3>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:0.875rem;color:var(--text-muted)">${literature.length} 篇文献</span>
            ${litWithPpt ? `<button class="ppt-download-btn" data-name="${escapeHtml(participant.name || '')}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:0.75rem;font-weight:600;border-radius:20px;background:rgba(255,255,255,0.2);color:#fff;border:none;cursor:pointer;white-space:nowrap">${Icon.paperclip} 下载PPT</button>` : ''}
          </div>
        </div>
        <div class="participant-detail-body">
          ${literature.length === 0 ? `<div style="color:var(--text-muted);font-size:0.875rem;text-align:center;padding:16px">暂无文献记录</div>` :
            literature.map(lit => `
            <div class="literature-detail-item">
              <div class="literature-detail-title">${escapeHtml(lit.title || '（无标题）')}</div>
              ${lit.authors ? `<div class="literature-detail-authors">${escapeHtml(lit.authors)}${lit.journal ? ' — ' + escapeHtml(lit.journal) : ''}</div>` : ''}
              ${(lit.keywords || []).length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${lit.keywords.map(k => `<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
              <div class="literature-detail-actions">
                ${lit.link ? `<a href="${escapeHtml(lit.link)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">${Icon.arrowRight} 访问链接</a>` : ''}
                ${lit.doi ? `<a href="https://doi.org/${escapeHtml(lit.doi)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">${Icon.fileText} DOI</a>` : ''}
              </div>
              ${lit.transcript && lit.transcript.trim() ? `<div class="transcript-block"><div class="transcript-block-title">${Icon.note} 文字稿</div><div class="transcript-content">${escapeHtml(lit.transcript)}</div></div>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── Add Literature Form (1 PPT + multiple papers per session) ───────────────
  async _renderAddLiteratureForm(meetingId) {
    const meeting = await Storage.getMeeting(meetingId);
    if (!meeting) {
      document.getElementById('app-root').innerHTML = `
        <div class="empty-state" style="padding:80px 0">
          ${Icon.info}<strong>组会未找到</strong>
          <p>该组会记录可能已被删除。</p>
          <a href="#meeting-list" class="btn btn-primary" style="margin-top:12px">返回首页</a>
        </div>`;
      return;
    }

    const existingParticipants = meeting.participants || [];
    const pid = 'lf-' + Date.now();

    document.getElementById('app-root').innerHTML = `
      <a class="back-link" href="#meeting/${meetingId}">${Icon.chevronLeft} 返回组会详情</a>
      <div class="page-header fade-in">
        <h1>${Icon.upload} 上传我的文献</h1>
        <p>为「${escapeHtml(meeting.topic || '本次组会')}」添加文献记录 — 同一份 PPT 可对应多篇文献</p>
      </div>
      <div class="card fade-in">
        <div class="card-body">
          <form id="lit-form">

            <div class="form-section">
              <div class="form-section-title">上传者信息</div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">姓名 <span class="required">*</span></label>
                  <input type="text" class="form-input" id="lf-author-${pid}" list="lf-authors-${pid}" autocomplete="off" placeholder="输入或选择已有成员姓名">
                  <datalist id="lf-authors-${pid}">
                    ${existingParticipants.map(p => `<option value="${escapeHtml(p.name)}">`).join('')}
                  </datalist>
                  <div id="lf-existing-ppt-${pid}" style="margin-top:6px;display:none"></div>
                </div>
              </div>
              <div class="form-group" style="margin-top:14px">
                <label class="form-label" style="font-size:0.8125rem">本次汇报 PPT / PDF <span class="required">*</span></label>
                <div class="file-upload-area" id="lf-ppt-area-${pid}">
                  <input type="file" id="lf-ppt-file-${pid}" accept=".ppt,.pptx,.pdf,.png,.jpg,.jpeg,.gif,.webp,.pptm">
                  <div class="file-upload-icon">${Icon.upload}</div>
                  <div class="file-upload-text">
                    <strong>点击选择</strong> 或拖拽文件到此处<br>
                    <small>该参与者所有文献共用这一份 PPT/PDF</small>
                  </div>
                </div>
                <div id="lf-ppt-done-${pid}" class="file-uploaded" style="display:none">
                  ${Icon.check}
                  <span class="file-uploaded-name" id="lf-ppt-name-${pid}"></span>
                  <button type="button" id="lf-ppt-dl-${pid}" title="下载此文件" style="padding:2px 6px;color:var(--accent);background:none;border:none;cursor:pointer">${Icon.paperclip}</button>
                  <button type="button" id="lf-ppt-rm-${pid}" style="padding:2px 6px;color:var(--danger);background:none;border:none;cursor:pointer">${Icon.x}</button>
                </div>
                <div class="upload-status" id="lf-ppt-status-${pid}" style="display:none"></div>
                <input type="hidden" id="lf-ppt-data-${pid}" value="">
                <input type="hidden" id="lf-ppt-name2-${pid}" value="">
                <input type="hidden" id="lf-meeting-id-${pid}" value="${meetingId}">
              </div>
            </div>

            <div class="form-section">
              <div class="form-section-title">文献列表</div>
              <div id="lf-lit-container-${pid}"></div>
              <button type="button" id="lf-add-lit-${pid}" class="btn btn-secondary btn-sm" style="width:100%;margin-top:8px">
                ${Icon.plus} 添加文献
              </button>
            </div>

            <div style="margin-top:24px;display:flex;gap:12px">
              <button type="submit" class="btn btn-primary btn-lg" id="lf-submit-${pid}">${Icon.check} 保存所有文献</button>
              <a href="#meeting/${meetingId}" class="btn btn-secondary">取消</a>
            </div>
          </form>
        </div>
      </div>`;

    this._bindLitFormPpt(pid);
    this._addLitRow(pid, 'lr0', null);
    document.getElementById(`lf-add-lit-${pid}`).addEventListener('click', () => {
      const n = Date.now();
      this._addLitRow(pid, 'lr' + n, null);
    });
    this._bindLitFormSubmit(pid, meetingId);

    // 当用户选择了已有成员时，显示其已有 PPT 的下载入口
    const authorInput = document.getElementById(`lf-author-${pid}`);
    const existingPptEl = document.getElementById(`lf-existing-ppt-${pid}`);
    authorInput.addEventListener('input', () => {
      const name = authorInput.value.trim();
      const matched = existingParticipants.find(p => p.name === name && p.pptDataUrl);
      if (matched) {
        const btn = _pptDownloadBtn(matched.pptDataUrl, matched.pptFileName || 'PPT文件', meetingId);
        existingPptEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">该成员已有 PPT：${btn.replace('background:rgba(255,255,255,0.2)', 'background:var(--accent)').replace('color:#fff', 'color:#fff')}</div>`;
        existingPptEl.style.display = '';
      } else {
        existingPptEl.style.display = 'none';
        existingPptEl.innerHTML = '';
      }
    });
  }

  _bindLitFormPpt(pid) {
    const area = document.getElementById(`lf-ppt-area-${pid}`);
    const fileInput = document.getElementById(`lf-ppt-file-${pid}`);
    const done = document.getElementById(`lf-ppt-done-${pid}`);
    const nameEl = document.getElementById(`lf-ppt-name-${pid}`);
    const dataEl = document.getElementById(`lf-ppt-data-${pid}`);
    const name2El = document.getElementById(`lf-ppt-name2-${pid}`);
    const rmBtn = document.getElementById(`lf-ppt-rm-${pid}`);
    const statusEl = document.getElementById(`lf-ppt-status-${pid}`);
    if (!area || !fileInput) return;

    const setStatus = (msg, type) => {
      statusEl.className = `upload-status ${type}`;
      statusEl.innerHTML = msg;
      statusEl.style.display = 'flex';
    };

    const handleFile = (file) => {
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) { alert('文件过大（超过 50MB）'); return; }
      setStatus(Icon.upload + ' 正在读取文件...', 'loading');
      const reader = new FileReader();
      reader.onload = ev => {
        const b64 = ev.target.result.split(',')[1];
        dataEl.value = `pending:${b64}`;
        name2El.value = file.name;
        nameEl.textContent = file.name;
        area.style.display = 'none';
        done.style.display = 'flex';
        setStatus(Icon.check + ' 已就绪，保存时将上传', 'success');
      };
      reader.onerror = () => { setStatus('文件读取失败', 'error'); alert('文件读取失败'); };
      reader.readAsDataURL(file);
    };

    area.addEventListener('click', () => fileInput.click());
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    rmBtn.addEventListener('click', () => {
      dataEl.value = ''; name2El.value = ''; fileInput.value = '';
      area.style.display = ''; done.style.display = 'none'; statusEl.style.display = 'none';
    });

    const dlBtn = document.getElementById(`lf-ppt-dl-${pid}`);
    dlBtn.addEventListener('click', async () => {
      const raw = dataEl.value;
      if (!raw) return;
      const fileName = name2El.value || 'PPT文件';
      if (raw.startsWith('pending:')) {
        const b64 = raw.slice(8);
        if (b64.length > MAX_LOCAL_FALLBACK_B64_CHARS) {
          alert('文件过大，无法直接下载。保存后可在组会详情页下载。');
          return;
        }
        const mimeType = _getMimeType(fileName);
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      } else if (raw.startsWith('repo:') || raw.startsWith('seafile:')) {
        const sha = raw.slice(5);
        dlBtn.textContent = '...'; dlBtn.disabled = true;
        try {
          const result = await FileAPI.download(fileName, document.getElementById(`lf-meeting-id-${pid}`)?.value || '');
          if (result.ok && result.content) {
            const mimeType = _getMimeType(fileName);
            const binary = atob(result.content);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.click();
            URL.revokeObjectURL(url);
          } else {
            alert('下载失败: ' + (result.error || '未知错误'));
          }
        } catch (err) { alert('下载失败: ' + err.message); }
        finally { dlBtn.textContent = Icon.paperclip; dlBtn.disabled = false; }
      } else if (raw.startsWith('local:')) {
        const b64 = raw.slice(6);
        const mimeType = _getMimeType(fileName);
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  _addLitRow(pid, rowId, existing) {
    const container = document.getElementById(`lf-lit-container-${pid}`);
    if (!container) return;
    const block = document.createElement('div');
    block.className = 'literature-block fade-in';
    block.dataset.rowId = rowId;

    block.innerHTML = `
      <div class="literature-block-header">
        <input type="text" class="form-input" name="lf-lit-title-${rowId}" placeholder="文献标题（必填）" value="${escapeHtml(existing ? existing.title : '')}">
        <button type="button" class="btn btn-ghost btn-sm remove-lit-btn" style="color:var(--danger);padding:6px">${Icon.x}</button>
      </div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">作者</label>
          <input type="text" class="form-input" name="lf-lit-authors-${rowId}" placeholder="作者姓名" value="${escapeHtml(existing ? existing.authors : '')}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">期刊 / 来源</label>
          <input type="text" class="form-input" name="lf-lit-journal-${rowId}" placeholder="期刊名称" value="${escapeHtml(existing ? existing.journal : '')}">
        </div>
      </div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">DOI</label>
          <input type="text" class="form-input" name="lf-lit-doi-${rowId}" placeholder="10.xxxx/xxxxx" value="${escapeHtml(existing ? existing.doi : '')}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">链接</label>
          <input type="url" class="form-input" name="lf-lit-link-${rowId}" placeholder="https://..." value="${escapeHtml(existing ? existing.link : '')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" style="font-size:0.75rem">关键词（输入后回车添加标签）</label>
        <div class="keyword-tags" id="lf-kw-${rowId}">
          ${((existing && existing.keywords) || []).map(k => `<span class="keyword-tag" data-kw="${escapeHtml(k)}">${escapeHtml(k)}<button type="button" data-lid="${rowId}" data-kw="${escapeHtml(k)}">${Icon.x}</button></span>`).join('')}
        </div>
        <input type="text" class="form-input" id="lf-kw-in-${rowId}" placeholder="输入关键词后按回车" style="margin-top:4px">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label" style="font-size:0.75rem">文字稿</label>
        <textarea class="form-textarea" name="lf-lit-transcript-${rowId}" rows="3" placeholder="该文献汇报的文字稿（可选）">${escapeHtml(existing ? existing.transcript : '')}</textarea>
      </div>`;

    container.appendChild(block);
    block.querySelector('.remove-lit-btn').addEventListener('click', () => block.remove());
    this._bindKeywordTags(rowId);
  }

  async _bindLitFormSubmit(pid, meetingId) {
    const form = document.getElementById('lit-form');
    const submitBtn = document.getElementById(`lf-submit-${pid}`);
    const pptDataEl = document.getElementById(`lf-ppt-data-${pid}`);
    const pptNameEl = document.getElementById(`lf-ppt-name2-${pid}`);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const authorName = document.getElementById(`lf-author-${pid}`).value.trim();
      const pptRaw = (pptDataEl?.value || '').trim();
      const pptFileName = (pptNameEl?.value || '').trim();

      if (!authorName) { alert('请输入姓名'); return; }
      if (!pptRaw) { alert('请上传 PPT / PDF'); return; }

      const litRows = [];
      document.querySelectorAll(`#lf-lit-container-${pid} .literature-block`).forEach(row => {
        const rowId = row.dataset.rowId;
        const title = (row.querySelector(`[name="lf-lit-title-${rowId}"]`)?.value || '').trim();
        if (!title) return;
        const kwTags = row.querySelectorAll(`#lf-kw-${rowId} .keyword-tag`);
        const keywords = [...kwTags].map(t => t.dataset.kw).filter(Boolean);
        litRows.push({
          id: 'lr' + String(Date.now() + Math.random() * 1e6 | 0),
          title,
          authors: (row.querySelector(`[name="lf-lit-authors-${rowId}"]`)?.value || '').trim(),
          journal: (row.querySelector(`[name="lf-lit-journal-${rowId}"]`)?.value || '').trim(),
          doi: (row.querySelector(`[name="lf-lit-doi-${rowId}"]`)?.value || '').trim(),
          link: (row.querySelector(`[name="lf-lit-link-${rowId}"]`)?.value || '').trim(),
          keywords,
          transcript: (row.querySelector(`[name="lf-lit-transcript-${rowId}"]`)?.value || '').trim(),
          pptDataUrl: '',
          pptFileName
        });
      });

      if (litRows.length === 0) { alert('请至少添加一篇文献'); return; }

      const pw = sessionStorage.getItem('appPassword');
      if (!pw) {
        const entered = await showPasswordModal();
        if (!entered) return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '保存中...';

      try {
        const meeting = await Storage.getMeeting(meetingId);
        const participants = meeting ? (meeting.participants || []) : [];

        let participant = participants.find(p => p.name === authorName);
        if (!participant) {
          participant = { id: String(Date.now()), name: authorName, pptDataUrl: '', pptFileName: '', literature: [] };
          participants.push(participant);
        }

        // Upload PPT if pending
        let finalPptDataUrl = pptRaw;
        if (pptRaw.startsWith('pending:')) {
          const b64 = pptRaw.slice(8);
          if (b64) {
            try {
              const result = await FileAPI.upload(b64, pptFileName, meetingId);
              finalPptDataUrl = `repo:${result.sha}`;
            } catch (err) {
              if (b64.length <= MAX_LOCAL_FALLBACK_B64_CHARS) {
                alert(`PPT 上传失败（${err.message || ''}），改为本地存储，关闭浏览器后可能丢失。`);
                finalPptDataUrl = `local:${b64}`;
              } else {
                alert(`PPT 上传失败（${err.message || ''}）且文件偏大，本次不保存该附件。`);
                finalPptDataUrl = '';
              }
            }
          } else {
            finalPptDataUrl = '';
          }
        }

        // Assign shared PPT to all new lit + existing lit of this participant
        for (const lit of litRows) {
          lit.pptDataUrl = finalPptDataUrl;
          lit.pptFileName = pptFileName;
        }
        for (const lit of (participant.literature || [])) {
          lit.pptDataUrl = finalPptDataUrl;
          lit.pptFileName = pptFileName;
        }
        participant.pptDataUrl = finalPptDataUrl;
        participant.pptFileName = pptFileName;

        participant.literature.push(...litRows);
        await Storage.updateMeeting(meetingId, { ...meeting, participants });

        submitBtn.textContent = '已保存！';
        setTimeout(() => { location.hash = `#meeting/${meetingId}`; }, 600);
      } catch (err) {
        alert('保存失败: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = Icon.check + ' 保存所有文献';
      }
    });
  }

  // ── Meeting Form (Add / Edit) ─────────────────────────────────────────────
  async _renderMeetingForm(editId = null) {
    const meeting = editId ? await Storage.getMeeting(editId) : null;

    document.getElementById('app-root').innerHTML = `
      <a class="back-link" href="${editId ? '#meeting/' + editId : '#meeting-list'}">
        ${Icon.chevronLeft} ${editId ? '返回组会详情' : '返回组会列表'}
      </a>
      <div class="page-header fade-in">
        <h1>${editId ? '编辑组会' : '新建组会'}</h1>
        <p>${editId ? '修改组会信息' : '记录组会基本信息'}</p>
      </div>
      <div class="card fade-in">
        <div class="card-body">
          <div class="alert alert-info">
            ${Icon.info}
            <span><strong>提示：</strong>新建组会后，其他成员使用「上传我的文献」添加各自的 PPT 和文献。</span>
          </div>
          <form id="meeting-form">
            <div class="form-section">
              <div class="form-section-title">组会基本信息</div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">组会日期与时间 <span class="required">*</span></label>
                  <input type="datetime-local" class="form-input" id="f-date" required value="${meeting ? meeting.date.slice(0, 16) : ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">组会主题 / 名称</label>
                  <input type="text" class="form-input" id="f-topic" placeholder="如：第12次组会 — 文献汇报" value="${escapeHtml(meeting ? meeting.topic : '')}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">组会备注</label>
                <textarea class="form-textarea" id="f-notes" rows="2" placeholder="可选，如讨论主题、重要结论等">${escapeHtml(meeting ? meeting.notes : '')}</textarea>
              </div>
            </div>
            <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
              <a href="${editId ? '#meeting/' + editId : '#meeting-list'}" class="btn btn-secondary">取消</a>
              <button type="submit" class="btn btn-primary btn-lg" id="form-submit-btn">
                ${Icon.check} ${editId ? '保存修改' : '保存组会'}
              </button>
            </div>
          </form>
        </div>
      </div>`;

    document.getElementById('meeting-form').addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = document.getElementById('form-submit-btn');

      const pw = sessionStorage.getItem('appPassword');
      if (!pw) {
        const entered = await showPasswordModal();
        if (!entered) return;
      }

      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '保存中...';

      const data = {
        date: document.getElementById('f-date').value,
        topic: document.getElementById('f-topic').value.trim(),
        notes: document.getElementById('f-notes').value.trim(),
        participants: meeting ? meeting.participants : []
      };

      let ok;
      if (editId) {
        ok = await Storage.updateMeeting(editId, data);
        if (ok) location.hash = `#meeting/${editId}`;
      } else {
        const newMeeting = { id: uuid(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const saved = await Storage.addMeeting(newMeeting);
        if (saved) { location.hash = `#meeting/${saved.id}`; ok = true; }
        else ok = false;
      }

      if (ok === false) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
    });
  }

  // ── Shared Keyword Tags ─────────────────────────────────────────────────────
  _bindKeywordTags(lid) {
    const kwInput = document.getElementById(`lf-kw-in-${lid}`) || document.getElementById(`kw-input-${lid}`);
    const kwTags = document.getElementById(`lf-kw-${lid}`) || document.getElementById(`kw-tags-${lid}`);
    if (!kwInput || !kwTags) return;

    kwInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const kw = kwInput.value.trim();
        if (!kw) return;
        if ([...kwTags.querySelectorAll('.keyword-tag')].some(t => t.dataset.kw === kw)) { kwInput.value = ''; return; }
        const tag = document.createElement('span');
        tag.className = 'keyword-tag';
        tag.dataset.kw = kw;
        tag.innerHTML = `${escapeHtml(kw)}<button type="button" data-lid="${lid}" data-kw="${escapeHtml(kw)}">${Icon.x}</button>`;
        kwTags.appendChild(tag);
        kwInput.value = '';
      }
    });

    kwTags.addEventListener('click', e => {
      const btn = e.target.closest('button[data-lid]');
      if (btn) { const tag = btn.closest('.keyword-tag'); if (tag) tag.remove(); }
    });
  }
}

// ─── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { new MeetingApp(); });
