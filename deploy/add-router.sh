#!/usr/bin/env bash
# Adds the hEX as a WireGuard peer. Usage: bash deploy/add-router.sh <hEX-public-key> [tunnel-ip, default 10.88.0.2]
set -euo pipefail
PUB="${1:?usage: add-router.sh <hEX-public-key> [10.88.0.2]}"
IP="${2:-10.88.0.2}"
cat >> /etc/wireguard/wg0.conf <<CONF

[Peer]
PublicKey = ${PUB}
AllowedIPs = ${IP}/32
PersistentKeepalive = 25
CONF
wg syncconf wg0 <(wg-quick strip wg0)
echo "Added router ${IP}. In TellNet use host:  http://${IP}"
