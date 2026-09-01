/**
 * Silverhawk CBT v1.2
 * 25 PG + 5 Essay | Mode Latihan | Admin Panel | Navigasi soal
 */

let config = {};
let students = {};
let allQuestions = [];
let allEssays = [];
let practiceQuestions = [];
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
const btnDownload = document.getElementById('btn-download');
const btnReview = document.getElementById('btn-review');
const closeReview = document.getElementById('close-review');
const reviewModal = document.getElementById('review-modal');
const mcCard = document.getElementById('mc-card');
const essayCard = document.getElementById('essay-card');
const essayTextarea = document.getElementById('essay-answer');

async function init() {
  try {
    const [cfgRes, stuRes, qRes, eRes, pRes] = await Promise.all([
      fetch('config.json'),
      fetch('students.json'),
      fetch('questions.json'),
      fetch('essays.json'),
      fetch('practice-questions.json')
    ]);
    config = await cfgRes.json();
    students = await stuRes.json();
    allQuestions = await qRes.json();
    allEssays = await eRes.json();
    practiceQuestions = await pRes.json();
    setupEventListeners();
  } catch (err) {
    console.error(err);
    alert('Gagal memuat data. Pastikan semua file JSON ada.');
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
  btnDownload.addEventListener('click', downloadResult);
  btnReview.addEventListener('click', showReview);
  closeReview.addEventListener('click', () => reviewModal.classList.remove('active'));
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
  document.getElementById('login-main').style.display = 'none';
  document.getElementById('practice-login').style.display = 'block';
  document.getElementById('admin-login').style.display = 'none';
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
  btnStart.disabled = !(cls && name && pass && pass === correctPass);
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
  if (!cls || !name) return;

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
  TOTAL_MC = allQuestions.length;
  TOTAL_ESSAY = allEssays.length;
  TOTAL_ALL = TOTAL_MC + TOTAL_ESSAY;
  startExam(name, cls, allQuestions, config.durationMinutes || 60);
  btnStart.textContent = 'Mulai Ujian';
}

function startPractice() {
  const pass = document.getElementById('practice-password').value.trim();
  if (pass !== (config.practicePassword || '')) {
    alert('Password latihan salah.');
    return;
  }
  isPracticeMode = true;
  TOTAL_MC = practiceQuestions.length;
  TOTAL_ESSAY = 0;
  TOTAL_ALL = TOTAL_MC;
  startExam('Peserta Latihan', 'LATIHAN', practiceQuestions, config.practiceDurationMinutes || 30);
}

async function checkNameInSheet(name, cls) {
  const url = config.googleScriptUrl +
    '?action=check' +
    '&name=' + encodeURIComponent(name) +
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

  document.getElementById('student-info').textContent = isPracticeMode
    ? 'Mode Latihan'
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
  const essay = allEssays[getEssayIndex()];
  if (essay) essayAnswers[essay.id] = essayTextarea.value;
}

function isAnswered(idx) {
  if (isPracticeMode || idx < TOTAL_MC) {
    const q = examQuestions[idx];
    return q && answers[q.id] !== undefined;
  }
  const eIdx = idx - TOTAL_MC;
  const essay = allEssays[eIdx];
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
    btn.title = isAnswered(i) ? 'Sudah dijawab' : 'Belum dijawab';
    btn.addEventListener('click', () => {
      saveCurrentEssay();
      currentIndex = i;
      renderCurrent();
    });
    strip.appendChild(btn);
  }
}

