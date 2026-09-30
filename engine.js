// engine.js – gemeinsame Logik: Test-Format prüfen, Lösungen trennen, automatisch korrigieren
// Wird von index.html (Test) und konsole.html (Testmacher-Konsole) benutzt.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Text formatieren: **fett**, Absätze (Leerzeile), Zeilenumbrüche
export function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export const TYPE_LABEL = { choice: 'Auswahl', bank: 'Wortliste', input: 'Eingabe', truefalse: 'richtig/falsch', order: 'Satzbau' };
export const isTextType = t => t === 'input' || t === 'order';

export function optionsFor(part, item) {
  if (item.type === 'bank') return part.bank || [];
  if (item.type === 'truefalse') return [{ k: 'r', t: 'richtig' }, { k: 'f', t: 'falsch' }];
  return item.options || [];
}

export function eachItem(content, fn) {
  (content.sections || []).forEach((s, si) =>
    (s.parts || []).forEach((p, pi) =>
      (p.items || []).forEach((it, ii) => fn({ gid: p.id + '.' + it.id, s, p, it, si, pi, ii }))));
}
export function itemsOf(content) { const a = []; eachItem(content, x => a.push(x)); return a; }
export const label = it => it.label ?? it.id;

// Vergleich für Eingabe-Aufgaben: tolerant bei Groß/klein, ß/ss, Anführungszeichen, Satzzeichen am Ende
export function norm(s) {
  return String(s ?? '').normalize('NFC').toLowerCase()
    .replace(/[„“”"‚‘’'`´]/g, '').replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/, '').trim();
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const normOpts = arr => (arr || []).map((o, i) => typeof o === 'string' ? { k: LETTERS[i], t: o } : { k: String(o.k), t: String(o.t ?? '') });

/**
 * Prüft eine Test-Datei (mit Lösungen) und trennt sie in
 *   content (öffentlich, ohne Lösungen) und key (nur Testmacher).
 */
export function splitTest(raw) {
  const errors = [], warnings = [];
  let t;
  try { t = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw); }
  catch (e) { return { errors: ['Kein gültiges JSON: ' + e.message], warnings }; }

  if (!t.id || !/^[a-z0-9][a-z0-9-]{2,59}$/.test(t.id)) errors.push('„id“ fehlt oder ungültig (nur a–z, 0–9, Bindestrich, 3–60 Zeichen).');
  if (!t.title) errors.push('„title“ fehlt.');
  if (!Array.isArray(t.sections) || !t.sections.length) errors.push('„sections“ fehlt oder ist leer.');
  if (errors.length) return { errors, warnings };

  const key = {};
  const partIds = new Set();
  let itemCount = 0, maxPoints = 0;

  t.sections.forEach((s, si) => {
    s.id = s.id || 's' + (si + 1);
    s.title = s.title || s.id;
    s.parts = (s.parts || []).filter(p => {
      if (!p.hidden) return true;
      warnings.push(`„${p.title || p.id}“ ist ausgeblendet („hidden“: ${typeof p.hidden === 'string' ? p.hidden : 'true'}) und kommt im Test nicht vor.`);
      return false;
    });
    if (!s.parts.length) warnings.push(`Abschnitt „${s.title}“ ist noch leer und wird im Test übersprungen.`);
    s.parts.forEach((p, pi) => {
      p.id = p.id || `${s.id}-${pi + 1}`;
      if (partIds.has(p.id)) errors.push(`Teil-id „${p.id}“ kommt doppelt vor.`);
      partIds.add(p.id);
      if (p.bank) p.bank = normOpts(p.bank);
      const where = `${s.title} › ${p.title || p.id}`;
      const ids = new Set();
      (p.items || []).forEach((it, ii) => {
        it.id = String(it.id ?? ii + 1);
        if (ids.has(it.id)) errors.push(`${where}: Aufgaben-id „${it.id}“ doppelt.`);
        ids.add(it.id);
        if (it.options) it.options = normOpts(it.options);
        if (!it.type) it.type = it.tokens ? 'order' : it.accept ? 'input' : it.options ? 'choice' : p.bank ? 'bank' : 'choice';
        if (!TYPE_LABEL[it.type]) errors.push(`${where} ${it.id}: unbekannter Typ „${it.type}“.`);
        it.points = Number(it.points ?? 1);
        const gid = p.id + '.' + it.id;
        let ans = isTextType(it.type) ? (it.accept ?? it.answer) : it.answer;
        if (ans == null || ans === '' || (Array.isArray(ans) && !ans.length)) errors.push(`${where} ${it.id}: Lösung fehlt.`);
        else {
          if (isTextType(it.type)) ans = (Array.isArray(ans) ? ans : [ans]).map(String);
          if (it.type === 'order') {
            const bag = x => norm(x).split(' ').sort().join(' ');
            const tb = bag((it.tokens || []).join(' '));
            ans.forEach(a => { if (bag(a) !== tb) errors.push(`${where} ${it.id}: Lösung „${a}“ benutzt nicht genau die Satzbausteine.`); });
          }
          else {
            const valid = optionsFor(p, it).map(o => o.k);
            const arr = Array.isArray(ans) ? ans.map(String) : [String(ans)];
            arr.forEach(a => { if (!valid.includes(a)) errors.push(`${where} ${it.id}: Lösung „${a}“ ist keine Option.`); });
            ans = arr.length === 1 ? arr[0] : arr;
          }
          key[gid] = ans;
        }
        if (it.type === 'bank' && !p.bank) errors.push(`${where} ${it.id}: Typ „bank“, aber der Teil hat keine Wortliste („bank“).`);
        if (it.type === 'choice' && !(it.options || []).length) errors.push(`${where} ${it.id}: keine Optionen.`);
        delete it.answer; delete it.accept;
        itemCount++; maxPoints += it.points;
      });
      // Lücken im Text abgleichen
      const gaps = [...String(p.text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
      gaps.forEach(g => { if (!ids.has(g)) errors.push(`${where}: Lücke [[${g}]] im Text hat keine Aufgabe.`); });
      (p.items || []).forEach(it => {
        if (!gaps.includes(it.id) && !it.prompt) warnings.push(`${where} ${it.id}: weder Lücke im Text noch Fragetext („prompt“).`);
      });
      if (p.audio && !p.audio.src) errors.push(`${where}: Audio ohne „src“.`);
    });
  });

  const meta = {
    title: t.title, level: t.level || '', description: t.description || '',
    askName: !!t.askName, passPercent: Number(t.passPercent ?? 60),
    itemCount, maxPoints,
  };
  const content = { id: t.id, title: t.title, level: meta.level, description: meta.description, sections: t.sections };
  if (!itemCount) warnings.push('Der Test enthält noch keine Aufgaben.');
  return { id: t.id, meta, content, key, errors, warnings };
}

// Inhalt + Lösungen wieder zu einer bearbeitbaren Datei zusammenführen
export function mergeTest(test, content, key) {
  const c = structuredClone(content);
  c.askName = !!test.askName; c.passPercent = test.passPercent ?? 60;
  (c.sections || []).forEach(s => (s.parts || []).forEach(p => (p.items || []).forEach(it => {
    const k = key[p.id + '.' + it.id];
    if (isTextType(it.type)) it.accept = k; else it.answer = k;
  })));
  return c;
}

export function isCorrect(item, keyVal, given) {
  if (given == null || given === '' || keyVal == null) return false;
  const acc = Array.isArray(keyVal) ? keyVal : [keyVal];
  if (isTextType(item.type)) { const g = norm(given); return g !== '' && acc.some(a => norm(a) === g); }
  return acc.includes(given);
}

export function grade(content, key, answers) {
  const res = { pts: 0, max: 0, sections: [], items: {} };
  (content.sections || []).forEach(s => {
    const sec = { id: s.id, title: s.title, pts: 0, max: 0 };
    (s.parts || []).forEach(p => (p.items || []).forEach(it => {
      const gid = p.id + '.' + it.id, pts = it.points ?? 1, given = answers?.[gid] ?? null;
      const ok = isCorrect(it, key[gid], given);
      sec.max += pts; if (ok) sec.pts += pts;
      res.items[gid] = { given, ok, pts: ok ? pts : 0, max: pts };
    }));
    if (sec.max > 0) { sec.pct = pct(sec.pts, sec.max); res.sections.push(sec); }
    res.pts += sec.pts; res.max += sec.max;
  });
  res.pct = pct(res.pts, res.max);
  return res;
}
export const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;

// Anzeige einer Lösung als Text
export function answerText(part, item, v) {
  if (v == null || v === '') return '–';
  if (Array.isArray(v)) return v.map(x => answerText(part, item, x)).join(' / ');
  if (isTextType(item.type)) return v;
  const o = optionsFor(part, item).find(o => o.k === v);
  return o ? `${o.k} (${o.t})` : v;
}

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(6));
  return [...r].map(x => A[x % A.length]).join('');
}
