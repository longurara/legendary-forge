import * as THREE from 'three';
import { buildWeaponMesh } from './weapons.js';

// ---------- Ảnh vũ khí render từ model 3D (dùng cho ô vũ khí) ----------
let iconRenderer, iconScene, iconCam;
const iconCache = new Map();

function setupIconRenderer() {
  iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  iconRenderer.setPixelRatio(1);
  iconRenderer.setSize(128, 128);
  iconRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  iconRenderer.toneMappingExposure = 1.25;
  iconScene = new THREE.Scene();
  iconScene.add(new THREE.HemisphereLight(0xfff4e0, 0x403028, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 4);
  iconScene.add(key);
  iconCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
}

export function weaponIcon(w) {
  const key = [w.type, w.element, w.element2, w.rarity].join('|');
  if (iconCache.has(key)) return iconCache.get(key);
  if (!iconRenderer) setupIconRenderer();
  const mesh = buildWeaponMesh(w);           // dọc theo +Z, chuôi ở gốc
  const holder = new THREE.Group();
  holder.add(mesh);
  mesh.rotation.x = -Math.PI / 2;             // dựng đứng
  holder.rotation.z = -Math.PI / 4;           // nghiêng chéo cho đẹp
  holder.rotation.y = 0.35;
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  holder.position.sub(center);
  iconScene.add(holder);
  const span = Math.max(size.x, size.y) * 1.12;
  iconCam.position.set(0, 0, span / 2 / Math.tan(THREE.MathUtils.degToRad(15)));
  iconCam.lookAt(0, 0, 0);
  iconRenderer.render(iconScene, iconCam);
  const url = iconRenderer.domElement.toDataURL('image/png');
  iconScene.remove(holder);
  iconCache.set(key, url);
  return url;
}

// ---------- Tiện ích DOM ----------
export const $ = (id) => document.getElementById(id);

export function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
