# Silverhawk CBT v1.1

Aplikasi ujian interaktif **25 Pilihan Ganda + 5 Essay** untuk Web Design Kelas 11.

**Fitur:**
- Soal muncul satu per satu (gaya CBT)
- Timer 75 menit
- Soal PG + opsi diacak (anti nyontek)
- Password per rombel
- Nama hanya bisa dipakai sekali per perangkat
- Skor otomatis untuk PG
- Essay input teks (dinilai manual)
- Download hasil JSON
- **Kirim otomatis ke Google Sheet** (via Apps Script)
- Theme Silverhawk (dark + cyan)

---

## Cara Setup Google Sheet + Apps Script (Gratis)

Sheet Anda:  
https://docs.google.com/spreadsheets/d/13NU2xGuK5qOKklqHqEIdFaPD_eTKXKc_mpfNgiCs5H0/edit

### Langkah 1 – Siapkan Header di Sheet
1. Buka link Sheet di atas.
2. Di baris 1 (header), isi kolom A sampai L dengan teks berikut (copy-paste):

```
Timestamp	Nama	Kelas	Skor	Total	Persen	WaktuDetik	AutoSubmit	Essay1	Essay2	Essay3	Essay4	Essay5
```

(Pisahkan dengan Tab atau tulis manual di masing-masing kolom)

### Langkah 2 – Buka Apps Script
1. Di Google Sheet → menu **Extensions** → **Apps Script**
2. Hapus semua kode default yang ada.
3. Paste kode di bawah ini **seutuhnya**:

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets()[0]; // pakai sheet pertama
    
    sheet.appendRow([
      new Date(),
      data.name || '',
      data.class || '',
      data.score || 0,
      data.total || 25,
      data.percent || 0,
      data.timeUsedSeconds || 0,
      data.autoSubmit || 'TIDAK',
      data.essay1 || '',
      data.essay2 || '',
      data.essay3 || '',
      data.essay4 || '',
      data.essay5 || ''
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Cek apakah nama + kelas sudah pernah submit
  if (e.parameter.action === 'check') {
    const name = (e.parameter.name || '').trim().toLowerCase();
    const cls = (e.parameter.class || '').trim();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    let exists = false;
    // Kolom: 0=Timestamp, 1=Nama, 2=Kelas
    for (let i = 1; i < data.length; i++) {
      const rowName = String(data[i][1] || '').trim().toLowerCase();
      const rowClass = String(data[i][2] || '').trim();
      if (rowName === name && rowClass === cls) {
        exists = true;
        break;
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify({ exists: exists }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('Silverhawk CBT Receiver is Ready');
}
```

4. Klik ikon **disket** (Save) → beri nama project misalnya `SilverhawkCBT`.

> **Penting:** Setiap kali Anda mengubah kode Apps Script (termasuk update doGet untuk cek nama), Anda harus membuat **New deployment** lagi (atau Manage deployments → Edit → Version: New version) agar perubahan aktif.

### Langkah 3 – Deploy sebagai Web App
1. Klik tombol biru **Deploy** → **New deployment**
2. Di samping "Select type" klik ikon roda gigi → pilih **Web app**
3. Isi:
   - Description: `Silverhawk CBT Receiver`
   - Execute as: **Me** (akun Google Anda)
   - Who has access: **Anyone**
4. Klik **Deploy**
5. Akan muncul permintaan izin → klik **Authorize access** → pilih akun Google Anda → **Advanced** → **Go to ... (unsafe)** → **Allow**
6. Setelah berhasil, **copy URL** yang muncul (bentuknya seperti `https://script.google.com/macros/s/XXXXX/exec`)

### Langkah 4 – Masukkan URL ke config.json
Buka file `config.json` di project CBT, ganti bagian:

```json
"googleScriptUrl": "",
```

menjadi:

```json
"googleScriptUrl": "TEMPLEKAN_URL_WEB_APP_ANDA_DI_SINI",
```

Simpan, lalu upload ulang ke GitHub Pages (atau commit & push).

### Langkah 5 – Uji Coba
Setelah deploy, buka aplikasi CBT → kerjakan sampai selesai.  
Cek Sheet Anda → harus muncul baris baru berisi data siswa.

> Catatan: Karena `mode: 'no-cors'`, browser tidak menampilkan error meskipun data berhasil masuk. Cukup cek Sheet-nya.

---

## Password Default
| Kelas | Password   |
|-------|------------|
| 51    | pma51web   |
| 52    | pma52web   |

Ubah di `config.json` jika perlu.

## Durasi
Default 75 menit (bisa diubah di `config.json` → `durationMinutes`).

## Reset Nama yang Sudah Dipakai
Buka Console browser (F12) lalu jalankan:

```js
localStorage.removeItem('shcbt_used_51');
localStorage.removeItem('shcbt_used_52');
```

---

## Struktur File
```
silverhawk-cbt/
├── index.html
├── style.css
├── app.js
├── questions.json   (25 PG)
├── essays.json      (5 Essay)
├── students.json
├── config.json
└── README.md
```

Dibuat untuk SMA PMA • Silverhawk Network 2026
