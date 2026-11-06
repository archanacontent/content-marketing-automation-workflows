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

/* Sheets turns "2.0" into 2 and "2026-10-28" into a date when it stores them. Values are
   normalised before comparing and written back as text, so that never reads as a change. */
function norm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var t = String(v === undefined || v === null ? '' : v).replace(/^'/, '').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? String(Number(t)) : t;
}

function watchSources_() {
  var changes = [];
  rows_('Sources').forEach(function (s) {
    var now;
    try { now = readSource_(s); } catch (err) { update_('Sources', s._row, { 'Last checked': new Date(), Status: 'error: ' + err.message.slice(0, 120) }); return; }
    var was = s['Last value'] === '' || s['Last value'] === undefined ? '' : norm_(s['Last value']);
    var upd = { 'Last checked': new Date(), 'Last value': "'" + now, Status: 'ok' };
    if (was && was !== norm_(now)) {
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

/* Builds the register a few pages at a time. Apps Script stops any run after 6 minutes, so each run
   works for up to 4 minutes, remembers where it stopped and carries on at the next run. */
function buildClaims_() {
  var started = Date.now(), done = JSON.parse(prop_('claims_done') || '[]'), added = 0, finished = true;
  var pages = [];
  guideRepos_().forEach(function (repo) { crawl_(siteOf_(repo), 6).forEach(function (pg) { pages.push({ repo: repo, pg: pg }); }); });
  for (var i = 0; i < pages.length; i++) {
    var repo = pages[i].repo, pg = pages[i].pg, path = pg.url.replace(/^https:\/\/[^/]+/, '');
    if (done.indexOf(pg.url) >= 0) continue;
    if (Date.now() - started > 4 * 60 * 1000) { finished = false; break; }
    var text = pageText_(pg.html);
    done.push(pg.url);
    if (!/(19|20)\d\d|\d+(\.\d+)?\s?%|\bversion\b/i.test(text)) continue;
    var found = [];
    try {
      found = gemini_('From the documentation page below, list factual claims that can go out of date: dates, deadlines, statistics, scores, version numbers, regulatory statuses and prices. ' +
        'Return JSON: an array of objects with keys claim (quote or close paraphrase, under 30 words), source_url (a URL cited near the claim, or empty), cadence_days (how often it should be rechecked: 30, 90 or 365). Return at most 8 items. Only include claims stated in the text.\n\nPAGE: ' + path + '\n\n' + text.slice(0, 12000), { json: true, temperature: 0 });
    } catch (err) { log_('Claims register', 'extraction failed', path + ': ' + err.message); continue; }
    (found || []).forEach(function (c) {
      var cadence = Number(c.cadence_days) || 90;
      append_('Claims', { ID: uid_('c'), Guide: repo, Page: path, Claim: c.claim, 'Source URL': c.source_url || '', 'Last verified': '', 'Recheck by': new Date(Date.now() + days_(Math.min(cadence, 30))), 'Cadence days': cadence, Status: 'needs first check' });
      added++;
    });
  }
  prop_('claims_done', JSON.stringify(finished ? [] : done));
  prop_('claims_building', finished ? '' : 'yes');
  return { added: added, finished: finished, left: pages.length - done.length };
}

function checkClaims_(manual) {
  if (!rows_('Claims').length || prop_('claims_building') === 'yes') {
    if (!manual && prop_('claims_building') !== 'yes') return 'Register empty';
    var r = buildClaims_();
    if (!r.finished) return r.added + ' claims added so far, ' + r.left + ' pages left. The next run carries on.';
    var total = rows_('Claims').length;
    notifyOwner_('Claims Register Built', total + ' claims were extracted from your guides. Each one needs a first check: confirm it, add the date in Last verified, and the recheck date resets automatically.');
    return total + ' claims in the register';
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
  /* Pages that ask search engines not to index them, such as a site search page, need no SEO checks. */
  if (/<meta name="robots" content="[^"]*noindex/i.test(h)) return issues;
  if (!/<title>[^<]{5,}<\/title>/i.test(h)) issues.push('Missing or empty title');
  var desc = (h.match(/<meta name="description" content="([^"]*)"/i) || [])[1];
  if (desc) desc = desc.replace(/&#x?([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, /x/i.test(m) ? 16 : 10)); }).replace(/&(amp|lt|gt|quot);/g, ' ');
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
    /* Only real links count: preconnect and stylesheet hints point at hosts, not pages. */
    var body = p.html.replace(/<link\b[^>]*>/gi, '');
    (body.match(/href="(https?:[^"#]+|[^"#:]+)"/g) || []).forEach(function (h) {
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
  var author = setting_('owner_name');
  var out = geminiChecked_(WRITING_RULES + '\n\nDraft posts that ' + author + ' will publish under her own name about a piece of work she made. Write in the first person singular (I, my). Never write her name and never refer to her as she, her or the author. ' +
    'Return JSON with keys linkedin (120 to 180 words, opens with the reader problem, no hashtags, link on its own final line) and reddit_title (under 90 characters, a plain statement of the problem for practitioners to discuss, not a question, no clickbait) and reddit_body (100 to 150 words, a discussion starter for practitioners, not promotional, link mentioned once at the end as a resource).\n\n' +
    'Title: ' + item.title + '\nURL: ' + item.url + '\nDescription: ' + item.description + '\nPage text:\n' + String(item.text).split(author).join(''), ['linkedin', 'reddit_title', 'reddit_body'], { author: author });
  var draft = 'LINKEDIN\n\n' + out.linkedin + '\n\n---\n\nREDDIT TITLE\n' + titleCase_(out.reddit_title) + '\n\nREDDIT BODY\n' + out.reddit_body;
  var status = out._problems.length ? 'needs edit: ' + out._problems.join('; ') : 'for review';
  append_('Queue', { ID: uid_('q'), Created: new Date(), Workflow: 'Distribution drafts', Kind: 'social', Target: item.url, Subject: 'Posts For ' + item.title, Draft: draft, Status: status });
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
