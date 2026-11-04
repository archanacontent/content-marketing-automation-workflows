"""Generate the n8n versions of the 19 workflows into n8n/*.json.

Every workflow reads its settings from a Config node at the start. Replace the
YOUR_... placeholders there after importing. Credentials are attached in n8n:
Google Sheets, Gmail, Google Analytics, a Google OAuth2 credential with the
Search Console scope, and an HTTP Header Auth credential named "Gemini API key"
(header x-goog-api-key).
"""
import json, os, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "n8n")
os.makedirs(OUT, exist_ok=True)

CONFIG = """return [{ json: {
  sheetUrl: 'YOUR_CONTROL_SHEET_URL',
  ownerEmail: 'YOUR_EMAIL',
  ownerName: 'YOUR_NAME',
  ga4PropertyId: 'YOUR_GA4_PROPERTY_ID',
  siteUrl: 'https://YOUR_SITE/',
  githubOwner: 'YOUR_GITHUB_USERNAME',
  guideSites: ['https://YOUR_SITE/guide-one/', 'https://YOUR_SITE/guide-two/'],
  pagesUrl: 'https://YOUR_SITE/your-repo/',
  geminiModel: 'gemini-flash-latest',
  linkSecret: 'REPLACE_WITH_A_LONG_RANDOM_STRING'
} }];"""

WRITING_RULES = ("Write in plain, professional English for B2B readers. Title Case for headings and subjects. "
                 "Lead with the reader problem. No em dashes, semicolons, exclamation marks, emojis or hype words. "
                 "Do not start sentences with This, These or That. Never invent numbers, quotes or results.")


