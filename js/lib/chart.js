// Lightweight canvas plotting engine for EV MASTER LAB (no external dependency).
// Supports line / step / scatter / bar series, linear & log axes, live updates,
// hover read-out, PNG and CSV export.
export const PALETTE = ['#22d3ee', '#f59e0b', '#22c55e', '#a78bfa', '#ef4444', '#3b82f6', '#f472b6', '#facc15', '#14b8a6', '#fb923c'];

function css(name, fb) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fb;
}
function niceStep(range, n) {
  const raw = range / Math.max(1, n);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
export function fmt(v, d) {
  if (v === undefined || v === null || Number.isNaN(v)) return '–';
  if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
  const a = Math.abs(v);
  if (d !== undefined) return v.toFixed(d);
  if (a === 0) return '0';
  if (Number.isInteger(v) && a < 1e7) return String(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(2);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

export class Chart {
  /**
   * @param {HTMLElement} host element that receives the canvas
   * @param {object} spec {title, xl, yl, series:[{name,x,y,color,type,dash,width}], logx, logy, xr:[min,max], yr:[min,max], legend, height}
   */
  constructor(host, spec = {}) {
    this.host = host;
    this.spec = Object.assign({ series: [] }, spec);
    this.canvas = document.createElement('canvas');
    if (spec.height) this.canvas.style.height = spec.height + 'px';
    host.appendChild(this.canvas);
    this.tip = document.createElement('div');
    this.tip.className = 'tip';
    host.appendChild(this.tip);
    this.mouse = null;
    this._pending = false;
    this.canvas.addEventListener('mousemove', e => { const r = this.canvas.getBoundingClientRect(); this.mouse = [e.clientX - r.left, e.clientY - r.top]; this.draw(); });
    this.canvas.addEventListener('mouseleave', () => { this.mouse = null; this.tip.style.display = 'none'; this.draw(); });
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.canvas);
    this.draw();
  }
  set(spec) { Object.assign(this.spec, spec); this.request(); }
  setSeries(series) { this.spec.series = series; this.request(); }
  request() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => { this._pending = false; this.draw(); });
  }
  destroy() { this.ro.disconnect(); }
  ranges() {
    const s = this.spec;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const se of s.series) {
      if (se.hidden) continue;
      const n = se.y ? se.y.length : 0;
      for (let i = 0; i < n; i++) {
        const x = se.x ? se.x[i] : i, y = se.y[i];
        if (!isFinite(x) || !isFinite(y)) continue;
        if (s.logx && x <= 0) continue;
        if (s.logy && y <= 0) continue;
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
    }
    if (!isFinite(xmin)) { xmin = 0; xmax = 1; }
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    if (s.xr) { if (s.xr[0] !== null && s.xr[0] !== undefined) xmin = s.xr[0]; if (s.xr[1] !== null && s.xr[1] !== undefined) xmax = s.xr[1]; }
    if (s.yr) { if (s.yr[0] !== null && s.yr[0] !== undefined) ymin = s.yr[0]; if (s.yr[1] !== null && s.yr[1] !== undefined) ymax = s.yr[1]; }
    else if (!s.logy) {
      const pad = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.1 || 1;
      ymin -= (s.series.some(se => se.type === 'bar') && ymin >= 0) ? 0 : pad; ymax += pad;
      if (s.zeroY !== false && ymin > 0 && ymin < (ymax - ymin) * 0.6 && !s.noZero) ymin = 0;
    }
    if (xmax === xmin) { xmax += 1; xmin -= s.logx ? 0 : 1; }
    if (ymax === ymin) { ymax += 1; ymin -= 1; }
    return { xmin, xmax, ymin, ymax };
  }
  draw() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const s = this.spec;
    const txt = css('--muted', '#93a3c0'), grid = css('--line', '#24324f'), fg = css('--text', '#e6ecf7');
    const L = 54, R = 12, T = s.legend === false ? 10 : 24, B = 34;
    const pw = W - L - R, ph = H - T - B;
    const { xmin, xmax, ymin, ymax } = this.ranges();
    const lx = v => Math.log10(v);
    const X = s.logx ? v => L + (lx(v) - lx(xmin)) / (lx(xmax) - lx(xmin)) * pw : v => L + (v - xmin) / (xmax - xmin) * pw;
    const Y = s.logy ? v => T + ph - (lx(v) - lx(ymin)) / (lx(ymax) - lx(ymin)) * ph : v => T + ph - (v - ymin) / (ymax - ymin) * ph;
    this._map = { X, Y, xmin, xmax, ymin, ymax, L, T, pw, ph };
    g.font = '11px Inter, system-ui, sans-serif';
    g.lineWidth = 1;
    // grid + ticks
    g.strokeStyle = grid; g.fillStyle = txt;
    const ticks = (min, max, log, n) => {
      const out = [];
      if (log) { for (let e = Math.floor(lx(min)); e <= Math.ceil(lx(max)); e++) { const v = Math.pow(10, e); if (v >= min * 0.999 && v <= max * 1.001) out.push(v); } return out; }
      const st = niceStep(max - min, n); for (let v = Math.ceil(min / st) * st; v <= max + st * 1e-6; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v); return out;
    };
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of ticks(ymin, ymax, s.logy, Math.max(3, ph / 42))) { const y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.fillText(fmt(v), L - 6, y); }
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const v of ticks(xmin, xmax, s.logx, Math.max(3, pw / 80))) { const x = X(v); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.fillText(fmt(v), x, T + ph + 5); }
    g.strokeStyle = css('--line2', '#2f4066'); g.strokeRect(L, T, pw, ph);
    if (!s.logy && ymin < 0 && ymax > 0) { g.strokeStyle = txt; g.globalAlpha = .5; g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(L + pw, Y(0)); g.stroke(); g.globalAlpha = 1; }
    // labels
    g.fillStyle = txt; g.textAlign = 'center'; g.textBaseline = 'bottom';
    if (s.xl) g.fillText(s.xl, L + pw / 2, H - 2);
    if (s.yl) { g.save(); g.translate(11, T + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(s.yl, 0, 0); g.restore(); }
    // series
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    const bars = s.series.filter(se => se.type === 'bar' && !se.hidden);
    s.series.forEach((se, k) => {
      if (se.hidden || !se.y) return;
      const col = se.color || PALETTE[k % PALETTE.length];
      const n = se.y.length; if (!n) return;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = se.width || 1.7;
      g.setLineDash(se.dash || []);
      if (se.type === 'bar') {
        const bi = bars.indexOf(se), nb = bars.length;
        let dx = n > 1 ? Math.abs(X(se.x ? se.x[1] : 1) - X(se.x ? se.x[0] : 0)) : pw / 10;
        dx = Math.min(dx, pw / Math.max(n, 1));
        const bw = Math.max(1, dx * 0.75 / nb);
        const y0 = Y(s.logy ? ymin : Math.max(ymin, Math.min(0, ymax)));
        for (let i = 0; i < n; i++) { const xv = se.x ? se.x[i] : i, yv = se.y[i]; if (!isFinite(yv)) continue; const x = X(xv) - dx * 0.375 + bi * bw; const y = Y(s.logy ? Math.max(yv, ymin) : yv); g.globalAlpha = .85; g.fillRect(x, Math.min(y, y0), bw, Math.abs(y0 - y)); }
        g.globalAlpha = 1;
      } else if (se.type === 'scatter') {
        const r = se.r || 3;
        for (let i = 0; i < n; i++) { const xv = se.x ? se.x[i] : i, yv = se.y[i]; if (!isFinite(xv) || !isFinite(yv)) continue; g.beginPath(); g.arc(X(xv), Y(yv), r, 0, 7); g.globalAlpha = .9; g.fill(); }
        g.globalAlpha = 1;
      } else {
        g.beginPath(); let started = false, py = 0;
        const step = Math.max(1, Math.floor(n / (pw * 2)));
        for (let i = 0; i < n; i += (se.type === 'step' ? 1 : step)) {
          const xv = se.x ? se.x[i] : i, yv = se.y[i];
          if (!isFinite(xv) || !isFinite(yv) || (s.logx && xv <= 0) || (s.logy && yv <= 0)) { started = false; continue; }
          const x = X(xv), y = Y(yv);
          if (!started) { g.moveTo(x, y); started = true; } else if (se.type === 'step') { g.lineTo(x, py); g.lineTo(x, y); } else g.lineTo(x, y);
          py = y;
        }
        if (se.fill) { g.stroke(); g.lineTo(X(se.x ? se.x[n - 1] : n - 1), Y(Math.max(ymin, 0))); g.lineTo(X(se.x ? se.x[0] : 0), Y(Math.max(ymin, 0))); g.globalAlpha = .15; g.fill(); g.globalAlpha = 1; }
        else g.stroke();
        if (se.marker) { for (let i = 0; i < n; i++) { const xv = se.x ? se.x[i] : i; g.beginPath(); g.arc(X(xv), Y(se.y[i]), 3, 0, 7); g.fill(); } }
      }
      g.setLineDash([]);
    });
    (s.marks || []).forEach(m => { // vertical / point marks
      g.strokeStyle = m.color || '#facc15'; g.fillStyle = m.color || '#facc15';
      if (m.x !== undefined && m.y === undefined) { g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(m.x), T); g.lineTo(X(m.x), T + ph); g.stroke(); g.setLineDash([]); }
      if (m.x !== undefined && m.y !== undefined) { g.beginPath(); g.arc(X(m.x), Y(m.y), m.r || 5, 0, 7); g.fill(); if (m.label) { g.fillStyle = fg; g.textAlign = 'left'; g.fillText(m.label, X(m.x) + 7, Y(m.y) - 4); } }
      if (m.y !== undefined && m.x === undefined) { g.setLineDash([4, 4]); g.beginPath(); g.moveTo(L, Y(m.y)); g.lineTo(L + pw, Y(m.y)); g.stroke(); g.setLineDash([]); if (m.label) { g.textAlign = 'right'; g.fillText(m.label, L + pw - 4, Y(m.y) - 7); } }
    });
    g.restore();
    // legend
    if (s.legend !== false) {
      let x = L; g.textAlign = 'left'; g.textBaseline = 'middle';
      s.series.forEach((se, k) => {
        if (!se.name) return;
        const col = se.color || PALETTE[k % PALETTE.length];
        g.globalAlpha = se.hidden ? .35 : 1;
        g.fillStyle = col; g.fillRect(x, 8, 12, 4);
        g.fillStyle = fg; g.fillText(se.name, x + 16, 10);
        x += g.measureText(se.name).width + 30;
        g.globalAlpha = 1;
      });
    }
    // hover read-out
    if (this.mouse && s.series.length) {
      const [mx, my] = this.mouse;
      if (mx > L && mx < L + pw && my > T && my < T + ph) {
        g.strokeStyle = css('--dim', '#647596'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(mx, T); g.lineTo(mx, T + ph); g.stroke(); g.setLineDash([]);
        const xv = s.logx ? Math.pow(10, lx(xmin) + (mx - L) / pw * (lx(xmax) - lx(xmin))) : xmin + (mx - L) / pw * (xmax - xmin);
        let html = `${s.xl || 'x'}: ${fmt(xv)}`;
        s.series.forEach((se, k) => {
          if (!se.y || !se.y.length || se.hidden) return;
          let bi = 0, bd = Infinity;
          const n = se.y.length, step = Math.max(1, Math.floor(n / 4000));
          for (let i = 0; i < n; i += step) { const d = Math.abs((se.x ? se.x[i] : i) - xv); if (d < bd) { bd = d; bi = i; } }
          html += `<br><span style="color:${se.color || PALETTE[k % PALETTE.length]}">■</span> ${se.name || 'y'}: ${fmt(se.y[bi])}`;
        });
        this.tip.innerHTML = html; this.tip.style.display = 'block';
        const tw = this.tip.offsetWidth;
        this.tip.style.left = (mx + 14 + tw > W ? mx - tw - 6 : mx + 14) + 'px';
        this.tip.style.top = (my + 10) + 'px';
      }
    }
  }
  png() { return this.canvas.toDataURL('image/png'); }
  csv() {
    const s = this.spec; const lines = [];
    s.series.forEach(se => {
      lines.push(`# ${se.name || 'series'}`); lines.push(`${s.xl || 'x'},${s.yl || 'y'}`);
      for (let i = 0; i < (se.y || []).length; i++) lines.push(`${se.x ? se.x[i] : i},${se.y[i]}`);
    });
    return lines.join('\n');
  }
}

/** Ring buffer series for live strip charts */
export class Trace {
  constructor(max = 3000) { this.max = max; this.x = []; this.y = []; }
  push(x, y) { this.x.push(x); this.y.push(y); if (this.x.length > this.max) { this.x.splice(0, this.x.length - this.max); this.y.splice(0, this.y.length - this.max); } }
  clear() { this.x.length = 0; this.y.length = 0; }
}
