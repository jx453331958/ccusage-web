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

# Load .env file variables
load_env() {
    if [ -f .env ]; then
        set -a
        source .env
        set +a
    fi
}

# Get host IP address
get_host_ip() {
    # Try common methods to get the primary IP
    local ip=""
    if command -v hostname &> /dev/null; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$ip" ] && command -v ip &> /dev/null; then
        ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
    fi
    if [ -z "$ip" ]; then
        ip=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}')
    fi
    echo "${ip:-localhost}"
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
    load_env
    init_data_dir

    print_info "Pulling latest image..."
    docker compose pull

    print_info "Starting containers..."
    docker compose up -d

    print_info "Waiting for service to be ready..."
    sleep 5

    # Check if service is running
    if docker compose ps | grep -q "Up"; then
        local host_ip=$(get_host_ip)
        local port="${PORT:-3000}"
        print_info "Deployment successful!"
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  CCUsage Web is now running!${NC}"
        echo -e "${GREEN}  Access: http://${host_ip}:${port}${NC}"
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
        if cp data/ccusage.db "data/$BACKUP_FILE" 2>/dev/null; then
            print_info "Database backed up to: data/$BACKUP_FILE"
        elif sudo cp data/ccusage.db "data/$BACKUP_FILE"; then
            print_info "Database backed up to: data/$BACKUP_FILE (via sudo)"
        else
            print_error "Failed to backup database (permission denied)"
            exit 1
        fi
    else
        print_warn "No database file found to backup"
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
    echo "  clean    - Remove containers and images"
    echo "  help     - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy    # First-time setup"
    echo "  $0 update    # Update to latest version"
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
