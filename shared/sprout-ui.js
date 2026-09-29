/* Shared chrome for every Sprout game.
 *
 * A page opts in by setting window.sproutConfig before loading this file:
 *   window.sproutConfig = {
 *     game: 'garden-pick',            // id used in the feedback record
 *     title: 'Garden Pick!',          // shown in the stripe
 *     home: '../../index.html',       // omit on the hub itself
 *     accent: '#5cb83e',
 *     context: () => ({ picked: 3 })  // whatever the game knows about right now
 *   };
 * Everything else (the stripe, the feedback sheet, recording, retries) is here.
 */
(function () {
  const cfg = window.sproutConfig || {};
  const ENDPOINT = '/api/feedback';
  const QUEUE_KEY = 'sproutFeedbackQueue';
  const MAX_SECONDS = 90;
  const rtl = (document.documentElement.getAttribute('dir') || '').toLowerCase() === 'rtl';

  const T = rtl ? {
    back: 'חזרה', feedback: 'משוב', title: 'איך היה?',
    sub: 'ספרו לנו מה עבד ומה פחות — אפשר לכתוב או להקליט.',
    placeholder: 'מה קרה? מה כדאי לשפר?',
    rec: 'הקלטה', stop: 'עצור', again: 'הקלטה מחדש', drop: 'מחק הקלטה',
    send: 'שליחה', sending: 'שולח…', cancel: 'ביטול',
    what: 'מה נשלח יחד עם המשוב', sent: 'תודה! המשוב נשלח.',
    queued: 'אין חיבור — המשוב יישלח כשתהיה רשת.',
    empty: 'כתבו משהו או הקליטו לפני השליחה.',
    micFail: 'אין גישה למיקרופון.'
  } : {
    back: 'Back', feedback: 'Feedback', title: 'How did it go?',
    sub: 'Tell us what worked and what did not — write it or record it.',
    placeholder: 'What happened? What should change?',
    rec: 'Record', stop: 'Stop', again: 'Record again', drop: 'Delete recording',
    send: 'Send', sending: 'Sending…', cancel: 'Cancel',
    what: 'What gets sent with this', sent: 'Thanks! Feedback sent.',
    queued: 'Offline — it will go out next time you are connected.',
    empty: 'Write something or record before sending.',
    micFail: 'No microphone access.'
  };

  /* ---------- stripe ---------- */
  const nav = document.createElement('div');
  nav.className = 'sprout-nav';
  if (cfg.accent) nav.style.setProperty('--sprout-accent', cfg.accent);
  const backHtml = cfg.home
    ? '<a class="sn-btn sn-back" href="' + cfg.home + '" aria-label="' + T.back + '">←</a>'
    : '<span class="sn-dot" aria-hidden="true"></span>';
  nav.innerHTML = backHtml +
    '<div class="sn-title">' + (cfg.title || document.title || 'Sprout') + '</div>' +
    '<button class="sn-btn sn-fb" aria-label="' + T.feedback + '">💬</button>';
  document.body.appendChild(nav);

  /* ---------- feedback sheet ---------- */
  const sheet = document.createElement('div');
  sheet.className = 'sprout-fb';
  sheet.innerHTML =
    '<div class="fb-card" role="dialog" aria-modal="true">' +
      '<h2>' + T.title + '</h2>' +
      '<p class="fb-sub">' + T.sub + '</p>' +
      '<textarea class="fb-text" placeholder="' + T.placeholder + '"></textarea>' +
      '<div class="fb-row">' +
        '<button class="fb-btn fb-rec">🎤 ' + T.rec + '</button>' +
        '<span class="fb-time"></span>' +
        '<button class="fb-btn fb-drop" hidden>' + T.drop + '</button>' +
      '</div>' +
      '<audio class="fb-play" controls hidden></audio>' +
      '<details class="fb-what"><summary>' + T.what + '</summary><pre class="fb-ctx"></pre></details>' +
      '<div class="fb-note"></div>' +
      '<div class="fb-row" style="justify-content:flex-end">' +
        '<button class="fb-btn fb-cancel">' + T.cancel + '</button>' +
        '<button class="fb-btn fb-send">' + T.send + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(sheet);

  const $ = sel => sheet.querySelector(sel);
  const textEl = $('.fb-text'), recBtn = $('.fb-rec'), timeEl = $('.fb-time'),
        dropBtn = $('.fb-drop'), playEl = $('.fb-play'), ctxEl = $('.fb-ctx'),
        noteEl = $('.fb-note'), sendBtn = $('.fb-send');

  function context() {
    let state = {};
    try { state = (cfg.context && cfg.context()) || {}; }
    catch (err) { state = { contextError: String(err) }; }
    return {
      game: cfg.game || location.pathname,
      title: cfg.title || document.title,
      url: location.href,
      at: new Date().toISOString(),
      openForSec: Math.round(performance.now() / 1000),
      screen: {
        w: window.innerWidth, h: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        orientation: (screen.orientation || {}).type || (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
      },
      standalone: !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches),
      language: navigator.language,
      userAgent: navigator.userAgent,
      state: state
    };
  }

  /* ---------- recording ---------- */
  let recorder = null, chunks = [], blob = null, blobType = '', started = 0, ticker = null;

  function fmt(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }

  function stopRec() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (recorder && recorder.stream) recorder.stream.getTracks().forEach(t => t.stop());
    clearInterval(ticker);
    recorder = null;
    recBtn.classList.remove('on');
    recBtn.textContent = '🎤 ' + (blob ? T.again : T.rec);
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
      const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        blobType = (recorder && recorder.mimeType) || mime || 'audio/webm';
        blob = new Blob(chunks, { type: blobType });
        playEl.src = URL.createObjectURL(blob);
        playEl.hidden = false;
        dropBtn.hidden = false;
      };
      recorder.start();
      started = Date.now();
      recBtn.classList.add('on');
      recBtn.textContent = '■ ' + T.stop;
      noteEl.textContent = '';
      ticker = setInterval(() => {
        const s = (Date.now() - started) / 1000;
        timeEl.textContent = fmt(s);
        if (s >= MAX_SECONDS) stopRec();
      }, 200);
    } catch (err) {
      noteEl.className = 'fb-note bad';
      noteEl.textContent = T.micFail;
    }
  }

  recBtn.addEventListener('click', () => { recorder ? stopRec() : startRec(); });
  dropBtn.addEventListener('click', () => {
    blob = null; playEl.hidden = true; playEl.removeAttribute('src');
    dropBtn.hidden = true; timeEl.textContent = '';
    recBtn.textContent = '🎤 ' + T.rec;
  });

  /* ---------- send, with a retry queue for when the iPad is offline ---------- */
  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (err) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (err) { /* full, nothing to do */ }
  }
  function post(payload) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(() => ({})); });
  }
  function flushQueue() {
    const q = readQueue();
    if (!q.length || !navigator.onLine) return;
    const next = q[0];
    post(next).then(() => { writeQueue(readQueue().slice(1)); flushQueue(); }).catch(() => { /* try again later */ });
  }
  window.addEventListener('online', flushQueue);
  setTimeout(flushQueue, 2500);

  function blobToDataUrl(b) {
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  }

  sendBtn.addEventListener('click', async () => {
    const text = textEl.value.trim();
    if (!text && !blob) {
      noteEl.className = 'fb-note bad';
      noteEl.textContent = T.empty;
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = T.sending;
    const payload = { text: text, context: context() };
    if (blob) {
      payload.audio = await blobToDataUrl(blob);
      payload.audioType = blobType;
    }
    try {
      await post(payload);
      noteEl.className = 'fb-note ok';
      noteEl.textContent = T.sent;
      setTimeout(close, 900);
    } catch (err) {
      const q = readQueue();
      q.push(payload);
      writeQueue(q);
      noteEl.className = 'fb-note ok';
      noteEl.textContent = T.queued;
      setTimeout(close, 1400);
    }
    sendBtn.disabled = false;
    sendBtn.textContent = T.send;
  });

  /* ---------- open / close ---------- */
  function open() {
    ctxEl.textContent = JSON.stringify(context(), null, 1);
    noteEl.textContent = '';
    sheet.classList.add('show');
    if (typeof cfg.onOpen === 'function') { try { cfg.onOpen(); } catch (err) { /* game paused itself, or not */ } }
  }
  function close() {
    stopRec();
    sheet.classList.remove('show');
    textEl.value = '';
    blob = null; playEl.hidden = true; dropBtn.hidden = true; timeEl.textContent = '';
    recBtn.textContent = '🎤 ' + T.rec;
    if (typeof cfg.onClose === 'function') { try { cfg.onClose(); } catch (err) { /* fine */ } }
  }
  nav.querySelector('.sn-fb').addEventListener('click', open);
  $('.fb-cancel').addEventListener('click', close);
  sheet.addEventListener('pointerdown', e => { if (e.target === sheet) close(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('show')) close(); });

  window.sproutUI = { open: open, close: close, context: context };
})();
