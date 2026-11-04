/* Built from apps-script/src by build/build_bundle.py. Edit the source files, not this one. */
(function () {
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

/* Shared email sending, pre-send QA (workflow 14) and Gemini. */

var SPAM_WORDS = ['act now', 'free money', 'guaranteed', '100% free', 'risk-free', 'click here', 'winner', 'urgent', 'limited time', 'cash bonus', 'no obligation', 'buy now'];

function suppressed_(email) {
  return rows_('Subscribers').some(function (r) {
    return String(r.Email).toLowerCase() === String(email).toLowerCase() && (r.Status === 'unsubscribed' || r.Status === 'sunset');
  });
}

function sentToday_() {
  var start = new Date(); start.setHours(0, 0, 0, 0);
  return rows_('Events').filter(function (r) { return r.Type === 'sent' && new Date(r.Time) >= start; }).length;
}

/* Workflow 14: pre-send QA. Returns a list of problems; an empty list means safe to send. */
function qa_(msg) {
  var problems = [], html = msg.html || '';
  if (!msg.subject || msg.subject.length < 4) problems.push('Subject missing or too short');
  if (msg.subject && msg.subject.length > 78) problems.push('Subject longer than 78 characters');
  if (/\{\{[^}]*\}\}|\[\[[^\]]*\]\]|undefined|NaN/.test(msg.subject + html)) problems.push('Unfilled merge field or broken value');
  if (msg.marketing && html.indexOf('a=unsub') < 0) problems.push('Unsubscribe link missing');
  if (msg.marketing && html.indexOf(setting_('postal_address')) < 0) problems.push('Postal address missing from footer');
  var lower = (msg.subject + ' ' + html).toLowerCase();
  SPAM_WORDS.forEach(function (w) { if (lower.indexOf(w) >= 0) problems.push('Spam-trigger wording: "' + w + '"'); });
  var links = (html.match(/href="([^"]+)"/g) || []).map(function (h) { return h.slice(6, -1); });
  links.forEach(function (u) {
    if (!/^https:\/\//.test(u) && !/^mailto:/.test(u)) problems.push('Link is not https: ' + u);
  });
  if (msg.checkLinks) {
    links.filter(function (u) { return u.indexOf(appUrl_()) !== 0 && /^https/.test(u); }).forEach(function (u) {
      try {
        var code = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, method: 'get' }).getResponseCode();
        if (code >= 400) problems.push('Broken link (' + code + '): ' + u);
      } catch (err) { problems.push('Link failed to load: ' + u); }
    });
  }
  return problems;
}

/* Send one email after suppression, test-mode, cap and QA checks. */
function send_(msg) {
  var to = msg.to;
  if (msg.marketing && suppressed_(to)) { log_(msg.workflow, 'skipped', to + ' is unsubscribed or sunset'); return false; }
  if (msg.marketing && setting_('test_mode') === 'TRUE' && !msg.isTest) { log_(msg.workflow, 'skipped', to + ' is not a test subscriber and test mode is on'); return false; }
  if (sentToday_() >= Number(setting_('daily_send_cap') || 80)) { log_(msg.workflow, 'paused', 'Daily send cap reached'); return false; }
  var problems = qa_(msg);
  if (problems.length) {
    log_(msg.workflow, 'blocked by QA', { to: to, subject: msg.subject, problems: problems });
    return false;
  }
  MailApp.sendEmail({ to: to, subject: msg.subject, htmlBody: msg.html, name: setting_('sender_name'), replyTo: setting_('owner_email') });
  append_('Events', { Time: new Date(), 'Subscriber ID': msg.subscriberId || '', Email: to, Type: 'sent', Campaign: msg.campaign || msg.workflow, Message: msg.messageId || msg.subject });
  return true;
}

/* Brand template for every outgoing email.
   o: label, title, hook, paras[], html (raw block), buttons[{text,url}], progress {step,total}, subscriberId, wide. */
function email_(o) {
  var gold = '#D9A441', ink = '#17181B', mute = '#6B6862';
  var bar = '';
  if (o.progress) {
    var cells = '';
    for (var i = 1; i <= o.progress.total; i++) cells += '<td style="padding:0 3px 0 0"><div style="height:4px;border-radius:2px;background:' + (i <= o.progress.step ? gold : '#3A3B40') + '"></div></td>';
    bar = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0"><tr>' + cells + '</tr></table>';
  }
  var head = '<tr><td style="background:#131416;padding:30px 30px 28px;border-radius:14px 14px 0 0">' +
    '<div style="font:700 11px/1 Arial,sans-serif;letter-spacing:.18em;color:' + gold + '">ARCHANA PANDA</div>' +
    (o.label ? '<div style="margin-top:14px;display:inline-block;border:1px solid #3A3B40;border-radius:999px;padding:5px 12px;font:600 12px/1 Arial,sans-serif;color:#C9C4BA">' + esc_(o.label) + '</div>' : '') +
    '<h1 style="margin:16px 0 0;font:800 26px/1.22 Arial,Helvetica,sans-serif;color:#F4F0E8;letter-spacing:-.01em">' + esc_(o.title) + '</h1>' + bar + '</td></tr>';
  var body = '';
  if (o.hook) body += '<p style="margin:0 0 16px;font:600 18px/1.5 Arial,sans-serif;color:' + ink + ';border-left:3px solid ' + gold + ';padding-left:14px">' + esc_(o.hook) + '</p>';
  (o.paras || []).forEach(function (t) { body += '<p style="margin:0 0 14px;font:400 15.5px/1.65 Arial,sans-serif;color:#2B2C30">' + esc_(t) + '</p>'; });
  if (o.html) body += o.html;
  (o.buttons || []).forEach(function (b, i) {
    var primary = i === 0;
    body += '<a href="' + b.url + '" style="display:block;margin:' + (i === 0 ? '22px' : '10px') + ' 0 0;padding:15px 18px;border-radius:999px;text-align:center;text-decoration:none;font:700 15px/1.3 Arial,sans-serif;' +
      (primary ? 'background:' + gold + ';color:' + ink + ';border:2px solid ' + gold : 'background:#ffffff;color:' + ink + ';border:2px solid ' + ink) + '">' + esc_(b.text) + ' &rarr;</a>';
  });
  if (o.signoff !== false) body += '<p style="margin:28px 0 0;font:700 15px/1.4 Arial,sans-serif;color:' + ink + '">' + esc_(setting_('owner_name')) + '<br><span style="font-weight:400;font-size:13px;color:' + mute + '">Senior Technical Writer | B2B Content Marketing</span></p>';
  var foot = '';
  if (o.subscriberId) {
    foot = '<tr><td style="padding:18px 30px 0;font:400 12px/1.6 Arial,sans-serif;color:' + mute + ';text-align:center">You are receiving this because you signed up for the launch course.<br>' +
      '<a href="' + link_({ a: 'unsub', id: o.subscriberId }) + '" style="color:' + mute + '">Unsubscribe in one click</a> | ' + esc_(setting_('postal_address')) + '</td></tr>';
  }
  return '<div style="margin:0;padding:24px 10px;background:#EFEBE3"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:' + (o.wide ? 680 : 580) + 'px;margin:0 auto">' + head +
    '<tr><td style="background:#ffffff;padding:30px;border-radius:0 0 14px 14px">' + body + '</td></tr>' + foot + '</table></div>';
}

/* Internal emails (alerts, drafts, reports) use the same template without the sign-off. */
function frame_(html, opts) {
  opts = opts || {};
  return email_({ label: opts.label || 'Automation', title: opts.title || 'Update', html: html, signoff: false, wide: opts.wide, subscriberId: opts.subscriberId });
}

/* Gemini call. Returns text, or parsed JSON when opts.json is true. */
function gemini_(prompt, opts) {
  opts = opts || {};
  var key = secret_('GEMINI_API_KEY');
  if (!key) throw new Error('Gemini key not set. Use Automation > Set Gemini key in the control sheet.');
  var models = [setting_('gemini_model') || 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  var body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: opts.temperature === undefined ? 0.4 : opts.temperature } };
  if (opts.json) body.generationConfig.responseMimeType = 'application/json';
  /* Busy or rate-limited responses (429, 500, 503) are retried with a pause, then the lighter model is tried. */
  var data = null, last = '';
  for (var m = 0; m < models.length && !data; m++) {
    for (var attempt = 0; attempt < 3 && !data; attempt++) {
      var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[m] + ':generateContent', {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(body), headers: { 'x-goog-api-key': key }, muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code < 300) { data = JSON.parse(res.getContentText()); break; }
      last = 'HTTP ' + code + ' from ' + models[m] + ': ' + res.getContentText().slice(0, 200);
      if ([429, 500, 503].indexOf(code) < 0) throw new Error(last);
      Utilities.sleep(2000 * (attempt + 1));
    }
  }
  if (!data) throw new Error('Gemini is busy. Try again in a few minutes. ' + last);
  var text = (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map(function (p) { return p.text || ''; }).join('');
  return opts.json ? JSON.parse(text) : text;
}

/* House writing rules passed to Gemini whenever it drafts copy. */
var WRITING_RULES = [
  'Write in plain, professional British-neutral English for B2B readers.',
  'Write every heading and email subject in Title Case, capitalising every word.',
  'Lead with the reader\'s problem, then the practical fix.',
  'No em dashes, no semicolons, no exclamation marks, no emojis, no hashtags unless asked.',
  'Do not start sentences with This, These or That.',
  'Avoid hype words: unlock, leverage, seamless, game-changer, cutting-edge, robust, elevate, delve, harness, streamline.',
  'Vary sentence length. Keep every sentence under 35 words.',
  'Never invent numbers, quotes or results. Use only facts given in the input.'
].join('\n');

/* Setup, menu, triggers and the scheduler that runs each workflow. */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Automation')
    .addItem('1. Set up control sheet', 'cmaSetup')
    .addItem('2. Set Gemini key', 'cmaSetGeminiKey')
    .addItem('3. Add test subscribers', 'cmaTestSubscribers')
    .addSeparator()
    .addItem('Run a workflow now', 'cmaRunNow')
    .addItem('Load latest version from GitHub', 'cmaRefresh')
    .addToUi();
}

