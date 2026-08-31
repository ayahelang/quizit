/**
 * Silverhawk CBT v1.1
 * 25 PG (auto-score) + 5 Essay (manual)
 * Support Google Apps Script → Google Sheet
 */

let config = {};
let students = {};
let allQuestions = [];
let allEssays = [];
let examQuestions = [];
let currentIndex = 0;          // 0..24 = MC, 25..29 = Essay
let answers = {};              // MC: {id: selectedIndex}
let essayAnswers = {};         // Essay: {id: text}
let studentName = '';
let studentClass = '';
let timerInterval = null;
let timeLeft = 0;
let examFinished = false;
const TOTAL_MC = 25;
const TOTAL_ESSAY = 5;
const TOTAL_ALL = 30;

// DOM
const loginScreen = document.getElementById('login-screen');
const examScreen = document.getElementById('exam-screen');
const resultScreen = document.getElementById('result-screen');
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
    const [cfgRes, stuRes, qRes, eRes] = await Promise.all([
      fetch('config.json'),
      fetch('students.json'),
      fetch('questions.json'),
      fetch('essays.json')
    ]);
    config = await cfgRes.json();
    students = await stuRes.json();
    allQuestions = await qRes.json();
    allEssays = await eRes.json();
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
}

function onClassChange() {
  const cls = classSelect.value;
  passwordGroup.style.display = cls ? 'block' : 'none';
  nameGroup.style.display = 'none';
  nameSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
  examPassword.value = '';
  btnStart.disabled = true;
  if (!cls) return;

  const usedKey = `shcbt_used_${cls}`;
  const used = JSON.parse(localStorage.getItem(usedKey) || '[]');
  const available = (students[cls] || []).filter(n => !used.includes(n));

  available.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    nameSelect.appendChild(opt);
  });
  if (available.length === 0) {
    nameSelect.innerHTML = '<option value="">Semua nama sudah digunakan di perangkat ini</option>';
  }
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

function prepareExamQuestions() {
  const shuffledQs = shuffleArray(allQuestions);
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

  // Cek ke Google Sheet jika URL sudah diisi
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
      console.warn('Gagal cek ke Sheet, lanjut dengan localStorage saja:', err);
    }
  }

  startExam();
  btnStart.textContent = 'Mulai Ujian';
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

function startExam() {
  studentClass = classSelect.value;
  studentName = nameSelect.value;

  const usedKey = `shcbt_used_${studentClass}`;
  const used = JSON.parse(localStorage.getItem(usedKey) || '[]');
  if (!used.includes(studentName)) {
    used.push(studentName);
    localStorage.setItem(usedKey, JSON.stringify(used));
  }

  prepareExamQuestions();
  currentIndex = 0;
  answers = {};
  essayAnswers = {};
  examFinished = false;
  timeLeft = (config.durationMinutes || 60) * 60;

  document.getElementById('student-info').textContent = `${studentName} • ${studentClass}`;
  loginScreen.classList.remove('active');
  examScreen.classList.add('active');
  renderCurrent();
  startTimer();
}

function startTimer() {
  updateTimerDisplay();
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
  return currentIndex >= TOTAL_MC;
}

function getEssayIndex() {
  return currentIndex - TOTAL_MC;
}

function saveCurrentEssay() {
  if (!isEssayMode()) return;
  const essay = allEssays[getEssayIndex()];
  if (essay) essayAnswers[essay.id] = essayTextarea.value;
}

function renderCurrent() {
  const progress = ((currentIndex + 1) / TOTAL_ALL) * 100;
  document.getElementById('progress-bar').style.width = `${progress}%`;
  document.getElementById('question-counter').textContent = `${currentIndex + 1} / ${TOTAL_ALL}`;

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

function confirmSubmit() {
  saveCurrentEssay();
  const unansweredMC = examQuestions.filter(q => answers[q.id] === undefined).length;
  let msg = 'Yakin ingin mengirim semua jawaban (PG + Essay)?';
  if (unansweredMC > 0) {
    msg = `Masih ada ${unansweredMC} soal PG yang belum dijawab. Yakin tetap kirim?`;
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

  // Essay summary for sheet
  const essaySummary = allEssays.map(e => ({
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
    timeUsedSeconds: (config.durationMinutes * 60) - timeLeft,
    finishedAt: new Date().toISOString(),
    autoSubmit: auto,
    mcAnswers: detail,
    essays: essaySummary
  };

  localStorage.setItem(`shcbt_result_${studentClass}_${studentName}`, JSON.stringify(resultData));

  if (config.googleScriptUrl && config.googleScriptUrl.trim() !== '') {
    sendToGoogleSheet(resultData);
  }

  examScreen.classList.remove('active');
  resultScreen.classList.add('active');

  document.getElementById('score-value').textContent = correct;
  document.getElementById('score-percent').textContent = `${percent}%`;

  let msg = 'Tetap semangat belajar!';
  if (percent >= 90) msg = 'Luar biasa! Penguasaan materi sangat baik.';
  else if (percent >= 75) msg = 'Bagus! Terus tingkatkan.';
  else if (percent >= 60) msg = 'Cukup baik, masih ada ruang untuk berkembang.';
  document.getElementById('score-message').textContent = msg;

  document.getElementById('result-details').innerHTML = `
    <strong>${studentName}</strong> • Kelas ${studentClass}<br>
    PG Benar: ${correct} / ${TOTAL_MC}<br>
    Essay: ${Object.keys(essayAnswers).filter(k => essayAnswers[k]?.trim()).length} / ${TOTAL_ESSAY} diisi<br>
    Waktu dipakai: ${formatTime((config.durationMinutes * 60) - timeLeft)}<br>
    Selesai: ${new Date().toLocaleString('id-ID')}
  `;

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
  a.download = `hasil_${data.class}_${data.name.replace(/\s+/g, '_')}.json`;
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

function sendToGoogleSheet(data) {
  // Kirim data ringkas + essay (dipotong jika terlalu panjang agar aman)
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

init();
