// Browser-local persistence (single-user local deployment).
const KEY = 'evmasterlab.v1';
let mem = { done: {}, bookmarks: {}, recent: [], quiz: {}, obs: {}, theme: 'dark' };
function load() {
  try { const s = localStorage.getItem(KEY); if (s) mem = Object.assign(mem, JSON.parse(s)); } catch (e) { /* storage unavailable: keep in memory */ }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ignore */ } }
load();
const listeners = new Set();
export const store = {
  get: () => mem,
  isDone: id => !!mem.done[id],
  setDone(id, v = true) { if (v) mem.done[id] = Date.now(); else delete mem.done[id]; save(); listeners.forEach(f => f()); },
  isBookmarked: id => !!mem.bookmarks[id],
  toggleBookmark(id) { if (mem.bookmarks[id]) delete mem.bookmarks[id]; else mem.bookmarks[id] = Date.now(); save(); listeners.forEach(f => f()); return !!mem.bookmarks[id]; },
  visit(id) { mem.recent = [id, ...mem.recent.filter(x => x !== id)].slice(0, 8); save(); },
  quizScore(key, rec) { (mem.quiz[key] = mem.quiz[key] || []).push(rec); mem.quiz[key] = mem.quiz[key].slice(-20); save(); listeners.forEach(f => f()); },
  setTheme(t) { mem.theme = t; save(); },
  saveObs(id, rows) { mem.obs[id] = rows; save(); },
  getObs: id => mem.obs[id] || [],
  reset() { mem = { done: {}, bookmarks: {}, recent: [], quiz: {}, obs: {}, theme: mem.theme }; save(); listeners.forEach(f => f()); },
  on(f) { listeners.add(f); return () => listeners.delete(f); },
};
