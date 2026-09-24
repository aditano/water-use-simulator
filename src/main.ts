import catalog from "../data/figures.json";
import { dropUnits, evidenceLabel, fillFraction, formatAmount, formatRange, legendFor } from "./format";
import { WaterScene } from "./scene";
import type { Catalog, Figure, MenuId } from "./types";

const data = catalog as Catalog;

const dropReference = data.figures.find((figure) => figure.id === data.meta.dropReferenceId);
if (!dropReference || dropReference.value == null) {
  throw new Error("Drop reference figure is missing.");
}
const dropMl = dropReference.value;

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Missing ${selector}`);
  }
  return node;
}

const sceneRoot = required<HTMLElement>("#scene");
const picker = required<HTMLElement>("#picker");
const plaque = required<HTMLElement>("#plaque");
const legend = required<HTMLElement>("#legend");
const sourcesBody = required<HTMLElement>("#sources-body");
const dialog = required<HTMLDialogElement>("#sources");
const tabModel = required<HTMLButtonElement>("#tab-model");
const tabCampus = required<HTMLButtonElement>("#tab-datacenter");

const scene = new WaterScene(sceneRoot);
let menu: MenuId = "model";
let selectedId = "gpt-4o-short";

function capacity(current: MenuId): number {
  return current === "model" ? data.meta.modelCupMl : data.meta.campusCupGalPerDay;
}

function figuresFor(current: MenuId): Figure[] {
  return data.figures.filter((figure) => figure.interactive && figure.menu === current);
}

function selectedFigure(): Figure {
  const figure = data.figures.find((item) => item.id === selectedId);
  if (!figure) {
    throw new Error(`Unknown figure ${selectedId}`);
  }
  return figure;
}

function renderLegend(): void {
  legend.textContent = legendFor(menu, dropMl);
}

function renderPlaque(figure: Figure): void {
  const range = formatRange(figure);
  const parts = figure.onsiteMl != null && figure.offsiteMl != null
    ? `${figure.onsiteMl.toFixed(2)} mL on-site + ${figure.offsiteMl.toFixed(2)} mL off-site`
    : null;
  const campusLink = figure.id === "grok-per-query-gap"
    ? `<button type="button" class="text-btn" id="show-campus">Show Colossus &amp; Colossus 2</button>`
    : "";
  plaque.innerHTML = `
    <p class="badge badge-${figure.evidence}">${evidenceLabel(figure.evidence)}</p>
    <h2>${figure.name}</h2>
    <p class="sub">${figure.subtitle}</p>
    <p class="value">${formatAmount(figure.value, figure.unit)}</p>
    ${range ? `<p class="range">Reported range ${range}</p>` : `<p class="range">No published uncertainty band</p>`}
    ${parts ? `<p class="split">${parts}</p>` : ""}
    <p class="boundary">${figure.boundary}</p>
    ${campusLink}
  `;
  plaque.querySelector("#show-campus")?.addEventListener("click", () => {
    choose("datacenter", "xai-combined-request");
  });
}

function renderPicker(): void {
  const figures = figuresFor(menu);
  const groupOrder = menu === "model"
    ? ["Same short prompt", "Published figures"]
    : ["xAI Memphis", "Google campuses", "Meta", "Microsoft"];
  picker.replaceChildren();
  for (const group of groupOrder) {
    const inGroup = figures
      .filter((item) => item.group === group)
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    if (inGroup.length === 0) {
      continue;
    }
    const heading = document.createElement("h3");
    heading.textContent = group;
    picker.append(heading);
    for (const figure of inGroup) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row";
      button.setAttribute("role", "option");
      button.dataset.id = figure.id;
      button.setAttribute("aria-selected", figure.id === selectedId ? "true" : "false");
      const amount = document.createElement("span");
      amount.className = "row-amount";
      amount.textContent = figure.value == null ? "—" : formatAmount(figure.value, figure.unit);
      button.innerHTML = `<span class="row-copy"><span class="row-name"></span><span class="row-sub"></span></span>`;
      const name = button.querySelector(".row-name");
      const sub = button.querySelector(".row-sub");
      if (name) {
        name.textContent = figure.name;
      }
      if (sub) {
        sub.textContent = figure.subtitle;
      }
      button.append(amount);
      button.addEventListener("click", () => {
        choose(menu, figure.id);
      });
      picker.append(button);
    }
  }
}

function renderSources(): void {
  const blocks = data.figures.map((figure) => sourceCard(figure.name, figure.subtitle, figure.evidence, formatAmount(figure.value, figure.unit), figure.published, figure.sourceTitle, figure.sourceUrl, figure.notes, figure.assumptions));
  const extra = data.contextOnly.map((note) => sourceCard(note.name, "Not poured into the glass", note.evidence, note.value == null ? "No figure" : formatAmount(note.value, note.unit), note.published, note.sourceTitle, note.sourceUrl, note.notes));
  sourcesBody.replaceChildren();
  const intro = document.createElement("p");
  intro.className = "sources-intro";
  intro.textContent = `Figures checked ${data.meta.researched}. ${data.meta.dropDefinition} Estimates stay estimates. A contract peak is not a meter.`;
  sourcesBody.append(intro);
  for (const node of [...blocks, ...extra]) {
    sourcesBody.append(node);
  }
}

function sourceCard(
  name: string,
  subtitle: string,
  evidence: Figure["evidence"],
  amount: string,
  published: string,
  sourceTitle: string,
  sourceUrl: string,
  notes: string,
  assumptions?: string,
): HTMLElement {
  const article = document.createElement("article");
  article.className = "source-card";
  const title = document.createElement("h3");
  title.textContent = name;
  const meta = document.createElement("p");
  meta.className = "source-meta";
  meta.textContent = `${subtitle} · ${evidenceLabel(evidence)} · ${amount} · ${published}`;
  const link = document.createElement("a");
  link.href = sourceUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = sourceTitle;
  const body = document.createElement("p");
  body.textContent = notes;
  article.append(title, meta, link, body);
  if (assumptions) {
    const extra = document.createElement("p");
    extra.className = "assumptions";
    extra.textContent = assumptions;
    article.append(extra);
  }
  return article;
}

function setTabs(): void {
  tabModel.setAttribute("aria-selected", menu === "model" ? "true" : "false");
  tabCampus.setAttribute("aria-selected", menu === "datacenter" ? "true" : "false");
}

function choose(nextMenu: MenuId, id: string): void {
  menu = nextMenu;
  selectedId = id;
  setTabs();
  renderLegend();
  renderPicker();
  const figure = selectedFigure();
  renderPlaque(figure);
  const fraction = fillFraction(figure.value, capacity(menu));
  const units = menu === "model" ? dropUnits(figure.value, dropMl) : null;
  const overflow = figure.value != null && figure.value > capacity(menu);
  scene.request({
    menu,
    fraction,
    dropUnits: units,
    overflow,
  });
}

tabModel.addEventListener("click", () => {
  if (menu === "model") {
    return;
  }
  choose("model", "gpt-4o-short");
});

tabCampus.addEventListener("click", () => {
  if (menu === "datacenter") {
    return;
  }
  choose("datacenter", "xai-combined-request");
});

document.querySelector("#open-sources")?.addEventListener("click", () => {
  dialog.showModal();
});
document.querySelector("#close-sources")?.addEventListener("click", () => {
  dialog.close();
});

renderSources();
choose("model", "gpt-4o-short");

document.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const figures = figuresFor(menu);
  const index = figures.findIndex((figure) => figure.id === selectedId);
  if (index < 0) {
    return;
  }
  const delta = event.key === "ArrowDown" ? 1 : -1;
  const next = figures[index + delta];
  if (!next) {
    return;
  }
  event.preventDefault();
  choose(menu, next.id);
});
