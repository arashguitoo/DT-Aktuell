// db.js – Datenzugriff. Firebase (Firestore + Auth) oder DEMO-Modus (localStorage).
import { FIREBASE_CONFIG, ADMIN_EMAIL } from './config.js';

export const DEMO = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('HIER');
const T = 'dt_tests', K = 'dt_keys', S = 'dt_submissions', Y = 'dt_summaries';
const V = '10.12.2', BASE = `https://www.gstatic.com/firebasejs/${V}/`;

let fb = null;
async function F() {
  if (fb) return fb;
  const [app, fs, au] = await Promise.all([
    import(BASE + 'firebase-app.js'), import(BASE + 'firebase-firestore.js'), import(BASE + 'firebase-auth.js')]);
  const a = app.initializeApp(FIREBASE_CONFIG);
  fb = { ...fs, ...au, db: fs.getFirestore(a), auth: au.getAuth(a) };
  await fb.auth.authStateReady();
  return fb;
}
const ms = ts => ts?.toMillis ? ts.toMillis() : (typeof ts === 'number' ? ts : Date.now());

/* ---------------- Firebase ---------------- */
const Fire = {
  async listTests(statuses = ['open']) {
    const f = await F(); const out = [];
    for (const st of statuses) {
      const snap = await f.getDocs(f.query(f.collection(f.db, T), f.where('status', '==', st)));
      snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    }
    return out;
  },
  async getTest(id) {
    const f = await F();
    try { const d = await f.getDoc(f.doc(f.db, T, id)); return d.exists() ? { id, ...d.data() } : null; }
    catch (e) { return null; }
  },
  async ensureStudent() {
    const f = await F();
    if (!f.auth.currentUser || !f.auth.currentUser.isAnonymous) await f.signInAnonymously(f.auth);
    return f.auth.currentUser.uid;
  },
  async submit(testId, data) {
    const f = await F(); const uid = await Fire.ensureStudent();
    await f.setDoc(f.doc(f.db, S, testId + '_' + uid), { ...data, testId, uid, submittedAt: f.serverTimestamp() });
  },
  async endStudent() { const f = await F(); if (f.auth.currentUser?.isAnonymous) await f.signOut(f.auth); },
  async getSummary(id) {
    const f = await F();
    try { const d = await f.getDoc(f.doc(f.db, Y, id)); return d.exists() ? JSON.parse(d.data().data) : null; }
    catch (e) { return null; }
  },
  // ---- Testmacher ----
  async onAdmin(cb) {
    const f = await F();
    f.onAuthStateChanged(f.auth, u => cb(u && !u.isAnonymous && u.email === ADMIN_EMAIL ? u : null, u));
  },
  async login() { const f = await F(); await f.signInWithPopup(f.auth, new f.GoogleAuthProvider()); },
  async logout() { const f = await F(); await f.signOut(f.auth); },
  async isAdmin() { const f = await F(); const u = f.auth.currentUser; return !!(u && !u.isAnonymous && u.email === ADMIN_EMAIL); },
  async allTests() {
    const f = await F(); const snap = await f.getDocs(f.collection(f.db, T));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveTest(id, fields, key) {
    const f = await F();
    await f.setDoc(f.doc(f.db, T, id), { ...fields, updatedAt: f.serverTimestamp() }, { merge: true });
    if (key) await f.setDoc(f.doc(f.db, K, id), { key: JSON.stringify(key) });
  },
  async updateTest(id, patch) { const f = await F(); await f.updateDoc(f.doc(f.db, T, id), patch); },
  async getKey(id) {
    const f = await F(); const d = await f.getDoc(f.doc(f.db, K, id));
    return d.exists() ? JSON.parse(d.data().key) : {};
  },
  async deleteTest(id, withSubs) {
    const f = await F();
    if (withSubs) {
      const snap = await f.getDocs(f.query(f.collection(f.db, S), f.where('testId', '==', id)));
      for (const d of snap.docs) await f.deleteDoc(d.ref);
    }
    await f.deleteDoc(f.doc(f.db, K, id)); await f.deleteDoc(f.doc(f.db, Y, id)); await f.deleteDoc(f.doc(f.db, T, id));
  },
  async watchSubs(testId, cb) {
    const f = await F();
    return f.onSnapshot(f.query(f.collection(f.db, S), f.where('testId', '==', testId)),
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data(), submittedAt: ms(d.data().submittedAt) }))),
      err => console.error(err));
  },
  async deleteSub(docId) { const f = await F(); await f.deleteDoc(f.doc(f.db, S, docId)); },
  async saveSummary(id, obj) {
    const f = await F();
    await f.setDoc(f.doc(f.db, Y, id), { data: JSON.stringify(obj), updatedAt: f.serverTimestamp() });
  },
};

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
