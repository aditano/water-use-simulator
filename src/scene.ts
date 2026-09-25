import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MenuId } from "./types";
import { etchMarks } from "./format";
import {
  TUMBLER,
  heightForVolumeFraction,
  pourPlan,
  radiusAtHeight,
  smoothstep,
  type PourPlan,
} from "./scale";

export interface PlayRequest {
  menu: MenuId;
  fraction: number;
  capacity: number;
  value: number | null;
  dropUnits: number | null;
  overflow: boolean;
}

interface SceneOptions {
  dropMl: number;
  modelCapacity: number;
}

interface Drop {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  alive: boolean;
  fromSpout: boolean;
  killY: number;
  radius: number;
}

type Phase =
  | { name: "idle" }
  | { name: "tip"; start: number; fromLevel: number }
  | { name: "untilt"; start: number; next: PlayRequest | null }
  | {
      name: "drops";
      start: number;
      next: PlayRequest;
      index: number;
      count: number;
      stage: "fall" | "gap";
      tiny: boolean;
      fallMs: number;
      gapMs: number;
      spawned: boolean;
    }
  | { name: "stream"; start: number; next: PlayRequest; duration: number; spillMs: number }
  | { name: "spill"; start: number; next: PlayRequest; duration: number };

const TIP_MS = 1100;
const UNTILT_MS = 820;
const TIP_ANGLE = 1.02;
const GRAVITY = 0.9;
const MARK_ANGLE = 0.85;

export class WaterScene {
  private readonly root: HTMLElement;
  private readonly dropMl: number;
  private readonly ok: boolean;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private glass: THREE.Group | null = null;
  private water: THREE.Mesh | null = null;
  private meniscus: THREE.Mesh | null = null;
  private ticks: THREE.Group | null = null;
  private tickMaterial: THREE.MeshStandardMaterial | null = null;
  private spout: THREE.Object3D | null = null;
  private lip: THREE.Object3D | null = null;
  private stream: THREE.Mesh | null = null;
  private puddle: THREE.Mesh | null = null;
  private caustic: THREE.Mesh | null = null;
  private drops: Drop[] = [];
  private beadMaterial: THREE.MeshStandardMaterial | null = null;
  private streamDropMaterial: THREE.MeshStandardMaterial | null = null;
  private phase: Phase = { name: "idle" };
  private pending: PlayRequest | null = null;
  private level = 0;
  private levelTarget = 0;
  private settledOverflow = false;
  private puddleOpacity = 0;
  private puddleTarget = 0;
  private splash = 0;
  private lastTime = 0;
  private lastSpawn = 0;
  private waterGeoHeight = -1;
  private marksKey = "";
  private menu: MenuId = "model";
  private mobile = false;
  private framed = false;
  private rendered = false;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly axisX = new THREE.Vector3(1, 0, 0);

  constructor(root: HTMLElement, options: SceneOptions) {
    this.root = root;
    this.dropMl = options.dropMl;
    const renderer = this.createRenderer();
    this.ok = renderer != null;
    if (!renderer) {
      return;
    }
    this.renderer = renderer;
    this.build(renderer);
    this.showMarks("model", options.modelCapacity);
    renderer.setAnimationLoop(this.frame);
  }

  request(next: PlayRequest): void {
    if (!this.ok) {
      return;
    }
    if (this.reducedMotion()) {
      this.pending = null;
      this.applyInstant(next);
      return;
    }
    this.pending = next;
    const name = this.phase.name;
    if (name === "drops" || name === "stream" || name === "spill") {
      this.beginTip(Math.max(this.level, this.levelTarget), performance.now());
      return;
    }
    if (name === "idle") {
      this.startPending(performance.now());
    }
  }

  private createRenderer(): THREE.WebGLRenderer | null {
    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      if (!renderer.getContext()) {
        renderer.dispose();
        this.fail("WebGL is unavailable, so the 3D glass can’t be shown.");
        return null;
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setClearColor(0x090b10, 1);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.localClippingEnabled = true;
      return renderer;
    } catch {
      this.fail("WebGL is unavailable, so the 3D glass can’t be shown.");
      return null;
    }
  }

  private fail(message: string): void {
    this.root.dataset.ready = "error";
    this.root.textContent = message;
  }

