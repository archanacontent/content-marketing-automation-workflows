/* Renders the real outputs from the test run as images for the workflow guides.
   It runs the actual workflow code against the figures and AI notes the live run produced,
   then screenshots each email in full. Usage: node build/render_outputs.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const harness = fs.readFileSync(path.join(ROOT, 'test/harness.js'), 'utf8');
globalThis.require = require;
(0, eval)(harness.slice(0, harness.indexOf('/* ---------- Load bundle')).replace(/^const /gm, 'var '));
let bundle = fs.readFileSync(path.join(ROOT, 'apps-script/dist/cma.js'), 'utf8');
bundle = bundle.slice(bundle.indexOf('(function () {') + 14, bundle.lastIndexOf('})();'));
(0, eval)(bundle);
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-run-data.json'), 'utf8'));

setup();
const put = (tab, rows) => rows.forEach(r => append_(tab, r));
const now = new Date();
const subs = R.subscribers.map((s, i) => ({ ID: 's' + i, Email: 'test+' + s.key + '@example.com', Name: 'Test', Status: 'active', 'Signed up': now, Confirmed: now, 'Course step': 6, Interest: s.interest, 'Is test': true }));
put('Subscribers', subs);
const ev = [];
const send = (id, campaign, msg) => ev.push({ Time: now, 'Subscriber ID': id, Type: 'sent', Campaign: campaign, Message: msg });
const click = (id, msg) => ev.push({ Time: now, 'Subscriber ID': id, Type: 'click', Campaign: 'course', Message: msg });
subs.forEach((s, i) => {
  send(s.ID, 'confirmation', 'Confirm'); ev.push({ Time: now, 'Subscriber ID': s.ID, Type: 'confirmed' });
  for (let l = 1; l <= 5; l++) { send(s.ID, 'course', 'lesson-' + l); if (l > 1 || i < 4) click(s.ID, 'lesson-' + l); }
  send(s.ID, 'next-best', 'next-best-' + (s.Interest || 'none'));
});
send('s4', 'reengage', 'reengage'); click('s4', 'reengage');
put('Events', ev);
put('Claims', Array.from({ length: R.nvdClaims }, (_, i) => ({ ID: 'c' + i, Guide: 'nvd-cve-api-docs', Page: '/', Claim: 'claim', Status: 'needs first check', 'Recheck by': now })));
book.sheets.Settings.data.find(r => r[0] === 'ga4_property_id')[1] = '1';

const ranges = {};
ranges[ago_(7)] = R.weekly.views; ranges[ago_(14)] = R.weekly.previous; ranges[ago_(28)] = R.monthly.views; ranges[ago_(56)] = {};
AnalyticsData.Properties.runReport = req => {
  const d = req.dimensions[0].name, start = req.dateRanges[0].startDate;
  const data = d === 'sessionSource' ? R.weekly.sources : ranges[start] || {};
  return { rows: Object.entries(data).map(([k, v]) => ({ dimensionValues: [{ value: k }], metricValues: [{ value: String(v) }, { value: String(v) }] })) };
};
let notes = R.notes.weekly;
globalThis.gemini_ = () => notes;

const out = {};
const grab = (key, fn) => { const n = sent.length; fn(); out[key] = sent.slice(n).map(m => m.htmlBody)[0]; };
grab('16-weekly-performance-report', () => { notes = R.notes.weekly; weeklyReport_(); });
grab('17-email-performance-report', () => { notes = R.notes.email; emailReport_(); });
grab('18-monthly-content-health', () => monthlyHealth_());
grab('19-course-post-mortem', () => { notes = R.notes.postmortem; coursePostMortem_(true); });
out['03-publishing-qa'] = frame_('<p>Publishing QA results after the latest commits.</p>' + R.qa.map(q => '<p><b>' + esc_(q.repo) + '</b> (' + q.sha + '): ' + q.pages + ' pages, no issues.</p>').join(''), { title: 'Publishing QA Results', label: 'Workflow 3', wide: true });
const d = R.drafts, draft = 'LINKEDIN\n\n' + numerals_(d.linkedin) + '\n\n---\n\nREDDIT TITLE\n' + titleCase_(d.reddit_title) + '\n\nREDDIT BODY\n' + numerals_(d.reddit_body);
out['05-distribution-drafts'] = frame_('<p>Drafts for your review. Edit them, then post them yourself.</p><pre style="white-space:pre-wrap;font-family:inherit">' + esc_(draft) + '</pre>', { title: 'Post Drafts For Review', label: 'Workflow 5' });

/* Mail apps show these emails in Arial. Liberation Sans has the same letter widths, so the images match. */
const FONT = '@font-face{font-family:Arial;src:local("Liberation Sans")}@font-face{font-family:Arial;font-weight:700;src:local("Liberation Sans Bold")}@font-face{font-family:Inter;src:local("Liberation Sans")}@font-face{font-family:Inter;font-weight:700;src:local("Liberation Sans Bold")}*{font-family:Arial,sans-serif}pre{font-family:Arial,sans-serif!important}';
(async () => {
  const { chromium } = require(process.env.PW || 'playwright');
  const b = await chromium.launch(), dir = path.join(ROOT, 'docs/assets/outputs');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, html] of Object.entries(out)) {
    const p = await b.newPage({ viewport: { width: 440, height: 800 }, deviceScaleFactor: 2 });
    await p.setContent('<!doctype html><meta charset="utf-8"><style>' + FONT + '</style><body style="margin:0">' + html + '</body>');
    await p.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
    await p.close();
  }
  await b.close();
  console.log('rendered', Object.keys(out).length, 'outputs');
})();