function setup() {
  Object.keys(TABS).forEach(tab_);
  var first = ss_().getSheetByName('Sheet1');
  if (first && ss_().getSheets().length > 1 && first.getLastRow() === 0) ss_().deleteSheet(first);
  var have = rows_('Settings').map(function (r) { return r.Key; });
  DEFAULT_SETTINGS.forEach(function (s) { if (have.indexOf(s[0]) < 0) append_('Settings', { Key: s[0], Value: s[1], Notes: s[2] }); });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CMA_SECRET')) props.setProperty('CMA_SECRET', Utilities.getUuid() + Utilities.getUuid());
  seedSources_();
  seedClaims_();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cmaRunHourly').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('cmaRunDaily').timeBased().atHour(7).everyDays(1).create();
  ScriptApp.newTrigger('cmaRunWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  fillRunTab_();
  log_('Setup', 'complete', 'Tabs, settings, sources, claims and triggers are in place');
  alert_('Setup complete.');
}

function setGeminiKey() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Gemini API key', 'Paste the key from aistudio.google.com/apikey. It is stored privately in this script project and never written to the sheet.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', r.getResponseText().trim());
  try {
    var reply = gemini_('Reply with the single word: ready');
    ui.alert('Key saved and tested. Gemini replied: ' + reply.trim());
  } catch (err) {
    ui.alert('Key saved, but the test call failed: ' + err.message);
  }
}

function refreshed() {
  alert_('Latest workflow version loaded from GitHub.');
}

/* Scheduler. Each job is isolated so one failure never stops the rest. */
function safe_(name, fn) {
  try { fn(); } catch (err) { log_(name, 'error', err.message); }
}

function runHourly() {
  safe_('Run tab', processRunTab_);
  safe_('Sign-up confirmations', remindUnconfirmed_);
  safe_('Course', sendCourseDue_);
  safe_('Re-engagement and sunset', reengage_);
  safe_('Enquiry reminders', remindEnquiries_);
  safe_('Approved queue', sendApproved_);
}

function runDaily() {
  safe_('Source change watch', watchSources_);
  safe_('Claims register', checkClaims_);
  safe_('Publishing QA', publishingQa_);
  safe_('New content', detectNewContent_);
  if (new Date().getDate() === 1) safe_('Monthly content health', monthlyHealth_);
}

function runWeekly() {
  safe_('Weekly performance report', weeklyReport_);
  safe_('Email performance report', emailReport_);
  safe_('Course post-mortem', coursePostMortem_);
}

var MANUAL = {
  '1': ['Source change watch', function () { return watchSources_(); }],
  '2': ['Claims register and annual versioning', function () { return checkClaims_(true); }],
  '3': ['Publishing QA', function () { return publishingQa_(true); }],
  '4': ['Metadata and internal links', function (input) { return metadataSuggest_(input); }],
  '5': ['Distribution drafts', function (input) { return distributionDrafts_(input ? contentFromUrl_(input) : null); }],
  '8': ['Course: send due emails', function () { return sendCourseDue_(true); }],
  '11': ['Re-engagement and sunset', function () { return reengage_(); }],
  '13': ['New content broadcast draft', function (input) { return broadcastDraft_(input ? contentFromUrl_(input) : null); }],
  '15': ['Enquiry reminders', function () { return remindEnquiries_(); }],
  '16': ['Weekly performance report', function () { return weeklyReport_(); }],
  '17': ['Email performance report', function () { return emailReport_(); }],
  '18': ['Monthly content health', function () { return monthlyHealth_(); }],
  '19': ['Course post-mortem', function () { return coursePostMortem_(true); }],
  'q': ['Send approved items in the queue', function () { return sendApproved_(); }],
  'a': ['Add test subscribers', function () { return addTestSubscribers(); }],
  't': ['Test journey: run the whole course for the test subscribers', function () { return testJourney_(); }]
};

