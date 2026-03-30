# 实验室组会记录网站

一个简洁、纯前端的实验室组会记录工具，帮助团队有序记录每次组会的文献分享、文字稿和 PPT，无需服务器，直接在浏览器中使用。

## 功能概览

- **组会记录管理** — 记录组会时间、主题、参与者
- **文献录入** — 为每位参与者添加分享的文献（含标题、作者、期刊、DOI、链接、关键词标签）
- **文字稿** — 为每份文献附上汇报文字稿
- **PPT / PDF 上传** — 上传 PPT、PDF 或图片文件，支持本地存储或 GitHub 仓库远程存储
- **文献资料库** — 所有文献汇总展示，支持按标题/作者/关键词实时搜索，点击跳转到对应组会
- **数据导入 / 导出** — 将数据备份为 `.json` 文件，或从备份恢复

## 使用方法

### 直接打开

双击 `index.html` 在浏览器中打开即可使用（推荐使用 Chrome、Edge 或 Firefox）。

### 数据存储

所有数据（组会记录元数据）保存在浏览器 **localStorage** 中，属于本地存储，不会自动同步到其他设备或浏览器。PPT/PDF 文件可选择存储在本地或远程 GitHub 仓库中。

### PPT/PDF 存储方式

**本地存储（默认）**：文件以 Base64 编码存储在 localStorage 中，适合小文件（建议单个文件不超过 5 MB）。

**GitHub 仓库远程存储（推荐）**：突破 localStorage 容量限制，文件存储在你的 GitHub 仓库 `uploads/` 目录下。配置方式：点击导航栏右侧 **GitHub** 按钮，输入 Personal Access Token 并测试连接即可。

如需在多台设备使用，建议定期点击右上角「导出」按钮备份数据。

### 注意事项

- PPT 等文件以 **Base64** 编码存储，建议单个文件不超过 **5 MB**，大文件建议压缩或转为 PDF
- 清理浏览器数据会导致记录丢失，请注意定期导出备份
- 本工具完全离线可用，无需网络连接（GitHub 远程存储功能除外）
- GitHub 仓库中的文件存储在 `uploads/{meetingId}/` 目录

### GitHub Token 生成步骤

1. 打开 GitHub 设置页面：[github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. 选择 **Fine-grained personal access tokens**
3. **Token name** 填写备注（如 `实验室组会记录网站`）
4. **Expiration** 选择过期时间（建议 30 天或自定义）
5. **Repository access** 选择 **Only select repositories**，然后勾选 `HongjiaL/LabRecord`
6. **Permissions** -> **Contents** 设置为 **Read and write**
7. 点击 **Generate token**，复制生成的 Token
8. 在网站导航栏右侧点击 **GitHub** 按钮，粘贴 Token 并点击「测试连接」，确认成功后保存

> 注意：Token 一旦生成请妥善保管，不要泄露给他人。

## 文件说明

```
实验室组会记录网站/
├── index.html    # 主页面（双击此文件在浏览器中打开）
├── main.css      # 样式文件
├── app.js        # 脚本文件
├── SPEC.md       # 规格说明书
└── README.md     # 本文件
```

## 快速开始

1. 打开 `index.html`
2. 点击右上角「**新建组会**」
3. 填写组会日期，选择参与者姓名
4. 为每位参与者添加文献信息（标题、作者、文字稿）
5. 可上传 PPT 文件
6. 点击「**保存组会**」

之后可在右侧「**文献资料库**」查看所有文献，通过搜索框快速找到目标文献。
