-- v2.7 Password pembuka paket (multi + kadaluarsa)

create table if not exists cbt_pack_passwords (
  id uuid primary key default gen_random_uuid(),
  pack_id text not null references cbt_packs(id) on delete cascade,
  label text not null default '',
  password_hash text not null,
  expires_at timestamptz default null,
  duration_minutes int default null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text default ''
);

create index if not exists idx_cbt_pack_pw_pack on cbt_pack_passwords(pack_id);

alter table cbt_pack_passwords enable row level security;
drop policy if exists "cbt_pack_pw_all" on cbt_pack_passwords;
create policy "cbt_pack_pw_all" on cbt_pack_passwords for all using (true) with check (true);
