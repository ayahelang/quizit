-- Silverhawk CBT — jalankan di Supabase SQL Editor (gratis)
-- Project Settings → API: salin URL + anon key ke config.json

-- Admin tambahan (dikelola admin utama)
create table if not exists cbt_admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null default 'secondary' check (role in ('main', 'secondary')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Hasil ujian (suplemen / alternatif Sheet)
create table if not exists cbt_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_name text not null,
  student_class text not null,
  pack_id text default '',
  pack_title text default '',
  score int default 0,
  total int default 0,
  percent int default 0,
  time_used_seconds int default 0,
  auto_submit boolean default false,
  tab_switch_count int default 0,
  essays jsonb default '[]'::jsonb
);

-- Detail jawaban per butir (untuk analisis butir soal)
create table if not exists cbt_answer_items (
  id uuid primary key default gen_random_uuid(),
  result_id uuid references cbt_results(id) on delete cascade,
  pack_id text default '',
  question_id text not null,
  question_text text default '',
  selected_answer text default '',
  correct_answer text default '',
  is_correct boolean default false,
  created_at timestamptz not null default now()
);

-- Paket soal yang di-upload admin (JSON)
create table if not exists cbt_packs (
  id text primary key,
  title text not null,
  subject text default '',
  description text default '',
  duration_minutes int default 60,
  practice_duration_minutes int default 30,
  questions jsonb not null default '[]'::jsonb,
  essays jsonb not null default '[]'::jsonb,
  practice_questions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text default ''
);

-- Index bantu
create index if not exists idx_cbt_results_pack on cbt_results(pack_id);
create index if not exists idx_cbt_answer_pack on cbt_answer_items(pack_id);
create index if not exists idx_cbt_answer_qid on cbt_answer_items(pack_id, question_id);

-- RLS: untuk demo sekolah, izinkan anon key (kunci tetap disembunyikan di config yang hanya Anda edit).
-- Di produksi, pertimbangkan Supabase Auth + policy lebih ketat.
alter table cbt_admins enable row level security;
alter table cbt_results enable row level security;
alter table cbt_answer_items enable row level security;
alter table cbt_packs enable row level security;

create policy "cbt_admins_all" on cbt_admins for all using (true) with check (true);
create policy "cbt_results_all" on cbt_results for all using (true) with check (true);
create policy "cbt_answer_all" on cbt_answer_items for all using (true) with check (true);
create policy "cbt_packs_all" on cbt_packs for all using (true) with check (true);

-- Pengaturan proctoring (fullscreen + alarm)
create table if not exists cbt_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table cbt_settings enable row level security;
create policy "cbt_settings_all" on cbt_settings for all using (true) with check (true);

insert into cbt_settings (key, value) values
  ('proctoring', '{"forceFullscreen": true, "cheatAlarmSound": true}'::jsonb)
on conflict (key) do nothing;
