/**
 * Silverhawk CBT — Supabase helpers (gratis)
 * Admin tambahan, upload paket, analisis butir, Excel
 */
(function (global) {
  let currentAdmin = null; // { username, role }

  function getCfg() {
    return global.__CBT_CONFIG__ || global.config || {};
  }

  function sbEnabled() {
    const c = getCfg();
    const url = c.supabaseUrl && String(c.supabaseUrl).trim();
    const key = c.supabaseAnonKey && String(c.supabaseAnonKey).trim();
    return !!(url && key);
  }

  function sbHeaders() {
    const c = getCfg();
    return {
      'apikey': c.supabaseAnonKey,
      'Authorization': 'Bearer ' + c.supabaseAnonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  async function sbFetch(path, options = {}) {
    const c = getCfg();
    const url = String(c.supabaseUrl).replace(/\/$/, '') + '/rest/v1/' + path;
    const res = await fetch(url, {
      ...options,
      headers: { ...sbHeaders(), ...(options.headers || {}) }
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const msg = (data && data.message) || (data && data.error) || res.statusText || 'error';
      throw new Error(msg);
    }
    return data;
  }

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getCurrentAdmin() {
    return currentAdmin;
  }

  function setCurrentAdmin(admin) {
    currentAdmin = admin;
  }

  function isMainAdmin() {
    return currentAdmin && currentAdmin.role === 'main';
  }

  async function loginSecondary(username, password) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi di config.json');
    const u = username.trim();
    const hash = await sha256(password);
    const rows = await sbFetch(
      'cbt_admins?username=eq.' + encodeURIComponent(u) + '&active=eq.true&select=*'
    );
    if (!rows || !rows.length) throw new Error('Username tidak ditemukan / nonaktif');
    const row = rows[0];
    if (row.password_hash !== hash) throw new Error('Password salah');
    currentAdmin = { username: row.username, role: row.role || 'secondary' };
    return currentAdmin;
  }

  async function addAdmin(username, password) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi');
    if (!isMainAdmin()) throw new Error('Hanya admin utama');
    if (!username || password.length < 6) throw new Error('Username wajib & password min 6 karakter');
    const hash = await sha256(password);
    await sbFetch('cbt_admins', {
      method: 'POST',
      body: JSON.stringify({
        username: username.trim(),
        password_hash: hash,
        role: 'secondary',
        active: true
      })
    });
  }

  async function listAdmins() {
    return await sbFetch('cbt_admins?select=id,username,role,active,created_at&order=created_at.desc');
  }

  async function deactivateAdmin(id) {
    if (!isMainAdmin()) throw new Error('Hanya admin utama');
    await sbFetch('cbt_admins?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ active: false })
    });
  }

  async function saveResult(resultData) {
    if (!sbEnabled() || resultData.isPractice) return null;
    const inserted = await sbFetch('cbt_results', {
      method: 'POST',
      body: JSON.stringify({
        student_name: resultData.name,
        student_class: resultData.class,
        pack_id: resultData.packId || '',
        pack_title: resultData.packTitle || '',
        score: resultData.score,
        total: resultData.total,
        percent: resultData.percent,
        time_used_seconds: resultData.timeUsedSeconds,
        auto_submit: !!resultData.autoSubmit,
        tab_switch_count: resultData.tabSwitchCount || 0,
        essays: resultData.essays || []
      })
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (row && row.id && resultData.mcAnswers) {
      const items = resultData.mcAnswers.map(a => ({
        result_id: row.id,
        pack_id: resultData.packId || '',
        question_id: String(a.id),
        question_text: (a.question || '').substring(0, 500),
        selected_answer: (a.userAnswer || '').substring(0, 500),
        correct_answer: (a.correctAnswer || '').substring(0, 500),
        is_correct: !!a.isCorrect
      }));
      if (items.length) {
        await sbFetch('cbt_answer_items', {
          method: 'POST',
          body: JSON.stringify(items)
        });
      }
    }
    return row;
  }

  async function listResults() {
    if (!sbEnabled()) return [];
    return await sbFetch('cbt_results?select=*&order=created_at.desc&limit=2000');
  }

  async function uploadPack(pack) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi');
    if (!currentAdmin) throw new Error('Belum login admin');
    const body = {
      id: pack.id,
      title: pack.title,
      subject: pack.subject || '',
      description: pack.description || '',
      duration_minutes: pack.durationMinutes || 60,
      practice_duration_minutes: pack.practiceDurationMinutes || 30,
      questions: pack.questions || [],
      essays: pack.essays || [],
      practice_questions: pack.practiceQuestions || pack.questions || [],
      enabled: true,
      updated_at: new Date().toISOString(),
      updated_by: currentAdmin.username
    };
    // upsert
    await sbFetch('cbt_packs?on_conflict=id', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body)
    });
  }

  async function listRemotePacks() {
    if (!sbEnabled()) return [];
    return await sbFetch('cbt_packs?enabled=eq.true&select=*');
  }

  async function runItemAnalysis(packId) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi');
    const items = await sbFetch(
      'cbt_answer_items?pack_id=eq.' + encodeURIComponent(packId) + '&select=question_id,question_text,is_correct,result_id'
    );
    if (!items || !items.length) return [];

    // Group by question
    const map = {};
    items.forEach(it => {
      const qid = String(it.question_id);
      if (!map[qid]) {
        map[qid] = { questionId: qid, questionText: it.question_text || qid, total: 0, correct: 0, byResult: {} };
      }
      map[qid].total++;
      if (it.is_correct) map[qid].correct++;
      map[qid].byResult[it.result_id] = !!it.is_correct;
    });

    // Daya beda sederhana: korelasi skor total siswa vs benar di butir (approx)
    // Ambil results for pack
    const results = await sbFetch(
      'cbt_results?pack_id=eq.' + encodeURIComponent(packId) + '&select=id,percent'
    );
    const percentMap = {};
    (results || []).forEach(r => { percentMap[r.id] = r.percent || 0; });

    return Object.values(map).map(q => {
      const p = q.total ? q.correct / q.total : 0; // tingkat kesukaran (proporsi benar)
      // diskriminasi: beda rata2 percent yang jawab benar vs salah
      let sumC = 0, nC = 0, sumW = 0, nW = 0;
      Object.keys(q.byResult).forEach(rid => {
        const pr = percentMap[rid];
        if (pr === undefined) return;
        if (q.byResult[rid]) { sumC += pr; nC++; }
        else { sumW += pr; nW++; }
      });
      const avgC = nC ? sumC / nC : 0;
      const avgW = nW ? sumW / nW : 0;
      const discrimination = (avgC - avgW) / 100; // -1..1 approx
      return {
        questionId: q.questionId,
        questionText: q.questionText,
        total: q.total,
        correct: q.correct,
        difficulty: p,
        discrimination
      };
    }).sort((a, b) => String(a.questionId).localeCompare(String(b.questionId), undefined, { numeric: true }));
  }

  function downloadXlsx(rows, filename) {
    if (typeof XLSX === 'undefined') {
      alert('Library Excel belum termuat. Coba refresh halaman.');
      return;
    }
    const data = rows.map(r => ({
      Timestamp: r.timestamp || r.created_at || '',
      Nama: r.name || r.student_name || '',
      Kelas: r.class || r.student_class || '',
      PackId: r.packId || r.pack_id || '',
      PackTitle: r.packTitle || r.pack_title || '',
      Skor: r.score,
      Total: r.total,
      Persen: r.percent,
      WaktuDetik: r.timeUsedSeconds || r.time_used_seconds || '',
      AutoSubmit: r.autoSubmit || (r.auto_submit ? 'YA' : 'TIDAK'),
      TabSwitch: r.tabSwitchCount || r.tab_switch_count || 0
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hasil');
    XLSX.writeFile(wb, filename || 'hasil_ujian.xlsx');
  }

  async function getProctorSettings() {
    const fallback = {
      forceFullscreen: true,
      cheatAlarmSound: true
    };
    const c = getCfg();
    if (c.forceFullscreen === false) fallback.forceFullscreen = false;
    if (c.cheatAlarmSound === false) fallback.cheatAlarmSound = false;
    if (!sbEnabled()) return fallback;
    try {
      const rows = await sbFetch('cbt_settings?key=eq.proctoring&select=value');
      if (rows && rows[0] && rows[0].value) {
        return {
          forceFullscreen: rows[0].value.forceFullscreen !== false,
          cheatAlarmSound: rows[0].value.cheatAlarmSound !== false
        };
      }
    } catch (e) {
      console.warn('getProctorSettings', e);
    }
    return fallback;
  }

  async function saveProctorSettings(settings) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi — setting hanya berlaku dari config.json');
    await sbFetch('cbt_settings?on_conflict=key', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        key: 'proctoring',
        value: {
          forceFullscreen: !!settings.forceFullscreen,
          cheatAlarmSound: !!settings.cheatAlarmSound
        },
        updated_at: new Date().toISOString()
      })
    });
  }

  global.SHSupabase = {
    sbEnabled,
    loginSecondary,
    addAdmin,
    listAdmins,
    deactivateAdmin,
    saveResult,
    listResults,
    uploadPack,
    listRemotePacks,
    runItemAnalysis,
    downloadXlsx,
    getCurrentAdmin,
    setCurrentAdmin,
    isMainAdmin,
    sha256,
    getProctorSettings,
    saveProctorSettings
  };
})(window);
