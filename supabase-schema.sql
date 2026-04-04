-- FinanzasApp — Schema
-- Correr en: Supabase Dashboard → SQL Editor → New Query

-- TRANSACCIONES
create table if not exists transactions (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount numeric not null,
  description text not null,
  category text not null,
  account text not null,
  to_account text,
  method text not null,
  type text not null,
  income_type text,
  is_recurring boolean default false,
  date text not null,
  created_at timestamptz default now()
);
alter table transactions enable row level security;
create policy "own transactions" on transactions for all using (auth.uid() = user_id);

-- CUENTAS
create table if not exists accounts (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  provider text not null,
  initial_balance numeric not null default 0,
  limit_amount numeric,
  type text not null,
  currency text not null default 'ARS',
  created_at timestamptz default now()
);
alter table accounts enable row level security;
create policy "own accounts" on accounts for all using (auth.uid() = user_id);

-- PRESUPUESTOS
create table if not exists budgets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null,
  limit_amount numeric not null
);
alter table budgets enable row level security;
create policy "own budgets" on budgets for all using (auth.uid() = user_id);