function runNow() {
  var ui = SpreadsheetApp.getUi();
  var list = Object.keys(MANUAL).map(function (k) { return k + ' - ' + MANUAL[k][0]; }).join('\n');
  var r = ui.prompt('Run a workflow now', 'Type the number:\n' + list, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var job = MANUAL[r.getResponseText().trim()];
  if (!job) { ui.alert('No workflow with that number.'); return; }
  try {
    var out = job[1]();
    log_(job[0], 'manual run', out || 'done');
    ui.alert(job[0] + ' finished. ' + (out ? String(out).slice(0, 600) : 'See the Log tab for details.'));
  } catch (err) {
    log_(job[0], 'error', err.message);
    ui.alert(job[0] + ' failed: ' + err.message);
  }
}

/* Run tab: tick "Run now" on any row and the workflow runs within ten minutes, no menu needed. */
var NEEDS_URL = ['4', '5', '13'];

function fillRunTab_() {
  var have = rows_('Run').map(function (r) { return String(r['No.']); });
  Object.keys(MANUAL).forEach(function (k) {
    if (have.indexOf(k) < 0) append_('Run', { 'No.': k, Workflow: MANUAL[k][0], 'Run now': false, 'Input (URL, if needed)': NEEDS_URL.indexOf(k) >= 0 ? 'Paste a page URL here' : '' });
  });
  var sh = tab_('Run');
  sh.getRange(2, TABS.Run.indexOf('Run now') + 1, Math.max(sh.getLastRow() - 1, 1), 1).insertCheckboxes();
  sh.setColumnWidth(2, 320);
}

function processRunTab_() {
  rows_('Run').forEach(function (r) {
    if (!isTrue_(r['Run now'])) return;
    update_('Run', r._row, { 'Run now': false, 'Last run': new Date(), Result: 'Running' });
    var job = MANUAL[String(r['No.'])], input = String(r['Input (URL, if needed)'] || '');
    if (!/^https?:\/\//.test(input)) input = '';
    var out;
    try {
      if (!job) throw new Error('Unknown workflow number');
      if (NEEDS_URL.indexOf(String(r['No.'])) >= 0 && !input) throw new Error('Paste a page URL in the Input column first');
      out = job[1](input) || 'Done';
    } catch (err) { out = 'Error: ' + err.message; }
    update_('Run', r._row, { Result: String(out).slice(0, 500) });
    log_(job ? job[0] : 'Run tab', 'run from Run tab', out);
  });
}

/* Course content for the email journey. Copy lives here so it can be
   reviewed and changed without touching the workflow logic.
   Rules: Title Case subjects, a pain-point hook first, 50 to 60 words of body. */

var PLAYBOOK = 'https://archanacontent.github.io/b2b-saas/';

var TOPICS = {
  research: 'Market And Buyer Research',
  positioning: 'Positioning And Messaging',
  launch: 'Launch Planning And Content',
  sales: 'Sales Enablement And Performance'
};

/* Each lesson: label, subject, body, and CTA buttons tagged with a topic for interest scoring. */
var COURSE = [
  {
    step: 1, id: 'lesson-1', label: 'Welcome | Lesson 1 Of 5',
    subject: 'Lesson 1: Prove The Demand Before You Plan The Launch',
    body: [
      'Most stalled launches were planned around a problem nobody measured.',
      'Before you write a positioning line, find out how many companies feel the pain and what their current workaround costs them. The research module gives you a weighted scorecard, so the go or no-go call rests on evidence instead of instinct.'
    ],
    links: [
      { text: 'Read The Research Module', url: PLAYBOOK + 'market-research/', topic: 'research' },
      { text: 'Download The Launch Workbook', url: PLAYBOOK + 'templates/launch-playbook-workbook.xlsx', topic: 'launch' }
    ]
  },
  {
    step: 2, id: 'lesson-2', label: 'Lesson 2 Of 5',
    subject: 'Lesson 2: Name The Buyer Before You Write A Word',
    body: [
      'A launch aimed at every company reaches no one in particular.',
      'Sales chases accounts that will never buy, and the copy fits nobody on the buying committee. An ideal customer profile settles which companies to pursue. Personas show who signs the contract and who uses the product every day, and each needs a different reason to say yes.'
    ],
    links: [
      { text: 'Read The ICP And Personas Module', url: PLAYBOOK + 'icp-and-personas/', topic: 'research' },
      { text: 'Read The Competitive Intelligence Module', url: PLAYBOOK + 'competitive-intelligence/', topic: 'sales' }
    ]
  },
  {
    step: 3, id: 'lesson-3', label: 'Lesson 3 Of 5',
    subject: 'Lesson 3: Give Buyers One Reason To Choose You',
    body: [
      'If the website says one thing and the sales deck says another, buyers leave the first call knowing the category and little else.',
      'Positioning fixes the reason to buy before anyone writes copy. A message hierarchy then gives every team the same words, from the homepage hero to the renewal call.'
    ],
    links: [
      { text: 'Read The Positioning Module', url: PLAYBOOK + 'positioning-and-messaging/', topic: 'positioning' },
      { text: 'Download The Positioning Template', url: PLAYBOOK + 'templates/04-positioning-and-messaging.docx', topic: 'positioning' }
    ]
  },
  {
    step: 4, id: 'lesson-4', label: 'Lesson 4 Of 5',
    subject: 'Lesson 4: Plan The Launch And Build Every Asset From One Brief',
    body: [
      'Launch content usually gets written last and in a hurry, so the product page promises one outcome and the announcement leads with another.',
      'A go-to-market plan fixes who delivers what by which date. The content kit then builds every asset from the message hierarchy, and the buyer hears one promise everywhere.'
    ],
    links: [
      { text: 'Read The Go-To-Market Plan Module', url: PLAYBOOK + 'go-to-market-and-launch-plan/', topic: 'launch' },
      { text: 'Read The Launch Content Module', url: PLAYBOOK + 'launch-content-kit/', topic: 'launch' }
    ]
  },
  {
    step: 5, id: 'lesson-5', label: 'Final Lesson | 5 Of 5',
    subject: 'Lesson 5: Prepare Sales For Day One And Measure What Moved',
    body: [
      'A rep\'s first week with a new product decides how they sell it for the next year, and a recorded demo rarely covers it.',
      'The enablement module gives reps a deck outline and answers to the objections they will hear. Agree on targets before launch day, so the 90-day review measures real progress.'
    ],
    links: [
      { text: 'Read The Sales Enablement Module', url: PLAYBOOK + 'sales-enablement/', topic: 'sales' },
      { text: 'Read The Performance Module', url: PLAYBOOK + 'performance-and-optimisation/', topic: 'sales' }
    ]
  }
];

/* Workflow 10: next-best email, chosen by the subscriber's strongest topic. */
var NEXT_BEST = {
  research: {
    subject: 'Put Your Research To Work',
    body: ['Research that never reaches a campaign brief ends up in a folder nobody opens.', 'You spent most of the course on the research lessons, so the demand generation module is the natural next step. It shows how to aim campaigns at the accounts you scored highest and keep every message tied to your positioning.'],
    url: PLAYBOOK + 'demand-generation-support/', label: 'Read The Demand Generation Module'
  },
  positioning: {
    subject: 'Keep Your Positioning Intact At Launch',
    body: ['Positioning drifts the moment five people write launch assets from five different briefs.', 'You spent most of the course on positioning, so the launch content kit comes next. It shows how to build every launch asset from one message hierarchy, so the promise holds wherever a buyer happens to meet it.'],
    url: PLAYBOOK + 'launch-content-kit/', label: 'Read The Launch Content Module'
  },
  launch: {
    subject: 'Set The Targets Before Launch Day',
    body: ['A launch without agreed targets turns the 90-day review into a debate about what success meant.', 'You spent most of the course on launch planning, so the performance module is the next step. It helps you set targets with sales and product before launch day and feed the results back into the next plan.'],
    url: PLAYBOOK + 'performance-and-optimisation/', label: 'Read The Performance Module'
  },
  sales: {
    subject: 'See The Sales Deck Filled In',
    body: ['Reps struggle to picture a deck outline until they see one filled in for a worked example.', 'You spent most of the course on sales readiness, so the sample sales deck is the next step. It follows the enablement outline slide by slide, and you can download it as PowerPoint to adapt for your own product.'],
    url: PLAYBOOK + 'templates/sample-sales-deck.pdf', label: 'View The Sample Sales Deck'
  },
  none: {
    subject: 'Start With The Module Closest To Your Launch',
    body: ['A busy week can push a five-lesson course to the bottom of the inbox.', 'The playbook home page lists every module with a one-line summary, so you can pick up wherever your next launch needs help first. Each module links to blank templates you can download and fill in for your own product.'],
    url: PLAYBOOK, label: 'Open The Playbook'
  }
};

var REENGAGE = {
  subject: 'Should The Launch Course Emails Keep Coming?',
  body: ['An inbox full of emails you no longer read helps nobody, including the sender.', 'You have not opened a link from the last few emails, which is completely fine. If the launch course is still useful, tap the button and you will stay on the list. If not, do nothing and the emails will stop.'],
  label: 'Keep Me On The List'
};

var CONFIRM = {
  subject: 'Confirm Your Sign-Up For The Launch Course',
  reminderSubject: 'Your Launch Course Is Waiting For One Tap',
  hook: 'Course emails sent to an unchecked address end up in spam or nowhere at all, so one quick check comes first.',
  reminderHook: 'Your sign-up is still waiting, and the course cannot start until the address is confirmed.',
  body: 'Confirm your email with the button below and lesson one arrives straight away. Five lessons follow, one every two days. If you did not sign up, ignore this email and nothing else will arrive.',
  label: 'Confirm My Email'
};

var ENQUIRY_REPLY = {
  subject: 'Thanks For Your Message',
  body: ['A message sent through a portfolio site often disappears without a reply, so here is confirmation that yours has arrived.', 'I read every enquiry myself and will reply personally within two working days. Until then, the three samples below are the closest match to the work you described in your message.']
};

/* Email journey: workflows 6 to 15. */

/* ---------- Web app router ---------- */

/* Requests from the public pages on GitHub Pages ask for JSON (format=json).
   Those pages call the web app without Google sign-in cookies, so visitors signed in
   to several Google accounts never hit Google's "unable to open the file" error. */
var JSON_MODE = false;

function doGet(e) {
  var p = (e && e.parameter) || {};
  JSON_MODE = p.format === 'json';
  var a = p.a || 'signup';
  if (a === 'signup') return page_('Launch A B2B SaaS Product In Five Emails', signupForm_(p.src || 'direct'));
  if (a === 'enquiry') return page_('Work With Archana', enquiryForm_());
  if (!verify_(e)) return page_('Link Expired', '<p>Link not valid. If you copied it, check that it came through in full.</p>');
  if (a === 'confirm') return confirm_(p.id);
  if (a === 'c') return click_(p);
  if (a === 'unsub') return unsubscribe_(p.id);
  if (a === 'keep') return keep_(p.id);
  return page_('Not Found', '<p>Nothing here.</p>');
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  JSON_MODE = p.format === 'json';
  if (p.website) return page_('Thanks', '<p>Thanks.</p>');
  if (p.form === 'signup') return signup_(p);
  if (p.form === 'enquiry') return enquiry_(p);
  return page_('Not Found', '<p>Nothing here.</p>');
}

function page_(title, inner) {
  if (JSON_MODE) {
    var text = String(inner).replace(/<form[\s\S]*<\/form>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return ContentService.createTextOutput(JSON.stringify({ title: title, text: text })).setMimeType(ContentService.MimeType.JSON);
  }
  var html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc_(title) + '</title>' +
    '<style>body{margin:0;background:#131416;color:#EFEBE3;font:16px/1.6 Inter,Arial,sans-serif}main{max-width:520px;margin:0 auto;padding:40px 18px}' +
    'h1{font:700 28px/1.2 Arial,sans-serif;margin:0 0 14px}p{color:rgba(239,235,227,.78)}label{display:block;margin:16px 0 6px;font-weight:600}' +
    'input,textarea,select{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #2E2F33;background:#1B1C1F;color:#EFEBE3;font:inherit}' +
    '.chk{display:flex;gap:10px;align-items:flex-start;margin-top:16px;font-weight:400}.chk input{width:auto;margin-top:5px}' +
    'button{margin-top:22px;width:100%;padding:14px;border:0;border-radius:999px;background:#D9A441;color:#131416;font:700 16px Arial,sans-serif}' +
    '.hp{position:absolute;left:-9999px}a{color:#D9A441}</style></head><body><main><h1>' + esc_(title) + '</h1>' + inner + '</main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Workflow 6: sign-up and double opt-in ---------- */

function signupForm_(src) {
  return '<p>Most B2B SaaS launches stall on gaps nobody planned for. The course walks through each stage, from proving demand to the 90-day review, in five short lessons sent every two days.</p>' +
    '<form method="post" action="' + appUrl_() + '" target="_top"><input type="hidden" name="form" value="signup"><input type="hidden" name="src" value="' + esc_(src) + '">' +
    '<input class="hp" name="website" tabindex="-1" autocomplete="off">' +
    '<label for="n">First Name</label><input id="n" name="name" required maxlength="60">' +
    '<label for="e">Work Email</label><input id="e" name="email" type="email" required maxlength="120">' +
    '<label class="chk"><input type="checkbox" name="consent" value="yes" required> I agree to receive the course and occasional updates. I can unsubscribe at any time.</label>' +
    '<button type="submit">Start The Course</button></form>';
}

function signup_(p) {
  var email = String(p.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || p.consent !== 'yes') return page_('Check Your Details', '<p>Add a valid email and tick the consent box.</p>');
  var existing = rows_('Subscribers').filter(function (r) { return String(r.Email).toLowerCase() === email; })[0];
  if (existing && existing.Status === 'active') return page_('Already Signed Up', '<p>You are already on the course.</p>');
  var id = existing ? existing.ID : uid_('s');
  if (!existing) {
    append_('Subscribers', { ID: id, Email: email, Name: String(p.name || '').trim().slice(0, 60), Source: p.src || 'direct', Status: 'pending', Consent: 'Form consent ' + new Date().toISOString(), 'Signed up': new Date(), 'Course step': 0, Clicks: 0, Scores: '{}', 'Is test': isTestAddress_(email) });
  }
  sendConfirmation_(id, false);
  return page_('Check Your Inbox', '<p>Confirmation email on its way. Tap the button inside it to start the course.</p>');
}

function isTestAddress_(email) {
  var owner = setting_('owner_email').toLowerCase().split('@');
  var e = email.toLowerCase().split('@');
  return owner.length === 2 && e[1] === owner[1] && e[0].split('+')[0] === owner[0].split('+')[0];
}

function sub_(id) { return rows_('Subscribers').filter(function (r) { return r.ID === id; })[0]; }

function sendConfirmation_(id, reminder) {
  var s = sub_(id);
  var html = email_({ label: 'Launch Course', title: reminder ? CONFIRM.reminderSubject : CONFIRM.subject, hook: reminder ? CONFIRM.reminderHook : CONFIRM.hook, paras: [CONFIRM.body],
    buttons: [{ text: CONFIRM.label, url: link_({ a: 'confirm', id: id }) }] });
  var ok = send_({ to: s.Email, subject: reminder ? CONFIRM.reminderSubject : CONFIRM.subject, html: html, workflow: 'Sign-up', campaign: 'confirmation', subscriberId: id, isTest: isTrue_(s['Is test']) });
  if (ok && reminder) append_('Events', { Time: new Date(), 'Subscriber ID': id, Email: s.Email, Type: 'confirm reminder', Campaign: 'confirmation' });
}

function remindUnconfirmed_() {
  var reminded = rows_('Events').filter(function (r) { return r.Type === 'confirm reminder'; }).map(function (r) { return r['Subscriber ID']; });
  rows_('Subscribers').forEach(function (s) {
    if (s.Status !== 'pending') return;
    var age = Date.now() - new Date(s['Signed up']).getTime();
    if (age > days_(7)) update_('Subscribers', s._row, { Status: 'expired' });
    else if (age > hours_(24) && reminded.indexOf(s.ID) < 0) sendConfirmation_(s.ID, true);
  });
}

function confirm_(id) {
  var s = sub_(id);
  if (!s) return page_('Not Found', '<p>Sign-up not found.</p>');
  if (s.Status !== 'active') {
    update_('Subscribers', s._row, { Status: 'active', Confirmed: new Date() });
    append_('Events', { Time: new Date(), 'Subscriber ID': id, Email: s.Email, Type: 'confirmed', Campaign: 'course' });
    sendLesson_(sub_(id), 1);
  }
  return page_('You Are In', '<p>Lesson 1 is on its way to your inbox.</p>');
}

/* ---------- Workflows 7 and 8: welcome and the course sequence ---------- */

function lessonHtml_(s, lesson) {
  return email_({ label: lesson.label, title: lesson.subject.replace(/^Lesson \d: /, ''), hook: lesson.body[0], paras: lesson.body.slice(1), progress: { step: lesson.step, total: 5 }, subscriberId: s.ID,
    buttons: lesson.links.map(function (l) { return { text: l.text, url: link_({ a: 'c', id: s.ID, m: lesson.id, t: l.topic, u: l.url }) }; }) });
}

function sendLesson_(s, step) {
  var lesson = COURSE[step - 1];
  var ok = send_({ to: s.Email, subject: lesson.subject, html: lessonHtml_(s, lesson), workflow: step === 1 ? 'Welcome' : 'Course', campaign: 'course', messageId: lesson.id, subscriberId: s.ID, marketing: true, isTest: isTrue_(s['Is test']) });
  if (ok) update_('Subscribers', s._row, { 'Course step': step, 'Next send': new Date(Date.now() + hours_(Number(setting_('course_interval_hours') || 48))) });
  return ok;
}

function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function sendCourseDue_(force) {
  var sent = 0;
  rows_('Subscribers').forEach(function (s) {
    if (s.Status !== 'active') return;
    var step = Number(s['Course step'] || 0);
    var due = force || (s['Next send'] && new Date(s['Next send']).getTime() <= Date.now());
    if (!due) return;
    if (step >= 1 && step < 5) { if (sendLesson_(s, step + 1)) sent++; }
    else if (step === 5) { if (sendNextBest_(s)) sent++; }
  });
  return sent + ' email(s) sent';
}

/* ---------- Workflow 9: click tracking and interest scoring ---------- */

function click_(p) {
  var s = sub_(p.id), url = p.u || PLAYBOOK;
  if (s) recordClick_(s, p, p.t || '');
  var safe = /^https:\/\//.test(url) ? url : PLAYBOOK;
  if (JSON_MODE) return ContentService.createTextOutput(JSON.stringify({ redirect: safe })).setMimeType(ContentService.MimeType.JSON);
  return HtmlService.createHtmlOutput('<script>window.top.location.replace(' + JSON.stringify(safe) + ');</script><p style="font-family:Arial">Opening <a href="' + esc_(safe) + '" target="_top">' + esc_(safe) + '</a></p>');
}

function recordClick_(s, p, detail) {
  var scores = {};
  try { scores = JSON.parse(s.Scores || '{}'); } catch (err) { scores = {}; }
  if (p.t) scores[p.t] = (scores[p.t] || 0) + 1;
  /* Ties go to the topic clicked most recently. */
  var top = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a] || (b === p.t) - (a === p.t); })[0] || '';
  update_('Subscribers', s._row, { Clicks: Number(s.Clicks || 0) + 1, 'Last click': new Date(), Scores: JSON.stringify(scores), Interest: top });
  append_('Events', { Time: new Date(), 'Subscriber ID': s.ID, Email: s.Email, Type: 'click', Campaign: String(p.m || '').indexOf('lesson') === 0 ? 'course' : p.m, Message: p.m, Link: p.u || '', Detail: detail });
}

/* ---------- Test journey: runs the whole course for the test subscribers in one go ----------
   Real emails go to the test inboxes. Clicks are simulated from each test persona
   (the part after + in the address) and logged as "simulated test click". */
function testJourney_() {
  var tests = function () { return rows_('Subscribers').filter(function (s) { return isTrue_(s['Is test']) && s.Status === 'active'; }); };
  var persona = function (s) { var m = String(s.Email).match(/\+([a-z]+)@/); return m ? m[1] : ''; };
  for (var round = 0; round < 6; round++) {
    var before = tests().map(function (s) { return s.ID + ':' + s['Course step']; }).join(',');
    tests().forEach(function (s) {
      var step = Number(s['Course step'] || 0);
      if (step >= 1 && step < 5) sendLesson_(s, step + 1);
      else if (step === 5) sendNextBest_(s);
    });
    tests().forEach(function (s) {
      var step = Number(s['Course step'] || 0), who = persona(s);
      if (step < 2 || step > 5 || who === 'silent') return;
      COURSE[step - 1].links.forEach(function (l) {
        if (l.topic === who) recordClick_(sub_(s.ID), { m: COURSE[step - 1].id, t: l.topic, u: l.url }, 'simulated test click');
      });
    });
    if (tests().map(function (s) { return s.ID + ':' + s['Course step']; }).join(',') === before) break;
  }
  var re = reengage_();
  return 'Course, next-best emails and re-engagement sent to test subscribers. ' + re;
}

/* ---------- Workflow 10: next-best email ---------- */

function sendNextBest_(s) {
  var pick = NEXT_BEST[s.Interest] || NEXT_BEST.none;
  var html = email_({ label: 'Your Next Step', title: pick.subject, hook: pick.body[0], paras: pick.body.slice(1), subscriberId: s.ID,
    buttons: [{ text: pick.label, url: link_({ a: 'c', id: s.ID, m: 'next-best', t: s.Interest || 'none', u: pick.url }) }] });
  var ok = send_({ to: s.Email, subject: pick.subject, html: html, workflow: 'Next-best email', campaign: 'next-best', messageId: 'next-best-' + (s.Interest || 'none'), subscriberId: s.ID, marketing: true, isTest: isTrue_(s['Is test']) });
  if (ok) update_('Subscribers', s._row, { 'Course step': 6, 'Next send': '' });
  return ok;
}

/* ---------- Workflow 11: re-engagement and sunset ---------- */

function reengage_() {
  var limit = Number(setting_('sunset_after_emails') || 5), events = rows_('Events'), out = [];
  rows_('Subscribers').forEach(function (s) {
    if (s.Status !== 'active') return;
    var since = s['Last click'] ? new Date(s['Last click']).getTime() : 0;
    var mine = events.filter(function (e) { return e['Subscriber ID'] === s.ID && new Date(e.Time).getTime() > since; });
    var sentSince = mine.filter(function (e) { return e.Type === 'sent' && e.Campaign !== 'confirmation' && e.Campaign !== 'reengage'; }).length;
    var check = mine.filter(function (e) { return e.Type === 'sent' && e.Campaign === 'reengage'; })[0];
    if (check && Date.now() - new Date(check.Time).getTime() > days_(7)) {
      update_('Subscribers', s._row, { Status: 'sunset' });
      append_('Events', { Time: new Date(), 'Subscriber ID': s.ID, Email: s.Email, Type: 'sunset', Campaign: 'reengage' });
      out.push(s.Email + ' sunset');
    } else if (!check && sentSince >= limit) {
      var body = email_({ label: 'Quick Check', title: REENGAGE.subject, hook: REENGAGE.body[0], paras: REENGAGE.body.slice(1), subscriberId: s.ID, buttons: [{ text: REENGAGE.label, url: link_({ a: 'keep', id: s.ID }) }] });
      if (send_({ to: s.Email, subject: REENGAGE.subject, html: body, workflow: 'Re-engagement', campaign: 'reengage', messageId: 'reengage', subscriberId: s.ID, marketing: true, isTest: isTrue_(s['Is test']) })) out.push(s.Email + ' re-engagement sent');
    }
  });
  if (!out.length) {
    var waiting = rows_('Subscribers').filter(function (s) { return s.Status === 'active'; }).map(function (s) {
      var c = events.filter(function (e) { return e['Subscriber ID'] === s.ID && e.Campaign === 'reengage' && e.Type === 'sent'; }).pop();
      return c ? s.Email + ': re-engagement already sent ' + Utilities.formatDate(new Date(c.Time), Session.getScriptTimeZone(), 'd MMM HH:mm') + ', stops 7 days later unless they click' : '';
    }).filter(String);
    return waiting.length ? waiting.join('; ') : 'No subscribers due';
  }
  return out.join(', ');
}

function keep_(id) {
  var s = sub_(id);
  if (s) {
    update_('Subscribers', s._row, { Status: 'active', 'Last click': new Date() });
    append_('Events', { Time: new Date(), 'Subscriber ID': id, Email: s.Email, Type: 'click', Campaign: 'reengage', Message: 'reengage', Detail: 'kept' });
  }
  return page_('You Are Staying On The List', '<p>Thanks. You will keep getting the updates.</p>');
}

/* ---------- Workflow 12: unsubscribe and suppression ---------- */

function unsubscribe_(id) {
  var s = sub_(id);
  if (s && s.Status !== 'unsubscribed') {
    update_('Subscribers', s._row, { Status: 'unsubscribed', 'Next send': '' });
    append_('Events', { Time: new Date(), 'Subscriber ID': id, Email: s.Email, Type: 'unsubscribed', Campaign: 'all' });
  }
  return page_('You Are Unsubscribed', '<p>No more emails will be sent to this address.</p>');
}

/* ---------- Workflow 13: new content broadcast, sent only after approval ---------- */

function broadcastDraft_(item) {
  item = item || promptContent_();
  if (!item) return 'Cancelled';
  var draft = gemini_(WRITING_RULES + '\n\nWrite a short email (50 to 60 words) telling subscribers of a B2B SaaS launch course about a new piece of work. ' +
    'Open with one pain-point hook sentence about the reader problem it addresses, then say what they will find. Return JSON with keys subject (Title Case) and body (body as plain paragraphs separated by blank lines).\n\nTitle: ' + item.title + '\nURL: ' + item.url + '\nDescription: ' + item.description, { json: true });
  var topic = item.topic || 'none';
  append_('Queue', { ID: uid_('q'), Created: new Date(), Workflow: 'New content broadcast', Kind: 'broadcast', Target: JSON.stringify({ url: item.url, topic: topic }), Subject: draft.subject, Draft: draft.body, Status: 'awaiting approval', Approved: false });
  formatQueue_();
  notifyOwner_('Broadcast Draft Ready For Approval', 'A broadcast for "' + item.title + '" is waiting in the Queue tab. Edit the subject or draft if needed, then tick Approved to send it.');
  return 'Draft added to the Queue tab';
}

function sendApproved_() {
  var done = [];
  rows_('Queue').forEach(function (q) {
    if (q.Kind !== 'broadcast' || !isTrue_(q.Approved) || q.Status === 'sent') return;
    var target = JSON.parse(q.Target || '{}'), n = 0;
    rows_('Subscribers').forEach(function (s) {
      if (s.Status !== 'active') return;
      if (target.topic && target.topic !== 'none' && s.Interest && s.Interest !== target.topic) return;
      var paras = String(q.Draft).split(/\n\s*\n/).map(function (t) { return t.trim(); }).filter(String);
      var body = email_({ label: 'New From Archana', title: q.Subject, hook: paras[0], paras: paras.slice(1), subscriberId: s.ID, buttons: [{ text: 'Read The New Piece', url: link_({ a: 'c', id: s.ID, m: q.ID, t: target.topic || 'none', u: target.url }) }] });
      if (send_({ to: s.Email, subject: q.Subject, html: body, workflow: 'New content broadcast', campaign: q.ID, messageId: q.ID, subscriberId: s.ID, marketing: true, isTest: isTrue_(s['Is test']), checkLinks: n === 0 })) n++;
    });
    update_('Queue', q._row, { Status: 'sent', Sent: new Date() });
    done.push(q.Subject + ' to ' + n);
  });
  return done.join(', ') || 'Nothing approved';
}

function formatQueue_() {
  var sh = tab_('Queue'), col = TABS.Queue.indexOf('Approved') + 1;
  sh.getRange(2, col, Math.max(sh.getLastRow() - 1, 1), 1).insertCheckboxes();
}

function notifyOwner_(subject, text) {
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Automation] ' + subject, htmlBody: email_({ label: 'Automation', title: subject, paras: [text], buttons: [{ text: 'Open The Control Sheet', url: ss_().getUrl() }], signoff: false }), name: 'Content Marketing Automation' });
}

