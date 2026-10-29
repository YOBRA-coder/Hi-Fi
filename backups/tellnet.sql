--
-- PostgreSQL database dump
--

\restrict 5nsI6EquzTTRqpBHXrLjOvEnBi4cQI1TeadPo66Yj6ZocjAOTPt2eznLtNKSKpQ

-- Dumped from database version 18.6 (fd34222)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: access_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_points (
    id text NOT NULL,
    mikrotik_id text NOT NULL,
    name text NOT NULL,
    ip_address text,
    mac_address text,
    model text,
    port text,
    notes text,
    status text DEFAULT 'UNKNOWN'::text NOT NULL,
    latency_ms integer,
    clients integer,
    last_seen_at timestamp with time zone,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    label text
);


--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ap_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ap_usage (
    ap_key text NOT NULL,
    package_id text NOT NULL,
    customer_id text NOT NULL,
    samples integer DEFAULT 0 NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    event_type text NOT NULL,
    message text NOT NULL,
    performed_by text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: customer_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_notices (
    id text NOT NULL,
    customer_id text NOT NULL,
    kind text NOT NULL,
    message text NOT NULL,
    minutes integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone
);


--
-- Name: customer_package_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_package_devices (
    customer_package_id text NOT NULL,
    device_token text NOT NULL,
    bound_at timestamp with time zone DEFAULT now() NOT NULL,
    device_info text
);


--
-- Name: customer_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_packages (
    id text NOT NULL,
    customer_id text NOT NULL,
    package_id text NOT NULL,
    payment_id text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    expiry_time timestamp with time zone NOT NULL,
    speed_limit_kbps integer NOT NULL,
    data_limit_mb integer,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    activation_status text DEFAULT 'NOT_ACTIVATED'::text NOT NULL,
    mikrotik_username text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bound_device_token text,
    bound_mac text,
    bound_at timestamp with time zone,
    radius_password text,
    last_resumed_at timestamp with time zone
);


--
-- Name: customer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_sessions (
    device_token text NOT NULL,
    customer_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id text NOT NULL,
    phone text NOT NULL,
    device_token text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    site_id text,
    deleted_at timestamp with time zone,
    referral_code text,
    referred_by_customer_id text,
    loyalty_points integer DEFAULT 0 NOT NULL,
    referral_bonus_paid boolean DEFAULT false NOT NULL,
    bonus_minutes_balance integer DEFAULT 0 NOT NULL,
    pin_hash text,
    pin_salt text,
    registered_at timestamp with time zone,
    failed_pin_attempts integer DEFAULT 0 NOT NULL,
    pin_locked_until timestamp with time zone,
    reset_failed_attempts integer DEFAULT 0 NOT NULL,
    reset_locked_until timestamp with time zone
);


--
-- Name: hw_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hw_authorizations (
    id text NOT NULL,
    customer_package_id text,
    router_id text,
    vendor text NOT NULL,
    username text NOT NULL,
    client_mac text NOT NULL,
    mac_norm text NOT NULL,
    token text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    authorized_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    handoff_done boolean DEFAULT false NOT NULL,
    extra text
);


--
-- Name: hw_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hw_clients (
    id text NOT NULL,
    router_id text,
    vendor text NOT NULL,
    device_token text,
    client_mac text NOT NULL,
    mac_norm text NOT NULL,
    client_ip text,
    ap_mac text,
    ssid text,
    radio_id text,
    site_name text,
    extra text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: isps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.isps (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    interface_name text,
    status text DEFAULT 'ONLINE'::text NOT NULL,
    latency_ms integer,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    mikrotik_id text,
    total_kbps integer DEFAULT 30720 NOT NULL,
    per_user_max_kbps integer DEFAULT 5120 NOT NULL,
    max_users integer DEFAULT 25 NOT NULL,
    site_id text,
    auto_status boolean DEFAULT true NOT NULL,
    status_checked_at timestamp with time zone
);


--
-- Name: loyalty_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_ledger (
    id text NOT NULL,
    customer_id text NOT NULL,
    delta integer NOT NULL,
    reason text NOT NULL,
    payment_id text,
    package_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mikrotik_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikrotik_users (
    username text NOT NULL,
    password text NOT NULL,
    profile text,
    disabled boolean DEFAULT false NOT NULL,
    download_kbps integer,
    upload_kbps integer,
    session_timeout_seconds integer,
    customer_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mikrotiks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikrotiks (
    id text NOT NULL,
    name text NOT NULL,
    host text NOT NULL,
    api_user text NOT NULL,
    api_password text NOT NULL,
    hotspot_name text DEFAULT 'hotspot1'::text NOT NULL,
    ssl boolean DEFAULT false NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    status text DEFAULT 'UNKNOWN'::text NOT NULL,
    identity text,
    version text,
    board_name text,
    uptime text,
    cpu_load integer,
    last_ping_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    insecure_tls boolean DEFAULT false NOT NULL,
    interfaces_json text,
    camouflage text,
    camouflage_interface text,
    camouflage_mac text,
    camouflage_applied_at timestamp with time zone,
    api_mode text DEFAULT 'rest'::text NOT NULL,
    api_port integer,
    site_id text,
    live_json text,
    live_at timestamp with time zone,
    pause_on_outage boolean DEFAULT false NOT NULL,
    down_since timestamp with time zone,
    hours_enabled boolean DEFAULT false NOT NULL,
    hours_json text,
    hours_state text DEFAULT 'OPEN'::text NOT NULL,
    hours_applied boolean DEFAULT true NOT NULL,
    closed_since timestamp with time zone,
    hours_allow text DEFAULT 'WEEKLY,MONTHLY'::text NOT NULL,
    hours_pause boolean DEFAULT true NOT NULL,
    hours_message text,
    mem_total bigint,
    mem_free bigint,
    hardware_type text DEFAULT 'mikrotik'::text NOT NULL,
    hw_config text,
    hw_seen_at timestamp with time zone
);


--
-- Name: COLUMN mikrotiks.api_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mikrotiks.api_mode IS 'rest = RouterOS 7 /rest; api6 = RouterOS 6 binary API';


--
-- Name: network_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.network_events (
    id text NOT NULL,
    event_type text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operators (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    pw_hash text NOT NULL,
    pw_salt text NOT NULL,
    role text DEFAULT 'OPERATOR'::text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    site_id text
);


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id text NOT NULL,
    customer_id text NOT NULL,
    phone text NOT NULL,
    code_hash text NOT NULL,
    code_salt text NOT NULL,
    purpose text DEFAULT 'RESET'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: package_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_sites (
    package_id text NOT NULL,
    site_id text NOT NULL
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id text NOT NULL,
    name text NOT NULL,
    price integer NOT NULL,
    duration_minutes integer NOT NULL,
    download_kbps integer NOT NULL,
    upload_kbps integer NOT NULL,
    data_limit_mb integer,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    site_id text,
    badge text,
    duration_kind text,
    points_cost integer,
    category text DEFAULT 'STANDARD'::text NOT NULL,
    max_devices integer DEFAULT 1 NOT NULL,
    CONSTRAINT packages_max_devices_range CHECK ((max_devices = ANY (ARRAY[1, 2])))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id text NOT NULL,
    customer_id text NOT NULL,
    package_id text NOT NULL,
    mpesa_transaction_id text,
    checkout_request_id text,
    merchant_request_id text,
    phone text NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    activation_status text DEFAULT 'NOT_ACTIVATED'::text NOT NULL,
    result_code integer,
    result_desc text,
    transaction_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    site_id text,
    activation_attempts integer DEFAULT 0 NOT NULL,
    last_activation_error text,
    next_activation_retry_at timestamp with time zone,
    callback_received_at timestamp with time zone,
    loyalty_awarded_at timestamp with time zone,
    referral_minutes_awarded_at timestamp with time zone
);


--
-- Name: recovery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_attempts (
    id text NOT NULL,
    phone text,
    transaction_id text,
    success boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    customer_id text NOT NULL,
    package_id text NOT NULL,
    customer_package_id text,
    mikrotik_username text,
    ip_address text,
    mac_address text,
    device_information text,
    bytes_down bigint DEFAULT 0 NOT NULL,
    bytes_up bigint DEFAULT 0 NOT NULL,
    session_start timestamp with time zone DEFAULT now() NOT NULL,
    session_end timestamp with time zone,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id text DEFAULT 'default'::text NOT NULL,
    hotspot_name text DEFAULT 'TelNet Wi-Fi'::text NOT NULL,
    currency text DEFAULT 'KSh'::text NOT NULL,
    welcome_message text DEFAULT 'Welcome to Wi-Fi'::text NOT NULL,
    demo_mode boolean DEFAULT false NOT NULL,
    force_activation_failure boolean DEFAULT false NOT NULL,
    mpesa_shortcode text,
    mpesa_consumer_key text,
    mpesa_consumer_secret text,
    mpesa_passkey text,
    mpesa_env text DEFAULT 'sandbox'::text NOT NULL,
    mikrotik_host text,
    mikrotik_user text,
    mikrotik_password text,
    mikrotik_hotspot text DEFAULT 'hotspot1'::text,
    default_upload_kbps integer DEFAULT 1024 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    isp_total_kbps integer DEFAULT 30720 NOT NULL,
    per_user_max_kbps integer DEFAULT 5120 NOT NULL,
    max_users integer DEFAULT 25 NOT NULL,
    one_device_per_package boolean DEFAULT true NOT NULL,
    mpesa_callback_url text,
    operator_password text DEFAULT 'telnet-admin'::text NOT NULL,
    radius_enabled boolean DEFAULT false NOT NULL,
    radius_secret text,
    radius_auth_port integer DEFAULT 1812 NOT NULL,
    radius_acct_port integer DEFAULT 1813 NOT NULL,
    maintenance_mode boolean DEFAULT false NOT NULL,
    maintenance_message text,
    support_phone text,
    support_whatsapp text,
    support_message text,
    loyalty_enabled boolean DEFAULT false NOT NULL,
    loyalty_points_per_kes numeric DEFAULT 1 NOT NULL,
    referral_bonus_points integer DEFAULT 50 NOT NULL,
    max_devices_per_package integer DEFAULT 1 NOT NULL,
    referral_enabled boolean DEFAULT true NOT NULL,
    referral_bonus_minutes integer DEFAULT 30 NOT NULL,
    welcome_bonus_minutes integer DEFAULT 10 NOT NULL,
    referral_min_package_price numeric DEFAULT 20 NOT NULL,
    student_blocked_domains text DEFAULT 'facebook.com,instagram.com,tiktok.com,youtube.com,netflix.com,twitter.com,x.com,snapchat.com'::text NOT NULL,
    radius_server_host text,
    capacity_mode text DEFAULT 'PER_ISP'::text NOT NULL,
    require_account_multi_device boolean DEFAULT true NOT NULL,
    voucher_auto_clean_days integer DEFAULT 0 NOT NULL,
    mpesa_account_type text DEFAULT 'paybill'::text NOT NULL,
    mpesa_till_number text,
    sms_enabled boolean DEFAULT false NOT NULL,
    sms_api_key text,
    sms_device_id text,
    reset_method text DEFAULT 'RECEIPT'::text NOT NULL,
    signup_otp boolean DEFAULT false NOT NULL,
    CONSTRAINT max_devices_per_package_range CHECK ((max_devices_per_package = ANY (ARRAY[1, 2])))
);


--
-- Name: shop_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_devices (
    id text NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    site_id text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shop_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_orders (
    id text NOT NULL,
    product_id text,
    product_name text NOT NULL,
    kind text NOT NULL,
    amount integer NOT NULL,
    payer_phone text NOT NULL,
    target_phone text NOT NULL,
    site_id text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    checkout_request_id text,
    merchant_request_id text,
    mpesa_receipt text,
    result_desc text,
    fulfil_status text DEFAULT 'NONE'::text NOT NULL,
    fulfil_method text,
    fulfil_attempts integer DEFAULT 0 NOT NULL,
    fulfil_error text,
    next_attempt_at timestamp with time zone,
    provider_ref text,
    device_id text,
    refunded boolean DEFAULT false NOT NULL,
    paid_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shop_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_products (
    id text NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    price integer,
    min_amount integer,
    max_amount integer,
    ussd_code text,
    provider_code text,
    okoa_ok boolean DEFAULT false NOT NULL,
    notes text,
    site_id text,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shop_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_settings (
    id text DEFAULT 'default'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    title text,
    notice text,
    fulfilment text DEFAULT 'ANDROID'::text NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    payment_mode text DEFAULT 'CURRENT'::text NOT NULL,
    pay_account_type text DEFAULT 'paybill'::text NOT NULL,
    pay_shortcode text,
    pay_till text,
    pay_passkey text,
    pay_key text,
    pay_secret text,
    api_url text,
    api_method text DEFAULT 'POST'::text NOT NULL,
    api_content_type text DEFAULT 'json'::text NOT NULL,
    api_headers text,
    api_body text,
    api_success_path text,
    api_success_value text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id text NOT NULL,
    code text NOT NULL,
    package_id text NOT NULL,
    site_id text,
    status text DEFAULT 'AVAILABLE'::text NOT NULL,
    batch_label text,
    redeemed_by_customer_id text,
    redeemed_payment_id text,
    redeemed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Data for Name: _migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._migrations (name, applied_at) FROM stdin;
0001_auth.sql	2026-09-28 07:30:51.969007+00
0002_hotspot.sql	2026-09-28 07:30:53.234507+00
0003_seed.sql	2026-09-28 07:30:54.323891+00
0004_telnet.sql	2026-09-28 07:30:55.289354+00
0005_mikrotiks.sql	2026-09-28 07:30:56.234358+00
0006_network_live.sql	2026-09-28 07:30:57.184911+00
0007_isp_capacity.sql	2026-09-28 07:30:58.131121+00
0008_one_device.sql	2026-09-28 07:30:59.073596+00
0009_live_packages.sql	2026-09-28 07:31:00.003692+00
0010_clean_live.sql	2026-09-28 07:31:00.948892+00
0011_operator_password.sql	2026-09-28 07:31:01.899596+00
0012_routeros_mode.sql	2026-09-28 07:31:02.824496+00
0013_advanced_ops.sql	2026-09-28 07:31:03.749764+00
0014_sites_badges.sql	2026-09-28 07:31:04.704267+00
0015_maintenance_support.sql	2026-09-28 07:31:05.633953+00
0016_auto_resume.sql	2026-09-28 07:31:06.559503+00
0017_loyalty_referral.sql	2026-09-28 07:31:07.494188+00
0018_two_device_packages.sql	2026-09-28 07:31:08.524825+00
0019_referral_minutes.sql	2026-09-28 07:31:09.469713+00
0020_device_join_info.sql	2026-09-28 07:31:10.4051+00
0021_student_packages.sql	2026-09-28 07:31:11.434525+00
0022_package_max_devices_and_queue.sql	2026-09-28 07:31:12.410209+00
0023_customer_notices.sql	2026-09-28 07:31:13.345072+00
0024_customer_accounts.sql	2026-09-30 04:43:45.46333+00
0025_network_map.sql	2026-09-30 10:16:05.019408+00
0026_capacity_mode.sql	2026-10-01 06:14:20.269022+00
0027_guest_limits_voucher_clean.sql	2026-10-01 06:14:21.264182+00
0028_outage_credit.sql	2026-10-03 16:38:29.384112+00
0029_hours_ap_revenue.sql	2026-10-03 16:38:30.333635+00
0030_reset_ap_label_package_sites.sql	2026-10-03 22:16:00.411415+00
0031_mpesa_till.sql	2026-10-04 07:24:31.723939+00
0032_multi_hardware.sql	2026-10-10 06:46:28.360675+00
0033_isp_auto_status.sql	2026-10-11 00:25:44.501074+00
0034_sms_otp.sql	2026-10-11 00:25:44.609905+00
0035_operators.sql	2026-10-12 06:09:58.125637+00
0036_signup_otp.sql	2026-10-12 06:09:58.254413+00
0037_operator_sites.sql	2026-10-15 05:59:16.754717+00
0038_shop.sql	2026-10-15 05:59:16.834443+00
\.


--
-- Data for Name: access_points; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.access_points (id, mikrotik_id, name, ip_address, mac_address, model, port, notes, status, latency_ms, clients, last_seen_at, checked_at, created_at, updated_at, label) FROM stdin;
ap_4acf8ff0200c4cf8	mt_6b808c6a382f4f90	Main	192.168.88.245	B4:0F:3B:E1:35:01	Tenda OAP 1200	\N	\N	UNKNOWN	\N	\N	\N	2026-10-29 12:33:45.489339+00	2026-10-29 11:36:09.322074+00	2026-10-29 11:49:07.883534+00	AP 1
\.


--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", scope, password, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ap_usage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ap_usage (ap_key, package_id, customer_id, samples, first_seen, last_seen) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, event_type, message, performed_by, created_at) FROM stdin;
\.


--
-- Data for Name: customer_notices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_notices (id, customer_id, kind, message, minutes, created_at, seen_at) FROM stdin;
ntc_22ec30cb04524bcc	cus_b4d4d98c4d924e12	REFERRAL_BONUS	A friend you referred just bought their first package — 30 bonus minutes were added to your account.	30	2026-09-28 14:49:17.064302+00	\N
ntc_97fb4e504bd84c9b	cus_6d06b8e5fd504ac2	WELCOME_BONUS	Welcome! 60 bonus minutes were added to your first package.	60	2026-09-28 14:49:17.084227+00	\N
\.


--
-- Data for Name: customer_package_devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_package_devices (customer_package_id, device_token, bound_at, device_info) FROM stdin;
\.


--
-- Data for Name: customer_packages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_packages (id, customer_id, package_id, payment_id, start_time, expiry_time, speed_limit_kbps, data_limit_mb, status, activation_status, mikrotik_username, created_at, updated_at, bound_device_token, bound_mac, bound_at, radius_password, last_resumed_at) FROM stdin;
cp_d74a8cb707424764	cus_b4d4d98c4d924e12	pkg_3h	pay_e03470efc44f4bd9	2026-09-28 07:47:18.59+00	2026-09-28 10:47:18.59+00	3072	\N	EXPIRED	EXPIRED	u748175488	2026-09-28 07:47:18.660483+00	2026-09-28 10:58:37.266849+00	\N	\N	\N	\N	\N
cp_091208d3fc254132	cus_6d06b8e5fd504ac2	pkg_24h	pay_a91de17b49704629	2026-09-28 07:52:00.962+00	2026-09-29 07:52:00.962+00	5120	\N	EXPIRED	EXPIRED	u758366604	2026-09-28 07:52:01.031795+00	2026-09-29 10:06:29.522941+00	\N	\N	\N	\N	\N
cp_b9f42cf3a2b64b1d	cus_fdffae2012c9421c	pkg_1h	pay_8db2aa9b87b64aec	2026-09-30 05:37:17+00	2026-09-30 06:37:17+00	2048	\N	EXPIRED	EXPIRED	u726553481	2026-09-30 05:37:18.852575+00	2026-09-30 06:38:53.956097+00	\N	\N	\N	\N	\N
cp_1d5d681928784141	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	pay_167678065e3f4d27	2026-10-04 08:37:11+00	2026-10-04 11:37:11+00	5120	\N	EXPIRED	EXPIRED	u740319564	2026-10-04 08:37:11.780487+00	2026-10-04 11:50:50.574762+00	\N	\N	\N	\N	\N
cp_6a8225f3247747c6	cus_fdffae2012c9421c	pkg_1h	pay_0710e86b0c9a49be	2026-10-10 13:54:44+00	2026-10-10 14:54:44+00	5120	\N	EXPIRED	EXPIRED	u726553481	2026-10-10 13:55:01.006698+00	2026-10-10 17:24:21.187336+00	\N	\N	\N	\N	\N
\.


--
-- Data for Name: customer_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_sessions (device_token, customer_id, created_at, last_seen) FROM stdin;
tok_7eed1c930282a5def30f4c4314bda95d	cus_fdffae2012c9421c	2026-09-30 09:43:13.949121+00	2026-09-30 09:43:13.949121+00
tok_dbe2f554741b9c4ec06b1531f18bdd4c	cus_fdffae2012c9421c	2026-10-04 14:58:59.576637+00	2026-10-04 14:58:59.576637+00
tok_3b2241bb3f70b95b5f3994ab2f8eac39	cus_fdffae2012c9421c	2026-10-05 10:19:32.218461+00	2026-10-05 10:19:32.218461+00
tok_f3a0ce459c82d8697bdcf8701d9bb584	cus_fdffae2012c9421c	2026-10-10 13:54:32.942451+00	2026-10-10 13:54:32.942451+00
tok_aac13450b0f2ec7f5ac97cc51e390648	cus_fdffae2012c9421c	2026-10-11 00:30:02.46835+00	2026-10-11 00:30:02.46835+00
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, phone, device_token, status, notes, created_at, updated_at, site_id, deleted_at, referral_code, referred_by_customer_id, loyalty_points, referral_bonus_paid, bonus_minutes_balance, pin_hash, pin_salt, registered_at, failed_pin_attempts, pin_locked_until, reset_failed_attempts, reset_locked_until) FROM stdin;
cus_b4d4d98c4d924e12	254748175488	tok_f3a0ce459c82d8697bdcf8701d9bb584	ACTIVE	\N	2026-09-28 07:45:09.677+00	2026-10-04 16:09:39.010777+00	site_default	\N	\N	\N	0	f	30	\N	\N	\N	0	\N	0	\N
cus_6d06b8e5fd504ac2	deleted-cus_6d06b8e5fd504ac2	\N	BLOCKED	\N	2026-09-28 07:49:43.382598+00	2026-10-09 08:17:44.483847+00	\N	2026-10-09 08:17:44.483847+00	\N	cus_b4d4d98c4d924e12	50	t	0	\N	\N	\N	0	\N	0	\N
cus_fdffae2012c9421c	254726553481	tok_aac13450b0f2ec7f5ac97cc51e390648	ACTIVE	\N	2026-09-30 04:54:19.019659+00	2026-10-11 00:30:02.451329+00	site_default	\N	R8NT9J9	\N	70	f	0	c13a83cec48ac70e16639423af5605964b4e262ec4a3740912da01598b1cb3c7	6b69b90cbb907f81bc5c69b3acfe618c	2026-09-30 04:54:19.019659+00	0	\N	0	\N
cus_6c62cdb6e6724b7a	254740319564	tok_46cd72927e591d9eb33cd36720529d65	ACTIVE	\N	2026-09-30 13:23:23.217334+00	2026-10-17 09:35:03.259666+00	site_default	\N	REP4XKU	\N	60	f	0	16262aa5289e5b7c2961307a22cdee0a5856dbe16d4e4565e1250c4097c6bec3	544c7f304ffb2a049e026a4a3da6bc4c	2026-09-30 13:23:23.217334+00	0	\N	0	\N
\.


--
-- Data for Name: hw_authorizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hw_authorizations (id, customer_package_id, router_id, vendor, username, client_mac, mac_norm, token, status, authorized_at, expires_at, ended_at, handoff_done, extra) FROM stdin;
\.


--
-- Data for Name: hw_clients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hw_clients (id, router_id, vendor, device_token, client_mac, mac_norm, client_ip, ap_mac, ssid, radio_id, site_name, extra, created_at, seen_at) FROM stdin;
\.


--
-- Data for Name: isps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.isps (id, name, type, interface_name, status, latency_ms, sort_order, updated_at, mikrotik_id, total_kbps, per_user_max_kbps, max_users, site_id, auto_status, status_checked_at) FROM stdin;
isp_d0d1f92908994207	Airtel 5G Telnett	AIRTEL	\N	ONLINE	\N	1	2026-10-29 11:14:59.879351+00	mt_6b808c6a382f4f90	15360	5120	25	site_default	t	\N
\.


--
-- Data for Name: loyalty_ledger; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loyalty_ledger (id, customer_id, delta, reason, payment_id, package_id, created_at) FROM stdin;
lyl_4137bb9d734a4566	cus_6d06b8e5fd504ac2	50	EARNED_PURCHASE	pay_a91de17b49704629	\N	2026-09-28 16:39:52.305451+00
lyl_a08680b7b5144a2c	cus_fdffae2012c9421c	10	EARNED_PURCHASE	pay_8db2aa9b87b64aec	\N	2026-09-30 05:37:15.70234+00
lyl_30d8bd65080d4d02	cus_6c62cdb6e6724b7a	60	EARNED_PURCHASE	pay_167678065e3f4d27	\N	2026-10-04 08:37:11.534627+00
lyl_04bb33700564443a	cus_fdffae2012c9421c	60	EARNED_PURCHASE	pay_0710e86b0c9a49be	\N	2026-10-10 13:54:44.672933+00
\.


--
-- Data for Name: mikrotik_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikrotik_users (username, password, profile, disabled, download_kbps, upload_kbps, session_timeout_seconds, customer_id, created_at) FROM stdin;
\.


--
-- Data for Name: mikrotiks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikrotiks (id, name, host, api_user, api_password, hotspot_name, ssl, is_primary, status, identity, version, board_name, uptime, cpu_load, last_ping_at, last_error, created_at, updated_at, insecure_tls, interfaces_json, camouflage, camouflage_interface, camouflage_mac, camouflage_applied_at, api_mode, api_port, site_id, live_json, live_at, pause_on_outage, down_since, hours_enabled, hours_json, hours_state, hours_applied, closed_since, hours_allow, hours_pause, hours_message, mem_total, mem_free, hardware_type, hw_config, hw_seen_at) FROM stdin;
mt_6b808c6a382f4f90	Manda RB760iGs	http://192.168.88.1:443	admin	Hajji1958$	hotspot 1	f	t	OFFLINE	\N	\N	\N	\N	\N	2026-10-29 12:33:45.531753+00	Router is currently unavailable.	2026-10-28 17:21:03.374165+00	2026-10-29 12:33:45.531753+00	t	[]	PC	ether1	3C:97:0E:4B:A5:75	2026-10-29 11:14:42.93416+00	rest	443	site_default	{"at":"2026-10-29T12:33:45.451Z","error":"Router is currently unavailable.","cpuLoad":null,"memTotal":null,"memFree":null,"uptime":null,"activeUsers":null,"rxBps":null,"txBps":null,"ports":[],"neighbors":[],"radios":[]}	2026-10-29 12:33:45.460521+00	f	2026-10-28 17:21:11.436188+00	f	{"0":[["06:00","22:00"]],"1":[["06:00","22:00"]],"2":[["06:00","22:00"]],"3":[["06:00","22:00"]],"4":[["06:00","22:00"]],"5":[["06:00","22:00"]],"6":[["06:00","22:00"]]}	OPEN	t	\N	WEEKLY,MONTHLY	t	\N	\N	\N	mikrotik	{"omadaTimeUnit":"ms"}	\N
\.


--
-- Data for Name: network_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.network_events (id, event_type, description, created_at) FROM stdin;
ev_7dbaceec72d2	PAYMENT	M-Pesa UIS9E7S7UO settled.	2026-09-28 07:47:18.515615+00
ev_b0e13151a864	ACTIVATION_FAILED	Payment UIS9E7S7UO confirmed but the router could not activate the user.	2026-09-28 07:47:18.698386+00
ev_596ca9a00fcc	ACTIVATION_FAILED	Payment UIS9E7S7UO paid but activation failed. Queued for retry.	2026-09-28 07:47:18.730196+00
ev_58611118f960	ACTIVATION_FAILED	Payment UIS9E7S7UO confirmed but the router could not activate the user.	2026-09-28 07:48:31.575807+00
ev_e3628cb7f802	ACTIVATION_FAILED	Payment UIS9E7S7UO confirmed but the router could not activate the user.	2026-09-28 07:49:56.842282+00
ev_b74ef961043d	PAYMENT	M-Pesa STK push failed: Could not reach M-Pesa. Check Daraja credentials.	2026-09-28 07:51:05.572102+00
ev_de6517f354bd	PAYMENT	M-Pesa UISP685I7S settled.	2026-09-28 07:52:00.89082+00
ev_9ef0cbe78ff9	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 07:52:01.063622+00
ev_e88666c9ab85	ACTIVATION_FAILED	Payment UISP685I7S paid but activation failed. Queued for retry.	2026-09-28 07:52:01.095021+00
ev_d3d620a13b7e	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 07:54:19.283866+00
ev_f2d211471db6	ACTIVATION_FAILED	Payment UIS9E7S7UO confirmed but the router could not activate the user.	2026-09-28 07:54:24.092987+00
ev_c87085ddae9f	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 07:54:24.246526+00
ev_437b24a204b9	ACTIVATION_FAILED	Payment UIS9E7S7UO confirmed but the router could not activate the user.	2026-09-28 08:04:52.719423+00
ev_811d63b78011	ACTIVATION_FAILED	Payment UIS9E7S7UO confirmed but the router could not activate the user.	2026-09-28 08:28:20.214067+00
ev_2fe8744cbc77	EXPIRE	Package for 254748175488 reached expiry. Session ended, hotspot user disabled.	2026-09-28 10:58:38.841451+00
ev_21184f8a8dec	REFERRAL	Welcome bonus of 60 min applied to cus_6d06b8e5fd504ac2's first package (referred).	2026-09-28 14:49:17.019983+00
ev_04a81d98ec77	REFERRAL	Referral bonus of 30 min credited to cus_b4d4d98c4d924e12 for a referred customer's first qualifying purchase.	2026-09-28 14:49:17.097737+00
ev_8441c6013728	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 14:49:17.229544+00
ev_e00c5868e7ec	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 15:02:28.780188+00
ev_9d274b99840b	SITE	Main site (main) updated as a site.	2026-09-28 15:22:09.441762+00
ev_5de62626b630	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 15:40:55.906222+00
ev_168076097c40	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 16:39:52.518887+00
ev_dbce58beed92	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 16:40:02.106867+00
ev_42e4aea473d9	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 16:40:05.337014+00
ev_a2d105bf1ff4	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 16:40:11.692528+00
ev_d55877e871eb	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 16:40:17.289333+00
ev_cab9faedba8a	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-28 16:52:36.097785+00
ev_078ef9fba518	ACTIVATION_FAILED	Payment UISP685I7S confirmed but the router could not activate the user.	2026-09-29 05:38:13.730454+00
ev_c82f20c1b57a	CUSTOMER	Customer account created for 254726553481.	2026-09-30 04:54:19.588563+00
ev_242de1db58f0	VOUCHER	Generated 10 vouchers for Quick Connect.	2026-09-30 05:35:58.991108+00
ev_142ea1425166	ACTIVATION_FAILED	Payment VCH-Q282LLVN4F confirmed but the router could not activate the user.	2026-09-30 05:37:19.397881+00
ev_48774eec7644	ACTIVATION_FAILED	Payment VCH-Q282LLVN4F confirmed but the router could not activate the user.	2026-09-30 05:43:33.684309+00
ev_10c41b34ba8d	EXPIRE	Package for 254726553481 reached expiry. Session ended, hotspot user disabled.	2026-09-30 06:39:01.000573+00
ev_c49432f6776e	CUSTOMER	Customer account created for 254740319564.	2026-09-30 13:23:23.257345+00
ev_6d89770bb911	CUSTOMER	PIN reset for customer cus_6c62cdb6e6724b7a.	2026-09-30 18:08:44.743134+00
ev_ff771c94f982	SITE	Manda (main) updated as a site.	2026-10-03 16:56:17.170495+00
ev_7f1708190f94	CUSTOMER	PIN set for customer cus_6c62cdb6e6724b7a.	2026-10-03 18:46:42.667657+00
ev_0bab4f2b862f	SITE	Pate (kichokwe) added as a site.	2026-10-03 19:46:22.975172+00
ev_13a6d2225f85	SITE	Kichokwe  (kichokwe) updated as a site.	2026-10-03 19:55:04.531312+00
ev_b282cbc38413	SITE	Pate (pate) updated as a site.	2026-10-03 19:56:01.760712+00
ev_d6ed636d5351	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 07:29:09.948725+00
ev_3031980bbf7b	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 07:30:00.094664+00
ev_0649932764b2	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 07:32:33.673822+00
ev_09b33e9da765	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:02:06.335359+00
ev_940fd6104657	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:02:55.582427+00
ev_aeb84c86d712	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:03:50.836332+00
ev_a1e6f15c0bda	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:04:11.586328+00
ev_61cf9fda3cc8	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:04:43.893208+00
ev_fec062a98363	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:09:34.579385+00
ev_081915ad0304	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:16:23.157555+00
ev_7cc9e8f41d55	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:28:01.800005+00
ev_6cec3968bff8	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:29:09.410175+00
ev_3a3c382839fb	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:33:52.110161+00
ev_fc930c31e08a	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:35:43.750596+00
ev_8363ce07974c	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:36:56.819405+00
ev_75e26ce2634d	PAYMENT	M-Pesa UJ4DN8O262 settled.	2026-10-04 08:37:11.390127+00
ev_2adb52c8265e	ACTIVATION_FAILED	Payment UJ4DN8O262 confirmed but the router could not activate the user.	2026-10-04 08:37:11.815685+00
ev_1fd65d1e5ba7	ACTIVATION_FAILED	Payment UJ4DN8O262 paid but activation failed. Queued for retry.	2026-10-04 08:37:11.847974+00
ev_12eeed26b938	ACTIVATION_FAILED	Payment UJ4DN8O262 confirmed but the router could not activate the user.	2026-10-04 08:40:15.635213+00
ev_e3c507d18c30	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-04 08:59:00.038725+00
ev_bc91f0ad3d19	ACTIVATION_FAILED	Payment UJ4DN8O262 confirmed but the router could not activate the user.	2026-10-04 08:59:22.596968+00
ev_f129a9504d20	ACTIVATION_FAILED	Payment UJ4DN8O262 confirmed but the router could not activate the user.	2026-10-04 08:59:31.131771+00
ev_641bf1529016	EXPIRE	Package for 254740319564 reached expiry. Session ended, hotspot user disabled.	2026-10-04 11:50:50.683713+00
ev_601a753c8257	CUSTOMER	Customer cus_6d06b8e5fd504ac2 data was deleted.	2026-10-09 08:17:44.499242+00
ev_1df50e121cf5	ISP_PATH	Safaricom (AIRTEL) added as an ISP path.	2026-10-10 13:41:38.145876+00
ev_625b1613146a	ISP_DOWN	Safaricom is now OFFLINE. Active packages are unchanged — MikroTik handles WAN failover.	2026-10-10 13:41:42.501599+00
ev_806e9a8b5d36	ISP_RECOVER	Safaricom is now ONLINE. Active packages are unchanged — MikroTik handles WAN failover.	2026-10-10 13:41:48.948973+00
ev_563b9e512312	ISP_PATH	Safaricom (SAFARICOM) added as an ISP path.	2026-10-10 13:43:43.356494+00
ev_4b277bc70d44	ISP_DOWN	Safaricom is now OFFLINE. Active packages are unchanged — MikroTik handles WAN failover.	2026-10-10 13:44:07.90828+00
ev_99febc79d9fb	ISP_PATH	Safaricom was removed from ISP monitoring.	2026-10-10 13:45:44.521781+00
ev_08e0b6a3d254	ROUTER_OFFLINE	MikroTik Mainrdbc saved but unreachable. Router timed out. Check the host and REST service.	2026-10-10 13:47:56.901423+00
ev_dfd4e3e27280	CAMOUFLAGE	Mainrdbc WAN identity set to PC (script ready). MAC 3C:97:0E:C3:05:F0 on ether1.	2026-10-10 13:49:25.310916+00
ev_233eb9b14e2e	CAMOUFLAGE	Mainrdbc WAN identity set to ANDROID (script ready). MAC 08:EC:A9:BA:FE:C5 on ether1.	2026-10-10 13:50:28.144742+00
ev_3af22e3f8d4e	ISP_PATH	Safaricom (SAFARICOM) added as an ISP path.	2026-10-10 13:50:45.457052+00
ev_2cefcc35830b	ROUTER_OFFLINE	TP-Link Omada Mainrdbc saved but unreachable. Could not reach the Omada controller. Check the URL, port and firewall.	2026-10-10 13:51:28.360866+00
ev_b54803cec6a9	ACTIVATION_FAILED	Payment VCH-YA6NPR8MBN confirmed but the router could not activate the user.	2026-10-10 13:55:01.039657+00
ev_98563c2ebf55	ACTIVATION_FAILED	Payment VCH-YA6NPR8MBN confirmed but the router could not activate the user.	2026-10-10 13:55:20.579429+00
ev_f6225b6dfccd	ACTIVATION_FAILED	Payment VCH-YA6NPR8MBN confirmed but the router could not activate the user.	2026-10-10 13:57:49.297947+00
ev_4e1557081e35	ACTIVATION_FAILED	Payment VCH-YA6NPR8MBN confirmed but the router could not activate the user.	2026-10-10 13:59:32.732225+00
ev_0f0fa68bd7f2	ACTIVATION_FAILED	Payment VCH-YA6NPR8MBN confirmed but the router could not activate the user.	2026-10-10 14:00:43.408849+00
ev_fbb496780b02	ROUTER_OFFLINE	TP-Link Omada Mainrdbc saved but unreachable. Could not reach the Omada controller. Check the URL, port and firewall.	2026-10-10 14:03:16.679608+00
ev_44a510f0ed60	ROUTER_OFFLINE	TP-Link Omada Mainr saved but unreachable. Could not reach the Omada controller. Check the URL, port and firewall.	2026-10-10 14:06:05.795686+00
ev_9be1ad0dcca1	ROUTER_REMOVED	Mainr was removed from TelNet.	2026-10-10 14:09:10.251145+00
ev_f5cec81cc7de	ISP_PATH	Safaricom was removed from ISP monitoring.	2026-10-10 14:09:15.680477+00
ev_d09c7766befc	EXPIRE	Package for 254726553481 reached expiry. Session ended, hotspot user disabled.	2026-10-10 17:24:21.337186+00
ev_5ac3f6f5d9ad	SMS	Operator sent a test SMS to 254740319564.	2026-10-11 05:08:36.657583+00
ev_858a2280cd80	CUSTOMER	Customer 254740319564 reset their own PIN/password with an SMS code.	2026-10-11 05:11:32.886365+00
ev_18968bcd99ac	SMS	Operator sent a test SMS to 254726553481.	2026-10-13 08:38:24.570262+00
ev_1d61c9d70fad	SMS	Operator sent a test SMS to 254726553481.	2026-10-13 08:39:43.265481+00
ev_05fc4998a3f8	OPERATOR	Operator account created: Hajji Ramadhan (2541•••337, OWNER).	2026-10-13 11:31:57.151107+00
ev_0224c111be06	OPERATOR	Operator account created: Brian (2547•••488, OPERATOR).	2026-10-14 17:51:50.171256+00
ev_3f319bf780ad	SHOP	Shop order so_0543e936d52d4f59 paid.	2026-10-16 03:18:26.36977+00
ev_fb9bca0ad9c1	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-17 09:42:21.628637+00
ev_eb23aa5effbe	PAYMENT	Operator sent a KES 1 M-Pesa test prompt.	2026-10-17 17:47:50.083597+00
ev_f0dbb177a0d8	ROUTER_OFFLINE	MikroTik Manda RB760iGs saved but unreachable. Router timed out. Check the host and REST service.	2026-10-28 17:20:46.877229+00
ev_438592a10596	ROUTER_OFFLINE	MikroTik Manda RB760iGs saved but unreachable. Router timed out. Check the host and REST service.	2026-10-28 17:21:11.482823+00
ev_1bbcaf30a612	ROUTER_REMOVED	Manda RB760iGs was removed from TelNet.	2026-10-28 19:48:23.418863+00
ev_a8a45cf9d719	CAMOUFLAGE	Manda RB760iGs WAN identity set to PC (script ready). MAC 3C:97:0E:60:8C:44 on ether1.	2026-10-28 19:49:33.307103+00
ev_5ad1eb7966f0	ROUTER_OFFLINE	MikroTik Manda RB760iGs saved but unreachable. Router is currently unavailable.	2026-10-29 11:05:40.620907+00
ev_e3e1d87f89dd	ROUTER_OFFLINE	MikroTik Manda RB760iGs saved but unreachable. Router is currently unavailable.	2026-10-29 11:06:48.674784+00
ev_ec4aadc31867	ROUTER_OFFLINE	MikroTik Manda RB760iGs saved but unreachable. Router is currently unavailable.	2026-10-29 11:07:29.925966+00
ev_20cf70ae36ae	ROUTER_OFFLINE	MikroTik Manda RB760iGs saved but unreachable. Router is currently unavailable.	2026-10-29 11:08:06.648523+00
ev_7385c365fa2e	ISP_PATH	Airtel 5G Telnett (AIRTEL) added as an ISP path.	2026-10-29 11:11:18.047836+00
ev_2bd74874ebfe	ISP_RECOVER	Airtel 5G Telnett is now DEGRADED. Active packages are unchanged — MikroTik handles WAN failover.	2026-10-29 11:11:32.648706+00
ev_a835c11fd575	ISP_RECOVER	Airtel 5G Telnett is now ONLINE. Active packages are unchanged — MikroTik handles WAN failover.	2026-10-29 11:11:35.105167+00
ev_6cd1e2a8c601	CAMOUFLAGE	Manda RB760iGs WAN identity set to PC (script ready). MAC 3C:97:0E:4B:A5:75 on ether1.	2026-10-29 11:14:42.949187+00
ev_438f3559d59c	AP	Access point Main added.	2026-10-29 11:36:09.341277+00
ev_f6712ef4bdcf	AP	Access point Main updated.	2026-10-29 11:49:07.897319+00
ev_cb23e8718f0c	SITE	Pate was deactivated.	2026-10-29 11:50:35.976148+00
\.


--
-- Data for Name: operators; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operators (id, name, phone, pw_hash, pw_salt, role, status, failed_attempts, locked_until, last_login_at, created_at, updated_at, site_id) FROM stdin;
op_996bcb8f0d9844ef	Hajji Ramadhan	254111293337	e913bb0d3ab407d5999511bd1af33d4c67fcc5377fc348e98d38a486f462a265	f3d058f65be4a62e4cbc75678e774a99	OWNER	ACTIVE	0	\N	2026-10-25 10:18:16.5312+00	2026-10-13 11:31:57.132014+00	2026-10-13 11:31:57.132014+00	\N
op_0abf80271b214a45	Brian	254748175488	e8375232617aa3151f35f66f914e52482a784a1bcd9942096f14a38d54a7997d	da1af6d9bbaf91213a9001dfd1bf6cd5	OWNER	ACTIVE	0	\N	2026-10-29 09:09:21.193719+00	2026-10-14 17:51:50.157185+00	2026-10-14 17:51:50.157185+00	\N
\.


--
-- Data for Name: otp_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.otp_codes (id, customer_id, phone, code_hash, code_salt, purpose, attempts, created_at, expires_at, used_at) FROM stdin;
otp_65e6b3c7fc824857	cus_6c62cdb6e6724b7a	254740319564	47429d4c49add5c2b8e113b66808bf8161caf8e5f03d6d12285ac9ef667d0f35	e62184e1e5df7a5e7f5be7118067a0ab	RESET	0	2026-10-11 05:10:46.655315+00	2026-10-11 05:20:46.655315+00	2026-10-11 05:11:32.77248+00
\.


--
-- Data for Name: package_sites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.package_sites (package_id, site_id) FROM stdin;
pkg_7d	site_default
pkg_8ff15e9b56704937	site_default
pkg_24h	site_default
pkg_2242eb7887b54f42	site_mussyqd8
pkg_ef559a586b104837	site_mussyqd8
pkg_1h	site_default
pkg_3h	site_default
\.


--
-- Data for Name: packages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.packages (id, name, price, duration_minutes, download_kbps, upload_kbps, data_limit_mb, status, sort_order, created_at, updated_at, site_id, badge, duration_kind, points_cost, category, max_devices) FROM stdin;
pkg_cd37990cde9349d8	Student Study 	10	180	5120	5120	\N	ACTIVE	50	2026-10-03 19:41:55.142861+00	2026-10-03 22:48:06.479129+00	\N	\N	HOURLY	200	STUDENT	1
pkg_ef559a586b104837	Study Buddy	18	360	5120	5120	\N	ACTIVE	50	2026-10-03 19:50:38.232157+00	2026-10-04 08:15:33.314831+00	site_mussyqd8	\N	HOURLY	360	STUDENT	2
pkg_5437d8d8955c40ed	Smart 12	40	720	5120	5120	\N	ACTIVE	50	2026-10-05 17:12:39.697594+00	2026-10-05 17:12:39.697594+00	\N	\N	HOURLY	\N	STANDARD	1
pkg_1h	Quick Connect	18	60	5120	5120	\N	ACTIVE	1	2026-09-28 07:30:54.323891+00	2026-10-16 03:15:19.173657+00	site_default	BEST_VALUE	HOURLY	200	STANDARD	2
pkg_3h	Workday	25	180	5120	5120	\N	ACTIVE	2	2026-09-28 07:30:54.323891+00	2026-10-16 03:16:50.100773+00	site_default	\N	DAILY	400	STANDARD	2
pkg_7d	Weekly Access	200	10080	5120	5120	\N	ACTIVE	4	2026-09-28 07:30:54.323891+00	2026-10-03 16:42:48.545646+00	site_default	\N	WEEKLY	\N	STANDARD	1
pkg_8ff15e9b56704937	Monthly Connect 	600	43200	5120	5120	\N	ACTIVE	50	2026-10-03 16:44:04.318219+00	2026-10-03 16:44:59.842705+00	site_default	\N	MONTHLY	\N	STANDARD	1
pkg_24h	Day Pass	50	1440	5120	5120	\N	ACTIVE	3	2026-09-28 07:30:54.323891+00	2026-10-03 17:02:38.906012+00	site_default	MOST_POPULAR	DAILY	1000	STANDARD	1
pkg_2242eb7887b54f42	Student Daily	30	1440	5120	5120	\N	ACTIVE	50	2026-10-03 19:53:25.800723+00	2026-10-03 22:15:34.716207+00	site_mussyqd8	\N	DAILY	600	STUDENT	2
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, customer_id, package_id, mpesa_transaction_id, checkout_request_id, merchant_request_id, phone, amount, status, activation_status, result_code, result_desc, transaction_date, created_at, updated_at, site_id, activation_attempts, last_activation_error, next_activation_retry_at, callback_received_at, loyalty_awarded_at, referral_minutes_awarded_at) FROM stdin;
pay_dc9299228119468e	cus_b4d4d98c4d924e12	pkg_3h	\N	ws_CO_280920261045110748175488	4e7d-425c-aa3e-9b62f1dcf8a2986382	254748175488	20	PENDING	NOT_ACTIVATED	\N	\N	\N	2026-09-28 07:45:11.537703+00	2026-09-28 07:45:11.537703+00	\N	0	\N	\N	\N	\N	\N
pay_8db2aa9b87b64aec	cus_fdffae2012c9421c	pkg_1h	VCH-Q282LLVN4F	\N	\N	254726553481	10	SUCCESS	EXPIRED	0	Voucher redeemed	2026-09-30 05:37:13.767211+00	2026-09-30 05:37:13.767211+00	2026-09-30 06:38:53.981838+00	site_default	0	\N	\N	\N	2026-09-30 05:37:15.227731+00	2026-09-30 05:37:16.188272+00
pay_ebc16ab409504b38	cus_b4d4d98c4d924e12	pkg_1h	\N	ws_CO_300920261242215748175488	ac7b-470b-8df7-23ab3cef38271070071	254748175488	10	CANCELLED	NOT_ACTIVATED	1032	Request Cancelled by user.	\N	2026-09-30 09:42:22.062278+00	2026-09-30 09:42:32.706798+00	site_default	0	\N	\N	2026-09-30 09:42:32.706798+00	\N	\N
pay_0ba3b60b7c794f20	cus_fdffae2012c9421c	pkg_24h	\N	ws_CO_021020260824385726553481	9331-49cd-aadb-34712a73ffd2200981	254726553481	50	FAILED	NOT_ACTIVATED	1037	DS timeout user cannot be reached.	\N	2026-10-02 05:24:38.917609+00	2026-10-02 05:24:39.755557+00	site_default	0	\N	\N	2026-10-02 05:24:39.755557+00	\N	\N
pay_462af4fadd3c485f	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	\N	ws_CO_04102026092614193740319564	65f1-482a-bc4c-1789147c0df91254797	254740319564	10	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 06:26:14.519228+00	2026-10-04 06:26:15.146837+00	site_default	0	\N	\N	2026-10-04 06:26:15.146837+00	\N	\N
pay_13e906e910804c76	cus_6c62cdb6e6724b7a	pkg_1h	\N	ws_CO_04102026092737962740319564	1c4f-4397-b32a-18091ae611f11056629	254740319564	10	FAILED	NOT_ACTIVATED	4999	Merchant does not exist	\N	2026-10-04 06:27:37.173382+00	2026-10-04 06:27:37.663967+00	site_default	0	\N	\N	2026-10-04 06:27:37.663967+00	\N	\N
pay_31655d083c1f4a9a	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	\N	ws_CO_04102026092924591740319564	278c-4e6f-b20c-1f593fdc5ee01696602	254740319564	10	FAILED	NOT_ACTIVATED	4999	Merchant does not exist	\N	2026-10-04 06:29:24.250002+00	2026-10-04 06:29:24.6418+00	site_default	0	\N	\N	2026-10-04 06:29:24.6418+00	\N	\N
pay_81376b66846b47a2	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	\N	ws_CO_04102026093334314740319564	1c4f-4397-b32a-18091ae611f11072213	254740319564	10	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 06:33:34.775966+00	2026-10-04 06:33:35.156037+00	site_default	0	\N	\N	2026-10-04 06:33:35.156037+00	\N	\N
pay_e03470efc44f4bd9	cus_b4d4d98c4d924e12	pkg_3h	UIS9E7S7UO	ws_CO_280920261047035748175488	4e7d-425c-aa3e-9b62f1dcf8a2986430	254748175488	20	SUCCESS	EXPIRED	0	The service request is processed successfully.	2026-09-28 07:47:18.497949+00	2026-09-28 07:47:03.943902+00	2026-09-28 10:58:37.51664+00	\N	2	Router still unavailable	2026-09-28 07:56:24.106026+00	2026-09-28 07:47:18.497949+00	\N	2026-09-28 07:48:28.330118+00
pay_7dc7f38b75644675	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	\N	ws_CO_17102026123508779740319564	3104-4c17-9052-8f7ba0631497530254	254740319564	10	CANCELLED	NOT_ACTIVATED	1032	Request Cancelled by user.	\N	2026-10-17 09:35:09.020614+00	2026-10-17 09:35:22.1585+00	site_default	0	\N	\N	2026-10-17 09:35:22.1585+00	\N	\N
pay_8a04206675c149cd	cus_6c62cdb6e6724b7a	pkg_24h	\N	ws_CO_04102026093347560740319564	feb7-4ad8-99f0-beeab6375ac51239484	254740319564	50	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 06:33:47.354934+00	2026-10-04 06:33:47.694193+00	site_default	0	\N	\N	2026-10-04 06:33:47.694193+00	\N	\N
pay_7e4b4473c296404c	cus_b4d4d98c4d924e12	pkg_cd37990cde9349d8	\N	ws_CO_04102026105025931748175488	825c-4262-a5e1-1e7a1f724d032065305	254748175488	10	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 07:50:25.677075+00	2026-10-04 07:50:26.120351+00	site_default	0	\N	\N	2026-10-04 07:50:26.120351+00	\N	\N
pay_f902c8ba95e94104	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	\N	ws_CO_04102026111108522740319564	2d78-4567-8d02-ad819489b2e61703165	254740319564	10	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 08:11:08.344547+00	2026-10-04 08:11:08.711312+00	site_default	0	\N	\N	2026-10-04 08:11:08.711312+00	\N	\N
pay_7cfe34483ae74328	cus_b4d4d98c4d924e12	pkg_cd37990cde9349d8	\N	ws_CO_04102026111919090748175488	feb7-4ad8-99f0-beeab6375ac51528292	254748175488	10	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 08:19:19.774671+00	2026-10-04 08:19:20.260641+00	site_default	0	\N	\N	2026-10-04 08:19:20.260641+00	\N	\N
pay_c1ea07d3db4c484d	cus_b4d4d98c4d924e12	pkg_cd37990cde9349d8	\N	ws_CO_04102026113122357748175488	500a-49e3-a0d9-a7bb6802a7421610178	254748175488	10	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 08:31:22.97838+00	2026-10-04 08:31:23.420273+00	site_default	0	\N	\N	2026-10-04 08:31:23.420273+00	\N	\N
pay_6e0504a3fa4c41e0	cus_b4d4d98c4d924e12	pkg_24h	\N	ws_CO_04102026113256399748175488	b907-45f6-be67-632544e7ac311348324	254748175488	50	FAILED	NOT_ACTIVATED	4999	Wrong credentials	\N	2026-10-04 08:32:56.928555+00	2026-10-04 08:32:57.376154+00	site_default	0	\N	\N	2026-10-04 08:32:57.376154+00	\N	\N
pay_b26828c296d6444f	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	\N	ws_CO_04102026113616507740319564	755c-42b2-a104-78eac2dd620c181106	254740319564	10	FAILED	NOT_ACTIVATED	2001	The initiator information is invalid.	\N	2026-10-04 08:36:16.804252+00	2026-10-04 08:36:29.754137+00	site_default	0	\N	\N	2026-10-04 08:36:29.754137+00	\N	\N
pay_8fcdbb6c503b443c	cus_b4d4d98c4d924e12	pkg_cd37990cde9349d8	\N	ws_CO_04102026190946121748175488	1c34-40d0-8b2b-98ca781b3703687998	254748175488	10	FAILED	NOT_ACTIVATED	1	The balance is insufficient for the transaction.	\N	2026-10-04 16:09:46.559595+00	2026-10-04 16:09:58.560292+00	site_default	0	\N	\N	2026-10-04 16:09:58.560292+00	\N	\N
pay_b7eb795d17b24405	cus_6c62cdb6e6724b7a	pkg_8ff15e9b56704937	\N	ws_CO_04102026212406272740319564	a3a9-4871-aeec-a2fd12658466614201	254740319564	600	CANCELLED	NOT_ACTIVATED	1032	Request Cancelled by user.	\N	2026-10-04 18:24:06.448591+00	2026-10-04 18:24:23.247638+00	site_default	0	\N	\N	2026-10-04 18:24:23.247638+00	\N	\N
pay_ce97cb98c1224aa3	cus_6d06b8e5fd504ac2	pkg_24h	\N	ws_CO_280920261049448758366604	431e-471c-a5c3-00b50c8126b547281	deleted	50	PENDING	NOT_ACTIVATED	\N	\N	\N	2026-09-28 07:49:45.307283+00	2026-10-09 08:17:44.451986+00	\N	0	\N	\N	\N	\N	\N
pay_167678065e3f4d27	cus_6c62cdb6e6724b7a	pkg_cd37990cde9349d8	UJ4DN8O262	ws_CO_04102026113648961740319564	755c-42b2-a104-78eac2dd620c182556	254740319564	10	SUCCESS	EXPIRED	0	The service request is processed successfully.	2026-10-04 08:37:11.372445+00	2026-10-04 08:36:48.898669+00	2026-10-04 11:50:50.598859+00	site_default	2	Router still unavailable	2026-10-04 09:01:22.608639+00	2026-10-04 08:37:11.372445+00	2026-10-04 08:37:11.502412+00	2026-10-04 08:37:11.573155+00
pay_a91de17b49704629	cus_6d06b8e5fd504ac2	pkg_24h	UISP685I7S	ws_CO_280920261051492758366604	4e7d-425c-aa3e-9b62f1dcf8a2986568	deleted	50	SUCCESS	EXPIRED	0	The service request is processed successfully.	2026-09-28 07:52:00.874863+00	2026-09-28 07:51:50.05408+00	2026-10-09 08:17:44.451986+00	\N	7	Router still unavailable	2026-09-29 05:40:13.746892+00	2026-09-28 07:52:00.874863+00	2026-09-28 16:39:52.284381+00	2026-09-28 14:49:16.906363+00
pay_0710e86b0c9a49be	cus_fdffae2012c9421c	pkg_1h	VCH-YA6NPR8MBN	\N	\N	254726553481	10	SUCCESS	EXPIRED	0	Voucher redeemed	2026-10-10 13:54:44.487512+00	2026-10-10 13:54:44.487512+00	2026-10-10 17:24:21.207368+00	site_default	1	Router still unavailable	2026-10-10 13:57:20.59701+00	\N	2026-10-10 13:54:44.646743+00	2026-10-10 13:54:44.702031+00
\.


--
-- Data for Name: recovery_attempts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recovery_attempts (id, phone, transaction_id, success, created_at) FROM stdin;
rec_b221e0f04c6443c0	\N	IIUYYYYY	f	2026-09-28 14:36:38.251096+00
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId") FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (id, customer_id, package_id, customer_package_id, mikrotik_username, ip_address, mac_address, device_information, bytes_down, bytes_up, session_start, session_end, last_seen, status) FROM stdin;
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (id, hotspot_name, currency, welcome_message, demo_mode, force_activation_failure, mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, mpesa_env, mikrotik_host, mikrotik_user, mikrotik_password, mikrotik_hotspot, default_upload_kbps, created_at, updated_at, isp_total_kbps, per_user_max_kbps, max_users, one_device_per_package, mpesa_callback_url, operator_password, radius_enabled, radius_secret, radius_auth_port, radius_acct_port, maintenance_mode, maintenance_message, support_phone, support_whatsapp, support_message, loyalty_enabled, loyalty_points_per_kes, referral_bonus_points, max_devices_per_package, referral_enabled, referral_bonus_minutes, welcome_bonus_minutes, referral_min_package_price, student_blocked_domains, radius_server_host, capacity_mode, require_account_multi_device, voucher_auto_clean_days, mpesa_account_type, mpesa_till_number, sms_enabled, sms_api_key, sms_device_id, reset_method, signup_otp) FROM stdin;
default	HI-FI WI-FI	KES	Welcome to Hi-Fi	f	f	4818363	FD1BZ3W4k7j0675nxaCAIkyqAgBuDPdnInGFuQwV9lMMNYGd	bi4gFcAg8mJkH68hHLZahQCOpymyq7OJ8JBqt6CbgtySYWDwR9cCuZGMsXGAl0Pl	5530764ceffd12a10f76dad557ab200a8325ebde160eefde3227dca02a4b3d8d	production	http://192.168.88.1:443	admin	Hajji1958$	hotspot 1	1024	2026-09-28 07:30:54.323891+00	2026-10-29 11:08:06.632012+00	30720	5120	30	t	https://tell-net-xuk7-taupe.vercel.app/api/pay/callback	telnet-admin	f	\N	1812	1813	f		0748175488	0728737990	We operate daily 24 hours	t	6	50	1	t	30	0	19	facebook.com, instagram.com, tiktok.com, youtube.com, netflix.com, twitter.com, x.com, snapchat.com	\N	PER_ISP	t	0	till	1701364	t	txb_X0OavdCZdoHwLc5wi0Kx4ZLfrzYmUmYj	6acded3f74e21da91a5d0506	BOTH	t
\.


--
-- Data for Name: shop_devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_devices (id, name, key_hash, key_prefix, site_id, status, last_seen_at, created_at) FROM stdin;
dev_0ea4ad75f6874fdc	Shop phone	00260effa1607f42861a6ad04f8adb119439690d8c1dd10e4179b05cd81e5142	c31b8e	\N	ACTIVE	\N	2026-10-15 06:16:20.412453+00
\.


--
-- Data for Name: shop_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_orders (id, product_id, product_name, kind, amount, payer_phone, target_phone, site_id, status, checkout_request_id, merchant_request_id, mpesa_receipt, result_desc, fulfil_status, fulfil_method, fulfil_attempts, fulfil_error, next_attempt_at, provider_ref, device_id, refunded, paid_at, delivered_at, created_at, updated_at) FROM stdin;
so_57b14309b88b4d8f	shp_1009d999dc2e423e	1GB 1hr Daily Bundle	DATA	19	254748175488	254748175488	\N	CANCELLED	ws_CO_15102026092743579748175488	ef15-4123-bee9-5765539bc9c61361402	\N	Request Cancelled by user.	NONE	\N	0	\N	\N	\N	\N	f	\N	\N	2026-10-15 06:27:40.702976+00	2026-10-15 06:27:52.867014+00
so_970c9b9fdea642f5	shp_1009d999dc2e423e	1GB 1hr Daily Bundle	DATA	19	254748175488	254748175488	\N	FAILED	ws_CO_15102026093056470748175488	1f50-4cc8-8809-0b481e4d3c031706661	\N	The balance is insufficient for the transaction.	NONE	\N	0	\N	\N	\N	\N	f	\N	\N	2026-10-15 06:30:52.521962+00	2026-10-15 06:31:11.320658+00
so_5fd70e6550e3426b	shp_1009d999dc2e423e	1GB 1hr Daily Bundle	DATA	19	254748175488	254748175488	\N	CANCELLED	ws_CO_15102026100349833748175488	ef15-4123-bee9-5765539bc9c61454576	\N	Request Cancelled by user.	NONE	\N	0	\N	\N	\N	\N	f	\N	\N	2026-10-15 07:03:46.286257+00	2026-10-15 07:04:07.831752+00
so_e195b8c112f64733	shp_1009d999dc2e423e	1GB 1hr Daily Bundle	DATA	19	254740319564	254740319564	\N	CANCELLED	ws_CO_15102026140627100740319564	1950-4559-9c1c-f4c903c63aa0852354	\N	Request Cancelled by user.	NONE	\N	0	\N	\N	\N	\N	f	\N	\N	2026-10-15 11:06:23.424768+00	2026-10-15 11:06:58.103992+00
so_0543e936d52d4f59	shp_1009d999dc2e423e	1GB 1hr Daily Bundle	DATA	19	254740319564	254740319564	\N	PAID	ws_CO_16102026061805680740319564	9ab5-467d-8350-ce8c00c23f331007451	UJGDNA3YBF	The service request is processed successfully.	QUEUED	ANDROID	0	\N	2026-10-18 07:12:39.36083+00	\N	\N	f	2026-10-16 03:18:26.310245+00	\N	2026-10-16 03:18:02.969039+00	2026-10-18 07:12:39.36083+00
\.


--
-- Data for Name: shop_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_products (id, kind, name, price, min_amount, max_amount, ussd_code, provider_code, okoa_ok, notes, site_id, sort_order, status, created_at) FROM stdin;
shp_1009d999dc2e423e	DATA	1GB 1hr Daily Bundle	19	\N	\N	*544*2*1*[phone]#	\N	t	\N	\N	0	ACTIVE	2026-10-15 06:24:59.638053+00
\.


--
-- Data for Name: shop_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_settings (id, enabled, title, notice, fulfilment, max_attempts, payment_mode, pay_account_type, pay_shortcode, pay_till, pay_passkey, pay_key, pay_secret, api_url, api_method, api_content_type, api_headers, api_body, api_success_path, api_success_value, updated_at) FROM stdin;
default	t	Buy data, minutes and sms	Instant delivery	ANDROID	5	CURRENT	paybill	\N	\N	\N	\N	\N	\N	POST	json	\N	\N	\N	\N	2026-10-15 12:29:54.146728+00
\.


--
-- Data for Name: sites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sites (id, name, slug, status, created_at, updated_at, notes) FROM stdin;
site_default	Manda	main	ACTIVE	2026-09-28 07:31:03.749764+00	2026-10-03 16:56:17.157812+00	\N
site_mussyqd8	Pate	pate	INACTIVE	2026-10-03 19:46:22.937815+00	2026-10-29 11:50:35.960213+00	Home
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: verification; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: vouchers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vouchers (id, code, package_id, site_id, status, batch_label, redeemed_by_customer_id, redeemed_payment_id, redeemed_at, expires_at, created_at, updated_at) FROM stdin;
vch_e75e396c65a7479e	3RWN5PLZEU	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:55.00118+00	2026-09-30 05:35:55.00118+00
vch_942444cdd6b64281	PZRSRTMFBW	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:55.4707+00	2026-09-30 05:35:55.4707+00
vch_2e5de447291b4e83	ST6UBU9553	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:55.945623+00	2026-09-30 05:35:55.945623+00
vch_f4d9acc753074343	U8FRS4A4QV	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:56.42061+00	2026-09-30 05:35:56.42061+00
vch_b00065f3fa164ee0	SK9LBZU6RM	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:56.88031+00	2026-09-30 05:35:56.88031+00
vch_aeb3f4d8bc744832	4X8JHSC6XP	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:57.351041+00	2026-09-30 05:35:57.351041+00
vch_4feccc59831b476f	T4B7N53CQT	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:57.816422+00	2026-09-30 05:35:57.816422+00
vch_22e7d7eef45c4b21	MAMV9P7SZQ	pkg_1h	site_default	AVAILABLE	Welcome Bonus	\N	\N	\N	\N	2026-09-30 05:35:58.285527+00	2026-09-30 05:35:58.285527+00
vch_680e3917608d4a1e	Q282LLVN4F	pkg_1h	site_default	REDEEMED	Welcome Bonus	cus_fdffae2012c9421c	pay_8db2aa9b87b64aec	2026-09-30 05:37:14.018304+00	\N	2026-09-30 05:35:58.756113+00	2026-09-30 05:37:14.018304+00
vch_b496cb52ac9c4078	YA6NPR8MBN	pkg_1h	site_default	REDEEMED	Welcome Bonus	cus_fdffae2012c9421c	pay_0710e86b0c9a49be	2026-10-10 13:54:44.552186+00	\N	2026-09-30 05:35:54.521155+00	2026-10-10 13:54:44.552186+00
\.


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (name);


--
-- Name: access_points access_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_points
    ADD CONSTRAINT access_points_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: ap_usage ap_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ap_usage
    ADD CONSTRAINT ap_usage_pkey PRIMARY KEY (ap_key, package_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: customer_notices customer_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notices
    ADD CONSTRAINT customer_notices_pkey PRIMARY KEY (id);


--
-- Name: customer_package_devices customer_package_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_package_devices
    ADD CONSTRAINT customer_package_devices_pkey PRIMARY KEY (customer_package_id, device_token);


--
-- Name: customer_packages customer_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_packages
    ADD CONSTRAINT customer_packages_pkey PRIMARY KEY (id);


--
-- Name: customer_sessions customer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_pkey PRIMARY KEY (device_token);


--
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: customers customers_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_referral_code_key UNIQUE (referral_code);


--
-- Name: hw_authorizations hw_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hw_authorizations
    ADD CONSTRAINT hw_authorizations_pkey PRIMARY KEY (id);


--
-- Name: hw_clients hw_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hw_clients
    ADD CONSTRAINT hw_clients_pkey PRIMARY KEY (id);


--
-- Name: isps isps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.isps
    ADD CONSTRAINT isps_pkey PRIMARY KEY (id);


--
-- Name: loyalty_ledger loyalty_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_ledger
    ADD CONSTRAINT loyalty_ledger_pkey PRIMARY KEY (id);


--
-- Name: mikrotik_users mikrotik_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikrotik_users
    ADD CONSTRAINT mikrotik_users_pkey PRIMARY KEY (username);


--
-- Name: mikrotiks mikrotiks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikrotiks
    ADD CONSTRAINT mikrotiks_pkey PRIMARY KEY (id);


--
-- Name: network_events network_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_events
    ADD CONSTRAINT network_events_pkey PRIMARY KEY (id);


--
-- Name: operators operators_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operators
    ADD CONSTRAINT operators_phone_key UNIQUE (phone);


--
-- Name: operators operators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operators
    ADD CONSTRAINT operators_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: package_sites package_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_sites
    ADD CONSTRAINT package_sites_pkey PRIMARY KEY (package_id, site_id);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: recovery_attempts recovery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_attempts
    ADD CONSTRAINT recovery_attempts_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: shop_devices shop_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_devices
    ADD CONSTRAINT shop_devices_pkey PRIMARY KEY (id);


--
-- Name: shop_orders shop_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_orders
    ADD CONSTRAINT shop_orders_pkey PRIMARY KEY (id);


--
-- Name: shop_products shop_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_products
    ADD CONSTRAINT shop_products_pkey PRIMARY KEY (id);


--
-- Name: shop_settings shop_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_settings
    ADD CONSTRAINT shop_settings_pkey PRIMARY KEY (id);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: sites sites_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_slug_key UNIQUE (slug);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_key UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: access_points_router_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_points_router_idx ON public.access_points USING btree (mikrotik_id);


--
-- Name: account_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "account_userId_idx" ON public.account USING btree ("userId");


--
-- Name: ap_usage_pkg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ap_usage_pkg_idx ON public.ap_usage USING btree (package_id);


--
-- Name: ap_usage_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ap_usage_seen_idx ON public.ap_usage USING btree (last_seen);


--
-- Name: cp_bound_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cp_bound_token_idx ON public.customer_packages USING btree (bound_device_token) WHERE (bound_device_token IS NOT NULL);


--
-- Name: cp_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cp_customer_idx ON public.customer_packages USING btree (customer_id, status);


--
-- Name: cp_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cp_expiry_idx ON public.customer_packages USING btree (expiry_time);


--
-- Name: cp_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cp_payment_idx ON public.customer_packages USING btree (payment_id);


--
-- Name: customer_notices_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_notices_customer_idx ON public.customer_notices USING btree (customer_id, seen_at, created_at DESC);


--
-- Name: customer_sessions_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_sessions_customer_idx ON public.customer_sessions USING btree (customer_id);


--
-- Name: hw_auth_mac_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hw_auth_mac_idx ON public.hw_authorizations USING btree (mac_norm, status);


--
-- Name: hw_auth_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hw_auth_token_idx ON public.hw_authorizations USING btree (token) WHERE (token IS NOT NULL);


--
-- Name: hw_auth_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hw_auth_user_idx ON public.hw_authorizations USING btree (username, status);


--
-- Name: hw_clients_mac_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hw_clients_mac_idx ON public.hw_clients USING btree (mac_norm, seen_at DESC);


--
-- Name: hw_clients_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hw_clients_token_idx ON public.hw_clients USING btree (device_token, seen_at DESC);


--
-- Name: isps_mikrotik_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX isps_mikrotik_idx ON public.isps USING btree (mikrotik_id);


--
-- Name: loyalty_ledger_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loyalty_ledger_customer_idx ON public.loyalty_ledger USING btree (customer_id);


--
-- Name: mikrotiks_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mikrotiks_one_primary ON public.mikrotiks USING btree (is_primary) WHERE (is_primary = true);


--
-- Name: mikrotiks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mikrotiks_status_idx ON public.mikrotiks USING btree (status);


--
-- Name: network_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX network_events_created_idx ON public.network_events USING btree (created_at DESC);


--
-- Name: otp_codes_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX otp_codes_phone_idx ON public.otp_codes USING btree (phone, created_at DESC);


--
-- Name: otp_codes_purpose_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX otp_codes_purpose_idx ON public.otp_codes USING btree (purpose, phone, created_at DESC);


--
-- Name: package_sites_site_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_sites_site_idx ON public.package_sites USING btree (site_id);


--
-- Name: payments_checkout_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_checkout_idx ON public.payments USING btree (checkout_request_id);


--
-- Name: payments_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_customer_idx ON public.payments USING btree (customer_id);


--
-- Name: payments_mpesa_tx_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_mpesa_tx_uidx ON public.payments USING btree (mpesa_transaction_id) WHERE (mpesa_transaction_id IS NOT NULL);


--
-- Name: payments_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_phone_idx ON public.payments USING btree (phone);


--
-- Name: payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_status_idx ON public.payments USING btree (status, created_at DESC);


--
-- Name: recovery_attempts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recovery_attempts_created_idx ON public.recovery_attempts USING btree (created_at DESC);


--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");


--
-- Name: sessions_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_customer_idx ON public.sessions USING btree (customer_id);


--
-- Name: sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_status_idx ON public.sessions USING btree (status);


--
-- Name: shop_orders_checkout_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_orders_checkout_idx ON public.shop_orders USING btree (checkout_request_id);


--
-- Name: shop_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_orders_status_idx ON public.shop_orders USING btree (fulfil_status, next_attempt_at);


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: vouchers_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vouchers_batch_idx ON public.vouchers USING btree (batch_label);


--
-- Name: vouchers_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vouchers_code_idx ON public.vouchers USING btree (code);


--
-- Name: vouchers_redeemed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vouchers_redeemed_idx ON public.vouchers USING btree (status, redeemed_at);


--
-- Name: vouchers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vouchers_status_idx ON public.vouchers USING btree (status, package_id);


--
-- Name: access_points access_points_mikrotik_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_points
    ADD CONSTRAINT access_points_mikrotik_id_fkey FOREIGN KEY (mikrotik_id) REFERENCES public.mikrotiks(id) ON DELETE CASCADE;


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: customer_notices customer_notices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notices
    ADD CONSTRAINT customer_notices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_package_devices customer_package_devices_customer_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_package_devices
    ADD CONSTRAINT customer_package_devices_customer_package_id_fkey FOREIGN KEY (customer_package_id) REFERENCES public.customer_packages(id);


--
-- Name: customer_packages customer_packages_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_packages
    ADD CONSTRAINT customer_packages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_packages customer_packages_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_packages
    ADD CONSTRAINT customer_packages_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: customer_packages customer_packages_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_packages
    ADD CONSTRAINT customer_packages_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: customer_sessions customer_sessions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customers customers_referred_by_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_referred_by_customer_id_fkey FOREIGN KEY (referred_by_customer_id) REFERENCES public.customers(id);


--
-- Name: customers customers_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: hw_authorizations hw_authorizations_customer_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hw_authorizations
    ADD CONSTRAINT hw_authorizations_customer_package_id_fkey FOREIGN KEY (customer_package_id) REFERENCES public.customer_packages(id) ON DELETE SET NULL;


--
-- Name: hw_authorizations hw_authorizations_router_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hw_authorizations
    ADD CONSTRAINT hw_authorizations_router_id_fkey FOREIGN KEY (router_id) REFERENCES public.mikrotiks(id) ON DELETE CASCADE;


--
-- Name: hw_clients hw_clients_router_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hw_clients
    ADD CONSTRAINT hw_clients_router_id_fkey FOREIGN KEY (router_id) REFERENCES public.mikrotiks(id) ON DELETE CASCADE;


--
-- Name: isps isps_mikrotik_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.isps
    ADD CONSTRAINT isps_mikrotik_id_fkey FOREIGN KEY (mikrotik_id) REFERENCES public.mikrotiks(id) ON DELETE SET NULL;


--
-- Name: isps isps_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.isps
    ADD CONSTRAINT isps_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: loyalty_ledger loyalty_ledger_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_ledger
    ADD CONSTRAINT loyalty_ledger_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: loyalty_ledger loyalty_ledger_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_ledger
    ADD CONSTRAINT loyalty_ledger_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: loyalty_ledger loyalty_ledger_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_ledger
    ADD CONSTRAINT loyalty_ledger_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: mikrotiks mikrotiks_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikrotiks
    ADD CONSTRAINT mikrotiks_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: package_sites package_sites_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_sites
    ADD CONSTRAINT package_sites_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;


--
-- Name: package_sites package_sites_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_sites
    ADD CONSTRAINT package_sites_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: packages packages_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: payments payments_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: payments payments_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: sessions sessions_customer_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_customer_package_id_fkey FOREIGN KEY (customer_package_id) REFERENCES public.customer_packages(id);


--
-- Name: sessions sessions_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: vouchers vouchers_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: vouchers vouchers_redeemed_by_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_redeemed_by_customer_id_fkey FOREIGN KEY (redeemed_by_customer_id) REFERENCES public.customers(id);


--
-- Name: vouchers vouchers_redeemed_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_redeemed_payment_id_fkey FOREIGN KEY (redeemed_payment_id) REFERENCES public.payments(id);


--
-- Name: vouchers vouchers_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 5nsI6EquzTTRqpBHXrLjOvEnBi4cQI1TeadPo66Yj6ZocjAOTPt2eznLtNKSKpQ

