# Bisou-Biel 💋 — dashboard webcams & vent du lac de Bienne

Page **statique** (hébergeable sur **GitHub Pages**) pour le plan d'eau de
Bienne (Nidauwald / Wingreis, Macolin) : webcam en direct, graphe du vent de la
**station Wingreis exacte**, et les webcams de bielersee.live.

## Contenu de la page

| Bloc | Source | Mécanisme |
| ---- | ------ | --------- |
| Webcam Nidauwald / Macolin | CDN Windy (swisswebcams) | `<img>` direct, CORS `*`, sans token |
| Graphes station (vent style meteobase + température de l'eau) | **station Wingreis** (`wingreis.meteobase.ch`) | lit `./wind.json` en **same-origin**, rendu Chart.js maison |
| Relevés officiels station (vent, eau, gust-factor) | `wingreis.meteobase.ch` | `<iframe>` recadré (le graphe interne du site ne s'affiche pas en cadre) |
| Webcams bielersee | [bielersee.live](https://bielersee.live/) | `<iframe>` de la page (scroller à l'intérieur) |

## Comment la station exacte marche sur un site statique

`wingreis.meteobase.ch` n'expose **aucun en-tête CORS** et lie ses données à une
session PHP — donc une page statique ne peut pas les lire directement. Et son
propre graphe (canvas Chart.js) **ne se rend pas en `<iframe>` cross-origin** :
on ne peut donc pas se contenter d'intégrer la page. La solution est de
**redessiner le graphe nous-mêmes** à partir des données de la station.

Solution **sans backend permanent ni Python** : une **GitHub Action**
(`.github/workflows/wind.yml`) exécute toutes les ~15 min le scraper Node
[`scripts/fetch_wind.mjs`](scripts/fetch_wind.mjs), qui reproduit le flux de
session (page → clés fraîches → `jdata.php`) pour le **vent** et la
**température de l'eau**, et committe un `wind.json` propre dans le repo. GitHub
Pages sert ce fichier en **same-origin**, donc la page le lit sans aucun problème
de CORS, et le rend en deux graphes Chart.js aux couleurs de meteobase. Tout
reste sur GitHub.

```
wind_biel/
├── index.html                  # la page
├── wind.json                   # données station (régénéré par l'Action)
├── scripts/fetch_wind.mjs      # scraper Node (aucune dépendance, Node ≥ 18)
└── .github/workflows/wind.yml  # cron 15 min + commit
```

## Tester en local

```bash
cd ~/Documents/Projects/wind_biel
node scripts/fetch_wind.mjs      # (re)génère wind.json
python3 -m http.server 8777      # → http://localhost:8777  (sert wind.json en same-origin)
```

Ouvrir le fichier en `file://` marche aussi, sauf que `fetch('./wind.json')` est
bloqué par le navigateur en `file://` — passer par un petit serveur HTTP local.

## Publier sur GitHub Pages

```bash
cd ~/Documents/Projects/wind_biel
git init && git add . && git commit -m "Dashboard Lac de Bienne"
git branch -M main
git remote add origin git@github.com:<user>/wind_biel.git
git push -u origin main
```

Puis sur GitHub :

1. **Settings → Pages → Source: Deploy from a branch → `main` / root.**
2. **Settings → Actions → General → Workflow permissions : Read and write**
   (pour que l'Action puisse committer `wind.json`).
3. L'onglet **Actions** : lancer une fois « Update wind data » manuellement
   (`workflow_dispatch`) pour amorcer, puis le cron prend le relais.

Page servie sur `https://<user>.github.io/wind_biel/`.

## Limites connues

- Le vent est rafraîchi à la cadence du cron (~15 min, parfois plus sous charge
  GitHub) — pas en continu. La station mesure en pas de 10 min, donc c'est
  cohérent.
- Le haut de l'iframe bielersee montre des bannières publicitaires ; les caméras
  sont plus bas (défiler dans le cadre). Impossible de piloter le défilement d'un
  iframe cross-origin par script.

## Sources

- Webcam Nidauwald / Macolin : <https://www.swisswebcams.ch/webcam/zoom/1423817599-Nidauwald-Magglingen-Macolin-Lake-Biel-%280-Ipsach%29_Wetter>
- Webcams bielersee : <https://bielersee.live/>
- Station vent Wingreis : <https://wingreis.meteobase.ch/>
