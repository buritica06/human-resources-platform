# Infraestructura como Código (Terraform) — Plantilla Base Enterprise
# Proveedor agnóstico con ejemplo parametrizado para despliegue en nube (PostgreSQL administrado + Storage cifrado + Contenedor).

terraform {
  required_version = ">= 1.6.0"
}

variable "environment" {
  description = "Entorno de despliegue (staging | production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "El entorno debe ser 'staging' o 'production'."
  }
}

variable "app_name" {
  description = "Nombre base de los recursos de la plataforma de Talento Humano"
  type        = string
  default     = "human-resources-platform"
}

variable "app_domain" {
  description = "Dominio HTTPS público de la aplicación (APP_URL)"
  type        = string
  default     = "th.empresa.example.com"
}

variable "db_instance_class" {
  description = "Tamaño de instancia PostgreSQL 17 administrada"
  type        = string
  default     = "db.t4g.micro"
}

variable "backup_retention_days" {
  description = "Días de retención de copias de seguridad cifradas de PostgreSQL"
  type        = number
  default     = 14
}

locals {
  common_tags = {
    Project     = var.app_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "Ley-1581-OWASP-ASVS-L1"
  }
}

output "deployment_summary" {
  description = "Resumen de parámetros configurados para el entorno objetivo"
  value = {
    app_name              = var.app_name
    environment           = var.environment
    app_url               = "https://${var.app_domain}"
    db_engine             = "postgresql-17"
    backup_retention_days = var.backup_retention_days
    tags                  = local.common_tags
  }
}
