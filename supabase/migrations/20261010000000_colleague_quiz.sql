-- ═══════════════════════════════════════════════════
-- Know your colleagues: questions, who answers which, and their answers
-- ═══════════════════════════════════════════════════
--
-- Stamp 7 of the treasure hunt. Every participant answered five of the
-- thirty questions about themselves in one Microsoft Form; a team is
-- then quizzed on the answers of people on the other teams.
--
-- colleague_questions  the thirty questions, numbered as in the form
-- colleague_answers    one row per participant per assigned question:
--                      the committee's fixed allocation
--                      (Colleague_Quiz_Allocation.xlsx, sections 2–24),
--                      the person's answer once the form is back, and the
--                      wrong options shown beside it
--
-- Wrong options are stored rather than drawn each time, so every team
-- sees the same choices and the committee can check and fix them.
--
-- Everyone signed in reads both tables (the game needs the answers to
-- mark a pick); only admins write, as with hunt_config.

create table public.colleague_questions (
  no        smallint primary key check (no between 1 and 30),
  question  text not null unique,
  category  text not null check (category in ('preference', 'funny', 'personality', 'hypothetical'))
);

create table public.colleague_answers (
  id             bigint generated always as identity primary key,
  person         text not null,
  team           text not null check (team in ('team-ruby', 'team-sapphire', 'team-emerald', 'team-diamond', 'team-pearl')),
  position       smallint not null check (position between 1 and 5),
  question_no    smallint not null references public.colleague_questions (no),
  answer         text,
  wrong_options  text[] not null default '{}',
  updated_at     timestamptz not null default now(),
  unique (person, position),
  unique (person, question_no)
);

alter table public.colleague_questions enable row level security;
alter table public.colleague_answers enable row level security;

create policy "Members can read the colleague questions"
  on public.colleague_questions for select
  to authenticated
  using (true);

create policy "Members can read the colleague answers"
  on public.colleague_answers for select
  to authenticated
  using (true);

-- Answers and options only; the allocation itself is fixed by the form.
create policy "Admins can edit the colleague answers"
  on public.colleague_answers for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create function public.touch_colleague_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_colleague_answer
  before update on public.colleague_answers
  for each row execute function public.touch_colleague_answer();

insert into public.colleague_questions (no, question, category) values
  (1, 'What is my favourite food?', 'preference'),
  (2, 'What is one thing that can instantly annoy me?', 'funny'),
  (3, 'What is my favourite drink?', 'preference'),
  (4, 'If I suddenly got RM1 million, what would I buy first?', 'hypothetical'),
  (5, 'What is my favourite colour?', 'preference'),
  (6, 'If I could swap lives with one colleague for a day, who would I choose?', 'funny'),
  (7, 'What is my favourite movie or TV series?', 'preference'),
  (8, 'What is something I am surprisingly good at?', 'personality'),
  (9, 'What is my favourite hobby?', 'preference'),
  (10, 'What is my most-used phrase or word?', 'funny'),
  (11, 'What is my dream travel destination?', 'preference'),
  (12, 'If I were arrested, what would you most likely guess I did?', 'funny'),
  (13, 'What is my favourite type of music or favourite song?', 'preference'),
  (14, 'What is the one thing I would take with me to a deserted island?', 'hypothetical'),
  (15, 'What is my favourite restaurant or food place?', 'preference'),
  (16, 'If I could teleport anywhere right now, where would I go?', 'hypothetical'),
  (17, 'What is my favourite sport or activity?', 'preference'),
  (18, 'What is something I am terrible at but still keep doing?', 'funny'),
  (19, 'What is my favourite season or type of weather?', 'preference'),
  (20, 'What is the most embarrassing thing I have ever done?', 'funny'),
  (21, 'What is my dream car?', 'preference'),
  (22, 'What would I buy first after getting a huge salary increase?', 'hypothetical'),
  (23, 'What is my favourite childhood cartoon or game?', 'preference'),
  (24, 'What is one thing I would never spend money on?', 'personality'),
  (25, 'Am I more of a morning person or night owl?', 'personality'),
  (26, 'What is the most likely thing I would do if I had a completely free day?', 'personality'),
  (27, 'What is my favourite holiday destination I''ve visited?', 'preference'),
  (28, 'If I had to live without my phone for a week, what would I miss the most?', 'hypothetical'),
  (29, 'What is something I always carry with me?', 'personality'),
  (30, 'What is one random fact about me that most colleagues probably don''t know?', 'personality');

