// Supabase Edge Function: grade-essays
// Secret: GEMINI_API_KEY (set di Dashboard → Edge Functions → Secrets)
// Invoke: POST { supabaseUrl }/functions/v1/grade-essays
// Body: { essays: [ { id, question, answer, answerKey? } ] }
// Header: Authorization: Bearer <anon or user jwt>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const key = Deno.env.get("GEMINI_API_KEY") || "";
  if (!key) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY belum diset di secrets" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { essays?: Array<Record<string, unknown>> } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON body invalid" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const essays = Array.isArray(body.essays) ? body.essays : [];
  if (!essays.length) {
    return new Response(JSON.stringify({ error: "essays kosong", graded: [] }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const graded = [];
  for (const e of essays) {
    const question = String(e.question || "");
    const answer = String(e.answer || "");
    const answerKey = String(e.answerKey || e.key || e.rubric || "(tidak ada)");
    const prompt =
      'Anda penilai ujian. Nilai jawaban essay 0-20. Balas JSON saja: {"score":number,"feedback":"..."}.\nSoal: ' +
      question +
      "\nKunci/materi: " +
      answerKey +
      "\nJawaban siswa: " +
      answer;

    let score: number | null = null;
    let feedback = "";
    try {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        encodeURIComponent(key);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = await res.json();
      const text =
        (((data || {}).candidates || [])[0] || {}).content?.parts?.[0]?.text ||
        "";
      feedback = String(text).slice(0, 500);
      const m = String(text).match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const j = JSON.parse(m[0]);
          const s = Number(j.score);
          if (!isNaN(s)) score = Math.max(0, Math.min(20, s));
          if (j.feedback) feedback = String(j.feedback).slice(0, 500);
        } catch (_) {}
      }
      if (!res.ok) {
        feedback = "Gemini error: " + JSON.stringify(data).slice(0, 200);
      }
    } catch (err) {
      feedback = "Gagal: " + (err && (err as Error).message ? (err as Error).message : String(err));
    }

    graded.push({
      ...e,
      score,
      maxScore: 20,
      feedback,
    });
  }

  return new Response(JSON.stringify({ ok: true, graded }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
