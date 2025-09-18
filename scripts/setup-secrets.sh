#!/bin/bash

# Script to help set up GitHub Secrets for the deployment pipeline
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

show_help() {
    cat << EOF
GitHub Secrets Setup Helper

This script helps you identify and set up the required GitHub secrets for your deployment pipeline.

Required secrets:
  - VM_HOST: Public IP address of your Azure VM
  - VM_USERNAME: SSH username for your Azure VM (usually 'azureuser')
  - VM_SSH_KEY: Private SSH key content for VM access

Note:
- GITHUB_TOKEN is automatically provided by GitHub Actions
- ANTHROPIC_API_KEY should be set directly on the VM in ~/deployment/.env

Usage:
  $0 [options]

Options:
  --terraform-outputs    Show how to get values from Terraform outputs
  --check-vm            Test SSH connection to VM
  --help                Show this help message

EOF
}

show_terraform_outputs() {
    log_step "Getting values from Terraform outputs:"
    echo
    echo "1. Navigate to your iac/ directory:"
    echo "   cd iac/"
    echo
    echo "2. Get VM connection details:"
    echo "   terraform output public_ip"
    echo "   terraform output ssh_command"
    echo
    echo "3. Your GitHub secrets should be:"
    echo "   VM_HOST: (from terraform output public_ip)"
    echo "   VM_USERNAME: azureuser (or your configured admin username)"
    echo "   VM_SSH_KEY: (content of your private SSH key file)"
    echo
}

check_terraform() {
    if [[ ! -d "iac" ]]; then
        log_error "iac/ directory not found. Run this script from the repository root."
        exit 1
    fi

    if [[ ! -f "iac/main.tf" ]]; then
        log_error "iac/main.tf not found. Make sure Terraform is set up."
        exit 1
    fi

    log_info "Terraform configuration found"
}

check_vm_connection() {
    if [[ -z "${VM_HOST:-}" ]] || [[ -z "${VM_USERNAME:-}" ]]; then
        log_error "VM_HOST and VM_USERNAME environment variables must be set to test connection"
        exit 1
    fi

    log_info "Testing SSH connection to $VM_USERNAME@$VM_HOST..."

    if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$VM_USERNAME@$VM_HOST" "echo 'Connection successful'" 2>/dev/null; then
        log_info "SSH connection successful!"

        # Test Docker
        if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$VM_USERNAME@$VM_HOST" "docker --version" 2>/dev/null; then
            log_info "Docker is available on the VM"
        else
            log_warn "Docker not available or user not in docker group"
        fi

        # Test Docker Compose
        if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$VM_USERNAME@$VM_HOST" "docker-compose --version || docker compose version" 2>/dev/null; then
            log_info "Docker Compose is available on the VM"
        else
            log_warn "Docker Compose not available"
        fi
    else
        log_error "SSH connection failed. Check VM_HOST, VM_USERNAME, and SSH key setup"
        exit 1
    fi
}

show_github_secrets_setup() {
    log_step "Setting up GitHub Secrets:"
    echo
    echo "1. Go to your GitHub repository"
    echo "2. Navigate to Settings > Secrets and variables > Actions"
    echo "3. Click 'New repository secret' and add each of these:"
    echo
    echo "   Name: VM_HOST"
    echo "   Value: [from terraform output public_ip]"
    echo
    echo "   Name: VM_USERNAME"
    echo "   Value: azureuser"
    echo
    echo "   Name: VM_SSH_KEY"
    echo "   Value: [content of your private SSH key file, typically ~/.ssh/id_rsa]"
    echo
}

main() {
    case "${1:-}" in
        --terraform-outputs)
            check_terraform
            show_terraform_outputs
            ;;
        --check-vm)
            check_vm_connection
            ;;
        --help)
            show_help
            ;;
        "")
            log_info "GitHub Secrets Setup Helper"
            echo
            check_terraform
            show_terraform_outputs
            echo
            show_github_secrets_setup
            echo
            log_info "Run '$0 --help' for more options"
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"