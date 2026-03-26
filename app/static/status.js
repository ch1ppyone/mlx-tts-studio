import { S } from './state.js';
import { $, esc } from './dom.js';
import { t } from './i18n.js';

export async function fetchSystemStatus() {
  try {
    const resp = await fetch('/api/status');
    S.systemStatus = await resp.json();
    renderHardwareBadge();
  } catch (_) {
    S.systemStatus = null;
    renderHardwareBadge();
  }
}

function renderHardwareBadge() {
  const badge = $('#hw-badge');
  if (!badge) return;
  const sys = (S.systemStatus || {}).system || {};
  const cpu = (sys.cpu || '').trim();
  const ram = sys.ram_gb;
  if (!cpu && !ram) {
    badge.hidden = true;
    badge.textContent = '';
    return;
  }
  const parts = [];
  if (cpu) parts.push(cpu.replace(/^Apple\s+/i, ''));
  if (ram) parts.push(`${ram} GB RAM`);
  badge.textContent = parts.join(' • ');
  badge.hidden = false;
}

export async function fetchCacheStatus() {
  try {
    const resp = await fetch('/api/cache-status');
    S.cacheStatus = await resp.json();
  } catch (_) {
    S.cacheStatus = {};
  }
}

export function getModelState(modelId) {
  if (!S.cacheStatus) return 'unknown';
  return S.cacheStatus[modelId] || 'unknown';
}

export function modelStateLabel(state) {
  return t('cache_' + state) || state;
}

export function modelStateCls(state) {
  return 'cache-badge cache-' + state.replace('_', '-');
}

export function updateCacheBadge() {
  const badge = $('#model-cache-badge');
  const sel = $('#sel-model');
  const showCacheBtn = $('#show-cache-btn');
  if (!badge || !sel) return;
  const modelId = sel.value;
  if (!modelId || !S.cacheStatus) {
    badge.className = 'cache-badge';
    badge.textContent = '';
    if (showCacheBtn) showCacheBtn.hidden = true;
    return;
  }
  const state = getModelState(modelId);
  badge.className = modelStateCls(state);
  badge.textContent = modelStateLabel(state);
  if (showCacheBtn) showCacheBtn.hidden = !(state === 'cached' || state === 'loaded');
}

export function initSystemInfo() {
  const btn = $('#system-info-btn');
  const modal = $('#system-modal');
  const closeBtn = $('#system-close');
  if (!btn || !modal) return;

  btn.onclick = async () => {
    await Promise.all([fetchSystemStatus(), fetchCacheStatus()]);
    buildSystemInfoContent();
    modal.hidden = false;
  };

  if (closeBtn) closeBtn.onclick = () => { modal.hidden = true; };
  modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
}

function sysRow(label, value) {
  return `<div class="sys-label">${esc(label)}</div><div class="sys-value">${esc(value)}</div>`;
}

function buildSystemInfoContent() {
  const body = $('#system-body');
  if (!body) return;
  const st = S.systemStatus || {};

  let html = '<div class="sys-grid">';

  if (st.model_loaded) {
    html += sysRow(t('sys_loaded_model'), st.model_loaded.model);
    html += sysRow(t('sys_loaded_engine'), st.model_loaded.engine);
  } else {
    html += sysRow(t('sys_loaded_model'), t('sys_no_model'));
  }

  html += sysRow(t('sys_version'), st.version || '\u2014');
  html += sysRow(t('sys_cache_dir'), st.cache_dir || '\u2014');
  html += sysRow(t('sys_ref_dir'), st.ref_dir || '\u2014');
  html += sysRow(t('sys_app_url'), window.location.origin);
  html += sysRow(t('sys_audio_count'), String(st.audio_count ?? 0));
  html += sysRow(t('sys_preview_count'), String(st.preview_count ?? 0));

  const histCount = S.genHistory ? S.genHistory.length : 0;
  html += sysRow(t('sys_history_count'), String(histCount));
  html += '</div>';

  if (S.CFG && S.cacheStatus && Object.keys(S.cacheStatus).length) {
    html += `<h3 class="sys-section-title">${esc(t('sys_models_cache'))}</h3>`;
    html += '<div class="sys-cache-list">';
    for (const [eid, eng] of Object.entries(S.CFG.engines)) {
      html += `<div class="sys-cache-engine">${eng.icon || ''} ${esc(eng.label)}</div>`;
      for (const m of eng.models) {
        const state = S.cacheStatus[m.id] || 'unknown';
        html += `<div class="sys-cache-row"><span class="sys-cache-model">${esc(m.label)}</span><span class="${modelStateCls(state)}">${modelStateLabel(state)}</span></div>`;
      }
    }
    html += '</div>';
  }

  body.innerHTML = html;
}

export function checkFirstRun() {
  try {
    return !localStorage.getItem('tts-onboarded');
  } catch (_) {
    return false;
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem('tts-onboarded', '1');
  } catch (_) {}
}

export function showOnboarding() {
  const overlay = $('#onboarding-overlay');
  if (overlay) overlay.hidden = false;
}

export function hideOnboarding() {
  const overlay = $('#onboarding-overlay');
  if (overlay) overlay.hidden = true;
  markOnboarded();
}
