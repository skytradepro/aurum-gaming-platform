-- 0020: daily gift. Once a day (Tunis time) a player can open the gift on the gift page and receives a small credit
-- chosen at random between the Super Admin's minimum and maximum. One gift per player per day is guaranteed by the
-- ledger itself (idempotency scope "gift:<player>", key "day:<YYYY-MM-DD>"); the Super Admin turns it on and off.
insert into ledger_entry_types
  (code, direction, wallet_kind, requires_reason, staff_only, blocked_when_suspended, description) values
  ('daily_gift', 1, 'main', false, false, true, 'Daily gift opened by the player on the gift page');
