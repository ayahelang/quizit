/**
 * Silverhawk CBT v2.0 — Multi-mapel via catalog.json
 */

let config = {};
let students = {};
let catalog = { packs: [] };
let validPacks = [];

let guestSession = { email: '', name: '', picture: '' };
let lastExamResult = null;

let _upPackIdManual = false;

function slugifyPackId(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function fillDatalist(listId, values) {
  const el = document.getElementById(listId);
  if (!el) return;
  const uniq = [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'id'));
  el.innerHTML = uniq.map(v => '<option value="' + escapeHtml(v).replace(/"/g, '&quot;') + '"></option>').join('');
}

async function refreshAdminDatalists() {
  try {
    if (!window.SHSupabase || !SHSupabase.sbEnabled()) return;
    const classes = await SHSupabase.listAllClassesAdmin();
    fillDatalist('mc-name-list', (classes || []).map(c => c.name));
    fillDatalist('mc-inst-list', (classes || []).map(c => c.institution));
    fillDatalist('tok-class-list', (classes || []).map(c => c.name + (c.institution ? ' · ' + c.institution : '')));
    let members = [];
    try { members = await SHSupabase.listAllMasterMembers(); } catch (_) {}
    fillDatalist('mc-member-name-list', (members || []).map(m => m.display_name || m.participant_name || m.student_name));
    fillDatalist('tok-users-list', (members || []).map(m => m.display_name || m.participant_name || m.student_name));
    try {
      const admins = await SHSupabase.listAdmins();
      fillDatalist('mp-acl-user-list', (admins || []).filter(a => a.role !== 'main').map(a => a.username));
    } catch (_) {}
    const packIds = [];
    (validPacks || []).forEach(p => { if (p && p.id) packIds.push(p.id); });
    (_managePacksCache || []).forEach(p => { if (p && p.id) packIds.push(p.id); });
    fillDatalist('tok-packs-list', packIds);
  } catch (e) { console.warn('datalists', e); }
}

function wireUploadPackIdAuto() {
  const title = document.getElementById('up-pack-title');
  const idEl = document.getElementById('up-pack-id');
  if (!title || !idEl) return;
  idEl.addEventListener('input', () => { _upPackIdManual = true; });
  title.addEventListener('input', () => {
    if (_upPackIdManual && idEl.value.trim()) return;
    idEl.value = slugifyPackId(title.value);
    _upPackIdManual = false;
  });
}



function parseGoogleJwt(credential) {
  const payload = JSON.parse(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return {
    email: payload.email || '',
    name: payload.name || '',
    picture: payload.picture || '',
    email_verified: payload.email_verified
  };
}

async function handleAdminGoogleCredential(resp) {
  try {
    const profile = parseGoogleJwt(resp.credential);
    if (!window.SHSupabase || !SHSupabase.sbEnabled()) {
      // main-only offline fallback
      const mains = (config.mainAdminGoogleEmails || []).map(e => String(e).toLowerCase());
      if (mains.includes(String(profile.email).toLowerCase())) {
        openAdminPanel({ username: 'main', role: 'main', display_name: profile.name || 'Admin Utama', google_email: profile.email });
        return;
      }
      alert('Layanan data belum siap / email bukan admin utama.');
      return;
    }
    const admin = await SHSupabase.loginWithGoogleEmail(profile.email, profile);
    openAdminPanel(admin);
  } catch (e) {
    alert(e.message || 'Login Google admin gagal');
  }
}

function renderAdminGoogleButton() {
  const clientId = (config && config.googleClientId) || '';
  const el = document.getElementById('admin-google-btn');
  if (!el) return;
  if (!clientId) {
    el.innerHTML = '<p class="hint">Isi googleClientId di config.json (lihat panduan Google Cloud).</p>';
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.id) {
    el.innerHTML = '<p class="hint">Memuat Google…</p>';
    setTimeout(renderAdminGoogleButton, 1200);
    return;
  }
  el.innerHTML = '';
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleAdminGoogleCredential
  });
  google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', text: 'signin_with', width: 280 });
}

async function linkCurrentAdminGoogle() {
  const clientId = (config && config.googleClientId) || '';
  if (!clientId) { alert('googleClientId belum diisi di config.json'); return; }
  if (!window.google || !google.accounts) { alert('Google belum termuat, coba lagi'); return; }
  // One-tap / prompt
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async (resp) => {
      try {
        const profile = parseGoogleJwt(resp.credential);
        if (!SHSupabase.getCurrentAdmin()) {
          alert('Login admin dulu (password), lalu hubungkan Google.');
          return;
        }
        await SHSupabase.linkGoogleEmailToCurrentAdmin(profile.email);
        alert('Akun Google terhubung: ' + profile.email + '\\nLain kali bisa login admin dengan Google.');
      } catch (e) {
        alert(e.message || 'Gagal menghubungkan Google');
      }
    }
  });
  google.accounts.id.prompt();
  // also show a temporary button container if prompt blocked
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
  const card = document.createElement('div');
  card.style.cssText = 'background:#0f172a;padding:20px;border-radius:12px;max-width:360px;width:90%';
  card.innerHTML = '<p style="color:#e2e8f0;margin-bottom:12px">Pilih akun Google untuk dihubungkan ke admin ini.</p>';
  const btnBox = document.createElement('div');
  card.appendChild(btnBox);
  const close = document.createElement('button');
  close.textContent = 'Tutup';
  close.className = 'btn btn-secondary';
  close.style.marginTop = '12px';
  close.onclick = () => host.remove();
  card.appendChild(close);
  host.appendChild(card);
  document.body.appendChild(host);
  google.accounts.id.renderButton(btnBox, { theme: 'outline', size: 'large', width: 280 });
}



function onExamModeChange() {
  const mode = (document.getElementById('exam-mode') || {}).value || 'registered';
  const guest = document.getElementById('guest-token-group');
  const regBlocks = ['password-group', 'class-group', 'name-group'].map(id => document.getElementById(id));
  if (guest) guest.style.display = mode === 'token' ? 'block' : 'none';
  regBlocks.forEach(el => {
    if (!el) return;
    if (mode === 'token') el.style.display = 'none';
  });
  if (mode === 'registered') {
    // restore via class change logic
    const cls = document.getElementById('class-select');
    if (cls && cls.value) {
      const pg = document.getElementById('password-group');
      if (pg) pg.style.display = 'block';
    }
  }
  checkStartReady();
}

function openTokenWhatsApp() {
  const phone = (config.whatsappTokenRequest || '6285158822803').replace(/[^0-9]/g, '');
  const gopay = config.gopayNumber || phone;
  const minAmt = config.gopayMinAmount || 5000;
  const packTitle = (selectedPack && selectedPack.title) || '(pilih paket dulu)';
  const text = encodeURIComponent(
    'Halo Teddy Mulyana, saya ingin minta token tes QuizIT.\\n' +
    'Paket: ' + packTitle + '\\n' +
    'Saya sudah / akan transfer Gopay ke ' + gopay + ' minimal Rp' + minAmt + '.\\n' +
    'Bukti transfer menyusul di chat ini.\\n' +
    'Mohon dibuatkan token tes.'
  );
  window.open('https://wa.me/' + phone + '?text=' + text, '_blank');
}

function initGoogleButton() {
  const clientId = (config && config.googleClientId) || '';
  const wrap = document.getElementById('google-btn-wrap');
  if (!wrap) return;
  if (!clientId) {
    wrap.innerHTML = '<p class="hint">Login Google belum dikonfigurasi (isi googleClientId di config). Anda tetap bisa isi nama manual + token.</p>';
    return;
  }
  if (!window.google || !google.accounts) {
    wrap.innerHTML = '<p class="hint">Memuat Google Sign-In… refresh jika belum muncul.</p>';
    setTimeout(initGoogleButton, 1500);
    return;
  }
  wrap.innerHTML = '';
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (resp) => {
      try {
        const payload = JSON.parse(atob(resp.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        guestSession.email = payload.email || '';
        guestSession.name = payload.name || '';
        guestSession.picture = payload.picture || '';
        const lab = document.getElementById('google-user-label');
        if (lab) lab.textContent = 'Login: ' + guestSession.name + ' (' + guestSession.email + ')';
        const gn = document.getElementById('guest-name');
        if (gn && !gn.value) gn.value = guestSession.name || '';
      } catch (e) { console.warn(e); }
    }
  });
  google.accounts.id.renderButton(wrap, { theme: 'outline', size: 'large', width: 280 });
}

function predicateFromPercent(p) {
  if (p >= 90) return 'Sangat Baik (Excellent)';
  if (p >= 80) return 'Baik (Good)';
  if (p >= 70) return 'Cukup (Fair)';
  if (p >= 60) return 'Lulus Minimum';
  return 'Perlu Latihan Lagi';
}

