-- API LX BetWin: one provider tx id for stake + win in a single callback.
alter table provider_transactions drop constraint if exists provider_transactions_kind_check;
alter table provider_transactions add constraint provider_transactions_kind_check
  check (kind in ('debit', 'credit', 'rollback', 'betwin'));
alter table provider_transactions add column if not exists win_amount_minor bigint
  check (win_amount_minor is null or win_amount_minor >= 0);
