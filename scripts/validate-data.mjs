import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../data/figures.json", import.meta.url), "utf8"));

function waterMl(wh, pue, wueSite, wueSource) {
  const kwh = wh / 1000;
  return ((kwh / pue) * wueSite + kwh * wueSource) * 1000;
}

const azure = [1.12, 0.3, 3.142];
const aws = [1.14, 0.18, 3.142];
const deepseek = [1.27, 1.2, 6.016];

const checks = [
  ["gpt-4o-short", 0.421, azure],
  ["claude-37-sonnet-short", 0.836, aws],
  ["claude-37-sonnet-et-short", 3.49, aws],
  ["gpt-4-short", 1.978, azure],
  ["llama-33-70b-short", 0.247, aws],
  ["llama-31-405b-short", 1.991, aws],
  ["o3-short", 7.026, azure],
  ["deepseek-r1-short", 23.815, deepseek],
];

const ids = new Set();
for (const figure of data.figures) {
  if (ids.has(figure.id)) {
    throw new Error(`Duplicate id ${figure.id}`);
  }
  ids.add(figure.id);
  if (!figure.sourceUrl || !figure.published || !figure.notes || !figure.boundary) {
    throw new Error(`Missing citation fields on ${figure.id}`);
  }
  if (figure.evidence === "gap") {
    if (figure.value !== null) {
      throw new Error(`${figure.id} is a gap and should not have a value`);
    }
    continue;
  }
  if (typeof figure.value !== "number" || !(figure.value > 0)) {
    throw new Error(`Bad value on ${figure.id}`);
  }
  if (figure.menu === "model" && figure.unit !== "mL") {
    throw new Error(`${figure.id} should be mL`);
  }
  if (figure.menu === "datacenter" && figure.unit !== "gal/day") {
    throw new Error(`${figure.id} should be gal/day`);
  }
  if (figure.rangeLow != null && figure.rangeHigh != null) {
    if (figure.rangeLow > figure.value || figure.value > figure.rangeHigh + 0.001) {
      throw new Error(`Range does not contain value for ${figure.id}`);
    }
  }
}

for (const [id, wh, multipliers] of checks) {
  const figure = data.figures.find((item) => item.id === id);
  const expected = waterMl(wh, ...multipliers);
  if (!figure || Math.abs(figure.value - expected) > 0.02) {
    throw new Error(`${id} does not match equation (3): expected ${expected}, got ${figure?.value}`);
  }
}

const drop = data.figures.find((item) => item.id === data.meta.dropReferenceId);
if (!drop || Math.abs(drop.value - waterMl(0.421, ...azure)) > 0.02) {
  throw new Error("Drop reference drifted from the GPT-4o derivation");
}

if (data.meta.modelCupMl !== 40 || data.meta.campusCupGalPerDay !== 4000000) {
  throw new Error("Cup capacities changed without a legend update");
}
if (!String(data.meta.dropDefinition).includes("40 mL")) {
  throw new Error("Drop definition must describe the 40 mL model etching");
}

const byId = (id) => data.figures.find((item) => item.id === id);
const cup = data.meta.modelCupMl;
const mustFit = [
  "llama-33-70b-short",
  "gpt-4o-short",
  "claude-37-sonnet-short",
  "gpt-4-short",
  "llama-31-405b-short",
  "claude-37-sonnet-et-short",
  "o3-short",
  "gpt3-li-us-average",
];
for (const id of mustFit) {
  const figure = byId(id);
  if (!figure || !(figure.value < cup)) {
    throw new Error(`${id} should sit inside the ${cup} mL glass`);
  }
}
for (const id of ["mistral-large-2-400", "deepseek-r1-short", "gpt4-email-wapo"]) {
  const figure = byId(id);
  if (!figure || !(figure.value > cup)) {
    throw new Error(`${id} should exceed the ${cup} mL glass`);
  }
}
const gpt4o = byId("gpt-4o-short");
const gpt4 = byId("gpt-4-short");
const o3 = byId("o3-short");
const claude = byId("claude-37-sonnet-short");
if (!gpt4o || !(gpt4o.value / cup < 0.08)) {
  throw new Error("GPT-4o should remain a small fraction of the model glass");
}
if (!claude || !(claude.value > gpt4o.value * 1.5 && claude.value / cup < 0.12)) {
  throw new Error("Claude short prompt should read as a thin fill above one drop");
}
if (!gpt4 || !(gpt4.value / cup > 0.1 && gpt4.value / cup < 0.3)) {
  throw new Error("GPT-4 short prompt should be a low partial fill");
}
if (!o3 || !(o3.value / cup < 0.7 && o3.value / cup > 0.45)) {
  throw new Error("o3 should read as a partial fill of the model glass");
}

const council = data.figures.find((item) => item.id === "google-council-bluffs");
if (!council || council.value !== Math.round(980_100_000 / 365)) {
  throw new Error("Council Bluffs daily figure is not the 2023 annual consumption divided by 365");
}

const altman = data.figures.find((item) => item.id === "chatgpt-altman-average");
const altmanMl = 0.000085 * 3785.411784;
if (!altman || Math.abs(altman.value - altmanMl) > 0.002) {
  throw new Error("Altman gallon conversion drifted");
}

for (const note of data.contextOnly) {
  if (!note.sourceUrl || !note.notes) {
    throw new Error(`Context note ${note.id} is missing a source`);
  }
}

console.log(`Validated ${data.figures.length} figures and ${data.contextOnly.length} context notes.`);
