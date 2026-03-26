import { S } from './state.js';
import { $, $$, esc } from './dom.js';
import { t, applyLang } from './i18n.js';
import { buildEngineTabs, switchEngine, initVoiceFilter, updateModelId, setType, onVoiceChange, onFavToggle } from './engine-ui.js';
import { doGenerate, cancelGenerate, buildCLI, showError, refreshActiveResult } from './generate.js';
import { doPreview, stopPreview } from './preview.js';
import { loadHistory, renderHistory, repeatHist, refillHist, deleteHist, clearAllHist } from './history.js';
import { sizeCanvas, computePeaks, drawWave, getWavePeaks } from './waveform.js';
import { updateDiaPreview, initDiaKeyboard, updateDiaSpeakerConfig } from './dia.js';
import { initHelp } from './help.js';
import { initTerminal } from './terminal.js';
import { clearDraftStorage, saveAdvancedOpen, saveDraft, savePreprocessOptions } from './settings.js';
import { fetchSystemStatus, fetchCacheStatus, updateCacheBadge, initSystemInfo, checkFirstRun, showOnboarding, hideOnboarding } from './status.js';

window._repeatHist = repeatHist;
window._deleteHist = deleteHist;
window._refillHist = refillHist;
window._clearHist = clearAllHist;

function applyTheme(theme) {
  S.theme = theme;
  try { localStorage.setItem('tts-theme', theme); } catch (_) {}
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '\u2600' : '\u263E';

  if (S.CFG) {
    const eng = S.CFG.engines[S.currentEngine];
    if (eng) {
      const color = theme === 'dark' ? (eng.accent_color_dark || eng.accent_color) : eng.accent_color;
      document.documentElement.style.setProperty('--engine-color', color || 'var(--accent)');
    }
  }
}

function initTheme() {
  const btn = $('#theme-btn');
  if (btn) btn.onclick = () => applyTheme(S.theme === 'dark' ? 'light' : 'dark');
  applyTheme(S.theme);
}

function initLang() {
  const btns = document.querySelectorAll('.lang-btn');
  btns.forEach(btn => {
    btn.onclick = () => {
      btns.forEach(b => b.classList.toggle('active', b === btn));
      applyLang(btn.dataset.lang);
      if (S.CFG) {
        buildEngineTabs();
        switchEngine(S.currentEngine);
        renderHistory();
        updateCacheBadge();
        setPreprocessStatus(S.preprocessStatus || 'idle');
        renderRefReport(S.refMeta);
      }
    };
    btn.classList.toggle('active', btn.dataset.lang === S.lang);
  });
}

let _recorder = null;
let _recChunks = [];
let _recTimer = null;
let _recStart = 0;
let _libPreviewAudio = null;
let _libPreviewRefId = null;
let _libPreviewBtn = null;

