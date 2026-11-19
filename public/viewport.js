import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { OBJLoader } from '/vendor/OBJLoader.js';
import { GLTFLoader } from '/vendor/GLTFLoader.js';
import { OBJExporter } from '/vendor/OBJExporter.js';

export const shapes = {
  cube: ['Cubo', () => new THREE.BoxGeometry(1, 1, 1)],
  sphere: ['Esfera', () => new THREE.SphereGeometry(.65, 32, 24)],
  cylinder: ['Cilindro', () => new THREE.CylinderGeometry(.5, .5, 1.2, 32)],
  cone: ['Cone', () => new THREE.ConeGeometry(.65, 1.3, 32)],
  torus: ['Anel', () => new THREE.TorusGeometry(.55, .18, 16, 40)],
};

export async function readModel(filename, source) {
  let model;
  if (filename.toLowerCase().endsWith('.obj')) {
    model = new OBJLoader().parse(source);
  } else {
    const binary = Uint8Array.from(atob(source), char => char.charCodeAt(0));
    const view = new DataView(binary.buffer);
    if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
        view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== view.byteLength ||
        view.getUint32(16, true) !== 0x4e4f534a || view.getUint32(12, true) > view.byteLength - 20) {
      throw new Error('Arquivo GLB inválido.');
    }
    const document = JSON.parse(new TextDecoder().decode(binary.subarray(20, 20 + view.getUint32(12, true))));
    if ([...(document.buffers || []), ...(document.images || [])].some(entry => entry.uri && !entry.uri.startsWith('data:'))) {
      throw new Error('Use um GLB com todos os recursos incorporados.');
    }
    model = (await new GLTFLoader().parseAsync(binary.buffer, '')).scene;
  }
  let hasMesh = false;
  model.traverse(node => {
    if (node.isMesh && node.geometry.attributes.position?.count >= 3) hasMesh = true;
  });
  const bounds = new THREE.Box3().setFromObject(model);
  if (!hasMesh || bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) {
    throw new Error('O arquivo precisa conter pelo menos uma malha válida.');
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(scale)) throw new Error('A malha não tem dimensões válidas.');
  const container = new THREE.Group();
  model.position.sub(center);
  container.scale.setScalar(scale);
  container.add(model);
  const root = new THREE.Group();
  root.add(container);
  return root;
}

export function makeViewport(host, onSelect, onZoom) {
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#171a29');
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label','Visor 3D. Arraste para orbitar e role para aproximar.');
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const models = new THREE.Group();
  scene.add(models, new THREE.GridHelper(40, 40, '#555577', '#303449'));
  const light = new THREE.DirectionalLight('#eeeeff', 3);
  light.position.set(4, 8, 6);
  scene.add(light, new THREE.HemisphereLight('#e8ecff', '#6f5274', 2));
  const camera = new THREE.PerspectiveCamera(43, 1, .01, 500);
  camera.position.set(5, 4, 6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = .1;
  controls.maxDistance = 160;
  const resize = new ResizeObserver(() => {
    const {clientWidth, clientHeight} = host;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  const nodes = new Map();
  let initialDistance = camera.position.length();
  controls.addEventListener('change', () => onZoom(Math.round(100 * initialDistance / camera.position.distanceTo(controls.target))));
  let start;
  renderer.domElement.addEventListener('pointerdown', event => { start = [event.clientX,event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!start || Math.hypot(event.clientX-start[0],event.clientY-start[1]) > 4) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(2*(event.clientX-rect.left)/rect.width-1, 1-2*(event.clientY-rect.top)/rect.height), camera);
    let object = ray.intersectObjects(models.children, true)[0]?.object;
    while (object && object.parent !== models) object = object.parent;
    if (object) onSelect(object.userData.id);
  });
  function dispose(node) {
    node.traverse(child => {
      child.geometry?.dispose();
      for (const material of [child.material].flat().filter(Boolean)) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
  }
  return {
    async add(item, model) {
      const node = model || (item.shape === 'imported' ? await readModel(item.filename, item.source) :
        new THREE.Mesh(shapes[item.shape][1](), new THREE.MeshStandardMaterial()));
      if (nodes.has(item.id)) { dispose(node); return; }
      node.userData.id = item.id;
      node.userData.imported = item.shape === 'imported';
      nodes.set(item.id, node);
      models.add(node);
      this.update(item);
    },
    update(item, recolor = false) {
      const node = nodes.get(item.id);
      if (!node) return;
      node.name = item.name;
      node.position.fromArray(item.position);
      node.rotation.set(...item.rotation.map(THREE.MathUtils.degToRad));
      node.scale.fromArray(item.scale);
      if (!node.userData.imported || item.recolored || recolor) node.traverse(child => {
        for (const material of [child.material].flat()) material?.color?.set(item.color);
      });
    },
    remove(id) {
      const node = nodes.get(id);
      if (!node) return;
      dispose(node);
      node.removeFromParent();
      nodes.delete(id);
    },
    focus() {
      const bounds = new THREE.Box3().setFromObject(models);
      const size = bounds.isEmpty() ? 2 : bounds.getSize(new THREE.Vector3()).length();
      const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(1,.65,1.2).normalize().multiplyScalar(Math.max(2,size*1.65)));
      initialDistance = camera.position.distanceTo(center);
      controls.update();
      onZoom(100);
    },
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length()*factor, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
    },
    export() {
      models.updateMatrixWorld(true);
      return new OBJExporter().parse(models);
    },
  };
}
