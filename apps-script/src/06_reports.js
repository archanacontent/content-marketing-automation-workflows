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
    /* Confirming a sign-up is the click on the confirmation email. */
    var type = e.Type === 'confirmed' ? 'click' : e.Type;
    if (type !== 'sent' && type !== 'click') return;
    var m = e.Type === 'confirmed' ? 'confirmation' : (e.Message || e.Campaign); if (!m) return;
    if (e.Campaign === 'confirmation' && e.Type === 'sent') m = 'confirmation';
    msgs[m] = msgs[m] || { sent: {}, clicked: {} };
    if (type === 'sent') msgs[m].sent[e['Subscriber ID']] = 1; else msgs[m].clicked[e['Subscriber ID']] = 1;
  });
  return Object.keys(msgs).map(function (m) {
    var s = Object.keys(msgs[m].sent).length, c = Object.keys(msgs[m].clicked).length;
    return { message: label_(m), sent: s, clicked: c, rate: s ? Math.round(c / s * 100) : 0 };
  }).filter(function (x) { return x.sent; });
}

function label_(m) {
  var names = { confirmation: 'Confirmation', reengage: 'Re-Engagement' };
  if (names[m]) return names[m];
  var l = String(m).match(/^lesson-(\d)$/); if (l) return 'Lesson ' + l[1];
  var n = String(m).match(/^next-best-(\w+)$/); if (n) return 'Next-Best (' + n[1].charAt(0).toUpperCase() + n[1].slice(1) + ')';
  return m;
}

function emailReport_() {
  var stats = emailStats_(), subs = rows_('Subscribers');
  var status = {}; subs.forEach(function (s) { status[s.Status] = (status[s.Status] || 0) + 1; });
  var funnel = [1, 2, 3, 4, 5, 6].map(function (n) { return [n === 6 ? 'Next-best email' : 'Lesson ' + n, subs.filter(function (s) { return Number(s['Course step']) >= n; }).length]; });
  var order = ['Lesson 1', 'Lesson 2', 'Lesson 3', 'Lesson 4', 'Lesson 5'];
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
  var stats = emailStats_().filter(function (s) { return /^Lesson|^Next-Best|^Re-Engagement/.test(s.message); });
  var topics = {}; subs.forEach(function (s) { var t = s.Interest || 'none'; topics[t] = (topics[t] || 0) + 1; });
  var facts = { cohort_size: subs.length, finished: finished.length, unsubscribed: subs.filter(function (s) { return s.Status === 'unsubscribed'; }).length, sunset: subs.filter(function (s) { return s.Status === 'sunset'; }).length, per_email: stats, top_topics: topics };
  var notes;
  try {
    notes = gemini_(WRITING_RULES + '\n\nWrite a post-mortem of an email course cohort. Return JSON with keys worked (array), underperformed (array), change_next (array of specific changes to test with the next cohort). Up to 3 items each. Use only the facts. If the cohort is small, say results are directional.\n\nFACTS:\n' + JSON.stringify(facts), { json: true, temperature: 0.2 });
  } catch (err) { notes = { worked: [], underperformed: [], change_next: ['AI notes unavailable: ' + err.message] }; }
  var list = function (arr) { return '<ul>' + (arr || []).map(function (x) { return '<li>' + esc_(x) + '</li>'; }).join('') + '</ul>'; };
  var html = '' +
    table_(['Cohort', 'Count'], [['Confirmed', facts.cohort_size], ['Finished Or Exited', facts.finished], ['Unsubscribed', facts.unsubscribed], ['Sunset', facts.sunset]]) +
    table_(['Email', 'Sent', 'Clicked', 'Click Rate'], stats.map(function (s) { return [s.message, s.sent, s.clicked, s.rate + '%']; })) +
    table_(['Strongest Interest', 'Subscribers'], Object.keys(topics).map(function (k) { return [TOPICS[k] || 'No Clicks', topics[k]]; })) +
    '<h3 style="font-size:15px">What Worked</h3>' + list(notes.worked) + '<h3 style="font-size:15px">What Underperformed</h3>' + list(notes.underperformed) + '<h3 style="font-size:15px">What To Change Next Time</h3>' + list(notes.change_next);
  append_('Queue', { ID: uid_('q'), Created: new Date(), Workflow: 'Course post-mortem', Kind: 'report', Target: 'course', Subject: 'Post-Mortem For A Cohort Of ' + subs.length, Draft: JSON.stringify(notes), Status: 'archived' });
  MailApp.sendEmail({ to: setting_('owner_email'), subject: '[Report] Course Post-Mortem', htmlBody: frame_(html, { title: 'Course Post-Mortem', label: 'Workflow 19', wide: true }), name: 'Content Marketing Automation' });
  return 'Post-mortem sent';
}
