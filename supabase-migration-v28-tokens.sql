-- v2.8 Token ujian QuizIT/CBT (shared DB)
create table if not exists cbt_exam_tokens (
  id uuid primary key default gen_random_uuid(),
  token_code text not null unique,
  product_id text not null default 'quizit',
  label text not null default '',
  scope_type text not null default 'single_user', -- single_user | class | multi_user | open
  allowed_users jsonb not null default '[]'::jsonb,
  allowed_class text default null,
  pack_ids jsonb not null default '[]'::jsonb, -- empty = all packs product
  max_uses int default 1,
  used_count int not null default 0,
  transfer_amount int default 0,
  transfer_note text default '',
  expires_at timestamptz default null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text default '',
  last_used_at timestamptz default null,
  last_used_by text default ''
);

create table if not exists cbt_token_usages (
  id uuid primary key default gen_random_uuid(),
  token_id uuid references cbt_exam_tokens(id) on delete cascade,
  token_code text,
  user_name text,
  user_email text,
  pack_id text,
  used_at timestamptz not null default now(),
  meta jsonb default '{}'::jsonb
);

create table if not exists cbt_certificates (
  id uuid primary key default gen_random_uuid(),
  product_id text default 'quizit',
  pack_id text,
  pack_title text,
  participant_name text,
  participant_email text default '',
  class_name text default '',
  score_pg numeric,
  score_total text,
  predicate text,
  issued_at timestamptz default now(),
  token_code text default ''
);

alter table cbt_exam_tokens enable row level security;
alter table cbt_token_usages enable row level security;
alter table cbt_certificates enable row level security;
drop policy if exists "cbt_tokens_all" on cbt_exam_tokens;
create policy "cbt_tokens_all" on cbt_exam_tokens for all using (true) with check (true);
drop policy if exists "cbt_token_usages_all" on cbt_token_usages;
create policy "cbt_token_usages_all" on cbt_token_usages for all using (true) with check (true);
drop policy if exists "cbt_certs_all" on cbt_certificates;
create policy "cbt_certs_all" on cbt_certificates for all using (true) with check (true);

-- optional product_id on packs
alter table cbt_packs add column if not exists product_id text default null;
