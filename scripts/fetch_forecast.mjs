#!/usr/bin/env node
/**
 * Prévision MétéoSuisse (rafales / vent / direction) pour Port–Ipsach et écrit
 * ../forecast.json, pour un rendu Chart.js « maison ».
 *
 * Source : API de l'app MétéoSuisse (même données que la page
 * meteosuisse.admin.ch/previsions-locales/port/2562.html). Elle ne renvoie pas
 * d'en-tête CORS → on la récupère côté CI (GitHub Action) et on publie un JSON
 * propre que la page statique lit en same-origin.
 *
 * graph.start            = timestamp (ms) du 1er point des séries horaires
 * graph.gustSpeed1h[]    = rafales horaires [km/h]   (les « gust peaks »)
 * graph.windSpeed1h[]    = vent moyen horaire [km/h]
 * graph.windDirection3h[]= direction tous les 3 h [°]
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PLZ = process.argv[2] || "256200"; // Port (2562) ; Ipsach = 256300
const URL = `https://app-prod-ws.meteoswiss-app.ch/v1/plzDetail?plz=${PLZ}`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124 Safari/537.36";

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`plzDetail ${PLZ} -> HTTP ${res.status}`);
  const d = await res.json();
  const g = d.graph;
  if (!g || !g.gustSpeed1h) throw new Error("graph.gustSpeed1h absent");

  const start = g.start;                 // ms
  const HOUR = 3600000;
  const n = g.gustSpeed1h.length;

  const hourly = [];
  for (let i = 0; i < n; i++) {
    hourly.push({
      t: start + i * HOUR,
      wind: g.windSpeed1h?.[i] ?? null,
      gust: g.gustSpeed1h[i],
    });
  }
  const dir = (g.windDirection3h || []).map((deg, i) => ({ t: start + i * 3 * HOUR, deg }));

  const out = {
    updated: Date.now(),
    plz: PLZ,
    location: "Port / Ipsach",
    start,
    hourly,
    dir,
  };
  const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "forecast.json");
  writeFileSync(dest, JSON.stringify(out));
  console.error(`forecast.json écrit : ${hourly.length} h, ${dir.length} dir, maj ${new Date(out.updated).toISOString()}`);
}

main().catch((e) => {
  console.error("ERREUR:", e.message);
  process.exit(1);
});
