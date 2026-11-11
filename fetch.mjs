// Codzienne notowania dla aplikacji Po trochu. Uruchamiane przez GitHub Actions, bez zależności (Node 20+).
// Źródło: publiczne dane wykresów Yahoo Finance (nieoficjalne, tylko do użytku osobistego/niekomercyjnego).
// Wynik: prices/<ID>.json, gdzie ID to oznaczenie jak w eksporcie XTB (np. KTY.PL, AMT.US, IUSQ.DE).
import fs from 'node:fs';

const U = JSON.parse(fs.readFileSync(new URL('./universe.json', import.meta.url)));
const list = [
  ...new Set(U.gpw).values()].map(t => ({ id: `${t}.PL`, y: `${t}.WA` }))
  .concat([...new Set(U.us)].map(t => ({ id: `${t.replace('-', '.')}.US`, y: t })))
  .concat([...new Set(U.etf)].map(t => ({ id: t.endsWith('.WA') ? t.replace('.WA', '.PL') : t, y: t })));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function yahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3y&interval=1d&events=div%2Csplit`;
  for (let k = 0; k < 3; k++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (po-trochu price feed)' } });
    if (r.ok) {
      const j = await r.json(); const res = j.chart?.result?.[0]; if (!res?.timestamp) return null;
      const close = res.indicators?.quote?.[0]?.close || [];
      const d = res.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), close[i]]).filter(([, c]) => c != null).map(([dt, c]) => [dt, +(+c).toFixed(4)]);
      // Yahoo podaje ceny z Londynu w pensach – przeliczamy na funty
      let ccy = res.meta?.currency || 'USD'; if (ccy === 'GBp') { ccy = 'GBP'; for (const p of d) p[1] = +(p[1] / 100).toFixed(4); }
      return { ccy, d };
    }
    await sleep(1500 * (k + 1));
  }
  return null;
}

fs.mkdirSync(new URL('./prices/', import.meta.url), { recursive: true });
const index = {}; let ok = 0, bad = [];
for (const it of list) {
  const r = await yahoo(it.y).catch(() => null);
  if (r && r.d.length) {
    fs.writeFileSync(new URL(`./prices/${it.id}.json`, import.meta.url), JSON.stringify({ id: it.id, ccy: r.ccy, d: r.d }));
    index[it.id] = { ccy: r.ccy, last: r.d[r.d.length - 1][0] }; ok++;
  } else bad.push(it.id);
  await sleep(250);
}
fs.writeFileSync(new URL('./prices/index.json', import.meta.url), JSON.stringify({ updated: new Date().toISOString(), items: index }, null, 0));
console.log(`OK ${ok}/${list.length}${bad.length ? `, brak: ${bad.join(', ')}` : ''}`);
if (ok < list.length * 0.5) process.exit(1);
