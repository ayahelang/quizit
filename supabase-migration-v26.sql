-- v2.6 Master kelas & peserta (aman dijalankan ulang)

create table if not exists cbt_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text not null default '',
  created_by text not null default 'main',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists cbt_class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references cbt_classes(id) on delete cascade,
  participant_name text not null,
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (class_id, participant_name)
);

-- peserta paket: tautkan ke class_id + nama (kompatibel data lama)
alter table cbt_pack_participants add column if not exists class_id uuid default null;
alter table cbt_pack_participants add column if not exists member_id uuid default null;

create index if not exists idx_cbt_classes_created on cbt_classes(created_by);
create index if not exists idx_cbt_members_class on cbt_class_members(class_id);

alter table cbt_classes enable row level security;
alter table cbt_class_members enable row level security;
drop policy if exists "cbt_classes_all" on cbt_classes;
create policy "cbt_classes_all" on cbt_classes for all using (true) with check (true);
drop policy if exists "cbt_members_all" on cbt_class_members;
create policy "cbt_members_all" on cbt_class_members for all using (true) with check (true);
