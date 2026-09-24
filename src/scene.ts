import type { MenuId } from "./types";

export interface PlayRequest {
  menu: MenuId;
  fraction: number;
  dropUnits: number | null;
  overflow: boolean;
}

const POUR_MS = 720;
const RETURN_MS = 560;
const DROP_MS = 540;
const DROP_GAP_MS = 120;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function wait(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
    if (signal.cancelled) {
      resolve();
    }
  });
}

export class WaterScene {
  private readonly root: HTMLElement;
  private readonly cup: HTMLElement;
  private readonly water: HTMLElement;
  private readonly ticks: HTMLElement;
  private readonly spill: HTMLElement;
  private readonly stream: HTMLElement;
  private readonly drops: HTMLElement;
  private fraction = 0;
  private menu: MenuId = "model";
  private pending: PlayRequest | null = null;
  private running = false;
  private generation = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    const cup = root.querySelector<HTMLElement>("#cup");
    const water = root.querySelector<HTMLElement>("#water");
    const ticks = root.querySelector<HTMLElement>("#ticks");
    const spill = root.querySelector<HTMLElement>("#spill");
    const stream = root.querySelector<HTMLElement>("#stream");
    const drops = root.querySelector<HTMLElement>("#drops");
    if (!cup || !water || !ticks || !spill || !stream || !drops) {
      throw new Error("Water scene markup is missing.");
    }
    this.cup = cup;
    this.water = water;
    this.ticks = ticks;
    this.spill = spill;
    this.stream = stream;
    this.drops = drops;
    this.setMenu("model");
    this.applyLevel();
  }

  request(next: PlayRequest): void {
    this.pending = next;
    if (!this.running) {
      void this.pump();
    }
  }

  private async pump(): Promise<void> {
    this.running = true;
    while (this.pending) {
      const next = this.pending;
      this.pending = null;
      const generation = ++this.generation;
      await this.run(next, generation);
    }
    this.running = false;
    this.root.dataset.state = "idle";
  }

  private stale(generation: number): boolean {
    return generation !== this.generation || this.pending !== null;
  }

  private async run(next: PlayRequest, generation: number): Promise<void> {
    this.root.dataset.state = "busy";
    if (prefersReducedMotion()) {
      this.setMenu(next.menu);
      this.fraction = next.fraction;
      this.applyLevel();
      this.root.dataset.state = "idle";
      return;
    }

    if (this.fraction > 0.012) {
      await this.pourOut();
      if (generation !== this.generation) {
        return;
      }
    }

    this.setMenu(next.menu);
    if (next.fraction <= 0) {
      this.fraction = 0;
      this.applyLevel();
      return;
    }

    this.root.dataset.state = "filling";
    if (next.menu === "model" && next.dropUnits != null && next.dropUnits <= 8.5 && !next.overflow) {
      await this.fillByDrops(next, generation);
    } else {
      await this.fillByStream(next, generation);
    }
  }

  private setMenu(menu: MenuId): void {
    this.menu = menu;
    this.root.dataset.menu = menu;
    const marks =
      menu === "model"
        ? [
            { label: "20", top: "6%" },
            { label: "15", top: "28%" },
            { label: "10", top: "50%" },
            { label: "5", top: "72%" },
          ]
        : [
            { label: "4M", top: "6%" },
            { label: "3M", top: "28%" },
            { label: "2M", top: "50%" },
            { label: "1M", top: "72%" },
          ];
    this.ticks.replaceChildren(
      ...marks.map((mark) => {
        const item = document.createElement("li");
        item.style.top = mark.top;
        item.textContent = mark.label;
        return item;
      }),
    );
  }

  private applyLevel(): void {
    for (const animation of this.water.getAnimations()) {
      animation.cancel();
    }
    this.water.style.height = `${this.fraction * 100}%`;
    this.root.dataset.level = this.fraction.toFixed(4);
    this.root.dataset.overflow = "false";
  }

  private async pourOut(): Promise<void> {
    this.root.dataset.state = "pouring";
    this.spill.hidden = false;
    const tilt = this.cup.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(62deg)" }],
      { duration: POUR_MS, easing: "cubic-bezier(.45,.04,.2,1)", fill: "forwards" },
    );
    const drain = this.water.animate(
      [{ height: `${this.fraction * 100}%` }, { height: "0%" }],
      { duration: POUR_MS - 80, delay: 90, easing: "cubic-bezier(.3,.1,.3,1)", fill: "forwards" },
    );
    await Promise.all([tilt.finished, drain.finished]);
    this.fraction = 0;
    this.applyLevel();
    await this.cup.animate(
      [{ transform: "rotate(62deg)" }, { transform: "rotate(0deg)" }],
      { duration: RETURN_MS, easing: "cubic-bezier(.16,.8,.24,1)", fill: "forwards" },
    ).finished;
    for (const animation of this.cup.getAnimations()) {
      animation.cancel();
    }
    this.cup.style.transform = "rotate(0deg)";
    this.spill.hidden = true;
  }

  private async fillByDrops(next: PlayRequest, generation: number): Promise<void> {
    const units = next.dropUnits ?? 1;
    const count = Math.max(1, Math.round(units));
    const tiny = units < 0.75;
    const step = next.fraction / count;
    for (let index = 0; index < count; index += 1) {
      if (this.stale(generation)) {
        return;
      }
      await this.spawnDrop(tiny);
      if (this.stale(generation)) {
        return;
      }
      this.fraction = Math.min(next.fraction, this.fraction + step);
      this.water.animate(
        [
          { height: `${Math.max(0, this.fraction - step) * 100}%` },
          { height: `${this.fraction * 100}%` },
        ],
        { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
      );
      this.root.dataset.level = this.fraction.toFixed(4);
      if (index < count - 1) {
        await wait(DROP_GAP_MS, { cancelled: false });
      }
    }
    this.applyLevel();
  }

  private spawnDrop(tiny: boolean): Promise<void> {
    const drop = document.createElement("span");
    drop.className = tiny ? "drop tiny" : "drop";
    this.drops.append(drop);
    const scale = tiny ? 0.62 : 1;
    const fall = drop.animate(
      [
        { transform: `translateY(0) scale(${scale})`, opacity: 0 },
        { transform: `translateY(16px) scale(${scale})`, opacity: 1, offset: 0.14 },
        { transform: `translateY(168px) scale(${scale * 0.9})`, opacity: 1 },
      ],
      { duration: DROP_MS, easing: "cubic-bezier(.35,.05,.75,1)", fill: "forwards" },
    );
    return fall.finished.then(() => {
      drop.remove();
    });
  }

  private async fillByStream(next: PlayRequest, generation: number): Promise<void> {
    const duration = next.menu === "datacenter" ? 900 + next.fraction * 700 : 1100;
    this.stream.hidden = false;
    this.stream.classList.add("on");
    const rise = this.water.animate(
      [{ height: "0%" }, { height: `${next.fraction * 100}%` }],
      { duration, easing: "cubic-bezier(.2,.6,.2,1)", fill: "forwards" },
    );
    await rise.finished;
    if (generation !== this.generation) {
      this.stream.classList.remove("on");
      this.stream.hidden = true;
      return;
    }
    this.fraction = next.fraction;
    this.applyLevel();
    if (next.overflow) {
      this.root.dataset.overflow = "true";
      await wait(900, { cancelled: false });
    }
    this.stream.classList.remove("on");
    this.stream.hidden = true;
    if (this.stale(generation)) {
      return;
    }
  }
}
