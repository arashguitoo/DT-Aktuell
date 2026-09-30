// db.js – Datenzugriff. Firebase (Realtime Database + E-Mail-Anmeldung) oder DEMO-Modus (localStorage).
import { FIREBASE_CONFIG, ADMIN_UID } from './config.js';

export const DEMO = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('HIER');
const T = 'dt_tests', K = 'dt_keys', S = 'dt_submissions', Y = 'dt_summaries'; // nur Demo-Modus
const V = '10.12.2', BASE = `https://www.gstatic.com/firebasejs/${V}/`;
const R = 'deutschtest/';   // alles liegt in der Realtime Database unter /deutschtest

let fb = null;
async function F() {
  if (fb) return fb;
  const [app, rd, au] = await Promise.all([
    import(BASE + 'firebase-app.js'), import(BASE + 'firebase-database.js'), import(BASE + 'firebase-auth.js')]);
  const a = app.initializeApp(FIREBASE_CONFIG);
  fb = { ...rd, ...au, db: rd.getDatabase(a), auth: au.getAuth(a) };
  fb.r = p => rd.ref(fb.db, R + p);
  await fb.auth.authStateReady();
  return fb;
}
const val = async p => { const f = await F(); const s = await f.get(f.r(p)); return s.exists() ? s.val() : null; };
const indexFields = t => ({ title: t.title || '', level: t.level || '', status: t.status || 'draft', itemCount: t.itemCount || 0 });
const doneKey = id => 'dt_done_' + id;

