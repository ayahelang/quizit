# Penilaian Essay Otomatis (Gemini API — gratis kuota)

## Cara set
1. Buka Google AI Studio: https://aistudio.google.com/apikey
2. Buat API key
3. Di `config.json` QuizIT:
```json
"geminiApiKey": "AIza...",
"essayAiEnabled": true,
"essayManualMode": false
```
4. `essayManualMode: true` → AI dimatikan, essay dinilai manual guru.

## Perilaku
- Setelah submit, jawaban essay dinilai model Gemini (skor 0–20 per butir).
- Skor essay muncul di layar hasil peserta dan panel admin (detail toggle).
- Jika tidak ada kunci di soal, AI menilai berdasarkan soal + jawaban siswa.

## Batas gratis
Kuota Google AI Studio bisa berubah; pantau di dashboard Google.
