import { S } from './state.js';
import { $, $$, esc } from './dom.js';
import { t } from './i18n.js';
import { saveDiaEditorMode } from './settings.js';

const DIA_ROW_EFFECTS = [
  { value: '', label: 'dia_fx_none' },
  { value: '(laughs)', label: 'dia_fx_laughs' },
  { value: '(chuckles)', label: 'dia_fx_chuckles' },
  { value: '(sighs)', label: 'dia_fx_sighs' },
  { value: '(gasps)', label: 'dia_fx_gasps' },
  { value: '(coughs)', label: 'dia_fx_coughs' },
  { value: '(whispers)', label: 'dia_fx_whispers' },
  { value: '(singing)', label: 'dia_fx_singing' },
  { value: '(mumbles)', label: 'dia_fx_mumbles' },
  { value: '(claps)', label: 'dia_fx_claps' },
];

let editorRows = [{ speaker: 'S1', text: '', effect: '' }, { speaker: 'S2', text: '', effect: '' }];
const DIA_TEST_DIALOGUE = `[S1] Seg Mind helps you build image and video workflows without code.
[S2] It gives you many models, and you can drag, drop, and deploy.
[S1] Really? Can it also work with custom models?
[S2] Yes, it can work with custom models and flexible workflows.`;

function splitTextAndEffect(text) {
  const raw = (text || '').trim();
  for (const fx of DIA_ROW_EFFECTS) {
    if (!fx.value) continue;
    if (raw.endsWith(` ${fx.value}`)) {
      return { text: raw.slice(0, -(` ${fx.value}`).length).trim(), effect: fx.value };
    }
    if (raw === fx.value) {
      return { text: '', effect: fx.value };
    }
  }
  return { text: raw, effect: '' };
}

function renderEffectOptions(selected) {
  return DIA_ROW_EFFECTS
    .map(fx => `<option value="${esc(fx.value)}"${selected === fx.value ? ' selected' : ''}>${esc(t(fx.label))}</option>`)
    .join('');
}

export function updateDiaToolbar(show) {
  const slot = $('#dia-toolbar-slot');
  if (!slot) return;
  if (!show) { slot.innerHTML = ''; return; }

  let html = '<div class="dia-toolbar">';
  html += `<button class="dia-speaker s1" data-tag="[S1]">${t('dia_s1')}</button>`;
  html += `<button class="dia-speaker s2" data-tag="[S2]">${t('dia_s2')}</button>`;
  html += `<button class="dia-mode-btn" id="dia-load-sample-btn">${t('dia_load_sample')}</button>`;
  html += `<span class="dia-kbd" data-t="dia_toolbar_hint">${t('dia_toolbar_hint')}</span>`;
  html += '<span class="dia-toolbar-spacer"></span>';
  html += `<button class="dia-mode-btn${S.diaEditorMode ? '' : ' active'}" id="dia-text-btn">${t('dia_text')}</button>`;
  html += `<button class="dia-mode-btn${S.diaEditorMode ? ' active' : ''}" id="dia-editor-btn">${t('dia_editor')}</button>`;
  html += '</div>';

  slot.innerHTML = html;

  slot.querySelectorAll('.dia-speaker').forEach(btn => {
    btn.onclick = () => insertSpeaker(btn.dataset.tag);
  });

  const textBtn = $('#dia-text-btn');
  const editorBtn = $('#dia-editor-btn');
  const sampleBtn = $('#dia-load-sample-btn');
  if (textBtn) textBtn.onclick = () => setEditorMode(false);
  if (editorBtn) editorBtn.onclick = () => setEditorMode(true);
  if (sampleBtn) sampleBtn.onclick = () => loadDiaSample();
}

function renderDiaClonePrompt() {
  const wrap = $('#dia-speakers-wrap');
  if (!wrap) return;
  const refTextEl = $('#ref-text');
  const refText = refTextEl ? refTextEl.value.trim() : '';
  const isActive = !!S.refId;
  const activeName = S.refFilename || (S.refMeta && (S.refMeta.display_name || S.refMeta.filename)) || S.refId || '';
  wrap.innerHTML = `
    <div class="dia-speakers-title">${t('dia_clone_title')}</div>
    <div class="dia-speakers-note">${t('dia_clone_note')}</div>
    <div class="dia-sp-card dia-clone-card">
      <div class="dia-clone-status${isActive ? ' on' : ''}">${t(isActive ? 'dia_clone_active' : 'dia_clone_default')}</div>
      <div class="dia-clone-name">${esc(isActive ? activeName : t('dia_clone_no_ref'))}</div>
      <div class="dia-clone-meta">${esc(t(refText ? 'dia_clone_text_set' : 'dia_clone_text_missing'))}</div>
    </div>
  `;
}

export function updateDiaSpeakerConfig(show) {
  const wrap = $('#dia-speakers-wrap');
  if (!wrap) return;
  if (!show) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = '';
  renderDiaClonePrompt();
}

export function updateDiaEditor(supported) {
  const editorWrap = $('#dia-editor-wrap');
  const textWrap = $('#text-field');
  if (!editorWrap) return;
  if (!supported) {
    editorWrap.innerHTML = '';
    editorWrap.style.display = 'none';
    if (textWrap) textWrap.style.display = '';
    return;
  }

  if (S.diaEditorMode) {
    parseTextToRows();
    showEditor();
  } else {
    editorWrap.innerHTML = '';
    editorWrap.style.display = 'none';
  }
}

function setEditorMode(on) {
  saveDiaEditorMode(on);

  const textWrap = $('#text-field');
  const editorWrap = $('#dia-editor-wrap');

  if (on) {
    parseTextToRows();
    showEditor();
    if (textWrap) textWrap.style.display = 'none';
  } else {
    syncRowsToText();
    if (editorWrap) { editorWrap.innerHTML = ''; editorWrap.style.display = 'none'; }
    if (textWrap) textWrap.style.display = '';
  }

  $$('.dia-mode-btn').forEach(b => {
    b.classList.toggle('active', (b.id === 'dia-editor-btn') === on);
  });

  updateDiaPreview();
}

function parseTextToRows() {
  const ta = $('#text');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) {
    editorRows = [{ speaker: 'S1', text: '', effect: '' }, { speaker: 'S2', text: '', effect: '' }];
    return;
  }

  const parts = text.split(/(\[S[12]\])/);
  const rows = [];
  let currentSpeaker = 'S1';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p) continue;
    if (p === '[S1]') { currentSpeaker = 'S1'; continue; }
    if (p === '[S2]') { currentSpeaker = 'S2'; continue; }
    const parsed = splitTextAndEffect(p);
    rows.push({ speaker: currentSpeaker, text: parsed.text, effect: parsed.effect });
  }
  editorRows = rows.length > 0 ? rows : [{ speaker: 'S1', text: '', effect: '' }, { speaker: 'S2', text: '', effect: '' }];
}

function syncRowsToText() {
  const ta = $('#text');
  if (!ta) return;
  const text = editorRows
    .filter(r => r.text.trim())
    .map(r => {
      const line = r.text.trim();
      const effect = r.effect ? ` ${r.effect}` : '';
      return `[${r.speaker}] ${line}${effect}`;
    })
    .join(' ');
  ta.value = text;
  const cc = $('#char-count');
  if (cc) cc.textContent = text.length;
}

function showEditor() {
  const wrap = $('#dia-editor-wrap');
  if (!wrap) return;
  wrap.style.display = '';
  renderEditor();
}

function renderEditor() {
  const wrap = $('#dia-editor-wrap');
  if (!wrap) return;

  let html = '<div class="dia-editor">';
  for (let i = 0; i < editorRows.length; i++) {
    const r = editorRows[i];
    html += `<div class="dia-row" data-idx="${i}">`;
    html += `<select class="dia-row-speaker" data-idx="${i}">`;
    html += `<option value="S1"${r.speaker === 'S1' ? ' selected' : ''}>S1</option>`;
    html += `<option value="S2"${r.speaker === 'S2' ? ' selected' : ''}>S2</option>`;
    html += `</select>`;
    html += `<select class="dia-row-effect" data-idx="${i}" title="${esc(t('dia_fx_label'))}">`;
    html += renderEffectOptions(r.effect || '');
    html += `</select>`;
    html += `<input type="text" class="dia-row-text" data-idx="${i}" value="${esc(r.text)}" placeholder="...">`;
    html += `<button class="dia-row-del" data-idx="${i}">&times;</button>`;
    html += `</div>`;
  }
  html += `<button class="dia-add-btn" id="dia-add-line">${t('dia_add_line')}</button>`;
  html += '</div>';
  html += `<div class="dia-editor-hint">${t('dia_editor_hint')}</div>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll('.dia-row-speaker').forEach(sel => {
    sel.onchange = () => {
      editorRows[+sel.dataset.idx].speaker = sel.value;
      syncRowsToText();
      updateDiaPreview();
    };
  });

  wrap.querySelectorAll('.dia-row-text').forEach(inp => {
    inp.oninput = () => {
      editorRows[+inp.dataset.idx].text = inp.value;
      syncRowsToText();
      updateDiaPreview();
    };
  });

  wrap.querySelectorAll('.dia-row-effect').forEach(sel => {
    sel.onchange = () => {
      editorRows[+sel.dataset.idx].effect = sel.value || '';
      syncRowsToText();
      updateDiaPreview();
    };
  });

  wrap.querySelectorAll('.dia-row-del').forEach(btn => {
    btn.onclick = () => {
      if (editorRows.length <= 1) return;
      editorRows.splice(+btn.dataset.idx, 1);
      renderEditor();
      syncRowsToText();
      updateDiaPreview();
    };
  });

  const addBtn = $('#dia-add-line');
  if (addBtn) {
    addBtn.onclick = () => {
      const lastSpeaker = editorRows.length > 0 ? editorRows[editorRows.length - 1].speaker : 'S1';
      editorRows.push({ speaker: lastSpeaker === 'S1' ? 'S2' : 'S1', text: '', effect: '' });
      renderEditor();
      const lastInput = wrap.querySelector('.dia-row:last-child .dia-row-text');
      if (lastInput) lastInput.focus();
    };
  }
}

function loadDiaText(text) {
  const ta = $('#text');
  if (!ta) return;
  ta.value = text;
  const cc = $('#char-count');
  if (cc) cc.textContent = text.length;
  if (S.diaEditorMode) {
    parseTextToRows();
    showEditor();
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  updateDiaPreview();
}

function loadDiaSample() {
  loadDiaText(DIA_TEST_DIALOGUE);
}

function insertSpeaker(tag) {
  if (S.diaEditorMode) return;
  const ta = $('#text');
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  ta.value = val.substring(0, start) + tag + ' ' + val.substring(end);
  ta.selectionStart = ta.selectionEnd = start + tag.length + 1;
  ta.focus();
  updateDiaPreview();
}

export function updateDiaPreview() {
  const prev = $('#dia-preview');
  if (!prev) return;
  if (!S.CFG) return;
  const eng = S.CFG.engines[S.currentEngine];
  const cap = eng ? eng.capabilities || {} : {};
  if (!cap.dialogue_mode) { prev.innerHTML = ''; return; }

  const text = S.diaEditorMode
    ? editorRows.filter(r => r.text.trim()).map(r => {
      const line = r.text.trim();
      const effect = r.effect ? ` ${r.effect}` : '';
      return `[${r.speaker}] ${line}${effect}`;
    }).join(' ')
    : (($('#text') || {}).value || '');

  if (!text.trim()) { prev.innerHTML = ''; return; }

  const validation = validateDialogue(text);
  let statusHtml = '';
  if (text.trim()) {
    if (validation.valid) {
      const shortWarn = validation.short ? `<div class="dia-validation warn">${t('dia_validation_short')}</div>` : '';
      statusHtml = `<div class="dia-validation ok">${t('dia_validation_ok')}</div>${shortWarn}`;
    } else {
      statusHtml = `<div class="dia-validation err">${t('dia_validation_err')}</div>`;
    }
  }

  const html = text
    .replace(/\[S1\]/g, '<span class="dp-s1">[S1]</span>')
    .replace(/\[S2\]/g, '<span class="dp-s2">[S2]</span>');
  prev.innerHTML = `<div class="dia-preview">${html}</div>${statusHtml}`;
}

function validateDialogue(text) {
  if (!text.trim()) return { valid: false, reason: 'empty' };
  const hasS1 = text.includes('[S1]');
  const hasS2 = text.includes('[S2]');
  if (!hasS1 && !hasS2) return { valid: false, reason: 'no_tags' };
  const words = text.replace(/\[S[12]\]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return { valid: true, short: words < 8 };
}

export function initDiaKeyboard() {
  const ta = $('#text');
  if (!ta) return;
  ta.addEventListener('keydown', e => {
    if (!S.CFG) return;
    const eng = S.CFG.engines[S.currentEngine];
    const cap = eng ? eng.capabilities || {} : {};
    if (!cap.dialogue_mode || S.diaEditorMode) return;

    if (e.key === '1' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      insertSpeaker('[S1]');
    } else if (e.key === '2' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      insertSpeaker('[S2]');
    }
  });
}
