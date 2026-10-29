#!/usr/bin/env bash
# Run once on a fresh Ubuntu/Debian VPS as root:  bash deploy/setup-vps.sh
# Installs Docker + WireGuard, opens the firewall, and creates the tunnel 10.88.0.1 (VPS) <-> 10.88.0.2 (hEX).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
apt-get update -y
apt-get install -y wireguard ufw curl ca-certificates
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# --- WireGuard server ---
umask 077
mkdir -p /etc/wireguard
[ -f /etc/wireguard/server.key ] || wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
SERVER_KEY=$(cat /etc/wireguard/server.key)
if [ ! -f /etc/wireguard/wg0.conf ]; then
cat > /etc/wireguard/wg0.conf <<CONF
[Interface]
Address = 10.88.0.1/24
ListenPort = 51820
PrivateKey = ${SERVER_KEY}

# The hEX is added by deploy/add-router.sh
CONF
fi
systemctl enable --now wg-quick@wg0

# --- Firewall: SSH, web, WireGuard only ---
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 51820/udp
ufw --force enable

echo
echo "VPS public IP : $(curl -s https://api.ipify.org || echo '<check your panel>')"
echo "WireGuard key : $(cat /etc/wireguard/server.pub)"
echo "Next: bash deploy/add-router.sh   (it asks for the hEX public key)"
