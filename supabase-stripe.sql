-- Correr en Supabase SQL Editor para habilitar pagos con Stripe
-- (requiere haber corrido supabase-schema.sql y supabase-whatsapp.sql antes)

alter table profiles
  add column if not exists no_ads boolean default false,
  add column if not exists whatsapp_active boolean default false,
  add column if not exists whatsapp_subscription_id text;
