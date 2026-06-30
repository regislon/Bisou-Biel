#!/usr/bin/env node
/**
 * Récupère les images des webcams de bielersee.live et les écrit en JPEG
 * statiques (../cam-0.jpg, cam-1.jpg, …) + ../cams.json {count, updated}.
 *
 * bielersee sert ses caméras via imager.php avec un cookie de session + Referer
 * (hotlink direct = 404, et iframer la page entière = bannières pub). On récupère
 * donc les images côté CI (GitHub Action) et on publie des JPEG propres que la
 * page statique affiche en same-origin, sans publicité.
 *
 *   1. GET bielersee.live      -> cookie PHPSESSID + URLs imager.php (tokens u/c/s)
 *   2. GET imager.php (cookie + Referer) -> JPEG de chaque caméra
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BIEL = "https://bielersee.live/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124 Safari/537.36";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(url, cookie, attempt = 1) {
  const MAX = 4;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: BIEL,
        "Accept-Language": "de-CH,de;q=0.9,fr;q=0.8",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (e) {
    if (attempt >= MAX) throw new Error(`${url} -> ${e.message} (après ${MAX} essais)`);
    await sleep(1000 * 3 ** (attempt - 1));
    return req(url, cookie, attempt + 1);
  }
}

async function main() {
  const home = await req(BIEL);
  const cookie = (home.headers.get("set-cookie") || "").split(";")[0] || null;
  const html = await home.text();
  const cams = [...new Set(html.match(/imager\.php\?u=[0-9a-f]+&c=[0-9a-f]+&s=[0-9a-f]+/g) || [])];
  if (!cams.length) throw new Error("aucune caméra trouvée sur bielersee.live");

  let saved = 0;
  for (let i = 0; i < cams.length; i++) {
    try {
      const res = await req(BIEL + cams[i], cookie);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) { console.error(`cam ${i}: trop petite (${buf.length}o), ignorée`); continue; }
      writeFileSync(join(ROOT, `cam-${saved}.jpg`), buf);
      saved++;
    } catch (e) {
      console.error(`cam ${i}: ${e.message}`);
    }
  }
  if (!saved) throw new Error("aucune image de caméra récupérée");

  writeFileSync(join(ROOT, "cams.json"), JSON.stringify({ updated: Date.now(), count: saved }));
  console.error(`cams: ${saved}/${cams.length} images écrites`);
}

main().catch((e) => {
  console.error("ERREUR:", e.message);
  process.exit(1);
});
