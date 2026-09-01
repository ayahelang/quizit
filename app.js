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
    students = await stuRes.json();
    catalog = await catRes.json();
    validPacks = await validateCatalog(catalog.packs || []);
    renderPackList();
    setupEventListeners();
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
    mcAnswers: detail,
    essays: essaySummary
  };

  if (!isPracticeMode && config.googleScriptUrl && config.googleScriptUrl.trim() !== '') {
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
      Waktu: ${formatTime((durationMin * 60) - timeLeft)}`;

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
    score: data.score,
    total: data.total,
    percent: data.percent,
    timeUsedSeconds: data.timeUsedSeconds,
    autoSubmit: data.autoSubmit ? 'YA' : 'TIDAK',
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
  const list = document.getElementById('admin-list');
  status.textContent = 'Memuat...';
  list.innerHTML = '';
  try {
    const res = await fetch(config.googleScriptUrl + '?action=list');
    const data = await res.json();
    if (!data.rows || !data.rows.length) {
      status.textContent = 'Belum ada data.';
      window._adminRows = [];
      return;
    }
    window._adminRows = data.rows;
    status.textContent = `Total ${data.rows.length} data.`;
    data.rows.forEach((row, idx) => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = `
        <div class="info"><strong>${escapeHtml(row.name)}</strong> • Kelas ${escapeHtml(row.class)}<br><small>${escapeHtml(row.timestamp || '')}</small></div>
        <div class="score">${row.score}/${row.total} (${row.percent}%)</div>
        <button type="button" class="btn-del">Hapus</button>`;
      div.querySelector('.btn-del').addEventListener('click', () => adminDeleteRow(row.name, row.class));
      list.appendChild(div);
    });
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
  const rows = window._adminRows || [];
  if (!rows.length) {
    alert('Muat data dulu.');
    return;
  }
  const header = 'Timestamp,Nama,Kelas,Skor,Total,Persen,WaktuDetik,AutoSubmit\n';
  const body = rows.map(r =>
    `"${r.timestamp || ''}","${r.name}","${r.class}",${r.score},${r.total},${r.percent},${r.timeUsedSeconds || ''},"${r.autoSubmit || ''}"`
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hasil_ujian_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

init();
