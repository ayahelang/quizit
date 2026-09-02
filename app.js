/**
 * Silverhawk CBT v2.0 — Multi-mapel via catalog.json
 */

let config = {};
let students = {};
let catalog = { packs: [] };
let validPacks = [];
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
    document.getElementById('pack-list').innerHTML =
      '<p class="hint">Gagal memuat catalog.json. Periksa file di repository.</p>';
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
  const box = document.getElementById('pack-list');
  if (!validPacks.length) {
    box.innerHTML = '<p class="hint">Tidak ada paket soal di catalog.json</p>';
    return;
  }
  box.innerHTML = '';
  validPacks.forEach(pack => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pack-item';
    btn.disabled = !pack.valid;
    btn.innerHTML = `
      <div class="pack-title">${escapeHtml(pack.title || pack.id)}</div>
      <div class="pack-meta">${escapeHtml(pack.subject || '')}${pack.description ? ' — ' + escapeHtml(pack.description) : ''}</div>
      <span class="pack-badge ${pack.valid ? '' : 'invalid'}">
        ${pack.valid
          ? `${pack.mcCount} PG${pack.essaysCount ? ' + ' + pack.essaysCount + ' Essay' : ''}${pack.practiceOk ? ' • Latihan OK' : ''}`
          : 'File tidak valid / tidak ditemukan'}
      </span>
    `;
    if (pack.valid) {
      btn.addEventListener('click', () => selectPack(pack, btn));
    }
    box.appendChild(btn);
  });
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
    classSelect.value = '';
    onClassChange();
  } catch (err) {
    console.error(err);
    alert('Gagal memuat file soal paket ini.');
    selectedPack = null;
  }
}

function setupEventListeners() {
  classSelect.addEventListener('change', onClassChange);
  examPassword.addEventListener('input', checkStartReady);
  nameSelect.addEventListener('change', checkStartReady);
  btnStart.addEventListener('click', onStartClick);
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
}

function hideSpecialLogins() {
  document.getElementById('login-main').style.display = 'block';
  document.getElementById('practice-login').style.display = 'none';
  document.getElementById('admin-login').style.display = 'none';
}

function onClassChange() {
  const cls = classSelect.value;
  passwordGroup.style.display = cls ? 'block' : 'none';
  nameGroup.style.display = 'none';
  nameSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
  examPassword.value = '';
  btnStart.disabled = true;
  if (!cls) return;
  (students[cls] || []).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    nameSelect.appendChild(opt);
  });
  nameGroup.style.display = 'block';
}