function promptContent_() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('New content', 'Paste the URL of the published piece:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return null;
  return contentFromUrl_(r.getResponseText().trim());
}

function contentFromUrl_(url) {
  var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  var pick = function (re) { var m = html.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
  return {
    url: url,
    title: pick(/<title>([^<]+)<\/title>/i),
    description: pick(/<meta name="description" content="([^"]+)"/i),
    text: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000)
  };
}

/* ---------- Workflow 15: enquiry capture and follow-up ---------- */

function enquiryForm_() {
  return '<p>Tell me what you need. You will get a reply with relevant work samples straight away, and a personal reply from me after that.</p>' +
    '<form method="post" action="' + appUrl_() + '" target="_top"><input type="hidden" name="form" value="enquiry"><input class="hp" name="website" tabindex="-1" autocomplete="off">' +
    '<label for="n">Name</label><input id="n" name="name" required maxlength="80">' +
    '<label for="e">Email</label><input id="e" name="email" type="email" required maxlength="120">' +
    '<label for="c">Company</label><input id="c" name="company" maxlength="120">' +
    '<label for="m">What Do You Need?</label><textarea id="m" name="message" rows="6" required maxlength="3000"></textarea>' +
    '<button type="submit">Send Message</button></form>';
}

var ENQUIRY_LINKS = {
  'Full-time role': [['View The Portfolio', 'https://archanacontent.github.io/'], ['Read The NVD Developer Guide', 'https://github.com/archanacontent/nvd-cve-api-docs'], ['Open The Launch Playbook', 'https://archanacontent.github.io/b2b-saas/']],
  'Documentation project': [['Read The NVD Developer Guide', 'https://github.com/archanacontent/nvd-cve-api-docs'], ['Read The openFDA Guide', 'https://archanacontent.github.io/openfda-drug-safety-guide/'], ['Read The Medicaid Guide', 'https://archanacontent.github.io/medicaid-2027-implementation-guide/']],
  'Content marketing project': [['Open The Launch Playbook', 'https://archanacontent.github.io/b2b-saas/'], ['See The RFP Response', 'https://archanacontent.github.io/rfp-response/'], ['View The Portfolio', 'https://archanacontent.github.io/']],
  'Other': [['View The Portfolio', 'https://archanacontent.github.io/']]
};

