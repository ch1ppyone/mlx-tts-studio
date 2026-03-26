import { S } from './state.js';
import { $, $$, esc, collapseEl, debounce } from './dom.js';
import { t } from './i18n.js';
import { saveEngine, saveType, saveVoice, saveModel, saveLang, saveLangChip, toggleFavorite, addRecentVoice, saveDraftForEngine } from './settings.js';
import { updateDiaToolbar, updateDiaPreview, updateDiaEditor, updateDiaSpeakerConfig } from './dia.js';
import { updateCacheBadge } from './status.js';

let voiceFilterTimeout = null;

function syncKokoroLangToVoice() {
  if (!S.CFG || S.currentEngine !== 'kokoro') return;
  const eng = S.CFG.engines[S.currentEngine];
  if (!eng || !eng.voices) return;
  const sel = $('#sel-voice');
  const langSel = $('#sel-lang');
  if (!sel || !langSel || !sel.value) return;
  const voice = eng.voices.find(v => v.id === sel.value);
  if (!voice || !voice.lang) return;
  const hasLang = [...langSel.options].some(o => o.value === voice.lang);
  if (!hasLang) return;
  if (langSel.value !== voice.lang) {
    langSel.value = voice.lang;
    saveLang(S.currentEngine, voice.lang);
  }
}

function makeHelpIcon(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'help-q';
  btn.textContent = '?';
  btn.setAttribute('data-tip', text || '');
  btn.setAttribute('aria-label', text || '');
  return btn;
}

function makeLabelWithHelp(labelText, helpText, htmlFor = '') {
  const row = document.createElement('div');
  row.className = 'label-help-row';
  const lbl = document.createElement('label');
  lbl.textContent = labelText;
  if (htmlFor) lbl.htmlFor = htmlFor;
  row.appendChild(lbl);
  row.appendChild(makeHelpIcon(helpText));
  return row;
}

export function buildEngineTabs() {
  const wrap = $('#engine-tabs');
  if (!wrap || !S.CFG) return;
  wrap.innerHTML = '';
  for (const [id, eng] of Object.entries(S.CFG.engines)) {
    const btn = document.createElement('button');
    btn.className = 'engine-tab' + (id === S.currentEngine ? ' active' : '');
    btn.dataset.engine = id;
    const color = eng.accent_color || 'var(--accent)';
    btn.innerHTML = `<span class="engine-icon">${eng.icon || ''}</span><span class="et-name">${esc(eng.label)}</span><div class="et-tags">${(eng.recommended_for || []).map(tag => `<span class="et-tag">${esc(t('tag_' + tag))}</span>`).join('')}</div>`;
    btn.style.setProperty('--tab-color', color);
    btn.onclick = () => switchEngine(id);
    wrap.appendChild(btn);
  }
}

export function switchEngine(id) {
  const prevEngine = S.currentEngine;
  const currentTextEl = $('#text');
  if (currentTextEl) saveDraftForEngine(prevEngine, currentTextEl.value || '');
  saveEngine(id);
  const eng = S.CFG.engines[id];
  const cap = eng.capabilities || {};

  $$('.engine-tab').forEach(b => b.classList.toggle('active', b.dataset.engine === id));
  const color = eng.accent_color || 'var(--accent)';
  const colorDark = eng.accent_color_dark || color;
  const isDark = S.theme === 'dark';
  document.documentElement.style.setProperty('--engine-color', isDark ? colorDark : color);

  const descEl = $('#engine-desc');
  if (descEl) {
    const hint = t('onboard_' + id);
    descEl.textContent = hint !== ('onboard_' + id) ? hint : t('eng_' + id + '_desc');
  }

  const welcomeEl = $('#welcome-slot');
  if (welcomeEl) welcomeEl.style.display = 'none';

  const typeSection = $('#type-section');
  const vsVoices = $('#vs-voices');
  const vsBase = $('#vs-base');
  const vsDesign = $('#vs-design');
  const emotionWrap = $('#emotion-wrap');
  const textEl = $('#text');

  const hasTypes = cap.type_cards && cap.type_cards.length > 0;
  collapseEl(typeSection, !hasTypes);

  const voiceFilterInput = $('#voice-filter');
  if (voiceFilterInput && !cap.voice_filter) {
    voiceFilterInput.value = '';
  }

  if (hasTypes) {
    buildTypeCards(cap.type_cards);
    const savedType = S.currentType;
    const validType = cap.type_cards.find(c => c.id === savedType);
    setType(validType ? savedType : cap.type_cards[0].id);
  } else {
    const hasVoices = eng.voices && eng.voices.length > 0;
    collapseEl(vsVoices, !hasVoices);
    collapseEl(vsBase, !cap.ref_audio);
    collapseEl(vsDesign, true);
    collapseEl(emotionWrap, !cap.emotion);
    if (hasVoices) buildVoiceSelect(eng);
  }

  updateDiaToolbar(!!cap.dialogue_mode);
  updateDiaEditor(!!cap.dialogue_editor);
  updateDiaSpeakerConfig(!!cap.dialogue_mode);

  buildModelSelect(eng);
  buildParamsRow(eng);
  buildAdvanced(eng, cap);
  buildLangChips(eng);

  if (textEl) {
    textEl.placeholder = cap.dialogue_mode ? t('dia_text_ph') : t('text_ph');
    textEl.value = S.lastTextByEngine[id] || '';
    const cc = $('#char-count');
    if (cc) cc.textContent = textEl.value.length;
  }

  const previewBtn = $('#preview-btn');
  if (previewBtn) previewBtn.style.display = cap.preview ? '' : 'none';

  const favBtn = $('#fav-btn');
  if (favBtn) favBtn.style.display = (eng.voices && eng.voices.length > 0) ? '' : 'none';

  updateModelId();
  updateCacheBadge();
  restorePerEngine(id, eng);
  if (cap.dialogue_mode && S.diaEditorMode) updateDiaEditor(true);
  updateDiaPreview();
  syncKokoroLangToVoice();
  window.dispatchEvent(new CustomEvent('tts:model-scope-change'));
}

