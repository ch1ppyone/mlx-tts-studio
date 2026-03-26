import { S } from './state.js';
import { $ } from './dom.js';
import { t } from './i18n.js';
import { loadWaveform, startWaveAnim, stopWaveAnim, drawWave, fmtTime } from './waveform.js';
import { addToHistory, getHistoryScope } from './history.js';
import { getActiveModel, getActiveVoice, getParamValue } from './engine-ui.js';
import { clearLogs, setLogs, showTerminal } from './terminal.js';
import { saveDraft } from './settings.js';

let abortCtrl = null;

export function cancelGenerate() {
  fetch('/api/cancel', { method: 'POST' }).catch(() => {});
}

export function doGenerate() {
  const eng = S.CFG.engines[S.currentEngine];
  if (!eng) return;
  const cap = eng.capabilities || {};
  const textEl = $('#text');
  const text = textEl ? textEl.value.trim() : '';
  if (!text) return;

  saveDraft(text);

  const body = {
    engine: S.currentEngine,
    model: getActiveModel(),
    text: text,
    voice: getActiveVoice(),
  };

  const langEl = $('#sel-lang');
  if (langEl) body.lang_code = langEl.value;
  if (S.currentEngine === 'kokoro' && body.voice) {
    const voices = (eng.voices || []);
    const v = voices.find(x => x.id === body.voice);
    if (v && v.lang) body.lang_code = v.lang;
  }

  for (const pid of (eng.params || [])) {
    const v = getParamValue(pid);
    if (v !== null) body[pid] = v;
  }

  if (cap.instruct) {
    const emotionEl = $('#emotion');
    const emotion = emotionEl ? emotionEl.value.trim() : '';
    const hasTypes = cap.type_cards && cap.type_cards.length > 0;
    const activeType = hasTypes ? cap.type_cards.find(tc => tc.id === S.currentType) : null;
    if (activeType && activeType.shows.includes('voice_design')) {
      const vdEl = $('#voice-desc');
      if (vdEl && vdEl.value.trim()) body.instruct = vdEl.value.trim();
    } else {
      const instrEl = document.getElementById('instruct');
      let instruct = instrEl ? instrEl.value.trim() : '';
      if (emotion) instruct = instruct ? emotion + '. ' + instruct : emotion;
      if (instruct) body.instruct = instruct;
    }
  }

  if (S.refId) {
    body.ref_id = S.refId;
  }
  const refTextEl = $('#ref-text');
  if (refTextEl && refTextEl.value.trim()) body.ref_text = refTextEl.value.trim();

  const scopeKey = getHistoryScope(body.engine, body.model);
  const historySettings = buildHistorySettings(body, eng);

  S.busy = true;
  updateUI(true);

  abortCtrl = new AbortController();
  const startTime = Date.now();
  clearLogs();
  showTerminal(false);

  fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortCtrl.signal,
  }).then(resp => {
    if (!resp.ok) return resp.json().then(e => { throw new Error(e.detail || 'Generation failed'); });
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    function pump() {
      return reader.read().then(({ done, value }) => {
        if (done) return;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) handleSSE(line, startTime, text.length, scopeKey, historySettings);
        return pump();
      });
    }
    return pump();
  }).catch(err => {
    if (err.name !== 'AbortError') showError(err.message);
  }).finally(() => {
    S.busy = false;
    updateUI(false);
    abortCtrl = null;
  });
}

function handleSSE(line, startTime, textLen, scopeKey, historySettings) {
  if (!line.startsWith('data: ')) return;
  let ev;
  try { ev = JSON.parse(line.slice(6)); } catch (_) { return; }

  const status = $('#status');
  const msg = $('#status-msg');
  const pw = $('#progress-wrap');
  const pf = $('#progress-fill');
  const pd = $('#progress-detail');

  if (ev.s === 'downloading' || ev.s === 'loading') {
    if (status) status.hidden = false;
    if (msg) msg.textContent = t('generating');
    if (ev.pct != null) {
      if (pw) pw.hidden = false;
      if (pf) pf.style.width = ev.pct + '%';
    }
    if (ev.detail && pd) pd.textContent = ev.detail;
    if (ev.s === 'downloading' && ev.logs && ev.logs.length) {
      showTerminal(true);
      setLogs(ev.logs);
    } else if (ev.s === 'loading') {
      showTerminal(false);
    }
  } else if (ev.s === 'generating') {
    if (status) status.hidden = false;
    if (msg) msg.textContent = t('generating');
    if (pw) pw.hidden = false;
    if (pf) pf.style.width = '100%';
    if (pd) pd.textContent = '';
  } else if (ev.s === 'done') {
    showTerminal(false);
    if (status) status.hidden = true;
    if (pw) pw.hidden = true;
    if (pf) pf.style.width = '0';
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const cps = (textLen / parseFloat(elapsed)).toFixed(1);
    showResult(scopeKey, ev.id, { ...ev.stats, total_elapsed: elapsed, chars_sec: cps }, historySettings);
  } else if (ev.s === 'error') {
    showTerminal(false);
    if (status) status.hidden = true;
    showError(ev.m || 'Unknown error');
  } else if (ev.s === 'cancelled') {
    showTerminal(false);
    if (status) status.hidden = true;
  }
}