class WF:
    def __init__(self, name, number):
        self.name, self.number, self.nodes, self.conn, self.x = name, number, [], {}, 0
        self.notes = []

    def node(self, name, type_, params, version, after=None, creds=None, y=300, x=None):
        n = {"parameters": params, "id": str(uuid.uuid5(uuid.NAMESPACE_URL, self.name + name)), "name": name,
             "type": type_, "typeVersion": version, "position": [x if x is not None else self.x, y]}
        if creds:
            n["credentials"] = {creds: {"id": "", "name": creds}}
        self.nodes.append(n)
        if x is None:
            self.x += 240
        for a in ([after] if isinstance(after, str) else after or []):
            self.conn.setdefault(a, {"main": [[]]})["main"][0].append({"node": name, "type": "main", "index": 0})
        return name

    def note(self, text, w=520, h=220):
        self.nodes.append({"parameters": {"content": text, "height": h, "width": w}, "id": str(uuid.uuid5(uuid.NAMESPACE_URL, self.name + "note" + text[:20])),
                           "name": "Sticky Note" + (str(len(self.notes)) if self.notes else ""), "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [0, 20]})
        self.notes.append(text)

    def save(self, slug):
        data = {"name": f"{self.number:02d} | {self.name}", "nodes": self.nodes, "connections": self.conn,
                "settings": {"executionOrder": "v1"}, "pinData": {}, "meta": {"templateCredsSetupCompleted": False}}
        with open(os.path.join(OUT, f"{self.number:02d}-{slug}.json"), "w") as f:
            json.dump(data, f, indent=2)


# ---------- node helpers ----------
def schedule(field, **kw):
    rule = {"field": field}
    rule.update(kw)
    return ("n8n-nodes-base.scheduleTrigger", {"rule": {"interval": [rule]}}, 1.2)

def code(js):
    return ("n8n-nodes-base.code", {"jsCode": js}, 2)

def sheet_read(tab):
    return ("n8n-nodes-base.googleSheets", {"operation": "read",
            "documentId": {"__rl": True, "mode": "url", "value": "={{ $('Config').first().json.sheetUrl }}"},
            "sheetName": {"__rl": True, "mode": "name", "value": tab}, "options": {}}, 4.5)

def sheet_write(tab, op="append", match=None):
    p = {"operation": op, "documentId": {"__rl": True, "mode": "url", "value": "={{ $('Config').first().json.sheetUrl }}"},
         "sheetName": {"__rl": True, "mode": "name", "value": tab},
         "columns": {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": [match] if match else []}, "options": {}}
    return ("n8n-nodes-base.googleSheets", p, 4.5)

def gmail(to, subject, html):
    return ("n8n-nodes-base.gmail", {"sendTo": to, "subject": subject, "emailType": "html", "message": html,
            "options": {"appendAttribution": False}}, 2.1)

def gemini(prompt_expr, json_out=True):
    body = ("={{ JSON.stringify({ contents: [{ role: 'user', parts: [{ text: " + prompt_expr + " }] }], "
            "generationConfig: { temperature: 0.3" + (", responseMimeType: 'application/json'" if json_out else "") + " } }) }}")
    return ("n8n-nodes-base.httpRequest", {"method": "POST",
            "url": "=https://generativelanguage.googleapis.com/v1beta/models/{{ $('Config').first().json.geminiModel }}:generateContent",
            "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendBody": True, "specifyBody": "json", "jsonBody": body,
            "options": {"retry": {"maxTries": 3, "waitBetweenTries": 3000}}}, 4.2)

def http(url, method="GET", auth=None, body=None):
    p = {"method": method, "url": url, "options": {}}
    if auth:
        p.update({"authentication": "predefinedCredentialType", "nodeCredentialType": auth})
    if body:
        p.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
    return ("n8n-nodes-base.httpRequest", p, 4.2)

def webhook(path):
    return ("n8n-nodes-base.webhook", {"httpMethod": "GET", "path": path, "responseMode": "responseNode", "options": {}}, 2)

def respond_json():
    return ("n8n-nodes-base.respondToWebhook", {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}",
            "options": {"responseHeaders": {"entries": [{"name": "Access-Control-Allow-Origin", "value": "*"}]}}}, 1.1)

def form(title, desc, fields):
    return ("n8n-nodes-base.formTrigger", {"formTitle": title, "formDescription": desc,
            "formFields": {"values": fields}, "options": {"respondWithOptions": {"values": {"formSubmittedText": "Thanks. A confirmation is on its way to your inbox."}}}}, 2.2)

GEMINI_CRED = "httpHeaderAuth"
TEXT = "{{ JSON.parse($json.candidates[0].content.parts[0].text) }}"
PARSE = ("const t = $json.candidates[0].content.parts[0].text;\n"
         "return [{ json: Object.assign({}, $('{src}').first().json, JSON.parse(t)) }];")

SIGN = """const crypto = require('crypto');
const sign = (q, secret) => crypto.createHmac('sha256', secret).update(q).digest('base64url').slice(0, 16);
const link = (params) => { const q = Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  return cfg.pagesUrl + 'go/?' + q + '&s=' + sign(q, cfg.linkSecret); };"""

TEMPLATE = """const brand = (o) => '<div style="background:#EFEBE3;padding:24px 10px"><table role="presentation" width="100%" style="max-width:580px;margin:0 auto">' +
  '<tr><td style="background:#131416;padding:30px;border-radius:14px 14px 0 0"><div style="font:700 11px Arial;letter-spacing:.18em;color:#D9A441">' + o.owner.toUpperCase() + '</div>' +
  (o.label ? '<div style="margin-top:14px;display:inline-block;border:1px solid #3A3B40;border-radius:999px;padding:5px 12px;font:600 12px Arial;color:#C9C4BA">' + o.label + '</div>' : '') +
  '<h1 style="margin:16px 0 0;font:800 26px/1.22 Arial;color:#F4F0E8">' + o.title + '</h1></td></tr>' +
  '<tr><td style="background:#fff;padding:30px;border-radius:0 0 14px 14px">' +
  (o.hook ? '<p style="margin:0 0 16px;font:600 18px/1.5 Arial;color:#17181B;border-left:3px solid #D9A441;padding-left:14px">' + o.hook + '</p>' : '') +
  (o.paras || []).map(p => '<p style="margin:0 0 14px;font:15.5px/1.65 Arial;color:#2B2C30">' + p + '</p>').join('') + (o.html || '') +
  (o.buttons || []).map((b, i) => '<a href="' + b.url + '" style="display:block;margin:' + (i ? 10 : 22) + 'px 0 0;padding:15px;border-radius:999px;text-align:center;text-decoration:none;font:700 15px Arial;' +
    (i ? 'border:2px solid #17181B;color:#17181B' : 'background:#D9A441;color:#17181B') + '">' + b.text + ' &rarr;</a>').join('') +
  '</td></tr>' + (o.footer ? '<tr><td style="padding:18px 30px 0;font:12px/1.6 Arial;color:#6B6862;text-align:center">' + o.footer + '</td></tr>' : '') + '</table></div>';"""


def start(w, trigger):
    t = w.node(trigger[3] if len(trigger) > 3 else "Trigger", *trigger[:3])
    return w.node("Config", *code(CONFIG), after=t)


# ---------------- Content operations ----------------
w = WF("Source Change Watch", 1)
w.note("## Source Change Watch\nReads the Sources tab, fetches each official source, compares the value with the last one stored, updates the tab and emails the guides affected by any change.")
c = start(w, schedule("days", triggerAtHour=7) + ("Every Morning At 7",))
r = w.node("Read Sources", *sheet_read("Sources"), after=c, creds="googleSheetsOAuth2Api")
k = w.node("Fetch And Compare", *code("""const pick = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
const out = [];
for (const item of $input.all()) {
  const s = item.json; let now;
  try {
    if (s.Kind === 'json') now = String(pick(await this.helpers.httpRequest({ url: s.Target, json: true }), s.Pattern));
    else { const t = await this.helpers.httpRequest({ url: s.Target }); now = String(t).includes(s.Pattern) ? 'listed' : 'not listed'; }
  } catch (e) { out.push({ json: { ID: s.ID, 'Last checked': new Date().toISOString(), Status: 'error: ' + e.message.slice(0, 100) } }); continue; }
  const changed = s['Last value'] && String(s['Last value']) !== now;
  out.push({ json: { ID: s.ID, 'Last value': now, 'Last checked': new Date().toISOString(), Status: changed ? 'changed' : 'ok', ...(changed ? { 'Last changed': new Date().toISOString() } : {}),
    _change: changed ? { name: s.Name, was: s['Last value'], now, guides: s['Guides affected'], url: s.Target } : null } });
}
return out;"""), after=r)
u = w.node("Update Sources", *sheet_write("Sources", "update", "ID"), after=k, creds="googleSheetsOAuth2Api")
f = w.node("Build Alert", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const ch = $('Fetch And Compare').all().map(i => i.json._change).filter(Boolean);
if (!ch.length) return [];
const list = '<ul>' + ch.map(c => '<li><b>' + c.name + '</b>: ' + c.was + ' &rarr; ' + c.now + '<br>Guides to check: ' + c.guides + '</li>').join('') + '</ul>';
return [{ json: { subject: '[Automation] ' + ch.length + ' Source Change(s) Affect Your Guides', html: brand({ owner: cfg.ownerName, label: 'Workflow 1', title: 'Source Change Alert', paras: ['A source your guides depend on has changed. Review the affected pages before readers notice.'], html: list }) } }];"""), after=u)
w.node("Email The Alert", *gmail("={{ $('Config').first().json.ownerEmail }}", "={{ $json.subject }}", "={{ $json.html }}"), after=f, creds="gmailOAuth2")
w.save("source-change-watch")

w = WF("Claims Register And Annual Versioning", 2)
w.note("## Claims Register And Annual Versioning\nWeekly: flags claims past their recheck date. On 1 January: asks Gemini for an update brief per guide, listing what to re-verify for the new edition.")
c = start(w, schedule("weeks", triggerAtDay=[1], triggerAtHour=7) + ("Every Monday",))
r = w.node("Read Claims", *sheet_read("Claims"), after=c, creds="googleSheetsOAuth2Api")
k = w.node("Find Due Claims", *code("""const now = Date.now(), due = [];
for (const i of $input.all()) { const c = i.json; const verified = c['Last verified'] ? new Date(c['Last verified']).getTime() : 0;
  const next = verified ? verified + (Number(c['Cadence days']) || 90) * 864e5 : new Date(c['Recheck by']).getTime();
  if (next < now) due.push(c); }
const d = new Date(); const annual = d.getMonth() === 0 && d.getDate() <= 7;
return [{ json: { due, annual, year: d.getFullYear() } }];"""), after=r)
g = w.node("Draft Annual Briefs", *gemini("'" + WRITING_RULES + " Write an update brief for the ' + $json.year + ' edition of each guide below. List what must be re-researched, grouped by guide and page, with the source to check. Do not guess new values. Return JSON: array of {guide, brief}. Claims: ' + JSON.stringify($json.due)"), after=k, creds=GEMINI_CRED)
e = w.node("Build Email", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const d = $('Find Due Claims').first().json; let briefs = [];
try { briefs = d.annual ? JSON.parse($json.candidates[0].content.parts[0].text) : []; } catch (e) {}
if (!d.due.length) return [];
const list = '<ul>' + d.due.map(c => '<li>' + c.Guide + ' / ' + c.Page + ': ' + c.Claim + '</li>').join('') + '</ul>' + briefs.map(b => '<h3>' + b.guide + '</h3><p>' + b.brief + '</p>').join('');
return [{ json: { subject: '[Automation] ' + d.due.length + ' Claim(s) Due For A Recheck', html: brand({ owner: cfg.ownerName, label: 'Workflow 2', title: 'Claims Due For A Recheck', html: list }) } }];"""), after=g)
w.node("Email The List", *gmail("={{ $('Config').first().json.ownerEmail }}", "={{ $json.subject }}", "={{ $json.html }}"), after=e, creds="gmailOAuth2")
w.save("claims-register-annual-versioning")

w = WF("Publishing QA", 3)
w.note("## Publishing QA\nChecks each guide site after a new commit: titles, meta descriptions, one H1, heading order, alt text and broken links. Commit changes come from GitHub's public Atom feed, which avoids the API rate limit.")
c = start(w, schedule("hours", hoursInterval=6) + ("Every 6 Hours",))
k = w.node("Crawl And Check", *code("""const cfg = $('Config').first().json, store = $getWorkflowStaticData('global'), report = [];
const abs = (h, b) => { try { return new URL(h, b).href.split('#')[0]; } catch (e) { return null; } };
for (const site of cfg.guideSites) {
  const repo = site.split('/').filter(Boolean).pop();
  const feed = await this.helpers.httpRequest({ url: 'https://github.com/' + cfg.githubOwner + '/' + repo + '/commits.atom' });
  const sha = (String(feed).match(/Commit\\/([0-9a-f]{7,40})/) || [])[1];
  if (sha && store[repo] === sha) continue; store[repo] = sha;
  const seen = new Set(), queue = [site], pages = [];
  while (queue.length && pages.length < 40) { const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    let h; try { h = await this.helpers.httpRequest({ url: u }); } catch (e) { continue; } pages.push({ u, h: String(h) });
    for (const m of String(h).matchAll(/href="([^"#]+)"/g)) { const x = abs(m[1], u); if (x && x.startsWith(site) && !/\\.(pdf|docx|xlsx|pptx|png|jpg|svg|css|js|xml)$/i.test(x)) queue.push(x); } }
  const issues = [];
  for (const p of pages) { const h = p.h, i = []; if (/<meta name="robots" content="[^"]*noindex/i.test(h)) continue;
    if (!/<title>[^<]{5,}<\\/title>/i.test(h)) i.push('Missing title');
    const d = (h.match(/<meta name="description" content="([^"]*)"/i) || [])[1]; if (!d) i.push('Missing meta description'); else if (d.length > 160) i.push('Meta description over 160 characters');
    const h1 = (h.match(/<h1[\\s>]/gi) || []).length; if (h1 !== 1) i.push(h1 + ' H1 headings');
    const lv = (h.match(/<h([1-6])[\\s>]/gi) || []).map(t => +t[2]); for (let j = 1; j < lv.length; j++) if (lv[j] - lv[j - 1] > 1) { i.push('Heading level skipped'); break; }
    const na = (h.match(/<img(?![^>]*\\balt=)[^>]*>/gi) || []).length; if (na) i.push(na + ' image(s) without alt text');
    if (i.length) issues.push(p.u.replace(/^https:\\/\\/[^/]+/, '') + ': ' + i.join('; ')); }
  const links = new Set(); pages.forEach(p => { for (const m of p.h.replace(/<link\\b[^>]*>/gi, '').matchAll(/href="(https:[^"#]+)"/g)) links.add(m[1]); });
  for (const l of [...links].slice(0, 120)) { try { await this.helpers.httpRequest({ url: l, method: 'GET' }); } catch (e) { const code = e.httpCode || (e.response && e.response.status); if (code == 404 || code == 410 || code >= 500) issues.push('Broken link (' + code + '): ' + l); } }
  report.push({ repo, pages: pages.length, issues, sha: (sha || '').slice(0, 7) }); }
return report.length ? [{ json: { report } }] : [];"""), after=c)
e = w.node("Build Report", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const html = $json.report.map(r => '<p><b>' + r.repo + '</b> (' + r.sha + '): ' + r.pages + ' pages' + (r.issues.length ? '' : ', no issues.') + '</p>' + (r.issues.length ? '<ul>' + r.issues.map(i => '<li>' + i + '</li>').join('') + '</ul>' : '')).join('');
return [{ json: { subject: '[Automation] Publishing QA For ' + $json.report.length + ' Site(s)', html: brand({ owner: cfg.ownerName, label: 'Workflow 3', title: 'Publishing QA Results', html }) } }];"""), after=k)
w.node("Email The Report", *gmail("={{ $('Config').first().json.ownerEmail }}", "={{ $json.subject }}", "={{ $json.html }}"), after=e, creds="gmailOAuth2")
w.save("publishing-qa")

w = WF("Metadata And Internal Links", 4)
w.note("## Metadata And Internal Links\nSubmit a page URL. Gemini suggests an SEO title, a meta description, alt text for images without it and up to three internal links. Suggestions go to the Queue tab for review.")
t = w.node("Page URL Form", *form("Metadata And Internal Links", "Paste the page to review.", [{"fieldLabel": "Page URL", "requiredField": True}]))
c = w.node("Config", *code(CONFIG), after=t)
p = w.node("Fetch Page", *code("""const url = $('Page URL Form').first().json['Page URL'];
const html = String(await this.helpers.httpRequest({ url }));
const pick = re => (html.match(re) || [, ''])[1].replace(/\\s+/g, ' ').trim();
return [{ json: { url, title: pick(/<title>([^<]+)<\\/title>/i), description: pick(/<meta name="description" content="([^"]+)"/i),
  images: (html.match(/<img(?![^>]*\\balt=)[^>]*src="([^"]+)"/gi) || []).slice(0, 10),
  text: html.replace(/<script[\\s\\S]*?<\\/script>|<style[\\s\\S]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 6000) } }];"""), after=c)
g = w.node("Ask Gemini", *gemini("'" + WRITING_RULES + " Suggest SEO metadata. Return JSON {seo_title (under 60 characters), meta_description (140 to 155 characters), alt_text: [{src, alt}], internal_links: [{anchor_text, target_url, reason}] chosen only from: ' + $('Config').first().json.guideSites.join(', ') + '}. Page: ' + JSON.stringify($json)"), after=p, creds=GEMINI_CRED)
q = w.node("Prepare Queue Row", *code("""const o = JSON.parse($json.candidates[0].content.parts[0].text), pg = $('Fetch Page').first().json;
const draft = 'SEO title: ' + o.seo_title + '\\n\\nMeta description: ' + o.meta_description + '\\n\\nAlt text:\\n' + (o.alt_text || []).map(a => '- ' + a.src + ': ' + a.alt).join('\\n') + '\\n\\nInternal links:\\n' + (o.internal_links || []).map(l => '- ' + l.anchor_text + ' to ' + l.target_url).join('\\n');
return [{ json: { ID: 'q' + Date.now(), Created: new Date().toISOString(), Workflow: 'Metadata and internal links', Kind: 'metadata', Target: pg.url, Subject: 'Metadata For ' + pg.title, Draft: draft, Status: 'for review' } }];"""), after=g)
w.node("Add To Queue", *sheet_write("Queue"), after=q, creds="googleSheetsOAuth2Api")
w.save("metadata-internal-links")

w = WF("Distribution Drafts", 5)
w.note("## Distribution Drafts\nTurns a new piece into a LinkedIn post and a Reddit discussion post. Drafts land in the Queue tab and your inbox. Nothing is posted automatically.")
t = w.node("New Piece Form", *form("Distribution Drafts", "Paste the URL of the published piece.", [{"fieldLabel": "Page URL", "requiredField": True}]))
c = w.node("Config", *code(CONFIG), after=t)
p = w.node("Fetch Page", *code("""const url = $('New Piece Form').first().json['Page URL'];
const html = String(await this.helpers.httpRequest({ url }));
return [{ json: { url, title: (html.match(/<title>([^<]+)<\\/title>/i) || [, ''])[1], text: html.replace(/<script[\\s\\S]*?<\\/script>|<style[\\s\\S]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 6000) } }];"""), after=c)
g = w.node("Draft Posts", *gemini("'" + WRITING_RULES + " Draft posts announcing this piece. Return JSON {linkedin (120 to 180 words, no hashtags, link on its own final line), reddit_title (Title Case, under 90 characters, a discussion question), reddit_body (100 to 150 words, discussion starter, link once at the end)}. Piece: ' + JSON.stringify($json)"), after=p, creds=GEMINI_CRED)
q = w.node("Prepare Drafts", *code("""const o = JSON.parse($json.candidates[0].content.parts[0].text), pg = $('Fetch Page').first().json;
const draft = 'LINKEDIN\\n\\n' + o.linkedin + '\\n\\n---\\n\\nREDDIT TITLE\\n' + o.reddit_title + '\\n\\nREDDIT BODY\\n' + o.reddit_body;
return [{ json: { ID: 'q' + Date.now(), Created: new Date().toISOString(), Workflow: 'Distribution drafts', Kind: 'social', Target: pg.url, Subject: 'Posts For ' + pg.title, Draft: draft, Status: 'for review' } }];"""), after=g)
a = w.node("Add To Queue", *sheet_write("Queue"), after=q, creds="googleSheetsOAuth2Api")
w.node("Email The Drafts", *gmail("={{ $('Config').first().json.ownerEmail }}", "=[Automation] {{ $('Prepare Drafts').first().json.Subject }}", "=<pre style=\"white-space:pre-wrap;font-family:Arial\">{{ $('Prepare Drafts').first().json.Draft }}</pre>"), after=a, creds="gmailOAuth2")
w.save("distribution-drafts")

# ---------------- Email journey ----------------
w = WF("Sign-Up And Double Opt-In", 6)
w.note("## Sign-Up And Double Opt-In\nThe public sign-up page posts here. New subscribers are stored as pending and receive a confirmation email with a signed link. Nothing else is sent until they confirm.")
t = w.node("Sign-Up Webhook", "n8n-nodes-base.webhook", {"httpMethod": "POST", "path": "cma-signup", "responseMode": "responseNode", "options": {}}, 2)
c = w.node("Config", *code(CONFIG), after=t)
v = w.node("Validate And Sign", *code("const cfg = $('Config').first().json;\n" + SIGN + """
const b = $('Sign-Up Webhook').first().json.body || {};
const email = String(b.email || '').trim().toLowerCase();
if (b.website || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email) || b.consent !== 'yes') return [{ json: { _reply: { title: 'Check Your Details', text: 'Add a valid email and tick the consent box.' } } }];
const id = 's' + require('crypto').randomBytes(4).toString('hex');
return [{ json: { ID: id, Email: email, Name: String(b.name || '').slice(0, 60), Source: b.src || 'direct', Status: 'pending', Consent: 'Form consent ' + new Date().toISOString(),
  'Signed up': new Date().toISOString(), 'Course step': 0, Clicks: 0, Scores: '{}', 'Is test': false, _confirm: link({ a: 'confirm', id }) } }];"""), after=c)
s = w.node("Store Subscriber", *sheet_write("Subscribers"), after=v, creds="googleSheetsOAuth2Api")
e = w.node("Build Confirmation", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const s = $('Validate And Sign').first().json; if (s._reply) return [];
return [{ json: { to: s.Email, subject: 'Confirm Your Sign-Up For The Launch Course', html: brand({ owner: cfg.ownerName, label: 'Launch Course', title: 'Confirm Your Sign-Up For The Launch Course',
  hook: 'Course emails sent to an unchecked address end up in spam or nowhere at all, so one quick check comes first.',
  paras: ['Confirm your email with the button below and lesson one arrives straight away. Five lessons follow, one every two days. If you did not sign up, ignore this email and nothing else will arrive.'],
  buttons: [{ text: 'Confirm My Email', url: s._confirm }] }) } }];"""), after=s)
