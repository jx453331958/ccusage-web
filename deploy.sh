#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Image name
IMAGE="ghcr.io/jx453331958/ccusage-web:latest"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi

    print_info "Docker is available"
}

# Initialize environment file
init_env() {
    if [ ! -f .env ]; then
        print_info "Creating .env file from .env.example..."
        cp .env.example .env
        print_warn "Please edit .env file to set your configuration:"
        print_warn "  - ADMIN_PASSWORD: Change to a secure password"
        echo ""
        read -p "Press Enter to continue after editing .env, or Ctrl+C to abort..."
    else
        print_info ".env file already exists"
    fi
}

# Create data directory
init_data_dir() {
    if [ ! -d data ]; then
        print_info "Creating data directory..."
        mkdir -p data
    fi
    print_info "Data directory ready"
}

# Deploy (first time)
deploy() {
    print_info "Starting deployment..."

    check_docker
    init_env
    init_data_dir

    print_info "Pulling latest image..."
    docker compose pull

    print_info "Starting containers..."
    docker compose up -d

    print_info "Waiting for service to be ready..."
    sleep 5

    # Check if service is running
    if docker compose ps | grep -q "Up"; then
        print_info "Deployment successful!"
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  CCUsage Web is now running!${NC}"
        echo -e "${GREEN}  Access: http://localhost:${PORT:-3000}${NC}"
        echo -e "${GREEN}========================================${NC}"
    else
        print_error "Deployment failed. Check logs with: docker compose logs"
        exit 1
    fi
}

# Update (pull latest image and restart)
update() {
    print_info "Starting update..."

    check_docker

    print_info "Pulling latest image..."
    docker compose pull

    print_info "Restarting containers with new image..."
    docker compose up -d

    print_info "Waiting for service to be ready..."
    sleep 5

    if docker compose ps | grep -q "Up"; then
        print_info "Update successful!"
    else
        print_error "Update failed. Check logs with: docker compose logs"
        exit 1
    fi
}

# Stop service
stop() {
    print_info "Stopping service..."
    docker compose down
    print_info "Service stopped"
}

# Restart service
restart() {
    print_info "Restarting service..."
    docker compose restart
    print_info "Service restarted"
}

# Show logs
logs() {
    docker compose logs -f --tail=100
}

# Show status
status() {
    echo ""
    print_info "Container status:"
    docker compose ps
    echo ""
    print_info "Recent logs:"
    docker compose logs --tail=20
}

# Backup database
backup() {
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).db"
    if [ -f data/ccusage.db ]; then
        cp data/ccusage.db "data/$BACKUP_FILE"
        print_info "Database backed up to: data/$BACKUP_FILE"
    else
        print_warn "No database file found to backup"
    fi
}

# Reset database (stop service, backup and remove db, restart)
reset_db() {
    print_warn "This will STOP the service, backup the current database, DELETE it, and restart."
    print_warn "All usage data will be lost. Agents will need to re-report their data."
    echo ""
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Reset cancelled"
        return
    fi

    # Stop service first
    print_info "Stopping service..."
    docker compose down

    # Backup existing database
    if [ -f data/ccusage.db ]; then
        BACKUP_FILE="backup_before_reset_$(date +%Y%m%d_%H%M%S).db"
        cp data/ccusage.db "data/$BACKUP_FILE"
        print_info "Database backed up to: data/$BACKUP_FILE"

        # Remove database files
        rm -f data/ccusage.db data/ccusage.db-wal data/ccusage.db-shm
        print_info "Database deleted"
    else
        print_warn "No database file found"
    fi

    # Restart service (will auto-create a fresh database)
    print_info "Starting service with fresh database..."
    docker compose up -d

    sleep 5

    if docker compose ps | grep -q "Up"; then
        print_info "Reset complete! Service is running with a fresh database."
        print_warn "Remember to run './setup.sh reset' on each agent to re-report all data."
    else
        print_error "Service failed to start. Check logs with: docker compose logs"
        exit 1
    fi
}

# Clean up (remove containers and images)
clean() {
    print_warn "This will remove containers and images. Data in ./data will be preserved."
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose down --rmi all
        print_info "Cleanup complete"
    else
        print_info "Cleanup cancelled"
    fi
}

# Show help
show_help() {
    echo "CCUsage Web Deployment Script"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  deploy   - First-time deployment (init + pull + start)"
    echo "  update   - Pull latest image and restart"
    echo "  start    - Start the service"
    echo "  stop     - Stop the service"
    echo "  restart  - Restart the service"
    echo "  status   - Show service status and recent logs"
    echo "  logs     - Follow container logs"
    echo "  backup   - Backup the database"
    echo "  reset-db - Backup and delete database, restart with fresh db"
    echo "  clean    - Remove containers and images"
    echo "  help     - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy    # First-time setup"
    echo "  $0 update    # Update to latest version"
    echo "  $0 reset-db  # Clear all data and start fresh"
    echo "  $0 logs      # View logs"
}

# Main
case "${1:-}" in
    deploy)
        deploy
        ;;
    update)
        update
        ;;
    start)
        docker compose up -d
        print_info "Service started"
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    backup)
        backup
        ;;
    reset-db)
        reset_db
        ;;
    clean)
        clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        if [ -z "${1:-}" ]; then
            show_help
        else
            print_error "Unknown command: $1"
            echo ""
            show_help
            exit 1
        fi
        ;;
esac
