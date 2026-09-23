
alter table cbt_pack_passwords add column if not exists valid_from timestamptz;
alter table cbt_pack_passwords add column if not exists scope_institution text;
alter table cbt_pack_passwords add column if not exists scope_class text;
alter table cbt_pack_passwords add column if not exists scope_users jsonb default '[]'::jsonb;
alter table cbt_exam_tokens add column if not exists first_used_at timestamptz;
alter table cbt_exam_tokens add column if not exists duration_minutes_from_first_use int;