function downloadCertificatePDF() {
  if (!lastExamResult) {
    // fallback dari DOM hasil
    lastExamResult = {
      name: (document.getElementById('guest-name') && document.getElementById('guest-name').value) || (nameSelect && nameSelect.value) || 'Peserta',
      packTitle: selectedPack ? selectedPack.title : '',
      packId: selectedPack ? selectedPack.id : '',
      scorePg: document.getElementById('score-value') ? document.getElementById('score-value').textContent : '0',
      maxPg: (document.getElementById('score-total') || {}).textContent || '',
      percent: (document.getElementById('score-percent') || {}).textContent || '',
      predicate: predicateFromPercent(parseFloat(String((document.getElementById('score-percent')||{}).textContent||'0'))),
      className: (classSelect && classSelect.value) || '',
      issuedAt: new Date().toLocaleString('id-ID')
    };
  }
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('Modul PDF belum termuat. Refresh halaman.'); return; }
  const r = lastExamResult;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  // background
  doc.setFillColor(11, 18, 32);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(167, 139, 250);
  doc.setLineWidth(3);
  doc.rect(24, 24, W - 48, H - 48);
  doc.setDrawColor(34, 211, 238);
  doc.setLineWidth(1);
  doc.rect(32, 32, W - 64, H - 64);
  doc.setTextColor(167, 139, 250);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text((config.certificateIssuer || 'QuizIT · Silverhawk Network'), W/2, 70, { align: 'center' });
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(28);
  doc.text('SERTIFIKAT PENYELESAIAN', W/2, 120, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(148, 163, 184);
  doc.text('Diberikan kepada', W/2, 160, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(String(r.name || '-'), W/2, 195, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(203, 213, 225);
  doc.text('atas partisipasi dan hasil asesmen:', W/2, 230, { align: 'center' });
  doc.setTextColor(167, 139, 250);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(r.packTitle || r.packId || ''), W/2, 258, { align: 'center' });
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  const lines = [
    'Skor PG: ' + r.scorePg + ' / ' + r.maxPg + '  (' + r.percent + '%)',
    'Predikat: ' + r.predicate,
    r.className ? ('Kelas/Identitas: ' + r.className) : '',
    'Tanggal: ' + (r.issuedAt || new Date().toLocaleString('id-ID'))
  ].filter(Boolean);
  let y = 300;
  lines.forEach(line => { doc.text(line, W/2, y, { align: 'center' }); y += 22; });
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Verifikasi internal QuizIT · Bukan sertifikasi vendor resmi (Cisco/CompTIA/AWS/dll.)', W/2, H - 50, { align: 'center' });
  doc.save('Sertifikat-QuizIT-' + String(r.name || 'peserta').replace(/\\s+/g, '_') + '.pdf');
}


let selectedPack = null;
let packQuestions = [];
let packEssays = [];
let packPractice = [];
let examQuestions = [];
let currentIndex = 0;
let answers = {};
let essayAnswers = {};
let studentName = '';
let studentClass = '';
let timerInterval = null;
let timeLeft = 0;
let examFinished = false;
let isPracticeMode = false;
let TOTAL_MC = 25;
let TOTAL_ESSAY = 5;
let TOTAL_ALL = 30;

const loginScreen = document.getElementById('login-screen');
const examScreen = document.getElementById('exam-screen');
const resultScreen = document.getElementById('result-screen');
const adminScreen = document.getElementById('admin-screen');
const classSelect = document.getElementById('class-select');
const passwordGroup = document.getElementById('password-group');
const examPassword = document.getElementById('exam-password');
const nameGroup = document.getElementById('name-group');
const nameSelect = document.getElementById('name-select');
const btnStart = document.getElementById('btn-start');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnSubmit = document.getElementById('btn-submit');
const mcCard = document.getElementById('mc-card');
const essayCard = document.getElementById('essay-card');
const essayTextarea = document.getElementById('essay-answer');

async function init() {
  try {
    const [cfgRes, stuRes, catRes] = await Promise.all([
      fetch('config.json'),
      fetch('students.json'),
      fetch('catalog.json')
    ]);
    config = await cfgRes.json();
    window.__CBT_CONFIG__ = config;
    students = await stuRes.json();
    catalog = await catRes.json();
    validPacks = await validateCatalog(catalog.packs || []);
    validPacks = (validPacks || []).filter(p => {
      try { return isPackForThisProduct(p.id, null); } catch (_) { return true; }
    });
    renderPackList();
    setupEventListeners();
    setupAntiCheatUi();
    setupAdminExtendedUi();
    loadProctorSettings().catch(() => {});
    if (window.SHSupabase && SHSupabase.sbEnabled()) {
      mergeRemotePacks().catch(err => console.warn('Remote packs:', err));
    }
  } catch (err) {
    console.error(err);
    const msg = (err && err.message) ? String(err.message) : String(err);
    const el = document.getElementById('pack-list');
    if (el) {
      el.innerHTML =
        '<p class="hint">Gagal memuat konfigurasi/data awal.</p>' +
        '<p class="hint" style="font-size:0.8rem;opacity:.85">Detail: ' + msg.replace(/[<>&]/g,'') + '</p>' +
        '<p class="hint" style="font-size:0.8rem;opacity:.85">Cek config.json (JSON valid?), catalog.json, dan students.json di repo.</p>';
    }
  }
}

/** Validasi: setiap pack harus punya file questions yang bisa di-fetch */
async function validateCatalog(packs) {
  const results = [];
  for (const pack of packs) {
    if (pack.enabled === false) {
      results.push({ ...pack, valid: false, reason: 'disabled' });
      continue;
    }
    try {
      const res = await fetch(pack.questionsFile, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('soal kosong');
      // Cek file practice & essays (opsional tapi dicatat)
      let practiceOk = false;
      let essaysCount = 0;
      try {
        const pr = await fetch(pack.practiceFile, { cache: 'no-store' });
        if (pr.ok) {
          const pd = await pr.json();
          practiceOk = Array.isArray(pd) && pd.length > 0;
        }
      } catch (_) {}
      try {
        if (pack.essaysFile) {
          const er = await fetch(pack.essaysFile, { cache: 'no-store' });
          if (er.ok) {
            const ed = await er.json();
            essaysCount = Array.isArray(ed) ? ed.length : 0;
          }
        }
      } catch (_) {}
      results.push({
        ...pack,
        valid: true,
        mcCount: data.length,
        practiceOk,
        essaysCount
      });
    } catch (err) {
      console.warn('Pack invalid:', pack.id, err);
      results.push({ ...pack, valid: false, reason: String(err.message || err) });
    }
  }
  return results;
}


function renderPackList() {
  renderPackListProgressive();
}

function renderPackListProgressive() {
  const box = document.getElementById('pack-list');
  if (!box) return;
  const packs = (validPacks || []).filter(p => p && p.valid !== false && isPackForThisProduct(p.id, p._remoteData));
  box.innerHTML = '';
  if (!packs.length) {
    box.innerHTML = '<p class="hint">Memuat paket soal…</p>';
    return;
  }
  let i = 0;
  const status = document.createElement('p');
  status.className = 'hint';
  status.id = 'pack-load-status';
  status.textContent = 'Memuat daftar paket…';
  box.appendChild(status);
  function addNext() {
    if (i >= packs.length) {
      if (status.parentNode) status.remove();
      return;
    }
    const pack = packs[i++];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pack-item';
    btn.dataset.packId = pack.id;
    const mc = pack.mcCount != null ? pack.mcCount : '?';
    const es = pack.essaysCount != null ? pack.essaysCount : '?';
    const latihan = pack.practiceOk ? ' · Latihan OK' : '';
    btn.innerHTML = '<strong>' + escapeHtml(pack.title || pack.id) + '</strong>' +
      '<span class="pack-desc">' + escapeHtml((pack.subject ? pack.subject + ' — ' : '') + (pack.description || '')) + '</span>' +
      '<span class="pack-meta">' + mc + ' PG + ' + es + ' Essay' + latihan + '</span>';
    btn.addEventListener('click', () => selectPack(pack, btn));
    box.appendChild(btn);
    status.textContent = 'Memuat paket ' + i + ' / ' + packs.length + '…';
    setTimeout(addNext, 40);
  }
  addNext();
}



function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function selectPack(pack, btnEl) {
  document.querySelectorAll('.pack-item').forEach(b => b.classList.remove('selected'));
  if (btnEl) btnEl.classList.add('selected');
  selectedPack = pack;

  // Load pack files
  try {
    const fetches = [fetch(pack.questionsFile).then(r => r.json())];
    if (pack.essaysFile) fetches.push(fetch(pack.essaysFile).then(r => r.json()).catch(() => []));
    else fetches.push(Promise.resolve([]));
    if (pack.practiceFile) fetches.push(fetch(pack.practiceFile).then(r => r.json()).catch(() => []));
    else fetches.push(Promise.resolve([]));

    const [qs, es, pr] = await Promise.all(fetches);
    packQuestions = Array.isArray(qs) ? qs : [];
    packEssays = Array.isArray(es) ? es : [];
    packPractice = Array.isArray(pr) && pr.length ? pr : packQuestions;

    document.getElementById('after-pack').style.display = 'block';
    await populateClassSelectForPack(pack.id);
    classSelect.value = '';
    onClassChange();
  } catch (err) {
    console.error(err);
    alert('Gagal memuat soal paket ini.');
    selectedPack = null;
  }
}

function setupEventListeners() {
  classSelect.addEventListener('change', onClassChange);
  examPassword.addEventListener('input', checkStartReady);
  nameSelect.addEventListener('change', checkStartReady);
  btnStart.addEventListener('click', onStartClick);
  const em = document.getElementById('exam-mode');
  if (em) em.addEventListener('change', onExamModeChange);
  const brt = document.getElementById('btn-request-token');
  if (brt) brt.addEventListener('click', openTokenWhatsApp);
  ['exam-token','guest-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', checkStartReady);
  });
  const bdc = document.getElementById('btn-download-cert');
  if (bdc) bdc.addEventListener('click', downloadCertificatePDF);
  setTimeout(initGoogleButton, 800);
  wireUploadPackIdAuto();
  setTimeout(refreshAdminDatalists, 1200);
  btnPrev.addEventListener('click', () => navigate(-1));
  btnNext.addEventListener('click', () => navigate(1));
  btnSubmit.addEventListener('click', confirmSubmit);
  document.getElementById('btn-download').addEventListener('click', downloadResult);
  document.getElementById('btn-review').addEventListener('click', showReview);
  document.getElementById('close-review').addEventListener('click', () =>
    document.getElementById('review-modal').classList.remove('active'));
  essayTextarea.addEventListener('input', saveCurrentEssay);

  document.getElementById('btn-show-practice').addEventListener('click', showPracticeLogin);
  document.getElementById('btn-back-from-practice').addEventListener('click', hideSpecialLogins);
  document.getElementById('btn-start-practice').addEventListener('click', startPractice);
  document.getElementById('btn-show-admin').addEventListener('click', showAdminLogin);
  document.getElementById('btn-back-from-admin').addEventListener('click', hideSpecialLogins);
  document.getElementById('btn-admin-enter').addEventListener('click', enterAdmin);
  document.getElementById('btn-admin-logout').addEventListener('click', logoutAdmin);
  const blg = document.getElementById('btn-link-google');
  if (blg) blg.addEventListener('click', linkCurrentAdminGoogle);
  document.getElementById('btn-admin-refresh').addEventListener('click', adminLoadData);
  document.getElementById('btn-admin-download').addEventListener('click', adminDownloadCSV);
  document.getElementById('btn-jump-unanswered').addEventListener('click', jumpToUnanswered);
  document.getElementById('btn-jump-last').addEventListener('click', jumpToLast);
  document.getElementById('btn-back-home').addEventListener('click', backToLogin);
}

function showPracticeLogin() {
  if (!selectedPack) {
    alert('Pilih paket soal / mapel terlebih dahulu.');
    return;
  }
  document.getElementById('login-main').style.display = 'none';
  document.getElementById('practice-login').style.display = 'block';
  document.getElementById('admin-login').style.display = 'none';
  document.getElementById('practice-pack-label').textContent =
    'Latihan: ' + (selectedPack.title || selectedPack.id) +
    ' (' + packPractice.length + ' soal PG)';
  document.getElementById('practice-password').value = '';
  document.getElementById('practice-password').focus();
}

function showAdminLogin() {
  document.getElementById('login-main').style.display = 'none';
  document.getElementById('practice-login').style.display = 'none';
  document.getElementById('admin-login').style.display = 'block';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-password').focus();
  setTimeout(renderAdminGoogleButton, 400);
}

function hideSpecialLogins() {
  document.getElementById('login-main').style.display = 'block';
  document.getElementById('practice-login').style.display = 'none';
  document.getElementById('admin-login').style.display = 'none';
}


async function populateClassSelectForPack(packId) {
  classSelect.innerHTML = '<option value="">-- Pilih Kelas --</option>';
  if (!packId || !window.SHSupabase || !SHSupabase.sbEnabled()) return;
  try {
    const parts = await SHSupabase.listParticipants(packId);
    if (!parts || !parts.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- Belum ada peserta di paket (atur di Kelola Paket) --';
      classSelect.appendChild(opt);
      return;
    }
    const map = new Map();
    parts.forEach(p => {
      const key = p.class_id || p.student_class;
      const label = p.student_class || p.class_id || 'Kelas';
      if (key && !map.has(String(key))) map.set(String(key), label);
    });
    // enrich labels from master classes
    let classes = [];
    try { classes = await SHSupabase.listClasses(); } catch (_) {}
    const byId = {};
    (classes || []).forEach(c => { byId[c.id] = c; });
    map.forEach((label, key) => {
      const opt = document.createElement('option');
      opt.value = key;
      if (byId[key]) {
        opt.textContent = byId[key].name + (byId[key].institution ? ' · ' + byId[key].institution : '');
      } else {
        opt.textContent = label;
      }
      classSelect.appendChild(opt);
    });
  } catch (e) {
    console.warn(e);
  }
}

async function onClassChange() {
  const cls = classSelect.value;
  passwordGroup.style.display = cls ? 'block' : 'none';
  nameGroup.style.display = 'none';
  nameSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
  examPassword.value = '';
  btnStart.disabled = true;
  if (!cls) return;

  const packId = selectedPack && (selectedPack.id || (selectedPack._remoteData && selectedPack._remoteData.id));
  if (!packId) {
    nameGroup.style.display = 'block';
    return;
  }

  try {
    if (!window.SHSupabase || !SHSupabase.sbEnabled() || !SHSupabase.listParticipants) {
      alert('Data peserta belum siap. Hubungi admin.');
      return;
    }
    const parts = await SHSupabase.listParticipants(packId);
    if (!parts || !parts.length) {
      alert('Paket ini belum memiliki peserta. Admin: buka Kelola Paket → pilih paket → centang peserta → Simpan. Jika daftar kelas masih kosong, buka Kelola Peserta → Impor data awal.');
      return;
    }
    const allowed = parts.filter(x => {
      const sc = String(x.student_class || '');
      const cid = String(x.class_id || '');
      return (sc === String(cls) || cid === String(cls)) && x.active !== false;
    });
    if (!allowed.length) {
      nameSelect.innerHTML = '<option value="">-- Tidak ada peserta di kelas ini --</option>';
      nameGroup.style.display = 'block';
      return;
    }
    allowed.forEach(x => {
      const opt = document.createElement('option');
      opt.value = x.student_name;
      const label = x.display_name && x.display_name !== x.student_name
        ? (x.display_name + ' (' + x.student_name + ')')
        : x.student_name;
      opt.textContent = label;
      nameSelect.appendChild(opt);
    });
    nameGroup.style.display = 'block';
  } catch (e) {
    console.warn(e);
    alert('Gagal memuat daftar peserta.');
  }
}

function checkStartReady() {
  const mode = (document.getElementById('exam-mode') || {}).value || 'registered';
  if (mode === 'token') {
    const tok = (document.getElementById('exam-token') || {}).value || '';
    const nm = (document.getElementById('guest-name') || {}).value || '';
    btnStart.disabled = !(selectedPack && tok.trim() && nm.trim());
    return;
  }
  const cls = classSelect.value;
  const pass = examPassword.value.trim();
  const name = nameSelect.value;
  btnStart.disabled = !(selectedPack && cls && name && pass);
}


function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function prepareExamQuestions(source) {
  const shuffledQs = shuffleArray(source);
  examQuestions = shuffledQs.map(q => {
    const opts = q.options.map((text, idx) => ({ text, originalIndex: idx }));
    const shuffledOpts = shuffleArray(opts);
    const newAnswerIndex = shuffledOpts.findIndex(o => o.originalIndex === q.answer);
    return {
      id: q.id,
      question: q.question,
      options: shuffledOpts.map(o => o.text),
      answer: newAnswerIndex
    };
  });
}