function pickRecorderMimeType() {
  const candidates = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  for (const type of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

function initRefAudio() {
  const dropzone = $('#ref-dropzone');
  const fileInput = $('#ref-file');
  if (!dropzone || !fileInput) return;

  dropzone.onclick = () => fileInput.click();
  dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('over'); };
  dropzone.ondragleave = () => dropzone.classList.remove('over');
  dropzone.ondrop = e => {
    e.preventDefault();
    dropzone.classList.remove('over');
    if (e.dataTransfer.files.length) uploadRef(e.dataTransfer.files[0]);
  };
  fileInput.onchange = () => {
    if (fileInput.files.length) uploadRef(fileInput.files[0]);
  };

  const clearBtn = $('#ref-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      S.refId = null;
      S.refFilename = null;
      S.refMeta = null;
      S.refWarnings = [];
      S.refRecommendations = [];
      S.refPreviewUrl = null;
      S.preprocessStatus = 'idle';
      dropzone.textContent = t('ref_drop');
      clearBtn.hidden = true;
      const report = $('#ref-report');
      if (report) {
        report.hidden = true;
        report.innerHTML = '';
      }
      const previewAudio = $('#ref-preview-audio');
      if (previewAudio) {
        previewAudio.hidden = true;
        previewAudio.src = '';
      }
      setPreprocessStatus('idle');
      if (S.currentEngine === 'dia') updateDiaSpeakerConfig(true);
    };
  }

  const recordBtn = $('#ref-record-btn');
  const stopBtn = $('#ref-stop-btn');
  const libraryBtn = $('#ref-library-btn');
  const libraryModal = $('#reflib-modal');
  const libraryClose = $('#reflib-close');
  if (recordBtn) recordBtn.onclick = startRecording;
  if (stopBtn) stopBtn.onclick = stopRecording;
  if (libraryBtn) libraryBtn.onclick = openRefLibrary;
  if (libraryClose) libraryClose.onclick = () => {
    if (libraryModal) libraryModal.hidden = true;
    stopLibraryPreview();
  };
  if (libraryModal) {
    libraryModal.onclick = e => {
      if (e.target === libraryModal) {
        libraryModal.hidden = true;
        stopLibraryPreview();
      }
    };
  }

  applyPreprocessOptionsToUI(S.preprocessOptions);
  syncAutoMode();
  setPreprocessStatus('idle');

  const preAuto = $('#pre-auto');
  const preTrim = $('#pre-trim');
  const preNormalize = $('#pre-normalize');
  const preDenoise = $('#pre-denoise');
  const preHighPass = $('#pre-highpass');
  const preprocessBtn = $('#preprocess-btn');

  const onOptsChange = () => {
    const opts = getPreprocessOptionsFromUI();
    savePreprocessOptions(opts);
    syncAutoMode();
  };

  for (const el of [preAuto, preTrim, preNormalize, preDenoise, preHighPass]) {
    if (el) el.addEventListener('change', onOptsChange);
  }

  if (preprocessBtn) {
    preprocessBtn.onclick = async () => {
      if (!S.refId) return;
      await reprocessReference();
    };
  }

  const refTextEl = $('#ref-text');
  if (refTextEl) {
    refTextEl.addEventListener('input', () => {
      if (S.currentEngine === 'dia') updateDiaSpeakerConfig(true);
    });
  }
}

function stopLibraryPreview() {
  if (_libPreviewAudio) {
    _libPreviewAudio.pause();
    _libPreviewAudio.currentTime = 0;
  }
  if (_libPreviewBtn) _libPreviewBtn.textContent = t('ref_library_listen');
  _libPreviewRefId = null;
  _libPreviewBtn = null;
}

async function toggleLibraryPreview(refId, btn) {
  try {
    if (!_libPreviewAudio) {
      _libPreviewAudio = new Audio();
      _libPreviewAudio.onended = () => {
        if (_libPreviewBtn) _libPreviewBtn.textContent = t('ref_library_listen');
        _libPreviewRefId = null;
        _libPreviewBtn = null;
      };
    }

    if (_libPreviewRefId === refId && !_libPreviewAudio.paused) {
      stopLibraryPreview();
      return;
    }

    if (_libPreviewBtn && _libPreviewBtn !== btn) _libPreviewBtn.textContent = t('ref_library_listen');
    _libPreviewRefId = refId;
    _libPreviewBtn = btn;
    _libPreviewBtn.textContent = t('ref_library_stop');
    _libPreviewAudio.src = `/api/ref/${encodeURIComponent(refId)}/audio?variant=processed`;
    await _libPreviewAudio.play();
  } catch (err) {
    stopLibraryPreview();
    showError(err.message || 'Failed to play reference');
  }
}

function fmtRefDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch (_) {
    return '';
  }
}