function buildHistorySettings(body, eng) {
  const cap = eng.capabilities || {};
  const settings = {
    engine: body.engine,
    model: body.model,
    voice: body.voice || '',
    text: body.text || '',
    ts: Date.now(),
  };
  if (cap.type_cards && cap.type_cards.length > 0) settings.type = S.currentType;
  if (body.lang_code) settings.lang_code = body.lang_code;
  for (const pid of (eng.params || [])) {
    if (body[pid] !== undefined) settings[pid] = body[pid];
  }
  if (body.instruct) settings.instruct = body.instruct;
  const emotionEl = $('#emotion');
  if (emotionEl && emotionEl.value.trim()) settings.emotion = emotionEl.value.trim();
  return settings;
}

function stopActiveResultPlayback() {
  const audio = $('#audio-player');
  if (audio) audio.pause();
  stopWaveAnim();
}

function renderResult(audioId, stats) {
  const res = $('#result');
  if (!res) return;
  const url = `/api/audio/${audioId}`;

  let statsHtml = '';
  if (stats.total) statsHtml += `<span class="k">Total</span><span class="v">${stats.total}</span>`;
  if (stats.duration) statsHtml += `<span class="k">Duration</span><span class="v">${stats.duration}s</span>`;
  if (stats.rtf) statsHtml += `<span class="k">RTF</span><span class="v">${stats.rtf}</span>`;
  if (stats.mem) statsHtml += `<span class="k">Memory</span><span class="v">${stats.mem}</span>`;
  if (stats.size) statsHtml += `<span class="k">Size</span><span class="v">${stats.size}</span>`;
  if (stats.chars_sec) statsHtml += `<span class="k">${t('chars_sec')}</span><span class="v">${stats.chars_sec}</span>`;

  stopActiveResultPlayback();
  res.innerHTML = `<div class="wplayer"><button class="wp-play" id="wp-play">&#9654;</button><div class="wp-wave-wrap" id="wp-wave-wrap"><canvas class="wp-wave" id="wave-canvas"></canvas></div><span class="wp-time" id="wp-time">0:00 / 0:00</span></div><audio id="audio-player" src="${url}" hidden></audio><div class="stats-grid">${statsHtml}</div><a class="dl-btn" href="${url}" download="tts_${audioId.substring(0, 8)}.wav" data-t="download">${t('download')}</a>`;
  res.hidden = false;

  const audio = $('#audio-player');
  const playBtn = $('#wp-play');
  const timeEl = $('#wp-time');

  if (playBtn && audio) {
    playBtn.onclick = () => {
      if (audio.paused) {
        audio.play();
        playBtn.textContent = '\u23F8';
        startWaveAnim(audio);
      } else {
        audio.pause();
        playBtn.textContent = '\u25B6';
        stopWaveAnim();
      }
    };
    audio.ontimeupdate = () => {
      if (timeEl && audio.duration) {
        timeEl.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration);
      }
    };
    audio.onended = () => {
      playBtn.textContent = '\u25B6';
      stopWaveAnim();
      drawWave(1);
    };
  }

  const waveWrap = $('#wp-wave-wrap');
  if (waveWrap && audio) {
    waveWrap.onclick = (e) => {
      const rect = waveWrap.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (audio.duration) {
        audio.currentTime = pct * audio.duration;
        drawWave(pct);
      }
    };
  }

  loadWaveform(url);
}

function showResult(scopeKey, audioId, stats, historySettings) {
  S.resultByScope[scopeKey] = { audioId, stats };
  addToHistory(audioId, stats, historySettings);
  refreshActiveResult();
}

export function refreshActiveResult() {
  const res = $('#result');
  if (!res) return;
  const scopeKey = getHistoryScope(S.currentEngine, getActiveModel());
  const active = S.resultByScope[scopeKey];
  if (!active) {
    stopActiveResultPlayback();
    res.hidden = true;
    res.innerHTML = '';
    return;
  }
  renderResult(active.audioId, active.stats || {});
}

export function showError(msg) {
  const errBox = $('#error');
  if (errBox) {
    errBox.textContent = t('error') + ': ' + msg;
    errBox.hidden = false;
    setTimeout(() => { errBox.hidden = true; }, 8000);
  }
  const status = $('#status');
  if (status) status.hidden = true;
}

function updateUI(busy) {
  const genBtn = $('#generate-btn');
  if (genBtn) {
    genBtn.disabled = busy;
    if (busy) genBtn.classList.add('busy'); else genBtn.classList.remove('busy');
  }
  if (busy) {
    stopActiveResultPlayback();
    const errBox = $('#error');
    if (errBox) errBox.hidden = true;
    const res = $('#result');
    if (res) res.hidden = true;
  }
}

export function buildCLI() {
  const eng = S.CFG.engines[S.currentEngine];
  if (!eng) return '';
  const model = getActiveModel();
  const voice = getActiveVoice();
  const text = ($('#text') || {}).value || 'Hello world';

  let cmd = `mlx_audio.tts --model ${model}`;
  if (voice) cmd += ` --voice ${voice}`;
  cmd += ` --text "${text.replace(/"/g, '\\"')}"`;

  for (const pid of (eng.params || [])) {
    const v = getParamValue(pid);
    const pd = S.CFG.params[pid];
    if (v !== null && pd && v !== pd.default) cmd += ` --${pid} ${v}`;
  }
  return cmd;
}
