// Làng Thợ Rèn 3D (Walkable Hub): đi lại tự do, thử vũ khí trên Hình Nộm, nhận Đơn Hàng & Xây dựng Làng
import * as THREE from 'three';
import { prepareCustomWorld, DS, pillars, boxes } from './world.js';
import { models, fitModel, Animator } from './models.js';
import { glowSprite, spawnRing, burst, flash, emit, F } from './fx.js';
import { play } from './audio.js';
import { TrainingDummy } from './modes.js';
import { BUILDINGS } from './village.js';
import { countReadyOrders } from './crafting.js';
import { charById } from './content.js';

const labelLayer = () => document.getElementById('dmg-layer');
const _tmp = new THREE.Vector3();

function placeHubLabel(el, pos, camera, yOff = 2.4) {
  _tmp.set(pos.x, yOff, pos.z).project(camera);
  const off = Math.abs(_tmp.x) > 0.96 || _tmp.y < -0.82 || _tmp.y > 0.95;
  el.style.display = off ? 'none' : '';
  if (!off) {
    const px = (_tmp.x * 0.5 + 0.5) * innerWidth;
    const py = (-_tmp.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-100%)`;
  }
}

export class VillageHub {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.root = null;
    this.buildingsGroup = null;
    this.owned = [];
    this.buildOwned = [];
    this.buildColliders = [];
    this.interactables = [];
    this.mixers = [];
    this.animObjs = [];
    this.dummy = null;
    this.forgeEmberPos = new THREE.Vector3(-9.5, 1.1, -1.5);
    this.smelterPos = new THREE.Vector3(-5.5, 1.1, -10.5);
    this.smelterBuilt = false;
  }

  _own(r) {
    if (r) this.owned.push(r);
    return r;
  }

  _ownBuild(r) {
    if (r) this.buildOwned.push(r);
    return r;
  }

  _makeLabel(html, cls = 'hub-lbl') {
    const el = document.createElement('div');
    el.className = 'label reward ' + cls;
    el.innerHTML = html;
    labelLayer()?.appendChild(el);
    return el;
  }

  _addInteractable(def) {
    const ringGeo = this._own(new THREE.RingGeometry(def.ringR || 1.25, (def.ringR || 1.25) + 0.14, 32).rotateX(-Math.PI / 2));
    const ringMat = this._own(new THREE.MeshBasicMaterial({ color: def.color || 0xffcf4a, transparent: true, opacity: 0.55, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(def.x, 0.035, def.z);
    this.root.add(ring);

    const label = this._makeLabel(def.labelHtml);
    const item = {
      ...def,
      pos: new THREE.Vector3(def.x, 0, def.z),
      ring,
      label,
      yOff: def.yOff || 2.35,
      radius: def.radius || 2.6,
    };
    this.interactables.push(item);
    return item;
  }

  _spawnNpc(modelKey, x, z, rotY, hideGear = [], tintHex = null, parent = null) {
    const entry = models[modelKey];
    const targetParent = parent || this.root;
    if (!entry) {
      const g = new THREE.Mesh(
        this._own(new THREE.CylinderGeometry(0.32, 0.4, 1.5, 10)),
        this._own(new THREE.MeshStandardMaterial({ color: tintHex || 0xc8a070, roughness: 0.7 })),
      );
      g.position.set(x, 0.75, z);
      g.castShadow = true;
      targetParent.add(g);
      return null;
    }
    const npc = fitModel(entry, 1.9, 'ground');
    for (const n of hideGear) {
      const o = npc.getObjectByName(n);
      if (o) o.visible = false;
    }
    if (tintHex) {
      const tc = new THREE.Color(tintHex);
      npc.traverse((o) => {
        if (o.isMesh && o.material?.color) {
          o.material = o.material.clone();
          o.material.color.lerp(tc, 0.35);
          this._own(o.material);
        }
      });
    }
    npc.position.set(x, 0, z);
    npc.rotation.y = rotY;
    targetParent.add(npc);
    const anim = new Animator(npc);
    anim.play('Idle');
    this.mixers.push(anim);
    return npc;
  }

  _placeProp(name, x, z, rotY = 0, scaleMul = 1, colR = 0, target = null, ownArr = null) {
    const entry = models[name];
    if (!entry) return null;
    const o = entry.scene.clone(true);
    o.scale.setScalar(DS * scaleMul);
    o.position.set(x, 0, z);
    o.rotation.y = rotY;
    o.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    (target || this.root).add(o);
    if (colR > 0) pillars.push({ x, z, r: colR });
    return o;
  }

  enter(meta, player, enemies) {
    this.clear();
    this.active = true;
    const world = prepareCustomWorld(this.scene, { half: 18.5 });
    this.root = world.group;

    // 1. Sân đá ấm áp + đường đá chữ thập dẫn tới Cổng Hầm, Lò Rèn, Thương Nhân
    const floorGeo = this._own(new THREE.PlaneGeometry(38, 38).rotateX(-Math.PI / 2));
    const floorMat = this._own(new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.9, metalness: 0.08 }));
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    const pathMat = this._own(new THREE.MeshStandardMaterial({ color: 0x574435, roughness: 0.85, metalness: 0.1 }));
    const vPathGeo = this._own(new THREE.PlaneGeometry(4.4, 30).rotateX(-Math.PI / 2));
    const hPathGeo = this._own(new THREE.PlaneGeometry(28, 3.8).rotateX(-Math.PI / 2));
    const vPath = new THREE.Mesh(vPathGeo, pathMat);
    vPath.position.set(0, 0.012, -1);
    vPath.receiveShadow = true;
    const hPath = new THREE.Mesh(hPathGeo, pathMat);
    hPath.position.set(0, 0.014, -1.5);
    hPath.receiveShadow = true;
    this.root.add(vPath, hPath);

    // Ấn trung tâm sân làng
    const hubRingGeo = this._own(new THREE.RingGeometry(2.6, 2.95, 48).rotateX(-Math.PI / 2));
    const hubRingMat = this._own(new THREE.MeshBasicMaterial({ color: 0xe2b86c, transparent: true, opacity: 0.32, depthWrite: false }));
    const hubRing = new THREE.Mesh(hubRingGeo, hubRingMat);
    hubRing.position.y = 0.02;
    this.root.add(hubRing);

    // Lát gạch trang trí từ bộ dungeon
    if (models['dungeon/floor_tile_large']) {
      for (const [tx, tz] of [[-9.5, -1.5], [9.8, -1.5], [0, -13.5], [0, 0], [-5.5, 10.5], [5.5, 10.5]]) {
        const t = models['dungeon/floor_tile_large'].scene.clone(true);
        t.scale.setScalar(DS * 1.15);
        t.position.set(tx, 0.018, tz);
        t.traverse((c) => { if (c.isMesh) c.receiveShadow = true; });
        this.root.add(t);
      }
    }

    // 2. Tường bao & đuốc sáng quanh làng
    const H = 18.5;
    const step = 3.2;
    for (let x = -H + 1.6; x <= H - 1.6; x += step) {
      if (Math.abs(x) > 2.2) {
        world.addPiece('wall', x, -H, 0);
      }
      if (Math.abs(x) % 6.4 < 2) world.addPiece('column', x, H + 0.2, 0);
    }
    for (let z = -H + 1.6; z <= H - 1.6; z += step) {
      world.addPiece('wall', -H, z, Math.PI / 2);
      world.addPiece('wall', H, z, -Math.PI / 2);
    }
    world.addTorch(-10, -H + 0.3, 0, 0xff9a3c, 2.2, true);
    world.addTorch(10, -H + 0.3, 0, 0xff9a3c, 2.2, true);
    world.addTorch(-H + 0.3, -1.5, Math.PI / 2, 0xff8a2a, 2.2, true);
    world.addTorch(H - 0.3, -1.5, -Math.PI / 2, 0xff8a2a, 2.2, true);
    world.addPiece('banner_patternA_red', -5.5, -H + 0.2, 0);
    world.addPiece('banner_patternA_red', 5.5, -H + 0.2, 0);

    // 3. Cổng Hầm Ngục phía Bắc (0, -14.5)
    world.addPiece('wall_arched', 0, -16.8, 0, 0, DS * 1.35);
    this._placeProp('dungeon/pillar_decorated', -2.8, -16.4, 0, 1.0, 0.8);
    this._placeProp('dungeon/pillar_decorated', 2.8, -16.4, 0, 1.0, 0.8);
    const gateBeam = new THREE.Mesh(
      this._own(new THREE.CylinderGeometry(1.1, 1.45, 5.2, 24, 1, true)),
      this._own(new THREE.MeshBasicMaterial({ color: 0xffa83a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
    );
    gateBeam.position.set(0, 2.6, -15.2);
    const gateGlow = glowSprite(0xffae42, 3.2);
    gateGlow.position.set(0, 1.6, -15.2);
    this.root.add(gateBeam, gateGlow);
    this.animObjs.push({ kind: 'gate', mesh: gateBeam, glow: gateGlow });
    this._addInteractable({
      id: 'gate', x: 0, z: -14.5, ringR: 1.75, color: 0xffcf4a, yOff: 3.1, radius: 3.1,
      labelHtml: '<i class="ico ico-wave"></i> Cổng Hầm Ngục <small>Chọn Độ Khó &amp; Xuống Hầm</small>',
    });

    // 4. Đe Rèn Làng & Thợ Cả Hàn (khu Tây)
    if (models.anvil) {
      const anv = fitModel(models.anvil, 1.32, 'ground');
      anv.position.set(-9.5, 0, -1.5);
      anv.rotation.y = 0.45;
      this.root.add(anv);
    } else {
      const fb = new THREE.Mesh(
        this._own(new THREE.BoxGeometry(1.2, 0.9, 0.7)),
        this._own(new THREE.MeshStandardMaterial({ color: 0x454a52, metalness: 0.75, roughness: 0.35 })),
      );
      fb.position.set(-9.5, 0.45, -1.5);
      this.root.add(fb);
    }
    const anvilGlow = glowSprite(0xff8a30, 2.2);
    anvilGlow.position.set(-9.5, 1.25, -1.5);
    this.root.add(anvilGlow);
    pillars.push({ x: -9.5, z: -1.5, r: 0.85 });
    this._placeProp('dungeon/sword_shield', -12.4, -0.5, 0.6, 1.0, 0.6);
    this._placeProp('dungeon/barrel_large', -12.6, -4.6, 0, 0.9, 0.65);

    this.workshopItem = this._addInteractable({
      id: 'workshop', x: -9.5, z: -1.5, ringR: 1.55, color: 0xff9a3c, yOff: 2.3, radius: 2.8,
      labelHtml: this._workshopLabelHtml(meta),
    });

    this._spawnNpc('char_barbarian', -11.3, -3.1, 0.9, charById('barbarian').gear, 0xc87a38);
    pillars.push({ x: -11.3, z: -3.1, r: 0.55 });
    this.masterItem = this._addInteractable({
      id: 'master_smith', x: -11.3, z: -3.1, ringR: 1.05, color: 0xffcf6b, yOff: 2.55, radius: 2.5,
      labelHtml: this._masterLabelHtml(meta),
    });

    // 5. Thương Nhân Xây Làng (khu Đông)
    this._placeProp('dungeon/shop_table', 9.8, -1.5, -Math.PI / 2, 0.9, 0.9);
    this._placeProp('dungeon/coin_stack', 9.8, -0.9, 0, 0.8, 0);
    this._placeProp('dungeon/chest', 11.8, 0.4, -0.7, 0.85, 0.6);
    this._spawnNpc('npc_merchant', 11.2, -1.6, -Math.PI / 2, charById('rogue').gear);
    pillars.push({ x: 11.2, z: -1.6, r: 0.55 });
    this._addInteractable({
      id: 'builder', x: 9.8, z: -1.5, ringR: 1.55, color: 0xf0b860, yOff: 2.5, radius: 2.8,
      labelHtml: '<i class="ico" style="--i:url(\'/ui/icons/x_shop.svg\');color:#f0b860"></i> Xây Làng Thợ Rèn <small>Dùng Hồn Thép xây công trình</small>',
    });

    // 6. Bảng Danh Vọng & Lưu Trữ (Nam-Đông)
    this._placeProp('dungeon/banner_shield_red', 5.5, 11.2, Math.PI, 1.15, 0.55);
    this._placeProp('dungeon/candle_triple', 4.5, 10.6, 0, 1.0, 0);
    this._addInteractable({
      id: 'board', x: 5.5, z: 10.5, ringR: 1.25, color: 0x7fd8ff, yOff: 2.4, radius: 2.6,
      labelHtml: '<i class="ico" style="--i:url(\'/ui/icons/x_trophy.svg\');color:#a6e2ff"></i> Thành Tựu &amp; Sổ Rèn',
    });

    // 7. Sân Tập Hình Nộm Thép (Nam-Tây) — thử vũ khí tự rèn ngay trong làng!
    this.dummy = new TrainingDummy(this.scene, -5.5, 10.5);
    enemies.push(this.dummy);
    const dummyLbl = this._makeLabel('<i class="ico" style="--i:url(\'/ui/icons/x_swords-emblem.svg\');color:#ffcf4a"></i> Hình Nộm Tập Đánh <small>Đánh thử vũ khí</small>', 'hub-dummy-lbl');
    this.animObjs.push({ kind: 'staticLbl', label: dummyLbl, pos: new THREE.Vector3(-5.5, 0, 10.5), yOff: 2.6 });

    // 8. 6 Công Trình Làng Thợ Rèn (mọc lên 3D khi người chơi nâng cấp!)
    this.buildingsGroup = new THREE.Group();
    this.root.add(this.buildingsGroup);
    this.buildingItems = {};
    this.refreshBuildings(meta);

    if (player) {
      player.pos.set(0, 0, 4.5);
      player.facing = Math.PI;
    }
  }

  _workshopLabelHtml(meta) {
    const ready = countReadyOrders(meta);
    const badge = ready > 0 ? ` <span class="hub-badge-ex">${ready} Hoàn thành!</span>` : '';
    return `<i class="ico ico-anvil"></i> Xưởng Đe Rèn${badge} <small>Đơn Hàng · Rèn Quặng · Bùa</small>`;
  }

  _masterLabelHtml(meta) {
    const ready = countReadyOrders(meta);
    const badge = ready > 0 ? ` <span class="hub-badge-ex">!</span>` : '';
    return `<i class="ico" style="--i:url('/ui/icons/x_horned-helm.svg');color:#ffcf6b"></i> Thợ Cả Hàn${badge}`;
  }

  refreshLabels(meta) {
    if (!this.active) return;
    if (this.workshopItem?.label) this.workshopItem.label.innerHTML = this._workshopLabelHtml(meta);
    if (this.masterItem?.label) this.masterItem.label.innerHTML = this._masterLabelHtml(meta);
  }

  refreshBuildings(meta, burstId = null) {
    if (!this.active || !this.buildingsGroup) return;
    while (this.buildingsGroup.children.length) {
      this.buildingsGroup.remove(this.buildingsGroup.children[0]);
    }
    for (const r of this.buildOwned) r?.dispose?.();
    this.buildOwned.length = 0;
    for (const c of this.buildColliders) {
      const idx = pillars.indexOf(c);
      if (idx >= 0) pillars.splice(idx, 1);
    }
    this.buildColliders.length = 0;

    // Xóa bớt interactables phụ của công trình trước khi dựng lại
    for (let i = this.interactables.length - 1; i >= 0; i--) {
      const it = this.interactables[i];
      if (it.fromBuilding) {
        this.root.remove(it.ring);
        it.label.remove();
        this.interactables.splice(i, 1);
      }
    }
    this.animObjs = this.animObjs.filter((o) => !o.fromBuilding);
    this.mixers = this.mixers.filter((m) => !m._fromBuilding);

    const vil = (id) => (meta?.village || {})[id] || 0;
    const spots = {
      inn: { x: -13.0, z: 8.5, color: 0xf0b860 },
      shrine: { x: 13.0, z: -10.5, color: 0xffe070 },
      gem: { x: -13.0, z: -10.5, color: 0x7fd8ff },
      smith: { x: -5.5, z: -10.5, color: 0xff8a30 },
      library: { x: 13.0, z: 8.5, color: 0x9fd4ff },
      tower: { x: 11.2, z: 13.0, color: 0xffe080 },
    };

    this.smelterBuilt = vil('smith') > 0;

    for (const b of BUILDINGS) {
      const lv = vil(b.id);
      const sp = spots[b.id];
      if (!sp) continue;

      if (lv <= 0) {
        // Nền đất đánh dấu công trình chưa xây
        const padGeo = this._ownBuild(new THREE.RingGeometry(1.15, 1.32, 24).rotateX(-Math.PI / 2));
        const padMat = this._ownBuild(new THREE.MeshBasicMaterial({ color: 0x8a7258, transparent: true, opacity: 0.32, depthWrite: false }));
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(sp.x, 0.025, sp.z);
        this.buildingsGroup.add(pad);
        continue;
      }

      const bg = new THREE.Group();
      bg.position.set(sp.x, 0, sp.z);
      this.buildingsGroup.add(bg);

      if (b.id === 'inn') {
        this._placeProp('dungeon/keg_decorated', -1.2, -0.8, 0.3, 1.0, 0, bg);
        this._placeProp('dungeon/barrel_large', 1.2, -0.7, 0, 0.95, 0, bg);
        if (lv >= 2) this._placeProp('dungeon/shop_table', 0, -1.5, 0, 0.85, 0, bg);
        if (lv >= 3) this._placeProp('dungeon/candle_triple', 0, -1.5, 0, 1.0, 0, bg);
        const innGlow = glowSprite(0xffb858, 1.8 + lv * 0.3);
        innGlow.position.set(0, 1.7, -0.8);
        bg.add(innGlow);
        const rogue = this._spawnNpc('char_rogue', 1.4, 0.6, -0.7, charById('rogue').gear, 0xd8a870, bg);
        if (rogue) this.mixers[this.mixers.length - 1]._fromBuilding = true;
        const cInn = { x: sp.x + 1.4, z: sp.z + 0.6, r: 0.55 };
        pillars.push(cInn); this.buildColliders.push(cInn);
        const it = this._addInteractable({
          id: 'traveler', x: sp.x + 1.4, z: sp.z + 0.6, ringR: 1.05, color: 0xf0b860, yOff: 2.5, radius: 2.5, fromBuilding: true,
          labelHtml: `<i class="ico" style="--i:url('/ui/icons/x_price.svg');color:#f0b860"></i> Quán Trọ (Cấp ${lv}) · Lữ Khách`,
        });
        it.fromBuilding = true;
      } else if (b.id === 'shrine') {
        const base = new THREE.Mesh(
          this._ownBuild(new THREE.CylinderGeometry(1.15, 1.4, 0.45, 8)),
          this._ownBuild(new THREE.MeshStandardMaterial({ color: 0x5c4c3e, roughness: 0.75 })),
        );
        base.position.y = 0.22;
        const obelisk = new THREE.Mesh(
          this._ownBuild(new THREE.OctahedronGeometry(0.45 + lv * 0.08, 0)),
          this._ownBuild(new THREE.MeshStandardMaterial({ color: 0xffe48a, emissive: 0xffa830, emissiveIntensity: 1.2, roughness: 0.2 })),
        );
        obelisk.position.y = 1.45;
        const beam = new THREE.Mesh(
          this._ownBuild(new THREE.CylinderGeometry(0.45, 0.75, 4.2, 16, 1, true)),
          this._ownBuild(new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.16 + lv * 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
        );
        beam.position.y = 2.1;
        bg.add(base, obelisk, beam);
        const cShrine = { x: sp.x, z: sp.z, r: 1.15 };
        pillars.push(cShrine); this.buildColliders.push(cShrine);
        this.animObjs.push({ kind: 'spin', mesh: obelisk, speed: 1.2, baseY: 1.45, fromBuilding: true });
        const it = this._addInteractable({
          id: 'shrine', x: sp.x, z: sp.z, ringR: 1.4, color: 0xffe070, yOff: 2.6, radius: 2.6, fromBuilding: true,
          labelHtml: `<i class="ico" style="--i:url('/ui/icons/x_sunbeams.svg');color:#ffe070"></i> Đền Thần (Cấp ${lv})`,
        });
        it.fromBuilding = true;
      } else if (b.id === 'gem') {
        this._placeProp('dungeon/crates_stacked', 0, -0.8, 0.2, 0.85, 0, bg);
        const colors = [0xff3a4a, 0x3a8aff, 0x3ad36a, 0xffc03a];
        const gemGeo = this._ownBuild(new THREE.OctahedronGeometry(0.22, 0));
        const orbGroup = new THREE.Group();
        orbGroup.position.y = 1.5;
        for (let k = 0; k < 2 + lv; k++) {
          const mat = this._ownBuild(new THREE.MeshStandardMaterial({ color: colors[k % 4], emissive: colors[k % 4], emissiveIntensity: 1.0, flatShading: true }));
          const g = new THREE.Mesh(gemGeo, mat);
          const a = (k / (2 + lv)) * Math.PI * 2;
          g.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
          orbGroup.add(g);
        }
        bg.add(orbGroup);
        this.animObjs.push({ kind: 'spin', mesh: orbGroup, speed: 1.5, baseY: 1.5, fromBuilding: true });
      } else if (b.id === 'smith') {
        if (models.anvil) {
          const a2 = fitModel(models.anvil, 1.15, 'ground');
          a2.position.set(0, 0, 0);
          bg.add(a2);
        }
        if (models.prop_hammer_gold) {
          const h = fitModel(models.prop_hammer_gold, 0.9, 'ground');
          h.position.set(1.2, 0.1, 0.4);
          bg.add(h);
        }
        const cSmith = { x: sp.x, z: sp.z, r: 0.8 };
        pillars.push(cSmith); this.buildColliders.push(cSmith);
        const sg = glowSprite(0xff7020, 1.8 + lv * 0.35);
        sg.position.set(0, 1.25, 0);
        bg.add(sg);
      } else if (b.id === 'library') {
        this._placeProp('dungeon/trunk_large_A', -0.9, -0.7, 0.2, 1.0, 0, bg);
        if (models.prop_spellbook) {
          const sb = fitModel(models.prop_spellbook, 0.85, 'ground');
          sb.position.set(-0.9, 1.15, -0.7);
          bg.add(sb);
          this.animObjs.push({ kind: 'spin', mesh: sb, speed: 0.9, baseY: 1.15, fromBuilding: true });
        }
        const mage = this._spawnNpc('char_mage', 1.0, 0.7, -0.9, charById('mage').gear, 0x6ea8ff, bg);
        if (mage) this.mixers[this.mixers.length - 1]._fromBuilding = true;
        const cLib = { x: sp.x + 1.0, z: sp.z + 0.7, r: 0.55 };
        pillars.push(cLib); this.buildColliders.push(cLib);
        const it = this._addInteractable({
          id: 'scholar', x: sp.x + 1.0, z: sp.z + 0.7, ringR: 1.05, color: 0x9fd4ff, yOff: 2.55, radius: 2.5, fromBuilding: true,
          labelHtml: '<i class="ico" style="--i:url(\'/ui/icons/x_book.svg\');color:#9fd4ff"></i> Thư Viện · Học Giả',
        });
        it.fromBuilding = true;
      } else if (b.id === 'tower') {
        this._placeProp('dungeon/pillar_decorated', 0, 0, 0, 1.15, 0, bg);
        const cTower = { x: sp.x, z: sp.z, r: 0.95 };
        pillars.push(cTower); this.buildColliders.push(cTower);
        const topGem = new THREE.Mesh(
          this._ownBuild(new THREE.OctahedronGeometry(0.42, 0)),
          this._ownBuild(new THREE.MeshStandardMaterial({ color: 0xffe070, emissive: 0xffb030, emissiveIntensity: 1.6 })),
        );
        topGem.position.y = 3.6;
        const tg = glowSprite(0xffe070, 2.4);
        tg.position.y = 3.6;
        bg.add(topGem, tg);
        this.animObjs.push({ kind: 'spin', mesh: topGem, speed: 1.8, baseY: 3.6, fromBuilding: true });
      }

      if (burstId === b.id) {
        const p = new THREE.Vector3(sp.x, 0.5, sp.z);
        spawnRing(this.scene, p, 3.6, sp.color, 0.65);
        burst(p.clone().setY(1.2), sp.color, 34, { speed: 8.5, size: 0.18 });
        flash(p.clone().setY(1.8), sp.color, 4, 0.3);
        play('hammer', { rate: 1.1 });
      }
    }
  }

  nearestInteractable(pos) {
    if (!this.active || !pos) return null;
    let best = null, bd = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z);
      if (d < it.radius && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  update(dt, time, camera, playerPos, meta) {
    if (!this.active) return;
    for (const m of this.mixers) m.update(dt);
    for (const o of this.animObjs) {
      if (o.kind === 'gate') {
        o.mesh.material.opacity = 0.18 + Math.sin(time * 2.6) * 0.06;
        o.glow.scale.setScalar(3.0 + Math.sin(time * 3.1) * 0.3);
      } else if (o.kind === 'spin') {
        o.mesh.rotation.y += dt * o.speed;
        o.mesh.position.y = o.baseY + Math.sin(time * 2.8) * 0.1;
      } else if (o.kind === 'staticLbl' && camera) {
        placeHubLabel(o.label, o.pos, camera, o.yOff);
      }
    }
    // Tàn lửa ở Đe Rèn làng & Lò Luyện Thép
    if (Math.random() < dt * 7) {
      emit(this.forgeEmberPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9)), {
        frame: F.flame, color: 0xffe08a, color2: 0xff6a10, size: 0.22, size2: 0.04, life: 0.9,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4), hdr: 1.8,
      });
    }
    if (this.smelterBuilt && Math.random() < dt * 5) {
      emit(this.smelterPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7)), {
        frame: F.flame, color: 0xffb850, color2: 0xff4a10, size: 0.2, size2: 0.04, life: 0.85,
        vel: new THREE.Vector3(0, 1.3, 0), hdr: 1.7,
      });
    }

    const near = this.nearestInteractable(playerPos);
    if (camera) {
      for (const it of this.interactables) {
        placeHubLabel(it.label, it.pos, camera, it.yOff);
        it.label.classList.toggle('hot', near === it);
        it.ring.material.opacity = near === it ? 0.95 : 0.45;
      }
    }
  }

  clear() {
    this.active = false;
    for (const it of this.interactables) it.label?.remove();
    this.interactables.length = 0;
    for (const o of this.animObjs) o.label?.remove?.();
    this.animObjs.length = 0;
    this.mixers.length = 0;
    if (this.dummy && !this.dummy.dead) {
      this.dummy.dead = true;
      this.scene.remove(this.dummy.group);
      this.scene.remove(this.dummy.shadow);
    }
    this.dummy = null;
    for (const c of this.buildColliders) {
      const idx = pillars.indexOf(c);
      if (idx >= 0) pillars.splice(idx, 1);
    }
    this.buildColliders.length = 0;
    for (const r of this.owned) r?.dispose?.();
    this.owned.length = 0;
    for (const r of this.buildOwned) r?.dispose?.();
    this.buildOwned.length = 0;
    for (const c of this.buildColliders) {
      const idx = pillars.indexOf(c);
      if (idx >= 0) pillars.splice(idx, 1);
    }
    this.buildColliders.length = 0;
    this.buildingsGroup = null;
    this.root = null;
  }
}
