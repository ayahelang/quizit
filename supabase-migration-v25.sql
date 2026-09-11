-- Silverhawk CBT v2.5 — langganan + bukti transfer (aman dijalankan ulang)

alter table cbt_admins add column if not exists subscription_expires_at timestamptz default null;
alter table cbt_admins add column if not exists transfer_proof_url text default '';
alter table cbt_admins add column if not exists transfer_note text default '';

-- null subscription_expires_at = tidak expired (default)
-- active = false → tidak bisa login; paket miliknya disembunyikan dari siswa saat runtime
