
alter table cbt_admins add column if not exists google_email text default null;
create unique index if not exists idx_cbt_admins_google_email on cbt_admins (lower(google_email)) where google_email is not null and google_email <> '';