async function onStartClick() {
  const cls = classSelect.value;
  const name = nameSelect.value;
  if (!selectedPack || !cls || !name) return;

  btnStart.disabled = true;
  btnStart.textContent = 'Memeriksa...';

  const examMode = (document.getElementById('exam-mode') || {}).value || 'registered';
  if (examMode === 'token') {
    const tokenCode = (document.getElementById('exam-token') || {}).value || '';
    const gName = (document.getElementById('guest-name') || {}).value || guestSession.name || '';
    const gEmail = guestSession.email || '';
    if (!selectedPack) { alert('Pilih paket dulu'); btnStart.disabled=false; btnStart.textContent='Mulai Ujian'; return; }
    if (!gName.trim()) { alert('Isi nama untuk sertifikat'); btnStart.disabled=false; btnStart.textContent='Mulai Ujian'; return; }
    if (!tokenCode.trim()) { alert('Isi token tes'); btnStart.disabled=false; btnStart.textContent='Mulai Ujian'; return; }
    try {
      const ver = await SHSupabase.verifyExamToken(tokenCode.trim(), selectedPack.id, gName, gEmail);
      if (!ver.ok) { alert(ver.reason || 'Token tidak valid'); btnStart.disabled=false; btnStart.textContent='Mulai Ujian'; return; }
      await SHSupabase.consumeExamToken(ver.token.id, { user_name: gName, user_email: gEmail, pack_id: selectedPack.id });
      // set session identity for scoring/cert
      window.__guestExam = { name: gName, email: gEmail, token: tokenCode.trim() };
    } catch (e) {
      alert(e.message || 'Gagal verifikasi token');
      btnStart.disabled = false; btnStart.textContent = 'Mulai Ujian';
      return;
    }
  }


  // Password paket (multi + kadaluarsa) atau fallback password rombel lama
  const packId = selectedPack.id || (selectedPack._remoteData && selectedPack._remoteData.id);
  const passTyped = examPassword.value.trim();
  try {
    if (window.SHSupabase && SHSupabase.sbEnabled() && packId) {
      const hasPw = await SHSupabase.packHasPasswords(packId);
      if (hasPw) {
        const ver = await SHSupabase.verifyPackPassword(packId, passTyped);
        if (!ver.ok) {
          alert('Password ujian salah atau sudah kadaluarsa.');
          btnStart.disabled = false;
          btnStart.textContent = 'Mulai Ujian';
          return;
        }
      } else {
        const legacy = config.passwords && config.passwords[cls];
        if (legacy && passTyped !== legacy) {
          alert('Password ujian salah.');
          btnStart.disabled = false;
          btnStart.textContent = 'Mulai Ujian';
          return;
        }
        if (!legacy) {
          // tidak ada password paket & tidak ada legacy → izinkan jika field terisi
        }
      }
    } else {
      const legacy = config.passwords && config.passwords[cls];
      if (legacy && passTyped !== legacy) {
        alert('Password ujian salah.');
        btnStart.disabled = false;
        btnStart.textContent = 'Mulai Ujian';
        return;
      }
    }
  } catch (e) {
    console.warn(e);
    alert('Gagal memeriksa password. Coba lagi.');
    btnStart.disabled = false;
    btnStart.textContent = 'Mulai Ujian';
    return;
  }



  // Blokir retake per packId via Supabase
  if (window.SHSupabase && typeof SHSupabase.sbEnabled === 'function' && SHSupabase.sbEnabled()) {
    if (typeof SHSupabase.hasTakenExam !== 'function') {
      console.warn('hasTakenExam belum ter-deploy. Upload js/admin-supabase.js terbaru.');
    } else {
      try {
        const taken = await SHSupabase.hasTakenExam(name, cls, selectedPack.id);
        if (taken) {
          alert(
            'Anda sudah pernah menyelesaikan ujian paket ini (' +
            (selectedPack.title || selectedPack.id) +
            ').\nSetiap paket hanya boleh dikerjakan satu kali.\nHubungi guru jika ada kendala.'
          );
          btnStart.disabled = false;
          btnStart.textContent = 'Mulai Ujian';
          return;
        }
      } catch (err) {
        console.warn('Gagal cek status ujian ke Supabase:', err);
        // Jangan kunci semua siswa jika API error — izinkan mulai, retake tetap dicegah saat data terbaca
        alert(
          'Peringatan: status ujian tidak bisa dicek saat ini (' +
          (err && err.message ? err.message : 'error') +
          ').\nJika Anda sudah pernah submit paket ini, hasil ganda dapat ditolak guru.\nLanjut memulai ujian...'
        );
      }
    }
  } else {
    console.warn('Supabase belum aktif — pembatasan retake per pack tidak berjalan.');
  }

  isPracticeMode = false;
  TOTAL_MC = packQuestions.length;
  TOTAL_ESSAY = packEssays.length;
  TOTAL_ALL = TOTAL_MC + TOTAL_ESSAY;
  const dur = selectedPack.durationMinutes || config.defaultDurationMinutes || 60;
  startExam(name, cls, packQuestions, dur);
  btnStart.textContent = 'Mulai Ujian';
}

function startPractice() {
  const pass = document.getElementById('practice-password').value.trim();
  if (pass !== (config.practicePassword || '')) {
    alert('Password latihan salah.');
    return;
  }
  if (!selectedPack || !packPractice.length) {
    alert('Paket soal / file latihan belum siap.');
    return;
  }
  isPracticeMode = true;
  TOTAL_MC = packPractice.length;
  TOTAL_ESSAY = 0;
  TOTAL_ALL = TOTAL_MC;
  const dur = selectedPack.practiceDurationMinutes || config.defaultPracticeDurationMinutes || 30;
  startExam('Peserta Latihan', 'LATIHAN', packPractice, dur);
}

async function checkNameInSheet(name, cls) {
  const url = config.googleScriptUrl +
    '?action=check&name=' + encodeURIComponent(name) +
    '&class=' + encodeURIComponent(cls);
  const res = await fetch(url);
  const data = await res.json();
  return data.exists === true;
}

function startExam(name, cls, questionSource, durationMin) {
  studentClass = cls;
  studentName = name;
  prepareExamQuestions(questionSource);
  currentIndex = 0;
  answers = {};
  essayAnswers = {};
  examFinished = false;
  timeLeft = durationMin * 60;

  const packLabel = selectedPack ? (selectedPack.title || selectedPack.id) : '';
  document.getElementById('student-info').textContent = isPracticeMode
    ? `Latihan • ${packLabel}`
    : `${studentName} • ${studentClass}`;

  loginScreen.classList.remove('active');
  adminScreen.classList.remove('active');
  resultScreen.classList.remove('active');
  examScreen.classList.add('active');
  renderCurrent();
  startTimer();
  if (!isPracticeMode) {
    startAntiCheat();
    fsUnlockedByAdmin = false;
    if (proctorSettings.forceFullscreen) {
      setTimeout(() => enterExamFullscreen(), 300);
    }
  } else {
    stopAntiCheat();
    stopFullscreenGuard();
  }
}

function startTimer() {
  updateTimerDisplay();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      finishExam(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');
  const el = document.getElementById('timer');
  el.textContent = `${m}:${s}`;
  el.classList.remove('warning', 'danger');
  if (timeLeft <= 300) el.classList.add('warning');
  if (timeLeft <= 60) el.classList.add('danger');
}

function isEssayMode() {
  return !isPracticeMode && currentIndex >= TOTAL_MC;
}

function getEssayIndex() {
  return currentIndex - TOTAL_MC;
}

function saveCurrentEssay() {
  if (!isEssayMode()) return;
  const essay = packEssays[getEssayIndex()];
  if (essay) essayAnswers[essay.id] = essayTextarea.value;
}

function isAnswered(idx) {
  if (isPracticeMode || idx < TOTAL_MC) {
    const q = examQuestions[idx];
    return q && answers[q.id] !== undefined;
  }
  const essay = packEssays[idx - TOTAL_MC];
  return essay && essayAnswers[essay.id] && essayAnswers[essay.id].trim() !== '';
}

function renderNavStrip() {
  const strip = document.getElementById('nav-strip');
  strip.innerHTML = '';
  for (let i = 0; i < TOTAL_ALL; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-dot';
    if (i === currentIndex) btn.classList.add('current');
    else if (isAnswered(i)) btn.classList.add('answered');
    else btn.classList.add('unanswered');
    btn.textContent = i + 1;
    btn.addEventListener('click', () => {
      saveCurrentEssay();
      currentIndex = i;
      renderCurrent();
    });
    strip.appendChild(btn);
  }
}

function renderCurrent() {
  document.getElementById('progress-bar').style.width =
    `${((currentIndex + 1) / TOTAL_ALL) * 100}%`;
  document.getElementById('question-counter').textContent =
    `${currentIndex + 1} / ${TOTAL_ALL}`;
  renderNavStrip();

  if (isEssayMode()) {
    mcCard.style.display = 'none';
    essayCard.style.display = 'block';
    const eIdx = getEssayIndex();
    const essay = packEssays[eIdx];
    document.getElementById('e-num').textContent = `${eIdx + 1} dari ${TOTAL_ESSAY}`;
    document.getElementById('e-text').textContent = essay.question;
    essayTextarea.value = essayAnswers[essay.id] || '';
  } else {
    mcCard.style.display = 'block';
    essayCard.style.display = 'none';
    const q = examQuestions[currentIndex];
    document.getElementById('q-num').textContent = currentIndex + 1;
    document.getElementById('q-text').textContent = q.question;
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E'];
    q.options.forEach((opt, idx) => {
      const div = document.createElement('div');
      div.className = 'option' + (answers[q.id] === idx ? ' selected' : '');
      div.innerHTML = `
        <div class="option-letter">${letters[idx]}</div>
        <div class="option-text">${opt}</div>
      `;
      div.addEventListener('click', () => {
        answers[q.id] = idx;
        renderCurrent();
      });
      container.appendChild(div);
    });
  }

  btnPrev.disabled = currentIndex === 0;
  const isLast = currentIndex === TOTAL_ALL - 1;
  btnNext.style.display = isLast ? 'none' : 'inline-flex';
  btnSubmit.style.display = isLast ? 'inline-flex' : 'none';
}

function navigate(dir) {
  saveCurrentEssay();
  const newIdx = currentIndex + dir;
  if (newIdx >= 0 && newIdx < TOTAL_ALL) {
    currentIndex = newIdx;
    renderCurrent();
  }
}

function jumpToUnanswered() {
  saveCurrentEssay();
  for (let i = 0; i < TOTAL_ALL; i++) {
    if (!isAnswered(i)) {
      currentIndex = i;
      renderCurrent();
      return;
    }
  }
  alert('Semua soal sudah dijawab.');
}

function jumpToLast() {
  saveCurrentEssay();
  currentIndex = TOTAL_ALL - 1;
  renderCurrent();
}

function confirmSubmit() {
  saveCurrentEssay();
  let unanswered = 0;
  for (let i = 0; i < TOTAL_ALL; i++) if (!isAnswered(i)) unanswered++;
  let msg = isPracticeMode ? 'Yakin menyelesaikan latihan?' : 'Yakin kirim semua jawaban?';
  if (unanswered > 0) msg = `Masih ada ${unanswered} soal belum dijawab. Yakin tetap kirim?`;
  if (confirm(msg)) finishExam(false);
}

function finishExam(auto = false) {
  if (examFinished) return;
  examFinished = true;
  clearInterval(timerInterval);
  stopAntiCheat();
  stopFullscreenGuard();
  exitExamFullscreenQuiet();
  saveCurrentEssay();

  let correct = 0;
  const detail = [];
  examQuestions.forEach(q => {
    const userAns = answers[q.id];
    const isCorrect = userAns === q.answer;
    if (isCorrect) correct++;
    detail.push({
      id: q.id,
      question: q.question,
      userAnswer: userAns !== undefined ? q.options[userAns] : '(tidak dijawab)',
      correctAnswer: q.options[q.answer],
      isCorrect
    });
  });

  const percent = TOTAL_MC ? Math.round((correct / TOTAL_MC) * 100) : 0;
  const durationMin = isPracticeMode
    ? (selectedPack?.practiceDurationMinutes || config.defaultPracticeDurationMinutes || 30)
    : (selectedPack?.durationMinutes || config.defaultDurationMinutes || 60);

  const essaySummary = isPracticeMode ? [] : packEssays.map(e => ({
    id: e.id,
    question: e.question,
    answer: essayAnswers[e.id] || '(kosong)'
  }));

  const resultData = {
    name: studentName,
    class: studentClass,
    packId: selectedPack?.id || '',
    packTitle: selectedPack?.title || '',
    score: correct,
    total: TOTAL_MC,
    percent,
    timeUsedSeconds: (durationMin * 60) - timeLeft,
    finishedAt: new Date().toISOString(),
    autoSubmit: auto,
    isPractice: isPracticeMode,
    tabSwitchCount: tabSwitchCount,
    mcAnswers: detail,
    essays: essaySummary
  };

  // Simpan ke satu sumber utama agar tidak dobel di panel admin
  if (!isPracticeMode && window.SHSupabase && SHSupabase.sbEnabled()) {
    SHSupabase.saveResult(resultData).catch(err => console.warn('Supabase save:', err));
  } else if (!isPracticeMode && config.googleScriptUrl && config.googleScriptUrl.trim() !== '') {
    sendToGoogleSheet(resultData);
  }

  examScreen.classList.remove('active');
  resultScreen.classList.add('active');

  document.getElementById('result-title').textContent = isPracticeMode ? 'Hasil Latihan' : 'Hasil Ujian';
  document.getElementById('score-value').textContent = correct;
  document.getElementById('score-total').textContent = `/ ${TOTAL_MC}`;
  document.getElementById('score-percent').textContent = `${percent}%`;

  let msg = 'Tetap semangat belajar!';
  if (percent >= 90) msg = 'Luar biasa! Penguasaan materi sangat baik.';
  else if (percent >= 75) msg = 'Bagus! Terus tingkatkan.';
  else if (percent >= 60) msg = 'Cukup baik, masih ada ruang untuk berkembang.';
  document.getElementById('score-message').textContent = msg;

  const packLabel = selectedPack ? selectedPack.title : '';
  document.getElementById('result-details').innerHTML = isPracticeMode
    ? `<strong>Mode Latihan</strong> • ${packLabel}<br>Benar: ${correct} / ${TOTAL_MC}<br>Waktu: ${formatTime((durationMin * 60) - timeLeft)}<br>Tidak dikirim ke Sheet.`
    : `<strong>${studentName}</strong> • Kelas ${studentClass}<br>Paket: ${packLabel}<br>
      PG: ${correct} / ${TOTAL_MC}<br>
      Essay: ${Object.keys(essayAnswers).filter(k => essayAnswers[k]?.trim()).length} / ${TOTAL_ESSAY} diisi<br>
      Waktu: ${formatTime((durationMin * 60) - timeLeft)}<br>
      Pindah tab terdeteksi: ${tabSwitchCount}x`;

  window._lastResult = resultData;
}

function formatTime(sec) {
  return `${Math.floor(sec / 60)} menit ${sec % 60} detik`;
}

function downloadResult() {
  const data = window._lastResult;
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hasil_${data.packId || 'pack'}_${data.class}_${String(data.name).replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function showReview() {
  const data = window._lastResult;
  if (!data) return;
  document.getElementById('review-body').innerHTML = data.mcAnswers.map((a, i) => `
    <div class="review-item ${a.isCorrect ? 'correct' : 'wrong'}">
      <div class="review-q">${i + 1}. ${a.question}</div>
      <div class="review-ans">Jawabanmu: ${a.userAnswer}<br>Kunci: ${a.correctAnswer} ${a.isCorrect ? '✓' : '✗'}</div>
    </div>
  `).join('');
  document.getElementById('review-modal').classList.add('active');
}

function backToLogin() {
  resultScreen.classList.remove('active');
  loginScreen.classList.add('active');
  hideSpecialLogins();
  classSelect.value = '';
  onClassChange();
}

function sendToGoogleSheet(data) {
  const payload = {
    timestamp: new Date().toISOString(),
    name: data.name,
    class: data.class,
    packId: data.packId || '',
    packTitle: data.packTitle || '',
    score: data.score,
    total: data.total,
    percent: data.percent,
    timeUsedSeconds: data.timeUsedSeconds,
    autoSubmit: data.autoSubmit ? 'YA' : 'TIDAK',
    tabSwitchCount: data.tabSwitchCount || 0,
    essay1: (data.essays[0]?.answer || '').substring(0, 1500),
    essay2: (data.essays[1]?.answer || '').substring(0, 1500),
    essay3: (data.essays[2]?.answer || '').substring(0, 1500),
    essay4: (data.essays[3]?.answer || '').substring(0, 1500),
    essay5: (data.essays[4]?.answer || '').substring(0, 1500)
  };
  fetch(config.googleScriptUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => console.warn(err));
}

function enterAdmin() {
  if (document.getElementById('admin-password').value.trim() !== (config.adminPassword || '')) {
    alert('Password admin salah.');
    return;
  }
  loginScreen.classList.remove('active');
  adminScreen.classList.add('active');
  document.getElementById('admin-list').innerHTML = '';
  document.getElementById('admin-status').textContent = 'Klik "Muat Data dari Sheet".';
  populateAdminPackFilter();
}

function populateAdminPackFilter() {
  const sel = document.getElementById('admin-pack-filter');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Semua mapel</option>';
  (validPacks || []).filter(p => p.valid).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title || p.id;
    sel.appendChild(opt);
  });
  // juga opsi dari data yang sudah diload
  sel.value = cur || '';
}

function getFilteredAdminRows() {
  const rows = window._adminRows || [];
  const filter = (document.getElementById('admin-pack-filter')?.value || '').trim();
  if (!filter) return rows;
  return rows.filter(r => {
    const id = String(r.packId || '').trim();
    const title = String(r.packTitle || '').trim().toLowerCase();
    if (id === filter) return true;
    const pack = (validPacks || []).find(p => p.id === filter);
    if (pack && title && title === String(pack.title || '').toLowerCase()) return true;
    return false;
  });
}

function renderAdminList(rows) {
  const list = document.getElementById('admin-list');
  list.innerHTML = '';
  rows.forEach(row => {
    const div = document.createElement('div');
    div.className = 'admin-row';
    const packLabel = row.packTitle || row.packId || '—';
    div.innerHTML = `
      <div class="info"><strong>${escapeHtml(row.name)}</strong> • Kelas ${escapeHtml(row.class)}
      <br><small>${escapeHtml(packLabel)} • ${escapeHtml(row.timestamp || '')}</small></div>
      <div class="score">${row.score}/${row.total} (${row.percent}%)</div>
      <button type="button" class="btn-del">Hapus</button>`;
    div.querySelector('.btn-del').addEventListener('click', () => adminDeleteRow(row));
    list.appendChild(div);
  });
}

function logoutAdmin() {
  adminScreen.classList.remove('active');
  loginScreen.classList.add('active');
  hideSpecialLogins();
}

async function adminLoadData() {
  if (!config.googleScriptUrl) {
    alert('googleScriptUrl belum diisi');
    return;
  }
  const status = document.getElementById('admin-status');
  status.textContent = 'Memuat...';
  document.getElementById('admin-list').innerHTML = '';
  try {
    const res = await fetch(config.googleScriptUrl + '?action=list');
    const data = await res.json();
    if (!data.rows || !data.rows.length) {
      status.textContent = 'Belum ada data.';
      window._adminRows = [];
      return;
    }
    window._adminRows = data.rows;
    // tambah opsi mapel dari data sheet
    const sel = document.getElementById('admin-pack-filter');
    const seen = new Set([...(sel ? [...sel.options].map(o => o.value) : [])]);
    data.rows.forEach(r => {
      if (r.packId && !seen.has(r.packId)) {
        seen.add(r.packId);
        const opt = document.createElement('option');
        opt.value = r.packId;
        opt.textContent = r.packTitle || r.packId;
        sel.appendChild(opt);
      }
    });
    const filtered = getFilteredAdminRows();
    status.textContent = `Menampilkan ${filtered.length} dari ${data.rows.length} data.`;
    renderAdminList(filtered);
  } catch (err) {
    status.textContent = 'Gagal memuat. Pastikan Apps Script action=list sudah di-deploy.';
  }
}

async function adminDeleteRow(row) {
  // row: object dari list admin (bisa dari Supabase atau Sheet)
  const name = row && row.name;
  const cls = row && row.class;
  const packId = (row && row.packId) || '';
  const packLabel = (row && (row.packTitle || row.packId)) || '';
  if (!name || !cls) {
    alert('Data baris tidak valid.');
    return;
  }
  if (!confirm('Hapus record "' + name + '" kelas ' + cls + (packLabel ? ' (' + packLabel + ')' : '') + '?')) return;

  let deleted = false;
  const errors = [];

  // 1) Hapus dari Supabase (sumber utama)
  if (window.SHSupabase && SHSupabase.sbEnabled()) {
    try {
      if (row._id != null && row._id !== '' && typeof SHSupabase.deleteResult === 'function') {
        await SHSupabase.deleteResult(row._id);
        deleted = true;
      } else if (typeof SHSupabase.deleteResultsByStudent === 'function') {
        const n = await SHSupabase.deleteResultsByStudent(name, cls, packId || undefined);
        if (n > 0) deleted = true;
        else errors.push('Supabase: data tidak ditemukan');
      } else {
        errors.push('Fungsi hapus Supabase belum ter-deploy (upload js/admin-supabase.js)');
      }
    } catch (e) {
      console.warn('Supabase delete failed', e);
      errors.push('Supabase: ' + (e.message || e));
    }
  }

  // 2) Opsional: hapus juga di Google Sheet (jika masih dipakai arsip)
  if (config.googleScriptUrl && config.googleScriptUrl.trim()) {
    try {
      const url = config.googleScriptUrl +
        '?action=delete&name=' + encodeURIComponent(name) +
        '&class=' + encodeURIComponent(cls);
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.ok) deleted = true;
      else if (data && data.error) errors.push('Sheet: ' + data.error);
    } catch (e) {
      console.warn('Sheet delete failed', e);
      errors.push('Sheet: ' + (e.message || e));
    }
  }

  if (deleted) {
    alert('Record dihapus.' + (errors.length ? '\nCatatan: ' + errors.join('; ') : ''));
    await adminLoadData();
  } else {
    alert('Gagal menghapus.\n' + (errors.length ? errors.join('\n') : 'Tidak ada sumber data yang berhasil dihapus.'));
  }
}

