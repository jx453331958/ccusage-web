# CCUsage Web

一个基于 Web 的 Claude Code token 用量监控仪表板，支持多设备监控。

[English Documentation](README.md)

## 功能特性

- 实时 token 用量监控（类似 ccusage CLI 的 web 版本）
- 基于 Agent 的多设备支持
- 管理员认证系统
- 交互式仪表板，展示用量统计和趋势
- RESTful API 用于数据上报
- Docker 一键部署
- SQLite 数据库自动初始化

## 技术栈

- **前端**: Next.js 15 (App Router), React 19, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Recharts
- **后端**: Next.js API Routes
- **数据库**: SQLite (better-sqlite3)
- **认证**: JWT + bcrypt
- **部署**: Docker + docker-compose

## 快速开始

### 开发模式

1. 克隆仓库:
```bash
git clone https://github.com/yourusername/ccusage-web.git
cd ccusage-web
```

2. 安装依赖:
```bash
npm install
```

3. 创建环境变量文件:
```bash
cp .env.example .env
# 编辑 .env 设置你的凭据
```

4. 启动开发服务器:
```bash
npm run dev
```

5. 打开 http://localhost:3000 并使用默认凭据登录:
   - 用户名: `admin`
   - 密码: `admin123` (或你在 `.env` 中设置的密码)

### Docker 部署

1. 创建 `.env` 文件并配置:
```bash
JWT_SECRET=你的密钥-请修改
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的安全密码
```

2. 使用 Docker Compose 构建并运行:
```bash
docker-compose up -d
```

3. 访问仪表板: http://localhost:3000

SQLite 数据库将存储在 `./data/ccusage.db`，容器重启后数据会保留。

## Agent 配置

要从设备上报用量数据，需要运行 agent 脚本。

1. 在仪表板的 API Keys 标签页创建 API key

2. 在需要监控的设备上运行:
```bash
cd agent
node agent.js --server http://你的服务器:3000 --api-key 你的API密钥
```

3. 或使用环境变量:
```bash
export CCUSAGE_SERVER=http://你的服务器:3000
export CCUSAGE_API_KEY=你的api密钥
node agent.js
```

查看 [agent/README.md](agent/README.md) 了解如何将 agent 作为后台服务运行。

## API 文档

### 认证

所有管理员端点都需要 JWT token（作为 HTTP-only cookie）。

**登录**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**登出**
```http
POST /api/auth/logout
```

### 用量上报（Agent API）

**上报用量**
```http
POST /api/usage/report
Authorization: Bearer 你的API密钥
Content-Type: application/json

{
  "records": [
    {
      "input_tokens": 1000,
      "output_tokens": 500,
      "total_tokens": 1500,
      "session_id": "可选的会话ID",
      "timestamp": 1234567890
    }
  ]
}
```

### 统计数据

**获取用量统计**
```http
GET /api/usage/stats?range=7d
Cookie: auth_token=JWT_TOKEN
```

查询参数:
- `range`: `1d`, `7d`, `30d`, 或 `all`

### API Key 管理

**列出 API Keys**
```http
GET /api/api-keys
Cookie: auth_token=JWT_TOKEN
```

**创建 API Key**
```http
POST /api/api-keys
Cookie: auth_token=JWT_TOKEN
Content-Type: application/json

{
  "device_name": "MacBook Pro"
}
```

**删除 API Key**
```http
DELETE /api/api-keys/:id
Cookie: auth_token=JWT_TOKEN
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_PATH` | SQLite 数据库路径 | `./data/ccusage.db` |
| `JWT_SECRET` | JWT 签名密钥 | 生产环境必需 |
| `ADMIN_USERNAME` | 默认管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 默认管理员密码 | `admin123` |
| `PORT` | 服务器端口 | `3000` |

## 项目结构

```
ccusage-web/
├── src/
│   ├── app/                 # Next.js App Router 页面
│   │   ├── api/            # API 路由
│   │   ├── dashboard/      # 仪表板页面
│   │   └── login/          # 登录页面
│   ├── components/         # UI 组件
│   │   ├── ui/            # shadcn/ui 组件
│   │   └── dashboard/     # 仪表板专用组件
│   └── lib/               # 工具库
│       ├── db.ts          # 数据库设置
│       ├── auth.ts        # 认证
│       └── utils.ts       # 辅助函数
├── agent/                 # 监控 Agent 脚本
├── data/                  # SQLite 数据库（自动创建）
├── Dockerfile            # Docker 配置
└── docker-compose.yml    # Docker Compose 配置
```

## 截图

_截图将添加在这里_

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

MIT License

## 作者

使用 Claude Code 创建
