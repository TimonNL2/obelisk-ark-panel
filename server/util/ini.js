/**
 * Line-preserving INI helpers. ARK config files contain duplicate keys (Game.ini)
 * and comments, so we never re-serialize the whole file: we only touch the lines we manage.
 */

const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const headerOf = (line) => {
  const m = /^\s*\[(.+)\]\s*$/.exec(line);
  return m ? m[1].trim() : null;
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parse into { section: { key: value } } (first occurrence wins, sections/keys keep original case). */
export function parseIni(text) {
  const out = {};
  let current = null;
  for (const line of stripBom(text || '').split(/\r?\n/)) {
    const h = headerOf(line);
    if (h !== null) {
      current = Object.keys(out).find((k) => k.toLowerCase() === h.toLowerCase()) || h;
      out[current] ||= {};
      continue;
    }
    if (!current) continue;
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!Object.keys(out[current]).some((k) => k.toLowerCase() === key.toLowerCase())) {
      out[current][key] = t.slice(eq + 1).trim();
    }
  }
  return out;
}

/** Case-insensitive lookup in a parsed INI object. */
export function getIniValue(parsed, section, key) {
  const sec = Object.keys(parsed).find((k) => k.toLowerCase() === section.toLowerCase());
  if (!sec) return undefined;
  const k = Object.keys(parsed[sec]).find((x) => x.toLowerCase() === key.toLowerCase());
  return k === undefined ? undefined : parsed[sec][k];
}

/**
 * Set (or remove, when value === null) keys inside one section.
 * Existing lines are replaced in place; new keys are appended to the end of the section.
 */
export function setIniValues(text, section, entries) {
  const eol = /\r\n/.test(text || '') ? '\r\n' : '\n';
  const lines = stripBom(text || '').split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  let start = lines.findIndex((l) => (headerOf(l) || '').toLowerCase() === section.toLowerCase());
  if (start === -1) {
    const toAdd = Object.entries(entries).filter(([, v]) => v !== null && v !== undefined);
    if (!toAdd.length) return lines.join(eol) + eol;
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`[${section}]`);
    for (const [k, v] of toAdd) lines.push(`${k}=${v}`);
    return lines.join(eol) + eol;
  }

  const findEnd = () => {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (headerOf(lines[i]) !== null) { end = i; break; }
    }
    return end;
  };

  for (const [key, value] of Object.entries(entries)) {
    const re = new RegExp(`^\\s*${escapeRe(key)}\\s*=`, 'i');
    let end = findEnd();
    const idx = lines.slice(start + 1, end).findIndex((l) => re.test(l));
    if (idx !== -1) {
      const lineNo = start + 1 + idx;
      if (value === null || value === undefined) lines.splice(lineNo, 1);
      else lines[lineNo] = `${key}=${value}`;
    } else if (value !== null && value !== undefined) {
      // insert after the last non-blank line of the section
      let insertAt = end;
      while (insertAt - 1 > start && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, `${key}=${value}`);
    }
  }
  return lines.join(eol) + eol;
}