m = w.node("Send Confirmation", *gmail("={{ $json.to }}", "={{ $json.subject }}", "={{ $json.html }}"), after=e, creds="gmailOAuth2")
r = w.node("Reply Data", *code("const s = $('Validate And Sign').first().json; return [{ json: s._reply || { title: 'Check Your Inbox', text: 'Confirmation email on its way. Tap the button inside it to start the course.' } }];"), after=m)
w.node("Respond", *respond_json(), after=r)
w.save("signup-double-opt-in")

w = WF("Welcome Email On Confirmation", 7)
w.note("## Welcome Email On Confirmation\nThe public link page calls this webhook when a subscriber taps Confirm My Email. The signature is checked, the subscriber is activated and Lesson 1 goes out at once.")
t = w.node("Link Webhook", *webhook("cma-link"))
c = w.node("Config", *code(CONFIG), after=t)
v = w.node("Verify Signature", *code("const cfg = $('Config').first().json;\n" + SIGN + """
const q = $('Link Webhook').first().json.query; const { s, format, ...rest } = q;
const ok = s && s === sign(Object.entries(rest).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'), cfg.linkSecret);
return [{ json: { ok, ...rest } }];"""), after=c)
rd = w.node("Read Subscribers", *sheet_read("Subscribers"), after=v, creds="googleSheetsOAuth2Api")
a = w.node("Activate And Build Lesson 1", *code("const cfg = $('Config').first().json;\n" + SIGN + TEMPLATE + """
const p = $('Verify Signature').first().json; if (!p.ok || p.a !== 'confirm') return [];
const sub = $input.all().map(i => i.json).find(r => r.ID === p.id); if (!sub) return [];
const L = { label: 'Welcome | Lesson 1 Of 5', title: 'Prove The Demand Before You Plan The Launch', hook: 'Most stalled launches were planned around a problem nobody measured.',
  paras: ['Before you write a positioning line, find out how many companies feel the pain and what their current workaround costs them. The research module gives you a weighted scorecard, so the go or no-go call rests on evidence instead of instinct.'],
  links: [['Read The Research Module', 'market-research/', 'research'], ['Download The Launch Workbook', 'templates/launch-playbook-workbook.xlsx', 'launch']] };
const base = 'https://archanacontent.github.io/b2b-saas/';
return [{ json: { ID: sub.ID, Status: 'active', Confirmed: new Date().toISOString(), 'Course step': 1, 'Next send': new Date(Date.now() + 48 * 36e5).toISOString(),
  _to: sub.Email, _subject: 'Lesson 1: ' + L.title, _html: brand({ owner: cfg.ownerName, label: L.label, title: L.title, hook: L.hook, paras: L.paras,
  buttons: L.links.map(l => ({ text: l[0], url: link({ a: 'c', id: sub.ID, m: 'lesson-1', t: l[2], u: base + l[1] }) })),
  footer: 'You are receiving this because you signed up for the launch course. <a href="' + link({ a: 'unsub', id: sub.ID }) + '">Unsubscribe in one click</a>' }) } }];"""), after=rd)
