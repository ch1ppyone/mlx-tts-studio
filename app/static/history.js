import { S } from './state.js';
import { $, esc } from './dom.js';
import { t } from './i18n.js';
import { switchEngine, setType, getEngineColor } from './engine-ui.js';
import { saveDraft } from './settings.js';

const HISTORY_KEY = 'tts-history';
const MAX_HISTORY = 50;

let audioAvailCache = {};

export function getHistoryScope(engineId, modelId) {
  return `${engineId || ''}::${modelId || ''}`;
}

function getCurrentScope() {
  const modelId = ($('#sel-model') || {}).value || '';
  return getHistoryScope(S.currentEngine, modelId);
}

function getScopedHistory() {
  const scope = getCurrentScope();
  return S.genHistory.filter(h => {
    const s = h.settings || {};
    return getHistoryScope(s.engine, s.model) === scope;
  });
}

export function loadHistory() {
  try {
    S.genHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (_) {
    S.genHistory = [];
  }
  audioAvailCache = {};
}

export function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(S.genHistory.slice(0, MAX_HISTORY)));
  } catch (_) {}
}

function collectSettings() {
  const eng = S.CFG.engines[S.currentEngine];
  const cap = eng.capabilities || {};
  const s = {
    engine: S.currentEngine,
    model: ($('#sel-model') || {}).value || '',
    voice: ($('#sel-voice') || {}).value || '',
    text: ($('#text') || {}).value || '',
    ts: Date.now(),
  };
  if (cap.type_cards && cap.type_cards.length > 0) s.type = S.currentType;
  const langEl = $('#sel-lang');
  if (langEl) s.lang_code = langEl.value;
  for (const pid of (eng.params || [])) {
    const el = document.getElementById('param-' + pid);
    if (el) s[pid] = parseFloat(el.value);
  }
  const instrEl = document.getElementById('instruct');
  if (instrEl && instrEl.value.trim()) s.instruct = instrEl.value.trim();
  const emotionEl = $('#emotion');
  if (emotionEl && emotionEl.value.trim()) s.emotion = emotionEl.value.trim();
  return s;
}

export function addToHistory(audioId, stats, settingsOverride = null) {
  const s = settingsOverride || collectSettings();
  S.genHistory.unshift({
    id: audioId,
    ts: Date.now(),
    settings: s,
    stats: stats || {},
  });
  if (S.genHistory.length > MAX_HISTORY) S.genHistory.length = MAX_HISTORY;
  saveHistory();
  renderHistory();
}

export async function renderHistory() {
  const wrap = $('#history-list');
  if (!wrap) return;
  const scopedHistory = getScopedHistory();
  if (!scopedHistory.length) {
    wrap.innerHTML = `<div class="hist-empty" data-t="hist_empty">${t('hist_empty')}</div>`;
    return;
  }

  const checks = scopedHistory.map(h => checkAudio(h.id));
  const avails = await Promise.all(checks);

  let html = '';
  for (let i = 0; i < scopedHistory.length; i++) {
    const h = scopedHistory[i];
    const s = h.settings || {};
    const engCfg = S.CFG.engines[s.engine];
    const engLabel = engCfg ? engCfg.label : s.engine;
    const color = getEngineColor(s.engine);
    const date = new Date(h.ts).toLocaleString();
    const textSnip = esc((s.text || '').substring(0, 100));
    const audioAvail = avails[i];

    html += `<div class="hist-item" style="border-left:3px solid ${color}">`;
    html += `<div class="hist-meta">`;
    html += `<span class="hist-badge" style="background:${color}">${esc(engLabel)}</span>`;
    if (s.voice) html += `<span class="hist-voice">${esc(s.voice)}</span>`;
    html += `</div>`;
    html += `<div class="hist-text">${textSnip}</div>`;

    if (audioAvail) {
      html += `<audio controls preload="none" src="/api/audio/${h.id}"></audio>`;
    } else {
      html += `<div class="hist-expired" data-t="hist_expired">${t('hist_expired')}</div>`;
    }

    html += `<div class="hist-actions"><span class="hist-time">${date}</span>`;
    html += `<button class="hist-btn" onclick="window._repeatHist(${i})">${t('repeat')}</button>`;
    html += `<button class="hist-btn" onclick="window._refillHist(${i})">${t('hist_refill')}</button>`;
    html += `<button class="hist-btn del" onclick="window._deleteHist(${i})">${t('delete')}</button>`;
    html += `</div></div>`;
  }

  const clearBtn = scopedHistory.length > 0
    ? `<button class="hist-clear-btn" onclick="window._clearHist()">${t('hist_clear')}</button>`
    : '';
  wrap.innerHTML = html + clearBtn;
}

