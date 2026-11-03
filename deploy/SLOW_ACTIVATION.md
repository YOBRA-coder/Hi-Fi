# "Paid, but internet takes a while": find where the time goes

Four clocks, one payment. Write down all four for one test payment:

| | Where to read it | Meaning |
|---|---|---|
| T0 | The M-Pesa confirmation SMS on the phone | Safaricom took the money |
| T1 | Admin → Network → Events: `PAYMENT … settled` | The app heard about it |
| T2 | Events: `ACTIVATED … Activation took X s (router: N calls, Y s)` | The router login was made |
| T3 | The phone actually loads a page | Internet usable |

- **T1 − T0 large** → Safaricom / callback / the portal poll. Not the router. Check Settings → M-Pesa callback URL is the public https URL, and that `curl -I https://<your-domain>/api/mpesa/callback` answers fast from outside.
- **T2 − T1 large** → the app talking to the router. The ACTIVATED line says how many calls and how long. Typical healthy: 6-8 calls, under 2 s. If it is 5 s or more, run the router checks below.
- **T3 − T2 large** (router shows the user logged in, phone still waits) → the phone or DNS, not the app. See "Phone side".

## Router checks (run from the VPS, then on the MikroTik)

1. Tunnel round trip: `ping -c 10 10.88.0.2`. Every router call costs several of these. 100 ms+ means 10 calls are already 3-4 s.
2. One REST call, split into parts (use your router user/pass; `-k` only if the router uses a self-signed certificate):
   `for i in 1 2 3; do curl -sk -u USER:PASS -o /dev/null -w "connect %{time_connect}  tls %{time_appconnect}  total %{time_total}\n" https://10.88.0.2/rest/system/resource; done`
   - `tls` much bigger than `connect` → the hEX is slow at TLS. Fix: use plain http inside the WireGuard tunnel (it is already encrypted): in Winbox/Terminal `/ip service set www disabled=no address=10.88.0.1/32` and set the router host in Network to `http://10.88.0.2`.
   - `total` over 0.3 s on a healthy tunnel → router CPU, next check.
3. Router CPU while a customer pays: `/system resource print` (cpu-load) and `/tool profile duration=10` right after pressing Pay. High `www-ssl`, `ssl` or `hotspot` rows mean the router is the bottleneck.
4. Router's own record of the login: `/ip hotspot active print` (the user should appear at T2, with the uptime counting from then) and `/log print where message~"logged in"` (enable first: `/system logging add topics=hotspot,info action=memory`). If the router logs `logged in` at T2, the app and router are fine.
5. A dynamic queue appears at login: `/queue simple print` should show `<hotspot-USER>` with the package speed as max-limit (this also confirms the real upload/download).

## Phone side (T3 − T2)

- Android/iOS only re-test the connection every few seconds after a captive login. Turning Wi-Fi off/on, or opening any `http://` page, makes it notice at once.
- Slow first pages usually mean DNS: `/ip dns print` should show `allow-remote-requests=yes` and a fast upstream (1.1.1.1 / 8.8.8.8); `/tool dns-lookup google.com` should answer instantly.
- Walled garden: payment and portal hosts must be reachable before login, nothing else.