u = w.node("Update Subscriber", *sheet_write("Subscribers", "update", "ID"), after=a, creds="googleSheetsOAuth2Api")
m = w.node("Send Lesson 1", *gmail("={{ $('Activate And Build Lesson 1').first().json._to }}", "={{ $('Activate And Build Lesson 1').first().json._subject }}", "={{ $('Activate And Build Lesson 1').first().json._html }}"), after=u, creds="gmailOAuth2")
w.node("Respond", *respond_json(), after=w.node("Reply Data", *code("return [{ json: { title: 'You Are In', text: 'Lesson 1 is on its way to your inbox.' } }];"), after=m))
w.save("welcome-on-confirmation")

COURSE_JS = json.dumps([
    ["Lesson 2: Name The Buyer Before You Write A Word", "Lesson 2 Of 5", "A launch aimed at every company reaches no one in particular.", [["Read The ICP And Personas Module", "icp-and-personas/", "research"], ["Read The Competitive Intelligence Module", "competitive-intelligence/", "sales"]]],
    ["Lesson 3: Give Buyers One Reason To Choose You", "Lesson 3 Of 5", "If the website says one thing and the sales deck says another, buyers leave the first call knowing the category and little else.", [["Read The Positioning Module", "positioning-and-messaging/", "positioning"], ["Download The Positioning Template", "templates/04-positioning-and-messaging.docx", "positioning"]]],
    ["Lesson 4: Plan The Launch And Build Every Asset From One Brief", "Lesson 4 Of 5", "Launch content usually gets written last and in a hurry, so the product page promises one outcome and the announcement leads with another.", [["Read The Go-To-Market Plan Module", "go-to-market-and-launch-plan/", "launch"], ["Read The Launch Content Module", "launch-content-kit/", "launch"]]],
    ["Lesson 5: Prepare Sales For Day One And Measure What Moved", "Final Lesson | 5 Of 5", "A rep's first week with a new product decides how they sell it for the next year, and a recorded demo rarely covers it.", [["Read The Sales Enablement Module", "sales-enablement/", "sales"], ["Read The Performance Module", "performance-and-optimisation/", "sales"]]]
])
NEXT_JS = json.dumps({
    "research": ["Put Your Research To Work", "Research that never reaches a campaign brief ends up in a folder nobody opens.", "demand-generation-support/", "Read The Demand Generation Module"],
    "positioning": ["Keep Your Positioning Intact At Launch", "Positioning drifts the moment five people write launch assets from five different briefs.", "launch-content-kit/", "Read The Launch Content Module"],
    "launch": ["Set The Targets Before Launch Day", "A launch without agreed targets turns the 90-day review into a debate about what success meant.", "performance-and-optimisation/", "Read The Performance Module"],
    "sales": ["See The Sales Deck Filled In", "Reps struggle to picture a deck outline until they see one filled in for a worked example.", "templates/sample-sales-deck.pdf", "View The Sample Sales Deck"],
    "none": ["Start With The Module Closest To Your Launch", "A busy week can push a five-lesson course to the bottom of the inbox.", "", "Open The Playbook"]
})

w = WF("Course Sequence", 8)
w.note("## Course Sequence\nEvery hour, finds active subscribers whose next lesson is due and sends it. Lesson copy is kept short, with a pain-point hook and two CTA buttons tagged by topic for interest scoring.")
c = start(w, schedule("hours", hoursInterval=1) + ("Every Hour",))
rd = w.node("Read Subscribers", *sheet_read("Subscribers"), after=c, creds="googleSheetsOAuth2Api")
b = w.node("Build Due Lessons", *code("const cfg = $('Config').first().json;\n" + SIGN + TEMPLATE + "\nconst COURSE = " + COURSE_JS + """;
const base = 'https://archanacontent.github.io/b2b-saas/', out = [];
for (const i of $input.all()) { const s = i.json, step = Number(s['Course step'] || 0);
  if (s.Status !== 'active' || step < 1 || step > 4 || !s['Next send'] || new Date(s['Next send']) > new Date()) continue;
  const L = COURSE[step - 1], id = 'lesson-' + (step + 1);
  out.push({ json: { ID: s.ID, 'Course step': step + 1, 'Next send': new Date(Date.now() + 48 * 36e5).toISOString(), _to: s.Email, _subject: L[0],
    _html: brand({ owner: cfg.ownerName, label: L[1], title: L[0].replace(/^Lesson \\d: /, ''), hook: L[2], buttons: L[3].map(l => ({ text: l[0], url: link({ a: 'c', id: s.ID, m: id, t: l[2], u: base + l[1] }) })),
      footer: '<a href="' + link({ a: 'unsub', id: s.ID }) + '">Unsubscribe in one click</a>' }) } }); }
return out;"""), after=rd)
m = w.node("Send Lesson", *gmail("={{ $json._to }}", "={{ $json._subject }}", "={{ $json._html }}"), after=b, creds="gmailOAuth2")
w.node("Update Step", *code("return $('Build Due Lessons').all().map(i => ({ json: { ID: i.json.ID, 'Course step': i.json['Course step'], 'Next send': i.json['Next send'] } }));"), after=m)
w.node("Save Progress", *sheet_write("Subscribers", "update", "ID"), after="Update Step", creds="googleSheetsOAuth2Api")
w.save("course-sequence")