async function selectReferenceFromLibrary(refId, filename) {
  try {
    const resp = await fetch(`/api/ref/${refId}/meta`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Failed to load reference');
    S.refId = refId;
    S.refFilename = filename || refId;
    const dropzone = $('#ref-dropzone');
    if (dropzone) dropzone.textContent = S.refFilename;
    const clearBtn = $('#ref-clear-btn');
    if (clearBtn) clearBtn.hidden = false;
    applyRefPayload(data.ref || null);
    if (S.currentEngine === 'dia') updateDiaSpeakerConfig(true);
    setPreprocessStatus('done');
    const modal = $('#reflib-modal');
    if (modal) modal.hidden = true;
  } catch (err) {
    showError(err.message || 'Failed to select reference');
  }
}

async function renameReferenceFromLibrary(refId, currentName) {
  const name = window.prompt(t('ref_library_rename_prompt'), currentName || '');
  if (name == null) return;
  const clean = name.trim();
  if (!clean) return;
  try {
    const resp = await fetch(`/api/ref/${refId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Failed to rename reference');
    if (S.refId === refId) {
      S.refFilename = data.ref?.display_name || clean;
      const dropzone = $('#ref-dropzone');
      if (dropzone) dropzone.textContent = S.refFilename;
    }
    await openRefLibrary();
  } catch (err) {
    showError(err.message || 'Failed to rename reference');
  }
}

async function deleteReferenceFromLibrary(refId) {
  if (!window.confirm(t('ref_library_delete_confirm'))) return;
  try {
    const resp = await fetch(`/api/ref/${refId}`, { method: 'DELETE' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete reference');
    }
    if (S.refId === refId) {
      S.refId = null;
      S.refFilename = null;
      S.refMeta = null;
      S.refWarnings = [];
      S.refRecommendations = [];
      S.refPreviewUrl = null;
      const dropzone = $('#ref-dropzone');
      if (dropzone) dropzone.textContent = t('ref_drop');
      const clearBtn = $('#ref-clear-btn');
      if (clearBtn) clearBtn.hidden = true;
      renderRefReport(null);
      setPreprocessStatus('idle');
    }
    if (S.currentEngine === 'dia') updateDiaSpeakerConfig(true);
    await openRefLibrary();
  } catch (err) {
    showError(err.message || 'Failed to delete reference');
  }
}

async function openRefLibrary() {
  const modal = $('#reflib-modal');
  const body = $('#reflib-body');
  if (!modal || !body) return;
  modal.hidden = false;
  body.innerHTML = `<div class="reflib-empty">${esc(t('generating'))}</div>`;
  try {
    const resp = await fetch('/api/ref/list');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Failed to load references');
    const items = data.items || [];
    if (!items.length) {
      body.innerHTML = `<div class="reflib-empty">${esc(t('ref_library_empty'))}</div>`;
      return;
    }
    const html = items.map(item => {
      const isActive = S.refId === item.ref_id;
      const name = item.display_name || item.filename || item.ref_id;
      return `<div class="reflib-item${isActive ? ' active' : ''}" data-ref-id="${esc(item.ref_id)}" data-filename="${esc(name)}">
        <div class="reflib-main">
          <div class="reflib-name">${esc(name)}</div>
          <div class="reflib-meta">${esc(`${item.ref_id} · ${fmtRefDate(item.created_at)} · ${item.preprocess_status || 'none'}`)}</div>
        </div>
        <div class="reflib-actions">
          <button class="reflib-btn reflib-listen">${esc(t('ref_library_listen'))}</button>
          <button class="reflib-btn reflib-use">${esc(isActive ? t('ref_library_active') : t('ref_library_use'))}</button>
          <button class="reflib-btn reflib-rename">${esc(t('ref_library_rename'))}</button>
          <button class="reflib-btn danger reflib-delete">${esc(t('ref_library_delete'))}</button>
        </div>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="reflib-list">${html}</div>`;
    body.querySelectorAll('.reflib-item').forEach(row => {
      row.querySelector('.reflib-use').onclick = () => {
        selectReferenceFromLibrary(row.dataset.refId, row.dataset.filename);
      };
      row.querySelector('.reflib-listen').onclick = e => {
        toggleLibraryPreview(row.dataset.refId, e.currentTarget);
      };
      row.querySelector('.reflib-rename').onclick = () => {
        const currentName = row.querySelector('.reflib-name')?.textContent || row.dataset.filename;
        renameReferenceFromLibrary(row.dataset.refId, currentName);
      };
      row.querySelector('.reflib-delete').onclick = () => {
        deleteReferenceFromLibrary(row.dataset.refId);
      };
    });
  } catch (err) {
    body.innerHTML = `<div class="reflib-empty">${esc(err.message || 'Failed to load references')}</div>`;
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _recChunks = [];
    const mimeType = pickRecorderMimeType();
    _recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
      : new MediaRecorder(stream);

    _recorder.ondataavailable = e => {
      if (e.data.size > 0) _recChunks.push(e.data);
    };

    _recorder.onstop = () => {
      stream.getTracks().forEach(tr => tr.stop());
      clearInterval(_recTimer);
      showRecUI(false);

      if (!_recChunks.length) return;
      const blobType = _recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(_recChunks, { type: blobType });
      if (!blob.size || blob.size < 2048) {
        showError(t('rec_failed'));
        return;
      }
      const ext = blob.type.includes('mp4')
        ? '.m4a'
        : blob.type.includes('wav')
          ? '.wav'
          : '.webm';
      const file = new File([blob], 'recording' + ext, { type: blob.type });
      uploadRef(file);
    };

    _recorder.start(250);
    _recStart = Date.now();
    _recTimer = setInterval(updateRecTimer, 500);
    showRecUI(true);
  } catch (err) {
    showError(t('rec_denied'));
  }
}

function stopRecording() {
  if (_recorder && _recorder.state === 'recording') {
    try { _recorder.requestData(); } catch (_) {}
    _recorder.stop();
  }
}

function updateRecTimer() {
  const elapsed = Math.floor((Date.now() - _recStart) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = (elapsed % 60).toString().padStart(2, '0');
  const el = $('#rec-timer');
  if (el) el.textContent = `${m}:${s}`;
}

function showRecUI(recording) {
  const recordBtn = $('#ref-record-btn');
  const recordingEl = $('#ref-recording');
  if (recordBtn) recordBtn.hidden = recording;
  if (recordingEl) recordingEl.hidden = !recording;
}

function getPreprocessOptionsFromUI() {
  return {
    auto: !!($('#pre-auto') && $('#pre-auto').checked),
    trim_silence: !!($('#pre-trim') && $('#pre-trim').checked),
    normalize: !!($('#pre-normalize') && $('#pre-normalize').checked),
    light_denoise: !!($('#pre-denoise') && $('#pre-denoise').checked),
    high_pass: !!($('#pre-highpass') && $('#pre-highpass').checked),
  };
}

function applyPreprocessOptionsToUI(opts) {
  const v = { ...S.preprocessOptions, ...(opts || {}) };
  const preAuto = $('#pre-auto');
  const preTrim = $('#pre-trim');
  const preNormalize = $('#pre-normalize');
  const preDenoise = $('#pre-denoise');
  const preHighPass = $('#pre-highpass');
  if (preAuto) preAuto.checked = !!v.auto;
  if (preTrim) preTrim.checked = !!v.trim_silence;
  if (preNormalize) preNormalize.checked = !!v.normalize;
  if (preDenoise) preDenoise.checked = !!v.light_denoise;
  if (preHighPass) preHighPass.checked = !!v.high_pass;
}

function syncAutoMode() {
  const preAuto = $('#pre-auto');
  const preTrim = $('#pre-trim');
  const preNormalize = $('#pre-normalize');
  const preDenoise = $('#pre-denoise');
  const preHighPass = $('#pre-highpass');
  const isAuto = !!(preAuto && preAuto.checked);
  if (isAuto) {
    if (preTrim) preTrim.checked = true;
    if (preNormalize) preNormalize.checked = true;
    if (preDenoise) preDenoise.checked = false;
    if (preHighPass) preHighPass.checked = false;
  }
  for (const el of [preTrim, preNormalize, preDenoise, preHighPass]) {
    if (el) el.disabled = isAuto;
  }
  savePreprocessOptions(getPreprocessOptionsFromUI());
}

function setPreprocessStatus(state) {
  S.preprocessStatus = state;
  const el = $('#preprocess-status');
  const btn = $('#preprocess-btn');
  if (!el) return;
  const key = state === 'uploading'
    ? 'pre_status_uploading'
    : state === 'processing'
      ? 'pre_status_processing'
      : state === 'done'
        ? 'pre_status_done'
        : state === 'error'
          ? 'pre_status_error'
          : 'pre_status_idle';
  el.textContent = t(key);
  if (btn) btn.disabled = state === 'uploading' || state === 'processing';
}

function renderRefReport(ref) {
  const reportEl = $('#ref-report');
  const previewAudio = $('#ref-preview-audio');
  if (!reportEl) return;
  if (!ref || !ref.report) {
    reportEl.hidden = true;
    reportEl.innerHTML = '';
    if (previewAudio) {
      previewAudio.hidden = true;
      previewAudio.src = '';
    }
    return;
  }

  const report = ref.report;
  const original = report.original || {};
  const processed = report.processed || {};
  const applied = report.applied || {};
  const warns = ref.warnings || [];
  const tips = ref.recommendations || [];
  const mkBadge = (label, enabled) =>
    `<span class="r-badge${enabled ? ' on' : ''}">${esc(label)}</span>`;
  const stat = (k, v) =>
    `<div class="r-stat"><span class="k">${esc(k)}</span><span class="v">${esc(String(v))}</span></div>`;
  reportEl.hidden = false;
  reportEl.innerHTML = `<div class="r-title">${esc(t('pre_report'))}</div>
    <div class="r-top">
      ${stat('Original', `${original.duration_sec || 0}s · ${original.sample_rate || 0} Hz · ${original.channels || 0}ch`)}
      ${stat('Processed', `${processed.duration_sec || 0}s · ${processed.sample_rate || 0} Hz · ${processed.channels || 0}ch`)}
    </div>
    <div class="r-badges">
      ${mkBadge('Mono', !!applied.force_mono)}
      ${mkBadge('Resample', !!applied.resample)}
      ${mkBadge('Trim', !!applied.trim_silence)}
      ${mkBadge('Normalize', !!applied.normalize)}
      ${mkBadge('Denoise', !!applied.light_denoise)}
      ${mkBadge('High-pass', !!applied.high_pass)}
      ${mkBadge('Peak protect', !!applied.peak_protect)}
    </div>
    <div class="r-lines">
      ${warns.length ? warns.map(w => `<div class="r-warn">• ${esc(w)}</div>`).join('') : ''}
      ${tips.length ? tips.map(w => `<div class="r-tip">• ${esc(w)}</div>`).join('') : ''}
    </div>`;

  if (previewAudio) {
    const previewUrl = (ref.preview_urls && ref.preview_urls.processed) || null;
    if (previewUrl) {
      previewAudio.hidden = false;
      previewAudio.src = previewUrl;
    } else {
      previewAudio.hidden = true;
      previewAudio.src = '';
    }
  }
}

function applyRefPayload(refData) {
  if (!refData) return;
  S.refMeta = refData;
  S.refWarnings = refData.warnings || [];
  S.refRecommendations = refData.recommendations || [];
  S.refPreviewUrl = refData.preview_urls ? refData.preview_urls.processed : null;
  applyPreprocessOptionsToUI(refData.preprocess_options || S.preprocessOptions);
  syncAutoMode();
  renderRefReport(refData);
}

async function reprocessReference() {
  if (!S.refId) return;
  setPreprocessStatus('processing');
  try {
    const opts = getPreprocessOptionsFromUI();
    savePreprocessOptions(opts);
    const resp = await fetch(`/api/ref/${S.refId}/preprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: opts }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Failed to preprocess');
    applyRefPayload(data.ref);
    setPreprocessStatus('done');
  } catch (err) {
    setPreprocessStatus('error');
    showError(err.message || 'Failed to preprocess');
  }
}

async function uploadRef(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('preprocess_options', JSON.stringify(getPreprocessOptionsFromUI()));
  const dropzone = $('#ref-dropzone');
  const clearBtn = $('#ref-clear-btn');
  if (dropzone) dropzone.textContent = file.name;
  setPreprocessStatus('uploading');
  try {
    const r = await fetch('/api/upload-ref', { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Failed to upload reference');
    S.refId = d.ref_id;
    S.refFilename = d.filename;
    if (clearBtn) clearBtn.hidden = false;
    applyRefPayload(d.ref || null);
    if (S.currentEngine === 'dia') updateDiaSpeakerConfig(true);
    setPreprocessStatus('done');
  } catch (_) {
    if (dropzone) dropzone.textContent = t('ref_drop');
    S.refId = null;
    S.refFilename = null;
    S.refMeta = null;
    setPreprocessStatus('error');
  }
}

function initCopyCLI() {
  const btn = $('#copy-cli-btn');
  if (!btn) return;
  btn.onclick = () => {
    const cmd = buildCLI();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(() => flashCopied(btn)).catch(() => fallbackCopy(cmd, btn));
    } else {
      fallbackCopy(cmd, btn);
    }
  };
}

function initShowCacheInFinder() {
  const btn = $('#show-cache-btn');
  if (!btn) return;
  btn.onclick = async () => {
    const modelSel = $('#sel-model');
    const modelId = modelSel ? modelSel.value : '';
    if (!modelId) return;
    try {
      const resp = await fetch('/api/cache-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to open Finder');
      }
    } catch (err) {
      showError(err.message || 'Failed to open Finder');
    }
  };
}

function fallbackCopy(text, btn) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); flashCopied(btn); } catch (_) {}
  document.body.removeChild(ta);
}

