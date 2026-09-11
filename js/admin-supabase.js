/**
 * Silverhawk CBT — Supabase helpers v2.4
 * Admin, packs ownership/ACL, participants, proctoring
 */
(function (global) {
  let currentAdmin = null;

  function getCfg() {
    return global.__CBT_CONFIG__ || global.config || {};
  }

  function sbEnabled() {
    const c = getCfg();
    return !!(c.supabaseUrl && String(c.supabaseUrl).trim() && c.supabaseAnonKey && String(c.supabaseAnonKey).trim());
  }

  function sbHeaders(extra) {
    const c = getCfg();
    return Object.assign({
      'apikey': c.supabaseAnonKey,
      'Authorization': 'Bearer ' + c.supabaseAnonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }, extra || {});
  }

  async function sbFetch(path, options) {
    options = options || {};
    const c = getCfg();
    const url = String(c.supabaseUrl).replace(/\/$/, '') + '/rest/v1/' + path;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: sbHeaders(options.headers),
      body: options.body
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error || data.hint)) || res.statusText || 'error';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  }

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getCurrentAdmin() { return currentAdmin; }
  function setCurrentAdmin(admin) { currentAdmin = admin; }
  function isMainAdmin() { return currentAdmin && currentAdmin.role === 'main'; }

  async function loginSecondary(username, password) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi di config.json');
    const u = username.trim();
    const hash = await sha256(password);
    const rows = await sbFetch('cbt_admins?username=eq.' + encodeURIComponent(u) + '&active=eq.true&select=*');
    if (!rows || !rows.length) throw new Error('Username tidak ditemukan / nonaktif');
    const row = rows[0];
    if (row.password_hash !== hash) throw new Error('Password salah');
    currentAdmin = {
      username: row.username,
      role: row.role || 'secondary',
      display_name: row.display_name || row.username
    };
    return currentAdmin;
  }

  async function addAdmin(username, password, displayName) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi');
    if (!isMainAdmin()) throw new Error('Hanya admin utama');
    if (!username || password.length < 6) throw new Error('Username wajib & password min 6 karakter');
    const hash = await sha256(password);
    await sbFetch('cbt_admins', {
      method: 'POST',
      body: JSON.stringify({
        username: username.trim(),
        password_hash: hash,
        display_name: (displayName || username).trim(),
        role: 'secondary',
        active: true
      })
    });
  }

  async function listAdmins() {
    return await sbFetch('cbt_admins?select=id,username,display_name,role,active,created_at&order=created_at.desc');
  }

  async function resetAdminPassword(adminId, newPassword) {
    if (!isMainAdmin()) throw new Error('Hanya admin utama');
    if (!newPassword || newPassword.length < 6) throw new Error('Password min 6 karakter');
    const hash = await sha256(newPassword);
    await sbFetch('cbt_admins?id=eq.' + encodeURIComponent(adminId), {
      method: 'PATCH',
      body: JSON.stringify({ password_hash: hash })
    });
  }

  async function updateAdminProfile(adminId, oldUsername, newUsername, displayName) {
    if (!isMainAdmin()) throw new Error('Hanya admin utama');
    const nu = (newUsername || oldUsername || '').trim();
    const dn = (displayName || '').trim();
    if (!nu) throw new Error('Username wajib');
    await sbFetch('cbt_admins?id=eq.' + encodeURIComponent(adminId), {
      method: 'PATCH',
      body: JSON.stringify({ username: nu, display_name: dn })
    });
    if (oldUsername && nu !== oldUsername) {
      await sbFetch('cbt_packs?owner_username=eq.' + encodeURIComponent(oldUsername), {
        method: 'PATCH',
        body: JSON.stringify({ owner_username: nu })
      });
      await sbFetch('cbt_pack_acl?grantee_username=eq.' + encodeURIComponent(oldUsername), {
        method: 'PATCH',
        body: JSON.stringify({ grantee_username: nu })
      });
    }
  }

  /** Hapus admin tambahan + pindahkan paket miliknya ke main */
  async function deleteAdminTransferPacks(adminId, username) {
    if (!isMainAdmin()) throw new Error('Hanya admin utama');
    if (!username || username === 'main') throw new Error('Tidak bisa hapus admin utama');
    await sbFetch('cbt_packs?owner_username=eq.' + encodeURIComponent(username), {
      method: 'PATCH',
      body: JSON.stringify({ owner_username: 'main', updated_by: 'main' })
    });
    await sbFetch('cbt_pack_acl?grantee_username=eq.' + encodeURIComponent(username), { method: 'DELETE' });
    await sbFetch('cbt_admins?id=eq.' + encodeURIComponent(adminId), { method: 'DELETE' });
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
        await sbFetch('cbt_answer_items', { method: 'POST', body: JSON.stringify(items) });
      }
    }
    return row;
  }

  async function hasTakenExam(name, cls, packId) {
    let q = 'cbt_results?select=id&student_name=eq.' + encodeURIComponent(String(name || '').trim()) +
      '&student_class=eq.' + encodeURIComponent(String(cls || '').trim());
    if (packId) q += '&pack_id=eq.' + encodeURIComponent(packId);
    const rows = await sbFetch(q);
    return !!(rows && rows.length);
  }

  async function deleteResult(resultId) {
    const id = resultId;
    await sbFetch('cbt_answer_items?result_id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    await sbFetch('cbt_results?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }

  async function deleteResultsByStudent(name, cls, packId) {
    let q = 'cbt_results?select=id&student_name=eq.' + encodeURIComponent(String(name || '').trim()) +
      '&student_class=eq.' + encodeURIComponent(String(cls || '').trim());
    if (packId) q += '&pack_id=eq.' + encodeURIComponent(packId);
    const rows = await sbFetch(q);
    for (const r of (rows || [])) await deleteResult(r.id);
  }

  async function listResults() {
    if (!sbEnabled()) return [];
    return await sbFetch('cbt_results?select=*&order=created_at.desc&limit=2000');
  }

  async function uploadPack(pack) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi');
    if (!currentAdmin) throw new Error('Belum login admin');
    const existing = await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(pack.id) + '&select=id,owner_username');
    if (existing && existing[0] && !isMainAdmin()) {
      const owner = existing[0].owner_username || 'main';
      if (owner !== currentAdmin.username) {
        const acl = await getPackAclForUser(pack.id, currentAdmin.username);
        if (!acl || !acl.can_edit_items) throw new Error('Tidak punya hak mengubah paket ini');
      }
    }
    const owner = (existing && existing[0] && existing[0].owner_username)
      ? existing[0].owner_username
      : (currentAdmin.role === 'main' ? 'main' : currentAdmin.username);
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
      updated_by: currentAdmin.username,
      owner_username: owner
    };
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

  async function listAllPacksAdmin() {
    if (!sbEnabled()) return [];
    return await sbFetch('cbt_packs?select=*&order=updated_at.desc');
  }

  async function getPackAclForUser(packId, username) {
    const rows = await sbFetch(
      'cbt_pack_acl?pack_id=eq.' + encodeURIComponent(packId) +
      '&grantee_username=eq.' + encodeURIComponent(username) + '&select=*'
    );
    return (rows && rows[0]) || null;
  }

  async function getPackPermissions(pack) {
    if (!currentAdmin) return {};
    if (isMainAdmin()) {
      return { can_rename: true, can_edit_items: true, can_manage_participants: true, can_delete: true, is_owner: true };
    }
    const owner = pack.owner_username || pack.owner || '';
    if (owner === currentAdmin.username) {
      return { can_rename: true, can_edit_items: true, can_manage_participants: true, can_delete: true, is_owner: true };
    }
    const acl = await getPackAclForUser(pack.id, currentAdmin.username);
    if (!acl) return { can_rename: false, can_edit_items: false, can_manage_participants: false, can_delete: false, is_owner: false };
    return {
      can_rename: !!acl.can_rename,
      can_edit_items: !!acl.can_edit_items,
      can_manage_participants: !!acl.can_manage_participants,
      can_delete: !!acl.can_delete,
      is_owner: false
    };
  }

  async function listManageablePacks() {
    const all = await listAllPacksAdmin();
    if (isMainAdmin()) return (all || []).map(p => Object.assign({ _perm: { can_rename: true, can_edit_items: true, can_manage_participants: true, can_delete: true, is_owner: true } }, p));
    const out = [];
    for (const p of (all || [])) {
      const perm = await getPackPermissions(p);
      if (perm.is_owner || perm.can_rename || perm.can_edit_items || perm.can_manage_participants || perm.can_delete) {
        out.push(Object.assign({ _perm: perm }, p));
      }
    }
    return out;
  }

  async function renamePackTitle(packId, newTitle) {
    if (!currentAdmin) throw new Error('Belum login');
    const packs = await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId) + '&select=*');
    if (!packs || !packs[0]) throw new Error('Paket tidak ditemukan');
    const perm = await getPackPermissions(packs[0]);
    if (!perm.can_rename) throw new Error('Tidak punya hak rename paket');
    await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId), {
      method: 'PATCH',
      body: JSON.stringify({ title: newTitle.trim(), updated_at: new Date().toISOString(), updated_by: currentAdmin.username })
    });
  }

  async function deletePack(packId) {
    if (!currentAdmin) throw new Error('Belum login');
    const packs = await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId) + '&select=*');
    if (!packs || !packs[0]) throw new Error('Paket tidak ditemukan');
    const perm = await getPackPermissions(packs[0]);
    if (!perm.can_delete) throw new Error('Tidak punya hak hapus paket');
    await sbFetch('cbt_pack_participants?pack_id=eq.' + encodeURIComponent(packId), { method: 'DELETE' });
    await sbFetch('cbt_pack_acl?pack_id=eq.' + encodeURIComponent(packId), { method: 'DELETE' });
    await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId), { method: 'DELETE' });
  }

  async function appendQuestionsToPack(packId, newQuestions, newEssays) {
    if (!currentAdmin) throw new Error('Belum login');
    const packs = await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId) + '&select=*');
    if (!packs || !packs[0]) throw new Error('Paket tidak ditemukan');
    const pack = packs[0];
    const perm = await getPackPermissions(pack);
    if (!perm.can_edit_items) throw new Error('Tidak punya hak edit butir soal');
    const qs = Array.isArray(pack.questions) ? pack.questions.slice() : [];
    const es = Array.isArray(pack.essays) ? pack.essays.slice() : [];
    (newQuestions || []).forEach(q => qs.push(q));
    (newEssays || []).forEach(e => es.push(e));
    let practice = Array.isArray(pack.practice_questions) ? pack.practice_questions.slice() : [];
    if (!practice.length) practice = qs.slice();
    else (newQuestions || []).forEach(q => practice.push(q));
    await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId), {
      method: 'PATCH',
      body: JSON.stringify({
        questions: qs,
        essays: es,
        practice_questions: practice,
        updated_at: new Date().toISOString(),
        updated_by: currentAdmin.username
      })
    });
    return { questionsCount: qs.length, essaysCount: es.length };
  }

  async function setPackAcl(packId, granteeUsername, flags) {
    if (!isMainAdmin()) throw new Error('Hanya admin utama yang bisa memberi hak paket');
    const body = {
      pack_id: packId,
      grantee_username: granteeUsername.trim(),
      can_rename: !!flags.can_rename,
      can_edit_items: !!flags.can_edit_items,
      can_manage_participants: !!flags.can_manage_participants,
      can_delete: !!flags.can_delete
    };
    await sbFetch('cbt_pack_acl?on_conflict=pack_id,grantee_username', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body)
    });
  }

  async function listPackAcl(packId) {
    return await sbFetch('cbt_pack_acl?pack_id=eq.' + encodeURIComponent(packId) + '&select=*');
  }

  async function removePackAcl(packId, granteeUsername) {
    if (!isMainAdmin()) throw new Error('Hanya admin utama');
    await sbFetch(
      'cbt_pack_acl?pack_id=eq.' + encodeURIComponent(packId) +
      '&grantee_username=eq.' + encodeURIComponent(granteeUsername),
      { method: 'DELETE' }
    );
  }

  async function listParticipants(packId) {
    return await sbFetch(
      'cbt_pack_participants?pack_id=eq.' + encodeURIComponent(packId) +
      '&active=eq.true&select=*&order=student_class.asc,student_name.asc'
    );
  }

  async function countParticipants(packId) {
    const rows = await listParticipants(packId);
    return (rows || []).length;
  }

  async function addParticipant(packId, studentClass, studentName, displayName) {
    if (!currentAdmin) throw new Error('Belum login');
    const packs = await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId) + '&select=*');
    if (!packs || !packs[0]) throw new Error('Paket tidak ditemukan');
    const perm = await getPackPermissions(packs[0]);
    if (!perm.can_manage_participants) throw new Error('Tidak punya hak kelola peserta');
    const name = String(studentName || '').trim();
    const cls = String(studentClass || '').trim();
    if (!name) throw new Error('Nama wajib');
    await sbFetch('cbt_pack_participants?on_conflict=pack_id,student_class,student_name', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        pack_id: packId,
        student_class: cls,
        student_name: name,
        display_name: (displayName || name).trim(),
        active: true
      })
    });
  }

  async function removeParticipant(packId, studentClass, studentName) {
    if (!currentAdmin) throw new Error('Belum login');
    const packs = await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId) + '&select=*');
    if (!packs || !packs[0]) throw new Error('Paket tidak ditemukan');
    const perm = await getPackPermissions(packs[0]);
    if (!perm.can_manage_participants) throw new Error('Tidak punya hak kelola peserta');
    await sbFetch(
      'cbt_pack_participants?pack_id=eq.' + encodeURIComponent(packId) +
      '&student_class=eq.' + encodeURIComponent(studentClass) +
      '&student_name=eq.' + encodeURIComponent(studentName),
      { method: 'DELETE' }
    );
  }

  async function renameParticipant(packId, studentClass, oldName, newDisplayName) {
    if (!currentAdmin) throw new Error('Belum login');
    const packs = await sbFetch('cbt_packs?id=eq.' + encodeURIComponent(packId) + '&select=*');
    if (!packs || !packs[0]) throw new Error('Paket tidak ditemukan');
    const perm = await getPackPermissions(packs[0]);
    if (!perm.can_manage_participants) throw new Error('Tidak punya hak kelola peserta');
    await sbFetch(
      'cbt_pack_participants?pack_id=eq.' + encodeURIComponent(packId) +
      '&student_class=eq.' + encodeURIComponent(studentClass) +
      '&student_name=eq.' + encodeURIComponent(oldName),
      {
        method: 'PATCH',
        body: JSON.stringify({ display_name: String(newDisplayName || '').trim() })
      }
    );
  }

  async function runItemAnalysis(packId) {
    if (!sbEnabled()) throw new Error('Supabase belum dikonfigurasi');
    const items = await sbFetch(
      'cbt_answer_items?pack_id=eq.' + encodeURIComponent(packId) +
      '&select=question_id,question_text,is_correct,result_id'
    );
    if (!items || !items.length) return [];
    const map = {};
    items.forEach(it => {
      const qid = String(it.question_id);
      if (!map[qid]) map[qid] = { questionId: qid, questionText: it.question_text || qid, total: 0, correct: 0, byResult: {} };
      map[qid].total++;
      if (it.is_correct) map[qid].correct++;
      map[qid].byResult[it.result_id] = !!it.is_correct;
    });
    const results = await sbFetch('cbt_results?pack_id=eq.' + encodeURIComponent(packId) + '&select=id,percent');
    const percentMap = {};
    (results || []).forEach(r => { percentMap[r.id] = r.percent || 0; });
    return Object.values(map).map(q => {
      const p = q.total ? q.correct / q.total : 0;
      let sumC = 0, nC = 0, sumW = 0, nW = 0;
      Object.keys(q.byResult).forEach(rid => {
        const pr = percentMap[rid];
        if (pr === undefined) return;
        if (q.byResult[rid]) { sumC += pr; nC++; } else { sumW += pr; nW++; }
      });
      const avgC = nC ? sumC / nC : 0;
      const avgW = nW ? sumW / nW : 0;
      return {
        questionId: q.questionId,
        questionText: q.questionText,
        total: q.total,
        correct: q.correct,
        difficulty: p,
        discrimination: (avgC - avgW) / 100
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
    const fallback = { forceFullscreen: true, cheatAlarmSound: true };
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
    } catch (e) { console.warn('getProctorSettings', e); }
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
    resetAdminPassword,
    updateAdminProfile,
    deleteAdminTransferPacks,
    deactivateAdmin,
    saveResult,
    hasTakenExam,
    deleteResult,
    deleteResultsByStudent,
    listResults,
    uploadPack,
    listRemotePacks,
    listAllPacksAdmin,
    listManageablePacks,
    getPackPermissions,
    renamePackTitle,
    deletePack,
    appendQuestionsToPack,
    setPackAcl,
    listPackAcl,
    removePackAcl,
    listParticipants,
    countParticipants,
    addParticipant,
    removeParticipant,
    renameParticipant,
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
