/* Hookloom - اپلیکیشن موبایل (Capacitor) برای ورک‌فلو n8n */
(function () {
'use strict';

/* ---------- ابزارهای پایه ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
let nf, cf;
try { nf = new Intl.NumberFormat('fa-IR'); cf = new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 }); } catch (e) { nf = { format: String }; cf = nf; }
const fa = (n) => (n === '' || n == null || isNaN(Number(n))) ? esc(n || '') : nf.format(Number(n));
const fac = (n) => (n == null || isNaN(Number(n))) ? '-' : cf.format(Number(n));
const DEFAULT_URL = 'https://leonion.app.n8n.cloud';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('کپی شد ✓'); return; } catch (e) { /* fallback */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('کپی شد ✓'); } catch (e) { toast('کپی ناموفق بود'); }
  ta.remove();
}
function openUrl(u) {
  const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (B && B.open) B.open({ url: u }); else window.open(u, '_blank');
}
async function shareText(title, text) {
  try {
    const S = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    if (S && S.share) { await S.share({ title: title, text: text, dialogTitle: title }); return; }
    if (navigator.share) { await navigator.share({ title: title, text: text }); return; }
  } catch (e) { if (e && /cancel|abort/i.test(String(e.message || e))) return; }
  await copyText(text);
}

/* ---------- تنظیمات ---------- */
const getSettings = () => Object.assign({ baseUrl: DEFAULT_URL, key: '' }, LS.get('hl_settings', {}));
const saveSettings = (s) => LS.set('hl_settings', s);

/* ---------- API ---------- */
class ApiError extends Error { constructor(msg, status, body) { super(msg); this.status = status; this.body = body; } }

async function api(path, opts) {
  const s = getSettings();
  if (!s.key) throw new ApiError('NO_KEY');
  const url = s.baseUrl.replace(/\/+$/, '') + '/webhook/hookloom/' + path;
  const headers = { 'X-Call-Key': s.key, 'Accept': 'application/json' };
  if (opts && opts.body) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, Object.assign({}, opts || {}, { headers: headers, signal: ctrl.signal }));
    const txt = await r.text();
    if (!r.ok) throw new ApiError('HTTP ' + r.status, r.status, txt);
    if (!txt) return {};
    try { return JSON.parse(txt); } catch (e) { return {}; }
  } finally { clearTimeout(timer); }
}

function friendly(e) {
  if (!e) return 'خطای ناشناخته';
  if (e.message === 'NO_KEY') return 'ابتدا در «تنظیمات» کلید دسترسی (X-Call-Key) را وارد کنید.';
  if (e.status === 401 || e.status === 403) return 'کلید دسترسی اشتباه است (۴۰۳). کلید را در تنظیمات بررسی کنید.';
  if (e.status === 404) return 'ورک‌فلو در n8n فعال (Publish) نیست یا آدرس سرور اشتباه است (۴۰۴).';
  if (e.status === 400) return 'درخواست نامعتبر: ' + String(e.body || '').slice(0, 200);
  if (e.status >= 500) return 'خطای سرور n8n (' + e.status + '). کمی بعد دوباره تلاش کنید.';
  if (e.name === 'AbortError') return 'زمان پاسخ‌گویی سرور تمام شد.';
  return 'اتصال به سرور برقرار نشد. اینترنت و آدرس سرور را بررسی کنید.';
}

/* ---------- ذخیره پروژه‌ها ---------- */
const jobsList = () => LS.get('hl_jobs', []);
const saveJobs = (l) => LS.set('hl_jobs', l);
const getJob = (id) => jobsList().find((j) => j.id === id);
function upsertJob(patch) {
  const l = jobsList();
  const i = l.findIndex((j) => j.id === patch.id);
  if (i >= 0) l[i] = Object.assign({}, l[i], patch); else l.unshift(patch);
  saveJobs(l);
  return l.find((j) => j.id === patch.id);
}
const getRes = (id) => LS.get('hl_res_' + id, null) || {};

function joinCols(r, base, n) {
  let t = typeof r[base] === 'string' ? r[base] : '';
  for (let i = 2; i <= n; i++) { const v = r[base + '_' + i]; if (typeof v === 'string') t += v; }
  return t;
}
function parseRow(r) {
  const pj = (k, n) => {
    const v = joinCols(r, k, n || 1);
    if (!v) return { ok: true, val: null };
    try { return { ok: true, val: JSON.parse(v) }; } catch (e) { return { ok: false, val: null }; }
  };
  const sc = pj('scenario_json', 4);
  return {
    status: r.status, stage: r.stage, progress: Number(r.progress) || 0, message: r.message || '', error: r.error || '',
    brief: pj('brief_json').val, strategy: pj('hashtags_json').val, reels: pj('reels_json').val,
    patterns: pj('patterns_json', 3).val, scenario: sc.val, scenarioBroken: !sc.ok,
    scenarioMd: joinCols(r, 'scenario_markdown', 3), council: pj('council_json', 2).val
  };
}

/* ---------- دریافت نتیجه (بدون پولینگ) ----------
   وقتی کار تمام شود (یا خطا بدهد) ورک‌فلو یک اعلان پوش می‌فرستد. اپ با دریافت آن
   فقط یک‌بار نتیجه را از وب‌هوک job می‌خواند. هیچ تایمر خودکاری وجود ندارد؛
   دکمه «بروزرسانی» دستی است و هنگام باز کردن اپ برای پروژه‌های در حال اجرا
   حداکثر یک درخواست (با فاصله حداقل ۲ دقیقه) زده می‌شود. */
const STAGES = [
  ['queued', 'ثبت سفارش'], ['discovery', 'کشف ریلزهای ویرال'], ['video_analysis', 'تحلیل ویدیوها با Gemini'],
  ['council_analysis', 'شورای تحلیل‌گران (Claude / GPT / Gemini)'], ['council_scenario', 'شورای کارگردان‌ها و داورها'], ['done', 'تحویل سناریوی نهایی']
];
const RESUME_GAP = 120000;

