# AnslagSITK

Sök och skriv ansökningar för Sandvikens IT-Kår — utlysningar, discovery med Exa + OpenRouter.

**Aktiv kodbas:** denna mapp (`TwistedStacks/AnslagSITK`). GitHub-repot `wawawee/AnslagSITK` är en äldre Azure-variant — synka hit innan Vercel-deploy.

## Snabbstart (lokal)

```bash
cd /Users/perbrinell/TwistedStacks/AnslagSITK
cp .env.example .env
# Fyll i minst en OPENROUTER_KEY_* (helst alla 7 för failover)

npm install
npm run validate          # testar nycklar
npm run dev:api           # API på :3001
npm run dev               # frontend på :5173 (proxar /api → :3001)
```

Eller i två terminaler: `dev:api` + `dev`.

## Miljövariabler

| Variabel | Krävs | Syfte |
|----------|--------|--------|
| `OPENROUTER_API_KEY` | Ja (Vercel/lokal) | En nyckel räcker — fyller alla zoner |
| `OPENROUTER_KEY_*` (7 st) | Nej | Extra failover mellan konton |
| `EXA_API_KEY` | Rekommenderas | Live webbsökning vid discovery |
| `QDRANT_URL` + `QDRANT_API_KEY` | Nej | Vektorminne (ej kopplat till UI ännu) |
| `GOOGLE_GEMINI_API_KEY` | Om Qdrant | Embeddings för Qdrant |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Prod | Inloggning |

Se `.env.example` för full lista.

## Vercel + lokal utveckling

**Ja — du behöver samma nyckel lokalt.** Vercel-env gäller bara i molnet. Lägg **inte** nyckeln i chatten; kopiera från Vercel → lokalt:

```bash
# I ~/TwistedStacks/AnslagSITK/.env
OPENROUTER_API_KEY=sk-or-v1-...   # samma variabelnamn som i Vercel
```

Kör `npm run validate` lokalt innan du deployar.

1. Logga in: `vercel login`
2. Länka projektet (om inte redan): `vercel link`
3. I Vercel Dashboard: `OPENROUTER_API_KEY` (+ valfritt `EXA_API_KEY`, `ADMIN_PASSWORD`)

4. Deploy från **denna** mapp efter att GitHub är uppdaterad:

```bash
npm run build
vercel --prod
```

Frontend + API: `vercel.json` skickar `/api/*` till `api/index.js`.

## Felsökning