function flashCopied(btn) {
  const orig = btn.textContent;
  btn.textContent = t('copied');
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

function initTextInput() {
  const textEl = $('#text');
  const charCount = $('#char-count');
  if (!textEl) return;

  const initialText = S.lastTextByEngine[S.currentEngine] || S.lastText || '';
  if (initialText && !textEl.value) {
    textEl.value = initialText;
    if (charCount) charCount.textContent = initialText.length;
  }

  textEl.addEventListener('input', () => {
    if (charCount) charCount.textContent = textEl.value.length;
    updateDiaPreview();
    saveDraft(textEl.value);
  });
}

function initModelChange() {
  const sel = $('#sel-model');
  if (!sel) return;
  sel.addEventListener('change', () => {
    updateModelId();
    updateCacheBadge();
    const eng = S.CFG.engines[S.currentEngine];
    const cap = eng.capabilities || {};
    if (cap.type_cards && cap.type_cards.length > 0) {
      const model = sel.value.toLowerCase();
      for (const tc of cap.type_cards) {
        if (model.includes(tc.id.toLowerCase())) {
          setType(tc.id);
          break;
        }
      }
    }
    window.dispatchEvent(new CustomEvent('tts:model-scope-change'));
  });
}

function initVoiceChange() {
  const sel = $('#sel-voice');
  if (sel) sel.addEventListener('change', onVoiceChange);
  const favBtn = $('#fav-btn');
  if (favBtn) favBtn.onclick = onFavToggle;
}

function initAdvanced() {
  const details = $('details.advanced');
  if (!details) return;
  if (S.advancedOpen) details.open = true;
  details.addEventListener('toggle', () => {
    saveAdvancedOpen(details.open);
  });
}

function initKeyboard() {
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!S.busy) doGenerate();
    }
    if (e.key === 'Escape') {
      const helpModal = $('#help-modal');
      if (helpModal && !helpModal.hidden) { helpModal.hidden = true; return; }
      const sysModal = $('#system-modal');
      if (sysModal && !sysModal.hidden) { sysModal.hidden = true; return; }
      const onboard = $('#onboarding-overlay');
      if (onboard && !onboard.hidden) { hideOnboarding(); return; }
      if (S.busy) cancelGenerate();
    }
  });
}