function renderCurrent() {
  const progress = ((currentIndex + 1) / TOTAL_ALL) * 100;
  document.getElementById('progress-bar').style.width = `${progress}%`;
  document.getElementById('question-counter').textContent = `${currentIndex + 1} / ${TOTAL_ALL}`;
  renderNavStrip();

  if (isEssayMode()) {
    mcCard.style.display = 'none';
    essayCard.style.display = 'block';
    const eIdx = getEssayIndex();
    const essay = allEssays[eIdx];
    document.getElementById('e-num').textContent = eIdx + 1;
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
  for (let i = 0; i < TOTAL_ALL; i++) {
    if (!isAnswered(i)) unanswered++;
  }
  let msg = isPracticeMode
    ? 'Yakin ingin menyelesaikan latihan?'
    : 'Yakin ingin mengirim semua jawaban (PG + Essay)?';
  if (unanswered > 0) {
    msg = `Masih ada ${unanswered} soal yang belum dijawab. Yakin tetap kirim?`;
  }
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

  const percent = Math.round((correct / TOTAL_MC) * 100);
  const durationMin = isPracticeMode
    ? (config.practiceDurationMinutes || 30)
    : (config.durationMinutes || 60);

  const essaySummary = isPracticeMode ? [] : allEssays.map(e => ({
    id: e.id,
    question: e.question,
    answer: essayAnswers[e.id] || '(kosong)'
  }));

  const resultData = {
    name: studentName,
    class: studentClass,
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

  document.getElementById('result-details').innerHTML = isPracticeMode
    ? `<strong>Mode Latihan</strong><br>Benar: ${correct} / ${TOTAL_MC}<br>Waktu dipakai: ${formatTime((durationMin * 60) - timeLeft)}<br>Hasil latihan tidak dikirim ke Google Sheet.`
    : `<strong>${studentName}</strong> • Kelas ${studentClass}<br>
      PG Benar: ${correct} / ${TOTAL_MC}<br>
      Essay: ${Object.keys(essayAnswers).filter(k => essayAnswers[k]?.trim()).length} / ${TOTAL_ESSAY} diisi<br>
      Waktu dipakai: ${formatTime((durationMin * 60) - timeLeft)}<br>
      Selesai: ${new Date().toLocaleString('id-ID')}`;

  document.getElementById('result-footer-note').innerHTML = isPracticeMode
    ? 'Ini adalah mode latihan. Hasil tidak tercatat di sistem ujian resmi.'
    : 'Skor di atas hanya untuk soal Pilihan Ganda.<br>Essay dinilai manual oleh guru.';

  window._lastResult = resultData;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} menit ${s} detik`;
}

function downloadResult() {
  const data = window._lastResult;
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hasil_${data.class}_${String(data.name).replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function showReview() {
  const data = window._lastResult;
  if (!data) return;
  const body = document.getElementById('review-body');
  body.innerHTML = data.mcAnswers.map((a, i) => `
    <div class="review-item ${a.isCorrect ? 'correct' : 'wrong'}">
      <div class="review-q">${i + 1}. ${a.question}</div>
      <div class="review-ans">
        Jawabanmu: ${a.userAnswer}<br>
        Kunci: ${a.correctAnswer} ${a.isCorrect ? '✓' : '✗'}
      </div>
    </div>
  `).join('');
  reviewModal.classList.add('active');
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
  }).catch(err => console.warn('Kirim ke Sheet (no-cors normal):', err));
}

/* ========== ADMIN ========== */
function enterAdmin() {
  const pass = document.getElementById('admin-password').value.trim();
  if (pass !== (config.adminPassword || '')) {
    alert('Password admin salah.');
    return;
  }
  loginScreen.classList.remove('active');
  adminScreen.classList.add('active');
  document.getElementById('admin-list').innerHTML = '';
  document.getElementById('admin-status').textContent = 'Klik "Muat Data dari Sheet" untuk menampilkan daftar.';
}

function logoutAdmin() {
  adminScreen.classList.remove('active');
  loginScreen.classList.add('active');
  hideSpecialLogins();
}

async function adminLoadData() {
  if (!config.googleScriptUrl) {
    alert('googleScriptUrl belum diisi di config.json');
    return;
  }
  const status = document.getElementById('admin-status');
  const list = document.getElementById('admin-list');
  status.textContent = 'Memuat data...';
  list.innerHTML = '';
  try {
    const url = config.googleScriptUrl + '?action=list';
    const res = await fetch(url);
    const data = await res.json();
    if (!data.rows || data.rows.length === 0) {
      status.textContent = 'Belum ada data di Sheet.';
      window._adminRows = [];
      return;
    }
    window._adminRows = data.rows;
    status.textContent = `Total ${data.rows.length} data ditemukan.`;
    data.rows.forEach((row, idx) => {
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = `
        <div class="info"><strong>${row.name}</strong> • Kelas ${row.class}<br>
        <small>${row.timestamp || ''}</small></div>
        <div class="score">${row.score}/${row.total} (${row.percent}%)</div>
        <button type="button" class="btn-del" data-idx="${idx}">Hapus</button>
      `;
      div.querySelector('.btn-del').addEventListener('click', () => adminDeleteRow(row.name, row.class, idx));
      list.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    status.textContent = 'Gagal memuat data. Pastikan Apps Script sudah di-update (action=list) dan di-deploy ulang.';
  }
}

async function adminDeleteRow(name, cls, idx) {
  if (!confirm(`Hapus record "${name}" kelas ${cls} dari Google Sheet?\nSetelah dihapus, siswa dapat ikut ujian lagi.`)) return;
  try {
    const url = config.googleScriptUrl +
      '?action=delete' +
      '&name=' + encodeURIComponent(name) +
      '&class=' + encodeURIComponent(cls);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'ok') {
      alert('Record berhasil dihapus.');
      adminLoadData();
    } else {
      alert('Gagal menghapus: ' + (data.message || 'unknown'));
    }
  } catch (err) {
    console.error(err);
    alert('Gagal menghapus. Pastikan Apps Script mendukung action=delete dan sudah di-deploy ulang.');
  }
}

function adminDownloadCSV() {
  const rows = window._adminRows || [];
  if (rows.length === 0) {
    alert('Muat data terlebih dahulu.');
    return;
  }
  const header = 'Timestamp,Nama,Kelas,Skor,Total,Persen,WaktuDetik,AutoSubmit\n';
  const body = rows.map(r =>
    `"${r.timestamp || ''}","${r.name}","${r.class}",${r.score},${r.total},${r.percent},${r.timeUsedSeconds || ''},"${r.autoSubmit || ''}"`
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hasil_ujian_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

init();
