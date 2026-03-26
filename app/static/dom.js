export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

export function collapseEl(elem, hide) {
  if (!elem) return;
  if (hide) {
    elem.classList.add('collapsed');
    elem.setAttribute('aria-hidden', 'true');
  } else {
    elem.classList.remove('collapsed');
    elem.removeAttribute('aria-hidden');
  }
}

export function show(elem, visible = true) {
  if (!elem) return;
  elem.hidden = !visible;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
