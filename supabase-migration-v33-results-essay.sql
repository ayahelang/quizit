
alter table cbt_results add column if not exists essay_score numeric;
alter table cbt_results add column if not exists essay_score_max numeric;
alter table cbt_results add column if not exists started_at timestamptz;
alter table cbt_results add column if not exists cheat_log jsonb default '[]'::jsonb;
alter table cbt_results add column if not exists institution text default '';
alter table cbt_results add column if not exists mc_answers jsonb default '[]'::jsonb;
alter table cbt_results add column if not exists essays jsonb default '[]'::jsonb;
