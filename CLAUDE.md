# Claude Code Project Memory

## Common Issues

### npm ci fails with "package.json and package-lock.json are in sync" error

**Symptoms:**
```
npm ci can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
Missing: @swc/helpers@0.5.18 from lock file
```

**Cause:** This happens when dependencies are added/updated but package-lock.json wasn't properly regenerated, or when transitive dependencies change.

**Fix:**
```bash
rm -rf node_modules package-lock.json && npm install
```

Then commit and push the regenerated `package-lock.json`.

**Prevention:** After any dependency changes, always run `npm install` and commit both `package.json` and `package-lock.json` together.

---

## Project Structure

- **Frontend:** Next.js 15 with App Router, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes with SQLite (better-sqlite3)
- **Charts:** ECharts for React
- **Agent:** Python 3 (preferred) or Node.js for usage data collection

## Deployment

- Docker-based deployment
- Uses `npm ci` for reproducible builds (requires synced lock file)
- Alpine Linux base image

## Agent

The agent (`/agent`) supports both Python 3 and Node.js:
- Python 3.6+ (recommended, uses only standard library)
- Node.js 18+ (fallback)

Setup script auto-detects available runtime.