function adminDownloadCSV() {
  const rows = getFilteredAdminRows();
  if (!rows.length) {
    alert('Tidak ada data untuk filter ini. Muat data dulu atau pilih filter lain.');
    return;
  }
  const filter = document.getElementById('admin-pack-filter')?.value || 'semua';
  const header = 'Timestamp,Nama,Kelas,PackId,PackTitle,Skor,Total,Persen,WaktuDetik,AutoSubmit,TabSwitch\n';
  const body = rows.map(r =>
    `"${r.timestamp || ''}","${r.name}","${r.class}","${r.packId || ''}","${r.packTitle || ''}",${r.score},${r.total},${r.percent},${r.timeUsedSeconds || ''},"${r.autoSubmit || ''}","${r.tabSwitchCount || 0}"`
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hasil_${filter}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

/* ========== ANTI-CHEAT (deteksi pindah tab) ==========
 * Browser TIDAK mengizinkan menutup tab lain milik user.
 * Yang bisa: deteksi tab disembunyikan / blur, peringatan, catat jumlah.
 */
let tabSwitchCount = 0;
let anticheatActive = false;
let proctorSettings = { forceFullscreen: true, cheatAlarmSound: true };
let fsUnlockedByAdmin = false;
let fsGuardActive = false;

function startAntiCheat() {
  tabSwitchCount = 0;
  anticheatActive = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onWindowBlur);
}

function stopAntiCheat() {
  anticheatActive = false;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('blur', onWindowBlur);
  const ov = document.getElementById('anticheat-overlay');
  if (ov) ov.style.display = 'none';
}

function onVisibilityChange() {
  if (!anticheatActive || examFinished || isPracticeMode) return;
  if (document.hidden) {
    tabSwitchCount++;
    showAntiCheatWarning();
  }
}

function onWindowBlur() {
  if (!anticheatActive || examFinished || isPracticeMode) return;
  // blur sering ikut saat buka DevTools / alt-tab; visibilitychange lebih andal
  // hanya tambah jika document masih visible (hindari double count)
  if (!document.hidden) {
    // tidak auto-count blur saja agar tidak terlalu sensitif
  }
}

function showAntiCheatWarning() {
  const ov = document.getElementById('anticheat-overlay');
  const msg = document.getElementById('anticheat-msg');
  const cnt = document.getElementById('anticheat-count');
  if (!ov) return;
  msg.textContent = 'Terdeteksi Anda meninggalkan tab ujian (pindah tab / minimize). Kembali ke tab ini untuk melanjutkan.';
  cnt.textContent = 'Jumlah pelanggaran: ' + tabSwitchCount;
  ov.style.display = 'flex';
  if (proctorSettings.cheatAlarmSound) playCheatAlarm();
}

function playCheatAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (freq, start, dur) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.value = 0.15;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur);
    };
    // pola sirene singkat biar pengawas terdengar
    beep(880, 0, 0.18);
    beep(660, 0.2, 0.18);
    beep(880, 0.4, 0.18);
    beep(660, 0.6, 0.22);
    setTimeout(() => ctx.close(), 1200);
  } catch (e) {
    console.warn('Alarm sound failed', e);
  }
}

function setupAntiCheatUi() {
  const btn = document.getElementById('btn-anticheat-ok');
  if (btn) {
    btn.addEventListener('click', () => {
      const ov = document.getElementById('anticheat-overlay');
      if (ov) ov.style.display = 'none';
    });
  }
  const packFilter = document.getElementById('admin-pack-filter');
  if (packFilter) {
    packFilter.addEventListener('change', () => {
      if (!window._adminRows) return;
      const filtered = getFilteredAdminRows();
      document.getElementById('admin-status').textContent =
        `Menampilkan ${filtered.length} dari ${window._adminRows.length} data.`;
      renderAdminList(filtered);
    });
  }
}




/* ========== ADMIN EXTENDED (Supabase) ========== */
function isPackForThisProduct(packId, rp) {
  const product = (config && config.productId) || 'quizit';
  if (product === 'quizit') {
    // QuizIT: hanya paket quizit-* (jangan tampilkan webdesign/smm/dkv dari DB bersama)
    if (packId && String(packId).startsWith('quizit-')) return true;
    if (rp && rp.product_id === 'quizit') return true;
    return false;
  }
  // CBT: jangan tampilkan quizit-*
  if (packId && String(packId).startsWith('quizit-')) return false;
  if (rp && rp.product_id === 'quizit') return false;
  return true;
}

async function mergeRemotePacks() {
  if (!window.SHSupabase || !SHSupabase.sbEnabled()) return;
  const remote = await SHSupabase.listRemotePacks();
  (remote || []).forEach(rp => {
    if (!isPackForThisProduct(rp.id, rp)) return;
    const pack = {
      id: rp.id,
      title: rp.title,
      subject: rp.subject || '',
      description: rp.description || '',
      durationMinutes: rp.duration_minutes || 60,
      practiceDurationMinutes: rp.practice_duration_minutes || 30,
      enabled: rp.enabled !== false,
      valid: true,
      mcCount: Array.isArray(rp.questions) ? rp.questions.length : 0,
      essaysCount: Array.isArray(rp.essays) ? rp.essays.length : 0,
      practiceOk: Array.isArray(rp.practice_questions) && rp.practice_questions.length > 0,
      _remote: true,
      _remoteData: rp
    };
    const idx = validPacks.findIndex(p => p.id === pack.id);
    if (idx >= 0) validPacks[idx] = { ...validPacks[idx], ...pack };
    else validPacks.push(pack);
  });
  // buang paket asing yang sempat masuk dari remote sebelumnya
  validPacks = (validPacks || []).filter(p => isPackForThisProduct(p.id, p._remoteData));
  renderPackListProgressive();
}

// Override selectPack loading for remote packs — patch via wrapper
const _origSelectPack = selectPack;
selectPack = async function(pack, btnEl) {
  if (pack._remote && pack._remoteData) {
    document.querySelectorAll('.pack-item').forEach(b => b.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');
    selectedPack = pack;
    const rp = pack._remoteData;
    packQuestions = Array.isArray(rp.questions) ? rp.questions : [];
    packEssays = Array.isArray(rp.essays) ? rp.essays : [];
    packPractice = Array.isArray(rp.practice_questions) && rp.practice_questions.length
      ? rp.practice_questions : packQuestions;
    document.getElementById('after-pack').style.display = 'block';
    await populateClassSelectForPack(pack.id || (rp && rp.id));
    classSelect.value = '';
    onClassChange();
    return;
  }
  return _origSelectPack(pack, btnEl);
};

function setupAdminExtendedUi() {
  // tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.getAttribute('data-tab');
      document.querySelectorAll('.admin-tab-panel').forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
      });
      const panel = document.getElementById('tab-' + id);
      if (panel) {
        panel.style.display = 'block';
        panel.classList.add('active');
      }
      if (id === 'admins' && window.SHSupabase) refreshAdminsList();
      if (id === 'analisis') fillAnalisisPackOptions();
      if (id === 'kelola-paket') refreshManagePacksList();
      if (id === 'peserta-master') { refreshMasterClasses(); refreshAdminDatalists(); }
      if (id === 'tokens') { refreshTokenList(); refreshAdminDatalists(); populateTokenDatalists(); }
    });
  });

  const btnSec = document.getElementById('btn-admin-secondary-enter');
  if (btnSec) btnSec.addEventListener('click', onSecondaryAdminLogin);

  const btnX = document.getElementById('btn-admin-download-xlsx');
  if (btnX) btnX.addEventListener('click', adminDownloadXlsx);

  const btnUp = document.getElementById('btn-upload-pack');
  if (btnUp) btnUp.addEventListener('click', onUploadPack);

  const btnRp = document.getElementById('btn-refresh-remote-packs');
  if (btnRp) btnRp.addEventListener('click', async () => {
    try {
      await mergeRemotePacks();
      alert('Daftar paket diperbarui. Kembali ke layar utama untuk melihatnya.');
    } catch (e) { alert(e.message); }
  });

  const btnAn = document.getElementById('btn-run-analisis');
  if (btnAn) btnAn.addEventListener('click', onRunAnalisis);

  const btnAdd = document.getElementById('btn-add-admin');
  if (btnAdd) btnAdd.addEventListener('click', onAddAdmin);
  setupProctorUi();
  setupPackManageUi();
}

