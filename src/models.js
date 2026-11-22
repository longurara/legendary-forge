import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Đặt file .glb vào public/models/ với đúng tên dưới đây là game tự dùng,
// không có file thì game dùng model dựng bằng code.
export const DUNGEON_PIECES = [
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small_decorated', 'wall', 'wall_corner', 'wall_arched',
  'wall_cracked', 'pillar_decorated', 'torch_mounted', 'barrel_large', 'barrel_small_stack', 'box_stacked',
  'crates_stacked', 'banner_patternA_red', 'banner_shield_red', 'rubble_large', 'sword_shield', 'candle_triple',
  'keg_decorated', 'trunk_large_A', 'column', 'floor_tile_big_grate_open', 'box_large', 'barrel_small',
  'floor_tile_big_spikes', 'chest', 'shop_table', 'barrel_explosive', 'coin_stack',
];
// KayKit Halloween Bits (CC0) – dạng .gltf
export const CRYPT_PIECES = ['grave_A', 'grave_B', 'gravestone', 'gravemarker_A', 'grave_A_destroyed', 'coffin', 'coffin_decorated', 'floor_dirt_grave', 'skull', 'skull_candle', 'bone_A', 'ribcage', 'candle_melted', 'post_skull'];
export const MODEL_NAMES = [
  'player', 'slime', 'slime_lava', 'enemy_mage', 'enemy_minion', 'enemy_boss', 'anvil',
  'prop_skel_blade', 'prop_skel_axe', 'prop_skel_shield', 'prop_potion', 'prop_chest',
  'char_barbarian', 'char_mage', 'char_rogue', 'npc_merchant', 'enemy_rogue', 'prop_skel_crossbow', 'prop_spellbook',
  'weapon_sword', 'weapon_axe', 'weapon_greatsword', 'weapon_staff', 'weapon_dagger',
  // CC0 Quaternius Monsters & Fantasy Weapons
  'mon_dragon', 'mon_ogre', 'mon_mushroom_king', 'mon_orc', 'mon_goblin', 'mon_imp',
  'mon_drake', 'mon_glub', 'mon_spider', 'mon_wasp', 'mon_snake', 'mon_crab',
  'prop_scythe', 'prop_spear', 'prop_hammer_gold',
  ...DUNGEON_PIECES.map((n) => 'dungeon/' + n),
  ...CRYPT_PIECES.map((n) => 'crypt/' + n),
];

// models[name] = { scene, animations }
export const models = {};

export async function loadModels() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(MODEL_NAMES.map(async (name) => {
    const url = `/models/${name}${name.startsWith('crypt/') ? '.gltf' : '.glb'}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || type.includes('text/html')) return;   // không có file
      const gltf = await loader.loadAsync(url);
      models[name] = { scene: gltf.scene, animations: gltf.animations };
      
    } catch (err) {
      console.warn(`[models] không nạp được ${url}`, err);
    }
  }));
}

function boundsOf(obj) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  return new THREE.Box3().setFromObject(obj, true);   // precise: tính cả xương
}

// Nhân bản model (giữ được xương) và chuẩn hóa kích thước.
// mode 'ground': đáy chạm y=0, căn giữa xz, chiều cao = size.
// mode 'weapon': trục dài nhất thành +Z, chuôi ở gốc, chiều dài = size.
// Trả về Group; group.userData.root là gốc để gắn AnimationMixer.
export function fitModel(entry, size, mode = 'ground') {
  const inner = SkeletonUtils.clone(entry.scene);
  const tilt = new THREE.Group();
  tilt.add(inner);
  const wrap = new THREE.Group();
  wrap.add(tilt);

  let box = boundsOf(tilt);
  let dim = box.getSize(new THREE.Vector3());

  if (mode === 'weapon') {
    if (dim.y >= dim.x && dim.y >= dim.z) tilt.rotation.x = Math.PI / 2;    // dài theo Y -> Z
    else if (dim.x >= dim.z) tilt.rotation.y = -Math.PI / 2;               // dài theo X -> Z
    box = boundsOf(tilt);
    dim = box.getSize(new THREE.Vector3());
    tilt.scale.multiplyScalar(size / Math.max(dim.z, 1e-6));
    box = boundsOf(tilt);
    const c = box.getCenter(new THREE.Vector3());
    tilt.position.sub(new THREE.Vector3(c.x, c.y, box.min.z));
  } else {
    tilt.scale.multiplyScalar(size / Math.max(dim.y, 1e-6));
    box = boundsOf(tilt);
    const c = box.getCenter(new THREE.Vector3());
    tilt.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  }
  wrap.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = !o.isSkinnedMesh; }
  });
  wrap.userData.root = inner;
  wrap.userData.animations = entry.animations || [];
  return wrap;
}

// Bộ phát animation đơn giản: play('Idle') tìm clip có tên chứa chuỗi đó
export class Animator {
  constructor(fitted) {
    this.mixer = new THREE.AnimationMixer(fitted.userData.root);
    this.clips = fitted.userData.animations;
    this.current = null;
    this.actions = {};
  }
  action(name) {
    if (!this.actions[name]) {
      const clip = this.clips.find((c) => c.name.toLowerCase().endsWith(name.toLowerCase()));
      if (!clip) return null;
      this.actions[name] = this.mixer.clipAction(clip);
    }
    return this.actions[name];
  }
  play(name, { once = false, fade = 0.15, speed = 1 } = {}) {
    const a = this.action(name);
    if (!a) return;
    if (this.current === a && !once) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = speed;
    a.enabled = true;
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
  }
  update(dt) { this.mixer.update(dt); }
}