function restorePerEngine(id, eng) {
  const savedModel = S.lastModel[id];
  if (savedModel) {
    const sel = $('#sel-model');
    if (sel && [...sel.options].some(o => o.value === savedModel)) {
      sel.value = savedModel;
      updateModelId();
    }
  }

  const savedVoice = S.lastVoice[id];
  if (savedVoice) {
    const sel = $('#sel-voice');
    if (sel) {
      const opts = [...sel.querySelectorAll('option')];
      if (opts.some(o => o.value === savedVoice)) sel.value = savedVoice;
    }
  }

  const savedLang = S.lastLang[id];
  if (savedLang) {
    const sel = $('#sel-lang');
    if (sel && [...sel.options].some(o => o.value === savedLang)) sel.value = savedLang;
  }
}

function buildTypeCards(types) {
  const container = $('#type-cards');
  if (!container) return;
  container.innerHTML = '';
  for (const tc of types) {
    const el = document.createElement('div');
    el.className = 'type-card' + (tc.id === S.currentType ? ' active' : '');
    el.dataset.type = tc.id;
    el.innerHTML = `<div class="tc-name" data-t="${tc.label_key}">${t(tc.label_key)}</div><div class="tc-desc" data-t="${tc.desc_key}">${t(tc.desc_key)}</div>`;
    el.onclick = () => setType(tc.id);
    container.appendChild(el);
  }
}

export function setType(tp) {
  saveType(tp);
  const eng = S.CFG.engines[S.currentEngine];
  const cap = eng.capabilities || {};
  if (!cap.type_cards) return;

  const card = cap.type_cards.find(c => c.id === tp);
  const shows = card ? card.shows : [];

  collapseEl($('#vs-voices'), !shows.includes('voices'));
  collapseEl($('#vs-base'), !shows.includes('ref_audio'));
  collapseEl($('#vs-design'), !shows.includes('voice_design'));
  collapseEl($('#emotion-wrap'), !shows.includes('emotion'));

  if (shows.includes('voices')) buildVoiceSelect(eng);

  $$('.type-card').forEach(c => c.classList.toggle('active', c.dataset.type === tp));
  buildModelSelect(eng);
  updateModelId();
}

export function buildModelSelect(eng) {
  const sel = $('#sel-model');
  if (!sel) return;
  const prevValue = sel.value;
  const cap = eng.capabilities || {};
  const hasTypes = cap.type_cards && cap.type_cards.length > 0;
  const activeTypeId = hasTypes ? S.currentType : null;
  sel.innerHTML = '';
  for (const m of eng.models) {
    if (hasTypes && activeTypeId) {
      const modelLower = m.id.toLowerCase();
      const typeLower = activeTypeId.toLowerCase();
      if (!modelLower.includes(typeLower)) continue;
    }
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label + (m.tags && m.tags.includes('recommended') ? ' \u2605' : '');
    sel.appendChild(opt);
  }
  const options = [...sel.options].map(o => o.value);
  const savedModel = S.lastModel[S.currentEngine];
  const preferred =
    (prevValue && options.includes(prevValue) && prevValue) ||
    (savedModel && options.includes(savedModel) && savedModel) ||
    (eng.default_model && options.includes(eng.default_model) && eng.default_model) ||
    (options[0] || '');
  if (preferred) sel.value = preferred;
}