-- The allocation, in form order (section 2 Nicholas … section 24 Huai Yu).
insert into public.colleague_answers (person, team, position, question_no) values
  ('Nicholas', 'team-ruby', 1, 14),
  ('Nicholas', 'team-ruby', 2, 18),
  ('Nicholas', 'team-ruby', 3, 23),
  ('Nicholas', 'team-ruby', 4, 6),
  ('Nicholas', 'team-ruby', 5, 11),
  ('Helmi', 'team-sapphire', 1, 16),
  ('Helmi', 'team-sapphire', 2, 6),
  ('Helmi', 'team-sapphire', 3, 23),
  ('Helmi', 'team-sapphire', 4, 3),
  ('Helmi', 'team-sapphire', 5, 18),
  ('Eleora', 'team-emerald', 1, 24),
  ('Eleora', 'team-emerald', 2, 19),
  ('Eleora', 'team-emerald', 3, 13),
  ('Eleora', 'team-emerald', 4, 8),
  ('Eleora', 'team-emerald', 5, 12),
  ('Hairul', 'team-diamond', 1, 15),
  ('Hairul', 'team-diamond', 2, 27),
  ('Hairul', 'team-diamond', 3, 22),
  ('Hairul', 'team-diamond', 4, 24),
  ('Hairul', 'team-diamond', 5, 28),
  ('Aiman', 'team-pearl', 1, 12),
  ('Aiman', 'team-pearl', 2, 22),
  ('Aiman', 'team-pearl', 3, 20),
  ('Aiman', 'team-pearl', 4, 7),
  ('Aiman', 'team-pearl', 5, 19),
  ('Chiew', 'team-ruby', 1, 3),
  ('Chiew', 'team-ruby', 2, 4),
  ('Chiew', 'team-ruby', 3, 20),
  ('Chiew', 'team-ruby', 4, 14),
  ('Chiew', 'team-ruby', 5, 15),
  ('Shahrul', 'team-sapphire', 1, 16),
  ('Shahrul', 'team-sapphire', 2, 25),
  ('Shahrul', 'team-sapphire', 3, 10),
  ('Shahrul', 'team-sapphire', 4, 1),
  ('Shahrul', 'team-sapphire', 5, 5),
  ('Aidan', 'team-emerald', 1, 11),
  ('Aidan', 'team-emerald', 2, 17),
  ('Aidan', 'team-emerald', 3, 18),
  ('Aidan', 'team-emerald', 4, 9),
  ('Aidan', 'team-emerald', 5, 26),
  ('Asma''', 'team-diamond', 1, 8),
  ('Asma''', 'team-diamond', 2, 12),
  ('Asma''', 'team-diamond', 3, 15),
  ('Asma''', 'team-diamond', 4, 27),
  ('Asma''', 'team-diamond', 5, 29),
  ('Yu Han', 'team-pearl', 1, 12),
  ('Yu Han', 'team-pearl', 2, 17),
  ('Yu Han', 'team-pearl', 3, 25),
  ('Yu Han', 'team-pearl', 4, 30),
  ('Yu Han', 'team-pearl', 5, 15),
  ('Amir', 'team-ruby', 1, 2),
  ('Amir', 'team-ruby', 2, 6),
  ('Amir', 'team-ruby', 3, 28),
  ('Amir', 'team-ruby', 4, 13),
  ('Amir', 'team-ruby', 5, 27),
  ('Carmen', 'team-sapphire', 1, 24),
  ('Carmen', 'team-sapphire', 2, 21),
  ('Carmen', 'team-sapphire', 3, 18),
  ('Carmen', 'team-sapphire', 4, 4),
  ('Carmen', 'team-sapphire', 5, 5),
  ('Ariff', 'team-emerald', 1, 22),
  ('Ariff', 'team-emerald', 2, 10),
  ('Ariff', 'team-emerald', 3, 19),
  ('Ariff', 'team-emerald', 4, 23),
  ('Ariff', 'team-emerald', 5, 9),
  ('Aina', 'team-diamond', 1, 1),
  ('Aina', 'team-diamond', 2, 7),
  ('Aina', 'team-diamond', 3, 16),
  ('Aina', 'team-diamond', 4, 11),
  ('Aina', 'team-diamond', 5, 30),
  ('Ragina', 'team-pearl', 1, 9),
  ('Ragina', 'team-pearl', 2, 8),
  ('Ragina', 'team-pearl', 3, 13),
  ('Ragina', 'team-pearl', 4, 30),
  ('Ragina', 'team-pearl', 5, 2),
  ('Ruby', 'team-ruby', 1, 6),
  ('Ruby', 'team-ruby', 2, 23),
  ('Ruby', 'team-ruby', 3, 9),
  ('Ruby', 'team-ruby', 4, 14),
  ('Ruby', 'team-ruby', 5, 8),
  ('Jord', 'team-sapphire', 1, 1),
  ('Jord', 'team-sapphire', 2, 29),
  ('Jord', 'team-sapphire', 3, 20),
  ('Jord', 'team-sapphire', 4, 5),
  ('Jord', 'team-sapphire', 5, 25),
  ('Raf', 'team-emerald', 1, 3),
  ('Raf', 'team-emerald', 2, 28),
  ('Raf', 'team-emerald', 3, 4),
  ('Raf', 'team-emerald', 4, 21),
  ('Raf', 'team-emerald', 5, 2),
  ('Kevin', 'team-diamond', 1, 26),
  ('Kevin', 'team-diamond', 2, 7),
  ('Kevin', 'team-diamond', 3, 27),
  ('Kevin', 'team-diamond', 4, 10),
  ('Kevin', 'team-diamond', 5, 2),
  ('Jay', 'team-pearl', 1, 20),
  ('Jay', 'team-pearl', 2, 26),
  ('Jay', 'team-pearl', 3, 21),
  ('Jay', 'team-pearl', 4, 11),
  ('Jay', 'team-pearl', 5, 22),
  ('Liyana', 'team-sapphire', 1, 1),
  ('Liyana', 'team-sapphire', 2, 4),
  ('Liyana', 'team-sapphire', 3, 5),
  ('Liyana', 'team-sapphire', 4, 29),
  ('Liyana', 'team-sapphire', 5, 26),
  ('Ashley', 'team-emerald', 1, 25),
  ('Ashley', 'team-emerald', 2, 16),
  ('Ashley', 'team-emerald', 3, 28),
  ('Ashley', 'team-emerald', 4, 17),
  ('Ashley', 'team-emerald', 5, 3),
  ('Huai Yu', 'team-pearl', 1, 30),
  ('Huai Yu', 'team-pearl', 2, 13),
  ('Huai Yu', 'team-pearl', 3, 10),
  ('Huai Yu', 'team-pearl', 4, 7),
  ('Huai Yu', 'team-pearl', 5, 14);
