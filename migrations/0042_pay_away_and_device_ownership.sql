-- Paying from the link while away from the router.
--   off   = old behaviour (package starts, clock runs, phone is not online)
--   block = refuse the payment until the phone has recently been seen at the router (default)
--   queue = take the payment but do not start the clock until the phone reaches the router
alter table settings add column if not exists pay_away_mode text not null default 'block';

-- Marks a payment taken while the phone was not at the router (only used in 'queue' mode).
alter table payments add column if not exists away boolean not null default false;