/* ---------------- Firebase (Realtime Database) ---------------- */
const Fire = {
  async listTests(statuses = ['open']) {
    const idx = (await val('index')) || {};
    return Object.entries(idx).filter(([, v]) => statuses.includes(v.status)).map(([id, v]) => ({ id, ...v }));
  },
  async getTest(id) { try { const v = await val('tests/' + id); return v ? { id, ...v } : null; } catch (e) { return null; } },
  async ensureStudent() { await F(); return 'anon'; },
  async submit(testId, data) {
    const f = await F();
    try { if (localStorage.getItem(doneKey(testId))) throw new Error('Von diesem Gerät wurde dieser Test bereits abgegeben.'); } catch (e) { if (e.message.startsWith('Von')) throw e; }
    try { await f.set(f.push(f.r('subs/' + testId)), { ...data, submittedAt: f.serverTimestamp() }); }
    catch (e) { throw new Error(/permission/i.test(e.message) ? 'Der Test ist nicht (mehr) geöffnet.' : e.message); }
    try { localStorage.setItem(doneKey(testId), '1'); } catch { }
  },
  async endStudent() { },
  async getSummary(id) { try { const v = await val('summaries/' + id); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  // ---- Testmacher (gleiches Konto wie die Liga-Konsole) ----
  async onAdmin(cb) { const f = await F(); f.onAuthStateChanged(f.auth, u => cb(u && u.uid === ADMIN_UID ? u : null, u)); },
  async login(email, pw) { const f = await F(); await f.signInWithEmailAndPassword(f.auth, email, pw); },
  async logout() { const f = await F(); await f.signOut(f.auth); },
  async isAdmin() { const f = await F(); return f.auth.currentUser?.uid === ADMIN_UID; },
  async allTests() { const t = (await val('tests')) || {}; return Object.entries(t).map(([id, v]) => ({ id, ...v })); },
  async saveTest(id, fields, key) {
    const f = await F();
    const cur = (await val('tests/' + id)) || {};
    const full = { ...cur, ...fields, updatedAt: Date.now() };
    const up = { ['tests/' + id]: full, ['index/' + id]: indexFields(full) };
    if (key) up['keys/' + id] = JSON.stringify(key);
    await f.update(f.ref(f.db, 'deutschtest'), up);
  },
  async updateTest(id, patch) {
    const f = await F(); const up = {};
    for (const [k, v] of Object.entries(patch)) up['tests/' + id + '/' + k] = v;
    for (const k of ['title', 'level', 'status', 'itemCount']) if (k in patch) up['index/' + id + '/' + k] = patch[k];
    await f.update(f.ref(f.db, 'deutschtest'), up);
  },
  async getKey(id) { const v = await val('keys/' + id); return v ? JSON.parse(v) : {}; },
  async deleteTest(id, withSubs) {
    const f = await F();
    const up = { ['tests/' + id]: null, ['keys/' + id]: null, ['summaries/' + id]: null, ['index/' + id]: null };
    if (withSubs) up['subs/' + id] = null;
    await f.update(f.ref(f.db, 'deutschtest'), up);
  },
  async watchSubs(testId, cb) {
    const f = await F();
    return f.onValue(f.r('subs/' + testId), snap => {
      const v = snap.val() || {};
      cb(Object.entries(v).map(([id, d]) => ({ id, ...d, submittedAt: d.submittedAt || Date.now() })));
    }, err => console.error(err));
  },
  async deleteSub(docId) { const f = await F(); await f.remove(f.r('subs/' + curTestFor(docId) + '/' + docId)); },
  async saveSummary(id, obj) { const f = await F(); await f.set(f.r('summaries/' + id), JSON.stringify(obj)); },
};
// Abgaben-ID → Test merken (für deleteSub)
const subOwner = {};
const curTestFor = id => subOwner[id];
const _watch = Fire.watchSubs;
Fire.watchSubs = async (testId, cb) => _watch(testId, list => { list.forEach(x => subOwner[x.id] = testId); cb(list); });

/* ---------------- DEMO (localStorage) ---------------- */
const LS = 'dt_demo_db';
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const store = db => { try { localStorage.setItem(LS, JSON.stringify(db)); } catch { } };
const col = (db, c) => (db[c] = db[c] || {});
const Demo = {
  async listTests(statuses = ['open']) { const t = col(load(), T); return Object.entries(t).filter(([, v]) => statuses.includes(v.status)).map(([id, v]) => ({ id, ...v })); },
  async getTest(id) { const v = col(load(), T)[id]; return v ? { id, ...v } : null; },
  async ensureStudent() {
    let u; try { u = sessionStorage.getItem('dt_demo_uid'); } catch { }
    if (!u) { u = 'demo' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('dt_demo_uid', u); } catch { } }
    return u;
  },
  async submit(testId, data) {
    const db = load(); const uid = await Demo.ensureStudent(); const id = testId + '_' + uid;
    if (col(db, T)[testId]?.status !== 'open') throw new Error('Der Test ist nicht (mehr) geöffnet.');
    if (col(db, S)[id]) throw new Error('Von diesem Gerät wurde bereits abgegeben.');
    col(db, S)[id] = { ...data, testId, uid, submittedAt: Date.now() }; store(db);
  },
  async endStudent() { try { sessionStorage.removeItem('dt_demo_uid'); } catch { } },
  async getSummary(id) { const v = col(load(), Y)[id]; return v ? JSON.parse(v.data) : null; },
  async onAdmin(cb) { cb({ email: 'Demo-Modus' }); },
  async login() { }, async logout() { }, async isAdmin() { return true; },
  async allTests() { return Object.entries(col(load(), T)).map(([id, v]) => ({ id, ...v })); },
  async saveTest(id, fields, key) {
    const db = load(); col(db, T)[id] = { ...(col(db, T)[id] || {}), ...fields, updatedAt: Date.now() };
    if (key) col(db, K)[id] = { key: JSON.stringify(key) }; store(db);
  },
  async updateTest(id, patch) { const db = load(); Object.assign(col(db, T)[id], patch); store(db); },
  async getKey(id) { const v = col(load(), K)[id]; return v ? JSON.parse(v.key) : {}; },
  async deleteTest(id, withSubs) {
    const db = load();
    if (withSubs) for (const k of Object.keys(col(db, S))) if (db[S][k].testId === id) delete db[S][k];
    delete col(db, T)[id]; delete col(db, K)[id]; delete col(db, Y)[id]; store(db);
  },
  async watchSubs(testId, cb) {
    let last = '';
    const tick = () => {
      const list = Object.entries(col(load(), S)).filter(([, v]) => v.testId === testId).map(([id, v]) => ({ id, ...v }));
      const sig = JSON.stringify(list); if (sig !== last) { last = sig; cb(list); }
    };
    tick(); const h = setInterval(tick, 2000); return () => clearInterval(h);
  },
  async deleteSub(docId) { const db = load(); delete col(db, S)[docId]; store(db); },
  async saveSummary(id, obj) { const db = load(); col(db, Y)[id] = { data: JSON.stringify(obj), updatedAt: Date.now() }; store(db); },
};

export const DB = DEMO ? Demo : Fire;
