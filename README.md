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

### Step 1: Deploy Server (For Administrators)

First, set up the monitoring server:

#### Option A: Docker Deployment (Recommended)

1. Clone the repository:
```bash
git clone git@github.com:jx453331958/ccusage-web.git
cd ccusage-web
```

2. One-command deployment:
```bash
./deploy.sh deploy
```

The script will:
- Check Docker availability
- Create `.env` file (you'll be prompted to edit it)
- Create data directory
- Build and start the container

3. Access the dashboard at http://localhost:3000
   - Login with your configured credentials
   - The SQLite database will be stored in `./data/ccusage.db`

#### Deploy Script Commands

```bash
./deploy.sh deploy   # First-time deployment
./deploy.sh update   # Pull latest code and rebuild
./deploy.sh start    # Start the service
./deploy.sh stop     # Stop the service
./deploy.sh restart  # Restart the service
./deploy.sh status   # Show status and recent logs
./deploy.sh logs     # Follow container logs
./deploy.sh backup   # Backup the database
./deploy.sh clean    # Remove containers and images
```

#### Manual Docker Deployment

If you prefer manual setup:

1. Configure environment variables:
```bash
cp .env.example .env
nano .env  # Edit with your settings
```

Recommended `.env` settings:
```bash
JWT_SECRET=your-random-secret-key-change-this
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
COOKIE_SECURE=false  # Set to true if using HTTPS
```

2. Start with Docker Compose:
```bash
docker compose up -d --build
```

3. Access the dashboard at http://localhost:3000

#### Option B: Development Setup

1. Clone and install:
```bash
git clone git@github.com:jx453331958/ccusage-web.git
cd ccusage-web
npm install
```

2. Configure environment:
```bash
cp .env.example .env
nano .env  # Edit your credentials
```

3. Run development server:
```bash
npm run dev
```

4. Access at http://localhost:3000

### Step 2: Install Agent (For End Users)

After the server is running, users can install the monitoring agent:

1. **Get credentials from admin:**
   - Server URL (e.g., `http://your-server:3000`)
   - API Key (create in dashboard → API Keys tab)

2. **One-line installation:**
```bash
curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh | bash -s install
```

The script will:
- Prompt for server URL and API key
- Auto-detect OS (macOS/Linux)
- Install as background service (launchd/systemd/cron)
- Start reporting usage every 5 minutes

**That's it!** The agent runs in the background and reports to your server automatically.

## Agent Management

### Check Agent Status

```bash
curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh | bash -s status
```

### Uninstall Agent

```bash
curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh | bash -s uninstall
```

### Alternative: Download Script First

If you prefer to download once and run multiple times:

```bash
curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh -o setup.sh
chmod +x setup.sh
./setup.sh install    # Install
./setup.sh status     # Check status
./setup.sh uninstall  # Remove
./setup.sh run        # Test run
```

See [agent/README.md](agent/README.md) for manual setup and advanced configuration.

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
