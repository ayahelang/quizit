# Panduan Supabase Realtime — QuizIT / CBT

Aplikasi memakai **Supabase REST**. Data peserta, kelas, paket, token **sudah dari database** (bukan JSON di GitHub), jadi perubahan admin langsung terbaca saat halaman dimuat ulang / tab dibuka.

## Aktifkan Realtime (opsional, update tanpa refresh manual)

1. Buka: https://supabase.com/dashboard/project/edaujcxmncoslykyddwf/database/publications
2. Atau **Database → Replication**
3. Pastikan publication `supabase_realtime` memuat tabel:
   - `cbt_classes`
   - `cbt_class_members`
   - `cbt_packs`
   - `cbt_pack_participants`
   - `cbt_exam_tokens`
   - `cbt_pack_passwords`
4. **SQL Editor** (jika perlu):

```sql
alter publication supabase_realtime add table cbt_classes;
alter publication supabase_realtime add table cbt_class_members;
alter publication supabase_realtime add table cbt_packs;
alter publication supabase_realtime add table cbt_pack_participants;
alter publication supabase_realtime add table cbt_exam_tokens;
```

5. Di client, versi berikutnya bisa subscribe channel; saat ini refresh otomatis saat buka tab admin + datalist diisi ulang dari DB.

## Yang TIDAK pakai JSON runtime
- Kelas & peserta master → `cbt_classes` / `cbt_class_members`
- Peserta per paket → `cbt_pack_participants`
- Token → `cbt_exam_tokens`
- Password paket → `cbt_pack_passwords`

File `students.json` / `catalog.json` hanya **seed awal** (impor / daftar paket file), bukan sumber realtime.

## Halaman login peserta
Daftar kelas & nama diambil dari peserta paket di database (setelah admin Simpan Pilihan Peserta Paket).