function enquiry_(p) {
  var email = String(p.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !p.message) return page_('Check Your Details', '<p>Add a valid email and a message.</p>');
  var tag = { type: 'Other', summary: '' };
  try {
    tag = gemini_('Classify this enquiry sent to a senior technical writer and B2B content marketer. Return JSON with keys type (one of: Full-time role, Documentation project, Content marketing project, Other) and summary (one sentence, under 25 words, facts from the message only).\n\nCompany: ' + (p.company || '') + '\nMessage: ' + p.message, { json: true, temperature: 0 });
    if (!ENQUIRY_LINKS[tag.type]) tag.type = 'Other';
  } catch (err) { log_('Enquiry', 'tagging failed', err.message); }
  var id = uid_('e');
  var row = append_('Enquiries', { ID: id, Received: new Date(), Name: p.name, Email: email, Company: p.company || '', Message: p.message, Type: tag.type, Summary: tag.summary, Replied: false });
  tab_('Enquiries').getRange(row, TABS.Enquiries.indexOf('Replied') + 1).insertCheckboxes();
  var body = email_({ label: 'Message Received', title: ENQUIRY_REPLY.subject, hook: ENQUIRY_REPLY.body[0], paras: ENQUIRY_REPLY.body.slice(1),
    buttons: ENQUIRY_LINKS[tag.type].map(function (l) { return { text: l[0], url: l[1] }; }) });
  var ok = send_({ to: email, subject: ENQUIRY_REPLY.subject, html: body, workflow: 'Enquiry', campaign: 'enquiry', messageId: id, isTest: true });
  update_('Enquiries', row, { 'Auto reply sent': ok ? new Date() : 'failed' });
  notifyOwner_('New Enquiry: ' + tag.type, (p.name || '') + (p.company ? ' at ' + p.company : '') + ': ' + (tag.summary || String(p.message).slice(0, 200)));
  return page_('Message Sent', '<p>Thanks. A confirmation is on its way to your inbox.</p>');
}

function remindEnquiries_() {
  var n = Number(setting_('enquiry_reminder_days') || 3), out = [];
  rows_('Enquiries').forEach(function (q) {
    if (isTrue_(q.Replied) || q['Reminder sent']) return;
    if (Date.now() - new Date(q.Received).getTime() < days_(n)) return;
    notifyOwner_('Enquiry Waiting ' + n + ' Days', (q.Name || '') + ' (' + q.Email + ') is still waiting for a reply. ' + (q.Summary || ''));
    update_('Enquiries', q._row, { 'Reminder sent': new Date() });
    out.push(q.Email);
  });
  return out.length ? 'Reminders sent for ' + out.join(', ') : 'No enquiries overdue';
}

/* ---------- Test subscribers ---------- */

function addTestSubscribers() {
  var base = setting_('owner_email').split('@');
  var names = [['research', 'Research'], ['positioning', 'Positioning'], ['launch', 'Launch'], ['sales', 'Sales'], ['silent', 'Silent']];
  names.forEach(function (n) {
    var email = base[0] + '+' + n[0] + '@' + base[1];
    if (rows_('Subscribers').some(function (r) { return r.Email === email; })) return;
    append_('Subscribers', { ID: uid_('s'), Email: email, Name: 'Test ' + n[1], Source: 'test', Status: 'pending', Consent: 'Owner test address', 'Signed up': new Date(), 'Course step': 0, Clicks: 0, Scores: '{}', 'Is test': true });
  });
  rows_('Subscribers').filter(function (r) { return isTrue_(r['Is test']) && r.Status === 'pending'; }).forEach(function (r) { sendConfirmation_(r.ID, false); });
  alert_('Five test subscribers added and confirmation emails sent. Open each one and tap Confirm My Email.');
  return 'Five test subscribers added and confirmation emails sent';
}

/* Content operations: workflows 1 to 5. */

var GUIDE_SITES = {
  'nvd-cve-api-docs': 'https://archanacontent.github.io/nvd-cve-api-docs/',
  'medicaid-2027-implementation-guide': 'https://archanacontent.github.io/medicaid-2027-implementation-guide/',
  'medically-frail-guide': 'https://archanacontent.github.io/medically-frail-guide/',
  'openfda-drug-safety-guide': 'https://archanacontent.github.io/openfda-drug-safety-guide/',
  'b2b-saas': 'https://archanacontent.github.io/b2b-saas/'
};

function guideRepos_() { return setting_('guide_repos').split(',').map(function (s) { return s.trim(); }).filter(String); }
/* GitHub's API allows 60 anonymous calls an hour per IP, and Google's servers share IPs with
   every other script. The public Atom feeds are not limited that way, so the workflows use them. */
function atom_(url) { return UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/atom+xml' } }).getContentText(); }
function latestCommit_(repo) {
  var m = atom_('https://github.com/' + setting_('github_owner') + '/' + repo + '/commits.atom').match(/Commit\/([0-9a-f]{7,40})/);
  if (!m) throw new Error('Could not read the commit feed for ' + repo);
  return m[1];
}
function siteOf_(repo) { return GUIDE_SITES[repo] || ('https://' + setting_('github_owner') + '.github.io/' + repo + '/'); }
function pageText_(html) { return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

function prop_(k, v) { var p = PropertiesService.getScriptProperties(); if (v === undefined) return p.getProperty(k); p.setProperty(k, v); }

/* ---------- Workflow 1: source change watch ---------- */

function seedSources_() {
  if (rows_('Sources').length) return;
  [
    ['NVD status of CVE-2026-6584', 'json', 'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-6584', 'vulnerabilities.0.cve.vulnStatus', 'nvd-cve-api-docs'],
    ['NVD API version', 'json', 'https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1', 'version', 'nvd-cve-api-docs'],
    ['CVE-2026-6584 in the CISA KEV catalog', 'contains', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'CVE-2026-6584', 'nvd-cve-api-docs'],
    ['openFDA adverse event data last updated', 'json', 'https://api.fda.gov/drug/event.json?limit=1', 'meta.last_updated', 'openfda-drug-safety-guide'],
    ['Newest Federal Register document on Medicaid community engagement', 'json', 'https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=medicaid+community+engagement&order=newest&per_page=1', 'results.0.document_number', 'medicaid-2027-implementation-guide,medically-frail-guide'],
    ['Newest Federal Register document on Medicaid eligibility redeterminations', 'json', 'https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=medicaid+eligibility+renewals&order=newest&per_page=1', 'results.0.document_number', 'medicaid-2027-implementation-guide']
  ].forEach(function (s) {
    append_('Sources', { ID: uid_('src'), Name: s[0], Kind: s[1], Target: s[2], Pattern: s[3], 'Guides affected': s[4], Status: 'new' });
  });
}

function pick_(obj, path) {
  return path.split('.').reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, obj);
}

function readSource_(s) {
  if (s.Kind === 'json') { var v = pick_(fetchJson_(s.Target), s.Pattern); return v === undefined ? '(missing)' : String(v); }
  var text = UrlFetchApp.fetch(s.Target, { muteHttpExceptions: true }).getContentText();
  if (s.Kind === 'contains') return text.indexOf(s.Pattern) >= 0 ? 'listed' : 'not listed';
  var page = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, page)).slice(0, 12);
}

