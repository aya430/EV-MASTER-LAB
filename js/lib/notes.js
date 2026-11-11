// Unit-wise notes index: section number -> real PDF page (parsed from the notes' table of contents).
export const NOTES = {
  1: { file: 'notes/Unit_1___EVSE_UG.pdf', title: 'Unit 1 – Introduction to Electric Vehicles' },
  2: { file: 'notes/Unit_2___EVSE_UG.pdf', title: 'Unit 2 – Energy Storage Systems' },
  3: { file: 'notes/Unit_3___EVSE_UG.pdf', title: 'Unit 3 – Power Electronics and Electric Drive Train Systems' },
  4: { file: 'notes/Unit_4___EVSE_UG.pdf', title: 'Unit 4 – EV Modelling and Simulation' },
};
export let INDEX = null;
export let PAGES = null;
export async function loadNotesIndex() {
  if (INDEX) return INDEX;
  try { INDEX = await (await fetch('data/notes_index.json')).json(); } catch (e) { INDEX = {}; }
  return INDEX;
}
export async function loadNotesPages() {
  if (PAGES) return PAGES;
  try { PAGES = await (await fetch('data/notes_pages.json')).json(); } catch (e) { PAGES = {}; }
  return PAGES;
}
/** refs: ['1.4', '2:3.3'] -> [{u,n,t,p,href,pdf}] ; "u:n" disambiguates (Unit 2 numbers its charging chapter 3.x). */
export function notesLinks(refs) {
  const out = [];
  for (const r of refs) {
    let u, n;
    if (String(r).includes(':')) [u, n] = String(r).split(':'); else { n = String(r); u = n.split('.')[0]; }
    const sec = INDEX && INDEX[u] && INDEX[u].sections.find(s => s.n === n);
    if (!sec) continue; // never fabricate a page number
    out.push({ u: +u, n, t: sec.t, p: sec.p, href: `#/notes/${u}/${sec.p}`, pdf: `${NOTES[u].file}#page=${sec.p}` });
  }
  return out;
}
