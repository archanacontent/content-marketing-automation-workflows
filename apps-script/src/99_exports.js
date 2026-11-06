/* Public entry points used by Loader.gs. */
globalThis.CMA = {
  onOpen: onOpen, doGet: doGet, doPost: doPost, setup: setup, setGeminiKey: setGeminiKey, refreshed: refreshed,
  runHourly: runHourly, runDaily: runDaily, runWeekly: runWeekly, runNow: runNow, addTestSubscribers: addTestSubscribers
};
globalThis.CMA_LINT = lint_;
