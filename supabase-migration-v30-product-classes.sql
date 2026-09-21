-- Isolasi kelas per produk (quizit vs cbt)
alter table cbt_classes add column if not exists product_id text default null;
create index if not exists idx_cbt_classes_product on cbt_classes(product_id);

-- Tandai kelas lama tanpa product_id sebagai milik CBT agar tidak muncul di QuizIT
update cbt_classes set product_id = 'cbt' where product_id is null;