  private build(renderer: THREE.WebGLRenderer): void {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b10);
    scene.environment = studioEnvironment(renderer);
    scene.environmentIntensity = 0.92;
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.04, 40);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.7;
    controls.minPolarAngle = 0.42;
    controls.maxPolarAngle = 1.22;
    controls.target.set(0, 0.14, -0.02);
    this.controls = controls;

    this.addLights(scene);
    this.addRoom(scene, renderer);
    this.addProduct(scene);
    this.addDroplets(scene);
    this.root.append(renderer.domElement);

    const observer = new ResizeObserver(() => {
      this.resize();
    });
    observer.observe(this.root);
    this.resize();
    scene.updateMatrixWorld(true);
  }

  private addLights(scene: THREE.Scene): void {
    scene.add(new THREE.HemisphereLight(0xc5d4e6, 0x2a241c, 0.42));
    const key = new THREE.SpotLight(0xfff3e4, 90, 5.5, 0.48, 0.78, 1.2);
    key.position.set(1.15, 1.85, 0.95);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00018;
    key.shadow.normalBias = 0.025;
    key.target.position.set(0, 0.12, -0.02);
    scene.add(key, key.target);

    const fill = new THREE.DirectionalLight(0xd5e4ff, 0.85);
    fill.position.set(-0.9, 0.7, 1.15);
    scene.add(fill);

    const rim = new THREE.SpotLight(0xd7ecff, 36, 4.2, 0.7, 0.9, 1);
    rim.position.set(-1.15, 1.25, -0.85);
    rim.target.position.set(0, 0.14, 0);
    scene.add(rim, rim.target);
  }

  private addRoom(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const tiles = tileTexture();
    tiles.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 72),
      new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(6.4, 6.4, 4.8, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 1, metalness: 0, side: THREE.BackSide }),
    );
    wall.position.y = 2.15;
    scene.add(wall);

    const contact = softDisc(0.42);
    contact.position.y = 0.003;
    contact.scale.set(0.42, 0.34, 1);
    scene.add(contact);
  }

  private addProduct(scene: THREE.Scene): void {
    const product = new THREE.Group();
    scene.add(product);

    const porcelain = new THREE.MeshPhysicalMaterial({
      color: 0xf4f1ea,
      roughness: 0.38,
      metalness: 0.02,
      clearcoat: 0.45,
      clearcoatRoughness: 0.38,
    });
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile(), 72), porcelain);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    product.add(bowl);

    const chrome = new THREE.MeshPhysicalMaterial({
      color: 0xf4f5f7,
      metalness: 1,
      roughness: 0.16,
      clearcoat: 0.25,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.4,
    });
    product.add(this.buildFaucet(chrome));
    product.add(this.buildDrain(chrome));

    const glass = new THREE.Group();
    glass.position.set(0, 0.047, -0.02);
    product.add(glass);
    this.glass = glass;

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7fbff,
      metalness: 0,
      roughness: 0.035,
      transmission: 1,
      thickness: 0.06,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      attenuationColor: new THREE.Color("#e5f3ee"),
      attenuationDistance: 0.4,
      envMapIntensity: 1,
      transparent: true,
    });
    const shell = new THREE.Mesh(new THREE.LatheGeometry(glassProfile(), 72), glassMat);
    shell.renderOrder = 1;
    glass.add(shell);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x1f78d2,
      metalness: 0,
      roughness: 0.05,
      transmission: 0.42,
      thickness: 0.18,
      ior: 1.333,
      attenuationColor: new THREE.Color("#083e86"),
      attenuationDistance: 0.055,
      transparent: true,
      envMapIntensity: 0.8,
    });
    waterMat.polygonOffset = true;
    waterMat.polygonOffsetFactor = -2;
    waterMat.polygonOffsetUnits = -2;
    const water = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
    water.visible = false;
    water.renderOrder = 2;
    glass.add(water);
    this.water = water;

    const meniscus = new THREE.Mesh(
      new THREE.CircleGeometry(1, 56),
      new THREE.MeshStandardMaterial({
        color: 0xd7efff,
        roughness: 0.08,
        metalness: 0.14,
        transparent: true,
        opacity: 0.94,
      }),
    );
    meniscus.rotation.x = -Math.PI / 2;
    meniscus.visible = false;
    meniscus.renderOrder = 3;
    glass.add(meniscus);
    this.meniscus = meniscus;

    const ticks = new THREE.Group();
    glass.add(ticks);
    this.ticks = ticks;
    this.tickMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7f7f5,
      roughness: 0.4,
      metalness: 0,
      emissive: 0x222222,
    });

    const lip = new THREE.Object3D();
    lip.position.set(
      0,
      TUMBLER.innerBottomY + TUMBLER.innerHeight + 0.004,
      TUMBLER.topRadius + 0.012,
    );
    glass.add(lip);
    this.lip = lip;

    const caustic = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({
        map: causticTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }),
    );
    caustic.rotation.x = -Math.PI / 2;
    caustic.position.set(0, 0.049, -0.02);
    caustic.scale.set(0.055, 0.05, 1);
    product.add(caustic);
    this.caustic = caustic;

    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({
        map: puddleTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0, 0.0505, 0.09);
    puddle.scale.set(0.07, 0.05, 1);
    puddle.visible = false;
    product.add(puddle);
    this.puddle = puddle;

    const footShadow = softDisc(0.5);
    footShadow.position.set(0, 0.0482, -0.02);
    footShadow.scale.set(0.055, 0.05, 1);
    product.add(footShadow);
  }

  private buildFaucet(chrome: THREE.Material): THREE.Group {
    const faucet = new THREE.Group();
    const points = [
      new THREE.Vector3(0, 0.098, -0.2),
      new THREE.Vector3(0, 0.18, -0.2),
      new THREE.Vector3(0, 0.26, -0.12),
      new THREE.Vector3(0, 0.305, -0.02),
      new THREE.Vector3(0, 0.255, -0.02),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.45);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.011, 24, false), chrome);
    neck.castShadow = true;
    faucet.add(neck);

    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.012, 28), chrome);
    flange.position.set(0, 0.1, -0.2);
    flange.castShadow = true;
    faucet.add(flange);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 12, 28), chrome);
    collar.position.set(0, 0.2, -0.2);
    collar.rotation.x = Math.PI / 2;
    faucet.add(collar);

    const aerator = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.0135, 0.02, 24), chrome);
    aerator.position.set(0, 0.246, -0.02);
    aerator.castShadow = true;
    faucet.add(aerator);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.052, 14), chrome);
    handle.position.set(0.03, 0.15, -0.2);
    handle.rotation.z = -1.05;
    handle.castShadow = true;
    faucet.add(handle);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 18, 14), chrome);
    knob.position.set(0.052, 0.168, -0.2);
    faucet.add(knob);

    const spout = new THREE.Object3D();
    spout.position.set(0, 0.234, -0.02);
    faucet.add(spout);
    this.spout = spout;

    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0034, 0.0044, 1, 18, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xb7e2ff,
        transmission: 0.55,
        roughness: 0.08,
        thickness: 0.02,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    stream.visible = false;
    stream.frustumCulled = false;
    stream.renderOrder = 4;
    this.scene?.add(stream);
    this.stream = stream;
    return faucet;
  }

  private buildDrain(chrome: THREE.Material): THREE.Group {
    const drain = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0036, 12, 28), chrome);
    ring.rotation.x = Math.PI / 2;
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 24),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.45, metalness: 0.4 }),
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = -0.001;
    const slotH = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0022, 0.0024), chrome);
    const slotV = new THREE.Mesh(new THREE.BoxGeometry(0.0024, 0.0022, 0.018), chrome);
    slotH.position.y = 0.0015;
    slotV.position.y = 0.0015;
    drain.add(ring, hole, slotH, slotV);
    drain.position.set(0, 0.0495, 0.1);
    return drain;
  }

  private addDroplets(scene: THREE.Scene): void {
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    this.beadMaterial = new THREE.MeshStandardMaterial({
      color: 0x49a6e6,
      roughness: 0.14,
      metalness: 0.08,
    });
    this.streamDropMaterial = new THREE.MeshStandardMaterial({
      color: 0xc6e8ff,
      roughness: 0.18,
      metalness: 0.04,
    });
    for (let i = 0; i < 56; i += 1) {
      const mesh = new THREE.Mesh(geometry, this.beadMaterial);
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      this.drops.push({
        mesh,
        vel: new THREE.Vector3(),
        alive: false,
        fromSpout: true,
        killY: 0,
        radius: 0.004,
      });
    }
  }

  private frame = (time: number): void => {
    if (!this.scene || !this.camera || !this.renderer || !this.controls) {
      return;
    }
    const dt = this.lastTime === 0 ? 0.016 : Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.scene.updateMatrixWorld(true);
    this.updatePhase(time);
    this.easeLevel(dt);
    this.updateWater(time);
    this.scene.updateMatrixWorld(true);
    this.updateStream();
    this.updateDroplets(dt);
    this.updatePuddle(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.syncDom();
    if (!this.rendered) {
      this.rendered = true;
      this.root.dataset.ready = "true";
    }
  };

  private updatePhase(time: number): void {
    const phase = this.phase;
    switch (phase.name) {
      case "idle":
        if (this.pending) {
          this.startPending(time);
        }
        break;
      case "tip": {
        const t = Math.min(1, (time - phase.start) / TIP_MS);
        const tilt = smoothstep(t);
        if (this.glass) {
          this.glass.rotation.x = tilt * TIP_ANGLE;
        }
        const drainT = smoothstep(Math.min(1, Math.max(0, (t - 0.2) / 0.8)));
        this.levelTarget = phase.fromLevel * (1 - drainT);
        if (drainT > 0.08) {
          this.spawnOften(time, 48, "spill");
        }
        if (t >= 1) {
          this.level = 0;
          this.levelTarget = 0;
          this.phase = { name: "untilt", start: time, next: this.pending };
          this.pending = null;
        }
        break;
      }
      case "untilt": {
        const t = Math.min(1, (time - phase.start) / UNTILT_MS);
        if (this.glass) {
          this.glass.rotation.x = TIP_ANGLE * (1 - smoothstep(t));
        }
        if (t >= 1 && this.glass) {
          this.glass.rotation.x = 0;
          const next = this.pending ?? phase.next;
          this.pending = null;
          if (next) {
            this.beginFill(next, time);
          } else {
            this.phase = { name: "idle" };
          }
        }
        break;
      }
      case "drops":
        this.updateDropsPhase(phase, time);
        break;
      case "stream": {
        const t = (time - phase.start) / phase.duration;
        if (t < 1) {
          this.levelTarget = phase.next.fraction * smoothstep(Math.max(0, t));
          this.spawnOften(time, 40, "stream");
        } else {
          this.levelTarget = phase.next.fraction;
          this.level = phase.next.fraction;
          if (phase.spillMs > 0) {
            this.puddleTarget = 0.72;
            this.phase = { name: "spill", start: time, next: phase.next, duration: phase.spillMs };
          } else {
            this.settledOverflow = false;
            this.phase = { name: "idle" };
          }
        }
        break;
      }
      case "spill":
        this.levelTarget = 1;
        this.spawnOften(time, 58, "spill");
        if (time - phase.start >= phase.duration) {
          this.settledOverflow = true;
          this.phase = { name: "idle" };
        }
        break;
      default: {
        const unreachable: never = phase;
        throw new Error(`Unhandled phase ${String(unreachable)}`);
      }
    }
    if (this.stream) {
      this.stream.visible = this.phase.name === "stream";
    }
  }

  private updateDropsPhase(phase: Extract<Phase, { name: "drops" }>, time: number): void {
    const elapsed = time - phase.start;
    if (phase.stage === "fall") {
      if (!phase.spawned) {
        this.spawnDrop(phase.tiny ? "bead-tiny" : "bead");
        phase.spawned = true;
      }
      if (elapsed >= phase.fallMs) {
        const step = phase.next.fraction / phase.count;
        this.levelTarget = Math.min(phase.next.fraction, step * (phase.index + 1));
        this.splash = 1;
        if (phase.index + 1 >= phase.count) {
          this.settledOverflow = phase.next.overflow;
          this.phase = { name: "idle" };
        } else {
          phase.stage = "gap";
          phase.start = time;
          phase.spawned = false;
        }
      }
      return;
    }
    if (elapsed >= phase.gapMs) {
      phase.index += 1;
      phase.stage = "fall";
      phase.start = time;
    }
  }

  private startPending(time: number): void {
    const next = this.pending;
    if (!next) {
      return;
    }
    if (this.level > 0.008 || this.levelTarget > 0.008) {
      this.beginTip(Math.max(this.level, this.levelTarget), time);
      return;
    }
    this.pending = null;
    this.beginFill(next, time);
  }

  private beginTip(fromLevel: number, time: number): void {
    this.puddleTarget = 0;
    this.settledOverflow = false;
    this.phase = { name: "tip", start: time, fromLevel };
  }

  private beginFill(next: PlayRequest, time: number): void {
    this.showMarks(next.menu, next.capacity);
    this.settledOverflow = false;
    this.level = 0;
    this.levelTarget = 0;
    const plan: PourPlan = pourPlan(next);
    switch (plan.kind) {
      case "empty":
        this.phase = { name: "idle" };
        break;
      case "drops":
        this.phase = {
          name: "drops",
          start: time,
          next,
          index: 0,
          count: plan.count,
          stage: "fall",
          tiny: plan.tiny,
          fallMs: plan.fallMs,
          gapMs: plan.gapMs,
          spawned: false,
        };
        break;
      case "stream":
        this.phase = {
          name: "stream",
          start: time,
          next,
          duration: plan.durationMs,
          spillMs: plan.spillMs,
        };
        break;
      default: {
        const unreachable: never = plan;
        throw new Error(`Unhandled pour ${String(unreachable)}`);
      }
    }
  }

  private applyInstant(next: PlayRequest): void {
    if (this.glass) {
      this.glass.rotation.x = 0;
    }
    this.level = next.fraction;
    this.levelTarget = next.fraction;
    this.settledOverflow = next.overflow;
    this.puddleTarget = next.overflow ? 0.6 : 0;
    this.puddleOpacity = this.puddleTarget;
    this.phase = { name: "idle" };
    this.showMarks(next.menu, next.capacity);
    this.killDrops();
    if (this.stream) {
      this.stream.visible = false;
    }
  }

  private easeLevel(dt: number): void {
    if (this.phase.name === "stream" || this.phase.name === "spill") {
      this.level = this.levelTarget;
      return;
    }
    const k = 1 - Math.exp(-dt * 14);
    this.level += (this.levelTarget - this.level) * k;
    if (Math.abs(this.level - this.levelTarget) < 0.0004) {
      this.level = this.levelTarget;
    }
  }

  private updateWater(time: number): void {
    if (!this.water || !this.meniscus) {
      return;
    }
    const height = heightForVolumeFraction(this.level);
    if (height < 0.0012) {
      this.water.visible = false;
      this.meniscus.visible = false;
      this.setCaustic(0);
      return;
    }
    const surfaceY = Math.min(
      TUMBLER.innerBottomY + height,
      TUMBLER.innerBottomY + TUMBLER.innerHeight - 0.0015,
    );
    this.water.visible = true;
    this.meniscus.visible = true;
    if (Math.abs(height - this.waterGeoHeight) > 0.00025) {
      this.rebuildWater(surfaceY);
      this.waterGeoHeight = height;
    }
    const radius = Math.max(0.006, radiusAtHeight(surfaceY) - 0.0022);
    this.splash = Math.max(0, this.splash - 0.016 * 2.4);
    const idleWave = this.phase.name === "idle" ? Math.sin(time * 0.0022) * 0.012 : 0;
    const pulse = 1 + this.splash * 0.07 + idleWave;
    this.meniscus.position.y = surfaceY + 0.0005;
    this.meniscus.scale.set(radius * pulse, radius * pulse, 1);
    this.setCaustic(this.level);
  }

  private rebuildWater(surfaceY: number): void {
    if (!this.water) {
      return;
    }
    const y0 = TUMBLER.innerBottomY + 0.0012;
    const top = Math.max(y0 + 0.0016, surfaceY);
    const steps = 8;
    const points = [new THREE.Vector2(0.001, y0)];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const y = y0 + (top - y0) * t;
      points.push(new THREE.Vector2(Math.max(0.004, radiusAtHeight(y) - 0.0018), y));
    }
    const geometry = new THREE.LatheGeometry(points, 48);
    this.water.geometry.dispose();
    this.water.geometry = geometry;
  }

  private setCaustic(level: number): void {
    const material = this.caustic?.material;
    if (material instanceof THREE.MeshBasicMaterial) {
      material.opacity = level * 0.28;
    }
  }

  private updateStream(): void {
    if (!this.stream || !this.stream.visible || !this.spout || !this.meniscus) {
      return;
    }
    this.spout.getWorldPosition(this.tmpA);
    this.meniscus.getWorldPosition(this.tmpB);
    if (!this.meniscus.visible && this.glass) {
      this.glass.localToWorld(this.tmpB.set(0, TUMBLER.innerBottomY + 0.002, 0));
    }
    this.tmpB.y = Math.min(this.tmpB.y + 0.003, this.tmpA.y - 0.02);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const length = Math.max(0.02, this.tmpDir.length());
    this.tmpDir.multiplyScalar(1 / length);
    this.stream.position.copy(this.tmpA).addScaledVector(this.tmpDir, length / 2);
    if (this.tmpDir.dot(this.up) < -0.999) {
      this.stream.quaternion.setFromAxisAngle(this.axisX, Math.PI);
    } else {
      this.stream.quaternion.setFromUnitVectors(this.up, this.tmpDir);
    }
    const goal = this.phase.name === "stream" ? this.phase.next.fraction : this.level;
    const thickness = 0.62 + goal * 0.7;
    this.stream.scale.set(thickness, length, thickness);
  }

  private updateDroplets(dt: number): void {
    for (const drop of this.drops) {
      if (!drop.alive) {
        continue;
      }
      drop.vel.y -= GRAVITY * dt;
      drop.mesh.position.addScaledVector(drop.vel, dt);
      const stretch = 1 + Math.min(1.4, Math.abs(drop.vel.y) * 0.9);
      drop.mesh.scale.set(drop.radius, drop.radius * stretch, drop.radius);
      const floorHit = drop.mesh.position.y <= (drop.fromSpout ? this.surfaceWorldY() + 0.003 : drop.killY);
      if (floorHit || drop.mesh.position.y < -0.05) {
        drop.alive = false;
        drop.mesh.visible = false;
      }
    }
  }

  private updatePuddle(dt: number): void {
    if (!this.puddle) {
      return;
    }
    const k = 1 - Math.exp(-dt * 2.4);
    this.puddleOpacity += (this.puddleTarget - this.puddleOpacity) * k;
    const material = this.puddle.material;
    if (material instanceof THREE.MeshBasicMaterial) {
      material.opacity = this.puddleOpacity;
    }
    this.puddle.visible = this.puddleOpacity > 0.03;
  }

  private surfaceWorldY(): number {
    if (!this.meniscus || !this.glass) {
      return 0.05;
    }
    if (this.meniscus.visible) {
      this.meniscus.getWorldPosition(this.tmpB);
      return this.tmpB.y;
    }
    this.glass.localToWorld(this.tmpB.set(0, TUMBLER.innerBottomY + 0.002, 0));
    return this.tmpB.y;
  }

  private spawnOften(time: number, interval: number, kind: "stream" | "spill"): void {
    if (time - this.lastSpawn < interval) {
      return;
    }
    this.lastSpawn = time;
    this.spawnDrop(kind);
  }

  private spawnDrop(kind: "bead" | "bead-tiny" | "stream" | "spill"): void {
    const origin = kind === "spill" ? this.lip : this.spout;
    if (!origin) {
      return;
    }
    const drop = this.drops.find((item) => !item.alive) ?? this.drops[0];
    origin.getWorldPosition(drop.mesh.position);
    drop.fromSpout = kind !== "spill";
    if (kind === "spill") {
      drop.vel.set((Math.random() - 0.5) * 0.03, -0.05 - Math.random() * 0.03, 0.07 + Math.random() * 0.05);
      drop.killY = 0.055;
      drop.radius = 0.0042;
    } else if (kind === "bead-tiny") {
      drop.vel.set((Math.random() - 0.5) * 0.008, -0.02, (Math.random() - 0.5) * 0.008);
      drop.killY = 0;
      drop.radius = 0.0031;
    } else if (kind === "bead") {
      drop.vel.set((Math.random() - 0.5) * 0.01, -0.025, (Math.random() - 0.5) * 0.01);
      drop.killY = 0;
      drop.radius = 0.0051;
    } else {
      drop.vel.set((Math.random() - 0.5) * 0.014, -0.2 - Math.random() * 0.08, (Math.random() - 0.5) * 0.014);
      drop.killY = 0;
      drop.radius = 0.0035;
    }
    const material = kind === "bead" || kind === "bead-tiny" ? this.beadMaterial : this.streamDropMaterial;
    if (material) {
      drop.mesh.material = material;
    }
    drop.mesh.scale.setScalar(drop.radius);
    drop.alive = true;
    drop.mesh.visible = true;
  }

  private killDrops(): void {
    for (const drop of this.drops) {
      drop.alive = false;
      drop.mesh.visible = false;
    }
  }

  private showMarks(menu: MenuId, capacity: number): void {
    const key = `${menu}:${capacity}:${this.dropMl}`;
    if (key === this.marksKey || !this.ticks || !this.tickMaterial) {
      this.menu = menu;
      return;
    }
    this.marksKey = key;
    this.menu = menu;
    this.clearTicks();
    for (const mark of etchMarks(menu, capacity, this.dropMl)) {
      const y = TUMBLER.innerBottomY + heightForVolumeFraction(mark.fraction);
      const radius = radiusAtHeight(y);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0011, 0.0011), this.tickMaterial);
      line.position.set(
        Math.sin(MARK_ANGLE) * (radius + 0.008),
        y,
        Math.cos(MARK_ANGLE) * (radius + 0.008),
      );
      line.rotation.y = -MARK_ANGLE;
      const label = makeLabel(mark.label);
      label.position.set(
        Math.sin(MARK_ANGLE) * (radius + 0.034),
        y,
        Math.cos(MARK_ANGLE) * (radius + 0.034),
      );
      this.ticks.add(line, label);
    }
  }

  private clearTicks(): void {
    if (!this.ticks) {
      return;
    }
    while (this.ticks.children.length > 0) {
      const child = this.ticks.children[0];
      this.ticks.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
      if (child instanceof THREE.Sprite) {
        const material = child.material;
        if (material instanceof THREE.SpriteMaterial) {
          material.map?.dispose();
          material.dispose();
        }
      }
    }
  }

  private resize(): void {
    if (!this.renderer || !this.camera || !this.controls) {
      return;
    }
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    if (width < 2 || height < 2) {
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    const mobile = window.innerWidth < 900;
    if (!this.framed || mobile !== this.mobile) {
      this.mobile = mobile;
      this.framed = true;
      this.placeCamera(mobile);
    }
    this.camera.aspect = width / height;
    this.applyViewOffset(width, height, mobile);
    this.camera.updateProjectionMatrix();
  }

  private placeCamera(mobile: boolean): void {
    if (!this.camera || !this.controls) {
      return;
    }
    if (mobile) {
      this.camera.fov = 32;
      this.camera.position.set(0.22, 0.46, 0.78);
      this.controls.target.set(0, 0.17, -0.02);
      this.controls.minDistance = 0.4;
      this.controls.maxDistance = 1.45;
    } else {
      this.camera.fov = 28;
      this.camera.position.set(0.46, 0.38, 0.74);
      this.controls.target.set(0, 0.145, -0.02);
      this.controls.minDistance = 0.46;
      this.controls.maxDistance = 1.75;
    }
    this.controls.update();
  }

  private applyViewOffset(width: number, height: number, mobile: boolean): void {
    if (!this.camera) {
      return;
    }
    if (mobile) {
      this.camera.setViewOffset(width, height, 0, Math.round(height * 0.22), width, height);
      return;
    }
    const shiftX = width > 1080 ? Math.round(width * 0.07) : 0;
    if (shiftX > 0) {
      this.camera.setViewOffset(width, height, shiftX, 0, width, height);
    } else {
      this.camera.clearViewOffset();
    }
  }

  private syncDom(): void {
    this.root.dataset.state = stateName(this.phase);
    this.root.dataset.level = this.level.toFixed(4);
    this.root.dataset.overflow = this.phase.name === "spill" || this.settledOverflow ? "true" : "false";
    this.root.dataset.menu = this.menu;
  }

  private reducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
}

