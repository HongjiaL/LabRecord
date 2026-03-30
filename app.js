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

// ─── GitHub Repository Storage ──────────────────────────────────────────────
class GitHubRepoStorage {
  constructor() {
    this.TOKEN_KEY = 'github_repo_token';
    this.OWNER = 'HongjiaL';
    this.REPO = 'LabRecord';
    this.BRANCH = 'main';
    this.UPLOAD_DIR = 'uploads';
    this.API_BASE = `https://api.github.com/repos/${this.OWNER}/${this.REPO}/contents`;
  }

  getToken() { return localStorage.getItem(this.TOKEN_KEY) || null; }

  hasToken() { return !!this.getToken(); }

  setToken(token) { localStorage.setItem(this.TOKEN_KEY, token); }

  removeToken() { localStorage.removeItem(this.TOKEN_KEY); }

  async validateToken(token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.OWNER}/${this.REPO}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: `${res.status} — ${err.message || '无权访问该仓库'}` };
      }
      const repo = await res.json();
      return { ok: true, name: repo.name, description: repo.description || '' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async uploadFile(base64Content, fileName, meetingId) {
    const token = this.getToken();
    if (!token) throw new Error('未设置 GitHub Token');

    const path = `${this.UPLOAD_DIR}/${meetingId}/${fileName}`;
    const url = `${this.API_BASE}/${path}`;

    // Check if file already exists to get SHA
    let sha = null;
    try {
      const getRes = await fetch(`${url}?ref=${this.BRANCH}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json'
        }
      });
      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha;
      }
    } catch (_) { /* ignore — file doesn't exist yet */ }

    const body = {
      message: `Upload: ${fileName} (meeting: ${meetingId})`,
      content: base64Content,
      branch: this.BRANCH
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`上传失败: ${res.status} — ${err.message || ''}`);
    }

    const data = await res.json();
    return {
      sha: data.content.sha,
      path: data.content.path,
      downloadUrl: data.content.download_url
    };
  }

  async downloadFile(fileName, meetingId) {
    const token = this.getToken();
    if (!token) return null;

    const path = `${this.UPLOAD_DIR}/${meetingId}/${fileName}`;
    const url = `${this.API_BASE}/${path}?ref=${this.BRANCH}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content; // base64 string
  }
}

const repoStorage = new GitHubRepoStorage();

// ─── Storage ───────────────────────────────────────────────────────────────
const Storage = {
  KEY: 'labMeetingRecords',

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  save(records) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(records));
      return true;
    } catch (e) {
      alert('存储空间不足，建议导出数据备份后清理部分记录。\n\n' + e.message);
      return false;
    }
  },

  getMeeting(id) {
    return this.load().find(m => m.id === id);
  },

  addMeeting(data) {
    const records = this.load();
    const meeting = {
      id: uuid(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    records.unshift(meeting);
    return this.save(records) ? meeting : null;
  },

  updateMeeting(id, data) {
    const records = this.load();
    const idx = records.findIndex(m => m.id === id);
    if (idx === -1) return false;
    records[idx] = { ...records[idx], ...data, updatedAt: new Date().toISOString() };
    return this.save(records);
  },

  deleteMeeting(id) {
    const records = this.load().filter(m => m.id !== id);
    return this.save(records);
  },

  exportJSON() {
    const data = this.load();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `组会记录_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data)) throw new Error('格式错误');
          if (this.save(data)) resolve(data.length);
          else reject(new Error('保存失败'));
        } catch (err) {
          reject(new Error('文件格式不正确，请选择正确的 JSON 文件。'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }
};

// ─── Icons (inline SVG helpers) ────────────────────────────────────────────
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

    // GitHub Settings Modal
    const modal = document.getElementById('github-settings-modal');
    const tokenInput = document.getElementById('github-token-input');
    const statusDiv = document.getElementById('github-status');
    const saveBtn = document.getElementById('github-save-btn');
    const testBtn = document.getElementById('github-test-btn');
    const removeBtn = document.getElementById('github-remove-btn');

    const showStatus = (msg, type) => {
      statusDiv.style.display = 'flex';
      statusDiv.className = `alert alert-${type}`;
      statusDiv.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>${msg}</span>`;
    };
    const hideStatus = () => { statusDiv.style.display = 'none'; };

    const openModal = () => {
      hideStatus();
      if (repoStorage.hasToken()) {
        tokenInput.value = '\u2022'.repeat(18);
        removeBtn.style.display = '';
        saveBtn.textContent = '更新 Token';
        testBtn.style.display = 'none';
      } else {
        tokenInput.value = '';
        removeBtn.style.display = 'none';
        saveBtn.textContent = '保存 Token';
        testBtn.style.display = '';
      }
      modal.classList.add('active');
    };

    const closeModal = () => modal.classList.remove('active');

    document.getElementById('btn-github-settings').addEventListener('click', openModal);
    document.getElementById('github-settings-close').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    saveBtn.addEventListener('click', () => {
      const token = tokenInput.value.trim();
      if (!token || token === '\u2022'.repeat(18)) {
        showStatus('请输入有效的 Token', 'warning');
        return;
      }
      repoStorage.setToken(token);
      showStatus('Token 已保存', 'success');
      removeBtn.style.display = '';
      saveBtn.textContent = '更新 Token';
      testBtn.style.display = 'none';
    });

    testBtn.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) { showStatus('请输入 Token', 'warning'); return; }
      testBtn.disabled = true;
      testBtn.textContent = '测试中...';
      const result = await repoStorage.validateToken(token);
      if (result.ok) {
        showStatus(`连接成功！仓库: <strong>${escapeHtml(result.name)}</strong>`, 'success');
        repoStorage.setToken(token);
        removeBtn.style.display = '';
        saveBtn.textContent = '更新 Token';
        testBtn.style.display = 'none';
      } else {
        showStatus(`连接失败: ${result.error}`, 'warning');
      }
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    });

    removeBtn.addEventListener('click', () => {
      repoStorage.removeToken();
      tokenInput.value = '';
      removeBtn.style.display = 'none';
      saveBtn.textContent = '保存 Token';
      testBtn.style.display = '';
      showStatus('Token 已移除', 'warning');
    });
  }

  _bindImportExport() {
    document.getElementById('btn-export').addEventListener('click', () => {
      const data = Storage.load();
      if (data.length === 0) {
        alert('暂无数据可导出。');
        return;
      }
      Storage.exportJSON();
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
        this._route();
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
      const id = hash.split('/')[1];
      this._renderMeetingDetail(id);
    } else if (hash.startsWith('#edit-meeting/')) {
      const id = hash.split('/')[1];
      this._renderMeetingForm(id);
    } else {
      this._renderList();
    }
  }

  // ── Dashboard / Meeting List ──────────────────────────────────────────────
  _renderList() {
    const records = Storage.load();

    document.getElementById('app-root').innerHTML = `
      <div class="dashboard">
        <!-- Left: Meeting List -->
        <div>
          <div class="card">
            <div class="card-header">
              <h2>${Icon.book} 组会记录</h2>
              <span class="stat-chip stat-chip-blue">${records.length} 次</span>
            </div>
            <div class="card-body">
              ${records.length === 0 ? this._emptyState(
                Icon.book,
                '还没有组会记录',
                '<strong>点击右上角「新建组会」</strong>，开始记录第一次组会吧'
              ) : `<div class="meeting-list" id="meeting-list-container"></div>`}
            </div>
          </div>
        </div>

        <!-- Right: Literature Library -->
        <div>
          <div class="card">
            <div class="card-header">
              <h2>${Icon.library} 文献资料库</h2>
            </div>
            <div class="card-body">
              ${records.length === 0 ? this._emptyState(
                Icon.library,
                '文献资料库为空',
                '添加组会并录入文献后，所有文献将汇总显示在这里'
              ) : `
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
      </div>
    `;

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
      const date = new Date(m.date);
      const month = date.toLocaleString('zh-CN', { month: 'short' });
      const day = date.getDate();
      const hasNotes = m.notes && m.notes.trim();

      return `
        <div class="meeting-card fade-in" data-id="${m.id}">
          <div class="meeting-card-date">
            <span class="month">${month}</span>
            <span class="day">${day}</span>
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
        </div>
      `;
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
    Storage.deleteMeeting(id);
    this._renderList();
  }

  _renderLiteratureLibrary(records) {
    const allLit = this._collectLiterature(records);
    const container = document.getElementById('lit-list-container');
    if (!container) return;

    const renderItems = (items) => {
      if (items.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:32px 0">
          ${Icon.search}
          <p>没有找到匹配的文献</p>
        </div>`;
        return;
      }
      container.innerHTML = items.map(lit => `
        <div class="literature-item" data-meeting="${lit.meetingId}">
          <div class="literature-item-title">${escapeHtml(lit.title || '（无标题）')}</div>
          <div class="literature-item-meta">
            ${lit.authors ? `<span>${escapeHtml(lit.authors)}</span>` : ''}
            ${lit.journal ? `<span>${escapeHtml(lit.journal)}</span>` : ''}
            <span class="literature-item-badge">${Icon.calendar} ${formatDate(lit.meetingDate)}</span>
            ${lit.pptFileName ? `<span class="literature-item-badge">${Icon.paperclip} PPT</span>` : ''}
          </div>
          ${lit.keywords && lit.keywords.length > 0 ? `
            <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px">
              ${lit.keywords.map(k => `<span class="tag">${escapeHtml(k)}</span>`).join('')}
            </div>` : ''}
        </div>
      `).join('');

      container.querySelectorAll('.literature-item').forEach(item => {
        item.addEventListener('click', () => {
          location.hash = `#meeting/${item.dataset.meeting}`;
        });
      });
    };

    renderItems(allLit);

    // Search
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

  _totalLitCount(records) {
    return this._collectLiterature(records).length;
  }

  _emptyState(icon, title, message) {
    return `
      <div class="empty-state">
        ${icon}
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
    `;
  }

  // ── Meeting Detail ─────────────────────────────────────────────────────────
  _renderMeetingDetail(id) {
    const meeting = Storage.getMeeting(id);
    if (!meeting) {
      document.getElementById('app-root').innerHTML = `
        <div class="empty-state" style="padding:80px 0">
          ${Icon.info}
          <strong>记录未找到</strong>
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
        ${meeting.notes && meeting.notes.trim() ? `
          <div class="detail-notes">${escapeHtml(meeting.notes)}</div>` : ''}
        <div style="margin-top:16px; display:flex; gap:8px">
          <a href="#edit-meeting/${id}" class="btn btn-secondary btn-sm">${Icon.edit} 编辑</a>
          <button class="btn btn-danger btn-sm" id="detail-delete-btn">${Icon.trash} 删除此记录</button>
        </div>
      </div>

      ${participants.length === 0 ? this._emptyState(
        Icon.users, '暂无参与者记录', '点击上方「编辑」按钮添加组会成员'
      ) : participants.map(p => this._renderParticipantCard(p, id)).join('')}
    `;

    document.getElementById('detail-delete-btn').addEventListener('click', async () => {
      const ok = await showConfirm('确认删除', '删除后数据无法恢复，确定要删除这条组会记录吗？');
      if (ok) {
        Storage.deleteMeeting(id);
        location.hash = '#meeting-list';
      }
    });

    // GitHub repo file download click handler
    document.getElementById('app-root').addEventListener('click', async (e) => {
      const link = e.target.closest('.repo-download');
      if (!link) return;
      e.preventDefault();
      const meetingId = link.dataset.meeting;
      const fileName = link.dataset.file;
      link.textContent = '加载中...';
      link.disabled = true;
      try {
        const content = await repoStorage.downloadFile(fileName, meetingId);
        if (content) {
          const mimeType = _getMimeType(fileName);
          const dataUrl = `data:${mimeType};base64,${content}`;
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = fileName;
          a.click();
        } else {
          alert('无法从 GitHub 加载文件，请检查 Token 是否有效。');
        }
      } catch (err) {
        alert('下载失败: ' + err.message);
      }
      link.disabled = false;
      link.textContent = `${Icon.paperclip} 下载PPT`;
    });
  }

  _renderParticipantCard(participant, meetingId) {
    const literature = participant.literature || [];

    const renderPptDownload = (lit) => {
      if (!lit.pptDataUrl) return '';

      const raw = lit.pptDataUrl;

      if (raw.startsWith('local:')) {
        // Local base64 storage — reconstruct data URL directly
        const content = raw.slice(6);
        const mimeType = _getMimeType(lit.pptFileName);
        const dataUrl = `data:${mimeType};base64,${content}`;
        return `<a href="${dataUrl}" download="${escapeHtml(lit.pptFileName || 'PPT文件')}" class="btn btn-accent btn-sm">${Icon.paperclip} 下载PPT</a>`;
      }

      if (raw.startsWith('repo:')) {
        // GitHub repo storage — dynamic download via API
        return `<a href="#" class="btn btn-accent btn-sm repo-download" data-meeting="${meetingId}" data-file="${escapeHtml(lit.pptFileName || '')}">${Icon.paperclip} 下载PPT</a>`;
      }

      // Old format (direct data URL) — backward compatibility
      return `<a href="${escapeHtml(raw)}" download="${escapeHtml(lit.pptFileName || 'PPT文件')}" class="btn btn-accent btn-sm">${Icon.paperclip} 下载PPT</a>`;
    };

    return `
      <div class="participant-detail-card fade-in">
        <div class="participant-detail-header">
          <h3>${Icon.users} ${escapeHtml(participant.name || '未命名成员')}</h3>
          <span>${literature.length} 篇文献</span>
        </div>
        <div class="participant-detail-body">
          ${literature.length === 0 ? `
            <div style="color:var(--text-muted);font-size:0.875rem;text-align:center;padding:16px">
              暂无文献记录
            </div>` : literature.map(lit => `
            <div class="literature-detail-item">
              <div class="literature-detail-title">${escapeHtml(lit.title || '（无标题）')}</div>
              ${lit.authors ? `<div class="literature-detail-authors">${escapeHtml(lit.authors)}${lit.journal ? ' — ' + escapeHtml(lit.journal) : ''}</div>` : ''}
              ${(lit.keywords || []).length > 0 ? `
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
                  ${lit.keywords.map(k => `<span class="tag">${escapeHtml(k)}</span>`).join('')}
                </div>` : ''}

              <div class="literature-detail-actions">
                ${lit.link ? `<a href="${escapeHtml(lit.link)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">${Icon.arrowRight} 访问链接</a>` : ''}
                ${lit.doi ? `<a href="https://doi.org/${escapeHtml(lit.doi)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">${Icon.fileText} DOI</a>` : ''}
                ${renderPptDownload(lit)}
              </div>

              ${lit.transcript && lit.transcript.trim() ? `
                <div class="transcript-block">
                  <div class="transcript-block-title">${Icon.note} 文字稿</div>
                  <div class="transcript-content">${escapeHtml(lit.transcript)}</div>
                </div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── Meeting Form (Add / Edit) ─────────────────────────────────────────────
  _renderMeetingForm(editId = null) {
    const meeting = editId ? Storage.getMeeting(editId) : null;

    document.getElementById('app-root').innerHTML = `
      <a class="back-link" href="${editId ? '#meeting/' + editId : '#meeting-list'}">
        ${Icon.chevronLeft} ${editId ? '返回组会详情' : '返回组会列表'}
      </a>

      <div class="page-header fade-in">
        <h1>${Icon.book} ${editId ? '编辑组会' : '新建组会'}</h1>
        <p>${editId ? '修改组会信息、参与者及文献记录' : '记录组会时间、参与者及每人分享的文献信息'}</p>
      </div>

      <div class="card fade-in">
        <div class="card-body">
          <div class="alert alert-info">
            ${Icon.info}
            <span><strong>提示：</strong>PPT 等文件将作为 <strong>Base64</strong> 数据存储在浏览器本地，建议单文件不超过 <strong>5 MB</strong>，大型文件建议先压缩或转为 PDF。</span>
          </div>

          <form id="meeting-form">
            <!-- Basic Info -->
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

            <!-- Participants -->
            <div class="form-section">
              <div class="form-section-title">参与者与文献</div>
              <div id="participants-container"></div>
              <button type="button" class="btn btn-secondary" id="add-participant-btn" style="width:100%">
                ${Icon.plus} 添加参与者
              </button>
            </div>

            <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end">
              <a href="${editId ? '#meeting/' + editId : '#meeting-list'}" class="btn btn-secondary">取消</a>
              <button type="submit" class="btn btn-primary btn-lg" id="form-submit-btn">
                ${Icon.check} ${editId ? '保存修改' : '保存组会'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const participantsContainer = document.getElementById('participants-container');
    const existingParticipants = meeting ? meeting.participants : [];

    // Initialize with at least one empty participant if none exist
    if (existingParticipants.length === 0) {
      this._addParticipantBlock(participantsContainer, null);
    } else {
      existingParticipants.forEach(p => this._addParticipantBlock(participantsContainer, p));
    }

    document.getElementById('add-participant-btn').addEventListener('click', () => {
      this._addParticipantBlock(participantsContainer, null);
    });

    // Form submit — upload pending files to GitHub before saving
    document.getElementById('meeting-form').addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = document.getElementById('form-submit-btn');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `${Icon.upload} 上传文件中...`;

      // Pre-generate meeting ID for new meetings (so uploads use the real ID)
      let targetId = editId || uuid();

      const data = this._collectFormData();

      // Upload pending files to GitHub
      if (repoStorage.hasToken()) {
        for (const p of (data.participants || [])) {
          for (const l of (p.literature || [])) {
            if (l.pptDataUrl && l.pptDataUrl.startsWith('pending:')) {
              const base64Content = l.pptDataUrl.slice(8); // remove 'pending:' prefix
              if (!base64Content) continue;
              try {
                const result = await repoStorage.uploadFile(base64Content, l.pptFileName, targetId);
                l.pptDataUrl = `repo:${result.sha}`;
              } catch (err) {
                // Fallback to local storage on failure
                l.pptDataUrl = `local:${base64Content}`;
              }
            }
          }
        }
      }

      let ok;
      if (editId) {
        // For existing meetings: re-upload files that are already repo: (need new SHA each time)
        if (repoStorage.hasToken()) {
          for (const p of (data.participants || [])) {
            for (const l of (p.literature || [])) {
              if (l.pptDataUrl && l.pptDataUrl.startsWith('repo:')) {
                const base64Content = l.pptDataUrl.slice(5); // not present in repo: format — skip
              }
            }
          }
        }
        ok = Storage.updateMeeting(editId, data);
        if (ok) location.hash = `#meeting/${editId}`;
      } else {
        const meeting = {
          id: targetId,
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const records = Storage.load();
        records.unshift(meeting);
        ok = Storage.save(records);
        if (ok) location.hash = `#meeting/${targetId}`;
        else ok = false;
      }

      if (!ok) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  _addParticipantBlock(container, existing) {
    const pid = existing ? existing.id : uuid();
    const litData = existing ? existing.literature : [];

    const block = document.createElement('div');
    block.className = 'participant-block fade-in';
    block.dataset.pid = pid;

    block.innerHTML = `
      <div class="participant-header">
        <input type="text" class="form-input" name="p-name-${pid}" placeholder="参与者姓名（如：张三）" value="${escapeHtml(existing ? existing.name : '')}" required>
        <button type="button" class="btn btn-danger btn-sm remove-participant-btn">${Icon.trash} 移除</button>
      </div>
      <div class="participant-literature">
        <div style="font-size:0.8125rem;font-weight:600;color:var(--primary);margin-bottom:10px">${Icon.fileText} 文献列表</div>
        <div class="lit-blocks-container" data-pid="${pid}"></div>
        <button type="button" class="btn btn-secondary btn-sm add-lit-btn" style="width:100%;margin-top:8px" data-pid="${pid}">
          ${Icon.plus} 添加文献
        </button>
      </div>
    `;

    container.appendChild(block);

    block.querySelector('.remove-participant-btn').addEventListener('click', () => {
      block.remove();
    });

    block.querySelector('.add-lit-btn').addEventListener('click', () => {
      this._addLiteratureBlock(block.querySelector('.lit-blocks-container'), null);
    });

    const litContainer = block.querySelector('.lit-blocks-container');
    if (litData.length === 0) {
      this._addLiteratureBlock(litContainer, null);
    } else {
      litData.forEach(l => this._addLiteratureBlock(litContainer, l));
    }
  }

  _addLiteratureBlock(container, existing) {
    const lid = existing ? existing.id : uuid();

    const block = document.createElement('div');
    block.className = 'literature-block fade-in';
    block.dataset.lid = lid;

    block.innerHTML = `
      <div class="literature-block-header">
        <input type="text" class="form-input" name="lit-title-${lid}" placeholder="文献标题（必填）" value="${escapeHtml(existing ? existing.title : '')}">
        <button type="button" class="btn btn-ghost btn-sm remove-lit-btn" style="color:var(--danger);padding:6px">${Icon.x}</button>
      </div>

      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">作者</label>
          <input type="text" class="form-input" name="lit-authors-${lid}" placeholder="作者姓名" value="${escapeHtml(existing ? existing.authors : '')}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">期刊 / 来源</label>
          <input type="text" class="form-input" name="lit-journal-${lid}" placeholder="期刊名称" value="${escapeHtml(existing ? existing.journal : '')}">
        </div>
      </div>

      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">DOI</label>
          <input type="text" class="form-input" name="lit-doi-${lid}" placeholder="10.xxxx/xxxxx" value="${escapeHtml(existing ? existing.doi : '')}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:0.75rem">链接</label>
          <input type="url" class="form-input" name="lit-link-${lid}" placeholder="https://..." value="${escapeHtml(existing ? existing.link : '')}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-size:0.75rem">关键词（输入后回车添加标签）</label>
        <div class="keyword-tags" id="kw-tags-${lid}">
          ${((existing && existing.keywords) || []).map(k => `
            <span class="keyword-tag" data-kw="${escapeHtml(k)}">${escapeHtml(k)}<button type="button" data-lid="${lid}" data-kw="${escapeHtml(k)}">${Icon.x}</button></span>
          `).join('')}
        </div>
        <input type="text" class="form-input" id="kw-input-${lid}" placeholder="输入关键词后按回车" style="margin-top:4px">
      </div>

      <div class="form-group">
        <label class="form-label" style="font-size:0.75rem">上传 PPT / PDF</label>
        <div class="file-upload-area" id="upload-area-${lid}">
          <input type="file" id="ppt-file-${lid}" accept=".ppt,.pptx,.pdf,.png,.jpg,.jpeg,.gif,.webp,.pptm">
          <div class="file-upload-icon">${Icon.upload}</div>
          <div class="file-upload-text">
            <strong>点击选择</strong> 或拖拽文件到此处<br>
            <small>支持 PPT, PPTX, PDF, PNG, JPG（建议 &lt;5MB）</small>
          </div>
        </div>
        <div id="uploaded-file-${lid}" class="file-uploaded" style="${existing && existing.pptFileName ? '' : 'display:none'}">
          ${Icon.check}
          <span class="file-uploaded-name" id="uploaded-name-${lid}">${escapeHtml(existing ? existing.pptFileName : '')}</span>
          <button type="button" class="btn btn-ghost btn-sm" id="remove-ppt-${lid}" style="padding:2px 6px;color:var(--danger)">${Icon.x}</button>
        </div>
        <div class="upload-status" id="upload-status-${lid}" style="display:none"></div>
        <input type="hidden" name="ppt-data-${lid}" id="ppt-data-${lid}" value="${escapeHtml(existing ? existing.pptDataUrl : '')}">
        <input type="hidden" name="ppt-name-${lid}" id="ppt-name-${lid}" value="${escapeHtml(existing ? existing.pptFileName : '')}">
      </div>

      <div class="form-group" style="margin-bottom:0">
        <label class="form-label" style="font-size:0.75rem">文字稿</label>
        <textarea class="form-textarea" name="lit-transcript-${lid}" rows="4" placeholder="在此粘贴或输入文献汇报的文字稿内容...">${escapeHtml(existing ? existing.transcript : '')}</textarea>
      </div>
    `;

    container.appendChild(block);

    // Remove lit block
    block.querySelector('.remove-lit-btn').addEventListener('click', () => block.remove());

    // Keyword input
    const kwInput = block.querySelector(`#kw-input-${lid}`);
    const kwTags = block.querySelector(`#kw-tags-${lid}`);

    kwInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const kw = kwInput.value.trim();
        if (!kw) return;
        if ([...kwTags.querySelectorAll('.keyword-tag')].some(t => t.dataset.kw === kw)) {
          kwInput.value = '';
          return;
        }
        const tag = document.createElement('span');
        tag.className = 'keyword-tag';
        tag.dataset.kw = kw;
        tag.innerHTML = `${escapeHtml(kw)}<button type="button" data-lid="${lid}" data-kw="${escapeHtml(kw)}">${Icon.x}</button>`;
        kwTags.appendChild(tag);
        kwInput.value = '';
      }
    });

    // Keyword remove (event delegation)
    kwTags.addEventListener('click', e => {
      const btn = e.target.closest('button[data-lid]');
      if (btn) {
        const tag = btn.closest('.keyword-tag');
        if (tag) tag.remove();
      }
    });

    // File upload
    const uploadArea = block.querySelector(`#upload-area-${lid}`);
    const fileInput = block.querySelector(`#ppt-file-${lid}`);
    const uploadedDiv = block.querySelector(`#uploaded-file-${lid}`);
    const uploadedName = block.querySelector(`#uploaded-name-${lid}`);
    const pptData = block.querySelector(`#ppt-data-${lid}`);
    const pptName = block.querySelector(`#ppt-name-${lid}`);
    const removePptBtn = block.querySelector(`#remove-ppt-${lid}`);
    const statusDiv = block.querySelector(`#upload-status-${lid}`);

    const showUploadStatus = (msg, type) => {
      statusDiv.className = `upload-status ${type}`;
      statusDiv.innerHTML = msg;
      statusDiv.style.display = 'flex';
    };
    const hideUploadStatus = () => { statusDiv.style.display = 'none'; };

    const handleFile = async (file) => {
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        alert('文件过大（超过 50MB），建议压缩或转 PDF。');
        return;
      }
      showUploadStatus(`${Icon.upload} 正在读取文件...`, 'loading');

      const reader = new FileReader();
      reader.onload = (ev) => {
        const fullDataUrl = ev.target.result;
        const base64Content = fullDataUrl.split(',')[1];

        if (repoStorage.hasToken()) {
          // Deferred upload: store base64 locally, upload on form submit with real meetingId
          showUploadStatus(`${Icon.upload} 文件已准备好，将在保存时上传到 GitHub`, 'success');
          // Store as pending: prefix indicates upload is queued
          pptData.value = `pending:${base64Content}`;
          pptName.value = file.name;
        } else {
          // No token, use local base64 storage
          showUploadStatus(`${Icon.info} 使用本地存储（建议设置 GitHub 仓库以突破容量限制）`, 'warning');
          pptData.value = `local:${base64Content}`;
          pptName.value = file.name;
        }

        uploadedName.textContent = file.name;
        uploadArea.style.display = 'none';
        uploadedDiv.style.display = 'flex';
      };
      reader.onerror = () => {
        showUploadStatus('文件读取失败', 'error');
        alert('文件读取失败');
      };
      reader.readAsDataURL(file);
    };

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    removePptBtn.addEventListener('click', () => {
      pptData.value = '';
      pptName.value = '';
      fileInput.value = '';
      uploadArea.style.display = '';
      uploadedDiv.style.display = 'none';
    });
  }

  _collectFormData() {
    const date = document.getElementById('f-date').value;
    const topic = document.getElementById('f-topic').value.trim();
    const notes = document.getElementById('f-notes').value.trim();

    const participants = [];
    document.querySelectorAll('.participant-block').forEach(block => {
      const pid = block.dataset.pid;
      const name = block.querySelector(`[name="p-name-${pid}"]`).value.trim();
      if (!name) return;

      const literature = [];
      block.querySelectorAll('.literature-block').forEach(lb => {
        const lid = lb.dataset.lid;
        const title = lb.querySelector(`[name="lit-title-${lid}"]`).value.trim();
        if (!title) return;

        const kwTags = lb.querySelectorAll(`#kw-tags-${lid} .keyword-tag`);
        const keywords = [...kwTags].map(t => t.dataset.kw).filter(Boolean);

        const pptDataUrl = lb.querySelector(`[name="ppt-data-${lid}"]`).value;
        // Normalize old format (data:...;base64,...) to local: prefix
        let normalized = pptDataUrl;
        if (pptDataUrl && !pptDataUrl.startsWith('local:') && !pptDataUrl.startsWith('repo:') && !pptDataUrl.startsWith('pending:')) {
          if (pptDataUrl.includes(',')) {
            normalized = `local:${pptDataUrl.split(',')[1]}`;
          }
        }

        literature.push({
          id: lid,
          title,
          authors: lb.querySelector(`[name="lit-authors-${lid}"]`).value.trim(),
          journal: lb.querySelector(`[name="lit-journal-${lid}"]`).value.trim(),
          doi: lb.querySelector(`[name="lit-doi-${lid}"]`).value.trim(),
          link: lb.querySelector(`[name="lit-link-${lid}"]`).value.trim(),
          keywords,
          pptDataUrl: normalized,
          pptFileName: lb.querySelector(`[name="ppt-name-${lid}"]`).value,
          transcript: lb.querySelector(`[name="lit-transcript-${lid}"]`).value.trim()
        });
      });

      participants.push({ id: pid, name, literature });
    });

    return { date, topic, notes, participants };
  }
}

// ─── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  new MeetingApp();
});
