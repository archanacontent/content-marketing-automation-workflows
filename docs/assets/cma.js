/* Shared helpers for the public pages. */
function cmaShow(title, text, button) {
  document.querySelector('main').innerHTML = '<a class="brand" href="https://archanacontent.github.io/">ARCHANA PANDA</a><h1></h1><p></p>' + (button ? '<a class="btn"></a>' : '');
  document.querySelector('h1').textContent = title;
  document.querySelector('p').textContent = text;
  if (button) { var b = document.querySelector('.btn'); b.textContent = button.text; b.href = button.href; }
  document.title = title;
}
function cmaCall(query, opts) {
  var url = window.CMA_WEBAPP + '?' + query + (query ? '&' : '') + 'format=json';
  return fetch(url, Object.assign({ credentials: 'omit', redirect: 'follow' }, opts || {})).then(function (r) { return r.json(); });
}
function cmaPost(form) {
  var body = new URLSearchParams(new FormData(form));
  body.set('format', 'json');
  return fetch(window.CMA_WEBAPP, { method: 'POST', body: body, credentials: 'omit', redirect: 'follow' }).then(function (r) { return r.json(); });
}