function stateName(phase: Phase): string {
  switch (phase.name) {
    case "idle":
      return "idle";
    case "tip":
    case "untilt":
      return "pouring";
    case "drops":
    case "stream":
      return "filling";
    case "spill":
      return "spilling";
    default: {
      const unreachable: never = phase;
      return String(unreachable);
    }
  }
}

function glassProfile(): THREE.Vector2[] {
  const y0 = TUMBLER.innerBottomY;
  const y1 = y0 + TUMBLER.innerHeight;
  const r0 = TUMBLER.bottomRadius;
  const r1 = TUMBLER.topRadius;
  const wall = 0.0052;
  const pts: THREE.Vector2[] = [];
  const push = (x: number, y: number) => {
    pts.push(new THREE.Vector2(x, y));
  };
  push(0.001, 0);
  push(r0 + 0.013, 0);
  push(r0 + 0.015, 0.008);
  push(r0 + wall + 0.003, y0 - 0.001);
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = y0 + (y1 - y0) * t;
    push(r0 + (r1 - r0) * t + wall, y);
  }
  push(r1 + wall + 0.0025, y1 + 0.0035);
  push(r1 + 0.0085, y1 + 0.0075);
  push(r1 + 0.0015, y1 + 0.0075);
  push(r1, y1);
  for (let i = steps; i >= 0; i -= 1) {
    const t = i / steps;
    const y = y0 + (y1 - y0) * t;
    push(Math.max(0.004, r0 + (r1 - r0) * t - 0.0004), y);
  }
  push(0.001, y0);
  return pts;
}

