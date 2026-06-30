#!/usr/bin/env node
/**
 * Récupère les données de la station Wingreis (wingreis.meteobase.ch) et écrit
 * ../wind.json (vent + météo), pour un rendu Chart.js « maison » fidèle au site.
 *
 * meteobase n'expose aucun en-tête CORS et lie ses données à une session PHP :
 *   1. charger la page station   -> cookie PHPSESSID
 *   2. charger dataparser.js.php -> 3 clés jdata fraîches (vent / temp eau / météo)
 *   3. charger jdata.php?k=<clé> -> tableau de points (même session + Referer)
 * Reproduit ce flux côté CI (pas de CORS) et publie un JSON propre que la page
 * statique lit en same-origin. Lancé par .github/workflows/wind.yml.
 *
 * Clés identifiées par leur 1er caractère (cf. dataparser.js.php) :
 *   w… = vent     t… = température de l'eau     h… = météo (air/humidité/baro/solaire)
 *
 * Champs jdata (validés contre les datasets Chart.js du site) :
 *   vent  : a=ts  b=moyenne  c=rafale  d=min  e=direction  i=gust-factor  k=régularité  (km/h, °, %)
 *   eau   : a=ts  b=température °C
 *   météo : a=ts  b=temp air °C  e=baromètre hPa  f=humidité %  g=solaire W/m²
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REF = "https://wingreis.meteobase.ch/";
const DATAPARSER = "https://www.meteobase.ch/versions/v73/dataparser.js.php";
const JDATA = (k) => `https://www.meteobase.ch/versions/v73/jdata.php?k=${k}`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124 Safari/537.36";

async function get(url, cookie) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: REF,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  return { text: await res.text(), cookie: setCookie ? setCookie.split(";")[0] : null };
}

function parsePoints(text) {
  const m = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  return m ? JSON.parse(m[0]) : [];
}

const num = (v) => (v === undefined || v === "" ? null : parseFloat(v));

async function main() {
  // 1) session
  const page = await get(REF);
  const cookie = page.cookie;
  if (!cookie) throw new Error("aucun cookie de session reçu");

  // 2) clés fraîches (vent / eau / météo) dans l'ordre du dataparser
  const dp = await get(DATAPARSER, cookie);
  const keys = [...dp.text.matchAll(/jdata\.php\?k=([0-9a-zA-Z]+)/g)].map((x) => x[1]);
  const byPrefix = (c) => keys.find((k) => k[0] === c);
  const kWind = byPrefix("w"), kWater = byPrefix("t"), kMeteo = byPrefix("h");
  if (!kWind) throw new Error("clé vent introuvable");

  // 3) données
  const wind = parsePoints((await get(JDATA(kWind), cookie)).text);
  const water = kWater ? parsePoints((await get(JDATA(kWater), cookie)).text) : [];
  const meteo = kMeteo ? parsePoints((await get(JDATA(kMeteo), cookie)).text) : [];

  const windPts = wind
    .map((p) => ({
      t: parseInt(p.a, 10),
      avg: num(p.b), gust: num(p.c), min: num(p.d),
      dir: num(p.e), gf: num(p.i), cons: num(p.k),
    }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);

  // météo : fusion sur le timestamp des séries disponibles (air/humidité/baro/solaire
  // peuvent être vides selon la station ; ici Wingreis n'a que la température de l'eau).
  const merged = new Map();
  const ensure = (t) => {
    if (!merged.has(t)) merged.set(t, { t, airTemp: null, humidity: null, baro: null, solar: null, waterTemp: null });
    return merged.get(t);
  };
  for (const p of meteo) {
    const r = ensure(parseInt(p.a, 10));
    r.airTemp = num(p.b); r.baro = num(p.e); r.humidity = num(p.f); r.solar = num(p.g);
  }
  for (const p of water) ensure(parseInt(p.a, 10)).waterTemp = num(p.b);
  const meteoPts = [...merged.values()]
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);

  const out = {
    updated: Date.now(),
    station: "Wingreis",
    points: windPts,   // rétro-compat : le graphe vent lit `points`
    wind: windPts,
    meteo: meteoPts,
  };
  const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "wind.json");
  writeFileSync(dest, JSON.stringify(out));
  console.error(
    `wind.json écrit : ${windPts.length} pts vent, ${meteoPts.length} pts météo, maj ${new Date(out.updated).toISOString()}`
  );
}

main().catch((e) => {
  console.error("ERREUR:", e.message);
  process.exit(1);
});
