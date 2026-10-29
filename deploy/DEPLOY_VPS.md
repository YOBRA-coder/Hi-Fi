# Moving TellNet from Vercel to your own VPS (InterServer)

Why: the app needs to reach the hEX. Behind Airtel 5G the hEX has no public address and Vercel can't join a VPN.
On your VPS the app sits next to a WireGuard tunnel, so it talks to the router privately at `10.88.0.2`.

```
phones ─ AP ─ hEX ──(WireGuard, outgoing from the shop)──► VPS: TellNet + Postgres + Caddy(HTTPS)
```

## 0. What to buy / prepare
- InterServer VPS: Ubuntu 22.04 or 24.04, 2 GB RAM is enough. Note its public IP.
- A domain or subdomain (e.g. `hifi.yourdomain.com`) with an **A record → VPS IP**.
- Your M-Pesa callback URLs will change to this domain (step 6).

## 1. Prepare the server (once)
```
ssh root@VPS_IP
apt-get install -y git unzip
# upload and unzip the project, e.g. to /opt/tellnet
cd /opt/tellnet/TellNet-main
bash deploy/setup-vps.sh        # installs Docker + WireGuard + firewall, prints the VPS WireGuard key
```

## 2. Configure
```
cd deploy
cp .env.example .env
# edit .env: DOMAIN=your domain; fill DB_PASSWORD, APP_SECRET, CRON_SECRET (use: openssl rand -hex 32)
```

## 3. Move your data from Vercel/Neon (skip for a fresh start)
On any machine with Postgres tools, using your old `DATABASE_URL`:
```
pg_dump --no-owner --no-acl "OLD_DATABASE_URL" > tellnet.sql
```
Start only the database, load it, then start everything:
```
docker compose up -d db
cat tellnet.sql | docker compose exec -T db psql -U tellnet tellnet
```
(Already-applied migrations are remembered, so the app will not redo them.)

## 4. Start TellNet
```
docker compose up -d --build
docker compose logs -f app      # wait for "Listening", Ctrl+C to leave
```
Open `https://your-domain/login`. Caddy gets the HTTPS certificate by itself (DNS must already point at the VPS).

## 5. Connect the hEX
1. On the hEX terminal, run the first lines of `deploy/mikrotik-wireguard.rsc` (replace `VPS_PUBLIC_KEY` and `VPS_PUBLIC_IP`).
2. Copy the hEX's `wg-tellnet` public key and, on the VPS: `bash deploy/add-router.sh <that key>`
3. Check from the VPS: `ping 10.88.0.2`. If it replies, the tunnel works.
4. Run the rest of the `.rsc` (REST service limited to the VPS, API user — change the password).
5. In TellNet → Network, edit the router: host `http://10.88.0.2`, user `tellnet`, the password you set. Press **Test REST** — it should go online.
6. Then set up the hotspot on the hEX LAN bridge (`/ip hotspot setup`) so customers get the login page.

## 6. Update outside services
- **M-Pesa (Daraja):** callback URLs now `https://your-domain/api/mpesa/callback` (and the shop/other callbacks you use). Update them in your Daraja app and any saved settings in TellNet.
- Any DNS name or QR codes that pointed to the Vercel address.
- Turn off the Vercel project after you've checked a real payment.

## Daily care
- Update: upload the new zip, then `docker compose up -d --build` in `deploy/`.
- Backup (run daily from cron): `docker compose exec -T db pg_dump -U tellnet tellnet | gzip > /root/backup-$(date +%F).sql.gz`
- Logs: `docker compose logs -f app`.
- The tick (expiry, router checks every minute) runs in the `tick` container automatically.

## Notes
- The tunnel is outgoing from the shop, so it works behind Airtel/CGNAT. If the 5G line drops, it reconnects by itself.
- The REST service on the hEX only accepts connections from the VPS tunnel address.
