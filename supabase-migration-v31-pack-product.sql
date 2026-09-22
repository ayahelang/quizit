alter table cbt_packs add column if not exists product_id text default null;
update cbt_packs set product_id = 'quizit' where id like 'quizit-%';
update cbt_packs set product_id = 'cbt' where id not like 'quizit-%' and (product_id is null or product_id = '');
alter table cbt_classes add column if not exists product_id text default null;
