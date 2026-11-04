/* Core: control sheet, settings, logging and small helpers. */

var TABS = {
  Run: ['No.', 'Workflow', 'Run now', 'Input (URL, if needed)', 'Last run', 'Result'],
  Settings: ['Key', 'Value', 'Notes'],
  Subscribers: ['ID', 'Email', 'Name', 'Source', 'Status', 'Consent', 'Signed up', 'Confirmed', 'Course step', 'Next send', 'Last click', 'Clicks', 'Interest', 'Scores', 'Is test'],
  Events: ['Time', 'Subscriber ID', 'Email', 'Type', 'Campaign', 'Message', 'Link', 'Detail'],
  Enquiries: ['ID', 'Received', 'Name', 'Email', 'Company', 'Message', 'Type', 'Summary', 'Auto reply sent', 'Replied', 'Reminder sent'],
  Sources: ['ID', 'Name', 'Kind', 'Target', 'Pattern', 'Guides affected', 'Last value', 'Last checked', 'Last changed', 'Status'],
  Claims: ['ID', 'Guide', 'Page', 'Claim', 'Source URL', 'Last verified', 'Recheck by', 'Cadence days', 'Status', 'Notes'],
  Queue: ['ID', 'Created', 'Workflow', 'Kind', 'Target', 'Subject', 'Draft', 'Status', 'Approved', 'Sent'],
  Log: ['Time', 'Workflow', 'Event', 'Detail']
};

var DEFAULT_SETTINGS = [
  ['owner_name', 'Archana Panda', 'Name used in email sign-offs'],
  ['owner_email', '', 'Address that receives reports, alerts and approvals. Leave empty to use the account running the scripts.'],
  ['sender_name', 'Archana Panda', 'Display name on outgoing email'],
  ['postal_address', '[Postal address required before sending to real subscribers]', 'CAN-SPAM requires a real postal address in marketing email footers'],
  ['ga4_property_id', '', 'Google Analytics 4 property ID (numbers only)'],
  ['webapp_url', '', 'Web app URL from Deploy > Manage deployments (ends in /exec).'],
  ['pages_url', 'https://archanacontent.github.io/content-marketing-automation-workflows/', 'Public pages on GitHub Pages. Email links open these pages, which then call the web app.'],
  ['site_url', 'https://archanacontent.github.io/', 'Portfolio home page'],
  ['github_owner', 'archanacontent', 'GitHub account that holds the guides'],
  ['guide_repos', 'nvd-cve-api-docs,medicaid-2027-implementation-guide,medically-frail-guide,openfda-drug-safety-guide,b2b-saas', 'Repositories checked by the content workflows'],
  ['gemini_model', 'gemini-flash-latest', 'Gemini model used for drafting and tagging'],
  ['course_interval_hours', '48', 'Hours between course emails'],
  ['test_mode', 'TRUE', 'TRUE sends only to subscribers marked as test'],
  ['enquiry_reminder_days', '3', 'Days before an unanswered enquiry triggers a reminder'],
  ['sunset_after_emails', '5', 'Emails without a click before the re-engagement email'],
  ['daily_send_cap', '80', 'Stops sending for the day at this count, below the Gmail limit']
];

function ss_() { return SpreadsheetApp.getActive(); }

function tab_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(name) {
  var sh = tab_(name), values = sh.getDataRange().getValues(), head = values.shift();
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
}

function append_(name, obj) {
  var sh = tab_(name);
  sh.appendRow(TABS[name].map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
  return sh.getLastRow();
}

function update_(name, row, obj) {
  var sh = tab_(name), head = TABS[name];
  Object.keys(obj).forEach(function (k) {
    var c = head.indexOf(k);
    if (c >= 0) sh.getRange(row, c + 1).setValue(obj[k]);
  });
}

function setting_(key) {
  var hit = rows_('Settings').filter(function (r) { return r.Key === key; })[0];
  var v = hit ? hit.Value : '';
  if (key === 'owner_email' && !v) v = Session.getEffectiveUser().getEmail();
  return v === undefined || v === null ? '' : String(v).trim();
}

function secret_(key) { return PropertiesService.getScriptProperties().getProperty(key) || ''; }

function log_(workflow, event, detail) {
  append_('Log', { Time: new Date(), Workflow: workflow, Event: event, Detail: typeof detail === 'string' ? detail : JSON.stringify(detail || '') });
}

function uid_(prefix) { return (prefix || '') + Utilities.getUuid().slice(0, 8); }

function sign_(text) {
  var raw = Utilities.computeHmacSha256Signature(text, secret_('CMA_SECRET'));
  return Utilities.base64EncodeWebSafe(raw).slice(0, 16);
}

function appUrl_() { return setting_('webapp_url') || ScriptApp.getService().getUrl() || ''; }

function link_(params) {
  var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var base = setting_('pages_url') ? setting_('pages_url').replace(/\/?$/, '/') + 'go/' : appUrl_();
  return base + '?' + q + '&s=' + sign_(q);
}

function verify_(e) {
  var p = e.parameter || {}, keys = Object.keys(p).filter(function (k) { return k !== 's' && k !== 'format'; });
  var order = (e.queryString || '').split('&').map(function (kv) { return kv.split('=')[0]; }).filter(function (k) { return keys.indexOf(k) >= 0; });
  var q = order.map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
  return p.s && p.s === sign_(q);
}

function esc_(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function fetchJson_(url, opts) {
  var res = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, opts || {}));
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('HTTP ' + code + ' from ' + url + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

/* Alerts only work when a person runs something from the sheet. Elsewhere they are skipped. */
function alert_(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (err) { log_('Info', 'message', msg); } }

function hours_(n) { return n * 3600 * 1000; }
function days_(n) { return n * 24 * 3600 * 1000; }