async function refreshJob(id) {
  const j = getJob(id);
  if (!j) return;
  try {
    const row = await api('job?job_id=' + encodeURIComponent(id));
    if (!row || !row.found) {
      const misses = (j.misses || 0) + 1;
      const old = Date.now() - (j.created || 0) > 10 * 60000;
      if (misses > 3 && old) upsertJob({ id: id, status: 'failed', message: 'این سفارش در سرور پیدا نشد.', misses: misses, updated: Date.now() });
      else upsertJob({ id: id, misses: misses, updated: Date.now() });
      return;
    }
    const p = parseRow(row);
    LS.set('hl_res_' + id, p);
    const patch = { id: id, status: row.status || 'running', stage: row.stage || j.stage, progress: Number(row.progress) || 0, message: row.message || '', error: row.error || '', misses: 0, netErr: 0, lastError: '', updated: Date.now() };
    const title = p.scenario && p.scenario.title;
    if (title) patch.reelTitle = title;
    upsertJob(patch);
  } catch (e) {
    upsertJob({ id: id, netErr: (j.netErr || 0) + 1, lastError: friendly(e), updated: Date.now() });
  }
}

async function refreshRunning() {
  const list = jobsList().filter((j) => j.status === 'running' && Date.now() - (j.updated || 0) > RESUME_GAP);
  for (const j of list) await refreshJob(j.id);
  softRender(); updateBadge();
}

/* ---------- اعلان پوش (Firebase Cloud Messaging) ---------- */
const PN = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
const getToken = () => LS.get('hl_fcm', '') || '';
async function onPush(data, openIt) {
  const id = data && data.job_id;
  if (!id) return;
  if (!getJob(id)) return;
  await refreshJob(id);
  softRender(); updateBadge();
  if (openIt) location.hash = '#/job/' + encodeURIComponent(id);
}
async function initPush() {
  const P = PN();
  if (!P) return;
  try {
    P.addListener('registration', (t) => { if (t && t.value) LS.set('hl_fcm', t.value); });
    P.addListener('registrationError', () => { /* Firebase تنظیم نشده یا اجازه داده نشده */ });
    P.addListener('pushNotificationReceived', (n) => { onPush(n && n.data, false); toast((n && n.title) || 'نتیجه آماده شد'); });
    P.addListener('pushNotificationActionPerformed', (a) => { onPush(a && a.notification && a.notification.data, true); });
    try { await P.createChannel({ id: 'hookloom_jobs', name: 'نتیجه سفارش‌ها', importance: 4 }); } catch (e) { /* ignore */ }
    let perm = await P.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await P.requestPermissions();
    if (perm.receive === 'granted') await P.register();
  } catch (e) { /* پوش در دسترس نیست */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRunning(); });
const AppPlugin = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
try { const A = AppPlugin(); if (A && A.addListener) A.addListener('appStateChange', (st) => { if (st && st.isActive) refreshRunning(); }); } catch (e) { /* ignore */ }

function updateBadge() {
  const n = jobsList().filter((j) => j.status === 'running').length;
  const b = $('#nav-badge');
  b.hidden = !n; b.textContent = fa(n);
}

/* ---------- ناوبری ---------- */
let lastSig = '';
const ui = { tab: {} };
function route() {
  const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
  let name = parts[0] || (getSettings().key ? 'new' : 'settings');
  if (!['new', 'jobs', 'settings', 'job'].includes(name)) name = 'new';
  return { name: name, id: parts[1] ? decodeURIComponent(parts[1]) : '' };
}
function render() {
  const r = route();
  const v = $('#view');
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.r === (r.name === 'job' ? 'jobs' : r.name)));
  let html = '';
  if (r.name === 'new') html = viewNew();
  else if (r.name === 'jobs') html = viewJobs();
  else if (r.name === 'settings') html = viewSettings();
  else html = viewJob(r.id);
  v.innerHTML = html;
  v.scrollTop = 0;
  lastSig = sigFor(r);
  updateBadge();
}
function onRoute() {
  render();
}
function sigFor(r) {
  if (r.name === 'jobs') return JSON.stringify(jobsList().map((j) => [j.id, j.status, j.stage, j.progress, j.reelTitle]));
  if (r.name === 'job') { const j = getJob(r.id) || {}; const res = getRes(r.id); return JSON.stringify([j.status, j.stage, j.progress, j.message, j.error, j.lastError, !!res.scenario, !!res.patterns, !!res.reels, !!res.council, ui.tab[r.id]]); }
  return '';
}
function softRender() {
  const r = route();
  if (r.name !== 'jobs' && r.name !== 'job') { updateBadge(); return; }
  const s = sigFor(r);
  if (s === lastSig) { updateBadge(); return; }
  const v = $('#view'); const top = v.scrollTop;
  const open = $$('details', v).map((d) => d.open);
  render();
  const ds = $$('details', v);
  if (ds.length === open.length) ds.forEach((d, i) => { d.open = open[i]; });
  v.scrollTop = top;
}
window.addEventListener('hashchange', onRoute);

