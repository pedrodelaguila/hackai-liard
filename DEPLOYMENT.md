# Deployment Guide

Complete CD pipeline for deploying Docker containers to Azure VM.

## Architecture

- **Backend**: Node.js/TypeScript API (port 3001)
- **DWG Parser**: Existing service (port 3000)
- **Nginx**: Reverse proxy and API gateway (port 80/443)
- **GitHub Container Registry**: Docker image storage
- **Azure VM**: Ubuntu 22.04 with Docker pre-installed

## Setup Instructions

### 1. Deploy Infrastructure

```bash
cd iac/
terraform init
terraform plan
terraform apply
```

### 2. Configure GitHub Secrets

Run the helper script to get the required values:

```bash
./scripts/setup-secrets.sh --terraform-outputs
```

Add these secrets to your GitHub repository (Settings > Secrets and variables > Actions):

- `VM_HOST`: From `terraform output public_ip`
- `VM_USERNAME`: `azureuser` (or your configured admin username)
- `VM_SSH_KEY`: Content of your private SSH key (typically `~/.ssh/id_rsa`)

Note: `GITHUB_TOKEN` is automatically provided by GitHub Actions for GHCR access.

### 3. Set API Key on VM

After the first deployment, SSH to your VM and set the Anthropic API key:

```bash
ssh azureuser@<vm-ip>
cd ~/deployment

# Edit the .env file to add your API key
nano .env

# Add this line (replace with your actual key):
# ANTHROPIC_API_KEY=your_actual_api_key_here

# Restart services to pick up the new environment variable
docker-compose restart backend
```

### 4. Test VM Connection

```bash
VM_HOST=<your-vm-ip> VM_USERNAME=azureuser ./scripts/setup-secrets.sh --check-vm
```

### 5. Deploy

Push to the `main` branch to trigger automatic deployment:

```bash
git add .
git commit -m "Add CD pipeline configuration"
git push origin main
```

## Manual Deployment

You can also deploy manually to the VM:

```bash
# Copy files to VM
scp docker-compose.prod.yml nginx.conf azureuser@<vm-ip>:~/deployment/

# SSH to VM
ssh azureuser@<vm-ip>

# Set environment variables (ANTHROPIC_API_KEY should be in ~/deployment/.env)
export GITHUB_TOKEN="your-github-token"
export GITHUB_ACTOR="your-github-username"
export GITHUB_REPOSITORY="your-username/repo-name"

# Run deployment script
./deployment/deploy.sh
```

## SSL Certificate Setup (Required for Production)

After deployment, set up SSL certificates for HTTPS:

```bash
# SSH to your VM
ssh azureuser@<vm-ip>

# Navigate to deployment directory
cd ~/deployment

# Run SSL setup (replace with your domain)
./scripts/certbot-setup.sh --domain yourdomain.com --email admin@yourdomain.com
```

This will:
- Generate Let's Encrypt SSL certificates
- Configure automatic renewal
- Update nginx with your domain name
- Restart services with HTTPS enabled

## Service Access

### After SSL Setup (Recommended)
- **API Gateway**: `https://yourdomain.com/`
- **Backend API**: `https://yourdomain.com/api/`
- **DWG Parser**: `https://yourdomain.com/dwg/`
- **Health Check**: `https://yourdomain.com/health`

### Without SSL (Development Only)
- **API Gateway**: `http://<vm-ip>/`
- **Backend API**: `http://<vm-ip>/api/`
- **DWG Parser**: `http://<vm-ip>/dwg/`
- **Direct Backend**: `http://<vm-ip>:3001/`
- **Direct DWG Parser**: `http://<vm-ip>:3000/`

## Vercel Frontend Integration

Your backend is configured with CORS to accept requests from Vercel deployments. Set these environment variables in your Vercel project:

```bash
# In Vercel Dashboard > Project > Settings > Environment Variables
NEXT_PUBLIC_API_URL=https://yourdomain.com
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com/api
```

### API Endpoints for Frontend

Your Vercel frontend can call these endpoints:

```typescript
// Chat API (with streaming support)
POST https://yourdomain.com/api/chat/stream

// Conversation history
GET https://yourdomain.com/api/conversations/{sessionId}/history

// Conversation statistics
GET https://yourdomain.com/api/conversations/stats

// Backend health check
GET https://yourdomain.com/api/health
```

### CORS Configuration

The backend is configured to accept requests from:
- `http://localhost:3000` (development)
- `https://*.vercel.app` (Vercel deployments)
- `https://*.vercel.com` (alternative Vercel domain)
- Custom domain set via `FRONTEND_URL` environment variable

## Pipeline Flow

```
Code Push → GitHub Actions → Build Images → Push to GHCR → SSH to VM → Deploy with Docker Compose
```

### Build Stage
1. Checkout code
2. Build Docker images for backend and dwg-parser
3. Push images to GitHub Container Registry

### Deploy Stage (main branch only)
1. SSH to Azure VM
2. Login to GHCR
3. Pull latest images
4. Update and restart containers with docker-compose
5. Health check

## Security Features

- **Secrets Management**: API keys never stored in code
- **SSH Key Authentication**: Secure VM access
- **Private Container Registry**: Images stored securely in GHCR
- **Network Security**: NSG rules limit access
- **Rate Limiting**: Nginx configured with request limits
- **Health Checks**: Automatic container health monitoring

## Monitoring

Check deployment status:

```bash
# View service status
docker-compose ps

# View logs
docker-compose logs -f

# Check health
curl http://localhost/health
```

## Troubleshooting

### Build Issues
- Check GitHub Actions logs for build errors
- Verify Dockerfile syntax
- Ensure all dependencies are available

### Deployment Issues
- Verify GitHub secrets are correctly set
- Check VM SSH access
- Ensure Docker is running on VM
- Verify GHCR access (check repository permissions)

### Service Issues
- Check docker-compose logs
- Verify environment variables
- Test individual service health endpoints
- Check nginx configuration

### Common Commands

```bash
# Restart services
docker-compose restart

# Update images
docker-compose pull && docker-compose up -d

# View real-time logs
docker-compose logs -f backend dwg-parser

# Clean up old images
docker image prune -f
```