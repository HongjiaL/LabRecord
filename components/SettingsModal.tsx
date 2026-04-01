'use client'
import { useState, useEffect } from 'react'
import SeafileStorage from '@/lib/SeafileStorage'

const Icon = {
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
}

interface Repo {
  id: string
  name: string
}

interface SettingsModalProps {
  onSaved?: () => void
}

export default function SettingsModal({ onSaved }: SettingsModalProps) {
  const [active, setActive] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRepoId, setSelectedRepoId] = useState('')
  const [repos, setRepos] = useState<Repo[]>([])
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' })
  const [saved, setSaved] = useState(false)

  // Load existing config on mount
  useEffect(() => {
    const cfg = SeafileStorage.getConfig()
    if (cfg) {
      setUsername(cfg.username)
      setSelectedRepoId(cfg.repoId)
    }
  }, [])

  const open = () => {
    setActive(true)
    setSaved(false)
    setStatus({ type: 'idle', msg: '' })
    const cfg = SeafileStorage.getConfig()
    if (cfg) {
      setUsername(cfg.username)
      setSelectedRepoId(cfg.repoId)
    }
  }

  const close = () => {
    setActive(false)
    setStatus({ type: 'idle', msg: '' })
    setSaved(false)
  }

  const handleTest = async () => {
    if (!username || !password) {
      setStatus({ type: 'error', msg: '请输入完整的用户名和密码' })
      return
    }
    setStatus({ type: 'loading', msg: '正在连接南大云盘...' })
    const result = await SeafileStorage.testConnection({ username, password, repoId: '', folder: '' })
    if (result.ok && result.repos) {
      setRepos(result.repos)
      setStatus({ type: 'success', msg: `连接成功！找到 ${result.repos.length} 个资料库，请选择存储位置。` })
      if (result.repos.length > 0 && !selectedRepoId) {
        setSelectedRepoId(result.repos[0].id)
      }
    } else {
      setRepos([])
      setStatus({ type: 'error', msg: result.error || '连接失败，请检查用户名和密码' })
    }
  }

  const handleSave = () => {
    if (!username || !password || !selectedRepoId) {
      setStatus({ type: 'error', msg: '请完整填写信息并选择一个资料库' })
      return
    }
    SeafileStorage.saveConfig({ username, password, repoId: selectedRepoId, folder: '' })
    setStatus({ type: 'success', msg: '配置已保存！' })
    setSaved(true)
    if (onSaved) onSaved()
  }

  const handleDisconnect = () => {
    SeafileStorage.clearConfig()
    setUsername('')
    setPassword('')
    setSelectedRepoId('')
    setRepos([])
    setSaved(false)
    setStatus({ type: 'idle', msg: '' })
    if (onSaved) onSaved()
  }

  const existingConfig = !!SeafileStorage.getConfig()

  return (
    <>
      {/* Settings button trigger */}
      <button className="btn btn-ghost btn-sm" id="btn-settings" title="存储设置" onClick={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        存储设置
      </button>

      {/* Modal */}
      <div className={`modal-overlay ${active ? 'active' : ''}`} id="settings-modal">
        <div className="modal" style={{ maxWidth: '520px' }}>
          <div className="modal-header">
            <h2>{Icon.cloud} 南大云盘存储设置</h2>
            <button className="btn btn-ghost btn-sm" onClick={close}>{Icon.x}</button>
          </div>
          <div className="modal-body">
            {existingConfig && !saved && (
              <div className="alert alert-info" style={{ marginBottom: '16px' }}>
                <span dangerouslySetInnerHTML={{ __html: Icon.info }} />
                <span>当前已连接到南大云盘，可以修改配置或断开连接。</span>
              </div>
            )}

            {status.type === 'error' && (
              <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
                <span dangerouslySetInnerHTML={{ __html: Icon.info }} />
                <span>{status.msg}</span>
              </div>
            )}
            {status.type === 'success' && (
              <div className="alert" style={{ marginBottom: '16px', background: '#F0FFF4', color: '#276749', border: '1px solid #9AE6B4', padding: '12px 16px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '0.875rem' }}>
                <span dangerouslySetInnerHTML={{ __html: Icon.check }} />
                <span>{status.msg}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">南大学工号 <span className="required">*</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="如：0123456@nju.edu.cn"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="off"
              />
              <div className="form-hint">格式：学号@nju.edu.cn（如 0123456@nju.edu.cn）</div>
            </div>

            <div className="form-group">
              <label className="form-label">WebDAV 密码 <span className="required">*</span></label>
              <input
                type="password"
                className="form-input"
                placeholder="南大云盘 WebDAV 独立密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <div className="form-hint">
                WebDAV 独立密码不是统一身份认证密码。请在{' '}
                <a href="https://box.nju.edu.cn" target="_blank" rel="noopener noreferrer">box.nju.edu.cn</a>{' '}
                的「账户设置 → 通用设置 → WebDAV 密码」中生成。
              </div>
            </div>

            {repos.length > 0 && (
              <div className="form-group">
                <label className="form-label">选择存储资料库 <span className="required">*</span></label>
                <select
                  className="form-input form-select"
                  value={selectedRepoId}
                  onChange={e => setSelectedRepoId(e.target.value)}
                >
                  <option value="">请选择...</option>
                  {repos.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <div className="form-hint">
                  PPT 文件将存储在该资料库中，建议创建专用资料库（如「组会PPT」）。
                  每个组会的数据会存放在以组会ID命名的子文件夹中。
                </div>
              </div>
            )}

            <div style={{ marginTop: '24px', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {existingConfig && (
                <button className="btn btn-danger btn-sm" onClick={handleDisconnect}>
                  {Icon.trash} 断开连接
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={handleTest}
                disabled={status.type === 'loading'}
              >
                {status.type === 'loading' ? '连接中...' : '测试连接'}
              </button>
              {repos.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={!selectedRepoId}
                >
                  {Icon.check} 保存配置
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
