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

output "dns_name_servers" {
  value = var.domain_name != "" ? azurerm_dns_zone.main[0].name_servers : []
  description = "Name servers to configure at your domain registrar"
}

output "domain_name" {
  value = var.domain_name != "" ? var.domain_name : "Use IP: ${azurerm_public_ip.pip.ip_address}"
  description = "Domain name or IP to access the application"
}

output "domain_urls" {
  value = var.domain_name != "" ? {
    http = "http://${var.domain_name}"
    https = "https://${var.domain_name}"
    www_http = "http://www.${var.domain_name}"
    www_https = "https://www.${var.domain_name}"
  } : {}
  description = "Domain-based URLs (when domain is configured)"
}