async function onSecondaryAdminLogin() {
  const u = document.getElementById('admin-secondary-user').value.trim();
  const p = document.getElementById('admin-secondary-pass').value;
  try {
    if (!window.SHSupabase || !SHSupabase.sbEnabled()) {
      alert('Supabase belum diisi di config.json');
      return;
    }
    const admin = await SHSupabase.loginSecondary(u, p);
    openAdminPanel(admin);
  } catch (e) {
    alert(e.message || 'Login gagal');
  }
}

function openAdminPanel(admin) {
  SHSupabase.setCurrentAdmin(admin);
  document.getElementById('admin-role-label').textContent =
    admin.role === 'main' ? 'Admin Utama' : ('Admin: ' + (admin.display_name || admin.username));
  const tabAdmins = document.getElementById('tab-admins-btn');
  if (tabAdmins) tabAdmins.style.display = admin.role === 'main' ? '' : 'none';
  loginScreen.classList.remove('active');
  adminScreen.classList.add('active');
  document.getElementById('admin-list').innerHTML = '';
  document.getElementById('admin-status').textContent = 'Klik "Muat Data".';
  populateAdminPackFilter();
}

// patch enterAdmin for main via config password
const _enterAdminOrig = enterAdmin;
enterAdmin = function() {
  const pass = document.getElementById('admin-password').value.trim();
  if (pass !== (config.adminPassword || '')) {
    alert('Password admin salah.');
    return;
  }
  if (window.SHSupabase) {
    SHSupabase.setCurrentAdmin({ username: 'main', role: 'main' });
  }
  openAdminPanel({ username: 'main', role: 'main' });
};

// Enhance adminLoadData: Supabase = sumber utama (hindari data dobel Sheet+Supabase)
const _adminLoadDataOrig = adminLoadData;
adminLoadData = async function() {
  const status = document.getElementById('admin-status');
  status.textContent = 'Memuat...';
  document.getElementById('admin-list').innerHTML = '';
  let rows = [];
  let fromSb = 0;
  let fromSheet = 0;

  // 1) Supabase dulu
  if (window.SHSupabase && SHSupabase.sbEnabled()) {
    try {
      const sbRows = await SHSupabase.listResults();
      (sbRows || []).forEach(r => {
        rows.push({
          timestamp: r.created_at,
          name: r.student_name,
          class: r.student_class,
          packId: r.pack_id || '',
          packTitle: r.pack_title || '',
          score: r.score,
          total: r.total,
          percent: r.percent,
          timeUsedSeconds: r.time_used_seconds,
          autoSubmit: r.auto_submit ? 'YA' : 'TIDAK',
          tabSwitchCount: r.tab_switch_count || 0,
          _source: 'supabase',
          _id: r.id
        });
        fromSb++;
      });
    } catch (e) {
      console.warn('Supabase list failed', e);
    }
  }

  // 2) Sheet hanya jika Supabase kosong / tidak aktif (cadangan)
  if (fromSb === 0 && config.googleScriptUrl) {
    try {
      const res = await fetch(config.googleScriptUrl + '?action=list');
      const data = await res.json();
      (data.rows || []).forEach(r => {
        rows.push({
          timestamp: r.timestamp,
          name: r.name,
          class: r.class,
          packId: r.packId || '',
          packTitle: r.packTitle || '',
          score: r.score,
          total: r.total,
          percent: r.percent,
          timeUsedSeconds: r.timeUsedSeconds,
          autoSubmit: r.autoSubmit,
          tabSwitchCount: r.tabSwitchCount || 0,
          _source: 'sheet'
        });
        fromSheet++;
      });
    } catch (e) {
      console.warn('Sheet list failed', e);
    }
  }

  // Dedup tambahan: nama+kelas+packId+skor (jaga-jaga)
  const seen = new Set();
  rows = rows.filter(r => {
    const key = [r.name, r.class, r.packId, r.score, r.total].join('|').toLowerCase();
    if (seen.has(key) && r._source === 'sheet') return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  window._adminRows = rows;
  const sel = document.getElementById('admin-pack-filter');
  if (sel) {
    const seenOpt = new Set(['']);
    [...sel.options].forEach(o => seenOpt.add(o.value));
    rows.forEach(r => {
      if (r.packId && !seenOpt.has(r.packId)) {
        seenOpt.add(r.packId);
        const opt = document.createElement('option');
        opt.value = r.packId;
        opt.textContent = r.packTitle || r.packId;
        sel.appendChild(opt);
      }
    });
  }
  const filtered = getFilteredAdminRows();
  const srcNote = fromSb ? ('Supabase ' + fromSb) : (fromSheet ? ('Sheet ' + fromSheet) : '0');
  status.textContent = 'Menampilkan ' + filtered.length + ' dari ' + rows.length + ' data (' + srcNote + ').';
  renderAdminList(filtered);
};

function adminDownloadXlsx() {
  const rows = getFilteredAdminRows();
  if (!rows.length) {
    alert('Tidak ada data. Muat data dulu.');
    return;
  }
  const filter = document.getElementById('admin-pack-filter')?.value || 'semua';
  if (window.SHSupabase) {
    SHSupabase.downloadXlsx(rows, `hasil_${filter}_${new Date().toISOString().slice(0,10)}.xlsx`);
  } else {
    alert('Module Excel tidak tersedia');
  }
}

async function onUploadPack() {
  const st = document.getElementById('upload-status');
  try {
    if (!window.SHSupabase || !SHSupabase.sbEnabled()) {
      throw new Error('Isi supabaseUrl & supabaseAnonKey di config.json, jalankan supabase-setup.sql');
    }
    if (!SHSupabase.getCurrentAdmin()) throw new Error('Login admin dulu');
    const id = document.getElementById('up-pack-id').value.trim().toLowerCase().replace(/\s+/g, '-');
    const title = document.getElementById('up-pack-title').value.trim();
    if (!id || !title) throw new Error('ID dan Judul wajib');
    const fq = document.getElementById('up-file-q').files[0];
    if (!fq) throw new Error('File soal PG wajib');

    st.textContent = 'Membaca file...';
    const questions = await parseQuestionFile(fq, 'pg');
    if (!Array.isArray(questions) || !questions.length) throw new Error('Soal PG kosong / format tidak dikenali');

    const fe = document.getElementById('up-file-e').files[0];
    const essays = fe ? await parseQuestionFile(fe, 'essay') : [];

    const fp = document.getElementById('up-file-p').files[0];
    let practice = fp ? await parseQuestionFile(fp, 'pg') : [];
    if (!practice.length) practice = questions;

    st.textContent = 'Mengunggah...';
    await SHSupabase.uploadPack({
      id,
      title,
      subject: document.getElementById('up-pack-subject').value.trim(),
      description: document.getElementById('up-pack-desc').value.trim(),
      durationMinutes: parseInt(document.getElementById('up-pack-dur').value, 10) || 60,
      practiceDurationMinutes: 30,
      questions,
      essays,
      practiceQuestions: practice
    });
    st.textContent = 'Berhasil diupload (' + questions.length + ' PG, ' + essays.length + ' essay). Muat ulang paket / refresh.';
    await mergeRemotePacks();
  } catch (e) {
    st.textContent = 'Gagal: ' + e.message;
  }
}

function normalizeAnswerIndex(ans) {
  if (typeof ans === 'number' && ans >= 0 && ans <= 4) return ans;
  const s = String(ans || '').trim().toUpperCase();
  if (/^[0-4]$/.test(s)) return parseInt(s, 10);
  const map = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  if (s in map) return map[s];
  return 0;
}

function rowsToPgQuestions(rows) {
  // rows = array of objects with flexible keys
  const out = [];
  rows.forEach((row, i) => {
    const keys = {};
    Object.keys(row || {}).forEach(k => { keys[k.trim().toLowerCase()] = row[k]; });
    const q = keys.question || keys.soal || keys.pertanyaan || '';
    if (!String(q).trim()) return;
    const opts = [
      keys.optiona || keys.a || keys.opsi_a || keys.pilihan_a || '',
      keys.optionb || keys.b || keys.opsi_b || keys.pilihan_b || '',
      keys.optionc || keys.c || keys.opsi_c || keys.pilihan_c || '',
      keys.optiond || keys.d || keys.opsi_d || keys.pilihan_d || '',
      keys.optione || keys.e || keys.opsi_e || keys.pilihan_e || ''
    ].map(x => String(x || '').trim());
    if (opts.filter(Boolean).length < 2) return;
    out.push({
      id: keys.id || keys.nomor || (i + 1),
      question: String(q).trim(),
      options: opts,
      answer: normalizeAnswerIndex(keys.answer || keys.kunci || keys.jawaban || 0)
    });
  });
  return out;
}

function rowsToEssays(rows) {
  const out = [];
  rows.forEach((row, i) => {
    const keys = {};
    Object.keys(row || {}).forEach(k => { keys[k.trim().toLowerCase()] = row[k]; });
    const q = keys.question || keys.soal || keys.pertanyaan || '';
    if (!String(q).trim()) return;
    out.push({
      id: String(keys.id || ('E' + (i + 1))),
      question: String(q).trim()
    });
  });
  return out;
}

function parseCsvText(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  // simple CSV split with quotes
  const split = (line) => {
    const res = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        res.push(cur); cur = '';
      } else cur += ch;
    }
    res.push(cur);
    return res;
  };
  const headers = split(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx] != null ? cols[idx] : ''; });
    rows.push(obj);
  }
  return rows;
}

async function parseQuestionFile(file, mode) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.json')) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('JSON harus berupa array: ' + file.name);
    if (mode === 'essay') {
      return data.map((x, i) => ({
        id: String(x.id || ('E' + (i + 1))),
        question: x.question || x.soal || ''
      })).filter(x => x.question);
    }
    return data.map((x, i) => ({
      id: x.id != null ? x.id : (i + 1),
      question: x.question || '',
      options: Array.isArray(x.options) ? x.options : [],
      answer: normalizeAnswerIndex(x.answer)
    })).filter(x => x.question && x.options.length);
  }

  if (name.endsWith('.csv')) {
    const text = await file.text();
    const rows = parseCsvText(text);
    return mode === 'essay' ? rowsToEssays(rows) : rowsToPgQuestions(rows);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') throw new Error('Library Excel belum termuat');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
    return mode === 'essay' ? rowsToEssays(rows) : rowsToPgQuestions(rows);
  }

  if (name.endsWith('.doc')) {
    throw new Error('Format .doc lama tidak didukung. Simpan sebagai .xlsx atau .csv dari Excel.');
  }
  if (name.endsWith('.docx')) {
    throw new Error('Upload .docx belum didukung stabil. Salin tabel soal ke template Excel/CSV lalu upload.');
  }
  throw new Error('Format tidak dikenali: ' + file.name + ' (pakai JSON, XLSX, atau CSV)');
}


function fillAnalisisPackOptions() {
  const sel = document.getElementById('analisis-pack-filter');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Pilih pack --</option>';
  const ids = new Set();
  (validPacks || []).forEach(p => {
    if (p.id && !ids.has(p.id)) {
      ids.add(p.id);
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.title || p.id;
      sel.appendChild(o);
    }
  });
  (window._adminRows || []).forEach(r => {
    if (r.packId && !ids.has(r.packId)) {
      ids.add(r.packId);
      const o = document.createElement('option');
      o.value = r.packId;
      o.textContent = r.packTitle || r.packId;
      sel.appendChild(o);
    }
  });
}

async function onRunAnalisis() {
  const st = document.getElementById('analisis-status');
  const list = document.getElementById('analisis-list');
  const packId = document.getElementById('analisis-pack-filter').value;
  list.innerHTML = '';
  if (!packId) {
    st.textContent = 'Pilih pack dulu.';
    return;
  }
  try {
    if (!window.SHSupabase || !SHSupabase.sbEnabled()) {
      throw new Error('Analisis butir membutuhkan Supabase (detail jawaban per soal).');
    }
    st.textContent = 'Menghitung...';
    const rows = await SHSupabase.runItemAnalysis(packId);
    if (!rows.length) {
      st.textContent = 'Belum ada data jawaban untuk pack ini di Supabase.';
      return;
    }
    st.textContent = `${rows.length} butir dianalisis. P = tingkat kesukaran (0 sukar–1 mudah). D = daya beda.`;
    rows.forEach(r => {
      const div = document.createElement('div');
      div.className = 'analisis-row';
      const pct = Math.round(r.difficulty * 100);
      div.innerHTML = `
        <strong>${escapeHtml(String(r.questionId))}</strong> — benar ${r.correct}/${r.total} (${pct}%)
        <div style="color:var(--text-muted);margin-top:4px">${escapeHtml((r.questionText || '').substring(0, 120))}...</div>
        <div>Kesukaran P=${r.difficulty.toFixed(2)} · Daya beda D=${r.discrimination.toFixed(2)}</div>
        <div class="bar"><span style="width:${pct}%"></span></div>`;
      list.appendChild(div);
    });
  } catch (e) {
    st.textContent = e.message;
  }
}

async function onAddAdmin() {
  const st = document.getElementById('admins-status');
  try {
    const u = document.getElementById('new-admin-user').value.trim();
    const pw = document.getElementById('new-admin-pass').value;
    const dEl = document.getElementById('new-admin-display');
    const d = dEl ? dEl.value.trim() : '';
    await SHSupabase.addAdmin(u, pw, d);
    st.textContent = 'Admin ditambahkan.';
    document.getElementById('new-admin-user').value = '';
    document.getElementById('new-admin-pass').value = '';
    if (dEl) dEl.value = '';
    refreshAdminsList();
  } catch (e) {
    st.textContent = e.message;
  }
}


