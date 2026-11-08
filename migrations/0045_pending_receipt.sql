-- The M-Pesa receipt claimed by a callback that could not be confirmed with Safaricom yet.
-- The payment stays PENDING (never trusted on the callback alone) but the receipt is kept, so when the
-- payment is confirmed a moment later it is saved with its receipt instead of being left blank.
alter table payments add column if not exists pending_receipt text;
