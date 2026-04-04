-- Correr en Supabase SQL Editor para habilitar el bot de WhatsApp

create table if not exists profiles (
  user_id uuid references auth.users(id) on delete cascade primary key,
  phone text unique,
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles for all using (auth.uid() = user_id);
