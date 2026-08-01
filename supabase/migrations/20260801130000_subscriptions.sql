-- Tracks LemonSqueezy subscription status per user. Written only by the
-- lemonsqueezy-webhook Edge Function (via the service_role key, which
-- bypasses RLS) -- the app itself only ever reads a user's own row, to
-- decide whether to show them as Free or Premium.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null,                    -- active / on_trial / cancelled / expired / past_due / unpaid / paused
  variant_id text,                         -- which plan (monthly/yearly variant id from LemonSqueezy)
  lemonsqueezy_subscription_id text,
  lemonsqueezy_customer_id text,
  renews_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Users may read their OWN subscription row (to show Free vs Premium in the UI)
-- but cannot insert/update/delete it themselves -- only the webhook function
-- (service_role, bypasses RLS entirely) ever writes to this table.
create policy "Users can read their own subscription"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);
