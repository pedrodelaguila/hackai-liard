#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

KEYVAULT_NAME=""
CERT_NAME="ssl-certificate"

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

# Function to check if running on Azure VM
check_azure_vm() {
    if curl -s -H "Metadata: true" "http://169.254.169.254/metadata/instance?api-version=2021-02-01" >/dev/null 2>&1; then
        print_status "Running on Azure VM"
        return 0
    else
        print_error "Not running on Azure VM or metadata service unavailable"
        return 1
    fi
}

# Function to install Azure CLI if not present
install_azure_cli() {
    if ! command -v az &> /dev/null; then
        print_status "Installing Azure CLI..."
        curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
    else
        print_status "Azure CLI already installed"
    fi
}

# Function to login with managed identity
azure_login() {
    print_status "Logging in with managed identity..."
    if az login --identity --only-show-errors; then
        print_status "Successfully logged in with managed identity"
    else
        print_error "Failed to login with managed identity"
        return 1
    fi
}

# Function to get Key Vault name from resource group
get_keyvault_name() {
    local resource_group
    resource_group=$(curl -s -H "Metadata: true" "http://169.254.169.254/metadata/instance/compute/resourceGroupName?api-version=2021-02-01&format=text")

    print_status "Looking for Key Vault in resource group: $resource_group"

    KEYVAULT_NAME=$(az keyvault list --resource-group "$resource_group" --query "[?contains(name, 'ssl')].name | [0]" -o tsv)

    if [[ -z "$KEYVAULT_NAME" ]]; then
        print_error "No SSL Key Vault found in resource group $resource_group"
        return 1
    fi

    print_status "Found Key Vault: $KEYVAULT_NAME"
}

# Function to retrieve certificate from Key Vault
retrieve_certificate() {
    print_status "Retrieving certificate '$CERT_NAME' from Key Vault '$KEYVAULT_NAME'"

    # Create SSL directories
    sudo mkdir -p /etc/ssl/certs /etc/ssl/private

    # Get certificate
    if az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "$CERT_NAME" --query "value" -o tsv | base64 -d > /tmp/cert.pfx 2>/dev/null; then
        print_status "Certificate retrieved successfully"

        # Extract certificate and private key from PFX
        print_status "Extracting certificate and private key..."

        # Extract certificate
        openssl pkcs12 -in /tmp/cert.pfx -clcerts -nokeys -out /tmp/domain.crt -passin pass: 2>/dev/null || {
            print_error "Failed to extract certificate"
            return 1
        }

        # Extract private key
        openssl pkcs12 -in /tmp/cert.pfx -nocerts -nodes -out /tmp/domain.key -passin pass: 2>/dev/null || {
            print_error "Failed to extract private key"
            return 1
        }

        # Move to final locations
        sudo mv /tmp/domain.crt /etc/ssl/certs/domain.crt
        sudo mv /tmp/domain.key /etc/ssl/private/domain.key

        # Set proper permissions
        sudo chmod 644 /etc/ssl/certs/domain.crt
        sudo chmod 600 /etc/ssl/private/domain.key
        sudo chown root:root /etc/ssl/certs/domain.crt /etc/ssl/private/domain.key

        # Clean up temp files
        rm -f /tmp/cert.pfx

        print_status "SSL certificate installed successfully"

        # Test nginx configuration
        if sudo nginx -t; then
            print_status "Nginx configuration is valid"
            sudo systemctl reload nginx
            print_status "Nginx reloaded successfully"
        else
            print_error "Nginx configuration test failed"
            return 1
        fi

    else
        print_error "Failed to retrieve certificate from Key Vault"
        print_warning "Make sure certificate '$CERT_NAME' exists in Key Vault '$KEYVAULT_NAME'"
        return 1
    fi
}

# Function to setup certificate auto-renewal
setup_auto_renewal() {
    print_status "Setting up certificate auto-renewal..."

    # Create renewal script
    sudo tee /usr/local/bin/renew-ssl-cert.sh > /dev/null << 'EOF'
#!/bin/bash
/home/azureuser/scripts/setup-ssl.sh
EOF

    sudo chmod +x /usr/local/bin/renew-ssl-cert.sh

    # Create cron job for weekly renewal check
    (crontab -l 2>/dev/null | grep -v "renew-ssl-cert"; echo "0 2 * * 0 /usr/local/bin/renew-ssl-cert.sh >> /var/log/ssl-renewal.log 2>&1") | crontab -

    print_status "Auto-renewal setup completed (runs weekly on Sundays at 2 AM)"
}

# Main execution
main() {
    print_status "Starting SSL certificate setup..."

    check_azure_vm || exit 1
    install_azure_cli
    azure_login || exit 1
    get_keyvault_name || exit 1
    retrieve_certificate || exit 1
    setup_auto_renewal

    print_status "SSL certificate setup completed successfully!"
    print_status "Your application is now accessible via HTTPS"
}

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Setup SSL certificate from Azure Key Vault for nginx"
    echo ""
    echo "Options:"
    echo "  --cert-name NAME    Certificate name in Key Vault (default: ssl-certificate)"
    echo "  --help              Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --cert-name my-domain-cert"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --cert-name)
            CERT_NAME="$2"
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

# Run main function
main