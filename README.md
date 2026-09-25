# Water Glass

A static water-use simulator. Pick a data center or an AI model and a 3D glass under a chrome faucet fills from a cited number. Switching selections pours the glass into the basin, rights it, and refills it to the new level.

The site is published at **https://aditano.github.io/water-use-simulator/**

Pushes to `main` run [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which builds the app and deploys it with GitHub Actions. Pages uses that workflow as its source. If a future settings change points Pages back at the raw `main` branch, switch **Settings → Pages → Source** to **GitHub Actions** so the built files are what get served.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open `http://localhost:5173/water-use-simulator/`. The Vite `base` is `/water-use-simulator/` so the dev server and GitHub Pages share the same paths.

`npm test` typechecks the app and checks that every poured number still matches its source formula (Jegham equation 3, the Altman gallon conversion, and the Council Bluffs annual total divided by 365).

## How the glass works

The sink is a [Three.js](https://threejs.org/) studio (WebGL), bundled by Vite: a dark room, a grouted tile floor, a porcelain basin, a chrome gooseneck, and a thick transmission-glass tumbler. Drag the stage to orbit. The lists, tabs, and plaque are a thin glass HUD over that scene. Cited numbers stay on the plaque — the picture does not replace them.

Two menus, two etchings. The etching is on the glass and restated on the plaque.

**AI Models.** The tumbler is etched at **40 mL**. Height is the real volume of this taper, so the marks sit closer together near the rim and a few milliliters stay low in the glass. One falling drop is one short **GPT-4o** query (**1.44 mL**), a shallow pool at the foot — the drop reference. A short **Claude 3.7 Sonnet** query is about twice that, so the faucet lets two drops fall. Short prompts from under a milliliter through about 25 mL (Llama 3.3 up through o3) fill part of the glass, and you can watch the pour: drops for a tiny amount, then a stream. Three rows sit past the etching and spill on purpose — Mistral Large 2 at 45 mL, DeepSeek-R1 at 166 mL, and the 519 mL GPT-4 email. The plaque says **Exceeds glass**. The spill plays after the tumbler is full. It is not the resting state of a typical row.

**Data Centers.** The same tumbler is re-etched at **4 million gallons per day**. Fill is that campus or fleet’s cited daily figure divided by 4 million. These are not queries, and they are not drawn on the 40 mL scale. The badge on the plaque says whether the number is consumption, withdrawal, a utility meter, a contract peak, or a requested cap.

There is no backend. The glass never invents a number for a missing model. **Grok** has no published per-query water figure in the sources below, so choosing it pours the glass out and leaves it empty. Campus water for Colossus and Colossus 2 is on the other menu.

## What the numbers are, and are not

Water figures in this field do not share a boundary. A company claim of about 0.3 mL, a lab estimate of about 17 mL, and a 519 mL email scenario can all be “per query” and still describe different things: on-site cooling only, on-site plus the water used to generate electricity, a short chat, or a 100-word email. The plaque states the boundary. The Sources sheet repeats the citation, the date, and the assumptions.

Prefer the range on the plaque over the point value. Where a source published no band, the plaque says so instead of inventing one.

Daily campus figures are annual totals divided by 365 (366 for the 2024 West Des Moines meter). They are averages, not a hot afternoon.

## Model figures

| Selection | Poured value | What it is | Source |
| --- | --- | --- | --- |
| GPT-4o, short prompt | 1.44 mL (1.00–1.87) | Derived. Drop reference. | [Jegham et al. 2025](https://arxiv.org/abs/2505.09598), Table 4 energy 0.421 ± 0.127 Wh, equation (3), Azure PUE 1.12, on-site WUE 0.30 L/kWh, off-site WUE 3.142 L/kWh |
| Claude 3.7 Sonnet, short prompt | 2.76 mL (2.42–3.10) | Derived. About two drops. Not an Opus figure. | Same paper, 0.836 ± 0.102 Wh, AWS PUE 1.14, on-site WUE 0.18 L/kWh |
| Claude 3.7 Sonnet, extended thinking | 11.5 mL (10.5–12.5) | Derived. About eight drops. The higher-use Claude mode in that paper. | Same paper, 3.490 ± 0.304 Wh, same AWS multipliers |
| GPT-4, short prompt | 6.74 mL (5.32–8.17) | Derived. Authors assign A100-class hardware. | Same paper, 1.978 ± 0.419 Wh, Azure multipliers |
| Llama 3.3 70B, short prompt | 0.82 mL (0.71–0.92) | Derived. | Same paper, 0.247 ± 0.032 Wh, AWS multipliers |
| Llama 3.1 405B, short prompt | 6.57 mL (5.53–7.61) | Derived. | Same paper, 1.991 ± 0.315 Wh, AWS multipliers |
| OpenAI o3, short prompt | 24.0 mL (11.5–36.4) | Derived. Wide band because Table 4’s energy spread is wide. | Same paper, 7.026 ± 3.663 Wh, Azure multipliers |
| DeepSeek-R1, short prompt | 166 mL (151–181) | Derived with the paper’s China multipliers. The paper says this model is above 150 mL per query. | Same paper, 23.815 ± 2.160 Wh, PUE 1.27, on-site WUE 1.20, off-site WUE 6.016 |
| Gemini Apps, median text prompt, May 2025 | 0.26 mL (table also lists 0.12 mL) | Company measurement. Google calls 0.26 mL about five drops of 0.05 mL — a different drop than this glass. | [Elsworth et al. 2025](https://arxiv.org/abs/2508.15734), Table 2 |
| ChatGPT, average query | 0.322 mL | Company claim. No methodology. 0.000085 gallons. | [Sam Altman, 10 June 2025](https://blog.samaltman.com/the-gentle-singularity) |
| GPT-3, U.S. average medium response | 16.9 mL (7.1–47.5 across Table 1 locations) | Academic estimate. On-site 2.2 mL + off-site 14.7 mL. The paper also says a 500 mL bottle covers roughly 10–50 responses. | [Li, Yang, Islam, and Ren](https://arxiv.org/abs/2304.03271), Table 1 |
| Mistral Large 2, 400-token Le Chat reply | 45 mL | Lifecycle study with Carbone 4 and ADEME, reviewed by Resilio and Hubblo. No published band. | [Mistral AI, July 2025](https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai) |
| GPT-4, 100-word email | 519 mL | Journalism with UC Riverside. One email at an average U.S. data center. Not a short prompt. | [Washington Post, 18 September 2024](https://www.washingtonpost.com/technology/2024/09/18/energy-ai-use-electricity-water-data-centers/) |
| Grok | none | No per-query figure found. The glass stays empty. | Campus reporting is separate; see Colossus below |

### Derivation used for the Jegham rows

Jegham et al. define query energy so that it already includes PUE, then:

`water (L) = (E_kWh / PUE) × WUE_site + E_kWh × WUE_source`

`E_kWh` is Table 4’s mean watt-hours for a **100 input / 300 output token** prompt, divided by 1000. The range moves that mean by the published energy standard deviation and reruns the same formula. It is not a full uncertainty analysis. Scope 3 manufacturing water is left out, as in the paper. Hardware class and a batch size of 8 are the paper’s assumptions.

No Opus-specific or Grok-specific per-query water number was found. Extended thinking is not labeled as Opus. Grok is not given a borrowed energy figure.

GPT-3 **training** is not poured. Table 1’s U.S. average is 0.708 million liters on-site and 5.439 million liters total; the abstract’s on-site figure is 700,000 liters. That is a training total, not a daily meter and not a query.

## Data-center figures

| Selection | Poured daily value | Kind | Source |
| --- | --- | --- | --- |
| Colossus & Colossus 2 | 3.70 million gal/day | Requested cap for **both** Memphis sites together. Not a meter, and not Colossus 2 alone. | [E&E News, 4 May 2026](https://www.eenews.net/articles/xai-sidelines-major-water-reuse-project-as-ipo-looms/), quoting MLGW |
| Google Council Bluffs, Iowa | 2.69 million gal/day | 2023 **consumption** 980.1 million gallons ÷ 365. Withdrawal was 1,334.9 million gallons. | [Google 2024 Environmental Report](https://www.gstatic.com/gumdrop/sustainability/google-2024-environmental-report.pdf) |
| Google Mayes County, Oklahoma | 2.23 million gal/day | 2023 consumption 815.1 million gallons ÷ 365 | Same Google report |
| Meta data centers, global fleet | 2.13 million gal/day | 2023 fleet **consumption** 2,938 megaliters. Not one building. | [Meta 2024 Sustainability Report](https://sustainability.atmeta.com/wp-content/uploads/2024/08/Meta-2024-Sustainability-Report.pdf) |
| Google Berkeley County, South Carolina | 2.09 million gal/day | 2023 consumption 763.4 million gallons ÷ 365 | Google 2024 Environmental Report |
| Colossus, Paul R. Lowry Road | 1.30 million gal/day (public descriptions span 1.0–1.4) | **Contract peak**, not average use. | [Commercial Appeal, 5 June 2025](https://www.commercialappeal.com/story/money/business/development/2025/06/05/elon-musk-xai-supercomputer-grok-memphis-tn/83599473007/) (39,000,062 gallons peak monthly demand, “roughly 1.3 million gallons daily”); [MLGW 2024 quick facts](https://www.mlgw.com/images/content/files/pdf/2024xAI%20and%20MLGW%20Quick%20Facts%201.pdf) (“up to 1 MGD”); [Commercial Appeal, 6 May 2025](https://www.commercialappeal.com/story/news/local/2025/05/06/xai-seeks-1-gigawatt-of-power-memphis-site/83453645007/) (“up to 1.4 million gallons a day”) |
| Google The Dalles, Oregon | 0.83 million gal/day | 2023 consumption 302.4 million gallons ÷ 365 | Google 2024 Environmental Report. A later city meter (434.4 million gallons in 2024) is a different metric and is not poured: [OPB, 23 January 2026](https://www.opb.org/article/2026/01/23/the-dalles-mayor-data-center-google/) |
| Meta Fort Worth, Texas | 292,000 gal/day | 2023 **withdrawal** 404 megaliters ÷ 365 | Meta 2024 Sustainability Report |
| Microsoft, West Des Moines | 187,000 gal/day (2025 meter 171,000) | Utility **delivery** to the campus, 68.58 million gallons in 2024 ÷ 366 | [West Des Moines Water Works](https://www.wdmww.com/data-centers-your-water.aspx) |
| Meta Prineville, Oregon | 130,000 gal/day | 2023 withdrawal 180 megaliters ÷ 365 | Meta 2024 Sustainability Report |

Gallon conversions use 3.785411784 liters per U.S. gallon. Megaliters in Meta’s table are treated as 1,000 cubic meters.

Not poured, on purpose:

- The Memphis greywater plant’s design allocation of about 5 million gallons/day to xAI, from the TDEC application as reported by [The Tennessean on 12 March 2025](https://www.tennessean.com/story/money/business/development/2025/03/12/elon-musk-xai-supercomputer-in-memphis-water-and-energy-demands/79211055007/). [E&E News](https://www.eenews.net/articles/xai-sidelines-major-water-reuse-project-as-ipo-looms/) reported construction paused in April 2026. A design is not use.
- Amazon campuses. Public Amazon reporting does not itemize site water the way Google’s location table does, so no Amazon number is substituted. See the discussion in [GIJN](https://gijn.org/stories/researching-water-consumption-data-centers/).

Colossus 2 (Tulane Road) does not have its own published daily meter in these sources. The 3.7 million gal/day card is the combined request for the original site and the second site.

## Uncertainty

- Short-prompt rows move only with the energy standard deviation in Jegham et al. Table 4. PUE and WUE are held at the paper’s point values.
- Li et al. Table 1 is a location sweep, not a confidence interval. The poured value is the U.S. average.
- Google and Meta daily numbers inherit whatever rounding is in the annual disclosure, then assume a flat year.
- xAI’s 1.0–1.4 million gal/day band is the spread of public descriptions of the contract, not a statistical interval.
- Altman, Mistral’s 45 mL, and the Post’s 519 mL are used as published point values.
- Comparing a 0.26 mL Gemini prompt with a 519 mL GPT-4 email, or a Google consumption figure with a Meta withdrawal, will mislead if you ignore the badge. The simulator keeps them on one glass so the scale difference is visible, and the plaque says they are different measurements.

Machine-readable copies, including notes and source URLs, live in [`data/figures.json`](data/figures.json). The in-app Sources sheet reads that file.
