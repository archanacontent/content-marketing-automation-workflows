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
  'Write in plain, professional British-neutral English for B2B readers. The tone is premium, lucid and human, never salesy or casual.',
  'Lead with the reader\'s problem, then the practical fix. Frame it as a problem solved, never as something being sold.',
  'Write every heading, title and email subject in Title Case, capitalising every word, including short words such as and, for, of and to.',
  'No em dashes, no semicolons, no exclamation marks, no emojis, no hashtags.',
  'Do not start sentences with This, These, That, What, Why, How or When.',
  'Do not use the pattern "not X but Y", lists of three parallel items, or a clause ending in a participle such as "..., making it easy".',
  'Never use these words: unlock, leverage, seamless, game-changer, cutting-edge, robust, elevate, delve, harness, streamline, comprehensive, empower, solution, solves, revolutionise, transform, journey, landscape, crucial, essential.',
  'Vary sentence length a lot. Average about 20 words, never more than 35, and avoid three sentences in a row of similar length.',
  'Write numbers as numerals, never as words.',
  'Never invent numbers, quotes or results. Use only facts given in the input.'
].join('\n');

/* Checks a draft against the house rules. Returns a list of problems; empty means clean. */
var BANNED = ['unlock', 'leverage', 'seamless', 'game-changer', 'cutting-edge', 'robust', 'elevate', 'delve', 'harness', 'streamline', 'comprehensive', 'empower', 'solution', 'solutions', 'solves', 'solve', 'revolutionise', 'transform', 'journey', 'landscape', 'crucial', 'essential'];
var NUMBER_WORDS = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand'];
function lint_(text, opts) {
  opts = opts || {};
  var t = String(text || ''), low = t.toLowerCase(), problems = [];
  BANNED.forEach(function (w) { if (new RegExp('\\b' + w + '\\b').test(low)) problems.push('uses the banned word "' + w + '"'); });
  NUMBER_WORDS.forEach(function (w) { if (new RegExp('\\b' + w + '(-|\\b)').test(low)) problems.push('writes a number as a word ("' + w + '")'); });
  if (/[\u2014;!]/.test(t)) problems.push('uses an em dash, semicolon or exclamation mark');
  if (/(^|[.?]\s+)(This|These|That|What|Why|How|When)\b/.test(t)) problems.push('starts a sentence with This, These, That, What, Why, How or When');
  if (opts.author && (t.indexOf(opts.author) >= 0 || /\b(she|her|the author)\b/i.test(t))) problems.push('refers to the author in the third person');
  return problems;
}

/* Asks Gemini for JSON, then checks each text field. If any rule is broken, it asks again with the
   exact problems listed, up to twice. Anything still broken is returned for a person to fix. */
function geminiChecked_(prompt, fields, opts) {
  var out = null, problems = [];
  for (var attempt = 0; attempt < 3; attempt++) {
    out = gemini_(prompt + (problems.length ? '\n\nYour last draft broke these rules, so rewrite it to fix every one: ' + problems.join('; ') + '.' : ''), { json: true, temperature: 0.5 });
    problems = [];
    fields.forEach(function (f) { out[f] = numerals_(out[f]); });
    fields.forEach(function (f) { lint_(out[f], opts).forEach(function (p) { problems.push(f + ' ' + p); }); });
    if (!problems.length) break;
  }
  out._problems = problems;
  return out;
}

/* Replaces number words with numerals, as the house style requires. */
function numerals_(t) {
  var map = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  return String(t || '').replace(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi, function (w) { return String(map[w.toLowerCase()]); });
}

/* Title Case every word, as the house style requires, whatever the model returned. */
function titleCase_(t) {
  return String(t || '').replace(/\S+/g, function (w) {
    if (/^(https?:|[A-Z0-9]{2,}$|[a-z]+[A-Z])/.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}
