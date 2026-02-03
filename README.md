# CCUsage Web

A web-based monitoring dashboard for Claude Code token usage across multiple devices.

[中文文档](README_CN.md)

## Features

- Real-time token usage monitoring (similar to ccusage CLI)
- Multi-device support with agent-based reporting
- Admin authentication system
- Interactive dashboard with usage statistics and trends
- RESTful API for data ingestion
- Docker deployment ready
- SQLite database with automatic initialization

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Recharts
- **Backend**: Next.js API Routes
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT with bcrypt
- **Deployment**: Docker + docker-compose

## Quick Start

### Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ccusage-web.git
cd ccusage-web
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
# Edit .env and set your credentials
```

4. Run development server:
```bash
npm run dev
```

5. Open http://localhost:3000 and login with default credentials:
   - Username: `admin`
   - Password: `admin123` (or what you set in `.env`)

### Docker Deployment

1. Create `.env` file with your configuration:
```bash
JWT_SECRET=your-secret-key-change-this
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

2. Build and run with Docker Compose:
```bash
docker-compose up -d
```

3. Access the dashboard at http://localhost:3000

The SQLite database will be stored in `./data/ccusage.db` and persisted across container restarts.

## Agent Setup

To report usage from a device, you need to run the agent script.

1. Create an API key in the dashboard (API Keys tab)

2. On the device you want to monitor, run:
```bash
cd agent
node agent.js --server http://your-server:3000 --api-key YOUR_API_KEY
```

3. Or set environment variables:
```bash
export CCUSAGE_SERVER=http://your-server:3000
export CCUSAGE_API_KEY=your_api_key
node agent.js
```

See [agent/README.md](agent/README.md) for more details on running the agent as a background service.

## API Documentation

### Authentication

All admin endpoints require a JWT token set as an HTTP-only cookie.

**Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Logout**
```http
POST /api/auth/logout
```

### Usage Reporting (Agent API)

**Report Usage**
```http
POST /api/usage/report
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "records": [
    {
      "input_tokens": 1000,
      "output_tokens": 500,
      "total_tokens": 1500,
      "session_id": "optional-session-id",
      "timestamp": 1234567890
    }
  ]
}
```

### Statistics

**Get Usage Stats**
```http
GET /api/usage/stats?range=7d
Cookie: auth_token=JWT_TOKEN
```

Query parameters:
- `range`: `1d`, `7d`, `30d`, or `all`

### API Keys Management

**List API Keys**
```http
GET /api/api-keys
Cookie: auth_token=JWT_TOKEN
```

**Create API Key**
```http
POST /api/api-keys
Cookie: auth_token=JWT_TOKEN
Content-Type: application/json

{
  "device_name": "MacBook Pro"
}
```

**Delete API Key**
```http
DELETE /api/api-keys/:id
Cookie: auth_token=JWT_TOKEN
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_PATH` | Path to SQLite database | `./data/ccusage.db` |
| `JWT_SECRET` | Secret key for JWT signing | Required in production |
| `ADMIN_USERNAME` | Default admin username | `admin` |
| `ADMIN_PASSWORD` | Default admin password | `admin123` |
| `PORT` | Server port | `3000` |

## Project Structure

```
ccusage-web/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── api/            # API routes
│   │   ├── dashboard/      # Dashboard page
│   │   └── login/          # Login page
│   ├── components/         # UI components
│   │   ├── ui/            # shadcn/ui components
│   │   └── dashboard/     # Dashboard-specific components
│   └── lib/               # Utility libraries
│       ├── db.ts          # Database setup
│       ├── auth.ts        # Authentication
│       └── utils.ts       # Helpers
├── agent/                 # Agent script for monitoring
├── data/                  # SQLite database (auto-created)
├── Dockerfile            # Docker configuration
└── docker-compose.yml    # Docker Compose setup
```

## Screenshots

_Screenshots will be added here_

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Author

Created with Claude Code