w = WF("Click Tracking And Interest Scoring", 9)
w.note("## Click Tracking And Interest Scoring\nThe public link page calls this webhook for every course button. The click is logged, the subscriber's topic scores are updated, and the page then redirects the reader to the module. Ties go to the topic clicked most recently.")
t = w.node("Click Webhook", *webhook("cma-click"))
c = w.node("Config", *code(CONFIG), after=t)
v = w.node("Verify Signature", *code("const cfg = $('Config').first().json;\n" + SIGN + """
const q = $('Click Webhook').first().json.query; const { s, format, ...rest } = q;
const ok = s && s === sign(Object.entries(rest).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'), cfg.linkSecret);
return [{ json: { ok, ...rest } }];"""), after=c)
rd = w.node("Read Subscribers", *sheet_read("Subscribers"), after=v, creds="googleSheetsOAuth2Api")
sc = w.node("Score Click", *code("""const p = $('Verify Signature').first().json; if (!p.ok || p.a !== 'c') return [];
const s = $input.all().map(i => i.json).find(r => r.ID === p.id); if (!s) return [];
let scores = {}; try { scores = JSON.parse(s.Scores || '{}'); } catch (e) {}
if (p.t) scores[p.t] = (scores[p.t] || 0) + 1;
const top = Object.keys(scores).sort((a, b) => scores[b] - scores[a] || (b === p.t) - (a === p.t))[0] || '';
return [{ json: { ID: s.ID, Clicks: Number(s.Clicks || 0) + 1, 'Last click': new Date().toISOString(), Scores: JSON.stringify(scores), Interest: top, _event: { Time: new Date().toISOString(), 'Subscriber ID': s.ID, Email: s.Email, Type: 'click', Campaign: 'course', Message: p.m, Link: p.u, Detail: p.t } } }];"""), after=rd)
u = w.node("Update Scores", *sheet_write("Subscribers", "update", "ID"), after=sc, creds="googleSheetsOAuth2Api")
ev = w.node("Event Row", *code("return [{ json: $('Score Click').first().json._event }];"), after=u)
lg = w.node("Log Event", *sheet_write("Events"), after=ev, creds="googleSheetsOAuth2Api")
w.node("Respond", *respond_json(), after=w.node("Redirect Data", *code("const u = $('Verify Signature').first().json.u || ''; return [{ json: { redirect: /^https:\\/\\/archanacontent\\.github\\.io\\//.test(u) ? u : 'https://archanacontent.github.io/b2b-saas/' } }];"), after=lg))
w.save("click-tracking-interest-scoring")

w = WF("Next-Best Email", 10)
w.note("## Next-Best Email\nAfter Lesson 5, each subscriber receives one follow-up chosen by their strongest topic. Subscribers with no clicks get a gentle pointer to the playbook home page.")
c = start(w, schedule("hours", hoursInterval=1) + ("Every Hour",))
rd = w.node("Read Subscribers", *sheet_read("Subscribers"), after=c, creds="googleSheetsOAuth2Api")
b = w.node("Pick Next-Best", *code("const cfg = $('Config').first().json;\n" + SIGN + TEMPLATE + "\nconst NEXT = " + NEXT_JS + """;
const base = 'https://archanacontent.github.io/b2b-saas/', out = [];
for (const i of $input.all()) { const s = i.json;
  if (s.Status !== 'active' || Number(s['Course step']) !== 5 || new Date(s['Next send']) > new Date()) continue;
  const n = NEXT[s.Interest] || NEXT.none;
  out.push({ json: { ID: s.ID, 'Course step': 6, 'Next send': '', _to: s.Email, _subject: n[0], _html: brand({ owner: cfg.ownerName, label: 'Your Next Step', title: n[0], hook: n[1],
    buttons: [{ text: n[3], url: link({ a: 'c', id: s.ID, m: 'next-best', t: s.Interest || 'none', u: base + n[2] }) }], footer: '<a href="' + link({ a: 'unsub', id: s.ID }) + '">Unsubscribe in one click</a>' }) } }); }
return out;"""), after=rd)
m = w.node("Send Next-Best", *gmail("={{ $json._to }}", "={{ $json._subject }}", "={{ $json._html }}"), after=b, creds="gmailOAuth2")
w.node("Save Progress", *sheet_write("Subscribers", "update", "ID"), after=w.node("Progress Rows", *code("return $('Pick Next-Best').all().map(i => ({ json: { ID: i.json.ID, 'Course step': 6, 'Next send': '' } }));"), after=m), creds="googleSheetsOAuth2Api")
w.save("next-best-email")

w = WF("Re-Engagement And Sunset", 11)
w.note("## Re-Engagement And Sunset\nSubscribers who click nothing in five emails get one check-in. Seven days later, if they still have not clicked, their status changes to sunset and every workflow stops emailing them.")
c = start(w, schedule("hours", hoursInterval=1) + ("Every Hour",))
rs = w.node("Read Subscribers", *sheet_read("Subscribers"), after=c, creds="googleSheetsOAuth2Api")
re_ = w.node("Read Events", "n8n-nodes-base.googleSheets", sheet_read("Events")[1] | {"options": {}}, 4.5, after=rs, creds="googleSheetsOAuth2Api")
b = w.node("Decide", *code("const cfg = $('Config').first().json;\n" + SIGN + TEMPLATE + """
const subs = $('Read Subscribers').all().map(i => i.json), ev = $input.all().map(i => i.json), out = [];
for (const s of subs) { if (s.Status !== 'active') continue;
  const since = s['Last click'] ? new Date(s['Last click']).getTime() : 0;
  const mine = ev.filter(e => e['Subscriber ID'] === s.ID && new Date(e.Time).getTime() > since);
  const sent = mine.filter(e => e.Type === 'sent' && !['confirmation', 'reengage'].includes(e.Campaign)).length;
  const check = mine.find(e => e.Type === 'sent' && e.Campaign === 'reengage');
  if (check && Date.now() - new Date(check.Time).getTime() > 7 * 864e5) out.push({ json: { ID: s.ID, Status: 'sunset' } });
  else if (!check && sent >= 5) out.push({ json: { ID: s.ID, _to: s.Email, _subject: 'Should The Launch Course Emails Keep Coming?', _html: brand({ owner: cfg.ownerName, label: 'Quick Check', title: 'Should The Launch Course Emails Keep Coming?',
    hook: 'An inbox full of emails you no longer read helps nobody, including the sender.', paras: ['You have not opened a link from the last few emails, which is completely fine. If the launch course is still useful, tap the button and you will stay on the list. If not, do nothing and the emails will stop.'],
    buttons: [{ text: 'Keep Me On The List', url: link({ a: 'keep', id: s.ID }) }], footer: '<a href="' + link({ a: 'unsub', id: s.ID }) + '">Unsubscribe in one click</a>' }) } }); }
return out;"""), after=re_)
w.node("Send Or Sunset", *code("return $input.all();"), after=b)
w.node("Send Check-In", *gmail("={{ $json._to }}", "={{ $json._subject }}", "={{ $json._html }}"), after="Send Or Sunset", creds="gmailOAuth2")
w.save("reengagement-sunset")

w = WF("Unsubscribe And Suppression", 12)
w.note("## Unsubscribe And Suppression\nOne-click unsubscribe from every email. The subscriber's status changes to unsubscribed, and every sending workflow skips anyone who is unsubscribed or sunset.")
t = w.node("Unsubscribe Webhook", *webhook("cma-unsub"))
c = w.node("Config", *code(CONFIG), after=t)
v = w.node("Verify Signature", *code("const cfg = $('Config').first().json;\n" + SIGN + """
const q = $('Unsubscribe Webhook').first().json.query; const { s, format, ...rest } = q;
const ok = s && s === sign(Object.entries(rest).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'), cfg.linkSecret);
return ok ? [{ json: { ID: rest.id, Status: 'unsubscribed', 'Next send': '' } }] : [];"""), after=c)
u = w.node("Mark Unsubscribed", *sheet_write("Subscribers", "update", "ID"), after=v, creds="googleSheetsOAuth2Api")
w.node("Respond", *respond_json(), after=w.node("Reply Data", *code("return [{ json: { title: 'You Are Unsubscribed', text: 'No more emails will be sent to this address.' } }];"), after=u))
w.save("unsubscribe-suppression")

