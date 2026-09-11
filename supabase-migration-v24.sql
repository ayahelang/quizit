-- Silverhawk CBT v2.4 migration — jalankan di SQL Editor (aman dijalankan ulang)

-- Admin: nama tampilan
alter table cbt_admins add column if not exists display_name text default '';

-- Packs: pemilik
alter table cbt_packs add column if not exists owner_username text default 'main';

-- ACL: hak admin tambahan atas paket milik orang lain
create table if not exists cbt_pack_acl (
  id uuid primary key default gen_random_uuid(),
  pack_id text not null references cbt_packs(id) on delete cascade,
  grantee_username text not null,
  can_rename boolean not null default false,
  can_edit_items boolean not null default false,
  can_manage_participants boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  unique (pack_id, grantee_username)
);

-- Peserta per paket (kosong = semua siswa kelas, kompatibel lama)
create table if not exists cbt_pack_participants (
  id uuid primary key default gen_random_uuid(),
  pack_id text not null references cbt_packs(id) on delete cascade,
  student_class text not null default '',
  student_name text not null,
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pack_id, student_class, student_name)
);

create index if not exists idx_cbt_pack_acl_user on cbt_pack_acl(grantee_username);
create index if not exists idx_cbt_pack_part_pack on cbt_pack_participants(pack_id);

alter table cbt_pack_acl enable row level security;
alter table cbt_pack_participants enable row level security;

drop policy if exists "cbt_pack_acl_all" on cbt_pack_acl;
create policy "cbt_pack_acl_all" on cbt_pack_acl for all using (true) with check (true);

drop policy if exists "cbt_pack_part_all" on cbt_pack_participants;
create policy "cbt_pack_part_all" on cbt_pack_participants for all using (true) with check (true);

-- backfill owner untuk paket lama
update cbt_packs set owner_username = 'main' where owner_username is null or owner_username = '';
