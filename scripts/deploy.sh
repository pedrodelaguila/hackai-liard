#!/bin/bash

# Production deployment script for Azure VM (For manual execution execution)
set -euo pipefail

# Configuration
REGISTRY="ghcr.io"
IMAGE_NAME="${GITHUB_REPOSITORY:-nicolasberretta/hackai-liard}"
DEPLOYMENT_DIR="~/deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required environment variables are set
check_env_vars() {
    local required_vars=("GITHUB_TOKEN" "GITHUB_ACTOR")

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done

    # Check if ANTHROPIC_API_KEY is set in .env file
    if [[ -f "$DEPLOYMENT_DIR/.env" ]] && grep -q "ANTHROPIC_API_KEY=" "$DEPLOYMENT_DIR/.env"; then
        log_info "ANTHROPIC_API_KEY found in .env file"
    else
        log_warn "ANTHROPIC_API_KEY not found in $DEPLOYMENT_DIR/.env - please set it manually"
    fi
}

# Login to GitHub Container Registry
login_ghcr() {
    log_info "Logging in to GitHub Container Registry..."
    echo "$GITHUB_TOKEN" | docker login "$REGISTRY" -u "$GITHUB_ACTOR" --password-stdin
}

# Pull latest images
pull_images() {
    log_info "Pulling latest Docker images..."
    docker pull "${REGISTRY}/${IMAGE_NAME}/backend:latest" || {
        log_error "Failed to pull backend image"
        exit 1
    }

    docker pull "${REGISTRY}/${IMAGE_NAME}/dwg-parser:latest" || {
        log_error "Failed to pull dwg-parser image"
        exit 1
    }
}

# Create deployment directory and files
setup_deployment() {
    log_info "Setting up deployment directory..."
    mkdir -p "$DEPLOYMENT_DIR"
    cd "$DEPLOYMENT_DIR"

    # Create environment file if it doesn't exist
    if [[ ! -f .env ]]; then
        cat > .env << EOF
NODE_ENV=production
# Set your ANTHROPIC_API_KEY=your_key_here
EOF
        chmod 600 .env
        log_warn "Created .env file. Please add your ANTHROPIC_API_KEY to $DEPLOYMENT_DIR/.env"
    fi
}

# Deploy services
deploy_services() {
    log_info "Deploying services..."

    # Stop existing services
    if docker-compose ps | grep -q "Up"; then
        log_info "Stopping existing services..."
        docker-compose down
    fi

    # Start new services
    log_info "Starting services with docker-compose..."
    docker-compose up -d

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 30

    # Check service health
    if docker-compose ps | grep -q "unhealthy\|Exit"; then
        log_error "Some services are unhealthy. Check docker-compose logs"
        docker-compose logs --tail=20
        exit 1
    fi

    log_info "Services deployed successfully!"
}

# Cleanup old images and containers
cleanup() {
    log_info "Cleaning up old Docker images..."
    docker image prune -f || log_warn "Failed to prune images"
    docker container prune -f || log_warn "Failed to prune containers"
}

# Health check
health_check() {
    log_info "Performing health check..."

    # Check backend health
    if curl -f http://localhost:3001/health &>/dev/null; then
        log_info "Backend service is healthy"
    else
        log_warn "Backend health check failed"
    fi

    # Check dwg-parser health
    if curl -f http://localhost:3000/health &>/dev/null; then
        log_info "DWG Parser service is healthy"
    else
        log_warn "DWG Parser health check failed"
    fi

    # Check nginx gateway
    if curl -f http://localhost/ &>/dev/null; then
        log_info "Nginx gateway is healthy"
    else
        log_warn "Nginx gateway health check failed"
    fi
}

# Main deployment function
main() {
    log_info "Starting deployment process..."

    check_env_vars
    login_ghcr
    pull_images
    setup_deployment
    deploy_services
    cleanup
    health_check

    log_info "Deployment completed successfully!"
    log_info "Services are available at:"
    log_info "  - Backend API: http://$(hostname -I | awk '{print $1}'):3001"
    log_info "  - DWG Parser: http://$(hostname -I | awk '{print $1}'):3000"
    log_info "  - Gateway: http://$(hostname -I | awk '{print $1}')"
}

# Run main function
main "$@"