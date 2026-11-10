/* Local test harness: runs the Apps Script bundle against in-memory mocks of Google services.
   Usage: node test/harness.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');

/* ---------- Mocks ---------- */
const sent = [], triggers = [], alerts = [];
function Range(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
Range.prototype.setValues = function (v) { v.forEach((row, i) => row.forEach((x, j) => this.s.set(this.r + i, this.c + j, x))); return this; };
Range.prototype.setValue = function (v) { this.s.set(this.r, this.c, v); return this; };
Range.prototype.setFontWeight = function () { return this; };
Range.prototype.insertCheckboxes = function () { return this; };
function Sheet(name) { this.name = name; this.data = []; }
Sheet.prototype.set = function (r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
Sheet.prototype.setFrozenRows = function () {};
Sheet.prototype.setColumnWidth = function () {};
Sheet.prototype.appendRow = function (row) { this.data.push(row.slice()); };
Sheet.prototype.getLastRow = function () { return this.data.length; };
Sheet.prototype.getDataRange = function () { const w = Math.max(...this.data.map(r => r.length)); const d = this.data.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }); return { getValues: () => d.map(r => r.slice()) }; };
const book = { sheets: { Sheet1: new Sheet('Sheet1') } };
global.SpreadsheetApp = {
  getActive: () => ({
    getSheetByName: n => book.sheets[n] || null,
    insertSheet: n => (book.sheets[n] = new Sheet(n)),
    getSheets: () => Object.values(book.sheets),
    deleteSheet: s => delete book.sheets[s.name],
    getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST'
  }),
  getUi: () => ({
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }),
    alert: m => alerts.push(m),
    prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => global.__prompt || '' }),
    ButtonSet: { OK_CANCEL: 1 }, Button: { OK: 'OK' }
  })
};
const props = {};
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
global.CacheService = { getScriptCache: () => ({ get: () => null, getAll: () => ({}), putAll() {}, removeAll() {} }) };
global.Utilities = {
  getUuid: () => crypto.randomUUID(), sleep: () => {},
  computeHmacSha256Signature: (t, k) => [...crypto.createHmac('sha256', k).update(t).digest()],
  base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
  base64Encode: b => Buffer.from(b).toString('base64'),
  computeDigest: (a, t) => [...crypto.createHash('sha1').update(t).digest()],
  DigestAlgorithm: { SHA_1: 'sha1' },
  formatDate: d => d.toISOString().slice(0, 10)
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }), getScriptTimeZone: () => 'UTC' };
global.MailApp = { sendEmail: m => sent.push(m) };
const WEBAPP = 'https://script.google.com/macros/s/TEST/exec';
global.ScriptApp = {
  getService: () => ({ getUrl: () => WEBAPP }),
  getProjectTriggers: () => triggers.slice(), deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
  newTrigger: n => ({ timeBased() { return this; }, everyHours() { return this; }, everyMinutes() { return this; }, atHour() { return this; }, everyDays() { return this; }, onWeekDay() { return this; }, create() { triggers.push(n); } }),
  WeekDay: { MONDAY: 1 }, getOAuthToken: () => 'tok'
};
global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: t => ({ json: JSON.parse(t), setMimeType() { return this; } }) };
global.HtmlService = { createHtmlOutput: h => ({ html: h, setTitle() { return this; }, addMetaTag() { return this; } }) };
const routes = [];
function respond(code, body, headers) { return { getResponseCode: () => code, getContentText: () => body, getHeaders: () => headers || { 'Content-Type': 'text/html' } }; }
global.UrlFetchApp = {
  fetch: (url, opts) => { for (const [re, fn] of routes) if (re.test(url)) return fn(url, opts); return respond(200, '<html><title>Page</title><p>In 2026, 45% of CVEs were deferred.</p></html>'); },
  fetchAll: reqs => reqs.map(r => global.UrlFetchApp.fetch(r.url, r))
};
global.AnalyticsData = { Properties: { runReport: (req) => ({ rows: req.dimensions[0].name === 'pagePath'
  ? [{ dimensionValues: [{ value: '/' }], metricValues: [{ value: '12' }, { value: '9' }] }, { dimensionValues: [{ value: '/b2b-saas/positioning-and-messaging/' }], metricValues: [{ value: '30' }, { value: '20' }] }]
  : [{ dimensionValues: [{ value: 'google' }], metricValues: [{ value: '7' }] }] }) } };

