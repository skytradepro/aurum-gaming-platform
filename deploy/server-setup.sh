#!/bin/bash
# Aurum — first-time setup on Ubuntu VPS (13.140.189.223 only). Run as root.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
docker --version
docker compose version
mkdir -p /opt/aurum-gaming-platform
echo "Docker ready. Upload project to /opt/aurum-gaming-platform then: cd /opt/aurum-gaming-platform/deploy && docker compose up -d --build"