function watchSources_() {
  var changes = [];
  rows_('Sources').forEach(function (s) {
    var now;
    try { now = readSource_(s); } catch (err) { update_('Sources', s._row, { 'Last checked': new Date(), Status: 'error: ' + err.message.slice(0, 120) }); return; }
    var was = String(s['Last value'] || '');
    var upd = { 'Last checked': new Date(), 'Last value': now, Status: 'ok' };
    if (was && was !== now) {
      upd['Last changed'] = new Date(); upd.Status = 'changed';
      changes.push({ name: s.Name, was: was, now: now, guides: s['Guides affected'], url: s.Target });
    }
    update_('Sources', s._row, upd);
  });
  if (changes.length) {
    var list = changes.map(function (c) {
      return '<li><b>' + esc_(c.name) + '</b>: ' + esc_(c.was) + ' &rarr; ' + esc_(c.now) + '<br>Guides to check: ' + esc_(c.guides) + '<br><a href="' + esc_(c.url) + '">Source</a></li>';
    }).join('');
    MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Automation] ' + changes.length + ' Source Change(s) Affect Your Guides', htmlBody: frame_('<p>A source your guides depend on has changed. Review the affected pages before readers notice.</p><ul>' + list + '</ul>', { title: 'Source Change Alert', label: 'Workflow 1' }), name: 'Content Marketing Automation' });
  }
  log_('Source change watch', 'checked', changes.length + ' change(s)');
  return changes.length + ' change(s) found';
}

/* ---------- Workflow 2: claims register and annual versioning ---------- */

function seedClaims_() { /* The register is built on the first manual run of workflow 2, which reads every guide. */ }

function buildClaims_() {
  var added = 0;
  guideRepos_().forEach(function (repo) {
    crawl_(siteOf_(repo), 6).forEach(function (pg) {
      var path = pg.url.replace(/^https:\/\/[^/]+/, ''), text = pageText_(pg.html);
      if (!/(19|20)\d\d|\d+(\.\d+)?\s?%|\bversion\b/i.test(text)) return;
      var found = [];
      try {
        found = gemini_('From the documentation page below, list factual claims that can go out of date: dates, deadlines, statistics, scores, version numbers, regulatory statuses and prices. ' +
          'Return JSON: an array of objects with keys claim (quote or close paraphrase, under 30 words), source_url (a URL cited near the claim, or empty), cadence_days (how often it should be rechecked: 30, 90 or 365). Return at most 8 items. Only include claims stated in the text.\n\nPAGE: ' + path + '\n\n' + text.slice(0, 12000), { json: true, temperature: 0 });
      } catch (err) { log_('Claims register', 'extraction failed', path + ': ' + err.message); return; }
      (found || []).forEach(function (c) {
        var cadence = Number(c.cadence_days) || 90;
        append_('Claims', { ID: uid_('c'), Guide: repo, Page: path, Claim: c.claim, 'Source URL': c.source_url || '', 'Last verified': '', 'Recheck by': new Date(Date.now() + days_(Math.min(cadence, 30))), 'Cadence days': cadence, Status: 'needs first check' });
        added++;
      });
    });
  });
  return added;
}

function checkClaims_(manual) {
  if (!rows_('Claims').length) {
    if (!manual) return 'Register empty';
    var n = buildClaims_();
    notifyOwner_('Claims Register Built', n + ' claims were extracted from your guides. Each one needs a first check: confirm it, add the date in Last verified, and the recheck date resets automatically.');
    return n + ' claims added';
  }
  var due = [];
  rows_('Claims').forEach(function (c) {
    if (c['Last verified'] && c.Status !== 'needs recheck') {
      var next = new Date(new Date(c['Last verified']).getTime() + days_(Number(c['Cadence days']) || 90));
      update_('Claims', c._row, { 'Recheck by': next, Status: next.getTime() < Date.now() ? 'needs recheck' : 'current' });
      if (next.getTime() < Date.now()) due.push(c);
    } else if (new Date(c['Recheck by']).getTime() < Date.now()) due.push(c);
  });
  if (due.length && (manual || new Date().getDay() === 1)) {
    var list = due.slice(0, 40).map(function (c) { return '<li>' + esc_(c.Guide + ' / ' + c.Page) + ': ' + esc_(c.Claim) + (c['Source URL'] ? ' (<a href="' + esc_(c['Source URL']) + '">source</a>)' : '') + '</li>'; }).join('');
    MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Automation] ' + due.length + ' Claim(s) Due For A Recheck', htmlBody: frame_('<p>These facts in your guides are due for a recheck.</p><ul>' + list + '</ul>', { title: 'Claims Due For A Recheck', label: 'Workflow 2' }), name: 'Content Marketing Automation' });
  }
  var today = new Date();
  if ((today.getMonth() === 0 && today.getDate() === 1) || manual === 'annual') annualBriefs_(today.getFullYear());
  return due.length + ' claim(s) due';
}

/* Annual versioning: one brief per guide whose facts carry last year's date. */
function annualBriefs_(year) {
  var prev = String(year - 1), claims = rows_('Claims'), made = 0;
  guideRepos_().forEach(function (repo) {
    var mine = claims.filter(function (c) { return c.Guide === repo; });
    var dated = mine.filter(function (c) { return String(c.Claim).indexOf(prev) >= 0 || String(c.Claim).indexOf(String(year)) >= 0; });
    if (!dated.length) return;
    var brief = gemini_(WRITING_RULES + '\n\nWrite an update brief for the ' + year + ' edition of a published guide. List what must be re-researched and verified, grouped by page, with the source to check for each. ' +
      'Do not write new facts or guess new values. End with a short checklist for publishing the new edition (update title and dates, redirect or label the old edition, update links from other pages).\n\nGuide: ' + repo + '\nClaims:\n' +
      dated.map(function (c) { return '- [' + c.Page + '] ' + c.Claim + (c['Source URL'] ? ' (source: ' + c['Source URL'] + ')' : ''); }).join('\n'));
    append_('Queue', { ID: uid_('q'), Created: new Date(), Workflow: 'Annual versioning', Kind: 'brief', Target: repo, Subject: year + ' Update Brief: ' + repo, Draft: brief, Status: 'for review' });
    made++;
  });
  if (made) notifyOwner_(year + ' Update Briefs Ready', made + ' guide(s) need a ' + year + ' edition. The briefs are in the Queue tab.');
  return made;
}

/* ---------- Workflow 3: publishing QA ---------- */

function crawl_(start, limit) {
  var seen = {}, queue = [start], pages = [];
  while (queue.length && pages.length < limit) {
    var url = queue.shift().split('#')[0];
    if (seen[url]) continue;
    seen[url] = true;
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 400 || String(res.getHeaders()['Content-Type'] || '').indexOf('html') < 0) continue;
    var html = res.getContentText();
    pages.push({ url: url, html: html });
    (html.match(/href="([^"#]+)"/g) || []).forEach(function (h) {
      var u = absolute_(h.slice(6, -1), url);
      if (u && u.indexOf(start) === 0 && !/\.(pdf|docx|xlsx|pptx|zip|png|jpg|svg|css|js|xml|txt)$/i.test(u) && !seen[u]) queue.push(u);
    });
  }
  return pages;
}

function absolute_(href, base) {
  if (/^(mailto:|tel:|javascript:)/.test(href)) return null;
  if (/^https?:\/\//.test(href)) return href;
  var origin = base.match(/^https?:\/\/[^/]+/)[0];
  if (href.indexOf('/') === 0) return origin + href;
  var dir = base.replace(/[^/]*$/, ''), parts = (dir + href).replace(origin, '').split('/'), out = [];
  parts.forEach(function (p) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); });
  return origin + out.join('/');
}

function checkPage_(p) {
  var issues = [], h = p.html;
  if (!/<title>[^<]{5,}<\/title>/i.test(h)) issues.push('Missing or empty title');
  var desc = (h.match(/<meta name="description" content="([^"]*)"/i) || [])[1];
  if (!desc) issues.push('Missing meta description');
  else if (desc.length > 160) issues.push('Meta description over 160 characters');
  var h1 = (h.match(/<h1[\s>]/gi) || []).length;
  if (h1 !== 1) issues.push(h1 + ' H1 headings (expected 1)');
  var levels = (h.match(/<h([1-6])[\s>]/gi) || []).map(function (t) { return Number(t.charAt(2)); });
  for (var i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) { issues.push('Heading level skipped (H' + levels[i - 1] + ' to H' + levels[i] + ')'); break; }
  var noAlt = (h.match(/<img(?![^>]*\balt=)[^>]*>/gi) || []).length;
  if (noAlt) issues.push(noAlt + ' image(s) without alt text');
  return issues;
}

function brokenLinks_(pages) {
  var links = {};
  pages.forEach(function (p) {
    (p.html.match(/href="(https?:[^"#]+|[^"#:]+)"/g) || []).forEach(function (h) {
      var u = absolute_(h.slice(6, -1), p.url);
      if (u && /^https/.test(u)) (links[u] = links[u] || []).push(p.url);
    });
  });
  var urls = Object.keys(links).slice(0, 150), broken = [];
  for (var i = 0; i < urls.length; i += 25) {
    var batch = urls.slice(i, i + 25);
    var res = UrlFetchApp.fetchAll(batch.map(function (u) { return { url: u, muteHttpExceptions: true, followRedirects: true }; }));
    res.forEach(function (r, j) {
      var code = r.getResponseCode();
      if (code === 404 || code === 410 || code >= 500) broken.push({ url: batch[j], code: code, on: links[batch[j]][0] });
    });
  }
  return broken;
}