w = WF("New Content Broadcast", 13)
w.note("## New Content Broadcast\nWhen a new repository appears in your GitHub feed, Gemini drafts a 50 to 60 word email for subscribers interested in that topic. The draft waits in the Queue tab and only sends after you tick Approved.")
c = start(w, schedule("days", triggerAtHour=7) + ("Every Morning",))
k = w.node("Detect New Repository", *code("""const cfg = $('Config').first().json, store = $getWorkflowStaticData('global');
const feed = String(await this.helpers.httpRequest({ url: 'https://github.com/' + cfg.githubOwner + '.atom' }));
const names = [...new Set([...feed.matchAll(/created a repository [^/<\\s]+\\/([A-Za-z0-9._-]+)/g)].map(m => m[1]))];
const known = store.known; store.known = [...new Set([...(known || []), ...names])];
if (!known) return [];
return names.filter(n => !known.includes(n)).map(n => ({ json: { url: cfg.siteUrl + n + '/', name: n } }));"""), after=c)
g = w.node("Draft Broadcast", *gemini("'" + WRITING_RULES + " Write a 50 to 60 word email telling launch-course subscribers about this new piece, opening with one pain-point hook sentence. Return JSON {subject (Title Case), body}. Piece: ' + $json.url"), after=k, creds=GEMINI_CRED)
q = w.node("Queue Row", *code("""return $input.all().map((i, n) => { const o = JSON.parse(i.json.candidates[0].content.parts[0].text), src = $('Detect New Repository').all()[n].json;
  return { json: { ID: 'q' + Date.now() + n, Created: new Date().toISOString(), Workflow: 'New content broadcast', Kind: 'broadcast', Target: JSON.stringify({ url: src.url, topic: 'none' }), Subject: o.subject, Draft: o.body, Status: 'awaiting approval', Approved: false } }; });"""), after=g)
w.node("Add To Queue", *sheet_write("Queue"), after=q, creds="googleSheetsOAuth2Api")
w.save("new-content-broadcast")

w = WF("Pre-Send QA", 14)
w.note("## Pre-Send QA\nA sub-workflow every sending workflow can call before Gmail. It blocks emails with unfilled merge fields, missing unsubscribe links, spam-trigger wording, non-https links or broken links, and returns the problems found.")
t = w.node("Called By Another Workflow", "n8n-nodes-base.executeWorkflowTrigger", {"inputSource": "passthrough"}, 1.1)
w.node("Check Email", *code("""const SPAM = ['act now', 'free money', 'guaranteed', '100% free', 'risk-free', 'click here', 'winner', 'urgent', 'limited time', 'cash bonus', 'no obligation', 'buy now'];
const out = [];
for (const i of $input.all()) { const m = i.json, html = m._html || '', subject = m._subject || '', p = [];
  if (subject.length < 4) p.push('Subject missing'); if (subject.length > 78) p.push('Subject longer than 78 characters');
  if (/\\{\\{[^}]*\\}\\}|undefined|NaN/.test(subject + html)) p.push('Unfilled merge field');
  if (m._marketing && !html.includes('a=unsub')) p.push('Unsubscribe link missing');
  const low = (subject + html).toLowerCase(); SPAM.forEach(w => { if (low.includes(w)) p.push('Spam-trigger wording: ' + w); });
  for (const h of html.matchAll(/href="([^"]+)"/g)) { const u = h[1]; if (!/^https:\\/\\//.test(u) && !/^mailto:/.test(u)) p.push('Link is not https: ' + u);
    else if (m._checkLinks) { try { await this.helpers.httpRequest({ url: u }); } catch (e) { p.push('Broken link: ' + u); } } }
  out.push({ json: { ...m, _qaProblems: p, _qaPassed: p.length === 0 } }); }
return out;"""), after=t)
w.save("pre-send-qa")

w = WF("Enquiry Capture And Follow-Up", 15)
w.note("## Enquiry Capture And Follow-Up\nA public enquiry form. Gemini tags each enquiry by type and writes a one-line summary, the sender gets an instant reply with matching work samples, and you get an alert. A daily check reminds you of enquiries still unanswered after three days.")
t = w.node("Enquiry Form", *form("Work With Archana", "Tell me what you need. You will get a reply with relevant work samples straight away, and a personal reply after that.",
    [{"fieldLabel": "Name", "requiredField": True}, {"fieldLabel": "Email", "fieldType": "email", "requiredField": True}, {"fieldLabel": "Company"}, {"fieldLabel": "What Do You Need?", "fieldType": "textarea", "requiredField": True}]))