async function checkAudio(id) {
  if (!id) return false;
  if (id in audioAvailCache) return audioAvailCache[id];
  try {
    const resp = await fetch(`/api/audio/${id}`, { method: 'HEAD' });
    audioAvailCache[id] = resp.ok;
    return resp.ok;
  } catch (_) {
    audioAvailCache[id] = false;
    return false;
  }
}

export function repeatHist(i) {
  const h = getScopedHistory()[i];
  if (!h) return;
  const s = h.settings || {};
  if (s.engine && S.CFG.engines[s.engine]) {
    switchEngine(s.engine);
    if (s.type) {
      const cap = S.CFG.engines[s.engine].capabilities || {};
      if (cap.type_cards) setType(s.type);
    }
  }
  const modelSel = $('#sel-model');
  if (modelSel && s.model) modelSel.value = s.model;
  const voiceSel = $('#sel-voice');
  if (voiceSel && s.voice) voiceSel.value = s.voice;
  const textEl = $('#text');
  if (textEl && s.text) {
    textEl.value = s.text;
    const cc = $('#char-count');
    if (cc) cc.textContent = s.text.length;
    saveDraft(s.text);
  }
  const langSel = $('#sel-lang');
  if (langSel && s.lang_code) langSel.value = s.lang_code;
  const eng = S.CFG.engines[s.engine];
  if (eng) {
    for (const pid of (eng.params || [])) {
      const el = document.getElementById('param-' + pid);
      if (el && s[pid] !== undefined) {
        el.value = s[pid];
        const valSpan = el.nextElementSibling;
        if (valSpan && valSpan.classList.contains('range-val')) valSpan.textContent = s[pid];
      }
    }
  }
  const instrEl = document.getElementById('instruct');
  if (instrEl) instrEl.value = s.instruct || '';
  const emotionEl = $('#emotion');
  if (emotionEl) emotionEl.value = s.emotion || '';
  window.dispatchEvent(new CustomEvent('tts:model-scope-change'));
}

export function refillHist(i) {
  const h = getScopedHistory()[i];
  if (!h) return;
  const s = h.settings || {};
  const textEl = $('#text');
  if (textEl && s.text) {
    textEl.value = s.text;
    const cc = $('#char-count');
    if (cc) cc.textContent = s.text.length;
    saveDraft(s.text);
  }
}

export function deleteHist(i) {
  const h = getScopedHistory()[i];
  if (!h) return;
  const actualIdx = S.genHistory.findIndex(item => item.id === h.id && item.ts === h.ts);
  if (actualIdx < 0) return;
  S.genHistory.splice(actualIdx, 1);
  if (h.id) delete audioAvailCache[h.id];
  saveHistory();
  renderHistory();
}

export function clearAllHist() {
  if (!confirm(t('hist_clear_confirm'))) return;
  const scoped = getScopedHistory();
  const scopedIds = new Set(scoped.map(h => `${h.id}:${h.ts}`));
  S.genHistory = S.genHistory.filter(h => !scopedIds.has(`${h.id}:${h.ts}`));
  for (const h of scoped) {
    if (h.id) delete audioAvailCache[h.id];
  }
  saveHistory();
  renderHistory();
}
