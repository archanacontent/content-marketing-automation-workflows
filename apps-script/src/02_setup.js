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
  CLAIMS_RAN = false;
  safe_('Run tab', processRunTab_);
  safe_('Sign-up confirmations', remindUnconfirmed_);
  safe_('Course', sendCourseDue_);
  safe_('Re-engagement and sunset', reengage_);
  safe_('Enquiry reminders', remindEnquiries_);
  safe_('Approved queue', sendApproved_);
  /* The claims build runs last, so a long build never holds up emails, and only once per run. */
  if (prop_('claims_building') === 'yes' && !CLAIMS_RAN) safe_('Claims register', continueClaims_);
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

/* Carries on a claims build and shows its progress in the Run tab row for workflow 2. */
function continueClaims_() {
  var out = checkClaims_(true);
  rows_('Run').forEach(function (r) { if (String(r['No.']) === '2') update_('Run', r._row, { 'Last run': new Date(), Result: String(out).slice(0, 500) }); });
  log_('Claims register', 'build continued', out);
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
