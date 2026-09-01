# Silverhawk CBT v2.0 — Multi-Mapel

Aplikasi ujian online berbasis GitHub Pages untuk **banyak mata pelajaran**.

## Fitur
- Daftar paket soal dari `catalog.json`
- Validasi otomatis: hanya paket yang file soalnya valid yang bisa dipilih
- Tiap mapel punya folder sendiri di `packs/`
- Ujian resmi + Mode Latihan (jumlah PG latihan = file practice, disarankan sama dengan final)
- Navigasi nomor soal, lompat belum dijawab / terakhir
- Admin: list, download CSV, hapus record Sheet
- Anti retake via Google Sheet

## Struktur file
```
catalog.json          ← daftar semua paket soal
config.json           ← password, URL Apps Script
students.json         ← nama siswa per kelas
packs/
  webdesign/
    questions.json
    essays.json
    practice-questions.json
  smm/
    questions.json
    essays.json
    practice-questions.json
```

## Cara guru mapel lain menambah soal

1. Buat folder baru, contoh: `packs/matematika/`
2. Isi 3 file JSON:
   - `questions.json` — array soal PG (format sama)
   - `essays.json` — array essay (boleh `[]` jika tidak ada)
   - `practice-questions.json` — soal latihan (disarankan **jumlah sama** dengan questions.json)
3. Daftarkan di `catalog.json`:

```json
{
  "id": "matematika",
  "title": "Matematika Wajib",
  "subject": "Matematika",
  "description": "Ujian semester genap",
  "questionsFile": "packs/matematika/questions.json",
  "essaysFile": "packs/matematika/essays.json",
  "practiceFile": "packs/matematika/practice-questions.json",
  "durationMinutes": 90,
  "practiceDurationMinutes": 45,
  "enabled": true
}
```

4. Commit & push ke GitHub Pages.

Aplikasi akan **otomatis memvalidasi** file. Jika path salah atau JSON rusak, paket muncul sebagai tidak valid dan tidak bisa dipilih.

## Format soal PG (questions.json / practice-questions.json)
```json
[
  {
    "id": 1,
    "question": "Teks pertanyaan...",
    "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E"],
    "answer": 0
  }
]
```
`answer` = index benar (0 = A, 1 = B, dst).

## Format essay
```json
[
  { "id": "E1", "question": "Teks essay..." }
]
```

## Password (config.json)
- Password per kelas: `passwords`
- Latihan: `practicePassword` (default `latihanSH`)
- Admin: `adminPassword` (default `adminSH2026`)

## Apps Script
Gunakan script yang sama dengan v1.2 (doPost + check + list + delete).  
Tidak perlu diubah jika sudah terpasang.

Silverhawk Network • SMA PMA