export function buildVoiceSelect(eng) {
  const sel = $('#sel-voice');
  if (!sel) return;
  const cap = eng.capabilities || {};
  const filterInput = $('#voice-filter');
  const filterVal = cap.voice_filter && filterInput ? filterInput.value.toLowerCase() : '';
  const langChip = cap.voice_filter ? (S.langChip || 'all') : 'all';

  sel.innerHTML = '';
  const groups = {};
  let shown = 0;

  for (const v of eng.voices) {
    if (langChip !== 'all' && v.lang !== langChip) continue;
    if (filterVal && !v.label.toLowerCase().includes(filterVal) && !(v.desc || '').toLowerCase().includes(filterVal) && !v.id.toLowerCase().includes(filterVal)) continue;
    const g = v.group || '';
    if (!groups[g]) groups[g] = [];
    groups[g].push(v);
    shown++;
  }

  const groupKeys = Object.keys(groups);
  for (const g of groupKeys) {
    let parent = sel;
    if (g) {
      const og = document.createElement('optgroup');
      og.label = g;
      sel.appendChild(og);
      parent = og;
    }
    for (const v of groups[g]) {
      const opt = document.createElement('option');
      opt.value = v.id;
      const isFav = S.favorites.includes(v.id);
      opt.textContent = (isFav ? '\u2605 ' : '') + v.label + (v.desc ? ` \u2014 ${v.desc}` : '');
      parent.appendChild(opt);
    }
  }

  if (eng.default_voice && !filterVal && langChip === 'all') {
    const exists = [...sel.querySelectorAll('option')].some(o => o.value === eng.default_voice);
    if (exists) sel.value = eng.default_voice;
  }

  const countEl = $('#voice-count');
  if (countEl) countEl.textContent = t('voices_shown').replace('{n}', shown);

  const filterWrap = $('#voice-filter-wrap');
  if (filterWrap) filterWrap.style.display = eng.voices.length > 10 ? '' : 'none';
}

function buildLangChips(eng) {
  const wrap = $('#lang-chips');
  if (!wrap) return;
  const cap = eng.capabilities || {};
  if (!cap.voice_filter || !eng.voices || eng.voices.length <= 10) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';

  const langs = new Set();
  for (const v of eng.voices) {
    if (v.lang) langs.add(v.lang);
  }
  const sorted = [...langs].sort();

  let html = `<button class="lang-chip${S.langChip === 'all' ? ' active' : ''}" data-chip="all">${t('all_lang')}</button>`;
  for (const l of sorted) {
    html += `<button class="lang-chip${S.langChip === l ? ' active' : ''}" data-chip="${esc(l)}">${esc(l.toUpperCase())}</button>`;
  }
  wrap.innerHTML = html;

  wrap.querySelectorAll('.lang-chip').forEach(btn => {
    btn.onclick = () => {
      saveLangChip(btn.dataset.chip);
      wrap.querySelectorAll('.lang-chip').forEach(b => b.classList.toggle('active', b.dataset.chip === S.langChip));
      buildVoiceSelect(eng);
    };
  });
}

export function initVoiceFilter() {
  const filterInput = $('#voice-filter');
  if (!filterInput) return;
  filterInput.addEventListener('input', debounce(() => {
    const eng = S.CFG.engines[S.currentEngine];
    buildVoiceSelect(eng);
  }, 200));
}

export function buildParamsRow(eng) {
  const row = $('#params-row');
  if (!row) return;
  row.innerHTML = '';

  if (eng.languages && eng.languages.length > 0 && (eng.capabilities || {}).language_select !== false) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    wrap.innerHTML = `<label data-t="lang">${t('lang')}</label>`;
    const sel = document.createElement('select');
    sel.id = 'sel-lang';
    for (const l of eng.languages) {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.label;
      sel.appendChild(opt);
    }
    sel.onchange = () => saveLang(S.currentEngine, sel.value);
    wrap.appendChild(sel);
    row.appendChild(wrap);
  }

  const defaults = eng.default_params || {};
  for (const pid of (eng.params || [])) {
    if (['temperature', 'top_p', 'top_k', 'repetition_penalty', 'max_tokens'].includes(pid)) continue;
    const pd = S.CFG.params[pid];
    if (!pd) continue;
    const defVal = defaults[pid] !== undefined ? defaults[pid] : pd.default;
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    const lbl = document.createElement('label');
    lbl.textContent = pd.label;
    lbl.htmlFor = 'param-' + pid;
    wrap.appendChild(lbl);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.id = 'param-' + pid;
    inp.min = pd.min;
    inp.max = pd.max;
    inp.step = pd.step;
    inp.value = defVal;
    const val = document.createElement('span');
    val.className = 'range-val';
    val.textContent = defVal;
    inp.oninput = () => { val.textContent = inp.value; };
    wrap.appendChild(inp);
    wrap.appendChild(val);
    row.appendChild(wrap);
  }
}