async function refreshAdminsList() {
  const list = document.getElementById('admins-list');
  const st = document.getElementById('admins-status');
  if (!list) return;
  list.innerHTML = '';
  try {
    if (!SHSupabase.sbEnabled()) {
      st.textContent = 'Layanan data belum dikonfigurasi.';
      return;
    }
    const rows = await SHSupabase.listAdmins();
    (rows || []).forEach(r => {
      if (r.role === 'main') return;
      const div = document.createElement('div');
      div.className = 'admin-row';
      const dn = r.display_name || '';
      const exp = r.subscription_expires_at ? String(r.subscription_expires_at) : 'tidak expired';
      const proof = r.transfer_proof_url ? (' · bukti: ' + r.transfer_proof_url) : '';
      div.innerHTML = '<div class="info" style="flex:1"><strong>' + escapeHtml(dn || r.username) +
        '</strong> · <code>' + escapeHtml(r.username) + '</code><br><small>' +
        (r.active === false ? 'nonaktif' : 'aktif') + ' · exp: ' + escapeHtml(exp) +
        proof + (r.transfer_note ? (' · ' + escapeHtml(r.transfer_note)) : '') +
        '</small></div>';
      if (SHSupabase.isMainAdmin()) {
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
        const btnReset = document.createElement('button');
        btnReset.type = 'button'; btnReset.className = 'btn-del'; btnReset.textContent = 'Reset PW';
        btnReset.onclick = async () => {
          const np = prompt('Password baru untuk ' + r.username + ' (min 6):');
          if (!np) return;
          try { await SHSupabase.resetAdminPassword(r.id, np); alert('Password direset.'); }
          catch (e) { alert(e.message); }
        };
        const btnEdit = document.createElement('button');
        btnEdit.type = 'button'; btnEdit.className = 'btn-del'; btnEdit.textContent = 'Edit';
        btnEdit.onclick = async () => {
          const nd = prompt('Nama asli:', dn || r.username);
          if (nd === null) return;
          const nu = prompt('Username:', r.username);
          if (nu === null) return;
          try {
            await SHSupabase.updateAdminProfile(r.id, r.username, nu, nd);
            alert('Profil diperbarui.');
            refreshAdminsList();
          } catch (e) { alert(e.message); }
        };
        const btnDel = document.createElement('button');
        btnDel.type = 'button'; btnDel.className = 'btn-del'; btnDel.textContent = 'Hapus';
        btnDel.onclick = async () => {
          if (!confirm('Hapus admin "' + r.username + '"? Paket miliknya pindah ke admin utama.')) return;
          try {
            await SHSupabase.deleteAdminTransferPacks(r.id, r.username);
            alert('Admin dihapus. Paket dipindah ke main.');
            refreshAdminsList();
          } catch (e) { alert(e.message); }
        };
        const btnAct = document.createElement('button');
        btnAct.type = 'button'; btnAct.className = 'btn-del';
        btnAct.textContent = r.active === false ? 'Aktifkan' : 'Nonaktifkan';
        btnAct.onclick = async () => {
          try {
            await SHSupabase.setAdminActive(r.id, r.active === false);
            refreshAdminsList();
          } catch (e) { alert(e.message); }
        };
        const btnExp = document.createElement('button');
        btnExp.type = 'button'; btnExp.className = 'btn-del'; btnExp.textContent = 'Set Expired';
        btnExp.onclick = async () => {
          const cur = r.subscription_expires_at ? String(r.subscription_expires_at).slice(0, 10) : '';
          const d = prompt('Tanggal expired (YYYY-MM-DD). Kosongkan = tidak expired:', cur);
          if (d === null) return;
          try {
            const iso = d.trim() ? (d.trim() + 'T23:59:59+07:00') : null;
            await SHSupabase.setAdminExpiry(r.id, iso);
            refreshAdminsList();
          } catch (e) { alert(e.message); }
        };
        actions.appendChild(btnReset);
        actions.appendChild(btnEdit);
        actions.appendChild(btnAct);
        actions.appendChild(btnExp);
        actions.appendChild(btnDel);
        div.appendChild(actions);
      }
      list.appendChild(div);
    });
    st.textContent = ((rows || []).filter(x => x.role !== 'main').length) + ' admin tambahan.';
  } catch (e) {
    st.textContent = e.message;
  }
}







async function onMpBulkClass() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-part-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  const cls = document.getElementById('mp-part-class').value;
  const names = (students[cls] || []).slice();
  if (!names.length) { st.textContent = 'Tidak ada nama di students.json kelas ' + cls; return; }
  if (!confirm('Tambah ' + names.length + ' santriwati kelas ' + cls + ' ke paket ini?')) return;
  try {
    const n = await SHSupabase.bulkAddClassParticipants(id, cls, names);
    st.textContent = 'Ditambahkan/diupdate: ' + n + ' peserta kelas ' + cls;
    refreshMpParticipants(id);
  } catch (e) { st.textContent = e.message; }
}

async function onMpSyncClass() {
  // sama bulk: merge nama baru dari students.json
  return onMpBulkClass();
}

async function onSaveMyTransfer() {
  const st = document.getElementById('my-transfer-status');
  try {
    const admin = SHSupabase.getCurrentAdmin();
    if (!admin || admin.role === 'main') {
      st.textContent = 'Fitur ini untuk admin tambahan (isi bukti sendiri). Admin utama set expired di daftar bawah.';
      return;
    }
    const rows = await SHSupabase.listAdmins();
    const me = (rows || []).find(r => r.username === admin.username);
    if (!me) { st.textContent = 'Akun tidak ditemukan.'; return; }
    const url = document.getElementById('my-transfer-url').value.trim();
    const note = document.getElementById('my-transfer-note').value.trim();
    await SHSupabase.setTransferProof(me.id, url, note);
    st.textContent = 'Bukti transfer disimpan. Menunggu admin utama memeriksa.';
  } catch (e) { st.textContent = e.message; }
}


let _managePacksCache = [];
function setupPackManageUi() {
  const map = [
    ['btn-refresh-manage-packs', refreshManagePacksList],
    ['btn-sync-catalog-packs', onSyncCatalogPacksClick],
    ['btn-mp-rename', onMpRename],
    ['btn-mp-delete', onMpDelete],
    ['btn-mp-add-item', onMpAddItem],
    ['btn-mp-merge', onMpMerge],
    ['btn-mp-add-part', onMpAddPart],
    ['btn-mp-acl-save', onMpAclSave],
    ['btn-mp-save-parts', onMpSaveParts],
    ['btn-mp-add-pw', onMpAddPassword],
    ['btn-my-transfer', onSaveMyTransfer],
    ['btn-mc-add', onMcAddClass],
    ['btn-mc-add-member', onMcAddMember],
    ['btn-mc-import-legacy', onMcImportLegacy],
    ['btn-tok-create', onCreateToken],
    ['btn-mp-assign-all-master', onMpAssignAllMaster],
    ['btn-mp-select-all-tree', onMpSelectAllTree]
  ];
  map.forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  });
}

/** Daftarkan paket dari catalog.json (Web Design, SMM, dll.) ke database agar muncul di Kelola Paket */
async function syncLocalCatalogPacksToDb() {
  if (!window.SHSupabase || !SHSupabase.sbEnabled() || !SHSupabase.getCurrentAdmin()) return [];
  const packs = (validPacks || []).filter(p => p && p.id && !p._remote);
  const payload = [];
  for (const p of packs) {
    try {
      let questions = [], essays = [], practice = [];
      if (p.questionsFile) {
        try { questions = await fetch(p.questionsFile).then(r => r.json()); } catch (_) {}
      }
      if (p.essaysFile) {
        try { essays = await fetch(p.essaysFile).then(r => r.json()); } catch (_) {}
      }
      if (p.practiceFile) {
        try { practice = await fetch(p.practiceFile).then(r => r.json()); } catch (_) {}
      }
      payload.push({
        meta: {
          id: p.id,
          title: p.title,
          subject: p.subject,
          description: p.description,
          durationMinutes: p.durationMinutes,
          practiceDurationMinutes: p.practiceDurationMinutes,
          enabled: p.enabled !== false,
          productId: (config && config.productId) || 'quizit'
        },
        questions: Array.isArray(questions) ? questions : [],
        essays: Array.isArray(essays) ? essays : [],
        practice: Array.isArray(practice) ? practice : []
      });
    } catch (e) {
      console.warn('sync pack skip', p.id, e);
    }
  }
  if (!payload.length) return [];
  return await SHSupabase.syncAllCatalogPacks(payload);
}

async function onSyncCatalogPacksClick() {
  const st = document.getElementById('manage-packs-status');
  try {
    st.textContent = 'Mendaftarkan paket lokal...';
    const res = await syncLocalCatalogPacksToDb();
    const ok = (res || []).filter(x => x.ok).length;
    const created = (res || []).filter(x => x.ok && x.created).length;
    st.textContent = 'Selesai: ' + ok + ' paket tersinkron (' + created + ' baru). Klik Muat Daftar Paket jika perlu.';
    await refreshManagePacksList();
  } catch (e) {
    st.textContent = e.message || 'Gagal sinkron';
  }
}

async function refreshManagePacksList() {
  const list = document.getElementById('manage-packs-list');
  const st = document.getElementById('manage-packs-status');
  if (!list) return;
  list.innerHTML = '';
  try {
    if (!window.SHSupabase || !SHSupabase.sbEnabled()) { st.textContent = 'Layanan data belum dikonfigurasi.'; return; }
    if (!SHSupabase.getCurrentAdmin()) { st.textContent = 'Login admin dulu.'; return; }
    st.textContent = 'Menyinkronkan paket lokal ke database...';
    try {
      const syncRes = await syncLocalCatalogPacksToDb();
      const nNew = (syncRes || []).filter(x => x.ok && x.created).length;
      const nOk = (syncRes || []).filter(x => x.ok).length;
      if (nOk) console.log('Catalog sync', syncRes);
    } catch (e) {
      console.warn('Catalog sync', e);
    }
    _managePacksCache = await SHSupabase.listManageablePacks();
    if (!_managePacksCache.length) { st.textContent = 'Belum ada paket yang bisa dikelola.'; return; }
    let nameMap = { main: 'Admin Utama' };
    try { nameMap = Object.assign(nameMap, await SHSupabase.listAdminsNameMap()); } catch (_) {}
    st.textContent = _managePacksCache.length + ' paket.';
    _managePacksCache.forEach(p => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.dataset.packId = p.id;
      const ownerLabel = nameMap[p.owner_username] || p.owner_username || 'Admin Utama';
      div.innerHTML = '<div class="info" style="flex:1;cursor:pointer"><strong>' + escapeHtml(p.title || p.id) +
        '</strong><br><small>Pemilik: ' + escapeHtml(ownerLabel) +
        ' · PG ' + (Array.isArray(p.questions) ? p.questions.length : 0) + '</small></div>';
      div.querySelector('.info').addEventListener('click', () => selectManagePack(p));
      list.appendChild(div);
    });
  } catch (e) { st.textContent = e.message; }
}
async function selectManagePack(p) {
  const edit = document.getElementById('mp-edit-section');
  if (edit) edit.style.display = 'block';
  document.querySelectorAll('#manage-packs-list .admin-row').forEach(r => r.classList.remove('selected'));
  // highlight clicked row if event target available via cache
  const rows = document.querySelectorAll('#manage-packs-list .admin-row');
  rows.forEach(r => {
    if (r.dataset && r.dataset.packId === p.id) r.classList.add('selected');
  });
  document.getElementById('mp-pack-id').value = p.id;
  document.getElementById('mp-pack-title').value = p.title || '';
  const st = document.getElementById('mp-edit-status');
  if (st) st.textContent = 'Paket dipilih: ' + (p.title || p.id);
  const aclSec = document.getElementById('mp-acl-section');
  const perm = p._perm || {};
  const canGrant = SHSupabase.isMainAdmin() || perm.is_owner || perm.can_grant;
  if (aclSec) aclSec.style.display = canGrant ? 'block' : 'none';
  try { await renderMpCheckboxTree(p.id); } catch (e) { console.warn(e); }
  try { await refreshMpPasswords(p.id); } catch (e) { console.warn(e); }
  if (canGrant) { try { await refreshMpAcl(p.id); } catch (e) { console.warn(e); } }
  if (edit) edit.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
async function refreshMpParticipants(packId) {
  const list = document.getElementById('mp-part-list');
  const st = document.getElementById('mp-part-status');
  list.innerHTML = '';
  try {
    const rows = await SHSupabase.listParticipants(packId);
    if (!rows || !rows.length) {
      st.textContent = 'Belum ada peserta khusus — semua siswa kelas boleh ikut.';
      return;
    }
    st.textContent = rows.length + ' peserta.';
    rows.forEach(r => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = '<div class="info" style="flex:1"><strong>' + escapeHtml(r.display_name || r.student_name) +
        '</strong><br><small>' + escapeHtml(r.student_class) + ' · ' + escapeHtml(r.student_name) + '</small></div>';
      const b1 = document.createElement('button');
      b1.type = 'button'; b1.className = 'btn-del'; b1.textContent = 'Rename';
      b1.onclick = async () => {
        const nd = prompt('Nama tampilan baru:', r.display_name || r.student_name);
        if (!nd) return;
        try { await SHSupabase.renameParticipant(packId, r.student_class, r.student_name, nd); refreshMpParticipants(packId); }
        catch (e) { alert(e.message); }
      };
      const b2 = document.createElement('button');
      b2.type = 'button'; b2.className = 'btn-del'; b2.textContent = 'Keluarkan';
      b2.onclick = async () => {
        if (!confirm('Keluarkan ' + r.student_name + '?')) return;
        try { await SHSupabase.removeParticipant(packId, r.student_class, r.student_name); refreshMpParticipants(packId); }
        catch (e) { alert(e.message); }
      };
      div.appendChild(b1); div.appendChild(b2); list.appendChild(div);
    });
  } catch (e) { st.textContent = e.message; }
}
async function refreshMpAcl(packId) {
  const list = document.getElementById('mp-acl-list');
  if (!list) return;
  list.innerHTML = '';
  try {
    const rows = await SHSupabase.listPackAcl(packId);
    (rows || []).forEach(r => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = '<div class="info" style="flex:1"><strong>' + escapeHtml(r.grantee_username) +
        '</strong><br><small>rename:' + (r.can_rename?'Y':'N') + ' edit:' + (r.can_edit_items?'Y':'N') +
        ' peserta:' + (r.can_manage_participants?'Y':'N') + ' hapus:' + (r.can_delete?'Y':'N') + '</small></div>';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-del'; b.textContent = 'Cabut';
      b.onclick = async () => { await SHSupabase.removePackAcl(packId, r.grantee_username); refreshMpAcl(packId); };
      div.appendChild(b); list.appendChild(div);
    });
  } catch (e) { console.warn(e); }
}
async function onMpRename() {
  const id = document.getElementById('mp-pack-id').value;
  const title = document.getElementById('mp-pack-title').value.trim();
  const st = document.getElementById('mp-edit-status');
  if (!id || !title) { st.textContent = 'Pilih paket & isi judul.'; return; }
  try { await SHSupabase.renamePackTitle(id, title); st.textContent = 'Judul disimpan.'; refreshManagePacksList(); }
  catch (e) { st.textContent = e.message; }
}
async function onMpDelete() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-edit-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  const msg = 'HAPUS PAKET "' + id + '"?\n\n' +
    'Risiko:\n' +
    '• Paket hilang dari daftar ujian siswa\n' +
    '• Daftar peserta & hak akses (ACL) paket ini ikut terhapus\n' +
    '• Riwayat nilai di database tetap ada, tetapi tidak terhubung ke paket di UI\n' +
    '• Tidak menghapus akun admin\n' +
    '• Paket file di GitHub (jika ada) tidak terpengaruh\n\n' +
    'Lanjutkan hapus permanen?';
  if (!confirm(msg)) return;
  try {
    await SHSupabase.deletePack(id);
    st.textContent = 'Paket dihapus.';
    document.getElementById('mp-pack-id').value = '';
    refreshManagePacksList();
  } catch (e) { st.textContent = e.message; }
}
async function onMpAddItem() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-edit-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  const q = document.getElementById('mp-q-text').value.trim();
  const opts = ['mp-q-a','mp-q-b','mp-q-c','mp-q-d','mp-q-e'].map(x => document.getElementById(x).value.trim());
  const ans = (document.getElementById('mp-q-ans').value || 'A').trim().toUpperCase();
  if (!q || opts.filter(Boolean).length < 2) { st.textContent = 'Isi pertanyaan & minimal 2 opsi.'; return; }
  const map = {A:0,B:1,C:2,D:3,E:4};
  const item = { id: 'Q' + Date.now(), question: q, options: opts, answer: map[ans] != null ? map[ans] : 0 };
  try {
    const r = await SHSupabase.appendQuestionsToPack(id, [item], []);
    st.textContent = 'Butir ditambahkan. Total PG: ' + r.questionsCount;
    document.getElementById('mp-q-text').value = '';
  } catch (e) { st.textContent = e.message; }
}
async function onMpMerge() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-edit-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  const fq = document.getElementById('mp-merge-q').files[0];
  if (!fq) { st.textContent = 'Pilih file PG.'; return; }
  try {
    const qs = await parseQuestionFile(fq, 'pg');
    const fe = document.getElementById('mp-merge-e').files[0];
    const es = fe ? await parseQuestionFile(fe, 'essay') : [];
    const r = await SHSupabase.appendQuestionsToPack(id, qs, es);
    st.textContent = 'Digabung: +' + qs.length + ' PG, +' + es.length + ' essay. Total PG: ' + r.questionsCount;
  } catch (e) { st.textContent = e.message; }
}
async function onMpAddPart() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-part-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  const cls = document.getElementById('mp-part-class').value;
  const name = document.getElementById('mp-part-name').value.trim();
  const disp = document.getElementById('mp-part-display').value.trim();
  try {
    await SHSupabase.addParticipant(id, cls, name, disp);
    document.getElementById('mp-part-name').value = '';
    document.getElementById('mp-part-display').value = '';
    refreshMpParticipants(id);
  } catch (e) { st.textContent = e.message; }
}
async function onMpAclSave() {
  const id = document.getElementById('mp-pack-id').value;
  const user = document.getElementById('mp-acl-user').value.trim();
  if (!id || !user) { alert('Pilih paket & isi username'); return; }
  try {
    await SHSupabase.setPackAcl(id, user, {
      can_rename: document.getElementById('mp-acl-rename').checked,
      can_edit_items: document.getElementById('mp-acl-edit').checked,
      can_manage_participants: document.getElementById('mp-acl-part').checked,
      can_delete: false
    });
    document.getElementById('mp-acl-user').value = '';
    refreshMpAcl(id);
    alert('Hak disimpan.');
  } catch (e) { alert(e.message); }
}


