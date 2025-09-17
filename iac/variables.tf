variable "name_prefix" {
  description = "Prefix used for resource names"
  type        = string
  default     = "liard-hackai"
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "northcentralus"
}

variable "allowed_source_ip" {
  description = "CIDR of source IP allowed to access SSH/HTTP/HTTPS (use your IP for better security)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "admin_username" {
  description = "Admin username for the VM"
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key" {
  description = "SSH public key content to access the VM (overrides ssh_public_key_path if set)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key file if ssh_public_key is empty"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "vm_size" {
  description = "Azure VM size"
  type        = string
  default     = "Standard_B2s"
}

variable "disk_size_gb" {
  description = "OS disk size in GB"
  type        = number
  default     = 30
}
