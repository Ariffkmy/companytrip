-- ═══════════════════════════════════════════════════
-- Stories: live updates
-- ═══════════════════════════════════════════════════
--
-- A story someone posts (or deletes) shows on everyone's Album page
-- straight away, without leaving the page and coming back
-- (src/components/StoriesBar.jsx). Safe to re-run.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stories'
  ) then
    alter publication supabase_realtime add table public.stories;
  end if;
end;
$$;