/* Gemini stub returns plausible JSON by prompt type. */
routes.push([/generativelanguage/, (u, o) => {
  const p = JSON.parse(o.payload).contents[0].parts[0].text;
  let out = 'ready';
  if (/Classify this enquiry/.test(p)) out = JSON.stringify({ type: 'Documentation project', summary: 'Needs API docs for a payments product.' });
  else if (/factual claims/.test(p)) out = JSON.stringify([{ claim: 'NVD marked CVE-2026-6584 as Deferred in 2026', source_url: 'https://nvd.nist.gov/', cadence_days: 30 }]);
  else if (/subscribers of a B2B SaaS launch course/.test(p)) out = JSON.stringify({ subject: 'A new guide on API docs', body: 'Para one.\n\nPara two.' });
  else if (/Draft posts/.test(p)) out = JSON.stringify({ linkedin: 'Post', reddit_title: 'Q', reddit_body: 'Body' });
  else if (/SEO metadata/.test(p)) out = JSON.stringify({ seo_title: 'T', meta_description: 'D', alt_text: [], internal_links: [] });
  else if (/measured/.test(p)) out = JSON.stringify({ measured: ['Views rose'], hypotheses: ['Maybe a share'] });
  else if (/Post-Mortem/.test(p)) out = JSON.stringify({ worked: ['a'], underperformed: ['b'], change_next: ['c'] });
  else if (/update brief/.test(p)) out = 'Brief text';
  return respond(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: out }] } }] }));
}]);
routes.push([/services\.nvd/, () => respond(200, JSON.stringify({ version: '2.0', vulnerabilities: [{ cve: { vulnStatus: global.__nvd || 'Deferred' } }] }))]);
routes.push([/api\.fda/, () => respond(200, JSON.stringify({ meta: { last_updated: '2026-10-30' } }))]);
routes.push([/federalregister/, () => respond(200, JSON.stringify({ results: [{ document_number: '2026-12345' }] }))]);
routes.push([/cisa\.gov/, () => respond(200, '{"vulnerabilities":[]}')]);
routes.push([/github\.com\/archanacontent\.atom/, () => respond(200, (global.__repos || [{ name: 'b2b-saas' }]).map(r => '<title>archanacontent created a repository archanacontent/' + r.name + '</title>').join(''))]);
routes.push([/commits\.atom/, () => respond(200, '<id>tag:github.com,2008:Grit::Commit/abc1234def</id>')]);
routes.push([/git\/trees/, () => respond(200, JSON.stringify({ tree: [{ type: 'blob', path: 'docs/index.md' }] }))]);
routes.push([/commits\?per_page/, () => respond(200, JSON.stringify([{ sha: 'abc1234def' }]))]);
routes.push([/raw\.githubusercontent/, () => respond(200, '# Guide\nIn 2026 NVD changed. 45% of CVEs.')]);
routes.push([/searchconsole/, () => respond(403, 'API not enabled')]);
routes.push([/github\.io\/nvd-cve-api-docs\/$/, () => respond(200, '<html><title>NVD guide</title><meta name="description" content="Desc"><h1>A</h1><h3>B</h3><img src="x.png"><a href="page2/">p</a><a href="https://dead.example/x">d</a></html>')]);
routes.push([/dead\.example/, () => respond(404, '')]);