function bowlProfile(): THREE.Vector2[] {
  const pairs: Array<[number, number]> = [
    [0.001, 0],
    [0.17, 0],
    [0.22, 0.014],
    [0.236, 0.07],
    [0.242, 0.096],
    [0.228, 0.108],
    [0.205, 0.098],
    [0.178, 0.062],
    [0.158, 0.048],
    [0.001, 0.046],
  ];
  return pairs.map(([x, y]) => new THREE.Vector2(x, y));
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not etch the glass marks.");
  }
  ctx.font = "600 34px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(8, 10, 14, 0.72)";
  ctx.strokeText(text, 10, 34);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillText(text, 10, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  }));
  sprite.center.set(0, 0.5);
  sprite.scale.set(text.length > 3 ? 0.086 : 0.052, 0.018, 1);
  return sprite;
}

function tileTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not draw the tile floor.");
  }
  ctx.fillStyle = "#b7afa2";
  ctx.fillRect(0, 0, size, size);
  const tiles = 4;
  const gap = 7;
  const cell = size / tiles;
  const colors = ["#e7dfd2", "#f3ece2", "#e2d9cc", "#efe6da"];
  for (let y = 0; y < tiles; y += 1) {
    for (let x = 0; x < tiles; x += 1) {
      ctx.fillStyle = colors[(x + y * 2) % colors.length];
      ctx.fillRect(x * cell + gap / 2, y * cell + gap / 2, cell - gap, cell - gap);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 14);
  return texture;
}

