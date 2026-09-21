# Panduan Google Cloud Console — Login Google (QuizIT)

Aplikasi: **Silverhawk QuizIT** (`https://quizit.silverhawk.web.id`)

## A. Buat / pilih project
1. Buka: https://console.cloud.google.com/projectselector2
2. Pilih project yang dipakai, atau **New Project** (nama bebas, mis. `Silverhawk-QuizIT`).

## B. Aktifkan Google Identity (OAuth)
OAuth consent screen:
https://console.cloud.google.com/apis/credentials/consent

1. User Type: **External** (kecuali workspace internal murni)
2. App name: `QuizIT` / `Silverhawk QuizIT`
3. User support email: email Anda
4. Developer contact: email Anda
5. Simpan. Di tahap testing, tambahkan **Test users** (email yang boleh login saat status Testing):
   - `admin@silverhawk.web.id`
   - `ted834r@gmail.com`
   - email admin tambahan lain yang akan dipakai

## C. Buat OAuth Client ID (Web)
Langsung ke Credentials:
https://console.cloud.google.com/apis/credentials

1. **+ Create Credentials** → **OAuth client ID**
2. Application type: **Web application**
3. Name: `QuizIT Web`
4. **Authorized JavaScript origins** (tanpa path):
   - `https://quizit.silverhawk.web.id`
   - `https://cbt.silverhawk.web.id` (jika CBT juga pakai Google)
   - `http://localhost` (opsional untuk tes lokal)
5. **Authorized redirect URIs** (untuk GIS button sering cukup origins; jika diminta isi):
   - `https://quizit.silverhawk.web.id`
   - `https://quizit.silverhawk.web.id/`
6. **Create** → salin **Client ID** (berakhiran `.apps.googleusercontent.com`)

## D. Tempel ke config QuizIT
Di `config.json`:

```json
"googleClientId": "ISI_CLIENT_ID_ANDA.apps.googleusercontent.com",
"mainAdminGoogleEmails": [
  "admin@silverhawk.web.id",
  "ted834r@gmail.com"
]
```

Commit & push → tunggu GitHub Pages.

## E. Cara pakai di aplikasi
### Admin utama
- Layar Admin → tombol **Sign in with Google**
- Email harus salah satu `mainAdminGoogleEmails` di atas

### Admin tambahan
1. Login dulu dengan **username + password** admin tambahan (sekali)
2. Di panel, klik **Hubungkan Google**
3. Pilih akun Google → tersimpan di database (`google_email`)
4. Lain kali bisa login admin hanya dengan Google

### Peserta (mode token)
- Tombol Google di mode tamu memakai Client ID yang sama

## F. Status app "Testing" vs Production
Saat **Testing**, hanya Test users yang bisa login:
https://console.cloud.google.com/apis/credentials/consent

Untuk publik, submit **Publish app** (verifikasi Google bisa memakan waktu). Untuk pemakaian internal sekolah, mode Testing + daftar Test users biasanya cukup.

## G. Cek error umum
| Gejala | Perbaikan |
|--------|-----------|
| `origin_mismatch` | Tambahkan origin persis `https://quizit.silverhawk.web.id` di Client ID |
| `access_denied` | Email belum masuk Test users |
| Tombol Google tidak muncul | `googleClientId` kosong / belum deploy config |
| Admin tambahan ditolak | Belum **Hubungkan Google** setelah login password |

## Link ringkas
- Selector project: https://console.cloud.google.com/projectselector2
- OAuth consent: https://console.cloud.google.com/apis/credentials/consent
- Credentials: https://console.cloud.google.com/apis/credentials
- API Library: https://console.cloud.google.com/apis/library
