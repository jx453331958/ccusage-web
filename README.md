# CCUsage Web

A web-based monitoring dashboard for Claude Code token usage across multiple devices.

[中文文档](README_CN.md)

## Features

- 🌍 **Full i18n support** - Complete English and Chinese localization
- 📊 **Real-time token usage monitoring** - Track Claude Code usage across all devices
- 🖥️ **Multi-device support** - Agent-based reporting from multiple machines
- 🔐 **Secure authentication** - JWT-based admin system with password management
- 📈 **Interactive dashboard** - Beautiful charts with usage statistics and trends
- 🔑 **API key management** - Create and manage device-specific API keys
- ⚙️ **Settings panel** - Change password and manage account settings
- 🚀 **Docker ready** - One-command deployment with docker-compose
- 💾 **SQLite database** - Automatic initialization and data persistence
- 📱 **Responsive design** - Works seamlessly on desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Recharts
- **i18n**: next-intl for internationalization
- **Backend**: Next.js API Routes
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT with bcrypt password hashing
- **Deployment**: Docker + docker-compose

## Quick Start

### Development

1. Clone the repository:
```bash
git clone git@github.com:jx453331958/ccusage-web.git
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

6. The dashboard supports English and Chinese - use the language switcher in the top right corner

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

To report usage from a device:

1. Create an API key in the dashboard (API Keys tab)

2. Run the one-liner setup script:
```bash
curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh -o setup.sh && chmod +x setup.sh && ./setup.sh install
```

The script will:
- Prompt for your server URL and API key
- Detect your OS (macOS/Linux)
- Install as a background service (launchd/systemd/cron)

Other commands:
```bash
./setup.sh status     # Check agent status
./setup.sh uninstall  # Remove agent
./setup.sh run        # Run once for testing
```

See [agent/README.md](agent/README.md) for manual setup and more details.

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

**Change Password**
```http
POST /api/auth/change-password
Cookie: auth_token=JWT_TOKEN
Content-Type: application/json

{
  "currentPassword": "admin123",
  "newPassword": "newpassword123"
}
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
| `COOKIE_SECURE` | Enable secure cookies (HTTPS) | `false` |
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

jx453331958
