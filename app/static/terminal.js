import { $ } from './dom.js';
import { t } from './i18n.js';

let logLines = [];

export function clearLogs() {
  logLines = [];
  const pre = $('#terminal-log');
  if (pre) pre.innerHTML = '';
}

export function appendLog(text, type = 'info') {
  logLines.push({ text, type, ts: Date.now() });
  if (logLines.length > 500) logLines = logLines.slice(-300);
  render();
}

export function setLogs(lines) {
  const pre = $('#terminal-log');
  if (!pre) return;
  pre.innerHTML = '';
  for (const line of lines) {
    const span = document.createElement('span');
    span.className = 'log-line log-progress';
    span.textContent = line;
    pre.appendChild(span);
    pre.appendChild(document.createTextNode('\n'));
  }
  pre.scrollTop = pre.scrollHeight;
}

function render() {
  const pre = $('#terminal-log');
  if (!pre) return;
  pre.innerHTML = '';
  for (const entry of logLines) {
    const span = document.createElement('span');
    span.className = 'log-line log-' + entry.type;
    span.textContent = entry.text;
    pre.appendChild(span);
    pre.appendChild(document.createTextNode('\n'));
  }
  pre.scrollTop = pre.scrollHeight;
}

export function copyLogs() {
  const pre = $('#terminal-log');
  if (!pre) return;
  const text = pre.textContent || '';
  if (!text.trim()) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  const btn = $('#copy-logs-btn');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = t('logs_copied');
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

export function showTerminal(visible) {
  const wrap = $('#terminal-wrap');
  if (wrap) wrap.hidden = !visible;
}

export function initTerminal() {
  const clearBtn = $('#clear-logs-btn');
  const copyBtn = $('#copy-logs-btn');
  if (clearBtn) clearBtn.onclick = clearLogs;
  if (copyBtn) copyBtn.onclick = copyLogs;
}