c = w.node("Config", *code(CONFIG), after=t)
g = w.node("Tag With Gemini", *gemini("'Classify this enquiry sent to a senior technical writer and B2B content marketer. Return JSON {type: one of Full-time role, Documentation project, Content marketing project, Other; summary: one sentence under 25 words using only facts from the message}. Company: ' + $('Enquiry Form').first().json.Company + '. Message: ' + $('Enquiry Form').first().json['What Do You Need?']"), after=c, creds=GEMINI_CRED)
p = w.node("Prepare Row And Reply", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const f = $('Enquiry Form').first().json; let tag = { type: 'Other', summary: '' };
try { tag = JSON.parse($json.candidates[0].content.parts[0].text); } catch (e) {}
const LINKS = { 'Full-time role': [['View The Portfolio', 'https://archanacontent.github.io/'], ['Read The NVD Developer Guide', 'https://github.com/archanacontent/nvd-cve-api-docs'], ['Open The Launch Playbook', 'https://archanacontent.github.io/b2b-saas/']],
  'Documentation project': [['Read The NVD Developer Guide', 'https://github.com/archanacontent/nvd-cve-api-docs'], ['Read The openFDA Guide', 'https://archanacontent.github.io/openfda-drug-safety-guide/'], ['Read The Medicaid Guide', 'https://archanacontent.github.io/medicaid-2027-implementation-guide/']],
  'Content marketing project': [['Open The Launch Playbook', 'https://archanacontent.github.io/b2b-saas/'], ['See The RFP Response', 'https://archanacontent.github.io/rfp-response/'], ['View The Portfolio', 'https://archanacontent.github.io/']],
  Other: [['View The Portfolio', 'https://archanacontent.github.io/']] };
const links = LINKS[tag.type] || LINKS.Other;
return [{ json: { ID: 'e' + Date.now(), Received: new Date().toISOString(), Name: f.Name, Email: f.Email, Company: f.Company || '', Message: f['What Do You Need?'], Type: tag.type, Summary: tag.summary, 'Auto reply sent': new Date().toISOString(), Replied: false,
  _reply: brand({ owner: cfg.ownerName, label: 'Message Received', title: 'Thanks For Your Message', hook: 'A message sent through a portfolio site often disappears without a reply, so here is confirmation that yours has arrived.',
    paras: ['I read every enquiry myself and will reply personally within two working days. Until then, the three samples below are the closest match to the work you described in your message.'], buttons: links.map(l => ({ text: l[0], url: l[1] })) }) } }];"""), after=g)
s = w.node("Store Enquiry", *sheet_write("Enquiries"), after=p, creds="googleSheetsOAuth2Api")
r = w.node("Auto-Reply", *gmail("={{ $('Prepare Row And Reply').first().json.Email }}", "Thanks For Your Message", "={{ $('Prepare Row And Reply').first().json._reply }}"), after=s, creds="gmailOAuth2")
w.node("Alert Owner", *gmail("={{ $('Config').first().json.ownerEmail }}", "=[Automation] New Enquiry: {{ $('Prepare Row And Reply').first().json.Type }}", "={{ $('Prepare Row And Reply').first().json.Name }}: {{ $('Prepare Row And Reply').first().json.Summary }}"), after=r, creds="gmailOAuth2")
d = w.node("Daily Reminder Check", *schedule("days", triggerAtHour=9), y=560, x=0)
c2 = w.node("Config (Reminders)", *code(CONFIG), after=d, y=560, x=240)
e2 = w.node("Read Enquiries", *sheet_read("Enquiries"), after=c2, creds="googleSheetsOAuth2Api", y=560, x=480)
o2 = w.node("Find Overdue", *code("""return $input.all().map(i => i.json).filter(q => String(q.Replied).toUpperCase() !== 'TRUE' && !q['Reminder sent'] && Date.now() - new Date(q.Received).getTime() > 3 * 864e5)
  .map(q => ({ json: { ID: q.ID, 'Reminder sent': new Date().toISOString(), _text: q.Name + ' (' + q.Email + ') is still waiting for a reply. ' + (q.Summary || '') } }));"""), after=e2, y=560, x=720)
m2 = w.node("Remind Owner", *gmail("={{ $('Config (Reminders)').first().json.ownerEmail }}", "[Automation] Enquiry Waiting 3 Days", "={{ $json._text }}"), after=o2, creds="gmailOAuth2", y=560, x=960)
w.node("Mark Reminded", *sheet_write("Enquiries", "update", "ID"), after=m2, creds="googleSheetsOAuth2Api", y=560, x=1200)
w.save("enquiry-capture-follow-up")

# ---------------- Reporting ----------------
GA = "https://analyticsdata.googleapis.com/v1beta/properties/{{ $('Config').first().json.ga4PropertyId }}:runReport"
def ga_body(start, end, dims, mets):
    return "={{ JSON.stringify({ dateRanges: [{ startDate: '" + start + "', endDate: '" + end + "' }], dimensions: " + json.dumps([{"name": d} for d in dims]) + ", metrics: " + json.dumps([{"name": m} for m in mets]) + ", limit: 250 }) }}"

w = WF("Weekly Performance Report", 16)
w.note("## Weekly Performance Report\nEvery Monday: Google Analytics views per piece of work against the previous week, top traffic sources, Search Console clicks and impressions, sign-ups and enquiries. Gemini adds notes that keep measured facts apart from hypotheses.")
c = start(w, schedule("weeks", triggerAtDay=[1], triggerAtHour=8) + ("Every Monday At 8",))
a1 = w.node("GA4 This Week", *http("=" + GA, "POST", "googleAnalyticsOAuth2", ga_body("7daysAgo", "yesterday", ["pagePath"], ["screenPageViews"])), after=c, creds="googleAnalyticsOAuth2")
a2 = w.node("GA4 Last Week", *http("=" + GA, "POST", "googleAnalyticsOAuth2", ga_body("14daysAgo", "8daysAgo", ["pagePath"], ["screenPageViews"])), after=a1, creds="googleAnalyticsOAuth2")
a3 = w.node("GA4 Sources", *http("=" + GA, "POST", "googleAnalyticsOAuth2", ga_body("7daysAgo", "yesterday", ["sessionSource"], ["sessions"])), after=a2, creds="googleAnalyticsOAuth2")
gs = w.node("Search Console", *http("=https://searchconsole.googleapis.com/webmasters/v3/sites/{{ encodeURIComponent($('Config').first().json.siteUrl) }}/searchAnalytics/query", "POST", "googleOAuth2Api",
    "={{ JSON.stringify({ startDate: $now.minus({ days: 9 }).toFormat('yyyy-MM-dd'), endDate: $now.minus({ days: 3 }).toFormat('yyyy-MM-dd'), dimensions: ['page'], rowLimit: 25 }) }}"), after=a3, creds="googleOAuth2Api")
su = w.node("Read Subscribers", *sheet_read("Subscribers"), after=gs, creds="googleSheetsOAuth2Api")
en = w.node("Read Enquiries", "n8n-nodes-base.googleSheets", sheet_read("Enquiries")[1], 4.5, after=su, creds="googleSheetsOAuth2Api")
f = w.node("Assemble Facts", *code("""const piece = p => (String(p).split('/').filter(Boolean)[0] || 'Portfolio');
const sum = r => (r.rows || []).reduce((o, x) => { const k = piece(x.dimensionValues[0].value); o[k] = (o[k] || 0) + Number(x.metricValues[0].value); return o; }, {});
const a = sum($('GA4 This Week').first().json), b = sum($('GA4 Last Week').first().json);
const src = ($('GA4 Sources').first().json.rows || []).slice(0, 8).map(x => [x.dimensionValues[0].value, x.metricValues[0].value]);
const gsc = ($('Search Console').first().json.rows || []).slice(0, 10).map(r => [r.keys[0].replace(/^https:\\/\\/[^/]+/, ''), r.clicks, r.impressions]);
const wk = Date.now() - 7 * 864e5;
const signups = $('Read Subscribers').all().filter(i => new Date(i.json['Signed up']).getTime() > wk).length;
const enquiries = $input.all().filter(i => new Date(i.json.Received).getTime() > wk).length;
return [{ json: { a, b, src, gsc, signups, enquiries } }];"""), after=en)
g = w.node("Gemini Notes", *gemini("'" + WRITING_RULES + " Summarise this week for a content marketer. Return JSON {measured: up to 4 statements of what the numbers show, hypotheses: up to 3 possible reasons phrased as things to check}. Facts: ' + JSON.stringify($json)"), after=f, creds=GEMINI_CRED)
b = w.node("Build Report", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const f = $('Assemble Facts').first().json; let n = { measured: [], hypotheses: [] }; try { n = JSON.parse($json.candidates[0].content.parts[0].text); } catch (e) {}
const t = (h, rows) => '<table style="width:100%;border-collapse:collapse;margin:8px 0 18px">' + '<tr>' + h.map(x => '<th style="text-align:left;border-bottom:2px solid #17181B;padding:6px;font-size:13px">' + x + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + r.map(x => '<td style="border-bottom:1px solid #E2DDD3;padding:6px;font-size:13px">' + x + '</td>').join('') + '</tr>').join('') + '</table>';
const keys = [...new Set([...Object.keys(f.a), ...Object.keys(f.b)])];
const html = t(['Piece Of Work', 'Views', 'Previous Week'], keys.map(k => [k, f.a[k] || 0, f.b[k] || 0])) + t(['Traffic Source', 'Sessions'], f.src) + t(['Page (Search Console)', 'Clicks', 'Impressions'], f.gsc) +
  t(['Lead Activity', 'This Week'], [['Course Sign-Ups', f.signups], ['Enquiries', f.enquiries]]) +
  '<h3>What The Numbers Show</h3><ul>' + n.measured.map(x => '<li>' + x + '</li>').join('') + '</ul><h3>Possible Reasons To Check (AI Hypotheses, Not Verified)</h3><ul>' + n.hypotheses.map(x => '<li>' + x + '</li>').join('') + '</ul>';
return [{ json: { html: brand({ owner: cfg.ownerName, label: 'Workflow 16', title: 'Weekly Performance Report', html }) } }];"""), after=g)
w.node("Email The Report", *gmail("={{ $('Config').first().json.ownerEmail }}", "=[Report] Weekly Performance, Week Ending {{ $now.minus({ days: 1 }).toFormat('d LLL yyyy') }}", "={{ $json.html }}"), after=b, creds="gmailOAuth2")
w.save("weekly-performance-report")