async function renderMpCheckboxTree(packId) {
  const box = document.getElementById('mp-checkbox-tree');
  const st = document.getElementById('mp-part-status');
  if (!box) return;
  box.innerHTML = '';
  try {
    const classes = await SHSupabase.listClasses();
    const { keys } = await SHSupabase.getPackParticipantKeys(packId);
    if (!classes || !classes.length) {
      st.textContent = 'Belum ada kelas di data master. Isi dulu di tab Kelola Peserta.';
      return;
    }
    st.textContent = 'Centang peserta lalu klik Simpan. Wajib minimal satu.';
    for (const c of classes) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'border-bottom:1px solid rgba(148,163,184,0.2);padding:8px 6px';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer';
      const classCb = document.createElement('input');
      classCb.type = 'checkbox';
      classCb.dataset.role = 'class';
      classCb.dataset.classId = c.id;
      const title = document.createElement('span');
      title.innerHTML = '<strong>' + escapeHtml(c.name) + '</strong> <small style="color:var(--text-muted)">' + escapeHtml(c.institution || '') + '</small>';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn-link';
      toggle.textContent = '▼';
      toggle.style.marginLeft = 'auto';
      head.appendChild(classCb);
      head.appendChild(title);
      head.appendChild(toggle);
      const body = document.createElement('div');
      body.style.display = 'none';
      body.style.paddingLeft = '22px';
      body.dataset.classId = c.id;
      const members = await SHSupabase.listClassMembers(c.id);
      (members || []).forEach(m => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;cursor:pointer';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.role = 'member';
        cb.dataset.classId = c.id;
        cb.dataset.className = c.name;
        cb.dataset.memberId = m.id;
        cb.dataset.name = m.participant_name;
        cb.dataset.display = m.display_name || m.participant_name;
        const k = c.id + '|' + m.participant_name;
        const k2 = c.name + '|' + m.participant_name;
        if (keys.has(k) || keys.has(k2)) cb.checked = true;
        row.appendChild(cb);
        row.appendChild(document.createTextNode(m.display_name || m.participant_name));
        body.appendChild(row);
      });
      classCb.addEventListener('change', () => {
        body.querySelectorAll('input[data-role="member"]').forEach(cb => { cb.checked = classCb.checked; });
      });
      toggle.addEventListener('click', () => {
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
        toggle.textContent = body.style.display === 'none' ? '▼' : '▲';
      });
      title.addEventListener('click', () => toggle.click());
      wrap.appendChild(head);
      wrap.appendChild(body);
      box.appendChild(wrap);
    }
  } catch (e) {
    st.textContent = e.message || 'Gagal memuat daftar peserta';
  }
}

async function onMpSaveParts() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-part-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  const selected = [];
  document.querySelectorAll('#mp-checkbox-tree input[data-role="member"]:checked').forEach(cb => {
    selected.push({
      class_id: cb.dataset.classId,
      student_class: cb.dataset.className,
      student_name: cb.dataset.name,
      display_name: cb.dataset.display,
      member_id: cb.dataset.memberId
    });
  });
  if (!selected.length) {
    st.textContent = 'Wajib pilih minimal satu peserta.';
    return;
  }
  try {
    const n = await SHSupabase.replacePackParticipants(id, selected);
    st.textContent = 'Tersimpan: ' + n + ' peserta pada paket ini.';
  } catch (e) {
    st.textContent = e.message;
  }
}

async function refreshMasterClasses() {
  const list = document.getElementById('mc-class-list');
  const st = document.getElementById('mc-status');
  if (!list) return;
  list.innerHTML = '';
  try {
    if (!(await SHSupabase.canManageMasterRoster())) {
      st.textContent = 'Anda belum punya hak kelola data peserta (perlu jadi pembuat paket atau diberi hak).';
      return;
    }
    const rows = await SHSupabase.listAllClassesAdmin();
    st.textContent = (rows || []).length + ' kelas.';
    (rows || []).forEach(c => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = '<div class="info" style="flex:1;cursor:pointer"><strong>' + escapeHtml(c.name) +
        '</strong><br><small>' + escapeHtml(c.institution || '-') + '</small></div>';
      div.querySelector('.info').onclick = () => {
        document.querySelectorAll('#mc-class-list .admin-row, #master-class-list .admin-row').forEach(r => r.classList.remove('selected'));
        if (typeof div !== 'undefined' && div && div.classList) div.classList.add('selected');
        document.getElementById('mc-selected-class-id').value = c.id;
        document.getElementById('mc-selected-label').textContent = 'Kelas: ' + c.name + (c.institution ? ' · ' + c.institution : '');
        refreshMasterMembers(c.id);
      };
      const bEdit = document.createElement('button');
      bEdit.type = 'button'; bEdit.className = 'btn-del'; bEdit.textContent = 'Edit';
      bEdit.onclick = async () => {
        const n = prompt('Nama kelas', c.name);
        if (n === null) return;
        const ins = prompt('Instansi', c.institution || '');
        if (ins === null) return;
        try { await SHSupabase.updateClass(c.id, n, ins); refreshMasterClasses(); }
        catch (e) { alert(e.message); }
      };
      const bDel = document.createElement('button');
      bDel.type = 'button'; bDel.className = 'btn-del'; bDel.textContent = 'Hapus';
      bDel.onclick = async () => {
        if (!confirm('Hapus kelas dan seluruh anggotanya?')) return;
        try { await SHSupabase.deleteClass(c.id); refreshMasterClasses(); }
        catch (e) { alert(e.message); }
      };
      div.appendChild(bEdit);
      div.appendChild(bDel);
      list.appendChild(div);
    });
  } catch (e) {
    st.textContent = e.message;
  }
}

async function refreshMasterMembers(classId) {
  const list = document.getElementById('mc-member-list');
  const st = document.getElementById('mc-member-status');
  list.innerHTML = '';
  try {
    const rows = await SHSupabase.listClassMembers(classId);
    st.textContent = (rows || []).length + ' peserta.';
    (rows || []).forEach(m => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = '<div class="info" style="flex:1"><strong>' + escapeHtml(m.display_name || m.participant_name) +
        '</strong><br><small>' + escapeHtml(m.participant_name) + '</small></div>';
      const b1 = document.createElement('button');
      b1.type = 'button'; b1.className = 'btn-del'; b1.textContent = 'Edit';
      b1.onclick = async () => {
        const n = prompt('Nama peserta', m.participant_name);
        if (n === null) return;
        const d = prompt('Nama tampilan', m.display_name || m.participant_name);
        if (d === null) return;
        try { await SHSupabase.updateClassMember(m.id, n, d); refreshMasterMembers(classId); }
        catch (e) { alert(e.message); }
      };
      const b2 = document.createElement('button');
      b2.type = 'button'; b2.className = 'btn-del'; b2.textContent = 'Hapus';
      b2.onclick = async () => {
        if (!confirm('Hapus peserta ini dari kelas?')) return;
        try { await SHSupabase.deleteClassMember(m.id); refreshMasterMembers(classId); }
        catch (e) { alert(e.message); }
      };
      div.appendChild(b1); div.appendChild(b2); list.appendChild(div);
    });
  } catch (e) { st.textContent = e.message; }
}

async function onMcAddClass() {
  const st = document.getElementById('mc-status');
  try {
    const n = document.getElementById('mc-name').value.trim();
    const ins = document.getElementById('mc-institution').value.trim();
    await SHSupabase.createClass(n, ins);
    document.getElementById('mc-name').value = '';
    document.getElementById('mc-institution').value = '';
    st.textContent = 'Kelas ditambahkan.';
    refreshMasterClasses();
  } catch (e) { st.textContent = e.message; }
}

async function onMcAddMember() {
  const st = document.getElementById('mc-member-status');
  const classId = document.getElementById('mc-selected-class-id').value;
  if (!classId) { st.textContent = 'Pilih kelas dulu.'; return; }
  try {
    const n = document.getElementById('mc-member-name').value.trim();
    const d = document.getElementById('mc-member-display').value.trim();
    await SHSupabase.addClassMember(classId, n, d);
    document.getElementById('mc-member-name').value = '';
    document.getElementById('mc-member-display').value = '';
    refreshMasterMembers(classId);
  } catch (e) { st.textContent = e.message; }
}