/* ---------- فرم سفارش ---------- */
const LANGS = ['فارسی', 'English', 'العربية', 'Türkçe', 'Deutsch', 'Français', 'Español'];
const GOALS = ['افزایش فروش', 'آگاهی از برند', 'جذب فالوئر', 'جذب مشتری حضوری', 'آموزش مخاطب', 'معرفی محصول جدید'];
const TONES = ['صمیمی و دوستانه', 'حرفه‌ای و معتبر', 'طنز', 'لوکس و الهام‌بخش', 'آموزشی', 'هیجانی و پرانرژی'];
const VIEWS = [[100000, '۱۰۰ هزار'], [500000, '۵۰۰ هزار'], [1000000, '۱ میلیون'], [2000000, '۲ میلیون'], [5000000, '۵ میلیون']];
const DAYS = [[30, '۳۰ روز'], [60, '۶۰ روز'], [90, '۹۰ روز'], [180, '۶ ماه'], [365, '۱ سال']];
const opts = (arr, cur) => arr.map((o) => `<option value="${o[0]}" ${String(o[0]) === String(cur) ? 'selected' : ''}>${o[1]}</option>`).join('');
const dl = (id, arr) => `<datalist id="${id}">${arr.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;

function viewNew() {
  const d = LS.get('hl_draft', {}) || {};
  const v = (k, def) => esc(d[k] != null ? d[k] : (def || ''));
  const n = Math.min(10, Number(d.reels_to_analyze) || 8);
  const noKey = !getSettings().key ? '<div class="note">⚠ هنوز کلید دسترسی تنظیم نشده است. ابتدا به بخش «تنظیمات» بروید.</div>' : '';
  return `
  <h2 class="pg">سفارش جدید</h2>
  <p class="sub">اطلاعات کسب‌وکار را وارد کنید تا هوک‌لوم ریلزهای ویرال هم‌بازار شما را پیدا، تحلیل و یک سناریوی کامل تولید با هوش مصنوعی بنویسد.</p>
  ${noKey}
  <form id="orderForm" novalidate>
    <div class="card">
      <div class="field"><label>نام کسب‌وکار <em>*</em></label><input name="business_name" value="${v('business_name')}" placeholder="مثلاً: کافه رومیزی" required></div>
      <div class="field"><label>حوزه فعالیت (نیش) <em>*</em></label><input name="business_niche" value="${v('business_niche')}" placeholder="مثلاً: کافه تخصصی، فروشگاه آنلاین لباس، کلینیک زیبایی" required></div>
      <div class="field"><label>توضیح کسب‌وکار</label><textarea name="business_description" placeholder="محصولات، مزیت رقابتی، فضای برند...">${v('business_description')}</textarea></div>
      <div class="field"><label>کشور و شهر هدف <em>*</em></label><input name="country_city" value="${v('country_city')}" placeholder="مثلاً: ایران، تهران" required><small>ریلزهای بازار همین منطقه جست‌وجو می‌شوند.</small></div>
      <div class="field"><label>زبان محتوا</label><input name="content_language" list="dl-lang" value="${v('content_language', 'فارسی')}">${dl('dl-lang', LANGS)}</div>
    </div>
    <div class="card">
      <div class="field"><label>مخاطب هدف</label><input name="target_audience" value="${v('target_audience')}" placeholder="مثلاً: زنان ۲۰ تا ۳۵ ساله علاقه‌مند به قهوه"></div>
      <div class="field"><label>موضوع ریل (اختیاری)</label><input name="reel_topic" value="${v('reel_topic')}" placeholder="اگر خالی بماند، هوش مصنوعی بهترین موضوع را پیشنهاد می‌دهد"></div>
      <div class="field"><label>هدف ریل</label><input name="reel_goal" list="dl-goal" value="${v('reel_goal')}" placeholder="انتخاب کنید یا بنویسید">${dl('dl-goal', GOALS)}</div>
      <div class="field"><label>لحن برند</label><input name="brand_tone" list="dl-tone" value="${v('brand_tone')}" placeholder="انتخاب کنید یا بنویسید">${dl('dl-tone', TONES)}</div>
      <div class="field"><label>آیدی اینستاگرام</label><input class="ltr" name="instagram_handle" value="${v('instagram_handle')}" placeholder="@yourbrand" autocapitalize="none"></div>
    </div>
    <details class="adv"><summary>تنظیمات پیشرفته جست‌وجو</summary>
      <div class="card" style="margin-top:8px">
        <div class="row2">
          <div class="field"><label>حداقل بازدید</label><select name="min_views">${opts(VIEWS, d.min_views || 1000000)}</select></div>
          <div class="field"><label>بازه زمانی</label><select name="days_window">${opts(DAYS, d.days_window || 90)}</select></div>
        </div>
        <div class="field"><label>تعداد ریل برای تحلیل: <b id="rv">${fa(n)}</b></label><input type="range" name="reels_to_analyze" min="3" max="10" step="1" value="${n}"><small>ریل بیشتر یعنی دقت بالاتر ولی زمان و هزینه بیشتر.</small></div>
      </div>
    </details>
    <div class="note">⏱ پردازش کامل معمولاً ۱۵ تا ۴۰ دقیقه طول می‌کشد. می‌توانید اپ را ببندید؛ وضعیت از بخش «پروژه‌ها» قابل پیگیری است.</div>
    <button class="btn block" id="submitBtn" type="submit">🚀 شروع تحقیق و ساخت سناریو</button>
  </form>`;
}

function collectForm(form) {
  const fd = {}; new FormData(form).forEach((val, k) => { fd[k] = String(val).trim(); });
  return fd;
}
async function submitOrder(form) {
  const fd = collectForm(form);
  let bad = false;
  ['business_name', 'business_niche', 'country_city'].forEach((k) => {
    const el = form.elements[k]; const empty = !fd[k]; el.classList.toggle('bad', empty); if (empty) bad = true;
  });
  if (bad) { toast('فیلدهای ضروری (ستاره‌دار) را پر کنید'); return; }
  const body = Object.assign({}, fd, {
    instagram_handle: (fd.instagram_handle || '').replace(/^@+/, ''),
    min_views: Number(fd.min_views) || 1000000, days_window: Number(fd.days_window) || 90,
    reels_to_analyze: Math.min(10, Math.max(3, Number(fd.reels_to_analyze) || 8)),
    content_language: fd.content_language || 'فارسی',
    fcm_token: getToken()
  });
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'در حال ارسال به ورک‌فلو…';
  try {
    const res = await api('order', { method: 'POST', body: JSON.stringify(body) });
    if (!res || !res.job_id) throw new ApiError('پاسخ نامعتبر از سرور', 0, JSON.stringify(res));
    delete body.fcm_token;
    upsertJob({ id: res.job_id, brief: body, title: body.business_name, status: 'running', stage: 'queued', progress: 5, message: 'سفارش ثبت شد', created: Date.now(), updated: Date.now() });
    LS.del('hl_draft');
    toast('سفارش ثبت شد ✓');
    location.hash = '#/job/' + encodeURIComponent(res.job_id);
  } catch (e) {
    toast(friendly(e));
    btn.disabled = false; btn.textContent = '🚀 شروع تحقیق و ساخت سناریو';
  }
}

/* ---------- فهرست پروژه‌ها ---------- */
const STATUS_FA = { running: 'در حال اجرا', done: 'تکمیل‌شده', failed: 'ناموفق' };
function dateFa(t) { try { return new Date(t).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
function viewJobs() {
  const l = jobsList();
  if (!l.length) return '<h2 class="pg">پروژه‌ها</h2><div class="empty"><b>🎬</b>هنوز پروژه‌ای ندارید.<br><br><button class="btn" data-act="nav" data-to="#/new">ثبت اولین سفارش</button></div>';
  const anyRunning = l.some((j) => j.status === 'running');
  return '<h2 class="pg">پروژه‌ها</h2><p class="sub">تاریخچه سفارش‌های شما روی همین دستگاه ذخیره می‌شود.</p>' +
    (anyRunning ? '<div class="actions" style="margin:0 0 12px"><button class="btn ghost" data-act="refresh-all">🔄 بروزرسانی وضعیت پروژه‌های در حال اجرا</button></div>' : '') +
    l.map((j) => {
    const st = j.status || 'running';
    const stage = (STAGES.find((s) => s[0] === j.stage) || [0, ''])[1];
    return `<div class="card jobcard" data-act="nav" data-to="#/job/${encodeURIComponent(j.id)}">
      <div class="t"><b>${esc(j.reelTitle || j.title || 'بدون نام')}</b><span class="badge ${st}">${STATUS_FA[st] || st}</span></div>
      <div class="m">${esc(j.brief ? (j.brief.business_niche + ' · ' + j.brief.country_city) : '')}</div>
      ${st === 'running' ? `<div class="bar"><i style="width:${j.progress || 0}%"></i></div><div class="f"><span>${esc(stage)}</span><span>${fa(j.progress || 0)}٪</span></div>` : `<div class="f"><span>${dateFa(j.created)}</span><span>${st === 'failed' ? esc((j.message || '').slice(0, 40)) : ''}</span></div>`}
    </div>`;
  }).join('');
}

/* ---------- صفحه پروژه ---------- */
function viewJob(id) {
  const j = getJob(id);
  if (!j) return '<div class="empty"><b>🔍</b>پروژه پیدا نشد.<br><br><button class="btn" data-act="nav" data-to="#/jobs">بازگشت</button></div>';
  const res = getRes(id);
  const st = j.status || 'running';
  const idx = Math.max(0, STAGES.findIndex((s) => s[0] === j.stage));
  const head = `<div class="jh"><button class="back" data-act="nav" data-to="#/jobs">›</button><h2>${esc(j.reelTitle || j.title || 'پروژه')}</h2><span class="badge ${st}">${STATUS_FA[st] || st}</span></div>`;
  let prog = '';
  if (st === 'running') {
    const modeTxt = getToken() ? 'می‌توانید اپ را ببندید؛ با آماده‌شدن نتیجه یک اعلان دریافت می‌کنید.' : 'اعلان فعال نیست؛ برای دیدن پیشرفت دکمه بروزرسانی را بزنید.';
    prog = `<div class="card"><div class="bar"><i style="width:${j.progress || 0}%"></i></div>
      <p class="msg"><b>${fa(j.progress || 0)}٪</b> · ${esc(j.message || 'در حال پردازش…')}</p>
      <ul class="steps">${STAGES.map((s, i) => `<li class="${i < idx ? 'ok' : (i === idx ? 'on' : '')}"><s>${i < idx ? '✓' : fa(i + 1)}</s>${s[1]}</li>`).join('')}</ul>
      <p class="sub" style="margin:10px 0 0">زمان سپری‌شده: <b data-since="${j.created || Date.now()}"></b></p>
      <p class="sub" style="margin:2px 0 0">${modeTxt}</p>
      ${j.lastError ? `<p class="warn">⚠ ${esc(j.lastError)}</p>` : ''}
      <div class="actions"><button class="btn ghost" data-act="refresh" data-id="${esc(id)}">🔄 بروزرسانی</button><button class="btn ghost" data-act="delete-job" data-id="${esc(id)}">حذف از فهرست</button></div></div>`;
  } else if (st === 'failed') {
    prog = `<div class="card"><p class="err"><b>❌ ${esc(j.message || 'پردازش ناموفق بود')}</b></p>
      ${j.error ? `<p class="err" dir="ltr" style="text-align:left">${esc(String(j.error).slice(0, 500))}</p>` : ''}
      <p class="sub">پیشنهاد: حداقل بازدید را کمتر یا بازه زمانی را بیشتر کنید.</p>
      <div class="actions"><button class="btn" data-act="reuse" data-id="${esc(id)}">↻ ویرایش و ارسال مجدد</button><button class="btn ghost" data-act="delete-job" data-id="${esc(id)}">حذف</button></div></div>`;
  }
  const tabs = [];
  if (res.scenario || res.scenarioMd) tabs.push(['scenario', '🎬 سناریو']);
  if (res.patterns) tabs.push(['patterns', '📊 الگوها']);
  if (res.reels && res.reels.length) tabs.push(['reels', '🔥 ریلزها']);
  if (res.council) tabs.push(['council', '🧠 شورا']);
  if (res.scenarioMd) tabs.push(['md', '📄 متن کامل']);
  tabs.push(['brief', '📝 سفارش']);
  let cur = ui.tab[id];
  if (!tabs.some((t) => t[0] === cur)) cur = tabs[0][0];
  const bar = `<div class="tabs">${tabs.map((t) => `<button class="${t[0] === cur ? 'on' : ''}" data-act="tab" data-id="${esc(id)}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>`;
  let body = '';
  if (cur === 'scenario') body = tabScenario(id, res);
  else if (cur === 'patterns') body = tabPatterns(res);
  else if (cur === 'reels') body = tabReels(res);
  else if (cur === 'council') body = tabCouncil(res);
  else if (cur === 'md') body = tabMd(id, res);
  else body = tabBrief(id, j, res);
  return head + prog + bar + body;
}

/* ----- رندر عمومی ----- */
const L = { sample_summary: 'خلاصه نمونه', reels_analyzed: 'ریل تحلیل‌شده', avg_views: 'میانگین بازدید', avg_viral_ratio: 'میانگین نسبت ویرال', avg_duration_sec: 'میانگین مدت (ثانیه)', video_analysis_coverage: 'پوشش تحلیل ویدیو', hook_patterns: 'الگوهای هوک', pattern: 'الگو', frequency_pct: 'فراوانی (٪)', why_it_works: 'چرا جواب می‌دهد', fill_in_template: 'قالب پرکردنی', example_reel_urls: 'ریل‌های نمونه', format_patterns: 'الگوهای فرمت', format: 'فرمت', notes: 'یادداشت', structure_blueprint: 'نقشه ساختار ریل', time_range_sec: 'بازه (ثانیه)', role: 'نقش', what_happens: 'چه اتفاقی می‌افتد', pacing_and_editing: 'ریتم و تدوین', avg_cuts_per_10s: 'میانگین کات در ۱۰ ثانیه', duration_sweet_spot_sec: 'مدت طلایی (ثانیه)', transitions: 'ترنزیشن‌ها', text_overlay_rules: 'قواعد متن روی تصویر', audio_patterns: 'الگوهای صدا', music: 'موسیقی', voiceover: 'گویندگی', sfx: 'افکت صوتی', trending_audio_usage: 'استفاده از صدای ترند', emotional_triggers: 'محرک‌های احساسی', trigger: 'محرک', retention_devices: 'ابزارهای حفظ مخاطب', cta_patterns: 'الگوهای CTA', cta: 'CTA', caption_and_hashtag_patterns: 'الگوی کپشن و هشتگ', topic_angles: 'زوایای موضوعی', success_factors_ranked: 'عوامل موفقیت', factor: 'عامل', weight_0_100: 'وزن', evidence: 'شواهد', anti_patterns: 'ضدالگوها (پرهیز)', geo_cultural_notes: 'نکات فرهنگی و جغرافیایی', winning_formula: 'فرمول برنده', confidence_and_limits: 'اطمینان و محدودیت‌ها', council_notes: 'یادداشت‌های شورا', adopted_from: 'برگرفته از', disagreements_resolved: 'اختلاف‌های حل‌شده', confidence: 'میزان اطمینان', models: 'مدل‌ها', analysts: 'تحلیل‌گران', analysis_chair: 'رئیس شورای تحلیل', directors: 'کارگردان‌ها', reviewers: 'داورها', scenario_chair: 'رئیس شورای سناریو', analysis_notes: 'یادداشت‌های تحلیل', drafts: 'پیش‌نویس‌ها', reviews: 'نقدها', scenario_notes: 'یادداشت‌های سناریو', director: 'کارگردان', title: 'عنوان', logline: 'لاگ‌لاین', hook: 'هوک', duration_sec: 'مدت (ثانیه)', reviewer: 'داور', review: 'نقد', niche_en: 'نیش (انگلیسی)', audience_summary: 'خلاصه مخاطب', hashtags: 'هشتگ‌ها', relevance_rules: 'قواعد ارتباط', business_name: 'نام کسب‌وکار', business_niche: 'حوزه فعالیت', business_description: 'توضیحات', country_city: 'کشور/شهر', content_language: 'زبان محتوا', target_audience: 'مخاطب هدف', reel_topic: 'موضوع ریل', reel_goal: 'هدف ریل', brand_tone: 'لحن برند', instagram_handle: 'اینستاگرام', min_views: 'حداقل بازدید', days_window: 'بازه (روز)', reels_to_analyze: 'تعداد ریل', job_id: 'شناسه' };
const lab = (k) => L[k] || k.replace(/_/g, ' ');
const isUrl = (s) => /^https?:\/\/\S+$/.test(s);
function gen(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return `<p class="txt">${v ? 'بله' : 'خیر'}</p>`;
  if (typeof v === 'number') return `<p class="txt">${fa(v)}</p>`;
  if (typeof v === 'string') return isUrl(v) ? `<span class="link" data-act="open" data-url="${esc(v)}">${esc(v)}</span>` : `<p class="txt">${esc(v)}</p>`;
  if (Array.isArray(v)) {
    if (!v.length) return '';
    if (v.every((x) => typeof x !== 'object' || x === null)) return `<ul class="l">${v.filter((x) => x !== '').map((x) => `<li>${typeof x === 'string' && isUrl(x) ? `<span class="link" data-act="open" data-url="${esc(x)}">${esc(x)}</span>` : esc(x)}</li>`).join('')}</ul>`;
    return v.map((x) => `<div class="sub">${gen(x)}</div>`).join('');
  }
  return Object.keys(v).map((k) => {
    const inner = gen(v[k]); if (!inner) return '';
    return `<div class="kv"><span>${esc(lab(k))}</span><div>${inner}</div></div>`;
  }).join('');
}
const sec = (title, body, open) => body ? `<details class="card sec" ${open === false ? '' : 'open'}><summary>${title}</summary><div class="sec-body">${body}</div></details>` : '';
const kv = (label, val) => val ? `<div class="kv"><span>${esc(label)}</span><p class="txt">${esc(val)}</p></div>` : '';
const pbox = (label, val) => val ? `<div class="pbox"><div class="pbox-h"><span>${esc(label)}</span><button class="mini" data-act="copy" data-text="${esc(val)}">کپی</button></div><p>${esc(val)}</p></div>` : '';
const arr = (v) => Array.isArray(v) ? v : [];

/* ----- تب سناریو ----- */
function tabScenario(id, res) {
  const s = res.scenario;
  if (!s) {
    return `${res.scenarioBroken ? '<div class="note">⚠ ساختار JSON سناریو به‌دلیل حجم زیاد ناقص ذخیره شده؛ متن کامل نمایش داده می‌شود.</div>' : ''}<div class="card md">${mdToHtml(res.scenarioMd)}</div>${actionsBar(id)}`;
  }
  const f = s.format || {};
  let h = `<div class="hero"><h3>${esc(s.title)}</h3><p>${esc(s.logline)}</p><div class="chips">${f.duration_sec ? `<span class="chip">⏱ ${fa(f.duration_sec)} ثانیه</span>` : ''}${f.aspect_ratio ? `<span class="chip">${esc(f.aspect_ratio)}</span>` : ''}${f.resolution ? `<span class="chip">${esc(f.resolution)}</span>` : ''}${f.fps ? `<span class="chip">${fa(f.fps)} fps</span>` : ''}</div></div>`;
  h += sec('🎯 استراتژی', kv('خلاصه استراتژی', s.strategy_summary) + kv('سبک', f.style) + (arr(s.patterns_applied).length ? '<div class="kv"><span>الگوهای اعمال‌شده</span></div>' + arr(s.patterns_applied).map((p) => `<div class="sub"><b>${esc(p.pattern)}</b><p class="txt">${esc(p.how_applied)}</p></div>`).join('') : ''));
  h += sec('🪝 نسخه‌های هوک', arr(s.hook_variants).map((x) => `<div class="sub"><b>نسخه ${esc(x.label)}</b>${kv('تصویر ۳ ثانیه اول', x.first_3s_visual)}${kv('جمله گفتاری', x.spoken_line)}${kv('متن روی تصویر', x.on_screen_text)}</div>`).join(''));
  const sb = s.style_bible || {};
  h += sec('🎨 بایبل سبک و کاراکترها', kv('دنیای بصری', sb.world_look) + kv('پالت رنگ', sb.color_palette) + kv('نورپردازی', sb.lighting) + kv('زبان دوربین', sb.camera_language) + arr(sb.characters).map((c) => `<div class="sub"><b>${esc(c.name)}</b><p class="txt">${esc(c.description)}</p>${pbox('Consistency prompt', c.consistency_prompt)}</div>`).join(''), false);
  h += sec(`🎞 شات‌لیست (${fa(arr(s.scenes).length)} صحنه)`, arr(s.scenes).map((x) => `<div class="scene"><div class="scene-h"><b>صحنه ${fa(x.scene_no)} · ${esc(x.purpose)}</b><span>${esc(x.start_sec)}–${esc(x.end_sec)}s</span></div>${kv('تصویر', x.visual_description)}${kv('حرکت دوربین', x.camera_motion)}${kv('گویندگی', x.narration_text)}${kv('متن روی تصویر', x.on_screen_text)}${kv('افکت', x.sfx)}${kv('موسیقی', x.music_cue)}${kv('انتقال', x.transition_to_next)}${pbox('Keyframe image prompt', x.keyframe_image_prompt)}${pbox('AI video prompt', x.ai_video_prompt)}${pbox('Negative prompt', x.negative_prompt)}</div>`).join(''));
  const n = s.narration || {};
  h += sec('🎙 گویندگی', kv('زبان', n.language) + kv('پروفایل صدا', n.voice_profile) + kv('سرعت (کلمه در دقیقه)', n.pace_wpm) + kv('جهت احساس', n.emotion_direction) + kv('نکات تلفظ', n.pronunciation_notes) + (n.full_script ? `<div class="kv"><span>متن کامل</span><p class="txt">${esc(n.full_script)}</p><button class="mini" data-act="copy" data-text="${esc(n.full_script)}">کپی متن</button></div>` : ''), false);
  const m = s.music || {};
  h += sec('🎵 موسیقی و صداگذاری', kv('ژانر', m.genre) + kv('حال‌وهوا', m.mood) + kv('BPM', m.bpm) + kv('توضیح رفرنس', m.reference_description) + kv('زمان‌بندی', m.timing_notes) + pbox('AI music prompt', m.ai_music_prompt) + (arr(s.sound_design).length ? '<div class="kv"><span>طراحی صدا</span></div><ul class="l">' + arr(s.sound_design).map((x) => `<li>${esc(x.time_sec)}s: ${esc(x.sfx)}</li>`).join('') + '</ul>' : ''), false);
  h += sec('🔤 متن‌های روی تصویر', arr(s.text_overlays).length ? '<ul class="l">' + arr(s.text_overlays).map((x) => `<li><b>${esc(x.time_sec)}s</b> — ${esc(x.text)}<br><small style="color:var(--muted)">${esc(x.style)} · ${esc(x.position)}</small></li>`).join('') + '</ul>' : '', false);
  const c = s.cta || {};
  const tags = arr(s.hashtags).map((x) => '#' + String(x).replace(/^#/, '')).join(' ');
  h += sec('📣 کپشن، هشتگ و CTA', (s.caption ? `<div class="kv"><span>کپشن</span><p class="txt">${esc(s.caption)}</p><button class="mini" data-act="copy" data-text="${esc(s.caption)}">کپی کپشن</button></div>` : '') + (tags ? `<div class="kv"><span>هشتگ‌ها</span><p class="hashes">${esc(tags)}</p><button class="mini" data-act="copy" data-text="${esc(tags)}">کپی هشتگ‌ها</button></div>` : '') + kv('CTA گفتاری', c.spoken) + kv('CTA روی تصویر', c.on_screen) + kv('خط CTA در کپشن', c.caption_line) + kv('کلمه محرک کامنت', c.comment_trigger));
  const cv = s.cover || {}; const pp = s.posting_plan || {};
  h += sec('🖼 کاور و برنامه انتشار', kv('متن کاور', cv.text) + pbox('Cover image prompt', cv.image_prompt) + kv('بهترین زمان انتشار', pp.best_time_hint) + kv('کامنت اول', pp.first_comment) + kv('اقدامات تعامل', pp.engagement_actions), false);
  h += sec('🛠 پایپ‌لاین تولید با هوش مصنوعی', arr(s.ai_production_pipeline).map((x, i) => `<div class="sub"><b>${fa(i + 1)}. ${esc(x.step)}</b>${kv('ابزارها', x.tool_options)}${kv('نکته', x.notes)}</div>`).join(''), false);
  h += sec('⚠ ریسک‌ها و راه‌حل‌ها', arr(s.ai_risks_and_fixes).map((x) => `<div class="sub"><b>${esc(x.risk)}</b><p class="txt">✔ ${esc(x.fix)}</p></div>`).join(''), false);
  const k = s.expected_kpis || {};
  h += sec('📈 تست A/B، اصالت و KPI', kv('اصالت محتوا', s.originality_notes) + (arr(s.ab_test_ideas).length ? '<div class="kv"><span>ایده‌های تست A/B</span></div>' + gen(s.ab_test_ideas) : '') + kv('هدف بازدید', k.target_views) + kv('هدف زمان تماشا', k.watch_time_goal) + kv('توضیح', k.notes), false);
  return h + actionsBar(id);
}
function actionsBar(id) {
  return `<div class="actions"><button class="btn" data-act="copy-md" data-id="${esc(id)}">📋 کپی متن کامل</button><button class="btn ghost" data-act="share-md" data-id="${esc(id)}">📤 اشتراک‌گذاری</button><button class="btn ghost" data-act="reuse" data-id="${esc(id)}">↻ سفارش مشابه</button></div>`;
}

/* ----- تب الگوها ----- */
function tabPatterns(res) {
  const p = res.patterns || {};
  const ss = p.sample_summary || {};
  let h = '';
  if (Object.keys(ss).length) h += `<div class="stat"><div><b>${fa(ss.reels_analyzed)}</b><small>ریل تحلیل‌شده</small></div><div><b>${fac(ss.avg_views)}</b><small>میانگین بازدید</small></div><div><b>${fa(ss.avg_viral_ratio)}×</b><small>نسبت ویرال</small></div><div><b>${fa(ss.avg_duration_sec)}s</b><small>میانگین مدت</small></div></div>`;
  if (p.winning_formula) h += `<div class="hero"><h3 style="font-size:15px">✨ فرمول برنده</h3><p style="margin:6px 0 0">${esc(p.winning_formula)}</p></div>`;
  const fac2 = arr(p.success_factors_ranked);
  if (fac2.length) h += sec('🏆 عوامل موفقیت', fac2.map((x) => `<div class="sub"><div class="wbar"><b style="flex:none;max-width:60%">${esc(x.factor)}</b><div class="bar"><i style="width:${Math.min(100, Number(x.weight_0_100) || 0)}%"></i></div><span>${fa(x.weight_0_100)}</span></div><p class="txt" style="color:var(--muted);font-size:12.5px">${esc(x.evidence)}</p></div>`).join(''));
  const skip = { sample_summary: 1, winning_formula: 1, success_factors_ranked: 1, council_notes: 1 };
  Object.keys(p).forEach((k) => { if (skip[k]) return; h += sec(esc(lab(k)), gen(p[k]), false); });
  return h || '<div class="empty">هنوز الگویی آماده نیست.</div>';
}

/* ----- تب ریلزها ----- */
function tabReels(res) {
  return `<p class="sub">ریلزهای ویرالِ مرتبطی که تحلیل شدند (${fa(res.reels.length)} مورد)</p>` + res.reels.map((r) => `<div class="card reel">
    ${r.thumbnail_url ? `<img src="${esc(r.thumbnail_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : ''}
    <div class="b"><b dir="ltr" style="text-align:right">@${esc(r.owner_username)}</b>
      <div class="st"><span>👁 ${fac(r.views)}</span><span>❤ ${fac(r.likes)}</span><span>💬 ${fac(r.comments)}</span><span>👥 ${fac(r.followers)}</span><span>⏱ ${fa(r.duration_sec)}s</span></div>
      <div class="chips"><span class="chip dk">نسبت ویرال ${fa(r.viral_ratio)}×</span>${r.relevance_score != null ? `<span class="chip dk">ارتباط ${fa(r.relevance_score)}/۱۰</span>` : ''}${r.hook_type ? `<span class="chip dk">${esc(r.hook_type)}</span>` : ''}${r.format_type ? `<span class="chip dk">${esc(r.format_type)}</span>` : ''}</div>
      <p>${esc(r.caption)}</p>
      ${r.relevance_reason ? `<p style="color:var(--muted)">${esc(r.relevance_reason)}</p>` : ''}
      ${r.analysis && r.analysis.hook ? `<p>🪝 ${esc(r.analysis.hook.why_it_stops_scroll || r.analysis.hook.first_3s_description || '')}</p>` : ''}
      <button class="mini" data-act="open" data-url="${esc(r.reel_url)}">باز کردن ریل ↗</button></div></div>`).join('');
}

/* ----- تب شورا ----- */
function tabCouncil(res) {
  const c = res.council || {};
  let h = '';
  if (c.models) h += sec('🤖 مدل‌های شورا', gen(c.models));
  if (c.analysis_notes && Object.keys(c.analysis_notes).length) h += sec('یادداشت‌های شورای تحلیل', gen(c.analysis_notes), false);
  if (arr(c.drafts).length) h += sec('پیش‌نویس کارگردان‌ها', gen(c.drafts), false);
  if (arr(c.reviews).length) h += sec('نقد داورها', arr(c.reviews).map((r) => `<details class="sub"><summary><b>${esc(r.reviewer)}</b></summary><p class="txt">${esc(r.review)}</p></details>`).join(''), false);
  if (c.scenario_notes && Object.keys(c.scenario_notes).length) h += sec('یادداشت‌های شورای سناریو', gen(c.scenario_notes), false);
  return h || '<div class="empty">اطلاعاتی موجود نیست.</div>';
}

/* ----- تب متن کامل (Markdown) ----- */
function inline(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
function mdToHtml(md) {
  const out = []; let inList = false;
  String(md || '').split('\n').forEach((line) => {
    const li = line.match(/^\s*(?:-|\d+\.)\s+(.*)/);
    if (li) { if (!inList) { out.push('<ul class="l">'); inList = true; } out.push('<li>' + inline(li[1]) + '</li>'); return; }
    if (inList) { out.push('</ul>'); inList = false; }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) out.push('<h4>' + inline(h[2]) + '</h4>');
    else if (/^>\s?/.test(line)) out.push('<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>');
    else if (line.trim()) out.push('<p class="txt">' + inline(line) + '</p>');
  });
  if (inList) out.push('</ul>');
  return out.join('');
}
function tabMd(id, res) { return `<div class="card md" dir="auto">${mdToHtml(res.scenarioMd)}</div>${actionsBar(id)}`; }

/* ----- تب سفارش ----- */
function tabBrief(id, j, res) {
  const b = res.brief || j.brief || {};
  let h = sec('📝 اطلاعات سفارش', gen(b));
  if (res.strategy) {
    h += sec('🔎 استراتژی تحقیق', gen(Object.assign({}, res.strategy, { hashtags: undefined })) + (arr(res.strategy.hashtags).length ? `<div class="kv"><span>هشتگ‌های جست‌وجو</span><p class="hashes">${esc(arr(res.strategy.hashtags).map((x) => '#' + x).join(' '))}</p></div>` : ''));
  }
  h += `<p class="sub">شناسه سفارش: <span dir="ltr">${esc(id)}</span></p><div class="actions"><button class="btn ghost" data-act="reuse" data-id="${esc(id)}">↻ سفارش مشابه</button><button class="btn ghost" data-act="delete-job" data-id="${esc(id)}">🗑 حذف پروژه</button></div>`;
  return h;
}

/* ---------- تنظیمات ---------- */
function viewSettings() {
  const s = getSettings();
  return `<h2 class="pg">تنظیمات</h2><p class="sub">اتصال اپ به ورک‌فلوی Hookloom در n8n</p>
  <div class="card">
    <div class="field"><label>آدرس سرور n8n</label><input class="ltr" id="s-url" value="${esc(s.baseUrl)}" inputmode="url" autocapitalize="none"><small>مثال: https://yourname.app.n8n.cloud</small></div>
    <div class="field"><label>کلید دسترسی (X-Call-Key)</label><div class="pwwrap"><input class="ltr" id="s-key" type="password" value="${esc(s.key)}" autocapitalize="none" autocomplete="off"><button class="mini" data-act="toggle-key">نمایش</button></div><small>همان مقدار Credential نوع Header Auth در n8n (نام هدر: X-Call-Key).</small></div>
    <div class="actions"><button class="btn" data-act="save-settings">💾 ذخیره</button><button class="btn ghost" data-act="test" id="testBtn">🔌 تست اتصال</button></div>
    <p id="testRes" class="sub" style="margin:10px 0 0"></p>
  </div>
  <div class="note">اپ دو آدرس را صدا می‌زند:<br><span dir="ltr">POST /webhook/hookloom/order</span><br><span dir="ltr">GET /webhook/hookloom/job?job_id=…</span> (فقط هنگام اعلان یا بروزرسانی دستی)<br>ورک‌فلو باید در n8n «Publish» شده باشد.</div>
  <div class="card"><b>داده‌های دستگاه</b><p class="sub" style="margin:4px 0 10px">تاریخچه پروژه‌ها فقط روی همین گوشی ذخیره شده است.</p><button class="btn danger" data-act="clear-all">🗑 پاک‌کردن همه پروژه‌ها</button></div>
  <p class="sub" style="text-align:center">Hookloom v1.2 · ساخته‌شده با Capacitor</p>`;
}
function readSettings() {
  let url = ($('#s-url').value || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  return { baseUrl: url || DEFAULT_URL, key: ($('#s-key').value || '').trim() };
}
async function testConnection() {
  const out = $('#testRes'); const btn = $('#testBtn');
  saveSettings(readSettings());
  out.textContent = 'در حال تست…'; btn.disabled = true;
  try {
    await api('job?job_id=connection_test&light=1');
    out.innerHTML = '<span style="color:var(--ok)">✓ اتصال و کلید دسترسی درست است.</span>';
  } catch (e) { out.innerHTML = '<span class="err">✗ ' + esc(friendly(e)) + '</span>'; }
  btn.disabled = false;
}

/* ---------- رویدادها ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act; const id = el.dataset.id;
  if (act === 'nav') { location.hash = el.dataset.to; }
  else if (act === 'copy') { copyText(el.dataset.text || ''); }
  else if (act === 'open') { e.stopPropagation(); openUrl(el.dataset.url); }
  else if (act === 'tab') { ui.tab[id] = el.dataset.tab; render(); }
  else if (act === 'copy-md') { copyText(getRes(id).scenarioMd || ''); }
  else if (act === 'share-md') { const r = getRes(id); shareText((r.scenario && r.scenario.title) || 'سناریوی هوک‌لوم', r.scenarioMd || ''); }
  else if (act === 'refresh') { toast('در حال بروزرسانی…'); refreshJob(id).then(() => { softRender(); updateBadge(); }); }
  else if (act === 'refresh-all') { toast('در حال بروزرسانی…'); jobsList().filter((j) => j.status === 'running').reduce((p, j) => p.then(() => refreshJob(j.id)), Promise.resolve()).then(() => { softRender(); updateBadge(); }); }
  else if (act === 'reuse') { const j = getJob(id); if (j && j.brief) LS.set('hl_draft', j.brief); location.hash = '#/new'; }
  else if (act === 'delete-job') {
    if (confirm('این پروژه از فهرست گوشی حذف شود؟')) { saveJobs(jobsList().filter((x) => x.id !== id)); LS.del('hl_res_' + id); location.hash = '#/jobs'; }
  }
  else if (act === 'toggle-key') { const i = $('#s-key'); i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'نمایش' : 'پنهان'; }
  else if (act === 'save-settings') { saveSettings(readSettings()); toast('تنظیمات ذخیره شد ✓'); if (getSettings().key) location.hash = '#/new'; }
  else if (act === 'test') { testConnection(); }
  else if (act === 'clear-all') {
    if (confirm('همه پروژه‌های ذخیره‌شده پاک شود؟')) { jobsList().forEach((j) => LS.del('hl_res_' + j.id)); saveJobs([]); toast('پاک شد'); render(); }
  }
});
document.addEventListener('submit', (e) => { if (e.target.id === 'orderForm') { e.preventDefault(); submitOrder(e.target); } });
document.addEventListener('input', (e) => {
  const f = e.target.form;
  if (!f || f.id !== 'orderForm') return;
  e.target.classList.remove('bad');
  if (e.target.name === 'reels_to_analyze') $('#rv').textContent = fa(e.target.value);
  LS.set('hl_draft', collectForm(f));
});
setInterval(() => {
  $$('[data-since]').forEach((el) => {
    const s = Math.max(0, Math.floor((Date.now() - Number(el.dataset.since)) / 1000));
    el.textContent = fa(Math.floor(s / 60)) + ' دقیقه و ' + fa(s % 60) + ' ثانیه';
  });
}, 1000);

/* ---------- شروع ---------- */
onRoute();
updateBadge();
initPush();
refreshRunning();
})();
