-- Exposing a schema in Supabase's Data API settings only tells PostgREST to
-- look at it -- the underlying Postgres roles (anon, authenticated,
-- service_role) still need explicit grants on it, same as `public` gets by
-- default. RLS (already enabled + forced on every store.* table) remains the
-- real access boundary for anon/authenticated; these grants just make the
-- schema and its objects visible to those roles at all.

grant usage on schema store to anon, authenticated, service_role;
grant all on all tables in schema store to anon, authenticated, service_role;
grant all on all routines in schema store to anon, authenticated, service_role;
grant all on all sequences in schema store to anon, authenticated, service_role;

alter default privileges in schema store grant all on tables to anon, authenticated, service_role;
alter default privileges in schema store grant all on routines to anon, authenticated, service_role;
alter default privileges in schema store grant all on sequences to anon, authenticated, service_role;