function publishingQa_(manual) {
  var report = [], checked = 0;
  guideRepos_().forEach(function (repo) {
    var sha = latestCommit_(repo);
    if (!manual && prop_('qa_sha_' + repo) === sha) return;
    prop_('qa_sha_' + repo, sha);
    var pages = crawl_(siteOf_(repo), 40);
    checked++;
    var pageIssues = pages.map(function (p) { return { url: p.url, issues: checkPage_(p) }; }).filter(function (x) { return x.issues.length; });
    var broken = brokenLinks_(pages);
    if (pageIssues.length || broken.length) report.push({ repo: repo, pages: pages.length, pageIssues: pageIssues, broken: broken, sha: sha.slice(0, 7) });
    else report.push({ repo: repo, pages: pages.length, clean: true, sha: sha.slice(0, 7) });
  });
  if (!checked) return 'No new commits since the last check';
  var html = report.map(function (r) {
    if (r.clean) return '<p><b>' + esc_(r.repo) + '</b> (' + r.sha + '): ' + r.pages + ' pages, no issues.</p>';
    return '<p><b>' + esc_(r.repo) + '</b> (' + r.sha + '): ' + r.pages + ' pages checked.</p><ul>' +
      r.pageIssues.map(function (x) { return '<li><a href="' + esc_(x.url) + '">' + esc_(x.url.replace(/^https:\/\/[^/]+/, '')) + '</a>: ' + esc_(x.issues.join('; ')) + '</li>'; }).join('') +
      r.broken.map(function (b) { return '<li>Broken link (' + b.code + '): ' + esc_(b.url) + ' on ' + esc_(b.on.replace(/^https:\/\/[^/]+/, '')) + '</li>'; }).join('') + '</ul>';
  }).join('');
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Automation] Publishing QA For ' + checked + ' Site(s)', htmlBody: frame_('<p>Publishing QA results after the latest commits.</p>' + html, { title: 'Publishing QA Results', label: 'Workflow 3', wide: true }), name: 'Content Marketing Automation' });
  log_('Publishing QA', 'checked', report.map(function (r) { return r.repo + ':' + (r.clean ? 'clean' : (r.pageIssues.length + r.broken.length) + ' issue(s)'); }).join(', '));
  return checked + ' site(s) checked';
}

/* ---------- Workflow 4: metadata and internal links ---------- */

function metadataSuggest_(url) {
  if (!url) {
    var ui = SpreadsheetApp.getUi(), r = ui.prompt('Metadata and internal links', 'Paste the URL of the page to review:', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return 'Cancelled';
    url = r.getResponseText().trim();
  }
  var page = contentFromUrl_(url);
  var imgs = (UrlFetchApp.fetch(url).getContentText().match(/<img(?![^>]*\balt=)[^>]*src="([^"]+)"/gi) || []).slice(0, 10);
  var others = Object.keys(GUIDE_SITES).map(function (k) { return k + ': ' + GUIDE_SITES[k]; }).join('\n');
  var out = gemini_(WRITING_RULES + '\n\nSuggest SEO metadata for the page below. Return JSON with keys: seo_title (under 60 characters, Title Case), meta_description (140 to 155 characters, states the reader problem and what the page gives them), ' +
    'alt_text (array of {src, alt} for the images listed, describing what each image shows), internal_links (array of up to 3 {anchor_text, target_url, reason} chosen only from the related guides list, and only where genuinely relevant).\n\n' +
    'URL: ' + url + '\nCurrent title: ' + page.title + '\nCurrent description: ' + page.description + '\nImages without alt text: ' + imgs.join(' ') + '\nRelated guides:\n' + others + '\n\nPage text:\n' + page.text, { json: true, temperature: 0.3 });
  var draft = 'SEO title: ' + out.seo_title + '\n\nMeta description: ' + out.meta_description + '\n\nAlt text:\n' + (out.alt_text || []).map(function (a) { return '- ' + a.src + ': ' + a.alt; }).join('\n') +
    '\n\nInternal links:\n' + (out.internal_links || []).map(function (l) { return '- "' + l.anchor_text + '" to ' + l.target_url + ' (' + l.reason + ')'; }).join('\n');
  append_('Queue', { ID: uid_('q'), Created: new Date(), Workflow: 'Metadata and internal links', Kind: 'metadata', Target: url, Subject: 'Metadata For ' + page.title, Draft: draft, Status: 'for review' });
  return 'Suggestions added to the Queue tab';
}

/* ---------- Workflow 5: distribution drafts ---------- */

function distributionDrafts_(item) {
  item = item || promptContent_();
  if (!item) return 'Cancelled';
  var out = gemini_(WRITING_RULES + '\n\nDraft posts announcing a new piece of work by a senior technical writer and B2B content marketer. ' +
    'Return JSON with keys linkedin (120 to 180 words, opens with the reader problem, no hashtags, link on its own final line) and reddit_title (under 90 characters, Title Case, a discussion question or observation, no clickbait) and reddit_body (100 to 150 words, written as a discussion starter for practitioners, not promotional, link mentioned once at the end as a resource).\n\n' +
    'Title: ' + item.title + '\nURL: ' + item.url + '\nDescription: ' + item.description + '\nPage text:\n' + item.text, { json: true });
  var draft = 'LINKEDIN\n\n' + out.linkedin + '\n\n---\n\nREDDIT TITLE\n' + out.reddit_title + '\n\nREDDIT BODY\n' + out.reddit_body;
  append_('Queue', { ID: uid_('q'), Created: new Date(), Workflow: 'Distribution drafts', Kind: 'social', Target: item.url, Subject: 'Posts For ' + item.title, Draft: draft, Status: 'for review' });
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Automation] Post Drafts: ' + item.title, htmlBody: frame_('<p>Drafts for your review. Edit them, then post them yourself.</p><pre style="white-space:pre-wrap;font-family:inherit">' + esc_(draft) + '</pre>', { title: 'Post Drafts For Review', label: 'Workflow 5' }), name: 'Content Marketing Automation' });
  return 'Drafts emailed and added to the Queue tab';
}

/* Detects a newly published piece (a new public repository) and starts workflows 5 and 13. */
function detectNewContent_() {
  var feed = atom_('https://github.com/' + setting_('github_owner') + '.atom');
  var names = [], re = /created a repository [^/<\s]+\/([A-Za-z0-9._-]+)/g, m;
  while ((m = re.exec(feed))) if (names.indexOf(m[1]) < 0) names.push(m[1]);
  var known = JSON.parse(prop_('known_repos') || 'null');
  prop_('known_repos', JSON.stringify((known || []).concat(names.filter(function (n) { return (known || []).indexOf(n) < 0; }))));
  if (!known) return 'Baseline saved';
  var fresh = names.filter(function (n) { return known.indexOf(n) < 0; });
  fresh.forEach(function (name) {
    var site = 'https://' + setting_('github_owner') + '.github.io/' + name + '/';
    var url = UrlFetchApp.fetch(site, { muteHttpExceptions: true }).getResponseCode() === 200 ? site : 'https://github.com/' + setting_('github_owner') + '/' + name;
    var item = contentFromUrl_(url);
    distributionDrafts_(item);
    broadcastDraft_(item);
  });
  return fresh.length + ' new piece(s)';
}

/* Reporting: workflows 16 to 19. */

function ga_(start, end, dims, metrics, limit) {
  var id = setting_('ga4_property_id');
  if (!id) throw new Error('Add ga4_property_id in the Settings tab');
  var res = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: dims.map(function (d) { return { name: d }; }),
    metrics: metrics.map(function (m) { return { name: m }; }),
    limit: limit || 250
  }, 'properties/' + id);
  return (res.rows || []).map(function (r) {
    var o = {};
    dims.forEach(function (d, i) { o[d] = r.dimensionValues[i].value; });
    metrics.forEach(function (m, i) { o[m] = Number(r.metricValues[i].value); });
    return o;
  });
}

/* Search Console works only if the script's Cloud project allows the API. The reports carry on without it. */
function gsc_(start, end) {
  try {
    var site = encodeURIComponent(setting_('site_url'));
    var data = fetchJson_('https://searchconsole.googleapis.com/webmasters/v3/sites/' + site + '/searchAnalytics/query', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 250 })
    });
    return (data.rows || []).map(function (r) { return { page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }; });
  } catch (err) {
    log_('Search Console', 'unavailable', err.message.slice(0, 200));
    return null;
  }
}

function ymd_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function ago_(n) { return ymd_(new Date(Date.now() - days_(n))); }

function piece_(path) {
  var seg = String(path || '/').split('/').filter(String)[0] || '';
  var names = { '': 'Portfolio', 'nvd-cve-api-docs': 'NVD guide', 'medicaid-2027-implementation-guide': 'Medicaid guide', 'medically-frail-guide': 'Medically Frail guide', 'openfda-drug-safety-guide': 'openFDA guide', 'b2b-saas': 'B2B SaaS playbook', 'rfp-response': 'RFP response', asked: 'Asked' };
  return names[seg] || seg;
}

function byPiece_(rows, metric) {
  var out = {};
  rows.forEach(function (r) { var k = piece_(r.pagePath); out[k] = (out[k] || 0) + r[metric]; });
  return out;
}

function pct_(now, was) { if (!was) return now ? 'new' : '0%'; var p = Math.round((now - was) / was * 100); return (p > 0 ? '+' : '') + p + '%'; }

function table_(head, rows) {
  var th = head.map(function (h) { return '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #17181B;font-size:13px">' + esc_(h) + '</th>'; }).join('');
  var tb = rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td style="padding:6px 8px;border-bottom:1px solid #E2DDD3;font-size:13px">' + esc_(c) + '</td>'; }).join('') + '</tr>'; }).join('');
  return '<table style="border-collapse:collapse;width:100%;margin:8px 0 18px">' + '<tr>' + th + '</tr>' + tb + '</table>';
}

function aiNotes_(facts, task) {
  try {
    var notes = gemini_(WRITING_RULES + '\n\n' + task + ' Use only the facts given. Return JSON with keys measured (array of up to 4 short statements of what the numbers show) and hypotheses (array of up to 3 possible reasons, each phrased as a possibility to check, never as fact).\n\nFACTS:\n' + JSON.stringify(facts), { json: true, temperature: 0.2 });
    return '<h3 style="margin:18px 0 6px;font-size:15px">What The Numbers Show</h3><ul>' + (notes.measured || []).map(function (m) { return '<li>' + esc_(m) + '</li>'; }).join('') + '</ul>' +
      '<h3 style="margin:18px 0 6px;font-size:15px">Possible Reasons To Check (AI Hypotheses, Not Verified)</h3><ul>' + (notes.hypotheses || []).map(function (m) { return '<li>' + esc_(m) + '</li>'; }).join('') + '</ul>';
  } catch (err) { return '<p>AI notes unavailable: ' + esc_(err.message) + '</p>'; }
}

/* ---------- Workflow 16: weekly performance report ---------- */

