'use strict';
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code; }
}
const bad = (m, s = 400, code) => new HttpError(s, m, code);

const now = () => Date.now();
const rid = (n = 12) => crypto.randomBytes(n).toString('hex');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const DATE_RE = /^\d{4}-\d\d-\d\d$/;
const isEmail = (e) => typeof e === 'string' && e.length <= 190 && EMAIL_RE.test(e);
const isDate = (d) => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z'));

const clean = (v, max = 200) => String(v == null ? '' : v).replace(/[<>"'&]/g, '').trim().slice(0, max);
const text = (v, max = 2000) => String(v == null ? '' : v).slice(0, max);
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = 0, min = 0, max = 1e9) => Math.min(max, Math.max(min, Math.round(num(v, d))));

const parse = (s, fb) => { try { return JSON.parse(s); } catch (e) { return fb; } };

const isoOf = (d) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
const today = () => { const d = new Date(Date.now() - 3 * 36e5); return isoOf(d); }; // data no Brasil (UTC-3)
const addDays = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const nightList = (a, b) => { const n = nightsBetween(a, b); if (!(n > 0 && n <= 120)) return []; return Array.from({ length: n }, (_, i) => addDays(a, i)); };

// Mutex simples: todas as gravações passam por aqui, uma de cada vez.
function mutex() {
  let p = Promise.resolve();
  return (fn) => { const r = p.then(fn, fn); p = r.catch(() => {}); return r; };
}

module.exports = { HttpError, bad, now, rid, sha256, sha1, isEmail, isDate, clean, text, digits, num, int, parse, today, isoOf, addDays, nightsBetween, nightList, mutex };
