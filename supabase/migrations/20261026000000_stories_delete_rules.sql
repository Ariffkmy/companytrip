-- ═══════════════════════════════════════════════════
-- Stories: the poster, or an admin, can delete a story
-- ═══════════════════════════════════════════════════
--
-- A draft of 20261025000000_stories.sql briefly limited deletion to
-- the poster only. This puts the delete rules into their final form
-- whichever version was run, and is safe to run more than once.

drop policy if exists "Posters can delete their own stories" on public.stories;
drop policy if exists "Posters and admins can delete stories" on public.stories;
create policy "Posters and admins can delete stories"
  on public.stories for delete
  to authenticated
  using (uploader_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Posters can delete their own story files" on storage.objects;
drop policy if exists "Posters and admins can delete story files" on storage.objects;
create policy "Posters and admins can delete story files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'stories'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );
