import { S } from './state.js';
import { $, esc } from './dom.js';
import { t } from './i18n.js';
import { getEngineColor } from './engine-ui.js';

const DIA_SPEAKER_TAGS = [
  { tag: '[S1]', descKey: 'help_dia_s1_desc' },
  { tag: '[S2]', descKey: 'help_dia_s2_desc' },
];

const DIA_STAGE_TAGS = [
  { tag: '(laughs)', labelKey: 'dia_fx_laughs' },
  { tag: '(chuckles)', labelKey: 'dia_fx_chuckles' },
  { tag: '(sighs)', labelKey: 'dia_fx_sighs' },
  { tag: '(gasps)', labelKey: 'dia_fx_gasps' },
  { tag: '(coughs)', labelKey: 'dia_fx_coughs' },
  { tag: '(whispers)', labelKey: 'dia_fx_whispers' },
  { tag: '(singing)', labelKey: 'dia_fx_singing' },
  { tag: '(mumbles)', labelKey: 'dia_fx_mumbles' },
  { tag: '(claps)', labelKey: 'dia_fx_claps' },
  { tag: '(clears throat)', labelKey: 'help_dia_fx_clears_throat' },
  { tag: '(groans)', labelKey: 'help_dia_fx_groans' },
  { tag: '(sniffs)', labelKey: 'help_dia_fx_sniffs' },
  { tag: '(screams)', labelKey: 'help_dia_fx_screams' },
  { tag: '(inhales)', labelKey: 'help_dia_fx_inhales' },
  { tag: '(exhales)', labelKey: 'help_dia_fx_exhales' },
  { tag: '(applause)', labelKey: 'help_dia_fx_applause' },
  { tag: '(burps)', labelKey: 'help_dia_fx_burps' },
  { tag: '(humming)', labelKey: 'help_dia_fx_humming' },
  { tag: '(sneezes)', labelKey: 'help_dia_fx_sneezes' },
  { tag: '(whistles)', labelKey: 'help_dia_fx_whistles' },
  { tag: '(beep)', labelKey: 'help_dia_fx_beep' },
];

export function initHelp() {
  const helpBtn = $('#help-btn');
  const helpModal = $('#help-modal');
  const helpClose = $('#help-close');
  if (!helpBtn || !helpModal) return;

  helpBtn.onclick = () => {
    buildHelpContent();
    helpModal.hidden = false;
  };
  if (helpClose) helpClose.onclick = () => { helpModal.hidden = true; };
  helpModal.onclick = e => { if (e.target === helpModal) helpModal.hidden = true; };
}

function buildHelpContent() {
  const body = $('#help-body');
  if (!body || !S.CFG) return;

  let html = '';

  html += `<div class="help-choose"><h3>${t('help_choose')}</h3>`;
  html += '<div class="help-grid">';
  html += buildQuickPick('help_best_speed', 'kokoro', 'Kokoro');
  html += buildQuickPick('help_best_clone', 'qwen3', 'Qwen3-TTS');
  html += buildQuickPick('help_best_dialogue', 'dia', 'Dia');
  html += buildQuickPick('help_best_multilingual', 'qwen3', 'Qwen3-TTS');
  html += '</div></div>';

  for (const [id, eng] of Object.entries(S.CFG.engines)) {
    const color = getEngineColor(id);
    html += `<div class="help-engine">`;
    html += `<h3 style="color:${color}">${eng.icon || ''} ${esc(eng.label)}</h3>`;
    html += `<p class="help-desc">${t('eng_' + id + '_desc')}</p>`;

    const tags = (eng.recommended_for || []).map(tag =>
      `<span class="help-tag" style="color:${color};border-color:${color}">${t('tag_' + tag)}</span>`
    ).join('');
    if (tags) html += `<div class="help-tags">${tags}</div>`;

    const strengths = t('help_' + id + '_strengths');
    const limitations = t('help_' + id + '_limitations');
    const bestFor = t('help_' + id + '_best');

    if (strengths !== 'help_' + id + '_strengths') {
      html += `<div class="help-section"><strong>${t('help_strengths')}</strong><p>${esc(strengths)}</p></div>`;
    }
    if (limitations !== 'help_' + id + '_limitations') {
      html += `<div class="help-section"><strong>${t('help_limitations')}</strong><p>${esc(limitations)}</p></div>`;
    }
    if (bestFor !== 'help_' + id + '_best') {
      html += `<div class="help-section"><strong>${t('help_best_for')}</strong><p>${esc(bestFor)}</p></div>`;
    }

    if (id === 'dia') {
      html += buildDiaGuide();
    }

    html += '<dl>';
    html += `<dt>${t('help_models')}</dt><dd>${eng.models.map(m => esc(m.label)).join(', ')}</dd>`;
    if (eng.voices.length) {
      html += `<dt>${t('help_voices')}</dt><dd>${eng.voices.length}</dd>`;
    } else {
      html += `<dt>${t('help_voices')}</dt><dd>${t('help_no_voices')}</dd>`;
    }
    if (eng.features.length) html += `<dt>${t('help_features')}</dt><dd>${eng.features.map(f => esc(f)).join(', ')}</dd>`;
    if (eng.languages.length) html += `<dt>${t('help_languages')}</dt><dd>${eng.languages.map(l => esc(l.label)).join(', ')}</dd>`;
    html += '</dl>';

    html += '</div>';
  }

  body.innerHTML = html;
}

function buildQuickPick(labelKey, engineId, engineLabel) {
  const color = getEngineColor(engineId);
  return `<div class="help-pick" style="border-color:${color}"><span class="help-pick-label">${t(labelKey)}</span><span class="help-pick-engine" style="color:${color}">${esc(engineLabel)}</span></div>`;
}

function buildDiaGuide() {
  let html = `<div class="help-dia">`;
  html += `<div class="help-section"><strong>${t('help_dia_markup_title')}</strong><p>${esc(t('help_dia_markup_intro'))}</p></div>`;
  html += `<div class="help-code">${esc(t('help_dia_example'))}</div>`;
  html += `<div class="help-section"><strong>${t('help_dia_clone_title')}</strong><p>${esc(t('help_dia_clone_intro'))}</p></div>`;
  html += buildHelpTable(
    t('help_dia_speakers_title'),
    DIA_SPEAKER_TAGS.map(item => [item.tag, t(item.descKey)])
  );
  html += buildHelpTable(
    t('help_dia_stage_tags_title'),
    DIA_STAGE_TAGS.map(item => [item.tag, t(item.labelKey)])
  );
  html += `<div class="help-note">${esc(t('help_dia_stage_note'))}</div>`;
  html += `</div>`;
  return html;
}

function buildHelpTable(title, rows) {
  const tableRows = rows
    .map(([tag, meaning]) => `<tr><td><code>${esc(tag)}</code></td><td>${esc(meaning)}</td></tr>`)
    .join('');
  return [
    `<div class="help-table-wrap">`,
    `<div class="help-table-title">${esc(title)}</div>`,
    `<table class="help-table">`,
    `<thead><tr><th>${esc(t('help_dia_col_tag'))}</th><th>${esc(t('help_dia_col_meaning'))}</th></tr></thead>`,
    `<tbody>${tableRows}</tbody>`,
    `</table>`,
    `</div>`,
  ].join('');
}
