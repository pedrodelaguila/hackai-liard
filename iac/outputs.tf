output "public_ip" {
  description = "Public IP of the VM"
  value       = azurerm_public_ip.pip.ip_address
}

output "ssh_command" {
  description = "Convenient SSH command"
  value       = "ssh ${var.admin_username}@${azurerm_public_ip.pip.ip_address}"
}

output "http_url" {
  description = "HTTP URL (if containers expose port 80)"
  value       = "http://${azurerm_public_ip.pip.ip_address}"
}

output "https_url" {
  description = "HTTPS URL (if containers expose port 443)"
  value       = "https://${azurerm_public_ip.pip.ip_address}"
}
