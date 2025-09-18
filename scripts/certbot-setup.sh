#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DOMAIN=""
EMAIL=""

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show help
show_help() {
    echo "Usage: $0 --domain <domain> --email <email>"
    echo ""
    echo "Setup SSL certificate using Certbot/Let's Encrypt for nginx"
    echo ""
    echo "Required Options:"
    echo "  --domain DOMAIN     Domain name (e.g., example.com)"
    echo "  --email EMAIL       Email for Let's Encrypt registration"
    echo ""
    echo "Optional:"
    echo "  --help              Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --domain myapp.com --email admin@myapp.com"
}

# Function to check if certbot is installed
check_certbot() {
    if ! command -v certbot &> /dev/null; then
        print_error "Certbot is not installed. Please install it first:"
        print_status "sudo apt update && sudo apt install -y certbot python3-certbot-nginx"
        exit 1
    fi
    print_status "Certbot is installed"
}

# Function to stop nginx temporarily
stop_nginx() {
    print_status "Stopping nginx temporarily for certificate generation..."
    sudo systemctl stop nginx || true
    sudo docker-compose -f /home/azureuser/docker-compose.prod.yml stop nginx 2>/dev/null || true
}

# Function to generate SSL certificate
generate_certificate() {
    print_status "Generating SSL certificate for domain: $DOMAIN"

    # Use standalone mode since nginx is stopped
    if sudo certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "$DOMAIN,www.$DOMAIN"; then

        print_status "Certificate generated successfully!"
    else
        print_error "Failed to generate certificate"
        return 1
    fi
}

# Function to link certificates to expected locations
link_certificates() {
    print_status "Creating certificate symlinks..."

    sudo mkdir -p /etc/ssl/certs /etc/ssl/private

    # Remove existing links/files if they exist
    sudo rm -f /etc/ssl/certs/domain.crt /etc/ssl/private/domain.key

    # Create symbolic links
    sudo ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /etc/ssl/certs/domain.crt
    sudo ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /etc/ssl/private/domain.key

    # Set proper permissions
    sudo chmod 644 /etc/ssl/certs/domain.crt
    sudo chmod 600 /etc/ssl/private/domain.key

    print_status "Certificate links created successfully"
}

# Function to update nginx configuration
update_nginx_config() {
    print_status "Updating nginx configuration with domain name..."

    # Update server_name in nginx.conf
    if sudo sed -i "s/server_name _;/server_name $DOMAIN www.$DOMAIN;/g" /home/azureuser/nginx.conf 2>/dev/null; then
        print_status "Nginx configuration updated"
    else
        print_warning "Could not update nginx.conf automatically. Please update server_name manually."
    fi
}

# Function to test nginx configuration
test_nginx_config() {
    print_status "Testing nginx configuration..."

    if sudo nginx -t 2>/dev/null; then
        print_status "Nginx configuration is valid"
    else
        print_error "Nginx configuration test failed"
        print_warning "Please check your nginx configuration manually"
        return 1
    fi
}

# Function to setup automatic renewal
setup_auto_renewal() {
    print_status "Setting up automatic certificate renewal..."

    # Create renewal script
    sudo tee /usr/local/bin/certbot-renew.sh > /dev/null << EOF
#!/bin/bash
# Stop nginx containers
docker-compose -f /home/azureuser/docker-compose.prod.yml stop nginx

# Renew certificates
/usr/bin/certbot renew --quiet

# Restart nginx containers
docker-compose -f /home/azureuser/docker-compose.prod.yml start nginx

echo "Certificate renewal completed at \$(date)"
EOF

    sudo chmod +x /usr/local/bin/certbot-renew.sh

    # Remove any existing certbot renewal cron jobs
    (crontab -l 2>/dev/null | grep -v "certbot" | grep -v "certbot-renew") | crontab - 2>/dev/null || true

    # Add new cron job for renewal (runs twice daily as recommended by Let's Encrypt)
    (crontab -l 2>/dev/null; echo "0 */12 * * * /usr/local/bin/certbot-renew.sh >> /var/log/certbot-renewal.log 2>&1") | crontab -

    print_status "Auto-renewal setup completed (runs twice daily)"
}

# Function to start services
start_services() {
    print_status "Starting Docker services..."

    if docker-compose -f /home/azureuser/docker-compose.prod.yml up -d; then
        print_status "Docker services started successfully"
    else
        print_warning "Failed to start Docker services. Please start them manually."
    fi
}

# Function to verify SSL setup
verify_ssl() {
    print_status "Verifying SSL setup..."

    if sudo certbot certificates | grep -q "$DOMAIN"; then
        print_status "Certificate verification successful"

        print_status "Certificate details:"
        sudo certbot certificates

        print_status "Testing renewal process..."
        if sudo certbot renew --dry-run; then
            print_status "Renewal test successful"
        else
            print_warning "Renewal test failed"
        fi
    else
        print_error "Certificate verification failed"
        return 1
    fi
}

# Main execution
main() {
    print_status "Starting Certbot SSL setup for domain: $DOMAIN"

    check_certbot
    stop_nginx
    generate_certificate || exit 1
    link_certificates
    update_nginx_config
    test_nginx_config || exit 1
    setup_auto_renewal
    start_services

    print_status "Waiting for services to start..."
    sleep 10

    verify_ssl

    print_status ""
    print_status "🎉 SSL certificate setup completed successfully!"
    print_status "📋 Next steps:"
    print_status "   • Your site is now available at: https://$DOMAIN"
    print_status "   • Auto-renewal is configured to run twice daily"
    print_status "   • Check logs at: /var/log/certbot-renewal.log"
    print_status "   • Manual renewal test: sudo certbot renew --dry-run"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$DOMAIN" ]]; then
    print_error "Domain is required"
    show_help
    exit 1
fi

if [[ -z "$EMAIL" ]]; then
    print_error "Email is required"
    show_help
    exit 1
fi

# Run main function
main