| Symptom | Orsak | Åtgärd |
|---------|--------|--------|
| `401 User not found` | Ogiltiga OpenRouter-nycklar | Nya nycklar på [openrouter.ai/keys](https://openrouter.ai/keys), uppdatera `.env` + Vercel |
| Mock-anslag i UI | API nere eller fel | Starta `dev:api`, kontrollera `curl localhost:3001/api/health` |
| Discovery utan live-data | Saknar Exa | Sätt `EXA_API_KEY` |
| "DB funkar inte" | Qdrant ej konfigurerat / inga API-routes | Normalt för grants-flödet; Qdrant är framtida agentminne |

```bash
npm run validate
curl -s http://localhost:3001/api/health | jq
```

## Modeller: gratis → betald

Styr med `OPENROUTER_MODEL_TIER` i `.env` / Vercel:

| Värde | Beteende |
|--------|----------|
| `auto` (default) | Provar `gemini-2.5-flash-lite`, `:free`-modeller, `openrouter/free`, sedan `gpt-4o` / `gemini-2.5-flash` |
| `free` | Endast gratis (ingen kostnad, långsammare/mer varierande) |
| `paid` | Endast betalda (snabbast/mest stabilt) |

Testa din nyckel:

```bash
OPENROUTER_MODEL_TIER=free npm run test:models
OPENROUTER_MODEL_TIER=auto npm run test:models
```

**Testresultat (din nyckel):** `openrouter/free` fungerar men väljer slumpmässig liten modell — sämre format. `google/gemini-2.5-flash-lite` följer ansökningsformat bäst och är billig/nära gratis. `auto` är rekommenderat.

## Qdrant (agentminne)

| Scenario | Rekommendation |
|----------|----------------|
| **Bara du, lokal dev** | **Lokal Docker** — gratis, ingen molnkostnad |
| **Vercel i produktion** | Qdrant når inte `localhost` → antingen **Qdrant Cloud** (gratis tier) eller skippa vektor-minne på Vercel (`.agent/*.md` fungerar ändå) |

Lokal Qdrant:

```bash
npm run qdrant:up
# .env:
# QDRANT_URL=http://localhost:6333
# QDRANT_API_KEY=          # tom för lokal
# GOOGLE_GEMINI_API_KEY=   # för embeddings (AI Studio)
```

Stoppa: `npm run qdrant:down`

Grants/sökning **kräver inte** Qdrant — bara Agent Intelligence-fliken.

### Docker startar inte?

Om `docker` hänger: **Docker Desktop** är troligen avstängd eller fast.

1. Öppna **Docker Desktop** och vänta tills den visar "Running".
2. Testa: `docker run --rm hello-world`
3. Starta Qdrant: `npm run qdrant:up`

**Utan Docker:** Hoppa över Qdrant tills vidare (appen fungerar), eller skapa gratis cluster på [cloud.qdrant.io](https://cloud.qdrant.io) och sätt `QDRANT_URL` + `QDRANT_API_KEY` i `.env` / Vercel.

## Gratismodeller (testat maj 2026)

| Modell | Hastighet | Format (utlysningar) | Kommentar |
|--------|-----------|----------------------|-----------|
| `google/gemini-2.5-flash-lite` | ~2 s | ✓ | Bäst pris/prestanda i `auto` |
| `minimax/minimax-m2.5:free` | ~19 s | ✓ | Bra uptime, följer mall |
| `deepseek/deepseek-v4-flash:free` | ~15 s | varierar | Stark på agent/kod, sämre på strikt markdown |
| `openrouter/free` | 10–80 s | varierar | Slumpar modell (ibland VL/multimodal) |

`OPENROUTER_MODEL_TIER=auto` provar i ordning: flash-lite → minimax → deepseek → openrouter/free → betalt.

## Browser-automation (browser-use)

**AnslagSITK använder inte browser-use i produktion** — utlysningssökning går via **Exa** + OpenRouter (snabbare, ingen browser).

| Approach | När | Multimodal? |
|----------|-----|-------------|
| **Exa** (nuvarande) | Söka utlysningar, artiklar, URL:er | Nej — text räcker |
| **browser-use Cloud** (`BROWSER_USE_API_KEY`) | Betald SaaS, full browser i molnet | Ja (skärmdumpar) — för inloggning/komplexa sidor |
| **browser-use OSS** (`pip install browser-use`) | Egen Mac, Playwright, LLM=OpenRouter | Valfritt; vision-modell hjälper på JS-tunga sidor |
| **Playwright + OpenRouter** | Max kontroll, mer kod | Endast om du parsar bilder/DOM |

**Multimodal behövs inte** för vanlig grants-text. Det behövs om agenten ska *se* webbsidan (screenshots) som browser-use gör.

Jämförelse för er stack:

- **Behåll Exa** för AnslagSITK sök/discovery.
- **browser-use Cloud** — ni har nyckel; bra för engångstest (`scripts/experiment_api.js`), men kostnad + vendor lock-in.
- **OSS browser-use** — samma idé lokalt med `OPENROUTER_API_KEY` som LLM; relevant för API-Hunter / inloggning på portaler, inte för ersätta Exa.

`BROWSER_USE_API_KEY` i `.env` är valfri och används inte av huvud-API:t.

## browser-use → Exa + OpenRouter

Den gamla **browser-use.com**-integrationen är borttagen (API fanns aldrig i backend).

| Behov | Ersättning |
|--------|------------|
| Hitta utlysningar på webben | **Exa** (`EXA_API_KEY`) + OpenRouter i `/api/discover-grants` |
| LLM (planering, ansökningar) | **OpenRouter** (`OPENROUTER_API_KEY`) |
| Agentminne | `.agent/*.md` + valfritt **Qdrant** |

Öppen källkod om du senare behöver riktig webbläsarautomation: [Playwright](https://playwright.dev) + egen agent-loop mot OpenRouter, eller [Stagehand](https://github.com/browserbase/stagehand). För AnslagSITK räcker Exa i de flesta fall.

## Relaterat

- OpenRouter multi-proxy (lokal): `~/Documents/AnslagSITK` (round-robin, port 3000)
- SkatteRevision: `wawawee/SKATTEREVISION-REBOOT` (pågående separat)
- LAGA: `architect-cmd/LAGA` + `finasteos/laga` (nästa steg efter AnslagSITK)
