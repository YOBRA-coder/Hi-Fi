-- Remember the bonus minutes that were folded into a payment's package, so a retried or
-- re-run activation of the same payment still creates the package with them (the one-time
-- claim used to hand them out only on the very first call, and lose them if that call
-- ended before the package row existed).
alter table payments add column if not exists referral_minutes_applied integer not null default 0;

-- Address of the router's own hotspot login page (e.g. http://hotspot.wifi/login). The installed
-- app (PWA) is not redirected there by the captive portal, so it sends the customer through it
-- to let the router tell us this phone's MAC and IP.
alter table settings add column if not exists router_login_url text;
