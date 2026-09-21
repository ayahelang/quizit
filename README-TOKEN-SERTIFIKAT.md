# QuizIT v1.2 — Token, Google, Sertifikat

## Filter paket
Hanya menampilkan paket `quizit-*`. Paket CBT (Web Design, SMM, DKV) di DB bersama **tidak** muncul.

## SQL wajib
Jalankan `supabase-migration-v28-tokens.sql` di SQL Editor.

## Token
Admin → **Token Tes** → generate.  
Peserta: mode **Tamu / token** → (opsional Google) → isi token → mulai.

## Minta token WhatsApp
Tombol membuka WA ke `6285158822803` (Teddy) dengan teks transfer Gopay min Rp5.000.

## Google Sign-In
1. Google Cloud Console → OAuth Client ID (Web)
2. Authorized JavaScript origins: `https://quizit.silverhawk.web.id`
3. Isi `googleClientId` di `config.json`

## Password peserta terdaftar (2024/2025)
Tetap lewat **password paket** (bisa kadaluarsa). Mode token bebas waktu selama token valid.

## Angkatan 2024
Sheet belum bisa dibaca otomatis (akses). Impor manual di **Kelola Peserta** atau set sheet **Anyone with the link can view** lalu minta impor ulang.
