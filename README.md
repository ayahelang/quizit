
## Fitur v2.2 — Admin tambahan + Upload soal + Excel + Analisis butir (Supabase gratis)

### Setup Supabase (sekali)
1. Buat project gratis di https://supabase.com
2. SQL Editor → jalankan file `supabase-setup.sql`
3. Settings → API → salin **Project URL** dan **anon public** key
4. Isi di `config.json`:
```json
"supabaseUrl": "https://XXXX.supabase.co",
"supabaseAnonKey": "eyJhbGciOi..."
```
5. Upload ke GitHub Pages

Tanpa Supabase, fitur lama (Sheet + admin utama password config) **tetap jalan**.

### Hak akses
| Fitur | Admin utama (password config) | Admin tambahan (Supabase) |
|-------|-------------------------------|---------------------------|
| Lihat / filter / download CSV & Excel | Ya | Ya |
| Hapus record Sheet | Ya | Ya |
| Upload paket soal | Ya (jika Supabase on) | Ya |
| Analisis butir soal | Ya (jika Supabase on) | Ya |
| Tambah/nonaktifkan admin | Ya | Tidak |

### Analisis butir
Butuh data submit **setelah** Supabase aktif (jawaban per soal disimpan).  
Menampilkan tingkat kesukaran (P) dan daya beda sederhana (D) per item.

### Format Excel
Tombol **Download Excel (.xlsx)** memakai SheetJS di browser (tanpa server).

---

## Update v2.1 — Admin filter mapel + anti pindah tab

### Admin
- Pilih filter mapel lalu **Download CSV (sesuai filter)**
- Data hasil memuat `packId` / `packTitle` (perlu update Apps Script di bawah)

### Anti-cheat
- Browser **tidak mengizinkan** menutup tab lain milik siswa
- Yang diimplementasikan: deteksi pindah tab / minimize → peringatan + hitung pelanggaran
- Jumlah pindah tab dikirim ke Sheet (`tabSwitchCount`)

### Apps Script doPost (tambah kolom pack + tab)
Urutan appendRow yang disarankan:

`Timestamp | Nama | Kelas | Skor | Total | Persen | WaktuDetik | AutoSubmit | PackId | PackTitle | TabSwitch | Essay1..5`

Ganti bagian `sheet.appendRow([...])` di doPost menjadi:

```javascript
    sheet.appendRow([
      new Date(),
      data.name || '',
      data.class || '',
      data.score || 0,
      data.total || 25,
      data.percent || 0,
      data.timeUsedSeconds || 0,
      data.autoSubmit || 'TIDAK',
      data.packId || '',
      data.packTitle || '',
      data.tabSwitchCount || 0,
      data.essay1 || '',
      data.essay2 || '',
      data.essay3 || '',
      data.essay4 || '',
      data.essay5 || ''
    ]);
```

Dan di `action=list`, mapping row:

```javascript
      rows.push({
        timestamp: data[i][0] ? String(data[i][0]) : '',
        name: String(data[i][1] || ''),
        class: String(data[i][2] || ''),
        score: data[i][3] || 0,
        total: data[i][4] || 25,
        percent: data[i][5] || 0,
        timeUsedSeconds: data[i][6] || 0,
        autoSubmit: String(data[i][7] || ''),
        packId: String(data[i][8] || ''),
        packTitle: String(data[i][9] || ''),
        tabSwitchCount: data[i][10] || 0
      });
```

Header Sheet baris 1 (opsional tapi disarankan):
`Timestamp, Nama, Kelas, Skor, Total, Persen, WaktuDetik, AutoSubmit, PackId, PackTitle, TabSwitch, Essay1, Essay2, Essay3, Essay4, Essay5`

---

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