async function refreshMpPasswords(packId) {
  const list = document.getElementById('mp-pw-list');
  const st = document.getElementById('mp-pw-status');
  if (!list) return;
  list.innerHTML = '';
  try {
    const rows = await SHSupabase.listPackPasswords(packId);
    if (!rows || !rows.length) {
      st.textContent = 'Belum ada password paket. Peserta memakai password rombel lama (jika ada) atau cukup isi field password.';
      return;
    }
    st.textContent = rows.length + ' password.';
    rows.forEach(r => {
      const exp = SHSupabase.resolvePasswordExpiry(r.expires_at, r.duration_minutes, r.created_at);
      const valid = SHSupabase.isPackPasswordValid(r);
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = '<div class="info" style="flex:1"><strong>' + escapeHtml(r.label || '(tanpa label)') +
        '</strong><br><small>' + (valid ? 'aktif' : 'nonaktif/kadaluarsa') +
        (exp ? ' · s.d. ' + escapeHtml(exp.toLocaleString('id-ID')) : ' · tanpa kadaluarsa') +
        (r.duration_minutes ? ' · durasi ' + r.duration_minutes + ' mnt' : '') +
        '</small></div>';
      const bOff = document.createElement('button');
      bOff.type = 'button'; bOff.className = 'btn-del';
      bOff.textContent = r.active === false ? 'Aktifkan' : 'Nonaktifkan';
      bOff.onclick = async () => {
        try {
          await SHSupabase.updatePackPassword(r.id, { active: r.active === false });
          refreshMpPasswords(packId);
        } catch (e) { alert(e.message); }
      };
      const bDel = document.createElement('button');
      bDel.type = 'button'; bDel.className = 'btn-del'; bDel.textContent = 'Hapus';
      bDel.onclick = async () => {
        if (!confirm('Hapus password ini?')) return;
        try {
          await SHSupabase.deletePackPassword(r.id);
          refreshMpPasswords(packId);
        } catch (e) { alert(e.message); }
      };
      div.appendChild(bOff);
      div.appendChild(bDel);
      list.appendChild(div);
    });
  } catch (e) {
    st.textContent = e.message || 'Gagal memuat password';
  }
}

async function onMpAddPassword() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-pw-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  const plain = document.getElementById('mp-pw-plain').value;
  const label = document.getElementById('mp-pw-label').value.trim();
  const expLocal = document.getElementById('mp-pw-expires').value;
  const dur = document.getElementById('mp-pw-duration').value;
  try {
    let expiresAt = null;
    if (expLocal) {
      expiresAt = new Date(expLocal).toISOString();
    }
    await SHSupabase.addPackPassword(id, plain, {
      label,
      expiresAt,
      durationMinutes: dur ? parseInt(dur, 10) : null
    });
    document.getElementById('mp-pw-plain').value = '';
    document.getElementById('mp-pw-label').value = '';
    document.getElementById('mp-pw-expires').value = '';
    document.getElementById('mp-pw-duration').value = '';
    st.textContent = 'Password ditambahkan.';
    refreshMpPasswords(id);
  } catch (e) {
    st.textContent = e.message;
  }
}


async function onMcImportLegacy() {
  const st = document.getElementById('mc-status');
  try {
    const res = await fetch('students.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('students.json tidak ditemukan');
    const data = await res.json();
    let totalClass = 0, totalMem = 0;
    if (Array.isArray(data.cohorts)) {
      for (const c of data.cohorts) {
        const legacy = {};
        legacy[c.className] = c.members || [];
        const r = await SHSupabase.importLegacyStudents(legacy, c.institution || 'SMA PMA');
        totalClass += r.classCount || 0;
        totalMem += r.memberCount || 0;
      }
    } else {
      const institution = (config && config.schoolName) || 'SMA PMA 2024';
      const r = await SHSupabase.importLegacyStudents(data, institution);
      totalClass = r.classCount || 0;
      totalMem = r.memberCount || 0;
    }
    st.textContent = 'Impor selesai (QuizIT). Kelas baru: ' + totalClass + ', peserta diproses: ' + totalMem + '. Lanjut atur di Kelola Paket.';
    refreshMasterClasses();
  } catch (e) {
    st.textContent = e.message || 'Gagal impor';
  }
}

async function onMpSelectAllTree() {
  document.querySelectorAll('#mp-checkbox-tree input[type="checkbox"]').forEach(cb => { cb.checked = true; });
  const st = document.getElementById('mp-part-status');
  if (st) st.textContent = 'Semua dicentang. Klik Simpan Pilihan Peserta Paket.';
}

async function onMpAssignAllMaster() {
  const id = document.getElementById('mp-pack-id').value;
  const st = document.getElementById('mp-part-status');
  if (!id) { st.textContent = 'Pilih paket dulu.'; return; }
  try {
    const all = await SHSupabase.listAllMasterMembers();
    if (!all.length) {
      st.textContent = 'Master peserta kosong. Buka Kelola Peserta → Impor data awal dulu.';
      return;
    }
    if (!confirm('Masukkan ' + all.length + ' peserta dari seluruh kelas master ke paket ini?')) return;
    const n = await SHSupabase.replacePackParticipants(id, all);
    st.textContent = 'Tersimpan: ' + n + ' peserta pada paket.';
    await renderMpCheckboxTree(id);
  } catch (e) {
    st.textContent = e.message;
  }
}



async function populateTokenDatalists() {
  try {
    const users = new Set();
    const classes = new Set();
    if (window.SHSupabase && SHSupabase.sbEnabled()) {
      const members = await SHSupabase.listAllMasterMembers();
      (members || []).forEach(m => {
        if (m.display_name) users.add(m.display_name);
        if (m.student_name) users.add(m.student_name);
      });
      const cls = await SHSupabase.listAllClassesAdmin();
      (cls || []).forEach(c => {
        if (c.name) classes.add(c.name);
        const label = (c.name || '') + (c.institution ? ' · ' + c.institution : '');
        if (label) classes.add(label);
      });
    }
    const uList = document.getElementById('tok-users-list');
    const cList = document.getElementById('tok-class-list');
    const pList = document.getElementById('tok-packs-list');
    if (uList) {
      uList.innerHTML = '';
      [...users].sort().forEach(u => {
        const o = document.createElement('option'); o.value = u; uList.appendChild(o);
      });
    }
    if (cList) {
      cList.innerHTML = '';
      [...classes].sort().forEach(u => {
        const o = document.createElement('option'); o.value = u; cList.appendChild(o);
      });
    }
    if (pList) {
      pList.innerHTML = '';
      const packs = (validPacks || []).filter(p => p && p.id && String(p.id).startsWith('quizit-'));
      packs.forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.label = p.title || p.id;
        pList.appendChild(o);
      });
      // also from manage cache
      (_managePacksCache || []).forEach(p => {
        if (!packs.find(x => x.id === p.id)) {
          const o = document.createElement('option');
          o.value = p.id; o.label = p.title || p.id; pList.appendChild(o);
        }
      });
    }
  } catch (e) { console.warn('datalist', e); }
}

async function refreshTokenList() {
  const list = document.getElementById('tok-list');
  const st = document.getElementById('tok-status');
  if (!list) return;
  list.innerHTML = '';
  try {
    const rows = await SHSupabase.listExamTokens((config && config.productId) || 'quizit');
    st.textContent = (rows||[]).length + ' token.';
    (rows||[]).forEach(r => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = '<div class="info" style="flex:1;cursor:pointer"><strong>' + escapeHtml(r.token_code) + '</strong> · ' +
        escapeHtml(r.label||'') + '<br><small>' + escapeHtml(r.scope_type) + ' · pakai ' + (r.used_count||0) + '/' + (r.max_uses||'∞') +
        ' · Rp' + (r.transfer_amount||0) + (r.expires_at ? ' · exp ' + r.expires_at : '') + '</small></div>';
      div.querySelector('.info').onclick = async () => {
        const detail = document.getElementById('tok-detail');
        let usages = [];
        try { usages = await SHSupabase.listTokenUsages(r.id); } catch(_){}
        detail.innerHTML = '<strong>Detail ' + escapeHtml(r.token_code) + '</strong><br>' +
          'Dibuat: ' + escapeHtml(r.created_at||'') + ' oleh ' + escapeHtml(r.created_by||'') + '<br>' +
          'Transfer tercatat: Rp' + (r.transfer_amount||0) + ' ' + escapeHtml(r.transfer_note||'') + '<br>' +
          'Paket: ' + escapeHtml(JSON.stringify(r.pack_ids||[])) + '<br>' +
          'Terakhir dipakai: ' + escapeHtml(r.last_used_at||'-') + ' · ' + escapeHtml(r.last_used_by||'-') + '<br>' +
          'Riwayat (' + usages.length + '):<br>' + usages.slice(0,10).map(u =>
            '- ' + escapeHtml(u.used_at) + ' · ' + escapeHtml(u.user_name||u.user_email||'') + ' · ' + escapeHtml(u.pack_id||'')
          ).join('<br>');
      };
      const bEdit = document.createElement('button');
      bEdit.type='button'; bEdit.className='btn-del'; bEdit.textContent='Edit kode';
      bEdit.onclick = async () => {
        const nc = prompt('Kode token baru', r.token_code);
        if (!nc) return;
        try { await SHSupabase.updateExamToken(r.id, { token_code: nc.trim() }); refreshTokenList(); }
        catch(e){ alert(e.message); }
      };
      const bDel = document.createElement('button');
      bDel.type='button'; bDel.className='btn-del'; bDel.textContent='Hapus';
      bDel.onclick = async () => {
        if (!confirm('Hapus token?')) return;
        try { await SHSupabase.deleteExamToken(r.id); refreshTokenList(); } catch(e){ alert(e.message); }
      };
      div.appendChild(bEdit); div.appendChild(bDel); list.appendChild(div);
    });
  } catch(e) { st.textContent = e.message; }
}

async function onCreateToken() {
  const st = document.getElementById('tok-status');
  try {
    const code = document.getElementById('tok-code').value.trim() || ('QI-' + Math.random().toString(36).slice(2,8).toUpperCase());
    const users = document.getElementById('tok-users').value.split(',').map(s=>s.trim()).filter(Boolean);
    const packs = document.getElementById('tok-packs').value.split(',').map(s=>s.trim()).filter(Boolean);
    const exp = document.getElementById('tok-exp').value;
    await SHSupabase.createExamToken({
      token_code: code,
      product_id: (config && config.productId) || 'quizit',
      label: document.getElementById('tok-label').value.trim(),
      scope_type: document.getElementById('tok-scope').value,
      allowed_users: users,
      allowed_class: document.getElementById('tok-class').value.trim() || null,
      pack_ids: packs,
      max_uses: parseInt(document.getElementById('tok-max').value,10)||1,
      transfer_amount: parseInt(document.getElementById('tok-amount').value,10)||0,
      expires_at: exp ? new Date(exp).toISOString() : null
    });
    document.getElementById('tok-code').value = code;
    st.textContent = 'Token dibuat: ' + code;
    refreshTokenList();
  } catch(e) { st.textContent = e.message; }
}

async function loadProctorSettings() {
  if (window.SHSupabase && SHSupabase.getProctorSettings) {
    proctorSettings = await SHSupabase.getProctorSettings();
  } else {
    proctorSettings = {
      forceFullscreen: config.forceFullscreen !== false,
      cheatAlarmSound: config.cheatAlarmSound !== false
    };
  }
  const fs = document.getElementById('set-force-fullscreen');
  const al = document.getElementById('set-cheat-alarm');
  if (fs) fs.checked = !!proctorSettings.forceFullscreen;
  if (al) al.checked = !!proctorSettings.cheatAlarmSound;
}

function enterExamFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (req) {
    Promise.resolve(req.call(el)).catch(() => {
      alert('Izinkan mode fullscreen untuk memulai ujian (wajib jika proctoring aktif).');
    });
  }
  startFullscreenGuard();
}

function exitExamFullscreenQuiet() {
  fsUnlockedByAdmin = true;
  stopFullscreenGuard();
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exit) Promise.resolve(exit.call(document)).catch(() => {});
  }
}

function startFullscreenGuard() {
  if (fsGuardActive) return;
  fsGuardActive = true;
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
}

function stopFullscreenGuard() {
  fsGuardActive = false;
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
  const ov = document.getElementById('fs-exit-overlay');
  if (ov) ov.style.display = 'none';
}

function onFullscreenChange() {
  if (examFinished || isPracticeMode || !proctorSettings.forceFullscreen) return;
  if (fsUnlockedByAdmin) return;
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!inFs && !examFinished) {
    // keluar fullscreen tanpa izin admin
    const ov = document.getElementById('fs-exit-overlay');
    if (ov) {
      ov.style.display = 'flex';
      document.getElementById('fs-exit-password').value = '';
      document.getElementById('fs-exit-msg').textContent = '';
    }
    if (proctorSettings.cheatAlarmSound) playCheatAlarm();
    tabSwitchCount++;
  }
}

function setupProctorUi() {
  const btnSave = document.getElementById('btn-save-proctor');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const st = document.getElementById('proctor-status');
      proctorSettings = {
        forceFullscreen: !!document.getElementById('set-force-fullscreen').checked,
        cheatAlarmSound: !!document.getElementById('set-cheat-alarm').checked
      };
      // update config runtime
      if (window.__CBT_CONFIG__) {
        window.__CBT_CONFIG__.forceFullscreen = proctorSettings.forceFullscreen;
        window.__CBT_CONFIG__.cheatAlarmSound = proctorSettings.cheatAlarmSound;
      }
      try {
        if (window.SHSupabase && SHSupabase.sbEnabled()) {
          await SHSupabase.saveProctorSettings(proctorSettings);
          st.textContent = 'Pengaturan disimpan. Peserta memakai setting ini saat memuat ulang atau mulai ujian.';
        } else {
          st.textContent = 'Tersimpan di sesi admin ini saja. Untuk semua peserta, aktifkan Supabase atau ubah config.json (forceFullscreen / cheatAlarmSound).';
        }
      } catch (e) {
        st.textContent = 'Gagal menyimpan: ' + e.message + ' — setting tetap aktif di sesi ini.';
      }
    });
  }
  const btnOk = document.getElementById('btn-fs-exit-ok');
  if (btnOk) {
    btnOk.addEventListener('click', () => {
      const pass = document.getElementById('fs-exit-password').value;
      const msg = document.getElementById('fs-exit-msg');
      if (pass === (config.adminPassword || '')) {
        fsUnlockedByAdmin = true;
        document.getElementById('fs-exit-overlay').style.display = 'none';
        msg.textContent = '';
      } else {
        msg.textContent = 'Password salah. Fullscreen akan dipulihkan.';
        setTimeout(() => enterExamFullscreen(), 500);
      }
    });
  }
  const btnRe = document.getElementById('btn-fs-reenter');
  if (btnRe) {
    btnRe.addEventListener('click', () => {
      document.getElementById('fs-exit-overlay').style.display = 'none';
      enterExamFullscreen();
    });
  }
}


init();
