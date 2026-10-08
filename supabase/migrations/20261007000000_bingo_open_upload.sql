-- ═══════════════════════════════════════════════════
-- Photo bingo: anyone on the team can snap any tile
-- ═══════════════════════════════════════════════════
--
-- Tiles are no longer drawn to one member each. Whoever can see a
-- team's card (its members, and admins) can put a photo on any tile,
-- replace it or clear it. The random draw and the on-behalf flag go.

-- ── Who may upload ──────────────────────────────────
-- Same signature, so the bingo_shots and storage policies keep working.
create or replace function public.can_upload_bingo(p_team text, p_tile text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_tile ~ '^[0-8]$', false) and public.can_see_bingo(p_team);
$$;

-- ── Uploader stamp, without the on-behalf check ─────
create or replace function public.stamp_bingo_shot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  public.profiles%rowtype;
begin
  select * into me from public.profiles where id = auth.uid();

  new.uploader_id := auth.uid();
  new.created_at := now();
  new.uploader_name := coalesce(nullif(trim(me.full_name), ''), split_part(me.email, '@', 1), 'Trip member');
  return new;
end;
$$;

alter table public.bingo_shots drop column on_behalf;

-- ── The random draw ─────────────────────────────────
drop function public.bingo_card(text);
drop table public.bingo_assignments;

-- Policy names still say "Assigned members"; rename to match. The two
-- on storage.objects keep their old names: that table belongs to
-- Supabase's storage role, so altering its policies fails with "must be
-- owner of table objects". They call can_upload_bingo, so they follow
-- the new rule regardless.
alter policy "Assigned members can add a bingo shot" on public.bingo_shots
  rename to "Team members can add a bingo shot";
alter policy "Assigned members can remove a bingo shot" on public.bingo_shots
  rename to "Team members can remove a bingo shot";