w = WF("Email Performance Report", 17)
w.note("## Email Performance Report\nEvery Monday: sends, unique clicks and click rate per email, how far subscribers got in the course, and subscriber status. Open rates are left out because mail privacy features make them unreliable.")
c = start(w, schedule("weeks", triggerAtDay=[1], triggerAtHour=8) + ("Every Monday At 8",))
ev = w.node("Read Events", *sheet_read("Events"), after=c, creds="googleSheetsOAuth2Api")
su = w.node("Read Subscribers", "n8n-nodes-base.googleSheets", sheet_read("Subscribers")[1], 4.5, after=ev, creds="googleSheetsOAuth2Api")
b = w.node("Build Report", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const ev = $('Read Events').all().map(i => i.json), subs = $input.all().map(i => i.json), msgs = {};
for (const e of ev) { if (!['sent', 'click'].includes(e.Type)) continue; const m = e.Message || e.Campaign; msgs[m] = msgs[m] || { s: new Set(), c: new Set() }; (e.Type === 'sent' ? msgs[m].s : msgs[m].c).add(e['Subscriber ID']); }
const rows = Object.entries(msgs).filter(([, v]) => v.s.size).map(([k, v]) => [k, v.s.size, v.c.size, Math.round(v.c.size / v.s.size * 100) + '%']);
const funnel = [1, 2, 3, 4, 5, 6].map(n => [n === 6 ? 'Next-Best Email' : 'Lesson ' + n, subs.filter(s => Number(s['Course step']) >= n).length]);
const t = (h, r) => '<table style="width:100%;border-collapse:collapse;margin:8px 0 18px"><tr>' + h.map(x => '<th style="text-align:left;border-bottom:2px solid #17181B;padding:6px;font-size:13px">' + x + '</th>').join('') + '</tr>' + r.map(x => '<tr>' + x.map(y => '<td style="border-bottom:1px solid #E2DDD3;padding:6px;font-size:13px">' + y + '</td>').join('') + '</tr>').join('') + '</table>';
return [{ json: { html: brand({ owner: cfg.ownerName, label: 'Workflow 17', title: 'Email Performance Report', html: t(['Email', 'Sent', 'Clicked', 'Click Rate'], rows) + t(['Course Stage Reached', 'Subscribers'], funnel) }) } }];"""), after=su)
w.node("Email The Report", *gmail("={{ $('Config').first().json.ownerEmail }}", "[Report] Email Performance", "={{ $json.html }}"), after=b, creds="gmailOAuth2")
w.save("email-performance-report")

w = WF("Monthly Content Health Check", 18)
w.note("## Monthly Content Health Check\nOn the 1st of each month: sorts every piece of work into growing, declining, seen in search but rarely clicked, out of date or steady, with a next step for each. Small numbers do not trigger false alarms.")
c = start(w, schedule("months", triggerAtDayOfMonth=1, triggerAtHour=8) + ("1st Of The Month",))
a1 = w.node("GA4 Last 28 Days", *http("=" + GA, "POST", "googleAnalyticsOAuth2", ga_body("28daysAgo", "yesterday", ["pagePath"], ["screenPageViews"])), after=c, creds="googleAnalyticsOAuth2")
a2 = w.node("GA4 Previous 28 Days", *http("=" + GA, "POST", "googleAnalyticsOAuth2", ga_body("56daysAgo", "29daysAgo", ["pagePath"], ["screenPageViews"])), after=a1, creds="googleAnalyticsOAuth2")
gs = w.node("Search Console", *http("=https://searchconsole.googleapis.com/webmasters/v3/sites/{{ encodeURIComponent($('Config').first().json.siteUrl) }}/searchAnalytics/query", "POST", "googleOAuth2Api",
    "={{ JSON.stringify({ startDate: $now.minus({ days: 30 }).toFormat('yyyy-MM-dd'), endDate: $now.minus({ days: 3 }).toFormat('yyyy-MM-dd'), dimensions: ['page'], rowLimit: 250 }) }}"), after=a2, creds="googleOAuth2Api")
cl = w.node("Read Claims", *sheet_read("Claims"), after=gs, creds="googleSheetsOAuth2Api")
b = w.node("Classify Pieces", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const piece = p => (String(p).replace(/^https:\\/\\/[^/]+/, '').split('/').filter(Boolean)[0] || 'Portfolio');
const sum = r => (r.rows || []).reduce((o, x) => { const k = piece(x.dimensionValues[0].value); o[k] = (o[k] || 0) + Number(x.metricValues[0].value); return o; }, {});
const a = sum($('GA4 Last 28 Days').first().json), b = sum($('GA4 Previous 28 Days').first().json), search = {}, stale = {};
for (const r of ($('Search Console').first().json.rows || [])) { const k = piece(r.keys[0]); search[k] = search[k] || { c: 0, i: 0 }; search[k].c += r.clicks; search[k].i += r.impressions; }
for (const i of $input.all()) { const c = i.json; if (/needs/.test(c.Status)) stale[c.Guide] = (stale[c.Guide] || 0) + 1; }
const rows = [...new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(search), ...Object.keys(stale)])].map(p => { const now = a[p] || 0, was = b[p] || 0, s = search[p];
  let cat = 'Steady', act = 'No action this month';
  if (stale[p]) { cat = 'Out Of Date'; act = 'Recheck ' + stale[p] + ' claim(s)'; }
  else if (s && s.i >= 50 && s.c / s.i < 0.01) { cat = 'Seen In Search, Rarely Clicked'; act = 'Rewrite the title and meta description'; }
  else if (was >= 10 && now >= was * 1.2) { cat = 'Growing'; act = 'Share it again and link to it from related pieces'; }
  else if (was >= 10 && now <= was * 0.8) { cat = 'Declining'; act = 'Check sources and search intent, then refresh'; }
  return [p, now, was, cat, act]; });
const t = '<table style="width:100%;border-collapse:collapse"><tr>' + ['Piece', 'Views (28 Days)', 'Previous 28 Days', 'Status', 'Next Step'].map(x => '<th style="text-align:left;border-bottom:2px solid #17181B;padding:6px;font-size:13px">' + x + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + r.map(y => '<td style="border-bottom:1px solid #E2DDD3;padding:6px;font-size:13px">' + y + '</td>').join('') + '</tr>').join('') + '</table>';
return [{ json: { html: brand({ owner: cfg.ownerName, label: 'Workflow 18', title: 'Monthly Content Health Check', html: t }) } }];"""), after=cl)
w.node("Email The Check", *gmail("={{ $('Config').first().json.ownerEmail }}", "[Report] Monthly Content Health", "={{ $json.html }}"), after=b, creds="gmailOAuth2")
w.save("monthly-content-health")

w = WF("Course Post-Mortem", 19)
w.note("## Course Post-Mortem\nWhen every confirmed subscriber in a cohort has finished or left the course, Gemini writes what worked, what underperformed and what to test next time, using only the recorded numbers.")
c = start(w, schedule("weeks", triggerAtDay=[1], triggerAtHour=9) + ("Every Monday At 9",))
su = w.node("Read Subscribers", *sheet_read("Subscribers"), after=c, creds="googleSheetsOAuth2Api")
ev = w.node("Read Events", "n8n-nodes-base.googleSheets", sheet_read("Events")[1], 4.5, after=su, creds="googleSheetsOAuth2Api")
f = w.node("Cohort Facts", *code("""const subs = $('Read Subscribers').all().map(i => i.json).filter(s => s.Confirmed), store = $getWorkflowStaticData('global');
const done = subs.filter(s => Number(s['Course step']) >= 6 || ['unsubscribed', 'sunset'].includes(s.Status));
if (!subs.length || done.length < subs.length || store.count === done.length) return []; store.count = done.length;
const ev = $input.all().map(i => i.json), per = {};
for (const e of ev) { if (!/^lesson-|^next-best|^reengage/.test(e.Message || '')) continue; per[e.Message] = per[e.Message] || { sent: 0, clicked: 0 }; if (e.Type === 'sent') per[e.Message].sent++; if (e.Type === 'click') per[e.Message].clicked++; }
const topics = subs.reduce((o, s) => { const t = s.Interest || 'no clicks'; o[t] = (o[t] || 0) + 1; return o; }, {});
return [{ json: { cohort: subs.length, finished: done.length, per_email: per, topics } }];"""), after=ev)
g = w.node("Gemini Post-Mortem", *gemini("'" + WRITING_RULES + " Write a post-mortem of an email course cohort. Return JSON {worked, underperformed, change_next}, up to 3 items each, using only these facts. If the cohort is small, say results are directional. Facts: ' + JSON.stringify($json)"), after=f, creds=GEMINI_CRED)
b = w.node("Build Email", *code("const cfg = $('Config').first().json;\n" + TEMPLATE + """
const n = JSON.parse($json.candidates[0].content.parts[0].text), f = $('Cohort Facts').first().json, l = a => '<ul>' + (a || []).map(x => '<li>' + x + '</li>').join('') + '</ul>';
return [{ json: { html: brand({ owner: cfg.ownerName, label: 'Workflow 19', title: 'Course Post-Mortem', paras: ['Cohort of ' + f.cohort + ', ' + f.finished + ' finished or exited.'], html: '<h3>What Worked</h3>' + l(n.worked) + '<h3>What Underperformed</h3>' + l(n.underperformed) + '<h3>What To Change Next Time</h3>' + l(n.change_next) }) } }];"""), after=g)
w.node("Email The Post-Mortem", *gmail("={{ $('Config').first().json.ownerEmail }}", "[Report] Course Post-Mortem", "={{ $json.html }}"), after=b, creds="gmailOAuth2")
w.save("course-post-mortem")

print("written", len([f for f in os.listdir(OUT) if f.endswith(".json")]), "workflows")
