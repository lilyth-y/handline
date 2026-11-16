-- Referral source for anonymous palm_features rows (e.g. ?ref=blog from the Naver blog post, ref=share from shared result links).
-- Applied 2026-11-16 via the Supabase MCP (migration palm_features_ref), project fxyffslmgnxznptbobee.
alter table public.palm_features add column ref text null
  constraint palm_features_ref_chk check (ref is null or ref ~ '^[a-z0-9_-]{1,20}$');
-- anon keeps INSERT-only, column-scoped privileges; add the new column to that list.
grant insert (ref) on public.palm_features to anon;
notify pgrst, 'reload schema';