export function buildAdvanced(eng, cap) {
  const body = $('#adv-body');
  const details = document.querySelector('details.advanced');
  if (!body) return;
  body.innerHTML = '';
  const helpByParam = {
    temperature: t('help_param_temperature'),
    top_p: t('help_param_top_p'),
    top_k: t('help_param_top_k'),
    repetition_penalty: t('help_param_repetition_penalty'),
    max_tokens: t('help_param_max_tokens'),
  };

  const defaults = eng.default_params || {};
  const advParams = (eng.params || []).filter(p => ['temperature', 'top_p', 'top_k', 'repetition_penalty', 'max_tokens'].includes(p));
  for (const pid of advParams) {
    const pd = S.CFG.params[pid];
    if (!pd) continue;
    const defVal = defaults[pid] !== undefined ? defaults[pid] : pd.default;
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    wrap.appendChild(makeLabelWithHelp(pd.label, helpByParam[pid] || '', 'param-' + pid));
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.id = 'param-' + pid;
    inp.min = pd.min;
    inp.max = pd.max;
    inp.step = pd.step;
    inp.value = defVal;
    const val = document.createElement('span');
    val.className = 'range-val';
    val.textContent = defVal;
    inp.oninput = () => { val.textContent = inp.value; };
    wrap.appendChild(inp);
    wrap.appendChild(val);
    body.appendChild(wrap);
  }

  if (cap.voice_override) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    wrap.appendChild(makeLabelWithHelp(t('voice_override'), t('help_param_voice_override')));
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'adv-voice';
    inp.placeholder = t('voice_override_ph');
    inp.setAttribute('data-t', 'voice_override_ph');
    wrap.appendChild(inp);
    body.appendChild(wrap);
  }

  if (cap.instruct) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    wrap.appendChild(makeLabelWithHelp(t('instruct'), t('help_param_instruct')));
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'instruct';
    inp.placeholder = t('instruct_ph');
    inp.setAttribute('data-t', 'instruct_ph');
    wrap.appendChild(inp);
    body.appendChild(wrap);
  }

  if (details) {
    const hasAdvancedControls = body.children.length > 0;
    const forceHideAdvanced = S.currentEngine === 'dia';
    details.hidden = forceHideAdvanced || !hasAdvancedControls;
    if (forceHideAdvanced || !hasAdvancedControls) details.open = false;
  }
}

export function updateModelId() {
  const sel = $('#sel-model');
  const modelIdEl = $('#model-id');
  if (sel && modelIdEl) modelIdEl.textContent = sel.value || '';
  if (sel) saveModel(S.currentEngine, sel.value);
}

export function getActiveModel() {
  const sel = $('#sel-model');
  return sel ? sel.value : '';
}

export function getParamValue(pid) {
  const el = document.getElementById('param-' + pid);
  return el ? parseFloat(el.value) : null;
}

export function getActiveVoice() {
  const vsVoices = $('#vs-voices');
  if (vsVoices && !vsVoices.classList.contains('collapsed')) {
    const sel = $('#sel-voice');
    if (sel && sel.value) return sel.value;
  }
  const advVoice = document.getElementById('adv-voice');
  if (advVoice && advVoice.value.trim()) return advVoice.value.trim();
  return '';
}

export function getEngineColor(id) {
  if (!S.CFG) return '#6366f1';
  const eng = S.CFG.engines[id];
  if (!eng) return '#6366f1';
  return S.theme === 'dark' ? (eng.accent_color_dark || eng.accent_color || '#6366f1') : (eng.accent_color || '#6366f1');
}

export function onVoiceChange() {
  const sel = $('#sel-voice');
  if (!sel || !sel.value) return;
  saveVoice(S.currentEngine, sel.value);
  addRecentVoice(sel.value);
  syncKokoroLangToVoice();
  updateFavBtn();
}

export function onFavToggle() {
  const sel = $('#sel-voice');
  if (!sel || !sel.value) return;
  toggleFavorite(sel.value);
  const eng = S.CFG.engines[S.currentEngine];
  buildVoiceSelect(eng);
  if (sel.value) {
    const opts = [...sel.querySelectorAll('option')];
    const match = opts.find(o => o.value === sel.value);
    if (match) match.selected = true;
  }
  updateFavBtn();
}

function updateFavBtn() {
  const btn = $('#fav-btn');
  const sel = $('#sel-voice');
  if (!btn || !sel) return;
  const isFav = S.favorites.includes(sel.value);
  btn.textContent = isFav ? '\u2605' : '\u2606';
  btn.title = isFav ? t('voice_unfavorited') : t('voice_favorited');
}
