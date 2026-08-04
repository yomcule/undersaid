-- Who on our side touched the money: who spent it (expense) or who received
-- it (income). Free text rather than a profiles FK — cash sometimes moves
-- through people who never get a Michi login (a tailor's runner, a courier).
alter table transactions
  add column person_name text;

comment on column transactions.person_name is
  'Who handled this movement of cash on our side — spender for an expense, receiver for income. Free text, not a user reference.';
