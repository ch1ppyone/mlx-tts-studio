import { S } from './state.js';
import { $ } from './dom.js';
import { t } from './i18n.js';
import { getActiveModel, getActiveVoice } from './engine-ui.js';
import { showError } from './generate.js';

let previewAbort = null;

export function doPreview() {
  const eng = S.CFG.engines[S.currentEngine];
  if (!eng) return;
  const cap = eng.capabilities || {};
  if (!cap.preview) return;

  if (S.previewAudio) {
    S.previewAudio.pause();
    S.previewAudio = null;
  }

  if (previewAbort) {
    previewAbort.abort();
    previewAbort = null;
  }

  const body = { engine: S.currentEngine, model: getActiveModel() };
  const voice = getActiveVoice();
  if (voice) body.voice = voice;
  const langEl = $('#sel-lang');
  if (langEl) body.lang_code = langEl.value;

  const btn = $('#preview-btn');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }

  previewAbort = new AbortController();

  fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: previewAbort.signal,
  }).then(resp => {
    if (!resp.ok) throw new Error('Preview failed');
    return resp.blob();
  }).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    S.previewAudio = a;
    a.play();
    a.onended = () => {
      URL.revokeObjectURL(url);
      S.previewAudio = null;
    };
  }).catch(err => {
    if (err.name !== 'AbortError') showError(err.message);
  }).finally(() => {
    previewAbort = null;
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  });
}

export function stopPreview() {
  if (S.previewAudio) {
    S.previewAudio.pause();
    S.previewAudio = null;
  }
  if (previewAbort) {
    previewAbort.abort();
    previewAbort = null;
  }
}
