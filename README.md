# 知屿文档：本地个人知识库

一个只运行在自己电脑上的文档库，参考飞书文档的工作方式：左侧文档树、主编辑区与大纲并排。它不包含飞书的聊天、会议、审批等功能，也不需要登录、云数据库或第三方账号。

完整迭代记录见 [`CHANGELOG.md`](./CHANGELOG.md)。

## 已实现

- 富文本块编辑器：标题、列表、待办、代码块、图片等由 BlockNote 提供
- 无限层级的文档与子文档；同级文档可以拖动排序
- 标题和正文自动保存；快速切换文档不会串写内容
- `Ctrl + K` 全文搜索
- 标签管理、标签筛选与最近编辑搜索
- 回收站、恢复与一键永久清空
- 默认导出当前文档，可切换全量 JSON/Markdown 备份并进行二次确认
- Markdown 与普通 JSON 文件导入，可指定为顶级文档或任意文档的子文档
- 正文图片本地上传与插入
- 大纲跟随正文滚动，支持 1—6 级标题层级与完整标题提示
- 本地 SQLite 数据库，重启服务或电脑后文档仍保留

## 技术栈

| 用途 | 方案 |
| --- | --- |
| 前端与本地服务 | Next.js 16、React 19、TypeScript |
| 富文本编辑 | BlockNote |
| 本地数据库 | Node.js 内置 `node:sqlite` + SQLite |
| 文档拖动排序 | dnd-kit |
| 样式与图标 | Tailwind CSS、Lucide |

## 启动

前提：安装 Node.js 22 或更新版本（项目已在 Node.js 24 上验证）。第一次使用时，在项目目录打开终端执行：

```powershell
npm install
```

之后有两种启动方式：

1. 双击 [`启动知识库.bat`](./启动知识库.bat)。
2. 在项目目录执行：

```powershell
npm run dev
```

浏览器打开 <http://localhost:3000>。终端窗口不要关闭；按 `Ctrl + C` 可以停止服务。

也可以直接双击 [`关闭知识库.bat`](./关闭知识库.bat) 一键关闭本项目启动的服务。它只匹配当前项目目录下的 Next 开发进程，不会关闭其他项目的 Node 服务。

## 数据与备份

所有文档都保存在本项目的 `data/knowledge.db` 中。这个文件不会提交到 Git，也不会自动上传到任何云端。

右上角“更多功能”可以导出 JSON 或 Markdown。默认只导出当前文档；开启“全量备份”后会导出整个文档库，执行前均会再次确认。JSON 备份可通过“导入备份”恢复到当前文档库。

也可以先停止服务，再把 `data/knowledge.db` 复制到另一个磁盘或网盘进行整库备份。不要把本地数据库直接暴露到公网。

## 项目结构

```text
app/knowledge-desk.tsx       文档库主界面
app/api/documents/           文档、新建、保存、回收站接口
app/api/search/              本地全文搜索接口
components/document-editor.tsx  BlockNote 编辑器
lib/documents-db.ts          SQLite 数据访问与迁移
data/knowledge.db            本机数据（首次启动自动创建）
legacy-source/               原 GitHub 项目的云端实现备份，仅作参考
```

## 来源与许可

项目最初基于 [terrydjony/notion-style-personal-site](https://github.com/terrydjony/notion-style-personal-site)（MIT）整理，原项目的云端 Convex、Clerk、R2 页面已保留在 `legacy-source/`，当前运行入口改为本地单机文档库。
