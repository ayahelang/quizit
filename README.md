# Silverhawk CBT v1.2

Fitur:
- 25 PG + 5 Essay (ujian resmi)
- Mode Latihan (12 soal, password khusus, tidak tercatat ke Sheet)
- Panel Admin (lihat data, download CSV, hapus record agar siswa bisa ikut lagi)
- Navigasi nomor soal + lompat ke belum dijawab / soal terakhir
- Cek nama via Google Sheet (anti retake)
- Theme Silverhawk

## Password default (config.json)
| Jenis | Nilai |
|-------|--------|
| Kelas 51 | sesuai config Anda |
| Kelas 52 | sesuai config Anda |
| Mode Latihan | `latihanSH` |
| Admin | `adminSH2026` |

Ubah di `config.json` sesuai kebutuhan.

## Apps Script (WAJIB update + deploy ulang)

Ganti **seluruh** kode di Extensions → Apps Script dengan kode di bawah, lalu **Deploy → New deployment** (atau New version).

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets()[0];
    
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
  const action = e.parameter.action || '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();

  // Kolom: 0=Timestamp, 1=Nama, 2=Kelas, 3=Skor, 4=Total, 5=Persen, 6=WaktuDetik, 7=AutoSubmit

  if (action === 'check') {
    const name = (e.parameter.name || '').trim().toLowerCase();
    const cls = (e.parameter.class || '').trim();
    let exists = false;
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

  if (action === 'list') {
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      rows.push({
        timestamp: data[i][0] ? String(data[i][0]) : '',
        name: String(data[i][1] || ''),
        class: String(data[i][2] || ''),
        score: data[i][3] || 0,
        total: data[i][4] || 25,
        percent: data[i][5] || 0,
        timeUsedSeconds: data[i][6] || 0,
        autoSubmit: String(data[i][7] || '')
      });
    }
    return ContentService
      .createTextOutput(JSON.stringify({ rows: rows }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'delete') {
    const name = (e.parameter.name || '').trim().toLowerCase();
    const cls = (e.parameter.class || '').trim();
    let deleted = 0;
    // Hapus dari bawah agar index tidak bergeser
    for (let i = data.length - 1; i >= 1; i--) {
      const rowName = String(data[i][1] || '').trim().toLowerCase();
      const rowClass = String(data[i][2] || '').trim();
      if (rowName === name && rowClass === cls) {
        sheet.deleteRow(i + 1);
        deleted++;
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', deleted: deleted }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput('Silverhawk CBT Receiver is Ready');
}
```

Setelah paste → Save → Deploy (New version / New deployment) → Who has access: **Anyone**.

## File baru
- `practice-questions.json` — 12 soal latihan

## Navigasi saat ujian
- Strip nomor soal di atas (hijau = sudah dijawab, merah muda = belum)
- Tombol **Belum dijawab** → lompat ke soal kosong pertama
- Tombol **Terakhir** → langsung ke soal terakhir

Silverhawk Network • SMA PMA
