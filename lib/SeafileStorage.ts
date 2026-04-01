'use client'

// ============================================================
// SeafileStorage — 南大云盘（Box）存储客户端
// 基于 Seafile REST API，支持直接浏览器调用（无需后端代理）
// ============================================================

const SEAFILE_API_BASE = 'https://box.nju.edu.cn/api2'
const SEAFILE_WEBDAV_BASE = 'https://box.nju.edu.cn/seafdav'

interface SeafileConfig {
  username: string      // 学工号@nju.edu.cn
  password: string      // WebDAV 独立密码
  repoId: string        // 资料库 ID（从云盘 URL 获取）
  folder: string        // 存储文件夹路径，如 /lab-meetings
}

interface UploadResult {
  success: boolean
  path?: string
  error?: string
}

interface DownloadResult {
  ok: boolean
  content?: string
  error?: string
  status?: number
}

function getConfig(): SeafileConfig | null {
  try {
    const raw = localStorage.getItem('seafileConfig')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveConfig(config: SeafileConfig) {
  localStorage.setItem('seafileConfig', JSON.stringify(config))
}

function clearConfig() {
  localStorage.removeItem('seafileConfig')
}

function getStoredRepoId(): string | null {
  return localStorage.getItem('seafileRepoId')
}

function saveRepoId(repoId: string) {
  localStorage.setItem('seafileRepoId', repoId)
}

function buildFilePath(fileName: string, meetingId: string): string {
  return `/${meetingId}/${fileName}`
}

// ─── 获取资料库列表 ───────────────────────────────────────────────────────────
async function listRepos(config: SeafileConfig): Promise<{ id: string; name: string }[]> {
  const credentials = btoa(`${config.username}:${config.password}`)
  const res = await fetch(`${SEAFILE_API_BASE}/repos/`, {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json'
    }
  })
  if (!res.ok) throw new Error(`获取资料库列表失败: HTTP ${res.status}`)
  const data = await res.json()
  return data.map((r: any) => ({ id: r.id, name: r.name }))
}

// ─── 上传文件（Seafile Web API 两步法） ──────────────────────────────────────
async function uploadFile(config: SeafileConfig, fileName: string, meetingId: string, base64Content: string): Promise<UploadResult> {
  try {
    const credentials = btoa(`${config.username}:${config.password}`)
    const dirPath = `/${meetingId}`
    const filePath = buildFilePath(fileName, meetingId)

    // Step 1: 获取上传链接
    const linkRes = await fetch(
      `${SEAFILE_API_BASE}/repos/${config.repoId}/upload-link/?p=${encodeURIComponent(dirPath)}`,
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      }
    )

    if (!linkRes.ok) {
      const errText = await linkRes.text()
      return { success: false, error: `获取上传链接失败: HTTP ${linkRes.status} ${errText}` }
    }

    const uploadUrl: string = await linkRes.json()

    // Step 2: 上传文件（multipart/form-data）
    const binary = atob(base64Content)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes])

    const formData = new FormData()
    formData.append('file', blob, fileName)
    formData.append('parent_dir', dirPath)
    formData.append('relative_path', '')
    formData.append('replace', '1')
    formData.append('ret-json', '1')

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`
      },
      body: formData
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      return { success: false, error: `上传失败: HTTP ${uploadRes.status} ${errText}` }
    }

    const result = await uploadRes.json()
    if (result.success) {
      return { success: true, path: filePath }
    } else {
      return { success: false, error: JSON.stringify(result) }
    }
  } catch (err: any) {
    return { success: false, error: err.message || '网络错误' }
  }
}

// ─── 下载文件 ────────────────────────────────────────────────────────────────
async function downloadFile(config: SeafileConfig, fileName: string, meetingId: string): Promise<DownloadResult> {
  try {
    const credentials = btoa(`${config.username}:${config.password}`)
    const filePath = buildFilePath(fileName, meetingId)

    const res = await fetch(
      `${SEAFILE_WEBDAV_BASE}${filePath}`,
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/octet-stream'
        }
      }
    )

    if (!res.ok) {
      return {
        ok: false,
        error: `文件不存在或无权限访问: HTTP ${res.status}`,
        status: res.status
      }
    }

    const arrayBuffer = await res.arrayBuffer()
    const binary = String.fromCharCode(...new Uint8Array(arrayBuffer))
    const base64 = btoa(binary)

    return { ok: true, content: base64 }
  } catch (err: any) {
    return { ok: false, error: err.message || '网络错误' }
  }
}

// ─── 测试连接 ────────────────────────────────────────────────────────────────
async function testConnection(config: SeafileConfig): Promise<{ ok: boolean; error?: string; repos?: { id: string; name: string }[] }> {
  try {
    const repos = await listRepos(config)
    return { ok: true, repos }
  } catch (err: any) {
    return { ok: false, error: err.message || '连接失败' }
  }
}

// ─── 确保资料库中存在指定目录 ────────────────────────────────────────────────
async function ensureFolder(config: SeafileConfig, dirPath: string): Promise<boolean> {
  try {
    const credentials = btoa(`${config.username}:${config.password}`)
    const res = await fetch(
      `${SEAFILE_API_BASE}/repos/${config.repoId}/dir/?p=${encodeURIComponent(dirPath)}`,
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      }
    )
    // 200 = exists, 404 = doesn't exist
    if (res.status === 200) return true

    // Create the directory
    const createRes = await fetch(
      `${SEAFILE_API_BASE}/repos/${config.repoId}/dir/?p=${encodeURIComponent(dirPath)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          operation: 'mkdir',
          dir_name: dirPath.split('/').pop()
        })
      }
    )
    return createRes.ok
  } catch {
    return false
  }
}

const SeafileStorage = {
  getConfig,
  saveConfig,
  clearConfig,
  getStoredRepoId,
  saveRepoId,
  uploadFile,
  downloadFile,
  testConnection,
  ensureFolder,
  listRepos,
  buildFilePath,
  SEAFILE_API_BASE,
  SEAFILE_WEBDAV_BASE
}

export default SeafileStorage
export type { SeafileConfig, UploadResult, DownloadResult }
