/**
 * Content Marketing Automation Workflows - loader
 *
 * Paste this file into the Apps Script project bound to your control sheet
 * (Extensions > Apps Script). It is the only code you paste by hand.
 * Every run loads the workflow bundle from GitHub, so updates arrive
 * without copying code again.
 *
 * To pin a tested version, set the script property CMA_REF to a tag or
 * commit SHA. Without it, the loader uses the main branch.
 */

var CMA_REPO = 'archanacontent/content-marketing-automation-workflows';
var CMA_PATH = 'apps-script/dist/cma.js';

function cma_() {
  if (globalThis.CMA) return globalThis.CMA;
  var props = PropertiesService.getScriptProperties();
  var ref = props.getProperty('CMA_REF') || 'main';
  var cache = CacheService.getScriptCache();
  var head = cache.get('cma_' + ref + '_n');
  var code = null;
  if (head) {
    var keys = [];
    for (var i = 0; i < Number(head); i++) keys.push('cma_' + ref + '_' + i);
    var parts = cache.getAll(keys);
    if (Object.keys(parts).length === keys.length) code = keys.map(function (k) { return parts[k]; }).join('');
  }
  if (!code) {
    var url = 'https://raw.githubusercontent.com/' + CMA_REPO + '/' + ref + '/' + CMA_PATH;
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Could not load the workflow bundle (' + res.getResponseCode() + ') from ' + url);
    code = res.getContentText();
    var size = 90000, chunks = {}, n = Math.ceil(code.length / size);
    for (var j = 0; j < n; j++) chunks['cma_' + ref + '_' + j] = code.slice(j * size, (j + 1) * size);
    chunks['cma_' + ref + '_n'] = String(n);
    cache.putAll(chunks, 900);
  }
  (0, eval)(code);
  return globalThis.CMA;
}

/* Entry points. Triggers, menus and the web app call these by name. */
function onOpen(e) { cma_().onOpen(e); }
function doGet(e) { return cma_().doGet(e); }
function doPost(e) { return cma_().doPost(e); }
function cmaSetup() { cma_().setup(); }
function cmaSetGeminiKey() { cma_().setGeminiKey(); }
function cmaRefresh() { CacheService.getScriptCache().removeAll(['cma_main_n']); cma_().refreshed(); }
function cmaRunHourly() { cma_().runHourly(); }
function cmaRunDaily() { cma_().runDaily(); }
function cmaRunWeekly() { cma_().runWeekly(); }
function cmaRunNow() { cma_().runNow(); }
function cmaTestSubscribers() { cma_().addTestSubscribers(); }