function weeklyReport_() {
  var cur = ga_(ago_(7), ago_(1), ['pagePath'], ['screenPageViews', 'sessions']);
  var prev = ga_(ago_(14), ago_(8), ['pagePath'], ['screenPageViews', 'sessions']);
  var src = ga_(ago_(7), ago_(1), ['sessionSource'], ['sessions'], 10);
  var a = byPiece_(cur, 'screenPageViews'), b = byPiece_(prev, 'screenPageViews');
  var pieces = Object.keys(Object.assign({}, a, b)).sort(function (x, y) { return (a[y] || 0) - (a[x] || 0); });
  var since = Date.now() - days_(7);
  var signups = rows_('Subscribers').filter(function (s) { return new Date(s['Signed up']).getTime() > since; }).length;
  var enquiries = rows_('Enquiries').filter(function (q) { return new Date(q.Received).getTime() > since; }).length;
  var gsc = gsc_(ago_(9), ago_(3));
  var facts = { views_by_piece_this_week: a, views_by_piece_last_week: b, top_sources: src, new_signups: signups, new_enquiries: enquiries, search_console: gsc ? gsc.slice(0, 15) : 'not available' };
  var html = '<p style="margin:0 0 14px;color:#6B6862">' + ago_(7) + ' to ' + ago_(1) + '</p>' +
    table_(['Piece Of Work', 'Views', 'Previous Week', 'Change'], pieces.map(function (p) { return [p, a[p] || 0, b[p] || 0, pct_(a[p] || 0, b[p] || 0)]; })) +
    table_(['Traffic Source', 'Sessions'], src.map(function (s) { return [s.sessionSource, s.sessions]; })) +
    table_(['Lead Activity', 'This Week'], [['Course Sign-Ups', signups], ['Enquiries', enquiries]]) +
    (gsc ? table_(['Page (Search Console)', 'Clicks', 'Impressions'], gsc.slice(0, 10).map(function (g) { return [g.page.replace(/^https:\/\/[^/]+/, ''), g.clicks, g.impressions]; })) : '<p style="font-size:13px;color:#6B6862">Search Console data is not available to this script. The n8n version reads it.</p>') +
    aiNotes_(facts, 'Summarise this week for a content marketer.');
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Report] Weekly Performance, Week Ending ' + ago_(1), htmlBody: frame_(html, { title: 'Weekly Performance Report', label: 'Workflow 16', wide: true }), name: 'Content Marketing Automation' });
  return 'Weekly report sent';
}

/* ---------- Workflow 17: email performance report ---------- */

function emailStats_() {
  var ev = rows_('Events'), msgs = {};
  ev.forEach(function (e) {
    if (e.Type !== 'sent' && e.Type !== 'click') return;
    var m = e.Message || e.Campaign; if (!m) return;
    msgs[m] = msgs[m] || { sent: {}, clicked: {} };
    if (e.Type === 'sent') msgs[m].sent[e['Subscriber ID']] = 1; else msgs[m].clicked[e['Subscriber ID']] = 1;
  });
  return Object.keys(msgs).map(function (m) {
    var s = Object.keys(msgs[m].sent).length, c = Object.keys(msgs[m].clicked).length;
    return { message: m, sent: s, clicked: c, rate: s ? Math.round(c / s * 100) : 0 };
  }).filter(function (x) { return x.sent; });
}

function emailReport_() {
  var stats = emailStats_(), subs = rows_('Subscribers');
  var status = {}; subs.forEach(function (s) { status[s.Status] = (status[s.Status] || 0) + 1; });
  var funnel = [1, 2, 3, 4, 5, 6].map(function (n) { return [n === 6 ? 'Next-best email' : 'Lesson ' + n, subs.filter(function (s) { return Number(s['Course step']) >= n; }).length]; });
  var order = ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5'];
  var drop = order.filter(function (m) { var x = stats.filter(function (s) { return s.message === m; })[0]; return x && x.rate === 0; })[0];
  var html = '' +
    '<p style="font-size:13px;color:#6B6862">Click rates use unique clicks per subscriber. Open rates are left out because mail privacy features make them unreliable.</p>' +
    table_(['Email', 'Sent', 'Clicked', 'Click Rate'], stats.map(function (s) { return [s.message, s.sent, s.clicked, s.rate + '%']; })) +
    table_(['Course Stage Reached', 'Subscribers'], funnel) +
    table_(['Subscriber Status', 'Count'], Object.keys(status).map(function (k) { return [k, status[k]]; })) +
    (drop ? '<p>First lesson with no clicks: <b>' + esc_(drop) + '</b>.</p>' : '') +
    aiNotes_({ per_email: stats, funnel: funnel, status: status }, 'Review this email course for a marketer.');
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Report] Email Performance', htmlBody: frame_(html, { title: 'Email Performance Report', label: 'Workflow 17', wide: true }), name: 'Content Marketing Automation' });
  return 'Email report sent';
}

/* ---------- Workflow 18: monthly content health ---------- */

function monthlyHealth_() {
  var a = byPiece_(ga_(ago_(28), ago_(1), ['pagePath'], ['screenPageViews']), 'screenPageViews');
  var b = byPiece_(ga_(ago_(56), ago_(29), ['pagePath'], ['screenPageViews']), 'screenPageViews');
  var gsc = gsc_(ago_(30), ago_(3)), search = {};
  (gsc || []).forEach(function (g) { var k = piece_(g.page.replace(/^https:\/\/[^/]+/, '')); search[k] = search[k] || { clicks: 0, impressions: 0 }; search[k].clicks += g.clicks; search[k].impressions += g.impressions; });
  var stale = {}; rows_('Claims').forEach(function (c) { if (c.Status === 'needs recheck' || c.Status === 'needs first check') { var k = piece_('/' + c.Guide + '/'); stale[k] = (stale[k] || 0) + 1; } });
  var rows = Object.keys(Object.assign({}, a, b, search, stale)).map(function (p) {
    var now = a[p] || 0, was = b[p] || 0, s = search[p], cat, act;
    if (stale[p]) { cat = 'Out Of Date'; act = 'Recheck ' + stale[p] + ' claim(s) in the register'; }
    else if (s && s.impressions >= 50 && s.clicks / s.impressions < 0.01) { cat = 'Seen In Search, Rarely Clicked'; act = 'Rewrite the title and meta description'; }
    else if (was >= 10 && now >= was * 1.2) { cat = 'Growing'; act = 'Share it again and link to it from related pieces'; }
    else if (was >= 10 && now <= was * 0.8) { cat = 'Declining'; act = 'Check sources and search intent, then refresh'; }
    else { cat = 'Steady'; act = 'No action this month'; }
    return [p, now, was, pct_(now, was), cat, act];
  });
  var html = table_(['Piece', 'Views (28 Days)', 'Previous 28 Days', 'Change', 'Status', 'Next Step'], rows) +
    '<p style="font-size:13px;color:#6B6862">Growing and declining need at least 10 views in the previous period, so small numbers do not trigger false alarms.</p>';
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Report] Monthly Content Health', htmlBody: frame_(html, { title: 'Monthly Content Health Check', label: 'Workflow 18', wide: true }), name: 'Content Marketing Automation' });
  return 'Health check sent';
}

/* ---------- Workflow 19: course post-mortem ---------- */

function coursePostMortem_(force) {
  var testMode = setting_('test_mode') === 'TRUE';
  var subs = rows_('Subscribers').filter(function (s) { return s.Confirmed && (!testMode || isTrue_(s['Is test'])); });
  var finished = subs.filter(function (s) { return Number(s['Course step']) >= 6 || s.Status === 'unsubscribed' || s.Status === 'sunset'; });
  if (!subs.length) return 'No confirmed subscribers yet';
  if (!force && (finished.length < subs.length || prop_('postmortem_count') === String(finished.length))) return 'Cohort still in the course';
  prop_('postmortem_count', String(finished.length));
  var stats = emailStats_().filter(function (s) { return /^lesson-|^next-best|^reengage/.test(s.message); });
  var topics = {}; subs.forEach(function (s) { var t = s.Interest || 'no clicks'; topics[t] = (topics[t] || 0) + 1; });
  var facts = { cohort_size: subs.length, finished: finished.length, unsubscribed: subs.filter(function (s) { return s.Status === 'unsubscribed'; }).length, sunset: subs.filter(function (s) { return s.Status === 'sunset'; }).length, per_email: stats, top_topics: topics };
  var notes;
  try {
    notes = gemini_(WRITING_RULES + '\n\nWrite a post-mortem of an email course cohort. Return JSON with keys worked (array), underperformed (array), change_next (array of specific changes to test with the next cohort). Up to 3 items each. Use only the facts. If the cohort is small, say results are directional.\n\nFACTS:\n' + JSON.stringify(facts), { json: true, temperature: 0.2 });
  } catch (err) { notes = { worked: [], underperformed: [], change_next: ['AI notes unavailable: ' + err.message] }; }
  var list = function (arr) { return '<ul>' + (arr || []).map(function (x) { return '<li>' + esc_(x) + '</li>'; }).join('') + '</ul>'; };
  var html = '' +
    table_(['Cohort', 'Count'], [['Confirmed', facts.cohort_size], ['Finished Or Exited', facts.finished], ['Unsubscribed', facts.unsubscribed], ['Sunset', facts.sunset]]) +
    table_(['Email', 'Sent', 'Clicked', 'Click Rate'], stats.map(function (s) { return [s.message, s.sent, s.clicked, s.rate + '%']; })) +
    table_(['Strongest Interest', 'Subscribers'], Object.keys(topics).map(function (k) { return [TOPICS[k] || k, topics[k]]; })) +
    '<h3 style="font-size:15px">What Worked</h3>' + list(notes.worked) + '<h3 style="font-size:15px">What Underperformed</h3>' + list(notes.underperformed) + '<h3 style="font-size:15px">What To Change Next Time</h3>' + list(notes.change_next);
  append_('Queue', { ID: uid_('q'), Created: new Date(), Workflow: 'Course post-mortem', Kind: 'report', Target: 'course', Subject: 'Post-Mortem For A Cohort Of ' + subs.length, Draft: JSON.stringify(notes), Status: 'archived' });
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Report] Course Post-Mortem', htmlBody: frame_(html, { title: 'Course Post-Mortem', label: 'Workflow 19', wide: true }), name: 'Content Marketing Automation' });
  return 'Post-mortem sent';
}

/* Public entry points used by Loader.gs. */
globalThis.CMA = {
  onOpen: onOpen, doGet: doGet, doPost: doPost, setup: setup, setGeminiKey: setGeminiKey, refreshed: refreshed,
  runHourly: runHourly, runDaily: runDaily, runWeekly: runWeekly, runNow: runNow, addTestSubscribers: addTestSubscribers
};

})();
