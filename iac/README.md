# Azure single VM for Docker

This Terraform config provisions a single Ubuntu VM on Azure with Docker preinstalled via cloud-init. It opens SSH (22), HTTP (80), and HTTPS (443) from a configurable source CIDR.

## Prerequisites
- Terraform >= 1.3
- Azure subscription and authenticated CLI (`az login`) or environment credentials
- An RSA SSH public key file (default `~/.ssh/id_rsa.pub`) - **Note: Azure only supports RSA keys, not Ed25519**
- Appropriate Azure permissions (if you encounter resource provider registration errors, the configuration will skip automatic registration)

## SSH Key Setup

If you don't have an RSA SSH key pair, generate one:

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" -C "azure-vm-key"
```

## Quick start

1. Initialize Terraform
2. Review/change variables in `variables.tf` or use a `terraform.tfvars`
3. Apply

```
terraform -chdir=iac init
terraform -chdir=iac apply \
  -var "name_prefix=hackai-liard" \
  -var "location=northcentralus" \
  -var "allowed_source_ip=$(curl -s https://checkip.amazonaws.com)/32"
```

Outputs will include the public IP and an SSH command, e.g.

```
ssh azureuser@<public-ip>
```

## Variables
- `name_prefix` (string): prefix for resource names, default `hackai-liard`
- `location` (string): Azure region, default `northcentralus`
- `allowed_source_ip` (string): CIDR allowed for inbound to 22/80/443, default `0.0.0.0/0`
- `admin_username` (string): VM admin user, default `azureuser`
- `ssh_public_key` (string): public key content; if empty, uses `ssh_public_key_path`
- `ssh_public_key_path` (string): path to pubkey file, default `~/.ssh/id_rsa.pub`
- `vm_size` (string): VM size, default `Standard_B2s`
- `disk_size_gb` (number): OS disk size, default `30`

## Troubleshooting

### Region Policy Restrictions

If you encounter a "RequestDisallowedByAzure" error, your subscription has policies restricting deployment regions. To find allowed regions:

```bash
az account list-locations --output table
```

Then update the location variable:

```bash
terraform apply -var "location=<allowed-region>"
```

Allowed regions for this subscription: `canadacentral`, `chilecentral`, `southcentralus`, `mexicocentral`, `northcentralus`

## Notes
- Docker and the compose plugin are installed. Add your own compose files and services after SSHing into the VM.
- NSG allows ports 22/80/443. Adjust as needed.
- This uses a new VNet and subnet per deployment for simplicity.

## Destroy

```
terraform -chdir=iac destroy
```