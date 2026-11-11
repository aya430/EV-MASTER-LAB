// Runtime configuration for deployed builds. dist/config.json is written by scripts/build_site.mjs from the
// EV_API_URL environment variable (GitHub Actions repository variable). The laboratory runs fully in the
// browser; apiBaseUrl is only for an optional, separately hosted Python reference API (backend/python).
let CFG = null;
export async function loadConfig() {
  if (CFG) return CFG;
  try { const r = await fetch('config.json', { cache: 'no-store' }); CFG = r.ok ? await r.json() : {}; } catch (e) { CFG = {}; }
  CFG.apiBaseUrl = (CFG.apiBaseUrl || '').replace(/\/+$/, '');
  return CFG;
}
export async function apiUrl(path) { const c = await loadConfig(); return c.apiBaseUrl ? c.apiBaseUrl + path : null; }