function softDisc(strength: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not draw the contact shadow.");
  }
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function puddleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not draw the puddle.");
  }
  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  gradient.addColorStop(0, "rgba(36, 122, 196, 0.9)");
  gradient.addColorStop(0.55, "rgba(28, 96, 170, 0.55)");
  gradient.addColorStop(1, "rgba(20, 70, 130, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function causticTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not draw the caustic.");
  }
  ctx.clearRect(0, 0, 128, 128);
  const blobs = [
    [64, 60, 26],
    [48, 74, 16],
    [80, 72, 18],
    [60, 48, 12],
  ];
  for (const [x, y, r] of blobs) {
    const gradient = ctx.createRadialGradient(x, y, 2, x, y, r);
    gradient.addColorStop(0, "rgba(210, 235, 255, 0.9)");
    gradient.addColorStop(1, "rgba(120, 180, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const focus = new THREE.Vector3(0, 0.15, 0);
  const addPlane = (color: number, width: number, height: number, x: number, y: number, z: number, look: THREE.Vector3) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color }));
    plane.position.set(x, y, z);
    plane.lookAt(look);
    env.add(plane);
  };
  addPlane(0xfff4e4, 3.4, 1.8, 1.7, 1.9, 1.5, focus);
  addPlane(0xc5dcff, 1.2, 2.3, -1.7, 1.15, 0.5, focus);
  addPlane(0xe4ddd0, 4.5, 4.5, 0, -0.15, 0.1, new THREE.Vector3(0, 1, 0));
  addPlane(0x9fb6cc, 2.6, 0.45, 0.1, 2.3, -1.3, focus);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.04);
  pmrem.dispose();
  env.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const material = object.material;
      if (!Array.isArray(material)) {
        material.dispose();
      }
    }
  });
  return target.texture;
}
