/* =====================================================================
   نظام إدارة كلية الأعمال — جامعة الجوف  (الإصدار 1.0)
   موقع مستقل على GitHub Pages وقاعدة بيانات Supabase خاصة به (ملفات 2_database).
   الصلاحيات تُطبق في الخادم (RLS)؛ الواجهة تُخفي ما لا يخص المستخدم فقط لتسهيل الاستخدام.
   ===================================================================== */
(function () {
  'use strict';
  const VERSION = '1.0';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = esc;
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtD = (s) => (s ? String(s).slice(0, 10) : '—');
  const fmtDT = (s) => { if (!s) return '—'; try { return new Date(s).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return String(s).slice(0, 16).replace('T', ' '); } };
  const uid = (p) => (p || '') + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2) + Date.now().toString(36));
  const C = (window.C = {});

  /* ---------------- الاتصال ---------------- */
  const CFG = window.DMS_CONFIG || {};
  const FORCE_DEMO = /[?&#]demo\b/.test(location.href) || !!window.COLLEGE_FORCE_DEMO;
  const CAN_LIVE = !!(window.supabase && CFG.supabaseUrl && CFG.supabaseAnonKey && !/YOUR-/.test(CFG.supabaseUrl));
  const sb = CAN_LIVE ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storage: window.sessionStorage, storageKey: 'dms-auth' } }) : null;
  let DEMO = false;
  const DM = () => window.COLLEGE_DEMO;

  const pgErr = (e) => {
    const m = (e && (e.message || e.error_description || e.error)) || String(e);
    if (/row-level security|permission denied/i.test(m)) return 'لا تملك صلاحية تنفيذ هذا الإجراء على هذه الجهة.';
    if (/faculty_email_uq|duplicate key.*email/i.test(m)) return 'البريد الجامعي مسجل لعضو آخر.';
    if (/faculty_empno_uq/i.test(m)) return 'الرقم الوظيفي مسجل لعضو آخر.';
    if (/duplicate key/i.test(m)) return 'السجل موجود من قبل.';
    if (/violates foreign key.*restrict|still referenced/i.test(m)) return 'لا يمكن الحذف لوجود سجلات مرتبطة. استخدم التعطيل أو الأرشفة.';
    if (/Could not find the function|does not exist/i.test(m)) return 'قاعدة البيانات غير مكتملة: نفّذ ملفات مجلد database بالترتيب في Supabase.';
    return m;
  };
  const chk = (r) => { if (r.error) throw new Error(pgErr(r.error)); return r.data; };
  const applyQ = (q, o) => {
    if (!o) return q;
    if (o.eq) for (const k in o.eq) q = o.eq[k] === null ? q.is(k, null) : q.eq(k, o.eq[k]);
    if (o.in) for (const k in o.in) q = q.in(k, o.in[k]);
    if (o.gte) for (const k in o.gte) q = q.gte(k, o.gte[k]);
    if (o.lte) for (const k in o.lte) q = q.lte(k, o.lte[k]);
    return q;
  };
  const D = {
    async select(t, o) {
      if (DEMO) return DM().select(t, o);
      o = o || {}; let out = [];
      const page = o.limit && o.limit <= 1000 ? o.limit : 1000;
      for (let from = 0; ; from += page) {
        let q = applyQ(sb.from(t).select(o.cols || '*'), o);
        if (o.order) q = q.order(o.order[0], { ascending: o.order[1] !== false });
        q = q.range(from, from + page - 1);
        const d = chk(await q); out = out.concat(d || []);
        if (!d || d.length < page || (o.limit && out.length >= o.limit)) break;
      }
      return o.limit ? out.slice(0, o.limit) : out;
    },
    async insert(t, rows) { if (DEMO) return DM().insert(t, rows); return chk(await sb.from(t).insert(rows).select()); },
    async upsert(t, row) { if (DEMO) return DM().upsert(t, row); return chk(await sb.from(t).upsert(row).select()); },
    async update(t, patch, o) { if (DEMO) return DM().update(t, patch, o); const d = chk(await applyQ(sb.from(t).update(patch), o).select()); if (!d || !d.length) throw new Error(pgErr({ message: 'row-level security' })); return d; },
    async remove(t, o) { if (DEMO) return DM().remove(t, o); return chk(await applyQ(sb.from(t).delete(), o).select()); },
    async rpc(n, a) { if (DEMO) { try { return await DM().rpc[n](a || {}); } catch (e) { throw new Error(pgErr(e)); } } return chk(await sb.rpc(n, a || {})); },
    async fn(body) {
      if (DEMO) return DM().fn('users', body);
      const tk = await D.auth.token();
      const r = await sb.functions.invoke(CFG.usersFunction || 'admin-users', { body, headers: tk ? { Authorization: 'Bearer ' + tk } : {} });
      if (r.error) { let m = r.error.message; try { const j = await r.error.context.json(); m = j.error || m; } catch (e) {} return { error: m }; }
      return r.data;
    },
    async upload(path, file) { if (DEMO) return DM().upload(path, file); return chk(await sb.storage.from('org-files').upload(path, file, { upsert: false, contentType: file.type })); },
    async download(path) { if (DEMO) return DM().download(path); return chk(await sb.storage.from('org-files').download(path)); },
    async upsertMany(t, rows, onConflict, ignore) { if (DEMO) return DM().upsertMany(t, rows, ignore); if (!rows.length) return []; return chk(await sb.from(t).upsert(rows, { onConflict, ignoreDuplicates: !!ignore })); },
    async uploadApp(path, blob) { if (DEMO) return DM().upload('apps/' + path, blob); return chk(await sb.storage.from('org-apps').upload(path, blob, { upsert: false, contentType: 'text/html' })); },
    async downloadApp(path) { if (DEMO) return DM().download('apps/' + path); return chk(await sb.storage.from('org-apps').download(path)); },
    async uploadTpl(path, file) { if (DEMO) return DM().upload('tpl/' + path, file); return chk(await sb.storage.from('org-templates').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })); },
    async downloadTpl(path) { if (DEMO) return DM().download('tpl/' + path); return chk(await sb.storage.from('org-templates').download(path)); },
    async downloadPublic(path) { if (DEMO) return DM().download('public/' + path); return chk(await sb.storage.from('org-public').download(path)); },
    async uploadPublic(path, blob) { if (DEMO) return DM().upload('public/' + path, blob); return chk(await sb.storage.from('org-public').upload(path, blob, { upsert: true, contentType: 'text/html' })); },
    async removeFile(path) { if (DEMO) return DM().removeFile(path); return chk(await sb.storage.from('org-files').remove([path])); },
    /* الدخول والخروج: المكان الوحيد الذي يتعامل مع نظام الحسابات. عند النقل إلى الدخول الموحد للجامعة يُعدَّل هنا فقط */
    auth: {
      live: () => CAN_LIVE,
      async session() { return sb ? (await sb.auth.getSession()).data.session : null; },
      async token() { const s = await D.auth.session(); return s ? s.access_token : null; },
      async signIn(email, password) { const r = await sb.auth.signInWithPassword({ email, password }); if (r.error) throw new Error(/invalid/i.test(r.error.message) ? 'البريد أو كلمة المرور غير صحيحة.' : r.error.message); },
      async signOut() { if (sb && !DEMO) await sb.auth.signOut(); },
      async setPassword(password) { const r = await sb.auth.updateUser({ password }); if (r.error) throw new Error(r.error.message); }
    }
  };
  /* ذاكرة مؤقتة للقراءة في الجلسة: كل استعلام يُجلب مرة كل دقيقة، والطلبات المتزامنة تشترك في طلب واحد.
     أي كتابة تُسقط جدولها، وأي دالة كتابة تمسح الكل، فلا يرى المستخدم نتيجة قديمة لما غيّره هو. */
  const QC = new Map(), QG = { n: 0 }, QC_TTL = 60000, QC_SKIP = new Set(['org_app_data', 'audit_log', 'org_changes']);
  const QC_RPC = new Set(['faculty_courses', 'sched_context', 'data_status', 'dept_followup', 'faculty_dash', 'report_teaching_load']), QC_KEEP = new Set(['org_my_access', 'org_link_me', 'org_app_put', 'org_app_del', 'my_bundle', 'inquiry_read', 'sched_linked', 'course_file_board', 'qa_roles', 'public_portal', 'public_plan', 'advising_list', 'advising_read', 'advising_send']);
  const PERF = { on: /[?&]perf\b/.test(location.search), n: 0 };
  const qcCopy = (v) => (v && typeof v === 'object' ? structuredClone(v) : v);
  const qcGet = (key, fn) => { const e = QC.get(key); if (e && Date.now() - e.t < QC_TTL) return e.p.then(qcCopy); PERF.n++; const p = fn(); QC.set(key, { t: Date.now(), p }); p.catch(() => QC.delete(key)); return p.then(qcCopy); };
  const qcKey = (t, o) => JSON.stringify([t, o || null]);
  const qcDrop = (t) => { const pre = '["' + t + '"'; [...QC.keys()].forEach((k) => { if (k.startsWith(pre)) QC.delete(k); }); QG.n++; };
  const qcClear = () => { QC.clear(); QG.n++; };
  const qcPrime = (key, v) => QC.set(key, { t: Date.now(), p: Promise.resolve(v) });
  const qcFresh = (key) => { const e = QC.get(key); return !!e && Date.now() - e.t < QC_TTL; };
  (() => { const sel = D.select; D.select = (t, o) => QC_SKIP.has(t) ? (PERF.n++, sel.call(D, t, o)) : qcGet(qcKey(t, o), () => sel.call(D, t, o));
    ['insert', 'upsert', 'update', 'remove', 'upsertMany'].forEach((k) => { const f = D[k]; D[k] = async (t, ...r) => { const v = await f.call(D, t, ...r); qcDrop(t); return v; }; });
    const rp = D.rpc; D.rpc = async (n, a) => { if (QC_RPC.has(n)) return qcGet(qcKey('rpc:' + n, a), () => rp.call(D, n, a)); PERF.n++; const v = await rp.call(D, n, a); if (!QC_KEEP.has(n)) qcClear(); return v; };
    const fnc = D.fn; D.fn = async (b) => { const v = await fnc.call(D, b); qcClear(); return v; };
    /* ملف البرنامج لا يتغير لأن مساره يحوي رقم الإصدار: يُحفظ في المتصفح، ويُحذف إصداره السابق */
    const dl = D.downloadApp; D.downloadApp = async (p) => { let c = null; try { c = await caches.open('college-apps-v1'); const h = await c.match('/__app/' + p); if (h) return await h.blob(); } catch (e) { c = null; }
      PERF.n++; const b = await dl.call(D, p); if (c) try { await c.put('/__app/' + p, new Response(b, { headers: { 'content-type': b.type || 'text/html' } })); const pre = '/__app/' + String(p).split('/')[0] + '/'; (await c.keys()).forEach((q) => { const u = new URL(q.url).pathname; if (u.startsWith(pre) && u !== '/__app/' + p) c.delete(q); }); } catch (e) {} return b; }; })();

  /* ---------------- الحالة ---------------- */
  const S = (window.CS = { apps: [], me: null, acc: {}, glob: {}, units: [], faculty: [], members: [], roles: [], grants: [], terms: [], settings: {}, depts: [], profiles: [], privates: {}, changes: [] });
  let VIEW = { page: 'home' };

  const KIND = { leadership: 'جهة قيادية', administration: 'إدارة', department: 'قسم علمي', unit: 'وحدة', committee: 'لجنة', other: 'جهة أخرى' };
  const USTATUS = { active: 'نشطة', inactive: 'معطلة', archived: 'مؤرشفة' };
  const POS = { head: 'رئيس / مسؤول', deputy: 'نائب', secretary: 'مقرر', member: 'عضو', viewer: 'مطّلع' };
  const RSTAT = { new: ['جديدة', ''], in_progress: ['قيد التنفيذ', 'brass'], waiting: ['بانتظار إجراء', 'wait'], done: ['مكتملة', 'ok'], rejected: ['مرفوضة', 'bad'] };
  const PRIO = { low: 'منخفضة', normal: 'عادية', high: 'عالية' };
  const VSTAT = { draft: ['مسودة', 'wait'], approved: ['معتمد', 'ok'], superseded: ['سابق', ''], rejected: ['مرفوض', 'bad'] };
  const APPS = {
    training: { name: 'نظام إدارة التدريب', d: 'التدريب الميداني وجهات التدريب والخطابات وبوابة الطلاب.' },
    readiness: { name: 'نظام جاهزية الطلاب', d: 'اختبارات الجاهزية وبنوك الأسئلة ونتائج الطلاب.' },
    exams: { name: 'نظام إدارة الاختبارات', d: 'جداول الاختبارات والقاعات والمراقبات والحضور.' },
    surveys: { name: 'نظام تحليل الاستطلاعات', d: 'تحليل الاستطلاعات وتقييم المقررات وتقارير الجودة.' },
    clo: { name: 'برنامج قياس مخرجات التعلم', d: 'توزيع الدرجات على المخرجات ونسب التحقق وتقرير القياس.' }
  };
  const CAPS = { read: 'الاطلاع', write: 'الإضافة والتعديل', manage: 'إدارة الجهة وأعضائها', reports: 'التقارير', import_schedule: 'رفع مسودة جدول', approve_import: 'اعتماد الجداول', faculty_private: 'بيانات الجوال', audit: 'سجل التدقيق' };

  const isAdmin = () => !!(S.me && S.me.is_admin);
  const cap = (u, c) => isAdmin() || !!((S.acc[u] || {})[c]);
  const gcap = (c) => isAdmin() || !!S.glob[c];
  const unit = (id) => S.units.find((u) => u.id === id);
  const uName = (id) => (unit(id) || {}).name || '—';
  const fac = (id) => S.faculty.find((f) => f.id === id);
  const fName = (id) => (fac(id) || {}).name_ar || '—';
  const prof = (a) => S.profiles.find((p) => p.app_id === a);
  const pName = (a) => (a ? ((prof(a) || {}).name || a) : '—');
  const sortU = (a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name, 'ar');
  const kids = (id) => S.units.filter((u) => u.parent_id === id).sort(sortU);
  const roots = () => S.units.filter((u) => !u.parent_id || !unit(u.parent_id)).sort(sortU);
  const desc = (id) => { const out = [id]; for (let i = 0; i < out.length; i++) kids(out[i]).forEach((k) => out.push(k.id)); return out; };
  const pathOf = (id) => { const out = []; let u = unit(id), n = 0; while (u && n++ < 60) { out.unshift(u); u = unit(u.parent_id); } return out; };
  const activeM = (m, d) => { d = d || today(); return m.start_date <= d && (!m.end_date || m.end_date >= d); };
  const rootId = () => (roots()[0] || {}).id;
  const headOf = (uid0) => S.members.find((m) => m.unit_id === uid0 && m.position === 'head' && activeM(m));
  const deptUnits = () => S.units.filter((u) => u.kind === 'department').sort(sortU);
  const myFac = () => (S.me && S.me.faculty_id) || null;
  const flatUnits = (exclude) => { const out = []; const walk = (u, d) => { if (exclude && exclude.has(u.id)) return; out.push({ u, d }); kids(u.id).forEach((k) => walk(k, d + 1)); }; roots().forEach((r) => walk(r, 0)); return out; };
  const unitOptions = (sel, exclude, opts) => (opts && opts.none ? `<option value="">${esc(opts.none)}</option>` : '') +
    flatUnits(exclude).filter((x) => !(opts && opts.kinds) || opts.kinds.includes(x.u.kind)).map((x) => `<option value="${attr(x.u.id)}" ${x.u.id === sel ? 'selected' : ''}>${'\u00A0\u00A0\u00A0'.repeat(x.d)}${x.d ? '– ' : ''}${esc(x.u.name)}${x.u.status !== 'active' ? ' (' + USTATUS[x.u.status] + ')' : ''}</option>`).join('');
  const facOptions = (sel, none, list) => (none !== false ? `<option value="">${esc(none || '— اختر —')}</option>` : '') +
    (list || S.faculty.slice().sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'))).map((f) => `<option value="${attr(f.id)}" ${f.id === sel ? 'selected' : ''}>${esc(f.name_ar)}${f.status !== 'نشط' ? ' (' + esc(f.status) + ')' : ''}</option>`).join('');
  const chip = (t, c) => `<span class="chip ${c || ''}">${esc(t)}</span>`;
  const kindDot = (k) => `<i class="kind" style="background:var(--k-${k})" aria-hidden="true"></i>`;
  const opt = (v, l, sel) => `<option value="${attr(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`;

  /* ---------------- واجهة مشتركة ---------------- */
  let toastT;
  const toast = (m, bad) => { const t = $('#toast'); t.textContent = m; t.style.background = bad ? 'var(--late)' : ''; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), bad ? 6000 : 3000); };
  let lastFocus = null;
  const modal = (title, body, foot, wide) => {
    lastFocus = document.activeElement;
    $('#mtitle').textContent = title; $('#mbody').innerHTML = body; $('#mfoot').innerHTML = foot || '<button class="btn" onclick="C.close()">إغلاق</button>';
    $('#mbox').classList.toggle('wide', !!wide); $('#modal').classList.remove('hidden');
    setTimeout(() => { const f = $('#mbody input:not([type=hidden]):not([disabled]),#mbody select,#mbody textarea'); (f || $('#mclose')).focus(); }, 30);
  };
  C.close = () => { $('#modal').classList.add('hidden'); $('#mbody').innerHTML = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); };
  $('#mclose').onclick = C.close;
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') C.close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) C.close(); });
  const busy = async (btn, fn) => { const b = btn && btn.tagName ? btn : null; if (b) { b.disabled = true; b.dataset.t = b.textContent; b.textContent = 'جارٍ التنفيذ…'; }
    try { return await fn(); } catch (e) { console.error(e); toast(pgErr(e), true); const er = $('#mbody .err'); if (er) er.textContent = pgErr(e); return undefined; }
    finally { if (b) { b.disabled = false; b.textContent = b.dataset.t; } } };
  const confirmBox = (title, html, okLabel, danger) => new Promise((res) => {
    modal(title, html, `<button class="btn ${danger ? 'danger' : 'pri'}" id="cfOk">${esc(okLabel || 'تأكيد')}</button><button class="btn" id="cfNo">تراجع</button>`);
    $('#cfOk').onclick = () => { C.close(); res(true); }; $('#cfNo').onclick = () => { C.close(); res(false); };
  });
  const val = (id) => { const e = document.getElementById(id); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
  const genPass = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%'; const r = new Uint32Array(14); crypto.getRandomValues(r); let p = ''; r.forEach((x) => { p += a[x % a.length]; }); return /\d/.test(p) && /[@#%]/.test(p) ? p : genPass(); };

  /* Excel */
  const xlsxOut = (file, sheets) => {
    if (!window.XLSX) return toast('مكتبة Excel لم تُحمَّل. تحقق من الاتصال بالإنترنت.', true);
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => { const ws = XLSX.utils.aoa_to_sheet([s.head].concat(s.rows)); ws['!cols'] = s.head.map((h) => ({ wch: Math.max(12, String(h).length + 4) })); ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 30)); });
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.writeFile(wb, file);
  };
  const xlsxIn = (file, opt) => new Promise((res, rej) => {
    if (!window.XLSX) return rej(new Error('مكتبة Excel لم تُحمَّل.'));
    const r = new FileReader();
    r.onload = () => { try { const wb = XLSX.read(r.result, { type: 'array', cellDates: false }); const ws = wb.Sheets[wb.SheetNames[0]]; res(XLSX.utils.sheet_to_json(ws, Object.assign({ defval: '', raw: false }, opt))); } catch (e) { rej(new Error('تعذرت قراءة الملف. تأكد أنه بصيغة Excel (xlsx).')); } };
    r.onerror = () => rej(new Error('تعذرت قراءة الملف.'));
    r.readAsArrayBuffer(file);
  });
  const mapRow = (row, map) => { const o = {}; for (const k in row) { const key = map[String(k).trim()] || map[String(k).trim().toLowerCase()]; if (key) o[key] = String(row[k] == null ? '' : row[k]).trim(); } return o; };
  const printNow = (title) => { const h = $('#printHead'); if (h) h.innerHTML = `<h2>${esc((S.settings.collegeName || 'كلية الأعمال — جامعة الجوف'))}</h2><div>${esc(title)}</div><div class="small">تاريخ الإصدار: ${fmtDT(new Date().toISOString())}</div>`; window.print(); };

  /* الإشعارات: تُكتب في جدول notifs نفسه وتظهر في جرس الإشعارات */
  const notify = async (appIds, text) => {
    const to = [...new Set(appIds.filter((a) => a && S.me && a !== S.me.app_id))]; if (!to.length) return;
    const at = new Date().toISOString();
    try { await D.insert('notifs', to.map((a) => { const id = uid('n'); return { id, to_user: a, created_by: S.me.app_id, data: { id, to: a, text, ref: null, at, read: false, by: S.me.app_id } }; })); } catch (e) { console.warn('notify', e); }
  };

  const LOGO_IMG = window.COLLEGE_LOGO || 'img/ju-emblem.png', BG_IMG = 'img/login-bg.jpg';
    let BRAND = null;
  C.logout = async () => { await D.auth.signOut(); if (!FORCE_DEMO) DEMO = false; S.me = null; BRAND = null; qcClear(); clearCounts(); MF.f = 'all'; LEAD.member = false; try { localStorage.removeItem('lead-mode'); } catch (e) {}
    /* لا تنتقل الصفحة المفتوحة ولا مرشحات المهام إلى من يدخل بعده على الجهاز نفسه */
    Object.assign(TQ, { tab: 'tasks', st: 'open', unit: '', mine: false }); history.replaceState(null, '', location.pathname + location.search); showLogin(); };

  async function boot() {
    try {
      let a = await D.rpc('org_my_access');
      if (!a || !a.me) { await D.auth.signOut(); return showLogin('الحساب غير نشط. تواصل مع مدير النظام.'); }
      /* أول دخول: يُربط الحساب بسجل العضو الذي بريده هو بريد الدخول، فتعمل صلاحيات تكليفاته فورًا (الملف 9) */
      if (!a.me.faculty_id) { const fid = await D.rpc('org_link_me').catch(() => null); if (fid) { a = await D.rpc('org_my_access'); toast('رُبط حسابك بسجلك في قاعدة أعضاء هيئة التدريس.'); } }
      S.me = a.me; S.acc = a.units || {}; S.glob = a.global || {}; S.appLv = a.apps || {}; S.duties = a.duties || {};
      await loadAll();
      $('#app').classList.remove('hidden', 'guest');
      renderShell();
      const h = (location.hash.match(/#p=([a-z]+)(?:&id=([\w-]+))?/) || []);
      go(h[1] || 'home', h[2] ? { id: h[2] } : {});
      if (!DEMO) checkMustChange();
    } catch (e) { console.error(e); showLogin(pgErr(e)); }
  }
  async function checkMustChange() {
    try {
      const p = (await D.select('profiles', { eq: { app_id: S.me.app_id }, cols: 'app_id,must_change' }))[0];
      if (!p || !p.must_change) return;
      modal('تغيير كلمة المرور المؤقتة', `<p>هذه أول مرة تدخل فيها بكلمة المرور المؤقتة. اختر كلمة مرور جديدة لا تقل عن 10 أحرف، تجمع حروفًا وأرقامًا.</p>
        <div class="formgrid"><label class="f">كلمة المرور الجديدة<input type="password" id="np1" dir="ltr" autocomplete="new-password"></label>
        <label class="f">تأكيد كلمة المرور<input type="password" id="np2" dir="ltr" autocomplete="new-password"></label></div><div class="err"></div>`,
        `<button class="btn pri" id="npOk">حفظ كلمة المرور</button>`);
      $('#mclose').classList.add('hidden');
      $('#npOk').onclick = (ev) => busy(ev.target, async () => {
        const a = val('np1'), b = val('np2');
        if (a.length < 10 || !/\d/.test(a) || !/[^\d]/.test(a)) throw new Error('كلمة المرور 10 أحرف على الأقل، وتجمع حروفًا وأرقامًا.');
        if (a !== b) throw new Error('كلمتا المرور غير متطابقتين.');
        await D.auth.setPassword(a);
        await D.update('profiles', { must_change: false }, { eq: { app_id: S.me.app_id } });
        $('#mclose').classList.remove('hidden'); C.close(); toast('حُفظت كلمة المرور الجديدة.');
      });
    } catch (e) { console.warn(e); }
  }

  async function loadAll() {
    const [units, faculty, members, roles, terms, settings, depts, profiles] = await Promise.all([
      D.select('org_units'), D.select('faculty'), D.select('org_members'), D.select('org_roles', { order: ['sort'] }),
      D.select('terms', { order: ['id'] }), D.select('org_settings'), Promise.resolve([]),
      D.select('profiles', { cols: 'app_id,username,name,email,is_admin,college_role,active' })
    ]);
    Object.assign(S, { units, faculty, members, roles, terms, depts, profiles, settings: (settings[0] || {}).data || {} });
    const [grants, apps, programs, pv] = await Promise.all([D.select('org_grants').catch(() => []), D.select('org_apps').catch(() => []), D.select('programs', { order: ['sort'] }).catch(() => []), D.select('faculty_private').catch(() => [])]);
    Object.assign(S, { grants, apps, programs });
    S.privates = Object.fromEntries(pv.map((p) => [p.faculty_id, p.mobile]));
  }
  C.reload = async () => { qcClear(); await loadAll(); refresh(); toast('حُدّثت البيانات.'); };

  /* ---------------- الإطار والتنقل ---------------- */
  const NAV = [
    ['home', 'الرئيسية', 'home'], ['lead', 'واجهة القيادة', 'chart', () => isAdmin() && isLeader()], ['approvals', 'بانتظار اعتمادي', 'clipboard', () => isLeader()], ['college', 'الكلية', 'college'], ['vices', 'الوكالات', 'bank'], ['depts', 'الأقسام العلمية', 'sitemap'],
    ['units', 'الوحدات', 'cubes'], ['committees', 'اللجان', 'users'], ['-'], ['tasks', 'المهام والتكليفات', 'file'], ['mine', 'مهامي', 'clipboard', () => !!myFac() && viewRole() !== 'staff'], ['memberships', 'العضوية في الوحدات واللجان', 'users', () => !!myFac() && viewRole() !== 'staff'], ['alerts', 'تنبيهاتي', 'bell', () => !!myFac() && viewRole() !== 'staff'], ['advising', 'الإرشاد الأكاديمي', 'users', () => canAdvise()], ['portal', 'بوابة الطالب', 'file', () => portalAny()], ['honor', 'قائمة العميد الشرفية', 'user', () => canHonor()], ['annual', 'الجودة والمؤشرات', 'chart', () => annualSeen()],
    ['reports', 'التقارير', 'chart', () => gcap('reports')], ['settings', 'الإعدادات', 'gear', () => canSettings()]
  ];
  const PAGE_DESC = { collegeprogs: 'الخطة الدراسية والتوصيفات لكل برنامج', sources: 'مصدر كل قسم ومسؤوله وآخر تحديث واكتماله', honor: 'مرتبة حسب المجموع، مع الترتيب داخل القسم والشطر', portal: 'روابط البوابة ومرشدو البرامج', advising: 'طلابي المرشدون ورسائلهم', mine: 'مقرراتي ومتطلباتها هذا الفصل', myschedule: 'مقرراتي ومتطلباتها هذا الفصل', memberships: 'الجهات التي لي فيها دور', mycomms: 'الجهات التي لي فيها دور', alerts: 'ما يحتاج إجراءً مني', approvals: 'ما ينتظر اعتمادي' };
  const TITLES = { approvals: 'بانتظار اعتمادي', lead: 'واجهة القيادة', positions: 'المناصب', home: 'الرئيسية', college: 'كلية الأعمال', vices: 'الوكالات', depts: 'الأقسام العلمية', units: 'الوحدات', committees: 'اللجان', tasks: 'المهام والتكليفات',
    reports: 'التقارير', settings: 'الإعدادات', org: 'الهيكل التنظيمي', faculty: 'أعضاء هيئة التدريس', courses: 'المقررات والجداول', accounts: 'الحسابات والصلاحيات',
    audit: 'سجل التدقيق', apps: 'البرامج والتحديثات', ann: 'الإعلانات', backup: 'النسخ الاحتياطي والنقل', identity: 'الهوية والواجهة', general: 'القوائم والإعدادات العامة',
    mpage: 'المؤشرات', collegeprogs: 'برامج الكلية', sources: 'مصادر البيانات', honor: 'قائمة العميد الشرفية', portal: 'إدارة بوابة الطالب', advising: 'الإرشاد الأكاديمي', files: 'الملفات والمرفقات', notifs: 'الإشعارات', search: 'الاستعلامات', ws: 'الوحدات واللجان', assist: 'المرشد الأكاديمي والدعم الفني', forms: 'النماذج والتقارير', track: 'متابعة النماذج المطلوبة', perms: 'صلاحيات عضو هيئة التدريس', matrix: 'مصفوفة التكليفات والصلاحيات', myschedule: 'مهامي', mine: 'مهامي', memberships: 'العضوية في الوحدات واللجان', mycomms: 'العضوية في الوحدات واللجان', alerts: 'تنبيهاتي', annual: 'الجودة والمؤشرات' };
  const NAV_OF = { sources: 'settings', positions: 'settings', myschedule: 'mine', mycomms: 'memberships', matrix: 'settings', org: 'settings', faculty: 'settings', courses: 'settings', accounts: 'settings', audit: 'settings', apps: 'settings', ann: 'settings', backup: 'settings', identity: 'settings', general: 'settings', assist: 'settings', forms: 'settings', track: 'settings', perms: 'settings', ws: 'units', files: 'tasks', notifs: 'home', search: 'home' };
  const navOfUnit = (u) => !u ? 'home' : u.kind === 'unit' ? 'units' : u.kind === 'committee' ? 'committees' : u.kind === 'department' ? 'depts' : u.id === rootId() ? 'college' : u.kind === 'leadership' ? 'vices' : 'college';
  function renderShell() {
    const st = S.settings; applyTheme(st.theme);
    $('#brand').innerHTML = `<img src="${attr(st.logo || LOGO_IMG)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="emb" style="display:none">${emblem()}</span><div><b>${esc(st.university || 'جامعة الجوف')}</b><span dir="ltr">${esc(st.universityEn || 'Jouf University')}</span></div>`;
    const roleTxt = isAdmin() ? 'مدير النظام' : leadTitle() ? leadTitle() : (S.me.faculty_id ? 'عضو هيئة التدريس' : 'مستخدم');
    const ini = (S.me.name || '؟').replace(/^(د|أ|م)\.\s*/, '').trim().charAt(0);
    $('#topbar').innerHTML = `<button class="ib" id="menuBtn" style="display:none" aria-label="القائمة">${icon('menu')}</button>
      <span class="ttl" id="topTitle"></span><span class="grow"></span>${(LEAD.member && (isLeader() || isAdmin())) || (isLeader() && !isMgmt()) ? `<div class="leadsw" role="group" aria-label="الواجهة"><button class="${LEAD.member ? '' : 'on'}" onclick="C.leadMode(false)">واجهة القيادة</button><button class="${LEAD.member ? 'on' : ''}" onclick="C.leadMode(true)">أعمالي كعضو هيئة تدريس</button></div>` : ''}
      <button class="ib" onclick="C.fullscreen()" aria-label="ملء الشاشة" title="ملء الشاشة">${icon('expand')}</button>
      ${canSettings() ? `<button class="ib" onclick="C.go('settings')" aria-label="الإعدادات" title="الإعدادات">${icon('gear')}</button>` : ''}
      <button class="ib" onclick="C.go('notifs')" aria-label="الإشعارات" title="الإشعارات">${icon('bell')}<span class="badge hidden" id="bellN"></span></button>
      <button class="user" onclick="C.userMenu()" aria-label="حسابي"><span class="av">${esc(ini)}</span><span class="nm"><b>${esc(S.me.name)}</b><small>${esc(roleTxt)}</small></span>${icon('down')}</button>`;
    const KN = { vices: ['leadership', 'administration'], depts: ['department'], units: ['unit'], committees: ['committee'] };
    /* عضو هيئة التدريس (دون رئاسة أو وكالة أو عمادة): مهامه وجدوله وبرامجه ولجانه فقط، دون قوائم الكلية والإعدادات */
    const staff = viewRole() === 'staff';
    const showNav = (k) => staff ? !['college', 'vices', 'depts', 'units', 'committees', 'settings'].includes(k)
      : !KN[k] || fullRead() || S.units.some((u) => KN[k].includes(u.kind) && u.status !== 'archived' && u.id !== rootId() && cap(u.id, 'read'));
    const mine = myDirect();
    /* عضو هيئة التدريس: أربعة عناصر فقط */
    const nb = (p, ic, t) => `<button class="nav" data-p="${p}" onclick="C.go('${p}')">${icon(ic)}${t}</button>`;
    const qsB = `<button class="side-q" onclick="C.qs()">${icon('search')}بحث سريع<kbd>Ctrl K</kbd></button>`;
    $('#side').innerHTML = qsB + (staff ? nb('home', 'home', 'الرئيسية') + nb('mine', 'clipboard', 'مهامي') + nb('memberships', 'users', 'العضوية في الوحدات واللجان') + nb('alerts', 'bell', 'تنبيهاتي') + (canHonor() && !isMgmt() ? nb('honor', 'user', 'قائمة العميد الشرفية') : '') + (canAdvise() ? nb('advising', 'users', 'الإرشاد الأكاديمي') : '') + (portalAny() ? nb('portal', 'file', 'بوابة الطالب') : '') + (annualSeen() ? nb('annual', 'chart', 'الجودة والمؤشرات') : '') +
      `<div class="foot">${esc(st.collegeName || 'كلية الأعمال')} · نظام إدارة الكلية ${VERSION}${DEMO ? '<br>نسخة تجريبية' : ''}</div>` : isMgmt() ? mgmtNav(`<div class="foot">${esc(st.collegeName || 'كلية الأعمال')} · نظام إدارة الكلية ${VERSION}${DEMO ? '<br>نسخة تجريبية' : ''}</div>`) : NAV.map((n) => n[0] === '-' ? '<div class="sep"></div>' : ((n[3] && !n[3]()) || !showNav(n[0])) ? '' :
      `<button class="nav" data-p="${n[0]}" onclick="C.go('${n[0]}')">${icon(n[2])}${esc(n[1])}</button>`).join('') +
      (mine.length ? `<div class="sep"></div><div class="sidehead">جهاتي</div>${mine.slice(0, 10).map((m) => `<button class="nav sub" data-p="u:${m.unit_id}" onclick="C.go('unit',{id:'${m.unit_id}'})">${kindDot((unit(m.unit_id) || {}).kind || 'unit')}<span class="grow">${esc(uName(m.unit_id))}</span><small>${esc(POS[m.position])}</small></button>`).join('')}` : '') +
      `<div class="foot">${esc(st.collegeName || 'كلية الأعمال')} · نظام إدارة الكلية ${VERSION}${DEMO ? '<br>نسخة تجريبية' : ''}</div>`);
    $('#menuBtn').onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); };
    document.addEventListener('click', (e) => { if ($('#side').classList.contains('open') && !$('#side').contains(e.target)) $('#side').classList.remove('open'); });
    bellCount(); refreshUrgent(); renderDock(S.settings.assist, true); if (!staff && isMgmt()) mgmtTeach();
  }
  const go = (C.go = (page, opts) => {
    if (S.me && SET_PAGES.includes(page) && !canSettings()) { toast('الإعدادات لمدير النظام ومن يحدده.', true); page = 'home'; opts = {}; }
    if (page === 'org' && ORG.dirty && VIEW.page === 'org' && !(opts && opts.force)) { if (!window.confirm('في الجهة المحددة تغييرات لم تُحفظ. هل تريد تجاهلها؟')) return; ORG.dirty = false; }
    if (VIEW.page === 'app' && page !== 'app' && window.__CAPP && window.__CAPP.busy()) { if (!window.confirm('لم يكتمل حفظ بيانات البرنامج بعد. هل تغادر؟')) return; }
    VIEW = Object.assign({ page }, opts || {});
    $('#side').classList.remove('open');
    const navKey = page === 'unit' ? ($('#side .nav[data-p="u:' + VIEW.id + '"]') ? 'u:' + VIEW.id : navOfUnit(unit(VIEW.id))) : ((opts && opts.nav) || NAV_OF[page] || page);
    $$('#side .nav').forEach((b) => b.classList.toggle('on', b.dataset.p === navKey));
    const h = '#p=' + page + (VIEW.id ? '&id=' + VIEW.id : ''); if (location.hash !== h) history.replaceState(null, '', h);
    const title = page === 'unit' ? uName(VIEW.id) : page === 'app' ? '' : page === 'apps' && !manageAny() ? 'برامجي' : page === 'settings' && viewRole() === 'staff' ? 'حسابي' : (TITLES[page] || '');
    $('#topTitle').textContent = page === 'home' ? '' : title;
    const flush = page === 'home' || page === 'app';
    $('#main').classList.toggle('flush', flush);
    const v = $('#view');
    v.innerHTML = (DEMO && !flush ? '<div class="banner">نسخة تجريبية ببيانات وهمية: جرّب كل الشاشات، ولا يُحفظ شيء بعد إعادة تحميل الصفحة.</div>' : '') +
      (flush ? '' : `<div class="pghead page-hero"><div class="ph-t"><h1>${esc(title)}</h1>${PAGE_DESC[page] ? `<p>${esc(PAGE_DESC[page])}</p>` : ''}<div class="ph-chips">${PAGE_DESC[page] ? heroChips() : ''}</div></div>${NAV_OF[page] === 'settings' && viewRole() !== 'staff' ? `<button class="btn sm noprint" onclick="C.go('settings')">${icon('back')}الإعدادات</button>` : ''}</div>`) +
      '<div id="printHead" class="printhead"></div><div id="pg"></div>';
    const fn = { home: pgHome, college: pgCollege, vices: () => pgList(['leadership', 'administration'], true), depts: () => pgList(['department']), units: () => pgList(['unit']), committees: () => pgList(['committee']),
      ws: pgWs, tasks: pgTasks, org: pgOrg, unit: pgUnit, faculty: pgFaculty, courses: pgCourses, reports: pgReports, accounts: pgAccounts, audit: pgAudit, settings: pgSettings,
      general: pgGeneral, identity: pgIdentity, apps: pgApps, app: pgApp, ann: pgAnn, backup: pgBackup, files: pgFiles, notifs: pgNotifs, search: pgSearch, assist: pgAssist, forms: pgForms, track: pgTrack, perms: pgPerms, matrix: pgMatrix, lead: pgLead, mpage: pgMPage, collegeprogs: pgProgs, sources: pgSources, honor: pgHonor, portal: pgPortal, advising: pgAdvising, approvals: pgApprovals, positions: pgPositions, myschedule: pgMine, mine: pgMine, memberships: pgComms, mycomms: pgComms, alerts: pgAlerts, annual: pgAnnual }[page] || pgHome;
    const pf0 = performance.now(), pfN = PERF.n;
    Promise.resolve(fn()).then((html) => { if (typeof html === 'string') $('#pg').innerHTML = html; if (VIEW.after) VIEW.after(); if (PERF.on) toast(page + ': ' + Math.round(performance.now() - pf0) + ' م.ث · ' + (PERF.n - pfN) + ' طلب'); }).catch((e) => { console.error(e); $('#pg').innerHTML = `<div class="panel bad">${esc(pgErr(e))}</div>`; });
    window.scrollTo(0, 0);
  });
  const refresh = (C.refresh = () => go(VIEW.page, Object.assign({}, VIEW, { force: true })));
  C.fullscreen = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) {} };

  /* =====================================================================
     الرئيسية
     ===================================================================== */
  const curTerm = () => S.terms.find((t) => t.is_current) || S.terms[S.terms.length - 1] || null;
  const reqLine = (r) => {
    const late = r.due_date && r.due_date < today() && r.status !== 'done';
    return `<div><a href="#" onclick="C.openReq('${r.id}');return false" class="grow">${esc(r.title)}</a>${chip(RSTAT[r.status][0], RSTAT[r.status][1])}
      <span class="small muted">${esc(uName(r.unit_id))}</span><span class="small ${late ? 'bad' : 'muted'}">${r.due_date ? (late ? 'متأخرة: ' : 'الاستحقاق: ') + fmtD(r.due_date) : ''}</span></div>`;
  };
  const CHG = { create: 'أُنشئت', move: 'نُقلت تبعيتها', rename: 'أُعيدت تسميتها', status: 'تغيرت حالتها', head: 'عُيّن مسؤولها', exclude: 'استُثنيت صلاحيات موروثة', delete: 'حُذفت' };
  const changeList = (rows) => `<div class="mlist">${rows.map((c) => `<div><span class="grow"><b>${esc(uName(c.unit_id) !== '—' ? uName(c.unit_id) : (c.from_value || c.unit_id))}</b>: ${CHG[c.action] || c.action}
      ${c.action === 'move' ? ` من «${esc((c.details || {}).from_name || c.from_value || '—')}» إلى «${esc((c.details || {}).to_name || c.to_value || '—')}»` : ''}
      ${c.action === 'rename' ? ` من «${esc(c.from_value)}» إلى «${esc(c.to_value)}»` : ''}
      ${c.action === 'status' ? ` إلى «${esc(USTATUS[c.to_value] || c.to_value)}»` : ''}
      ${c.action === 'head' ? `: ${esc(c.to_value)}` : ''}
      ${(c.details || {}).note ? `<br><span class="small muted">السبب: ${esc(c.details.note)}</span>` : ''}</span>
      <span class="small muted">${fmtDT(c.at)} · ${esc(pName(c.actor_app_id))}</span></div>`).join('')}</div>`;

  /* =====================================================================
     الهيكل التنظيمي: شجرة + محرر الجهة + مراجعة الصلاحيات عند النقل
     ===================================================================== */
  const ORG = { sel: null, open: new Set(['deanship', 'vice']), form: null, orig: null, dirty: false, showArch: false, q: '', showPast: false };
  const unitForm = (u) => {
    const h = u ? headOf(u.id) : null;
    return { id: u ? u.id : '', name: u ? u.name : '', kind: u ? u.kind : 'committee', description: u ? u.description : '', parent_id: u ? (u.parent_id || '') : (ORG.newParent || 'vice'),
      status: u ? u.status : 'active', dept_ref: u ? (u.dept_ref || '') : '', term_start: u ? (u.term_start || '') : '', term_end: u ? (u.term_end || '') : '',
      apps: u ? ((u.data || {}).apps || []).slice().sort() : [], head: h ? h.faculty_id : '', headStart: today(), data: u ? (u.data || {}) : {}, entry_app: u ? (u.entry_app || '') : '' };
  };
  function pgOrg() {
    if (VIEW.id && unit(VIEW.id) && ORG.sel !== VIEW.id && !ORG.dirty) { ORG.sel = VIEW.id; pathOf(VIEW.id).forEach((p) => ORG.open.add(p.id)); ORG.form = null; }
    if (!ORG.sel || (ORG.sel !== '__new' && !unit(ORG.sel))) { ORG.sel = null; }
    if (ORG.sel && !ORG.form) { ORG.form = unitForm(ORG.sel === '__new' ? null : unit(ORG.sel)); ORG.orig = JSON.stringify(ORG.form); ORG.dirty = false; }
    VIEW.after = () => { const s = $('.node.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); afterEditor(); };
    return `<div class="row noprint" style="margin-bottom:12px">
        <input class="inp" placeholder="ابحث عن جهة…" value="${attr(ORG.q)}" oninput="C.orgSearch(this.value)" aria-label="بحث في الهيكل" style="width:240px">
        <button class="btn sm" onclick="C.orgExpand(true)">توسيع الكل</button><button class="btn sm" onclick="C.orgExpand(false)">طي الكل</button>
        <label class="small row" style="gap:4px"><input type="checkbox" ${ORG.showArch ? 'checked' : ''} onchange="C.orgArch(this.checked)">إظهار المؤرشف</label>
        <span class="grow"></span>
        ${isAdmin() ? '<button class="btn pri" onclick="C.orgNew()">إضافة جهة</button>' : ''}
      </div>
      <div class="orgwrap">
        <div><div class="tree" id="tree" role="tree" aria-label="الهيكل التنظيمي">${treeHtml()}</div>
          <div class="legend">${Object.keys(KIND).map((k) => `<span>${kindDot(k)}${KIND[k]}</span>`).join('')}</div></div>
        <div id="editor">${editorHtml()}</div>
      </div>`;
  }
  function treeHtml() {
    const q = ORG.q.trim();
    const match = new Set();
    if (q) S.units.filter((u) => u.name.includes(q)).forEach((u) => pathOf(u.id).forEach((p) => match.add(p.id)));
    const node = (u) => {
      if (u.status === 'archived' && !ORG.showArch) return '';
      if (q && !match.has(u.id)) return '';
      const ks = kids(u.id).filter((k) => (k.status !== 'archived' || ORG.showArch) && (!q || match.has(k.id)));
      const open = q ? true : ORG.open.has(u.id);
      const h = headOf(u.id);
      return `<li role="treeitem" aria-expanded="${ks.length ? open : ''}" aria-selected="${ORG.sel === u.id}">
        <div class="node ${ORG.sel === u.id ? 'sel' : ''} ${u.status}" onclick="C.orgSel('${u.id}')">
          ${ks.length ? `<button class="tg" onclick="event.stopPropagation();C.orgToggle('${u.id}')" aria-label="${open ? 'طي' : 'فتح'} ${attr(u.name)}">${open ? '▾' : '◂'}</button>` : '<span class="tg"></span>'}
          ${kindDot(u.kind)}<span class="nm">${esc(u.name)}</span>${h ? `<span class="hd">${esc(fName(h.faculty_id))}</span>` : ''}
        </div>${ks.length && open ? `<ul role="group">${ks.map(node).join('')}</ul>` : ''}</li>`;
    };
    const out = roots().map(node).join('');
    return out ? `<ul>${out}</ul>` : '<div class="empty">لا توجد جهات مطابقة.</div>';
  }
  const redrawTree = () => { const t = $('#tree'); if (t) t.innerHTML = treeHtml(); };
  C.orgSearch = (v) => { ORG.q = v; redrawTree(); };
  C.orgToggle = (id) => { ORG.open.has(id) ? ORG.open.delete(id) : ORG.open.add(id); redrawTree(); };
  C.orgExpand = (on) => { ORG.open = on ? new Set(S.units.map((u) => u.id)) : new Set(roots().map((r) => r.id)); redrawTree(); };
  C.orgArch = (on) => { ORG.showArch = on; redrawTree(); };
  C.orgSel = (id) => {
    if (ORG.dirty && ORG.sel !== id && !window.confirm('في الجهة الحالية تغييرات لم تُحفظ. هل تريد تجاهلها؟')) return;
    ORG.sel = id; ORG.form = unitForm(unit(id)); ORG.orig = JSON.stringify(ORG.form); ORG.dirty = false; ORG.open.add(id);
    VIEW.id = id; history.replaceState(null, '', '#p=org&id=' + id);
    redrawTree(); $('#editor').innerHTML = editorHtml(); afterEditor();
  };
  C.orgNew = () => {
    if (ORG.dirty && !window.confirm('في الجهة الحالية تغييرات لم تُحفظ. هل تريد تجاهلها؟')) return;
    ORG.newParent = ORG.sel && unit(ORG.sel) ? ORG.sel : 'vice';
    ORG.sel = '__new'; ORG.form = unitForm(null); ORG.orig = JSON.stringify(ORG.form); ORG.dirty = false;
    redrawTree(); $('#editor').innerHTML = editorHtml(); $('#oName').focus();
  };
  function editorHtml() {
    if (!ORG.sel) return `<div class="panel"><h2>اختر جهة من الشجرة</h2><p class="muted">تظهر هنا بيانات الجهة وتبعيتها ومسؤولها وأعضاؤها وسجل تغييراتها.${isAdmin() ? ' ويمكنك تعديلها وتغيير جهة تبعيتها من قائمة «تتبع إلى» ثم الضغط على «حفظ التغييرات».' : ''}</p></div>`;
    const f = ORG.form, isNew = ORG.sel === '__new', u = isNew ? null : unit(ORG.sel);
    const ad = isAdmin(), canDesc = ad || (u && cap(u.id, 'manage'));
    const dis = ad ? '' : 'disabled';
    const exclude = isNew ? null : new Set(desc(u.id));
    const path = !isNew ? pathOf(u.id) : [];
    return `<div class="panel editor">
      <div class="row" style="align-items:flex-start;margin-bottom:6px"><div class="grow"><h2 style="margin:0">${isNew ? 'جهة جديدة' : esc(u.name)}</h2>
        ${!isNew ? `<div class="path">${path.map((p, i) => i === path.length - 1 ? `<b>${esc(p.name)}</b>` : esc(p.name)).join(' ‹ ')}</div>` : ''}</div>
        ${u && u.is_fixed ? chip('جهة ثابتة في المرحلة الأولى', 'brass') : ''} ${u ? chip(USTATUS[u.status], u.status === 'active' ? 'ok' : 'wait') : ''}
        ${u && cap(u.id, 'read') ? `<button class="btn sm" onclick="C.go('unit',{id:'${u.id}'})">مساحة العمل</button>` : ''}</div>
      <div id="dirtyBar" class="dirty ${ORG.dirty ? '' : 'hidden'}" role="status" style="margin:10px 0">تغييرات لم تُحفظ بعد.</div>
      <div class="formgrid" oninput="C.orgInput()" onchange="C.orgInput()">
        <label class="f">اسم الجهة<input id="oName" value="${attr(f.name)}" ${dis} maxlength="150"></label>
        <label class="f">النوع<select id="oKind" ${dis || (u && u.is_fixed ? 'disabled' : '')}>${Object.keys(KIND).map((k) => opt(k, KIND[k], f.kind)).join('')}</select></label>
        <label class="f">تتبع إلى (الجهة الأم)<select id="oParent" ${dis}>${unitOptions(f.parent_id, exclude, { none: f.parent_id ? null : '— جهة عليا (بلا تبعية) —' }) || ''}${!f.parent_id ? '' : ''}</select></label>
        <label class="f">الحالة<select id="oStatus" ${dis}>${Object.keys(USTATUS).map((k) => opt(k, USTATUS[k], f.status)).join('')}</select></label>
        <label class="f full">الوصف والمهام<textarea id="oDesc" ${canDesc ? '' : 'disabled'} maxlength="2000">${esc(f.description)}</textarea></label>
        <label class="f">المسؤول / الرئيس<select id="oHead" ${dis}>${facOptions(f.head, '— بلا مسؤول —')}</select></label>
        <label class="f">بداية تكليف المسؤول الجديد<input type="date" id="oHeadStart" value="${attr(f.headStart)}" ${dis}></label>
        <label class="f">بداية تكليف الجهة<input type="date" id="oStart" value="${attr(f.term_start)}" ${dis}></label>
        <label class="f">نهاية تكليف الجهة<input type="date" id="oEnd" value="${attr(f.term_end)}" ${dis}></label>
        ${u ? `<div class="f full">البرامج<span>${S.apps.filter((a) => a.unit_id === u.id).map((a) => esc(a.name)).join('، ') || 'لا توجد برامج'} · <a href="#" onclick="C.go('apps',{unit:'${u.id}'});return false">إدارة البرامج</a></span></div>` : ''}
        <label class="f full">عند الدخول من «العضوية في الوحدات واللجان» يُفتح:<select id="oEntry" ${dis}><option value="">مساحة عمل الجهة (برامجها ومهامها)</option>${S.apps.filter((a) => a.active !== false).slice()
          .sort((a, b) => (b.unit_id === (u && u.id)) - (a.unit_id === (u && u.id)) || a.name.localeCompare(b.name, 'ar')).map((a) => opt(a.id, a.name + ' · ' + uName(a.unit_id), f.entry_app)).join('')}</select>
          <span class="tiny muted">يُفتح البرنامج لأعضاء الجهة بمستوى دورهم فيها: الرئيس إدارة، والعضو والمقرر استخدام، والمطّلع اطلاع؛ والصلاحية الفردية تغلب.</span></label>
      </div>
      <div class="row" style="margin-top:16px">
        ${canDesc ? `<button class="btn pri" id="oSave" onclick="C.orgSave(this)" ${ORG.dirty ? '' : 'disabled'}>حفظ التغييرات</button>
        <button class="btn" id="oCancel" onclick="C.orgCancel()" ${ORG.dirty || isNew ? '' : 'disabled'}>${isNew ? 'إلغاء' : 'إلغاء التغييرات'}</button>` : '<span class="small muted">عرض فقط: تعديل الهيكل من صلاحية مدير النظام.</span>'}
        <span class="grow"></span>
        ${ad && u && !u.is_fixed ? `<button class="btn danger sm" onclick="C.orgDelete('${u.id}')">حذف الجهة</button>` : ''}
      </div></div>
      ${u ? `<div class="panel"><div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">الأعضاء والتكليفات</h2>
          <label class="small row" style="gap:4px"><input type="checkbox" ${ORG.showPast ? 'checked' : ''} onchange="C.orgPast(this.checked)">إظهار التكليفات المنتهية</label>
          ${cap(u.id, 'manage') ? `<button class="btn sm" onclick="C.memAdd('${u.id}')">إضافة عضو</button>` : ''}</div>
        ${membersHtml(u.id, ORG.showPast)}</div>
      <div class="panel"><h2>سجل تغييرات الجهة</h2><div id="uHist" class="small muted">جارٍ التحميل…</div></div>` : ''}`;
  }
  const loadHist = async (id, el) => { try { const r = await D.select('org_changes', { eq: { unit_id: id }, order: ['at', false], limit: 50 }); const e = $(el); if (e) e.innerHTML = r.length ? changeList(r) : 'لا توجد تغييرات مسجلة.'; } catch (e) { const x = $(el); if (x) x.textContent = pgErr(e); } };
  C.orgPast = (on) => { ORG.showPast = on; $('#editor').innerHTML = editorHtml(); afterEditor(); };
  const afterEditor = () => { if (ORG.sel && ORG.sel !== '__new') loadHist(ORG.sel, '#uHist'); };
  C.orgInput = () => {
    const f = ORG.form;
    ['name:oName', 'kind:oKind', 'parent_id:oParent', 'status:oStatus', 'description:oDesc', 'head:oHead', 'headStart:oHeadStart', 'term_start:oStart', 'term_end:oEnd', 'dept_ref:oDept', 'entry_app:oEntry']
      .forEach((p) => { const [k, id] = p.split(':'); const e = document.getElementById(id); if (e) f[k] = e.value; });
    const o = JSON.parse(ORG.orig); o.headStart = f.headStart;
    ORG.dirty = JSON.stringify(Object.assign({}, f, { headStart: '' })) !== JSON.stringify(Object.assign({}, o, { headStart: '' }));
    $('#dirtyBar').classList.toggle('hidden', !ORG.dirty);
    if ($('#oSave')) $('#oSave').disabled = !ORG.dirty;
    if ($('#oCancel') && ORG.sel !== '__new') $('#oCancel').disabled = !ORG.dirty;
  };
  C.orgCancel = () => {
    if (ORG.sel === '__new') { ORG.sel = null; ORG.form = null; ORG.dirty = false; redrawTree(); $('#editor').innerHTML = editorHtml(); return; }
    ORG.form = JSON.parse(ORG.orig); ORG.dirty = false; $('#editor').innerHTML = editorHtml(); afterEditor(); toast('أُلغيت التغييرات غير المحفوظة.');
  };
  C.orgSave = async (btn) => {
    const f = ORG.form, o = JSON.parse(ORG.orig), isNew = ORG.sel === '__new', u = unit(ORG.sel);
    if (!f.name.trim()) return toast('اسم الجهة مطلوب.', true);
    if (!isAdmin()) { // مسؤول الجهة: الوصف فقط
      return busy(btn, async () => { await D.update('org_units', { description: f.description }, { eq: { id: u.id } }); await afterSave(u.id); });
    }
    const LBL = { name: 'الاسم', kind: 'النوع', parent_id: 'جهة التبعية', status: 'الحالة', description: 'الوصف', head: 'المسؤول', term_start: 'بداية التكليف', term_end: 'نهاية التكليف', dept_ref: 'القسم المقابل', entry_app: 'وجهة الدخول من «العضوية في الوحدات واللجان»' };
    const show = (k, v) => k === 'parent_id' ? uName(v) : k === 'head' ? (v ? fName(v) : '—') : k === 'kind' ? KIND[v] : k === 'status' ? USTATUS[v] : k === 'apps' ? (v.map((a) => APPS[a].name).join('، ') || '—') : k === 'dept_ref' ? ((S.depts.find((d) => d.id === v) || {}).name || '—') : k === 'entry_app' ? (v ? ((S.apps.find((a) => a.id === v) || {}).name || v) : 'مساحة عمل الجهة') : (v || '—');
    const diffs = Object.keys(LBL).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(o[k]));
    const moving = !isNew && f.parent_id !== o.parent_id;
    let prev = null;
    if (moving) { prev = await busy(btn, () => D.rpc('org_move_preview', { p_unit: u.id, p_new_parent: f.parent_id || null })); if (!prev) return; }
    const capTxt = (c) => Object.keys(c || {}).filter((k) => c[k]).map((k) => CAPS[k] || k).join('، ');
    const body = `${isNew ? `<p>ستُنشأ جهة جديدة باسم <b>${esc(f.name)}</b> تابعة إلى <b>${esc(uName(f.parent_id))}</b>.</p>` :
      `<p>راجع التغييرات قبل اعتمادها:</p><div class="tw"><table><tr><th>البيان</th><th>قبل</th><th>بعد</th></tr>${diffs.map((k) => `<tr><td>${LBL[k]}</td><td>${esc(show(k, o[k]))}</td><td><b>${esc(show(k, f[k]))}</b></td></tr>`).join('')}</table></div>`}
      ${moving ? `<h3 style="margin:18px 0 6px">مراجعة الصلاحيات المتأثرة بالنقل</h3>
        <p class="small muted">النقل يغيّر التبعية التنظيمية فقط. الأدوار الممنوحة على الجهة الجديدة «مع فروعها» لا تسري تلقائيًا على هذه الجهة${prev.subtree ? ' وفروعها (' + prev.subtree + ')' : ''} إلا إذا أكدتها هنا.</p>
        ${prev.gained.length ? `<div class="mlist">${prev.gained.map((g) => `<div><label class="row grow" style="gap:8px"><input type="checkbox" class="gainOk" value="${attr(g.grant_id)}"><span><b>${esc(g.user)}</b> · ${esc(g.role)} عبر «${esc(g.via)}»<br><span class="small muted">${esc(capTxt(g.caps))}</span></span></label></div>`).join('')}</div>
          <p class="small">الصلاحيات غير المحددة لن تسري على هذه الجهة (يُسجَّل استثناء يمكن إلغاؤه من «الحسابات والصلاحيات»).</p>` : '<p class="small">لا توجد صلاحيات موروثة جديدة.</p>'}
        ${prev.lost.length ? `<p class="small" style="margin-top:10px">ستتوقف هذه الصلاحيات الموروثة من الجهة السابقة:</p><div class="mlist">${prev.lost.map((g) => `<div class="small"><b>${esc(g.user)}</b> · ${esc(g.role)} عبر «${esc(g.via)}»</div>`).join('')}</div>` : ''}
        <label class="f" style="margin-top:12px">سبب النقل أو رقم القرار (اختياري)<input id="mvNote" maxlength="300"></label>` : ''}
      <div class="err"></div>`;
    modal(moving ? 'تأكيد نقل الجهة وحفظ التغييرات' : 'تأكيد حفظ التغييرات', body, `<button class="btn pri" id="svOk">${moving ? 'اعتماد النقل والحفظ' : 'اعتماد وحفظ'}</button><button class="btn" onclick="C.close()">تراجع</button>`, true);
    $('#svOk').onclick = (ev) => busy(ev.target, async () => {
      const exclude = moving ? prev.gained.filter((g) => !$$('.gainOk').some((c) => c.checked && c.value === g.grant_id)).map((g) => g.grant_id) : [];
      const p = { name: f.name.trim(), kind: f.kind, description: f.description, parent_id: f.parent_id || '', status: f.status, dept_ref: f.dept_ref || '', term_start: f.term_start || '', term_end: f.term_end || '', data: Object.assign({}, f.data || {}, { apps: f.apps }) };
      if (!isNew) p.id = u.id;
      const id = await D.rpc('org_save_unit', { p, p_exclude: exclude, p_note: moving ? val('mvNote') : '' });
      if (f.head !== o.head) await D.rpc('org_set_head', { p_unit: id, p_faculty: f.head || null, p_start: f.headStart || today(), p_end: null });
      if ((f.entry_app || '') !== (o.entry_app || '')) await D.update('org_units', { entry_app: f.entry_app || null }, { eq: { id } });   /* الملف 18 */
      C.close(); await afterSave(id); toast(moving ? 'نُقلت الجهة وحُفظت التغييرات.' : 'حُفظت التغييرات.');
    });
  };
  async function afterSave(id) {
    const a = await D.rpc('org_my_access'); S.acc = a.units || {}; S.glob = a.global || {};
    [S.units, S.members, S.grants] = await Promise.all([D.select('org_units'), D.select('org_members'), D.select('org_grants').catch(() => [])]);
    ORG.sel = id; ORG.form = unitForm(unit(id)); ORG.orig = JSON.stringify(ORG.form); ORG.dirty = false; pathOf(id).forEach((p) => ORG.open.add(p.id));
    if (VIEW.page === 'org') { redrawTree(); $('#editor').innerHTML = editorHtml(); afterEditor(); history.replaceState(null, '', '#p=org&id=' + id); } else refresh();
  }
  C.orgDelete = async (id) => {
    const u = unit(id); if (kids(id).length) return toast('انقل الجهات التابعة أولًا أو أرشف الجهة بدل حذفها.', true);
    if (!(await confirmBox('حذف الجهة', `<p>حذف «${esc(u.name)}» نهائي. الأفضل غالبًا تغيير حالتها إلى «مؤرشفة» للاحتفاظ بسجلاتها. هل تريد الحذف؟</p>`, 'حذف نهائي', true))) return;
    await busy(null, async () => { await D.remove('org_units', { eq: { id } }); ORG.sel = null; ORG.form = null; ORG.dirty = false; S.units = await D.select('org_units'); refresh(); toast('حُذفت الجهة.'); });
  };

  /* الأعضاء والتكليفات (تُستخدم في الهيكل ومساحة العمل) */
  function membersHtml(unitId, past) {
    const rows = S.members.filter((m) => m.unit_id === unitId && (past || activeM(m) || m.start_date > today()))
      .sort((a, b) => (a.position === 'head' ? -1 : b.position === 'head' ? 1 : 0) || (activeM(b) - activeM(a)) || a.start_date.localeCompare(b.start_date));
    if (!rows.length) return '<div class="empty">لا يوجد أعضاء مكلفون.</div>';
    const mg = cap(unitId, 'manage');
    return `<div class="mlist">${rows.map((m) => { const on = activeM(m); return `<div class="${on ? '' : 'past'}">
        <span class="grow"><b>${esc(fName(m.faculty_id))}</b> ${chip(POS[m.position] + (m.title ? ' · ' + m.title : ''), m.position === 'head' ? 'brass' : '')}
        ${!on ? chip(m.start_date > today() ? 'يبدأ لاحقًا' : 'منتهٍ') : ''}</span>
        <span class="small muted">${fmtD(m.start_date)} ← ${m.end_date ? fmtD(m.end_date) : 'مستمر'}</span>
        ${mg && on && (m.position !== 'head' || isAdmin()) ? `<button class="btn sm" onclick="C.memEnd('${m.id}')">إنهاء التكليف</button>` : ''}</div>`; }).join('')}</div>`;
  }
  C.memAdd = (unitId) => {
    const cur = new Set(S.members.filter((m) => m.unit_id === unitId && activeM(m)).map((m) => m.faculty_id));
    modal('إضافة عضو إلى ' + uName(unitId), `<div class="formgrid">
      <label class="f full">عضو هيئة التدريس<select id="maF">${facOptions('', undefined, S.faculty.filter((f) => !cur.has(f.id) && f.status !== 'غير نشط').sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')))}</select></label>
      <label class="f">الصفة<select id="maP">${['member', 'deputy', 'secretary', 'viewer'].map((k) => opt(k, POS[k])).join('')}</select></label>
      <label class="f">المسمى (اختياري)<input id="maT" maxlength="80"></label>
      <label class="f">بداية التكليف<input type="date" id="maS" value="${today()}"></label>
      <label class="f">نهاية التكليف (اختياري)<input type="date" id="maE"></label></div>
      <p class="small muted">المسؤول يُعيَّن من حقل «المسؤول / الرئيس» في الهيكل التنظيمي (صلاحية مدير النظام).</p><div class="err"></div>`,
      `<button class="btn pri" id="maOk">إضافة</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#maOk').onclick = (ev) => busy(ev.target, async () => {
      if (!val('maF')) throw new Error('اختر عضو هيئة التدريس.');
      if (val('maE') && val('maE') < val('maS')) throw new Error('تاريخ النهاية قبل تاريخ البداية.');
      await D.insert('org_members', { unit_id: unitId, faculty_id: val('maF'), position: val('maP'), title: val('maT'), start_date: val('maS') || today(), end_date: val('maE') || null });
      S.members = await D.select('org_members'); C.close(); refreshMembers(unitId); toast('أُضيف العضو.');
      const f = fac(val('maF')); if (f && f.profile_app_id) notify([f.profile_app_id], 'كُلّفت بعضوية ' + uName(unitId));
    });
  };
  C.memEnd = async (id) => {
    const m = S.members.find((x) => x.id === id);
    if (!(await confirmBox('إنهاء التكليف', `<p>سينتهي تكليف <b>${esc(fName(m.faculty_id))}</b> في «${esc(uName(m.unit_id))}» بتاريخ اليوم، ويبقى في السجل.</p>`, 'إنهاء التكليف'))) return;
    await busy(null, async () => {
      if (m.position === 'head') await D.rpc('org_set_head', { p_unit: m.unit_id, p_faculty: null, p_start: today(), p_end: null });
      else await D.update('org_members', { end_date: today() < m.start_date ? m.start_date : today() }, { eq: { id } });
      S.members = await D.select('org_members'); refreshMembers(m.unit_id); toast('انتهى التكليف.');
    });
  };
  const refreshMembers = (unitId) => {
    if (VIEW.page === 'org') { ORG.form = unitForm(unit(unitId)); ORG.orig = JSON.stringify(ORG.form); $('#editor').innerHTML = editorHtml(); afterEditor(); redrawTree(); }
    else refresh();
  };

  /* =====================================================================
     الوحدات واللجان: قائمة مساحات العمل
     ===================================================================== */
  async function pgWs() {
    const reqs = await D.select('org_requests', { eq: { archived: false }, cols: 'id,unit_id,status,due_date' }).catch(() => []);
    const open = {}; reqs.forEach((r) => { if (r.status !== 'done' && r.status !== 'rejected') open[r.unit_id] = (open[r.unit_id] || 0) + 1; });
    const card = (u) => { const h = headOf(u.id), can = cap(u.id, 'read');
      return `<button class="ws ${u.kind} ${can ? '' : 'locked'}" onclick="C.go('unit',{id:'${u.id}'})" style="border-inline-start-color:var(--k-${u.kind})">
        <h3>${esc(u.name)}</h3><span class="meta">تتبع: ${esc(uName(u.parent_id))}</span>
        <span class="meta">${h ? 'المسؤول: ' + esc(fName(h.faculty_id)) : 'لم يُعيَّن مسؤول'}</span>
        <span class="row">${u.status !== 'active' ? chip(USTATUS[u.status], 'wait') : ''}${open[u.id] ? chip(open[u.id] + ' مهام مفتوحة', 'brass') : ''}${!can ? chip('للاطلاع بإذن') : ''}${((u.data || {}).apps || []).length ? chip(((u.data || {}).apps || []).length + ' برنامج') : ''}</span></button>`; };
    const vis = S.units.filter((u) => u.status !== 'archived');
    const grp = (title, list) => list.length ? `<h2 style="margin:22px 0 10px">${title}</h2><div class="wsgrid">${list.sort(sortU).map(card).join('')}</div>` : '';
    return grp('الوحدات', vis.filter((u) => u.kind === 'unit')) + grp('اللجان', vis.filter((u) => u.kind === 'committee')) +
      grp('الأقسام العلمية', vis.filter((u) => u.kind === 'department')) + grp('القيادة والإدارة والجهات الأخرى', vis.filter((u) => ['leadership', 'administration', 'other'].includes(u.kind)));
  }

  /* =====================================================================
     مساحة عمل الجهة: المهام والطلبات، الأعضاء، البرامج، السجل
     ===================================================================== */
  const WS = { tab: 'tasks', status: 'open', arch: false };
  async function pgUnit() {
    const u = unit(VIEW.id); if (!u) return '<div class="panel">الجهة غير موجودة.</div>';
    if (VIEW.tab) { WS.tab = VIEW.tab; delete VIEW.tab; }
    const h = headOf(u.id), can = cap(u.id, 'read');
    const head = `<div class="panel" style="border-top:5px solid ${unitColor(u.id)}"><div class="row" style="align-items:flex-start"><div class="grow">
        <div class="path">${pathOf(u.id).map((p) => esc(p.name)).join(' ‹ ')}</div>
        <p style="margin:6px 0 0">${esc(u.description || '')}</p></div>
        ${chip(KIND[u.kind])} ${chip(USTATUS[u.status], u.status === 'active' ? 'ok' : 'wait')}</div>
        <dl class="kv" style="margin-top:12px"><dt>المسؤول</dt><dd>${h ? esc(fName(h.faculty_id)) + ' <span class="small muted">منذ ' + fmtD(h.start_date) + '</span>' : '—'}</dd>
        <dt>عدد الأعضاء</dt><dd>${S.members.filter((m) => m.unit_id === u.id && activeM(m)).length}</dd>
        ${u.term_start || u.term_end ? `<dt>مدة التكليف</dt><dd>${fmtD(u.term_start)} ← ${fmtD(u.term_end)}</dd>` : ''}</dl>
        <div class="row noprint" style="margin-top:12px"><button class="btn sm" onclick="C.go('ws')">كل الوحدات واللجان</button><button class="btn sm" onclick="C.go('org',{id:'${u.id}'})">موقعها في الهيكل</button>${cap(u.id, 'manage') ? `<button class="btn sm" onclick="C.unitColor('${u.id}')"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${unitColor(u.id)}"></span> لون الجهة</button>` : ''}</div></div>`;
    if (!can) return head + '<div class="panel"><h2>لا تملك صلاحية الاطلاع على أعمال هذه الجهة</h2><p class="muted">يمنح مدير النظام الصلاحيات حسب الدور والجهة. إن كنت عضوًا فيها فتأكد أن حسابك مرتبط بسجلك في قاعدة أعضاء هيئة التدريس.</p></div>';
    const tabs = [['tasks', 'المهام والطلبات'], ['forms', 'النماذج والتقارير'], ['members', 'الأعضاء'], ['apps', 'البرامج'], ['hist', 'السجل']];
    let body = '';
    if (WS.tab === 'tasks') body = await unitTasks(u);
    else if (WS.tab === 'members') body = `<div class="row" style="margin-bottom:10px"><span class="grow"></span>${cap(u.id, 'manage') ? `<button class="btn sm" onclick="C.memAdd('${u.id}')">إضافة عضو</button>` : ''}</div>${membersHtml(u.id, true)}`;
    else if (WS.tab === 'apps') body = unitApps(u);
    else if (WS.tab === 'forms') body = await unitForms(u);
    else { body = '<div id="wsHist">جارٍ التحميل…</div>'; VIEW.after = () => loadHist(u.id, '#wsHist'); }
    return head + `<div class="panel"><div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${WS.tab === t[0]}" class="${WS.tab === t[0] ? 'on' : ''}" onclick="C.wsTab('${t[0]}')">${t[1]}</button>`).join('')}</div>${body}</div>`;
  }
  C.wsTab = (t) => { WS.tab = t; refresh(); };
  function unitApps(u) {
    const apps = S.apps.filter((a) => a.unit_id === u.id && a.active).sort((a, b) => a.sort - b.sort);
    return `<div class="row" style="margin-bottom:10px"><span class="grow small muted">برامج الجهة تعمل داخل الموقع، وتُحفظ بياناتها في قاعدة البيانات ويراها كل أعضاء الجهة.</span>
      ${cap(u.id, 'manage') ? `<button class="btn sm pri" onclick="C.appNew('${u.id}')">إضافة برنامج</button>` : ''}</div>
      ${apps.length ? `<div class="wsgrid">${apps.map(appCard).join('')}</div>` : '<div class="empty">لا توجد برامج لهذه الجهة.</div>'}`;
  }
  async function unitTasks(u) {
    let rows = await D.select('org_requests', { eq: { unit_id: u.id } });
    S._reqs = rows;
    const st = WS.status;
    rows = rows.filter((r) => (WS.arch ? r.archived : !r.archived) && (st === 'all' || (st === 'open' ? !['done', 'rejected'].includes(r.status) : r.status === st)))
      .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
    return `<div class="row noprint" style="margin-bottom:12px">
        <select class="inp" onchange="C.wsStatus(this.value)" aria-label="تصفية حسب الحالة">${opt('open', 'المفتوحة', st)}${opt('all', 'كل الحالات', st)}${Object.keys(RSTAT).map((k) => opt(k, RSTAT[k][0], st)).join('')}</select>
        <label class="small row" style="gap:4px"><input type="checkbox" ${WS.arch ? 'checked' : ''} onchange="C.wsArch(this.checked)">الأرشيف</label>
        <span class="grow"></span>
        <button class="btn sm" onclick="C.reqExport('${u.id}')">تصدير Excel</button>
        ${cap(u.id, 'write') ? `<button class="btn pri sm" onclick="C.reqNew('${u.id}')">مهمة أو طلب جديد</button>` : ''}</div>
      ${rows.length ? `<div class="tw"><table><tr><th>العنوان</th><th>النوع</th><th>الحالة</th><th>المكلف</th><th>الاستحقاق</th><th>الأولوية</th></tr>
        ${rows.map((r) => { const late = r.due_date && r.due_date < today() && !['done', 'rejected'].includes(r.status);
          return `<tr class="click" tabindex="0" onclick="C.openReq('${r.id}')" onkeydown="if(event.key==='Enter')C.openReq('${r.id}')"><td>${esc(r.title)}${(r.attachments || []).length ? ' <span class="small muted">· ' + r.attachments.length + ' مرفق</span>' : ''}</td><td>${r.kind === 'request' ? 'طلب' : r.kind === 'inquiry' ? 'استفسار' : 'مهمة'}</td>
          <td>${chip(RSTAT[r.status][0], RSTAT[r.status][1])}</td><td>${esc(r.assignee_faculty ? fName(r.assignee_faculty) : '—')}</td>
          <td class="num ${late ? 'bad' : ''}">${fmtD(r.due_date)}${late ? ' (متأخرة)' : ''}</td><td>${PRIO[r.priority]}</td></tr>`; }).join('')}</table></div>`
        : `<div class="empty">${WS.arch ? 'لا توجد سجلات مؤرشفة.' : 'لا توجد مهام بهذه الحالة.'}${cap(u.id, 'write') && !WS.arch ? ' أضف مهمة أو طلبًا للجهة من الزر أعلاه.' : ''}</div>`}`;
  }
  C.wsStatus = (v) => { WS.status = v; refresh(); };
  C.wsArch = (v) => { WS.arch = v; refresh(); };
  C.reqExport = async (unitId) => {
    const rows = await D.select('org_requests', { eq: { unit_id: unitId } });
    xlsxOut('مهام ' + uName(unitId) + '.xlsx', [{ name: 'المهام', head: ['العنوان', 'النوع', 'الحالة', 'المكلف', 'الاستحقاق', 'الأولوية', 'مؤرشفة', 'أُنشئت', 'التفاصيل'],
      rows: rows.map((r) => [r.title, r.kind === 'request' ? 'طلب' : r.kind === 'inquiry' ? 'استفسار' : 'مهمة', RSTAT[r.status][0], r.assignee_faculty ? fName(r.assignee_faculty) : '', r.due_date || '', PRIO[r.priority], r.archived ? 'نعم' : 'لا', fmtD(r.created_at), r.body]) }]);
  };
  const reqForm = (r, unitId) => {
    const memIds = S.members.filter((m) => m.unit_id === unitId && activeM(m)).map((m) => m.faculty_id);
    const list = S.faculty.filter((f) => f.status !== 'غير نشط').sort((a, b) => (memIds.includes(b.id) - memIds.includes(a.id)) || a.name_ar.localeCompare(b.name_ar, 'ar'));
    return `<div class="formgrid">
      <label class="f full">العنوان<input id="rqT" value="${attr(r.title || '')}" maxlength="200"></label>
      <label class="f">النوع<select id="rqK">${opt('task', 'مهمة', r.kind)}${opt('request', 'طلب', r.kind)}</select></label>
      <label class="f">الحالة<select id="rqS">${Object.keys(RSTAT).map((k) => opt(k, RSTAT[k][0], r.status || 'new')).join('')}</select></label>
      <label class="f">المكلف<select id="rqA">${facOptions(r.assignee_faculty || '', '— غير محدد —', list)}</select></label>
      <label class="f">تاريخ الاستحقاق<input type="date" id="rqD" value="${attr(r.due_date || '')}"></label>
      <label class="f">الأولوية<select id="rqP">${Object.keys(PRIO).map((k) => opt(k, PRIO[k], r.priority || 'normal')).join('')}</select></label>
      <label class="f full">التفاصيل<textarea id="rqB" maxlength="5000">${esc(r.body || '')}</textarea></label></div>`;
  };
  const reqVals = () => ({ title: val('rqT'), kind: val('rqK'), status: val('rqS'), assignee_faculty: val('rqA') || null, due_date: val('rqD') || null, priority: val('rqP'), body: val('rqB') });
  C.reqNew = (unitId) => {
    modal('مهمة أو طلب جديد · ' + uName(unitId), reqForm({}, unitId) + '<div class="err"></div>', `<button class="btn pri" id="rqOk">إضافة</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    $('#rqOk').onclick = (ev) => busy(ev.target, async () => {
      const v = reqVals(); if (!v.title) throw new Error('العنوان مطلوب.');
      await D.insert('org_requests', Object.assign({ unit_id: unitId }, v));
      const f = v.assignee_faculty && fac(v.assignee_faculty); if (f && f.profile_app_id) notify([f.profile_app_id], 'أُسندت إليك مهمة في ' + uName(unitId) + ': ' + v.title);
      C.close(); refresh(); toast('أُضيفت المهمة.');
    });
  };
  C.openReq = async (id) => {
    const r = (await D.select('org_requests', { eq: { id } }))[0]; if (!r) return toast('السجل غير متاح.', true);
    const canW = cap(r.unit_id, 'write') || (r.assignee_faculty && r.assignee_faculty === myFac()), canM = cap(r.unit_id, 'manage');
    const maxMB = Number(S.settings.maxFileMB) || 10;
    modal(r.title, `<div class="small muted" style="margin-bottom:10px">${esc(uName(r.unit_id))} · أُنشئت ${fmtDT(r.created_at)} بواسطة ${esc(pName(r.created_by))}${r.archived ? ' · مؤرشفة ' + fmtD(r.archived_at) : ''}</div>
      ${canW ? reqForm(r, r.unit_id) : `<dl class="kv"><dt>الحالة</dt><dd>${RSTAT[r.status][0]}</dd><dt>المكلف</dt><dd>${esc(fName(r.assignee_faculty))}</dd><dt>الاستحقاق</dt><dd>${fmtD(r.due_date)}</dd></dl><p>${esc(r.body)}</p>`}
      <h3 style="margin:18px 0 6px">المرفقات</h3>
      <div id="rqAtt">${(r.attachments || []).length ? r.attachments.map((a, i) => `<div class="row small"><a href="#" onclick="C.attGet('${r.id}',${i});return false">${esc(a.name)}</a><span class="muted">${(a.size / 1024).toFixed(0)} ك.ب · ${esc(pName(a.by))}</span>${canM ? `<button class="btn ghost sm" onclick="C.attDel('${r.id}',${i})" aria-label="حذف المرفق">✕</button>` : ''}</div>`).join('') : '<span class="small muted">لا توجد مرفقات.</span>'}</div>
      ${canW ? `<label class="f" style="margin-top:8px">إرفاق ملف (PDF أو Word أو Excel أو صورة، حتى ${maxMB} م.ب)<input type="file" id="rqFile" accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv" onchange="C.attAdd('${r.id}',this)"></label>` : ''}
      <h3 style="margin:18px 0 6px">التعليقات والمتابعة</h3>
      <div>${(r.comments || []).map((c) => `<div class="comment">${esc(c.text)}<div class="tiny">${esc(c.by)} · ${fmtDT(c.at)}</div></div>`).join('') || '<span class="small muted">لا توجد تعليقات.</span>'}</div>
      ${canW ? `<div class="row" style="margin-top:8px"><textarea class="inp grow" id="rqC" rows="2" placeholder="أضف تعليقًا داخليًا…" maxlength="2000"></textarea><button class="btn sm" onclick="C.reqComment('${r.id}',this)">إضافة تعليق</button></div>` : ''}
      <div class="err"></div>`,
      `${canW ? `<button class="btn pri" id="rqSave">حفظ</button>` : ''}${canM ? `<button class="btn" id="rqArch">${r.archived ? 'إعادة من الأرشيف' : 'أرشفة'}</button>` : ''}<button class="btn" onclick="C.close()">إغلاق</button>`, true);
    if ($('#rqSave')) $('#rqSave').onclick = (ev) => busy(ev.target, async () => {
      const v = reqVals(); if (!v.title) throw new Error('العنوان مطلوب.');
      await D.update('org_requests', v, { eq: { id } });
      if (v.assignee_faculty && v.assignee_faculty !== r.assignee_faculty) { const f = fac(v.assignee_faculty); if (f && f.profile_app_id) notify([f.profile_app_id], 'أُسندت إليك مهمة: ' + v.title); }
      C.close(); refresh(); toast('حُفظت المهمة.');
    });
    if ($('#rqArch')) $('#rqArch').onclick = (ev) => busy(ev.target, async () => { await D.update('org_requests', { archived: !r.archived }, { eq: { id } }); C.close(); refresh(); toast(r.archived ? 'أُعيدت من الأرشيف.' : 'أُرشفت المهمة مع الاحتفاظ بسجلها.'); });
  };
  C.reqComment = (id, btn) => busy(btn, async () => {
    const t = val('rqC'); if (!t) return;
    const r = (await D.select('org_requests', { eq: { id } }))[0];
    await D.update('org_requests', { comments: (r.comments || []).concat([{ by: S.me.name, app: S.me.app_id, at: new Date().toISOString(), text: t }]) }, { eq: { id } });
    C.openReq(id);
  });
  const ALLOWED = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv' };
  C.attAdd = (id, input) => busy(null, async () => {
    const file = input.files[0]; if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase(); const maxMB = Number(S.settings.maxFileMB) || 10;
    if (!ALLOWED[ext]) { input.value = ''; throw new Error('نوع الملف غير مسموح. المسموح: PDF وWord وExcel وPowerPoint والصور والنصوص.'); }
    if (file.size > maxMB * 1048576) { input.value = ''; throw new Error('حجم الملف أكبر من ' + maxMB + ' م.ب.'); }
    const r = (await D.select('org_requests', { eq: { id } }))[0];
    const safe = file.name.replace(/[^\w.\-\u0600-\u06FF]+/g, '_').slice(-80);
    const path = `${r.unit_id}/${id}/${Date.now()}_${uid().slice(0, 6)}.${ext}`;
    const blob = new Blob([file], { type: ALLOWED[ext] });
    await D.upload(path, blob);
    await D.update('org_requests', { attachments: (r.attachments || []).concat([{ name: safe, path, size: file.size, type: ALLOWED[ext], by: S.me.app_id, at: new Date().toISOString() }]) }, { eq: { id } });
    toast('أُرفق الملف.'); C.openReq(id);
  });
  C.attGet = (id, i) => busy(null, async () => {
    const r = (await D.select('org_requests', { eq: { id } }))[0]; const a = r.attachments[i];
    const b = await D.download(a.path); const x = document.createElement('a'); x.href = URL.createObjectURL(b); x.download = a.name; document.body.appendChild(x); x.click(); setTimeout(() => { URL.revokeObjectURL(x.href); x.remove(); }, 1000);
  });
  C.attDel = async (id, i) => {
    const r = (await D.select('org_requests', { eq: { id } }))[0]; const a = r.attachments[i];
    if (!(await confirmBox('حذف المرفق', `<p>حذف «${esc(a.name)}»؟</p>`, 'حذف', true))) return C.openReq(id);
    await busy(null, async () => { await D.removeFile(a.path).catch(() => {}); await D.update('org_requests', { attachments: r.attachments.filter((_, j) => j !== i) }, { eq: { id } }); toast('حُذف المرفق.'); C.openReq(id); });
  };

  /* =====================================================================
     أعضاء هيئة التدريس (القاعدة المركزية)
     ===================================================================== */
  const CONTRACTS = ['دوام كامل', 'دوام جزئي', 'متعاون'];
  const FQ = { q: '', dept: '', rank: '', ct: '', st: 'active', miss: false, req: false, sel: new Set() };
  const canEditFac = (f) => isAdmin() || (f && f.department_id && cap(f.department_id, 'manage'));
  const canAddFac = () => isAdmin() || deptUnits().some((d) => cap(d.id, 'manage'));
  const ranks = () => S.settings.ranks || ['أستاذ', 'أستاذ مشارك', 'أستاذ مساعد', 'محاضر', 'معيد'];
  const statuses = () => S.settings.statuses || ['نشط', 'غير نشط'];
  const CAMPUSES = () => S.settings.campuses || ['سكاكا', 'اللقائط', 'القريات', 'طبرجل'];
  const GENDERS = ['ذكر', 'أنثى'];
  const offF = (f) => f.status === 'غير نشط';
  /* سنوات الخدمة من تاريخ بدايتها */
  const svcYears = (d) => { if (!d) return null; const a = new Date(String(d).slice(0, 10) + 'T00:00:00'), n = new Date(); if (isNaN(a)) return null;
    let y = n.getFullYear() - a.getFullYear(); if (n.getMonth() < a.getMonth() || (n.getMonth() === a.getMonth() && n.getDate() < a.getDate())) y--; return Math.max(0, y); };
  const yrsTxt = (y) => y == null ? '' : y === 0 ? 'أقل من سنة' : y === 1 ? 'سنة' : y === 2 ? 'سنتان' : y <= 10 ? y + ' سنوات' : y + ' سنة';
  /* ما ينقص سجل العضو (الجوال يُحكم عليه لمن يطّلع على الجوالات فقط) */
  const mobSeen = (f) => isAdmin() || (f.department_id && cap(f.department_id, 'faculty_private'));
  const facMissing = (f) => [!f.email && 'البريد', mobSeen(f) && !S.privates[f.id] && 'الجوال', !f.department_id && 'القسم', !f.gender && 'الجنس', !f.campus && 'المقر'].filter(Boolean);
  /* السجلات المكررة المحتملة: الاسم نفسه بعد حذف اللقب و«بن/بنت»، أو اسم مختصر (الأول والأخير) داخل الاسم الكامل */
  function facDups() {
    const L = S.faculty.map((f) => ({ f, k: nameKey(f.name_ar) })).filter((x) => x.k.length >= 2), out = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const [s, l] = L[i].k.length <= L[j].k.length ? [L[i].k, L[j].k] : [L[j].k, L[i].k];
      if (s.join(' ') === l.join(' ') || (s[0] === l[0] && s[s.length - 1] === l[l.length - 1] && s.every((w) => l.includes(w)))) out.push([L[i].f, L[j].f]);
    }
    return out;
  }
  function facFiltered() {
    const q = FQ.q.trim().toLowerCase();
    return S.faculty.filter((f) => (FQ.st === 'all' || (FQ.st === 'inactive') === offF(f)) && (!FQ.dept || f.department_id === FQ.dept) && (!FQ.rank || f.rank === FQ.rank) && (!FQ.ct || (FQ.ct === 'none' ? !f.contract_type : f.contract_type === FQ.ct)) &&
      (!FQ.miss || (canEditFac(f) && facMissing(f).length)) && (!FQ.req || f.deact_request) &&
      (!q || [f.name_ar, f.name_en, f.email, f.employee_no, f.specialty].some((x) => String(x || '').toLowerCase().includes(q))))
      .sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
  }
  function pgFaculty() {
    const showMob = Object.keys(S.privates).length > 0;
    VIEW.after = () => { const i = $('#fq'); if (i && FQ._focus) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); FQ._focus = false; } };
    const list = facFiltered();
    FQ.sel.forEach((id) => { if (!list.some((f) => f.id === id)) FQ.sel.delete(id); });
    /* مساعدات التنظيف */
    const miss = S.faculty.filter((f) => !offF(f) && canEditFac(f) && facMissing(f).length), dups = isAdmin() ? facDups() : [], reqs = isAdmin() ? S.faculty.filter((f) => f.deact_request && !offF(f)) : [];
    const note = (cls, txt, act, btn) => `<div class="panel row noprint" style="margin-bottom:8px;padding:8px 14px;align-items:center;gap:10px;border-inline-start:4px solid var(--${cls})"><span class="grow">${txt}</span><button class="btn sm" onclick="${act}">${btn}</button></div>`;
    const helpers = (miss.length ? note('wait', `<b>${miss.length}</b> عضوًا ينقصهم شيء من: البريد، الجوال، القسم، الجنس، المقر.`, "C.fq('miss'," + !FQ.miss + ')', FQ.miss ? 'عرض الكل' : 'عرض الناقصين فقط') : '') +
      (dups.length ? note('late', `<b>${dups.length}</b> ${dups.length === 1 ? 'سجل يبدو مكررًا' : 'سجلات تبدو مكررة'} (الاسم نفسه بعد تجاهل اللقب و«بن»).`, 'C.facDupes()', 'مراجعة ودمج') : '') +
      (reqs.length ? note('late', `<b>${reqs.length}</b> ${reqs.length === 1 ? 'طلب إيقاف' : 'طلبات إيقاف'} من رؤساء الأقسام بانتظار قرارك.`, "C.fq('req'," + !FQ.req + ')', FQ.req ? 'عرض الكل' : 'عرض الطلبات') : '');
    const canSel = list.some(canEditFac);
    const act = (f) => { const b = (fn, t, cls) => `<button class="btn sm ${cls || ''}" onclick="event.stopPropagation();${fn}('${f.id}')">${t}</button>`;
      return (canEditFac(f) ? b('C.facEdit', 'تعديل') : myFac() === f.id ? b('C.facEdit', 'جوالي') : '') +
        (isAdmin() ? (offF(f) ? b('C.facActivate', 'تنشيط') : '') + b('C.facDel', 'حذف', 'danger') : canEditFac(f) && !offF(f) && !f.deact_request && f.id !== myFac() ? b('C.facReq', 'طلب إيقاف') : ''); };
    return `<div class="row noprint" style="margin-bottom:12px">
        <input class="inp" id="fq" placeholder="ابحث بالاسم أو البريد أو الرقم الوظيفي…" value="${attr(FQ.q)}" oninput="C.fq('q',this.value)" style="width:240px" aria-label="بحث">
        <select class="inp" onchange="C.fq('st',this.value)" aria-label="الحالة">${[['active', 'النشطون'], ['inactive', 'غير النشطين'], ['all', 'الكل']].map(([v, l]) => opt(v, l, FQ.st)).join('')}</select>
        <select class="inp" onchange="C.fq('dept',this.value)" aria-label="القسم"><option value="">كل الأقسام</option>${deptUnits().map((d) => opt(d.id, d.name, FQ.dept)).join('')}</select>
        <select class="inp" onchange="C.fq('rank',this.value)" aria-label="الرتبة"><option value="">كل الرتب</option>${ranks().map((r) => opt(r, r, FQ.rank)).join('')}</select>
        <select class="inp" onchange="C.fq('ct',this.value)" aria-label="نوع التعاقد"><option value="">كل أنواع التعاقد</option>${CONTRACTS.map((c) => opt(c, c, FQ.ct)).join('')}${opt('none', 'لم يُحدَّد', FQ.ct)}</select>
        <span class="grow"></span>
        <button class="btn sm" onclick="C.facExport()">تصدير Excel</button>
        ${isAdmin() ? `<button class="btn sm" onclick="C.fxImport()">استيراد من البرنامج القديم</button>` : ''}${canAddFac() ? `<button class="btn sm" onclick="C.facImport()">استيراد من Excel</button><button class="btn pri sm" onclick="C.facEdit()">إضافة عضو</button>` : ''}
      </div>
      ${isAdmin() ? `<div class="row noprint" style="margin-bottom:12px;gap:8px;align-items:center"><b class="small">التكليفات (مصدر صلاحيات الجهات وبرامجها):</b>
        <button class="btn sm pri" onclick="C.go('matrix')">${icon('list')}مصفوفة التكليفات والصلاحيات</button><button class="btn sm" onclick="C.asExport()">${icon('upload')}تصدير التكليفات</button><button class="btn sm" onclick="C.asImport()">${icon('list')}استيراد التكليفات من Excel</button>
        <span class="small muted">${S.faculty.filter((f) => f.profile_app_id).length} من ${S.faculty.length} عضوًا مرتبطون بحساب دخول؛ يُربط الحساب تلقائيًا بالبريد عند أول دخول.</span></div>` : ''}
      ${helpers}<div id="fBulk">${bulkBar()}</div>
      <p class="small muted">${list.length} من ${S.faculty.length} عضو. هذه القاعدة هي المصدر الوحيد لبيانات الأعضاء في كل الوحدات واللجان والجداول.</p>
      ${list.length ? `<style>.ftab td{white-space:nowrap;font-size:13.5px}.ftab td.nm{white-space:normal;min-width:200px}.ftab th{white-space:nowrap}</style><div class="tw"><table class="ftab"><tr>${canSel ? `<th class="noprint"><input type="checkbox" aria-label="تحديد الكل" onchange="C.fSelAll(this.checked)" ${list.filter(canEditFac).every((f) => FQ.sel.has(f.id)) && FQ.sel.size ? 'checked' : ''}></th>` : ''}<th>الاسم</th><th class="noprint"></th><th>الرتبة</th><th>القسم</th><th>الجنس</th><th>المقر</th><th>التعاقد</th><th>الخدمة</th><th>البريد الجامعي</th>${showMob ? '<th>الجوال</th>' : ''}${FQ.miss ? '<th>الناقص</th>' : ''}<th>الحالة</th><th>الحساب</th></tr>
      ${list.map((f) => { const y = svcYears(f.service_start); return `<tr${offF(f) ? ' style="opacity:.6"' : ''}>${canSel ? `<td class="noprint">${canEditFac(f) ? `<input type="checkbox" aria-label="تحديد" ${FQ.sel.has(f.id) ? 'checked' : ''} onchange="C.fSel('${f.id}',this.checked)">` : ''}</td>` : ''}
        <td class="nm"><a href="#" onclick="C.facView('${f.id}');return false"><b>${esc(f.name_ar)}</b></a>${f.name_en ? `<div class="tiny muted" dir="ltr" style="text-align:end">${esc(f.name_en)}</div>` : ''}</td>
        <td class="noprint">${act(f)}</td><td>${esc(f.rank)}</td><td>${esc(uName(f.department_id))}</td><td>${esc(f.gender || '')}</td><td>${esc(f.campus || '')}</td><td class="small">${esc(f.contract_type || '')}</td><td class="small" title="${attr(f.service_start ? 'منذ ' + fmtD(f.service_start) : '')}">${esc(yrsTxt(y))}</td>
        <td dir="ltr" style="text-align:end">${esc(f.email || '')}</td>${showMob ? `<td dir="ltr" style="text-align:end">${esc(S.privates[f.id] || '')}</td>` : ''}${FQ.miss ? `<td class="small bad">${esc(facMissing(f).join('، '))}</td>` : ''}
        <td>${chip(f.status, f.status === 'نشط' ? 'ok' : offF(f) ? 'bad' : 'wait')}${f.deact_request ? ' ' + chip('طلب إيقاف', 'bad') : ''}</td><td>${f.profile_app_id ? chip((prof(f.profile_app_id) || {}).active === false ? 'معطل' : 'مرتبط', (prof(f.profile_app_id) || {}).active === false ? 'bad' : 'ok') : '<span class="small muted">—</span>'}</td></tr>`; }).join('')}</table></div>`
      : `<div class="empty">لا يوجد أعضاء مطابقون.${S.faculty.length ? '' : (isAdmin() ? ' ابدأ بإضافة الأعضاء أو استيرادهم من Excel.' : '')}</div>`}
`;
  }
  C.fq = (k, v) => { FQ[k] = v; FQ._focus = k === 'q'; refresh(); };
  /* التعديل الجماعي: يظهر شريطه حين يُحدَّد عضو أو أكثر */
  function bulkBar() {
    const n = FQ.sel.size; if (!n) return '';
    const deps = deptUnits().filter((d) => isAdmin() || cap(d.id, 'manage'));
    return `<div class="panel row noprint" style="margin-bottom:8px;padding:8px 14px;gap:8px;align-items:center;flex-wrap:wrap;border-inline-start:4px solid var(--ledger)"><b>${n} محدد</b>
      <select class="inp" id="bkDept" aria-label="القسم">${deps.map((d) => opt(d.id, d.name, '')).join('')}</select><button class="btn sm" onclick="C.bulk('dept',this)">نقل إلى القسم</button>
      <select class="inp" id="bkCamp" aria-label="المقر">${CAMPUSES().map((c) => opt(c, c, '')).join('')}</select><button class="btn sm" onclick="C.bulk('campus',this)">تغيير المقر</button>
      ${isAdmin() ? `<select class="inp" id="bkSt" aria-label="الحالة">${statuses().map((s) => opt(s, s, '')).join('')}</select><button class="btn sm" onclick="C.bulk('status',this)">تغيير الحالة</button>` : ''}
      <span class="grow"></span><button class="btn sm" onclick="C.fSelAll(false)">إلغاء التحديد</button></div>`;
  }
  const bulkRedraw = () => { const b = $('#fBulk'); if (b) b.innerHTML = bulkBar(); };
  C.fSel = (id, on) => { if (on) FQ.sel.add(id); else FQ.sel.delete(id); bulkRedraw(); };
  C.fSelAll = (on) => { FQ.sel.clear(); if (on) facFiltered().filter(canEditFac).forEach((f) => FQ.sel.add(f.id)); refresh(); };
  const reloadPeople = async () => { await reloadFaculty(); S.members = await D.select('org_members');
    if (isAdmin()) S.profiles = await D.select('profiles', { cols: 'app_id,username,name,email,is_admin,college_role,active' }).catch(() => S.profiles); };
  /* الإيقاف وإعادة التنشيط (مدير النظام): الحالة والحساب والتكليفات السارية في القاعدة (الملف 17) */
  const setActive = async (f, on, note) => { await D.rpc('faculty_set_active', { p_id: f.id, p_active: on, p_note: note || '' });
    if (f.profile_app_id) { try { await D.fn({ action: 'update', appId: f.profile_app_id, active: on }); } catch (e) { console.warn(e); } } };
  C.bulk = (k, btn) => { const ids = [...FQ.sel], v = val({ dept: 'bkDept', campus: 'bkCamp', status: 'bkSt' }[k]);
    const L = { dept: 'نقل ' + ids.length + ' إلى ' + uName(v), campus: 'تغيير مقر ' + ids.length + ' إلى ' + v, status: 'تغيير حالة ' + ids.length + ' إلى «' + v + '»' }[k];
    if (!window.confirm(L + '؟' + (k === 'status' && v === 'غير نشط' ? '\nالإيقاف يغلق حساباتهم وينهي تكليفاتهم السارية.' : ''))) return;
    busy(btn, async () => { const fails = [];
      for (const id of ids) { const f = fac(id); try {
        if (k === 'dept') await D.update('faculty', { department_id: v }, { eq: { id } });
        else if (k === 'campus') await D.update('faculty', { campus: v }, { eq: { id } });
        else if (v === 'غير نشط') { if (!offF(f)) await setActive(f, false, 'تغيير جماعي'); }
        else { if (offF(f)) await setActive(f, true, 'تغيير جماعي'); if (v !== 'نشط') await D.update('faculty', { status: v }, { eq: { id } }); }
      } catch (e) { fails.push(f.name_ar + ': ' + pgErr(e)); } }
      FQ.sel.clear(); await reloadPeople(); refresh();
      if (fails.length) modal('تعذّر بعض التعديلات', `<ul>${fails.map((x) => `<li class="small bad">${esc(x)}</li>`).join('')}</ul>`, '<button class="btn" onclick="C.close()">إغلاق</button>');
      else toast('تم: ' + L + '.'); }); };
  /* الحذف الآمن: يُحذف نهائيًا من لا ارتباط له، ومن له ارتباطات يُعرض عليه الإيقاف */
  const linksTxt = (l) => [l.sections && (l.sections === 1 ? 'شعبة' : l.sections === 2 ? 'شعبتان' : l.sections + ' شعب') + ' في جداول الفصول', l.coords && `تنسيق ${l.coords} مقرر`, l.programs && 'تنسيق برنامج',
    l.members_active.length ? 'تكليف في ' + l.members_active.join(' و') : l.members && `${l.members} تكليف سابق`, l.account && 'حساب دخول', l.apps && 'بيانات في البرامج', l.requests && (l.requests === 1 ? 'مهمة أو استفسار' : l.requests + ' مهام واستفسارات')].filter(Boolean);
  C.facDel = (id) => busy(null, async () => { const f = fac(id), l = await D.rpc('faculty_links', { p_id: id }), t = linksTxt(l);
    if (!t.length) {
      modal('حذف ' + f.name_ar, `<p>لا يرتبط هذا العضو بأي شعبة أو تكليف أو حساب أو بيانات في البرامج.</p><p><b>سيُحذف سجله نهائيًا.</b> هل أنت متأكد؟</p><div class="err"></div>`,
        `<button class="btn danger" id="fdOk">حذف نهائي</button><button class="btn" onclick="C.close()">إلغاء</button>`);
      $('#fdOk').onclick = (ev) => busy(ev.target, async () => { await D.remove('faculty', { eq: { id } }); await reloadPeople(); C.close(); refresh(); toast('حُذف العضو.'); });
      return;
    }
    modal('لا يمكن حذف ' + f.name_ar, `<p>له ${esc(t.join('، و'))}.</p><p>الحذف يضيّع هذا التاريخ، لذلك لا يُحذف.</p>
      ${offF(f) ? '<p class="small muted">العضو موقوف من قبل.</p>' : `<div class="panel" style="background:var(--paper)"><b>بدلًا من الحذف: إيقاف</b><p class="small" style="margin:6px 0 0">تصبح حالته «غير نشط»، ويُغلق حسابه في الدخول، وتُنهى تكليفاته السارية بتاريخ اليوم، ويختفي من القوائم والمراقبات والاقتراحات. يبقى سجله وتاريخه للتقارير، ويمكن إعادة تنشيطه.</p>
      <label class="f" style="margin-top:8px">السبب (اختياري)<input id="fdNote" maxlength="200"></label></div>`}<div class="err"></div>`,
      `${offF(f) ? '' : '<button class="btn pri" id="fdStop">إيقاف العضو</button>'}<button class="btn" onclick="C.close()">إغلاق</button>`, true);
    if ($('#fdStop')) $('#fdStop').onclick = (ev) => busy(ev.target, async () => { await setActive(f, false, val('fdNote')); await reloadPeople(); C.close(); refresh(); toast('أُوقف العضو.'); }); });
  C.facActivate = (id) => { const f = fac(id); if (!window.confirm('إعادة تنشيط ' + f.name_ar + '؟ يُفتح حسابه، ولا تعود تكليفاته المنتهية تلقائيًا.')) return;
    busy(null, async () => { await setActive(f, true); await reloadPeople(); refresh(); toast('أُعيد تنشيط العضو.'); }); };
  /* رئيس القسم: يطلب الإيقاف، ويعتمده مدير النظام */
  C.facReq = (id) => { const f = fac(id);
    modal('طلب إيقاف ' + f.name_ar, `<p class="small">يُرسل الطلب لمدير النظام ليعتمده. لا يتغير شيء في سجل العضو حتى يعتمده.</p><label class="f">السبب<textarea id="frR" rows="3" maxlength="500"></textarea></label><div class="err"></div>`,
      `<button class="btn pri" id="frOk">إرسال الطلب</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#frOk').onclick = (ev) => busy(ev.target, async () => { await D.rpc('faculty_deact_request', { p_id: id, p_reason: val('frR') }); await reloadFaculty(); C.close(); refresh(); toast('أُرسل طلب الإيقاف لمدير النظام.'); }); };
  /* السجلات المكررة والدمج (مدير النظام) */
  const facScore = (f) => (f.email ? 4 : 0) + (f.employee_no ? 3 : 0) + (f.profile_app_id ? 5 : 0) + (f.name_en ? 1 : 0) + nameKey(f.name_ar).length;
  C.facDupes = () => { const ds = facDups();
    const card = (f) => `<div class="small"><b>${esc(f.name_ar)}</b>${offF(f) ? ' ' + chip('غير نشط', 'bad') : ''}<div class="muted">${esc(uName(f.department_id))} · <span dir="ltr">${esc(f.email || 'بلا بريد')}</span>${f.employee_no ? ' · ' + esc(f.employee_no) : ''}${f.profile_app_id ? ' · له حساب' : ''}</div></div>`;
    modal('سجلات تبدو مكررة', ds.length ? `<p class="small">اختر السجل الصحيح في كل زوج. تُنقل تكليفات الآخر وشعبه وبياناته إليه، وتُكمَّل حقوله الفارغة، ثم يُحذف المكرر. يُسجَّل الدمج في سجل العمليات.</p>
      <div class="tw"><table><tr><th>السجل الأول</th><th>السجل الثاني</th><th>الإجراء</th></tr>${ds.map(([a, b]) => { const [keep, drop] = facScore(a) >= facScore(b) ? [a, b] : [b, a];
        return `<tr><td>${card(a)}</td><td>${card(b)}</td><td style="white-space:nowrap"><button class="btn sm pri" onclick="C.facMerge('${drop.id}','${keep.id}')">أبقِ «${esc(keep.name_ar)}»</button><br><button class="btn sm" style="margin-top:4px" onclick="C.facMerge('${keep.id}','${drop.id}')">أبقِ الآخر</button></td></tr>`; }).join('')}</table></div>`
      : '<div class="okmsg">لا توجد سجلات مكررة.</div>', '<button class="btn" onclick="C.close()">إغلاق</button>', true); };
  C.facMerge = (from, to) => busy(null, async () => { const a = fac(from), b = fac(to), t = linksTxt(await D.rpc('faculty_links', { p_id: from }));
    if (!window.confirm(`دمج «${a.name_ar}» في «${b.name_ar}»؟\n${t.length ? 'يُنقل: ' + t.join('، ') + '.\n' : ''}ثم يُحذف «${a.name_ar}» نهائيًا.`)) return;
    await D.rpc('faculty_merge', { p_from: from, p_to: to }); await reloadPeople(); toast('تم الدمج.'); refresh(); if (facDups().length) setTimeout(C.facDupes, 300); else C.close(); });
  /* جدولي الدراسي: شعب العضو في الفصل الحالي من الجدول المعتمد */
  /* الأيام في الجدول قد تُكتب «الأحد» أو «أحد» أو «الإثنين»: تُوحَّد للمقارنة والترتيب */
  const dayKey = (d) => String(d || '').trim().replace(/^ال/, '').replace(/^إثنين$/, 'اثنين');
  const DAYS_ORDER = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];
  const todayKey = () => DAYS_ORDER[(new Date().getDay() + 1) % 7];
  /* مواعيد الشعبة: «أحد ثلاثاء» بوقت الشعبة، أو «أحد 08:00-08:50، ثلاثاء 08:00-09:50» لكل يوم وقته */
  const meetsOf = (c) => String(c.days || '').split(/[،,]/).map((p) => p.trim()).filter(Boolean).flatMap((p) => {
    const t = p.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/), ds = p.replace(/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/, '').split(/\s+/).filter(Boolean).map(dayKey);
    return ds.map((d) => ({ d, from: t ? t[1] : c.from, to: t ? t[2] : c.to })); });
  /* =====================================================================
     صفحات عضو هيئة التدريس (مبسطة): الرئيسية = جدولي الدراسي ولمبة التنبيهات، «مهامي» = جدول المتطلبات،
     «لجاني» = جهاته ودوره فيها، «تنبيهاتي» = المطلوب العاجل. التفاصيل داخل البرامج لا في الصفحات.
     كل البيانات من الجدول المعتمد وملخصات البرامج (course_status) والمهام والاستفسارات؛ الموقع لا يقرأ بيانات البرامج الداخلية.
     ===================================================================== */
  /* ملخصات البرامج والاستفسارات للفصل (الملف 15) */
  const CX = { st: [], inq: [] };
  async function loadCourseExtras() {
    const t = (S.sched || {}).term || curTerm(); if (!t) return;
    const [st, inq] = await Promise.all([D.select('course_status', { eq: { term_id: t.id } }).catch(() => []), D.select('org_requests', { eq: { kind: 'inquiry', term_id: t.id } }).catch(() => [])]);
    Object.assign(CX, { st, inq });
  }
  /* صفوف المقرر التي تخصني: على مستوى المقرر، أو شعبي، أو باسمي */
  const stOf = (c, kind) => { const r = courseRole(c, myFac()), whole = r.coordinator || r.programCoordinator || !r.teacher;
    return CX.st.filter((x) => x.course_id === c.id && x.kind === kind && (whole || !x.section_id || r.sections.includes(x.section_id))
      && (kind !== 'invigilation' || x.faculty_id === myFac())); };
  const myInq = (c) => CX.inq.filter((q) => q.course_id === c.id && q.assignee_faculty === myFac());
  const answered = (q) => (q.comments || []).some((m) => m.reply || m.app === S.me.app_id);

  /* أعمدة «مهامي» (المتطلبات): من الإعدادات وقاعدة البيانات (org_settings.data.reqColumns)، يضيفها مدير النظام دون برمجة.
     لكل عمود: الاسم، واللون، والبرنامج الذي يُفتح على المقرر، ونوع الحالة في course_status (مصدرها). */
  const REQ_DEF = () => { const B = S.settings.courseButtons || {};
    return [{ key: 'quality', name: 'متطلبات الجودة', color: '#0F8B8D', kind: 'file', app: B.file || '' }, { key: 'bb', name: 'متطلبات بلاك بورد', color: '#D9822B', kind: 'bb', app: B.bb || '' },
      { key: 'exam', name: 'متطلبات الاختبارات', color: '#2F6DB5', kind: 'exam', app: B.exam || '' }]; };
  const reqCols = () => (S.settings.reqColumns && S.settings.reqColumns.length ? S.settings.reqColumns : REQ_DEF());
  const colApp = (col) => { const a = col && col.app && S.apps.find((x) => x.id === col.app && x.active !== false); return a && appLv(a) !== 'none' ? a : null; };
  const appOfKind = (kind) => colApp(reqCols().find((c) => c.kind === kind));
  /* حالة عمود لمقرر: ✓ مكتمل / ⌛ قيد العمل / ! ناقص (العدد) / ○ لم يبدأ */
  const ST_OK = ['complete', 'met', 'ok', 'accepted', 'submitted', 'done'], ST_LATE = ['notes', 'unmet', 'late', 'missing', 'returned'], ST_WAIT = ['in_progress', 'pending', 'scheduled', 'draft'];
  function colState(c, col) {
    const r = courseRole(c, myFac()), rows = stOf(c, col.kind), openQ = col.kind === 'bb' ? myInq(c).filter((q) => !answered(q)).length : 0;
    const one = (x) => { const s = String(x.status || ''), d = x.details || {};
      if (ST_OK.includes(s)) return 'ok'; if (ST_LATE.includes(s)) return 'late'; if (ST_WAIT.includes(s)) return 'wait'; if (s === 'not_started') return 'none';
      if (col.kind === 'exam') return r.coordinator && d.questions === 'pending' ? 'wait' : (d.items || []).length ? 'ok' : 'none';
      return 'none'; };
    const ts = rows.map(one); let t = openQ || ts.includes('late') ? 'late' : ts.length && ts.every((x) => x === 'ok') ? 'ok' : ts.includes('wait') || (ts.includes('ok') && ts.includes('none')) ? 'wait' : 'none';
    const n = openQ + rows.reduce((a, x) => a + (ST_LATE.includes(x.status) ? ((x.details || {}).missing || (x.details || {}).notes || []).length : 0), 0);
    const pr = rows.find((x) => x.progress != null && x.status !== 'complete');
    return { t, test: rows.some((x) => (x.details || {}).test), text: t === 'ok' ? 'مكتمل' : t === 'late' ? 'ناقص' + (n ? ` (${n})` : '') : t === 'wait' ? 'قيد العمل' + (pr ? ' ' + Math.round(pr.progress) + '%' : '') : 'لم يبدأ' };
  }
  const SB = { ok: '✓', wait: '⌛', late: '!', none: '○' };
  const stb = (tone, text) => `<span class="sb ${tone}"><span aria-hidden="true">${SB[tone]}</span>${esc(text)}</span>`;
  const daysTo = (d) => { if (!d) return null; const a = new Date(String(d).slice(0, 10) + 'T00:00:00'), b = new Date(today() + 'T00:00:00'); return Math.round((a - b) / 86400000); };
  const dShort = (d) => { try { return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' }); } catch (e) { return d; } };
  const whenTxt = (n) => n == null ? '' : n < 0 ? `متأخر ${-n} ${-n === 1 ? 'يوم' : -n === 2 ? 'يومين' : 'أيام'}` : n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : `بعد ${n} أيام`;
  const ALERTS = () => Object.assign({ fileDue: '', leadDays: 7 }, S.settings.alerts || {});
  const colColor = (kind) => (reqCols().find((c) => c.kind === kind) || {}).color || '#8A7F9B';

  /* التنبيهات: تُبنى من البيانات وتختفي حين يُنجز المطلوب. لكل بند زر واحد: «رد» أو «فتح» */
  function buildUrgent(courses, reqs) {
    const out = [], al = ALERTS(), lead = Number(al.leadDays) || 7, me = myFac();
    const openApp = (kind, c) => { const a = appOfKind(kind); return a ? `C.appOpenCtx('${a.id}','${c.id}')` : `C.toast('لم يُربط برنامج بهذا العمود بعد.',true)`; };
    courses.forEach((c) => { const r = courseRole(c, me), cn = c.code + ' ' + c.name;
      myInq(c).filter((q) => !answered(q)).forEach((q) => { const a = -daysTo(String(q.created_at).slice(0, 10));
        out.push({ k: 'bb', t: 'استفسار لم تردّ عليه: ' + q.title, sub: cn, w: a <= 0 ? 'وصل اليوم' : a === 1 ? 'وصل أمس' : 'وصل منذ ' + a + ' أيام', n: null, late: true, btn: 'رد', act: `C.inqOpen('${q.id}')` }); });
      const un = stOf(c, 'bb').filter((x) => x.status === 'unmet'), miss = un.flatMap((x) => (x.details || {}).missing || []);
      if (un.length) out.push({ k: 'bb', t: 'نقاط بلاك بورد ناقصة' + (miss.length ? ' (' + miss.length + ')' : ''), sub: cn, n: null, late: true, btn: 'فتح', act: openApp('bb', c) });
      const f = stOf(c, 'file');
      if (f.some((x) => x.status === 'notes')) out.push({ k: 'file', t: 'ملف المقرر عليه ملاحظات', sub: cn, n: null, late: true, btn: 'فتح', act: openApp('file', c) });
      else if ((r.teacher || r.coordinator) && !f.some((x) => x.status === 'complete')) { const n = daysTo(al.fileDue);
        if (n != null && n <= lead) out.push({ k: 'file', t: 'ملف المقرر لم يُسلَّم', sub: cn, n, late: n < 0, btn: 'فتح', act: openApp('file', c) }); }
      if (r.coordinator) stOf(c, 'exam').forEach((x) => { const d = x.details || {}; if (d.questions !== 'pending') return;
        /* آخر موعد للأسئلة (qDue) يرسله نظام الاختبارات: قبل الاختبار بعدد أيام إعداداته؛ وإلا فموعد الاختبار */
        const nx = (d.items || []).filter((i) => i.date && String(i.date) >= today()).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0], n = d.qDue ? daysTo(d.qDue) : nx ? daysTo(nx.date) : null;
        if (n == null || n <= lead) out.push({ k: 'exam', t: 'أسئلة الاختبار لم تُسلَّم' + (nx ? ' — ' + nx.name : ''), sub: cn + (d.qDue ? ' · آخر موعد ' + dShort(d.qDue) : ''), n, late: n != null && n < 0, btn: 'فتح', act: openApp('exam', c) }); });
      /* إعادة الأوراق المصححة لوحدة الاختبارات (موعدها من إعدادات نظام الاختبارات) */
      if (r.teacher || r.coordinator) stOf(c, 'exam').forEach((x) => { const g = (x.details || {}).graded; if (!g || !g.due) return; const n = daysTo(g.due);
        if (n <= lead) out.push({ k: 'exam', t: 'إعادة الأوراق المصححة لوحدة الاختبارات' + (g.pending > 1 ? ' (' + g.pending + ' شعب)' : ''), sub: cn, n, late: n < 0, btn: 'فتح', act: openApp('exam', c) }); }); });
    CX.st.filter((x) => x.kind === 'invigilation' && x.faculty_id === me).forEach((x) => { const c = ((S.sched || {}).courses || []).find((k) => k.id === x.course_id) || {};
      ((x.details || {}).items || []).forEach((i) => { const n = daysTo(i.date); if (n !== 0 && n !== 1) return;
        out.push({ k: 'exam', t: `مراقبة ${n === 0 ? 'اليوم' : 'غدًا'}: ${i.role || 'مراقب'}`, sub: [c.code, i.name, i.period && 'الفترة ' + i.period, i.room && 'القاعة ' + i.room].filter(Boolean).join(' · '), n, late: false, btn: 'فتح',
          act: appOfKind('exam') && c.id ? `C.appOpenCtx('${appOfKind('exam').id}','${c.id}')` : `C.toast('لم يُربط نظام الاختبارات بعد.',true)` }); }); });
    reqs.filter((q) => q.kind !== 'inquiry' && !['done', 'rejected'].includes(q.status) && !q.archived && q.due_date).forEach((q) => { const n = daysTo(q.due_date);
      if (n <= lead) out.push({ k: 'comm', uid: q.unit_id, t: q.title, sub: uName(q.unit_id), n, late: n < 0, btn: 'فتح', act: `C.openReq('${q.id}')` }); });
    return out.sort((a, b) => (b.late - a.late) || ((a.n == null ? 1e9 : a.n) - (b.n == null ? 1e9 : b.n)));
  }
  /* بيانات الصفحات: الجدول وملخصات البرامج والمهام والتكليفات والتنبيهات */
  /* طلب واحد يملأ الذاكرة المؤقتة بما تحتاجه هذه الصفحات (الملف 35)؛ وبدونه طلبات متوازية */
  async function primeMine(units) { const t = curTerm(), mf = myFac(); if (S._noBundle || !t || !mf || qcFresh(qcKey('rpc:sched_context', { p_term: t.id }))) return;
    try { const b = await D.rpc('my_bundle', { p_term: t.id, p_faculty: mf, p_units: units }); if (!b) return;
      qcPrime(qcKey('rpc:faculty_courses', { p_faculty: mf, p_term: t.id }), b.faculty_courses); qcPrime(qcKey('rpc:sched_context', { p_term: t.id }), b.sched_context);
      qcPrime(qcKey('course_status', { eq: { term_id: t.id } }), b.course_status); qcPrime(qcKey('org_requests', { eq: { kind: 'inquiry', term_id: t.id } }), b.inquiries);
      qcPrime(qcKey('org_requests', { eq: { assignee_faculty: mf } }), b.assigned); if (units.length) qcPrime(qcKey('org_requests', { in: { unit_id: units } }), b.unit_reqs);
      ['data_requests', 'data_elements', 'data_values', 'annual_reports'].forEach((k) => qcPrime(qcKey(k), b[k]));
      /* الملف 36: الإصدار المعتمد وأعداد الطلاب */
      if (b.sched_versions && b.sections) { qcPrime(qcKey('sched_versions', { eq: { term_id: t.id, status: 'approved' }, cols: 'id,version_no,approved_at,approved_by,source_name' }), b.sched_versions); const lv = b.sched_versions.slice().sort((x, y) => y.version_no - x.version_no)[0]; if (lv) qcPrime(qcKey('sections', { eq: { version_id: lv.id }, cols: 'id,students' }), b.sections); } } catch (e) { S._noBundle = true; } }
  /* طلبات الصفحة والعدّادات المتزامنة تشترك في حساب واحد، ويُعاد الحساب بعد نصف دقيقة أو بعد أي كتابة */
  const MD = { p: null, t: 0, g: -1, me: null };
  const mineData = () => { const me = (S.me || {}).app_id; if (MD.p && MD.me === me && MD.g === QG.n && Date.now() - MD.t < 30000) return MD.p; const p = mineData0().catch((e) => { MD.p = null; throw e; }); Object.assign(MD, { p, t: Date.now(), g: QG.n, me }); return p; };
  async function mineData0() {
    const mf = myFac(), mem = myDirect().filter((m) => { const u = unit(m.unit_id); return u && u.status !== 'archived'; }), units = mem.map((m) => m.unit_id);
    await primeMine(units);
    const [, , r1, r2, an] = await Promise.all([loadSched(), loadCourseExtras(), D.select('org_requests', { eq: { assignee_faculty: mf } }).catch(() => []), units.length ? D.select('org_requests', { in: { unit_id: units } }).catch(() => []) : [], anUrgent().catch(() => ({ items: [], open: [], nm: String }))]);
    const sc = S.sched || { my: [], mine: [], courses: [] }, reqs = [...new Map([...r1, ...r2].map((q) => [q.id, q])).values()];
    const urg = buildUrgent(sc.my, reqs.filter((q) => q.assignee_faculty === mf || mem.some((m) => m.unit_id === q.unit_id && ['head', 'deputy'].includes(m.position))));
    urg.push(...an.items); urg.sort((a, b) => (b.late - a.late) || ((a.n == null ? 1e9 : a.n) - (b.n == null ? 1e9 : b.n)));
    S.urgentN = urg.length; S._anOpen = an; S.mineN = (sc.my || []).reduce((t, c) => t + reqCols().filter((col) => reqNow(c, col)).length, 0); S._appr = await approvalsOf(urg).catch(() => []); S.memN = units.length;
    return { sc, reqs, mem, urg };
  }
  /* المطلوب الآن من صاحب الحساب في متطلب: ما فيه نقص، أو ما بلغ موعده ولم يكتمل (بقواعد buildUrgent نفسها). ما لم يبدأ ولا موعد له لا يُعدّ */
  function reqNow(c, col) { const s = colState(c, col), r = courseRole(c, myFac()), al = ALERTS(), lead = Number(al.leadDays) || 7; if (s.t === 'late') return true; if (s.t === 'ok') return false;
    if (col.kind === 'file') { const n = daysTo(al.fileDue); return (r.teacher || r.coordinator) && n != null && n <= lead; }
    if (col.kind === 'exam' && r.coordinator) return stOf(c, 'exam').some((x) => { const d = x.details || {}; if (d.questions !== 'pending') return false; const nx = (d.items || []).filter((i) => i.date && String(i.date) >= today()).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0], n = d.qDue ? daysTo(d.qDue) : nx ? daysTo(nx.date) : null; return n == null || n <= lead; });
    return false; }
  /* تصفير العدّادات: عند تبديل الحساب أو تعذر الحساب لا يبقى رقم حساب سابق */
  const clearCounts = () => { S.mineN = 0; S.urgentN = 0; S.memN = 0; S._appr = []; S._anOpen = null; MD.p = null; };
  async function refreshUrgent() { if (!myFac()) { clearCounts(); navBadge(); return; } try { await mineData(); navBadge(); bellCount(); lampSet(); } catch (e) { console.warn(e); clearCounts(); navBadge(); } }
  const MINE_CSS = `.req{width:100%;border-collapse:separate;border-spacing:0 6px}.req th{font-size:13px;font-weight:800;padding:8px 10px;text-align:start;border-radius:10px 10px 0 0}
.req td{padding:10px;background:var(--card);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.req td:first-child{border-inline-start:1px solid var(--line);border-radius:0 10px 10px 0}.req td:last-child{border-inline-end:1px solid var(--line);border-radius:10px 0 0 10px}
.req td.rc{cursor:pointer}.req td.rc:hover{filter:brightness(.97)}.sb{display:inline-flex;gap:4px;align-items:center;font-size:12.5px;font-weight:700;padding:1px 9px;border-radius:999px;white-space:nowrap}
.sb.ok{color:var(--ok);background:var(--ok-soft)}.sb.wait{color:var(--wait);background:var(--wait-soft)}.sb.late{color:var(--late);background:var(--late-soft)}.sb.none{color:var(--mute);background:var(--line2)}
.lamp{display:inline-flex;align-items:center;gap:10px;border:0;cursor:pointer;font:inherit;font-weight:800;border-radius:999px;padding:8px 16px 8px 10px}
.lamp .bulb{width:38px;height:38px;border-radius:50%;display:grid;place-items:center}.lamp.on{background:#FFF4D6;color:#8A5A00}.lamp.on .bulb{background:#F5B700;color:#fff;box-shadow:0 0 0 6px rgba(245,183,0,.22),0 0 18px rgba(245,183,0,.55)}
.lamp.off{background:var(--line2);color:var(--mute)}.lamp.off .bulb{background:var(--line);color:var(--mute)}
.aline{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-inline-start:4px solid var(--c);border-radius:10px;padding:10px 12px}
.aline .when{font-size:12.5px;font-weight:700;white-space:nowrap}.aline .when.late{color:var(--late)}.aline .when.soon{color:var(--wait)}
.clist{display:grid;gap:8px}.clist button{display:flex;gap:10px;align-items:center;text-align:start;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer;font:inherit;color:var(--ink)}
.clist button:hover{border-color:var(--ledger)}.okmsg{text-align:center;padding:20px;color:var(--ok);font-weight:700;background:var(--ok-soft);border-radius:12px}
@media (max-width:760px){.req thead{display:none}.req,.req tbody,.req tr,.req td{display:block;width:100%}.req tr{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px;margin-bottom:10px}
  .req td,.req td:first-child,.req td:last-child{border:0;border-radius:8px;padding:6px 8px;margin-top:4px}.req td[data-h]::before{content:attr(data-h);display:block;font-size:12px;font-weight:800;color:var(--c)}
  .aline{grid-template-columns:1fr auto}.aline .act{grid-column:1/-1}.aline .act .btn{width:100%}}`;
  const mineCss = () => { if (!document.getElementById('mineCss')) { const s = document.createElement('style'); s.id = 'mineCss'; s.textContent = MINE_CSS; document.head.appendChild(s); } };
  const tint = (col, p) => `color-mix(in srgb, ${col} ${p}%, var(--card))`;

  /* ١ الرئيسية للدكتور: جدولي الدراسي، ولمبة التنبيهات */
  const lampHtml = () => { const n = S.urgentN || 0;
    return `<button class="lamp ${n ? 'on' : 'off'}" id="lamp" onclick="C.go('alerts')" aria-label="تنبيهاتي">${'<span class="bulb">' + icon('bell') + '</span>'}${n ? `${n} ${n === 1 ? 'تنبيه' : n === 2 ? 'تنبيهان' : n <= 10 ? 'تنبيهات' : 'تنبيهًا'}` : 'لا تنبيهات'}</button>`; };
  function lampSet() { const l = $('#lamp'); if (l) l.outerHTML = lampHtml(); }
  /* ===== مكونات موحدة لصفحات ما بعد الدخول (الأسلوب من أداة الجداول لد. عماد الطحان): page-hero وstat-card وitem-card وnav-badge وquick-search ===== */
  const termWeek = () => { const cal = ((S.settings || {}).publicInfo || {}).calendar || [], now = today();
    const st = cal.filter((x) => x && x.d && /(بد[ءا]|بداية).*(الدراسة|الفصل)/.test(x.t || '') && x.d <= now).map((x) => x.d).sort().pop(); if (!st) return null;
    const w = Math.floor((new Date(now + 'T00:00:00') - new Date(st + 'T00:00:00')) / (7 * 864e5)) + 1; return w >= 1 && w <= 24 ? w : null; };
  const heroChips = () => { const t = curTerm(), w = termWeek(); return (t ? `<span class="ph-chip">${esc(t.name)}</span>` : '') + (w ? `<span class="ph-chip">الأسبوع ${w}</span>` : ''); };
  const pageHero = (title, desc, big, side) => `<div class="page-hero${big ? ' big' : ''}"><div class="ph-t"><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ''}<div class="ph-chips">${heroChips()}</div></div>${side || ''}</div>`;
  const statCard = (n, label, hint, tone, act, pct) => `<${act ? 'button' : 'div'} class="stat-card ${tone || 'violet'}"${act ? ` onclick="${act}"` : ''}><b>${esc(n)}</b><span>${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}${pct != null ? `<em class="st-bar"><i style="width:${Math.min(100, Math.round(pct))}%"></i></em>` : ''}</${act ? 'button' : 'div'}>`;
  const numBox = (n, l, tone) => `<span class="num-box ${tone || ''}"><b>${esc(n)}</b><i>${esc(l)}</i></span>`;
  const itemCard = (o) => `<${o.act ? 'button' : 'div'} class="item-card ${o.tone || ''}"${o.color ? ` style="--tone:${attr(o.color)}"` : ''}${o.act ? ` onclick="${o.act}"` : ''}><div class="ic-h">${o.code ? `<span class="ic-code" dir="ltr">${esc(o.code)}</span>` : '<span></span>'}<span class="ic-chips">${o.chips || ''}</span></div><div class="ic-t">${esc(o.title)}</div>${o.sub ? `<div class="small muted">${esc(o.sub)}</div>` : ''}<div class="ic-end">${o.nums ? `<div class="ic-nums">${o.nums}</div>` : ''}${o.bar ? `<div class="ic-bar">${o.bar.label ? `<small>${esc(o.bar.label)}</small>` : ''}<span class="tr"><i style="width:${o.bar.pct}%"></i></span></div>` : ''}${o.badges ? `<div class="ic-badges">${o.badges}</div>` : ''}</div></${o.act ? 'button' : 'div'}>`;
  /* لون الجهة (الملف 34): لونها، وإلا لون أقرب جهة أعلى منها */
  const UC_PAL = ['#7B4FA0', '#2563EB', '#0D9488', '#DB2777', '#D97706', '#0891B2', '#4F46E5', '#65A30D'];
  const unitColor = (id) => { let u = typeof id === 'string' ? unit(id) : id, n = 0; while (u && n++ < 40) { if (/^#[0-9a-f]{6}$/i.test(u.color || '')) return u.color; u = u.parent_id ? unit(u.parent_id) : null; } return '#7B4FA0'; };
  const uTag = (id) => `<span class="u-tag" style="--tone:${unitColor(id)}">${esc(uName(id))}</span>`;
  C.unitColor = (id) => { const u = unit(id); if (!u || !cap(id, 'manage')) return; let cur = u.color || unitColor(id);
    modal('لون الجهة: ' + u.name, `<p class="small muted">يظهر بهذا اللون اسم الجهة وبطاقتها في كل الصفحات، وترثه الجهات التابعة لها إن لم يكن لها لون.</p><div class="uc-sw" id="ucSw">${UC_PAL.map((c) => `<button type="button" data-c="${c}" class="${c.toLowerCase() === cur.toLowerCase() ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div><label class="f" style="margin-top:12px">لون آخر<input type="color" id="ucC" value="${attr(cur)}"></label><div class="err"></div>`,
      `<button class="btn pri" id="ucOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#ucSw').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; $('#ucC').value = b.dataset.c; $$('#ucSw button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#ucOk').onclick = (ev) => busy(ev.target, async () => { await D.update('org_units', { color: val('ucC') }, { eq: { id } }); S.units = await D.select('org_units'); C.close(); refresh(); toast('حُفظ لون الجهة.'); }); };
  const WELCOME = () => 'مرحبًا، ' + String((S.me || {}).name || '').trim();
  /* إحصاء عضو هيئة التدريس: مطلوبة، متأخرة، اختبارات قادمة، تنبيهات */
  function homeStats(sc, urg) { const now = today(); let ex = 0; (sc.my || []).forEach((c) => stOf(c, 'exam').forEach((x) => { ex += ((x.details || {}).items || []).filter((i) => i.date && String(i.date) >= now).length; }));
    const late = urg.filter((x) => x.late).length;
    return `<div class="stat-row">${statCard(S.mineN || 0, 'مطلوب منك الآن', S.mineN ? 'من متطلبات مقرراتي' : 'لا شيء مطلوب الآن', S.mineN ? 'pink' : 'green', "C.mineF('now');C.go('mine')")}${statCard(late, 'متأخرة', late ? 'تحتاج إجراءً الآن' : 'لا شيء متأخر', late ? 'red' : 'green', "C.go('alerts')")}${statCard(ex, 'اختبارات قادمة', 'في مقرراتي', 'blue', "C.go('mine')")}${statCard(urg.length, 'تنبيهات جديدة', urg.length ? 'في تنبيهاتي' : 'لا تنبيهات', urg.length ? 'orange' : 'green', "C.go('alerts')")}</div>`; }
  /* شريط محاضرات اليوم، وإن لم يكن اليوم محاضرات فأقرب يوم */
  function todayStrip(cs) { const by = {}; (cs || []).forEach((c) => meetsOf(c).forEach((m) => (by[m.d] = by[m.d] || []).push({ c, from: m.from, to: m.to })));
    if (!Object.keys(by).length) return ''; const td = todayKey(), i0 = DAYS_ORDER.indexOf(td); let d = td, off = 0; for (; off < 7; off++) { d = DAYS_ORDER[(i0 + off) % 7]; if (by[d]) break; }
    return `<div class="today-strip"><h3>${off === 0 ? 'محاضرات اليوم' : 'لا محاضرات اليوم · الأقرب: ' + esc(d)}</h3><div class="ts-row">${by[d].sort((a, b) => String(a.from).localeCompare(String(b.from))).map((x) => `<div class="ts-item"><span dir="ltr" class="ts-t">${esc(x.from)}–${esc(x.to)}</span><b dir="ltr">${esc(x.c.code)}</b><span class="small">شعبة ${esc(x.c.section)}${x.c.room ? ' · <span dir="ltr">' + esc(x.c.room) + '</span>' : ''}</span></div>`).join('')}</div></div>`; }
  async function staffHome() {
    mineCss(); const { sc, urg } = await mineData(); navBadge(); bellCount(); const cs = sc.mine;
    const banner = DEMO ? '<div class="banner">نسخة تجريبية ببيانات وهمية.</div>' : '';
    return `<div class="homebody">${banner}${pageHero(WELCOME(), `${cs.length} شعبة · ${cs.reduce((s, c) => s + (+c.hours || 0), 0)} ساعة`, true)}${homeStats(sc, urg)}${todayStrip(cs)}
      <h3 style="margin:18px 0 8px">جدولي الدراسي</h3>${cs.length ? `<div class="tw"><table><tr><th>المقرر</th><th>الشعبة</th><th>الأيام</th><th>الوقت</th><th>القاعة</th></tr>${cs.map((c) => `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}</td><td>${esc(c.section)}</td><td>${esc(c.days)}</td><td><span dir="ltr" style="white-space:nowrap">${esc(c.from)}–${esc(c.to)}</span></td><td><span dir="ltr">${esc(c.room || '')}</span></td></tr>`).join('')}</table></div>`
        : `<div class="empty">${myFac() ? 'لا توجد شعب مسندة إليك في الجدول المعتمد لهذا الفصل.' : 'حسابك غير مرتبط بسجل عضو هيئة تدريس. يربطه مدير النظام.'}</div>`}</div>`;
  }
  /* ٢ «مهامي»: بطاقات الحالة، وبطاقة لكل مقرر بلون حالته وشارات متطلباته؛ الضغط على الشارة يفتح البرنامج المعني على المقرر */
  const MF = { f: 'all' };
  C.mineF = (f) => { MF.f = f; refresh(); };
  const courseState = (st) => st.some((x) => x.s.t === 'late') ? 'late' : st.length && st.every((x) => x.s.t === 'ok') ? 'ok' : st.every((x) => x.s.t === 'none') ? 'none' : 'wait';
  async function pgMine() {
    mineCss(); if (!myFac()) return '<div class="empty">حسابك غير مرتبط بسجل عضو هيئة تدريس. يربطه مدير النظام.</div>';
    const t0 = curTerm(); if (t0 && viewRole() !== 'staff') D.rpc('dept_followup', { p_term: t0.id }).catch(() => {});   /* لوحة المتابعة بالتوازي مع البيانات */
    const { sc } = await mineData(); navBadge(); bellCount(); const cols = reqCols();
    const v = sc.term ? await approvedOf(sc.term.id).catch(() => null) : null, secs0 = v ? await D.select('sections', { eq: { version_id: v.id }, cols: 'id,students' }).catch(() => []) : [], stu = Object.fromEntries(secs0.map((x) => [x.id, x.students]));
    const TONE = { late: 'bad', ok: 'ok', wait: 'wait', none: 'none' }, TXT = { late: 'فيه نقص', ok: 'مكتمل', wait: 'قيد العمل', none: 'لم يبدأ' };
    const cards = sc.my.map((c) => { const r = c.role, secs = r.teacher ? c.sections.filter((x) => r.sections.includes(x.id)) : c.sections, st = cols.map((col) => ({ col, s: colState(c, col), a: colApp(col), now: reqNow(c, col) }));
      const ok = st.filter((x) => x.s.t === 'ok').length, state = courseState(st), n = secs.reduce((a, x) => a + (+stu[x.id] || 0), 0), pn = ((S.programs || []).find((p) => p.id === c.program_id) || {}).name, pct = st.length ? Math.round(ok / st.length * 100) : 0;
      return { c, r, state, ok, n, now: st.filter((x) => x.now).length, lateR: st.filter((x) => x.now && x.s.t === 'late').length, secs: secs.length, total: st.length, html: itemCard({ code: c.code, title: c.name, tone: TONE[state],
        chips: `<span class="st-tag ${TONE[state]}">${TXT[state]}</span>`, sub: [pn, r.teacher && r.coordinator ? 'أستاذ ومنسق' : r.coordinator ? 'منسق' : r.teacher ? 'أستاذ' : ''].filter(Boolean).join(' · '),
        nums: numBox(secs.length, 'شعب') + (n ? numBox(n, 'طلاب') : '') + numBox(pct + '%', 'الإنجاز'), bar: { pct },
        badges: st.map((x) => `<button class="rq-b ${x.s.t}" ${x.a ? `onclick="C.appOpenCtx('${x.a.id}','${c.id}')" title="فتح ${attr(x.a.name)}"` : 'disabled title="لم يُربط برنامج بهذا العمود"'}><span aria-hidden="true">${SB[x.s.t]}</span>${esc(x.col.name)}: ${esc(x.s.text)}${x.s.test ? ' · تجريبية' : ''}</button>`).join('') }) }; });
    const N = cards.length, cnt = (s) => cards.filter((x) => x.state === s).length, stuAll = cards.reduce((a, x) => a + x.n, 0), secAll = cards.reduce((a, x) => a + x.secs, 0), lateN = cards.filter((x) => x.state === 'late').length, nowN = S.mineN || 0, pc = (a, b) => b ? a / b * 100 : 0;
    const list = cards.filter((x) => MF.f === 'now' ? x.now : MF.f === 'late' ? x.state === 'late' : MF.f === 'coord' ? x.r.coordinator : MF.f === 'teach' ? x.r.teacher : true);
    const fb = (k, t, n) => `<button class="btn sm ${MF.f === k ? 'pri' : ''}" onclick="C.mineF('${k}')">${t} (${n})</button>`;
    const follow = (viewRole() !== 'staff' ? await followBoard(sc) : '') + anMine();
    return `<div class="stat-row">${(() => { const lr = cards.reduce((a, x) => a + x.lateR, 0), tot = cards.reduce((a, x) => a + x.total, 0); return statCard(nowN, 'مطلوب منك الآن', nowN ? lr + ' ناقصة · ' + (nowN - lr) + ' حان موعدها' : 'لا شيء مطلوب الآن', nowN ? 'red' : 'green', "C.mineF('now')", pc(nowN, tot)); })()}
        ${statCard(N, 'مقرراتي', `${secAll} شعبة${stuAll ? ' · ' + stuAll + ' طالبًا' : ''}${cnt('none') ? ' · لم يبدأ ' + cnt('none') : ''}`, 'violet', "C.mineF('all')", 100)}
        ${statCard(cnt('ok'), 'مكتملة', `${cnt('ok')} من ${N}`, 'green', null, pc(cnt('ok'), N))}${statCard(cnt('wait'), 'قيد العمل', `${cnt('wait')} من ${N}`, 'orange', null, pc(cnt('wait'), N))}${statCard(lateN, 'فيها نقص', `${lateN} من ${N}`, lateN ? 'red' : 'green', "C.mineF('late')", pc(lateN, N))}</div>
      <div class="row noprint" style="gap:6px;flex-wrap:wrap;margin-bottom:12px">${fb('all', 'الكل', N)}${fb('now', 'مطلوب الآن', cards.filter((x) => x.now).length)}${fb('late', 'المتأخر', lateN)}${fb('coord', 'بصفتي منسقًا', cards.filter((x) => x.r.coordinator).length)}${fb('teach', 'بصفتي أستاذًا', cards.filter((x) => x.r.teacher).length)}</div>
      ${!sc.my.length ? '<div class="empty">لا توجد مقررات مسندة إليك تدريسًا أو تنسيقًا في الجدول المعتمد لهذا الفصل.</div>' : list.length ? `<div class="item-grid">${list.map((x) => x.html).join('')}</div>` : '<div class="okmsg">لا توجد مقررات في هذا التصنيف ✓</div>'}${follow}`;
  }
  /* ٣ «العضوية في الوحدات واللجان»: كل جهة لي فيها دور، بلا فصل بين وحدة ولجنة وقسم ووكالة.
     الضغط يفتح وجهة الدخول التي حددها مدير النظام للجهة (org_units.entry_app، الملف 18) بمستوى دوري فيها، وإلا مساحة عمل الجهة.
     ثم «صلاحيات خاصة»: برامج لي عليها صلاحية فردية أو دور عام دون عضوية في جهتها. */
  const ROLE_ORD = { head: 0, deputy: 1, secretary: 2, member: 3, viewer: 4 };
  const ROLE_LBL = { head: ['رئيس', 'brass'], deputy: ['نائب', 'brass'], secretary: ['مقرر', 'ok'], member: ['عضو', ''], viewer: ['مطّلع', 'wait'] };
  async function pgComms() {
    mineCss();
    if (!myFac()) return '<div class="empty">حسابك غير مرتبط بسجل عضو هيئة تدريس، فلا تظهر عضوياتك. يربطه مدير النظام من «الحسابات والصلاحيات» (أو يُربط تلقائيًا إن تطابق بريد الحساب مع بريدك في قاعدة الأعضاء).</div>';
    const mem = myDirect().filter((m) => { const u = unit(m.unit_id); return u && u.status !== 'archived'; })
      .sort((a, b) => ((ROLE_ORD[a.position] ?? 9) - (ROLE_ORD[b.position] ?? 9)) || uName(a.unit_id).localeCompare(uName(b.unit_id), 'ar'));
    const [reqs, fac, acc, vals, els] = await Promise.all([mem.length ? D.select('org_requests', { in: { unit_id: mem.map((m) => m.unit_id) } }).catch(() => []) : [],
      D.select('org_app_fac', { eq: { faculty_id: myFac() } }).catch(() => []), D.select('org_app_access', { eq: { profile_app_id: S.me.app_id } }).catch(() => []), D.select('data_values', { eq: { status: 'draft' } }).catch(() => []), anElsQ().catch(() => [])]);
    const waitN = (uid) => vals.filter((v) => { const e = els.find((x) => x.code === v.element_code); return e && anOwner(e, v.program_id, v.department_id) === uid; }).length;
    const openN = (uid) => reqs.filter((q) => q.unit_id === uid && q.kind !== 'inquiry' && !q.archived && !['done', 'rejected'].includes(q.status)).length;
    const entry = (u) => { const a = u.entry_app && S.apps.find((x) => x.id === u.entry_app && x.active !== false); return a && appLv(a) !== 'none' ? a : null; };
    const lateN = (uid) => reqs.filter((q) => q.unit_id === uid && q.kind !== 'inquiry' && !q.archived && !['done', 'rejected'].includes(q.status) && q.due_date && q.due_date < today()).length;
    const cards = mem.map((m) => { const u = unit(m.unit_id), a = entry(u), n = openN(u.id), l = lateN(u.id), r = ROLE_LBL[m.position] || [POS[m.position] || m.position, ''], w = m.position === 'head' ? waitN(u.id) : 0;
      return itemCard({ title: u.name, color: unitColor(u.id), sub: (u.parent_id ? uName(u.parent_id) + ' · ' : '') + (a ? 'يفتح: ' + a.name : 'مساحة عمل الجهة'), act: a ? `C.appOpen('${a.id}')` : `C.go('unit',{id:'${u.id}'})`, chips: `<span class="role-b">${esc(r[0])}</span>`,
        nums: numBox(S.members.filter((x) => x.unit_id === u.id && activeM(x)).length, 'الأعضاء') + numBox(n, 'مهام مفتوحة') + (l ? numBox(l, 'متأخرة', 'bad') : '') + (m.position === 'head' ? numBox(w, 'بانتظار الاعتماد') : '') }); }).join('');
    const memStats = mem.length ? `<div class="stat-row">${statCard(mem.length, 'جهاتي', mem.filter((m) => m.position === 'head').length + ' برئاستي', 'violet')}${statCard(mem.reduce((t, m) => t + openN(m.unit_id), 0), 'مهام مفتوحة', 'في جهاتي', 'orange')}${(() => { const l = mem.reduce((t, m) => t + lateN(m.unit_id), 0); return statCard(l, 'متأخرة', l ? 'تجاوزت موعدها' : 'لا شيء متأخر', l ? 'red' : 'green'); })()}${mem.some((m) => m.position === 'head') ? statCard(mem.filter((m) => m.position === 'head').reduce((t, m) => t + waitN(m.unit_id), 0), 'بانتظار الاعتماد', 'في جهات برئاستي', 'pink') : ''}</div>` : '';
    /* صلاحيات خاصة: فردية (org_app_access / org_app_fac) أو دور عام (org_app_duties) على برنامج ليست لي عضوية في جهته ولا هو وجهة دخول لجهة من جهاتي */
    const mine = new Set(mem.map((m) => m.unit_id)), viaEntry = new Set(mem.map((m) => (unit(m.unit_id) || {}).entry_app).filter(Boolean));
    const ids = new Set([...fac, ...acc].filter((x) => x.level && x.level !== 'none').map((x) => x.app_id).concat(Object.keys(S.duties || {})));
    const special = S.apps.filter((a) => ids.has(a.id) && a.active !== false && appLv(a) !== 'none' && !mine.has(a.unit_id) && !viaEntry.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const LVL = { manage: ['إدارة', 'brass'], use: ['استخدام', 'ok'], view: ['اطلاع', ''] };
    if (!mem.length && !special.length) return '<div class="empty">ليست لك عضوية في جهة حاليًا. لإضافتك تواصل مع مدير النظام.</div>';
    return (mem.length ? memStats + `<div class="item-grid">${cards}</div>` : '<div class="empty">ليست لك عضوية في جهة حاليًا. لإضافتك تواصل مع مدير النظام.</div>') +
      (special.length ? `<h3 style="margin:22px 0 4px;font-size:15px">صلاحيات خاصة</h3><p class="small muted" style="margin:0 0 8px">برامج لك عليها صلاحية دون عضوية في جهتها.</p>
        <div class="clist">${special.map((a) => { const l = LVL[appLv(a)] || ['اطلاع', '']; return `<button onclick="C.appOpen('${a.id}')" style="padding:9px 14px">${icon(a.icon || 'app')}<span class="grow"><b>${esc(a.name)}</b><span class="small muted" style="display:block">${esc(uName(a.unit_id))}</span></span>${chip(l[0], l[1])}${icon('chev')}</button>`; }).join('')}</div>` : '');
  }
  /* ===== التقرير السنوي، المرحلة 1 (الملف 28): سجل البيانات، وطلبات البيانات، والقاموس. الصلاحية تفرضها دوال القاعدة؛ هنا لإظهار الأزرار فقط. ===== */
  const annualSeen = () => isAdmin() || myDirect().length > 0;
  const ANQ = { tab: 'data', year: '', mode: 'program', prog: '', unit: '', q: '' };
  const anMem = (u) => !!myFac() && !!u && S.members.some((m) => m.unit_id === u && m.faculty_id === myFac() && activeM(m));
  const anHead = (u) => !!myFac() && !!u && S.members.some((m) => m.unit_id === u && m.faculty_id === myFac() && m.position === 'head' && activeM(m));
  const anAdmin = () => isAdmin() || anMem('u-quality');
  const anProg = (id) => (S.programs || []).find((p) => p.id === id);
  const anQaUnit = (id) => (anProg(id) || {}).quality_unit_id || 'u-quality';
  const anOwner = (e, pg, dp) => e.owner_unit_id || (e.level === 'program' ? anQaUnit(pg) : e.level === 'department' ? dp : 'u-quality');
  const anWork = (id) => anAdmin() || anMem(anQaUnit(id)) || (!!myFac() && (anProg(id) || {}).coordinator_id === myFac());
  const AN_ST = { none: ['لم يُدخل', 'wait'], draft: ['مسودة', ''], returned: ['أُعيد بملاحظات', 'bad'], approved: ['معتمد', 'ok'] };
  const AN_UNIT = { count: 'عدد', percent: 'نسبة مئوية', ratio: 'نسبة', text: 'نص' };
  const AN_LEVEL = { program: 'برنامج', department: 'قسم', college: 'كلية' };
  const AN_SRC = { site: 'الموقع', app: 'برنامج', manual: 'يدوي' };
  const DR_ST = { new: ['جديد', 'wait'], in_progress: ['قيد العمل', ''], done: ['تم', 'ok'], rejected: ['مرفوض', 'bad'] };
  const anYears = () => [...new Set((S.terms || []).map((x) => String(x.year)))].sort().reverse();
  const anKey = (el, pg, dp, tm) => [el, pg || '', dp || '', tm || ''].join('|');
  const anFail = (e) => /does not exist|schema cache|relation/i.test(String(e && e.message)) ? '<div class="empty">هذه الصفحات تحتاج تنفيذ الملف database/28_annual_data.sql أولًا.</div>' : `<div class="panel bad">${esc(pgErr(e))}</div>`;
  /* البرامج التي تظهر للمستخدم: الكل للمدير ووحدة الجودة والعميد والوكيل؛ وإلا برامج لجنته أو تنسيقه أو قسمه، وكل البرامج لعضو جهة تملك عنصرًا بعينه (يُدخل قيمه لكل برنامج) */
  const anVisible = (els) => { const progs = (S.programs || []).filter((p) => p.active !== false);
    if (anAdmin() || leadScope().quality) return progs;
    const owner = (els || []).some((e) => e.active !== false && e.level === 'program' && e.owner_unit_id && anMem(e.owner_unit_id));
    const sc = leadScope(); return progs.filter((p) => owner || anWork(p.id) || sc.progs.some((x) => x.id === p.id)); };
  const anSoon = (t, stage, body) => `<div class="empty"><b>${esc(t)}: قيد الإنشاء — المرحلة ${stage}</b><div class="small" style="margin-top:6px">${esc(body)}</div></div>`;
  async function pgAnnual() {
    if (!ANQ.year) ANQ.year = String((curTerm() || {}).year || anYears()[0] || '');
    const tabs = [['data', 'سجل البيانات'], ['kpi', 'مؤشرات الأداء'], ['apr', 'تقرير البرنامج السنوي'], anAdmin() ? ['col', 'التقرير السنوي للكلية'] : null, ['req', 'طلبات البيانات']].filter(Boolean);
    if (!tabs.some((t) => t[0] === ANQ.tab)) ANQ.tab = 'data';
    const nav = `<div class="row noprint" style="margin-bottom:12px;gap:6px;flex-wrap:wrap">${tabs.map(([k, l]) => `<button class="btn sm ${ANQ.tab === k ? 'pri' : ''}" onclick="C.anq('tab','${k}')">${l}</button>`).join('')}</div>`;
    try {
      const els = await D.select('data_elements', { order: ['sort'] }), vis = anVisible(els);
      if (!vis.some((p) => p.id === ANQ.prog)) ANQ.prog = (vis.find((p) => anWork(p.id)) || vis[0] || {}).id || '';
      const yearSel = `<label class="f" style="margin:0;max-width:130px">العام<select onchange="C.anq('year',this.value)">${anYears().map((y) => opt(y, y + 'هـ', ANQ.year)).join('')}</select></label>`;
      const progSel = ANQ.tab === 'col' || (ANQ.tab === 'data' && ANQ.mode === 'unit') ? '' : ANQ.tab === 'req'
        ? `<label class="f" style="margin:0;max-width:340px">البرنامج<select onchange="C.anq('rprog',this.value)"><option value="">كل برامجي</option>${vis.map((p) => opt(p.id, p.name, ANQ.rprog)).join('')}</select></label>`
        : `<label class="f" style="margin:0;max-width:340px">البرنامج<select onchange="C.anq('prog',this.value)">${vis.map((p) => opt(p.id, p.name, ANQ.prog)).join('')}</select></label>`;
      const head = `<div class="row noprint" style="margin-bottom:12px;gap:10px;flex-wrap:wrap;align-items:flex-end">${progSel}${yearSel}</div>`;
      if (!vis.length && ANQ.tab !== 'req') return nav + '<div class="empty">لا توجد برامج ضمن صلاحيتك. تظهر برامج قسمك بعد إضافتك إلى لجنة جودته.</div>';
      const body = ANQ.tab === 'req' ? await anReqTab(vis) : ANQ.tab === 'kpi' ? await anKpiTab(vis)
        : ANQ.tab === 'apr' ? await anAprTab()
        : ANQ.tab === 'col' ? anSoon('التقرير السنوي للكلية', 4, 'يجمع برامج الكلية مع نموذج نتائج مؤشرات الأداء (6).') : await anDataTab(vis);
      return nav + head + body;
    } catch (e) { console.error(e); return nav + anFail(e); }
  }
  C.anq = (k, v) => { ANQ[k] = v; if (VIEW.page === 'annual') refresh(); else C.go('annual'); };
  /* صفوف السجل: كل عنصر نشط مع كل نطاق وفترة ضمن المعروض، ومعها قيمته إن كانت ظاهرة للمستخدم وحالتها */
  async function anLoad() {
    const [els, vals, st] = await Promise.all([D.select('data_elements', { order: ['sort'] }), D.select('data_values', { eq: { year: ANQ.year } }), D.rpc('data_status', { p_year: ANQ.year })]);
    const V = new Map(vals.map((v) => [anKey(v.element_code, v.program_id, v.department_id, v.term), v])), ST = new Map((st || []).map((s) => [anKey(s.element, s.program, s.department, s.term), s.status]));
    const progs = (S.programs || []).filter((p) => p.active !== false), vis = anVisible(els), terms = (S.terms || []).filter((x) => String(x.year) === ANQ.year), rows = [];
    const owners = [...new Set(els.filter((e) => e.active !== false).flatMap((e) => e.level === 'program' ? progs.map((p) => anOwner(e, p.id)) : e.level === 'department' ? deptUnits().map((d) => anOwner(e, null, d.id)) : [anOwner(e)]))].filter(Boolean);
    if (!ANQ.unit || !owners.includes(ANQ.unit)) ANQ.unit = owners.find(anMem) || owners[0] || '';
    els.filter((e) => e.active !== false).forEach((e) => { let sc = [];
      if (ANQ.mode === 'program') { const g = anProg(ANQ.prog); if (!g) return;
        sc = e.level === 'program' ? [{ pg: g.id }] : e.level === 'department' ? (g.department_id ? [{ dp: g.department_id }] : []) : [{}]; }
      else sc = e.level === 'program' ? progs.filter((p) => anOwner(e, p.id) === ANQ.unit).map((p) => ({ pg: p.id })) : e.level === 'department' ? deptUnits().filter((d) => anOwner(e, null, d.id) === ANQ.unit).map((d) => ({ dp: d.id })) : anOwner(e) === ANQ.unit ? [{}] : [];
      sc.forEach((s) => (e.period_kind === 'term' ? terms.map((x) => x.id) : [null]).forEach((tm) => { const k = anKey(e.code, s.pg, s.dp, tm), v = V.get(k), owner = anOwner(e, s.pg, s.dp);
        rows.push({ e, pg: s.pg || null, dp: s.dp || null, tm, v, status: ST.get(k) || 'none', owner, enter: e.source === 'manual' && (anAdmin() || anMem(owner)), approve: isAdmin() || anHead(owner) }); })); });
    S._an = { els, rows, owners, progs, vis };
    return S._an;
  }
  const anScope = (r) => r.pg ? (anProg(r.pg) || {}).name || r.pg : r.dp ? uName(r.dp) : 'الكلية';
  const anTerm = (id) => { const x = (S.terms || []).find((k) => k.id === id); return x ? x.name : 'العام كله'; };
  const anVal = (r) => !r.v ? (r.status === 'none' ? '—' : '<span class="small muted">غير معتمدة بعد</span>') : r.e.unit === 'text' ? esc(r.v.value_text) : `<b class="num">${esc(r.v.value_num)}</b>${r.e.unit === 'percent' ? '٪' : ''}`;
  async function anDataTab() {
    const { rows, owners, progs } = await anLoad();
    const canUnit = anAdmin() || owners.some(anMem);
    const cnt = (s) => rows.filter((r) => r.status === s).length;
    const canReq = progs.some((p) => anWork(p.id)) || myDirect().length > 0;
    const acts = (r, i) => [r.enter && r.status !== 'approved' ? `<button class="btn sm pri" onclick="C.dvEdit(${i})">${r.status === 'none' ? 'إدخال' : 'تعديل'}</button>` : '',
      r.approve && r.status === 'draft' && r.v ? `<button class="btn sm" onclick="C.dvReview(${i},'approve')">اعتماد</button><button class="btn sm" onclick="C.dvReview(${i},'return')">إعادة</button>` : '',
      r.approve && r.status === 'approved' && r.v ? `<button class="btn sm" onclick="C.dvReview(${i},'reopen')">إعادته مسودة</button>` : ''].join(' ');
    return `<div class="row noprint" style="margin-bottom:12px;gap:8px;flex-wrap:wrap;align-items:center">
        ${canUnit ? `<select class="inp" onchange="C.anq('mode',this.value)" aria-label="العرض">${opt('program', 'حسب البرنامج', ANQ.mode)}${opt('unit', 'حسب الجهة المالكة', ANQ.mode)}</select>` : ''}
        ${ANQ.mode === 'unit' && canUnit ? `<select class="inp" onchange="C.anq('unit',this.value)" aria-label="الجهة">${owners.map((u) => opt(u, uName(u), ANQ.unit)).join('')}</select>` : ''}
        <span class="grow"></span>${anAdmin() ? '<button class="btn sm" onclick="C.anRefresh(event)">تحديث الآلي من الموقع</button>' : ''}${canReq && rows.length ? '<button class="btn sm pri" onclick="C.drNew()">طلب البيانات</button>' : ''}</div>
      <div class="stats" style="margin-bottom:12px"><div><b>${cnt('approved')}</b><span>معتمد</span></div><div><b>${cnt('draft')}</b><span>مسودة</span></div><div><b class="${cnt('returned') ? 'bad' : ''}">${cnt('returned')}</b><span>أُعيد بملاحظات</span></div><div><b>${cnt('none')}</b><span>لم يُدخل</span></div></div>
      ${rows.length ? `<div class="tw"><table><tr><th>العنصر</th><th>النطاق</th><th>الجهة المالكة</th><th>الفترة</th><th>المصدر</th><th>القيمة</th><th>الحالة</th><th class="noprint"></th></tr>
        ${rows.map((r, i) => `<tr><td><b>${esc(r.e.name_ar)}</b><div class="tiny muted" dir="ltr" style="text-align:end">${esc(r.e.code)}</div></td><td>${esc(anScope(r))}</td><td class="small">${esc(uName(r.owner))}</td><td class="small">${esc(anTerm(r.tm))}</td><td class="small">${esc(AN_SRC[r.e.source] || r.e.source)}</td><td>${anVal(r)}${r.v && r.v.evidence ? `<div class="tiny muted">الشاهد: ${esc(r.v.evidence)}</div>` : ''}${r.v && r.v.note ? `<div class="tiny ${r.status === 'returned' ? 'bad' : 'muted'}">${esc(r.v.note)}</div>` : ''}</td><td>${chip(...AN_ST[r.status])}</td><td class="noprint">${acts(r, i)}</td></tr>`).join('')}</table></div>`
        : '<div class="empty">لا توجد عناصر لهذا العرض. يُعبَّأ القاموس بتنفيذ الملف 30، أو يضيفها المدير ووحدة الجودة من صفحة «مؤشرات الأداء».</div>'}`;
  }
  C.dvEdit = (i) => { const r = S._an.rows[i], e = r.e, v = r.v || {};
    modal(e.name_ar + ' — ' + anScope(r), `<p class="small muted">${esc(e.definition || '')}</p><p class="small muted">${esc(anTerm(r.tm))} · ${esc(ANQ.year)}هـ · الجهة المالكة: ${esc(uName(r.owner))}. أرقام مجمّعة فقط، دون أي بيانات شخصية.</p>
      ${r.status === 'returned' && v.note ? `<div class="panel bad small" style="margin-bottom:8px">ملاحظة الإعادة: ${esc(v.note)}</div>` : ''}
      <div class="formgrid">${e.unit === 'text' ? `<label class="f full">النص<textarea id="dvT" rows="3">${esc(v.value_text || '')}</textarea></label>` : `<label class="f">القيمة (${esc(AN_UNIT[e.unit])})<input id="dvN" type="number" step="any" dir="ltr" value="${attr(v.value_num == null ? '' : v.value_num)}"></label>`}
      <label class="f full">الشاهد (نص أو رابط)<input id="dvE" value="${attr(v.evidence || '')}" maxlength="500"></label><label class="f full">ملاحظة<textarea id="dvO" rows="2" maxlength="1000"></textarea></label></div><div class="err"></div>`,
      `<button class="btn pri" id="dvOk">حفظ مسودة</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#dvOk').onclick = (ev) => busy(ev.target, async () => { const n = val('dvN');
      await D.rpc('data_value_save', { p_element: e.code, p_program: r.pg, p_department: r.dp, p_year: ANQ.year, p_term: r.tm, p_num: e.unit === 'text' || n === '' ? null : Number(n), p_text: e.unit === 'text' ? val('dvT') : '', p_evidence: val('dvE'), p_note: val('dvO'), p_version: v.version || 0 });
      C.close(); toast('حُفظت القيمة مسودة.'); refresh(); }); };
  C.dvReview = (i, act) => { const r = S._an.rows[i], T = { approve: 'اعتماد القيمة', return: 'إعادة القيمة بملاحظات', reopen: 'إعادة القيمة إلى مسودة' }[act];
    const showV = r.e.unit === 'text' ? r.v.value_text : r.v.value_num;
    modal(T + ' — ' + r.e.name_ar, `<p>${esc(anScope(r))} · ${esc(anTerm(r.tm))}: <b>${esc(showV)}</b></p>${r.v.evidence ? `<p class="small">الشاهد: ${esc(r.v.evidence)}</p>` : ''}${act === 'reopen' ? '<p class="small muted">ستختفي القيمة عن غير المالكين حتى يُعاد اعتمادها، وتبقى القديمة في سجل التدقيق.</p>' : ''}
      <label class="f">${act === 'return' ? 'ملاحظة الإعادة (إلزامية)' : 'ملاحظة (اختيارية)'}<textarea id="drvN" rows="2"></textarea></label><div class="err"></div>`, `<button class="btn pri" id="drvOk">${T}</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#drvOk').onclick = (ev) => busy(ev.target, async () => { await D.rpc('data_value_review', { p_id: r.v.id, p_action: act, p_note: val('drvN'), p_version: r.v.version }); C.close(); toast('تم.'); refresh(); }); };
  /* طلب البيانات: إلى جهة مالكة، لعناصرها في برنامج */
  C.drNew = (pre) => { const A = S._an, mine = myDirect().map((m) => m.unit_id), froms = [];
    A.vis.filter((p) => anWork(p.id)).forEach((p) => froms.push(['p:' + p.id, 'لجنة برنامج: ' + p.name])); mine.forEach((u) => froms.push(['u:' + u, uName(u)]));
    const pending = () => { const pg = val('drP') || null, to = val('drT'), g = anProg(pg); return A.els.filter((e) => e.active !== false && e.source === 'manual' && anOwner(e, pg, g ? g.department_id : null) === to); };
    const toList = [...new Set(A.els.filter((e) => e.active !== false && e.source === 'manual').flatMap((e) => A.vis.map((p) => anOwner(e, p.id, p.department_id))))].filter(Boolean);
    modal('طلب البيانات', `<div class="formgrid"><label class="f">الجهة الطالبة<select id="drF">${froms.map(([v, l]) => opt(v, l, ANQ.mode === 'program' ? 'p:' + ANQ.prog : '')).join('')}</select></label>
      <label class="f">البرنامج<select id="drP" onchange="C.drEls()">${A.vis.map((p) => opt(p.id, p.name, ANQ.prog)).join('')}</select></label>
      <label class="f">الجهة المطلوب منها<select id="drT" onchange="C.drEls()">${toList.map((u) => opt(u, uName(u), pre || (ANQ.mode === 'unit' ? ANQ.unit : ''))).join('')}</select></label>
      <label class="f">آخر موعد<input id="drD" type="date"></label><label class="f full">ملاحظة<textarea id="drN" rows="2" maxlength="1000"></textarea></label></div>
      <h3 style="margin:10px 0 4px;font-size:14px">العناصر (عام ${esc(ANQ.year)}هـ)</h3><div id="drE"></div><div class="err"></div>`, `<button class="btn pri" id="drOk">إرسال الطلب</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    C.drEls = () => { const L = pending(); $('#drE').innerHTML = L.length ? L.map((e) => `<label class="row small" style="gap:6px;align-items:center"><input type="checkbox" class="drC" value="${attr(e.code)}" checked style="width:auto">${esc(e.name_ar)}</label>`).join('') : '<p class="small muted">لا عناصر لهذه الجهة في هذا البرنامج.</p>'; };
    C.drEls();
    $('#drOk').onclick = (ev) => busy(ev.target, async () => { const f = val('drF'), els = [...document.querySelectorAll('.drC:checked')].map((x) => x.value), pg = val('drP'), g = anProg(pg), to = val('drT');
      if (!f) throw new Error('ليست لك جهة تطلب باسمها.'); if (!els.length) throw new Error('اختر عنصرًا واحدًا على الأقل.');
      await D.rpc('data_request_create', { p_from_unit: f.startsWith('u:') ? f.slice(2) : null, p_from_program: f.startsWith('p:') ? f.slice(2) : null, p_to_unit: to, p_elements: els, p_program: pg, p_department: g ? g.department_id : null, p_year: ANQ.year, p_term: null, p_due: val('drD') || null, p_note: val('drN') });
      const h = headOf(to), hf = h && fac(h.faculty_id); if (hf && hf.profile_app_id) notify([hf.profile_app_id], 'طلب بيانات جديد للتقرير السنوي: ' + els.length + ' عنصر من ' + froms.find((x) => x[0] === f)[1]);
      C.close(); toast('أُرسل الطلب.'); ANQ.tab = 'req'; refresh(); }); };
  async function anReqTab() {
    const [all, els] = await Promise.all([D.select('data_requests', { eq: { year: ANQ.year }, order: ['created_at', false] }), anElsQ()]), list = ANQ.rprog ? all.filter((q) => q.program_id === ANQ.rprog) : all;
    const nm = (c) => (els.find((e) => e.code === c) || {}).name_ar || c, from = (q) => q.from_program_id ? 'لجنة ' + ((anProg(q.from_program_id) || {}).name || '') : uName(q.from_unit_id);
    S._dr = list;
    if (!list.length) return '<div class="empty">لا توجد طلبات بيانات لك في هذا العام.</div>';
    const row = (q) => { const can = anAdmin() || anMem(q.to_unit_id), open = !['done', 'rejected'].includes(q.status), n = daysTo(q.due_date);
      return `<tr><td class="small">${esc(from(q))}</td><td class="small">${esc(uName(q.to_unit_id))}</td><td class="small">${(q.elements || []).map((c) => esc(nm(c))).join('<br>')}</td><td class="small">${esc((anProg(q.program_id) || {}).name || '—')}</td>
        <td class="small">${q.due_date ? esc(fmtD(q.due_date)) + (open && n != null && n < 0 ? ' <span class="bad">متأخر</span>' : '') : '—'}</td><td>${chip(...DR_ST[q.status])}${q.note ? `<div class="tiny muted">${esc(q.note)}</div>` : ''}${q.reply ? `<div class="tiny">الرد: ${esc(q.reply)}</div>` : ''}</td>
        <td class="noprint">${can && open ? `${q.status === 'new' ? `<button class="btn sm" onclick="C.drSet('${q.id}','in_progress')">قيد العمل</button> ` : ''}<button class="btn sm pri" onclick="C.drSet('${q.id}','done')">تم</button> <button class="btn sm" onclick="C.drSet('${q.id}','rejected')">رفض</button>` : ''}</td></tr>`; };
    return `<div class="tw"><table><tr><th>من</th><th>إلى</th><th>العناصر</th><th>البرنامج</th><th>الموعد</th><th>الحالة</th><th class="noprint"></th></tr>${list.map(row).join('')}</table></div>`;
  }
  C.drSet = (id, status) => { const q = S._dr.find((x) => x.id === id), done = async () => { if (q.created_by && status !== 'in_progress') notify([q.created_by], 'طلب البيانات إلى ' + uName(q.to_unit_id) + ': ' + DR_ST[status][0]); refresh(); };
    if (status === 'in_progress') return busy(null, async () => { await D.rpc('data_request_update', { p_id: id, p_status: status, p_reply: null }); await done(); });
    modal(DR_ST[status][0] + ': طلب البيانات', `<label class="f">الرد${status === 'rejected' ? ' (سبب الرفض)' : ''}<textarea id="drR" rows="2">${esc(q.reply || '')}</textarea></label><div class="err"></div>`, `<button class="btn pri" id="drSOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#drSOk').onclick = (ev) => busy(ev.target, async () => { if (status === 'rejected' && !val('drR')) throw new Error('اكتب سبب الرفض.'); await D.rpc('data_request_update', { p_id: id, p_status: status, p_reply: val('drR') }); C.close(); await done(); }); };
  /* القاموس: البحث بأي رمز؛ يعدّله المدير ووحدة الجودة */
  async function anDictTab() {
    const [els, kp] = await Promise.all([D.select('data_elements', { order: ['sort'] }), D.select('kpis', { order: ['sort'] })]);
    S._de = els; S._kp = kp;
    const ed = anAdmin(), q = ANQ.q.trim().toLowerCase(), hit = (arr) => !q || arr.some((x) => String(x || '').toLowerCase().includes(q));
    const K = kp.filter((k) => hit([k.official_code, k.name_ar, ...(k.alt_codes || [])])), E = els.filter((e) => hit([e.code, e.name_ar]));
    VIEW.after = () => { const i = $('#anQ'); if (i && ANQ._f) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); ANQ._f = false; } };
    return `<div class="row noprint" style="margin-bottom:12px;gap:8px;align-items:center"><input class="inp" id="anQ" style="width:260px" placeholder="ابحث بأي رمز أو بالاسم…" value="${attr(ANQ.q)}" oninput="C.anQ(this.value)" aria-label="بحث"><span class="grow"></span>${ed ? '<button class="btn sm pri" onclick="C.kpiEdit()">إضافة مؤشر</button><button class="btn sm" onclick="C.elEdit()">إضافة عنصر</button>' : ''}</div>
      <h3 style="margin:0 0 6px;font-size:15px">المؤشرات (${K.length})</h3>
      ${K.length ? `<div class="tw"><table><tr><th>الرمز الرسمي</th><th>الرموز البديلة</th><th>المؤشر</th><th>المستهدف</th><th>المالك</th><th>المرجعية</th>${ed ? '<th class="noprint"></th>' : ''}</tr>${K.map((k) => `<tr><td dir="ltr" style="text-align:end">${esc(k.official_code || '—')}</td><td dir="ltr" class="small" style="text-align:end">${esc((k.alt_codes || []).join(', '))}</td><td><b>${esc(k.name_ar)}</b>${k.needs_confirm ? ` ${chip('يحتاج تأكيدًا', 'wait')}` : ''}${k.confirm_note ? `<div class="tiny muted">${esc(k.confirm_note)}</div>` : ''}</td><td>${esc(k.target || '')}</td><td class="small">${esc(k.owner_unit_id ? uName(k.owner_unit_id) : '—')}</td><td class="small">${esc(k.reference_unit_id ? uName(k.reference_unit_id) : '—')}</td>${ed ? `<td class="noprint"><button class="btn sm" onclick="C.kpiEdit('${attr(k.id)}')">تعديل</button></td>` : ''}</tr>`).join('')}</table></div>` : '<div class="empty">لا مؤشرات.</div>'}
      <h3 style="margin:18px 0 6px;font-size:15px">عناصر البيانات (${E.length})</h3>
      ${E.length ? `<div class="tw"><table><tr><th>الرمز</th><th>العنصر</th><th>الوحدة</th><th>المستوى</th><th>الجهة المالكة</th><th>المصدر</th><th>الدورية</th>${ed ? '<th class="noprint"></th>' : ''}</tr>${E.map((e) => `<tr${e.active === false ? ' style="opacity:.6"' : ''}><td dir="ltr" style="text-align:end">${esc(e.code)}</td><td><b>${esc(e.name_ar)}</b>${e.definition ? `<div class="tiny muted">${esc(e.definition)}</div>` : ''}</td><td class="small">${esc(AN_UNIT[e.unit])}</td><td class="small">${esc(AN_LEVEL[e.level])}</td><td class="small">${esc(e.owner_unit_id ? uName(e.owner_unit_id) : 'جهة النطاق')}</td><td class="small">${esc(AN_SRC[e.source])}</td><td class="small">${e.period_kind === 'term' ? 'فصلي' : 'سنوي'}</td>${ed ? `<td class="noprint"><button class="btn sm" onclick="C.elEdit('${attr(e.code)}')">تعديل</button></td>` : ''}</tr>`).join('')}</table></div>` : '<div class="empty">لا عناصر.</div>'}`;
  }
  C.anQ = (v) => { ANQ.q = v; ANQ._f = true; refresh(); };
  const anUnits = () => S.units.filter((u) => u.status !== 'archived').sort(sortU);
  C.elEdit = (code) => { const e = code ? S._de.find((x) => x.code === code) : { code: '', name_ar: '', definition: '', unit: 'count', level: 'program', owner_unit_id: '', source: 'manual', source_app_id: '', period_kind: 'year', active: true, sort: 100 };
    modal(code ? 'تعديل عنصر' : 'إضافة عنصر', `<div class="formgrid"><label class="f">الرمز<input id="eC" dir="ltr" value="${attr(e.code)}" ${code ? 'disabled' : ''} maxlength="60"></label><label class="f">الاسم<input id="eN" value="${attr(e.name_ar)}" maxlength="200"></label>
      <label class="f full">التعريف<textarea id="eD" rows="2">${esc(e.definition)}</textarea></label>
      <label class="f">الوحدة<select id="eU">${Object.entries(AN_UNIT).map(([k, l]) => opt(k, l, e.unit)).join('')}</select></label><label class="f">المستوى<select id="eL">${Object.entries(AN_LEVEL).map(([k, l]) => opt(k, l, e.level)).join('')}</select></label>
      <label class="f">الجهة المالكة<select id="eO"><option value="">جهة النطاق (لجنة البرنامج أو القسم)</option>${anUnits().map((u) => opt(u.id, u.name, e.owner_unit_id)).join('')}</select></label>
      <label class="f">المصدر<select id="eS">${Object.entries(AN_SRC).map(([k, l]) => opt(k, l, e.source)).join('')}</select></label>
      <label class="f">البرنامج المصدر<select id="eA"><option value="">—</option>${(S.apps || []).map((a) => opt(a.id, a.name, e.source_app_id)).join('')}</select></label>
      <label class="f">الدورية<select id="eP">${opt('year', 'سنوي', e.period_kind)}${opt('term', 'فصلي', e.period_kind)}</select></label><label class="f">الترتيب<input id="eR" type="number" value="${attr(e.sort)}"></label>
      <label class="f">الحالة<select id="eV">${opt('1', 'نشط', e.active === false ? '0' : '1')}${opt('0', 'موقوف', e.active === false ? '0' : '1')}</select></label></div><div class="err"></div>`, `<button class="btn pri" id="eOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    $('#eOk').onclick = (ev) => busy(ev.target, async () => { const row = { name_ar: val('eN'), definition: val('eD'), unit: val('eU'), level: val('eL'), owner_unit_id: val('eO') || null, source: val('eS'), source_app_id: val('eA') || null, period_kind: val('eP'), sort: Number(val('eR')) || 100, active: val('eV') === '1' };
      if (!row.name_ar) throw new Error('الاسم مطلوب.');
      if (code) await D.update('data_elements', row, { eq: { code } }); else { const c = val('eC'); if (!c) throw new Error('الرمز مطلوب.'); if (S._de.some((x) => x.code === c)) throw new Error('الرمز مستعمل.'); await D.insert('data_elements', Object.assign(row, { code: c })); }
      C.close(); toast('حُفظ العنصر.'); refresh(); }); };
  const anList = (s) => String(s || '').split(/[,،\n]+/).map((x) => x.trim()).filter(Boolean);
  C.kpiEdit = (id) => { const k = id ? S._kp.find((x) => x.id === id) : { id: '', official_code: '', alt_codes: [], name_ar: '', definition: '', goal: '', unit: '', method_text: '', target: '', internal_benchmark: '', external_benchmark: '', criteria: [], direction: '', classification: '', timeframe: '', level: 'program', report_form: '4', origin: 'internal', owner_unit_id: '', reference_unit_id: '', needs_confirm: false, confirm_note: '' };
    const us = anUnits().map((u) => [u.id, u.name]);
    modal(id ? 'تعديل مؤشر' : 'إضافة مؤشر', `<div class="formgrid"><label class="f">الرمز الرسمي (KPI-JP-##)<input id="kO" dir="ltr" value="${attr(k.official_code || '')}" maxlength="40"></label><label class="f">الرموز البديلة (تفصلها فاصلة)<input id="kA" dir="ltr" value="${attr((k.alt_codes || []).join(', '))}"></label>
      <label class="f full">اسم المؤشر<input id="kN" value="${attr(k.name_ar)}" maxlength="300"></label><label class="f full">التعريف<textarea id="kD" rows="2">${esc(k.definition || '')}</textarea></label><label class="f full">الهدف<textarea id="kG" rows="2">${esc(k.goal || '')}</textarea></label>
      <label class="f full">طريقة القياس<textarea id="kM" rows="2">${esc(k.method_text || '')}</textarea></label>
      <label class="f">المستهدف<input id="kT" value="${attr(k.target || '')}"></label><label class="f">وحدة القياس<input id="kU" value="${attr(k.unit || '')}"></label>
      <label class="f">المقارنة الداخلية<input id="kI" value="${attr(k.internal_benchmark || '')}"></label><label class="f">المقارنة الخارجية<input id="kX" value="${attr(k.external_benchmark || '')}"></label>
      <label class="f">الجهة المالكة<select id="kW"><option value="">—</option>${us.map(([v, l]) => opt(v, l, k.owner_unit_id)).join('')}</select></label><label class="f">الجهة المرجعية<select id="kR"><option value="">—</option>${us.map(([v, l]) => opt(v, l, k.reference_unit_id)).join('')}</select></label>
      <label class="f">المستوى<select id="kL">${opt('program', 'برامجي', k.level)}${opt('institution', 'مؤسسي', k.level)}</select></label><label class="f">مصدر المؤشر<select id="kS">${opt('internal', 'داخلي', k.origin)}${opt('external', 'خارجي', k.origin)}</select></label>
      <label class="f">الاتجاه<select id="kV">${[['', '—'], ['positive', 'إيجابي'], ['negative', 'سلبي'], ['target', 'مستهدف']].map(([v, l]) => opt(v, l, k.direction)).join('')}</select></label><label class="f">التصنيف<select id="kC">${[['', '—'], ['core', 'أساسي'], ['extra', 'إضافي']].map(([v, l]) => opt(v, l, k.classification)).join('')}</select></label>
      <label class="f">الإطار الزمني<input id="kF" value="${attr(k.timeframe || '')}"></label><label class="f">نموذج التقرير<select id="kP">${opt('4', 'نموذج 4', k.report_form)}${opt('5', 'نموذج 5', k.report_form)}</select></label>
      <label class="f full">المحكات والمعايير (تفصلها فاصلة)<input id="kK" value="${attr((k.criteria || []).join(', '))}"></label>
      <label class="f full row" style="gap:6px;align-items:center"><input type="checkbox" id="kY" ${k.needs_confirm ? 'checked' : ''} style="width:auto"> يحتاج تأكيدًا</label><label class="f full">ملاحظة التأكيد<input id="kZ" value="${attr(k.confirm_note || '')}"></label></div><div class="err"></div>`, `<button class="btn pri" id="kOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    $('#kOk').onclick = (ev) => busy(ev.target, async () => { const row = { official_code: val('kO') || null, alt_codes: anList(val('kA')), name_ar: val('kN'), definition: val('kD'), goal: val('kG'), method_text: val('kM'), target: val('kT'), unit: val('kU'), internal_benchmark: val('kI'), external_benchmark: val('kX'), owner_unit_id: val('kW') || null, reference_unit_id: val('kR') || null, level: val('kL'), origin: val('kS'), direction: val('kV'), classification: val('kC'), timeframe: val('kF'), report_form: val('kP'), criteria: anList(val('kK')), needs_confirm: val('kY'), confirm_note: val('kZ') };
      if (!row.name_ar) throw new Error('اسم المؤشر مطلوب.');
      if (row.official_code && S._kp.some((x) => x.id !== id && x.official_code === row.official_code)) throw new Error('الرمز الرسمي مستعمل لمؤشر آخر.');
      if (id) await D.update('kpis', row, { eq: { id } }); else await D.insert('kpis', Object.assign(row, { id: 'k-' + Date.now().toString(36) }));
      C.close(); toast('حُفظ المؤشر.'); refresh(); }); };
  /* بنود التقرير السنوي في «مهامي» و«تنبيهاتي»: الطلبات الواردة، والقيم المعادة، وما ينتظر الاعتماد */
  async function anUrgent() {
    const [dr, els, vals] = await Promise.all([D.select('data_requests').catch(() => []), anElsQ().catch(() => []), D.select('data_values').catch(() => [])]);
    const nm = (c) => (els.find((e) => e.code === c) || {}).name_ar || c, open = dr.filter((q) => ['new', 'in_progress'].includes(q.status) && anMem(q.to_unit_id)), out = [];
    open.forEach((q) => { const n = daysTo(q.due_date); out.push({ k: 'comm', t: 'طلب بيانات للتقرير السنوي (' + (q.elements || []).length + ' عنصر)', sub: (anProg(q.program_id) || {}).name || uName(q.to_unit_id), n, late: n != null && n < 0, btn: 'فتح', act: `C.anOpen('req','${esc(q.year)}')` }); });
    const owned = (v) => { const e = els.find((x) => x.code === v.element_code); return e ? anOwner(e, v.program_id, v.department_id) : null; };
    vals.filter((v) => v.status === 'returned' && anMem(owned(v))).forEach((v) => out.push({ k: 'comm', t: 'قيمة أُعيدت بملاحظات: ' + nm(v.element_code), sub: v.note || '', n: null, late: true, btn: 'فتح', act: `C.anOpen('data','${esc(v.year)}')` }));
    const wait = vals.filter((v) => v.status === 'draft' && anHead(owned(v)));
    if (wait.length) out.push({ k: 'comm', uid: owned(wait[0]), cnt: wait.length, t: wait.length + ' قيمة بانتظار اعتمادك في التقرير السنوي', sub: uName(owned(wait[0])), n: null, late: false, btn: 'فتح', act: `C.anOpen('data','${esc(wait[0].year)}')` });
    return { items: out, open, nm };
  }
  C.anOpen = (tab, year) => { ANQ.tab = tab; ANQ.year = year; ANQ.mode = 'unit'; ANQ.unit = ''; C.go('annual'); };
  const anMine = () => { const a = S._anOpen; if (!a || !a.open.length) return ''; return `<h3 style="margin:22px 0 8px">طلبات بيانات التقرير السنوي</h3><div class="clist">${a.open.map((q) => { const n = daysTo(q.due_date); return `<div class="aline" style="--c:#B7862A"><div><b>${esc((q.elements || []).map(a.nm).join('، '))}</b><div class="small muted">${esc((anProg(q.program_id) || {}).name || '')} · ${esc(q.year)}هـ</div></div><span class="when ${n != null && n < 0 ? 'late' : ''}">${esc(whenTxt(n))}</span><span class="act"><button class="btn sm pri" onclick="C.anOpen('req','${esc(q.year)}')">فتح</button></span></div>`; }).join('')}</div>`; };

  /* ===== الجودة والمؤشرات، المرحلتان 2 و3 (الملفات 29-31): حساب المؤشرات من القيم المعتمدة، وتصدير النموذجين 1 و4، وتقرير البرنامج TP-152 ===== */
  const anFmt = (n) => n == null || !isFinite(n) ? '' : String(Math.round(n * 100) / 100);
  const anSaveDocx = async (file, data, name) => { needLibs(); const res = await fetch('templates/' + file); if (!res.ok) throw new Error('تعذر تحميل قالب النموذج.'); const zip = new PizZip(await res.arrayBuffer());
    const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    try { doc.render(data); } catch (e) { const er = (e.properties && e.properties.errors || []).map((x) => x.properties && x.properties.explanation).filter(Boolean); throw new Error('خطأ في قالب النموذج: ' + (er.slice(0, 3).join('، ') || e.message)); }
    saveBlob(doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name.replace(/[\\/:*?"<>|]/g, '') + '.docx'); };
  /* بيانات صفحة المؤشرات لبرنامج: القيم المعتمدة لكل الأعوام، والنتائج المحفوظة */
  async function anKpiData(pg) {
    const g = anProg(pg), [links, kpis, els, vals, res, st] = await Promise.all([D.select('program_kpis', { eq: { program_id: pg }, order: ['sort'] }), D.select('kpis'), anElsQ(), D.select('data_values'), D.select('kpi_results', { eq: { program_id: pg } }), D.rpc('data_status', { p_year: ANQ.year })]);
    const dp = g && g.department_id, E = (c) => els.find((e) => e.code === c);
    const scoped = (e, v) => e.level === 'program' ? v.program_id === pg : e.level === 'department' ? v.department_id === dp : !v.program_id && !v.department_id;
    const val = (c, y) => { const e = E(c); if (!e) return null; const v = vals.find((x) => x.element_code === c && x.year === String(y) && x.status === 'approved' && !x.term && scoped(e, x)); return v || null; };
    const stat = (c) => { const e = E(c); if (!e) return 'none'; const s = (st || []).find((x) => x.element === c && !x.term && (e.level === 'program' ? x.program === pg : e.level === 'department' ? x.department === dp : !x.program && !x.department)); return s ? s.status : 'none'; };
    const outs = (k) => ((k.formula || {}).outputs || []);
    const used = (k) => [...new Set(outs(k).flatMap((o) => [o.el, o.num, o.den]).filter(Boolean))];
    const calc = (o, y) => { const n = val(o.el || o.num, y), d = o.den ? val(o.den, y) : null; if (!n || n.value_num == null) return null; if (o.type === 'value') return { num: +n.value_num, text: anFmt(+n.value_num) };
      if (!d || !(+d.value_num)) return null; const r = +n.value_num / +d.value_num; return o.type === 'pct' ? { num: r * 100, text: anFmt(r * 100) + '%' } : o.type === 'per' ? { num: r, text: '1:' + anFmt(r) } : { num: r, text: anFmt(r) }; };
    const rows = links.filter((l) => l.active !== false).map((l) => { const k = kpis.find((x) => x.id === l.kpi_id); if (!k) return null;
      const u = used(k), ss = u.map((c) => ({ c, e: E(c), s: stat(c) })), r = res.find((x) => x.kpi_id === k.id && x.year === ANQ.year) || null, cs = outs(k).map((o) => calc(o, ANQ.year));
      const all = ss.length && ss.every((x) => x.s === 'approved') && cs.every(Boolean), none = ss.every((x) => x.s === 'none');
      const miss = ss.filter((x) => x.s !== 'approved' && x.e), who = [...new Set(miss.map((x) => anOwner(x.e, pg, dp)).filter(Boolean))];
      return { k, l, r, ss, cs, state: all ? 'done' : none ? 'need' : 'part', miss, who, target: (r && r.target) || l.target || k.target || '', internal: (r && r.internal_benchmark) || l.internal_benchmark || k.internal_benchmark || '', external: (r && r.external_benchmark) || l.external_benchmark || k.external_benchmark || '' }; }).filter(Boolean);
    S._ak = { pg, g, dp, rows, els, E, val, calc, outs, res, used };
    return S._ak;
  }
  const KPI_ST = { done: ['محسوب', 'ok'], need: ['يحتاج إدخالًا', 'wait'], part: ['ناقص', 'bad'] };
  const anKCode = (k) => k.official_code || (k.alt_codes || [])[0] || k.id;
  const anKVal = (x) => { const o = S._ak.outs(x.k); return o.map((q, i) => (q.label ? q.label + ': ' : '') + (x.cs[i] ? x.cs[i].text : '—')).join('، '); };
  async function anKpiTab(vis) {
    const A = await anKpiData(ANQ.prog); await anLoad(); const can = anAdmin() || anWork(ANQ.prog), srcs = (x) => [...new Set(x.ss.map((s) => s.e && s.e.source).filter(Boolean))].map((c) => AN_SRC[c] === 'يدوي' ? 'يدوي' : c === 'site' ? 'آلي من الموقع' : 'من برنامج').join(' + ');
    const cnt = (s) => A.rows.filter((x) => x.state === s).length;
    const list = A.rows.length ? `<div class="stats" style="margin-bottom:12px"><div><b>${A.rows.length}</b><span>مؤشرًا للبرنامج</span></div><div><b>${cnt('done')}</b><span>محسوب</span></div><div><b class="${cnt('part') ? 'bad' : ''}">${cnt('part')}</b><span>ناقص</span></div><div><b>${cnt('need')}</b><span>يحتاج إدخالًا</span></div></div>
      <div class="tw"><table><tr><th>المؤشر</th><th>المصدر</th><th>الفعلي</th><th>المستهدف</th><th>المقارنات</th><th>الحالة</th><th class="noprint"></th></tr>
      ${A.rows.map((x, i) => `<tr><td><b>${esc(x.k.name_ar)}</b>${x.k.needs_confirm ? ' ' + chip('يحتاج تأكيدًا', 'wait') : ''}<div class="tiny muted" dir="ltr" style="text-align:end">${esc((x.k.official_code ? [x.k.official_code] : []).concat(x.k.alt_codes || []).join(' · '))}</div>${x.r && x.r.analysis ? `<div class="tiny">التحليل: ${esc(x.r.analysis)}</div>` : ''}</td>
        <td class="small">${esc(srcs(x))}</td><td><b class="num">${esc(anKVal(x))}</b></td><td class="small">${esc(x.target)}</td><td class="small">${x.internal ? 'داخلية: ' + esc(x.internal) + '<br>' : ''}${x.external ? 'خارجية: ' + esc(x.external) : ''}${!x.internal && !x.external ? '—' : ''}</td>
        <td>${chip(...KPI_ST[x.state])}${x.who.length ? `<div class="tiny muted">${x.who.map((u) => esc(uName(u))).join('، ')}</div>` : ''}</td>
        <td class="noprint">${can ? `<button class="btn sm pri" onclick="C.kpiAn(${i})">تحليل</button> ` : ''}${can && x.state !== 'done' && x.who.length ? `<button class="btn sm" onclick="C.drNew('${attr(x.who[0])}')">طلب</button> ` : ''}<button class="btn sm" onclick="C.kpiCard(${i})">بطاقة (1)</button> <button class="btn sm" onclick="C.kpiForm4(${i})">تقرير (4)</button></td></tr>`).join('')}</table></div>`
      : '<div class="empty">لم تُربط مؤشرات بهذا البرنامج بعد. تُربط من القاموس أدناه، وتصل مؤشرات المحاسبة بتنفيذ الملف 30.</div>';
    return list + `<details style="margin-top:18px"><summary><b>القاموس: المؤشرات وعناصر البيانات</b></summary><div style="margin-top:12px">${await anDictTab()}</div></details>`;
  }
  C.kpiAn = (i) => { const x = S._ak.rows[i], r = x.r || {}, locked = r.status === 'approved';
    modal('تحليل المؤشر — ' + x.k.name_ar, `<p class="small muted">الفعلي لعام ${esc(ANQ.year)}هـ: <b>${esc(anKVal(x))}</b> · ${esc((anProg(S._ak.pg) || {}).name || '')}</p>${x.miss.length ? `<div class="panel small" style="margin-bottom:8px">لم يكتمل: ${x.miss.map((m) => esc(m.e.name_ar) + ' (' + esc(AN_ST[m.s][0]) + '؛ ' + esc(uName(anOwner(m.e, S._ak.pg, S._ak.dp))) + ')').join('، ')}</div>` : ''}${locked ? '<div class="panel small" style="margin-bottom:8px">اعتُمد تقرير البرنامج لهذا العام، فلا يُعدَّل.</div>' : ''}
      <div class="formgrid"><label class="f">المستهدف<input id="kaT" value="${attr(x.target)}"></label><label class="f">المستهدف الجديد<input id="kaN" value="${attr(r.new_target || '')}"></label><label class="f">المقارنة الداخلية<input id="kaI" value="${attr(x.internal)}"></label><label class="f">المقارنة الخارجية<input id="kaX" value="${attr(x.external)}"></label>
      <label class="f full">التحليل<textarea id="kaA" rows="4">${esc(r.analysis || '')}</textarea></label></div><div class="err"></div>`, `${locked ? '' : '<button class="btn pri" id="kaOk">حفظ</button>'}<button class="btn" onclick="C.close()">إغلاق</button>`, true);
    if (locked) return;
    $('#kaOk').onclick = (ev) => busy(ev.target, async () => { const first = x.cs.find(Boolean);
      await D.rpc('kpi_result_save', { p_kpi: x.k.id, p_program: S._ak.pg, p_year: ANQ.year, p_num: first ? first.num : null, p_text: anKVal(x), p_source: x.state === 'done' ? 'computed' : 'manual', p_target: val('kaT'), p_internal: val('kaI'), p_external: val('kaX'), p_analysis: val('kaA'), p_new_target: val('kaN'), p_version: r.version || 0 });
      C.close(); toast('حُفظ التحليل.'); refresh(); }); };
  const anData = (x) => { const u = S._ak.used(x.k), L = u.map((c, i) => `(${i + 1}) ${(S._ak.E(c) || {}).name_ar || c}`).join('\n');
    const idx = (c) => u.indexOf(c) + 1, one = (o) => o.type === 'value' ? `(${idx(o.el)})` : o.type === 'pct' ? `(${idx(o.num)}) ÷ (${idx(o.den)}) × 100` : `(${idx(o.num)}) ÷ (${idx(o.den)})`;
    return { data_text: L, formula_text: S._ak.outs(x.k).map((o) => (o.label ? o.label + ' = ' : '') + one(o)).join('\n') }; };
  const anCk = (val0, list, base) => Object.fromEntries(list.map((v, i) => ['ck' + (base + i), [].concat(val0).includes(v) ? '☑' : '☐']));
  const anDeg = (g) => { const d = String((g || {}).degree || ''); return /دبلوم/.test(d) ? 'دبلوم' : /ماجستير/.test(d) ? 'ماجستير' : /دكتور/.test(d) ? 'دكتوراه' : 'بكالوريوس'; };
  C.kpiCard = (i) => busy(null, async () => { const x = S._ak.rows[i], k = x.k, D0 = anData(x);
    const tf = /عام/.test(k.timeframe || '') ? 'سنوي' : '', unitBox = { 'نسبة مئوية': 'نسبة مئوية', 'معدل': 'معدل', 'متوسط': 'متوسط', 'عدد': 'عدد', 'نسبة/معامل': 'نسبة/معامل' }[k.unit] || '';
    await anSaveDocx('form1.docx', Object.assign({ name: k.name_ar, code: anKCode(k), edition: 'الإصدار 1.0 - ' + ANQ.year + 'هـ', definition: k.definition || k.method_text || '', goal: k.goal || '', terms: k.terms || '', owner: k.owner_unit_id ? uName(k.owner_unit_id) : 'جهة النطاق (لجنة البرنامج أو القسم)', reference: k.reference_unit_id ? uName(k.reference_unit_id) : '', example: k.example || '' }, D0,
      anCk(k.scope_category || [], ['طلاب', 'هيئة التدريس', 'الموظفين', 'أخرى'], 1), anCk(k.scope_degree && k.scope_degree.length ? k.scope_degree : [anDeg(S._ak.g)], ['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'], 5), anCk(k.level === 'program' ? 'البرامج' : k.scope_level || [], ['المؤسسة', 'الكليات', 'الفروع', 'الأقسام', 'التخصصات', 'البرامج'], 9), anCk(k.scope_gender || [], ['ذكر', 'أنثى'], 15),
      anCk(unitBox, ['عدد', 'نسبة مئوية', 'معدل', 'متوسط', 'نسبة/معامل', 'زمن', 'قيمة مالية', 'أخرى'], 17), anCk(k.report_form || '4', ['4', '5'], 25), anCk(k.evidence_kinds || [], ['سياسات', 'إحصائية', 'سنوية', 'محاضر', 'تقارير', 'تطبيق', 'متابعة', 'استطلاع', 'خطط', 'مؤسسية'], 27),
      anCk(k.origin, ['internal', 'external'], 37), anCk(k.direction, ['positive', 'negative', 'target'], 39), anCk(k.classification, ['core', 'extra'], 42), anCk(tf, ['سنوي', 'نصف سنوي', 'ربع سنوي'], 44)), 'بطاقة مؤشر - ' + anKCode(k)); toast('نُزّلت البطاقة.'); });
  C.kpiForm4 = (i) => busy(null, async () => { const A = S._ak, x = A.rows[i], k = x.k, y = +ANQ.year, r = x.r || {}, O = A.outs(k), res = (yr) => A.res.find((q) => q.kpi_id === k.id && q.year === String(yr));
    const rows = O.map((o, j) => { const c = x.cs[j], p = (yr) => { const v = A.calc(o, yr); return v ? v.text : (res(yr) || {}).actual_text || ''; }; return { label: o.label || (O.length > 1 ? '(' + 'أب'[j] + ')' : k.unit || ''), cur: c ? c.text : '', p1: p(y - 1), p2: p(y - 2), target: x.target, internal: x.internal, ex1: x.external, ex2: '', new_target: r.new_target || '' }; });
    await anSaveDocx('form4.docx', Object.assign({ name: k.name_ar, program: (A.g || {}).name || '', college: S.settings.collegeName || 'كلية الأعمال', unit: k.unit || '', year: ANQ.year + 'هـ', code: k.official_code || (k.alt_codes || []).join(' / '), department: uName(A.dp), external_src: '', y1: y - 1, y2: y - 2, rows, analysis: r.analysis || '', benchmark_analysis: '', improve: '', reference: k.reference_unit_id ? uName(k.reference_unit_id) : '', approver: '' }, anData(x),
      anCk(anDeg(A.g), ['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'], 1), anCk(k.direction, ['positive', 'negative', 'target'], 5), anCk([], ['', '', '', ''], 8), anCk([], ['', '', ''], 12)), 'تقرير مؤشر - ' + anKCode(k) + ' - ' + (A.g || {}).name); toast('نُزّل التقرير.'); });
  /* ---------- تقرير البرنامج السنوي TP-152 ---------- */
  const AR_ST = { draft: ['مسودة', ''], in_review: ['قيد المراجعة', 'wait'], returned: ['أُعيد بملاحظات', 'bad'], approved: ['معتمد', 'ok'] };
  const AR_SEC = [
    { k: 'prev', t: 'أ. خطط التحسين من العام الماضي', rows: 'prev', cols: [['priority', 'أولويات التحسين'], ['done', 'ما تم تنفيذه (٪)'], ['notes', 'ملاحظات']] },
    { k: 'st', t: 'ب. إحصاءات البرنامج', f: [['st_total', 'إجمالي عدد الطلاب في البرنامج'], ['st_started', 'من بدأوا البرنامج في سنة التقرير'], ['st_completed', 'من أتموا البرنامج'], ['st_exits', 'من أتموا نقاط الخروج (إن وجدت)', 0, 1], ['st_faculty', 'عدد أعضاء هيئة التدريس'], ['st_ratio', 'نسبة الطلاب إلى الأعضاء']] },
    { k: 'plo', t: 'ج1. تقويم نواتج التعلم', plos: 1, f: [['strengths', 'جوانب القوة', 1], ['improvements', 'جوانب التحسين مع الأولويات', 1]] },
    { k: 'courses', t: 'ج2. تقييم الطلبة للمقررات', rows: 'courses', cols: [['code', 'رمز المقرر'], ['name', 'اسم المقرر'], ['n', 'عدد المقيّمين'], ['rate', 'نسبة المشاركين'], ['result', 'النتيجة'], ['recs', 'التوصيات']] },
    { k: 'pe', t: 'ج3. تقويم الطلبة لجودة البرنامج', f: [['pe_date', 'تاريخ التقويم'], ['pe_n', 'عدد المشاركين'], ['pe_str', 'ملاحظات: جوانب القوة', 1], ['pe_str_resp', 'تعليق البرنامج عليها', 1], ['pe_imp', 'ملاحظات: جوانب التحسين', 1], ['pe_imp_resp', 'تعليق البرنامج عليها', 1], ['pe_sug', 'مقترحات التطوير', 1], ['pe_sug_resp', 'تعليق البرنامج عليها', 1]] },
    { k: 'rs', t: 'ج4. البحث العلمي والابتكار', f: [['rs_pub', 'الأبحاث المنشورة'], ['rs_proj', 'المشاريع البحثية'], ['rs_conf', 'المؤتمرات التي أقامها البرنامج'], ['rs_sem', 'الندوات التي أقامها البرنامج'], ['rs_confatt', 'حضور المؤتمرات'], ['rs_sematt', 'حضور الندوات'], ['research_comment', 'مناقشة الأنشطة', 1]] },
    { k: 'community', t: 'ج5. الشراكة المجتمعية', rows: 'community', cols: [['activity', 'النشاط'], ['desc', 'وصف مختصر']], f: [['community_comment', 'التعليق', 1]] },
    { k: 'oe', t: 'ج6. تقويمات أخرى (إن وجدت)', opt: 1, f: [['oe_method', 'أسلوب التقويم', 0, 1], ['oe_date', 'التاريخ', 0, 1], ['oe_n', 'عدد المشاركين', 0, 1], ['oe_str', 'جوانب القوة', 1, 1], ['oe_str_resp', 'تعليق البرنامج', 1, 1], ['oe_imp', 'جوانب التحسين', 1, 1], ['oe_imp_resp', 'تعليق البرنامج', 1, 1], ['oe_sug', 'مقترحات التطوير', 1, 1], ['oe_sug_resp', 'تعليق البرنامج', 1, 1]] },
    { k: 'kpis', t: 'د. مؤشرات الأداء الرئيسة', kpis: 1, f: [['kpi_comment', 'التعليق العام', 1]] },
    { k: 'ch', t: 'هـ. التحديات والصعوبات (إن وجدت)', opt: 1, f: [['ch_teaching', 'التعليم', 1, 1], ['ch_assessment', 'التقويم', 1, 1], ['ch_guidance', 'التوجيه والإرشاد', 1, 1], ['ch_resources', 'مصادر التعلم', 1, 1], ['ch_faculty', 'أعضاء هيئة التدريس', 1, 1], ['ch_research', 'النشاط البحثي', 1, 1], ['ch_other', 'أخرى', 1, 1]] },
    { k: 'plan', t: 'و. خطة تطوير البرنامج', rows: 'plan', cols: [['priority', 'أولويات التحسين'], ['actions', 'الإجراءات'], ['owner', 'مسؤولية التنفيذ']] },
    { k: 'ap', t: 'ز. اعتماد التقرير', f: [['ap_body', 'جهة الاعتماد'], ['ap_session', 'رقم الجلسة'], ['ap_date', 'تاريخ الجلسة']] }];
  const arFilled = (r, cols) => cols.some(([c]) => String(r[c] == null ? '' : r[c]).trim());
  /* نسبة الاكتمال: الحقول الاختيارية لا تُحسب، وما يُملأ آليًا يعدّ مكتملًا متى وصلت قيمته */
  const arPct = (s) => { const X = S._ar, v = X.sec; let tot = 0, ok = 0; (s.f || []).forEach((f) => { if (f[3]) return; tot++; if (String(v[f[0]] == null ? '' : v[f[0]]).trim()) ok++; });
    if (s.rows) { tot++; if ((v[s.rows] || []).some((r) => arFilled(r, s.cols))) ok++; } if (s.plos) { tot++; if (X.plos.some((p) => p.result && p.result !== 'لم يُقس')) ok++; } if (s.kpis) { tot += X.A.rows.length; ok += X.A.rows.filter((x) => x.state === 'done').length; }
    if (s.opt) return null; return tot ? Math.round(ok / tot * 100) : 100; };
  async function anAprTab() {
    const pg = ANQ.prog, g = anProg(pg), [rep] = await D.select('annual_reports', { eq: { program_id: pg, year: ANQ.year } }), lib = await D.rpc('spec_library', { p_program: pg }).catch(() => null), A = await anKpiData(pg), prevRep = (await D.select('annual_reports', { eq: { program_id: pg, year: String(+ANQ.year - 1) } }).catch(() => []))[0];
    const num = (c) => { const v = A.val(c, ANQ.year); return v && v.value_num != null ? String(+v.value_num) : ''; };
    const sec = Object.assign({}, (rep && rep.sections) || {}), def = (k, v) => { if ((sec[k] == null || sec[k] === '') && v !== '' && v != null) sec[k] = v; };
    const st = num('E-STUDENTS'), fac = num('E-FAC-FT') || num('E-FAC-ALL'), ploV = A.val('E-PLO-RES', ANQ.year), crsV = A.val('E-PG2-AVG', ANQ.year), det = (v, k) => ((v && v.details) || {})[k] || [];
    def('st_total', st); def('st_faculty', fac); if (st && +fac) def('st_ratio', '1:' + anFmt(+st / +fac)); def('rs_pub', num('E-PAPERS')); def('st_completed', num('E-GRADS'));
    if (!(sec.courses || []).length && det(crsV, 'courses').length) sec.courses = det(crsV, 'courses').map((c) => ({ code: c.code, name: c.name, n: c.n, rate: c.rate, result: c.result, recs: c.recs || '' }));
    if (!(sec.prev || []).length && prevRep && prevRep.sections && (prevRep.sections.plan || []).length) sec.prev = prevRep.sections.plan.map((p) => ({ priority: p.priority, done: '', notes: '' }));
    const info = ((lib || {}).spec || {}).info || {}, libP = (lib || {}).plos || [], plos = det(ploV, 'plos').length ? det(ploV, 'plos') : libP.map((p) => ({ code: p.code, domain: p.domain, text: p.text, methods: '', target: '', result: 'لم يُقس' }));
    S._ar = { pg, g, rep: rep || null, sec, A, plos, info, can: (anWork(pg) || anAdmin()) && (!rep || ['draft', 'returned'].includes(rep.status)) };
    return `<div id="arWrap">${anAprBody()}</div>`;
  }
  function anAprBody() { const X = S._ar, rep = X.rep, stt = rep ? rep.status : 'draft', sec = X.sec, ro = !X.can ? 'disabled' : '';
    const pcts = AR_SEC.map(arPct).filter((p) => p != null), all = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    const fld = (f) => f[2] ? `<label class="f full">${esc(f[1])}<textarea id="ar_${f[0]}" rows="2" ${ro}>${esc(sec[f[0]] || '')}</textarea></label>` : `<label class="f">${esc(f[1])}<input id="ar_${f[0]}" value="${attr(sec[f[0]] == null ? '' : sec[f[0]])}" ${ro}></label>`;
    const rowsT = (s) => { const L = sec[s.rows] || []; return `<div class="tw"><table><tr>${s.cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}</tr>${L.map((r, i) => `<tr>${s.cols.map((c) => `<td><input class="arC" data-r="${s.rows}" data-i="${i}" data-c="${c[0]}" value="${attr(r[c[0]] == null ? '' : r[c[0]])}" ${ro} style="width:100%"></td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.cols.length}" class="muted small">لا صفوف بعد.</td></tr>`}</table></div>${X.can ? `<button class="btn sm" style="margin-top:6px" onclick="C.arAdd('${s.rows}')">إضافة صف</button>` : ''}`; };
    const ploT = () => X.plos.length ? `<div class="tw"><table><tr><th>الناتج</th><th>طرق التقويم</th><th>المستهدف</th><th>النتيجة</th></tr>${X.plos.map((p) => `<tr><td><b>${esc(p.code)}</b> ${esc(p.text)}</td><td class="small">${esc(p.methods || '')}</td><td>${esc(p.target || '')}</td><td>${esc(p.result || '')}</td></tr>`).join('')}</table></div>` : '<p class="small muted">تصل النتائج بالنشر من قياس المخرجات.</p>';
    const kpiT = () => X.A.rows.length ? `<div class="tw"><table><tr><th>المؤشر</th><th>المستهدف</th><th>الفعلي</th><th>المرجعي الداخلي</th><th>التحليل</th><th>المستهدف الجديد</th></tr>${X.A.rows.map((x) => `<tr><td>${esc(x.k.name_ar)}</td><td>${esc(x.target)}</td><td>${esc(anKVal(x))}</td><td>${esc(x.internal)}</td><td class="small">${esc((x.r || {}).analysis || '')}</td><td>${esc((x.r || {}).new_target || '')}</td></tr>`).join('')}</table></div><p class="small muted">تُعدَّل من صفحة «مؤشرات الأداء».</p>` : '<p class="small muted">لا مؤشرات مربوطة بالبرنامج.</p>';
    const acts = [X.can ? '<button class="btn pri" onclick="C.arSave()">حفظ</button>' : '', X.can ? '<button class="btn" onclick="C.arMove(\'in_review\')">إرسال للمراجعة</button>' : '', anAdmin() && stt === 'in_review' ? '<button class="btn pri" onclick="C.arMove(\'approved\')">اعتماد</button><button class="btn" onclick="C.arMove(\'returned\')">إعادة بملاحظات</button>' : '', isAdmin() && stt === 'approved' ? '<button class="btn" onclick="C.arMove(\'draft\')">إعادة فتح</button>' : '', '<button class="btn" onclick="C.arWord()">تصدير Word</button>'].join(' ');
    return `<div class="panel" style="margin-bottom:12px"><div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">${chip(...AR_ST[stt])}<b>الاكتمال ${all}٪</b><span class="grow"></span>${acts}</div>${rep && rep.note ? `<div class="small ${stt === 'returned' ? 'bad' : 'muted'}" style="margin-top:6px">ملاحظات: ${esc(rep.note)}</div>` : ''}<div class="err"></div></div>
      ${AR_SEC.map((s) => { const p = arPct(s); return `<details class="panel" style="margin-bottom:8px"${p !== null && p < 100 ? ' open' : ''}><summary style="cursor:pointer"><b>${esc(s.t)}</b> ${p === null ? chip('اختياري') : chip(p + '٪', p === 100 ? 'ok' : 'wait')}</summary><div style="margin-top:10px">${s.plos ? ploT() : ''}${s.kpis ? kpiT() : ''}${s.rows ? rowsT(s) : ''}${s.f ? `<div class="formgrid" style="margin-top:8px">${s.f.map(fld).join('')}</div>` : ''}</div></details>`; }).join('')}`; }
  const arCollect = () => { const X = S._ar; AR_SEC.forEach((s) => (s.f || []).forEach((f) => { const e = document.getElementById('ar_' + f[0]); if (e) X.sec[f[0]] = e.value.trim(); }));
    document.querySelectorAll('.arC').forEach((e) => { const L = X.sec[e.dataset.r] = X.sec[e.dataset.r] || []; (L[+e.dataset.i] = L[+e.dataset.i] || {})[e.dataset.c] = e.value.trim(); }); };
  C.arAdd = (k) => { arCollect(); (S._ar.sec[k] = S._ar.sec[k] || []).push({}); $('#arWrap').innerHTML = anAprBody(); };
  C.arSave = () => busy(null, async () => { arCollect(); const X = S._ar, r = await D.rpc('annual_report_save', { p_program: X.pg, p_year: ANQ.year, p_sections: X.sec, p_version: (X.rep || {}).version || 0 }); X.rep = r; toast('حُفظ التقرير.'); $('#arWrap').innerHTML = anAprBody(); });
  C.arMove = (to) => { const X = S._ar, T = { in_review: 'إرسال التقرير للمراجعة', approved: 'اعتماد التقرير', returned: 'إعادة التقرير بملاحظات', draft: 'إعادة فتح التقرير' }[to];
    modal(T, `${to === 'in_review' ? '<p class="small muted">يُحفظ التقرير أولًا. ولا يُعدَّل أثناء المراجعة.</p>' : ''}${to === 'approved' ? '<p class="small muted">تُعتمد معه نتائج مؤشرات البرنامج لهذا العام.</p>' : ''}<label class="f">${to === 'returned' ? 'الملاحظات (إلزامية)' : 'ملاحظة (اختيارية)'}<textarea id="arN" rows="3"></textarea></label><div class="err"></div>`, `<button class="btn pri" id="arOk">${T}</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    if (X.can) arCollect();
    $('#arOk').onclick = (ev) => busy(ev.target, async () => { let ver = (X.rep || {}).version || 0; if (X.can) { const r = await D.rpc('annual_report_save', { p_program: X.pg, p_year: ANQ.year, p_sections: X.sec, p_version: ver }); ver = r.version; }
      await D.rpc('annual_report_move', { p_program: X.pg, p_year: ANQ.year, p_to: to, p_note: val('arN'), p_version: ver }); C.close(); toast('تم.'); refresh(); }); };
  C.arWord = () => busy(null, async () => { const X = S._ar; if (X.can) arCollect(); const s = X.sec, g = X.g || {}, I = X.info, dom = (d) => X.plos.filter((p) => (p.domain || (/^ع/.test(p.code) ? 'k' : /^م/.test(p.code) ? 's' : 'v')) === d);
    const none = (L, row) => L.length ? L : [row];
    await anSaveDocx('tp152.docx', Object.assign({}, s, { program: g.name || '', program_code: I.code || '', level: I.level || g.degree || '', department: I.department || uName(g.department_id), college: I.college || S.settings.collegeName || 'كلية الأعمال', institution: I.institution || S.settings.university || 'جامعة الجوف', year: ANQ.year + 'هـ', campus: I.campus || '', branches: I.branches || 'لا يوجد',
      prev: none((s.prev || []).filter((r) => r.priority || r.done || r.notes), { priority: 'لا يوجد', done: '', notes: '' }), plo_k: dom('k'), plo_s: dom('s'), plo_v: dom('v'), courses: (s.courses || []).filter((r) => r.code || r.name), community: (s.community || []).filter((r) => r.activity || r.desc),
      kpis: X.A.rows.map((x, i) => ({ i: i + 1, name: anKCode(x.k) + ': ' + x.k.name_ar, target: x.target, actual: anKVal(x), internal: x.internal, analysis: (x.r || {}).analysis || '', new_target: (x.r || {}).new_target || '' })),
      plan: (s.plan || []).filter((r) => r.priority || r.actions).map((r, i) => ({ i: i + 1, priority: r.priority || '', actions: r.actions || '', owner: r.owner || '' })) }), 'تقرير البرنامج السنوي - ' + (g.name || '') + ' - ' + ANQ.year); toast('نُزّل التقرير.'); });
  C.anRefresh = (ev) => busy(ev && ev.target, async () => { const r = await D.rpc('data_refresh_site', { p_year: ANQ.year }); toast('حُدّثت ' + r.updated + ' قيمة من الموقع.'); refresh(); });

  /* ٤ «تنبيهاتي»: المتأخر أولًا ثم الأقرب موعدًا؛ سطر واحد وزر واحد لكل بند */
  /* ٤ «تنبيهاتي»: مجمعة حسب اليوم، بخط لون بحسب الأهمية وشارة المصدر */
  const AL_SRC = { bb: 'بلاك بورد', file: 'ملف المقرر', exam: 'الاختبارات', comm: 'الوحدات واللجان' };
  async function pgAlerts() {
    mineCss(); if (!myFac()) return '<div class="empty">حسابك غير مرتبط بسجل عضو هيئة تدريس. يربطه مدير النظام.</div>';
    const { urg } = await mineData(); navBadge(); bellCount();
    if (!urg.length) return '<div class="okmsg">لا توجد مطلوبات عاجلة ✓</div>';
    const grp = (x) => x.n == null ? (x.late ? 'يحتاج إجراءً الآن' : 'دون موعد') : x.n < 0 ? 'متأخر' : x.n === 0 ? 'اليوم' : x.n === 1 ? 'غدًا' : x.n <= 7 ? 'هذا الأسبوع' : 'لاحقًا';
    const order = ['يحتاج إجراءً الآن', 'متأخر', 'اليوم', 'غدًا', 'هذا الأسبوع', 'لاحقًا', 'دون موعد'];
    const col = (x) => x.late || (x.n != null && x.n < 0) ? 'var(--late)' : x.n != null && x.n <= 1 ? 'var(--run)' : 'var(--ok)';
    const SRC_C = { bb: '#D97706', file: '#0D9488', exam: '#2563EB', comm: '#7B4FA0' }, cn = (f) => urg.filter(f).length, lt = cn((x) => x.late), soon = cn((x) => !x.late && x.n != null && x.n <= 1), wk = cn((x) => !x.late && x.n != null && x.n > 1 && x.n <= 7);
    return `<div class="stat-row">${statCard(urg.length, 'كل التنبيهات', '', 'violet')}${statCard(lt, 'متأخرة أو عاجلة', '', lt ? 'red' : 'green', null, urg.length ? lt / urg.length * 100 : 0)}${statCard(soon, 'اليوم وغدًا', '', soon ? 'orange' : 'green', null, urg.length ? soon / urg.length * 100 : 0)}${statCard(wk, 'هذا الأسبوع', '', 'blue', null, urg.length ? wk / urg.length * 100 : 0)}</div>` + order.filter((g) => urg.some((x) => grp(x) === g)).map((g) => `<h3 class="al-day">${esc(g)} <small>${urg.filter((x) => grp(x) === g).length}</small></h3><div class="clist">${urg.filter((x) => grp(x) === g).map((x) => `<div class="aline" style="--c:${col(x)}"><div><b>${esc(x.t)}</b> <span class="src-b" style="--sc:${x.uid ? unitColor(x.uid) : SRC_C[x.k] || '#7C6E8F'}">${esc(AL_SRC[x.k] || 'أخرى')}</span><div class="small muted">${esc(x.sub)}</div></div>
        <span class="when ${x.w || (x.n != null && x.n < 0) ? 'late' : x.n != null && x.n <= 1 ? 'soon' : ''}">${esc(x.w || whenTxt(x.n))}</span><span class="act"><button class="btn sm pri" onclick="${x.act}">${esc(x.btn)}</button></span></div>`).join('')}</div>`).join('');
  }
  /* الرد على استفسار: نافذة صغيرة بالسؤال والرد، وتُسجَّل القراءة عند فتحها */
  C.inqOpen = (qid) => busy(null, async () => { const q = CX.inq.find((x) => x.id === qid); if (!q) return;
    try { await D.rpc('inquiry_read', { p_id: qid }); q.read_at = q.read_at || new Date().toISOString(); } catch (e) {}
    const c = ((S.sched || {}).courses || []).find((x) => x.id === q.course_id) || {};
    modal(q.title, `<p class="small muted">${esc(uName(q.unit_id))} · ${esc(c.code || '')} ${esc(c.name || '')} · ${esc(fmtDT(q.created_at))}</p>${q.body ? `<p>${esc(q.body)}</p>` : ''}
      ${(q.comments || []).map((m) => `<div class="small" style="margin-top:6px;padding-inline-start:8px;border-inline-start:3px solid var(--line)"><b>${esc(m.by)}</b> <span class="tiny muted">${esc(fmtDT(m.at))}</span><div>${esc(m.text)}</div></div>`).join('')}
      <label class="f" style="margin-top:12px">ردك<textarea id="iqText" rows="3"></textarea></label><div class="err"></div>`,
      `<button class="btn pri" id="iqOk">إرسال الرد</button><button class="btn" onclick="C.close()">إغلاق</button>`);
    $('#iqOk').onclick = (ev) => busy(ev.target, async () => { await D.rpc('inquiry_reply', { p_id: qid, p_text: val('iqText') });
      const u = headOf(q.unit_id), hf = u && fac(u.faculty_id); if (hf && hf.profile_app_id) notify([hf.profile_app_id], 'رد ' + S.me.name + ' على الاستفسار: ' + q.title);
      C.close(); toast('أُرسل الرد.'); refresh(); }); });
  /* لوحة المتابعة لرئيس القسم والوكيل والعميد (الملف 16)، أسفل «مهامي» لغير أعضاء هيئة التدريس فقط */
  async function followBoard(sc) {
    const t = (sc || {}).term; if (!t) return '';
    let fb; try { fb = await D.rpc('dept_followup', { p_term: t.id }); } catch (e) { fb = null; }
    if (!fb || !fb.length) return '';
    S._fb = Object.fromEntries(fb.map((x) => [x.dept, x]));
    const n = (x, k, v, lab) => statCard(v, lab, '', v ? 'orange' : 'green', `C.fbList('${x.dept}','${k}')`);
    return `<h3 style="margin:22px 0 8px">لوحة المتابعة</h3>${fb.map((x) => `<div style="margin-bottom:12px"><b>${esc(uName(x.dept))}</b> <span class="small muted">· ${x.courses} مقرر</span>
      <div class="stat-row" style="margin-top:6px">${n(x, 'no_file', x.no_file.length, 'ملفات مقررات لم تُسلَّم', colColor('file'))}${n(x, 'bb_unmet', x.bb_unmet.length, 'لم تستوفِ البلاك بورد', colColor('bb'))}${n(x, 'inq', x.inq.length, 'استفسارات بلا رد', colColor('bb'))}</div></div>`).join('')}`;
  }
  C.fbList = (dep, k) => { const x = (S._fb || {})[dep]; if (!x) return;
    const names = (ids) => (ids || []).map(fName).join('، ') || '—';
    const T = { no_file: 'ملفات مقررات لم تُسلَّم', bb_unmet: 'مقررات لم تستوفِ البلاك بورد', inq: 'استفسارات بلا رد' };
    const body = k === 'inq' ? x.inq.map((q) => `<tr><td>${esc(q.code || '')}</td><td>${esc(fName(q.faculty))}</td><td class="small">${esc(q.title)}</td></tr>`).join('')
      : x[k].map((c) => `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}</td><td class="small">${esc(names(c.fac))}</td><td class="small">${esc(c.coord ? fName(c.coord) : '—')}</td></tr>`).join('');
    modal(T[k] + ' — ' + uName(dep), `<div class="tw"><table>${k === 'inq' ? '<tr><th>المقرر</th><th>العضو</th><th>الاستفسار</th></tr>' : '<tr><th>المقرر</th><th>الأساتذة</th><th>المنسق</th></tr>'}${body || '<tr><td colspan="3" class="muted">لا شيء.</td></tr>'}</table></div>`, `<button class="btn" onclick="C.close()">إغلاق</button>`, true); };
  /* عدد التنبيهات بجانب «تنبيهاتي» في القائمة الجانبية */
  function navBadge() { [['mine', S.mineN, 'hot'], ['alerts', S.urgentN, 'hot'], ['approvals', apprN(), 'hot'], ['memberships', S.memN, 'okb']].forEach(([p, n, cl]) => { const b = $('#side .nav[data-p="' + p + '"]'); if (!b) return; let s = b.querySelector('.nav-badge'); if (!n) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('span'); s.className = 'nav-badge ' + cl; b.appendChild(s); } s.textContent = n; }); }
  C.facView = async (id) => {
    const f = fac(id);
    const ass = S.members.filter((m) => m.faculty_id === id).sort((a, b) => activeM(b) - activeM(a) || b.start_date.localeCompare(a.start_date));
    const t = curTerm(); const cs = t ? await D.rpc('faculty_courses', { p_faculty: id, p_term: t.id }).catch(() => []) : [];
    const p = f.profile_app_id && prof(f.profile_app_id);
    modal(f.name_ar, `<dl class="kv">
        <dt>الاسم بالإنجليزية</dt><dd dir="ltr" style="text-align:end">${esc(f.name_en || '—')}</dd><dt>الرقم الوظيفي</dt><dd>${esc(f.employee_no || '—')}</dd>
        <dt>البريد الجامعي</dt><dd dir="ltr" style="text-align:end">${esc(f.email || '—')}</dd>
        ${S.privates[id] !== undefined ? `<dt>الجوال</dt><dd dir="ltr" style="text-align:end">${esc(S.privates[id] || '—')}</dd>` : ''}
        <dt>الرتبة</dt><dd>${esc(f.rank || '—')}</dd><dt>التخصص</dt><dd>${esc(f.specialty || '—')}</dd><dt>القسم</dt><dd>${esc(uName(f.department_id))}</dd>
        <dt>الجنس</dt><dd>${esc(f.gender || '—')}</dd><dt>المقر</dt><dd>${esc(f.campus || '—')}</dd>
        <dt>بداية الخدمة</dt><dd>${f.service_start ? esc(fmtD(f.service_start)) + ' (' + esc(yrsTxt(svcYears(f.service_start))) + ')' : '—'}</dd>
        <dt>الحالة</dt><dd>${esc(f.status)}${f.deact_request ? ` <span class="small bad">· طلب إيقاف من ${esc(f.deact_request.by_name || '')}: ${esc(f.deact_request.reason || '')}</span>` : ''}</dd><dt>الحساب</dt><dd>${p ? esc(p.username) + (p.active ? '' : ' (معطل)') : 'لا يوجد حساب'}</dd>
        ${f.notes ? `<dt>ملاحظات</dt><dd>${esc(f.notes)}</dd>` : ''}</dl>
      <h3 style="margin:18px 0 6px">التكليفات</h3>
      ${ass.length ? `<div class="mlist">${ass.map((m) => `<div class="${activeM(m) ? '' : 'past'}"><span class="grow">${esc(uName(m.unit_id))} ${chip(POS[m.position])}</span><span class="small muted">${fmtD(m.start_date)} ← ${m.end_date ? fmtD(m.end_date) : 'مستمر'}</span></div>`).join('')}</div>` : '<p class="small muted">لا توجد تكليفات.</p>'}
      <h3 style="margin:18px 0 6px">مقرراته في ${esc(t ? t.name : 'الفصل الحالي')} (من الجدول المعتمد)</h3>
      ${cs.length ? `<div class="tw"><table><tr><th>المقرر</th><th>الشعبة</th><th>الأيام</th><th>الوقت</th><th>القاعة</th></tr>${cs.map((c) => `<tr><td>${esc(c.code)} ${esc(c.name)}</td><td>${esc(c.section)} ${esc(c.gender)}</td><td>${esc(c.days)}</td><td class="num">${esc(c.from)}–${esc(c.to)}</td><td>${esc(c.room)}</td></tr>`).join('')}</table></div>` : '<p class="small muted">لا توجد شعب مسندة.</p>'}`,
      `${canEditFac(f) ? `<button class="btn pri" onclick="C.facEdit('${id}')">تعديل البيانات</button>` : myFac() === id ? `<button class="btn pri" onclick="C.facEdit('${id}')">تعديل جوالي</button>` : ''}${isAdmin() ? `<button class="btn" onclick="C.close();C.perms('${id}')">الصلاحيات</button>` : ''}<button class="btn" onclick="C.close()">إغلاق</button>`, true);
  };
  C.facEdit = (id) => {
    const f = id ? fac(id) : { name_ar: '', name_en: '', employee_no: '', email: '', rank: '', specialty: '', department_id: '', status: 'نشط', notes: '', gender: '', campus: '', service_start: null, contract_type: '' };
    const full = !id || canEditFac(f);
    /* الجوال: المدير، ورئيس القسم لأعضاء قسمه، والعضو نفسه (الملف 17) */
    const mobOk = isAdmin() || (id && myFac() === id) || (full && f.department_id && cap(f.department_id, 'manage'));
    if (!full && !mobOk) return;
    const rk = ranks().includes(f.rank) || !f.rank ? ranks() : ranks().concat([f.rank]);
    const cps = CAMPUSES().includes(f.campus) || !f.campus ? CAMPUSES() : CAMPUSES().concat([f.campus]);
    const depOpts = deptUnits().filter((d) => isAdmin() || cap(d.id, 'manage'));
    const mob = mobOk ? `<label class="f">رقم الجوال (مقيد الاطلاع)<input id="fp" value="${attr(S.privates[id] || '')}" dir="ltr" inputmode="tel" maxlength="20"></label>` : '';
    modal(!id ? 'إضافة عضو هيئة تدريس' : full ? 'تعديل بيانات ' + f.name_ar : 'تعديل جوالي', !full ? `<div class="formgrid">${mob}</div><p class="small muted">بقية بياناتك يعدّلها رئيس القسم أو مدير النظام.</p><div class="err"></div>` : `<div class="formgrid">
      <label class="f">الاسم الكامل بالعربية<input id="fa" value="${attr(f.name_ar)}" maxlength="150"></label>
      <label class="f">الاسم بالإنجليزية (اختياري)<input id="fe" value="${attr(f.name_en)}" dir="ltr" maxlength="150"></label>
      <label class="f">الرقم الوظيفي<input id="fn" value="${attr(f.employee_no || '')}" dir="ltr" maxlength="30"></label>
      <label class="f">البريد الجامعي<input id="fm" type="email" value="${attr(f.email || '')}" dir="ltr" maxlength="120"></label>
      ${mob}
      <label class="f">القسم العلمي<select id="fd">${isAdmin() ? '<option value="">—</option>' : ''}${depOpts.map((d) => opt(d.id, d.name, f.department_id)).join('')}</select></label>
      <label class="f">الرتبة الأكاديمية<select id="fr"><option value="">—</option>${rk.map((r) => opt(r, r, f.rank)).join('')}</select></label>
      <label class="f">التخصص<input id="fs" value="${attr(f.specialty)}" maxlength="120"></label>
      <label class="f">الجنس<select id="fg"><option value="">—</option>${GENDERS.map((g) => opt(g, g, f.gender)).join('')}</select></label>
      <label class="f">المقر<select id="fc"><option value="">—</option>${cps.map((c) => opt(c, c, f.campus)).join('')}</select></label>
      <label class="f">نوع التعاقد<select id="fct"><option value="">—</option>${CONTRACTS.map((c) => opt(c, c, f.contract_type)).join('')}</select></label>
      <label class="f">تاريخ بداية الخدمة<span class="row" style="gap:8px;align-items:center"><input id="fv" type="date" value="${attr(f.service_start || '')}" oninput="document.getElementById('fvY').textContent=C.yrs(this.value)"><span id="fvY" class="small muted">${esc(yrsTxt(svcYears(f.service_start)))}</span></span></label>
      <label class="f">الحالة<select id="ft" ${isAdmin() ? '' : 'disabled'}>${statuses().map((s) => opt(s, s, f.status)).join('')}</select>${isAdmin() || !id ? '' : '<span class="tiny muted">الإيقاف بطلب لمدير النظام.</span>'}</label>
      <label class="f full">ملاحظات<textarea id="fo" maxlength="1000">${esc(f.notes || '')}</textarea></label>
      <div class="f full small muted" style="margin-top:6px"><b>بيانات مقيدة الاطلاع</b> (للوحة أعضاء هيئة التدريس)</div>
      <label class="f">الجنسية<input id="fxN" maxlength="60" placeholder="السعودية"></label>
      <label class="f">حالة العمل<select id="fxW">${['', 'على رأس العمل', 'مبتعث', 'إجازة', 'عقد', 'إعارة'].map((s) => opt(s, s || '—', '')).join('')}</select></label>
      <label class="f">التخصص الدقيق<input id="fxS" maxlength="120"></label>
      <label class="f">Scopus<input id="fxSc" dir="ltr" maxlength="120"></label><label class="f">ORCID<input id="fxOr" dir="ltr" maxlength="120"></label>
      <label class="f">Web of Science<input id="fxWo" dir="ltr" maxlength="120"></label><label class="f">Google Scholar<input id="fxGs" dir="ltr" maxlength="200"></label></div><div class="err"></div>`,
      `<button class="btn pri" id="fOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    const FX = [['fxN', 'nationality'], ['fxW', 'work_status'], ['fxS', 'specialty_fine'], ['fxSc', 'scopus'], ['fxOr', 'orcid'], ['fxWo', 'wos'], ['fxGs', 'scholar']]; let fx0 = null;
    if (full && id) D.select('faculty_extra', { eq: { faculty_id: id } }).then((r) => { fx0 = r[0] || {}; FX.forEach(([k, c]) => { const e = $('#' + k); if (e) e.value = fx0[c] || ''; }); }).catch(() => {});
    $('#fOk').onclick = (ev) => busy(ev.target, async () => {
      let fid = id;
      if (mobOk && $('#fp') && val('fp') && !/^[0-9+\s-]{7,20}$/.test(val('fp'))) throw new Error('رقم الجوال غير صحيح.');
      if (full) {
        const row = { name_ar: val('fa'), name_en: val('fe'), employee_no: val('fn') || null, email: val('fm').toLowerCase() || null, rank: val('fr'), specialty: val('fs'), department_id: val('fd') || null,
          gender: val('fg'), campus: val('fc'), contract_type: val('fct'), service_start: val('fv') || null, notes: val('fo') };
        if (!row.name_ar) throw new Error('الاسم بالعربية مطلوب.');
        if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) throw new Error('البريد الجامعي غير صحيح.');
        const twin = row.email && S.faculty.find((x) => x.id !== id && (x.email || '').toLowerCase() === row.email);
        if (twin) throw new Error('البريد مسجل لعضو آخر: ' + twin.name_ar + '.');
        const empTwin = row.employee_no && S.faculty.find((x) => x.id !== id && x.employee_no === row.employee_no);
        if (empTwin) throw new Error('الرقم الوظيفي مسجل لعضو آخر: ' + empTwin.name_ar + '.');
        if (row.service_start && row.service_start > today()) throw new Error('تاريخ بداية الخدمة في المستقبل.');
        const st = val('ft');
        if (!id) fid = (await D.insert('faculty', row))[0].id;
        else {
          if (isAdmin() && st !== f.status) { if (st === 'غير نشط') await setActive(f, false, 'من نافذة التعديل'); else { if (offF(f)) await setActive(f, true); if (st !== 'نشط') row.status = st; } }
          await D.update('faculty', row, { eq: { id } });
        }
      }
      if (mobOk && $('#fp') && val('fp') !== (S.privates[id] || '')) await D.upsert('faculty_private', { faculty_id: fid, mobile: val('fp') });
      if (full && $('#fxN') && (!id || fx0)) { const x = { faculty_id: fid }; FX.forEach(([k, c]) => { x[c] = val(k); }); if (FX.some(([, c]) => (x[c] || '') !== ((fx0 || {})[c] || ''))) await D.upsert('faculty_extra', x); }
      await reloadPeople(); C.close(); refresh(); toast('حُفظت بيانات العضو.');
    });
  };
  C.yrs = (d) => yrsTxt(svcYears(d));
  const reloadFaculty = async () => { S.faculty = await D.select('faculty'); const pv = await D.select('faculty_private').catch(() => []); S.privates = Object.fromEntries(pv.map((p) => [p.faculty_id, p.mobile])); };
  const FAC_HEAD = ['الاسم بالعربية', 'الاسم بالإنجليزية', 'الرقم الوظيفي', 'البريد الجامعي', 'الرتبة', 'التخصص', 'القسم', 'الحالة', 'الجوال', 'الجنس', 'المقر', 'تاريخ بداية الخدمة', 'نوع التعاقد'];
  /* تاريخ من Excel: رقم تسلسلي، أو 2010-05-14، أو 14/05/2010 (يوم/شهر/سنة)؛ الميلادي فقط */
  const xlDate = (s) => { s = String(s || '').trim(); if (!s) return ''; let m;
    if (/^\d{4,5}(\.\d+)?$/.test(s)) return new Date(Math.round((+s - 25569) * 864e5)).toISOString().slice(0, 10);
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return +m[1] > 1900 ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return +m[3] > 1900 ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
    return null; };
  const xlGender = (s) => { s = normAr(s); return !s ? '' : /^(ذكر|m|male|رجل)$/i.test(s) ? 'ذكر' : /^(انثي|انثى|f|female|امراه)$/i.test(s) ? 'أنثى' : null; };
  const xlCampus = (s) => { const k = normAr(s); if (!k) return ''; const c = CAMPUSES().find((x) => normAr(x) === k || normAr(x).includes(k) || k.includes(normAr(x))); return c || null; };
  const FAC_MAP = { 'الاسم بالعربية': 'name_ar', 'الاسم': 'name_ar', 'name_ar': 'name_ar', 'الاسم بالإنجليزية': 'name_en', 'name_en': 'name_en', 'الرقم الوظيفي': 'employee_no', 'employee_no': 'employee_no',
    'البريد الجامعي': 'email', 'البريد': 'email', 'email': 'email', 'الرتبة': 'rank', 'الرتبة الأكاديمية': 'rank', 'rank': 'rank', 'التخصص': 'specialty', 'specialty': 'specialty', 'القسم': 'department', 'القسم العلمي': 'department', 'department': 'department', 'الحالة': 'status', 'status': 'status', 'الجوال': 'mobile', 'رقم الجوال': 'mobile', 'mobile': 'mobile',
    'الجنس': 'gender', 'gender': 'gender', 'المقر': 'campus', 'campus': 'campus', 'تاريخ بداية الخدمة': 'service_start', 'بداية الخدمة': 'service_start', 'service_start': 'service_start', 'نوع التعاقد': 'contract_type', 'contract_type': 'contract_type' };
  const xlContract = (s) => { const k = normAr(s).replace(/^دوام\s+/, ''); if (!k) return ''; return CONTRACTS.find((c) => normAr(c).replace(/^دوام\s+/, '') === k) || null; };
  C.facExport = () => xlsxOut('أعضاء هيئة التدريس.xlsx', [{ name: 'الأعضاء', head: FAC_HEAD.concat(['الحساب', 'التكليفات السارية']),
    rows: facFiltered().map((f) => [f.name_ar, f.name_en, f.employee_no || '', f.email || '', f.rank, f.specialty, uName(f.department_id) === '—' ? '' : uName(f.department_id), f.status, S.privates[f.id] || '', f.gender || '', f.campus || '', f.service_start || '', f.contract_type || '',
      f.profile_app_id ? 'مرتبط' : '', S.members.filter((m) => m.faculty_id === f.id && activeM(m)).map((m) => uName(m.unit_id) + ' (' + POS[m.position] + ')').join('، ')]) }]);
  C.facImport = () => {
    modal('استيراد أعضاء هيئة التدريس من Excel', `<p>الملف يحتوي صفًا للعناوين ثم صفًا لكل عضو. يُطابق العضو الموجود بالرقم الوظيفي ثم بالبريد الجامعي (لا بالاسم وحده)، فيُحدَّث، ومن لا يطابق يُضاف جديدًا.</p>
      <div class="row"><button class="btn sm" onclick="C.facTemplate()">تنزيل القالب</button></div>
      <label class="f" style="margin-top:12px">ملف Excel<input type="file" id="fiF" accept=".xlsx,.xls,.csv" onchange="C.facParse(this)"></label>
      <div id="fiOut"></div><div class="err"></div>`, `<button class="btn pri" id="fiOk" disabled>اعتماد الاستيراد</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
  };
  C.facTemplate = () => xlsxOut('قالب أعضاء هيئة التدريس.xlsx', [{ name: 'الأعضاء', head: FAC_HEAD, rows: [['د. مثال الاسم الكامل', 'Example Name', '40000', 'name@ju.edu.sa', 'أستاذ مساعد', 'محاسبة مالية', (deptUnits()[0] || {}).name || 'قسم المحاسبة', 'نشط', '05xxxxxxxx', 'ذكر', CAMPUSES()[0], '2015-09-01', 'دوام كامل']] },
    { name: 'طريقة التعبئة', head: ['العمود', 'الوصف'], rows: [['الاسم بالعربية', 'إلزامي'], ['الرقم الوظيفي أو البريد الجامعي', 'يُستخدم للمطابقة مع الموجود؛ يُفضل تعبئة أحدهما على الأقل'], ['القسم', 'اسم القسم كما هو في الهيكل التنظيمي: ' + deptUnits().map((d) => d.name).join('، ')], ['الرتبة', ranks().join('، ')], ['الحالة', statuses().join('، ') + ' (الافتراضي: نشط)'], ['الجوال', 'اختياري؛ يُحفظ في جدول مقيد الاطلاع (يحتاج صلاحية مدير النظام)'], ['الجنس', 'ذكر أو أنثى'], ['المقر', CAMPUSES().join('، ')], ['تاريخ بداية الخدمة', 'ميلادي، مثل 2015-09-01؛ تُحسب سنوات الخدمة تلقائيًا']] }]);
  let FI = null;
  /* مطابقة اسم القسم بمرونة: دون «قسم» والهمزات، أو جزء من الاسم إن دلّ على قسم واحد («التمويل والاستثمار» = «قسم التمويل») */
  const deptKey = (s) => normAr(s).replace(/^قسم\s+/, '').replace(/^ال(?=\S)/, '');
  const deptMatch = (name) => { const k = deptKey(name); if (!k) return null; const ds = deptUnits();
    const eq = ds.filter((d) => deptKey(d.name) === k); if (eq.length === 1) return eq[0];
    const part = ds.filter((d) => { const dk = deptKey(d.name); return dk && (dk.includes(k) || k.includes(dk)); }); return part.length === 1 ? part[0] : null; };
  C.facParse =(input) => busy(null, async () => {
    const raw = await xlsxIn(input.files[0], { dateNF: 'yyyy-mm-dd' }); const rows = raw.map((r) => mapRow(r, FAC_MAP));
    const out = { add: [], upd: [], err: [], unk: {} }; const seenE = new Set(), seenN = new Set();
    rows.forEach((r, i) => {
      const n = i + 2;
      if (!r.name_ar) { if (Object.values(r).some(Boolean)) out.err.push([n, 'الاسم بالعربية فارغ']); return; }
      const email = (r.email || '').toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return out.err.push([n, 'بريد غير صحيح: ' + r.email]);
      if (email && seenE.has(email)) return out.err.push([n, 'بريد مكرر في الملف: ' + email]);
      if (r.employee_no && seenN.has(r.employee_no)) return out.err.push([n, 'رقم وظيفي مكرر في الملف: ' + r.employee_no]);
      if (email) seenE.add(email); if (r.employee_no) seenN.add(r.employee_no);
      let dep = null, unk = '';
      if (r.department) { const d = deptMatch(r.department); if (d) dep = d.id; else { unk = r.department.trim(); out.unk[unk] = (out.unk[unk] || 0) + 1; } }
      if (dep && !isAdmin() && !cap(dep, 'manage')) return out.err.push([n, 'لا تملك صلاحية على ' + uName(dep)]);
      const ex = (r.employee_no && S.faculty.find((f) => f.employee_no === r.employee_no)) || (email && S.faculty.find((f) => (f.email || '').toLowerCase() === email));
      if (ex && email && ex.email && ex.email.toLowerCase() !== email && S.faculty.some((f) => f.id !== ex.id && (f.email || '').toLowerCase() === email)) return out.err.push([n, 'البريد مسجل لعضو آخر: ' + email]);
      const g = xlGender(r.gender), cp = xlCampus(r.campus), sv = xlDate(r.service_start), ct = xlContract(r.contract_type);
      if (ct === null) return out.err.push([n, 'نوع التعاقد غير معروف: ' + r.contract_type + ' (' + CONTRACTS.join('، ') + ')']);
      if (g === null) return out.err.push([n, 'الجنس غير معروف: ' + r.gender]);
      if (cp === null) return out.err.push([n, 'المقر غير معروف: ' + r.campus + ' (المقرات: ' + CAMPUSES().join('، ') + ')']);
      if (sv === null) return out.err.push([n, 'تاريخ بداية الخدمة غير مفهوم (ميلادي): ' + r.service_start]);
      const row = { name_ar: r.name_ar, name_en: r.name_en || '', employee_no: r.employee_no || null, email: email || null, rank: r.rank || '', specialty: r.specialty || '', department_id: dep, status: r.status || 'نشط' };
      /* الحقول الجديدة لا تُفرَّغ إن تُركت فارغة في الملف */
      if (g) row.gender = g; if (cp) row.campus = cp; if (sv) row.service_start = sv; if (ct) row.contract_type = ct;
      if (ex) { const ch = Object.keys(row).filter((k) => (row[k] || '') !== (ex[k] || '') && !(k === 'department_id' && !row[k])); if (unk && !ch.includes('department_id')) ch.push('department_id'); if (ch.length || (r.mobile && r.mobile !== S.privates[ex.id])) out.upd.push({ n, id: ex.id, row, ch, mobile: r.mobile, unk }); }
      else out.add.push({ n, row, mobile: r.mobile, unk });
    });
    FI = out; const unks = Object.keys(out.unk);
    $('#fiOut').innerHTML = `<div class="stats" style="margin-top:14px"><div><b>${out.add.length}</b><span>جديد</span></div><div><b>${out.upd.length}</b><span>تحديث</span></div><div><b class="${out.err.length ? 'bad' : ''}">${out.err.length}</b><span>أخطاء (لن تُستورد)</span></div></div>
      ${unks.length ? `<h3 style="margin-top:12px">أقسام لم تُعرف في الهيكل</h3><p class="small">اختر القسم المقصود بكل اسم، أو «بلا قسم». يُطبَّق الاختيار على كل الصفوف التي فيها هذا الاسم.</p>
        <div class="tw"><table><tr><th>الاسم في الملف</th><th>عدد الصفوف</th><th>القسم في الهيكل</th></tr>${unks.map((u, i) => `<tr><td>${esc(u)}</td><td>${out.unk[u]}</td><td><select id="fiU${i}"><option value="">بلا قسم</option>${deptUnits().filter((d) => isAdmin() || cap(d.id, 'manage')).map((d) => opt(d.id, d.name, '')).join('')}</select></td></tr>`).join('')}</table></div>` : ''}
      ${out.err.length ? `<h3>الأخطاء</h3><div class="tw"><table><tr><th>الصف</th><th>المشكلة</th></tr>${out.err.slice(0, 100).map((e) => `<tr><td>${e[0]}</td><td>${esc(e[1])}</td></tr>`).join('')}</table></div>` : ''}
      ${out.add.length ? `<h3 style="margin-top:12px">الجديد</h3><div class="tw"><table><tr><th>الصف</th><th>الاسم</th><th>البريد</th><th>القسم</th></tr>${out.add.slice(0, 100).map((a) => `<tr><td>${a.n}</td><td>${esc(a.row.name_ar)}</td><td dir="ltr">${esc(a.row.email || '')}</td><td>${esc(uName(a.row.department_id))}</td></tr>`).join('')}</table></div>` : ''}
      ${out.upd.length ? `<h3 style="margin-top:12px">التحديث</h3><div class="tw"><table><tr><th>الصف</th><th>الاسم</th><th>الحقول المتغيرة</th></tr>${out.upd.slice(0, 100).map((a) => `<tr><td>${a.n}</td><td>${esc(a.row.name_ar)}</td><td class="small">${esc(a.ch.join('، ') || 'الجوال')}</td></tr>`).join('')}</table></div>` : ''}`;
    $('#fiOk').disabled = !(out.add.length || out.upd.length);
    $('#fiOk').onclick = (ev) => busy(ev.target, async () => {
      const map = Object.fromEntries(unks.map((u, i) => [u, val('fiU' + i) || null]));
      FI.add.concat(FI.upd).forEach((a) => { if (a.unk) a.row.department_id = map[a.unk]; });
      let ok = 0; const fails = [];
      for (const a of FI.add) { try { const r = (await D.insert('faculty', a.row))[0]; if (a.mobile && isAdmin()) await D.upsert('faculty_private', { faculty_id: r.id, mobile: a.mobile }); ok++; } catch (e) { fails.push('صف ' + a.n + ': ' + pgErr(e)); } }
      for (const a of FI.upd) { try { const row = Object.assign({}, a.row); if (!row.department_id) delete row.department_id; await D.update('faculty', row, { eq: { id: a.id } }); if (a.mobile && isAdmin()) await D.upsert('faculty_private', { faculty_id: a.id, mobile: a.mobile }); ok++; } catch (e) { fails.push('صف ' + a.n + ': ' + pgErr(e)); } }
      await reloadFaculty();
      if (fails.length) { $('#fiOut').innerHTML = `<p>اكتمل ${ok} سجل. تعذّر:</p><ul>${fails.map((f) => `<li class="small bad">${esc(f)}</li>`).join('')}</ul>`; $('#fiOk').disabled = true; }
      else { C.close(); refresh(); toast('اكتمل الاستيراد: ' + ok + ' سجل.'); }
    });
  });

  /* ---------------------------------------------------------------------
     التكليفات بملف Excel: مرجع واحد يُستورد هنا، ويُستورد نفسه عند النقل لخادم الجامعة.
     التكليف مرتبط بسجل العضو لا بحساب الدخول، ومنه تُشتق صلاحيات الجهات وبرامجها.
     العضو يُطابق بالرقم الوظيفي ثم البريد ثم الاسم الكامل (إن لم يتكرر)، والجهة باسمها في الهيكل.
     --------------------------------------------------------------------- */
  const AS_HEAD = ['الرقم الوظيفي', 'البريد الجامعي', 'اسم العضو', 'الجهة', 'الصفة', 'المسمى', 'بداية التكليف', 'نهاية التكليف'];
  const AS_MAP = { 'الرقم الوظيفي': 'emp', 'employee_no': 'emp', 'البريد الجامعي': 'email', 'البريد': 'email', 'email': 'email', 'اسم العضو': 'name', 'الاسم': 'name', 'الاسم بالعربية': 'name',
    'الجهة': 'unit', 'unit': 'unit', 'الصفة': 'pos', 'المنصب': 'pos', 'position': 'pos', 'المسمى': 'title', 'title': 'title', 'بداية التكليف': 'start', 'البداية': 'start', 'start_date': 'start',
    'نهاية التكليف': 'end', 'النهاية': 'end', 'end_date': 'end' };
  const POS_OUT = { head: 'رئيس', deputy: 'نائب', secretary: 'مقرر', member: 'عضو', viewer: 'مطّلع' };
  const POS_IN = { 'رئيس': 'head', 'مسؤول': 'head', 'رئيس / مسؤول': 'head', 'head': 'head', 'نائب': 'deputy', 'deputy': 'deputy', 'مقرر': 'secretary', 'أمين': 'secretary', 'secretary': 'secretary', 'عضو': 'member', 'member': 'member', 'مطلع': 'viewer', 'مطّلع': 'viewer', 'viewer': 'viewer' };
  const normAr = (s) => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  /* التاريخ: 2026-08-16 أو 2026/8/16 أو 16/8/2026، أو رقم Excel التسلسلي، أو m/d/yy كما يكتبه Excel الإنجليزي */
  const asDate = (v) => { const s = String(v == null ? '' : v).trim(); if (!s) return ''; const p2 = (x) => String(x).padStart(2, '0'); let m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) return `20${m[3]}-${p2(m[1])}-${p2(m[2])}`;
    if (/^\d{5}$/.test(s)) return new Date(Math.round((+s - 25569) * 86400000)).toISOString().slice(0, 10);
    return null; };
  const asRows = (list) => list.map((m) => { const f = fac(m.faculty_id) || {}; return [f.employee_no || '', f.email || '', f.name_ar || '', uName(m.unit_id), POS_OUT[m.position] || m.position, m.title || '', m.start_date || '', m.end_date || '']; });
  const asGuide = () => ({ name: 'طريقة التعبئة', head: ['العمود', 'الوصف'], rows: [['الرقم الوظيفي أو البريد الجامعي', 'لمطابقة العضو بسجله في قاعدة الأعضاء (يُفضل الرقم الوظيفي). يكفي أحدهما'],
    ['اسم العضو', 'للقراءة فقط؛ يُطابق به إن خلا الرقم والبريد وكان الاسم غير مكرر'], ['الجهة', 'اسمها كما في الهيكل التنظيمي (انظر الورقة «الجهات»)'],
    ['الصفة', 'رئيس، نائب، مقرر، عضو. الرئيس الجديد يُنهي تكليف الرئيس السابق للجهة'], ['المسمى', 'اختياري، مثل: منسق الجودة'],
    ['بداية التكليف', 'اختياري بالصيغة 2026-08-16 (الافتراضي اليوم)'], ['نهاية التكليف', 'اختياري؛ فارغ = مستمر']] });
  const asUnits = () => ({ name: 'الجهات', head: ['الجهة', 'النوع', 'تتبع'], rows: S.units.filter((u) => u.status !== 'archived').sort(sortU).map((u) => [u.name, KIND[u.kind] || u.kind, uName(u.parent_id)]) });
  C.asExport = () => xlsxOut('التكليفات ' + today() + '.xlsx', [{ name: 'التكليفات السارية', head: AS_HEAD, rows: asRows(S.members.filter((m) => activeM(m)).sort((a, b) => uName(a.unit_id).localeCompare(uName(b.unit_id), 'ar') || (a.position === 'head' ? -1 : 1))) },
    { name: 'التكليفات المنتهية', head: AS_HEAD, rows: asRows(S.members.filter((m) => !activeM(m))) }, asGuide(), asUnits()]);
  C.asTemplate = () => xlsxOut('قالب التكليفات.xlsx', [{ name: 'التكليفات', head: AS_HEAD, rows: [['40000', 'name@ju.edu.sa', 'د. مثال الاسم', (S.units.find((u) => u.kind === 'unit') || {}).name || 'وحدة الجودة', 'عضو', '', today(), '']] }, asGuide(), asUnits()]);
  C.asImport = () => {
    if (!isAdmin()) return toast('استيراد التكليفات لمدير النظام.', true);
    modal('استيراد التكليفات من Excel', `<p>صف لكل تكليف: العضو (برقمه الوظيفي أو بريده)، والجهة، والصفة. من له التكليف نفسه لا يتغير، ومن تغيرت صفته يُنهى تكليفه السابق ويُسجَّل الجديد (يبقى السجل كاملًا). لا يُحذف أي تكليف غير موجود في الملف.</p>
      <div class="row"><button class="btn sm" onclick="C.asTemplate()">تنزيل القالب</button><button class="btn sm" onclick="C.asExport()">تصدير التكليفات الحالية</button></div>
      <label class="f" style="margin-top:12px">ملف Excel<input type="file" id="aiF" accept=".xlsx,.xls,.csv" onchange="C.asParse(this)"></label>
      <div id="aiOut"></div><div class="err"></div>`, `<button class="btn pri" id="aiOk" disabled>اعتماد الاستيراد</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
  };
  let AI = null;
  C.asParse = (input) => busy(null, async () => {
    const raw = await xlsxIn(input.files[0]); const rows = raw.map((r) => mapRow(r, AS_MAP));
    const units = S.units.filter((u) => u.status !== 'archived');
    const out = { add: [], chg: [], same: 0, err: [] }, seen = new Set(), heads = {};
    rows.forEach((r, i) => {
      const n = i + 2, bad = (t) => out.err.push([n, t]);
      if (!Object.values(r).some(Boolean)) return;
      const email = (r.email || '').toLowerCase();
      let f = (r.emp && S.faculty.find((x) => x.employee_no === r.emp)) || (email && S.faculty.find((x) => (x.email || '').toLowerCase() === email));
      if (!f && r.name && !r.emp && !email) { const l = S.faculty.filter((x) => normAr(x.name_ar) === normAr(r.name)); if (l.length > 1) return bad('الاسم مكرر في قاعدة الأعضاء؛ اكتب الرقم الوظيفي: ' + r.name); f = l[0]; }
      if (!f) return bad('العضو غير موجود في قاعدة الأعضاء: ' + (r.emp || email || r.name || '—'));
      const u = units.find((x) => x.id === r.unit || normAr(x.name) === normAr(r.unit));
      if (!u) return bad('الجهة غير موجودة في الهيكل: ' + (r.unit || '—'));
      const pos = POS_IN[String(r.pos || 'عضو').trim()];
      if (!pos) return bad('صفة غير معروفة: ' + r.pos + ' (رئيس، نائب، مقرر، عضو)');
      const start = asDate(r.start) || today(), end = asDate(r.end);
      if (start === null || asDate(r.start) === null || end === null) return bad('تاريخ غير مفهوم؛ اكتبه بالصيغة 2026-08-16');
      if (end && end < start) return bad('نهاية التكليف قبل بدايته');
      const key = f.id + '|' + u.id; if (seen.has(key)) return bad('التكليف مكرر في الملف: ' + f.name_ar + ' — ' + u.name); seen.add(key);
      if (pos === 'head') { if (heads[u.id]) return bad('أكثر من رئيس للجهة نفسها في الملف: ' + u.name); heads[u.id] = f.id; }
      const ex = S.members.find((m) => m.unit_id === u.id && m.faculty_id === f.id && activeM(m));
      const row = { n, f, u, pos, title: r.title || '', start, end: end || null };
      const curHead = pos === 'head' && S.members.find((m) => m.unit_id === u.id && m.position === 'head' && activeM(m) && m.faculty_id !== f.id);
      if (curHead) row.note = 'يحل محل ' + fName(curHead.faculty_id);
      if (ex && ex.position === pos && (!row.title || row.title === (ex.title || ''))) out.same++;
      else if (ex) { row.ex = ex; row.note = (row.note ? row.note + '؛ ' : '') + 'كان: ' + (POS_OUT[ex.position] || ex.position); out.chg.push(row); }
      else out.add.push(row);
    });
    AI = out;
    const tbl = (l) => `<div class="tw"><table><tr><th>الصف</th><th>العضو</th><th>الجهة</th><th>الصفة</th><th>من</th><th>ملاحظة</th></tr>${l.slice(0, 150).map((a) => `<tr><td>${a.n}</td><td>${esc(a.f.name_ar)}</td><td>${esc(a.u.name)}</td><td>${esc(POS_OUT[a.pos])}${a.title ? ' · ' + esc(a.title) : ''}</td><td class="num">${esc(a.start)}</td><td class="small">${esc(a.note || '')}</td></tr>`).join('')}</table></div>`;
    $('#aiOut').innerHTML = `<div class="stats" style="margin-top:14px"><div><b>${out.add.length}</b><span>تكليف جديد</span></div><div><b>${out.chg.length}</b><span>تغيير صفة</span></div><div><b>${out.same}</b><span>موجود دون تغيير</span></div><div><b class="${out.err.length ? 'bad' : ''}">${out.err.length}</b><span>أخطاء (لن تُستورد)</span></div></div>
      ${out.err.length ? `<h3>الأخطاء</h3><div class="tw"><table><tr><th>الصف</th><th>المشكلة</th></tr>${out.err.slice(0, 150).map((e) => `<tr><td>${e[0]}</td><td>${esc(e[1])}</td></tr>`).join('')}</table></div>` : ''}
      ${out.add.length ? `<h3 style="margin-top:12px">الجديد</h3>${tbl(out.add)}` : ''}${out.chg.length ? `<h3 style="margin-top:12px">تغيير الصفة</h3>${tbl(out.chg)}` : ''}`;
    $('#aiOk').disabled = !(out.add.length || out.chg.length);
    $('#aiOk').onclick = (ev) => busy(ev.target, async () => {
      let ok = 0; const fails = [], told = [];
      const yesterday = (d) => { const x = new Date(d); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };
      for (const a of AI.chg.concat(AI.add)) {
        try {
          if (a.ex) { if (a.ex.position === 'head') await D.rpc('org_set_head', { p_unit: a.u.id, p_faculty: null, p_start: a.start, p_end: null });
            else await D.update('org_members', { end_date: [yesterday(a.start), a.ex.start_date].sort().pop() }, { eq: { id: a.ex.id } }); }
          if (a.pos === 'head') { await D.rpc('org_set_head', { p_unit: a.u.id, p_faculty: a.f.id, p_start: a.start, p_end: a.end });
            if (a.title) await D.update('org_members', { title: a.title }, { eq: { unit_id: a.u.id, faculty_id: a.f.id, position: 'head', start_date: a.start } }).catch(() => {}); }
          else await D.insert('org_members', { unit_id: a.u.id, faculty_id: a.f.id, position: a.pos, title: a.title, start_date: a.start, end_date: a.end });
          if (a.f.profile_app_id) told.push([a.f.profile_app_id, (a.pos === 'head' ? 'كُلّفت برئاسة ' : 'كُلّفت بعضوية ') + a.u.name]);
          ok++;
        } catch (e) { fails.push('صف ' + a.n + ': ' + pgErr(e)); }
      }
      for (const [p, t] of told) notify([p], t);
      S.members = await D.select('org_members');
      if (fails.length) { $('#aiOut').innerHTML = `<p>اكتمل ${ok} تكليف. تعذّر:</p><ul>${fails.map((f) => `<li class="small bad">${esc(f)}</li>`).join('')}</ul>`; $('#aiOk').disabled = true; }
      else { C.close(); refresh(); toast('اكتمل استيراد التكليفات: ' + ok + '.'); }
    });
  });

  /* =====================================================================
     المقررات والجداول الدراسية
     ===================================================================== */
  const CQ = { tab: 'current', term: null, q: '' };
  const SCH_HEAD = ['رمز المقرر', 'اسم المقرر', 'الساعات', 'البرنامج', 'القسم', 'الشعبة', 'الشطر', 'الأيام', 'من', 'إلى', 'القاعة', 'بريد عضو هيئة التدريس', 'الرقم الوظيفي', 'اسم عضو هيئة التدريس', 'نوع التكليف'];
  const SCH_KEYS = ['course_code', 'course_name', 'credit_hours', 'program', 'department', 'section', 'gender', 'days', 'time_from', 'time_to', 'room', 'faculty_email', 'faculty_empno', 'faculty_name', 'teaching_kind'];
  const SCH_MAP = Object.assign(Object.fromEntries(SCH_HEAD.map((h, i) => [h, SCH_KEYS[i]])), Object.fromEntries(SCH_KEYS.map((k) => [k, k])),
    { 'رمز': 'course_code', 'المقرر': 'course_name', 'الساعات المعتمدة': 'credit_hours', 'رقم الشعبة': 'section', 'البريد': 'faculty_email', 'عضو هيئة التدريس': 'faculty_name', 'المحاضر': 'faculty_name', 'من الساعة': 'time_from', 'إلى الساعة': 'time_to' });
  async function pgCourses() {
    if (VIEW.tab) { CQ.tab = VIEW.tab; delete VIEW.tab; }
    if (!CQ.term || !S.terms.some((t) => t.id === CQ.term)) CQ.term = (curTerm() || {}).id || null;
    const tabs = [['current', 'الجدول المعتمد'], ['import', 'استيراد جدول'], ['versions', 'الإصدارات'], ['coords', 'البرامج والمنسقون'], ['courses', 'المقررات'], ['terms', 'الفصول الدراسية']];
    const termSel = `<label class="row small" style="gap:6px">الفصل الدراسي<select class="inp" onchange="C.cTerm(this.value)">${S.terms.slice().reverse().map((t) => opt(t.id, t.name + (t.is_current ? ' (الحالي)' : ''), CQ.term)).join('')}</select></label>`;
    let body = '';
    if (!S.terms.length && CQ.tab !== 'terms') body = `<div class="empty">لا توجد فصول دراسية بعد. أضف فصلًا من تبويب «الفصول الدراسية».</div>`;
    else if (CQ.tab === 'current') body = await schedCurrent();
    else if (CQ.tab === 'import') body = schedImport();
    else if (CQ.tab === 'versions') body = await schedVersions();
    else if (CQ.tab === 'courses') body = await coursesTab();
    else if (CQ.tab === 'coords') body = await coordsTab();
    else body = termsTab();
    return `<div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${CQ.tab === t[0]}" class="${CQ.tab === t[0] ? 'on' : ''}" onclick="C.cTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
      ${['current', 'import', 'versions', 'coords'].includes(CQ.tab) && S.terms.length ? `<div class="row noprint" style="margin-bottom:12px">${termSel}</div>` : ''}${body}`;
  }
  C.cTab = (t) => { CQ.tab = t; refresh(); };

  /* ---------- البرامج ومنسقوها، ومنسق كل مقرر في الفصل (الملف 13) ----------
     برنامج المقرر من رمزه ومستوى الدرجة في الجدول، لا من قسم من يدرّسه؛ والمنسق المقترح من يدرّس أكثر شعبه */
  const KQ = { prog: '', q: '' };
  const canProg = () => isAdmin() || gcap('approve_import');
  const isProgCoord = (pid) => { const p = (S.programs || []).find((x) => x.id === pid); return !!(p && myFac() && p.coordinator_id === myFac()); };
  const canCoordOf = (c) => canProg() || (c.department_id && cap(c.department_id, 'manage')) || isProgCoord(c.program_id);
  async function coordsTab() {
    let ctx, sug;
    try { [ctx, sug] = await Promise.all([D.rpc('sched_context', { p_term: CQ.term }), D.rpc('suggest_coords', { p_term: CQ.term })]); }
    catch (e) { return `<div class="empty">هذه الصفحة تحتاج تنفيذ ملف قاعدة البيانات <b>13_programs_coordinators.sql</b> في Supabase.<div class="small muted">${esc(pgErr(e))}</div></div>`; }
    S.programs = await D.select('programs', { order: ['sort'] }).catch(() => S.programs || []);
    const OV = new Map((await D.select('courses', { cols: 'id,program_id' }).catch(() => [])).map((c) => [c.id, c.program_id || '']));   /* التحديد اليدوي (الملف 20) */
    const SG = new Map((sug || []).map((x) => [x.course_id, x])); KQ.ctx = ctx; KQ.sug = SG;
    const progs = S.programs, pname = (id) => (progs.find((p) => p.id === id) || {}).name || 'دون برنامج';
    const facList = S.faculty.filter((f) => f.status !== 'غير نشط').slice().sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
    const progRows = progs.map((p) => `<tr><td><b>${esc(p.name)}</b>${p.active === false ? ' <span class="chip">موقوف</span>' : ''}</td><td class="small">${esc(p.degree || 'كل المستويات')}</td><td dir="ltr" class="small">${esc((p.prefixes || []).join(', '))}</td>
      <td class="small">${esc(uName(p.department_id))}</td><td class="small">${(ctx.courses || []).filter((c) => c.program_id === p.id).length}</td>
      <td>${canProg() ? `<select onchange="C.progCoord('${attr(p.id)}',this.value)"><option value="">—</option>${facList.map((f) => opt(f.id, f.name_ar, p.coordinator_id)).join('')}</select>` : esc(p.coordinator_id ? fName(p.coordinator_id) : '—')}</td>
      <td>${canProg() ? `<button class="btn sm" onclick="C.progEdit('${attr(p.id)}')">تعديل</button>` : ''}</td></tr>`).join('');
    const q = normAr(KQ.q).toLowerCase();
    const list = (ctx.courses || []).filter((c) => (!KQ.prog || (KQ.prog === '-' ? !c.program_id : c.program_id === KQ.prog)) && (!q || c.code.toLowerCase().includes(q) || normAr(c.name).toLowerCase().includes(q)));
    const missing = new Set(list.filter((c) => !c.coordinator_id && SG.has(c.id) && canCoordOf(c)).map((c) => c.id)).size;
    const crs = list.map((c) => { const teach = [...new Set(c.sections.flatMap((s) => s.fac))], sg = SG.get(c.id), ed = canCoordOf(c);
      /* قائمة المنسق: من يدرّسون شعب المقرر هذا الفصل فقط (الأكثر شعبًا أولًا)، والمنسق الحالي إن كان من غيرهم، ثم «عضو آخر…» للحالات النادرة */
      const nSec = (id) => c.sections.filter((s) => s.fac.includes(id)).length;
      const opts = teach.slice().sort((a, b) => nSec(b) - nSec(a)).map((id) => fac(id)).filter(Boolean).concat(c.coordinator_id && !teach.includes(c.coordinator_id) && fac(c.coordinator_id) ? [fac(c.coordinator_id)] : []);
      const ov = OV.get(c.id) || '', progSel = canProg() ? `<select class="tiny" style="max-width:230px;margin-top:3px" title="برنامج المقرر" onchange="C.courseProg('${attr(c.id)}',this.value)">
          <option value="">تلقائي من البادئة${!ov && c.program_id ? ': ' + esc(pname(c.program_id)) : ''}</option>${progs.filter((p) => p.active !== false).map((p) => opt(p.id, p.name, ov)).join('')}</select>` : '';
      return `<tr><td style="min-width:190px"><b>${esc(c.code)}</b> ${esc(c.name)}<div class="tiny muted">${progSel || esc(pname(c.program_id))}${ov ? ' · يدوي' : ''}</div></td><td>${c.sections.length}</td>
        <td class="small">${teach.map((id) => esc(fName(id)) + ' (' + c.sections.filter((s) => s.fac.includes(id)).length + ')').join('، ') || '—'}</td>
        <td class="small">${sg ? esc(fName(sg.faculty_id)) + ' (' + sg.sections + ')' : '—'}</td>
        <td style="min-width:200px">${ed ? `<select style="max-width:260px" onchange="C.courseCoord('${attr(c.id)}',this.value)"><option value="">— لا منسق —</option>${opts.map((f) => opt(f.id, f.name_ar + (teach.includes(f.id) ? ' (' + nSec(f.id) + ' ' + (nSec(f.id) === 1 ? 'شعبة' : 'شعب') + ')' : ' — لا يدرّسه'), c.coordinator_id)).join('')}<option value="__other">عضو آخر لا يدرّس المقرر هذا الفصل…</option></select>` : esc(c.coordinator_id ? fName(c.coordinator_id) : '—')}
          ${c.coordinator_id ? `<span class="tiny muted">${c.coord_source === 'auto' ? 'تلقائي' : 'يدوي'}</span>` : ''}</td></tr>`; }).join('');
    return `<div class="panel"><div class="row"><h2 class="grow" style="margin:0">البرامج الأكاديمية</h2>${canProg() ? `<button class="btn sm" onclick="C.progEdit('')">+ برنامج</button>` : ''}</div>
        <p class="small muted">برنامج المقرر يُعرف من أطول بادئة تطابق رمزه: حروف (ACCT، بشر) أو حروف ثم رقم (بشر5 للدبلوم العالي، دار6 للماجستير)، ومن مستوى الدرجة؛ لا من قسم من يدرّسه. ويمكن تحديده يدويًا لكل مقرر من القائمة تحت اسمه أدناه، فيغلب على البادئة. منسق البرنامج يرى كل مقررات برنامجه ويعد تقريره.</p>
        <div class="tw"><table><tr><th>البرنامج</th><th>المستوى</th><th>بادئات المقررات</th><th>القسم</th><th>مقررات الفصل</th><th>منسق البرنامج</th><th></th></tr>${progRows || '<tr><td colspan="7" class="muted">لا توجد برامج.</td></tr>'}</table></div></div>
      <div class="panel"><div class="row"><h2 class="grow" style="margin:0">منسقو المقررات — ${esc((S.terms.find((t) => t.id === CQ.term) || {}).name || '')}</h2>
          ${missing ? `<button class="btn pri sm" onclick="C.coordApplyAll(this)">اقتراح المنسقين لكل المقررات الفارغة (${missing})</button>` : ''}</div>
        ${ctx.version ? '' : '<div class="empty">لا يوجد جدول معتمد لهذا الفصل.</div>'}
        <div class="row" style="margin:8px 0"><select onchange="C.kqProg(this.value)" id="kqP"><option value="">كل البرامج</option>${progs.map((p) => opt(p.id, p.name, KQ.prog)).join('')}<option value="-" ${KQ.prog === '-' ? 'selected' : ''}>دون برنامج</option></select>
          <input class="inp" placeholder="بحث برمز المقرر أو اسمه" value="${attr(KQ.q)}" onchange="C.kq(this.value)"><span class="small muted">${list.length} مقرر · قائمة المنسق: من يدرّس المقرر هذا الفصل وعدد شعبه</span></div>
        <div class="tw"><table><tr><th>المقرر</th><th>الشعب</th><th>من يدرّسه (عدد الشعب)</th><th>المقترح</th><th>منسق المقرر</th></tr>${crs || '<tr><td colspan="5" class="muted">لا مقررات.</td></tr>'}</table></div></div>`;
  }
  /* برنامج المقرر يدويًا: يغلب على البادئة في كل الموقع (courses.program_id، الملف 20) */
  C.courseProg = (cid, pid) => busy(null, async () => { await D.update('courses', { program_id: pid || null }, { eq: { id: cid } }); toast(pid ? 'حُدد برنامج المقرر.' : 'عاد برنامج المقرر تلقائيًا من البادئة.'); refresh(); });
  C.kqProg = (v) => { KQ.prog = v; refresh(); };
  C.kq = (v) => { KQ.q = v; refresh(); };
  /* «عضو آخر…»: بحث في كل الأعضاء النشطين للحالات النادرة */
  C.coordOther = (cid) => { const c = (KQ.ctx.courses || []).find((x) => x.id === cid) || {};
    const list = (q) => { const k = normAr(q || '').toLowerCase(); return S.faculty.filter((f) => !offF(f) && (!k || normAr(f.name_ar).toLowerCase().includes(k))).sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')).slice(0, 40)
      .map((f) => `<button class="btn sm" style="margin:3px" onclick="C.close();C.courseCoord('${attr(cid)}','${f.id}')">${esc(f.name_ar)}<span class="tiny muted"> · ${esc(uName(f.department_id))}</span></button>`).join('') || '<p class="small muted">لا نتائج.</p>'; };
    modal('منسق من خارج من يدرّسون ' + (c.code || ''), `<p class="small muted">للحالات النادرة فقط: عضو لا يدرّس المقرر هذا الفصل.</p><input class="inp" id="coQ" placeholder="ابحث بالاسم…" style="width:100%" autofocus><div id="coL" style="margin-top:10px;max-height:50vh;overflow:auto">${list('')}</div>`, '<button class="btn" onclick="C.close();C.refresh()">إلغاء</button>');
    $('#coQ').oninput = (e) => { $('#coL').innerHTML = list(e.target.value); }; };
  C.courseCoord = (cid, fid) => fid === '__other' ? C.coordOther(cid) : busy(null, async () => {
    if (fid) await D.upsertMany('course_coords', [{ term_id: CQ.term, course_id: cid, faculty_id: fid, source: 'manual' }], 'term_id,course_id', false);
    else await D.remove('course_coords', { eq: { term_id: CQ.term, course_id: cid } });
    toast(fid ? 'عُيّن منسق المقرر.' : 'أُزيل منسق المقرر.'); refresh(); });
  C.coordApplyAll = (btn) => busy(btn, async () => {
    const ids = [...new Set((KQ.ctx.courses || []).filter((c) => !c.coordinator_id && KQ.sug.has(c.id) && canCoordOf(c)).map((c) => c.id))];
    const rows = ids.map((id) => ({ term_id: CQ.term, course_id: id, faculty_id: KQ.sug.get(id).faculty_id, source: 'auto' }));
    for (let i = 0; i < rows.length; i += 200) await D.upsertMany('course_coords', rows.slice(i, i + 200), 'term_id,course_id', true);
    toast('عُيّن ' + rows.length + ' منسقًا مقترحًا. يمكنك تغيير أي منهم.'); refresh(); });
  C.progCoord = (pid, fid) => busy(null, async () => { await D.update('programs', { coordinator_id: fid || null }, { eq: { id: pid } }); S.programs = await D.select('programs', { order: ['sort'] }); toast('حُفظ منسق البرنامج.'); refresh(); });
  C.progEdit = (pid) => {
    const p = (S.programs || []).find((x) => x.id === pid) || { id: '', name: '', degree: 'البكالوريوس', prefixes: [], department_id: '', active: true, sort: (S.programs || []).length + 1 };
    modal(pid ? 'تعديل برنامج' : 'برنامج جديد', `<div class="formgrid">
      ${pid ? '' : `<label class="f">المعرّف (بالإنجليزية، ثابت)<input id="pgI" dir="ltr" placeholder="dip-acct"></label>`}
      <label class="f">اسم البرنامج<input id="pgN" value="${attr(p.name)}"></label>
      <label class="f">مستوى الدرجة كما في البرش<input id="pgD" value="${attr(p.degree)}" placeholder="البكالوريوس / الدبلوم المتوسط / ماجستير ؛ فارغ = الكل"></label>
      <label class="f">بادئات رموز المقررات (بفاصلة)<input id="pgP" dir="ltr" value="${attr((p.prefixes || []).join(', '))}" placeholder="ACCT، AACT، بشر5، دار6"><span class="tiny muted">حروف، أو حروف ثم رقم أول (بشر5 = المقررات بشر 5xx)</span></label>
      <label class="f">القسم<select id="pgS"><option value="">—</option>${deptUnits().map((d) => opt(d.id, d.name, p.department_id)).join('')}</select></label>
      <label class="f">الحالة<select id="pgA">${opt('1', 'نشط', p.active === false ? '0' : '1')}${opt('0', 'موقوف', p.active === false ? '0' : '1')}</select></label>
      <label class="f">لجنة الجودة للبرنامج<select id="pgQ"><option value="">وحدة الجودة والاعتماد الأكاديمي (الافتراضي)</option>${S.units.filter((u) => (u.kind === 'unit' || u.kind === 'committee') && u.id !== 'u-quality').sort(sortU).map((u) => opt(u.id, u.name, p.quality_unit_id || '')).join('')}</select><span class="tiny muted">أعضاؤها يراجعون ملفات مقررات البرنامج ويعتمدونها مع منسق البرنامج</span></label></div><div class="err"></div>`,
      `<button class="btn pri" id="pgOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#pgOk').onclick = (ev) => busy(ev.target, async () => {
      const row = { name: val('pgN'), degree: val('pgD'), prefixes: val('pgP').toUpperCase().split(/[\s,،]+/).filter(Boolean), department_id: val('pgS') || null, active: val('pgA') === '1', quality_unit_id: val('pgQ') || null };
      if (!row.name || !row.prefixes.length) throw new Error('اكتب اسم البرنامج وبادئة واحدة على الأقل.');
      if (pid) await D.update('programs', row, { eq: { id: pid } });
      else { const id = val('pgI').toLowerCase().replace(/[^a-z0-9-]/g, ''); if (!id) throw new Error('اكتب معرّفًا بالإنجليزية.'); await D.insert('programs', Object.assign({ id, sort: p.sort }, row)); }
      S.programs = await D.select('programs', { order: ['sort'] }); C.close(); refresh(); toast('حُفظ البرنامج.'); });
  };
  C.cTerm = (t) => { CQ.term = t; IMP = null; refresh(); };
  async function versionRows(vid) {
    const [secs, offs, tch] = await Promise.all([D.select('sections', { eq: { version_id: vid } }), D.select('offerings', { eq: { version_id: vid } }), D.select('teaching', { eq: { version_id: vid } })]);
    const courses = await D.select('courses');
    const cm = Object.fromEntries(courses.map((c) => [c.id, c])), om = Object.fromEntries(offs.map((o) => [o.id, o]));
    return secs.map((s) => { const o = om[s.offering_id], c = cm[o.course_id]; const ts = tch.filter((t) => t.section_id === s.id);
      return { code: c.code, name: c.name_ar, hours: c.credit_hours, program: o.program, dept: o.department_id, section: s.section_no, id: s.id, campus: s.campus || '', students: s.students == null ? '' : String(s.students), gender: s.gender, days: s.days, from: s.time_from, to: s.time_to, room: s.room,
        fac: ts.map((t) => t.faculty_id), kinds: ts.map((t) => t.kind) }; })
      .sort((a, b) => a.code.localeCompare(b.code) || String(a.section).localeCompare(String(b.section), undefined, { numeric: true }));
  }
  const approvedOf = async (term) => (await D.select('sched_versions', { eq: { term_id: term, status: 'approved' }, cols: 'id,version_no,approved_at,approved_by,source_name' })).sort((a, b) => b.version_no - a.version_no)[0];
  async function schedCurrent() {
    const v = await approvedOf(CQ.term);
    if (!v) return `<div class="empty">لا يوجد جدول معتمد لهذا الفصل.${gcap('import_schedule') ? ' ارفع ملف الجدول من تبويب «استيراد جدول».' : ''}</div>`;
    const rows = await versionRows(v.id); S._cur = rows;
    /* اسم البرنامج (لا الدرجة): التحديد اليدوي للمقرر ثم البادئة */
    COURSE_PROG = new Map((await D.select('courses', { cols: 'code,program_id' }).catch(() => [])).filter((c) => c.program_id).map((c) => [norm(c.code), c.program_id]));
    rows.forEach((r) => { r.progName = (progMatch(r.code, r.program) || {}).name || ''; });
    const q = CQ.q.trim();
    const list = rows.filter((r) => !q || [r.code, r.name, r.room, r.fac.map(fName).join(' ')].some((x) => String(x).includes(q)));
    VIEW.after = () => { const i = $('#cq'); if (i && CQ._f) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); CQ._f = false; } };
    return `<p class="small muted">الإصدار ${v.version_no} · اعتمده ${esc(pName(v.approved_by))} في ${fmtDT(v.approved_at)} · ${esc(v.source_name || '')}. هذا هو المصدر الذي تقرأ منه الوحدات المقررات والشعب.</p>
      <div class="row noprint" style="margin-bottom:10px"><input class="inp" id="cq" placeholder="ابحث برمز المقرر أو اسمه أو عضو هيئة التدريس أو القاعة…" value="${attr(CQ.q)}" oninput="C.cq(this.value)" style="width:320px"><span class="grow"></span>
        <span class="small muted">${list.length} شعبة</span><button class="btn sm" onclick="C.schedExport()">تصدير Excel</button><button class="btn sm" onclick="C.printSched()">طباعة / PDF</button></div>
      <div class="tw"><table><tr><th>الرمز</th><th>المقرر</th><th>س</th><th>الشعبة</th><th>الشطر</th><th>الأيام</th><th>الوقت</th><th>القاعة</th><th>عضو هيئة التدريس</th></tr>
      ${list.map((r) => `<tr><td dir="ltr" style="text-align:end">${esc(r.code)}</td><td>${esc(r.name)}<div class="tiny muted">${esc(r.progName || 'دون برنامج')}</div></td><td class="num">${esc(r.hours)}</td><td>${esc(r.section)}</td><td>${esc(r.gender)}</td><td>${esc(r.days)}</td><td class="num">${esc(r.from)}${r.to ? '–' + esc(r.to) : ''}</td><td>${esc(r.room)}</td>
        <td>${r.fac.map((f, i) => esc(fName(f)) + (r.kinds[i] && r.kinds[i] !== 'رئيسي' ? ` <span class="tiny muted">(${esc(r.kinds[i])})</span>` : '')).join('<br>') || '<span class="muted">—</span>'}</td></tr>`).join('')}</table></div>`;
  }
  C.cq = (v) => { CQ.q = v; CQ._f = true; refresh(); };
  C.schedExport = () => xlsxOut('الجدول المعتمد ' + CQ.term + '.xlsx', [{ name: 'الجدول', head: SCH_HEAD, rows: (S._cur || []).map((r) => [r.code, r.name, r.hours, r.program, uName(r.dept) === '—' ? '' : uName(r.dept), r.section, r.gender, r.days, r.from, r.to, r.room, r.fac.map((f) => (fac(f) || {}).email || '').join('، '), r.fac.map((f) => (fac(f) || {}).employee_no || '').join('، '), r.fac.map(fName).join('، '), r.kinds.join('، ')]) }]);
  C.printSched = () => printNow('الجدول الدراسي المعتمد — ' + ((S.terms.find((t) => t.id === CQ.term) || {}).name || ''));

  /* ---- الاستيراد: اختيار الفصل ← رفع الملف ← معاينة ← مسودة ← اعتماد ---- */
  let IMP = null;
  function schedImport() {
    if (!gcap('import_schedule')) return '<div class="empty">رفع الجداول يحتاج دور «مُعدّ الجداول» أو «معتمد الجداول». يمنحه مدير النظام.</div>';
    const t = S.terms.find((x) => x.id === CQ.term);
    const step = !IMP ? 1 : IMP.vid ? 4 : 3;
    return `<div class="steps">${['تحديد الفصل', 'رفع الملف', 'المعاينة والتحقق', 'المسودة والاعتماد'].map((s, i) => `<div class="${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}">${i + 1}. ${s}</div>`).join('')}</div>
      <div class="panel">${!IMP ? `<p>الفصل المستهدف: <b>${esc(t ? t.name : '—')}</b> (غيّره من القائمة أعلاه).</p>
        <p class="small muted">يُرفع الملف وفق القالب المعتمد: صف لكل شعبة ولكل عضو هيئة تدريس فيها. يُتحقق من رموز المقررات والشعب والأعضاء والحقول الإلزامية والتكرار، ثم تُعرض المعاينة قبل الحفظ. الاستيراد لا يحذف أي إصدار سابق ولا يمس سجلات الاختبارات.</p>
        <div class="row" style="margin-top:12px"><button class="btn sm" onclick="C.schedTemplate()">تنزيل القالب</button></div>
        <label class="f" style="margin-top:12px;max-width:420px">ملف الجدول (XML أنصبة الأعضاء، أو البرش، أو Excel)<input type="file" accept=".xml,.xlsx,.xls,.csv" onchange="C.schedParse(this)"></label>
        <p class="small muted">الأفضل: ملف XML لتقرير أنصبة الأعضاء من النظام الأكاديمي؛ يُطابَق فيه الأعضاء بالرقم الوظيفي.</p>` : impPreview()}</div>`;
  }
  C.schedTemplate = () => xlsxOut('قالب الجدول الدراسي.xlsx', [{ name: 'الجدول', head: SCH_HEAD, rows: [['ACCT 101', 'مبادئ المحاسبة 1', '3', 'بكالوريوس المحاسبة', (deptUnits()[0] || {}).name || '', '1', 'طلاب', 'أحد ثلاثاء', '08:00', '09:15', 'A-101', 'name@ju.edu.sa', '', '', 'رئيسي']] },
    { name: 'طريقة التعبئة', head: ['العمود', 'الوصف'], rows: [['رمز المقرر', 'إلزامي؛ يُوحَّد تلقائيًا (ACCT 101 = ACCT101)'], ['اسم المقرر', 'إلزامي للمقرر الجديد غير الموجود في القاعدة'], ['الشعبة', 'إلزامي'],
      ['عضو هيئة التدريس', 'يُطابق بالبريد الجامعي، ثم الرقم الوظيفي، ثم الاسم إن لم يتكرر. يجب أن يكون مسجلًا في قاعدة الأعضاء'], ['الشعبة بأكثر من عضو', 'كرر صف الشعبة لكل عضو مع «نوع التكليف» (رئيسي، مشارك، عملي)'], ['القسم', deptUnits().map((d) => d.name).join('، ')]] }]);
  const norm = (c) => String(c || '').toUpperCase().replace(/[\s\-_]+/g, '');
  /* بادئة المقرر: حروفه الأولى لاتينية أو عربية (ACCT 101، بشر 521)، كدالة code_prefix في الملف 19 */
  const codePfx = (c) => (norm(c).match(/^([A-Z]+|[ء-ي]+)/) || ['', ''])[1];
  const CODE_RE = /^([A-Z]{2,6}|[ء-ي]{2,5})\s?\d{3,4}[A-Z]?$/i;
  const findFac = (r) => {
    if (r.faculty_email) return S.faculty.find((f) => (f.email || '').toLowerCase() === r.faculty_email.toLowerCase()) || null;
    if (r.faculty_empno) return S.faculty.find((f) => f.employee_no === r.faculty_empno) || null;
    if (r.faculty_name) { const l = S.faculty.filter((f) => f.name_ar === r.faculty_name); return l.length === 1 ? l[0] : l.length > 1 ? 'dup' : null; }
    return undefined;
  };
  /* ---------------------------------------------------------------------
     «البرش» من النظام الأكاديمي (Oracle Reports): ملف .xls هو HTML بترميز windows-1256.
     صفوف السياق «المقر :» و«الدرجة العلمية :»، وصف لكل شعبة (الشعبة = الرقم المرجعي، المقرر، الاسم، س، النوع، النشاط،
     التسلسل، الحد، المسجلون، اليوم، من، إلى، القاعة، المحاضر…)، وصفوف إضافية لمواعيد أخرى للشعبة نفسها،
     وعند فاصل الصفحة قد يسبق صفُّ الموعد صفَّ شعبته. الأيام بالأرقام: 1 الأحد … 5 الخميس.
     --------------------------------------------------------------------- */
  const BR_DAY = { 1: 'أحد', 2: 'اثنين', 3: 'ثلاثاء', 4: 'أربعاء', 5: 'خميس', 6: 'جمعة', 7: 'سبت' };
  const BR_DEPT = { ACCT: 'المحاسبة', FIN: 'التمويل', BUS: 'إدارة الأعمال' };
  /* برنامج المقرر (مثل program_of في الملف 20): ما حدده المسؤول للمقرر يدويًا، وإلا أطول بادئة تطابق بداية الرمز
     (ACCT، أو بشر5 للدبلوم العالي، أو دار6 للماجستير) مع مستوى الدرجة إن عُرف؛ لا قسم من يدرّسه */
  let COURSE_PROG = new Map();   /* رمز المقرر ← برنامجه المحدد يدويًا (courses.program_id) */
  const progMatch = (code, degree) => { const c = norm(code), dg = String(degree || '').trim(), act = (S.programs || []).filter((p) => p.active !== false);
    const ov = COURSE_PROG.get(c), o = ov && act.find((p) => p.id === ov); if (o) return o;
    let best = null, bl = 0; act.forEach((p) => (p.prefixes || []).forEach((pe) => { const k = norm(pe); if (!k || !c.startsWith(k) || (p.degree && dg && p.degree !== dg)) return;
      if (k.length > bl || (k.length === bl && best && ((p.degree ? 1 : 0) > (best.degree ? 1 : 0) || ((!!p.degree === !!best.degree) && (p.sort || 0) < (best.sort || 0))))) { best = p; bl = k.length; } }));
    return best; };
  /* ملف HTML بامتداد xls (كما ينزل البرش من النظام الأكاديمي) */
  const isOracle = (buf) => { const h = new TextDecoder('latin1').decode(buf.slice(0, 6000)); return /<html|<table/i.test(h); };
  /* مفتاح الاسم: دون اللقب (د. أ. أ.د.)، و«بن/بنت» محذوفة، و«أبو زيد/عبد الله» ملتصقة، وهمزات موحدة */
  const nameKey = (s) => { const w = normAr(String(s || '').replace(/^\s*(أ\.?\s*د|ا\.?\s*د|د|أ|م)\s*\.\s*/, '')).split(' ').filter((x) => x && !['بن', 'بنت'].includes(x));
    const out = []; for (let i = 0; i < w.length; i++) { if (['ابو', 'عبد', 'ابن'].includes(w[i]) && w[i + 1]) { out.push(w[i] + w[i + 1]); i++; } else out.push(w[i]); }
    return out.map((x) => (x.length > 4 && x.startsWith('ال') ? x.slice(2) : x)); };   /* «العربي» = «عربي»، بعد ضم «عبد الرحمن» */
  /* المحاضر في البرش باسمه الرباعي دون لقب؛ يُطابق بالاسم كاملًا، أو بأن يكون كل اسم السجل (الأول أولًا) ضمن اسم البرش إن لم يتكرر */
  let ALIAS = new Map();   /* اسم المحاضر كما في النظام الأكاديمي ← سجل العضو (faculty_aliases، الملف 13) */
  const matchLect = (name) => { const k = nameKey(name); if (k.length < 2) return null;
    const al = ALIAS.get(k.join(' ')); if (al && fac(al) && !offF(fac(al))) return fac(al);
    const FL = S.faculty.filter((f) => !offF(f));   /* الموقوف لا يُطابق في جدول جديد */
    const full = FL.filter((f) => nameKey(f.name_ar).join(' ') === k.join(' ')); if (full.length === 1) return full[0];
    const fl = FL.filter((f) => { const t = nameKey(f.name_ar); return t.length >= 2 && t[0] === k[0] && t.slice(1).every((w) => k.includes(w)); });
    if (fl.length === 1) return fl[0];
    /* والعكس: اسم البرش ناقص («مختار معزوز معزوز» = «مختار عبدالله معزوز») */
    const ks = [...new Set(k)]; if (ks.length < 2) return null;
    const rv = FL.filter((f) => { const t = nameKey(f.name_ar); return t[0] === k[0] && ks.every((w) => t.includes(w)); });
    return rv.length === 1 ? rv[0] : null; };
  /* المصدر: ملف البرش الأصلي (ArrayBuffer)، أو مستند HTML من ورقة Excel إن فتحه أحد في Excel وحفظه xlsx */
  function parseBarsh(src) {
    const doc = src instanceof Document ? src : new DOMParser().parseFromString(new TextDecoder(/charset\s*=\s*["']?utf-?8/i.test(new TextDecoder('latin1').decode(src.slice(0, 3000))) ? 'utf-8' : 'windows-1256').decode(src), 'text/html');
    const isTime = (s) => /^\d{1,2}:\d{2}$/.test(s);
    const isName = (s) => /^[؀-ۿ]+( [؀-ۿ]+){2,}$/.test(s) && !/قاعة|كلية|لم تحدد|مقرر|محاضرة/.test(s);
    const secs = [], byKey = new Map(), warn = []; let ctx = { campus: '', degree: '' }, cur = null, pend = null;
    const meet = (sec, m) => { if (!sec || !/^[1-7]$/.test(m[0]) || sec.meet.some((x) => x.day === m[0] && x.from === m[1] && x.to === m[2])) return;
      sec.meet.push({ day: m[0], from: m[1], to: m[2], room: /لم تحدد/.test(m[3] || '') ? '' : (m[3] || '') }); sec.meet.sort((a, b) => a.day - b.day || String(a.from).localeCompare(String(b.from))); };
    doc.querySelectorAll('tr').forEach((tr) => {
      const L = [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean); if (!L.length) return;
      const ci = L.indexOf('المقر :'); if (ci >= 0) { const di = L.indexOf('الدرجة العلمية :'); ctx = { campus: L[ci + 1] || '', degree: di >= 0 ? (L[di + 1] || '') : '' }; return; }
      if (L[0] === 'الشعبة' || L[0] === 'الأيام') return;
      const ti = L.findIndex(isTime);
      if (/^\d+$/.test(L[0]) && CODE_RE.test(L[1] || '')) {
        const key = L[0] + '|' + norm(L[1]);
        cur = byKey.get(key) || { crn: L[0], code: L[1], name: L[2] || '', hours: L[3] || '', act: L[5] || '', enr: (ti >= 3 && /^\d+$/.test(L[ti - 2]) && /^[1-7]$/.test(L[ti - 1]) ? L[ti - 2] : /^\d+$/.test(L[8] || '') && /^\d+$/.test(L[7] || '') ? L[8] : ''), campus: ctx.campus, degree: ctx.degree, meet: [], lect: '' };
        if (!byKey.has(key)) { byKey.set(key, cur); secs.push(cur); }
        if (ti > 0) { meet(cur, [L[ti - 1], L[ti], L[ti + 1], L[ti + 2]]); cur.lect = cur.lect || L.slice(ti + 3).find(isName) || ''; if (pend) { warn.push('موعد في بداية صفحة لم يُعرف لأي شعبة هو: ' + pend.slice(0, 3).join(' ')); pend = null; } }
        else { cur.lect = cur.lect || L.slice(7).find(isName) || ''; if (pend) { meet(cur, pend); pend = null; } }
        return;
      }
      if (ti >= 1) { const m = [L[ti - 1], L[ti], L[ti + 1], L[ti + 2]];
        if (ti >= 2 || L.includes('نعم') || L.includes('لا')) pend = m; else meet(cur, m); }
    });
    const rows = secs.map((s) => {
      const city = (s.campus.match(/ب(\S+)$/) || [])[1] || '', girls = /الطالبات/.test(s.campus);
      /* الأيام: «أحد ثلاثاء» إن اتحدت الأوقات، وإلا لكل يوم وقته: «أحد 08:00-08:50، ثلاثاء 08:00-09:50» */
      const m0 = s.meet[0] || {}, sameT = new Set(s.meet.map((m) => m.from + m.to)).size <= 1;
      const days = sameT ? [...new Set(s.meet.map((m) => BR_DAY[m.day]))].join(' ') : s.meet.map((m) => `${BR_DAY[m.day]} ${m.from}-${m.to}`).join('، ');
      /* قسم المقرر من برنامجه (رمز المقرر + مستوى الدرجة، جدول programs)، وإلا من البادئة */
      const pre = codePfx(s.code), pg = progMatch(s.code, s.degree), dn = BR_DEPT[pre];
      const dep = (pg && deptUnits().find((d) => d.id === pg.department_id)) || (dn && deptUnits().find((d) => d.name.includes(dn)));
      const f = s.lect ? matchLect(s.lect) : null;
      return { course_code: s.code, course_name: s.name, credit_hours: s.hours, program: s.degree, department: dep ? dep.name : '', section: s.crn, campus: s.campus, students: s.enr || '', _lect: s.lect || '',
        gender: (girls ? 'طالبات' : 'طلاب') + (city && city !== 'سكاكا' ? ' - ' + city : ''), days, time_from: m0.from || '', time_to: m0.to || '', room: m0.room || '',
        faculty_email: f && f.email ? f.email : '', faculty_empno: f && !f.email ? (f.employee_no || '') : '', faculty_name: f && !f.email && !f.employee_no ? f.name_ar : '',
        teaching_kind: s.act === 'عملي' ? 'عملي' : 'رئيسي' };
    });
    return { rows, warn };
  }
  /* ---------------------------------------------------------------------
     تقرير أنصبة الأعضاء من النظام الأكاديمي (Oracle Reports XML، SIS_REP121) بترميز UTF-8:
     لكل عضو في كل مقر (G_INSTRUCTOR_NAME: INSTRUCTOR_ID = الرقم الوظيفي، CAMPUS_NAME، DEPT_NAME، FACULTY_NAME)
     شعبه (G_COURSE_CODE: COURSE_CODE، COURSE_NAME، SECTION_SEQ = الرقم المرجعي كما في البرش، CRD_HRS، ENROLLED_STUDENTS، ACTIVITY_DESC،
     TIME_DESC = سطر لكل موعد «اليوم  من - إلى  القاعة»). لا يذكر الدرجة العلمية: تؤخذ من الجدول المعتمد للمقرر نفسه، وإلا من برنامج بادئته.
     العضو يُطابق بالرقم الوظيفي أولًا ثم بالاسم. مقررات الكليات الأخرى (خارج مقررات الكلية وبادئات برامجها) تُترك مع تنبيه.
     --------------------------------------------------------------------- */
  const isSisXml = (buf) => { const h = new TextDecoder('utf-8').decode(buf.slice(0, 600)); return /^\s*(﻿)?<\?xml/.test(h) && /<SIS_REP|<LIST_G_SEMESTER/.test(h); };
  function parseSisXml(buf, ctx) {
    const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(buf), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('تعذرت قراءة ملف XML.');
    const tx = (el, tag) => ((el.getElementsByTagName(tag)[0] || {}).textContent || '').replace(/\s+/g, ' ').trim();
    /* يُستورد كل مقرر في الملف؛ ما لا برنامج له يُنبَّه عنه بعد القراءة (C.schedParse) ويظهر في «دون برنامج» */
    const pfx = codePfx, byKey = new Map(), warn = [], noId = new Map();   /* رقم وظيفي غير موجود ← طوبق بالاسم أم لا */
    [...doc.getElementsByTagName('G_INSTRUCTOR_NAME')].forEach((ins) => {
      const empno = tx(ins, 'INSTRUCTOR_ID'), lect = tx(ins, 'INSTRUCTOR_NAME'), campus = tx(ins, 'CAMPUS_NAME');
      const byNo = empno && S.faculty.find((f) => f.employee_no === empno && !offF(f)), f = byNo || (lect ? matchLect(lect) : null);
      if (!byNo && empno) noId.set(empno, noId.get(empno) || !!f);
      [...ins.getElementsByTagName('G_COURSE_CODE')].forEach((g) => {
        const code = tx(g, 'COURSE_CODE'), c = norm(code);
        if (!c) return;
        const seq = tx(g, 'SECTION_SEQ') || tx(g, 'SECTION'), k = c + '|' + seq + '|' + campus + '|' + (f ? f.id : lect);
        const s = byKey.get(k) || { code, name: tx(g, 'COURSE_NAME'), hours: tx(g, 'CRD_HRS'), seq, campus, lect, f, act: new Set(), meet: [] };
        s.act.add(tx(g, 'ACTIVITY_DESC'));
        ((g.getElementsByTagName('TIME_DESC')[0] || {}).textContent || '').split('\n').forEach((ln) => { const m = ln.match(/^\s*([1-7])\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*(.*?)\s*$/); if (!m) return;
          const mt = { day: m[1], from: m[2].padStart(5, '0'), to: m[3].padStart(5, '0'), room: m[4] }; if (!s.meet.some((x) => x.day === mt.day && x.from === mt.from)) s.meet.push(mt); });
        byKey.set(k, s);
      });
    });
    const rows = [...byKey.values()].map((s) => {
      s.meet.sort((a, b) => a.day - b.day || a.from.localeCompare(b.from));
      const city = (s.campus.match(/ب(\S+)$/) || [])[1] || '', girls = /الطالبات/.test(s.campus);
      const m0 = s.meet[0] || {}, sameT = new Set(s.meet.map((m) => m.from + m.to)).size <= 1;
      const days = sameT ? [...new Set(s.meet.map((m) => BR_DAY[m.day]))].join(' ') : s.meet.map((m) => `${BR_DAY[m.day]} ${m.from}-${m.to}`).join('، ');
      /* الدرجة من برنامج المقرر (اليدوي أو بالبادئة)، وإلا من الجدول المعتمد السابق */
      const pre = pfx(s.code), pm = progMatch(s.code), degree = (pm && pm.degree) || ctx.degree.get(norm(s.code)) || '';
      const pg = pm || progMatch(s.code, degree), dn = BR_DEPT[pre], dep = (pg && deptUnits().find((d) => d.id === pg.department_id)) || (dn && deptUnits().find((d) => d.name.includes(dn))), f = s.f;
      return { course_code: s.code, course_name: s.name, credit_hours: s.hours, program: degree, department: dep ? dep.name : '', section: s.seq, campus: s.campus, _lect: s.lect || '',
        gender: (girls ? 'طالبات' : 'طلاب') + (city && city !== 'سكاكا' ? ' - ' + city : ''), days, time_from: m0.from || '', time_to: m0.to || '', room: m0.room || '',
        faculty_email: f && f.email ? f.email : '', faculty_empno: f && !f.email ? (f.employee_no || '') : '', faculty_name: f && !f.email && !f.employee_no ? f.name_ar : '',
        teaching_kind: s.act.has('محاضرة') || !s.act.has('عملي') ? 'رئيسي' : 'عملي' };
    });
    const byName = [...noId.values()].filter(Boolean).length;
    if (noId.size) warn.push(noId.size + ' عضوًا في الملف ليس رقمهم الوظيفي في قاعدة الأعضاء' + (byName ? '؛ طوبق ' + byName + ' منهم بالاسم' : '') + (noId.size - byName ? '، والباقون (' + (noId.size - byName) + ') في «محاضرون لم يتطابقوا»' : '') + '.');
    return { rows, warn };
  }
  C.schedParse = (input) => busy(null, async () => {
    const file = input.files[0]; const buf = await file.arrayBuffer(); let rows, warn = [];
    ALIAS = new Map((await D.select('faculty_aliases').catch(() => [])).map((a) => [a.alias, a.faculty_id]));
    /* مقررات الكلية المعروفة وبرامجها المحددة يدويًا (الملف 20) */
    const crs = await D.select('courses', { cols: 'code,program_id' }).catch(() => D.select('courses', { cols: 'code' }).catch(() => []));
    COURSE_PROG = new Map(crs.filter((c) => c.program_id).map((c) => [norm(c.code), c.program_id]));
    if (isSisXml(buf)) {
      /* الدرجة العلمية لكل مقرر من آخر جدول معتمد إن لم يُعرف برنامجه */
      const v = await approvedOf(CQ.term).catch(() => null), prev = v ? await versionRows(v.id).catch(() => []) : [];
      const known = new Set(crs.map((c) => norm(c.code)));
      const degree = new Map(); prev.forEach((p) => { if (p.program && !degree.has(p.code)) degree.set(p.code, p.program); });
      const b = parseSisXml(buf, { known, degree }); rows = b.rows; warn = b.warn; if (!rows.length) throw new Error('لم يُعثر على شعب في ملف XML.');
    }
    else if (isOracle(buf)) { const b = parseBarsh(buf); rows = b.rows; warn = b.warn; if (!rows.length) throw new Error('لم يُعثر على شعب في ملف البرش.'); }
    else {
      if (!window.XLSX) throw new Error('مكتبة Excel لم تُحمَّل. تحقق من الاتصال بالإنترنت.');
      const wb = XLSX.read(buf, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }).map((r) => mapRow(r, SCH_MAP)).filter((r) => Object.values(r).some(Boolean));
      /* برش فُتح في Excel وحُفظ بصيغة أخرى: تخطيطه نفسه، فيُقرأ بطريقة البرش */
      if (!rows.some((r) => r.course_code)) { const html = XLSX.utils.sheet_to_html(ws);
        if (/اسم المقرر/.test(html) && /الشعبة/.test(html)) { const b = parseBarsh(new DOMParser().parseFromString(html, 'text/html')); if (b.rows.length) { rows = b.rows; warn = b.warn; } } }
    }
    if (!rows.length) throw new Error('الملف فارغ أو عناوين أعمدته لا تطابق القالب.');
    if (!rows.some((r) => r.course_code)) throw new Error('لم يُعثر على عمود «رمز المقرر». استخدم القالب.');
    /* مقررات بلا برنامج: تُستورد، وتظهر في «البرامج والمنسقون» تحت «دون برنامج» ليُحدَّد برنامجها */
    const noProg = new Map(); rows.forEach((r) => { const c = norm(r.course_code); if (c && !progMatch(c, r.program)) noProg.set(c, r.course_name || ''); });
    if (noProg.size) warn.unshift(noProg.size + ' مقررًا بلا برنامج: ' + [...noProg].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => c + (n ? ' ' + n : '')).join('، ') + '. تُستورد كغيرها، وتجدها بعد الاعتماد في «البرامج والمنسقون ← دون برنامج» لتحدد برنامجها، أو أضف بادئتها إلى برنامج.');
    /* المحاضرون الذين لم يتطابقوا: يختار المستخدم العضو الصحيح قبل الحفظ */
    const um = new Map(); rows.forEach((r) => { if (r._lect && !r.faculty_email && !r.faculty_empno && !r.faculty_name) um.set(r._lect, (um.get(r._lect) || 0) + 1); });
    await impAnalyze(rows, warn, file.name, [...um].map(([name, n]) => ({ name, n, fid: '' })), 'add');
  });
  /* اختيار عضو لمحاضر لم يتطابق: يُطبَّق على كل شعبه ويُحفظ اسمًا بديلًا عند حفظ المسودة */
  C.impLect = (i, fid) => busy(null, async () => { const u = IMP.unm[i]; u.fid = fid; const f = fid && fac(fid);
    IMP.rows.forEach((r) => { if (r._lect !== u.name) return; Object.assign(r, { faculty_email: f && f.email ? f.email : '', faculty_empno: f && !f.email ? (f.employee_no || '') : '', faculty_name: f && !f.email && !f.employee_no ? f.name_ar : '' }); });
    await impAnalyze(IMP.rows, IMP.warn, IMP.file, IMP.unm, 'lect'); });
  async function impAnalyze(rows, warn, fileName, unm, tab) {
    const courses = await D.select('courses', { cols: 'id,code,name_ar' }); const known = new Set(courses.map((c) => c.code));
    const named = new Set(rows.filter((r) => r.course_name).map((r) => norm(r.course_code)));
    const errs = [], seen = new Set(), keyed = new Map();
    rows.forEach((r, i) => {
      const n = i + 2, c = norm(r.course_code);
      if (!c) return errs.push([n, 'رمز المقرر فارغ']);
      if (!r.section) return errs.push([n, 'رقم الشعبة فارغ']);
      if (!known.has(c) && !named.has(c)) return errs.push([n, 'مقرر جديد (' + c + ') دون اسم']);
      const f = findFac(r);
      if (f === 'dup') return errs.push([n, 'اسم العضو مكرر في القاعدة؛ استخدم البريد أو الرقم الوظيفي: ' + r.faculty_name]);
      if (f === null) return errs.push([n, 'عضو هيئة التدريس غير موجود في القاعدة المركزية: ' + (r.faculty_email || r.faculty_empno || r.faculty_name)]);
      const k = c + '|' + (r.program || '') + '|' + r.section + '|' + (f ? f.id : '');
      if (seen.has(k)) return errs.push([n, 'صف مكرر: ' + c + ' شعبة ' + r.section]); seen.add(k);
      const sk = c + '|' + (r.program || '') + '|' + r.section; const e = keyed.get(sk) || { code: c, name: r.course_name, section: r.section, program: r.program || '', campus: r.campus || '', students: String(r.students || ''), days: r.days || '', from: r.time_from || '', to: r.time_to || '', room: r.room || '', fac: [] };
      if (f) e.fac.push(f.id); keyed.set(sk, e);
    });
    const v = await approvedOf(CQ.term); const prev = v ? await versionRows(v.id) : [];
    const pm = new Map(prev.map((p) => [p.code + '|' + p.program + '|' + p.section, p]));
    const added = [], changed = [], same = [];
    keyed.forEach((e, k) => { const p = pm.get(k); if (!p) return added.push(e);
      const d = []; if (e.days && e.days !== p.days) d.push('الأيام'); if (e.from && e.from !== p.from) d.push('الوقت'); if (e.room && e.room !== p.room) d.push('القاعة'); if (e.students && p.students && e.students !== p.students) d.push('عدد الطلاب'); if (e.campus && p.campus && e.campus !== p.campus) d.push('المقر');
      if (e.fac.slice().sort().join() !== p.fac.slice().sort().join()) d.push('عضو هيئة التدريس');
      (d.length ? changed : same).push(Object.assign({ diff: d, prev: p }, e)); });
    const removed = prev.filter((p) => !keyed.has(p.code + '|' + p.program + '|' + p.section));
    IMP = { rows, file: fileName, errs, warn, unm, added, changed, same, removed, prevNo: v ? v.version_no : null, tab: errs.length ? 'err' : unm.some((u) => !u.fid) && tab !== 'lect' ? 'lect' : tab };
    refresh();
  }
  function impPreview() {
    const I = IMP;
    if (I.vid) return impFinal();
    const unm = I.unm || [], open = unm.filter((u) => !u.fid).length;
    const T = Object.assign({ err: ['الأخطاء', I.errs.length] }, unm.length ? { lect: ['محاضرون لم يتطابقوا', open + ' / ' + unm.length] } : {}, (I.warn || []).length ? { warn: ['تنبيهات', I.warn.length] } : {}, { add: ['شعب جديدة', I.added.length] }, { chg: ['شعب معدلة', I.changed.length], rem: ['غير موجودة في الملف', I.removed.length], same: ['دون تغيير', I.same.length] });
    const tbl = (list, f) => list.length ? `<div class="tw"><table>${f(list.slice(0, 300))}</table></div>${list.length > 300 ? '<p class="small muted">يُعرض أول 300 صف.</p>' : ''}` : '<div class="empty">لا شيء.</div>';
    const facOpts = S.faculty.filter((f) => f.status !== 'غير نشط').slice().sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
    const body = I.tab === 'err' ? tbl(I.errs, (l) => '<tr><th>صف الملف</th><th>المشكلة</th></tr>' + l.map((e) => `<tr><td>${e[0]}</td><td>${esc(e[1])}</td></tr>`).join(''))
      : I.tab === 'lect' ? `<p class="small muted">أسماء المحاضرين كما في النظام الأكاديمي ولم تُطابق قاعدة الأعضاء. اختر العضو الصحيح فيُطبَّق على كل شعبه، ويُحفظ الاسم فلا يُسأل عنه في الملف القادم. اتركه «دون محاضر» لمن ليس من أعضاء الكلية؛ تُستورد شعبه دون محاضر.</p>
        <div class="tw"><table><tr><th>الاسم في الملف</th><th>الشعب</th><th>العضو في قاعدة الأعضاء</th></tr>${unm.map((u, i) => `<tr><td>${esc(u.name)}</td><td>${u.n}</td><td><select onchange="C.impLect(${i},this.value)"><option value="">— دون محاضر —</option>${facOpts.map((f) => opt(f.id, f.name_ar + (f.department_id ? ' · ' + uName(f.department_id) : ''), u.fid)).join('')}</select></td></tr>`).join('')}</table></div>`
      : I.tab === 'warn' ? `<p class="small muted">لا تمنع الاستيراد؛ راجعها. المحاضر غير الموجود في قاعدة الأعضاء (مثل أعضاء الكليات الأخرى) تُستورد شعبته دون محاضر.</p>` + tbl(I.warn, (l) => '<tr><th>التنبيه</th></tr>' + l.map((w) => `<tr><td class="small">${esc(w)}</td></tr>`).join(''))
      : I.tab === 'add' ? tbl(I.added, (l) => '<tr><th>المقرر</th><th>الشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th>العضو</th></tr>' + l.map((e) => `<tr><td>${esc(e.code)} ${esc(e.name || '')}</td><td>${esc(e.section)}</td><td>${esc(e.days)} ${esc(e.from)}</td><td>${esc(e.room)}</td><td>${e.fac.map(fName).join('، ') || '—'}</td></tr>`).join(''))
      : I.tab === 'chg' ? tbl(I.changed, (l) => '<tr><th>المقرر</th><th>الشعبة</th><th>ما تغير</th><th>قبل</th><th>بعد</th></tr>' + l.map((e) => `<tr><td>${esc(e.code)}</td><td>${esc(e.section)}</td><td>${esc(e.diff.join('، '))}</td><td class="small">${esc(e.prev.days)} ${esc(e.prev.from)} ${esc(e.prev.room)} · ${e.prev.fac.map(fName).join('، ')}${e.prev.students ? ' · ' + e.prev.students + ' طالب' : ''}${e.diff.includes('المقر') ? ' · ' + esc(e.prev.campus) : ''}</td><td class="small"><b>${esc(e.days)} ${esc(e.from)} ${esc(e.room)} · ${e.fac.map(fName).join('، ')}${e.students ? ' · ' + e.students + ' طالب' : ''}${e.diff.includes('المقر') ? ' · ' + esc(e.campus) : ''}</b></td></tr>`).join(''))
      : I.tab === 'rem' ? `<p class="small muted">هذه الشعب في الجدول المعتمد الحالي وليست في الملف الجديد. بعد الاعتماد لا تُستخدم في أي مكان، وتبقى في «الإصدارات» فقط. وإن ارتبط بها شيء (مثل ملف المقرر لشعبة) يظهر لك تنبيه به بعد حفظ المسودة وقبل الاعتماد.</p>` + tbl(I.removed, (l) => '<tr><th>المقرر</th><th>الشعبة</th><th>العضو</th></tr>' + l.map((e) => `<tr><td>${esc(e.code)} ${esc(e.name)}</td><td>${esc(e.section)}</td><td>${e.fac.map(fName).join('، ')}</td></tr>`).join(''))
      : tbl(I.same, (l) => '<tr><th>المقرر</th><th>الشعبة</th></tr>' + l.map((e) => `<tr><td>${esc(e.code)}</td><td>${esc(e.section)}</td></tr>`).join(''));
    return `<div class="row" style="margin-bottom:10px"><b class="grow">${esc(I.file)}: ${I.rows.length} صف${I.prevNo ? ' · مقارنةً بالإصدار المعتمد ' + I.prevNo : ' · لا يوجد إصدار معتمد سابق لهذا الفصل'}</b><button class="btn sm" onclick="C.impReset()">اختيار ملف آخر</button></div>
      <div class="tabs">${Object.keys(T).map((k) => `<button class="${I.tab === k ? 'on' : ''}" onclick="C.impTab('${k}')">${T[k][0]} (${T[k][1]})</button>`).join('')}</div>${body}
      <div class="row" style="margin-top:16px">${I.errs.length ? `<span class="bad small">صحّح الأخطاء في الملف ثم ارفعه من جديد؛ لا يُقبل ملف فيه أخطاء.</span>` : `<button class="btn pri" onclick="C.impUpload(this)">حفظ كمسودة للمراجعة</button><span class="small muted">لا يتغير الجدول المعتمد حتى تُعتمد المسودة.</span>`}</div>`;
  }
  C.impTab = (k) => { IMP.tab = k; refresh(); };
  C.impReset = () => { IMP = null; refresh(); };
  C.impUpload = (btn) => busy(btn, async () => {
    const al = (IMP.unm || []).filter((u) => u.fid).map((u) => ({ alias: nameKey(u.name).join(' '), faculty_id: u.fid }));
    if (al.length) await D.upsertMany('faculty_aliases', al, 'alias', false).catch((e) => toast('لم تُحفظ الأسماء البديلة: ' + pgErr(e), true));
    const rows = IMP.rows.map((r) => { const o = Object.assign({}, r); delete o._lect; return o; });
    const vid = await D.rpc('sched_upload', { p_term: CQ.term, p_rows: rows, p_source: IMP.file, p_note: '' });
    IMP.vid = vid; IMP.val = await D.rpc('sched_validate', { p_version: vid }); IMP.linked = await D.rpc('sched_linked', { p_version: vid }).catch(() => []); refresh();
  });
  /* ما يبقى تلقائيًا عند اعتماد إصدار جديد، وما يرتبط بالشعب والمقررات التي ستخرج (الملف 21) */
  const KEEP_NOTE = '<div class="note small">يبقى تلقائيًا لكل مقرر: المنسق، وربطه بالبرنامج، وملف المقرر وحالته في البرامج. وما يخص شعبة بعينها ينتقل إلى الشعبة نفسها (برقمها) في الإصدار الجديد.</div>';
  const linkedHtml = (l) => (l && l.length ? `<div class="warn small" style="margin-top:8px"><b>مرتبط بشعب أو مقررات ستخرج من الجدول (${l.length}):</b> يبقى محفوظًا على الإصدار السابق ولا يظهر بعد الاعتماد.<div class="tw" style="max-height:220px;margin-top:6px"><table><tr><th>المقرر</th><th>الشعبة</th><th>المرتبط بها</th></tr>${l.map((x) => `<tr><td>${esc(x.code)} ${esc(x.name || '')}</td><td>${esc(x.section || 'المقرر كاملًا')}</td><td>${esc((x.what || []).map((t) => reqCols().reduce((s, c) => s.replace('(' + c.kind + ')', '(' + c.name + ')'), t)).join('، '))}</td></tr>`).join('')}</table></div></div>` : '');
  function impFinal() {
    const v = IMP.val || { errors: [] };
    return `<h3>حُفظت المسودة</h3><p>تحقق الخادم من ${v.rows} صف: ${v.errors.length ? `<span class="bad">${v.errors.length} خطأ</span>` : '<span class="good">لا توجد أخطاء</span>'}، ومقررات جديدة: ${v.new_courses}.</p>
      ${v.errors.length ? `<div class="tw"><table><tr><th>الصف</th><th>المشكلة</th></tr>${v.errors.map((e) => `<tr><td>${e.row}</td><td>${esc(e.msg)}</td></tr>`).join('')}</table></div>` : ''}
      ${KEEP_NOTE}${linkedHtml(IMP.linked)}
      <div class="row" style="margin-top:14px">${gcap('approve_import') && !v.errors.length ? `<button class="btn pri" onclick="C.verApprove('${IMP.vid}',this)">اعتماد الإصدار الآن</button>` : '<span class="small muted">المسودة بانتظار اعتماد «معتمد الجداول» من تبويب الإصدارات.</span>'}
        <button class="btn" onclick="C.impReset()">استيراد ملف آخر</button></div>`;
  }
  async function schedVersions() {
    const vs = (await D.select('sched_versions', { eq: { term_id: CQ.term }, cols: 'id,version_no,status,source_name,stats,note,imported_at,imported_by,approved_at,approved_by' })).sort((a, b) => b.version_no - a.version_no);
    if (!vs.length) return '<div class="empty">لا توجد إصدارات لهذا الفصل.</div>';
    return `<p class="small muted">كل استيراد يُنشئ إصدارًا جديدًا. عند اعتماد إصدار يصبح السابق «سابقًا» ويبقى محفوظًا بشعبه وتكليفاته.</p>
      <div class="tw"><table><tr><th>الإصدار</th><th>الحالة</th><th>الملف</th><th>رُفع</th><th>اعتُمد</th><th>الشعب</th><th></th></tr>
      ${vs.map((v) => `<tr><td class="num">${v.version_no}</td><td>${chip(VSTAT[v.status][0], VSTAT[v.status][1])}</td><td>${esc(v.source_name)}${v.note ? `<div class="tiny muted">${esc(v.note)}</div>` : ''}</td>
        <td class="small">${fmtDT(v.imported_at)}<br>${esc(pName(v.imported_by))}</td><td class="small">${v.approved_at ? fmtDT(v.approved_at) + '<br>' + esc(pName(v.approved_by)) : '—'}</td>
        <td class="num">${(v.stats || {}).sections || '—'}</td>
        <td class="row">${v.status === 'draft' ? `<button class="btn sm" onclick="C.verCheck('${v.id}',this)">التحقق</button>${gcap('approve_import') ? `<button class="btn sm pri" onclick="C.verApprove('${v.id}',this)">اعتماد</button>` : ''}<button class="btn sm danger" onclick="C.verReject('${v.id}')">رفض</button>` : ''}
          ${['approved', 'superseded'].includes(v.status) ? `<button class="btn sm" onclick="C.verView('${v.id}',${v.version_no})">عرض</button>` : ''}</td></tr>`).join('')}</table></div>`;
  }
  C.verCheck = (id, btn) => busy(btn, async () => { const v = await D.rpc('sched_validate', { p_version: id });
    modal('نتيجة التحقق', `<p>${v.rows} صف · مقررات جديدة ${v.new_courses} · ${v.errors.length ? `<span class="bad">${v.errors.length} خطأ</span>` : '<span class="good">جاهز للاعتماد</span>'}</p>${v.errors.length ? `<div class="tw"><table><tr><th>الصف</th><th>المشكلة</th></tr>${v.errors.map((e) => `<tr><td>${e.row}</td><td>${esc(e.msg)}</td></tr>`).join('')}</table></div>` : ''}`); });
  C.verApprove = async (id, btn) => {
    const lk = await D.rpc('sched_linked', { p_version: id }).catch(() => []);
    if (!(await confirmBox('اعتماد الجدول', '<p>سيصبح هذا الإصدار الجدول المعتمد للفصل وحده، ويتحول الإصدار المعتمد الحالي إلى «سابق» يبقى في «الإصدارات». تُضاف المقررات الجديدة إلى القاعدة. هل تعتمد؟</p>' + KEEP_NOTE + linkedHtml(lk), 'اعتماد الإصدار'))) return;
    await busy(btn, async () => { const r = await D.rpc('sched_approve', { p_version: id }); IMP = null; CQ.tab = 'current'; refresh(); toast('اعتُمد الجدول: ' + r.sections + ' شعبة و' + r.teaching + ' تكليف تدريس' + (r.moved ? '، ونُقل ' + r.moved + ' ملخص شعبة إلى الإصدار الجديد' : '') + (r.orphans ? '، وبقي ' + r.orphans + ' ملخصًا على شعب خرجت من الجدول' : '') + '.', !!r.orphans); });
  };
  C.verReject = async (id) => {
    modal('رفض المسودة', `<label class="f">السبب<input id="rjN" maxlength="200"></label><div class="err"></div>`, `<button class="btn danger" id="rjOk">رفض المسودة</button><button class="btn" onclick="C.close()">تراجع</button>`);
    $('#rjOk').onclick = (ev) => busy(ev.target, async () => { await D.rpc('sched_reject', { p_version: id, p_note: val('rjN') }); C.close(); refresh(); toast('رُفضت المسودة.'); });
  };
  C.verView = (id, no) => busy(null, async () => { const rows = await versionRows(id);
    modal('الإصدار ' + no, `<div class="tw"><table><tr><th>المقرر</th><th>الشعبة</th><th>الأيام</th><th>الوقت</th><th>القاعة</th><th>العضو</th></tr>${rows.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td>${esc(r.section)}</td><td>${esc(r.days)}</td><td>${esc(r.from)}</td><td>${esc(r.room)}</td><td>${r.fac.map(fName).join('، ')}</td></tr>`).join('')}</table></div>`, null, true); });

  async function coursesTab() {
    const cs = (await D.select('courses')).sort((a, b) => a.code.localeCompare(b.code)); S._courses = cs;
    S.programs = await D.select('programs', { order: ['sort'] }).catch(() => S.programs || []);
    const ed = gcap('approve_import');
    return `<div class="row" style="margin-bottom:10px"><span class="small muted grow">${cs.length} مقرر. تُضاف المقررات تلقائيًا عند اعتماد جدول فيه مقرر جديد، أو يدويًا من هنا.</span>
      <button class="btn sm" onclick="C.courseExport()">تصدير Excel</button>${ed ? '<button class="btn sm pri" onclick="C.courseEdit()">إضافة مقرر</button>' : ''}</div>
      ${cs.length ? `<div class="tw"><table><tr><th>الرمز</th><th>اسم المقرر</th><th>الساعات المعتمدة</th><th>القسم</th><th>الحالة</th></tr>${cs.map((c) => `<tr ${ed ? `class="click" onclick="C.courseEdit('${c.id}')"` : ''}><td dir="ltr" style="text-align:end">${esc(c.code)}</td><td>${esc(c.name_ar)}${c.name_en ? `<div class="tiny muted">${esc(c.name_en)}</div>` : ''}</td><td class="num">${esc(c.credit_hours)}</td><td>${esc(uName(c.department_id))}</td><td>${c.active ? chip('مطروح', 'ok') : chip('موقوف')}</td></tr>`).join('')}</table></div>` : '<div class="empty">لا توجد مقررات بعد.</div>'}`;
  }
  C.courseExport = () => xlsxOut('المقررات.xlsx', [{ name: 'المقررات', head: ['الرمز', 'الاسم', 'الاسم بالإنجليزية', 'الساعات المعتمدة', 'القسم', 'الحالة'], rows: (S._courses || []).map((c) => [c.code, c.name_ar, c.name_en, c.credit_hours, uName(c.department_id), c.active ? 'مطروح' : 'موقوف']) }]);
  C.courseEdit = (id) => {
    const c = id ? S._courses.find((x) => x.id === id) : { code: '', name_ar: '', name_en: '', credit_hours: 3, department_id: '', active: true };
    modal(id ? 'تعديل مقرر' : 'إضافة مقرر', `<div class="formgrid"><label class="f">رمز المقرر<input id="cc" value="${attr(c.code)}" dir="ltr" ${id ? 'disabled' : ''}></label>
      <label class="f">الساعات المعتمدة<input id="ch" type="number" min="0" max="20" step="0.5" value="${attr(c.credit_hours)}"></label>
      <label class="f full">اسم المقرر<input id="cn" value="${attr(c.name_ar)}"></label><label class="f full">الاسم بالإنجليزية<input id="ce" value="${attr(c.name_en)}" dir="ltr"></label>
      <label class="f">القسم<select id="cd"><option value="">—</option>${deptUnits().map((d) => opt(d.id, d.name, c.department_id)).join('')}</select></label>
      <label class="f">الحالة<select id="ca">${opt('1', 'مطروح', c.active ? '1' : '0')}${opt('0', 'موقوف', c.active ? '1' : '0')}</select></label>
      <label class="f full">البرنامج<select id="cp"><option value="">تلقائي من بادئة الرمز</option>${(S.programs || []).filter((p) => p.active !== false).map((p) => opt(p.id, p.name, c.program_id || '')).join('')}</select></label></div><div class="err"></div>`,
      `<button class="btn pri" id="cOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#cOk').onclick = (ev) => busy(ev.target, async () => {
      const row = { name_ar: val('cn'), name_en: val('ce'), credit_hours: Number(val('ch')) || 0, department_id: val('cd') || null, active: val('ca') === '1', program_id: val('cp') || null };
      if (!row.name_ar) throw new Error('اسم المقرر مطلوب.');
      if (id) await D.update('courses', row, { eq: { id } }); else { const code = norm(val('cc')); if (!code) throw new Error('رمز المقرر مطلوب.'); await D.insert('courses', Object.assign({ code }, row)); }
      C.close(); refresh(); toast('حُفظ المقرر.');
    });
  };
  function termsTab() {
    const ed = gcap('approve_import');
    return `<div class="row" style="margin-bottom:10px"><span class="grow small muted">الفصل «الحالي» هو الافتراضي في الشاشات والتقارير.</span>${ed ? '<button class="btn sm pri" onclick="C.termAdd()">إضافة فصل</button>' : ''}</div>
      ${S.terms.length ? `<div class="tw"><table><tr><th>الرمز</th><th>الفصل</th><th>العام الجامعي</th><th></th></tr>${S.terms.slice().reverse().map((t) => `<tr><td>${esc(t.id)}</td><td>${esc(t.name)} ${t.is_current ? chip('الحالي', 'ok') : ''}</td><td>${esc(t.year)}</td><td>${ed && !t.is_current ? `<button class="btn sm" onclick="C.termCurrent('${t.id}',this)">جعله الحالي</button>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">لا توجد فصول.</div>'}`;
  }
  C.termAdd = () => {
    modal('إضافة فصل دراسي', `<div class="formgrid"><label class="f">العام الجامعي (هجري)<input id="ty" placeholder="1448" inputmode="numeric" maxlength="4"></label>
      <label class="f">الفصل<select id="tt">${['الأول', 'الثاني', 'الصيفي'].map((x) => opt(x, x)).join('')}</select></label></div><div class="err"></div>`,
      `<button class="btn pri" id="tOk">إضافة</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#tOk').onclick = (ev) => busy(ev.target, async () => {
      const y = val('ty'), t = val('tt'); if (!/^\d{4}$/.test(y)) throw new Error('اكتب العام الجامعي بأربعة أرقام.');
      const n = { 'الأول': 1, 'الثاني': 2, 'الصيفي': 3 }[t];
      await D.insert('terms', { id: y + '-' + n, year: y, term: t, name: 'الفصل ' + t + ' ' + y + 'هـ', is_current: false });
      S.terms = await D.select('terms', { order: ['id'] }); C.close(); refresh(); toast('أُضيف الفصل.');
    });
  };
  C.termCurrent = (id, btn) => busy(btn, async () => {
    const cur = S.terms.find((t) => t.is_current); if (cur) await D.update('terms', { is_current: false }, { eq: { id: cur.id } });
    await D.update('terms', { is_current: true }, { eq: { id } }); S.terms = await D.select('terms', { order: ['id'] }); CQ.term = id; refresh(); toast('تغير الفصل الحالي.');
  });

  /* =====================================================================
     الحسابات والصلاحيات (مدير النظام فقط — والخادم يتحقق من ذلك أيضًا)
     ===================================================================== */
  const AQ = { tab: 'accounts', q: '' };
  async function pgAccounts() {
    if (!isAdmin()) return '<div class="panel">هذه الصفحة لمدير النظام.</div>';
    const tabs = [['accounts', 'الحسابات'], ['grants', 'منح الأدوار'], ['roles', 'الأدوار'], ['excl', 'الاستثناءات']];
    let body = AQ.tab === 'accounts' ? accountsTab() : AQ.tab === 'grants' ? grantsTab() : AQ.tab === 'roles' ? rolesTab() : await exclTab();
    return `<div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${AQ.tab === t[0]}" class="${AQ.tab === t[0] ? 'on' : ''}" onclick="C.aTab('${t[0]}')">${t[1]}</button>`).join('')}</div>${body}`;
  }
  C.aTab = (t) => { AQ.tab = t; refresh(); };
  function accountsTab() {
    const q = AQ.q.trim();
    const list = S.faculty.filter((f) => !q || f.name_ar.includes(q) || (f.email || '').includes(q)).sort((a, b) => (!!a.profile_app_id - !!b.profile_app_id) || a.name_ar.localeCompare(b.name_ar, 'ar'));
    const linked = new Set(S.faculty.map((f) => f.profile_app_id).filter(Boolean));
    const orphans = S.profiles.filter((p) => !linked.has(p.app_id));
    VIEW.after = () => { const i = $('#aq'); if (i && AQ._f) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); AQ._f = false; } };
    return `<div class="note" style="margin-bottom:12px">إنشاء الحسابات من هنا فقط، ولا يوجد تسجيل ذاتي. الحساب يُربط بالبريد الجامعي وبسجل العضو في القاعدة المركزية، ولا يمنح أي صلاحية إدارية؛ الصلاحيات تُمنح من تبويب «منح الأدوار» أو بالتكليف في الهيكل. كلمة المرور الأولية عشوائية، وتُخزَّن مشفّرة لدى Supabase، ويُطلب تغييرها عند أول دخول.</div>
      <div class="row" style="margin-bottom:10px"><input class="inp" id="aq" placeholder="ابحث بالاسم أو البريد…" value="${attr(AQ.q)}" oninput="C.aq(this.value)" style="width:260px"></div>
      <div class="tw"><table><tr><th>عضو هيئة التدريس</th><th>البريد الجامعي</th><th>الحساب</th><th>الأدوار الممنوحة</th><th></th></tr>
      ${list.map((f) => { const p = f.profile_app_id && prof(f.profile_app_id); const gs = p ? S.grants.filter((g) => g.profile_app_id === p.app_id) : [];
        return `<tr><td>${esc(f.name_ar)}<div class="tiny muted">${esc(uName(f.department_id))}</div></td><td dir="ltr" style="text-align:end">${esc(f.email || '—')}</td>
        <td>${p ? `${esc(p.username)} ${p.active ? chip('نشط', 'ok') : chip('معطل', 'bad')}${p.is_admin ? ' ' + chip('مدير النظام', 'brass') : ''}` : '<span class="muted small">لا يوجد</span>'}</td>
        <td class="small">${gs.map((g) => esc(((S.roles.find((r) => r.key === g.role_key) || {}).name || g.role_key) + ' · ' + uName(g.unit_id))).join('<br>') || '—'}</td>
        <td class="row">${p ? `${p.app_id !== S.me.app_id ? `<button class="btn sm" onclick="C.accToggle('${p.app_id}',${!p.active},this)">${p.active ? 'تعطيل' : 'إعادة تفعيل'}</button>` : ''}<button class="btn sm" onclick="C.accReset('${p.app_id}')">كلمة مرور جديدة</button><button class="btn sm pri" onclick="C.perms('${f.id}')">الصلاحيات</button>`
          : `<button class="btn sm pri" onclick="C.accCreate('${f.id}')" ${f.email ? '' : 'disabled title="أضف البريد الجامعي للعضو أولًا"'}>إنشاء حساب</button><button class="btn sm" onclick="C.perms('${f.id}')">الصفات في الجهات</button>`}</td></tr>`; }).join('')}</table></div>
      ${orphans.length ? `<h2 style="margin:22px 0 8px">حسابات غير مرتبطة بعضو هيئة تدريس</h2><p class="small muted">حسابات ليس لها سجل في قاعدة الأعضاء (مثل حساب مدير النظام). اربط كل حساب بسجل صاحبه حتى تظهر تكليفاته ومقرراته وتسري صلاحيات تكليفه.</p>
        <div class="tw"><table><tr><th>الاسم</th><th>اسم المستخدم</th><th>الحالة</th><th></th></tr>${orphans.map((p) => `<tr><td>${esc(p.name)}</td><td dir="ltr" style="text-align:end">${esc(p.username)}</td><td>${p.active ? chip('نشط', 'ok') : chip('معطل', 'bad')}</td>
          <td class="row"><select class="inp" id="lk_${attr(p.app_id)}">${facOptions('', '— اختر العضو —', S.faculty.filter((f) => !f.profile_app_id))}</select><button class="btn sm" onclick="C.accLink('${p.app_id}',this)">ربط</button></td></tr>`).join('')}</table></div>` : ''}`;
  }
  C.aq = (v) => { AQ.q = v; AQ._f = true; refresh(); };
  const showPass = (title, who, pass) => modal(title, `<p>كلمة المرور الأولية لـ <b>${esc(who)}</b>:</p><div class="pwbox" id="pwb">${esc(pass)}</div>
    <p class="small muted" style="margin-top:10px">لن تظهر مرة أخرى. سلّمها لصاحبها عبر قناة معتمدة (البريد الجامعي أو شخصيًا)، ولا ترسلها مع اسم المستخدم في رسالة واحدة عامة. سيُطلب منه تغييرها عند أول دخول.</p>`,
    `<button class="btn pri" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('pwb').textContent).then(()=>C.toast('نُسخت كلمة المرور'))">نسخ</button><button class="btn" onclick="C.close()">تم</button>`);
  C.toast = toast;
  C.accCreate = (fid) => {
    const f = fac(fid); const un = (f.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    modal('إنشاء حساب: ' + f.name_ar, `<div class="formgrid"><label class="f">البريد الجامعي (للدخول)<input id="acE" value="${attr(f.email)}" dir="ltr" disabled></label>
      <label class="f">اسم المستخدم<input id="acU" value="${attr(un)}" dir="ltr" maxlength="40"></label></div>
      <p class="small muted">يُنشأ الحساب بكلمة مرور عشوائية تظهر لك مرة واحدة. لن يُمنح الحساب أي دور تلقائيًا.</p><div class="err"></div>`,
      `<button class="btn pri" id="acOk">إنشاء الحساب</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#acOk').onclick = (ev) => busy(ev.target, async () => {
      const u = val('acU').toLowerCase(); if (!/^[a-z0-9._-]{3,}$/.test(u)) throw new Error('اسم المستخدم بالأحرف الإنجليزية والأرقام، 3 أحرف على الأقل.');
      const pass = genPass();
      const r = await D.fn({ action: 'create', username: u, password: pass, email: f.email, name: f.name_ar, title: f.rank || '' });
      if (!r || r.error) throw new Error((r && r.error) || 'تعذر إنشاء الحساب.');
      await D.update('faculty', { profile_app_id: r.appId }, { eq: { id: fid } });
      [S.faculty, S.profiles] = await Promise.all([D.select('faculty'), D.select('profiles', { cols: 'app_id,username,name,email,is_admin,college_role,active' })]);
      refresh(); showPass('أُنشئ الحساب', f.name_ar, pass);
    });
  };
  C.accToggle = async (appId, on, btn) => {
    if (!on && !(await confirmBox('تعطيل الحساب', `<p>لن يستطيع ${esc(pName(appId))} الدخول حتى يُعاد تفعيله. تبقى سجلاته وتكليفاته كما هي.</p>`, 'تعطيل', true))) return;
    await busy(btn, async () => { const r = await D.fn({ action: 'update', appId, active: on }); if (!r || r.error) throw new Error((r && r.error) || 'تعذر التعديل.');
      S.profiles = await D.select('profiles', { cols: 'app_id,username,name,email,is_admin,college_role,active' }); refresh(); toast(on ? 'أُعيد تفعيل الحساب.' : 'عُطّل الحساب.'); });
  };
  C.accReset = async (appId) => {
    if (!(await confirmBox('كلمة مرور جديدة', `<p>ستُنشأ كلمة مرور مؤقتة جديدة لـ ${esc(pName(appId))}، وتتوقف القديمة فورًا.</p>`, 'إنشاء كلمة مرور'))) return;
    await busy(null, async () => { const pass = genPass(); const r = await D.fn({ action: 'update', appId, password: pass }); if (!r || r.error) throw new Error((r && r.error) || 'تعذر التعديل.'); showPass('كلمة مرور جديدة', pName(appId), pass); });
  };
  C.accLink = (appId, btn) => busy(btn, async () => {
    const fid = val('lk_' + appId); if (!fid) throw new Error('اختر العضو.');
    await D.update('faculty', { profile_app_id: appId }, { eq: { id: fid } }); S.faculty = await D.select('faculty'); refresh(); toast('رُبط الحساب بالعضو.');
  });
  function grantsTab() {
    const gs = S.grants.slice().sort((a, b) => pName(a.profile_app_id).localeCompare(pName(b.profile_app_id), 'ar'));
    return `<div class="row" style="margin-bottom:10px"><span class="grow small muted">الدور يُمنح لمستخدم على جهة محددة (ومع فروعها اختياريًا) ولمدة محددة. مسؤول الجهة وأعضاؤها يحصلون على صلاحيات جهتهم بالتكليف في الهيكل دون منح إضافي.</span><button class="btn pri sm" onclick="C.grantNew()">منح دور</button></div>
      ${gs.length ? `<div class="tw"><table><tr><th>المستخدم</th><th>الدور</th><th>الجهة</th><th>النطاق</th><th>المدة</th><th></th></tr>
      ${gs.map((g) => { const on = (!g.start_date || g.start_date <= today()) && (!g.end_date || g.end_date >= today());
        return `<tr><td>${esc(pName(g.profile_app_id))}</td><td>${esc((S.roles.find((r) => r.key === g.role_key) || {}).name || g.role_key)}</td><td>${esc(uName(g.unit_id))}</td>
        <td class="small">${g.include_children ? 'الجهة وفروعها' : 'الجهة فقط'}</td><td class="small">${fmtD(g.start_date)} ← ${g.end_date ? fmtD(g.end_date) : 'مفتوح'} ${on ? '' : chip('غير سارٍ', 'wait')}</td>
        <td class="row">${on ? `<button class="btn sm" onclick="C.grantEnd('${g.id}')">إنهاء اليوم</button>` : ''}<button class="btn sm danger" onclick="C.grantDel('${g.id}')">حذف</button></td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد أدوار ممنوحة.</div>'}`;
  }
  C.grantNew = (appId) => {
    modal('منح دور', `<div class="formgrid">
      <label class="f">المستخدم<select id="gU">${S.profiles.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((p) => opt(p.app_id, p.name + ' (' + p.username + ')', appId)).join('')}</select></label>
      <label class="f">الدور<select id="gR">${S.roles.map((r) => opt(r.key, r.name)).join('')}</select></label>
      <label class="f full">الجهة<select id="gN">${unitOptions('deanship')}</select></label>
      <label class="f full row" style="flex-direction:row;gap:6px"><input type="checkbox" id="gC" checked>يسري على فروع الجهة أيضًا</label>
      <label class="f">من تاريخ (اختياري)<input type="date" id="gS"></label><label class="f">حتى تاريخ (اختياري)<input type="date" id="gE"></label>
      <label class="f full">ملاحظة أو رقم القرار<input id="gT" maxlength="200"></label></div>
      <div class="note" id="gCaps" style="margin-top:10px"></div><div class="err"></div>`,
      `<button class="btn pri" id="gOk">منح الدور</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    const showCaps = () => { const r = S.roles.find((x) => x.key === val('gR')); $('#gCaps').textContent = 'يمنح: ' + (Object.keys(r.caps || {}).filter((k) => r.caps[k]).map((k) => CAPS[k] || k).join('، ') || 'لا شيء'); };
    $('#gR').onchange = showCaps; showCaps();
    $('#gOk').onclick = (ev) => busy(ev.target, async () => {
      if (val('gE') && val('gS') && val('gE') < val('gS')) throw new Error('تاريخ النهاية قبل البداية.');
      await D.insert('org_grants', { profile_app_id: val('gU'), role_key: val('gR'), unit_id: val('gN'), include_children: val('gC'), start_date: val('gS') || null, end_date: val('gE') || null, note: val('gT') });
      S.grants = await D.select('org_grants'); C.close(); refresh(); toast('مُنح الدور.');
      notify([val('gU')], 'مُنحت دورًا جديدًا في نظام إدارة الكلية.');
    });
  };
  C.grantEnd = (id) => busy(null, async () => { await D.update('org_grants', { end_date: today() }, { eq: { id } }); S.grants = await D.select('org_grants'); refresh(); toast('انتهى الدور بتاريخ اليوم.'); });
  C.grantDel = async (id) => { if (!(await confirmBox('حذف المنح', '<p>الأفضل إنهاء الدور بتاريخ للاحتفاظ بالسجل. الحذف يبقى مسجلًا في سجل التدقيق. هل تحذف؟</p>', 'حذف', true))) return;
    await busy(null, async () => { await D.remove('org_grants', { eq: { id } }); S.grants = await D.select('org_grants'); refresh(); toast('حُذف المنح.'); }); };
  function rolesTab() {
    return `<p class="small muted">أدوار افتراضية قابلة للضبط. تعديل صلاحيات دور ينطبق على كل من مُنح هذا الدور. مدير النظام له كل الصلاحيات دائمًا.</p>
      <div class="tw"><table><tr><th>الدور</th>${Object.keys(CAPS).map((k) => `<th class="small">${CAPS[k]}</th>`).join('')}<th></th></tr>
      ${S.roles.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="tiny muted" dir="ltr" style="text-align:end">${esc(r.key)}</div></td>${Object.keys(CAPS).map((k) => `<td style="text-align:center"><input type="checkbox" aria-label="${attr(r.name + ': ' + CAPS[k])}" ${r.caps && r.caps[k] ? 'checked' : ''} onchange="C.roleCap('${r.key}','${k}',this.checked,this)"></td>`).join('')}
        <td>${r.builtin ? '' : `<button class="btn sm danger" onclick="C.roleDel('${r.key}')">حذف</button>`}</td></tr>`).join('')}</table></div>
      <div class="row" style="margin-top:12px"><input class="inp" id="rnN" placeholder="اسم دور جديد"><input class="inp" id="rnK" placeholder="المعرّف بالإنجليزية" dir="ltr"><button class="btn sm pri" onclick="C.roleAdd(this)">إضافة دور</button></div>`;
  }
  C.roleCap = (key, c, on, el) => busy(null, async () => { const r = S.roles.find((x) => x.key === key); const caps = Object.assign({}, r.caps, { [c]: on }); if (!on) delete caps[c];
    try { await D.update('org_roles', { caps }, { eq: { key } }); r.caps = caps; toast('حُدّث الدور «' + r.name + '».'); } catch (e) { el.checked = !on; throw e; } });
  C.roleAdd = (btn) => busy(btn, async () => { const n = val('rnN'), k = val('rnK').toLowerCase(); if (!n || !/^[a-z][a-z0-9_]{2,}$/.test(k)) throw new Error('اكتب اسم الدور ومعرّفًا إنجليزيًا (3 أحرف على الأقل).');
    await D.insert('org_roles', { key: k, name: n, caps: { read: true }, sort: 200, builtin: false }); S.roles = await D.select('org_roles', { order: ['sort'] }); refresh(); toast('أُضيف الدور.'); });
  C.roleDel = async (key) => { if (S.grants.some((g) => g.role_key === key)) return toast('الدور ممنوح لمستخدمين؛ أنهِ المنح أولًا.', true);
    if (!(await confirmBox('حذف الدور', '<p>حذف هذا الدور؟</p>', 'حذف', true))) return; await busy(null, async () => { await D.remove('org_roles', { eq: { key } }); S.roles = await D.select('org_roles', { order: ['sort'] }); refresh(); }); };
  async function exclTab() {
    const ex = await D.select('org_exclusions');
    return `<p class="small muted">تُنشأ عند نقل جهة إذا لم تؤكد سريان صلاحية موروثة عليها. حذف الاستثناء يعيد سريان الصلاحية.</p>
      ${ex.length ? `<div class="tw"><table><tr><th>المستخدم والدور</th><th>عبر</th><th>لا يسري على</th><th>تاريخه</th><th></th></tr>${ex.map((e) => { const g = S.grants.find((x) => x.id === e.grant_id) || {};
        return `<tr><td>${esc(pName(g.profile_app_id))} · ${esc((S.roles.find((r) => r.key === g.role_key) || {}).name || '')}</td><td>${esc(uName(g.unit_id))}</td><td>${esc(uName(e.unit_id))}</td><td class="small">${fmtDT(e.created_at)}</td>
        <td><button class="btn sm" onclick="C.exclDel('${e.grant_id}','${e.unit_id}')">إعادة السريان</button></td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد استثناءات.</div>'}`;
  }
  C.exclDel = (g, u) => busy(null, async () => { await D.remove('org_exclusions', { eq: { grant_id: g, unit_id: u } }); const a = await D.rpc('org_my_access'); S.acc = a.units; refresh(); toast('أُعيد سريان الصلاحية.'); });

  /* =====================================================================
     التقارير
     ===================================================================== */
  const RQ = { r: 'faculty', dept: '', term: null, kind: '' };
  const REPORTS = { faculty: 'أعضاء هيئة التدريس', load: 'العبء التدريسي', assign: 'التكليفات في الوحدات واللجان', tasks: 'المهام والطلبات حسب الجهة', structure: 'الهيكل التنظيمي' };
  let REP = { head: [], rows: [] };
  async function pgReports() {
    if (!gcap('reports')) return '<div class="panel">التقارير تحتاج صلاحية «التقارير».</div>';
    RQ.term = RQ.term || (curTerm() || {}).id;
    /* الملف 32: صاحب المنصب يرى نطاقه؛ وصاحب دور «التقارير» الممنوح والعميد يرون الكلية */
    const own = S.grants.some((g) => g.profile_app_id === S.me.app_id && activeM({ start_date: g.start_date || '0', end_date: g.end_date }) && ((S.roles.find((r) => r.key === g.role_key) || {}).caps || {}).reports);
    const scope = isLeader() && !own && !leadScope().all ? leadScope().set : null, inU = (id) => !scope || scope.has(id), inF = (f) => !scope || (!!f && (scope.has(f.department_id) || S.members.some((m) => m.faculty_id === f.id && activeM(m) && scope.has(m.unit_id))));
    const ctrl = `<div class="row noprint" style="margin-bottom:12px"><select class="inp" onchange="C.rq('r',this.value)" aria-label="التقرير">${Object.keys(REPORTS).map((k) => opt(k, REPORTS[k], RQ.r)).join('')}</select>
      ${['faculty', 'load'].includes(RQ.r) ? `<select class="inp" onchange="C.rq('dept',this.value)" aria-label="القسم"><option value="">${scope ? 'كل النطاق' : 'كل الأقسام'}</option>${deptUnits().filter((d) => inU(d.id)).map((d) => opt(d.id, d.name, RQ.dept)).join('')}</select>` : ''}
      ${RQ.r === 'load' ? `<select class="inp" onchange="C.rq('term',this.value)" aria-label="الفصل">${S.terms.slice().reverse().map((t) => opt(t.id, t.name, RQ.term)).join('')}</select>` : ''}
      ${['assign', 'tasks'].includes(RQ.r) ? `<select class="inp" onchange="C.rq('kind',this.value)" aria-label="نوع الجهة"><option value="">كل الجهات</option>${opt('unit', 'الوحدات', RQ.kind)}${opt('committee', 'اللجان', RQ.kind)}${opt('department', 'الأقسام', RQ.kind)}</select>` : ''}
      <span class="grow"></span><button class="btn sm" onclick="C.repXlsx()">تصدير Excel</button><button class="btn sm" onclick="C.repPrint()">طباعة / PDF</button></div>`;
    let head = [], rows = [], summary = '';
    if (RQ.r === 'faculty') {
      const l = S.faculty.filter((f) => inF(f) && (!RQ.dept || f.department_id === RQ.dept)).sort((a, b) => uName(a.department_id).localeCompare(uName(b.department_id), 'ar') || a.name_ar.localeCompare(b.name_ar, 'ar'));
      head = ['الاسم', 'الرتبة', 'التخصص', 'القسم', 'الحالة', 'التكليفات السارية'];
      rows = l.map((f) => [f.name_ar, f.rank, f.specialty, uName(f.department_id), f.status, S.members.filter((m) => m.faculty_id === f.id && activeM(m)).length]);
      const by = {}; l.forEach((f) => { by[f.rank || 'غير محدد'] = (by[f.rank || 'غير محدد'] || 0) + 1; });
      summary = `<div class="stats">${Object.keys(by).map((k) => `<div><b>${by[k]}</b><span>${esc(k)}</span></div>`).join('')}<div><b>${l.length}</b><span>الإجمالي</span></div></div>`;
    } else if (RQ.r === 'load') {
      const l = (await D.rpc('report_teaching_load', { p_term: RQ.term })).filter((x) => inF(fac(x.faculty_id)) && (!RQ.dept || (fac(x.faculty_id) || {}).department_id === RQ.dept)).sort((a, b) => b.hours - a.hours);
      head = ['عضو هيئة التدريس', 'الرتبة', 'القسم', 'عدد المقررات', 'عدد الشعب', 'الساعات المعتمدة'];
      rows = l.map((x) => [x.name, x.rank, x.department, x.courses, x.sections, Number(x.hours)]);
      const tot = l.reduce((a, x) => a + Number(x.hours), 0); summary = `<div class="stats"><div><b>${l.filter((x) => x.sections).length}</b><span>عضو لديه شعب</span></div><div><b>${l.reduce((a, x) => a + x.sections, 0)}</b><span>شعبة مسندة</span></div><div><b>${tot}</b><span>ساعة معتمدة</span></div></div>`;
    } else if (RQ.r === 'assign') {
      const l = S.members.filter((m) => activeM(m) && inU(m.unit_id) && (!RQ.kind || (unit(m.unit_id) || {}).kind === RQ.kind)).sort((a, b) => uName(a.unit_id).localeCompare(uName(b.unit_id), 'ar') || (a.position === 'head' ? -1 : 1));
      head = ['الجهة', 'الجهة الأم', 'العضو', 'الصفة', 'بداية التكليف', 'نهاية التكليف'];
      rows = l.map((m) => [uName(m.unit_id), uName((unit(m.unit_id) || {}).parent_id), fName(m.faculty_id), POS[m.position], m.start_date, m.end_date || 'مستمر']);
    } else if (RQ.r === 'tasks') {
      const reqs = await D.select('org_requests', { cols: 'unit_id,status,due_date,archived' });
      const us = S.units.filter((u) => inU(u.id) && (!RQ.kind || u.kind === RQ.kind));
      head = ['الجهة'].concat(Object.keys(RSTAT).map((k) => RSTAT[k][0])).concat(['متأخرة', 'مؤرشفة', 'الإجمالي']);
      rows = us.map((u) => { const rs = reqs.filter((r) => r.unit_id === u.id); return [u.name].concat(Object.keys(RSTAT).map((k) => rs.filter((r) => !r.archived && r.status === k).length))
        .concat([rs.filter((r) => !r.archived && r.due_date && r.due_date < today() && !['done', 'rejected'].includes(r.status)).length, rs.filter((r) => r.archived).length, rs.length]); }).filter((r) => r[r.length - 1] > 0);
    } else {
      head = ['الجهة', 'النوع', 'تتبع إلى', 'المسؤول', 'عدد الأعضاء', 'الحالة', 'البرامج'];
      rows = flatUnits().filter((x) => inU(x.u.id)).map((x) => { const h = headOf(x.u.id); return ['  '.repeat(x.d) + x.u.name, KIND[x.u.kind], uName(x.u.parent_id), h ? fName(h.faculty_id) : '', S.members.filter((m) => m.unit_id === x.u.id && activeM(m)).length, USTATUS[x.u.status], S.apps.filter((a) => a.unit_id === x.u.id).map((a) => a.name).join('، ')]; });
    }
    if (!summary && rows.length) summary = `<div class="stats"><div><b>${rows.length}</b><span>${esc(REPORTS[RQ.r])}</span></div></div>`;
    REP = { head, rows, title: REPORTS[RQ.r] };
    return ctrl + summary + (rows.length ? `<div class="tw"><table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td${typeof c === 'number' ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<div class="empty">لا توجد بيانات لهذا التقرير بالتصفية الحالية.</div>');
  }
  C.rq = (k, v) => { RQ[k] = v; refresh(); };
  C.repXlsx = () => xlsxOut(REP.title + '.xlsx', [{ name: REP.title, head: REP.head, rows: REP.rows }]);
  C.repPrint = () => printNow(REP.title);

  /* =====================================================================
     سجل التدقيق
     ===================================================================== */
  const TBL = { org_units: 'الجهات', org_members: 'التكليفات', org_grants: 'منح الأدوار', org_exclusions: 'الاستثناءات', org_roles: 'الأدوار', faculty: 'أعضاء هيئة التدريس', faculty_private: 'بيانات الجوال',
    courses: 'المقررات', terms: 'الفصول', sched_versions: 'إصدارات الجداول', org_requests: 'المهام والطلبات', org_settings: 'الإعدادات', profiles: 'الحسابات', org_apps: 'البرامج', org_app_versions: 'إصدارات البرامج', org_announcements: 'الإعلانات', accounts: 'إدارة الحسابات' };
  const ACT = { INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف' };
  const UQ = { table: '', actor: '', from: '', to: '', action: '' };
  let AUD = [];
  async function pgAudit() {
    if (!gcap('audit')) return '<div class="panel">سجل التدقيق يحتاج صلاحية «سجل التدقيق».</div>';
    const o = { order: ['at', false], limit: 300, eq: {}, gte: {}, lte: {} };
    if (UQ.table) o.eq.table_name = UQ.table; if (UQ.actor) o.eq.actor_app_id = UQ.actor; if (UQ.action) o.eq.action = UQ.action;
    if (UQ.from) o.gte.at = UQ.from; if (UQ.to) o.lte.at = UQ.to + 'T23:59:59';
    AUD = await D.select('audit_log', o);
    return `<div class="row noprint" style="margin-bottom:12px">
      <select class="inp" onchange="C.uq('table',this.value)" aria-label="الجدول"><option value="">كل السجلات</option>${Object.keys(TBL).map((k) => opt(k, TBL[k], UQ.table)).join('')}</select>
      <select class="inp" onchange="C.uq('actor',this.value)" aria-label="المستخدم"><option value="">كل المستخدمين</option>${S.profiles.map((p) => opt(p.app_id, p.name, UQ.actor)).join('')}</select>
      <select class="inp" onchange="C.uq('action',this.value)" aria-label="العملية"><option value="">كل العمليات</option>${Object.keys(ACT).map((k) => opt(k, ACT[k], UQ.action)).join('')}</select>
      <label class="small row" style="gap:4px">من<input type="date" class="inp" value="${attr(UQ.from)}" onchange="C.uq('from',this.value)"></label>
      <label class="small row" style="gap:4px">إلى<input type="date" class="inp" value="${attr(UQ.to)}" onchange="C.uq('to',this.value)"></label>
      <span class="grow"></span><button class="btn sm" onclick="C.audXlsx()">تصدير Excel</button></div>
      <p class="small muted">يُسجَّل في الخادم كل تعديل: المستخدم والوقت والعملية والبيانات قبل وبعد. يُعرض آخر 300 سجل مطابق.</p>
      ${AUD.length ? `<div class="tw"><table><tr><th>الوقت</th><th>المستخدم</th><th>السجل</th><th>العملية</th><th>الملخص</th></tr>${AUD.map((a, i) => `<tr class="click" tabindex="0" onclick="C.audView(${i})" onkeydown="if(event.key==='Enter')C.audView(${i})"><td class="small">${fmtDT(a.at)}</td><td>${esc(pName(a.actor_app_id))}</td><td>${esc(TBL[a.table_name] || a.table_name)}</td><td>${chip(ACT[a.action] || a.action, a.action === 'DELETE' ? 'bad' : a.action === 'INSERT' ? 'ok' : '')}</td><td class="small">${esc(audSummary(a))}</td></tr>`).join('')}</table></div>` : '<div class="empty">لا توجد سجلات مطابقة.</div>'}`;
  }
  const audName = (a) => { const r = a.after || a.before || {}; return r.name || r.name_ar || r.title || r.code || (r.unit_id ? uName(r.unit_id) : '') || a.row_id || ''; };
  const audChanged = (a) => a.before && a.after ? Object.keys(a.after).filter((k) => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(a.after[k]) !== JSON.stringify(a.before[k])) : [];
  const audSummary = (a) => { const n = audName(a); const ch = audChanged(a); return n + (ch.length ? ' — ' + ch.slice(0, 4).join('، ') : ''); };
  C.uq = (k, v) => { UQ[k] = v; refresh(); };
  C.audView = (i) => { const a = AUD[i]; const ch = audChanged(a);
    modal('تفاصيل السجل', `<dl class="kv"><dt>الوقت</dt><dd>${fmtDT(a.at)}</dd><dt>المستخدم</dt><dd>${esc(pName(a.actor_app_id))}</dd><dt>السجل</dt><dd>${esc(TBL[a.table_name] || a.table_name)} · ${esc(a.row_id)}</dd><dt>العملية</dt><dd>${ACT[a.action] || a.action}</dd></dl>
      ${ch.length ? `<div class="tw" style="margin-top:12px"><table><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr>${ch.map((k) => `<tr><td dir="ltr">${esc(k)}</td><td class="small">${esc(JSON.stringify(a.before[k]))}</td><td class="small"><b>${esc(JSON.stringify(a.after[k]))}</b></td></tr>`).join('')}</table></div>`
        : `<div class="diff" style="margin-top:12px">${esc(JSON.stringify(a.after || a.before, null, 2))}</div>`}`, null, true); };
  C.audXlsx = () => xlsxOut('سجل التدقيق.xlsx', [{ name: 'السجل', head: ['الوقت', 'المستخدم', 'السجل', 'المعرّف', 'العملية', 'الحقول المتغيرة', 'قبل', 'بعد'],
    rows: AUD.map((a) => [a.at, pName(a.actor_app_id), TBL[a.table_name] || a.table_name, a.row_id, ACT[a.action] || a.action, audChanged(a).join('، '), JSON.stringify(a.before || ''), JSON.stringify(a.after || '')]) }]);

  /* =====================================================================
     الإعدادات
     ===================================================================== */
  function pgGeneral() {
    if (!isAdmin()) return '<div class="panel">هذه الصفحة لمدير النظام.</div>';
    const s = S.settings; const ln = (a) => esc((a || []).join('\n'));
    return `<div class="panel"><h2>القوائم والإعدادات العامة</h2><div class="editor"><div class="formgrid">
      <label class="f">اسم الكلية كما يظهر في الترويسة<input id="sN" value="${attr(s.collegeName || 'كلية الأعمال — جامعة الجوف')}"></label>
      <label class="f">الحد الأقصى لحجم المرفق (م.ب)<input id="sM" type="number" min="1" max="10" value="${attr(s.maxFileMB || 10)}"></label>
      <label class="f">الرتب الأكاديمية (سطر لكل رتبة)<textarea id="sR">${ln(s.ranks)}</textarea></label>
      <label class="f">حالات الأعضاء (سطر لكل حالة؛ الأولى هي «نشط»)<textarea id="sS">${ln(s.statuses)}</textarea></label>
      <label class="f">البرامج الأكاديمية (سطر لكل برنامج)<textarea id="sP">${ln(s.programs)}</textarea></label></div>
      <div class="row" style="margin-top:14px"><button class="btn pri" onclick="C.setSave(this)">حفظ الإعدادات</button></div></div></div>
      <div class="panel"><h2>عن النظام</h2><dl class="kv"><dt>الإصدار</dt><dd>${VERSION}</dd><dt>قاعدة البيانات</dt><dd dir="ltr" style="text-align:end">${DEMO ? 'نسخة تجريبية (في الذاكرة)' : esc(CFG.supabaseUrl)}</dd>
        <dt>الحماية</dt><dd>سياسات أمان على مستوى الصف (RLS) في كل الجداول، وسجل تدقيق في الخادم، واتصال مشفر HTTPS.</dd></dl></div>`;
  }
  C.setSave = (btn) => busy(btn, async () => {
    const lines = (id) => val(id).split('\n').map((x) => x.trim()).filter(Boolean);
    const d = Object.assign({}, S.settings, { collegeName: val('sN'), maxFileMB: Math.min(10, Math.max(1, Number(val('sM')) || 10)), ranks: lines('sR'), statuses: lines('sS'), programs: lines('sP') });
    if (!d.statuses.length) throw new Error('أضف حالة واحدة على الأقل.');
    await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; renderShell(); refresh(); toast('حُفظت الإعدادات.');
  });


  /* =====================================================================
     الأيقونات والهوية البصرية
     ===================================================================== */
  const IC = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    college: '<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M10 21v-5h4v5"/><path d="M9 10h.01M12 10h.01M15 10h.01M9 13h.01M15 13h.01"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M4 10h16"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/><path d="M3 21h18M4 18h16"/>',
    sitemap: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    cubes: '<path d="M12 3l4 2.3v4.6L12 12 8 9.9V5.3z"/><path d="M8 12.2l4 2.3v4.6L8 21.4 4 19.1v-4.6z"/><path d="M16 12.2l4 2.3v4.6l-4 2.3-4-2.3v-4.6z"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h7"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V7M16 16v-8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    down: '<path d="M6 9l6 6 6-6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', back: '<path d="M15 6l-6 6 6 6"/>', chev: '<path d="M9 6l6 6-6 6"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M9 7h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 13l2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    guide: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>',
    mega: '<path d="M3 10v4l11 5V5z"/><path d="M14 8a4 4 0 0 1 0 8"/><path d="M6 14l1 5h3l-1-4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    app: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 6.5h.01M10 6.5h.01"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="10" r="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>', login: '<path d="M9 4H5v16h4"/><path d="M12 8l-4 4 4 4M8 12h11"/>', db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
  };
  function icon(n) { return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || IC.app}</svg>`; }
  function emblem() {
    return `<svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><g fill="none" stroke="#7B529A" stroke-width="1.6"><ellipse cx="20" cy="20" rx="16" ry="6"/><ellipse cx="20" cy="20" rx="16" ry="6" transform="rotate(60 20 20)"/><ellipse cx="20" cy="20" rx="16" ry="6" transform="rotate(120 20 20)"/></g><circle cx="20" cy="20" r="3.2" fill="#B7862A"/></svg>`;
  }

  /* =====================================================================
     الرئيسية (حسب التصميم المعتمد)
     ===================================================================== */
  const annActive = (a) => a.published_at <= today() && (!a.expires_at || a.expires_at >= today());
  C.annView = (id) => { const a = (S._anns || []).find((x) => x.id === id); if (!a) return;
    modal(a.title, `<p class="small muted">${fmtD(a.published_at)}${a.unit_id ? ' · ' + esc(uName(a.unit_id)) : ' · على مستوى الكلية'}</p><p style="white-space:pre-wrap">${esc(a.body)}</p>`); };

  /* =====================================================================
     الكلية + قوائم الوكالات والأقسام والوحدات واللجان
     ===================================================================== */
  function pgCollege() {
    const root = unit(rootId()); if (!root) return '<div class="empty">لم يُنشأ الهيكل بعد.</div>';
    const h = headOf(root.id);
    const lead = S.units.filter((u) => u.parent_id === root.id && ['leadership', 'administration'].includes(u.kind) && u.status === 'active').sort(sortU);
    const deps = deptUnits().filter((d) => d.status === 'active');
    const appsHere = S.apps.filter((a) => a.active && (a.unit_id === root.id || lead.some((l) => l.id === a.unit_id)));
    return `<div class="grid2"><div class="panel"><h2>${esc(S.settings.collegeName || root.name)}</h2>
        <p style="white-space:pre-wrap">${esc(S.settings.about || root.description || 'أضف نبذة الكلية ورؤيتها ورسالتها من «الإعدادات ← الهوية والواجهة».')}</p>
        <dl class="kv"><dt>العميد</dt><dd>${h ? esc(fName(h.faculty_id)) : '—'}</dd>${lead.map((l) => { const x = headOf(l.id); return `<dt>${esc(l.name)}</dt><dd>${x ? esc(fName(x.faculty_id)) : '—'}</dd>`; }).join('')}</dl>
        <div class="row" style="margin-top:14px"><button class="btn sm" onclick="C.go('org')">${icon('sitemap')}الهيكل التنظيمي</button><button class="btn sm" onclick="C.go('unit',{id:'${root.id}'})">مساحة عمل العمادة</button></div></div>
      <div class="panel"><h2>الأقسام العلمية</h2>${deps.length ? `<div class="mlist">${deps.map((d) => { const x = headOf(d.id); return `<div><a class="grow" href="#" onclick="C.go('unit',{id:'${d.id}'});return false">${esc(d.name)}</a><span class="small muted">${x ? 'الرئيس: ' + esc(fName(x.faculty_id)) : ''}</span>${chip(S.faculty.filter((f) => f.department_id === d.id && f.status === 'نشط').length + ' عضو')}</div>`; }).join('')}</div>` : '<div class="empty">لا توجد أقسام.</div>'}</div></div>
      ${appsHere.length ? `<h2 style="margin:22px 0 10px">برامج العمادة والوكالات</h2><div class="wsgrid">${appsHere.map(appCard).join('')}</div>` : ''}`;
  }
  async function pgList(kinds, notRoot) {
    const reqs = await D.select('org_requests', { eq: { archived: false }, cols: 'id,unit_id,status,due_date' }).catch(() => []);
    const open = {}, late = {}; reqs.forEach((r) => { if (!['done', 'rejected'].includes(r.status)) { open[r.unit_id] = (open[r.unit_id] || 0) + 1; if (r.due_date && r.due_date < today()) late[r.unit_id] = (late[r.unit_id] || 0) + 1; } });
    const scoped = !fullRead() && !VIEW.all;
    const list = S.units.filter((u) => kinds.includes(u.kind) && u.status !== 'archived' && !(notRoot && u.id === rootId()) && (!scoped || cap(u.id, 'read'))).sort(sortU);
    const card = (u) => { const h = headOf(u.id), can = cap(u.id, 'read'), na = S.apps.filter((a) => a.unit_id === u.id && a.active).length, l = late[u.id] || 0;
      return itemCard({ title: u.name, color: unitColor(u.id), act: `C.go('unit',{id:'${u.id}'})`, sub: (u.parent_id ? 'تتبع: ' + uName(u.parent_id) + ' · ' : '') + (h ? fName(h.faculty_id) : 'لم يُعيَّن مسؤول'),
        chips: (u.status !== 'active' ? chip(USTATUS[u.status], 'wait') : '') + (!can ? chip('للاطلاع بإذن') : `<span class="role-b">${esc(KIND[u.kind] || '')}</span>`),
        nums: numBox(S.members.filter((m) => m.unit_id === u.id && activeM(m)).length, 'الأعضاء') + numBox(open[u.id] || 0, 'مهام مفتوحة') + (l ? numBox(l, 'متأخرة', 'bad') : '') + numBox(na, 'برامج') }); };
    const sumOf = (m) => list.reduce((t, u) => t + (m[u.id] || 0), 0), vac = list.filter((u) => !headOf(u.id)).length, lt = sumOf(late);
    const listStats = list.length ? `<div class="stat-row">${statCard(list.length, 'الجهات', '', 'violet', null, 100)}${statCard(sumOf(open), 'مهام مفتوحة', '', 'orange')}${statCard(lt, 'متأخرة', lt ? 'تجاوزت موعدها' : 'لا شيء متأخر', lt ? 'red' : 'green')}${statCard(vac, 'بلا مسؤول', `من ${list.length}`, vac ? 'blue' : 'green', null, vac / list.length * 100)}</div>` : '';
    return `<div class="row noprint" style="margin-bottom:14px"><span class="grow small muted">${scoped ? 'الجهات التي تخصك (' + list.length + ').' : list.length + ' جهة. التبعية والأسماء تُعدَّل من «الإعدادات ← الهيكل التنظيمي».'}</span>
      ${!fullRead() ? `<button class="btn sm" onclick="C.listAll(${scoped})">${scoped ? 'عرض كل جهات الكلية' : 'جهاتي فقط'}</button>` : ''}${isAdmin() ? `<button class="btn sm" onclick="C.go('org')">${icon('sitemap')}الهيكل التنظيمي</button>` : ''}</div>
      ${listStats}${list.length ? `<div class="item-grid">${list.map(card).join('')}</div>` : '<div class="empty">لا توجد جهات من هذا النوع.</div>'}`;
  }

  /* =====================================================================
     المهام والتكليفات (كل الجهات المصرح بها)
     ===================================================================== */
  const TQ = { tab: 'tasks', st: 'open', unit: '', mine: false };
  async function pgTasks() {
    const tabs = [['tasks', 'المهام والطلبات'], ['assign', 'تكليفاتي']];
    let body = '';
    if (TQ.tab === 'tasks') {
      let rows = await D.select('org_requests', { eq: { archived: false } });
      const mf = myFac(), all0 = rows.filter((r) => r.kind !== 'inquiry'), op0 = all0.filter((r) => !['done', 'rejected'].includes(r.status)), lt0 = op0.filter((r) => r.due_date && r.due_date < today()).length, mn0 = op0.filter((r) => mf && r.assignee_faculty === mf).length, dn0 = all0.length - op0.length;
      rows = rows.filter((r) => (TQ.st === 'all' || (TQ.st === 'open' ? !['done', 'rejected'].includes(r.status) : r.status === TQ.st)) && (!TQ.unit || r.unit_id === TQ.unit) && (!TQ.mine || (mf && r.assignee_faculty === mf)))
        .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
      const units = [...new Set(S.units.filter((u) => cap(u.id, 'read')).map((u) => u.id))];
      body = `<div class="stat-row">${statCard(op0.length, 'مفتوحة', `من ${all0.length}`, 'violet', null, all0.length ? op0.length / all0.length * 100 : 0)}${statCard(lt0, 'متأخرة', lt0 ? 'تجاوزت موعدها' : 'لا شيء متأخر', lt0 ? 'red' : 'green')}${mf ? statCard(mn0, 'مسندة إليّ', '', 'blue') : ''}${statCard(dn0, 'منجزة', `من ${all0.length}`, 'green', null, all0.length ? dn0 / all0.length * 100 : 0)}</div><div class="row noprint" style="margin-bottom:12px"><select class="inp" onchange="C.tq('st',this.value)">${opt('open', 'المفتوحة', TQ.st)}${opt('all', 'كل الحالات', TQ.st)}${Object.keys(RSTAT).map((k) => opt(k, RSTAT[k][0], TQ.st)).join('')}</select>
        <select class="inp" onchange="C.tq('unit',this.value)"><option value="">كل الجهات</option>${units.map((u) => opt(u, uName(u), TQ.unit)).join('')}</select>
        ${mf ? `<label class="small row" style="gap:4px"><input type="checkbox" ${TQ.mine ? 'checked' : ''} onchange="C.tq('mine',this.checked)">المسندة إليّ فقط</label>` : ''}<span class="grow"></span>
        ${TQ.unit && cap(TQ.unit, 'write') ? `<button class="btn sm pri" onclick="C.reqNew('${TQ.unit}')">مهمة جديدة</button>` : '<span class="small muted">لإضافة مهمة اختر الجهة أولًا</span>'}</div>
        ${rows.length ? `<div class="item-grid">${rows.map((r) => { const late = r.due_date && r.due_date < today() && !['done', 'rejected'].includes(r.status); return itemCard({ title: r.title, color: unitColor(r.unit_id), act: `C.openReq('${r.id}')`, sub: uName(r.unit_id) + (r.assignee_faculty ? ' · ' + fName(r.assignee_faculty) : ''), chips: chip(RSTAT[r.status][0], RSTAT[r.status][1]), badges: r.due_date ? chip((late ? 'متأخرة: ' : 'الاستحقاق: ') + fmtD(r.due_date), late ? 'bad' : '') : '' }); }).join('')}</div>` : '<div class="empty">لا توجد مهام مطابقة.</div>'}`;
    } else {
      const mf = myFac();
      const ass = mf ? S.members.filter((m) => m.faculty_id === mf).sort((a, b) => activeM(b) - activeM(a)) : [];
      body = !mf ? '<div class="empty">حسابك غير مرتبط بسجل عضو هيئة تدريس، فلا تظهر تكليفاتك. يربطه مدير النظام من «الحسابات والصلاحيات».</div>'
        : ass.length ? `<div class="mlist">${ass.map((m) => `<div class="${activeM(m) ? '' : 'past'}"><a class="grow" href="#" onclick="C.go('unit',{id:'${m.unit_id}'});return false">${esc(uName(m.unit_id))}</a>${chip(POS[m.position])}<span class="small muted">${fmtD(m.start_date)} ← ${m.end_date ? fmtD(m.end_date) : 'مستمر'}</span></div>`).join('')}</div>` : '<div class="empty">لا توجد تكليفات.</div>';
    }
    return `<div class="tabs">${tabs.map((t) => `<button class="${TQ.tab === t[0] ? 'on' : ''}" onclick="C.tq('tab','${t[0]}')">${t[1]}</button>`).join('')}</div>${body}`;
  }
  C.tq = (k, v) => { TQ[k] = v; refresh(); };
  C.myTasks = () => { Object.assign(TQ, { tab: 'tasks', st: 'open', unit: '', mine: true }); go('tasks'); };

  /* =====================================================================
     الإعدادات: لوحة مركزية (على طريقة حقيبة الطوارئ)
     ===================================================================== */
  const manageAny = () => isAdmin() || S.units.some((u) => cap(u.id, 'manage'));
  function pgSettings() {
    const H = (p, ic, t, d, ok) => ok === false ? '' : `<button class="hub" onclick="C.go('${p}')">${icon(ic)}<div><b>${esc(t)}</b><span>${esc(d)}</span></div></button>`;
    /* عضو هيئة التدريس: برامجه وكلمة مروره فقط، دون إعدادات الكلية وهيكلها */
    if (viewRole() === 'staff' && !canSettings()) return `<div class="hubgrid">${H('apps', 'app', 'برامجي', 'البرامج التي أُتيحت لك حسب تكليفك')}${H('notifs', 'bell', 'الإشعارات', 'ما وصلك من تكليفات وتنبيهات')}</div>
      ${!DEMO ? `<div class="row" style="margin-top:16px"><button class="btn" onclick="C.changePass()">${icon('key')}تغيير كلمة المرور</button></div>` : ''}`;
    return `<div class="hubgrid">
      ${H('apps', 'upload', 'البرامج والتحديثات', manageAny() ? 'رفع برامج HTML لكل جهة وتحديثها، والرجوع لإصدار سابق' : 'البرامج المتاحة لكل جهة')}
      ${H('forms', 'form', 'النماذج والتقارير', 'نماذج الوكالة المطلوبة: رفعها وإصدارها وطباعتها لكل جهة')}
      ${H('track', 'chart', 'متابعة النماذج المطلوبة', 'من أصدر ومن تأخر من الوحدات واللجان', gcap('reports'))}
      ${H('ann', 'mega', 'الإعلانات', 'إعلانات الصفحة الرئيسية للكلية والجهات')}
      ${H('assist', 'chat', 'المرشد الأكاديمي والدعم الفني', 'الشات بوت للإرشاد الطلابي، وواتساب وتذاكر الدعم', isAdmin())}
      ${H('org', 'sitemap', 'الهيكل التنظيمي', 'الجهات وتبعيتها ومسؤولوها وأعضاؤها')}
      ${H('faculty', 'user', 'أعضاء هيئة التدريس', 'القاعدة المركزية والاستيراد من Excel')}
      ${H('courses', 'book', 'المقررات والجداول', 'الفصول والمقررات واستيراد الجداول واعتمادها')}
      ${isAdmin() ? `<button class="hub" onclick="C.setAccess()">${icon('key')}<div><b>من يرى الإعدادات</b><span>الإعدادات لك وحدك، ولك أن تمنحها لأعضاء تحددهم</span></div></button>` : ''}
      ${H('sources', 'chart', 'مصادر البيانات', 'مصدر كل قسم ومسؤوله وآخر تحديث واكتماله وزر التحديث', isAdmin())}
      ${H('positions', 'key', 'المناصب', 'كل منصب وشاغله، والتعيين والنقل، مع سجل التدقيق', isAdmin())}
      ${H('matrix', 'list', 'مصفوفة التكليفات والصلاحيات', 'كل الأعضاء أمام كل الجهات والبرامج في جدول واحد، مع تصدير واستيراد Excel', isAdmin())}
      ${H('accounts', 'key', 'الحسابات والصلاحيات', 'حسابات الزملاء، وصلاحيات كل عضو في كل جهة وبرنامج', isAdmin())}
      ${H('identity', 'palette', 'الهوية والواجهة', 'الشعار وصورة الواجهة واسم الكلية والشعار النصي', isAdmin())}
      ${H('general', 'list', 'القوائم العامة', 'الرتب وحالات الأعضاء والبرامج الأكاديمية', isAdmin())}
      ${H('backup', 'db', 'النسخ الاحتياطي والنقل', 'نسخة شاملة، واستعادة، وملف النقل لقاعدة بيانات الجامعة', isAdmin())}
      ${H('audit', 'history', 'سجل التدقيق', 'كل تعديل: من وماذا ومتى', gcap('audit'))}
    </div>${!DEMO ? `<div class="row" style="margin-top:16px"><button class="btn" onclick="C.changePass()">${icon('key')}تغيير كلمة المرور</button></div>` : ''}`;
  }

  /* الهوية والواجهة */
  const imgToData = (file, maxW, type, q) => new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return rej(new Error('اختر ملف صورة (PNG أو JPG).'));
    const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, maxW / im.width); const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); const x = c.getContext('2d'); if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL(type, q)); }; im.onerror = () => rej(new Error('تعذرت قراءة الصورة.')); im.src = r.result; }; r.readAsDataURL(file); });
  const IDN = {};
  function pgIdentity() {
    if (!isAdmin()) return '<div class="panel">هذه الصفحة لمدير النظام.</div>';
    const s = Object.assign({}, S.settings, IDN);
    return `<div class="panel editor"><div class="formgrid">
      <label class="f">اسم الجامعة<input id="iU" value="${attr(s.university || 'جامعة الجوف')}"></label>
      <label class="f">اسم الجامعة بالإنجليزية<input id="iUe" value="${attr(s.universityEn || 'Jouf University')}" dir="ltr"></label>
      <label class="f">اسم الكلية المختصر (في الواجهة)<input id="iC" value="${attr(s.collegeShort || 'كلية الأعمال')}"></label>
      <label class="f">اسم الكلية الكامل (في التقارير)<input id="iCf" value="${attr(s.collegeName || 'كلية الأعمال — جامعة الجوف')}"></label>
      <label class="f">العبارة تحت الاسم<input id="iS" value="${attr(s.slogan || 'معًا .. نحو مستقبل أكثر إبداعًا')}"></label>
      <label class="f">عبارة التذييل<input id="iF" value="${attr(s.footer || 'رؤية . تطوير . تميز')}"></label>
      <label class="f full">نبذة الكلية (رؤيتها ورسالتها) في صفحة «الكلية»<textarea id="iA">${esc(s.about || '')}</textarea></label>
      <div class="f">شعار الجامعة (PNG بخلفية شفافة)<div class="row">${s.logo ? `<img src="${attr(s.logo)}" alt="" style="height:48px;background:#fff;border-radius:6px;padding:3px">` : '<span class="small muted">الشعار الافتراضي</span>'}
        <input type="file" accept="image/*" onchange="C.idImg('logo',this)">${s.logo ? `<button class="btn sm" onclick="C.idClear('logo')">إزالة</button>` : ''}</div></div>
      <div class="f">خلفية صفحة الدخول (صورة للكلية، عرضها 1800 بكسل تقريبًا؛ يُضاف عليها غطاء بلون الهوية)<div class="row">${s.hero ? `<img src="${attr(s.hero)}" alt="" style="height:48px;border-radius:6px">` : '<span class="small muted">الصورة الافتراضية</span>'}
        <input type="file" accept="image/*" onchange="C.idImg('hero',this)">${s.hero ? `<button class="btn sm" onclick="C.idClear('hero')">إزالة</button>` : ''}</div></div></div>
      ${(() => { const pi = s.publicInfo || {}; const lines = (l) => (l || []).map((x) => [x.d, x.t, x.p].filter(Boolean).join(' | ')).join('\n');
        return `<h3 style="margin:18px 0 8px">معلومات عامة للزوار (الصفحة الأولى قبل الدخول)</h3>
        <div class="formgrid"><label class="f">عدد الطلاب والطالبات (اختياري)<input id="iStu" type="number" min="0" value="${attr(pi.students || '')}"></label>
          <label class="f full">التقويم الدراسي: سطر لكل موعد بالصيغة «التاريخ | الموعد»<textarea id="iCal" dir="rtl" placeholder="2026-12-14 | بداية الاختبارات النهائية">${esc(lines(pi.calendar))}</textarea></label>
          <label class="f full">الفعاليات: سطر لكل فعالية بالصيغة «التاريخ | العنوان | المكان»<textarea id="iEv" dir="rtl" placeholder="2026-11-20 | ملتقى ريادة الأعمال | قاعة المؤتمرات">${esc(lines(pi.events))}</textarea></label></div>
        <p class="small muted">يظهر للزوار القادم فقط، الأقرب أولًا (خمسة لكل قائمة).</p>`; })()}
      ${(() => { const t = Object.assign({}, THEME_DEF, s.theme || {}); const ci = (k, l) => `<label class="f">${l}<span class="row"><input type="color" id="th_${k}" value="${attr(t[k])}" oninput="C.thPrev()" style="width:52px;height:36px;padding:2px"><code dir="ltr" class="small">${esc(t[k])}</code></span></label>`;
        return `<h3 style="margin:18px 0 8px">الألوان</h3><p class="small muted">الافتراضي بنفسجي شعار جامعة الجوف. يظهر التغيير فورًا للمعاينة، ولا يُعتمد إلا بعد «حفظ الهوية».</p>
        <div class="formgrid">${ci('primary', 'اللون الأساسي (الأزرار والعناوين والروابط)')}${ci('bar', 'الشريط العلوي والقائمة الجانبية')}${ci('frame1', 'غطاء خلفية صفحة الدخول — بداية التدرج')}${ci('frame2', 'غطاء خلفية صفحة الدخول — نهاية التدرج')}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm" onclick="C.thReset()">استعادة ألوان الجامعة</button></div>`; })()}
      ${(() => { const al = Object.assign({ fileDue: '', leadDays: 7 }, s.alerts || {});
        return `<h3 style="margin:18px 0 8px">مواعيد التنبيهات</h3><p class="small muted">تبني منها صفحة «تنبيهاتي» تنبيهات أعضاء هيئة التدريس. ألوان أعمدة «مهامي» في «البرامج والتحديثات ← أعمدة مهامي».</p>
        <div class="formgrid"><label class="f">آخر موعد لتسليم ملف المقرر (الفصل الحالي)<input type="date" id="al_due" value="${attr(al.fileDue || '')}"></label>
          <label class="f">يبدأ التنبيه قبل الموعد بـ (يوم)<input type="number" id="al_lead" min="0" max="60" value="${attr(al.leadDays)}"></label></div>`; })()}
      <p class="small muted">تُضغط الصور تلقائيًا وتُحفظ مع إعدادات النظام، فتنتقل مع النسخة الشاملة عند النقل.</p>
      <div class="row" style="margin-top:12px"><button class="btn pri" onclick="C.idSave(this)">حفظ الهوية</button></div></div>`;
  }
  const thRead = () => { const g = (k) => document.getElementById('th_' + k); if (!g('primary')) return null; const t = {}; ['primary', 'bar', 'frame1', 'frame2'].forEach((k) => { t[k] = g(k).value; }); return t; };
  const idKeep = () => { ['iU:university', 'iUe:universityEn', 'iC:collegeShort', 'iCf:collegeName', 'iS:slogan', 'iF:footer', 'iA:about'].forEach((p) => { const [i, k] = p.split(':'); const e = document.getElementById(i); if (e) IDN[k] = e.value.trim(); }); const t = thRead(); if (t) IDN.theme = Object.assign({}, (S.settings.theme || {}), t);
    if ($('#iCal')) { const rd = (id) => val(id).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[1])
        .map(([d, tt, p]) => { const m = String(d).replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m ? { d: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, t: tt, p: p || '' } : null; }).filter(Boolean);
      IDN.publicInfo = { students: Number(val('iStu')) || null, calendar: rd('iCal'), events: rd('iEv') }; }
    if ($('#al_lead')) IDN.alerts = { fileDue: val('al_due') || '', leadDays: Math.max(0, Math.min(60, Number(val('al_lead')) || 0)) }; };
  C.thPrev = () => { const t = thRead(); if (!t) return; applyTheme(t); ['primary', 'bar', 'frame1', 'frame2'].forEach((k) => { const c = document.getElementById('th_' + k).nextElementSibling; if (c) c.textContent = t[k]; }); };
  C.thReset = () => { ['primary', 'bar', 'frame1', 'frame2'].forEach((k) => { document.getElementById('th_' + k).value = THEME_DEF[k]; }); C.thPrev(); toast('أُعيدت ألوان الجامعة. اضغط «حفظ الهوية» لاعتمادها.'); };
  C.idImg = (k, input) => busy(null, async () => { idKeep(); IDN[k] = await imgToData(input.files[0], k === 'logo' ? 256 : 1800, k === 'logo' ? 'image/png' : 'image/jpeg', 0.82); refresh(); });
  C.idClear = (k) => { idKeep(); IDN[k] = ''; refresh(); };
  C.idSave = (btn) => busy(btn, async () => { idKeep(); const d = Object.assign({}, S.settings, IDN); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; Object.keys(IDN).forEach((k) => delete IDN[k]); renderShell(); refresh(); toast('حُفظت الهوية.'); });

  /* الإعلانات */
  async function pgAnn() {
    const all = (await D.select('org_announcements')).sort((a, b) => (b.pinned - a.pinned) || b.published_at.localeCompare(a.published_at)); S._anns = all;
    const canAny = isAdmin() || S.units.some((u) => cap(u.id, 'manage'));
    return `<div class="row" style="margin-bottom:12px"><span class="grow small muted">مدير النظام ينشر على مستوى الكلية، ومسؤول كل جهة ينشر إعلانات جهته.</span>${canAny ? '<button class="btn pri sm" onclick="C.annEdit()">إعلان جديد</button>' : ''}</div>
      ${all.length ? `<div class="tw"><table><tr><th>العنوان</th><th>الجهة</th><th>النشر</th><th>الانتهاء</th><th>الحالة</th></tr>${all.map((a) => { const can = isAdmin() || (a.unit_id && cap(a.unit_id, 'manage'));
        return `<tr class="click" onclick="${can ? `C.annEdit('${a.id}')` : `C.annView('${a.id}')`}"><td>${a.pinned ? chip('مثبت', 'brass') + ' ' : ''}${esc(a.title)}</td><td>${esc(a.unit_id ? uName(a.unit_id) : 'الكلية')}</td><td class="num">${fmtD(a.published_at)}</td><td class="num">${fmtD(a.expires_at)}</td><td>${annActive(a) ? chip('ظاهر', 'ok') : chip(a.published_at > today() ? 'مجدول' : 'منتهٍ')}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد إعلانات.</div>'}`;
  }
  C.annEdit = (id) => {
    const a = id ? S._anns.find((x) => x.id === id) : { title: '', body: '', unit_id: null, pinned: false, published_at: today(), expires_at: '' };
    const units = S.units.filter((u) => cap(u.id, 'manage'));
    modal(id ? 'تعديل إعلان' : 'إعلان جديد', `<div class="formgrid"><label class="f full">العنوان<input id="anT" value="${attr(a.title)}" maxlength="150"></label>
      <label class="f full">النص<textarea id="anB" maxlength="3000">${esc(a.body)}</textarea></label>
      <label class="f">الجهة<select id="anU">${isAdmin() ? `<option value="">على مستوى الكلية</option>` : ''}${units.map((u) => opt(u.id, u.name, a.unit_id)).join('')}</select></label>
      <label class="f">تاريخ النشر<input type="date" id="anP" value="${attr(a.published_at)}"></label><label class="f">ينتهي في (اختياري)<input type="date" id="anE" value="${attr(a.expires_at || '')}"></label>
      <label class="f row" style="flex-direction:row;gap:6px"><input type="checkbox" id="anPin" ${a.pinned ? 'checked' : ''}>تثبيت في أعلى القائمة</label></div><div class="err"></div>`,
      `<button class="btn pri" id="anOk">حفظ</button>${id ? '<button class="btn danger" id="anDel">حذف</button>' : ''}<button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#anOk').onclick = (ev) => busy(ev.target, async () => { const r = { title: val('anT'), body: val('anB'), unit_id: val('anU') || null, published_at: val('anP') || today(), expires_at: val('anE') || null, pinned: val('anPin') };
      if (!r.title) throw new Error('العنوان مطلوب.'); if (id) await D.update('org_announcements', r, { eq: { id } }); else await D.insert('org_announcements', r); C.close(); refresh(); toast('حُفظ الإعلان.'); });
    if ($('#anDel')) $('#anDel').onclick = (ev) => busy(ev.target, async () => { await D.remove('org_announcements', { eq: { id } }); C.close(); refresh(); toast('حُذف الإعلان.'); });
  };

  /* =====================================================================
     البرامج والتحديثات: كل جهة ترفع برامجها (HTML) وتحدّثها
     ===================================================================== */
  const AK = { html: 'ملف HTML مرفوع', link: 'رابط خارجي' };
  let VERS = {};
  const loadVers = async () => { const v = await D.select('org_app_versions', { cols: 'id,app_id,version,size,notes,uploaded_by,uploaded_at,path' }).catch(() => []); VERS = {}; v.forEach((x) => { VERS[x.id] = x; }); return v; };
  const appLv = (a) => isAdmin() ? 'manage' : ((S.appLv || {})[a.id] || 'none');
  function appCard(a) {
    const v = VERS[a.current_version];
    return `<div class="ws" style="cursor:default;border-inline-start-color:var(--k-${(unit(a.unit_id) || {}).kind || 'unit'})"><div class="row">${icon(a.icon || 'app')}<h3 class="grow">${esc(a.name)}</h3></div>
      <span class="meta">${esc(a.description || '')}</span><span class="meta">${esc(uName(a.unit_id))} · ${AK[a.kind]}${v ? ' · الإصدار ' + esc(v.version || '—') : ''}</span>
      <span class="row"><button class="btn sm pri" onclick="C.appOpen('${a.id}')">فتح البرنامج</button>${a.kind === 'html' && isAdmin() ? `<button class="btn sm" onclick="C.appUpload('${a.id}')">رفع تحديث</button>` : ''}</span></div>`;
  }
  /* ربط أزرار «مقرراتي» بالبرامج، والأدوار العامة للبرامج (مراجعة/تدقيق/إشعار) — كلها في القاعدة (الملف 14) */
  const DUTY = { review: 'مراجعة', audit: 'تدقيق', notify: 'إشعار (إرسال الملاحظات)' };
  async function appLinksPanel() {
    const html = S.apps.filter((a) => a.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ar')), B = S.settings.courseButtons || {};
    const duties = await D.select('org_app_duties').catch(() => null);
    const facs = S.faculty.filter((f) => f.status !== 'غير نشط').slice().sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
    const aName = (id) => (S.apps.find((a) => a.id === id) || {}).name || id;
    const rc = S._rc || (S._rc = reqCols().map((c) => Object.assign({}, c)));
    return `<div class="grid2" style="margin-bottom:14px"><div class="panel" style="grid-column:1/-1"><h2>أعمدة «مهامي» (متطلبات المقرر)</h2>
        <p class="small muted">كل عمود: اسمه، ولونه، والبرنامج الذي يُفتح على المقرر عند الضغط، ونوع الحالة التي ينشرها البرنامج (file ملف المقرر، bb البلاك بورد، exam الاختبارات، أو نوع جديد). برنامج عمود «file» يدخله أستاذ المقرر ومنسقه بمستوى «استخدام»، وبقية الأعمدة «اطلاع».</p>
        <div class="tw"><table><tr><th>الاسم</th><th>اللون</th><th>البرنامج</th><th>نوع الحالة</th><th></th></tr>${rc.map((c, i) => `<tr>
          <td><input id="rc_n_${i}" value="${attr(c.name)}" maxlength="40"></td><td><input type="color" id="rc_c_${i}" value="${attr(c.color || '#8A7F9B')}" style="width:46px;height:34px;padding:2px"></td>
          <td><select id="rc_a_${i}"><option value="">— لم يُربط —</option>${html.map((a) => opt(a.id, a.name + ' · ' + uName(a.unit_id), c.app)).join('')}</select></td>
          <td><input id="rc_k_${i}" value="${attr(c.kind)}" dir="ltr" list="rcKinds" style="width:90px"></td><td><button class="btn sm danger" onclick="C.rcDel(${i})">حذف</button></td></tr>`).join('')}</table></div>
        <datalist id="rcKinds"><option value="file"><option value="bb"><option value="exam"></datalist>
        <div class="row" style="margin-top:10px"><button class="btn sm" onclick="C.rcAdd()">+ عمود</button><button class="btn pri sm" onclick="C.rcSave(this)">حفظ</button></div></div>
      <div class="panel"><h2>الأدوار العامة في البرامج</h2>
        <p class="small muted">المراجعة والتدقيق والإشعار (إرسال الملاحظات للمنسق) لأشخاص بأعينهم، في أي برنامج، ويمكن حصرها ببرنامج أكاديمي. يدخل صاحبها البرنامج بمستوى «استخدام»، والبرنامج يحدد ما يفعله بدوره.</p>
        ${duties === null ? '<div class="empty">تحتاج تنفيذ ملف قاعدة البيانات <b>14_course_roles_duties.sql</b>.</div>' : `
        <div class="formgrid"><label class="f">البرنامج<select id="du_a">${html.map((a) => opt(a.id, a.name, '')).join('')}</select></label>
          <label class="f">العضو<select id="du_f">${facs.map((f) => opt(f.id, f.name_ar, '')).join('')}</select></label>
          <label class="f">الدور<select id="du_d">${Object.keys(DUTY).map((k) => opt(k, DUTY[k], '')).join('')}</select></label>
          <label class="f">البرنامج الأكاديمي<select id="du_p"><option value="">كل البرامج</option>${(S.programs || []).map((p) => opt(p.id, p.name, '')).join('')}</select></label></div>
        <div class="row" style="margin-top:8px"><button class="btn sm" onclick="C.dutyAdd(this)">+ إضافة</button></div>
        ${duties.length ? `<div class="tw" style="margin-top:10px"><table><tr><th>العضو</th><th>البرنامج</th><th>الدور</th><th>النطاق</th><th></th></tr>${duties.map((d) => `<tr><td>${esc(fName(d.faculty_id))}</td><td class="small">${esc(aName(d.app_id))}</td><td>${esc(DUTY[d.duty])}</td><td class="small">${esc(d.program_id ? progName(d.program_id) : 'كل البرامج')}</td><td><button class="btn sm danger" onclick="C.dutyDel('${d.id}')">حذف</button></td></tr>`).join('')}</table></div>` : '<p class="small muted">لا توجد أدوار بعد.</p>'}`}</div></div>`;
  }
  /* أعمدة «مهامي»: تُحفظ في org_settings.data.reqColumns، ومعها courseButtons التي تعتمد عليها دوال القاعدة في صلاحية الدور في المقرر (الملفان 14 و15) */
  const rcRead = () => (S._rc || []).map((c, i) => ({ key: c.key, name: val('rc_n_' + i).trim(), color: val('rc_c_' + i), app: val('rc_a_' + i), kind: val('rc_k_' + i).trim().toLowerCase().replace(/[^a-z0-9_]/g, '') }));
  C.rcAdd = () => { S._rc = rcRead().concat([{ key: 'c' + Date.now().toString(36), name: 'عمود جديد', color: '#7A6FA0', app: '', kind: '' }]); refresh(); };
  C.rcDel = (i) => { const r = rcRead(); r.splice(i, 1); S._rc = r; refresh(); };
  C.rcSave = (btn) => busy(btn, async () => { const rc = rcRead();
    if (rc.some((c) => !c.name || !c.kind)) throw new Error('لكل عمود اسم ونوع حالة.');
    if (new Set(rc.map((c) => c.kind)).size < rc.length) throw new Error('نوع الحالة لا يتكرر بين الأعمدة.');
    const cb = {}; rc.forEach((c) => { if (c.app) cb[c.kind === 'file' ? 'file' : c.key] = c.app; });
    const d = Object.assign({}, S.settings, { reqColumns: rc, courseButtons: cb }); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; S._rc = null;
    toast('حُفظت أعمدة «مهامي».'); refresh(); });
  C.dutyAdd = (btn) => busy(btn, async () => { await D.insert('org_app_duties', { app_id: val('du_a'), faculty_id: val('du_f'), duty: val('du_d'), program_id: val('du_p') || null }); toast('أُضيف الدور.'); refresh(); });
  C.dutyDel = (id) => busy(null, async () => { await D.remove('org_app_duties', { eq: { id } }); toast('حُذف الدور.'); refresh(); });
  async function pgApps() {
    await loadVers(); S.apps = await D.select('org_apps');
    const f = VIEW.unit || '';
    /* غير المدير يرى البرامج التي له فيها صلاحية فقط */
    const list = S.apps.filter((a) => (!f || a.unit_id === f) && (isAdmin() || appLv(a) !== 'none')).sort((a, b) => uName(a.unit_id).localeCompare(uName(b.unit_id), 'ar') || a.sort - b.sort);
    if (!manageAny()) return list.length ? `<p class="small muted">البرامج المتاحة لك حسب تكليفك.</p><div class="tw"><table><tr><th>البرنامج</th><th>صلاحيتك</th><th></th></tr>${list.map((a) => `<tr><td><b>${esc(a.name)}</b><div class="tiny muted">${esc(a.description || '')}</div></td>
        <td>${chip(LV[appLv(a)] || appLv(a), appLv(a) === 'view' ? '' : 'ok')}</td><td><button class="btn sm pri" onclick="C.appOpen('${a.id}')">فتح</button></td></tr>`).join('')}</table></div>`
      : '<div class="empty">لا توجد برامج متاحة لك بعد. يتيحها مدير النظام حسب تكليفك.</div>';
    const links = isAdmin() ? await appLinksPanel() : "";
    return `${links}<div class="note" style="margin-bottom:12px">يرفع مسؤول كل جهة (الكلية، الوكالة، القسم، الوحدة، اللجنة) برامجه بصيغة HTML من هنا، على طريقة «الأنظمة والتحديثات» في حقيبة الطوارئ. كل رفع إصدار محفوظ يمكن الرجوع إليه. البرنامج يعمل داخل الموقع، وما كان يحفظه في ذاكرة المتصفح (localStorage) يُحفظ في قاعدة البيانات لهذه الجهة ويراه كل أعضائها.</div>
      <div class="row noprint" style="margin-bottom:12px"><select class="inp" onchange="C.go('apps',{unit:this.value})"><option value="">كل الجهات</option>${unitOptions(f)}</select><span class="grow"></span>
        ${manageAny() ? `<button class="btn pri sm" onclick="C.appNew('${attr(f)}')">${icon('upload')}إضافة برنامج</button>` : ''}</div>
      ${list.length ? `<div class="tw"><table><tr><th>البرنامج</th><th>الجهة</th><th>النوع</th><th>الإصدار الحالي</th><th>آخر رفع</th><th></th></tr>${list.map((a) => { const v = VERS[a.current_version], m = appLv(a) === 'manage';
        return `<tr><td><b>${esc(a.name)}</b>${a.active ? '' : ' ' + chip('موقوف', 'wait')}${a.everyone && a.everyone !== 'none' ? ' ' + chip('لكل الأعضاء: ' + LV[a.everyone], 'ok') : ''}<div class="tiny muted">${esc(a.description || '')}</div></td><td>${esc(uName(a.unit_id))}</td><td class="small">${AK[a.kind]}${a.kind !== 'html' ? `<div class="tiny muted" dir="ltr">${esc(a.target)}</div>` : ''}</td>
        <td>${v ? esc(v.version || '—') : '—'}</td><td class="small">${v ? fmtDT(v.uploaded_at) + '<br>' + esc(pName(v.uploaded_by)) : '—'}</td>
        <td class="row"><button class="btn sm pri" onclick="C.appOpen('${a.id}')">فتح</button>${a.kind === 'html' && isAdmin() ? `<button class="btn sm" onclick="C.appUpload('${a.id}')">رفع تحديث</button><button class="btn sm" onclick="C.appVers('${a.id}')">الإصدارات</button>` : ''}${m ? `<button class="btn sm" onclick="C.appEdit('${a.id}')">تعديل</button>` : ''}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد برامج. أضف أول برنامج لجهتك من الزر أعلاه.</div>'}`;
  }
  const detectVer = (name, text) => { const m = (name || '').match(/v?\s*(\d+(?:[._]\d+){0,3})(?!.*\d)/i) || ((text || '').match(/(?:الإصدار|version)\s*[:\-]?\s*v?(\d+(?:\.\d+){1,3})/i)); return m ? m[1].replace(/_/g, '.') : ''; };
  const readHtml = (file) => new Promise((res, rej) => { if (!file) return rej(new Error('اختر ملف البرنامج.')); if (!/\.html?$/i.test(file.name)) return rej(new Error('الملف يجب أن يكون بصيغة HTML.'));
    if (file.size > 25 * 1048576) return rej(new Error('حجم الملف أكبر من 25 م.ب.')); const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('تعذرت قراءة الملف.')); r.readAsText(file, 'utf-8'); });
  async function pushVersion(appId, file, text, ver, notes) {
    if (!isAdmin()) throw new Error('رفع إصدارات البرامج لمدير النظام فقط.');
    const vid = crypto.randomUUID ? crypto.randomUUID() : uid('v');
    const path = appId + '/' + vid + '.html';
    await D.uploadApp(path, new Blob([text], { type: 'text/html' }));
    await D.insert('org_app_versions', { id: vid, app_id: appId, version: ver || detectVer(file.name, text) || '', path, size: file.size, notes: notes || '' });
    await D.update('org_apps', { current_version: vid }, { eq: { id: appId } });
  }
  C.appNew = (unitId) => {
    const units = S.units.filter((u) => cap(u.id, 'manage') && u.status !== 'archived');
    const ad = isAdmin(), kinds = ad ? Object.keys(AK) : ['link'];   /* برنامج HTML يرفع إصدارًا: لمدير النظام فقط؛ ومدير الجهة يضيف روابط */
    modal('إضافة برنامج', `<div class="formgrid"><label class="f">اسم البرنامج<input id="apN" maxlength="120"></label>
      <label class="f">الجهة<select id="apU">${units.map((u) => opt(u.id, u.name, unitId)).join('')}</select></label>
      <label class="f full">الوصف<input id="apD" maxlength="300"></label>
      <label class="f">نوع البرنامج<select id="apK" onchange="document.getElementById('apHtml').classList.toggle('hidden',this.value!=='html');document.getElementById('apT').parentElement.classList.toggle('hidden',this.value==='html')">${kinds.map((k) => opt(k, AK[k], kinds[0])).join('')}</select></label>
      <label class="f${ad ? ' hidden' : ''}">الرابط<input id="apT" dir="ltr" placeholder="https://…"></label>
      <div id="apHtml" class="full formgrid${ad ? '' : ' hidden'}" style="grid-column:1/-1"><label class="f">ملف البرنامج (HTML)<input type="file" id="apF" accept=".html,.htm"></label>
        <label class="f">رقم الإصدار<input id="apV" placeholder="يُستخرج من اسم الملف إن وُجد"></label><label class="f full">ملاحظات الإصدار<input id="apNo"></label></div></div>
      <p class="small muted">أنشئ برنامجًا لكل جهة تستخدمه؛ لكل جهة بياناتها المستقلة في البرنامج.</p><div class="err"></div>`,
      `<button class="btn pri" id="apOk">إضافة</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    $('#apOk').onclick = (ev) => busy(ev.target, async () => {
      const k = val('apK'), name = val('apN'); if (!name) throw new Error('اسم البرنامج مطلوب.'); if (!val('apU')) throw new Error('اختر الجهة.');
      if (k === 'html' && !isAdmin()) throw new Error('رفع برنامج HTML لمدير النظام فقط. يمكنك إضافة رابط خارجي.');
      let text = null, file = null; if (k === 'html') { file = $('#apF').files[0]; text = await readHtml(file); } else if (!val('apT')) throw new Error('اكتب الرابط.');
      if (k === 'link' && !/^https:\/\//i.test(val('apT'))) throw new Error('الرابط يبدأ بـ https://');
      const id = 'a-' + uid().slice(0, 12);
      await D.insert('org_apps', { id, unit_id: val('apU'), name, description: val('apD'), kind: k, target: k === 'html' ? '' : val('apT'), icon: 'app', sort: 100, active: true });
      if (k === 'html') await pushVersion(id, file, text, val('apV'), val('apNo'));
      S.apps = await D.select('org_apps'); C.close(); refresh(); toast('أُضيف البرنامج.');
    });
  };
  /* المالك = مدير النظام فقط: تنزيل البرنامج، ورفع التحديث، والإصدارات واعتمادها (الملف 23 يفرضه في القاعدة).
     صاحب «إدارة» والأعضاء يديرون العمل داخل البرنامج دون تنزيله أو نسخه أو تحديثه. */
  const ownerOnly = () => { if (isAdmin()) return true; toast('تنزيل البرامج ورفع تحديثاتها وإصداراتها لمدير النظام فقط.', true); return false; };
  C.appUpload = (id) => { if (!ownerOnly()) return;
    const a = S.apps.find((x) => x.id === id); const v = VERS[a.current_version];
    modal('رفع تحديث: ' + a.name, `<div class="formgrid"><label class="f full">ملف الإصدار الجديد (HTML)<input type="file" id="upF" accept=".html,.htm" onchange="C.upPick(this)"></label>
      <label class="f">رقم الإصدار<input id="upV"></label><label class="f">الإصدار الحالي<input value="${attr(v ? v.version : '—')}" disabled></label>
      <label class="f full">ما الجديد في هذا الإصدار<input id="upN"></label></div><p class="small muted">الإصدار السابق يبقى محفوظًا، ويمكن الرجوع إليه من «الإصدارات». بيانات البرنامج لا تتأثر.</p><div class="err"></div>`,
      `<button class="btn pri" id="upOk">رفع واعتماد</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#upOk').onclick = (ev) => busy(ev.target, async () => { const f = $('#upF').files[0]; const text = await readHtml(f); await pushVersion(id, f, text, val('upV'), val('upN'));
      S.apps = await D.select('org_apps'); await loadVers(); C.close(); refresh(); toast('رُفع الإصدار الجديد واعتُمد.'); });
  };
  C.upPick = (inp) => { const f = inp.files[0]; if (f && !val('upV')) $('#upV').value = detectVer(f.name, ''); };
  C.appVers = async (id) => { if (!ownerOnly()) return;
    const a = S.apps.find((x) => x.id === id); const vs = (await loadVers()).filter((v) => v.app_id === id).sort((x, y) => String(y.uploaded_at).localeCompare(String(x.uploaded_at)));
    modal('إصدارات ' + a.name, vs.length ? `<div class="tw"><table><tr><th>الإصدار</th><th>رُفع</th><th>الحجم</th><th>ملاحظات</th><th></th></tr>${vs.map((v) => `<tr><td>${esc(v.version || '—')} ${v.id === a.current_version ? chip('الحالي', 'ok') : ''}</td><td class="small">${fmtDT(v.uploaded_at)}<br>${esc(pName(v.uploaded_by))}</td><td class="num">${(v.size / 1024).toFixed(0)} ك.ب</td><td class="small">${esc(v.notes)}</td>
      <td class="row">${v.id !== a.current_version ? `<button class="btn sm" onclick="C.appUse('${id}','${v.id}')">اعتماده</button>` : ''}<button class="btn sm" onclick="C.appDl('${id}','${v.id}')">تنزيل</button></td></tr>`).join('')}</table></div>` : '<div class="empty">لا توجد إصدارات.</div>', null, true);
  };
  C.appUse = (id, vid) => { if (ownerOnly()) busy(null, async () => { await D.update('org_apps', { current_version: vid }, { eq: { id } }); S.apps = await D.select('org_apps'); C.close(); refresh(); toast('اعتُمد الإصدار المختار.'); }); };
  C.appDl = (id, vid) => ownerOnly() && busy(null, async () => { const a = S.apps.find((x) => x.id === id); const v = VERS[vid || a.current_version]; const b = await D.downloadApp(v.path);
    const x = document.createElement('a'); x.href = URL.createObjectURL(b); x.download = a.name + (v.version ? ' ' + v.version : '') + '.html'; document.body.appendChild(x); x.click(); setTimeout(() => { URL.revokeObjectURL(x.href); x.remove(); }, 1000); });
  C.appEdit = (id) => {
    const a = S.apps.find((x) => x.id === id); const units = S.units.filter((u) => cap(u.id, 'manage'));
    modal('تعديل ' + a.name, `<div class="formgrid"><label class="f">الاسم<input id="aeN" value="${attr(a.name)}"></label><label class="f">الجهة<select id="aeU">${units.map((u) => opt(u.id, u.name, a.unit_id)).join('')}</select></label>
      <label class="f full">الوصف<input id="aeD" value="${attr(a.description)}"></label>${a.kind !== 'html' ? `<label class="f full">المفتاح أو الرابط<input id="aeT" value="${attr(a.target)}" dir="ltr"></label>` : ''}
      <label class="f">الترتيب<input id="aeS" type="number" value="${attr(a.sort)}"></label><label class="f">الحالة<select id="aeA">${opt('1', 'متاح', a.active ? '1' : '0')}${opt('0', 'موقوف', a.active ? '1' : '0')}</select></label>
      ${isAdmin() ? `<label class="f full">لكل أعضاء هيئة التدريس<select id="aeE">${opt('none', 'لا — حسب الجهة والمصفوفة فقط', a.everyone || 'none')}${opt('view', 'اطلاع لكل عضو', a.everyone)}${opt('use', 'استخدام لكل عضو (مثل قياس المخرجات: كلٌّ بمقرراته)', a.everyone)}</select></label>` : ''}</div><div class="err"></div>`,
      `<button class="btn pri" id="aeOk">حفظ</button>${isAdmin() ? '<button class="btn danger" id="aeDel">حذف البرنامج</button>' : ''}<button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#aeOk').onclick = (ev) => busy(ev.target, async () => { const r = { name: val('aeN'), unit_id: val('aeU'), description: val('aeD'), sort: Number(val('aeS')) || 100, active: val('aeA') === '1' }; if ($('#aeT')) r.target = val('aeT');
      if ($('#aeE') && val('aeE') !== (a.everyone || 'none')) r.everyone = val('aeE');
      await D.update('org_apps', r, { eq: { id } }); S.apps = await D.select('org_apps'); C.close(); refresh(); toast('حُفظ البرنامج.'); });
    if ($('#aeDel')) $('#aeDel').onclick = async () => { if (!(await confirmBox('حذف البرنامج', '<p>يُحذف البرنامج وإصداراته وبياناته المحفوظة لهذه الجهة نهائيًا. نزّل نسخة شاملة قبل الحذف. هل تحذف؟</p>', 'حذف نهائي', true))) return;
      await busy(null, async () => { await D.remove('org_apps', { eq: { id } }); S.apps = await D.select('org_apps'); refresh(); toast('حُذف البرنامج.'); }); };
  };
  C.appOpen = (id) => {
    const a = S.apps.find((x) => x.id === id); if (!a) return;
    if (appLv(a) === 'none') return toast('لا تملك صلاحية فتح هذا البرنامج. يحددها مدير النظام من صلاحيات العضو.', true);
    if (a.kind === 'link') { window.open(a.target, '_blank', 'noopener'); return; }
    if (!a.current_version) return toast('لم يُرفع ملف لهذا البرنامج بعد.', true);
    go('app', { id });
  };

  /* ---- تشغيل البرنامج: ذاكرة المتصفح تتحول إلى قاعدة البيانات ----
     البرنامج في إطار معزول (sandbox دون allow-same-origin، الملف 22): لا يصل إلى جلسة الدخول ولا إلى D ولا إلى الموقع.
     الوسيط داخل الإطار يضع window.parent بديلًا بالأسماء نفسها (CS، __CAPP {app, ctx, ro, owner, level}، COLLEGE، C.go) فلا تتغير البرامج،
     وكل طلب منه رسالة يتحقق منها الموقع (appMsg): مصدرها الإطار المفتوح، ورمز الجلسة، ومستوى المستخدم. */
  const APP_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';
  const APP_GO = ['home', 'courses', 'unit', 'mine', 'alerts', 'memberships', 'faculty'];
  /* ما يصل البرنامج من CS: نسخة مختصرة، ومستواه في هذا البرنامج فقط؛ لا الحسابات ولا بريدها ولا صلاحيات الآخرين */
  const appCS = (appId) => { const sc = S.sched ? Object.assign({}, S.sched) : null; if (sc) delete sc.all;
    const lv = (S.appLv || {})[appId]; return JSON.parse(JSON.stringify({ me: S.me, appLv: lv ? { [appId]: lv } : {}, glob: S.glob, duties: S.duties || {},
      faculty: S.faculty, depts: S.depts, units: S.units, privates: S.privates, settings: S.settings, terms: S.terms, programs: S.programs || [], sched: sc })); };
  const shimFor = (data, boot) => `<script>(function(){var D=${JSON.stringify(data).replace(/</g, '\\u003c')};var B=${JSON.stringify(boot).replace(/</g, '\\u003c')};
var RP=window.parent,seq=0,W={};function post(t,a){RP.postMessage({__capp:B.tok,t:t,a:a},'*')}
function call(t,a){return new Promise(function(res,rej){var id=++seq;W[id]=[res,rej];RP.postMessage({__capp:B.tok,id:id,t:t,a:a},'*')})}
window.addEventListener('message',function(e){var r=e.data;if(e.source!==RP||!r||r.__capp_r!==B.tok||!W[r.id])return;var w=W[r.id];delete W[r.id];r.ok?w[0](r.v):w[1](new Error(r.err||'تعذر الطلب'))});
var P={app:B.app,ctx:B.ctx,ro:B.ro,owner:B.owner,level:B.level,put:function(k,v){post('put',{k:k,v:v})},del:function(k){post('del',{k:k})}};
var FP={CS:B.cs,__CAPP:P,COLLEGE:{publish:function(i){return call('publish',i)},inquire:function(q){return call('inquire',q)},inquiries:function(t){return call('inquiries',t)},qa:function(q,a){return call('qa',{m:q,a:a||{}})},publishData:function(i){return call('publishData',i)},faculty:function(){return call('faculty',{})},loads:function(){return call('loads',{})},dataElements:function(){return call('dataElements',{})},grad:function(m,a){return call('grad',{m:m,a:a||{}})}},
C:{go:function(p,o){post('go',{p:p,o:o})},host:function(a){post('host',{a:a})}},postMessage:function(){}};
try{Object.defineProperty(window,'parent',{value:FP,configurable:true})}catch(e){console.warn(e)}
var PH=new WeakMap(),IP=HTMLIFrameElement.prototype,sd=Object.getOwnPropertyDescriptor(IP,'srcdoc'),cw=Object.getOwnPropertyDescriptor(IP,'contentWindow');
try{Object.defineProperty(IP,'srcdoc',{configurable:true,get:function(){return sd.get.call(this)},set:function(v){PH.set(this,String(v));sd.set.call(this,v)}});
Object.defineProperty(IP,'contentWindow',{configurable:true,get:function(){var w=cw.get.call(this),h=PH.get(this);if(!w||h==null)return w;
return {print:function(){post('print',{html:h})},focus:function(){},blur:function(){},close:function(){},postMessage:function(a,o){w.postMessage(a,o||'*')}}}})}catch(e){console.warn(e)}
var WO=window.open;window.open=function(u){if(u!=null&&u!==''&&u!=='about:blank')return WO.apply(window,arguments);var buf='',fw={closed:false,opener:window,location:{href:'about:blank'},focus:function(){},blur:function(){},print:function(){},close:function(){fw.closed=true},
document:{open:function(){buf='';return fw.document},write:function(){buf+=Array.prototype.join.call(arguments,'')},writeln:function(){buf+=Array.prototype.join.call(arguments,'')+'\\n'},close:function(){if(buf)post('print',{html:buf})}}};return fw};
var m=new Map(Object.keys(D).map(function(k){return [k,D[k]]}));
try{window.sessionStorage.length}catch(e){var sm=new Map();var ss={getItem:function(k){k=String(k);return sm.has(k)?sm.get(k):null},setItem:function(k,v){sm.set(String(k),String(v))},removeItem:function(k){sm.delete(String(k))},clear:function(){sm.clear()},key:function(i){return Array.from(sm.keys())[i]||null}};
Object.defineProperty(ss,'length',{get:function(){return sm.size}});try{Object.defineProperty(window,'sessionStorage',{value:ss,configurable:true})}catch(e2){}}
var api={getItem:function(k){k=String(k);return m.has(k)?m.get(k):null},setItem:function(k,v){k=String(k);v=String(v);m.set(k,v);P.put(k,v)},removeItem:function(k){k=String(k);if(m.has(k)){m.delete(k);P.del(k)}},clear:function(){m.forEach(function(_,k){P.del(k)});m.clear()},key:function(i){return Array.from(m.keys())[i]||null}};
Object.defineProperty(api,'length',{get:function(){return m.size}});
var px=new Proxy(api,{get:function(t,p){if(p in t)return t[p];return (typeof p==='string'&&m.has(p))?m.get(p):undefined},set:function(t,p,v){t.setItem(p,v);return true},deleteProperty:function(t,p){t.removeItem(p);return true},ownKeys:function(){return Array.from(m.keys())},getOwnPropertyDescriptor:function(t,p){return m.has(p)?{value:m.get(p),enumerable:true,configurable:true,writable:true}:undefined},has:function(t,p){return (p in t)||m.has(p)}});
try{Object.defineProperty(window,'localStorage',{value:px,configurable:true})}catch(e){console.warn(e)}
window.storage={get:function(k){return Promise.resolve(m.has(k)?{key:k,value:m.get(k),shared:false}:null)},set:function(k,v){api.setItem(k,v);return Promise.resolve({key:k,value:String(v),shared:false})},delete:function(k){api.removeItem(k);return Promise.resolve({key:k,deleted:true,shared:false})},list:function(p){return Promise.resolve({keys:Array.from(m.keys()).filter(function(k){return !p||k.indexOf(p)===0}),prefix:p,shared:false})}};
})();<\/script>`;
  const injectShim = (html, data, boot) => { const s = shimFor(data, boot);
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + s);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + s);
    return s + html; };
  const setSync = (k, msg) => { const e = $('#appSync'); if (!e) return; e.className = 'small ' + (k === 'err' ? 'bad' : k === 'ok' ? 'good' : 'muted');
    e.textContent = k === 'err' ? 'تعذر الحفظ: ' + (msg || '') + ' (سيُعاد تلقائيًا)' : k === 'ok' ? 'كل التعديلات محفوظة في قاعدة البيانات' : k === 'ro' ? 'للاطلاع فقط: تعديلاتك لن تُحفظ' : 'جارٍ الحفظ…'; };
  function makeRuntime(appId, ro) {
    const R = { app: appId, pending: new Map(), timer: null, flushing: false, again: false, ro, warned: false,
      put(k, v) { if (R.ro) { if (!R.warned) { R.warned = true; toast('للاطلاع فقط: لا تملك صلاحية الحفظ في برامج هذه الجهة.', true); } return; } R.pending.set(k, v); R.sched(); },
      del(k) { if (R.ro) return; R.pending.set(k, null); R.sched(); },
      sched() { clearTimeout(R.timer); setSync('wait'); R.timer = setTimeout(R.flush, 1200); },
      async flush() {
        if (R.flushing) { R.again = true; return; } R.flushing = true; const items = [...R.pending]; R.pending.clear();
        try { for (let i = 0; i < items.length; i += 8) await Promise.all(items.slice(i, i + 8).map(([k, v]) => v === null ? D.rpc('org_app_del', { p_app: appId, p_key: k }) : D.rpc('org_app_put', { p_app: appId, p_key: k, p_value: v }))); setSync('ok'); }
        catch (e) { items.forEach(([k, v]) => { if (!R.pending.has(k)) R.pending.set(k, v); }); setSync('err', pgErr(e)); clearTimeout(R.timer); R.timer = setTimeout(R.flush, 8000); }
        finally { R.flushing = false; if (R.again) { R.again = false; if (R.pending.size) R.flush(); } }
      },
      busy() { return R.pending.size > 0 || R.flushing; } };
    return R;
  }
  /* رسائل البرنامج المعزول: تُقبل من الإطار المفتوح فقط وبرمزه، والحفظ والنشر يمرّان بفحص المستوى نفسه */
  window.addEventListener('message', async (e) => {
    const R = window.__CAPP, f = $('#appFrame'), m = e.data;
    if (!R || !f || VIEW.page !== 'app' || e.source !== f.contentWindow || !m || typeof m !== 'object' || m.__capp !== R.tok) return;
    const a = m.a || {}, reply = (ok, v) => { if (m.id) e.source.postMessage(ok ? { __capp_r: R.tok, id: m.id, ok: true, v } : { __capp_r: R.tok, id: m.id, ok: false, err: v }, '*'); };
    try {
      if (m.t === 'put') { if (typeof a.k === 'string' && a.k.length <= 300) R.put(a.k, String(a.v)); return; }
      if (m.t === 'del') { if (typeof a.k === 'string') R.del(a.k); return; }
      /* أزرار قائمة «⋯» داخل البرنامج: رفع التحديث والتنزيل يفحصان المالك في دالتيهما */
      if (m.t === 'host') { const id = window.__CAPP && window.__CAPP.app; if (a.a === 'reload') C.refresh(); else if (a.a === 'full') { const h = $('#apphost'); if (h) h.classList.toggle('full'); } else if (a.a === 'upload' && id) C.appUpload(id); else if (a.a === 'dl' && id) C.appDl(id); else if (a.a === 'fdsched') C.mOpen('fsch'); else if (a.a === 'schedtool') C.mOpen('sch'); return; }
      if (m.t === 'go' && a.p === 'facEdit') { if (window.__CAPP && window.__CAPP.app === S.settings.facultyDashApp && a.o && a.o.id) { const f = fac(a.o.id); if (f && canEditFac(f)) C.facEdit(a.o.id); else toast('تعديل هذا العضو لمدير النظام ورئيس قسمه.', true); } return; }
      if (m.t === 'go') { if (APP_GO.includes(a.p)) go(a.p, a.o && typeof a.o === 'object' ? { id: a.o.id, tab: a.o.tab } : {}); return; }
      /* الطباعة: صفحة البرنامج تُطبع هنا في إطار بلا سكربتات (allow-same-origin دون allow-scripts)، فلا يُنفَّذ منها شيء بأصل الموقع */
      if (m.t === 'print') { if (typeof a.html !== 'string' || a.html.length > 20e6) return;
        const p = document.createElement('iframe'); p.setAttribute('sandbox', 'allow-same-origin allow-modals'); p.style.cssText = 'position:fixed;width:0;height:0;border:0;left:0;bottom:0';
        document.body.appendChild(p); p.onload = () => setTimeout(() => { try { p.contentWindow.focus(); p.contentWindow.print(); } catch (x) { toast('تعذرت الطباعة.', true); } setTimeout(() => p.remove(), 3000); }, 400);
        p.srcdoc = a.html; return; }
      if (m.t === 'publish') return reply(true, await window.COLLEGE.publish(m.a));
      if (m.t === 'inquire') return reply(true, await window.COLLEGE.inquire(m.a));
      if (m.t === 'inquiries') return reply(true, await window.COLLEGE.inquiries(m.a));
      if (m.t === 'qa') return reply(true, await window.COLLEGE.qa(a.m, a.a));
      if (m.t === 'publishData') return reply(true, await window.COLLEGE.publishData(a));
      if (m.t === 'dataElements') return reply(true, await window.COLLEGE.dataElements());
      if (m.t === 'faculty') return reply(true, await window.COLLEGE.faculty());
      if (m.t === 'loads') return reply(true, await window.COLLEGE.loads());
      if (m.t === 'grad') return reply(true, await window.COLLEGE.grad(a.m, a.a));
      reply(false, 'طلب غير معروف');
    } catch (err) { reply(false, pgErr(err)); }
  });
  window.addEventListener('beforeunload', (e) => { const R = window.__CAPP; if (R && R.busy()) { R.flush(); e.preventDefault(); e.returnValue = 'لم يكتمل الحفظ.'; return e.returnValue; } });
  /* الجدول المعتمد للبرامج (مثل قياس المخرجات): window.parent.CS.sched
     { term: {id, name}, mine: شعب المستخدم في الفصل الحالي, all(): كل الشعب ومحاضروها {id, name_ar, email},
       programs: البرامج الأكاديمية ومنسقوها, courses: كل مقررات الفصل بشعبها وأساتذتها ومنسقها (sched_context، الملف 13),
       my: مقررات المستخدم مع دوره {teacher, coordinator, programCoordinator, sections} }
     وعند فتح برنامج من «مقرراتي» يصله window.parent.__CAPP.ctx = {term, course, code, section, program, role} */
  const progName = (id) => ((S.programs || []).find((p) => p.id === id) || {}).name || '';
  /* دوري في مقرر: أستاذ شعبة، منسق المقرر، منسق برنامجه — من الجدول المعتمد، لا من قسمي */
  const courseRole = (c, fid) => { const p = (S.programs || []).find((x) => x.id === c.program_id);
    const secs = c.sections.filter((s) => s.fac.includes(fid));
    return { teacher: secs.length > 0, coordinator: !!fid && c.coordinator_id === fid, programCoordinator: !!(p && fid && p.coordinator_id === fid), sections: secs.map((s) => s.id) }; };
  const roleKey = (r) => r.teacher && r.coordinator ? 'teacher+coordinator' : r.coordinator ? 'coordinator' : r.teacher ? 'teacher' : r.programCoordinator ? 'program' : 'view';
  const ROLE_TXT = { 'teacher+coordinator': 'أستاذ ومنسق', coordinator: 'منسق المقرر', teacher: 'أستاذ شعبة', program: 'منسق البرنامج', view: 'اطلاع' };
  async function loadSched() {
    const t = curTerm(); if (!t) { S.sched = null; return; }
    const [mine, ctx] = await Promise.all([myFac() ? D.rpc('faculty_courses', { p_faculty: myFac(), p_term: t.id }).catch(() => []) : [], D.rpc('sched_context', { p_term: t.id }).catch(() => null)]);
    if (ctx && ctx.programs) S.programs = ctx.programs.map((p) => Object.assign({}, (S.programs || []).find((x) => x.id === p.id) || {}, p));
    const courses = (ctx && ctx.courses) || [], me = myFac();
    S.sched = { term: { id: t.id, name: t.name }, mine: mine || [], programs: S.programs || [], courses,
      my: me ? courses.map((c) => Object.assign({}, c, { role: courseRole(c, me) })).filter((c) => c.role.teacher || c.role.coordinator) : [],
      all: async () => { const v = await approvedOf(t.id); if (!v) return [];
        return (await versionRows(v.id)).map((r) => Object.assign({}, r, { fac: r.fac.map((id) => { const f = fac(id); return f ? { id: f.id, name_ar: f.name_ar, email: f.email || '' } : null; }).filter(Boolean) })); } };
  }
  /* واجهة البرامج للنشر (الملف 15): البرنامج المفتوح يستدعي window.parent.COLLEGE.*، والموقع ينفذ عبر D.
     المصدر دائمًا البرنامج المفتوح (__CAPP.app)، لا ما يكتبه البرنامج. ولا يتصل البرنامج بقاعدة البيانات.
     publish(items): items = [{course | code, section | section_no?, faculty?, kind, status, progress?, details?, delete?, term?}]
       الأنواع المعيارية: file {status: not_started|in_progress|complete|notes, progress, details:{notes:[]}}
         exam {details:{items:[{name,date,period,room}], questions:'submitted'|'pending', papers:'received'|'pending'}}
         invigilation (faculty) {details:{items:[{name,date,period,room,role}]}}   bb {status: met|unmet, details:{missing:[]}}
     inquire({course, faculty, title, body}) يرسل استفسارًا باسم جهة البرنامج، و inquiries(term?) ما أرسلته جهته وحالته */
  const appCtx = () => { const R = window.__CAPP; if (!R || VIEW.page !== 'app') throw new Error('لا يوجد برنامج مفتوح.'); return R; };
  window.COLLEGE = {
    publish: async (items) => { const R = appCtx(); if (R.ro) throw new Error('للاطلاع فقط: لا يمكن النشر.');
      return D.rpc('course_status_publish', { p_app: R.app, p_items: Array.isArray(items) ? items : [items] }); },
    inquire: async (q) => { const R = appCtx(); q = q || {};
      const id = await D.rpc('course_inquiry_send', { p_app: R.app, p_course: q.course, p_faculty: q.faculty, p_title: q.title || '', p_body: q.body || '', p_term: q.term || null });
      const f = fac(q.faculty), c = ((S.sched || {}).courses || []).find((x) => x.id === q.course);
      if (f && f.profile_app_id) notify([f.profile_app_id], 'استفسار عن ' + (c ? c.code + ' ' + c.name : 'مقررك') + ': ' + (q.title || ''));
      return id; },
    inquiries: async (term) => { const R = appCtx(); return D.rpc('course_inquiries', { p_app: R.app, p_term: term || null }); },
    /* النشر إلى سجل البيانات (الملف 29): [{element, program?, department?, year, term?, value, text?, details?}]؛ يُقبل من البرنامج المسجَّل مصدرًا للعنصر، وتصل القيمة مسودة */
    publishData: async (items) => { const R = appCtx(); return D.rpc('data_publish', { p_app: R.app, p_items: Array.isArray(items) ? items : [] }); },
    /* عناصر هذا البرنامج المصدر، وبرامج الكلية، ليختار الناشر */
    /* لوحة أعضاء هيئة التدريس (الملف 33): للقراءة فقط، وللبرنامج المحدد في الإعدادات فقط؛ والنطاق تفرضه faculty_dash في القاعدة */
    /* الدراسات العليا والبحث العلمي (الملف 43): للبرنامج المحدد؛ والبحث وحده للوحة الأعضاء أيضًا. النطاق والكتابة تفرضهما القاعدة */
    grad: async (m, a) => { const R = appCtx(), mine = R.app === S.settings.gradApp; if (m === 'research' && (mine || R.app === S.settings.facultyDashApp)) return D.select('research_output'); if (!mine) throw new Error('هذه الواجهة لبرنامج الدراسات العليا فقط.'); if (m === 'save') return D.rpc('grad_save', { p_doc: a.doc, p_file: a.file || '' }); if (m === 'read') { const [programs, enrollment, graduates, research, metaL, updates] = await Promise.all(['pg_programs', 'pg_enrollment', 'pg_graduates', 'research_output', 'grad_meta', 'grad_updates'].map((x) => D.select(x))); return { programs, enrollment, graduates, research, meta: metaL[0] || null, updates }; } throw new Error('طلب غير معروف'); },
    faculty: async () => { const R = appCtx(); if (R.app !== S.settings.facultyDashApp) throw new Error('هذه الواجهة للوحة أعضاء هيئة التدريس فقط.'); return D.rpc('faculty_dash'); },
    /* الجدول المعتمد لآخر أربعة فصول، مقصورًا على أعضاء النطاق */
    loads: async () => { const R = appCtx(); if (R.app !== S.settings.facultyDashApp) throw new Error('هذه الواجهة للوحة أعضاء هيئة التدريس فقط.');
      const ok = new Set(((await D.rpc('faculty_dash')).rows || []).map((x) => x.id)), terms = [];
      for (const t of S.terms.slice(-4)) { const v = await approvedOf(t.id); if (!v) continue;
        terms.push({ id: t.id, term: t.name, date: String(v.approved_at || '').slice(0, 10), src: v.source_name || 'الجدول المعتمد في الموقع', rows: (await versionRows(v.id)).map((r) => Object.assign({}, r, { fac: r.fac.filter((x) => ok.has(x)) })).filter((r) => r.fac.length) }); }
      return { cur: (curTerm() || {}).id, terms }; },
    dataElements: async () => { const R = appCtx(); return (await D.select('data_elements', { eq: { source_app_id: R.app } })).filter((e) => e.active !== false).map((e) => ({ code: e.code, name: e.name_ar, level: e.level, period: e.period_kind, unit: e.unit })); },
    /* مكتبة التوصيفات ومسار ملف المقرر (الملف 24): qa(method, args). الصلاحية تفرضها دوال القاعدة؛ الموقع يمرر فقط.
       roles → [{program, level: approve|review|view|null, coordinator, quality, quality_unit}]
       library {program} → {spec, plos, plan, matrix, courses:[{course_code,…,clos}], annual, can_edit}
       saveProgram {program, data:{version, year, info, source, status, plos, plan, matrix}} · saveCourses {items:[{code, name, info, flags, source, clos}]}
       deleteCourse {code} · setLevel {program, faculty, level: view|review|approve|null}
       move {term?, course, to: prepared|draft|submitted|in_review|returned|approved, note?, reviewer?} · board {term?, program} · history {term?, course} */
    qa: async (method, a) => { const R = appCtx(); a = a || {}; const term = a.term || (curTerm() || {}).id || null;
      const map = {
        roles: () => D.rpc('qa_my_roles', {}),
        library: () => D.rpc('spec_library', { p_program: a.program }),
        saveProgram: () => D.rpc('spec_program_save', { p_program: a.program, p_data: a.data || {} }),
        saveCourses: () => D.rpc('course_spec_save', { p_items: Array.isArray(a.items) ? a.items : [] }),
        deleteCourse: () => D.rpc('course_spec_delete', { p_code: a.code }),
        setLevel: () => D.rpc('qa_level_set', { p_program: a.program, p_faculty: a.faculty, p_level: a.level || null }),
        move: () => D.rpc('course_file_move', { p_app: R.app, p_term: term, p_course: a.course, p_to: a.to, p_note: a.note || '', p_reviewer: a.reviewer || null }),
        board: () => D.rpc('course_file_board', { p_term: term, p_program: a.program }),
        history: () => D.rpc('course_file_history', { p_term: term, p_course: a.course }) };
      if (!map[method]) throw new Error('طلب غير معروف: ' + method);
      return map[method](); }
  };
  /* فتح برنامج على مقرر: من بطاقة المقرر أو أزرار «مقرراتي» */
  C.appOpenCtx = (appId, courseId, sectionId) => {
    const c = ((S.sched || {}).courses || []).find((x) => x.id === courseId); if (!c) return C.appOpen(appId);
    const r = courseRole(c, myFac());
    const a = S.apps.find((x) => x.id === appId); if (!a) return toast('البرنامج المرتبط بهذا الزر غير موجود. يضبطه مدير النظام من «البرامج والتحديثات».', true);
    if (appLv(a) === 'none') return toast('لا تملك صلاحية فتح هذا البرنامج.', true);
    if (!a.current_version && a.kind !== 'link') return toast('لم يُرفع ملف لهذا البرنامج بعد.', true);
    if (a.kind === 'link') { window.open(a.target, '_blank', 'noopener'); return; }
    go('app', { id: appId, ctx: { term: S.sched.term.id, course: c.id, code: c.code, name: c.name, section: sectionId || (r.sections.length === 1 ? r.sections[0] : null), program: c.program_id, degree: c.degree, role: roleKey(r) } });
  };
  async function pgApp() {
    const a = S.apps.find((x) => x.id === VIEW.id); if (!a) return '<div class="panel" style="margin:20px">البرنامج غير موجود.</div>';
    await loadVers(); const v = VERS[a.current_version]; if (!v) return '<div class="panel" style="margin:20px">لم يُرفع ملف لهذا البرنامج.</div>';
    const [blob, rows] = await Promise.all([D.downloadApp(v.path), D.select('org_app_data', { eq: { app_id: a.id }, cols: 'key,value' })]);
    const html = await blob.text(); const data = {}; rows.forEach((r) => { data[r.key] = r.value; });
    const ro = !['use', 'manage'].includes(appLv(a));
    await loadSched();
    const R = (window.__CAPP = makeRuntime(a.id, ro)); R.ctx = VIEW.ctx || null;
    R.tok = Math.random().toString(36).slice(2) + Date.now().toString(36);
    /* owner = مدير النظام فقط (تنزيل البرنامج والنسخة الاحتياطية الشاملة واستعادتها داخل البرامج)؛ level = مستوى المستخدم في البرنامج */
    const boot = { tok: R.tok, app: a.id, ctx: R.ctx, ro, owner: isAdmin(), level: appLv(a), cs: appCS(a.id) };
    VIEW.after = () => { const f = $('#appFrame'); f.setAttribute('sandbox', APP_SANDBOX); f.onload = () => { const w = document.querySelector('.app-wait'); if (w) w.remove(); f.style.background = '#fff'; }; f.srcdoc = injectShim(html, data, boot); setSync(ro ? 'ro' : 'ok'); };
    await loadTpl(); const tl = TPLS.filter((t) => t.app_id === a.id && t.active);
    return `<div id="apphost" class="${(VIEW.ctx || {}).embed ? 'embed' : ''}"><div class="bar">${viewRole() !== 'staff' && isMgmt() ? `<button class="btn sm" onclick="C.go('home')">${icon('back')}الرئيسية</button>` : `<button class="btn sm" onclick="C.go('unit',{id:'${a.unit_id}',tab:'apps'})">${icon('back')}${esc(uName(a.unit_id))}</button>`}
      <b>${esc(a.name)}</b><span class="small muted">الإصدار ${esc(v.version || '—')}</span><span id="appSync" class="small muted"></span><span class="grow"></span>
      <button class="btn sm" onclick="C.refresh()">إعادة تحميل</button><button class="btn sm" onclick="document.getElementById('apphost').classList.toggle('full')">ملء الشاشة</button>
      ${tl.length ? `<button class="btn sm pri" onclick="C.appForms('${a.id}')">${icon('form')}النماذج (${tl.length})</button>` : ''}${isAdmin() ? `<button class="btn sm" onclick="C.appDl('${a.id}')">تنزيل النسخة</button><button class="btn sm" onclick="C.appUpload('${a.id}')">رفع تحديث</button>` : ''}</div>
      <div class="app-wait">جارٍ فتح البرنامج…</div><iframe id="appFrame" title="${attr(a.name)}" sandbox="${APP_SANDBOX}" allow="clipboard-read; clipboard-write; fullscreen"></iframe></div>`;
  }

  C.appForms = (id) => { const a = S.apps.find((x) => x.id === id); const u = unit(a.unit_id); const tl = TPLS.filter((t) => t.app_id === id && t.active);
    modal('نماذج ' + a.name, `<div class="mlist">${tl.map((t) => `<div><span class="grow"><b>${esc(t.name)}</b>${t.required ? ' ' + chip('مطلوب', 'brass') : ''}<div class="tiny muted">${esc(t.description || '')}</div></span>
      ${cap(u.id, 'write') ? `<button class="btn sm pri" onclick="C.close();C.issue('${t.id}','${u.id}')">إصدار</button>` : ''}<button class="btn sm" onclick="C.tplBlank('${t.id}')">الفارغ</button></div>`).join('')}</div>`); };
  /* =====================================================================
     الملفات، الإشعارات، الاستعلامات، دليل المستخدم، حسابي
     ===================================================================== */
  async function pgFiles() {
    const rs = await D.select('org_requests', { cols: 'id,unit_id,title,attachments' });
    const list = []; rs.forEach((r) => (r.attachments || []).forEach((a, i) => list.push({ r, a, i })));
    list.sort((x, y) => String(y.a.at).localeCompare(String(x.a.at)));
    return list.length ? `<p class="small muted">مرفقات المهام والطلبات في الجهات التي تتبعها (${list.length}).</p><div class="tw"><table><tr><th>الملف</th><th>الجهة</th><th>المهمة</th><th>الحجم</th><th>رُفع</th></tr>${list.map((x) => `<tr><td><a href="#" onclick="C.attGet('${x.r.id}',${x.i});return false">${esc(x.a.name)}</a></td><td>${esc(uName(x.r.unit_id))}</td><td><a href="#" onclick="C.openReq('${x.r.id}');return false">${esc(x.r.title)}</a></td><td class="num">${(x.a.size / 1024).toFixed(0)} ك.ب</td><td class="small">${fmtDT(x.a.at)} · ${esc(pName(x.a.by))}</td></tr>`).join('')}</table></div>`
      : '<div class="empty">لا توجد مرفقات بعد. تُرفع الملفات من داخل كل مهمة أو طلب.</div>';
  }
  async function bellCount() { try { const n = (await D.select('notifs', { eq: { to_user: S.me.app_id }, cols: 'id,data' })).filter((x) => !(x.data || {}).read).length + (S.urgentN || 0); const b = $('#bellN'); if (b) { b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hidden', !n); } } catch (e) {} }
  async function pgNotifs() {
    const ns = (await D.select('notifs', { eq: { to_user: S.me.app_id }, cols: 'id,data,created_at' })).sort((a, b) => String((b.data || {}).at).localeCompare(String((a.data || {}).at))).slice(0, 100); S._ns = ns;
    const unread = ns.filter((n) => !(n.data || {}).read).length;
    return `${S.urgentN ? `<div class="panel row" style="margin-bottom:12px;align-items:center"><b class="grow">لديك ${S.urgentN} من التنبيهات</b><button class="btn sm pri" onclick="C.go('alerts')">فتح تنبيهاتي</button></div>` : ''}<div class="row" style="margin-bottom:12px"><span class="grow small muted">${unread} غير مقروء. </span>${unread ? '<button class="btn sm" onclick="C.notifRead(this)">تعليم الكل كمقروء</button>' : ''}</div>
      ${ns.length ? `<div class="mlist">${ns.map((n) => `<div class="${(n.data || {}).read ? 'past' : ''}"><span class="grow">${(n.data || {}).read ? '' : '<b>● </b>'}${esc((n.data || {}).text)}</span><span class="small muted">${fmtDT((n.data || {}).at)}</span></div>`).join('')}</div>` : '<div class="empty">لا توجد إشعارات.</div>'}`;
  }
  C.notifRead = (btn) => busy(btn, async () => { for (const n of S._ns.filter((x) => !(x.data || {}).read)) await D.update('notifs', { data: Object.assign({}, n.data, { read: true }) }, { eq: { id: n.id } }); bellCount(); refresh(); });
  const SQ = { q: '' };
  async function pgSearch() {
    const q = SQ.q.trim(); let res = '';
    if (q.length >= 2) {
      const ql = q.toLowerCase(); const has = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(ql));
      const [courses, reqs] = await Promise.all([D.select('courses'), D.select('org_requests', { cols: 'id,unit_id,title,status' })]);
      const fa = S.faculty.filter((f) => has(f.name_ar, f.name_en, f.email, f.employee_no, f.specialty)).slice(0, 30);
      const co = courses.filter((c) => has(c.code, c.name_ar, c.name_en)).slice(0, 30);
      const un = S.units.filter((u) => has(u.name, u.description)).slice(0, 30);
      const rq = reqs.filter((r) => has(r.title)).slice(0, 30);
      const ap = S.apps.filter((a) => has(a.name, a.description)).slice(0, 30);
      const sec = (t, l, f) => l.length ? `<h2 style="margin:18px 0 8px">${t} (${l.length})</h2><div class="mlist">${l.map(f).join('')}</div>` : '';
      res = sec('أعضاء هيئة التدريس', fa, (f) => `<div><a class="grow" href="#" onclick="C.facView('${f.id}');return false">${esc(f.name_ar)}</a><span class="small muted">${esc(f.rank)} · ${esc(uName(f.department_id))}</span></div>`) +
        sec('المقررات', co, (c) => `<div><span class="grow">${esc(c.code)} ${esc(c.name_ar)}</span><span class="small muted">${esc(c.credit_hours)} ساعات · ${esc(uName(c.department_id))}</span></div>`) +
        sec('الجهات', un, (u) => `<div><a class="grow" href="#" onclick="C.go('unit',{id:'${u.id}'});return false">${esc(u.name)}</a>${chip(KIND[u.kind])}</div>`) +
        sec('المهام والطلبات', rq, (r) => `<div><a class="grow" href="#" onclick="C.openReq('${r.id}');return false">${esc(r.title)}</a><span class="small muted">${esc(uName(r.unit_id))}</span></div>`) +
        sec('البرامج', ap, (a) => `<div><a class="grow" href="#" onclick="C.appOpen('${a.id}');return false">${esc(a.name)}</a><span class="small muted">${esc(uName(a.unit_id))}</span></div>`) || '<div class="empty">لا توجد نتائج.</div>';
    }
    VIEW.after = () => { const i = $('#sq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
    return `<input class="inp" id="sq" style="width:100%;max-width:560px;font-size:16px;padding:10px 14px" placeholder="ابحث عن عضو أو مقرر أو جهة أو مهمة أو برنامج…" value="${attr(SQ.q)}" oninput="C.sq(this.value)" aria-label="بحث">${q.length >= 2 ? res : '<p class="small muted">اكتب حرفين على الأقل.</p>'}`;
  }
  let sqT; C.sq = (v) => { SQ.q = v; clearTimeout(sqT); sqT = setTimeout(refresh, 300); };
  C.guide = () => modal('دليل المستخدم', `<h3>البدء</h3><p>ادخل بالبريد الجامعي وكلمة المرور التي سلّمك إياها مدير النظام، وغيّرها عند أول دخول.</p>
    <h3>جهتك</h3><p>من القائمة الجانبية افتح «الوحدات» أو «اللجان» أو «الأقسام العلمية» ثم جهتك: فيها المهام والطلبات والأعضاء والبرامج وسجل التغييرات.</p>
    <h3>البرامج</h3><p>تفتح برامج جهتك من تبويب «البرامج». مسؤول الجهة يضيف برنامجًا أو يرفع تحديثه من «الإعدادات ← البرامج والتحديثات». بيانات البرنامج تُحفظ في الخادم ويراها أعضاء الجهة.</p>
    <h3>المهام</h3><p>«المهام والتكليفات» تعرض كل ما في جهاتك. أضف التعليقات والمرفقات من داخل المهمة.</p>
    <h3>الصلاحيات</h3><p>ترى ما يخص جهاتك فقط. إن احتجت صلاحية إضافية فاطلبها من مدير النظام.</p>`);
  C.userMenu = () => modal(S.me.name, `<dl class="kv"><dt>الحساب</dt><dd>${esc(S.me.app_id)}</dd><dt>الدور</dt><dd>${isAdmin() ? 'مدير النظام' : esc(leadTitle() || 'مستخدم')}</dd>
    <dt>السجل في القاعدة</dt><dd>${myFac() ? esc(fName(myFac())) : 'غير مرتبط'}</dd></dl>`,
    `<button class="btn" onclick="C.close();C.go('apps')">${icon('app')}برامجي</button>${myFac() ? `<button class="btn" onclick="C.close();C.facView('${myFac()}')">${icon('user')}بطاقتي</button>` : ''}${!DEMO ? '<button class="btn" onclick="C.changePass()">تغيير كلمة المرور</button>' : ''}<button class="btn danger" onclick="C.close();C.logout()">${icon('logout')}خروج</button><button class="btn" onclick="C.close()">إغلاق</button>`);
  C.changePass = () => {
    modal('تغيير كلمة المرور', `<div class="formgrid"><label class="f">كلمة المرور الجديدة<input type="password" id="cp1" dir="ltr" autocomplete="new-password"></label><label class="f">تأكيدها<input type="password" id="cp2" dir="ltr" autocomplete="new-password"></label></div><div class="err"></div>`,
      `<button class="btn pri" id="cpOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#cpOk').onclick = (ev) => busy(ev.target, async () => { const a = val('cp1'); if (a.length < 10 || !/\d/.test(a) || !/[^\d]/.test(a)) throw new Error('10 أحرف على الأقل، تجمع حروفًا وأرقامًا.'); if (a !== val('cp2')) throw new Error('كلمتا المرور غير متطابقتين.');
      await D.auth.setPassword(a); C.close(); toast('حُفظت كلمة المرور.'); });
  };

  /* =====================================================================
     النسخ الاحتياطي والنقل إلى قاعدة بيانات الجامعة
     ===================================================================== */
  /* كل جداول القاعدة بترتيب يحترم العلاقات. أي جدول جديد يُضاف هنا (قواعد النقل في CLAUDE.md). */
  const BK = [['org_roles', 'key'], ['org_settings', 'id'], ['profiles', 'id'], ['org_units', 'id'], ['faculty', 'id'], ['faculty_private', 'faculty_id'], ['faculty_extra', 'faculty_id'], ['faculty_aliases', 'alias'], ['programs', 'id'], ['org_members', 'id'], ['org_grants', 'id'],
    ['org_exclusions', 'grant_id,unit_id'], ['org_changes', 'id'], ['terms', 'id'], ['courses', 'id'], ['sched_versions', 'id'], ['offerings', 'id'], ['sections', 'id'], ['teaching', 'id'],
    ['course_coords', 'term_id,course_id'],
    ['org_requests', 'id'], ['org_announcements', 'id'], ['org_apps', 'id'], ['org_app_versions', 'id'], ['org_app_data', 'app_id,key'], ['org_app_fac', 'app_id,faculty_id'],
    ['org_app_access', 'app_id,profile_app_id'], ['org_app_duties', 'id'], ['course_status', 'id'],
    ['spec_programs', 'program_id'], ['spec_plos', 'program_id,code'], ['spec_plan', 'program_id,course_code'], ['spec_matrix', 'program_id,course_code,plo_code'],
    ['course_specs', 'course_code'], ['course_clos', 'course_code,code'], ['annual_reports', 'program_id,year'], ['portal_links', 'id'], ['portal_advisors', 'id'], ['honor_list', 'id'], ['study_plans', 'program_id'], ['study_plan_groups', 'program_id,group_name'], ['study_plan_courses', 'program_id,course_code,group_name'], ['pg_programs', 'program'], ['pg_enrollment', 'id'], ['pg_graduates', 'id'], ['research_output', 'id'], ['grad_meta', 'id'], ['grad_updates', 'id'], ['qa_levels', 'program_id,faculty_id'],
    ['course_file_flow', 'term_id,course_id'], ['course_file_events', 'id'], ['data_elements', 'code'], ['kpis', 'id'], ['program_kpis', 'program_id,kpi_id'], ['data_values', 'id'], ['kpi_results', 'id'], ['data_requests', 'id'], ['org_templates', 'id'], ['org_report_log', 'id'], ['notifs', 'id'], ['audit_log', 'id']];
  const blobB64 = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  const save = (name, text, type) => { const x = document.createElement('a'); x.href = URL.createObjectURL(new Blob([text], { type })); x.download = name; document.body.appendChild(x); x.click(); setTimeout(() => { URL.revokeObjectURL(x.href); x.remove(); }, 1500); };
  function pgBackup() {
    if (!isAdmin()) return '<div class="panel">هذه الصفحة لمدير النظام.</div>';
    return `<div class="grid2"><div class="panel"><h2>نسخة شاملة</h2><p class="small">كل بيانات نظام الكلية في ملف واحد: الهيكل والأعضاء والتكليفات والصلاحيات والجداول والمهام والإعلانات والبرامج وبياناتها. احفظها أسبوعيًا مع نسخ منصة اللجان في Google Drive.</p>
        <label class="row small"><input type="checkbox" id="bkF" checked>تضمين ملفات البرامج والمرفقات</label>
        <div class="row" style="margin-top:12px"><button class="btn pri" onclick="C.bkJson(this)">${icon('db')}تنزيل نسخة شاملة الآن</button></div><div id="bkLog" class="small muted" style="margin-top:8px"></div></div>
      <div class="panel"><h2>الاستعادة من نسخة شاملة</h2><p class="small">لمشروع Supabase جديد بعد تنفيذ ملفات قاعدة البيانات، أو لإرجاع ما حُذف بالخطأ.</p>
        <label class="f">الطريقة<select id="rsM">${opt('add', 'إضافة المفقود فقط (لا يمس الموجود)')}${opt('replace', 'إضافة المفقود واستبدال المطابق')}</select></label>
        <label class="f" style="margin-top:8px">ملف النسخة (JSON)<input type="file" id="rsF" accept=".json"></label>
        <div class="row" style="margin-top:12px"><button class="btn" onclick="C.bkRestore(this)">بدء الاستعادة</button></div><div id="rsLog" class="small" style="margin-top:8px;max-height:220px;overflow:auto"></div></div>
      <div class="panel"><h2>النقل إلى قاعدة بيانات الجامعة</h2><p class="small">بعد التجربة، يُنقل النظام كاملًا إلى خادم الجامعة. قاعدة البيانات PostgreSQL قياسية، وملفات مجلد database (من 1 إلى آخر رقم) تنشئ الجداول نفسها هناك. ثم تُنقل البيانات بأحد الملفين:</p>
        <div class="row"><button class="btn" onclick="C.bkSql(this)">ملف SQL للبيانات</button><button class="btn" onclick="C.bkXlsx(this)">ملف Excel لكل الجداول</button></div>
        <p class="small muted" style="margin-top:8px">ملف SQL يحتوي أوامر إدراج آمنة لإعادة التنفيذ (on conflict do nothing) بترتيب يحترم العلاقات. الحسابات وكلمات المرور لا تُنقل؛ يُعاد ربطها بنظام الدخول الموحد للجامعة.</p></div></div>`;
  }
  async function collect(withFiles, log) {
    const out = { format: 'jouf-college-backup', version: 2, at: new Date().toISOString(), college: S.settings.collegeName || '', tables: {}, files: {}, errors: {} };
    for (const [t] of BK) { log('جارٍ قراءة ' + t + '…'); try { out.tables[t] = await D.select(t); } catch (e) { out.tables[t] = []; out.errors[t] = pgErr(e); } }
    if (withFiles) {
      const grab = async (key, fn) => { if (out.files[key]) return; try { out.files[key] = await blobB64(await fn()); } catch (e) { out.errors[key] = pgErr(e); } };
      for (const v of out.tables.org_app_versions) await grab('org-apps/' + v.path, () => D.downloadApp(v.path));
      for (const r of out.tables.org_requests) for (const a of r.attachments || []) await grab('org-files/' + a.path, () => D.download(a.path));
      for (const r of out.tables.org_report_log) if (r.file_path) await grab('org-files/' + r.file_path, () => D.download(r.file_path));
      for (const t of out.tables.org_templates) if (t.file_path) await grab('org-templates/' + t.file_path, () => D.downloadTpl(t.file_path));
      for (const s of out.tables.org_settings) { const p = s.data && s.data.assist && s.data.assist.chatFile; if (p) await grab('org-public/' + p, () => D.downloadPublic(p)); }
    }
    return out;
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  C.bkJson = (btn) => busy(btn, async () => { const l = (m) => { $('#bkLog').textContent = m; }; const b = await collect(val('bkF'), l);
    save('نسخة-نظام-الكلية-' + stamp() + '.json', JSON.stringify(b), 'application/json');
    const errs = Object.keys(b.errors); l('اكتملت: ' + Object.values(b.tables).reduce((a, x) => a + x.length, 0) + ' سجل من ' + BK.length + ' جدولًا و' + Object.keys(b.files).length + ' ملف.' +
      (errs.length ? ' تنبيه: تعذرت قراءة ' + errs.length + ' (' + errs.slice(0, 4).join('، ') + ')، والتفاصيل في الملف تحت errors.' : ''));
    if (errs.length) toast('تعذرت قراءة بعض الجداول أو الملفات؛ انظر السطر تحت الزر.', true); });
  C.bkXlsx = (btn) => busy(btn, async () => { const b = await collect(false, () => {});
    xlsxOut('نظام-الكلية-كل-الجداول-' + stamp() + '.xlsx', BK.map(([t]) => { const rows = b.tables[t]; const cols = rows.length ? Object.keys(rows[0]) : ['—'];
      return { name: t, head: cols, rows: rows.map((r) => cols.map((c) => r[c] == null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])) }; })); });
  const sqlVal = (v) => v === null || v === undefined ? 'null' : typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'number' ? String(v) : typeof v === 'object' ? "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb" : "'" + String(v).replace(/'/g, "''") + "'";
  C.bkSql = (btn) => busy(btn, async () => { const b = await collect(false, () => {}); if (Object.keys(b.errors).length) throw new Error('تعذرت قراءة: ' + Object.keys(b.errors).join('، '));
    let s = '-- بيانات نظام إدارة كلية الأعمال — ' + b.at + '\n-- نفّذ ملفات مجلد database بالترتيب (1 إلى آخر رقم) أولًا، ثم هذا الملف.\n' +
      '-- جدول profiles مرتبط بحسابات الدخول (auth.users) ولا يحوي كلمات مرور؛ انظر دليل النقل لإعادة ربطه بحسابات الجامعة.\nbegin;\nset session_replication_role = replica; -- تعطيل المشغلات أثناء النقل\n';
    for (const [t] of BK) { let rows = b.tables[t]; if (!rows.length) continue; if (t === 'org_units') rows = sortUnits(rows);
      const cols = Object.keys(rows[0]); s += `\n-- ${t} (${rows.length})\n`;
      rows.forEach((r) => { s += `insert into public.${t} (${cols.join(', ')}) values (${cols.map((c) => sqlVal(r[c])).join(', ')}) on conflict do nothing;\n`; }); }
    s += "\nselect setval(pg_get_serial_sequence('public.audit_log', 'id'), greatest(coalesce(max(id), 0), 1), max(id) is not null) from public.audit_log;\n" +
      "select setval(pg_get_serial_sequence('public.org_changes', 'id'), greatest(coalesce(max(id), 0), 1), max(id) is not null) from public.org_changes;\n";
    s += '\nset session_replication_role = default;\ncommit;\n'; save('نظام-الكلية-بيانات-' + stamp() + '.sql', s, 'text/plain'); });
  const sortUnits = (rows) => { const by = new Map(rows.map((r) => [r.id, r])); const depth = (r, n = 0) => (r.parent_id && by.has(r.parent_id) && n < 60 ? depth(by.get(r.parent_id), n + 1) + 1 : 0); return rows.slice().sort((a, b) => depth(a) - depth(b)); };
  C.bkRestore = async (btn) => {
    const f = $('#rsF').files[0]; if (!f) return toast('اختر ملف النسخة.', true);
    if (!(await confirmBox('بدء الاستعادة', `<p>ستُستعاد البيانات بطريقة «${val('rsM') === 'add' ? 'إضافة المفقود فقط' : 'إضافة المفقود واستبدال المطابق'}». يُفضل تنزيل نسخة شاملة من الوضع الحالي أولًا. متابعة؟</p>`, 'بدء الاستعادة'))) return;
    await busy(btn, async () => {
      const log = (m, bad) => { $('#rsLog').insertAdjacentHTML('beforeend', `<div class="${bad ? 'bad' : ''}">${esc(m)}</div>`); };
      const b = JSON.parse(await f.text()); if (b.format !== 'jouf-college-backup') throw new Error('الملف ليس نسخة من نظام إدارة الكلية.');
      const ignore = val('rsM') === 'add'; const profs = new Set(S.profiles.map((p) => p.app_id)); const pids = new Set(S.profiles.map((p) => p.id));
      for (const [t, pk] of BK) {
        let rows = (b.tables[t] || []).map((r) => Object.assign({}, r)); if (!rows.length) continue;
        if (t === 'profiles') {
          /* الحسابات لا تُنشأ من النسخة (كلمات المرور لا تُصدَّر): تُحدَّث بيانات الحسابات الموجودة فقط */
          let ok = 0; const miss = rows.filter((r) => !pids.has(r.id));
          if (!ignore) for (const r of rows.filter((x) => pids.has(x.id))) { try { await D.update('profiles', { name: r.name, title: r.title, college_role: r.college_role, active: r.active, is_admin: r.is_admin }, { eq: { id: r.id } }); ok++; } catch (e) { log('profiles ' + r.username + ': ' + pgErr(e), true); } }
          log('profiles: ' + (ignore ? 'الحسابات الموجودة تبقى كما هي' : ok + ' حساب حُدّث') + (miss.length ? '، و' + miss.length + ' حساب غير موجود هنا يُنشأ من «الحسابات» ثم يُربط بسجل العضو بالبريد' : ''), !!miss.length);
          continue;
        }
        if (t === 'org_units') rows = sortUnits(rows);
        if (t === 'faculty') rows.forEach((r) => { if (r.profile_app_id && !profs.has(r.profile_app_id)) r.profile_app_id = null; });
        if (t === 'org_grants' || t === 'org_app_access') rows = rows.filter((r) => profs.has(r.profile_app_id));
        if (t === 'notifs') rows = rows.filter((r) => profs.has(r.to_user));
        let ok = 0; for (let i = 0; i < rows.length; i += 200) { try { await D.upsertMany(t, rows.slice(i, i + 200), pk, ignore); ok += Math.min(200, rows.length - i); } catch (e) { log(t + ': ' + pgErr(e), true); } }
        log(t + ': ' + ok + ' سجل');
      }
      try { await D.rpc('org_after_restore'); } catch (e) { log('ضبط العدادات: ' + pgErr(e) + ' (نفّذ ملف database/12_backup_restore.sql)', true); }
      const UP = { 'org-apps': D.uploadApp, 'org-templates': D.uploadTpl, 'org-public': D.uploadPublic, 'org-files': D.upload };
      let nf = 0; for (const k of Object.keys(b.files || {})) { try { const blob = await (await fetch(b.files[k])).blob(); const [bucket, ...rest] = k.split('/'); const p = rest.join('/');
        await (UP[bucket] || D.upload)(p, blob); nf++; } catch (e) { /* موجود من قبل */ } }
      log('الملفات: ' + nf); await loadAll(); renderShell(); log('اكتملت الاستعادة.'); toast('اكتملت الاستعادة.');
    });
  };

  /* =====================================================================
     المرشد الأكاديمي (الشات بوت) والدعم الفني: زران ثابتان في أسفل الصفحة
     ===================================================================== */
  IC.chat = '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>';
  IC.screen = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>';
  IC.headset = '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20c0 1-1.5 2-4 2h-2"/>';
  IC.form = '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 15h6M9 18h3"/>';
  IC.print = '<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="9" rx="1.5"/><path d="M7 14h10v7H7z"/>';
  const ASSIST = { cfg: null, open: null };
  const publicUrl = (path) => (CFG.supabaseUrl || '') + '/storage/v1/object/public/org-public/' + path;
  async function chatHtml(c) { if (DEMO) return DM().publicText(c.chatFile); const r = await fetch(publicUrl(c.chatFile), { cache: 'no-cache' }); if (!r.ok) throw new Error('تعذر تحميل المرشد'); return r.text(); }
  function renderDock(cfg, loggedIn) {
    ASSIST.cfg = cfg || {}; ASSIST.logged = loggedIn;
    let d = document.getElementById('dock');
    if (!d) { d = document.createElement('div'); d.id = 'dock'; document.body.appendChild(d); }
    const c = ASSIST.cfg, sup = c.support || {};
    const hasChat = c.chatSrc && c.chatSrc !== 'none' && (loggedIn || c.public);
    const hasSup = loggedIn || sup.whatsapp || sup.email;
    d.innerHTML = `<div id="dockPanel" class="hidden" role="dialog" aria-labelledby="dockTitle"><header><b id="dockTitle"></b><span class="grow"></span><span id="dockExtra"></span><button class="btn ghost sm" onclick="C.dock(null)" aria-label="إغلاق">✕</button></header><div id="dockBody"></div></div>
      ${hasSup ? `<button class="fab sup" onclick="C.dock('sup')" aria-label="الدعم الفني" title="الدعم الفني">${icon('headset')}<span>الدعم الفني</span></button>` : ''}
      ${hasChat ? `<button class="fab chat" onclick="C.dock('chat')" aria-label="${attr(c.chatName || 'المرشد الأكاديمي')}" title="${attr(c.chatName || 'المرشد الأكاديمي')}">${icon('chat')}<span>${esc(c.chatName || 'المرشد الأكاديمي')}</span></button>` : ''}`;
  }
  C.dock = async (which) => {
    const p = $('#dockPanel'); if (!p) return;
    if (!which || ASSIST.open === which) { p.classList.add('hidden'); ASSIST.open = null; $('#dockBody').innerHTML = ''; return; }
    ASSIST.open = which; p.classList.remove('hidden'); const c = ASSIST.cfg, sup = c.support || {};
    if (which === 'chat') {
      $('#dockTitle').textContent = c.chatName || 'المرشد الأكاديمي';
      $('#dockBody').innerHTML = `${c.welcome ? `<div class="small" style="padding:8px 12px;background:var(--ledger-soft)">${esc(c.welcome)}</div>` : ''}<iframe id="chatFrame" title="${attr(c.chatName || 'المرشد الأكاديمي')}" allow="clipboard-write; microphone"></iframe>`;
      if (c.chatSrc === 'url') { $('#chatFrame').src = c.chatUrl; $('#dockExtra').innerHTML = `<a class="btn ghost sm" href="${attr(c.chatUrl)}" target="_blank" rel="noopener">نافذة مستقلة</a>`; }
      else { $('#dockExtra').innerHTML = ''; try { const cf = $('#chatFrame'); cf.setAttribute('sandbox', APP_SANDBOX); cf.srcdoc = await chatHtml(c); } catch (e) { $('#dockBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; } }
    } else {
      $('#dockTitle').textContent = 'الدعم الفني'; $('#dockExtra').innerHTML = '';
      const wa = String(sup.whatsapp || '').replace(/\D/g, '');
      $('#dockBody').innerHTML = `<div style="padding:14px 16px;overflow:auto">
        ${sup.note ? `<p class="small">${esc(sup.note)}</p>` : '<p class="small">واجهت مشكلة في النظام أو في أحد البرامج؟ تواصل معنا.</p>'}
        <div class="row" style="margin-bottom:10px">${wa ? `<a class="btn pri sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent('دعم نظام إدارة الكلية: ')}">واتساب الدعم</a>` : ''}${sup.email ? `<a class="btn sm" href="mailto:${attr(sup.email)}?subject=${encodeURIComponent('دعم فني — نظام إدارة الكلية')}">البريد الإلكتروني</a>` : ''}</div>
        ${sup.hours ? `<p class="small muted">أوقات الدعم: ${esc(sup.hours)}</p>` : ''}
        ${ASSIST.logged ? `<h3 style="margin:12px 0 6px">تذكرة دعم</h3><label class="f">المشكلة باختصار<input id="stT" maxlength="150"></label>
          <label class="f" style="margin-top:6px">التفاصيل (الصفحة أو البرنامج، وما ظهر لك)<textarea id="stB" maxlength="3000"></textarea></label>
          <div class="err" id="stErr"></div><button class="btn pri sm" onclick="C.ticket(this)">إرسال التذكرة</button>
          <p class="tiny muted">تتابع حالة التذكرة من «المهام والتكليفات».</p>` : '<p class="small muted">بعد تسجيل الدخول يمكنك فتح تذكرة دعم من هنا.</p>'}</div>`;
    }
  };
  C.ticket = (btn) => busy(btn, async () => {
    if (!val('stT')) { $('#stErr').textContent = 'اكتب المشكلة باختصار.'; return; }
    await D.rpc('support_ticket', { p_title: val('stT'), p_body: val('stB') + '\n\nالصفحة: ' + (VIEW.page || '') + (VIEW.id ? ' / ' + VIEW.id : '') });
    C.dock(null); toast('أُرسلت التذكرة. ستصلك المتابعة في «المهام والتكليفات».');
  });

  /* إعدادات المرشد والدعم */
  const AS = {};
  function pgAssist() {
    if (!isAdmin()) return '<div class="panel">هذه الصفحة لمدير النظام.</div>';
    const a = Object.assign({ chatSrc: 'none', support: {} }, S.settings.assist || {}, AS), s = a.support || {};
    return `<div class="grid2"><div class="panel editor"><h2>${icon('chat')} المرشد الأكاديمي (الشات بوت)</h2><div class="formgrid">
        <label class="f">اسم الزر<input id="asN" value="${attr(a.chatName || 'المرشد الأكاديمي')}"></label>
        <label class="f">المصدر<select id="asS" onchange="C.asKeep();C.refresh()">${opt('none', 'غير مفعّل', a.chatSrc)}${opt('url', 'رابط المرشد (منشور على الإنترنت)', a.chatSrc)}${opt('file', 'ملف HTML يُرفع هنا', a.chatSrc)}</select></label>
        ${a.chatSrc === 'url' ? `<label class="f full">رابط المرشد<input id="asU" value="${attr(a.chatUrl || '')}" dir="ltr" placeholder="https://…"></label>` : ''}
        ${a.chatSrc === 'file' ? `<div class="f full">ملف المرشد (HTML)<div class="row">${a.chatFile ? `<span class="small">${esc(a.chatFileName || a.chatFile)}</span>` : '<span class="small muted">لم يُرفع بعد</span>'}<input type="file" accept=".html,.htm" onchange="C.asFile(this)"></div></div>` : ''}
        <label class="f full">رسالة ترحيب فوق المحادثة (اختياري)<input id="asW" value="${attr(a.welcome || '')}" maxlength="200"></label>
        <label class="f full row" style="flex-direction:row;gap:6px"><input type="checkbox" id="asP" ${a.public ? 'checked' : ''}>يظهر للطلاب والزوار في صفحة الدخول دون حساب</label></div>
        <p class="small muted">إن كان المرشد منشورًا على موقع لا يسمح بعرضه داخل صفحة أخرى، يظهر زر «نافذة مستقلة» في أعلى المحادثة.</p></div>
      <div class="panel editor"><h2>${icon('headset')} الدعم الفني</h2><div class="formgrid">
        <label class="f">رقم واتساب الدعم (بالصيغة الدولية)<input id="asWa" value="${attr(s.whatsapp || '')}" dir="ltr" placeholder="9665XXXXXXXX"></label>
        <label class="f">بريد الدعم<input id="asE" value="${attr(s.email || '')}" dir="ltr"></label>
        <label class="f">أوقات الدعم<input id="asH" value="${attr(s.hours || '')}" placeholder="الأحد–الخميس 8 ص – 2 م"></label>
        <label class="f">جهة استقبال التذاكر<select id="asUn">${unitOptions(s.unit || 'college-admin')}</select></label>
        <label class="f full">نص تعريفي<input id="asNo" value="${attr(s.note || '')}"></label></div>
        <p class="small muted">تذاكر الدعم تُسجَّل طلباتٍ في الجهة المختارة، ويصل إشعار لمدير النظام.</p></div></div>
      <div class="row" style="margin-top:14px"><button class="btn pri" onclick="C.asSave(this)">حفظ</button></div>`;
  }
  C.asKeep = () => { const g = (i) => { const e = document.getElementById(i); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : undefined; };
    [['chatName', 'asN'], ['chatSrc', 'asS'], ['chatUrl', 'asU'], ['welcome', 'asW'], ['public', 'asP']].forEach(([k, i]) => { const v = g(i); if (v !== undefined) AS[k] = v; });
    AS.support = Object.assign({}, (S.settings.assist || {}).support || {}, AS.support || {});
    [['whatsapp', 'asWa'], ['email', 'asE'], ['hours', 'asH'], ['unit', 'asUn'], ['note', 'asNo']].forEach(([k, i]) => { const v = g(i); if (v !== undefined) AS.support[k] = v; }); };
  C.asFile = (inp) => busy(null, async () => { C.asKeep(); const f = inp.files[0]; const text = await readHtml(f); const path = 'chatbot/' + Date.now() + '.html';
    await D.uploadPublic(path, new Blob([text], { type: 'text/html' })); AS.chatFile = path; AS.chatFileName = f.name; refresh(); toast('رُفع ملف المرشد. اضغط «حفظ».'); });
  C.asSave = (btn) => busy(btn, async () => { C.asKeep();
    if (AS.chatSrc === 'url' && !/^https:\/\//i.test(AS.chatUrl || '')) throw new Error('رابط المرشد يبدأ بـ https://');
    const d = Object.assign({}, S.settings, { assist: Object.assign({}, S.settings.assist || {}, AS) });
    await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; Object.keys(AS).forEach((k) => delete AS[k]); renderDock(d.assist, true); refresh(); toast('حُفظ المرشد والدعم.'); });

  /* =====================================================================
     النماذج المطلوبة والتقارير: قوالب Word/Excel تُعبَّأ تلقائيًا وتُصدَر وتُطبع
     ===================================================================== */
  const SYS_TAGS = {
    'الكلية': 'اسم الكلية', 'الجامعة': 'اسم الجامعة', 'الجهة': 'اسم الوحدة أو اللجنة', 'الجهة_الأم': 'الجهة التي تتبعها', 'المسؤول': 'رئيس الجهة أو مسؤولها',
    'معد_التقرير': 'اسم من أصدر التقرير', 'التاريخ': 'تاريخ الإصدار (ميلادي)', 'التاريخ_الهجري': 'تاريخ الإصدار (هجري)', 'الفصل': 'الفصل الدراسي الحالي',
    'العام_الجامعي': 'العام الجامعي', 'الفترة': 'الفترة التي يغطيها التقرير', 'عدد_الأعضاء': 'عدد أعضاء الجهة', 'عدد_المهام': 'عدد المهام في الفترة',
    'المهام_المكتملة': 'عدد المهام المكتملة', 'المهام_المفتوحة': 'عدد المهام المفتوحة', 'المهام_المتأخرة': 'عدد المهام المتأخرة', 'اسم_النموذج': 'اسم النموذج'
  };
  const LOOP_TAGS = { 'الأعضاء': ['م', 'الاسم', 'الصفة', 'الرتبة', 'القسم'], 'المهام': ['م', 'العنوان', 'الحالة', 'المكلف', 'الاستحقاق', 'الأولوية'] };
  const TPL_KIND = { docx: 'Word يُعبَّأ تلقائيًا', xlsx: 'Excel يُعبَّأ تلقائيًا', other: 'ملف للتحميل والطباعة' };
  let TPLS = [], RLOG = [];
  const loadTpl = async () => { [TPLS, RLOG] = await Promise.all([D.select('org_templates').catch(() => []), D.select('org_report_log', { cols: 'id,template_id,unit_id,period,file_path,file_name,created_by,created_at' }).catch(() => [])]); };
  const tplFor = (u) => TPLS.filter((t) => t.active && ((t.targets || []).includes(u.id) || (t.target_kinds || []).includes(u.kind) || t.owner_unit === u.id));
  const needLibs = () => { if (!window.PizZip || !window.docxtemplater) throw new Error('مكتبة النماذج لم تُحمَّل. تحقق من الاتصال بالإنترنت ثم أعد تحميل الصفحة.'); };
  /* استخراج الوسوم {…} من القالب */
  function scanTags(kind, buf) {
    needLibs(); const zip = new PizZip(buf); let text = '';
    if (kind === 'docx') { const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true }); text = doc.getFullText();
      ['word/header1.xml', 'word/header2.xml', 'word/footer1.xml', 'word/footer2.xml'].forEach((h) => { const f = zip.file(h); if (f) text += ' ' + f.asText().replace(/<[^>]+>/g, ''); }); }
    else if (kind === 'xlsx') { const f = zip.file('xl/sharedStrings.xml'); text = f ? f.asText().replace(/<[^>]+>/g, ' ') : ''; }
    const out = [], seen = new Set(); let depth = 0; const re = /\{\s*([#\/^]?)\s*([^{}#\/^][^{}]*?)\s*\}/g; let m;
    while ((m = re.exec(text))) { const k = m[2].trim(); if (m[1] === '#' || m[1] === '^') { depth++; continue; } if (m[1] === '/') { depth = Math.max(0, depth - 1); continue; }
      if (depth || SYS_TAGS[k] || seen.has(k)) continue; seen.add(k); out.push({ key: k, label: k.replace(/_/g, ' '), type: /ملاحظات|توصيات|وصف|إنجازات|تفاصيل|خطة|مقترحات/.test(k) ? 'long' : 'short' }); }
    return out;
  }
  async function pgForms() {
    await loadTpl(); const canAny = manageAny();
    return `<div class="note" style="margin-bottom:12px">النماذج التي تطلبها الوكالة أو الكلية من الوحدات واللجان وبرامجها. ارفع النموذج بصيغة <b>Word</b> أو <b>Excel</b> وضع فيه وسومًا بين قوسين مثل <b>{الجهة}</b> و<b>{التاريخ}</b> و<b>{المسؤول}</b>، فيُعبَّأ تلقائيًا عند الإصدار. وأي وسم آخر تكتبه مثل <b>{التوصيات}</b> يظهر حقلًا يعبئه المستخدم. الملفات الأخرى (PDF مثلًا) تُحمَّل وتُطبع كما هي.
      <a href="#" onclick="C.tagHelp();return false">قائمة الوسوم التلقائية</a></div>
      <div class="row" style="margin-bottom:12px"><span class="grow small muted">${TPLS.length} نموذج</span>${gcap('reports') ? `<button class="btn sm" onclick="C.go('track')">${icon('chart')}متابعة النماذج المطلوبة</button>` : ''}${canAny ? `<button class="btn pri sm" onclick="C.tplEdit()">${icon('upload')}إضافة نموذج</button>` : ''}</div>
      ${TPLS.length ? `<div class="tw"><table><tr><th>النموذج</th><th>الجهة الطالبة</th><th>النوع</th><th>مطلوب من</th><th>الاستحقاق</th><th>صدر</th><th></th></tr>${TPLS.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ar')).map((t) => { const tg = tplTargets(t);
        return `<tr><td><b>${esc(t.name)}</b>${t.required ? ' ' + chip('مطلوب', 'brass') : ''}${t.active ? '' : ' ' + chip('موقوف', 'wait')}<div class="tiny muted">${esc(t.description || '')}${t.app_id ? ' · برنامج: ' + esc((S.apps.find((a) => a.id === t.app_id) || {}).name || '') : ''}</div></td>
        <td>${esc(uName(t.owner_unit))}</td><td class="small">${TPL_KIND[t.file_kind]}</td><td class="small">${tg.length} جهة</td><td class="num">${fmtD(t.due_date)}${t.period ? `<div class="tiny muted">${esc(t.period)}</div>` : ''}</td>
        <td class="num">${new Set(RLOG.filter((r) => r.template_id === t.id).map((r) => r.unit_id)).size}/${tg.length}</td>
        <td class="row"><button class="btn sm" onclick="C.tplBlank('${t.id}')">تحميل الفارغ</button>${cap(t.owner_unit, 'manage') ? `<button class="btn sm" onclick="C.tplEdit('${t.id}')">تعديل</button>` : ''}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد نماذج بعد.</div>'}`;
  }
  const tplTargets = (t) => S.units.filter((u) => u.status === 'active' && ((t.targets || []).includes(u.id) || (t.target_kinds || []).includes(u.kind)));
  C.tagHelp = () => modal('الوسوم التلقائية في النماذج', `<p class="small">اكتب الوسم في ملف Word أو Excel بين قوسين معقوفين كما هو. الجداول المتكررة (Word فقط): ضع صف جدول بين <b>{#الأعضاء}</b> و<b>{/الأعضاء}</b>.</p>
    <div class="tw"><table><tr><th>الوسم</th><th>يُستبدل بـ</th></tr>${Object.keys(SYS_TAGS).map((k) => `<tr><td>{${esc(k)}}</td><td>${esc(SYS_TAGS[k])}</td></tr>`).join('')}
    ${Object.keys(LOOP_TAGS).map((k) => `<tr><td>{#${esc(k)}} … {/${esc(k)}}</td><td>صف لكل عنصر، وفيه: ${LOOP_TAGS[k].map((x) => '{' + x + '}').join(' ')}</td></tr>`).join('')}</table></div>`, null, true);
  let TF = null;
  C.tplEdit = async (id) => {
    if (!TPLS.length) await loadTpl();
    const t = id ? TPLS.find((x) => x.id === id) : { name: '', description: '', owner_unit: (S.units.find((u) => u.id === 'vice' && cap(u.id, 'manage')) || S.units.find((u) => cap(u.id, 'manage')) || {}).id, file_kind: 'docx', fields: [], targets: [], target_kinds: [], required: true, period: '', due_date: '', active: true, app_id: null, sort: 100 };
    TF = { file: null, buf: null, fields: (t.fields || []).slice(), kind: t.file_kind };
    const owners = S.units.filter((u) => cap(u.id, 'manage'));
    const groups = [['unit', 'الوحدات'], ['committee', 'اللجان'], ['department', 'الأقسام العلمية'], ['leadership', 'الوكالات والقيادة'], ['administration', 'الإدارة'], ['other', 'أخرى']];
    modal(id ? 'تعديل نموذج' : 'إضافة نموذج', `<div class="formgrid"><label class="f">اسم النموذج<input id="tfN" value="${attr(t.name)}" maxlength="150"></label>
      <label class="f">الجهة الطالبة<select id="tfO">${owners.map((u) => opt(u.id, u.name, t.owner_unit)).join('')}</select></label>
      <label class="f full">الوصف أو التعليمات<input id="tfD" value="${attr(t.description)}" maxlength="400"></label>
      <label class="f full">ملف النموذج (docx أو xlsx أو pdf…)${t.file_name ? ` <span class="small muted">الحالي: ${esc(t.file_name)}</span>` : ''}<input type="file" id="tfF" accept=".docx,.xlsx,.pdf,.doc,.xls,.png,.jpg" onchange="C.tplPick(this)"></label>
      <div class="f full" id="tfFields"></div>
      <div class="f full">مطلوب من<div class="small" style="margin:4px 0">كل جهات النوع: ${groups.map(([k, l]) => `<label style="margin-inline-end:10px"><input type="checkbox" class="tfK" value="${k}" ${(t.target_kinds || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <details><summary class="small">أو جهات محددة (${(t.targets || []).length})</summary><div class="checks" style="max-height:180px;overflow:auto;border:1px solid var(--line2);padding:8px;border-radius:8px;margin-top:6px">${S.units.filter((u) => u.status === 'active').sort(sortU).map((u) => `<label><input type="checkbox" class="tfT" value="${u.id}" ${(t.targets || []).includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</div></details></div>
      <label class="f">مرتبط ببرنامج (اختياري)<select id="tfA"><option value="">—</option>${S.apps.map((a) => opt(a.id, a.name + ' · ' + uName(a.unit_id), t.app_id)).join('')}</select></label>
      <label class="f">الفترة (مثل: نهاية الفصل)<input id="tfP" value="${attr(t.period)}"></label>
      <label class="f">تاريخ الاستحقاق<input type="date" id="tfDue" value="${attr(t.due_date || '')}"></label>
      <label class="f">الحالة<select id="tfAc">${opt('1', 'متاح', t.active ? '1' : '0')}${opt('0', 'موقوف', t.active ? '1' : '0')}</select></label>
      <label class="f row" style="flex-direction:row;gap:6px"><input type="checkbox" id="tfR" ${t.required ? 'checked' : ''}>نموذج مطلوب (يظهر في المتابعة)</label></div><div class="err"></div>`,
      `<button class="btn pri" id="tfOk">حفظ النموذج</button>${id && isAdmin() ? '<button class="btn danger" id="tfDel">حذف</button>' : ''}<button class="btn" onclick="C.close()">إلغاء</button>`, true);
    drawFields();
    $('#tfOk').onclick = (ev) => busy(ev.target, async () => {
      const name = val('tfN'); if (!name) throw new Error('اسم النموذج مطلوب.'); if (!id && !TF.file) throw new Error('اختر ملف النموذج.');
      $$('.tfL').forEach((e) => { const f = TF.fields.find((x) => x.key === e.dataset.k); if (f) f.label = e.value.trim() || f.key; });
      const tid = id || 't-' + uid().slice(0, 12);
      const row = { name, owner_unit: val('tfO'), description: val('tfD'), fields: TF.fields, targets: $$('.tfT').filter((c) => c.checked).map((c) => c.value), target_kinds: $$('.tfK').filter((c) => c.checked).map((c) => c.value),
        app_id: val('tfA') || null, period: val('tfP'), due_date: val('tfDue') || null, active: val('tfAc') === '1', required: val('tfR') };
      if (TF.file) { const ext = TF.file.name.split('.').pop().toLowerCase(); row.file_kind = TF.kind; row.file_name = TF.file.name; row.file_path = tid + '/' + Date.now() + '.' + ext;
        if (id) await D.update('org_templates', row, { eq: { id } }); else await D.insert('org_templates', Object.assign({ id: tid }, row));
        await D.uploadTpl(row.file_path, TF.file); }
      else await D.update('org_templates', row, { eq: { id } });
      await loadTpl(); C.close(); refresh(); toast('حُفظ النموذج.');
    });
    if ($('#tfDel')) $('#tfDel').onclick = async () => { if (!(await confirmBox('حذف النموذج', '<p>يُحذف النموذج وسجل التقارير الصادرة منه. هل تحذف؟</p>', 'حذف', true))) return; await busy(null, async () => { await D.remove('org_templates', { eq: { id } }); await loadTpl(); refresh(); }); };
  };
  function drawFields() { const e = $('#tfFields'); if (!e) return;
    e.innerHTML = TF.fields.length ? `الحقول التي يعبئها المستخدم (من الوسوم في الملف)<div class="mlist" style="margin-top:4px">${TF.fields.map((f) => `<div><span class="small" style="min-width:120px">{${esc(f.key)}}</span><input class="inp grow tfL" data-k="${attr(f.key)}" value="${attr(f.label)}" aria-label="عنوان الحقل"></div>`).join('')}</div>`
      : `<span class="small muted">${TF.kind === 'other' ? 'ملف ثابت: يُحمَّل ويُطبع كما هو.' : 'لا توجد حقول يدوية؛ كل الوسوم تُعبَّأ تلقائيًا.'}</span>`; }
  C.tplPick = (inp) => busy(null, async () => { const f = inp.files[0]; if (!f) return; if (f.size > 15 * 1048576) { inp.value = ''; throw new Error('حجم النموذج أكبر من 15 م.ب.'); }
    const ext = f.name.split('.').pop().toLowerCase(); TF.file = f; TF.kind = ext === 'docx' ? 'docx' : ext === 'xlsx' ? 'xlsx' : 'other';
    TF.fields = TF.kind === 'other' ? [] : scanTags(TF.kind, await f.arrayBuffer()); drawFields(); });
  C.tplBlank = (id) => busy(null, async () => { const t = TPLS.find((x) => x.id === id); const b = await D.downloadTpl(t.file_path); saveBlob(b, t.file_name); });
  const saveBlob = (b, name) => { const x = document.createElement('a'); x.href = URL.createObjectURL(b); x.download = name; document.body.appendChild(x); x.click(); setTimeout(() => { URL.revokeObjectURL(x.href); x.remove(); }, 1500); };

  /* تبويب «النماذج والتقارير» في مساحة الجهة */
  async function unitForms(u) {
    await loadTpl(); const list = tplFor(u);
    if (!list.length) return '<div class="empty">لا توجد نماذج مطلوبة من هذه الجهة. تُضاف من «الإعدادات ← النماذج والتقارير».</div>';
    return `<div class="tw"><table><tr><th>النموذج</th><th>الجهة الطالبة</th><th>الاستحقاق</th><th>آخر إصدار</th><th></th></tr>${list.map((t) => {
      const logs = RLOG.filter((r) => r.template_id === t.id && r.unit_id === u.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const late = t.required && t.due_date && t.due_date < today() && !logs.length;
      return `<tr><td><b>${esc(t.name)}</b>${t.required ? ' ' + chip('مطلوب', 'brass') : ''}<div class="tiny muted">${esc(t.description || '')}</div></td><td>${esc(uName(t.owner_unit))}</td>
        <td class="num ${late ? 'bad' : ''}">${fmtD(t.due_date)}${late ? ' (متأخر)' : ''}</td><td class="small">${logs.length ? fmtDT(logs[0].created_at) + (logs.length > 1 ? ` <a href="#" onclick="C.rlogList('${t.id}','${u.id}');return false">(${logs.length})</a>` : '') : '—'}</td>
        <td class="row">${cap(u.id, 'write') ? `<button class="btn sm pri" onclick="C.issue('${t.id}','${u.id}')">${t.file_kind === 'other' ? 'تحميل وطباعة' : 'إصدار التقرير'}</button>` : ''}<button class="btn sm" onclick="C.tplBlank('${t.id}')">الفارغ</button>${logs[0] && logs[0].file_path ? `<button class="btn sm" onclick="C.rlogGet('${logs[0].id}')">آخر نسخة</button>` : ''}</td></tr>`; }).join('')}</table></div>`;
  }
  async function reportData(t, u, period, values) {
    const st = S.settings, term = curTerm(), h = headOf(u.id);
    const reqs = await D.select('org_requests', { eq: { unit_id: u.id } }).catch(() => []);
    const live = reqs.filter((r) => !r.archived);
    const mem = S.members.filter((m) => m.unit_id === u.id && activeM(m)).sort((a, b) => (a.position === 'head' ? -1 : b.position === 'head' ? 1 : 0));
    let hij = ''; try { hij = new Date().toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn'); } catch (e) {}
    return Object.assign({
      'الكلية': st.collegeShort || 'كلية الأعمال', 'الجامعة': st.university || 'جامعة الجوف', 'الجهة': u.name, 'الجهة_الأم': uName(u.parent_id), 'المسؤول': h ? fName(h.faculty_id) : '',
      'معد_التقرير': S.me.name, 'التاريخ': new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn'), 'التاريخ_الهجري': hij, 'الفصل': term ? term.term : '', 'العام_الجامعي': term ? term.year : '',
      'الفترة': period || t.period || '', 'اسم_النموذج': t.name, 'عدد_الأعضاء': mem.length, 'عدد_المهام': live.length, 'المهام_المكتملة': live.filter((r) => r.status === 'done').length,
      'المهام_المفتوحة': live.filter((r) => !['done', 'rejected'].includes(r.status)).length, 'المهام_المتأخرة': live.filter((r) => r.due_date && r.due_date < today() && !['done', 'rejected'].includes(r.status)).length,
      'الأعضاء': mem.map((m, i) => { const f = fac(m.faculty_id) || {}; return { 'م': i + 1, 'الاسم': f.name_ar || '', 'الصفة': POS[m.position], 'الرتبة': f.rank || '', 'القسم': uName(f.department_id) }; }),
      'المهام': live.map((r, i) => ({ 'م': i + 1, 'العنوان': r.title, 'الحالة': RSTAT[r.status][0], 'المكلف': r.assignee_faculty ? fName(r.assignee_faculty) : '', 'الاستحقاق': r.due_date || '', 'الأولوية': PRIO[r.priority] }))
    }, values);
  }
  const xmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  async function buildFile(t, data) {
    needLibs(); const buf = await (await D.downloadTpl(t.file_path)).arrayBuffer(); const zip = new PizZip(buf);
    if (t.file_kind === 'docx') {
      const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
      try { doc.render(data); } catch (e) { const er = (e.properties && e.properties.errors || []).map((x) => x.properties && x.properties.explanation).filter(Boolean); throw new Error('في القالب خطأ في الوسوم: ' + (er.slice(0, 3).join('، ') || e.message)); }
      return doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
    const f = zip.file('xl/sharedStrings.xml');
    if (f) zip.file('xl/sharedStrings.xml', f.asText().replace(/\{\s*([^{}#\/^][^{}]*?)\s*\}/g, (m, k) => (k.trim() in data && typeof data[k.trim()] !== 'object') ? xmlEsc(data[k.trim()]) : m));
    return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  C.issue = async (tid, unitId) => {
    const t = TPLS.find((x) => x.id === tid), u = unit(unitId);
    if (t.file_kind === 'other') return busy(null, async () => { const b = await D.downloadTpl(t.file_path); const url = URL.createObjectURL(b); window.open(url, '_blank', 'noopener'); saveBlob(b, t.file_name);
      await D.insert('org_report_log', { template_id: t.id, unit_id: u.id, period: t.period || '', values: {}, file_name: t.file_name }); await loadTpl(); refresh(); });
    modal('إصدار: ' + t.name, `<p class="small muted">${esc(u.name)} · تُعبَّأ بيانات الجهة والأعضاء والمهام تلقائيًا من النظام.</p><div class="formgrid">
      <label class="f full">الفترة التي يغطيها التقرير<input id="isP" value="${attr(t.period || '')}"></label>
      ${(t.fields || []).map((f, i) => `<label class="f full">${esc(f.label)}${f.type === 'long' ? `<textarea id="isF${i}"></textarea>` : `<input id="isF${i}">`}</label>`).join('')}</div><div class="err"></div>`,
      `<button class="btn pri" id="isOk">${icon('form')}إصدار وتنزيل</button><button class="btn" id="isPr">${icon('print')}طباعة / PDF</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    const vals = () => Object.fromEntries((t.fields || []).map((f, i) => [f.key, val('isF' + i)]));
    $('#isOk').onclick = (ev) => busy(ev.target, async () => {
      const data = await reportData(t, u, val('isP'), vals()); const blob = await buildFile(t, data);
      const name = t.name + ' - ' + u.name + ' - ' + today() + '.' + t.file_kind; const path = u.id + '/reports/' + Date.now() + '_' + uid().slice(0, 6) + '.' + t.file_kind;
      saveBlob(blob, name);
      let stored = null; try { await D.upload(path, blob); stored = path; } catch (e) { console.warn(e); }
      await D.insert('org_report_log', { template_id: t.id, unit_id: u.id, period: val('isP'), values: vals(), file_path: stored, file_name: name });
      const ow = headOf(t.owner_unit); const of = ow && fac(ow.faculty_id); if (of && of.profile_app_id) notify([of.profile_app_id], 'أصدرت ' + u.name + ' نموذج «' + t.name + '»');
      await loadTpl(); C.close(); refresh(); toast('صدر التقرير وحُفظت نسخة منه في سجل الجهة.');
    });
    $('#isPr').onclick = (ev) => busy(ev.target, async () => { printReport(t, await reportData(t, u, val('isP'), vals())); });
  };
  function printReport(t, d) {
    const st = S.settings, logo = st.logo || LOGO_IMG;
    const kv = Object.keys(SYS_TAGS).filter((k) => !['الكلية', 'الجامعة', 'اسم_النموذج'].includes(k) && d[k] !== '' && d[k] !== undefined).map((k) => `<tr><th>${esc(SYS_TAGS[k])}</th><td>${esc(d[k])}</td></tr>`).join('');
    const custom = (t.fields || []).map((f) => `<h3>${esc(f.label)}</h3><p style="white-space:pre-wrap">${esc(d[f.key] || '—')}</p>`).join('');
    const tbl = (rows, cols) => rows.length ? `<table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</table>` : '<p>—</p>';
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(t.name)}</title><style>@page{size:A4;margin:16mm}body{font-family:Tajawal,'Sakkal Majalla',Tahoma,sans-serif;color:#111;font-size:13pt}
      header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #43307F;padding-bottom:8px;margin-bottom:14px}header img{height:58px}header b{display:block;font-size:15pt}h1{font-size:18pt;color:#43307F;text-align:center;margin:10px 0}
      h2{font-size:14pt;color:#43307F;border-bottom:1px solid #ddd;margin-top:18px}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #bbb;padding:5px 8px;text-align:right;font-size:11.5pt}th{background:#EFEBF9}
      footer{margin-top:28px;display:flex;justify-content:space-between;font-size:11pt}</style></head><body>
      <header><img src="${attr(logo)}" alt="" onerror="this.remove()"><div><b>${esc(d['الجامعة'])}</b>${esc(d['الكلية'])} — ${esc(d['الجهة'])}</div></header>
      <h1>${esc(t.name)}</h1><table>${kv}</table>${custom}<h2>الأعضاء</h2>${tbl(d['الأعضاء'], LOOP_TAGS['الأعضاء'])}<h2>المهام</h2>${tbl(d['المهام'], LOOP_TAGS['المهام'])}
      <footer><span>المسؤول: ${esc(d['المسؤول'] || '')} ............</span><span>التوقيع: ....................</span><span>${esc(d['التاريخ'])}</span></footer></body></html>`;
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:0;bottom:0'; document.body.appendChild(f);
    f.srcdoc = html; f.onload = () => { setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300); };
  }
  C.rlogGet = (id) => busy(null, async () => { const r = RLOG.find((x) => x.id === id); const b = await D.download(r.file_path); saveBlob(b, r.file_name); });
  C.rlogList = (tid, unitId) => { const t = TPLS.find((x) => x.id === tid); const l = RLOG.filter((r) => r.template_id === tid && r.unit_id === unitId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    modal('سجل إصدار: ' + t.name, `<div class="mlist">${l.map((r) => `<div><span class="grow">${fmtDT(r.created_at)} · ${esc(pName(r.created_by))}${r.period ? ' · ' + esc(r.period) : ''}</span>${r.file_path ? `<button class="btn sm" onclick="C.rlogGet('${r.id}')">تنزيل</button>` : ''}</div>`).join('')}</div>`); };

  /* متابعة النماذج المطلوبة (للوكالة والعمادة) */
  async function pgTrack() {
    if (!gcap('reports')) return '<div class="panel">المتابعة تحتاج صلاحية «التقارير».</div>';
    await loadTpl(); const req = TPLS.filter((t) => t.required && t.active);
    if (!req.length) return '<div class="empty">لا توجد نماذج مطلوبة. حدد «نموذج مطلوب» عند إضافة النموذج.</div>';
    const rows = []; req.forEach((t) => tplTargets(t).forEach((u) => { const l = RLOG.filter((r) => r.template_id === t.id && r.unit_id === u.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      rows.push({ t, u, l, st: l ? 'صدر' : (t.due_date && t.due_date < today() ? 'متأخر' : 'لم يصدر') }); }));
    S._track = rows; const n = (s) => rows.filter((r) => r.st === s).length;
    return `<div class="stats"><div><b>${n('صدر')}</b><span>صدر</span></div><div><b>${n('لم يصدر')}</b><span>لم يصدر بعد</span></div><div><b class="${n('متأخر') ? 'bad' : ''}">${n('متأخر')}</b><span>متأخر</span></div></div>
      <div class="row noprint" style="margin-bottom:10px"><span class="grow"></span><button class="btn sm" onclick="C.trackX()">تصدير Excel</button><button class="btn sm" onclick="C.printNow('متابعة النماذج المطلوبة')">طباعة</button></div>
      <div class="tw"><table><tr><th>النموذج</th><th>الجهة</th><th>الاستحقاق</th><th>الحالة</th><th>آخر إصدار</th><th></th></tr>${rows.map((r) => `<tr><td>${esc(r.t.name)}</td><td>${esc(r.u.name)}</td><td class="num">${fmtD(r.t.due_date)}</td>
        <td>${chip(r.st, r.st === 'صدر' ? 'ok' : r.st === 'متأخر' ? 'bad' : 'wait')}</td><td class="small">${r.l ? fmtDT(r.l.created_at) + ' · ' + esc(pName(r.l.created_by)) : '—'}</td><td>${r.l && r.l.file_path ? `<button class="btn sm" onclick="C.rlogGet('${r.l.id}')">تنزيل</button>` : ''}</td></tr>`).join('')}</table></div>`;
  }
  C.printNow = printNow;
  C.trackX = () => xlsxOut('متابعة النماذج.xlsx', [{ name: 'المتابعة', head: ['النموذج', 'الجهة', 'الاستحقاق', 'الحالة', 'آخر إصدار', 'بواسطة'], rows: (S._track || []).map((r) => [r.t.name, r.u.name, r.t.due_date || '', r.st, r.l ? r.l.created_at : '', r.l ? pName(r.l.created_by) : '']) }]);

  /* =====================================================================
     صلاحيات عضو هيئة التدريس في كل شيء (مصفوفة واحدة لكل عضو)
     ===================================================================== */
  const LV = { inherit: 'حسب جهته', none: 'لا يدخل', view: 'اطلاع', use: 'استخدام', manage: 'إدارة ورفع تحديثات' };
  let PM = null;
  async function pgPerms() {
    if (!isAdmin()) return '<div class="panel">تحديد الصلاحيات لمدير النظام.</div>';
    const f = fac(VIEW.id); if (!f) return '<div class="empty">اختر العضو من «أعضاء هيئة التدريس» أو «الحسابات والصلاحيات».</div>';
    const p = f.profile_app_id && prof(f.profile_app_id);
    const access = p ? await D.select('org_app_access', { eq: { profile_app_id: p.app_id } }).catch(() => []) : [];
    const cur = {}; S.members.filter((m) => m.faculty_id === f.id && activeM(m)).forEach((m) => { cur[m.unit_id] = m; });
    const gr = p ? S.grants.filter((g) => g.profile_app_id === p.app_id && g.unit_id === rootId() && (!g.end_date || g.end_date >= today())) : [];
    PM = { f, p, cur, access: Object.fromEntries(access.map((a) => [a.app_id, a.level])), gr };
    const posOpts = (sel) => `<option value="">—</option>${['viewer', 'member', 'secretary', 'deputy', 'head'].map((k) => opt(k, POS[k], sel)).join('')}`;
    const globalRoles = S.roles.filter((r) => !['unit_head', 'committee_chair', 'committee_member', 'dept_head', 'faculty'].includes(r.key));
    return `<div class="panel"><div class="row"><div class="grow"><h2 style="margin:0">${esc(f.name_ar)}</h2><div class="small muted">${esc(f.rank || '')} · ${esc(uName(f.department_id))} · ${p ? 'الحساب: ' + esc(p.username) + (p.active ? '' : ' (معطل)') : 'لا يوجد حساب بعد'}</div></div>
        ${!p ? `<button class="btn sm pri" onclick="C.accCreate('${f.id}')">إنشاء حساب</button>` : ''}<button class="btn sm" onclick="C.facView('${f.id}')">بطاقة العضو</button></div>
      <p class="small muted" style="margin-top:8px">حدد صفته في كل جهة، وصلاحيته في كل برنامج، والأدوار العامة، ثم «حفظ الصلاحيات». مثال: عضو في لجنة التدريب، ورئيس لجنة الخطط، ومطّلع على وحدة الجودة، ويستخدم برنامج الاختبارات دون أن يكون في وحدتها.</p></div>
      <div class="grid2"><div class="panel"><h2>${icon('sitemap')} الصفة في الجهات</h2>
        <div class="tw" style="max-height:60vh;overflow:auto"><table><tr><th>الجهة</th><th>الصفة</th></tr>${flatUnits().filter((x) => x.u.status !== 'archived').map((x) => `<tr><td>${'\u00A0\u00A0\u00A0'.repeat(x.d)}${kindDot(x.u.kind)} ${esc(x.u.name)}</td>
          <td><select class="inp pmU" data-u="${x.u.id}" aria-label="الصفة في ${attr(x.u.name)}">${posOpts(cur[x.u.id] ? cur[x.u.id].position : '')}</select></td></tr>`).join('')}</table></div>
        <p class="tiny muted">«رئيس»: يدير الجهة وفروعها ويرفع برامجها ونماذجها. «عضو/مقرر/نائب»: يعمل في الجهة. «مطّلع»: قراءة فقط. التغيير يُنهي التكليف السابق بتاريخ اليوم ويبقى في السجل.</p></div>
      <div><div class="panel"><h2>${icon('app')} البرامج</h2>${p ? `<div class="tw" style="max-height:40vh;overflow:auto"><table><tr><th>البرنامج</th><th>الصلاحية</th></tr>${S.apps.map((a) => `<tr><td>${esc(a.name)}<div class="tiny muted">${esc(uName(a.unit_id))}</div></td>
          <td><select class="inp pmA" data-a="${a.id}">${Object.keys(LV).map((k) => opt(k, LV[k], PM.access[a.id] || 'inherit')).join('')}</select></td></tr>`).join('') || '<tr><td colspan="2" class="empty">لا توجد برامج.</td></tr>'}</table></div>` : '<p class="small muted">تُحدَّد صلاحيات البرامج بعد إنشاء حساب للعضو.</p>'}</div>
        <div class="panel"><h2>${icon('key')} الأدوار العامة</h2>${p ? `<div class="checks" style="flex-direction:column;align-items:flex-start">${globalRoles.map((r) => `<label><input type="checkbox" class="pmR" value="${r.key}" ${gr.some((g) => g.role_key === r.key) ? 'checked' : ''}> ${esc(r.name)} <span class="tiny muted">(${Object.keys(r.caps || {}).filter((k) => r.caps[k]).map((k) => CAPS[k] || k).join('، ')})</span></label>`).join('')}</div>
          <div class="formgrid" style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="f small muted">العميد والوكلاء ورؤساء الجهات يُحدَّدون من <a href="#" onclick="C.go('positions');return false">المناصب</a>، لا من الحساب.</div>
          <label class="f">مدير النظام<select id="pmAd" ${p.app_id === S.me.app_id ? 'disabled' : ''}>${opt('0', 'لا', p.is_admin ? '1' : '0')}${opt('1', 'نعم', p.is_admin ? '1' : '0')}</select></label></div>
          <p class="tiny muted">الأدوار هنا على مستوى الكلية كلها. لدور على جهة واحدة استخدم «منح الأدوار» أو الصفة في الجهة.</p>` : '<p class="small muted">بعد إنشاء الحساب.</p>'}</div></div></div>
      <div class="row" style="margin-top:14px"><button class="btn pri" onclick="C.pmSave(this)">حفظ الصلاحيات</button><button class="btn" onclick="C.refresh()">إلغاء التغييرات</button></div>`;
  }
  C.perms = (fid) => go('perms', { id: fid });
  C.pmSave = (btn) => busy(btn, async () => {
    const { f, p, cur } = PM; const changes = [];
    for (const s of $$('.pmU')) { const u = s.dataset.u, nv = s.value, ov = cur[u] ? cur[u].position : '';
      if (nv === ov) continue; changes.push(uName(u) + ': ' + (POS[ov] || '—') + ' ← ' + (POS[nv] || '—'));
      if (ov === 'head') await D.rpc('org_set_head', { p_unit: u, p_faculty: null, p_start: today(), p_end: null });
      else if (ov) await D.update('org_members', { end_date: today() < cur[u].start_date ? cur[u].start_date : today() }, { eq: { id: cur[u].id } });
      if (nv === 'head') await D.rpc('org_set_head', { p_unit: u, p_faculty: f.id, p_start: today(), p_end: null });
      else if (nv) await D.insert('org_members', { unit_id: u, faculty_id: f.id, position: nv, start_date: today() });
    }
    if (p) {
      for (const s of $$('.pmA')) { const a = s.dataset.a, nv = s.value, ov = PM.access[a] || 'inherit'; if (nv === ov) continue; changes.push('برنامج ' + (S.apps.find((x) => x.id === a) || {}).name + ': ' + LV[nv]);
        if (nv === 'inherit') await D.remove('org_app_access', { eq: { app_id: a, profile_app_id: p.app_id } }); else await D.upsertMany('org_app_access', [{ app_id: a, profile_app_id: p.app_id, level: nv }], 'app_id,profile_app_id', false); }
      for (const c of $$('.pmR')) { const has = PM.gr.find((g) => g.role_key === c.value);
        if (c.checked && !has) { await D.insert('org_grants', { profile_app_id: p.app_id, role_key: c.value, unit_id: rootId(), include_children: true, note: 'من مصفوفة صلاحيات العضو' }); changes.push('دور: ' + c.value); }
        if (!c.checked && has) { await D.update('org_grants', { end_date: today() }, { eq: { id: has.id } }); changes.push('إنهاء دور: ' + c.value); } }
      const cr = p.college_role || null, ad = $('#pmAd') && !$('#pmAd').disabled ? val('pmAd') === '1' : p.is_admin;
      if ((cr || null) !== (p.college_role || null) || ad !== !!p.is_admin) { const r = await D.fn({ action: 'update', appId: p.app_id, collegeRole: cr, isAdmin: ad }); if (!r || r.error) throw new Error((r && r.error) || 'تعذر تعديل الحساب'); changes.push('صفة الحساب'); }
    }
    [S.members, S.grants, S.profiles] = await Promise.all([D.select('org_members'), D.select('org_grants').catch(() => []), D.select('profiles', { cols: 'app_id,username,name,email,is_admin,college_role,active' })]);
    if (p) notify([p.app_id], 'حُدّثت صلاحياتك في نظام إدارة الكلية.');
    refresh(); toast(changes.length ? 'حُفظت ' + changes.length + ' تغييرات.' : 'لا توجد تغييرات.');
  });

  /* =====================================================================
     مصفوفة التكليفات والصلاحيات: كل الأعضاء × كل الجهات والبرامج في جدول واحد.
     الصفة في الجهة تُحفظ تكليفًا (org_members)، وصلاحية البرنامج على سجل العضو (org_app_fac، الملف 10)،
     فكلاهما مرتبط بالعضو لا بحساب الدخول وينتقل مع النقل لخادم الجامعة. وتُصدَّر المصفوفة وتُستورد بملف Excel،
     والاستيراد يملأ الجدول بالتغييرات (مظللة) لتراجعها ثم تحفظها.
     ===================================================================== */
  const MX_POS = [['', '—'], ['viewer', 'مطّلع'], ['member', 'عضو'], ['secretary', 'مقرر'], ['deputy', 'نائب'], ['head', 'رئيس']];
  const MX_LV = [['inherit', 'تلقائي'], ['none', 'لا يدخل'], ['view', 'اطلاع'], ['use', 'استخدام'], ['manage', 'إدارة']];
  const MX_GRP = [['all', 'كل الأعمدة'], ['department', 'الأقسام العلمية'], ['unit', 'الوحدات'], ['committee', 'اللجان'], ['lead', 'الوكالات والإدارات'], ['apps', 'البرامج']];
  const MX = { q: '', dept: '', grp: 'all', fac: {}, pend: {}, noFac: false };
  const mxCols = (grp) => { const us = flatUnits().map((x) => x.u).filter((u) => u.status !== 'archived'), g = grp || MX.grp;
    const ofK = (k) => us.filter((u) => k === 'lead' ? !['department', 'unit', 'committee'].includes(u.kind) : u.kind === k).map((u) => ({ t: 'u', id: u.id, name: u.name, sub: KIND[u.kind] || '' }));
    const apps = S.apps.filter((a) => a.active).map((a) => ({ t: 'a', id: a.id, name: a.name, sub: 'برنامج · ' + uName(a.unit_id) }));
    return g === 'apps' ? apps : g === 'all' ? ofK('department').concat(ofK('unit'), ofK('committee'), ofK('lead'), apps) : ofK(g); };
  const mxRows = () => { const q = normAr(MX.q).toLowerCase();
    return S.faculty.filter((f) => f.status !== 'غير نشط' && (!MX.dept || f.department_id === MX.dept) && (!q || normAr(f.name_ar).toLowerCase().includes(q) || String(f.employee_no || '').includes(q) || (f.email || '').toLowerCase().includes(q)))
      .sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')); };
  const mxKey = (c, f) => c.t + ':' + c.id + '|' + f.id;
  const mxCur = (c, f) => { if (c.t === 'u') { const m = S.members.find((x) => x.unit_id === c.id && x.faculty_id === f.id && activeM(x)); return m ? m.position : ''; } return MX.fac[c.id + '|' + f.id] || 'inherit'; };
  const mxVal = (c, f) => { const k = mxKey(c, f); return k in MX.pend ? MX.pend[k] : mxCur(c, f); };
  async function pgMatrix() {
    if (!isAdmin()) return '<div class="panel">المصفوفة لمدير النظام.</div>';
    const rows = await D.select('org_app_fac').catch(() => null);
    MX.noFac = rows === null; if (rows) MX.fac = Object.fromEntries(rows.map((r) => [r.app_id + '|' + r.faculty_id, r.level]));
    const cols = mxCols(), fs = mxRows();
    const cell = (c, f) => { const k = mxKey(c, f), o = mxCur(c, f), v = mxVal(c, f), list = c.t === 'u' ? MX_POS : MX_LV;
      return `<td class="${v !== o ? 'chg' : ''}${v && v !== 'inherit' ? ' set' : ''}"><select data-k="${k}" data-o="${o}"${c.t === 'a' && MX.noFac ? ' disabled' : ''} aria-label="${attr(f.name_ar + ' — ' + c.name)}">${list.map(([x, l]) => `<option value="${x}"${x === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>`; };
    VIEW.after = () => { const t = $('#mxT'); if (t) t.addEventListener('change', (e) => { const s = e.target; if (s.tagName !== 'SELECT') return; const k = s.dataset.k;
      if (s.value === s.dataset.o) delete MX.pend[k]; else MX.pend[k] = s.value;
      s.parentElement.classList.toggle('chg', s.value !== s.dataset.o); s.parentElement.classList.toggle('set', !!s.value && s.value !== 'inherit'); mxCount(); }); mxCount(); };
    return `<div class="panel" style="margin-bottom:12px"><p class="small" style="margin:0 0 10px">اختر أمام كل عضو صفته في كل جهة (عضو، مقرر، نائب، رئيس، مطّلع)، وصلاحيته في كل برنامج. «تلقائي» في البرنامج = حسب صفته في جهة البرنامج.
        التغييرات تُظلَّل بالأصفر، ولا تُحفظ إلا بزر «حفظ التغييرات». تغيير الصفة يُنهي التكليف السابق ويبقى في السجل.</p>
      ${MX.noFac ? '<p class="small bad" style="margin:0 0 10px">أعمدة البرامج مقفلة حتى يُنفَّذ الملف database/10_app_access_by_faculty.sql في Supabase.</p>' : ''}
      <div class="row noprint" style="gap:8px;align-items:center">
        <input class="inp" id="mxQ" placeholder="ابحث بالاسم أو الرقم الوظيفي…" value="${attr(MX.q)}" onchange="C.mxF('q',this.value)" style="width:230px" aria-label="بحث">
        <select class="inp" onchange="C.mxF('dept',this.value)" aria-label="القسم"><option value="">كل الأقسام</option>${deptUnits().map((d) => opt(d.id, d.name, MX.dept)).join('')}</select>
        <select class="inp" onchange="C.mxF('grp',this.value)" aria-label="الأعمدة">${MX_GRP.map(([k, l]) => opt(k, l, MX.grp)).join('')}</select>
        <span class="grow"></span>
        <button class="btn sm" onclick="C.mxExport()">${icon('upload')}تصدير المصفوفة (Excel)</button><button class="btn sm" onclick="C.mxImport()">${icon('list')}استيراد المصفوفة</button>
        <button class="btn sm" onclick="C.mxReset()">إلغاء التغييرات</button><button class="btn pri sm" id="mxSave" onclick="C.mxSave(this)">حفظ التغييرات</button></div></div>
      <p class="small muted">${fs.length} عضوًا × ${cols.length} عمودًا.</p>
      <div class="mxwrap"><table class="mxt" id="mxT"><thead><tr><th class="nm">العضو</th>${cols.map((c) => `<th title="${attr(c.name + ' — ' + c.sub)}">${esc(c.name)}<small>${esc(c.sub)}</small></th>`).join('')}</tr></thead>
        <tbody>${fs.map((f) => `<tr><th class="nm"><b>${esc(f.name_ar)}</b><small>${esc([f.rank, uName(f.department_id) === '—' ? '' : uName(f.department_id)].filter(Boolean).join(' · '))}</small></th>${cols.map((c) => cell(c, f)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const mxCount = () => { const n = Object.keys(MX.pend).length, b = $('#mxSave'); if (b) b.textContent = n ? `حفظ التغييرات (${n})` : 'حفظ التغييرات'; };
  C.mxF = (k, v) => { MX[k] = v; refresh(); };
  C.mxReset = () => { MX.pend = {}; refresh(); };
  C.mxSave = (btn) => busy(btn, async () => {
    const ent = Object.entries(MX.pend); if (!ent.length) return toast('لا توجد تغييرات.');
    const heads = {}; for (const [k, v] of ent) if (v === 'head') { const [tid] = k.split('|'); if (heads[tid]) throw new Error('اخترت أكثر من رئيس لـ ' + uName(tid.slice(2)) + '.'); heads[tid] = 1; }
    const repl = Object.keys(heads).map((tid) => S.members.find((m) => m.unit_id === tid.slice(2) && m.position === 'head' && activeM(m))).filter((m) => m && !MX.pend['u:' + m.unit_id + '|' + m.faculty_id]);
    if (!(await confirmBox('حفظ التغييرات', `<p>سيُحفظ <b>${ent.length}</b> تغييرًا.</p>${repl.length ? `<p>الرئيس الجديد يحل محل: ${repl.map((m) => esc(fName(m.faculty_id) + ' في ' + uName(m.unit_id))).join('، ')}.</p>` : ''}`, 'حفظ'))) return;
    const yesterday = () => { const x = new Date(); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };
    let ok = 0; const fails = [], told = {};
    for (const [k, nv] of ent) {
      const [tid, fid] = k.split('|'), t = tid[0], id = tid.slice(2);
      try {
        if (t === 'u') {
          const cur = S.members.find((m) => m.unit_id === id && m.faculty_id === fid && activeM(m)), ov = cur ? cur.position : '';
          if (nv === ov) continue;
          if (ov === 'head') await D.rpc('org_set_head', { p_unit: id, p_faculty: null, p_start: today(), p_end: null });
          else if (ov && cur.start_date >= today()) await D.remove('org_members', { eq: { id: cur.id } });
          else if (ov) await D.update('org_members', { end_date: yesterday() }, { eq: { id: cur.id } });
          if (nv === 'head') await D.rpc('org_set_head', { p_unit: id, p_faculty: fid, p_start: today(), p_end: null });
          else if (nv) await D.insert('org_members', { unit_id: id, faculty_id: fid, position: nv, start_date: today() });
          if (nv) (told[fid] = told[fid] || []).push(POS_OUT[nv] + ' في ' + uName(id));
        } else if (nv === 'inherit') await D.remove('org_app_fac', { eq: { app_id: id, faculty_id: fid } });
        else await D.upsertMany('org_app_fac', [{ app_id: id, faculty_id: fid, level: nv }], 'app_id,faculty_id', false);
        delete MX.pend[k]; ok++;
      } catch (e) { fails.push(fName(fid) + ' — ' + (t === 'u' ? uName(id) : (S.apps.find((a) => a.id === id) || {}).name) + ': ' + pgErr(e)); }
    }
    Object.keys(told).forEach((fid) => { const f = fac(fid); if (f && f.profile_app_id) notify([f.profile_app_id], 'حُدّثت تكليفاتك: ' + told[fid].join('، ')); });
    S.members = await D.select('org_members'); refresh();
    if (fails.length) modal('تعذّر حفظ بعض التغييرات', `<p>حُفظ ${ok}. التالية بقيت مظللة في الجدول:</p><ul>${fails.map((f) => `<li class="small bad">${esc(f)}</li>`).join('')}</ul>`);
    else toast('حُفظ ' + ok + ' تغييرًا.');
  });
  /* Excel: صف لكل عضو، وعمود لكل جهة وبرنامج؛ الخلية: عضو/مقرر/نائب/رئيس/مطّلع، أو للبرنامج: اطلاع/استخدام/إدارة/لا يدخل */
  const MX_IN_POS = { '': '', '—': '', '-': '', 'مطلع': 'viewer', 'مطّلع': 'viewer', 'عضو': 'member', 'مقرر': 'secretary', 'أمين': 'secretary', 'نائب': 'deputy', 'رئيس': 'head', 'مسؤول': 'head' };
  const MX_IN_LV = { '': 'inherit', '—': 'inherit', '-': 'inherit', 'تلقائي': 'inherit', 'لا يدخل': 'none', 'لا': 'none', 'اطلاع': 'view', 'مطلع': 'view', 'استخدام': 'use', 'عضو': 'use', 'ادارة': 'manage', 'إدارة': 'manage', 'مدير': 'manage' };
  C.mxExport = () => { const cols = mxCols('all'), lab = (c, v) => ((c.t === 'u' ? MX_POS : MX_LV).find((x) => x[0] === v) || ['', ''])[1].replace(/^—$|^تلقائي$/, '');
    xlsxOut('مصفوفة التكليفات ' + today() + '.xlsx', [{ name: 'المصفوفة', head: ['الرقم الوظيفي', 'البريد الجامعي', 'اسم العضو', 'القسم'].concat(cols.map((c) => (c.t === 'a' ? 'برنامج: ' : '') + c.name)),
      rows: S.faculty.filter((f) => f.status !== 'غير نشط').sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')).map((f) => [f.employee_no || '', f.email || '', f.name_ar, uName(f.department_id) === '—' ? '' : uName(f.department_id)].concat(cols.map((c) => lab(c, mxVal(c, f))))) },
      { name: 'طريقة التعبئة', head: ['النوع', 'القيم المقبولة'], rows: [['الجهات', 'عضو، مقرر، نائب، رئيس، مطّلع، أو فارغ = لا تكليف'], ['البرامج (العمود يبدأ بـ «برنامج:»)', 'استخدام، اطلاع، إدارة، لا يدخل، أو فارغ = تلقائي حسب صفته في جهة البرنامج'],
        ['العضو', 'يُطابق بالرقم الوظيفي ثم البريد ثم الاسم'], ['ملاحظة', 'الاستيراد يملأ الجدول بالتغييرات لتراجعها، ولا يُحفظ شيء إلا بزر «حفظ التغييرات»']] }]); };
  C.mxImport = () => modal('استيراد المصفوفة من Excel', `<p>صدّر المصفوفة أولًا، وعدّل الخلايا، ثم استوردها هنا. تظهر التغييرات مظللة في الجدول، ولا يُحفظ شيء قبل «حفظ التغييرات».</p>
    <label class="f">ملف Excel<input type="file" accept=".xlsx,.xls,.csv" onchange="C.mxParse(this)"></label><div id="mxOut"></div>`, `<button class="btn" onclick="C.close()">إغلاق</button>`, true);
  C.mxParse = (input) => busy(null, async () => {
    const raw = await xlsxIn(input.files[0]); if (!raw.length) throw new Error('الملف فارغ.');
    const cols = mxCols('all'), heads = Object.keys(raw[0]), err = [], colOf = {};
    heads.forEach((h) => { const n = String(h).trim(); if (['الرقم الوظيفي', 'البريد الجامعي', 'اسم العضو', 'القسم'].includes(n)) return;
      const isA = /^برنامج\s*[:：]/.test(n), nm = normAr(n.replace(/^برنامج\s*[:：]\s*/, ''));
      const c = cols.find((x) => (x.t === 'a') === isA && normAr(x.name) === nm) || cols.find((x) => normAr(x.name) === nm);
      if (c) colOf[h] = c; else err.push('عمود غير معروف (تُرك): ' + n); });
    let n = 0, rowsOk = 0;
    raw.forEach((r, i) => { const emp = String(r['الرقم الوظيفي'] || '').trim(), em = String(r['البريد الجامعي'] || '').trim().toLowerCase(), nm = String(r['اسم العضو'] || '').trim();
      if (!emp && !em && !nm) return;
      const f = (emp && S.faculty.find((x) => x.employee_no === emp)) || (em && S.faculty.find((x) => (x.email || '').toLowerCase() === em)) || (nm && S.faculty.filter((x) => normAr(x.name_ar) === normAr(nm)).length === 1 && S.faculty.find((x) => normAr(x.name_ar) === normAr(nm)));
      if (!f) return err.push('الصف ' + (i + 2) + ': العضو غير موجود: ' + (emp || em || nm));
      rowsOk++;
      Object.keys(colOf).forEach((h) => { const c = colOf[h], raw2 = String(r[h] == null ? '' : r[h]).trim(), map = c.t === 'u' ? MX_IN_POS : MX_IN_LV, key = raw2 in map ? raw2 : normAr(raw2);
        const v = key in map ? map[key] : undefined; if (v === undefined) return err.push('الصف ' + (i + 2) + ' — ' + c.name + ': قيمة غير معروفة «' + raw2 + '»');
        if (c.t === 'a' && MX.noFac) return; const k = mxKey(c, f);
        if (v === mxCur(c, f)) delete MX.pend[k]; else { MX.pend[k] = v; n++; } }); });
    $('#mxOut').innerHTML = `<div class="stats" style="margin-top:12px"><div><b>${rowsOk}</b><span>عضوًا</span></div><div><b>${n}</b><span>تغييرًا مظللًا</span></div><div><b class="${err.length ? 'bad' : ''}">${err.length}</b><span>ملاحظات</span></div></div>
      ${err.length ? `<ul>${err.slice(0, 80).map((e) => `<li class="small bad">${esc(e)}</li>`).join('')}</ul>` : ''}<p class="small">أغلق النافذة وراجع الخلايا المظللة، ثم «حفظ التغييرات».</p>`;
    MX.grp = 'all'; MX.q = ''; MX.dept = ''; refresh();
  });

  /* =====================================================================
     الصفحة الرئيسية: الزائر يرى الواجهة ويدخل من أعلى الصفحة،
     والمستخدم بعد الدخول يرى جهاته وصلاحياته (الوكيل: الجهات التابعة له، رئيس القسم: قسمه…)
     ===================================================================== */
  const fullRead = () => isAdmin() || (S.units.length > 0 && S.units.every((u) => cap(u.id, 'read')));
  const myDirect = () => { const mf = myFac(); return mf ? S.members.filter((m) => m.faculty_id === mf && activeM(m) && unit(m.unit_id) && unit(m.unit_id).status !== 'archived')
    .sort((a, b) => (a.position === 'head' ? -1 : b.position === 'head' ? 1 : 0) || uName(a.unit_id).localeCompare(uName(b.unit_id), 'ar')) : []; };
  /* نوع الواجهة: dean (مدير النظام أو العميد: كل الجهات)، vice (الوكيل: جهات إشرافه)، head (رئيس جهة)، staff (عضو هيئة التدريس) */
  const viewRole = () => { if (LEAD.member && (isLeader() || isAdmin())) return 'staff'; if (isAdmin()) return 'dean'; const h = myHeads().map((m) => unit(m.unit_id)).filter(Boolean); return h.some((u) => !u.parent_id) ? 'dean' : h.some((u) => u.kind === 'leadership') ? 'vice' : h.length ? 'head' : 'staff'; };
  C.listAll = (on) => go(VIEW.page, { all: !!on });
  let FAILS = 0, LOCK_UNTIL = 0;
  async function loadBrand() {
    if (DEMO) return DM().publicBrand();
    if (!D.auth.live()) return {};
    if (BRAND) return BRAND;
    try { BRAND = (await D.rpc('public_brand')) || {}; } catch (e) { BRAND = {}; }
    return BRAND;
  }
  const brandHtml = (b) => `<img src="${attr(b.logo || LOGO_IMG)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="emb" style="display:none">${emblem()}</span><div><b>${esc(b.university || 'جامعة الجوف')}</b><span dir="ltr">${esc(b.universityEn || 'Jouf University')}</span></div>`;
  function showLogin(msg) {
    S.me = null; const app = $('#app'); app.classList.remove('hidden'); app.classList.add('guest');
    $('#side').innerHTML = ''; $('#main').classList.add('flush');
    $('#topbar').innerHTML = `<span class="ttl gttl">نظام إدارة الكلية</span><span class="grow"></span>`;
    renderGuest(msg);
  }
  /* الزائر: بطاقة الدخول محور الصفحة (الإدارة، عضو هيئة التدريس، الطالب)، ثم عناصر عامة مختصرة.
     الإدارة وعضو هيئة التدريس يدخلان بالحساب الجامعي نفسه، والنظام يحدد ما يظهر لكل منهما من صلاحياته.
     الطالب لا يحتاج حسابًا: تظهر له خدمات الطلاب فقط (لا تُحفظ بيانات طلاب في النظام). */
  let GTAB = 'admin', GMSG = '';
  const GTABS = { admin: ['الإدارة', 'bank'], faculty: ['عضو هيئة التدريس', 'user'], student: ['الطالب', 'book'] };
  /* التقويم والفعاليات (من الإعدادات ← الهوية): القادم فقط، الأقرب أولًا */
  const upcoming = (list) => (Array.isArray(list) ? list : []).filter((x) => x && x.d && x.t && x.d >= today()).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 5);
  const dayTxt = (d) => { const n = Math.round((new Date(d) - new Date(today())) / 86400000);
    return d.replace(/-/g, '/') + (n === 0 ? ' · اليوم' : n === 1 ? ' · غدًا' : n > 1 && n <= 30 ? ` · بعد ${n} يومًا` : ''); };
  async function renderGuest(msg) {
    GMSG = msg || '';
    const b = await loadBrand(); BRAND = BRAND || b; applyTheme(b.theme);
    $('#brand').innerHTML = brandHtml(b);
    renderDock(b.assist || {}, false);
    const st = b.stats || {}, info = b.info || {}, anns = (b.announcements || []).slice(0, 4);
    S._anns = anns.map((a, i) => Object.assign({ id: 'pa' + i }, a));
    const c = b.assist || {}, sup = c.support || {};
    const hasChat = c.chatSrc && c.chatSrc !== 'none' && c.public, hasSup = sup.whatsapp || sup.email;
    /* الأرقام: تُخفى البطاقة التي لا قيمة لها بعد (مثل المقررات قبل استيراد الجدول) */
    const stat = (ic, n, t) => n ? `<div>${icon(ic)}<b>${n}</b><span>${esc(t)}</span></div>` : '';
    const dl = (list, empty) => list.length ? `<ul class="glist">${list.map((x) => `<li><time>${esc(dayTxt(x.d))}</time><div><b>${esc(x.t)}</b>${x.p ? `<span>${esc(x.p)}</span>` : ''}</div></li>`).join('')}</ul>` : `<div class="empty">${empty}</div>`;
    const svc = (fn, ic, t, d) => `<button onclick="${fn}">${icon(ic)}<b>${esc(t)}</b><span>${esc(d)}</span></button>`;
    /* خلفية صورة الكلية بغطاء بنفسجي، وبطاقة الدخول في الوسط (تُغيَّر الصورة من الإعدادات ← الهوية) */
    $('#view').innerHTML = `<div class="gate2">
      <section class="gbg" style="--bg:url('${attr(b.hero || BG_IMG)}')">
        <section class="gcard" aria-labelledby="gTitle">
          <header><div><h1 id="gTitle">بوابة الدخول</h1><p>نظام إدارة ${esc(b.collegeShort || 'كلية الأعمال')} — ${esc(b.university || 'جامعة الجوف')}</p><span>اختر نوع حسابك</span></div>
            <i class="gico" aria-hidden="true">${icon('login')}</i></header>
          <div class="gstripe" aria-hidden="true"></div>
          <div class="gtabs" role="tablist" aria-label="نوع الحساب">${Object.keys(GTABS).map((k) => `<button role="tab" id="gt-${k}" aria-selected="${GTAB === k}" class="${GTAB === k ? 'on' : ''}" onclick="C.gTab('${k}')">${icon(GTABS[k][1])}${GTABS[k][0]}</button>`).join('')}</div>
          <div class="gbody" id="gBody" role="tabpanel"></div>
        </section>
        <p class="gslog">${esc(b.slogan || 'معًا .. نحو مستقبل أكثر إبداعًا')}</p>
      </section>
      <div class="gwrap">
        <div class="gstats">${stat('book', info.students, 'طالب وطالبة')}${stat('user', st.faculty, 'عضو هيئة تدريس')}${stat('sitemap', st.departments, 'أقسام علمية')}${stat('cubes', st.units, 'وحدات')}${stat('users', st.committees, 'لجان')}${stat('file', st.courses, 'مقررًا دراسيًا')}</div>
        <div class="ginfo">
          <div class="box"><h2>${icon('mega')}أحدث الإعلانات</h2><div class="ann">${S._anns.length ? S._anns.map((a) => `<a class="${a.pinned ? 'pin' : ''}" href="#" onclick="C.annView('${a.id}');return false"><b>${esc(a.title)}</b><span class="d">${esc(String(a.published_at).replace(/-/g, '/'))}</span><span class="s">${esc(a.body)}</span></a>`).join('') : '<div class="empty">لا توجد إعلانات حالية.</div>'}</div></div>
          <div class="box"><h2>${icon('bolt')}الفعاليات القادمة</h2>${dl(upcoming(info.events), 'لا توجد فعاليات قادمة.')}</div>
          <div class="box"><h2>${icon('calendar')}التقويم الدراسي</h2>${dl(upcoming(info.calendar), 'يُنشر التقويم الدراسي قريبًا.')}</div>
        </div>
        <div class="gquick"><h2>${icon('bolt')}الوصول السريع</h2><div>
          ${hasChat ? svc("C.dock('chat')", 'chat', c.chatName || 'المرشد الأكاديمي', 'للطلاب: الخطط والتسجيل والأنظمة') : ''}
          ${hasSup ? svc("C.dock('sup')", 'headset', 'الدعم الفني', 'تواصل مع الكلية') : ''}
          ${svc("C.gTab('faculty');C.needLogin()", 'user', 'دخول أعضاء هيئة التدريس', 'مهامك وبرامجك')}
          ${svc('C.guide()', 'guide', 'دليل الاستخدام', 'كيف يعمل النظام')}
          ${svc("window.open('https://www.ju.edu.sa','_blank','noopener')", 'college', 'موقع جامعة الجوف', 'ju.edu.sa')}</div></div>
        <footer class="gfoot">${esc(b.footer || 'رؤية . تطوير . تميز')} · ${esc(b.university || 'جامعة الجوف')} - ${esc(b.collegeShort || 'كلية الأعمال')}</footer>
      </div></div>`;
    gBody();
  }
  function gBody() {
    const el = $('#gBody'); if (!el) return;
    const c = ASSIST.cfg || {}, sup = c.support || {};
    const hasChat = c.chatSrc && c.chatSrc !== 'none' && c.public, hasSup = sup.whatsapp || sup.email;
    if (GTAB === 'student') {
      el.innerHTML = `<p class="ghint">لا يحتاج الطالب إلى حساب في هذا النظام؛ الخدمات التالية متاحة مباشرة.</p>
        <div class="gsvc"><button onclick="C.portal()">${icon('file')}<b>بوابة الطالب</b><span>الخطة الدراسية والتوصيفات والجاهزية والتدريب والإرشاد</span></button>${hasChat ? `<button onclick="C.dock('chat')">${icon('chat')}<b>${esc(c.chatName || 'المرشد الأكاديمي')}</b><span>إجابات عن الخطط والتسجيل والأنظمة</span></button>` : ''}
          ${hasSup ? `<button onclick="C.dock('sup')">${icon('headset')}<b>الدعم الفني</b><span>تواصل مع الكلية</span></button>` : ''}
          ${S._anns.length ? `<button onclick="C.annView('${S._anns[0].id}')">${icon('mega')}<b>الإعلانات</b><span>${esc(S._anns[0].title)}</span></button>` : ''}</div>
        <form class="row" style="margin-top:12px;gap:6px" onsubmit="event.preventDefault();C.annCourse(this.code.value)"><input name="code" class="inp grow" dir="ltr" placeholder="رمز المقرر، مثل ACCT 101" aria-label="رمز المقرر">
          <button class="btn sm" type="submit">${icon('mega')}إعلانات المقرر</button></form><div id="annCourseOut"></div>`;
      return;
    }
    const adm = GTAB === 'admin';
    el.innerHTML = `<p class="ghint">${adm ? 'العميد والوكلاء ورؤساء الأقسام والوحدات ومدير النظام.' : 'تظهر لك بعد الدخول مهامك وبرامجك حسب تكليفك.'}</p>
      <form id="topLogin" autocomplete="on" aria-label="تسجيل الدخول">
        <label class="f">البريد الجامعي أو اسم المستخدم<input id="lgUser" autocomplete="username" dir="ltr" required></label>
        <label class="f">كلمة المرور<input id="lgPass" type="password" autocomplete="current-password" dir="ltr" required></label>
        ${GMSG ? `<div class="bad small">${esc(GMSG)}</div>` : ''}
        <button class="btn pri" id="lgBtn" type="submit">${icon('user')}دخول</button>
        <a class="small" href="#" onclick="C.forgot();return false">نسيت كلمة المرور؟</a>
      </form>
      ${DEMO ? `<p class="small muted" style="margin-top:12px">نسخة تجريبية — جرّب الحسابات: <a href="#" onclick="C.demoAs('admin');return false">admin</a> (مدير النظام)، <a href="#" onclick="C.demoAs('dean');return false">dean</a> (العميد)، <a href="#" onclick="C.demoAs('vice');return false">vice</a> (وكيلة الكلية)، <a href="#" onclick="C.demoAs('acct');return false">acct</a> (رئيسة قسم المحاسبة)، <a href="#" onclick="C.demoAs('exams');return false">exams</a> (مسؤول وحدة الاختبارات)، <a href="#" onclick="C.demoAs('member');return false">member</a> (عضو لجنة) — كلمة المرور 1234.</p>` : ''}`;
    $('#topLogin').addEventListener('submit', doLogin);
    if (GMSG) $('#lgUser').focus();
  }
  /* إعلانات مقرر للطالب دون حساب: برمز المقرر في الفصل الحالي (public_course_ann، الملف 15) */
  C.annCourse = (code) => busy(null, async () => { const out = $('#annCourseOut'); if (!String(code || '').trim()) return;
    let list; try { list = await D.rpc('public_course_ann', { p_code: code }); } catch (e) { list = null; }
    out.innerHTML = list === null ? '<p class="small muted">الخدمة غير متاحة حاليًا.</p>' : list.length ? `<div class="mlist" style="margin-top:8px">${list.map((a) => `<div><div class="grow"><b>${esc(a.title)}</b><div class="small">${esc(a.body)}</div></div><span class="small muted">${esc(fmtD(a.published_at))}</span></div>`).join('')}</div>`
      : '<p class="small muted" style="margin-top:8px">لا توجد إعلانات لهذا المقرر في الفصل الحالي.</p>'; });
  C.gTab = (k) => { GTAB = k; document.querySelectorAll('.gtabs button').forEach((b) => { const on = b.id === 'gt-' + k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); gBody(); };
  C.needLogin = () => { if (GTAB === 'student') C.gTab('admin'); const e = $('#lgUser'); if (e) { e.focus(); e.scrollIntoView({ block: 'center' }); } toast('سجّل الدخول أولًا.'); };
  C.forgot = () => modal('نسيت كلمة المرور', `<p>كلمات المرور لا يطّلع عليها أحد. يُنشئ لك مدير النظام كلمة مرور مؤقتة جديدة، وتغيّرها عند أول دخول.</p><p class="small muted">تواصل معه عبر زر «الدعم الفني» أسفل الصفحة.</p>`);
  C.demoAs = (u) => { $('#lgUser').value = u; $('#lgPass').value = '1234'; $('#topLogin').requestSubmit(); };
  async function doLogin(e) {
    e.preventDefault();
    if (Date.now() < LOCK_UNTIL) return toast('محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.', true);
    let u = $('#lgUser').value.trim(); const p = $('#lgPass').value;
    $('#lgBtn').disabled = true;
    try {
      if (DEMO) { if (!DM().login(u, p)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.'); }
      else {
        if (!D.auth.live()) throw new Error('لم يُضبط الاتصال بقاعدة البيانات في config.js.');
        if (!u.includes('@')) u = u.toLowerCase() + '@' + (CFG.emailDomain || 'ju.edu.sa');
        await D.auth.signIn(u, p);
      }
      FAILS = 0; $('#lgPass').value = ''; boot();
    } catch (err) { FAILS++; if (FAILS >= 5) { LOCK_UNTIL = Date.now() + 60000; FAILS = 0; } toast(err.message, true); $('#lgPass').select(); }
    finally { const bt = $('#lgBtn'); if (bt) bt.disabled = false; }
  }
  /* الألوان: الافتراضي بنفسجي شعار جامعة الجوف، ويغيّرها مدير النظام من الهوية */
  const THEME_DEF = { primary: '#7B529A', bar: '#7B529A', frame1: '#5A2775', frame2: '#9A4D9E' };
  const hx = (h) => { const m = String(h || '').match(/^#?([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)) : null; };
  const mix = (h, w, a) => { const c = hx(h), d = hx(w); return '#' + c.map((v, i) => Math.round(v * (1 - a) + d[i] * a).toString(16).padStart(2, '0')).join(''); };
  function applyTheme(t) {
    const x = Object.assign({}, THEME_DEF, t || {}); ['primary', 'bar', 'frame1', 'frame2'].forEach((k) => { if (!hx(x[k])) x[k] = THEME_DEF[k]; });
    const css = `:root{--ledger:${x.primary};--ledger2:${mix(x.primary, '#ffffff', .15)};--ledger-soft:${mix(x.primary, '#ffffff', .9)};--t-purple:${mix(x.primary, '#ffffff', .9)};--k-leadership:${x.primary};--ju:${x.primary};
      --bar:${x.bar};--bar2:${mix(x.bar, '#000000', .14)};--bar-on:${mix(x.bar, '#ffffff', .22)};--bar-ink:${mix(x.bar, '#ffffff', .94)};--frame1:${x.frame1};--frame2:${x.frame2};
      --paper:${mix(x.primary, '#ffffff', .955)};--line:${mix(x.primary, '#ffffff', .82)};--line2:${mix(x.primary, '#ffffff', .9)}}
      :root[data-theme="dark"]{--frame1:${x.frame1};--frame2:${x.frame2}}`;
    let s = document.getElementById('themeVars'); if (!s) { s = document.createElement('style'); s.id = 'themeVars'; document.head.appendChild(s); } s.textContent = css;
  }
  /* الصفحة الرئيسية بعد الدخول: بلا صور كبيرة، وما يظهر بحسب نوع المستخدم (viewRole) */
  async function pgHome() {
    const st = S.settings, role = viewRole();
    if (role === 'staff') return staffHome();
    if (isMgmt()) return pgMgmt(); if (isLeader() && !isAdmin()) return pgLead();
    const adminTop = pageHero(WELCOME(), isAdmin() ? 'مدير النظام' : '', true);
    const [anns, courses, reqs] = await Promise.all([D.select('org_announcements').catch(() => []), D.select('courses', { cols: 'id' }).catch(() => []),
      D.select('org_requests', { eq: { archived: false }, cols: 'id,unit_id,title,status,priority,assignee_faculty,due_date' }).catch(() => [])]);
    await loadTpl().catch(() => {});
    const list = anns.filter(annActive).sort((a, b) => (b.pinned - a.pinned) || b.published_at.localeCompare(a.published_at)).slice(0, 3); S._anns = anns;
    const q = (fn, ic, t) => `<button onclick="${fn}">${icon(ic)}${esc(t)}</button>`;
    const annBox = `<div class="box"><h2>${icon('mega')}أحدث الإعلانات</h2>
      <div class="ann">${list.length ? list.map((a) => `<a class="${a.pinned ? 'pin' : ''}" href="#" onclick="C.annView('${a.id}');return false"><b>${esc(a.title)}</b><span class="d">${esc(String(a.published_at).replace(/-/g, '/'))}</span><span class="s">${esc(a.body)}</span></a>`).join('') : '<div class="empty">لا توجد إعلانات حالية.</div>'}</div>
      <a class="small" href="#" onclick="C.go('ann');return false" style="display:inline-flex;gap:4px;align-items:center;margin-top:10px">عرض جميع الإعلانات ${icon('chev')}</a></div>`;
    const banner = DEMO ? '<div class="banner">نسخة تجريبية ببيانات وهمية. اخرج من القائمة العلوية وادخل بحساب آخر لترى ما يظهر لكل شخص.</div>' : '';
    const full = fullRead();
    const vis = S.units.filter((u) => u.status === 'active' && (full || cap(u.id, 'read')));
    const n = (k) => vis.filter((u) => u.kind === k).length;
    const vices = vis.filter((u) => u.kind === 'leadership' && u.parent_id).length;
    const tile = (p, ic, num, t) => `<button onclick="C.go('${p}')">${icon(ic)}<b>${num}</b><span>${esc(t)}</span></button>`;
    return `<div class="homebody">${banner}${adminTop}${mineHtml(reqs)}
      <div class="hstrip">${tile('depts', 'sitemap', n('department'), full ? 'الأقسام العلمية' : 'أقسامي')}${tile('units', 'cubes', n('unit'), full ? 'الوحدات' : 'وحداتي')}
        ${tile('committees', 'users', n('committee'), full ? 'اللجان' : 'لجاني')}${vices ? tile('vices', 'bank', vices, 'الوكالات') : ''}
        ${tile('courses', 'book', courses.length, 'المقررات')}${tile('faculty', 'user', S.faculty.filter((f) => f.status === 'نشط').length, 'أعضاء هيئة التدريس')}</div>
      <div class="home2">${annBox}<div class="box"><h2>${icon('bolt')}الوصول السريع</h2><div class="quick">
        ${q("C.go('tasks')", 'clipboard', 'المهام والتكليفات')}${q("C.go('college')", 'college', st.collegeShort || 'كلية الأعمال')}${q("C.go('courses',{tab:'current'})", 'calendar', 'جدول الدراسة')}
        ${q("C.go('files')", 'folder', 'الملفات والمرفقات')}${q(gcap('reports') ? "C.go('reports')" : "C.toast('التقارير تحتاج صلاحية «التقارير».',true)", 'chart', 'التقارير')}${q('C.guide()', 'guide', 'دليل المستخدم')}</div></div></div></div>`;
  }

  /* ===== واجهة القيادة (الملف 32): الصلاحية من المنصب في الهيكل، والمحتوى لنطاقه فقط، من البيانات الموجودة دون نسخها ===== */
  const myHeads = () => myDirect().filter((m) => m.position === 'head');
  const isLeader = () => myHeads().length > 0;
  const LEAD = { member: (() => { try { return localStorage.getItem('lead-mode') === 'member'; } catch (e) { return false; } })() };
  const leadTitle = () => { const h = myHeads().map((m) => unit(m.unit_id)).filter(Boolean); if (!h.length) return ''; if (h.some((u) => !u.parent_id)) return 'عميد الكلية'; if (h.some((u) => u.kind === 'leadership')) return 'وكيل الكلية'; return 'رئيس ' + h[0].name; };
  C.leadMode = (m) => { LEAD.member = !!m; try { localStorage.setItem('lead-mode', m ? 'member' : 'lead'); } catch (e) {} renderShell(); go('home'); };
  /* النطاق: جهاته وما تحتها. الحماية الفعلية في القاعدة (org_caps وcan_see_course وannual_level) */
  const leadScope = () => { const set = new Set(); myHeads().forEach((m) => { const add = (id) => { if (set.has(id)) return; set.add(id); S.units.filter((u) => u.parent_id === id).forEach((u) => add(u.id)); }; add(m.unit_id); });
    const all = isAdmin() || myHeads().some((m) => { const u = unit(m.unit_id); return u && !u.parent_id; }), quality = all || set.has('u-quality');
    const units = S.units.filter((u) => u.status === 'active' && (all || set.has(u.id)));
    const progs = (S.programs || []).filter((p) => p.active !== false && (quality || set.has(p.department_id)));
    const appIn = (id) => { const a = S.apps.find((x) => x.id === id); return !!a && (all || set.has(a.unit_id)); };
    const course = (x) => { if (all || appIn(x.source_app)) return true; const c = ((S.sched || {}).courses || []).find((k) => k.id === x.course_id), g = c && (S.programs || []).find((p) => p.id === c.program_id); return !!g && set.has(g.department_id); };
    return { all, quality, set, units, progs, appIn, course }; };
  const LEAD_ST = { complete: 'مكتمل', in_progress: 'قيد العمل', not_started: 'لم يبدأ', notes: 'عليه ملاحظات', met: 'مستوفٍ', unmet: 'غير مستوفٍ', draft: 'مسودة', prepared: 'أُعدّ', submitted: 'أُرسل', in_review: 'قيد المراجعة', returned: 'أُعيد', approved: 'معتمد' };
  const LEAD_KIND = { file: 'ملفات وتقارير المقررات', exam: 'الاختبارات', bb: 'البلاك بورد', flow: 'مسار اعتماد الملف' };
  C.leadKpi = (id) => { ANQ.prog = id; ANQ.tab = 'kpi'; ANQ.mode = 'program'; go('annual'); };
  /* ما ينتظر اعتمادي: القيم (من التنبيهات)، وتقارير البرامج المرسلة لوحدة الجودة */
  async function approvalsOf(urg) { const list = urg.filter((x) => /اعتمادك/.test(x.t)).map((x) => Object.assign({}, x));
    if (isLeader() && (anMem('u-quality') || isAdmin())) { const reports = await D.select('annual_reports').catch(() => []), sc = leadScope();
      reports.filter((r) => r.status === 'in_review' && sc.progs.some((p) => p.id === r.program_id)).forEach((r) => list.push({ t: 'تقرير البرنامج السنوي بانتظار المراجعة: ' + ((anProg(r.program_id) || {}).name || r.program_id), sub: 'العام ' + r.year, btn: 'فتح', act: `C.leadKpi('${r.program_id}')` })); }
    return list; }
  /* عدد ما ينتظر الاعتماد فعليًا: البند الواحد قد يجمع عدة قيم */
  const apprN = () => (S._appr || []).reduce((t, x) => t + (x.cnt || 1), 0);
  const apprList = (L) => L.length ? `<div class="clist">${L.map((x) => `<div class="aline" style="--c:#23826A"><div><b>${esc(x.t)}</b><div class="small muted">${esc(x.sub || '')}</div></div><span></span><span class="act"><button class="btn sm pri" onclick="${x.act}">${esc(x.btn)}</button></span></div>`).join('')}</div>` : '<div class="okmsg">لا شيء ينتظر اعتمادك ✓</div>';
  async function pgApprovals() { mineCss(); await mineData().catch(() => {}); navBadge(); return apprList(S._appr || []); }
  async function pgLead() {
    mineCss(); const t = curTerm(), year = String((t || {}).year || ''); await primeMine(myDirect().filter((m) => { const u = unit(m.unit_id); return u && u.status !== 'archived'; }).map((m) => m.unit_id));
    const [reqs, stAll, reports, results, links, vals, els] = await Promise.all([D.select('org_requests', { eq: { archived: false }, cols: 'id,unit_id,title,status,kind,due_date' }).catch(() => []),
      t ? D.select('course_status', { eq: { term_id: t.id } }).catch(() => []) : [], D.select('annual_reports').catch(() => []), D.select('kpi_results').catch(() => []), D.select('program_kpis').catch(() => []), D.select('data_values').catch(() => []), D.select('data_elements').catch(() => [])]); const honor = await D.select('honor_list').catch(() => []);
    await loadTpl().catch(() => {});
    let urg = [], sc0 = { my: [], mine: [] }; try { const md = await mineData(); urg = md.urg; sc0 = md.sc; } catch (e) { await loadSched().catch(() => {}); } navBadge();
    const sc = leadScope(), ids = new Set(sc.units.map((u) => u.id));
    const open = reqs.filter((q) => ids.has(q.unit_id) && q.kind !== 'inquiry' && !['done', 'rejected'].includes(q.status)), lateOf = (q) => q.due_date && q.due_date < today();
    const pend = (u) => TPLS.filter((x) => x.required && x.active && tplTargets(x).some((k) => k.id === u) && !RLOG.some((r) => r.template_id === x.id && r.unit_id === u)).length;
    const toApprove = S._appr || [];
    const units = sc.units.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)), lateUnits = units.filter((u) => open.some((q) => q.unit_id === u.id && lateOf(q))).length;
    const unitCards = units.map((u) => { const q = open.filter((x) => x.unit_id === u.id), h = headOf(u.id), l = q.filter(lateOf).length, p = pend(u.id);
      return itemCard({ title: u.name, color: unitColor(u.id), sub: h ? fName(h.faculty_id) : 'شاغر', act: `C.go('unit',{id:'${u.id}'})`, chips: chip(KIND[u.kind] || ''),
        nums: numBox(S.members.filter((m) => m.unit_id === u.id && activeM(m)).length, 'الأعضاء') + numBox(q.length, 'مفتوحة') + numBox(l, 'متأخرة', l ? 'bad' : '') + numBox(p, 'نماذج') }); }).join('');
    /* التقارير: حالة المقررات بحسب النوع */
    const st = stAll.filter((x) => sc.course(x) && LEAD_KIND[x.kind]), bySt = {};
    st.forEach((x) => { const s = x.kind === 'exam' ? (((x.details || {}).questions === 'pending') ? 'الأسئلة لم تُسلَّم' : 'الأسئلة سُلِّمت') : (LEAD_ST[x.status] || x.status || '—'); ((bySt[x.kind] = bySt[x.kind] || {})[s] = (bySt[x.kind][s] || 0) + 1); });
    const repRows = Object.keys(bySt).map((k) => itemCard({ title: LEAD_KIND[k], badges: Object.keys(bySt[k]).map((s) => chip(s + ': ' + bySt[k][s])).join(' ') })).join('');
    /* ما تنشره البرامج إلى السجل (الاستطلاعات وقياس المخرجات): من جهة البرنامج في نطاقه */
    const pub = {}; vals.forEach((v) => { const e = els.find((x) => x.code === v.element_code); if (!e || !e.source_app_id || !sc.appIn(e.source_app_id) || v.year !== year) return; const o = pub[e.source_app_id] = pub[e.source_app_id] || { a: 0, d: 0 }; if (v.status === 'approved') o.a++; else o.d++; });
    const pubRows = Object.keys(pub).map((id) => itemCard({ title: (S.apps.find((a) => a.id === id) || {}).name || id, badges: chip('معتمد: ' + pub[id].a, 'ok') + ' ' + chip('بانتظار الاعتماد: ' + pub[id].d, 'wait') })).join('');
    const follow = await followBoard({ term: t }).catch(() => '');
    let kN = 0, kA = 0; const kpiCards = sc.progs.map((g) => { const n = links.filter((l) => l.program_id === g.id && l.active !== false).length, r = results.filter((x) => x.program_id === g.id && x.year === year), a = r.filter((x) => x.status === 'approved').length, rep = reports.find((x) => x.program_id === g.id && x.year === year), s = rep ? AR_ST[rep.status] || [rep.status, ''] : ['لم يبدأ', '']; kN += n; kA += a;
      return itemCard({ title: g.name, act: `C.leadKpi('${g.id}')`, chips: chip(s[0], s[1]), nums: numBox(n || '—', 'مؤشرات') + numBox(r.length, 'محفوظة') + numBox(a, 'معتمدة', a ? 'ok' : '') }); }).join('');
    const kp = kN ? Math.round(kA / kN * 100) + '%' : '—';
    const dash = (() => { const a = S.apps.find((x) => x.id === S.settings.facultyDashApp); return a && a.current_version && appLv(a) !== 'none' ? `<h3 style="margin:18px 0 8px">القيادة</h3><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn pri" onclick="C.appOpen('${a.id}')">${icon('user')}لوحة أعضاء هيئة التدريس</button></div>` : ''; })();
    const banner = DEMO ? '<div class="banner">نسخة تجريبية ببيانات وهمية.</div>' : '';
    return `<div class="homebody">${banner}${pageHero(WELCOME(), leadTitle() + ' · ' + sc.units.length + ' جهة في نطاقك', true, `<div class="ph-chips ph-side">${myHeads().map((m) => `<span class="ph-chip">${esc(uName(m.unit_id))}</span>`).join('')}</div>`)}
      <div class="stat-row">${statCard(apprN(), 'بانتظار اعتمادي', toApprove.length ? 'يحتاج قرارك' : 'لا شيء ينتظرك', toApprove.length ? 'pink' : 'green', "C.go('approvals')")}${statCard(lateUnits, 'جهات متأخرة', `من ${units.length} جهة`, lateUnits ? 'red' : 'green', null, units.length ? lateUnits / units.length * 100 : 0)}${statCard(kp, 'اكتمال المؤشرات', `عام ${year}: ${kA} من ${kN}`, 'violet', null, kN ? kA / kN * 100 : 0)}${statCard(open.length, 'أعمال مفتوحة', 'في نطاقك', 'orange')}</div>
      ${myFac() ? homeStats(sc0, urg) + todayStrip(sc0.mine) : ''}${dash}
      <h3 style="margin:18px 0 8px">بانتظار اعتمادك</h3>${apprList(toApprove)}
      <h3 style="margin:18px 0 8px">الوحدات واللجان في نطاقك</h3><div class="item-grid">${unitCards || '<div class="empty">لا توجد جهات.</div>'}</div>
      <h3 style="margin:18px 0 8px">التقارير: ${esc((t || {}).name || '')}</h3>${repRows || pubRows ? `<div class="item-grid">${repRows}${pubRows}</div>` : '<div class="empty">لا توجد تقارير منشورة في نطاقك لهذا الفصل.</div>'}${follow}
      <h3 style="margin:18px 0 8px">المؤشرات: عام ${esc(year)}</h3>${kpiCards ? `<div class="item-grid">${kpiCards}</div>` : '<div class="empty">لا توجد برامج في نطاقك.</div>'}${opsSections({ sc, t, vals, allEls: els, st, kp, kA, kN, honor, repOk: sc.progs.filter((g) => reports.some((x) => x.program_id === g.id && x.year === year && x.status === 'approved')).length })}</div>`;
  }

  /* صفحة المناصب للمدير: الشاغل من org_members؛ والنقل يغلق تكليف السابق (org_set_head) ويسجله التدقيق، ولا يمس الحسابات ولا الأعمال */
  /* مؤشرات الإدارة في الرئيسية (الملف 37): تُقرأ من سجل البيانات فقط؛ تنشرها أداة الجداول ولوحة الأعضاء. الكلية في value_num والأقسام في details.by */
  const anElsQ = () => D.select('data_elements').then((l) => l.filter((e) => !e.auto_ok));
  const OPS = [
    { k: 'fac', t: 'أعضاء هيئة التدريس', ic: 'users', tone: 'violet', c: '#7B4FA0', key: 'facultyDashApp', src: 'لوحة أعضاء هيئة التدريس', els: ['OPS-FAC-TOTAL', 'OPS-FAC-PHD', 'OPS-FAC-SAUDI', 'OPS-FAC-FEMALE'] },
    { k: 'sch', t: 'الجدول الدراسي', ic: 'file', tone: 'blue', c: '#2563EB', key: 'schedulesApp', src: 'أداة الجداول', els: ['OPS-SCH-COURSES', 'OPS-SCH-SECTIONS', 'OPS-SCH-LECTURERS', 'OPS-SCH-NOLECT'], bad: ['OPS-SCH-NOLECT'] },
    { k: 'load', t: 'الأنصبة', ic: 'clipboard', tone: 'orange', c: '#D97706', key: 'schedulesApp', src: 'أداة الجداول', els: ['OPS-LOAD-AVG', 'OPS-LOAD-OVER', 'OPS-LOAD-UNDER'], bad: ['OPS-LOAD-OVER'] },
    { k: 'room', t: 'القاعات', ic: 'cubes', tone: 'green', c: '#0D9488', key: 'schedulesApp', src: 'أداة الجداول', els: ['OPS-ROOM-COUNT', 'OPS-ROOM-UTIL', 'OPS-ROOM-SEATS', 'OPS-ROOM-CONF'], bad: ['OPS-ROOM-CONF'] },
    { k: 'res', t: 'البحث العلمي', ic: 'chart', tone: 'pink', c: '#DB2777', key: 'facultyDashApp', src: 'لوحة أعضاء هيئة التدريس', els: ['OPS-RES-PAPERS', 'OPS-RES-CITES', 'OPS-RES-AUTHORS'] }];
  const opsWide = () => myHeads().some((m) => { const u = unit(m.unit_id); return u && (!u.parent_id || u.kind === 'leadership'); });
  const opsDKey = (s) => String(s || '').replace(/^قسم\s+/, '').trim();
  const opsDepts = (sc) => sc.units.filter((u) => u.kind === 'department').map((u) => opsDKey(u.name));
  const opsIn = (name, depts) => { const k = opsDKey(name); return depts.some((d) => d === k || d.includes(k) || k.includes(d)); };
  const opsRow = (vals, code, t) => { const l = vals.filter((v) => v.element_code === code && v.status === 'approved'); return (t && l.find((v) => v.term === t.id)) || l.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null; };
  const opsNum = (r, e, wide, depts) => { if (!r) return null; if (wide) return r.value_num; const by = (r.details || {}).by || {}, n = Object.keys(by).filter((k) => opsIn(k, depts) && by[k] != null).map((k) => Number(by[k])); if (!n.length) return e && e.unit === 'count' && r.value_num === 0 ? 0 : null; const s = n.reduce((a, b) => a + b, 0); return e && e.unit !== 'count' ? Math.round(s / n.length * 10) / 10 : s; };
  const opsFmt = (n, e) => n == null ? '—' : (e && e.unit === 'percent' ? n + '%' : Number(n).toLocaleString('en-US'));
  /* أقسام المؤشرات لصاحب المنصب: العميد والوكلاء الكلية، ورئيس القسم قسمه، وغيرهم لا تظهر لهم */
  function opsSections(ctx) { const wide = opsWide(), depts = opsDepts(ctx.sc); if (!wide && !depts.length) return '';
    S._ops = { wide, depts, vals: ctx.vals, els: ctx.allEls, t: ctx.t };
    const sec = (k, t, ic, c, body) => `<section class="ops-sec" style="--c:${c}"><h3 class="ops-h">${icon(ic)}${esc(t)}</h3>${body}</section>`;
    const out = OPS.map((o) => { const rows = o.els.map((code) => ({ code, e: ctx.allEls.find((x) => x.code === code), r: opsRow(ctx.vals, code, ctx.t) })), any = rows.some((x) => x.r);
      if (!any) return sec(o.k, o.t, o.ic, o.c, `<div class="empty small">لم تُنشر بعد. تظهر عند فتح «${esc(o.src)}» بصلاحية استخدام.</div>`);
      const cards = rows.map((x) => { const n = opsNum(x.r, x.e, wide, depts), bad = (o.bad || []).includes(x.code) && n > 0; return statCard(opsFmt(n, x.e), x.e ? x.e.name_ar : x.code, x.r && (x.r.details || {}).label || (x.r ? 'عام ' + x.r.year : ''), bad ? 'red' : o.tone, `C.opsOpen('${o.k}')`); }).join('');
      return sec(o.k, o.t, o.ic, o.c, `<div class="stat-row">${cards}</div>`); }).join('');
    const f = ctx.st.filter((x) => x.kind === 'file'), fDone = f.filter((x) => x.status === 'complete').length, fl = ctx.st.filter((x) => x.kind === 'flow'), flOk = fl.filter((x) => x.status === 'approved').length;
    const qa = sec('qa', 'الجودة', 'chart', '#16A34A', `<div class="stat-row">${statCard(f.length ? Math.round(fDone / f.length * 100) + '%' : '—', 'اكتمال ملفات المقررات', f.length ? fDone + ' من ' + f.length : 'لا ملفات منشورة', 'green', "C.go('annual')", f.length ? fDone / f.length * 100 : 0)}${statCard(flOk, 'ملفات معتمدة', fl.length ? 'من ' + fl.length + ' في المسار' : 'لا ملفات في المسار', 'green', "C.go('annual')")}${statCard(ctx.kp, 'مؤشرات البرامج المعتمدة', ctx.kA + ' من ' + ctx.kN, 'green', "C.go('annual')", ctx.kN ? ctx.kA / ctx.kN * 100 : 0)}${statCard(ctx.repOk, 'تقارير سنوية معتمدة', 'من ' + ctx.sc.progs.length + ' برنامج', 'green', "C.go('annual')")}</div>`);
    const terms = [...new Set(ctx.honor.map((h) => h.term_label))], last = terms[terms.length - 1], inT = ctx.honor.filter((h) => h.term_label === last), cats = {}; inT.forEach((h) => { cats[h.category] = (cats[h.category] || 0) + 1; }); const top = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0];
    const hon = sec('honor', 'قائمة العميد الشرفية', 'user', '#4F46E5', ctx.honor.length ? `<div class="stat-row">${statCard(inT.length, 'طالب وطالبة', last, 'violet', "C.go('honor')")}${statCard(new Set(inT.map((h) => h.program_id)).size, 'برنامج', 'في القائمة', 'violet', "C.go('honor')")}${top ? statCard(cats[top], top, 'أكثر الفئات', 'violet', "C.go('honor')") : ''}</div>` : '<div class="empty small">لا توجد قائمة بعد.</div>');
    return `<div class="ops-all">${out}${qa}${hon}</div>`; }
  C.opsOpen = (k) => { const o = OPS.find((x) => x.k === k), X = S._ops; if (!o || !X) return; const rows = o.els.map((code) => ({ e: X.els.find((x) => x.code === code), r: opsRow(X.vals, code, X.t) }));
    const names = [...new Set(rows.flatMap((x) => Object.keys(((x.r || {}).details || {}).by || {})))].filter((d) => X.wide || opsIn(d, X.depts)).sort((a, b) => a.localeCompare(b, 'ar')), a = S.apps.find((x) => x.id === S.settings[o.key]);
    const when = rows.map((x) => x.r && x.r.updated_at).filter(Boolean).sort().pop();
    modal(o.t, `<div class="tw"><table><tr><th>القسم</th>${rows.map((x) => `<th>${esc(x.e ? x.e.name_ar : '')}</th>`).join('')}</tr>${names.map((d) => `<tr><td><b>${esc(d)}</b></td>${rows.map((x) => { const v = (((x.r || {}).details || {}).by || {})[d]; return `<td>${esc(opsFmt(v == null ? null : v, x.e))}</td>`; }).join('')}</tr>`).join('') || '<tr><td colspan="9" class="muted">لا تفصيل.</td></tr>'}${X.wide ? `<tr><td><b>الكلية</b></td>${rows.map((x) => `<td><b>${esc(opsFmt(x.r ? x.r.value_num : null, x.e))}</b></td>`).join('')}</tr>` : ''}</table></div><p class="small muted" style="margin-top:8px">المصدر: ${esc(o.src)}${when ? ' · آخر نشر ' + esc(fmtD(when)) : ''}</p>`,
      `${a && a.current_version && appLv(a) !== 'none' ? `<button class="btn pri" onclick="C.close();C.appOpen('${a.id}')">فتح ${esc(o.src)}</button>` : ''}<button class="btn" onclick="C.close()">إغلاق</button>`, true); };
  C.gradApp = (id) => busy(null, async () => { if (!isAdmin()) return; const d = Object.assign({}, S.settings, { gradApp: id || null }); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; const x = await D.rpc('org_my_access'); S.appLv = x.apps || {}; toast('حُفظ.'); });
  C.schApp = (id) => busy(null, async () => { if (!isAdmin()) return; const d = Object.assign({}, S.settings, { schedulesApp: id || null }); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; toast('حُفظ.'); });

  /* قائمة العميد الشرفية (الملفان 39 و42). استثناء المالك 2026-11-01: يُخزَّن المعدل وعناصر الترتيب لطلابها فقط، وللإدارة والشؤون الأكاديمية فقط */
  const HONOR_REAL = true, HN = { term: '', dept: '', sec: '' };
  const canHonor = () => isMgmt() || honorEditor();
  const HW = () => Object.assign({ gpa: 60, part: 20, cert: 20 }, (S.settings || {}).honorWeights);
  const honorEditor = () => isAdmin() || (!!myFac() && ((S.settings || {}).honorEditors || []).includes(myFac())) || !!((S.acc || {})[(S.settings || {}).honorUnit || 'u-academic'] || {}).write;
  const hnNum = (n) => (n == null || n === '' ? '—' : String(Math.round(Number(n) * 100) / 100));
  const hnDept = (h) => opsDKey(h.dept_label || uName(((S.programs || []).find((g) => g.id === h.program_id) || {}).department_id));
  /* الترتيب داخل القسم والشطر في الفصل نفسه؛ المتساويان في المجموع لهما الترتيب نفسه */
  const hnRanks = (list) => { const m = {}; list.forEach((h) => { const k = h.term_label + '|' + hnDept(h) + '|' + h.section; (m[k] = m[k] || []).push(h); }); const out = {}; Object.values(m).forEach((l) => { l.sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0)); l.forEach((h, i) => { out[h.id] = i && Number(l[i - 1].total) === Number(h.total) ? out[l[i - 1].id] : i + 1; }); }); return out; };
  async function pgHonor() { if (!canHonor()) return '<div class="empty">هذه الصفحة للإدارة والشؤون الأكاديمية.</div>'; if (!(S.programs || []).length) S.programs = await D.select('programs', { order: ['sort'] });
    const list = await D.select('honor_list'), progs = S.programs || [], wide = mgWide() || honorEditor(), depts = wide ? [] : opsDepts(leadScope()), mine = list.filter((h) => wide || opsIn(uName((progs.find((g) => g.id === h.program_id) || {}).department_id), depts));
    const terms = [...new Set(mine.map((h) => h.term_label))]; if (HN.term && !terms.includes(HN.term)) HN.term = ''; if (!HN.term) HN.term = terms[terms.length - 1] || '';
    const inTerm = mine.filter((h) => h.term_label === HN.term), rk = hnRanks(inTerm), dl = [...new Set(inTerm.map(hnDept))].sort((a, b) => a.localeCompare(b, 'ar')), secs = [...new Set(inTerm.map((h) => h.section).filter(Boolean))];
    const rows = inTerm.filter((h) => (!HN.dept || hnDept(h) === HN.dept) && (!HN.sec || h.section === HN.sec)).sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0) || a.student_name.localeCompare(b.student_name, 'ar')); S._hnView = { rows, rk };
    const isF = (h) => /طالبات/.test(h.section), withT = rows.filter((h) => h.total != null), avg = withT.length ? Math.round(withT.reduce((a, h) => a + Number(h.total), 0) / withT.length * 100) / 100 : null, ed = honorEditor(), w = HW();
    const cards = statCard(rows.length, 'العدد الكلي', HN.term, 'violet') + dl.map((d) => statCard(rows.filter((h) => hnDept(h) === d).length, d, '', 'blue')).join('') + statCard(rows.filter((h) => !isF(h)).length, 'الطلاب', '', 'green') + statCard(rows.filter(isF).length, 'الطالبات', '', 'pink') + statCard(avg == null ? '—' : avg, 'متوسط المجموع', 'من 100', 'orange');
    const tr = rows.map((h, i) => `<tr data-n="${attr(normAr(h.student_name))}"><td><b>${rk[h.id] || ''}</b></td><td>${i + 1}</td><td>${esc(h.student_name)}</td><td dir="ltr">${esc(h.university_no)}</td><td>${hnNum(h.gpa)}</td><td>${esc(h.section)}</td><td>${esc(hnDept(h))}</td><td>${hnNum(h.c_gpa)}</td><td>${hnNum(h.c_part)}</td><td>${hnNum(h.c_cert)}</td><td><b>${hnNum(h.total)}</b></td><td class="small">${esc(h.note)}</td><td class="small">${esc(h.term_label)}</td>${ed ? `<td class="noprint"><button class="btn sm" onclick="C.hnEdit('${h.id}')">تعديل</button></td>` : ''}</tr>`).join('');
    return `<div class="stat-row noprint-keep">${cards}</div>
      <div class="row noprint" style="gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center"><select class="inp" aria-label="الفصل" onchange="C.hnF('term',this.value)">${terms.map((t) => opt(t, t, HN.term)).join('') || '<option>لا فصول</option>'}</select><select class="inp" aria-label="القسم" onchange="C.hnF('dept',this.value)">${opt('', 'كل الأقسام', HN.dept)}${dl.map((d) => opt(d, d, HN.dept)).join('')}</select><select class="inp" aria-label="الشطر" onchange="C.hnF('sec',this.value)">${opt('', 'كل الشطرين', HN.sec)}${secs.map((s) => opt(s, s, HN.sec)).join('')}</select><input class="inp" placeholder="بحث بالاسم" aria-label="بحث بالاسم" oninput="C.hnQ(this.value)"><span class="grow"></span><button class="btn sm" onclick="C.hnXlsx()">تصدير Excel</button><button class="btn sm" onclick="C.hnPrint()">طباعة</button>${isAdmin() ? `<button class="btn sm" onclick="C.hnCfg()">الأوزان ومن يعدّل</button><button class="btn sm pri" onclick="C.hnImport()">استيراد من Excel</button><button class="btn sm" onclick="C.hnWipe()">حذف القائمة</button>` : ''}</div>
      <p class="small muted noprint">الأوزان: المعدل ${w.gpa}، المشاركات ${w.part}، الشهادات ${w.cert}. عنصر المعدل يُحسب تلقائيًا. الترتيب داخل القسم والشطر. هذه البيانات للإدارة فقط، ولا تظهر في أي صفحة عامة.</p>
      ${rows.length ? `<div class="panel tw" id="hnTbl"><table><tr><th>الترتيب</th><th>م</th><th>الاسم</th><th>الرقم الجامعي</th><th>المعدل (من 5)</th><th>الشطر</th><th>القسم</th><th>المعدل ${w.gpa}%</th><th>المشاركات ${w.part}%</th><th>الشهادات ${w.cert}%</th><th>المجموع</th><th>الملاحظات</th><th>الفصل</th>${ed ? '<th class="noprint"></th>' : ''}</tr>${tr}</table></div>` : '<div class="empty">لا توجد أسماء لهذا الاختيار.</div>'}`; }
  C.hnF = (k, v) => { HN[k] = v; if (k === 'term') { HN.dept = ''; HN.sec = ''; } refresh(); };
  C.hnQ = (v) => { const k = normAr(v).trim(); document.querySelectorAll('#hnTbl tr[data-n]').forEach((t) => { t.style.display = !k || t.dataset.n.includes(k) ? '' : 'none'; }); };
  const hnShown = () => { const q = new Set([...document.querySelectorAll('#hnTbl tr[data-n]')].map((t) => t.style.display === 'none' ? null : t.dataset.n)); return S._hnView.rows.filter((h) => q.has(normAr(h.student_name))); };
  C.hnXlsx = () => { const { rk } = S._hnView, w = HW(); xlsxOut('قائمة-العميد-' + (HN.term || '') + '.xlsx', [{ name: 'قائمة العميد الشرفية', head: ['الترتيب', 'م', 'الاسم', 'الرقم الجامعي', 'المعدل (من 5)', 'الشطر', 'القسم', 'المعدل ' + w.gpa + '%', 'المشاركات ' + w.part + '%', 'الشهادات الاحترافية ' + w.cert + '%', 'المجموع', 'الملاحظات', 'الفصل'], rows: hnShown().map((h, i) => [rk[h.id] || '', i + 1, h.student_name, h.university_no, h.gpa == null ? '' : Number(h.gpa), h.section, hnDept(h), h.c_gpa == null ? '' : Number(h.c_gpa), Number(h.c_part), Number(h.c_cert), h.total == null ? '' : Number(h.total), h.note, h.term_label]) }]); };
  C.hnPrint = () => printNow('قائمة العميد الشرفية · ' + (HN.term || ''));
  C.hnEdit = (id) => { const h = S._hnView.rows.find((x) => x.id === id), w = HW(); if (!h || !honorEditor()) return;
    modal('تعديل: ' + h.student_name, `<div class="formgrid"><label class="f">المشاركات (0–${w.part})<input id="heP" type="number" step="0.01" min="0" max="${w.part}" value="${attr(hnNum(h.c_part))}" oninput="C.hnCalc()"></label><label class="f">الشهادات الاحترافية (0–${w.cert})<input id="heC" type="number" step="0.01" min="0" max="${w.cert}" value="${attr(hnNum(h.c_cert))}" oninput="C.hnCalc()"></label><label class="f full">الملاحظات<input id="heN" value="${attr(h.note || '')}"></label></div><p class="small">عنصر المعدل: <b>${hnNum(h.c_gpa)}</b> · المجموع بعد الحفظ: <b id="heT" data-g="${attr(h.c_gpa == null ? 0 : h.c_gpa)}"></b></p><div class="err"></div>`, '<button class="btn pri" id="heOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>'); C.hnCalc();
    $('#heOk').onclick = (ev) => busy(ev.target, async () => { await D.rpc('honor_edit', { p_id: id, p_part: Number(val('heP')), p_cert: Number(val('heC')), p_note: val('heN') }); C.close(); refresh(); toast('حُفظ وأُعيد الحساب.'); }); };
  C.hnCalc = () => { const t = $('#heT'); if (t) t.textContent = hnNum(Number(t.dataset.g) + (Number(val('heP')) || 0) + (Number(val('heC')) || 0)); };
  C.hnWipe = async () => { if (!isAdmin() || !HN.term) return; if (!(await confirmBox('حذف القائمة', `<p>تُحذف قائمة «${esc(HN.term)}» كلها. لا يمكن التراجع إلا باستيرادها من جديد.</p>`, 'حذف'))) return; await busy(null, async () => { await D.remove('honor_list', { eq: { term_label: HN.term } }); HN.term = ''; refresh(); toast('حُذفت القائمة.'); }); };
  C.hnCfg = () => { if (!isAdmin()) return; const w = HW(), cur = S.settings.honorEditors || [], un = S.settings.honorUnit || 'u-academic', list = S.faculty.filter((f) => f.status === 'نشط' || cur.includes(f.id)).sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
    modal('أوزان القائمة ومن يعدّلها', `<div class="formgrid"><label class="f">وزن المعدل<input id="hwG" type="number" value="${w.gpa}"></label><label class="f">وزن المشاركات<input id="hwP" type="number" value="${w.part}"></label><label class="f">وزن الشهادات<input id="hwC" type="number" value="${w.cert}"></label><label class="f">الجهة المعدِّلة<select id="hwU">${S.units.filter((u) => u.status === 'active').map((u) => opt(u.id, u.name, un)).join('')}</select></label></div><h4 style="margin:12px 0 6px">أعضاء إضافيون</h4><div class="checks" style="flex-direction:column;align-items:flex-start;max-height:35vh;overflow:auto">${list.map((f) => `<label><input type="checkbox" class="hwE" value="${f.id}" ${cur.includes(f.id) ? 'checked' : ''}> ${esc(f.name_ar)}</label>`).join('')}</div><div class="err"></div>`, '<button class="btn pri" id="hwOk">حفظ وإعادة الحساب</button><button class="btn" onclick="C.close()">إلغاء</button>', true);
    $('#hwOk').onclick = (ev) => busy(ev.target, async () => { const g = Number(val('hwG')), p = Number(val('hwP')), c = Number(val('hwC')); if (!(g >= 0 && p >= 0 && c >= 0)) throw new Error('الأوزان أرقام موجبة.'); if (g + p + c !== 100) throw new Error('مجموع الأوزان يجب أن يكون 100.'); const d = Object.assign({}, S.settings, { honorWeights: { gpa: g, part: p, cert: c }, honorUnit: val('hwU'), honorEditors: [...document.querySelectorAll('.hwE:checked')].map((x) => x.value) }); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; await D.rpc('honor_recalc'); C.close(); refresh(); toast('حُفظ وأُعيد الحساب.'); }); };
  const xlRows = async (file, sheetHas, need) => { if (!window.XLSX) throw new Error('مكتبة Excel لم تُحمَّل.'); const wb = XLSX.read(await file.arrayBuffer()), n = wb.SheetNames.find((s) => s.includes(sheetHas)); if (!n) throw new Error('لا توجد ورقة باسم «' + sheetHas + '».');
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }), hi = aoa.findIndex((r) => need.every((h) => r.some((c) => String(c).includes(h)))); if (hi < 0) throw new Error('لم تُعرف عناوين الأعمدة.');
    const H = aoa[hi].map((c) => String(c).trim()); return aoa.slice(hi + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => { const o = {}; H.forEach((h, i) => { o[h] = String(r[i] == null ? '' : r[i]).trim(); }); return o; }); };
  const colOf = (o, part) => { const k = Object.keys(o).find((x) => x.includes(part)); return k ? o[k] : ''; };
  const progByName = (s) => { const k = String(s || '').trim(); return (S.programs || []).find((g) => g.name === k || g.id === k) || null; };
  C.hnImport = () => { if (!isAdmin()) return; if (!DEMO && !HONOR_REAL) return; modal('استيراد قائمة العميد الشرفية', `<p class="small muted">الأعمدة: م، الاسم، الرقم الجامعي، المعدل (من 5)، الشطر، القسم، المعدل 60%، المشاركات 20%، الشهادات الاحترافية 20%، المجموع، الملاحظات. الطالب الموجود في الفصل يُحدَّث ولا يتكرر. وأي عمود آخر يُهمل. الفصل من الخانة إن لم يكن في الملف.</p><div class="formgrid"><label class="f">الفصل<input id="hnT" value="${attr(HN.term || (curTerm() || {}).name || '')}" oninput="C.hnBuild()"></label></div><label class="f" style="margin-top:8px">ملف Excel<input type="file" accept=".xlsx,.xls" onchange="C.hnParse(this)"></label><div id="hnOut"></div><div class="err"></div>`, `<button class="btn pri" id="hnOk" disabled>اعتماد الاستيراد</button><button class="btn" onclick="C.close()">إلغاء</button>`, true); };
  const HN_COLS = { 'م': 'seq', 'الاسم': 'name', 'الرقم الجامعي': 'uni', 'المعدل (من 5)': 'gpa', 'المعدل': 'gpa', 'الشطر': 'sec', 'القسم': 'dept', 'البرنامج': 'prog', 'الفصل': 'term', 'الملاحظات': 'note', 'المجموع': 'tot', 'المستوى': 'level', 'فئة الشرف': 'cat' };
  const hnCol = (h) => HN_COLS[h] || (/^المعدل\s*\d+/.test(h) ? 'c60' : /^المشاركات/.test(h) ? 'part' : /^الشهادات/.test(h) ? 'cert' : null);
  C.hnParse = (inp) => busy(null, async () => { const f = inp.files[0]; if (!f || !window.XLSX) return; const wb = XLSX.read(await f.arrayBuffer()); let rows = null;
    for (const n of [...wb.SheetNames].sort((a, b) => b.includes('العميد') - a.includes('العميد'))) { const aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true }), hi = aoa.findIndex((r) => r.some((c) => String(c).trim() === 'الاسم') && r.some((c) => /البرنامج|القسم/.test(String(c)))); if (hi < 0) continue; const H = aoa[hi].map((c) => hnCol(String(c).trim())); rows = aoa.slice(hi + 1).map((r) => { const o = {}; H.forEach((k, i) => { if (k) o[k] = String(r[i] == null ? '' : r[i]).trim(); }); return o; }).filter((o) => o.name); break; }
    if (!rows) throw new Error('لم يُعثر على عمودي «الاسم» و«القسم».'); S._hnRows = rows; qcDrop('honor_list'); S._hnCur = await D.select('honor_list'); C.hnBuild(); });
  const progOfDept = (d) => { const k = opsDKey(d); if (!k) return null; const l = (S.programs || []).filter((g) => g.active !== false && opsIn(uName(g.department_id), [k])); return l.find((g) => /بكالوريوس/.test(g.name)) || null; };
  C.hnBuild = () => { const rows = S._hnRows, curL = S._hnCur || []; if (!rows) return; const term0 = val('hnT').trim(), w = HW(), r2 = (x) => Math.round(x * 100) / 100, nv = (s) => { const v = String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim(); return v === '' || isNaN(Number(v)) ? null : Number(v); };
    const items = rows.map((r) => { const g = progByName(r.prog) || progOfDept(r.dept), term = r.term || term0, cur = curL.find((h) => h.term_label === term && ((r.uni && h.university_no === r.uni) || (h.student_name === r.name && g && h.program_id === g.id))) || null, gpa = nv(r.gpa), part = nv(r.part), cert = nv(r.cert), cg = gpa == null ? null : r2(gpa / 5 * w.gpa), c1 = gpa == null ? (cur ? cur.c_gpa : null) : cg, fp = part == null ? (cur ? Number(cur.c_part) : 0) : part, fc = cert == null ? (cur ? Number(cur.c_cert) : 0) : cert, tot = c1 == null ? null : r2(Number(c1) + fp + fc), ft = nv(r.tot), fg = nv(r.c60);
        const o = { student_name: r.name, program_id: g && g.id, level: r.level || (cur ? cur.level : ''), term_label: term, category: r.cat || (cur ? cur.category : ''), seq: nv(r.seq), university_no: r.uni || (cur ? cur.university_no : ''), gpa: gpa == null ? (cur ? cur.gpa : null) : gpa, section: r.sec || (cur ? cur.section : ''), dept_label: r.dept || (cur ? cur.dept_label : ''), c_gpa: c1, c_part: fp, c_cert: fc, total: tot, note: r.note || (cur ? cur.note : '') };
        const diff = (ft != null && tot != null && Math.abs(ft - tot) > 0.011 ? 'المجموع في الملف ' + ft + ' والمحسوب ' + tot + ' ' : '') + (fg != null && cg != null && Math.abs(fg - cg) > 0.011 ? 'عنصر المعدل في الملف ' + fg + ' والمحسوب ' + cg : '');
        return { o, id: cur && cur.id, diff, err: /[0-9٠-٩]/.test(r.name) ? 'في الاسم رقم' : !g ? 'برنامج غير معروف' : !term ? 'الفصل مطلوب' : gpa != null && (gpa < 0 || gpa > 5) ? 'المعدل خارج المدى' : /مثال/.test(r.name) ? 'صف مثال' : '', pn: g ? g.name : '' }; }), ok = items.filter((x) => !x.err), upd = ok.filter((x) => x.id).length, dif = ok.filter((x) => x.diff).length;
    $('#hnOut').innerHTML = `<div class="row" style="gap:6px;margin:8px 0;flex-wrap:wrap">${chip('صالح: ' + ok.length, 'ok')} ${chip('جديد: ' + (ok.length - upd))} ${chip('تحديث: ' + upd)} ${chip('مرفوض: ' + (items.length - ok.length), items.length - ok.length ? 'bad' : 'ok')} ${chip('اختلاف في الحساب: ' + dif, dif ? 'wait' : 'ok')}</div><div class="tw" style="max-height:45vh"><table><tr><th>الاسم</th><th>الرقم</th><th>المعدل</th><th>الشطر</th><th>القسم</th><th>عنصر المعدل</th><th>المشاركات</th><th>الشهادات</th><th>المجموع المحسوب</th><th></th></tr>${items.map((x) => `<tr><td>${esc(x.o.student_name)}</td><td dir="ltr">${esc(x.o.university_no)}</td><td>${hnNum(x.o.gpa)}</td><td>${esc(x.o.section)}</td><td>${esc(x.o.dept_label)}</td><td>${hnNum(x.o.c_gpa)}</td><td>${hnNum(x.o.c_part)}</td><td>${hnNum(x.o.c_cert)}</td><td><b>${hnNum(x.o.total)}</b></td><td>${x.err ? chip(x.err, 'bad') : x.diff ? chip(x.diff, 'wait') : chip(x.id ? 'تحديث' : 'جديد', 'ok')}</td></tr>`).join('')}</table></div>`;
    const b = $('#hnOk'); b.disabled = !ok.length; b.onclick = (ev) => busy(ev.target, async () => { let u = 0; for (const x of ok.filter((y) => y.id)) { await D.update('honor_list', x.o, { eq: { id: x.id } }); u++; } const add = ok.filter((y) => !y.id).map((y) => y.o); if (add.length) await D.insert('honor_list', add); S._hnRows = null; HN.term = term0 || HN.term; C.close(); refresh(); toast('حُدّث ' + u + ' وأُضيف ' + add.length + '.'); }); };

  /* بوابة الطالب (الملف 38): عامة بلا حساب. الخطة والتوصيف من مكتبة التوصيفات عبر public_plan */
  const PT = { d: null, prog: '', tab: 'plan', plan: null };
  const dispCode = (c) => String(c || '').replace(/^([^\d]+?)\s*(\d)/, '$1 $2');
  const ptLinks = (kind) => { const l = (PT.d.links || []).filter((x) => x.kind === kind); return l.filter((x) => x.program_id === PT.prog).concat(l.filter((x) => !x.program_id)); };
  const ptLoad = async () => { PT.plan = null; const g = (PT.d.programs || []).find((x) => x.id === PT.prog); if (g && g.has_plan) { try { PT.plan = await D.rpc('public_plan', { p_program: PT.prog }); } catch (e) { PT.plan = null; } } };
  C.portal = () => busy(null, async () => { PT.d = await D.rpc('public_portal'); PT.prog = PT.prog || ((PT.d.programs || [])[0] || {}).id || ''; PT.tab = 'plan'; await ptLoad(); ptDraw(); });
  C.ptProg = (id) => busy(null, async () => { PT.prog = id; await ptLoad(); ptDraw(); });
  C.ptTab = (k) => { PT.tab = k; ptDraw(); };
  C.ptBack = () => showLogin();
  function ptDraw() { const m = $('#view'), tabs = [['plan', 'الخطة الدراسية', 'file'], ['tests', 'الجاهزية والتدريب', 'clipboard'], ['adv', 'التواصل مع الإرشاد', 'users']];
    let body = '';
    if (PT.tab === 'plan') { const pl = (PT.plan || {}).plan || [], lv = {}; pl.forEach((c) => { const k = c.level || 'غير محدد'; (lv[k] = lv[k] || []).push(c); }); const cs = (PT.plan || {}).courses || [];
      body = pl.length ? Object.keys(lv).map((k) => `<section class="pt-lv"><h3>${esc(k)}</h3><div class="pt-cs">${lv[k].map((c) => { const has = cs.some((x) => x.code === c.code); return `<button class="pt-c" onclick="C.ptCourse('${attr(c.code)}')"><span class="pt-code" dir="ltr">${esc(dispCode(c.code))}</span><b>${esc(c.name)}</b><small>${esc([c.hours ? c.hours + ' ساعات' : '', c.req, has ? '' : 'التوصيف قيد الاعتماد'].filter(Boolean).join(' · '))}</small></button>`; }).join('')}</div></section>`).join('') : '<div class="empty">لم تُعتمد خطة هذا البرنامج في الموقع بعد.</div>'; }
    if (PT.tab === 'tests') { const li = (kind, t, d, ic) => { const l = ptLinks(kind); return `<div class="panel pt-box"><h3>${icon(ic)}${esc(t)}</h3><p class="small muted">${esc(d)}</p>${l.length ? l.map((x) => `<a class="btn pri" href="${attr(x.url)}" target="_blank" rel="noopener">فتح الرابط</a>${x.note ? `<span class="small muted"> ${esc(x.note)}</span>` : ''}`).join('<br>') : '<div class="small muted">لم يُضف الرابط بعد.</div>'}</div>`; };
      body = `<div class="item-grid">${li('readiness', 'اختبارات الجاهزية', 'اختبارات قياس الجاهزية لطلاب البرنامج.', 'clipboard')}${li('training', 'اختيار جهة التدريب', 'اختيار جهة التدريب الميداني.', 'cubes')}</div>`; }
    if (PT.tab === 'adv') { const ad = (PT.d.advisors || []).filter((a) => a.program_id === PT.prog), sec = (s) => { const l = ad.filter((a) => a.section === s); return `<h3 style="margin:14px 0 6px">${esc(s)}</h3>${l.length ? `<div class="item-grid">${l.map((a) => `<div class="panel pt-box"><b>${esc(a.name)}</b>${a.email ? `<div class="small"><a href="mailto:${attr(a.email)}" dir="ltr">${esc(a.email)}</a></div>` : ''}${a.office_hours ? `<div class="small">الساعات المكتبية: ${esc(a.office_hours)}</div>` : ''}${a.office ? `<div class="small">المكتب: ${esc(a.office)}</div>` : ''}</div>`).join('')}</div>` : '<div class="small muted">لم يُحدَّد مرشد بعد.</div>'}`; };
      body = sec('طلاب') + sec('طالبات'); }
    m.innerHTML = `<div class="portal">${pageHero('بوابة الطالب', 'دون حساب: اختر برنامجك', false, `<button class="btn sm" onclick="C.ptBack()">العودة</button>`)}
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0"><label class="small"><b>البرنامج</b> <select class="inp" onchange="C.ptProg(this.value)">${(PT.d.programs || []).map((g) => opt(g.id, g.name, PT.prog)).join('')}</select></label><span class="grow"></span><button class="btn sm" onclick="C.dock('chat')">${icon('chat')}المرشد الذكي</button></div>
      <div class="pt-tabs" role="tablist">${tabs.map(([k, t, ic]) => `<button role="tab" aria-selected="${PT.tab === k}" class="${PT.tab === k ? 'on' : ''}" onclick="C.ptTab('${k}')">${icon(ic)}${esc(t)}</button>`).join('')}</div><div class="pt-body">${body}</div></div>`; window.scrollTo(0, 0); }
  C.ptCourse = (code) => { const pl = ((PT.plan || {}).plan || []).find((c) => c.code === code) || {}, c = ((PT.plan || {}).courses || []).find((x) => x.code === code);
    const dom = { k: 'المعرفة والفهم', s: 'المهارات', v: 'القيم' }, sub = (t, b) => b ? `<h4 style="margin:12px 0 4px">${esc(t)}</h4>${b}` : '', hrs = (c && c.credit) || pl.hours, pre = (c && c.prereq) || pl.prereq;
    const clos = c && (c.clos || []).length ? Object.keys(dom).map((d) => { const l = c.clos.filter((o) => o.domain === d); return l.length ? `<b class="small">${dom[d]}</b><ul class="small">${l.map((o) => `<li>${esc(o.code)} ${esc(o.text)}</li>`).join('')}</ul>` : ''; }).join('') : '';
    const refs = c && c.refs ? [['main', 'المراجع الرئيسية'], ['support', 'المراجع المساندة'], ['electronic', 'المصادر الإلكترونية'], ['other', 'أخرى']].filter(([k]) => c.refs[k]).map(([k, t]) => `<div class="small"><b>${t}:</b> ${esc(c.refs[k])}</div>`).join('') : '';
    modal(dispCode(code) + ': ' + (pl.name || (c || {}).name || ''), `<div class="row" style="gap:6px;flex-wrap:wrap">${hrs ? chip('الساعات: ' + hrs) : ''}${chip('المتطلب السابق: ' + (pre || 'لا يوجد'))}${pl.req ? chip(pl.req) : ''}</div>${c ? sub('الوصف', c.description ? `<p class="small">${esc(c.description)}</p>` : '') + sub('مخرجات التعلم', clos) + sub('المحتوى', (c.topics || []).length ? `<ul class="small">${c.topics.map((t) => `<li>${esc(t.title)}${t.hours ? ' (' + esc(t.hours) + ' س)' : ''}</li>`).join('')}</ul>` : '') + sub('التقويم', (c.assessments || []).length ? `<ul class="small">${c.assessments.map((a) => `<li>${esc(a.activity)}${a.timing ? ' · ' + esc(a.timing) : ''}${a.weight != null ? ' · ' + esc(a.weight) + '%' : ''}</li>`).join('')}</ul>` : '') + sub('المراجع', refs) : '<p class="small muted" style="margin-top:10px">التوصيف التفصيلي قيد الاعتماد.</p>'}`, '<button class="btn" onclick="C.close()">إغلاق</button>', true); };

  /* إدارة البوابة: كل جهة تحدّث ما يخصها (org_settings.data.portalUnits) */
  const PORTAL_KINDS = [['readiness', 'لجنة الجاهزية (روابط الجاهزية)'], ['training', 'لجنة التدريب (روابط التدريب)'], ['advising', 'وحدة الإرشاد (المرشدون)']];
  const portalCan = (k) => { if (isAdmin()) return true; const u = ((S.settings || {}).portalUnits || {})[k]; return !!u && !!((S.acc || {})[u] || {}).write; };
  const portalAny = () => PORTAL_KINDS.some(([k]) => portalCan(k));
  const LINK_KIND = { readiness: 'اختبارات الجاهزية', training: 'اختيار جهة التدريب' };
  async function pgPortal() { if (!portalAny()) return '<div class="empty">هذه الصفحة للجهات المسؤولة عن البوابة.</div>'; if (!(S.programs || []).length) S.programs = await D.select('programs', { order: ['sort'] });
    const [links, adv] = await Promise.all([D.select('portal_links'), D.select('portal_advisors')]), pn = (id) => id ? ((S.programs || []).find((g) => g.id === id) || {}).name || id : 'كل البرامج', un = (S.settings || {}).portalUnits || {}, canL = portalCan('readiness') || portalCan('training');
    return `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn sm" onclick="C.portal2()">معاينة البوابة</button><span class="grow"></span>${isAdmin() ? `<button class="btn sm pri" onclick="C.ptImport()">استيراد من Excel</button>` : ''}</div>
      ${isAdmin() ? `<div class="panel" style="margin-bottom:12px"><h3>الجهة المسؤولة</h3><div class="formgrid">${PORTAL_KINDS.map(([k, t]) => `<label class="f">${esc(t)}<select onchange="C.ptUnit('${k}',this.value)">${opt('', '—', un[k] || '')}${S.units.filter((u) => u.status === 'active').map((u) => opt(u.id, u.name, un[k] || '')).join('')}</select></label>`).join('')}</div></div>` : ''}
      ${canL ? `<h3 style="margin:12px 0 6px">الروابط</h3><div class="panel tw"><table><tr><th>البند</th><th>البرنامج</th><th>الرابط</th><th>ملاحظة</th><th></th></tr>${links.filter((l) => portalCan(l.kind)).map((l) => `<tr><td>${esc(LINK_KIND[l.kind])}</td><td>${esc(pn(l.program_id))}</td><td class="small" dir="ltr">${esc(l.url)}</td><td class="small">${esc(l.note)}</td><td><button class="btn sm" onclick="C.ptLinkEdit('${l.id}')">تعديل</button> <button class="btn sm" onclick="C.ptDel('portal_links','${l.id}')">حذف</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا روابط بعد.</td></tr>'}</table></div><button class="btn sm" style="margin-top:6px" onclick="C.ptLinkEdit('')">إضافة رابط</button>` : ''}
      ${portalCan('advising') ? `<h3 style="margin:16px 0 6px">المرشدون</h3><div class="panel tw"><table><tr><th>البرنامج</th><th>الشطر</th><th>المرشد</th><th>البريد</th><th>الساعات</th><th>المكتب</th><th></th></tr>${adv.map((a) => `<tr><td>${esc(pn(a.program_id))}</td><td>${esc(a.section)}</td><td>${esc(a.name)}</td><td class="small" dir="ltr">${esc(a.email)}</td><td class="small">${esc(a.office_hours)}</td><td class="small">${esc(a.office)}</td><td><button class="btn sm" onclick="C.ptAdvEdit('${a.id}')">تعديل</button> <button class="btn sm" onclick="C.ptDel('portal_advisors','${a.id}')">حذف</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">لا مرشدون بعد.</td></tr>'}</table></div><button class="btn sm" style="margin-top:6px" onclick="C.ptAdvEdit('')">إضافة مرشد</button>` : ''}`; }
  C.portal2 = () => busy(null, async () => { S._ptPrev = await D.rpc('public_portal'); const g = S._ptPrev; modal('معاينة: ما يراه الطالب', `<p class="small muted">${(g.programs || []).length} برنامج · ${(g.links || []).length} رابط · ${(g.advisors || []).length} مرشد. البوابة الكاملة من صفحة الزائر ← الطالب.</p>`, '<button class="btn" onclick="C.close()">إغلاق</button>'); });
  C.ptUnit = (k, id) => busy(null, async () => { if (!isAdmin()) return; const d = Object.assign({}, S.settings, { portalUnits: Object.assign({}, S.settings.portalUnits, { [k]: id || null }) }); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; toast('حُفظ.'); });
  C.ptDel = (t, id) => busy(null, async () => { await D.remove(t, { eq: { id } }); refresh(); });
  const progOpts = (cur, all) => (all ? opt('', 'كل البرامج', cur || '') : '') + (S.programs || []).filter((g) => g.active !== false).map((g) => opt(g.id, g.name, cur || '')).join('');
  C.ptLinkEdit = (id) => busy(null, async () => { const l = id ? (await D.select('portal_links', { eq: { id } }))[0] : { kind: portalCan('readiness') ? 'readiness' : 'training' };
    modal(id ? 'تعديل رابط' : 'إضافة رابط', `<div class="formgrid"><label class="f">البند<select id="plK">${['readiness', 'training'].filter(portalCan).map((k) => opt(k, LINK_KIND[k], l.kind)).join('')}</select></label><label class="f">البرنامج<select id="plP">${progOpts(l.program_id, true)}</select></label><label class="f full">الرابط<input id="plU" dir="ltr" value="${attr(l.url || '')}" placeholder="https://"></label><label class="f full">ملاحظة<input id="plN" value="${attr(l.note || '')}"></label></div><div class="err"></div>`, '<button class="btn pri" id="plOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>');
    $('#plOk').onclick = (ev) => busy(ev.target, async () => { const u = val('plU').trim(); if (!/^https?:\/\//i.test(u)) throw new Error('الرابط يبدأ بـ https://'); const r = { kind: val('plK'), program_id: val('plP') || null, url: u, note: val('plN') }; if (id) await D.update('portal_links', r, { eq: { id } }); else await D.insert('portal_links', r); C.close(); refresh(); }); });
  C.ptAdvEdit = (id) => busy(null, async () => { const a = id ? (await D.select('portal_advisors', { eq: { id } }))[0] : { section: 'طلاب' };
    modal(id ? 'تعديل مرشد' : 'إضافة مرشد', `<div class="formgrid"><label class="f">البرنامج<select id="paP">${progOpts(a.program_id)}</select></label><label class="f">الشطر<select id="paS">${['طلاب', 'طالبات'].map((s) => opt(s, s, a.section)).join('')}</select></label><label class="f full">الاسم<input id="paN" value="${attr(a.name || '')}"></label><label class="f full">البريد الجامعي<input id="paE" dir="ltr" value="${attr(a.email || '')}"></label><label class="f">الساعات المكتبية<input id="paH" value="${attr(a.office_hours || '')}"></label><label class="f">المكتب / القاعة<input id="paO" value="${attr(a.office || '')}"></label></div><div class="err"></div>`, '<button class="btn pri" id="paOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>');
    $('#paOk').onclick = (ev) => busy(ev.target, async () => { const n = val('paN').trim(); if (!n) throw new Error('اكتب الاسم.'); const r = { program_id: val('paP'), section: val('paS'), name: n, email: val('paE').trim(), office_hours: val('paH'), office: val('paO') }; if (id) await D.update('portal_advisors', r, { eq: { id } }); else await D.insert('portal_advisors', r); C.close(); refresh(); }); });
  C.ptImport = () => modal('استيراد من ملف مدخلات البوابة', `<p class="small muted">ورقتا «الروابط» و«المرشدون». الصفوف الموجودة تبقى، ويُضاف الجديد بعد المعاينة.</p><label class="f">ملف Excel<input type="file" accept=".xlsx" onchange="C.ptParse(this)"></label><div id="ptOut"></div><div class="err"></div>`, '<button class="btn pri" id="ptOk" disabled>اعتماد الاستيراد</button><button class="btn" onclick="C.close()">إلغاء</button>', true);
  C.ptParse = (inp) => busy(null, async () => { const f = inp.files[0]; if (!f) return; const lr = await xlRows(f, 'الروابط', ['البند', 'الرابط']), ar = await xlRows(f, 'المرشدون', ['اسم المرشد']);
    const ln = lr.map((r) => { const it = colOf(r, 'البند'), k = /جاهز/.test(it) ? 'readiness' : /تدريب/.test(it) ? 'training' : '', pt = colOf(r, 'البرنامج'), g = progByName(pt), u = colOf(r, 'الرابط'), demo = /مثال/.test(colOf(r, 'ملاحظة')); return { kind: k, program_id: g ? g.id : null, url: u, note: demo ? '' : colOf(r, 'ملاحظة'), _t: it, _p: pt, _e: !k ? 'بند غير معروف' : !/^https?:\/\/.+\..+/i.test(u) || /\.\.\.$/.test(u) ? 'رابط غير صالح' : !g && pt !== 'الكل' ? 'برنامج غير معروف' : demo ? 'صف مثال' : '' }; });
    const an = ar.map((r) => { const g = progByName(colOf(r, 'البرنامج')), s = colOf(r, 'الشطر'); return { program_id: g && g.id, section: s, name: colOf(r, 'اسم المرشد'), email: colOf(r, 'البريد'), office_hours: colOf(r, 'الساعات'), office: colOf(r, 'المكتب'), _p: colOf(r, 'البرنامج'), _e: !g ? 'برنامج غير معروف' : !['طلاب', 'طالبات'].includes(s) ? 'الشطر طلاب أو طالبات' : !colOf(r, 'اسم المرشد') ? 'بلا اسم' : /مثال/.test(colOf(r, 'اسم المرشد')) ? 'صف مثال' : '' }; });
    const lo = ln.filter((x) => !x._e), ao = an.filter((x) => !x._e), st = (e) => e ? chip(e, 'bad') : chip('صالح', 'ok');
    $('#ptOut').innerHTML = `<h4>الروابط: ${lo.length} صالح من ${ln.length}</h4><div class="tw" style="max-height:25vh"><table>${ln.map((x) => `<tr><td>${esc(x._t)}</td><td>${esc(x._p)}</td><td class="small" dir="ltr">${esc(x.url)}</td><td>${st(x._e)}</td></tr>`).join('')}</table></div><h4>المرشدون: ${ao.length} صالح من ${an.length}</h4><div class="tw" style="max-height:25vh"><table>${an.map((x) => `<tr><td>${esc(x._p)}</td><td>${esc(x.section)}</td><td>${esc(x.name)}</td><td class="small" dir="ltr">${esc(x.email)}</td><td>${st(x._e)}</td></tr>`).join('')}</table></div>`;
    const b = $('#ptOk'); b.disabled = !lo.length && !ao.length; b.onclick = (ev) => busy(ev.target, async () => { const cl = ({ _e, _p, _t, ...r }) => r; if (lo.length) await D.insert('portal_links', lo.map(cl)); if (ao.length) await D.insert('portal_advisors', ao.map(cl)); C.close(); refresh(); toast('استُورد.'); }); });

  /* الإرشاد الأكاديمي: في ?demo فقط ببيانات وهمية. لا تُرفع قوائم طلاب حقيقية إلى الخادم التجريبي، ويُفعَّل بعد النقل */
  const canAdvise = () => DEMO && !!myFac();
  async function pgAdvising() { if (!canAdvise()) return '<div class="empty">يُفعَّل الإرشاد الأكاديمي بعد النقل إلى خادم الجامعة.</div>';
    const L = await D.rpc('advising_list'), cur = L.find((s) => s.id === S._advS) || L[0];
    return `<div class="banner">بيانات وهمية للتجربة فقط. تُفعَّل الصفحة بعد النقل إلى خادم الجامعة.</div>
      <div class="stat-row" style="margin:12px 0">${statCard(L.length, 'طلابي المرشدون', '', 'violet')}${statCard(L.filter((s) => s.unread).length, 'رسائل جديدة', '', L.some((s) => s.unread) ? 'pink' : 'green')}</div>
      <div class="adv-grid"><div class="panel adv-list">${L.map((s) => `<button class="${cur && s.id === cur.id ? 'on' : ''}" onclick="C.advS('${s.id}')"><b>${esc(s.name)}</b><small>${esc(s.program)} · المستوى ${esc(s.level)}</small>${s.unread ? chip('جديد', 'wait') : ''}</button>`).join('') || '<div class="empty">لا طلاب.</div>'}</div>
      <div class="panel adv-chat">${cur ? `<h3>${esc(cur.name)}</h3><div class="adv-msgs">${cur.msgs.map((m) => `<div class="${m.me ? 'me' : ''}"><span>${esc(m.text)}</span><small>${esc(m.at)}</small></div>`).join('') || '<p class="small muted">لا رسائل بعد.</p>'}</div><form class="row" style="gap:6px;margin-top:8px" onsubmit="event.preventDefault();C.advSend('${cur.id}',this.t.value)"><input name="t" class="inp grow" placeholder="اكتب رسالة" aria-label="رسالة"><button class="btn pri" type="submit">إرسال</button></form>` : ''}</div></div>`; }
  C.advS = (id) => busy(null, async () => { S._advS = id; await D.rpc('advising_read', { p_id: id }); refresh(); });
  C.advSend = (id, t) => busy(null, async () => { if (!String(t || '').trim()) return; S._advS = id; await D.rpc('advising_send', { p_id: id, p_text: t }); refresh(); });

  /* حساب الإدارة (مدير النظام والعميد والوكلاء ورؤساء الأقسام): قائمة ورئيسية خاصة. رؤساء الوحدات واللجان والعضو تبقى واجهاتهم */
  const isMgmt = () => isAdmin() || myHeads().some((m) => { const u = unit(m.unit_id); return u && (!u.parent_id || u.kind === 'leadership' || u.kind === 'department'); });
  const mgWide = () => isAdmin() || opsWide();
  const MG_TOOL = { fac: ['facultyDashApp', 'home', 'لوحة الأعضاء'], res: ['gradApp', 'research', 'برنامج الدراسات العليا'], gs: ['gradApp', 'students', 'برنامج الدراسات العليا'], gg: ['gradApp', 'graduates', 'برنامج الدراسات العليا'], fsch: ['facultyDashApp', 'schedules', 'لوحة الأعضاء'], sch: ['schedulesApp', 'dash', 'أداة الجداول'], load: ['schedulesApp', 'load', 'أداة الجداول'], room: ['schedulesApp', 'rooms', 'أداة الجداول'] };
  const MG_NAV = [['fac', 'مؤشرات أعضاء هيئة التدريس', 'users'], ['sch', 'مؤشرات الجداول والأنصبة والقاعات', 'file']];
  const mgmtNav = (foot) => { const a = (p, ic, t, fn) => `<button class="nav" data-p="${p}" onclick="${fn}">${icon(ic)}${esc(t)}</button>`;
    return a('home', 'home', 'الرئيسية', "C.go('home')") + MG_NAV.map(([k, t, ic]) => a('m' + k, ic, t, `C.mOpen('${k}')`)).join('') + '<div class="sidehead">مؤشرات البحث العلمي</div>' + a('mres', 'chart', 'البحث العلمي', "C.mOpen('res')") + a('mgs', 'book', 'الدراسات العليا', "C.mOpen('gs')") + a('mgg', 'user', 'خريجو الدراسات العليا', "C.mOpen('gg')") + '<div class="sep"></div>' + a('annual', 'chart', 'مؤشرات الجودة', "C.go('annual')") + a('honor', 'user', 'قائمة العميد الشرفية', "C.go('honor')") + a('collegeprogs', 'book', 'برامج الكلية', "C.go('collegeprogs')") + '<div id="navTeach"></div>' + foot; };
  /* رابط واحد لمن يدرّس مقررات هذا الفصل */
  const mgmtTeach = async () => { const t = curTerm(), f = myFac(); if (!t || !f) return; const l = await D.rpc('faculty_courses', { p_faculty: f, p_term: t.id }).catch(() => []), e = $('#navTeach'); if (e && (l || []).length) e.innerHTML = `<div class="sep"></div><button class="nav sub" onclick="C.leadMode(true)">${icon('clipboard')}<span class="grow">أعمالي التدريسية</span></button>`; };
  const mgDept = () => { if (mgWide()) return ''; const d = myHeads().map((m) => unit(m.unit_id)).find((u) => u && u.kind === 'department'); return d ? opsDKey(d.name) : ''; };
  /* حالة البرنامج المربوط: جاهز للفتح، أو السبب والمطلوب */
  const mgTool = (key, name) => { const id = (S.settings || {})[key], a = id && (S.apps || []).find((x) => x.id === id);
    if (!a) return { why: `لم تُربط ${name} بالموقع بعد`, btn: isAdmin() ? 'اربطها من المناصب' : '', act: "C.go('positions')" };
    if (!a.current_version) return { why: `لم يُرفع ملف ${name} بعد`, btn: isAdmin() ? 'ارفع الملف' : '', act: `C.go('unit',{id:'${a.unit_id}',tab:'apps'})` };
    if (appLv(a) === 'none') return { why: `لا تملك صلاحية فتح ${name}`, btn: '', act: '' };
    return { ok: true, app: a }; };
  C.mOpen = (k) => { const [key, tab, name] = MG_TOOL[k], s = mgTool(key, name), set = { fac: 'fac', res: 'res', fsch: 'sched' }[k] || '', nav = k === 'fsch' ? 'msch' : 'm' + k; if (s.ok) return go('app', { id: s.app.id, ctx: { tab, set, dept: mgDept(), embed: true }, nav }); if (k === 'fsch') return toast(s.why + '.', true); go('mpage', { k, nav }); };
  const mgFoot = (src, when, who) => `<div class="mg-foot">${esc(src)}${when ? ' — آخر تحديث ' + esc(new Date(when).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' })) : ''}${who ? ' — ' + esc(who) : ''}</div>`;
  const mgEmpty = (why, btn, act) => `<div class="mg-empty"><p>${esc(why)}</p>${btn ? `<button class="btn sm pri" onclick="event.stopPropagation();${attr(act)}">${esc(btn)}</button>` : ''}</div>`;
  const mgCard = (o) => `<section class="mg-card ${o.cls || ''}" style="--c:${o.c}"${o.act ? ` role="button" tabindex="0" onclick="${attr(o.act)}" onkeydown="if(event.key==='Enter')this.click()"` : ''}><h3>${icon(o.ic)}${esc(o.t)}</h3>${o.body}${o.foot || ''}</section>`;
  const mgNums = (l) => `<div class="mg-nums">${l.map(([n, t, bad]) => `<div class="${bad ? 'bad' : ''}"><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join('')}</div>`;
  async function pgMgmt() { mineCss(); const t = curTerm(), year = String((t || {}).year || '');
    const [stAll, reports, results, links, vals, els, honor, plans, programs] = await Promise.all([t ? D.select('course_status', { eq: { term_id: t.id } }).catch(() => []) : [], D.select('annual_reports').catch(() => []), D.select('kpi_results').catch(() => []), D.select('program_kpis').catch(() => []), D.select('data_values').catch(() => []), D.select('data_elements').catch(() => []), D.select('honor_list').catch(() => []), D.select('study_plans').catch(() => []), D.select('programs', { order: ['sort'] }).catch(() => S.programs || [])]);
    S.programs = programs; const wide = mgWide(), sc = wide ? null : leadScope(), depts = wide ? [] : opsDepts(sc); S._ops = { wide, depts, vals, els, t };
    const progs = programs.filter((g) => g.active !== false && (wide || depts.some((d) => opsIn(uName(g.department_id), [d]))));
    const st = stAll.filter((x) => (wide || sc.course(x)) && LEAD_KIND[x.kind]);
    const card = (o) => { const name = MG_TOOL[o.k][2], k0 = MG_TOOL[o.k][0], tool = mgTool(k0, name), who = tool.app ? uName(tool.app.unit_id) : o.who, rows = o.els.map((code) => ({ code, e: els.find((x) => x.code === code), r: opsRow(vals, code, t) })), any = rows.some((x) => x.r && x.r.value_num != null), when = rows.map((x) => x.r && x.r.updated_at).filter(Boolean).sort().pop();
      if (!any) { const why = !tool.ok ? tool.why : o.none; return mgCard({ t: o.t, ic: o.ic, c: o.c, body: mgEmpty(why + (tool.ok || tool.btn ? ' —' : '.'), tool.ok ? 'افتح ' + name : tool.btn, tool.ok ? `C.mOpen('${o.k}')` : tool.act), foot: mgFoot(o.src, '', o.who) }); }
      return mgCard({ t: o.t, ic: o.ic, c: o.c, act: `C.mOpen('${o.k}')`, cls: o.wide3 ? 'mg-3' : '', body: mgNums(rows.map((x) => { const n = opsNum(x.r, x.e, wide, depts); return [opsFmt(n, x.e), x.e ? x.e.name_ar : x.code, (o.bad || []).includes(x.code) && n > 0]; })), foot: mgFoot(o.src, when, o.who) }); };
    const OP = (k) => OPS.find((o) => o.k === k);
    const fac = card({ k: 'fac', t: 'مؤشرات أعضاء هيئة التدريس', ic: 'users', c: '#7B4FA0', els: OP('fac').els, none: 'لم تُنشر مؤشرات الأعضاء بعد', src: 'من لوحة الأعضاء', who: 'إدارة الأعضاء' });
    const sch = card({ k: 'sch', t: 'مؤشرات الجداول والأنصبة والقاعات', ic: 'file', c: '#2563EB', wide3: true, els: ['OPS-SCH-COURSES', 'OPS-SCH-SECTIONS', 'OPS-SCH-NOLECT', 'OPS-LOAD-OVER', 'OPS-ROOM-UTIL', 'OPS-ROOM-CONF'], bad: ['OPS-SCH-NOLECT', 'OPS-LOAD-OVER', 'OPS-ROOM-CONF'], none: 'لم تُستورد بيانات الجداول بعد', src: 'من أداة الجداول', who: 'لجنة الجداول' });
    const resT = mgTool('gradApp', 'برنامج الدراسات العليا'), [roL, enL, grL, guL] = await Promise.all([D.select('research_output').catch(() => []), D.select('pg_enrollment').catch(() => []), D.select('pg_graduates').catch(() => []), D.select('grad_updates').catch(() => [])]), rsum = (l, k) => l.reduce((a, x) => a + (Number(x[k]) || 0), 0), guWhen = guL.map((x) => x.at).filter(Boolean).sort().pop(), resF = mgFoot('من بيانات وحدة الدراسات العليا والبحث العلمي', guWhen, 'وحدة الدراسات العليا والبحث العلمي');
    const res = mgCard({ t: 'مؤشرات البحث العلمي', ic: 'chart', c: '#DB2777', cls: 'mg-3', act: "C.mOpen('res')", body: roL.length || enL.length || grL.length ? mgNums([[rsum(roL, 'sc_pubs').toLocaleString('en-US'), 'أبحاث Scopus'], [rsum(roL, 'sc_cites').toLocaleString('en-US'), 'استشهادات Scopus'], [rsum(enL, 'total').toLocaleString('en-US'), 'المقيدون'], [rsum(enL, 'new_count').toLocaleString('en-US'), 'الجدد'], [rsum(grL, 'graduates').toLocaleString('en-US'), 'الخريجون']]) : mgEmpty((resT.ok ? 'لم تُحمَّل بيانات البحث والدراسات العليا بعد' : resT.why) + (resT.ok || resT.btn ? ' —' : '.'), resT.ok ? 'افتح البرنامج' : resT.btn, resT.ok ? "C.mOpen('res')" : resT.act), foot: resF });
    /* الجودة: من قياس المخرجات والاستطلاعات وسجل البيانات */
    const f = st.filter((x) => x.kind === 'file'), fDone = f.filter((x) => x.status === 'complete').length, fl = st.filter((x) => x.kind === 'flow'), flOk = fl.filter((x) => x.status === 'approved').length;
    let kN = 0, kA = 0; progs.forEach((g) => { kN += links.filter((l) => l.program_id === g.id && l.active !== false).length; kA += results.filter((x) => x.program_id === g.id && x.year === year && x.status === 'approved').length; });
    const repOk = progs.filter((g) => reports.some((x) => x.program_id === g.id && x.year === year && x.status === 'approved')).length, qaWhen = st.concat(results).map((x) => x.updated_at).filter(Boolean).sort().pop();
    const qa = mgCard({ t: 'مؤشرات الجودة', ic: 'chart', c: '#16A34A', act: "C.go('annual')", body: f.length || fl.length || kN ? mgNums([[f.length ? Math.round(fDone / f.length * 100) + '%' : '—', 'اكتمال ملفات المقررات'], [flOk, 'ملفات معتمدة'], [kN ? Math.round(kA / kN * 100) + '%' : '—', 'مؤشرات البرامج المعتمدة'], [repOk, 'تقارير سنوية معتمدة']]) : mgEmpty('لم تنشر البرامج مؤشرات جودة بعد —', 'افتح سجل البيانات', "C.go('annual')"), foot: mgFoot('من قياس المخرجات والاستطلاعات وسجل البيانات', qaWhen, 'وحدة الجودة') });
    /* قائمة العميد */
    const hIn = honor.filter((h) => progs.some((g) => g.id === h.program_id)), terms = [...new Set(hIn.map((h) => h.term_label))], last = terms[terms.length - 1], inT = hIn.filter((h) => h.term_label === last), hDepts = [...new Set(inT.map(hnDept))].sort((a, b) => a.localeCompare(b, 'ar')), hF = inT.filter((h) => /طالبات/.test(h.section)).length, hWhen = hIn.map((h) => h.updated_at || h.created_at).filter(Boolean).sort().pop();
    const hon = mgCard({ t: 'قائمة العميد الشرفية', ic: 'user', c: '#4F46E5', act: "C.go('honor')", cls: 'mg-3', body: hIn.length ? mgNums([[inT.length, 'العدد · ' + last]].concat(hDepts.map((d) => [inT.filter((h) => hnDept(h) === d).length, d])).concat([[inT.length - hF, 'الطلاب'], [hF, 'الطالبات']])) : mgEmpty('لم تُستورد قائمة هذا الفصل بعد —', 'افتح القائمة', "C.go('honor')"), foot: mgFoot('من ملف الشؤون الأكاديمية', hWhen, 'الشؤون الأكاديمية') });
    /* برامج الكلية */
    const inPl = plans.filter((p) => progs.some((g) => g.id === p.program_id)), plWhen = inPl.map((p) => p.updated_at).filter(Boolean).sort().pop();
    const pr = mgCard({ t: 'برامج الكلية', ic: 'book', c: '#0891B2', act: "C.go('collegeprogs')", body: inPl.length ? mgNums([[progs.length, 'برنامج'], [inPl.length, 'لها خطة دراسية'], [inPl.reduce((a, p) => a + (p.total_hours || 0), 0) && inPl[0].total_hours, 'ساعة (' + (progs.find((g) => g.id === inPl[0].program_id) || {}).name + ')']]) : mgEmpty('لم تُستورد خطط البرامج بعد —', 'افتح برامج الكلية', "C.go('collegeprogs')"), foot: mgFoot('من الخطط الدراسية ومكتبة التوصيفات', plWhen, 'منسقو البرامج') });
    const n = apprN();
    return `<div class="homebody">${DEMO ? '<div class="banner">نسخة تجريبية ببيانات وهمية.</div>' : ''}${pageHero(WELCOME(), isAdmin() && !isLeader() ? 'مدير النظام · الكلية' : leadTitle() + (wide ? ' · الكلية' : ''), true)}
      ${n ? `<button class="mg-appr" onclick="C.go('approvals')">${icon('clipboard')}بانتظار اعتمادك: ${n}</button>` : ''}
      <div class="mg-grid">${fac}${sch}${res}${qa}${hon}${pr}</div></div>`; }
  /* صفحة المؤشر عندما لا يمكن فتح البرنامج: السبب، وأرقام السجل */
  async function pgMPage() { const k = VIEW.k, [key, , name] = MG_TOOL[k] || []; if (!key) return ''; if (['res', 'gs', 'gg'].includes(k)) { const s0 = mgTool(key, name); return mgEmpty(s0.why + (s0.btn ? ' —' : '.'), s0.btn, s0.act); } const s = mgTool(key, name), o0 = OPS.find((x) => x.k === k), o = k === 'sch' ? Object.assign({}, o0, { els: ['sch', 'load', 'room'].flatMap((q) => OPS.find((x) => x.k === q).els) }) : o0, t = curTerm(), [vals, els] = await Promise.all([D.select('data_values').catch(() => []), D.select('data_elements').catch(() => [])]), wide = mgWide(), depts = wide ? [] : opsDepts(leadScope());
    const rows = o.els.map((code) => ({ e: els.find((x) => x.code === code), r: opsRow(vals, code, t) })), names = [...new Set(rows.flatMap((x) => Object.keys(((x.r || {}).details || {}).by || {})))].filter((d) => wide || opsIn(d, depts)).sort((a, b) => a.localeCompare(b, 'ar'));
    return `${s.ok ? '' : mgEmpty(s.why + (s.btn ? ' —' : '.'), s.btn, s.act)}<div class="stat-row" style="margin:12px 0">${rows.map((x) => statCard(opsFmt(opsNum(x.r, x.e, wide, depts), x.e), x.e ? x.e.name_ar : '', '', o.tone)).join('')}</div>
      ${names.length ? `<div class="panel tw"><table><tr><th>القسم</th>${rows.map((x) => `<th>${esc(x.e ? x.e.name_ar : '')}</th>`).join('')}</tr>${names.map((d) => `<tr><td><b>${esc(d)}</b></td>${rows.map((x) => { const v = (((x.r || {}).details || {}).by || {})[d]; return `<td>${esc(opsFmt(v == null ? null : v, x.e))}</td>`; }).join('')}</tr>`).join('')}</table></div>` : ''}`; }

  /* برامج الكلية: الخطة الدراسية والتوصيفات (الملف 40). التوصيف من مكتبة التوصيفات، لا نسخة منه */
  const PGV = { prog: '', tab: 'plan', sel: '' }, ORD_LV = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  const specParts = (c, clos) => { const i = (c || {}).info || {}, p = [!!i.description, clos > 0, (i.topics || []).length > 0, (i.assessments || []).length > 0, !!(i.refs && Object.values(i.refs).some(Boolean))]; return p.filter(Boolean).length / p.length * 100; };
  const provider = (code) => { const pf = String(code).replace(/\d.*$/, ''), g = (S.programs || []).find((x) => (x.prefixes || []).includes(pf)); return g ? uName(g.department_id) : 'جهة خارج الكلية'; };
  async function pgProgs() { const programs = await D.select('programs', { order: ['sort'] }); S.programs = programs; const wide = mgWide(), depts = wide ? [] : opsDepts(leadScope()), progs = programs.filter((g) => g.active !== false && (wide || depts.some((d) => opsIn(uName(g.department_id), [d]))));
    if (!progs.some((g) => g.id === PGV.prog)) { PGV.prog = (progs[0] || {}).id || ''; PGV.sel = ''; }
    const [heads, courses, groups, specProg] = await Promise.all([D.select('study_plans'), D.select('study_plan_courses', { eq: { program_id: PGV.prog }, order: ['sort'] }), D.select('study_plan_groups', { eq: { program_id: PGV.prog }, order: ['sort'] }), D.select('spec_programs', { eq: { program_id: PGV.prog } }).catch(() => [])]);
    const codes = [...new Set(courses.map((c) => c.course_code))], [specs, clos, plos] = codes.length ? await Promise.all([D.select('course_specs', { in: { course_code: codes } }).catch(() => []), D.select('course_clos', { in: { course_code: codes } }).catch(() => []), D.select('spec_plos', { eq: { program_id: PGV.prog } }).catch(() => [])]) : [[], [], []];
    S._pg = { courses, groups, specs, clos }; const g = progs.find((x) => x.id === PGV.prog), h = heads.find((x) => x.program_id === PGV.prog);
    const [allC, allS] = await Promise.all([D.select('study_plan_courses', { cols: 'program_id,course_code' }).catch(() => []), D.select('course_specs', { cols: 'course_code' }).catch(() => [])]), have0 = new Set(allS.map((s) => s.course_code));
    const chips = progs.map((x) => { const hd = heads.find((y) => y.program_id === x.id), cs = [...new Set(allC.filter((c) => c.program_id === x.id).map((c) => c.course_code))], pct = cs.length ? Math.round(cs.filter((c) => have0.has(c)).length / cs.length * 100) : null, box = (n, l, cl) => `<span class="pgc-b ${cl || ''}"><b>${esc(n)}</b><i>${esc(l)}</i></span>`;
      return `<button class="pg-card ${x.id === PGV.prog ? 'on' : ''}" style="--c:${attr(unitColor(x.department_id))}" aria-pressed="${x.id === PGV.prog}" onclick="C.pgProg('${x.id}')"><span class="pgc-t">${esc(x.name)}</span><span class="pgc-d">${esc(uName(x.department_id))}</span><span class="pgc-bs">${box(hd ? hd.total_hours : '—', 'ساعة')}${box(cs.length || '—', 'مقررًا')}${box(pct == null ? '—' : pct + '%', 'اكتمال التوصيفات')}${box(hd ? 'معتمدة' : 'لم تُستورد', 'حالة الخطة', hd ? 'ok' : 'no')}</span></button>`; }).join('');
    const top = g ? `<div class="pg-head"><h2>${esc(g.name)}</h2><div>${h ? `<span class="pg-pill">${h.total_hours} ساعة</span><span class="pg-pill">الخطة ${esc(h.start_term)} · الإصدار ${esc(h.plan_version)}</span>` : ''}<span class="pg-pill">${esc(uName(g.department_id))}</span></div></div>` : '';
    const tabs = `<div class="pt-tabs" role="tablist"><button role="tab" aria-selected="${PGV.tab === 'plan'}" class="${PGV.tab === 'plan' ? 'on' : ''}" onclick="C.pgTab('plan')">${icon('file')}الخطة الدراسية</button><button role="tab" aria-selected="${PGV.tab === 'spec'}" class="${PGV.tab === 'spec' ? 'on' : ''}" onclick="C.pgTab('spec')">${icon('clipboard')}التوصيفات</button><span class="grow"></span>${isAdmin() ? `<button class="btn sm" onclick="C.planImport()">استيراد خطة (JSON)</button>` : ''}</div>`;
    let body = '';
    if (PGV.tab === 'plan') body = courses.length ? `<div id="pgPlan">${pgPlanHtml()}</div>` : `<div class="empty">لم تُستورد خطة هذا البرنامج بعد.</div>`;
    else { const row = (c) => { const s = specs.find((x) => x.course_code === c.course_code), nc = clos.filter((o) => o.course_code === c.course_code).length, pct = s ? Math.round(specParts(s, nc)) : 0; return `<tr><td dir="ltr" style="text-align:start"><b>${esc(dispCode(c.course_code))}</b></td><td>${esc(c.name)}</td><td class="small">${esc(provider(c.course_code))}</td><td>${s ? (s.status === 'approved' ? chip('معتمد', 'ok') : chip('مسودة', 'wait')) : chip('غير متوفر', 'bad')}</td><td><span class="pg-bar"><i style="width:${pct}%"></i></span> ${pct}%</td></tr>`; };
      const uniq = courses.filter((c, i) => courses.findIndex((x) => x.course_code === c.course_code) === i), have = uniq.filter((c) => specs.some((s) => s.course_code === c.course_code)).length, ok = uniq.filter((c) => specs.some((s) => s.course_code === c.course_code && s.status === 'approved')).length, sp = specProg[0];
      body = `<div class="stat-row" style="margin-bottom:12px">${statCard(uniq.length, 'مقررات الخطة', '', 'violet')}${statCard(have, 'لها توصيف', uniq.length ? Math.round(have / uniq.length * 100) + '%' : '', 'blue', null, uniq.length ? have / uniq.length * 100 : 0)}${statCard(ok, 'توصيف معتمد', '', 'green', null, uniq.length ? ok / uniq.length * 100 : 0)}${statCard(sp ? (sp.status === 'approved' ? 'معتمد' : 'مسودة') : 'غير متوفر', 'توصيف البرنامج TP-151', sp ? (plos.length + ' مخرجًا' + (sp.year ? ' · ' + sp.year : '')) : 'يُستورد من مكتبة التوصيفات', sp && sp.status === 'approved' ? 'green' : 'orange')}</div>
        <div class="panel tw"><table><tr><th>الرمز</th><th>المقرر</th><th>الجهة المقدِّمة</th><th>الحالة</th><th>الاكتمال</th></tr>${uniq.map(row).join('') || '<tr><td colspan="5" class="muted">لا مقررات.</td></tr>'}</table></div>`; }
    return `<div class="pg-cards">${chips || '<div class="empty">لا برامج في نطاقك.</div>'}</div>${top}${tabs}${body}`; }
  function pgPlanHtml() { const { courses, groups, specs } = S._pg, sel = courses.find((c) => c.course_code === PGV.sel), dep = (code) => courses.filter((c) => c.prereq.includes(code) || c.coreq.includes(code)).map((c) => c.course_code);
    const cls = (c) => !sel ? '' : c.course_code === sel.course_code ? 'sel' : (sel.prereq.includes(c.course_code) || sel.coreq.includes(c.course_code)) ? 'pre' : dep(sel.course_code).includes(c.course_code) ? 'dep' : '';
    const card = (c) => { const s = specs.find((x) => x.course_code === c.course_code); return `<button class="pl-c ${cls(c)}" onclick="C.pgSel('${attr(c.course_code)}')"><i class="pl-dot ${s ? (s.status === 'approved' ? '' : 'mid') : 'no'}" title="${s ? (s.status === 'approved' ? 'توصيف معتمد' : 'توصيف مسودة') : 'لا توصيف'}"></i><b dir="ltr">${esc(dispCode(c.course_code))}</b><span class="n">${esc(c.name)}</span><span class="h">${c.hours} س</span></button>`; };
    const req = courses.filter((c) => !c.group_name), lv = [...new Set(req.map((c) => c.level))].sort((a, b) => a - b);
    return `<div class="pl-wrap"><div><h3 class="pl-h">المقررات الإجبارية</h3><div class="pl-levels">${lv.map((l) => { const list = req.filter((c) => c.level === l); return `<div class="pl-lv"><h4>المستوى ${ORD_LV[l] || l}<span>${list.reduce((a, c) => a + c.hours, 0)} ساعة</span></h4>${list.map(card).join('')}</div>`; }).join('')}</div>
      ${groups.length ? `<h3 class="pl-h">المجموعات الاختيارية</h3><div class="pl-levels">${groups.map((g) => `<div class="pl-lv el"><h4>${esc(g.group_name)}${g.level ? ' · المستوى ' + (ORD_LV[g.level] || g.level) : ''}<span>يُختار ${g.required_hours} ساعات</span></h4>${courses.filter((c) => c.group_name === g.group_name).map(card).join('')}</div>`).join('')}</div>` : ''}
      <p class="small muted pl-leg"><i class="pl-dot"></i>توصيف معتمد <i class="pl-dot mid"></i>مسودة <i class="pl-dot no"></i>لا توصيف في المكتبة. عند اختيار مقرر: <span class="pl-k pre">متطلبه السابق</span> <span class="pl-k dep">يعتمد عليه</span></p></div>
      <aside class="pl-panel">${sel ? pgCourseHtml(sel) : '<h4>اختر مقررًا</h4><p class="small muted">يظهر هنا توصيفه من مكتبة التوصيفات ومتطلباته.</p>'}</aside></div>`; }
  function pgCourseHtml(c) { const { courses, specs, clos } = S._pg, s = specs.find((x) => x.course_code === c.course_code), i = (s || {}).info || {}, nm = (k) => { const x = courses.find((y) => y.course_code === k); return dispCode(k) + (x ? ' ' + x.name : ''); }, tags = (l, t) => l.length ? l.map((k) => `<span class="pl-k ${t}">${esc(nm(k))}</span>`).join(' ') : '—';
    const dep = [...new Set(courses.filter((x) => x.prereq.includes(c.course_code) || x.coreq.includes(c.course_code)).map((x) => x.course_code))], cl = clos.filter((o) => o.course_code === c.course_code).sort((a, b) => a.sort - b.sort), DOM = { k: 'المعرفة والفهم', s: 'المهارات', v: 'القيم' }, sub = (t, b) => b ? `<div class="pl-t">${esc(t)}</div><div class="small">${b}</div>` : '';
    return `<span class="pl-k" dir="ltr">${esc(dispCode(c.course_code))}</span><h4>${esc(c.name)}</h4><div class="pl-t">النوع والمستوى</div><div class="small">${c.group_name ? esc(c.group_name) : 'إجباري'}${c.level ? ' · المستوى ' + (ORD_LV[c.level] || c.level) : ''} · ${c.hours} ساعات · ${esc(provider(c.course_code))}</div>
      <div class="pl-t">المتطلب السابق</div><div>${tags(c.prereq, 'pre')}${c.credit_req ? ` <span class="pl-k mid">اجتياز ${c.credit_req} ساعة</span>` : ''}</div>${c.coreq.length ? `<div class="pl-t">متطلب متزامن</div><div>${tags(c.coreq, 'pre')}</div>` : ''}<div class="pl-t">يعتمد عليه</div><div>${tags(dep, 'dep')}</div>
      ${s ? `<div class="pl-t">حالة التوصيف</div><div>${s.status === 'approved' ? chip('معتمد', 'ok') : chip('مسودة', 'wait')}</div>${sub('الوصف', i.description ? esc(i.description) : '')}${sub('مخرجات التعلم', cl.length ? Object.keys(DOM).map((d) => { const l = cl.filter((o) => o.domain === d); return l.length ? `<b>${DOM[d]}</b><ul>${l.map((o) => `<li>${esc(o.code)} ${esc(o.text)}</li>`).join('')}</ul>` : ''; }).join('') : '')}${sub('المحتوى', (i.topics || []).length ? `<ul>${i.topics.map((x) => `<li>${esc(x.title)}${x.hours ? ' (' + esc(x.hours) + ' س)' : ''}</li>`).join('')}</ul>` : '')}${sub('التقويم', (i.assessments || []).length ? `<ul>${i.assessments.map((a) => `<li>${esc(a.activity)}${a.timing ? ' · ' + esc(a.timing) : ''}${a.weight != null ? ' · ' + esc(a.weight) + '%' : ''}</li>`).join('')}</ul>` : '')}${sub('المراجع', i.refs ? [['main', 'الرئيسية'], ['support', 'المساندة'], ['electronic', 'الإلكترونية'], ['other', 'أخرى']].filter(([k]) => i.refs[k]).map(([k, t]) => `<div><b>${t}:</b> ${esc(i.refs[k])}</div>`).join('') : '')}` : `<div class="mg-empty" style="margin-top:10px"><p>لا يوجد توصيف لهذا المقرر في المكتبة. يُطلب من ${esc(provider(c.course_code))}.</p></div>`}`; }
  C.pgProg = (id) => { PGV.prog = id; PGV.sel = ''; refresh(); };
  C.pgTab = (k) => { PGV.tab = k; refresh(); };
  C.pgSel = (code) => { PGV.sel = code; const e = $('#pgPlan'); if (e) { e.innerHTML = pgPlanHtml(); if (window.innerWidth < 900) { const p = e.querySelector('.pl-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } };
  C.planImport = () => { if (!isAdmin()) return; modal('استيراد خطة دراسية', `<p class="small muted">ملف plan-*.json. تُستبدل خطة البرنامج المحدد كلها بعد المعاينة.</p><div class="formgrid"><label class="f">البرنامج<select id="plnP">${progOpts(PGV.prog)}</select></label><label class="f">الملف<input type="file" id="plnF" accept=".json" onchange="C.planParse(this)"></label></div><div id="plnOut"></div><div class="err"></div>`, '<button class="btn pri" id="plnOk" disabled>اعتماد</button><button class="btn" onclick="C.close()">إلغاء</button>'); };
  C.planParse = (inp) => busy(null, async () => { const j = JSON.parse(await inp.files[0].text()); if (!Array.isArray(j.levels)) throw new Error('الملف ليس خطة دراسية.'); const req = j.levels.reduce((a, l) => a + l.courses.reduce((x, c) => x + (c.hours || 0), 0), 0), el = (j.electives || []).reduce((a, g) => a + (g.required_hours || 0), 0), tot = (j.meta || {}).total_hours;
    $('#plnOut').innerHTML = `<p>${esc((j.meta || {}).program || '')}: ${req} ساعة إجباري + ${el} اختياري = ${req + el}${tot && tot !== req + el ? ` ${chip('لا تطابق الإجمالي ' + tot, 'bad')}` : ` ${chip('مطابق', 'ok')}`} · ${j.levels.length} مستويات · ${(j.electives || []).length} مجموعات</p>`; const b = $('#plnOk'); b.disabled = false; b.onclick = (ev) => busy(ev.target, async () => { await D.rpc('study_plan_import', { p_program: val('plnP'), p_doc: j }); PGV.prog = val('plnP'); C.close(); refresh(); toast('استُوردت الخطة.'); }); });

  /* مصادر البيانات: لكل قسم مصدره ومسؤوله وآخر تحديث واكتماله */
  async function pgSources() { const t = curTerm(), year = String((t || {}).year || ''), [vals, els, fx, honor, plans, programs, links, results] = await Promise.all([D.select('data_values').catch(() => []), D.select('data_elements').catch(() => []), D.select('faculty_extra').catch(() => null), D.select('honor_list').catch(() => []), D.select('study_plans').catch(() => []), D.select('programs').catch(() => []), D.select('program_kpis').catch(() => []), D.select('kpi_results').catch(() => [])]);
    const act = S.faculty.filter((f) => f.status === 'نشط'), facPct = act.length && fx ? Math.round(act.filter((f) => { const x = fx.find((y) => y.faculty_id === f.id) || {}; return f.gender && f.campus && f.service_start && x.nationality; }).length / act.length * 100) : null;
    const grp = (k) => { const o = OPS.find((x) => x.k === k), r = o.els.map((c) => opsRow(vals, c, t)); return { pct: Math.round(r.filter((x) => x && x.value_num != null).length / o.els.length * 100), when: r.map((x) => x && x.updated_at).filter(Boolean).sort().pop() }; };
    const toolBtn = (k, label) => { const [key, , name] = MG_TOOL[k], s = mgTool(key, name); return s.ok ? `<button class="btn sm pri" onclick="C.mOpen('${k}')">${esc(label)}</button>` : s.btn ? `<button class="btn sm" onclick="${attr(s.act)}">${esc(s.btn)}</button>` : `<span class="small muted">${esc(s.why)}</span>`; }, unitOf = (key, dflt) => { const a = S.apps.find((x) => x.id === (S.settings || {})[key]); return a ? uName(a.unit_id) : dflt; };
    const authors = opsRow(vals, 'OPS-RES-AUTHORS', t), total = opsRow(vals, 'OPS-FAC-TOTAL', t), resPct = authors && total && total.value_num ? Math.round(authors.value_num / total.value_num * 100) : null, active = programs.filter((g) => g.active !== false), plPct = active.length ? Math.round(plans.length / active.length * 100) : 0, qaN = links.length, qaA = results.filter((x) => x.year === year && x.status === 'approved').length;
    const last = (l) => l.filter(Boolean).sort().pop(), row = (name, src, who, when, pct, btn) => `<tr><td><b>${esc(name)}</b></td><td class="small">${esc(src)}</td><td class="small">${esc(who)}</td><td class="small">${when ? esc(fmtD(when)) : chip('لم يُحدَّث', 'wait')}</td><td>${pct == null ? '—' : `<span class="pg-bar"><i style="width:${pct}%"></i></span> ${pct}%`}</td><td>${btn}</td></tr>`;
    const f = grp('fac'), sc = grp('sch'), lo = grp('load'), ro = grp('room'), [roAll, enAll, grAll, pgAll, guAll] = await Promise.all(['research_output', 'pg_enrollment', 'pg_graduates', 'pg_programs', 'grad_updates'].map((x) => D.select(x).catch(() => []))), gsWhen = last(guAll.map((x) => x.at)), roPct = roAll.length ? Math.round(roAll.filter((x) => x.faculty_id).length / roAll.length * 100) : null, gsPct = Math.round([enAll, grAll, pgAll].filter((x) => x.length).length / 3 * 100);
    return `<p class="small muted">الأقسام تقرأ من هذه المصادر فقط. اكتمال الأعضاء = من لهم الجنس والجنسية والمقر وتاريخ بداية الخدمة. واكتمال البحث = من طابقت أسماؤهم قاعدة الأعضاء.</p><div class="panel tw"><table><tr><th>القسم</th><th>المصدر</th><th>المسؤول</th><th>آخر تحديث</th><th>الاكتمال</th><th></th></tr>
      ${row('سجل الأعضاء', 'الإعدادات ← أعضاء هيئة التدريس', 'إدارة الأعضاء', last(act.map((x) => x.updated_at)), facPct, `<button class="btn sm pri" onclick="C.fxImport()">استيراد من البرنامج القديم</button>`)}
      ${row('مؤشرات أعضاء هيئة التدريس', 'لوحة الأعضاء', unitOf('facultyDashApp', 'إدارة الأعضاء'), f.when, f.pct, toolBtn('fac', 'فتح اللوحة ونشرها'))}
      ${row('مؤشرات الجداول', 'أداة الجداول', unitOf('schedulesApp', 'لجنة الجداول'), sc.when, sc.pct, toolBtn('sch', 'استيراد أو تحديث'))}
      ${row('مؤشرات الأنصبة', 'أداة الجداول', unitOf('schedulesApp', 'لجنة الجداول'), lo.when, lo.pct, toolBtn('load', 'فتح الأنصبة'))}
      ${row('مؤشرات القاعات', 'أداة الجداول (سعات القاعات تُدخل فيها)', unitOf('schedulesApp', 'لجنة الجداول'), ro.when, ro.pct, toolBtn('room', 'فتح القاعات'))}
      ${row('مؤشرات البحث العلمي', 'جدول البحث العلمي (نموذج Excel)', unitOf('gradApp', 'وحدة الدراسات العليا والبحث العلمي'), gsWhen, roPct, toolBtn('res', 'فتح البرنامج'))}
      ${row('الدراسات العليا والخريجون', 'البرنامج ← تحديث البيانات (نموذج Excel)', unitOf('gradApp', 'وحدة الدراسات العليا والبحث العلمي'), gsWhen, gsPct, toolBtn('gs', 'فتح البرنامج'))}
      ${row('مؤشرات الجودة', 'قياس المخرجات والاستطلاعات وسجل البيانات', 'وحدة الجودة', last(results.map((x) => x.updated_at)), qaN ? Math.round(qaA / qaN * 100) : null, `<button class="btn sm" onclick="C.go('annual')">فتح السجل</button>`)}
      ${row('قائمة العميد الشرفية', 'ملف Excel كل فصل', 'الشؤون الأكاديمية', last(honor.map((h) => h.created_at)), null, `<button class="btn sm" onclick="C.go('honor')">الاستيراد</button>`)}
      ${row('الخطط الدراسية', 'ملف الخطة (JSON)', 'منسقو البرامج', last(plans.map((p) => p.updated_at)), plPct, `<button class="btn sm" onclick="C.go('collegeprogs')">فتح البرامج</button>`)}</table></div>`; }

  /* استيراد بيانات الأعضاء من البرنامج القديم (مرة واحدة): يطابق بالرقم الوظيفي أو البريد، ويعرض التغييرات قبل الحفظ. لا هوية ولا تاريخ ميلاد */
  const FX_FIELDS = [['gender', 'f', 'الجنس', ['الجنس']], ['nationality', 'x', 'الجنسية', ['الجنسية']], ['work_status', 'x', 'الحالة', ['الحالة', 'حالة العضو']], ['campus', 'f', 'المقر', ['المقر']], ['service_start', 'f', 'تاريخ بداية الخدمة', ['بداية الخدمة', 'تاريخ بداية الخدمة']], ['specialty', 'f', 'التخصص', ['التخصص']], ['specialty_fine', 'x', 'التخصص الدقيق', ['التخصص الدقيق']], ['contract_type', 'f', 'نوع التعاقد', ['نوع التعاقد']], ['scopus', 'x', 'Scopus', ['Scopus ID', 'Scopus']], ['orcid', 'x', 'ORCID', ['ORCID']], ['wos', 'x', 'WoS', ['WoS ResearcherID', 'WoS']], ['scholar', 'x', 'Google Scholar', ['Google Scholar']]];
  const FX_BLOCK = /هوية|سجل مدني|إقامة|ميلاد|العمر|السن/;
  C.fxImport = () => { if (!isAdmin()) return toast('الاستيراد لمدير النظام.', true); modal('استيراد بيانات الأعضاء من البرنامج القديم', `<p class="small muted">اختر ملفات CSV أو Excel المصدَّرة (يمكن عدة ملفات معًا). يُطابق العضو بالرقم الوظيفي أو البريد فقط، ولا يُحفظ شيء قبل المعاينة. أعمدة الهوية وتاريخ الميلاد تُتجاهل.</p><label class="f">الملفات<input type="file" multiple accept=".csv,.xlsx,.xls" onchange="C.fxParse(this)"></label><div id="fxOut"></div><div class="err"></div>`, '<button class="btn pri" id="fxOk" disabled>حفظ التغييرات</button><button class="btn" onclick="C.close()">إلغاء</button>', true); };
  C.fxParse = (inp) => busy(null, async () => { if (!window.XLSX) throw new Error('مكتبة Excel لم تُحمَّل.'); const merged = new Map(), blocked = new Set(), used = new Set(); const nk = (s) => normAr(s).replace(/\s+/g, ' ').trim();
    for (const file of inp.files) { const wb = /\.csv$/i.test(file.name) ? XLSX.read((await file.text()).replace(/^﻿/, ''), { type: 'string' }) : XLSX.read(await file.arrayBuffer()), aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false }), hi = aoa.findIndex((r) => r.some((c) => String(c).trim() === 'الاسم')); if (hi < 0) throw new Error('لا يوجد عمود «الاسم» في ' + file.name);
      const H = aoa[hi].map((c) => String(c).trim()); H.forEach((h) => { if (FX_BLOCK.test(h)) blocked.add(h); }); aoa.slice(hi + 1).forEach((r) => { const name = String(r[H.indexOf('الاسم')] || '').trim(); if (!name) return; const o = merged.get(nk(name)) || { name }; H.forEach((h, i) => { if (FX_BLOCK.test(h)) return; const v = String(r[i] == null ? '' : r[i]).trim(); if (v) o[h] = v; }); merged.set(nk(name), o); }); }
    const fxAll = await D.select('faculty_extra'), digits = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, ''), changes = [], miss = [];
    merged.forEach((o) => { const emp = digits(o['الرقم الوظيفي']), em = String(o['البريد الإلكتروني'] || o['البريد الجامعي'] || o['البريد'] || '').toLowerCase(), f = S.faculty.find((x) => (emp && digits(x.employee_no) === emp) || (em && String(x.email || '').toLowerCase() === em)); if (!f) { miss.push([o.name, emp || em ? 'لا سجل بهذا الرقم أو البريد' : 'بلا رقم وظيفي ولا بريد في الملفات']); return; }
      const x = fxAll.find((y) => y.faculty_id === f.id) || {}, diff = []; FX_FIELDS.forEach(([k, src, lbl, heads]) => { const h = heads.find((n) => o[n]); if (!h) return; let v = o[h]; if (v === 'غير محدد' || v === '—') return; if (k === 'service_start') { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return; } if (k === 'work_status' && v === 'على رأس العمل') { used.add(k); } used.add(k); const cur = String((src === 'f' ? f[k] : x[k]) || ''); if (cur !== v) diff.push([k, src, lbl, cur, v]); }); if (diff.length) changes.push({ f, x, diff }); });
    const n = changes.reduce((a, c) => a + c.diff.length, 0);
    $('#fxOut').innerHTML = `<div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0">${chip('أعضاء سيتغيرون: ' + changes.length, 'ok')} ${chip('حقول: ' + n)} ${chip('لم يُطابَق: ' + miss.length, miss.length ? 'bad' : 'ok')} ${blocked.size ? chip('أعمدة متجاهلة: ' + [...blocked].join('، '), 'wait') : ''}</div>
      <div class="tw" style="max-height:40vh"><table><tr><th>العضو</th><th>الحقل</th><th>الحالي</th><th>الجديد</th></tr>${changes.flatMap((c) => c.diff.map((d) => `<tr><td>${esc(c.f.name_ar)}</td><td>${esc(d[2])}</td><td class="small muted">${esc(d[3] || '—')}</td><td><b>${esc(d[4])}</b></td></tr>`)).join('') || '<tr><td colspan="4" class="muted">لا تغييرات.</td></tr>'}</table></div>
      ${miss.length ? `<details style="margin-top:8px"><summary>لم يُطابَق (${miss.length})</summary><ul class="small">${miss.map((m) => `<li>${esc(m[0])}: ${esc(m[1])}</li>`).join('')}</ul></details>` : ''}`;
    const b = $('#fxOk'); b.disabled = !n; b.onclick = (ev) => busy(ev.target, async () => { let ok = 0; for (const c of changes) { const pf = {}, px = {}; c.diff.forEach(([k, src, , , v]) => { (src === 'f' ? pf : px)[k] = v; }); if (Object.keys(pf).length) await D.update('faculty', pf, { eq: { id: c.f.id } }); if (Object.keys(px).length) await D.upsert('faculty_extra', Object.assign({ faculty_id: c.f.id, nationality: c.x.nationality || '', work_status: c.x.work_status || '', specialty_fine: c.x.specialty_fine || '', scopus: c.x.scopus || '', orcid: c.x.orcid || '', wos: c.x.wos || '', scholar: c.x.scholar || '' }, px)); ok++; } S.faculty = await D.select('faculty'); C.close(); refresh(); toast('حُدّث ' + ok + ' عضوًا.'); }); });

  const POS_NAME = (u) => !u.parent_id ? 'عميد الكلية' : u.kind === 'leadership' ? 'وكيل الكلية' : u.kind === 'department' ? 'رئيس القسم' : u.kind === 'committee' ? 'رئيس اللجنة' : u.kind === 'unit' ? 'رئيس الوحدة' : 'مسؤول الجهة';
  async function pgPositions() {
    if (!isAdmin()) return '<div class="empty">هذه الصفحة لمدير النظام.</div>';
    S.members = await D.select('org_members');
    const rank = (u) => !u.parent_id ? 0 : ({ leadership: 1, department: 2, unit: 3, committee: 4 })[u.kind] || 5;
    const list = S.units.filter((u) => u.status === 'active').sort((a, b) => rank(a) - rank(b) || (a.sort || 0) - (b.sort || 0));
    const rows = list.map((u) => { const h = headOf(u.id), f = h && fac(h.faculty_id);
      return `<tr><td><b>${esc(POS_NAME(u))}</b></td><td>${esc(u.name)}</td><td class="small">${esc(u.parent_id ? uName(u.parent_id) : '—')}</td><td>${f ? esc(f.name_ar) : chip('شاغر', 'wait')}${f && !f.profile_app_id ? ' ' + chip('سجله بلا حساب', 'bad') : ''}</td><td class="small">${h ? esc(h.start_date) : ''}</td><td><button class="btn sm" onclick="C.posEdit('${u.id}')">${f ? 'نقل' : 'تعيين'}</button></td></tr>`; }).join('');
    const empty = list.filter((u) => !headOf(u.id)).length, noAcc = list.filter((u) => { const h = headOf(u.id), f = h && fac(h.faculty_id); return f && !f.profile_app_id; }).length;
    return `<p class="small muted">الصلاحية تتبع المنصب وتنزل مع الهيكل: صاحب المنصب يعمل في جهته، ويطّلع على ما تحتها. نقل المنصب لا يغيّر الحسابات ولا الأعمال، ويبقى السابق في السجل.</p>
      <div class="row" style="margin-bottom:10px;gap:8px;align-items:center;flex-wrap:wrap">${chip('شاغرة: ' + empty, empty ? 'wait' : 'ok')} ${chip('شاغلها بلا حساب: ' + noAcc, noAcc ? 'bad' : 'ok')}<span class="grow"></span><label class="small">برنامج الدراسات العليا <select class="inp" onchange="C.gradApp(this.value)"><option value="">—</option>${S.apps.filter((a) => a.kind === 'html').map((a) => opt(a.id, a.name, S.settings.gradApp || '')).join('')}</select></label><label class="small">برنامج أداة الجداول <select class="inp" onchange="C.schApp(this.value)"><option value="">—</option>${S.apps.filter((a) => a.kind === 'html').map((a) => opt(a.id, a.name, S.settings.schedulesApp || '')).join('')}</select></label><label class="small">برنامج لوحة الأعضاء <select class="inp" onchange="C.dashApp(this.value)"><option value="">—</option>${S.apps.filter((a) => a.kind === 'html').map((a) => opt(a.id, a.name, S.settings.facultyDashApp || '')).join('')}</select></label><button class="btn sm" onclick="C.go('audit')">سجل التدقيق</button></div>
      <div class="panel tw"><table><tr><th>المنصب</th><th>الجهة</th><th>تتبع</th><th>الشاغل</th><th>منذ</th><th></th></tr>${rows}</table></div>`;
  }
  C.dashApp = (id) => busy(null, async () => { if (!isAdmin()) return; const d = Object.assign({}, S.settings, { facultyDashApp: id || null }); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; const x = await D.rpc('org_my_access'); S.appLv = x.apps || {}; toast('حُفظ.'); });
  C.posEdit = (id) => { const u = unit(id), h = headOf(id), hist = S.members.filter((m) => m.unit_id === id && m.position === 'head' && m !== h).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    const people = S.faculty.filter((f) => f.status === 'نشط' || (h && f.id === h.faculty_id)).sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
    modal(POS_NAME(u) + ': ' + u.name, `<div class="formgrid"><label class="f full">الشاغل<select id="psF">${opt('', '— شاغر —', h ? h.faculty_id : '')}${people.map((f) => opt(f.id, f.name_ar + (f.profile_app_id ? '' : ' (بلا حساب)'), h ? h.faculty_id : '')).join('')}</select></label><label class="f">من تاريخ<input type="date" id="psD" value="${today()}"></label></div>
      ${hist.length ? `<h4 style="margin:12px 0 6px">الشاغلون السابقون</h4><ul class="small">${hist.map((m) => `<li>${esc(fName(m.faculty_id))}: ${esc(m.start_date)} إلى ${esc(m.end_date || '—')}</li>`).join('')}</ul>` : ''}<div class="err"></div>`,
      `<button class="btn pri" id="psOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#psOk').onclick = (ev) => busy(ev.target, async () => { const nf = val('psF') || null; if (nf === (h ? h.faculty_id : null)) return C.close();
      await D.rpc('org_set_head', { p_unit: id, p_faculty: nf, p_start: val('psD') || today(), p_end: null });
      S.members = await D.select('org_members'); const a = await D.rpc('org_my_access'); S.acc = a.units || {}; S.glob = a.global || {}; C.close(); renderShell(); refresh(); toast('حُفظ المنصب وسُجّل في التدقيق.'); }); };

  /* الإعدادات لمدير النظام ومن يحدده في org_settings.data.settingsAccess (معرّفات سجلات الأعضاء، فتنتقل مع النقل). إخفاء ومنع في الواجهة؛ وحماية البيانات تبقى في سياسات القاعدة */
  const SET_PAGES = ['settings', 'org', 'faculty', 'courses', 'accounts', 'audit', 'ann', 'backup', 'identity', 'general', 'assist', 'forms', 'track', 'perms', 'matrix', 'positions', 'sources'];
  const canSettings = () => isAdmin() || (!!myFac() && ((S.settings || {}).settingsAccess || []).includes(myFac()));
  C.setAccess = () => { if (!isAdmin()) return; const cur = S.settings.settingsAccess || [], list = S.faculty.filter((f) => f.status === 'نشط' || cur.includes(f.id)).sort((x, y) => x.name_ar.localeCompare(y.name_ar, 'ar'));
    modal('من يرى الإعدادات', `<p class="small muted">مدير النظام يراها دائمًا. من تحدده هنا يدخل صفحات الإعدادات، وما يستطيع تغييره فيها يبقى بحسب صلاحياته.</p><input class="inp" placeholder="بحث بالاسم" oninput="document.querySelectorAll('#saList label').forEach((l)=>{l.style.display=l.textContent.includes(this.value.trim())?'':'none'})" style="width:100%;margin-bottom:8px">
      <div id="saList" class="checks" style="flex-direction:column;align-items:flex-start;max-height:50vh;overflow:auto">${list.map((f) => `<label><input type="checkbox" class="saC" value="${f.id}" ${cur.includes(f.id) ? 'checked' : ''}> ${esc(f.name_ar)}</label>`).join('')}</div><div class="err"></div>`,
      `<button class="btn pri" id="saOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#saOk').onclick = (ev) => busy(ev.target, async () => { const d = Object.assign({}, S.settings, { settingsAccess: $$('.saC').filter((c) => c.checked).map((c) => c.value) }); await D.update('org_settings', { data: d }, { eq: { id: 1 } }); S.settings = d; C.close(); toast('حُفظ.'); }); };
  /* البحث السريع (Ctrl K): المقررات، والأعضاء، والجهات، والصفحات المتاحة للمستخدم */
  const QS = { i: 0, res: [] };
  const qsPages = () => { const staff = viewRole() === 'staff'; const base = staff ? ['home', 'mine', 'memberships', 'alerts', 'apps'] : ['home', 'college', 'vices', 'depts', 'units', 'committees', 'tasks', 'mine', 'memberships', 'alerts', 'apps', 'annual', 'reports'].concat(isLeader() ? ['approvals'] : []);
    return base.concat(canSettings() ? SET_PAGES : []).filter((p) => TITLES[p]).filter((p) => p !== 'annual' || annualSeen()).filter((p) => p !== 'reports' || gcap('reports')); };
  C.qs = async () => { if ($('#qsOv')) return; const o = document.createElement('div'); o.id = 'qsOv'; o.onclick = (e) => { if (e.target === o) o.remove(); };
    o.innerHTML = `<div class="qs-box" role="dialog" aria-label="بحث سريع"><input id="qsI" placeholder="ابحث عن مقرر أو عضو أو جهة أو صفحة…" autocomplete="off"><div id="qsR"></div><div class="tiny muted" style="padding:6px 12px">↑↓ للتنقل · Enter للفتح · Esc للإغلاق</div></div>`; document.body.appendChild(o);
    const i = $('#qsI'); i.focus(); i.oninput = qsRun; i.onkeydown = (e) => { if (e.key === 'Escape') o.remove(); else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); QS.i = Math.max(0, Math.min(QS.res.length - 1, QS.i + (e.key === 'ArrowDown' ? 1 : -1))); qsDraw(); } else if (e.key === 'Enter' && QS.res[QS.i]) { e.preventDefault(); C.qsGo(QS.i); } };
    if (!S._qsC) S._qsC = await D.select('courses', { cols: 'id,code,name_ar' }).catch(() => []); qsRun(); };
  function qsRun() { const q = (($('#qsI') || {}).value || '').trim().toLowerCase(), has = (...x) => !q || x.some((v) => String(v || '').toLowerCase().includes(q)), out = [];
    qsPages().filter((p) => has(TITLES[p])).slice(0, q ? 6 : 8).forEach((p) => out.push({ g: 'الصفحات', t: TITLES[p], go: () => go(p) }));
    if (q.length >= 2) { (S._qsC || []).filter((c) => has(c.code, c.name_ar)).slice(0, 6).forEach((c) => out.push({ g: 'المقررات', t: c.code + ' ' + c.name_ar, go: () => go(canSettings() ? 'courses' : 'mine') }));
      S.faculty.filter((f) => has(f.name_ar, f.name_en, f.employee_no)).slice(0, 6).forEach((f) => out.push({ g: 'الأعضاء', t: f.name_ar, s: uName(f.department_id), go: () => C.facView(f.id) }));
      S.units.filter((u) => u.status !== 'archived' && (isAdmin() || cap(u.id, 'read')) && has(u.name)).slice(0, 6).forEach((u) => out.push({ g: 'اللجان والوحدات', t: u.name, go: () => go('unit', { id: u.id }) })); }
    QS.res = out; QS.i = 0; qsDraw(); }
  function qsDraw() { const r = $('#qsR'); if (!r) return; let g = ''; r.innerHTML = QS.res.length ? QS.res.map((x, i) => (x.g !== g ? ((g = x.g), `<div class="qs-g">${esc(g)}</div>`) : '') + `<button class="qs-i${i === QS.i ? ' on' : ''}" onclick="C.qsGo(${i})"><span>${esc(x.t)}</span>${x.s ? `<small>${esc(x.s)}</small>` : ''}</button>`).join('') : '<div class="empty">لا توجد نتائج.</div>'; const on = r.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
  C.qsGo = (i) => { const x = QS.res[i]; const o = $('#qsOv'); if (o) o.remove(); if (x) x.go(); };
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'ك') && S.me) { e.preventDefault(); C.qs(); } });

  /* «جهاتي وصلاحياتي»: ما يخص المستخدم وحده */
  function mineHtml(reqs) {
    const mf = myFac(), me = S.me, direct = myDirect();
    const open = {}, mineOpen = reqs.filter((r) => mf && r.assignee_faculty === mf && !['done', 'rejected'].includes(r.status)).length;
    reqs.forEach((r) => { if (!['done', 'rejected'].includes(r.status)) open[r.unit_id] = (open[r.unit_id] || 0) + 1; });
    const pend = (u) => TPLS.filter((t) => t.required && t.active && tplTargets(t).some((x) => x.id === u) && !RLOG.some((r) => r.template_id === t.id && r.unit_id === u)).length;
    const appsOf = (u) => S.apps.filter((a) => a.unit_id === u && a.active && appLv(a) !== 'none').length;
    const roles = [];
    if (isAdmin()) roles.push(chip('مدير النظام', 'brass'));
    direct.filter((m) => m.position === 'head').forEach((m) => roles.push(chip('رئيس ' + uName(m.unit_id), 'brass')));
    const myG = S.grants.filter((g) => g.profile_app_id === me.app_id && (!g.end_date || g.end_date >= today()) && (!g.start_date || g.start_date <= today()));
    myG.forEach((g) => roles.push(chip(((S.roles.find((r) => r.key === g.role_key) || {}).name || g.role_key) + ' · ' + uName(g.unit_id))));
    const gl = Object.keys(S.glob || {}).filter((k) => S.glob[k]).map((k) => CAPS[k]);
    /* الجهات التي تصله بالتبعية: من رئاسته لجهة أعلى أو من دور ممنوح */
    const dIds = new Set(direct.map((m) => m.unit_id));
    const heads = new Set(direct.filter((m) => m.position === 'head').map((m) => m.unit_id));
    const gUnits = new Set(myG.filter((g) => g.include_children).map((g) => g.unit_id));
    const groups = {};
    if (!isAdmin()) S.units.filter((u) => u.status === 'active' && !dIds.has(u.id) && cap(u.id, 'read')).forEach((u) => {
      const anc = pathOf(u.id).slice(0, -1).reverse(); const via = anc.find((a) => heads.has(a.id) || gUnits.has(a.id));
      const k = via ? via.id : '_role'; (groups[k] = groups[k] || []).push(u); });
    const card = (m) => { const u = unit(m.unit_id), o = open[u.id] || 0, pf = pend(u.id), na = appsOf(u.id);
      return `<button class="ws mine" onclick="C.go('unit',{id:'${u.id}'})" style="border-inline-start-color:var(--k-${u.kind})"><div class="row"><h3 class="grow">${esc(u.name)}</h3>${chip(POS[m.position], m.position === 'head' ? 'brass' : '')}</div>
        <span class="meta">${esc(KIND[u.kind])} · تتبع ${esc(uName(u.parent_id))}</span>
        <span class="row">${o ? chip(o + ' مهام مفتوحة', 'wait') : chip('لا مهام مفتوحة', 'ok')}${pf ? chip(pf + ' نموذج مطلوب', 'bad') : ''}${na ? chip(na + ' برنامج') : ''}</span></button>`; };
    const gHtml = Object.keys(groups).map((k) => { const l = groups[k].sort(sortU);
      const title = k === '_role' ? (me.college_role === 'dean' ? 'كل جهات الكلية (بصفتك عميدًا)' : me.college_role === 'vice' ? 'جهات الكلية (بصفتك وكيلًا)' : 'جهات تطّلع عليها بصلاحية ممنوحة') : 'الجهات التابعة لـ ' + uName(k);
      return `<div class="vgroup"><b>${esc(title)} <span class="muted small">(${l.length})</span></b><div class="row">${l.slice(0, 40).map((u) => `<button class="uchip" onclick="C.go('unit',{id:'${u.id}'})">${kindDot(u.kind)}${esc(u.name)}${open[u.id] ? ` <small>${open[u.id]}</small>` : ''}</button>`).join('')}</div></div>`; }).join('');
    const myApps = S.apps.filter((a) => a.active && (isAdmin() ? false : (S.appLv || {})[a.id] && (S.appLv || {})[a.id] !== 'none')).slice(0, 12);
    const empty = !isAdmin() && !direct.length && !Object.keys(groups).length && !myApps.length;
    return `<section class="minebox"><div class="row" style="align-items:flex-start"><div class="grow"><h2>مرحبًا، ${esc(me.name)}</h2>
        <div class="row" style="margin-top:6px">${roles.join('') || chip('عضو هيئة التدريس')}</div>
        ${gl.length && !isAdmin() ? `<div class="small muted" style="margin-top:6px">صلاحيات عامة: ${esc(gl.join('، '))}</div>` : ''}</div>
        <div class="row">${mineOpen ? `<button class="btn sm" onclick="C.go('tasks',{})">${icon('clipboard')}${mineOpen} مهام مسندة إليك</button>` : ''}${isAdmin() ? `<button class="btn sm" onclick="C.go('settings')">${icon('gear')}لوحة الإدارة</button>` : ''}</div></div>
      ${isAdmin() ? `<p class="small" style="margin:10px 0 0">لديك صلاحية كاملة على كل الجهات والبرامج والإعدادات. لتحديد ما يظهر لكل زميل: «الإعدادات ← الحسابات والصلاحيات ← الصلاحيات».</p>` : ''}
      ${direct.length ? `<h3 class="mh">تكليفاتي</h3><div class="wsgrid">${direct.map(card).join('')}</div>` : ''}
      ${gHtml ? `<h3 class="mh">جهات تتابعها</h3>${gHtml}` : ''}
      ${myApps.length ? `<h3 class="mh">برامجي</h3><div class="row">${myApps.map((a) => `<button class="uchip" onclick="C.appOpen('${a.id}')">${icon(a.icon || 'app')}${esc(a.name)} <small>${esc(uName(a.unit_id))}</small></button>`).join('')}</div>` : ''}
      ${empty ? '<p class="small" style="margin:10px 0 0">لا توجد لك تكليفات أو صلاحيات بعد. يحددها مدير النظام، ويمكنك طلبها من زر «الدعم الفني».</p>' : ''}</section>`;
  }
  /* ---------------- التشغيل ---------------- */
  (async function init() {
    if (FORCE_DEMO || !D.auth.live()) {
      if (FORCE_DEMO) { DEMO = true; return showLogin(); }
      return showLogin('لم يُضبط الاتصال بقاعدة البيانات في config.js.');
    }
    if (await D.auth.session()) boot(); else showLogin();
  })();
})();
