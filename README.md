# QuizIT (quizit.silverhawk.web.id)

Versi fokus **tes materi IT** (sertifikasi & skill kantor).

## Database bersama dengan CBT
Gunakan **Supabase project yang sama** dengan `cbt.silverhawk.web.id`:
- `supabaseUrl` dan `supabaseAnonKey` di `config.json` diisi **identik** dengan CBT.
- ID paket berawalan `quizit-` agar tidak bentrok dengan paket CBT (`webdesign`, `smm`, dll.).
- Data kelas/peserta/admin bisa dipakai bersama (satu project).

## Domain
`CNAME` → `quizit.silverhawk.web.id`

## Paket bawaan
1. Cisco Networking Essentials (CCNA Path)
2. CompTIA A+ IT Support
3. Network+ Foundations
4. Security+ Fundamentals
5. Cloud & Microsoft 365 Workplace

Tiap paket: 25 PG + 5 Essay.

## Admin
Setelah deploy, daftarkan paket lokal ke database (tombol di Kelola Paket) lalu atur peserta.
