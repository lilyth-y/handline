-- Supabase project "handline" (ref fxyffslmgnxznptbobee, ap-northeast-2 Seoul, free plan, org lilyth-dog's Org)
-- Anonymous palm-line measurements from https://hoa-palm.vercel.app — numbers only. No photos, IP, user ids; date only.
-- Applied 2026-11-16 via the Supabase MCP (migrations create_palm_features + palm_features_daily_cap).
create table public.palm_features (
  id bigint generated always as identity primary key,
  created_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  app_version text not null check (char_length(app_version) between 1 and 32),
  model_version text not null check (char_length(model_version) between 1 and 32),
  calib_version text not null check (char_length(calib_version) between 1 and 32),
  feature_version smallint not null check (feature_version between 1 and 100),
  features jsonb not null check (jsonb_typeof(features) = 'object' and features ? 'lines' and features ? 'relations' and pg_column_size(features) <= 8192),
  stars jsonb not null check (jsonb_typeof(stars) = 'object' and pg_column_size(stars) <= 512),
  type_id text not null check (type_id in ('gold','fire','moon','star','wind','sun','cloud','flower','rock','wave','lightning','galaxy')),
  image_w integer not null check (image_w between 16 and 4096),
  image_h integer not null check (image_h between 16 and 4096),
  lines_found smallint not null check (lines_found between 0 and 4),
  client_hint text not null check (client_hint in ('kakao','mobile','desktop','other')),
  is_test boolean not null default false
);
alter table public.palm_features enable row level security;
-- anon (publishable key in the web app): INSERT only, and only these columns (cannot set id / created_on).
revoke all on table public.palm_features from anon, authenticated;
grant insert (app_version, model_version, calib_version, feature_version, features, stars, type_id, image_w, image_h,
              lines_found, client_hint, is_test) on public.palm_features to anon;
create policy "anon insert only" on public.palm_features for insert to anon with check (true);  -- column checks above do the validation
-- no SELECT / UPDATE / DELETE policy or grant for anon/authenticated -> denied. Reads use the service key server-side only.

-- abuse guard: at most 5,000 rows per (Seoul) day
create index palm_features_created_on_idx on public.palm_features (created_on);
create or replace function public.palm_features_daily_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.palm_features where created_on = new.created_on) >= 5000 then
    raise exception 'daily cap reached' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function public.palm_features_daily_cap() from public, anon, authenticated;
create trigger palm_features_daily_cap before insert on public.palm_features
  for each row execute function public.palm_features_daily_cap();
