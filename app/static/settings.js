import { S } from './state.js';

function _set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
function _setJSON(k, v) { _set(k, JSON.stringify(v)); }
function _del(k) { try { localStorage.removeItem(k); } catch (_) {} }

export function saveEngine(id) {
  S.currentEngine = id;
  _set('tts-engine', id);
}

export function saveType(tp) {
  S.currentType = tp;
  _set('tts-type', tp);
}

export function saveVoice(engineId, voiceId) {
  S.lastVoice[engineId] = voiceId;
  _setJSON('tts-last-voice', S.lastVoice);
}

export function saveModel(engineId, modelId) {
  S.lastModel[engineId] = modelId;
  _setJSON('tts-last-model', S.lastModel);
}

export function saveLang(engineId, langCode) {
  S.lastLang[engineId] = langCode;
  _setJSON('tts-last-lang', S.lastLang);
}

export function saveFavorites() {
  _setJSON('tts-favorites', S.favorites);
}

export function saveRecentVoices() {
  _setJSON('tts-recent-voices', S.recentVoices.slice(0, 20));
}

export function saveDraft(text) {
  S.lastText = text;
  saveDraftForEngine(S.currentEngine, text);
}

export function saveDraftForEngine(engineId, text) {
  if (!engineId) return;
  S.lastTextByEngine[engineId] = text;
}

export function clearDraftStorage() {
  S.lastText = '';
  S.lastTextByEngine = {};
  _del('tts-draft');
  _del('tts-draft-by-engine');
}

export function saveAdvancedOpen(open) {
  S.advancedOpen = open;
  _set('tts-adv-open', String(open));
}

export function saveDiaEditorMode(on) {
  S.diaEditorMode = on;
  _set('tts-dia-editor', String(on));
}

export function saveLangChip(chip) {
  S.langChip = chip;
  _set('tts-lang-chip', chip);
}

export function savePreprocessOptions(opts) {
  S.preprocessOptions = { ...S.preprocessOptions, ...opts };
  _setJSON('tts-preprocess-options', S.preprocessOptions);
}

export function toggleFavorite(voiceId) {
  const idx = S.favorites.indexOf(voiceId);
  if (idx >= 0) S.favorites.splice(idx, 1);
  else S.favorites.push(voiceId);
  saveFavorites();
}

export function addRecentVoice(voiceId) {
  S.recentVoices = [voiceId, ...S.recentVoices.filter(v => v !== voiceId)].slice(0, 20);
  saveRecentVoices();
}