function checkStartReady() {
  const cls = classSelect.value;
  const pass = examPassword.value.trim();
  const name = nameSelect.value;
  const correctPass = config.passwords?.[cls] || '';
  btnStart.disabled = !(selectedPack && cls && name && pass && pass === correctPass);
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

  if (config.googleScriptUrl && config.googleScriptUrl.trim() !== '') {
    try {
      const exists = await checkNameInSheet(name, cls);
      if (exists) {
        alert('Nama ini sudah pernah mengikuti ujian dan datanya tercatat di sistem.\nAnda tidak dapat mengikuti ujian lagi.');
        btnStart.disabled = false;
        btnStart.textContent = 'Mulai Ujian';
        return;
      }
    } catch (err) {
      console.warn('Gagal cek ke Sheet:', err);
    }
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

  if (!isPracticeMode && config.googleScriptUrl && config.googleScriptUrl.trim() !== '') {
    sendToGoogleSheet(resultData);
  }
  if (!isPracticeMode && window.SHSupabase && SHSupabase.sbEnabled()) {
    SHSupabase.saveResult(resultData).catch(err => console.warn('Supabase save:', err));
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
    div.querySelector('.btn-del').addEventListener('click', () => adminDeleteRow(row.name, row.class));
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

async function adminDeleteRow(name, cls) {
  if (!confirm(`Hapus record "${name}" kelas ${cls}?`)) return;
  try {
    const url = config.googleScriptUrl +
      '?action=delete&name=' + encodeURIComponent(name) +
      '&class=' + encodeURIComponent(cls);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'ok') {
      alert('Record dihapus.');
      adminLoadData();
    } else alert('Gagal: ' + (data.message || ''));
  } catch (err) {
    alert('Gagal menghapus. Cek Apps Script action=delete.');
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
async function mergeRemotePacks() {
  if (!window.SHSupabase || !SHSupabase.sbEnabled()) return;
  const remote = await SHSupabase.listRemotePacks();
  (remote || []).forEach(rp => {
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
  renderPackList();
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
      alert('Paket remote dimuat ulang. Kembali ke login untuk melihat daftar.');
    } catch (e) { alert(e.message); }
  });

  const btnAn = document.getElementById('btn-run-analisis');
  if (btnAn) btnAn.addEventListener('click', onRunAnalisis);

  const btnAdd = document.getElementById('btn-add-admin');
  if (btnAdd) btnAdd.addEventListener('click', onAddAdmin);
  setupProctorUi();
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
    admin.role === 'main' ? 'Admin Utama' : ('Admin Tambahan: ' + admin.username);
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

// Enhance adminLoadData to also try Supabase results
const _adminLoadDataOrig = adminLoadData;
adminLoadData = async function() {
  const status = document.getElementById('admin-status');
  status.textContent = 'Memuat...';
  document.getElementById('admin-list').innerHTML = '';
  let rows = [];

  // Sheet
  if (config.googleScriptUrl) {
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
      });
    } catch (e) {
      console.warn('Sheet list failed', e);
    }
  }

  // Supabase
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
      });
    } catch (e) {
      console.warn('Supabase list failed', e);
    }
  }

  window._adminRows = rows;
  // fill filter options
  const sel = document.getElementById('admin-pack-filter');
  const seen = new Set(['']);
  [...sel.options].forEach(o => seen.add(o.value));
  rows.forEach(r => {
    if (r.packId && !seen.has(r.packId)) {
      seen.add(r.packId);
      const opt = document.createElement('option');
      opt.value = r.packId;
      opt.textContent = r.packTitle || r.packId;
      sel.appendChild(opt);
    }
  });
  const filtered = getFilteredAdminRows();
  status.textContent = `Menampilkan ${filtered.length} dari ${rows.length} data.`;
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
    const p = document.getElementById('new-admin-pass').value;
    await SHSupabase.addAdmin(u, p);
    st.textContent = 'Admin ditambahkan.';
    document.getElementById('new-admin-user').value = '';
    document.getElementById('new-admin-pass').value = '';
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
      st.textContent = 'Supabase belum dikonfigurasi.';
      return;
    }
    const rows = await SHSupabase.listAdmins();
    (rows || []).forEach(r => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = `
        <div class="info"><strong>${escapeHtml(r.username)}</strong> · ${escapeHtml(r.role)}
        <br><small>${r.active ? 'aktif' : 'nonaktif'} · ${escapeHtml(r.created_at || '')}</small></div>`;
      if (r.role !== 'main' && r.active && SHSupabase.isMainAdmin()) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-del';
        b.textContent = 'Nonaktifkan';
        b.addEventListener('click', async () => {
          if (!confirm('Nonaktifkan ' + r.username + '?')) return;
          await SHSupabase.deactivateAdmin(r.id);
          refreshAdminsList();
        });
        div.appendChild(b);
      }
      list.appendChild(div);
    });
    st.textContent = `${(rows || []).length} admin terdaftar.`;
  } catch (e) {
    st.textContent = e.message;
  }
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
          st.textContent = 'Tersimpan ke Supabase. Peserta akan memakai setting ini saat memuat ulang / mulai ujian.';
        } else {
          st.textContent = 'Tersimpan di sesi admin ini saja. Untuk semua peserta, aktifkan Supabase atau ubah config.json (forceFullscreen / cheatAlarmSound).';
        }
      } catch (e) {
        st.textContent = 'Gagal simpan Supabase: ' + e.message + ' — setting tetap aktif di sesi ini.';
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
