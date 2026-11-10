"""Build docs/index.html, the documentation page on GitHub Pages.

Workflow diagrams are drawn from the n8n files, so the page always matches them.
"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "https://github.com/archanacontent/content-marketing-automation-workflows"
N8N_DIR = os.path.join(ROOT, "n8n")
esc = html.escape

# Copy for each workflow comes from the approved README tables.
readme = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
ROWS = re.findall(r"^\| (\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$", readme, re.M)
GROUP = {**{n: "content" for n in range(1, 6)}, **{n: "email" for n in range(6, 16)}, **{n: "reporting" for n in range(16, 20)}}
GROUP_NAME = {"content": "Content Operations", "email": "Email Journey", "reporting": "Reporting"}
SRC = {"content": "apps-script/src/05_content.js", "email": "apps-script/src/04_email.js", "reporting": "apps-script/src/06_reports.js"}

KIND = [  # (match in node type, label, colour): neutral with one accent for triggers
    ("Trigger", "Trigger", "#266DF0"), ("webhook", "Trigger", "#266DF0"), ("formTrigger", "Trigger", "#266DF0"),
    ("googleSheets", "Sheet", "#5E6270"), ("gmail", "Gmail", "#5E6270"), ("httpRequest", "API", "#5E6270"),
    ("respondToWebhook", "Reply", "#5E6270"), ("code", "Logic", "#9095A1"),
]

def kind(n):
    t = n["type"]
    if n["name"].startswith(("Ask Gemini", "Draft", "Tag With Gemini", "Gemini")):
        return "Gemini", "#266DF0"
    for k, label, col in KIND:
        if k.lower() in t.lower():
            return label, col
    return "Step", "#9095A1"

def diagram(wf):
    nodes = [n for n in wf["nodes"] if n["type"] != "n8n-nodes-base.stickyNote"]
    rows = sorted({n["position"][1] for n in nodes})
    pos = {}
    for r, y in enumerate(rows):
        line = sorted([n for n in nodes if n["position"][1] == y], key=lambda n: n["position"][0])
        for i, n in enumerate(line):
            pos[n["name"]] = (i, r, n)
    cols = max(p[0] for p in pos.values()) + 1
    W, H, GX, GY = 132, 54, 40, 34
    width, height = cols * (W + GX) - GX + 8, len(rows) * (H + GY) - GY + 8
    parts = []
    for src, c in wf["connections"].items():
        for t in c["main"][0]:
            a, b = pos[src], pos[t["node"]]
            x1, y1 = 4 + a[0] * (W + GX) + W, 4 + a[1] * (H + GY) + H / 2
            x2, y2 = 4 + b[0] * (W + GX), 4 + b[1] * (H + GY) + H / 2
            parts.append(f'<path class="wire" d="M{x1},{y1} C{x1 + 20},{y1} {x2 - 20},{y2} {x2},{y2}"/>')
    for name, (i, r, n) in pos.items():
        label, col = kind(n)
        x, y = 4 + i * (W + GX), 4 + r * (H + GY)
        words, lines, cur = name.split(), [], ""
        for w_ in words:
            if len(cur + " " + w_) > 17 and cur:
                lines.append(cur); cur = w_
            else:
                cur = (cur + " " + w_).strip()
        lines.append(cur)
        text = "".join(f'<tspan x="{x + 12}" dy="{0 if j == 0 else 13}">{esc(l)}</tspan>' for j, l in enumerate(lines[:2]))
        parts.append(f'<g><rect x="{x}" y="{y}" width="{W}" height="{H}" rx="10" class="node"/><rect x="{x}" y="{y}" width="4" height="{H}" rx="2" fill="{col}"/>'
                     f'<text x="{x + 12}" y="{y + 15}" class="kind" fill="{col}">{label.upper()}</text>'
                     f'<text x="{x + 12}" y="{y + 31}" class="lbl">{text}</text></g>')
    return f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="Diagram of the {esc(wf["name"])} workflow">{"".join(parts)}</svg>'


ICON = {
 "doc": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
 "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 "chat": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 "chart": '<path d="M3 21h18M7 21V11M12 21V6M17 21v-7"/>',
 "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 "bolt": '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
 "check": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 "flask": '<path d="M9 3h6M10 3v6L5 19a1 1 0 0 0 1 2h12a1 1 0 0 0 1-2l-5-10V3"/>',
 "link": '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
 "shield": '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
 "scan": '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
 "gauge": '<path d="M12 14l4-4"/><path d="M3.5 18a9 9 0 1 1 17 0"/>',
 "scale": '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
 "lock": '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
 "pen": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 "grid": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
}
def icon(k, size=22):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[k]}</svg>'

# ---------- Page built only from approved copy: the README plus the two approved example intros ----------
def md_inline(t):
    t = esc(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
    t = re.sub(r"\[(.+?)\]\((.+?)\)", lambda m: f'<a href="{REPO}/blob/main/{m.group(2)}">{m.group(1)}</a>' if not m.group(2).startswith("http") else f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
    return t

def section(name):
    m = re.search(r"^## " + re.escape(name) + r"\n(.*?)(?=^## |\Z)", readme, re.M | re.S)
    return m.group(1).strip()

def paras(block):
    return "".join(f"<p>{md_inline(p.strip())}</p>" for p in block.split("\n\n") if p.strip() and not p.startswith(("-", "|", "#", "1.")))

def bullets(block):
    keys = ["pen", "flask", "link", "shield", "scan", "gauge", "scale", "lock"]
    out = []
    for i, m in enumerate(re.finditer(r"^- \*\*(.+?)\*\* - (.+)$", block, re.M)):
        out.append(f'<div class="guard"><span class="gic">{icon(keys[i % len(keys)])}</span><h3>{md_inline(m.group(1))}</h3><p>{md_inline(m.group(2))}</p></div>')
    return '<div class="guards">' + "".join(out) + "</div>"

def steps(block, sub):
    m = re.search(r"^### " + re.escape(sub) + r"\n(.*?)(?=^### |\Z)", block, re.M | re.S)
    items = re.findall(r"^\d+\. (.+)$", m.group(1), re.M)
    return '<ol>' + "".join(f"<li>{md_inline(x)}</li>" for x in items) + "</ol>"

files = sorted(f for f in os.listdir(N8N_DIR) if f.endswith(".json"))
by_no = {int(f[:2]): f for f in files}
inside = section("What's Inside")
tabs_html, panels_html = "", ""
for gi, gm in enumerate(re.finditer(r"^### (.+?)\n(.*?)(?=^### |\Z)", inside, re.M | re.S)):
    gname, body = gm.group(1), gm.group(2)
    rows = ""
    for num, name, problem, runs in re.findall(r"^\| (\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$", body, re.M):
        n = int(num); f = by_no[n]; wf = json.load(open(os.path.join(N8N_DIR, f))); g = GROUP[n]
        rows += f'''<div class="wf">
  <button class="wf-head" aria-expanded="false"><span class="wf-no">{n:02d}</span><span class="wf-name">{esc(name.strip()).replace("-", "\u2011")}</span><span class="wf-problem">{esc(problem.strip())}</span><span class="wf-runs">{esc(runs.strip())}</span><span class="wf-toggle" aria-hidden="true"></span></button>
  <div class="wf-body" hidden><div class="diagram">{diagram(wf)}</div><div class="wf-links"><a href="workflows/{f[3:-5]}/">Open The Full Guide</a><a href="{REPO}/blob/main/n8n/{f}">n8n File</a><a href="{REPO}/blob/main/{SRC[g]}">Apps Script Source</a></div></div>
</div>'''
    count = len(re.findall(r"^\| \d+ \|", body, re.M))
    sel = "true" if gi == 0 else "false"
    tabs_html += f'<button role="tab" id="t{gi}" aria-controls="p{gi}" aria-selected="{sel}"><span class="tn">{gi + 1:02d}</span>{esc(gname)}<span class="tc">{count}</span></button>'
    panels_html += f'<div role="tabpanel" id="p{gi}" aria-labelledby="t{gi}"{"" if gi == 0 else " hidden"}><div class="wfs">{rows}</div></div>'

how = section("How It Runs")
how_intro = how.split("\n\n")[0]
how_items = "".join(f'<div class="run"><span class="ri">{icon(["grid", "bolt", "link"][i], 20)}</span><h3>{md_inline(m.group(1))}</h3><p>{md_inline(m.group(2))}</p></div>' for i, m in enumerate(re.finditer(r"^- \*\*(.+?)\*\* - (.+)$", how, re.M)))
setup = section("Set It Up")



course_src = open(os.path.join(ROOT, "apps-script", "src", "03_course.js"), encoding="utf-8").read()
lesson_subjects = re.findall(r"subject: '(Lesson \d: [^']+)'", course_src)
confirm_subject = re.search(r"CONFIRM = \{\s*subject: '([^']+)'", course_src).group(1)
reengage_subject = re.search(r"REENGAGE = \{\s*subject: '([^']+)'", course_src).group(1)
seq = [("Opt-in", confirm_subject)] + [(f"Lesson {i + 1}", s.split(": ", 1)[1]) for i, s in enumerate(lesson_subjects)] + [("Re-engagement", reengage_subject)]
seq_html = "".join(f'<li><span class="av">AP</span><span class="from">Archana Panda</span><span class="s">{esc(v)}</span><span class="k">{esc(k)}</span></li>' for k, v in seq)

SUBS = [("Test Research", "6", "research"), ("Test Positioning", "6", "positioning"), ("Test Launch", "6", "launch"), ("Test Sales", "6", "sales"), ("Test Silent", "6", "none")]
SHEET = ('<div class="sheet"><div class="sb"><i></i>Control sheet, Subscribers tab</div><table><tr><th></th><th>Name</th><th>Status</th><th>Course Step</th><th>Interest</th></tr>'
         + "".join(f'<tr><td>{i + 2}</td><td>{n}</td><td><span class="st">active</span></td><td>{c}</td><td>{t}</td></tr>' for i, (n, c, t) in enumerate(SUBS))
         + '</table></div>')
SCORES = [("+research", {"research": 4, "launch": 3, "sales": 3, "positioning": 2}), ("+positioning", {"research": 4, "launch": 2, "positioning": 5, "sales": 3}),
          ("+launch", {"research": 3, "launch": 6, "sales": 3, "positioning": 2}), ("+sales", {"launch": 3, "sales": 4, "research": 1, "positioning": 1}), ("+silent", {})]
TOPIC_COL = {"research": "#14172B", "positioning": "#2440D8", "launch": "#6E8EF5", "sales": "#BFD6FF"}
CHART = "".join(f'<div class="cr"><span class="cl">{who}</span><span class="cb">' + ("".join(f'<i style="flex:{v};background:{TOPIC_COL[t]}" title="{t} {v}"></i>' for t, v in sc.items()) or '<em>No clicks</em>') + '</span></div>' for who, sc in SCORES)
LEGEND = "".join(f'<span><i style="background:{c}"></i>{t.title()}</span>' for t, c in TOPIC_COL.items())
FIGS = [("5", "Confirmed sign-ups"), ("25", "Lessons sent"), ("5", "Next-best emails"), ("1", "Re-engagement email")]
ROWS = [("+research", "Research", "Put Your Research To Work"), ("+positioning", "Positioning", "Keep Your Positioning Intact At Launch"),
        ("+launch", "Launch", "Set The Targets Before Launch Day"), ("+sales", "Sales", "See The Sales Deck Filled In"), ("+silent", "No clicks", "Start With The Module Closest To Your Launch")]

page = open(os.path.join(ROOT, "build", "docs_template.html"), encoding="utf-8").read()
fill = {
    "%REPO%": REPO, "%PROBLEM%": paras(section("The Problem")), "%TABS%": tabs_html, "%PANELS%": panels_html,
    "%HOW_INTRO%": md_inline(how_intro), "%HOW_ITEMS%": how_items, "%SAFEGUARDS%": bullets(section("Built-In Safeguards")),
    "%SETUP_GAS%": steps(setup, "Google Apps Script"), "%SETUP_N8N%": steps(setup, "n8n"), "%SEQ%": seq_html, "%CHART%": CHART, "%LEGEND%": LEGEND, "%I_DOC%": icon("doc"), "%I_MAIL%": icon("mail"), "%I_CHAT%": icon("chat"), "%I_CHART%": icon("chart"), "%SHEET%": SHEET,
    "%FIGS%": "".join(f'<div class="fig"><b>{a}</b><span>{b}</span></div>' for a, b in FIGS),
    "%ROWS%": "".join(f"<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>" for a, b, c in ROWS),
}
for k, v in fill.items():
    page = page.replace(k, v)
open(os.path.join(ROOT, "docs", "index.html"), "w", encoding="utf-8").write(page)
left = re.findall(r"%[A-Z_]+%", page)
print("docs/index.html built", "| unfilled:", left)

# ---------- One page per workflow, built from its n8n file and the approved README row ----------
CRED_NAMES = {"googleSheetsOAuth2Api": "Google Sheets", "gmailOAuth2": "Gmail", "httpHeaderAuth": "Gemini API key",
              "googleAnalyticsOAuth2": "Google Analytics", "googleOAuth2Api": "Google Search Console"}
GAS = {1: ("1", "Daily at 7:00"), 2: ("2", "Weekly, plus 1 January"), 3: ("3", "Daily, after a new commit"), 4: ("4", "On request"), 5: ("5", "On request, or when a new repository appears"),
       6: (None, "On sign-up"), 7: (None, "On confirmation"), 8: ("8", "Every 10 minutes"), 9: (None, "On every click"), 10: (None, "Every 10 minutes"),
       11: ("11", "Every 10 minutes"), 12: (None, "On request"), 13: ("13", "On new content"), 14: (None, "Before every send"), 15: ("15", "On enquiry, reminders every 10 minutes"),
       16: ("16", "Monday at 8:00"), 17: ("17", "Monday at 8:00"), 18: ("18", "1st of the month"), 19: ("19", "Weekly, when a cohort finishes")}
OUTPUTS = {}  # filled from docs/assets/outputs/<no>-*.png when real outputs are added
outdir = os.path.join(ROOT, "docs", "assets", "outputs")
if os.path.isdir(outdir):
    for fn in sorted(os.listdir(outdir)):
        if fn[:2].isdigit():
            OUTPUTS.setdefault(int(fn[:2]), []).append(fn)

tpl = open(os.path.join(ROOT, "build", "docs_template.html"), encoding="utf-8").read()
STYLE = tpl[tpl.index("<style>"):tpl.index("</style>") + 8]
WF_CSS = """<style>
.crumb{font-size:14px;color:var(--mute);margin-bottom:18px}.crumb a{color:var(--mute)}
.meta-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.pill{border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:13.5px;color:var(--ink2)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:28px}
.box{border:1px solid var(--line);border-radius:18px;padding:24px;background:var(--soft)}
.box h3{margin-bottom:12px}
.steps-list{list-style:none;padding:0;margin:0;counter-reset:s}
.steps-list li{counter-increment:s;display:grid;grid-template-columns:30px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--line);font-size:14.5px}
.steps-list li:first-child{border-top:0}
.steps-list li::before{content:counter(s);width:26px;height:26px;border-radius:8px;background:var(--blue2);color:#fff;font-size:12.5px;font-weight:600;display:grid;place-items:center}
.steps-list .kd{font-size:12px;color:var(--faint)}
.tags{display:flex;flex-wrap:wrap;gap:8px}.tags span{border:1px solid var(--line);border-radius:8px;padding:5px 10px;font-size:13.5px}
.outs{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-top:20px}
.outs img{width:100%;border-radius:14px;border:1px solid var(--line);display:block}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:56px}
.pager a{flex:1;border:1px solid var(--line);border-radius:14px;padding:16px 18px;text-decoration:none;font-weight:600}
.pager a span{display:block;font-size:12.5px;color:var(--faint);font-weight:500}
.pager a.next{text-align:right}
@media (max-width:760px){.two{grid-template-columns:1fr}}
</style>"""

all_rows = []
for gm in re.finditer(r"^### (.+?)\n(.*?)(?=^### |\Z)", inside, re.M | re.S):
    for num, name, problem, runs in re.findall(r"^\| (\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$", gm.group(2), re.M):
        all_rows.append((int(num), name.strip(), problem.strip(), runs.strip(), gm.group(1)))

def slug_of(n):
    return by_no[n][3:-5]

for idx, (n, name, problem, runs, gname) in enumerate(all_rows):
    f = by_no[n]; wf = json.load(open(os.path.join(N8N_DIR, f)))
    nodes = [x for x in wf["nodes"] if x["type"] != "n8n-nodes-base.stickyNote"]
    order = []
    names = {x["name"]: x for x in nodes}
    targets = {t["node"] for c in wf["connections"].values() for t in c["main"][0]}
    starts = [x["name"] for x in nodes if x["name"] not in targets]
    seen = set()
    def walk(nm):
        if nm in seen: return
        seen.add(nm); order.append(names[nm])
        for t in wf["connections"].get(nm, {"main": [[]]})["main"][0]: walk(t["node"])
    for s0 in starts: walk(s0)
    steps = "".join(f'<li><span>{esc(x["name"])}</span><span class="kd">{kind(x)[0]}</span></li>' for x in order)
    tabs_used = sorted({x["parameters"]["sheetName"]["value"] for x in nodes if x["type"].endswith("googleSheets")})
    creds = sorted({CRED_NAMES.get(k, k) for x in nodes for k in x.get("credentials", {})})
    gas_no, gas_when = GAS[n]
    raw = f"https://raw.githubusercontent.com/archanacontent/content-marketing-automation-workflows/main/n8n/{f}"
    outs = OUTPUTS.get(n, [])
    out_html = ("<section style=\"padding-top:0\"><div class=\"wrap\"><h2>Real Output</h2><div class=\"outs\">" +
                "".join(f'<img src="../../assets/outputs/{o}" alt="Output from {esc(name)}, page {i + 1}" loading="lazy">' for i, o in enumerate(outs)) +
                "</div></div></section>") if outs else ""
    prev = all_rows[idx - 1] if idx else None
    nxt = all_rows[idx + 1] if idx + 1 < len(all_rows) else None
    pager = '<div class="pager">' + (f'<a href="../{slug_of(prev[0])}/"><span>Previous</span>{esc(prev[1])}</a>' if prev else "<span></span>") + \
            (f'<a class="next" href="../{slug_of(nxt[0])}/"><span>Next</span>{esc(nxt[1])}</a>' if nxt else "") + "</div>"
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(name)} | Content Marketing Automation Workflows</title>
<meta name="description" content="{esc(problem)}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-R5QPB9VQWB"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-R5QPB9VQWB');</script>
{STYLE}{WF_CSS}</head><body>
<header class="nav"><div class="wrap"><a class="brand" href="../../">Content Marketing Automation Workflows</a><a class="btn" href="{REPO}">View On GitHub</a></div></header>
<div class="hero"><div class="wrap">
<p class="crumb"><a href="../../#workflows">Workflows</a> / {esc(gname)}</p>
<h1 style="max-width:20ch;font-size:clamp(34px,5vw,56px)">{esc(name)}</h1>
<p class="sub">{esc(problem)}</p>
<div class="meta-row"><span class="pill">{esc(runs)}</span>{"".join(f'<span class="pill">{esc(c)}</span>' for c in creds)}</div>
</div></div>
<section style="padding-top:0"><div class="wrap">
<h2>How It Runs</h2>
<div class="diagram" style="margin-top:24px">{diagram(wf)}</div>
<div class="two">
<div class="box"><h3>Steps</h3><ol class="steps-list">{steps}</ol></div>
<div class="box"><h3>Control Sheet Tabs</h3><div class="tags">{"".join(f"<span>{esc(t)}</span>" for t in tabs_used) or "<span>None</span>"}</div>
<h3 style="margin-top:22px">Accounts To Connect</h3><div class="tags">{"".join(f"<span>{esc(c)}</span>" for c in creds) or "<span>None</span>"}</div></div>
</div></div></section>
<section style="padding-top:0"><div class="wrap">
<h2>Run It Yourself</h2>
<div class="two">
<div class="box"><h3>n8n</h3><ol class="steps-list">
<li><span>In n8n, open <b>Workflows</b>, then <b>Import from URL</b></span><span></span></li>
<li><span>Paste <code style="word-break:break-all">{raw}</code></span><span></span></li>
<li><span>Fill in the Config node and connect the accounts listed above</span><span></span></li>
<li><span>Activate the workflow</span><span></span></li></ol>
<div class="wf-links"><a href="{REPO}/blob/main/n8n/{f}">View The n8n File</a></div></div>
<div class="box"><h3>Google Apps Script</h3><ol class="steps-list">
<li><span>Set up the control sheet with the steps on the main page</span><span></span></li>
<li><span>Runs on its own: {esc(gas_when)}</span><span></span></li>
{f'<li><span>To run it now, open the Run tab and tick <b>Run now</b> next to No. <b>{gas_no}</b></span><span></span></li>' if gas_no else ''}
</ol><div class="wf-links"><a href="{REPO}/blob/main/{SRC[GROUP[n]]}">View The Apps Script Source</a></div></div>
</div></div></section>
{out_html}
<section style="padding-top:0"><div class="wrap">{pager}</div></section>
<footer><div class="wrap">MIT licence. Created by <a href="https://archanacontent.github.io/">Archana Panda</a>.</div></footer>
</body></html>"""
    d = os.path.join(ROOT, "docs", "workflows", slug_of(n)); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)
print("built", len(all_rows), "workflow pages")
