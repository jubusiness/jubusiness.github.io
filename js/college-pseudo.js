/* محرك الترميز المؤقت وإرجاعه (تعميم مكتب إدارة البيانات 1448/05/23هـ)
   يعمل على النسخة الشاملة للموقع (format: jouf-college-backup) وعلى المفتاح المحلي.
   لا يحفظ ولا يرسل شيئًا؛ يُرجع نسخة مرمَّزة و«سجل إرجاع» فيه القيم الأصلية لكل خلية غُيّرت.
   الإرجاع: الخلية التي لم تتغير منذ الترميز تعود كما كانت حرفيًا من السجل، وما تغيّر أو أُضيف بعده يُرجَع بالمفتاح (الرمز ← الاسم). */
(function (G) {
  'use strict';
  const AR = '\\u0600-\\u06FF';
  const MOB = /(?<![0-9])(?:\+?966|00966)?0?5[0-9]{8}(?![0-9])/g;
  const RES = /https?:\/\/[^\s"'<>]*(?:scopus\.com\/authid|orcid\.org\/[0-9]|scholar\.google\.[a-z.]+\/citations|webofscience|researcherid|publons)[^\s"'<>]*/gi;
  const TITLE = /^\s*(?:أ\.\s*د\.|أ\.د\.|د\.|أ\.|م\.)\s*/;
  const LINK_COLS = ['scopus', 'orcid', 'wos', 'scholar'];
  const MOB_KEYS = /^(mobile|phone|jawal|tel|mob|whatsapp)$/i;
  /* جداول لا تُرمَّز: حسابات الإرشاد التجريبية بأسماء وهمية (يتعطل دخول الطلاب التجريبيين لو تغيّرت أرقامهم) */
  const SKIP_T = new Set(['advising_assignments', 'student_accounts', 'advising_threads', 'office_hours', 'bookings', 'advising_stats']);

  const norm = (s) => String(s == null ? '' : s).replace(TITLE, '').replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* نمط يتسامح في الهمزات والتاء المربوطة والياء والمسافات */
  function namePat(s) {
    return s.split(' ').map((w) => esc(w).replace(/[اأإآ]/g, '[اأإآ]').replace(/[ةه]/g, '[ةه]').replace(/[يى]/g, '[يى]').replace(/^(عبد|ابو|أبو)/, '$1\\s*')).join('\\s+');
  }
  /* الاسم الأول ثم الأخير وبينهما حتى أربع كلمات عربية (صيغ النظام الأكاديمي الطويلة: «بن»، الاسم الرباعي…) */
  const flexPat = (first, last) => namePat(first) + '(?:\\s+[' + AR + ']+){0,4}?\\s+' + namePat(last);
  /* صيغة موحّدة للمقارنة: الهمزات والتاء والياء والمسافات، و«عبد/أبو» ملتصقة */
  const KEYN = (s) => norm(s).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/(^| )(عبد|ابو) /g, '$1$2');
  const pk = (row, keys) => keys.map((k) => String(row[k])).join('|');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);

  /* المفتاح من أوراق Excel (صفوف كائنات بعناوين الأعمدة) */
  function buildKey(sheets) {
    const H = (r, k) => (r[k] == null ? '' : String(r[k]).trim());
    const fac = (sheets['الأعضاء'] || []).map((r) => ({
      code: H(r, 'الرمز'), emp: H(r, 'الرقم الوظيفي المرمَّز'), id: H(r, 'معرّف السجل في القاعدة'),
      name_ar: H(r, 'الاسم العربي'), name_en: H(r, 'الاسم الإنجليزي'), emp_real: H(r, 'الرقم الوظيفي الحقيقي'),
      mobile: H(r, 'الجوال'), profile: H(r, 'معرّف الحساب'),
      aliases: H(r, 'الأسماء البديلة').split('|').map((x) => x.trim()).filter(Boolean)
    })).filter((f) => f.code && f.id);
    const stu = (sheets['الطلاب'] || []).map((r) => ({ code: H(r, 'الرمز'), src: H(r, 'المصدر'), id: H(r, 'معرّف السجل'), name: H(r, 'الاسم'), univ: H(r, 'الرقم الجامعي'), pid: H(r, 'المعرّف في البرنامج'), email: H(r, 'البريد'), test: H(r, 'تجريبي') === 'نعم' })).filter((s) => s.code);
    const res = (sheets['البحث'] || []).map((r) => ({ code: H(r, 'الرمز'), id: H(r, 'معرّف السجل'), name: H(r, 'الاسم في ملف البحث'), fac: H(r, 'رمز العضو المرتبط') }));
    /* أشخاص من خارج السجل (محاضرون في الجداول والاختبارات)؛ «هو العضو» يربط الصيغة المختلفة برمز العضو */
    const oth = (sheets['آخرون'] || []).map((r) => ({ code: H(r, 'هو العضو (رمز F)') || H(r, 'الرمز'), own: H(r, 'الرمز'), name: H(r, 'الاسم') })).filter((o) => o.code && o.name);
    return { fac, stu, res, oth, owner: fac.find((f) => f.code === 'F0001') };
  }

  /* قائمة الاستبدال: [نمط، الرمز] من الأطول إلى الأقصر؛ والصيغ المختصرة فقط إن كانت لشخص واحد */
  function buildSubs(key) {
    const cand = [];
    const add = (txt, code, short) => { txt = norm(txt); if (txt.split(' ').length >= 2 && txt.length >= 6) cand.push({ txt, code, short }); };
    const variants = (name, code) => {
      const w = norm(name).split(' ').filter(Boolean); if (w.length < 2) return;
      add(w.join(' '), code, false);
      if (w.length >= 3) { add(w[0] + ' ' + w[w.length - 1], code, true); for (let i = 1; i < w.length - 1; i++) add(w[0] + ' ' + w[i] + ' ' + w[w.length - 1], code, true); }
      if (w.length >= 4) add(w.slice(0, 3).join(' '), code, true);
    };
    for (const f of key.fac) { variants(f.name_ar, f.code); if (f.name_en) add(f.name_en, f.code, false); f.aliases.forEach((a) => variants(a, f.code)); }
    for (const r of key.res) if (r.name) variants(r.name, r.fac || r.code);
    for (const s of key.stu) if (!s.test) variants(s.name, s.code);
    for (const o of key.oth || []) variants(o.name, o.code);
    /* الصيغة المختصرة تُترك إن دلّت على أكثر من شخص */
    const owners = new Map(); for (const c of cand) { const k = c.txt; if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(c.code); }
    /* نمط واحد يجمع كل الصيغ (الأطول أولًا ثم المرنة)، والرمز يُعرف من الصيغة الموحّدة للنص المطابق */
    const fixed = new Map(); const alts = [];
    for (const c of cand.sort((a, b) => b.txt.length - a.txt.length)) {
      if (owners.get(c.txt).size > 1) continue; const k = KEYN(c.txt); if (fixed.has(k)) continue;
      fixed.set(k, c.code); alts.push(namePat(c.txt));
    }
    /* الصيغة المرنة (الأول … الأخير) بعد الصيغ الثابتة، ولشخص واحد فقط */
    const pairs = new Map();
    const pair = (name, code) => { const w = norm(name).split(' ').filter(Boolean); if (w.length < 2) return; const k = w[0] + ' ' + w[w.length - 1]; if (!pairs.has(k)) pairs.set(k, new Set()); pairs.get(k).add(code); };
    for (const f of key.fac) { pair(f.name_ar, f.code); f.aliases.forEach((a) => pair(a, f.code)); }
    for (const s of key.stu) if (!s.test) pair(s.name, s.code);
    for (const o of key.oth || []) pair(o.name, o.code);
    const pmap = new Map();
    for (const [k, set] of pairs) { if (set.size !== 1) continue; const [a, b] = k.split(' '); pmap.set(KEYN(a) + ' ' + KEYN(b), [...set][0]); alts.push(flexPat(a, b)); }
    const re = new RegExp('(?<![' + AR + '])(?:' + alts.join('|') + ')(?![' + AR + '])', 'g');
    return { re, fixed, pmap, size: alts.length };
  }
  function subCode(m, S) {
    const k = KEYN(m); if (S.fixed.has(k)) return S.fixed.get(k);
    const w = k.split(' '); return S.pmap.get(w[0] + ' ' + w[w.length - 1]) || m;
  }

  function maps(key) {
    const byId = new Map(key.fac.map((f) => [f.id, f]));
    const emp = new Map(key.fac.filter((f) => f.emp_real).map((f) => [f.emp_real, f.emp]));
    const univ = new Map(key.stu.filter((s) => !s.test && s.univ).map((s) => [s.univ, s.code]));
    const stuById = new Map(key.stu.filter((s) => s.src === 'قائمة العميد').map((s) => [String(s.id), s]));
    const resById = new Map(key.res.map((r) => [String(r.id), r]));
    const progStu = new Map(key.stu.filter((s) => s.pid).map((s) => [s.src + '|' + s.pid, s]));
    return { byId, emp, univ, stuById, resById, progStu };
  }

  /* تحويل نص */
  const HAS_AR = new RegExp('[' + AR + ']');
  function codeText(s, subs) {
    let x = s;
    if (HAS_AR.test(x)) { subs.re.lastIndex = 0; x = x.replace(subs.re, (m) => subCode(m, subs)); }
    return x.replace(MOB, '').replace(RES, '');
  }
  /* تحويل عميق لقيم JSON مع قواعد بحسب اسم المفتاح */
  function codeDeep(v, subs, M, k) {
    if (v == null) return v;
    if (typeof v === 'string') {
      if (k && MOB_KEYS.test(k)) return '';
      if (k && LINK_COLS.includes(k)) return '';
      if (k === 'employee_no' && M.emp.has(v)) return M.emp.get(v);
      if (k === 'university_no' && M.univ.has(v)) return M.univ.get(v);
      return codeText(v, subs);
    }
    if (Array.isArray(v)) return v.map((x) => codeDeep(x, subs, M));
    if (typeof v === 'object') { const o = {}; for (const kk of Object.keys(v)) o[kk] = codeDeep(v[kk], subs, M, kk); return o; }
    return v;
  }

  /* طلاب داخل بيانات البرامج: التدريب الميداني والجاهزية */
  const PROG_STU = {
    'tms-data': { src: 'التدريب', ids: ['id'], drop: [] },
    'academia:data': { src: 'الجاهزية', ids: ['id', 'uid'], drop: ['email'] }
  };
  function codeProgStudents(v, P, subs, M) {
    let obj; try { obj = JSON.parse(v); } catch (e) { return codeText(v, subs); }
    const ren = new Map();
    for (const s of (obj && obj.students) || []) {
      const k = M.progStu.get(P.src + '|' + String(s[P.ids[0]])); if (!k) continue;
      for (const f of P.ids) if (s[f] != null && s[f] !== '') { if (typeof s[f] === 'string' && s[f].length >= 4) ren.set(s[f], k.code); s[f] = typeof s[f] === 'string' ? k.code : s[f]; }
      s.name = k.code; for (const f of P.drop) if (f in s) s[f] = '';
    }
    let str = JSON.stringify(obj);
    for (const [a, b] of ren) str = str.split(JSON.stringify(a)).join(JSON.stringify(b));   // كل إشارة للمعرّف داخل البرنامج
    return codeText(str, subs);
  }

  /* أشخاص في حقول المحاضر لم يطابقهم المفتاح بعد الترميز */
  function findOthers(coded) {
    const seen = new Map(); const KF = /^(instructor|inst|lecturer)$/;
    const walk = (v, k, src) => {
      if (typeof v === 'string') { if (KF.test(k || '')) for (const sg of v.split(/[\/،,&+\n]| - /)) { const t = norm(sg.replace(/[FSO]\d{4,5}/g, '').replace(/^\s*(د|أ|م)\s*[.\/]\s*/, '')); if (t.split(' ').filter((w) => new RegExp('[' + AR + ']{2,}').test(w)).length >= 2) { const o = seen.get(t) || { name: t, src: new Set(), n: 0 }; o.src.add(src); o.n++; seen.set(t, o); } } }
      else if (Array.isArray(v)) v.forEach((x) => walk(x, k, src)); else if (v && typeof v === 'object') for (const kk of Object.keys(v)) walk(v[kk], kk, src);
    };
    for (const r of coded.tables.org_app_data || []) { if (!/^(sch\.base|ex\.)/.test(r.key)) continue; try { walk(JSON.parse(r.value), '', r.key.startsWith('sch') ? 'الجداول' : 'الاختبارات'); } catch (e) {} }
    return [...seen.values()].sort((a, b) => b.n - a.n);
  }
  /* طلاب البرامج من النسخة الأصلية */
  function progStudents(backup) {
    const out = [];
    for (const [key, P] of Object.entries(PROG_STU)) {
      const r = (backup.tables.org_app_data || []).find((x) => x.key === key); if (!r) continue;
      let obj; try { obj = JSON.parse(r.value); } catch (e) { continue; }
      for (const s of obj.students || []) out.push({ src: P.src, pid: String(s[P.ids[0]]), name: s.name || '', univ: P.ids.map((f) => s[f]).filter((x) => x != null && x !== '').join(' / '), email: s.email || '', program: s.program || '', idType: typeof s[P.ids[0]] });
    }
    return out;
  }

  /* قيمة الخلية المرمَّزة */
  function codeCell(t, row, col, v, subs, M, key) {
    if (t === 'faculty') {
      const f = M.byId.get(row.id);
      if (f) { if (col === 'name_ar') return f.code; if (col === 'name_en') return v ? f.code : v; if (col === 'employee_no') return v ? f.emp : v; if (col === 'email') return v; }
    }
    if (t === 'faculty_private' && col === 'mobile') return '';
    if (t === 'faculty_extra' && LINK_COLS.includes(col)) return v ? '' : v;
    if (t === 'research_output' && col === 'name') { const r = M.resById.get(String(row.id)); if (r) return r.fac || r.code; }
    if (t === 'honor_list') { const s = M.stuById.get(String(row.id)); if (s) { if (col === 'student_name') return s.code; if (col === 'university_no') return v ? s.code : v; } }
    if (t === 'org_app_data' && col === 'value' && PROG_STU[row.key] && typeof v === 'string') return codeProgStudents(v, PROG_STU[row.key], subs, M);
    if (typeof v === 'string' && (t === 'org_app_data' || t === 'sched_versions')) return codeText(v, subs);
    if (typeof v === 'string' && (col === 'email' || col === 'username')) return v;
    return codeDeep(v, subs, M, col);
  }

  function encode(backup, key, pks) {
    const subs = buildSubs(key); const M = maps(key);
    const ownerProfile = key.owner && key.owner.profile;
    const coded = clone(backup); const log = []; const del = [];
    const n = { cells: 0, rows: 0, tables: {} };
    for (const t of Object.keys(coded.tables)) {
      if (SKIP_T.has(t)) continue;
      const keys = (pks[t] || 'id').split(',');
      const rows = coded.tables[t];
      if (t === 'faculty_aliases') { for (const r of rows) del.push({ t, pk: pk(r, keys), row: clone(r) }); coded.tables[t] = []; n.tables[t] = rows.length; continue; }
      for (const row of rows) {
        if (t === 'profiles' && ownerProfile && row.app_id === ownerProfile) continue;   // حساب المالك يبقى كما هو
        let changed = false; const p = pk(row, keys);
        for (const col of Object.keys(row)) {
          if (keys.includes(col)) continue;
          const v = row[col]; const c = codeCell(t, row, col, v, subs, M, key);
          if (!same(v, c)) { log.push({ t, pk: p, col, orig: v, coded: c }); row[col] = c; n.cells++; changed = true; }
        }
        if (changed) { n.rows++; n.tables[t] = (n.tables[t] || 0) + 1; }
      }
    }
    coded.pseudo = { at: new Date().toISOString(), from: backup.at, note: 'نسخة مرمَّزة؛ القيم الأصلية في سجل الإرجاع المحلي فقط' };
    return { coded, log: { format: 'jouf-pseudo-log', v: 1, at: coded.pseudo.at, cells: log, deleted: del }, n };
  }

  /* الإرجاع العكسي بالمفتاح لما أُضيف أو تغيّر بعد الترميز */
  function revSubs(key) {
    const m = new Map(); key.fac.forEach((f) => m.set(f.code, norm(f.name_ar))); key.stu.forEach((s) => { if (!s.test) m.set(s.code, s.name); }); key.res.forEach((r) => { if (r.code) m.set(r.code, r.name); }); (key.oth || []).forEach((o) => { if (o.own && o.code === o.own) m.set(o.own, o.name); });
    return m;
  }
  function decodeText(s, R) { return s.replace(/\b([FSRO])(\d{3,5})\b/g, (all) => (R.has(all) ? R.get(all) : all)); }
  function decodeDeep(v, R) {
    if (typeof v === 'string') return decodeText(v, R);
    if (Array.isArray(v)) return v.map((x) => decodeDeep(x, R));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = decodeDeep(v[k], R); return o; }
    return v;
  }
  function decode(current, key, log, pks) {
    const R = revSubs(key); const out = clone(current);
    const idx = new Map(log.cells.map((c) => [c.t + '\u0001' + c.pk + '\u0001' + c.col, c]));
    const n = { exact: 0, changedSince: 0, newData: 0, rowsBack: 0, conflicts: [] };
    for (const t of Object.keys(out.tables)) {
      if (SKIP_T.has(t)) continue;
      const keys = (pks[t] || 'id').split(',');
      for (const row of out.tables[t]) {
        const p = pk(row, keys);
        for (const col of Object.keys(row)) {
          if (keys.includes(col)) continue;
          const e = idx.get(t + '\u0001' + p + '\u0001' + col);
          if (e) {
            if (same(row[col], e.coded)) { row[col] = e.orig; n.exact++; }
            else if (isObj(row[col]) && isObj(e.coded) && isObj(e.orig)) {
              /* كائن JSON تغيّر جزء منه بعد الترميز (مثل حالة الترميز في الإعدادات): كل مفتاح لم يتغير يعود حرفيًا، والمتغير بالمفتاح */
              const cur = row[col]; const o = {}; let fuzzy = false;
              for (const k of Object.keys(cur)) { if (k in e.coded && same(cur[k], e.coded[k])) o[k] = k in e.orig ? e.orig[k] : cur[k]; else { o[k] = decodeDeep(cur[k], R); if (k in e.coded) fuzzy = true; } }
              for (const k of Object.keys(e.orig)) if (!(k in cur) && !(k in e.coded)) o[k] = e.orig[k];
              row[col] = o; if (fuzzy) { n.changedSince++; n.conflicts.push(t + ' / ' + col); } else n.exact++;
            } else { row[col] = decodeDeep(row[col], R); n.changedSince++; n.conflicts.push(t + ' / ' + col); }
          }
          else { const d = decodeDeep(row[col], R); if (!same(d, row[col])) { row[col] = d; n.newData++; } }
        }
      }
    }
    for (const d of log.deleted) { const rows = out.tables[d.t] || (out.tables[d.t] = []); const keys = (pks[d.t] || 'id').split(','); if (!rows.some((r) => pk(r, keys) === d.pk)) { rows.push(clone(d.row)); n.rowsBack++; } }
    delete out.pseudo;
    return { restored: out, n };
  }

  /* فحص المتبقي: أعداد فقط لكل جدول وعمود */
  function scan(backup, key, common) {
    const fam = new Map();
    for (const f of key.fac) { const w = norm(f.name_ar).split(' '); const l = w[w.length - 1]; if (l && l.length >= 4) fam.set(l, (fam.get(l) || 0) + 1); }
    /* كلمة العائلة التي ترد في نصوص المخرجات والمؤشرات (لا أسماء فيها) كلمة عامة لا اسم، فلا تُعد */
    const vocab = [];
    for (const t of ['course_clos', 'kpis', 'data_elements']) for (const r of ((common || backup).tables[t] || [])) vocab.push(JSON.stringify(r));
    const vtext = vocab.join(' ');
    let commonN = 0;
    const famRe = [...fam.keys()].filter((l) => fam.get(l) === 1 && !/^(محمد|احمد|أحمد|عبدالله|الله)$/.test(l)).map((l) => new RegExp('(?<![' + AR + '])' + namePat(l) + '(?![' + AR + '])', 'g'))
      .filter((re) => { re.lastIndex = 0; if (re.test(vtext)) { commonN++; return false; } return true; });
    const one = (arr) => [arr.length ? new RegExp(arr.map((re) => re.source).join('|'), 'g') : /(?!)/g];
    famRe.splice(0, famRe.length, ...one(famRe));
    const stuRe = one(key.stu.filter((s) => !s.test && s.name && norm(s.name).split(' ').length >= 2).map((s) => new RegExp('(?<![' + AR + '])' + namePat(norm(s.name).split(' ')[0]) + '\\s+' + namePat(norm(s.name).split(' ').slice(-1)[0]) + '(?![' + AR + '])', 'g')));
    const out = {};
    const bump = (t, col, k, c) => { if (!c) return; const o = out[t + ' / ' + col] || (out[t + ' / ' + col] = {}); o[k] = (o[k] || 0) + c; };
    const cnt = (re, s) => { re.lastIndex = 0; const m = s.match(re); return m ? m.length : 0; };
    for (const t of Object.keys(backup.tables)) {
      if (SKIP_T.has(t)) continue;
      for (const row of backup.tables[t]) for (const col of Object.keys(row)) {
        const v = row[col]; if (v == null) continue; const s = typeof v === 'string' ? v : JSON.stringify(v);
        if (/^(id|.*_id|at|created_at|updated_at)$/.test(col)) continue;
        const fN = famRe.reduce((a, re) => a + cnt(re, s), 0);
        bump(t, col, 'عائلة', fN);
        if (t === 'org_app_data' && fN) bump('org_app_data', row.app_id + ' :: ' + String(row.key).replace(/[^\x20-\x7E]/g, '?'), 'عائلة', fN);
        bump(t, col, 'طالب', stuRe.reduce((a, re) => a + cnt(re, s), 0));
        bump(t, col, 'جوال', cnt(MOB, s));
        bump(t, col, 'رابط', cnt(RES, s));
        bump(t, col, 'رقم10', cnt(/(?<![0-9])[12][0-9]{9}(?![0-9])/g, s));
        bump(t, col, 'بريد', cnt(/[A-Za-z0-9._%+-]+@ju\.edu\.sa/gi, s));
      }
    }
    out['(كلمات عائلة عامة لم تُعد)'] = { 'عائلة': commonN };
    return out;
  }

  /* المقارنة خلية خلية */
  function diff(a, b, pks) {
    const out = []; const ts = new Set([...Object.keys(a.tables), ...Object.keys(b.tables)]);
    for (const t of ts) {
      const keys = (pks[t] || 'id').split(','); const A = new Map((a.tables[t] || []).map((r) => [pk(r, keys), r])); const B = new Map((b.tables[t] || []).map((r) => [pk(r, keys), r]));
      if (A.size !== B.size) out.push(t + ': عدد الصفوف ' + A.size + ' ← ' + B.size);
      for (const [p, r] of A) { const s = B.get(p); if (!s) { out.push(t + ': صف مفقود'); continue; } for (const c of Object.keys(r)) if (!same(r[c], s[c])) out.push(t + ' / ' + c); }
    }
    return out;
  }

  /* أين بقيت كلمات العائلة: اسم الحقل (آخر مفتاح في JSON) وعدد القيم المختلفة، دون عرض أي قيمة */
  function where(coded, key, common) {
    const fam = new Map();
    for (const f of key.fac) { const w = norm(f.name_ar).split(' '); const l = w[w.length - 1]; if (l && l.length >= 4) fam.set(l, (fam.get(l) || 0) + 1); }
    const vtext = ['course_clos', 'kpis', 'data_elements'].flatMap((t) => (common.tables[t] || []).map((r) => JSON.stringify(r))).join(' ');
    const res = [...fam.keys()].filter((l) => fam.get(l) === 1).map((l) => new RegExp('(?<![' + AR + '])' + namePat(l) + '(?![' + AR + '])')).filter((re) => !re.test(vtext));
    const hit = (s) => res.some((re) => re.test(s));
    const out = {};
    const add = (src, k, s) => { const o = out[src + ' :: ' + k] || (out[src + ' :: ' + k] = { n: 0, vals: new Set(), coded: 0 }); o.n++; o.vals.add(s); if (/[FS]\d{4,5}/.test(s)) o.coded++; };
    const walk = (v, src, k) => {
      if (typeof v === 'string') { if (v.length < 400 && hit(v)) add(src, k || '(نص)', v); else if (v.length >= 400 && (v[0] === '{' || v[0] === '[')) { try { walk(JSON.parse(v), src, k); } catch (e) { if (hit(v)) add(src, (k || '') + '(نص طويل)', v); } } else if (v.length >= 400 && hit(v)) add(src, (k || '') + '(نص طويل)', v); }
      else if (Array.isArray(v)) v.forEach((x) => walk(x, src, k));
      else if (v && typeof v === 'object') for (const kk of Object.keys(v)) walk(v[kk], src, kk);
    };
    for (const t of Object.keys(coded.tables)) { if (SKIP_T.has(t)) continue; for (const r of coded.tables[t]) for (const c of Object.keys(r)) walk(r[c], t === 'org_app_data' ? 'app:' + String(r.key).replace(/[^\x20-\x7E]/g, '?').slice(0, 30) : t + '.' + c, c); }
    return Object.entries(out).map(([k, o]) => ({ k, n: o.n, distinct: o.vals.size, withCode: o.coded })).sort((a, b) => b.n - a.n);
  }

  G.PSEUDO = { findOthers, progStudents, where, buildKey, buildSubs, encode, decode, scan, diff, codeText, norm };
})(typeof window !== 'undefined' ? window : globalThis);
