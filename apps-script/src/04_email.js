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
  return out.join(', ') || 'No subscribers due';
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
