/**
 * Hookloom API (Google Apps Script Web App)
 *
 * GET  ?key=<CALL_KEY>&job_id=<id>[&light=1]  -> job row as JSON (sheet chunks joined). Free: no n8n execution.
 * POST {"action":"notify","job_id":"<id>"}     -> sends the result email once per job/status (called by n8n at the end).
 *
 * Script properties (Project settings > Script properties):
 *   CALL_KEY      required. Same value as the app's access key (X-Call-Key).
 *   NOTIFY_EMAIL  optional. Defaults to the Google account that owns this script.
 */
const SHEET_ID = '1VcQDzCeH4U0d6WCRJ2x7NGmhIb-2X1X28XHpL7-LJOQ';
const SHEET_NAME = 'jobs';

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function s_(v) { return v === undefined || v === null ? '' : String(v); }

function findRow_(jobId) {
  if (!jobId) return null;
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const hit = sh.getRange('A:A').createTextFinder(String(jobId)).matchEntireCell(true).findNext();
  if (!hit) return null;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const vals = sh.getRange(hit.getRow(), 1, 1, headers.length).getValues()[0];
  const row = {};
  headers.forEach(function (h, i) { if (h) row[h] = vals[i]; });
  return row;
}

function join_(row, base, n) {
  let t = s_(row[base]);
  for (let i = 2; i <= n; i++) t += s_(row[base + '_' + i]);
  return t;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const key = prop_('CALL_KEY');
  if (!key || p.key !== key) return json_({ error: 'unauthorized' });
  const row = findRow_(p.job_id);
  if (!row) return json_({ found: false });
  const out = { found: true, job_id: s_(row.job_id), status: s_(row.status), stage: s_(row.stage), progress: Number(row.progress) || 0, message: s_(row.message), error: s_(row.error) };
  if (s_(p.light) === '1') return json_(out);
  out.brief_json = s_(row.brief_json);
  out.hashtags_json = s_(row.hashtags_json);
  out.reels_json = s_(row.reels_json);
  out.patterns_json = join_(row, 'patterns_json', 3);
  out.scenario_json = join_(row, 'scenario_json', 4);
  out.scenario_markdown = join_(row, 'scenario_markdown', 3);
  out.council_json = join_(row, 'council_json', 2);
  return json_(out);
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'bad json' }); }
  if (b.action !== 'notify') return json_({ ok: false, error: 'unknown action' });
  const row = findRow_(b.job_id);
  if (!row) return json_({ ok: false, error: 'not found' });
  const status = s_(row.status);
  if (status !== 'done' && status !== 'failed') return json_({ ok: false, error: 'not finished' });
  const props = PropertiesService.getScriptProperties();
  const mark = 'notified_' + s_(row.job_id) + '_' + status;
  if (props.getProperty(mark)) return json_({ ok: true, duplicate: true });
  props.setProperty(mark, '1');

  const to = prop_('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
  const name = s_(row.business_name) || s_(row.job_id);
  let subject, body;
  if (status === 'done') {
    let title = '';
    try { title = JSON.parse(join_(row, 'scenario_json', 4)).title || ''; } catch (x) { title = ''; }
    subject = 'Hookloom - سناریوی ریل آماده شد: ' + (title || name);
    body = 'سناریوی ریل برای «' + name + '» آماده است.\n'
      + 'شناسه سفارش: ' + s_(row.job_id) + '\n'
      + (s_(row.drive_folder_url) ? 'ویدیوهای مرجع: ' + s_(row.drive_folder_url) + '\n' : '')
      + '\nمتن کامل سناریو:\n\n' + join_(row, 'scenario_markdown', 3).slice(0, 60000);
  } else {
    subject = 'Hookloom - پردازش سفارش ناموفق بود: ' + name;
    body = 'پردازش سفارش «' + name + '» متوقف شد.\n'
      + 'شناسه سفارش: ' + s_(row.job_id) + '\n'
      + 'پیام: ' + s_(row.message) + '\n'
      + 'جزئیات: ' + s_(row.error);
  }
  MailApp.sendEmail(to, subject, body);
  return json_({ ok: true });
}
