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
  C.logout = async () => { await D.auth.signOut(); if (!FORCE_DEMO) DEMO = false; S.me = null; BRAND = null;
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
    S.grants = await D.select('org_grants').catch(() => []);
    S.apps = await D.select('org_apps').catch(() => []);
    S.programs = await D.select('programs', { order: ['sort'] }).catch(() => []);
    const pv = await D.select('faculty_private').catch(() => []);
    S.privates = Object.fromEntries(pv.map((p) => [p.faculty_id, p.mobile]));
  }
  C.reload = async () => { await loadAll(); refresh(); toast('حُدّثت البيانات.'); };

  /* ---------------- الإطار والتنقل ---------------- */
  const NAV = [
    ['home', 'الرئيسية', 'home'], ['college', 'الكلية', 'college'], ['vices', 'الوكالات', 'bank'], ['depts', 'الأقسام العلمية', 'sitemap'],
    ['units', 'الوحدات', 'cubes'], ['committees', 'اللجان', 'users'], ['-'], ['tasks', 'المهام والتكليفات', 'file'], ['mine', 'مهامي', 'clipboard', () => !!myFac() && viewRole() !== 'staff'], ['memberships', 'العضوية في الوحدات واللجان', 'users', () => !!myFac() && viewRole() !== 'staff'], ['alerts', 'تنبيهاتي', 'bell', () => !!myFac() && viewRole() !== 'staff'],
    ['reports', 'التقارير', 'chart', () => gcap('reports')], ['settings', 'الإعدادات', 'gear']
  ];
  const TITLES = { home: 'الرئيسية', college: 'كلية الأعمال', vices: 'الوكالات', depts: 'الأقسام العلمية', units: 'الوحدات', committees: 'اللجان', tasks: 'المهام والتكليفات',
    reports: 'التقارير', settings: 'الإعدادات', org: 'الهيكل التنظيمي', faculty: 'أعضاء هيئة التدريس', courses: 'المقررات والجداول', accounts: 'الحسابات والصلاحيات',
    audit: 'سجل التدقيق', apps: 'البرامج والتحديثات', ann: 'الإعلانات', backup: 'النسخ الاحتياطي والنقل', identity: 'الهوية والواجهة', general: 'القوائم والإعدادات العامة',
    files: 'الملفات والمرفقات', notifs: 'الإشعارات', search: 'الاستعلامات', ws: 'الوحدات واللجان', assist: 'المرشد الأكاديمي والدعم الفني', forms: 'النماذج والتقارير', track: 'متابعة النماذج المطلوبة', perms: 'صلاحيات عضو هيئة التدريس', matrix: 'مصفوفة التكليفات والصلاحيات', myschedule: 'مهامي', mine: 'مهامي', memberships: 'العضوية في الوحدات واللجان', mycomms: 'العضوية في الوحدات واللجان', alerts: 'تنبيهاتي' };
  const NAV_OF = { myschedule: 'mine', mycomms: 'memberships', matrix: 'settings', org: 'settings', faculty: 'settings', courses: 'settings', accounts: 'settings', audit: 'settings', apps: 'settings', ann: 'settings', backup: 'settings', identity: 'settings', general: 'settings', assist: 'settings', forms: 'settings', track: 'settings', perms: 'settings', ws: 'units', files: 'tasks', notifs: 'home', search: 'home' };
  const navOfUnit = (u) => !u ? 'home' : u.kind === 'unit' ? 'units' : u.kind === 'committee' ? 'committees' : u.kind === 'department' ? 'depts' : u.id === rootId() ? 'college' : u.kind === 'leadership' ? 'vices' : 'college';
  function renderShell() {
    const st = S.settings; applyTheme(st.theme);
    $('#brand').innerHTML = `<img src="${attr(st.logo || LOGO_IMG)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="emb" style="display:none">${emblem()}</span><div><b>${esc(st.university || 'جامعة الجوف')}</b><span dir="ltr">${esc(st.universityEn || 'Jouf University')}</span></div>`;
    const roleTxt = isAdmin() ? 'مدير النظام' : S.me.college_role === 'dean' ? 'عميد الكلية' : S.me.college_role === 'vice' ? 'وكيل الكلية' : (myDirect().find((m) => m.position === 'head') ? 'رئيس ' + uName(myDirect().find((m) => m.position === 'head').unit_id) : S.me.faculty_id ? 'عضو هيئة التدريس' : 'مستخدم');
    const ini = (S.me.name || '؟').replace(/^(د|أ|م)\.\s*/, '').trim().charAt(0);
    $('#topbar').innerHTML = `<button class="ib" id="menuBtn" style="display:none" aria-label="القائمة">${icon('menu')}</button>
      <span class="ttl" id="topTitle"></span><span class="grow"></span>
      <button class="ib" onclick="C.fullscreen()" aria-label="ملء الشاشة" title="ملء الشاشة">${icon('expand')}</button>
      <button class="ib" onclick="C.go('settings')" aria-label="الإعدادات" title="الإعدادات">${icon('gear')}</button>
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
    $('#side').innerHTML = staff ? nb('home', 'home', 'الرئيسية') + nb('mine', 'clipboard', 'مهامي') + nb('memberships', 'users', 'العضوية في الوحدات واللجان') + nb('alerts', 'bell', 'تنبيهاتي') +
      `<div class="foot">${esc(st.collegeName || 'كلية الأعمال')} · نظام إدارة الكلية ${VERSION}${DEMO ? '<br>نسخة تجريبية' : ''}</div>` : NAV.map((n) => n[0] === '-' ? '<div class="sep"></div>' : ((n[3] && !n[3]()) || !showNav(n[0])) ? '' :
      `<button class="nav" data-p="${n[0]}" onclick="C.go('${n[0]}')">${icon(n[2])}${esc(n[1])}</button>`).join('') +
      (mine.length ? `<div class="sep"></div><div class="sidehead">جهاتي</div>${mine.slice(0, 10).map((m) => `<button class="nav sub" data-p="u:${m.unit_id}" onclick="C.go('unit',{id:'${m.unit_id}'})">${kindDot((unit(m.unit_id) || {}).kind || 'unit')}<span class="grow">${esc(uName(m.unit_id))}</span><small>${esc(POS[m.position])}</small></button>`).join('')}` : '') +
      `<div class="foot">${esc(st.collegeName || 'كلية الأعمال')} · نظام إدارة الكلية ${VERSION}${DEMO ? '<br>نسخة تجريبية' : ''}</div>`;
    $('#menuBtn').onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); };
    document.addEventListener('click', (e) => { if ($('#side').classList.contains('open') && !$('#side').contains(e.target)) $('#side').classList.remove('open'); });
    bellCount(); refreshUrgent(); renderDock(S.settings.assist, true);
  }
  const go = (C.go = (page, opts) => {
    if (page === 'org' && ORG.dirty && VIEW.page === 'org' && !(opts && opts.force)) { if (!window.confirm('في الجهة المحددة تغييرات لم تُحفظ. هل تريد تجاهلها؟')) return; ORG.dirty = false; }
    if (VIEW.page === 'app' && page !== 'app' && window.__CAPP && window.__CAPP.busy()) { if (!window.confirm('لم يكتمل حفظ بيانات البرنامج بعد. هل تغادر؟')) return; }
    VIEW = Object.assign({ page }, opts || {});
    $('#side').classList.remove('open');
    const navKey = page === 'unit' ? ($('#side .nav[data-p="u:' + VIEW.id + '"]') ? 'u:' + VIEW.id : navOfUnit(unit(VIEW.id))) : (NAV_OF[page] || page);
    $$('#side .nav').forEach((b) => b.classList.toggle('on', b.dataset.p === navKey));
    const h = '#p=' + page + (VIEW.id ? '&id=' + VIEW.id : ''); if (location.hash !== h) history.replaceState(null, '', h);
    const title = page === 'unit' ? uName(VIEW.id) : page === 'app' ? '' : page === 'apps' && !manageAny() ? 'برامجي' : page === 'settings' && viewRole() === 'staff' ? 'حسابي' : (TITLES[page] || '');
    $('#topTitle').textContent = page === 'home' ? '' : title;
    const flush = page === 'home' || page === 'app';
    $('#main').classList.toggle('flush', flush);
    const v = $('#view');
    v.innerHTML = (DEMO && !flush ? '<div class="banner">نسخة تجريبية ببيانات وهمية: جرّب كل الشاشات، ولا يُحفظ شيء بعد إعادة تحميل الصفحة.</div>' : '') +
      (flush ? '' : `<div class="pghead"><h1>${esc(title)}</h1>${NAV_OF[page] === 'settings' && viewRole() !== 'staff' ? `<button class="btn sm noprint" onclick="C.go('settings')">${icon('back')}الإعدادات</button>` : ''}</div>`) +
      '<div id="printHead" class="printhead"></div><div id="pg"></div>';
    const fn = { home: pgHome, college: pgCollege, vices: () => pgList(['leadership', 'administration'], true), depts: () => pgList(['department']), units: () => pgList(['unit']), committees: () => pgList(['committee']),
      ws: pgWs, tasks: pgTasks, org: pgOrg, unit: pgUnit, faculty: pgFaculty, courses: pgCourses, reports: pgReports, accounts: pgAccounts, audit: pgAudit, settings: pgSettings,
      general: pgGeneral, identity: pgIdentity, apps: pgApps, app: pgApp, ann: pgAnn, backup: pgBackup, files: pgFiles, notifs: pgNotifs, search: pgSearch, assist: pgAssist, forms: pgForms, track: pgTrack, perms: pgPerms, matrix: pgMatrix, myschedule: pgMine, mine: pgMine, memberships: pgComms, mycomms: pgComms, alerts: pgAlerts }[page] || pgHome;
    Promise.resolve(fn()).then((html) => { if (typeof html === 'string') $('#pg').innerHTML = html; if (VIEW.after) VIEW.after(); }).catch((e) => { console.error(e); $('#pg').innerHTML = `<div class="panel bad">${esc(pgErr(e))}</div>`; });
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
    const head = `<div class="panel"><div class="row" style="align-items:flex-start"><div class="grow">
        <div class="path">${pathOf(u.id).map((p) => esc(p.name)).join(' ‹ ')}</div>
        <p style="margin:6px 0 0">${esc(u.description || '')}</p></div>
        ${chip(KIND[u.kind])} ${chip(USTATUS[u.status], u.status === 'active' ? 'ok' : 'wait')}</div>
        <dl class="kv" style="margin-top:12px"><dt>المسؤول</dt><dd>${h ? esc(fName(h.faculty_id)) + ' <span class="small muted">منذ ' + fmtD(h.start_date) + '</span>' : '—'}</dd>
        <dt>عدد الأعضاء</dt><dd>${S.members.filter((m) => m.unit_id === u.id && activeM(m)).length}</dd>
        ${u.term_start || u.term_end ? `<dt>مدة التكليف</dt><dd>${fmtD(u.term_start)} ← ${fmtD(u.term_end)}</dd>` : ''}</dl>
        <div class="row noprint" style="margin-top:12px"><button class="btn sm" onclick="C.go('ws')">كل الوحدات واللجان</button><button class="btn sm" onclick="C.go('org',{id:'${u.id}'})">موقعها في الهيكل</button></div></div>`;
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
  const FQ = { q: '', dept: '', rank: '', st: 'active', miss: false, req: false, sel: new Set() };
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
    return S.faculty.filter((f) => (FQ.st === 'all' || (FQ.st === 'inactive') === offF(f)) && (!FQ.dept || f.department_id === FQ.dept) && (!FQ.rank || f.rank === FQ.rank) &&
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
        <span class="grow"></span>
        <button class="btn sm" onclick="C.facExport()">تصدير Excel</button>
        ${canAddFac() ? `<button class="btn sm" onclick="C.facImport()">استيراد من Excel</button><button class="btn pri sm" onclick="C.facEdit()">إضافة عضو</button>` : ''}
      </div>
      ${isAdmin() ? `<div class="row noprint" style="margin-bottom:12px;gap:8px;align-items:center"><b class="small">التكليفات (مصدر صلاحيات الجهات وبرامجها):</b>
        <button class="btn sm pri" onclick="C.go('matrix')">${icon('list')}مصفوفة التكليفات والصلاحيات</button><button class="btn sm" onclick="C.asExport()">${icon('upload')}تصدير التكليفات</button><button class="btn sm" onclick="C.asImport()">${icon('list')}استيراد التكليفات من Excel</button>
        <span class="small muted">${S.faculty.filter((f) => f.profile_app_id).length} من ${S.faculty.length} عضوًا مرتبطون بحساب دخول؛ يُربط الحساب تلقائيًا بالبريد عند أول دخول.</span></div>` : ''}
      ${helpers}<div id="fBulk">${bulkBar()}</div>
      <p class="small muted">${list.length} من ${S.faculty.length} عضو. هذه القاعدة هي المصدر الوحيد لبيانات الأعضاء في كل الوحدات واللجان والجداول.</p>
      ${list.length ? `<style>.ftab td{white-space:nowrap;font-size:13.5px}.ftab td.nm{white-space:normal;min-width:200px}.ftab th{white-space:nowrap}</style><div class="tw"><table class="ftab"><tr>${canSel ? `<th class="noprint"><input type="checkbox" aria-label="تحديد الكل" onchange="C.fSelAll(this.checked)" ${list.filter(canEditFac).every((f) => FQ.sel.has(f.id)) && FQ.sel.size ? 'checked' : ''}></th>` : ''}<th>الاسم</th><th class="noprint"></th><th>الرتبة</th><th>القسم</th><th>الجنس</th><th>المقر</th><th>الخدمة</th><th>البريد الجامعي</th>${showMob ? '<th>الجوال</th>' : ''}${FQ.miss ? '<th>الناقص</th>' : ''}<th>الحالة</th><th>الحساب</th></tr>
      ${list.map((f) => { const y = svcYears(f.service_start); return `<tr${offF(f) ? ' style="opacity:.6"' : ''}>${canSel ? `<td class="noprint">${canEditFac(f) ? `<input type="checkbox" aria-label="تحديد" ${FQ.sel.has(f.id) ? 'checked' : ''} onchange="C.fSel('${f.id}',this.checked)">` : ''}</td>` : ''}
        <td class="nm"><a href="#" onclick="C.facView('${f.id}');return false"><b>${esc(f.name_ar)}</b></a>${f.name_en ? `<div class="tiny muted" dir="ltr" style="text-align:end">${esc(f.name_en)}</div>` : ''}</td>
        <td class="noprint">${act(f)}</td><td>${esc(f.rank)}</td><td>${esc(uName(f.department_id))}</td><td>${esc(f.gender || '')}</td><td>${esc(f.campus || '')}</td><td class="small" title="${attr(f.service_start ? 'منذ ' + fmtD(f.service_start) : '')}">${esc(yrsTxt(y))}</td>
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
    const t = (S.sched || {}).term; if (!t) return;
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
        const nx = (d.items || []).filter((i) => i.date && String(i.date) >= today()).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0], n = nx ? daysTo(nx.date) : null;
        if (n == null || n <= lead) out.push({ k: 'exam', t: 'أسئلة الاختبار لم تُسلَّم' + (nx ? ' — ' + nx.name : ''), sub: cn, n, late: n != null && n < 0, btn: 'فتح', act: openApp('exam', c) }); });
      /* إعادة الأوراق المصححة لوحدة الاختبارات (موعدها من إعدادات نظام الاختبارات) */
      if (r.teacher || r.coordinator) stOf(c, 'exam').forEach((x) => { const g = (x.details || {}).graded; if (!g || !g.due) return; const n = daysTo(g.due);
        if (n <= lead) out.push({ k: 'exam', t: 'إعادة الأوراق المصححة لوحدة الاختبارات' + (g.pending > 1 ? ' (' + g.pending + ' شعب)' : ''), sub: cn, n, late: n < 0, btn: 'فتح', act: openApp('exam', c) }); }); });
    CX.st.filter((x) => x.kind === 'invigilation' && x.faculty_id === me).forEach((x) => { const c = ((S.sched || {}).courses || []).find((k) => k.id === x.course_id) || {};
      ((x.details || {}).items || []).forEach((i) => { const n = daysTo(i.date); if (n !== 0 && n !== 1) return;
        out.push({ k: 'exam', t: `مراقبة ${n === 0 ? 'اليوم' : 'غدًا'}: ${i.role || 'مراقب'}`, sub: [c.code, i.name, i.period && 'الفترة ' + i.period, i.room && 'القاعة ' + i.room].filter(Boolean).join(' · '), n, late: false, btn: 'فتح',
          act: appOfKind('exam') && c.id ? `C.appOpenCtx('${appOfKind('exam').id}','${c.id}')` : `C.toast('لم يُربط نظام الاختبارات بعد.',true)` }); }); });
    reqs.filter((q) => q.kind !== 'inquiry' && !['done', 'rejected'].includes(q.status) && !q.archived && q.due_date).forEach((q) => { const n = daysTo(q.due_date);
      if (n <= lead) out.push({ k: 'comm', t: q.title, sub: uName(q.unit_id), n, late: n < 0, btn: 'فتح', act: `C.openReq('${q.id}')` }); });
    return out.sort((a, b) => (b.late - a.late) || ((a.n == null ? 1e9 : a.n) - (b.n == null ? 1e9 : b.n)));
  }
  /* بيانات الصفحات: الجدول وملخصات البرامج والمهام والتكليفات والتنبيهات */
  async function mineData() {
    const mf = myFac(); await loadSched(); await loadCourseExtras(); const sc = S.sched || { my: [], mine: [], courses: [] };
    const mem = myDirect().filter((m) => { const u = unit(m.unit_id); return u && u.status !== 'archived'; }), units = mem.map((m) => m.unit_id);
    const reqs = [...new Map([...(await D.select('org_requests', { eq: { assignee_faculty: mf } }).catch(() => [])), ...(units.length ? await D.select('org_requests', { in: { unit_id: units } }).catch(() => []) : [])].map((q) => [q.id, q])).values()];
    const urg = buildUrgent(sc.my, reqs.filter((q) => q.assignee_faculty === mf || mem.some((m) => m.unit_id === q.unit_id && ['head', 'deputy'].includes(m.position))));
    S.urgentN = urg.length;
    return { sc, reqs, mem, urg };
  }
  async function refreshUrgent() { if (!myFac()) return; try { await mineData(); navBadge(); bellCount(); lampSet(); } catch (e) { console.warn(e); } }
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
  async function staffHome() {
    mineCss(); const { sc } = await mineData(); navBadge(); bellCount(); const t = curTerm(), cs = sc.mine;
    const byDay = {}; cs.forEach((c) => meetsOf(c).forEach((m) => (byDay[m.d] = byDay[m.d] || []).push(Object.assign({}, c, { from: m.from, to: m.to }))));
    const days = Object.keys(byDay).sort((a, b) => DAYS_ORDER.indexOf(a) - DAYS_ORDER.indexOf(b)), td = todayKey();
    const banner = DEMO ? '<div class="banner">نسخة تجريبية ببيانات وهمية.</div>' : '';
    return `<div class="homebody">${banner}<div class="row" style="align-items:center;margin-bottom:14px"><div class="grow"><h2 style="margin:0">جدولي الدراسي</h2>
        <div class="small muted">${esc(t ? t.name : '')} · ${cs.length} شعبة · ${cs.reduce((s, c) => s + (+c.hours || 0), 0)} ساعة</div></div>${lampHtml()}</div>
      ${cs.length ? `<div class="tw"><table><tr><th>المقرر</th><th>الشعبة</th><th>الأيام</th><th>الوقت</th><th>القاعة</th></tr>${cs.map((c) => `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}</td><td>${esc(c.section)}</td><td>${esc(c.days)}</td><td><span dir="ltr" style="white-space:nowrap">${esc(c.from)}–${esc(c.to)}</span></td><td><span dir="ltr">${esc(c.room || '')}</span></td></tr>`).join('')}</table></div>
        <h3 style="margin:18px 0 8px">حسب اليوم</h3><div class="home2" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${days.map((d) => `<div class="box"${d === td ? ' style="outline:2px solid var(--ledger)"' : ''}><b>${esc(d)}${d === td ? ' · اليوم' : ''}</b>${byDay[d].sort((a, b) => String(a.from).localeCompare(String(b.from))).map((c) => `<div class="small" style="margin-top:6px"><span dir="ltr">${esc(c.from)}–${esc(c.to)}</span> · ${esc(c.code)} (${esc(c.section)})${c.room ? ` · <span dir="ltr">${esc(c.room)}</span>` : ''}</div>`).join('')}</div>`).join('')}</div>`
        : `<div class="empty">${myFac() ? 'لا توجد شعب مسندة إليك في الجدول المعتمد لهذا الفصل.' : 'حسابك غير مرتبط بسجل عضو هيئة تدريس. يربطه مدير النظام.'}</div>`}</div>`;
  }
  /* ٢ «مهامي»: جدول واحد — المقرر، والشعب، وعمود لكل متطلب؛ الضغط على الخانة يفتح البرنامج على المقرر */
  async function pgMine() {
    mineCss(); if (!myFac()) return '<div class="empty">حسابك غير مرتبط بسجل عضو هيئة تدريس. يربطه مدير النظام.</div>';
    const { sc } = await mineData(); navBadge(); bellCount(); const cols = reqCols();
    const head = `<tr><th style="background:var(--line2)">المقرر</th><th style="background:var(--line2)">الشعب</th>${cols.map((c) => `<th style="background:${tint(c.color, 14)};color:${c.color}">${esc(c.name)}</th>`).join('')}</tr>`;
    const rows = sc.my.map((c) => { const r = c.role, secs = (r.teacher ? c.sections.filter((x) => r.sections.includes(x.id)) : c.sections).map((x) => x.no).join('، ');
      const pn = ((S.programs || []).find((p) => p.id === c.program_id) || {}).name;
      return `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}${r.coordinator ? ' <span class="chip ok" style="font-size:11px">منسق</span>' : ''}${pn ? `<div class="tiny muted">${esc(pn)}</div>` : ''}</td><td data-h="الشعب" style="--c:var(--mute)">${esc(secs)}</td>${cols.map((col) => { const s = colState(c, col), a = colApp(col);
        return `<td class="rc" data-h="${attr(col.name)}" style="--c:${col.color};background:${tint(col.color, 6)}" ${a ? `onclick="C.appOpenCtx('${a.id}','${c.id}')" role="button" tabindex="0" title="فتح ${attr(a.name)}"` : 'title="لم يُربط برنامج بهذا العمود"'}>${stb(s.t, s.text)}${s.test ? '<span class="tiny" style="display:block;color:#9A6B00">بيانات تجريبية</span>' : ''}</td>`; }).join('')}</tr>`; }).join('');
    const follow = viewRole() !== 'staff' ? await followBoard(sc) : '';
    return `<p class="small muted" style="margin:0 0 10px">${esc((sc.term || {}).name || '')} · اضغط الخانة لفتح البرنامج المعني على المقرر</p>
      ${sc.my.length ? `<table class="req"><thead>${head}</thead><tbody>${rows}</tbody></table>` : '<div class="empty">لا توجد مقررات مسندة إليك تدريسًا أو تنسيقًا في الجدول المعتمد لهذا الفصل.</div>'}${follow}`;
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
    const [reqs, fac, acc] = await Promise.all([D.select('org_requests', { eq: { assignee_faculty: myFac() } }).catch(() => []),
      D.select('org_app_fac', { eq: { faculty_id: myFac() } }).catch(() => []), D.select('org_app_access', { eq: { profile_app_id: S.me.app_id } }).catch(() => [])]);
    const openN = (uid) => reqs.filter((q) => q.unit_id === uid && q.kind !== 'inquiry' && !q.archived && !['done', 'rejected'].includes(q.status)).length;
    const entry = (u) => { const a = u.entry_app && S.apps.find((x) => x.id === u.entry_app && x.active !== false); return a && appLv(a) !== 'none' ? a : null; };
    const cards = mem.map((m) => { const u = unit(m.unit_id), a = entry(u), n = openN(u.id), r = ROLE_LBL[m.position] || [POS[m.position] || m.position, ''];
      return `<button onclick="${a ? `C.appOpen('${a.id}')` : `C.go('unit',{id:'${u.id}'})`}">${kindDot(u.kind)}<span class="grow"><b>${esc(u.name)}</b>
        <span class="small muted" style="display:block">${a ? 'يفتح: ' + esc(a.name) : 'مساحة عمل الجهة'}</span></span>
        ${n ? `<span class="chip wait">${n} ${n === 1 ? 'مهمة مفتوحة' : n === 2 ? 'مهمتان مفتوحتان' : 'مهام مفتوحة'}</span>` : ''}${chip(r[0], r[1])}${icon('chev')}</button>`; }).join('');
    /* صلاحيات خاصة: فردية (org_app_access / org_app_fac) أو دور عام (org_app_duties) على برنامج ليست لي عضوية في جهته ولا هو وجهة دخول لجهة من جهاتي */
    const mine = new Set(mem.map((m) => m.unit_id)), viaEntry = new Set(mem.map((m) => (unit(m.unit_id) || {}).entry_app).filter(Boolean));
    const ids = new Set([...fac, ...acc].filter((x) => x.level && x.level !== 'none').map((x) => x.app_id).concat(Object.keys(S.duties || {})));
    const special = S.apps.filter((a) => ids.has(a.id) && a.active !== false && appLv(a) !== 'none' && !mine.has(a.unit_id) && !viaEntry.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const LVL = { manage: ['إدارة', 'brass'], use: ['استخدام', 'ok'], view: ['اطلاع', ''] };
    if (!mem.length && !special.length) return '<div class="empty">ليست لك عضوية في جهة حاليًا. لإضافتك تواصل مع مدير النظام.</div>';
    return (mem.length ? `<div class="clist">${cards}</div>` : '<div class="empty">ليست لك عضوية في جهة حاليًا. لإضافتك تواصل مع مدير النظام.</div>') +
      (special.length ? `<h3 style="margin:22px 0 4px;font-size:15px">صلاحيات خاصة</h3><p class="small muted" style="margin:0 0 8px">برامج لك عليها صلاحية دون عضوية في جهتها.</p>
        <div class="clist">${special.map((a) => { const l = LVL[appLv(a)] || ['اطلاع', '']; return `<button onclick="C.appOpen('${a.id}')" style="padding:9px 14px">${icon(a.icon || 'app')}<span class="grow"><b>${esc(a.name)}</b><span class="small muted" style="display:block">${esc(uName(a.unit_id))}</span></span>${chip(l[0], l[1])}${icon('chev')}</button>`; }).join('')}</div>` : '');
  }
  /* ٤ «تنبيهاتي»: المتأخر أولًا ثم الأقرب موعدًا؛ سطر واحد وزر واحد لكل بند */
  async function pgAlerts() {
    mineCss(); if (!myFac()) return '<div class="empty">حسابك غير مرتبط بسجل عضو هيئة تدريس. يربطه مدير النظام.</div>';
    const { urg } = await mineData(); navBadge(); bellCount();
    const col = (k) => k === 'comm' ? '#B7862A' : colColor(k);
    return urg.length ? `<div class="clist">${urg.map((x) => `<div class="aline" style="--c:${col(x.k)}"><div><b>${esc(x.t)}</b><div class="small muted">${esc(x.sub)}</div></div>
        <span class="when ${x.w || (x.n != null && x.n < 0) ? 'late' : x.n != null && x.n <= 1 ? 'soon' : ''}">${esc(x.w || whenTxt(x.n))}</span><span class="act"><button class="btn sm pri" onclick="${x.act}">${esc(x.btn)}</button></span></div>`).join('')}</div>`
      : '<div class="okmsg">لا توجد مطلوبات عاجلة ✓</div>';
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
    const n = (x, k, v, lab, color) => `<div class="box" style="border-inline-start:4px solid ${color}"><div class="small muted">${lab}</div><a href="#" style="font-size:26px;font-weight:800;color:${color}" onclick="C.fbList('${x.dept}','${k}');return false">${v}</a></div>`;
    return `<h3 style="margin:22px 0 8px">لوحة المتابعة</h3>${fb.map((x) => `<div style="margin-bottom:12px"><b>${esc(uName(x.dept))}</b> <span class="small muted">· ${x.courses} مقرر</span>
      <div class="home2" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:6px">${n(x, 'no_file', x.no_file.length, 'ملفات مقررات لم تُسلَّم', colColor('file'))}${n(x, 'bb_unmet', x.bb_unmet.length, 'لم تستوفِ البلاك بورد', colColor('bb'))}${n(x, 'inq', x.inq.length, 'استفسارات بلا رد', colColor('bb'))}</div></div>`).join('')}`;
  }
  C.fbList = (dep, k) => { const x = (S._fb || {})[dep]; if (!x) return;
    const names = (ids) => (ids || []).map(fName).join('، ') || '—';
    const T = { no_file: 'ملفات مقررات لم تُسلَّم', bb_unmet: 'مقررات لم تستوفِ البلاك بورد', inq: 'استفسارات بلا رد' };
    const body = k === 'inq' ? x.inq.map((q) => `<tr><td>${esc(q.code || '')}</td><td>${esc(fName(q.faculty))}</td><td class="small">${esc(q.title)}</td></tr>`).join('')
      : x[k].map((c) => `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}</td><td class="small">${esc(names(c.fac))}</td><td class="small">${esc(c.coord ? fName(c.coord) : '—')}</td></tr>`).join('');
    modal(T[k] + ' — ' + uName(dep), `<div class="tw"><table>${k === 'inq' ? '<tr><th>المقرر</th><th>العضو</th><th>الاستفسار</th></tr>' : '<tr><th>المقرر</th><th>الأساتذة</th><th>المنسق</th></tr>'}${body || '<tr><td colspan="3" class="muted">لا شيء.</td></tr>'}</table></div>`, `<button class="btn" onclick="C.close()">إغلاق</button>`, true); };
  /* عدد التنبيهات بجانب «تنبيهاتي» في القائمة الجانبية */
  function navBadge() { const b = $('#side .nav[data-p="alerts"]'); if (!b) return; let s = b.querySelector('.ubadge'); if (!S.urgentN) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('span'); s.className = 'ubadge'; s.style.cssText = 'margin-inline-start:auto;background:#C0392B;color:#fff;border-radius:999px;padding:0 8px;font-size:12px;font-weight:800'; b.appendChild(s); } s.textContent = S.urgentN; }
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
    const f = id ? fac(id) : { name_ar: '', name_en: '', employee_no: '', email: '', rank: '', specialty: '', department_id: '', status: 'نشط', notes: '', gender: '', campus: '', service_start: null };
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
      <label class="f">تاريخ بداية الخدمة<span class="row" style="gap:8px;align-items:center"><input id="fv" type="date" value="${attr(f.service_start || '')}" oninput="document.getElementById('fvY').textContent=C.yrs(this.value)"><span id="fvY" class="small muted">${esc(yrsTxt(svcYears(f.service_start)))}</span></span></label>
      <label class="f">الحالة<select id="ft" ${isAdmin() ? '' : 'disabled'}>${statuses().map((s) => opt(s, s, f.status)).join('')}</select>${isAdmin() || !id ? '' : '<span class="tiny muted">الإيقاف بطلب لمدير النظام.</span>'}</label>
      <label class="f full">ملاحظات<textarea id="fo" maxlength="1000">${esc(f.notes || '')}</textarea></label></div><div class="err"></div>`,
      `<button class="btn pri" id="fOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    $('#fOk').onclick = (ev) => busy(ev.target, async () => {
      let fid = id;
      if (mobOk && $('#fp') && val('fp') && !/^[0-9+\s-]{7,20}$/.test(val('fp'))) throw new Error('رقم الجوال غير صحيح.');
      if (full) {
        const row = { name_ar: val('fa'), name_en: val('fe'), employee_no: val('fn') || null, email: val('fm').toLowerCase() || null, rank: val('fr'), specialty: val('fs'), department_id: val('fd') || null,
          gender: val('fg'), campus: val('fc'), service_start: val('fv') || null, notes: val('fo') };
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
      await reloadPeople(); C.close(); refresh(); toast('حُفظت بيانات العضو.');
    });
  };
  C.yrs = (d) => yrsTxt(svcYears(d));
  const reloadFaculty = async () => { S.faculty = await D.select('faculty'); const pv = await D.select('faculty_private').catch(() => []); S.privates = Object.fromEntries(pv.map((p) => [p.faculty_id, p.mobile])); };
  const FAC_HEAD = ['الاسم بالعربية', 'الاسم بالإنجليزية', 'الرقم الوظيفي', 'البريد الجامعي', 'الرتبة', 'التخصص', 'القسم', 'الحالة', 'الجوال', 'الجنس', 'المقر', 'تاريخ بداية الخدمة'];
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
    'الجنس': 'gender', 'gender': 'gender', 'المقر': 'campus', 'campus': 'campus', 'تاريخ بداية الخدمة': 'service_start', 'بداية الخدمة': 'service_start', 'service_start': 'service_start' };
  C.facExport = () => xlsxOut('أعضاء هيئة التدريس.xlsx', [{ name: 'الأعضاء', head: FAC_HEAD.concat(['الحساب', 'التكليفات السارية']),
    rows: facFiltered().map((f) => [f.name_ar, f.name_en, f.employee_no || '', f.email || '', f.rank, f.specialty, uName(f.department_id) === '—' ? '' : uName(f.department_id), f.status, S.privates[f.id] || '', f.gender || '', f.campus || '', f.service_start || '',
      f.profile_app_id ? 'مرتبط' : '', S.members.filter((m) => m.faculty_id === f.id && activeM(m)).map((m) => uName(m.unit_id) + ' (' + POS[m.position] + ')').join('، ')]) }]);
  C.facImport = () => {
    modal('استيراد أعضاء هيئة التدريس من Excel', `<p>الملف يحتوي صفًا للعناوين ثم صفًا لكل عضو. يُطابق العضو الموجود بالرقم الوظيفي ثم بالبريد الجامعي (لا بالاسم وحده)، فيُحدَّث، ومن لا يطابق يُضاف جديدًا.</p>
      <div class="row"><button class="btn sm" onclick="C.facTemplate()">تنزيل القالب</button></div>
      <label class="f" style="margin-top:12px">ملف Excel<input type="file" id="fiF" accept=".xlsx,.xls,.csv" onchange="C.facParse(this)"></label>
      <div id="fiOut"></div><div class="err"></div>`, `<button class="btn pri" id="fiOk" disabled>اعتماد الاستيراد</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
  };
  C.facTemplate = () => xlsxOut('قالب أعضاء هيئة التدريس.xlsx', [{ name: 'الأعضاء', head: FAC_HEAD, rows: [['د. مثال الاسم الكامل', 'Example Name', '40000', 'name@ju.edu.sa', 'أستاذ مساعد', 'محاسبة مالية', (deptUnits()[0] || {}).name || 'قسم المحاسبة', 'نشط', '05xxxxxxxx', 'ذكر', CAMPUSES()[0], '2015-09-01']] },
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
      const g = xlGender(r.gender), cp = xlCampus(r.campus), sv = xlDate(r.service_start);
      if (g === null) return out.err.push([n, 'الجنس غير معروف: ' + r.gender]);
      if (cp === null) return out.err.push([n, 'المقر غير معروف: ' + r.campus + ' (المقرات: ' + CAMPUSES().join('، ') + ')']);
      if (sv === null) return out.err.push([n, 'تاريخ بداية الخدمة غير مفهوم (ميلادي): ' + r.service_start]);
      const row = { name_ar: r.name_ar, name_en: r.name_en || '', employee_no: r.employee_no || null, email: email || null, rank: r.rank || '', specialty: r.specialty || '', department_id: dep, status: r.status || 'نشط' };
      /* الحقول الجديدة لا تُفرَّغ إن تُركت فارغة في الملف */
      if (g) row.gender = g; if (cp) row.campus = cp; if (sv) row.service_start = sv;
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
      <label class="f">الحالة<select id="pgA">${opt('1', 'نشط', p.active === false ? '0' : '1')}${opt('0', 'موقوف', p.active === false ? '0' : '1')}</select></label></div><div class="err"></div>`,
      `<button class="btn pri" id="pgOk">حفظ</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#pgOk').onclick = (ev) => busy(ev.target, async () => {
      const row = { name: val('pgN'), degree: val('pgD'), prefixes: val('pgP').toUpperCase().split(/[\s,،]+/).filter(Boolean), department_id: val('pgS') || null, active: val('pgA') === '1' };
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
    const ctrl = `<div class="row noprint" style="margin-bottom:12px"><select class="inp" onchange="C.rq('r',this.value)" aria-label="التقرير">${Object.keys(REPORTS).map((k) => opt(k, REPORTS[k], RQ.r)).join('')}</select>
      ${['faculty', 'load'].includes(RQ.r) ? `<select class="inp" onchange="C.rq('dept',this.value)" aria-label="القسم"><option value="">كل الأقسام</option>${deptUnits().map((d) => opt(d.id, d.name, RQ.dept)).join('')}</select>` : ''}
      ${RQ.r === 'load' ? `<select class="inp" onchange="C.rq('term',this.value)" aria-label="الفصل">${S.terms.slice().reverse().map((t) => opt(t.id, t.name, RQ.term)).join('')}</select>` : ''}
      ${['assign', 'tasks'].includes(RQ.r) ? `<select class="inp" onchange="C.rq('kind',this.value)" aria-label="نوع الجهة"><option value="">كل الجهات</option>${opt('unit', 'الوحدات', RQ.kind)}${opt('committee', 'اللجان', RQ.kind)}${opt('department', 'الأقسام', RQ.kind)}</select>` : ''}
      <span class="grow"></span><button class="btn sm" onclick="C.repXlsx()">تصدير Excel</button><button class="btn sm" onclick="C.repPrint()">طباعة / PDF</button></div>`;
    let head = [], rows = [], summary = '';
    if (RQ.r === 'faculty') {
      const l = S.faculty.filter((f) => !RQ.dept || f.department_id === RQ.dept).sort((a, b) => uName(a.department_id).localeCompare(uName(b.department_id), 'ar') || a.name_ar.localeCompare(b.name_ar, 'ar'));
      head = ['الاسم', 'الرتبة', 'التخصص', 'القسم', 'الحالة', 'التكليفات السارية'];
      rows = l.map((f) => [f.name_ar, f.rank, f.specialty, uName(f.department_id), f.status, S.members.filter((m) => m.faculty_id === f.id && activeM(m)).length]);
      const by = {}; l.forEach((f) => { by[f.rank || 'غير محدد'] = (by[f.rank || 'غير محدد'] || 0) + 1; });
      summary = `<div class="stats">${Object.keys(by).map((k) => `<div><b>${by[k]}</b><span>${esc(k)}</span></div>`).join('')}<div><b>${l.length}</b><span>الإجمالي</span></div></div>`;
    } else if (RQ.r === 'load') {
      const l = (await D.rpc('report_teaching_load', { p_term: RQ.term })).filter((x) => !RQ.dept || (fac(x.faculty_id) || {}).department_id === RQ.dept).sort((a, b) => b.hours - a.hours);
      head = ['عضو هيئة التدريس', 'الرتبة', 'القسم', 'عدد المقررات', 'عدد الشعب', 'الساعات المعتمدة'];
      rows = l.map((x) => [x.name, x.rank, x.department, x.courses, x.sections, Number(x.hours)]);
      const tot = l.reduce((a, x) => a + Number(x.hours), 0); summary = `<div class="stats"><div><b>${l.filter((x) => x.sections).length}</b><span>عضو لديه شعب</span></div><div><b>${l.reduce((a, x) => a + x.sections, 0)}</b><span>شعبة مسندة</span></div><div><b>${tot}</b><span>ساعة معتمدة</span></div></div>`;
    } else if (RQ.r === 'assign') {
      const l = S.members.filter((m) => activeM(m) && (!RQ.kind || (unit(m.unit_id) || {}).kind === RQ.kind)).sort((a, b) => uName(a.unit_id).localeCompare(uName(b.unit_id), 'ar') || (a.position === 'head' ? -1 : 1));
      head = ['الجهة', 'الجهة الأم', 'العضو', 'الصفة', 'بداية التكليف', 'نهاية التكليف'];
      rows = l.map((m) => [uName(m.unit_id), uName((unit(m.unit_id) || {}).parent_id), fName(m.faculty_id), POS[m.position], m.start_date, m.end_date || 'مستمر']);
    } else if (RQ.r === 'tasks') {
      const reqs = await D.select('org_requests', { cols: 'unit_id,status,due_date,archived' });
      const us = S.units.filter((u) => !RQ.kind || u.kind === RQ.kind);
      head = ['الجهة'].concat(Object.keys(RSTAT).map((k) => RSTAT[k][0])).concat(['متأخرة', 'مؤرشفة', 'الإجمالي']);
      rows = us.map((u) => { const rs = reqs.filter((r) => r.unit_id === u.id); return [u.name].concat(Object.keys(RSTAT).map((k) => rs.filter((r) => !r.archived && r.status === k).length))
        .concat([rs.filter((r) => !r.archived && r.due_date && r.due_date < today() && !['done', 'rejected'].includes(r.status)).length, rs.filter((r) => r.archived).length, rs.length]); }).filter((r) => r[r.length - 1] > 0);
    } else {
      head = ['الجهة', 'النوع', 'تتبع إلى', 'المسؤول', 'عدد الأعضاء', 'الحالة', 'البرامج'];
      rows = flatUnits().map((x) => { const h = headOf(x.u.id); return ['  '.repeat(x.d) + x.u.name, KIND[x.u.kind], uName(x.u.parent_id), h ? fName(h.faculty_id) : '', S.members.filter((m) => m.unit_id === x.u.id && activeM(m)).length, USTATUS[x.u.status], S.apps.filter((a) => a.unit_id === x.u.id).map((a) => a.name).join('، ')]; });
    }
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
    const reqs = await D.select('org_requests', { eq: { archived: false }, cols: 'id,unit_id,status' }).catch(() => []);
    const open = {}; reqs.forEach((r) => { if (!['done', 'rejected'].includes(r.status)) open[r.unit_id] = (open[r.unit_id] || 0) + 1; });
    const scoped = !fullRead() && !VIEW.all;
    const list = S.units.filter((u) => kinds.includes(u.kind) && u.status !== 'archived' && !(notRoot && u.id === rootId()) && (!scoped || cap(u.id, 'read'))).sort(sortU);
    const card = (u) => { const h = headOf(u.id), can = cap(u.id, 'read'), na = S.apps.filter((a) => a.unit_id === u.id && a.active).length;
      return `<button class="ws ${can ? '' : 'locked'}" onclick="C.go('unit',{id:'${u.id}'})" style="border-inline-start-color:var(--k-${u.kind})">
        <h3>${esc(u.name)}</h3><span class="meta">تتبع: ${esc(uName(u.parent_id))}</span><span class="meta">${h ? 'المسؤول: ' + esc(fName(h.faculty_id)) : 'لم يُعيَّن مسؤول'}</span>
        <span class="row">${u.status !== 'active' ? chip(USTATUS[u.status], 'wait') : ''}${open[u.id] ? chip(open[u.id] + ' مهام مفتوحة', 'brass') : ''}${na ? chip(na + ' برنامج') : ''}${!can ? chip('للاطلاع بإذن') : ''}</span></button>`; };
    return `<div class="row noprint" style="margin-bottom:14px"><span class="grow small muted">${scoped ? 'الجهات التي تخصك (' + list.length + ').' : list.length + ' جهة. التبعية والأسماء تُعدَّل من «الإعدادات ← الهيكل التنظيمي».'}</span>
      ${!fullRead() ? `<button class="btn sm" onclick="C.listAll(${scoped})">${scoped ? 'عرض كل جهات الكلية' : 'جهاتي فقط'}</button>` : ''}${isAdmin() ? `<button class="btn sm" onclick="C.go('org')">${icon('sitemap')}الهيكل التنظيمي</button>` : ''}</div>
      ${list.length ? `<div class="wsgrid">${list.map(card).join('')}</div>` : '<div class="empty">لا توجد جهات من هذا النوع.</div>'}`;
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
      const mf = myFac();
      rows = rows.filter((r) => (TQ.st === 'all' || (TQ.st === 'open' ? !['done', 'rejected'].includes(r.status) : r.status === TQ.st)) && (!TQ.unit || r.unit_id === TQ.unit) && (!TQ.mine || (mf && r.assignee_faculty === mf)))
        .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
      const units = [...new Set(S.units.filter((u) => cap(u.id, 'read')).map((u) => u.id))];
      body = `<div class="row noprint" style="margin-bottom:12px"><select class="inp" onchange="C.tq('st',this.value)">${opt('open', 'المفتوحة', TQ.st)}${opt('all', 'كل الحالات', TQ.st)}${Object.keys(RSTAT).map((k) => opt(k, RSTAT[k][0], TQ.st)).join('')}</select>
        <select class="inp" onchange="C.tq('unit',this.value)"><option value="">كل الجهات</option>${units.map((u) => opt(u, uName(u), TQ.unit)).join('')}</select>
        ${mf ? `<label class="small row" style="gap:4px"><input type="checkbox" ${TQ.mine ? 'checked' : ''} onchange="C.tq('mine',this.checked)">المسندة إليّ فقط</label>` : ''}<span class="grow"></span>
        ${TQ.unit && cap(TQ.unit, 'write') ? `<button class="btn sm pri" onclick="C.reqNew('${TQ.unit}')">مهمة جديدة</button>` : '<span class="small muted">لإضافة مهمة اختر الجهة أولًا</span>'}</div>
        ${rows.length ? `<div class="tw"><table><tr><th>العنوان</th><th>الجهة</th><th>الحالة</th><th>المكلف</th><th>الاستحقاق</th></tr>${rows.map((r) => { const late = r.due_date && r.due_date < today() && !['done', 'rejected'].includes(r.status);
          return `<tr class="click" onclick="C.openReq('${r.id}')"><td>${esc(r.title)}</td><td>${esc(uName(r.unit_id))}</td><td>${chip(RSTAT[r.status][0], RSTAT[r.status][1])}</td><td>${esc(r.assignee_faculty ? fName(r.assignee_faculty) : '—')}</td><td class="num ${late ? 'bad' : ''}">${fmtD(r.due_date)}${late ? ' (متأخرة)' : ''}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد مهام مطابقة.</div>'}`;
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
    if (viewRole() === 'staff') return `<div class="hubgrid">${H('apps', 'app', 'برامجي', 'البرامج التي أُتيحت لك حسب تكليفك')}${H('notifs', 'bell', 'الإشعارات', 'ما وصلك من تكليفات وتنبيهات')}</div>
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
      <span class="row"><button class="btn sm pri" onclick="C.appOpen('${a.id}')">فتح البرنامج</button>${a.kind === 'html' && appLv(a) === 'manage' ? `<button class="btn sm" onclick="C.appUpload('${a.id}')">رفع تحديث</button>` : ''}</span></div>`;
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
        <td class="row"><button class="btn sm pri" onclick="C.appOpen('${a.id}')">فتح</button>${a.kind === 'html' && m ? `<button class="btn sm" onclick="C.appUpload('${a.id}')">رفع تحديث</button><button class="btn sm" onclick="C.appVers('${a.id}')">الإصدارات</button>` : ''}${m ? `<button class="btn sm" onclick="C.appEdit('${a.id}')">تعديل</button>` : ''}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد برامج. أضف أول برنامج لجهتك من الزر أعلاه.</div>'}`;
  }
  const detectVer = (name, text) => { const m = (name || '').match(/v?\s*(\d+(?:[._]\d+){0,3})(?!.*\d)/i) || ((text || '').match(/(?:الإصدار|version)\s*[:\-]?\s*v?(\d+(?:\.\d+){1,3})/i)); return m ? m[1].replace(/_/g, '.') : ''; };
  const readHtml = (file) => new Promise((res, rej) => { if (!file) return rej(new Error('اختر ملف البرنامج.')); if (!/\.html?$/i.test(file.name)) return rej(new Error('الملف يجب أن يكون بصيغة HTML.'));
    if (file.size > 25 * 1048576) return rej(new Error('حجم الملف أكبر من 25 م.ب.')); const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('تعذرت قراءة الملف.')); r.readAsText(file, 'utf-8'); });
  async function pushVersion(appId, file, text, ver, notes) {
    const vid = crypto.randomUUID ? crypto.randomUUID() : uid('v');
    const path = appId + '/' + vid + '.html';
    await D.uploadApp(path, new Blob([text], { type: 'text/html' }));
    await D.insert('org_app_versions', { id: vid, app_id: appId, version: ver || detectVer(file.name, text) || '', path, size: file.size, notes: notes || '' });
    await D.update('org_apps', { current_version: vid }, { eq: { id: appId } });
  }
  C.appNew = (unitId) => {
    const units = S.units.filter((u) => cap(u.id, 'manage') && u.status !== 'archived');
    modal('إضافة برنامج', `<div class="formgrid"><label class="f">اسم البرنامج<input id="apN" maxlength="120"></label>
      <label class="f">الجهة<select id="apU">${units.map((u) => opt(u.id, u.name, unitId)).join('')}</select></label>
      <label class="f full">الوصف<input id="apD" maxlength="300"></label>
      <label class="f">نوع البرنامج<select id="apK" onchange="document.getElementById('apHtml').classList.toggle('hidden',this.value!=='html');document.getElementById('apT').parentElement.classList.toggle('hidden',this.value==='html')">${Object.keys(AK).map((k) => opt(k, AK[k], 'html')).join('')}</select></label>
      <label class="f hidden">الرابط<input id="apT" dir="ltr" placeholder="https://…"></label>
      <div id="apHtml" class="full formgrid" style="grid-column:1/-1"><label class="f">ملف البرنامج (HTML)<input type="file" id="apF" accept=".html,.htm"></label>
        <label class="f">رقم الإصدار<input id="apV" placeholder="يُستخرج من اسم الملف إن وُجد"></label><label class="f full">ملاحظات الإصدار<input id="apNo"></label></div></div>
      <p class="small muted">أنشئ برنامجًا لكل جهة تستخدمه؛ لكل جهة بياناتها المستقلة في البرنامج.</p><div class="err"></div>`,
      `<button class="btn pri" id="apOk">إضافة</button><button class="btn" onclick="C.close()">إلغاء</button>`, true);
    $('#apOk').onclick = (ev) => busy(ev.target, async () => {
      const k = val('apK'), name = val('apN'); if (!name) throw new Error('اسم البرنامج مطلوب.'); if (!val('apU')) throw new Error('اختر الجهة.');
      let text = null, file = null; if (k === 'html') { file = $('#apF').files[0]; text = await readHtml(file); } else if (!val('apT')) throw new Error('اكتب الرابط.');
      if (k === 'link' && !/^https:\/\//i.test(val('apT'))) throw new Error('الرابط يبدأ بـ https://');
      const id = 'a-' + uid().slice(0, 12);
      await D.insert('org_apps', { id, unit_id: val('apU'), name, description: val('apD'), kind: k, target: k === 'html' ? '' : val('apT'), icon: 'app', sort: 100, active: true });
      if (k === 'html') await pushVersion(id, file, text, val('apV'), val('apNo'));
      S.apps = await D.select('org_apps'); C.close(); refresh(); toast('أُضيف البرنامج.');
    });
  };
  C.appUpload = (id) => {
    const a = S.apps.find((x) => x.id === id); const v = VERS[a.current_version];
    modal('رفع تحديث: ' + a.name, `<div class="formgrid"><label class="f full">ملف الإصدار الجديد (HTML)<input type="file" id="upF" accept=".html,.htm" onchange="C.upPick(this)"></label>
      <label class="f">رقم الإصدار<input id="upV"></label><label class="f">الإصدار الحالي<input value="${attr(v ? v.version : '—')}" disabled></label>
      <label class="f full">ما الجديد في هذا الإصدار<input id="upN"></label></div><p class="small muted">الإصدار السابق يبقى محفوظًا، ويمكن الرجوع إليه من «الإصدارات». بيانات البرنامج لا تتأثر.</p><div class="err"></div>`,
      `<button class="btn pri" id="upOk">رفع واعتماد</button><button class="btn" onclick="C.close()">إلغاء</button>`);
    $('#upOk').onclick = (ev) => busy(ev.target, async () => { const f = $('#upF').files[0]; const text = await readHtml(f); await pushVersion(id, f, text, val('upV'), val('upN'));
      S.apps = await D.select('org_apps'); await loadVers(); C.close(); refresh(); toast('رُفع الإصدار الجديد واعتُمد.'); });
  };
  C.upPick = (inp) => { const f = inp.files[0]; if (f && !val('upV')) $('#upV').value = detectVer(f.name, ''); };
  C.appVers = async (id) => {
    const a = S.apps.find((x) => x.id === id); const vs = (await loadVers()).filter((v) => v.app_id === id).sort((x, y) => String(y.uploaded_at).localeCompare(String(x.uploaded_at)));
    modal('إصدارات ' + a.name, vs.length ? `<div class="tw"><table><tr><th>الإصدار</th><th>رُفع</th><th>الحجم</th><th>ملاحظات</th><th></th></tr>${vs.map((v) => `<tr><td>${esc(v.version || '—')} ${v.id === a.current_version ? chip('الحالي', 'ok') : ''}</td><td class="small">${fmtDT(v.uploaded_at)}<br>${esc(pName(v.uploaded_by))}</td><td class="num">${(v.size / 1024).toFixed(0)} ك.ب</td><td class="small">${esc(v.notes)}</td>
      <td class="row">${v.id !== a.current_version ? `<button class="btn sm" onclick="C.appUse('${id}','${v.id}')">اعتماده</button>` : ''}<button class="btn sm" onclick="C.appDl('${id}','${v.id}')">تنزيل</button></td></tr>`).join('')}</table></div>` : '<div class="empty">لا توجد إصدارات.</div>', null, true);
  };
  C.appUse = (id, vid) => busy(null, async () => { await D.update('org_apps', { current_version: vid }, { eq: { id } }); S.apps = await D.select('org_apps'); C.close(); refresh(); toast('اعتُمد الإصدار المختار.'); });
  C.appDl = (id, vid) => busy(null, async () => { const a = S.apps.find((x) => x.id === id); const v = VERS[vid || a.current_version]; const b = await D.downloadApp(v.path);
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

  /* ---- تشغيل البرنامج: ذاكرة المتصفح تتحول إلى قاعدة البيانات ---- */
  const shimFor = (data) => `<script>(function(){var D=${JSON.stringify(data).replace(/</g, '\\u003c')};var P=window.parent.__CAPP;var m=new Map(Object.keys(D).map(function(k){return [k,D[k]]}));
var api={getItem:function(k){k=String(k);return m.has(k)?m.get(k):null},setItem:function(k,v){k=String(k);v=String(v);m.set(k,v);P.put(k,v)},removeItem:function(k){k=String(k);if(m.has(k)){m.delete(k);P.del(k)}},clear:function(){m.forEach(function(_,k){P.del(k)});m.clear()},key:function(i){return Array.from(m.keys())[i]||null}};
Object.defineProperty(api,'length',{get:function(){return m.size}});
var px=new Proxy(api,{get:function(t,p){if(p in t)return t[p];return (typeof p==='string'&&m.has(p))?m.get(p):undefined},set:function(t,p,v){t.setItem(p,v);return true},deleteProperty:function(t,p){t.removeItem(p);return true},ownKeys:function(){return Array.from(m.keys())},getOwnPropertyDescriptor:function(t,p){return m.has(p)?{value:m.get(p),enumerable:true,configurable:true,writable:true}:undefined},has:function(t,p){return (p in t)||m.has(p)}});
try{Object.defineProperty(window,'localStorage',{value:px,configurable:true})}catch(e){console.warn(e)}
window.storage={get:function(k){return Promise.resolve(m.has(k)?{key:k,value:m.get(k),shared:false}:null)},set:function(k,v){api.setItem(k,v);return Promise.resolve({key:k,value:String(v),shared:false})},delete:function(k){api.removeItem(k);return Promise.resolve({key:k,deleted:true,shared:false})},list:function(p){return Promise.resolve({keys:Array.from(m.keys()).filter(function(k){return !p||k.indexOf(p)===0}),prefix:p,shared:false})}};
})();<\/script>`;
  const injectShim = (html, data) => { const s = shimFor(data);
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
    const t = curTerm(); S.sched = null; if (!t) return;
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
    inquiries: async (term) => { const R = appCtx(); return D.rpc('course_inquiries', { p_app: R.app, p_term: term || null }); }
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
    window.__CAPP = makeRuntime(a.id, ro); window.__CAPP.ctx = VIEW.ctx || null;
    VIEW.after = () => { $('#appFrame').srcdoc = injectShim(html, data); setSync(ro ? 'ro' : 'ok'); };
    const m = appLv(a) === 'manage'; await loadTpl(); const tl = TPLS.filter((t) => t.app_id === a.id && t.active);
    return `<div id="apphost"><div class="bar"><button class="btn sm" onclick="C.go('unit',{id:'${a.unit_id}',tab:'apps'})">${icon('back')}${esc(uName(a.unit_id))}</button>
      <b>${esc(a.name)}</b><span class="small muted">الإصدار ${esc(v.version || '—')}</span><span id="appSync" class="small muted"></span><span class="grow"></span>
      <button class="btn sm" onclick="C.refresh()">إعادة تحميل</button><button class="btn sm" onclick="document.getElementById('apphost').classList.toggle('full')">ملء الشاشة</button>
      ${tl.length ? `<button class="btn sm pri" onclick="C.appForms('${a.id}')">${icon('form')}النماذج (${tl.length})</button>` : ''}<button class="btn sm" onclick="C.appDl('${a.id}')">تنزيل النسخة</button>${m ? `<button class="btn sm" onclick="C.appUpload('${a.id}')">رفع تحديث</button>` : ''}</div>
      <iframe id="appFrame" title="${attr(a.name)}" allow="clipboard-read; clipboard-write; fullscreen"></iframe></div>`;
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
  C.userMenu = () => modal(S.me.name, `<dl class="kv"><dt>الحساب</dt><dd>${esc(S.me.app_id)}</dd><dt>الدور</dt><dd>${isAdmin() ? 'مدير النظام' : esc(S.me.college_role || 'مستخدم')}</dd>
    <dt>السجل في القاعدة</dt><dd>${myFac() ? esc(fName(myFac())) : 'غير مرتبط'}</dd></dl>`,
    `${myFac() ? `<button class="btn" onclick="C.close();C.facView('${myFac()}')">${icon('user')}بطاقتي</button>` : ''}${!DEMO ? '<button class="btn" onclick="C.changePass()">تغيير كلمة المرور</button>' : ''}<button class="btn danger" onclick="C.close();C.logout()">${icon('logout')}خروج</button><button class="btn" onclick="C.close()">إغلاق</button>`);
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
  const BK = [['org_roles', 'key'], ['org_settings', 'id'], ['profiles', 'id'], ['org_units', 'id'], ['faculty', 'id'], ['faculty_private', 'faculty_id'], ['faculty_aliases', 'alias'], ['programs', 'id'], ['org_members', 'id'], ['org_grants', 'id'],
    ['org_exclusions', 'grant_id,unit_id'], ['org_changes', 'id'], ['terms', 'id'], ['courses', 'id'], ['sched_versions', 'id'], ['offerings', 'id'], ['sections', 'id'], ['teaching', 'id'],
    ['course_coords', 'term_id,course_id'],
    ['org_requests', 'id'], ['org_announcements', 'id'], ['org_apps', 'id'], ['org_app_versions', 'id'], ['org_app_data', 'app_id,key'], ['org_app_fac', 'app_id,faculty_id'],
    ['org_app_access', 'app_id,profile_app_id'], ['org_app_duties', 'id'], ['course_status', 'id'], ['org_templates', 'id'], ['org_report_log', 'id'], ['notifs', 'id'], ['audit_log', 'id']];
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
      else { $('#dockExtra').innerHTML = ''; try { $('#chatFrame').srcdoc = await chatHtml(c); } catch (e) { $('#dockBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; } }
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
        <div class="panel"><h2>${icon('key')} الأدوار العامة وصفة الحساب</h2>${p ? `<div class="checks" style="flex-direction:column;align-items:flex-start">${globalRoles.map((r) => `<label><input type="checkbox" class="pmR" value="${r.key}" ${gr.some((g) => g.role_key === r.key) ? 'checked' : ''}> ${esc(r.name)} <span class="tiny muted">(${Object.keys(r.caps || {}).filter((k) => r.caps[k]).map((k) => CAPS[k] || k).join('، ')})</span></label>`).join('')}</div>
          <div class="formgrid" style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">صفة الحساب<select id="pmC">${opt('', '—', p.college_role || '')}${opt('dean', 'عميد الكلية', p.college_role)}${opt('vice', 'وكيل الكلية', p.college_role)}</select></label>
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
      const cr = val('pmC'), ad = $('#pmAd') && !$('#pmAd').disabled ? val('pmAd') === '1' : p.is_admin;
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
  const viewRole = () => isAdmin() || (S.me && S.me.college_role === 'dean') ? 'dean' : (S.me && S.me.college_role === 'vice') ? 'vice'
    : myDirect().some((m) => m.position === 'head') ? 'head' : 'staff';
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
        <div class="gsvc">${hasChat ? `<button onclick="C.dock('chat')">${icon('chat')}<b>${esc(c.chatName || 'المرشد الأكاديمي')}</b><span>إجابات عن الخطط والتسجيل والأنظمة</span></button>` : ''}
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
    return `<div class="homebody">${banner}${mineHtml(reqs)}
      <div class="hstrip">${tile('depts', 'sitemap', n('department'), full ? 'الأقسام العلمية' : 'أقسامي')}${tile('units', 'cubes', n('unit'), full ? 'الوحدات' : 'وحداتي')}
        ${tile('committees', 'users', n('committee'), full ? 'اللجان' : 'لجاني')}${vices ? tile('vices', 'bank', vices, 'الوكالات') : ''}
        ${tile('courses', 'book', courses.length, 'المقررات')}${tile('faculty', 'user', S.faculty.filter((f) => f.status === 'نشط').length, 'أعضاء هيئة التدريس')}</div>
      <div class="home2">${annBox}<div class="box"><h2>${icon('bolt')}الوصول السريع</h2><div class="quick">
        ${q("C.go('tasks')", 'clipboard', 'المهام والتكليفات')}${q("C.go('college')", 'college', st.collegeShort || 'كلية الأعمال')}${q("C.go('courses',{tab:'current'})", 'calendar', 'جدول الدراسة')}
        ${q("C.go('files')", 'folder', 'الملفات والمرفقات')}${q(gcap('reports') ? "C.go('reports')" : "C.toast('التقارير تحتاج صلاحية «التقارير».',true)", 'chart', 'التقارير')}${q('C.guide()', 'guide', 'دليل المستخدم')}</div></div></div></div>`;
  }

  /* «جهاتي وصلاحياتي»: ما يخص المستخدم وحده */
  function mineHtml(reqs) {
    const mf = myFac(), me = S.me, direct = myDirect();
    const open = {}, mineOpen = reqs.filter((r) => mf && r.assignee_faculty === mf && !['done', 'rejected'].includes(r.status)).length;
    reqs.forEach((r) => { if (!['done', 'rejected'].includes(r.status)) open[r.unit_id] = (open[r.unit_id] || 0) + 1; });
    const pend = (u) => TPLS.filter((t) => t.required && t.active && tplTargets(t).some((x) => x.id === u) && !RLOG.some((r) => r.template_id === t.id && r.unit_id === u)).length;
    const appsOf = (u) => S.apps.filter((a) => a.unit_id === u && a.active && appLv(a) !== 'none').length;
    const roles = [];
    if (isAdmin()) roles.push(chip('مدير النظام', 'brass'));
    if (me.college_role === 'dean') roles.push(chip('عميد الكلية', 'brass')); if (me.college_role === 'vice') roles.push(chip('وكيل الكلية', 'brass'));
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