function initOnboarding() {
  const dismissBtn = $('#onboarding-dismiss');
  if (dismissBtn) dismissBtn.onclick = hideOnboarding;

  const overlay = $('#onboarding-overlay');
  if (overlay) overlay.onclick = e => { if (e.target === overlay) hideOnboarding(); };
}

async function loadConfig() {
  try {
    const resp = await fetch('/api/config');
    S.CFG = await resp.json();
    return true;
  } catch (err) {
    return false;
  }
}

async function init() {
  const bootScreen = $('#boot-screen');
  const appRoot = $('#app-root');

  clearDraftStorage();

  const [configOk] = await Promise.all([
    loadConfig(),
    fetchSystemStatus(),
    fetchCacheStatus(),
  ]);

  if (!configOk) {
    if (bootScreen) {
      bootScreen.querySelector('.boot-text').textContent = t('boot_error');
      bootScreen.classList.add('boot-error');
    }
    return;
  }

  if (bootScreen) bootScreen.hidden = true;
  if (appRoot) appRoot.style.display = '';

  buildEngineTabs();
  initVoiceFilter();
  initTheme();
  initLang();
  initRefAudio();
  initCopyCLI();
  initShowCacheInFinder();
  initHelp();
  initSystemInfo();
  initTextInput();
  initModelChange();
  initVoiceChange();
  initAdvanced();
  initKeyboard();
  initTerminal();
  initDiaKeyboard();
  initOnboarding();
  loadHistory();

  window.addEventListener('tts:model-scope-change', () => {
    renderHistory();
    refreshActiveResult();
  });

  const genBtn = $('#generate-btn');
  if (genBtn) genBtn.onclick = () => { if (!S.busy) doGenerate(); };

  const cancelBtn = $('#cancel-btn');
  if (cancelBtn) cancelBtn.onclick = cancelGenerate;

  const previewBtn = $('#preview-btn');
  if (previewBtn) previewBtn.onclick = () => { stopPreview(); doPreview(); };

  applyLang(S.lang);
  switchEngine(S.currentEngine);
  renderHistory();
  updateCacheBadge();

  if (checkFirstRun()) {
    showOnboarding();
  }

  window.addEventListener('resize', () => {
    sizeCanvas();
    if (getWavePeaks().length) {
      computePeaks();
      drawWave(0);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