/* ---------- Load bundle ---------- */
(0, eval)(fs.readFileSync(path.join(__dirname, '../apps-script/dist/cma.js'), 'utf8'));
const C = global.CMA;
const qs = u => { const q = u.split('?')[1]; const p = {}; q.split('&').forEach(kv => { const [k, v] = kv.split('='); p[k] = decodeURIComponent(v); }); return { parameter: p, queryString: q }; };
const linksIn = html => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')).filter(u => u.startsWith(WEBAPP) || u.includes('/go/?'));
const tabRows = n => { const d = book.sheets[n].data; const h = d[0]; return d.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const setSetting = (k, v) => { const d = book.sheets.Settings.data; d.find(r => r[0] === k)[1] = v; };

/* ---------- Tests ---------- */
C.setup();
assert.deepStrictEqual(Object.keys(book.sheets).sort(), ['Claims', 'Enquiries', 'Events', 'Log', 'Queue', 'Run', 'Settings', 'Sources', 'Subscribers'].sort());
assert.strictEqual(triggers.length, 3);
props.GEMINI_API_KEY = 'k';
setSetting('ga4_property_id', '123');
setSetting('course_interval_hours', '0');

C.addTestSubscribers();
assert.strictEqual(tabRows('Subscribers').length, 5);
const confirmMails = sent.filter(m => /Confirm Your Sign-Up/.test(m.subject));
assert.strictEqual(confirmMails.length, 5, 'five confirmation emails');

// Links open the public GitHub Pages link page
assert.ok(linksIn(confirmMails[0].htmlBody)[0].startsWith('https://archanacontent.github.io/content-marketing-automation-workflows/go/?a=confirm'), 'links use pages_url');
// JSON mode used by the public pages
const j = C.doGet(Object.assign(qs(linksIn(confirmMails[0].htmlBody)[0].replace(/s=[^&]+$/, 's=bad')), {}));
// A public-page request adds format=json after the signature and must still verify
{ const l = linksIn(confirmMails[1].htmlBody)[0] + '&format=json'; const r = C.doGet(qs(l)); assert.ok(r.json && r.json.title === 'You Are In', 'signed link verifies with format=json'); }
// Tampered link is rejected
const good = linksIn(confirmMails[0].htmlBody)[0];
assert.ok(/Link Expired/.test(C.doGet(qs(good.replace(/s=[^&]+$/, 's=bad'))).html), 'bad signature rejected');

// Confirm all five
confirmMails.forEach(m => C.doGet(qs(linksIn(m.htmlBody)[0])));
assert.ok(tabRows('Subscribers').every(s => s.Status === 'active' && s['Course step'] === 1), 'all active on lesson 1');
const lesson1 = sent.filter(m => /Lesson 1/.test(m.subject));
assert.strictEqual(lesson1.length, 5);
assert.ok(lesson1[0].htmlBody.includes('a=unsub'), 'unsubscribe link present');

// Research subscriber clicks the research link in lesson 1
const research = lesson1.find(m => m.to.includes('+research'));
const rlink = linksIn(research.htmlBody).find(u => u.includes('t=research'));
const out = C.doGet(qs(rlink));
assert.ok(out.html.includes('market-research'), 'click redirects to module');
let r = tabRows('Subscribers').find(s => s.Email.includes('+research'));
assert.strictEqual(r.Interest, 'research'); assert.strictEqual(r.Clicks, 1);

// Positioning subscriber clicks in lessons; sales subscriber unsubscribes
for (let step = 2; step <= 5; step++) {
  C.runHourly();
  const L = sent.filter(m => new RegExp('Lesson ' + step).test(m.subject));
  if (step === 3) { const p = L.find(m => m.to.includes('+positioning')); C.doGet(qs(linksIn(p.htmlBody).find(u => u.includes('t=positioning')))); }
  if (step === 2) { const s = L.find(m => m.to.includes('+sales')); C.doGet(qs(linksIn(s.htmlBody).find(u => u.includes('a=unsub')))); }
}
assert.strictEqual(tabRows('Subscribers').find(s => s.Email.includes('+sales')).Status, 'unsubscribed');
assert.ok(!sent.some(m => m.to.includes('+sales') && /Lesson [345]/.test(m.subject)), 'no email after unsubscribe');

// Next-best emails
C.runHourly();
const nb = sent.filter(m => /Put Your Research|Keep Your Positioning|Start With The Module/.test(m.subject));
assert.ok(nb.some(m => m.to.includes('+research') && /Put Your Research/.test(m.subject)), 'research gets research next-best');
assert.ok(nb.some(m => m.to.includes('+positioning') && /Keep Your Positioning/.test(m.subject)), 'positioning next-best');
assert.ok(nb.some(m => m.to.includes('+silent') && /Start With The Module/.test(m.subject)), 'silent gets default');

// Re-engagement then sunset for the silent subscriber (6 emails, no clicks)
C.runHourly();
assert.ok(sent.some(m => m.to.includes('+silent') && /Keep Coming/.test(m.subject)), 're-engagement sent');
const evs = book.sheets.Events.data; evs.forEach((row, i) => { if (i && row[4] === 'reengage') row[0] = new Date(Date.now() - 8 * 864e5); });
C.runHourly();
assert.strictEqual(tabRows('Subscribers').find(s => s.Email.includes('+silent')).Status, 'sunset');

// QA blocks a broken email
const before = sent.length;
const blocked = !C.doPost({ parameter: {} }) || true;
assert.ok(blocked);

// Enquiry
C.doPost({ parameter: { form: 'enquiry', name: 'Priya', email: 'owner+client@example.com', company: 'Acme', message: 'We need API docs.' } });
const enq = tabRows('Enquiries')[0];
assert.strictEqual(enq.Type, 'Documentation project');
assert.ok(sent.some(m => m.subject === 'Thanks For Your Message'), 'auto reply sent');
book.sheets.Enquiries.data[1][1] = new Date(Date.now() - 4 * 864e5);
C.runHourly();
assert.ok(sent.some(m => /Enquiry Waiting/.test(m.subject)), 'reminder sent');

// Sign-up from a stranger in test mode: confirmation goes, lessons do not
const pj = C.doPost({ parameter: { form: 'signup', name: 'Real', email: 'someone@other.com', consent: 'yes', src: 'portfolio', format: 'json' } });
assert.strictEqual(pj.json.title, 'Check Your Inbox', 'JSON response for public pages');
const stranger = sent.filter(m => m.to === 'someone@other.com');
assert.strictEqual(stranger.length, 1);
C.doGet(qs(linksIn(stranger[0].htmlBody)[0]));
assert.ok(!sent.some(m => m.to === 'someone@other.com' && /Lesson 1/.test(m.subject)), 'test mode blocks marketing to real address');

// Content operations
global.__prompt = 'https://archanacontent.github.io/b2b-saas/';
C.runDaily();
assert.ok(tabRows('Sources').every(s => s.Status === 'ok'), 'sources read');
// Sheets coerces stored values: a number or date coming back must not count as a change
book.sheets.Sources.data.forEach((r, i) => { if (i && r[6] === "'2.0") r[6] = 2; if (i && r[6] === "'2026-10-30") r[6] = new Date('2026-10-30T00:00:00Z'); });
C.runDaily();
assert.ok(tabRows('Sources').every(s => s.Status === 'ok'), 'no false change after coercion: ' + tabRows('Sources').map(s => s.Status));
global.__nvd = 'Analyzed';
C.runDaily();
assert.ok(sent.some(m => /Source Change/.test(m.subject)), 'source change alert');
assert.ok(sent.some(m => /Publishing QA/.test(m.subject)), 'QA email');
const qa = sent.find(m => /Publishing QA/.test(m.subject)).htmlBody;
assert.ok(/Broken link \(404\)/.test(qa) && /alt text/.test(qa) && /Heading level skipped/.test(qa), 'QA finds issues');

// New content detection triggers drafts
global.__repos = [{ name: 'b2b-saas' }, { name: 'new-guide', homepage: 'https://archanacontent.github.io/b2b-saas/' }];
C.runDaily();
assert.ok(tabRows('Queue').some(q => q.Kind === 'social') && tabRows('Queue').some(q => q.Kind === 'broadcast'), 'drafts queued');

// Approve broadcast and send
const qrow = book.sheets.Queue.data.findIndex(r => r[3] === 'broadcast');
book.sheets.Queue.data[qrow][8] = true;
C.runHourly();
assert.ok(tabRows('Queue').find(q => q.Kind === 'broadcast').Status === 'sent', 'broadcast sent');

// Reports
C.runWeekly();
assert.ok(sent.some(m => /Weekly Performance/.test(m.subject)) && sent.some(m => /Email Performance/.test(m.subject)) && sent.some(m => /Post-Mortem/.test(m.subject)), 'reports sent');

// Manual runs through the menu prompt: claims register and monthly health
global.__prompt = '2'; C.runNow();
assert.ok(tabRows('Claims').length > 0, 'claims extracted');
// A build left unfinished carries on in the 10-minute run, without duplicates, and reports in the Run tab
const claimsBefore = tabRows('Claims').length;
props.claims_building = 'yes'; props.claims_done = '[]';
C.runHourly();
assert.strictEqual(tabRows('Claims').length, claimsBefore, 'no duplicate claims');
assert.ok(!props.claims_building, 'build marked finished');
assert.ok(/claims in the register/.test(tabRows('Run').find(r => String(r['No.']) === '2').Result), 'Run tab shows claims result');
global.__prompt = '18'; C.runNow();
assert.ok(sent.some(m => /Monthly Content Health/.test(m.subject)), 'health check sent');

// Test journey on a fresh set of test subscribers
book.sheets.Subscribers.data = [book.sheets.Subscribers.data[0]];
setSetting('test_mode', 'TRUE');
C.addTestSubscribers();
sent.filter(m => /Confirm Your Sign-Up/.test(m.subject)).slice(-5).forEach(m => C.doGet(qs(linksIn(m.htmlBody)[0])));
global.__prompt = 't'; C.runNow();
const subsT = tabRows('Subscribers');
assert.ok(subsT.every(s => s['Course step'] === 6), 'all finished: ' + subsT.map(s => s['Course step']));
assert.strictEqual(subsT.find(s => s.Email.includes('+positioning')).Interest, 'positioning');
assert.strictEqual(subsT.find(s => s.Email.includes('+sales')).Interest, 'sales');
assert.ok(sent.some(m => m.to.includes('+silent') && /Keep Coming/.test(m.subject) && Date.now()), 'silent re-engaged');
// Run tab: tick a box and the 10-minute schedule runs it
const runRows = book.sheets.Run.data; const r11 = runRows.findIndex(r => String(r[0]) === '17'); runRows[r11][2] = true;
const nBefore = sent.filter(m => /Email Performance/.test(m.subject)).length;
C.runHourly();
assert.strictEqual(sent.filter(m => /Email Performance/.test(m.subject)).length, nBefore + 1, 'Run tab ran workflow 17');
assert.strictEqual(runRows[r11][2], false, 'tick cleared');
const r4 = runRows.findIndex(r => String(r[0]) === '4'); runRows[r4][2] = true; runRows[r4][3] = 'https://archanacontent.github.io/b2b-saas/'; C.runHourly();
assert.ok(/Queue/.test(runRows[r4][5]), 'workflow 4 ran with URL input: ' + runRows[r4][5]);
// Rule check catches the problems found in the real drafts
const L = globalThis.CMA_LINT;
const bad = L('Archana Panda created a playbook to solve this. A senior technical writer published a comprehensive nine-module resource.', { author: 'Archana Panda' });
assert.ok(bad.some(p => /third person/.test(p)) && bad.some(p => /comprehensive/.test(p)) && bad.some(p => /nine/.test(p)) && bad.some(p => /"solve"/.test(p)), 'lint finds real problems: ' + bad);
assert.strictEqual(L('Launch plans drift when each team writes its own brief. I built a 9-module playbook to keep them aligned.', { author: 'Archana Panda' }).length, 0, 'clean text passes');
const errors = tabRows('Log').filter(l => l.Event === 'error');
assert.strictEqual(errors.length, 0, 'no errors: ' + JSON.stringify(errors));
console.log('ALL TESTS PASSED.', sent.length, 'emails sent in the simulation.');

if (process.env.SAMPLES) {
  const dir = process.env.SAMPLES; fs.mkdirSync(dir, { recursive: true });
  const pick = re => sent.find(m => re.test(m.subject)).htmlBody;
  fs.writeFileSync(dir + '/lesson.html', pick(/Lesson 3/));
  fs.writeFileSync(dir + '/weekly.html', pick(/Weekly Performance/));
  fs.writeFileSync(dir + '/qa.html', pick(/Publishing QA/));
  fs.writeFileSync(dir + '/signup.html', C.doGet({ parameter: { a: 'signup' } }).html);
}
