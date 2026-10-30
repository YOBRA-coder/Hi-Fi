#!/usr/bin/env bash
# Fix a VPS whose clock is wrong / not synchronising ("System clock synchronized: no").
#   sudo bash deploy/fix-clock.sh
# Safe to re-run. Do this AFTER the new app build is running (docker compose up -d --build):
# the app notices the clock being corrected and shifts running packages by the same amount,
# so customers keep the exact time they paid for.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash deploy/fix-clock.sh"; exit 1; }

echo "Before: $(date -u '+%F %T') UTC"
export DEBIAN_FRONTEND=noninteractive

# 1. One time daemon only. systemd-timesyncd is what reported "active but not synchronized".
systemctl disable --now systemd-timesyncd 2>/dev/null || true
apt-get update -y >/dev/null
apt-get install -y chrony curl >/dev/null

# 2. chrony: several sources, allowed to STEP the clock whenever it is >1s off (not just at boot),
#    keeps the hardware clock (RTC) in step too so a reboot does not bring the old time back.
CONF=/etc/chrony/chrony.conf
[ -f /etc/chrony/chrony.conf ] || CONF=/etc/chrony.conf
cat > "$CONF" <<'CONF'
pool 2.pool.ntp.org iburst maxsources 4
server time.cloudflare.com iburst
server time.google.com iburst
server ke.pool.ntp.org iburst
makestep 1.0 -1
rtcsync
driftfile /var/lib/chrony/chrony.drift
CONF
systemctl enable chrony >/dev/null 2>&1 || true
systemctl restart chrony 2>/dev/null || systemctl restart chronyd

# 3. Wait for NTP; if UDP 123 is blocked by the host, fall back to HTTPS time.
for i in $(seq 1 20); do
  chronyc waitsync 1 0.5 >/dev/null 2>&1 && break
  chronyc makestep >/dev/null 2>&1 || true
  sleep 2
done
if ! chronyc tracking 2>/dev/null | grep -q "Leap status.*Normal"; then
  echo "NTP (UDP 123) is not reachable from this VPS, setting the clock from HTTPS instead."
  HDR=$(curl -fsSI --max-time 8 https://www.google.com | tr -d '\r' | awk -F': ' 'tolower($1)=="date"{print $2}')
  [ -n "$HDR" ] && date -u -s "$HDR"
  # keep it right: re-sync from HTTPS every 10 minutes
  cat > /usr/local/bin/https-time-sync <<'SH'
#!/bin/sh
H=$(curl -fsSI --max-time 8 https://www.google.com | tr -d '\r' | awk -F': ' 'tolower($1)=="date"{print $2}')
[ -n "$H" ] || exit 0
N=$(date -u -d "$H" +%s); L=$(date -u +%s); D=$((N-L)); [ "${D#-}" -gt 2 ] && date -u -s "$H"
SH
  chmod +x /usr/local/bin/https-time-sync
  echo '*/10 * * * * root /usr/local/bin/https-time-sync' > /etc/cron.d/https-time-sync
fi

timedatectl set-timezone Etc/UTC 2>/dev/null || true   # keep the server on UTC; the app formats Nairobi time itself
hwclock --systohc 2>/dev/null || true

echo
echo "After : $(date -u '+%F %T') UTC   (Nairobi: $(TZ=Africa/Nairobi date '+%F %T'))"
timedatectl | grep -E "synchronized|NTP|RTC time" || true
chronyc tracking 2>/dev/null | grep -E "System time|Leap status" || true
echo
echo "Compare with the MikroTik:  /system clock print   (should match the Nairobi time above)"
