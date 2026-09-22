alter table cbt_pack_acl add column if not exists can_manage_passwords boolean default false;
alter table cbt_pack_acl add column if not exists can_grant boolean default false;
