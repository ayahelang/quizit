# Setup Gemini API Key aman lewat Supabase Edge Function

Key **tidak** disimpan di GitHub Pages / `config.json`.

## 1. Buat secret di Supabase

1. Buka project: https://supabase.com/dashboard/project/edaujcxmncoslykyddwf  
2. Menu **Edge Functions** → **Secrets** (atau Project Settings → Edge Functions)  
3. Tambah secret:
   - Name: `GEMINI_API_KEY`
   - Value: API key dari https://aistudio.google.com/apikey  

## 2. Deploy function `grade-essays`

### Opsi A — Dashboard (upload manual)
1. **Edge Functions** → **Create function**  
2. Nama: `grade-essays`  
3. Paste isi file `supabase/functions/grade-essays/index.ts` dari zip  
4. Deploy  

### Opsi B — CLI (disarankan jika sudah terbiasa)
```bash
# install sekali
npm i -g supabase

supabase login
supabase link --project-ref edaujcxmncoslykyddwf

# dari folder yang berisi supabase/functions/
supabase secrets set GEMINI_API_KEY="AIza...."
supabase functions deploy grade-essays --no-verify-jwt
```

`--no-verify-jwt` memudahkan pemanggilan dari GitHub Pages dengan **anon key** (tetap tidak membocorkan Gemini key).  
Untuk produksi lebih ketat, bisa wajib JWT admin saja.

## 3. Config aplikasi (aman untuk GitHub)

Di `config.json` **jangan** taruh `geminiApiKey`. Cukup:

```json
"essayManualMode": false,
"essayAiViaEdge": true
```

`supabaseUrl` + `supabaseAnonKey` yang sudah ada dipakai untuk memanggil:

`POST {supabaseUrl}/functions/v1/grade-essays`

## 4. Uji
1. Panel admin → Hasil Ujian → **Tampilkan Hasil**  
2. Klik **Nilai essay dengan AI** pada satu baris  
3. Jika secret belum ada: error `GEMINI_API_KEY belum diset`  
4. Jika OK: skor essay terisi  

## 5. CORS / domain
Function di atas mengizinkan `Access-Control-Allow-Origin: *` agar GitHub Pages / domain custom bisa memanggil.

## Keamanan
- Key hanya di **Secrets** Edge Function (server Supabase)  
- Anon key tetap publik (normal untuk Supabase client) — **bukan** Gemini key  
- Jangan commit file yang berisi `AIza...`
