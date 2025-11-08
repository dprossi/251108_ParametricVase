import './styles.css';
import {
  AmbientLight,
  Box3,
  Box3Helper,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  GridHelper,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Scene,
  Vector3,
  RingGeometry,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import GUI from 'lil-gui';

type NumberRecord = Record<string, number>;

interface VaseParams {
  height: number;
  baseRadius: number;
  wallThickness: number;
  radialSegments: number;
  heightSegments: number;
  sectionEnabled: boolean;
  sectionOffset: number;
  showBoundingBox: boolean;
  showWireframe: boolean;
}

const gui = new GUI({ width: 320 });
const stlExporter = new STLExporter();
const objExporter = new OBJExporter();

const params: VaseParams = {
  height: 220,
  baseRadius: 45,
  wallThickness: 4,
  radialSegments: 96,
  heightSegments: 110,
  sectionEnabled: false,
  sectionOffset: 0,
  showBoundingBox: false,
  showWireframe: false
};

const container = document.querySelector<HTMLDivElement>('#app');
if (!container) {
  throw new Error('Missing #app root element');
}

const scene = new Scene();
scene.background = new Color(0x05070a);

const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, params.height * 0.6, params.height * 1.6);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.localClippingEnabled = true;
container.appendChild(renderer.domElement);

const dimensionLabel = document.createElement('div');
dimensionLabel.id = 'dimension-label';
dimensionLabel.textContent = '';
dimensionLabel.style.display = 'none';
container.appendChild(dimensionLabel);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, params.height * 0.5, 0);

const ambient = new AmbientLight(0xffffff, 0.7);
const sun = new DirectionalLight(0xffffff, 0.9);
sun.position.set(150, 300, 200);
const grid = new GridHelper(2000, 200, 0x4a4a4a, 0x2a2a2a);
const majorGrid = new GridHelper(2000, 40, 0xb5b5b5, 0xb5b5b5);
configureGridMaterial(grid, 0.3);
configureGridMaterial(majorGrid, 0.55);
scene.add(ambient, sun, grid, majorGrid);

const sectionPlane = new Plane(new Vector3(1, 0, 0), 0);
const sectionLineMaterial = new LineBasicMaterial({
  color: 0xff5c8a,
  transparent: true,
  opacity: 0.95
});
const sectionLines = new LineSegments(new BufferGeometry(), sectionLineMaterial);
sectionLines.visible = false;
scene.add(sectionLines);

const boundingBox = new Box3();
const boundingBoxHelper = new Box3Helper(boundingBox, 0xf7ad2b);
boundingBoxHelper.visible = false;
scene.add(boundingBoxHelper);

const material = new MeshStandardMaterial({
  color: 0x9ed5ff,
  roughness: 0.35,
  metalness: 0.15,
  side: DoubleSide,
  wireframe: params.showWireframe
});

const scratchSize = new Vector3();
let cachedVolume = 0;
const metricsState = {
  volumeMM3: '0',
  volumeCM3: '0',
  volumeL: '0',
  internalVolumeMM3: '0',
  internalVolumeCM3: '0',
  internalVolumeL: '0'
};
let metricsControllers: Array<ReturnType<GUI['add']>> = [];

const vaseMesh = new Mesh(createVaseGeometry(params), material);
cachedVolume = computeMeshVolume(vaseMesh.geometry);
updateVolumeReadout();
scene.add(vaseMesh);

let needsUpdate = false;
let sectionOffsetController: ReturnType<GUI['add']> | null = null;

const getSectionLimit = () => Math.max(params.baseRadius - params.wallThickness, 5);

const updateSectionState = () => {
  const limit = getSectionLimit();
  params.sectionOffset = MathUtils.clamp(params.sectionOffset, -limit, limit);
  if (sectionOffsetController) {
    sectionOffsetController.min(-limit);
    sectionOffsetController.max(limit);
    sectionOffsetController.updateDisplay();
  }
  sectionPlane.constant = -params.sectionOffset;
  material.clippingPlanes = params.sectionEnabled ? [sectionPlane] : [];
  updateSectionLines();
  updateBoundingBoxState();
};

const refreshGeometry = () => {
  needsUpdate = true;
  updateSectionState();
};

function updateSectionLines() {
  if (!params.sectionEnabled) {
    sectionLines.visible = false;
    return;
  }

  const lineGeometry = buildSectionLineGeometry(vaseMesh.geometry, sectionPlane);
  if (!lineGeometry) {
    sectionLines.visible = false;
    return;
  }

  sectionLines.geometry.dispose();
  sectionLines.geometry = lineGeometry;
  sectionLines.visible = true;
}

function updateBoundingBoxState() {
  if (!params.showBoundingBox) {
    boundingBoxHelper.visible = false;
    dimensionLabel.style.display = 'none';
    return;
  }

  vaseMesh.geometry.computeBoundingBox();
  const box = vaseMesh.geometry.boundingBox;
  if (!box) {
    boundingBoxHelper.visible = false;
    dimensionLabel.style.display = 'none';
    return;
  }

  boundingBox.copy(box);
  boundingBoxHelper.visible = true;
  boundingBoxHelper.updateMatrixWorld(true);

  const size = box.getSize(scratchSize);
  dimensionLabel.textContent = `W ${size.x.toFixed(1)} mm × D ${size.z.toFixed(1)} mm × H ${size.y.toFixed(1)} mm`;
  dimensionLabel.style.display = 'block';
}

function updateWireframeState() {
  material.wireframe = params.showWireframe;
  material.needsUpdate = true;
}

function updateVolumeReadout() {
  const volumeMM3 = Math.max(cachedVolume, 0);
  const volumeCM3 = volumeMM3 / 1000;
  const volumeL = volumeMM3 / 1_000_000;
  const internalVolumeMM3 = computeInteriorVolume(params);
  const internalVolumeCM3 = internalVolumeMM3 / 1000;
  const internalVolumeL = internalVolumeMM3 / 1_000_000;
  metricsState.volumeMM3 = volumeMM3.toLocaleString(undefined, { maximumFractionDigits: 0 });
  metricsState.volumeCM3 = volumeCM3.toFixed(1);
  metricsState.volumeL = volumeL.toFixed(3);
  metricsState.internalVolumeMM3 = internalVolumeMM3.toLocaleString(undefined, { maximumFractionDigits: 0 });
  metricsState.internalVolumeCM3 = internalVolumeCM3.toFixed(1);
  metricsState.internalVolumeL = internalVolumeL.toFixed(3);
  metricsControllers.forEach((controller) => controller.updateDisplay());
}

function configureGridMaterial(helper: GridHelper, opacity: number) {
  const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
  materials.forEach((mat) => {
    const lineMaterial = mat as LineBasicMaterial;
    lineMaterial.transparent = true;
    lineMaterial.opacity = opacity;
  });
}

function createVaseGeometry(current: VaseParams): BufferGeometry {
  const radialSegments = Math.max(12, Math.floor(current.radialSegments));
  const heightSegments = Math.max(1, Math.floor(current.heightSegments));
  const outerRadius = current.baseRadius;
  const innerRadius = Math.max(outerRadius - current.wallThickness, 2);
  const bottomThickness = Math.min(Math.max(current.wallThickness * 2, 2), current.height * 0.4);
  const height = Math.max(current.height, bottomThickness + 1);

  const outer = new CylinderGeometry(outerRadius, outerRadius, height, radialSegments, heightSegments, true);
  outer.translate(0, height / 2, 0);

  const innerHeight = Math.max(height - bottomThickness, 1);
  const inner = new CylinderGeometry(innerRadius, innerRadius, innerHeight, radialSegments, heightSegments, true);
  inner.translate(0, bottomThickness + innerHeight / 2, 0);
  inner.scale(-1, 1, 1);

  const base = new CircleGeometry(outerRadius, radialSegments);
  base.rotateX(-Math.PI / 2);
  base.translate(0, 0, 0);

  const innerBase = new CircleGeometry(innerRadius, radialSegments);
  innerBase.rotateX(-Math.PI / 2);
  innerBase.scale(-1, 1, 1);
  innerBase.translate(0, bottomThickness, 0);

  const lip = new RingGeometry(innerRadius, outerRadius, radialSegments);
  lip.rotateX(-Math.PI / 2);
  lip.translate(0, height, 0);

  const merged = mergeGeometries([outer, inner, base, innerBase, lip], false);
  if (!merged) {
    throw new Error('Failed to build vase geometry');
  }

  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function computeInteriorVolume(current: VaseParams): number {
  const outerRadius = current.baseRadius;
  const innerRadius = Math.max(outerRadius - current.wallThickness, 0);
  if (innerRadius <= 0) return 0;
  const bottomThickness = Math.min(Math.max(current.wallThickness * 2, 2), current.height * 0.4);
  const height = Math.max(current.height, bottomThickness + 1);
  const innerHeight = Math.max(height - bottomThickness, 0);
  return Math.PI * innerRadius * innerRadius * innerHeight;
}

function updateVaseMesh() {
  const nextGeometry = createVaseGeometry(params);
  vaseMesh.geometry.dispose();
  vaseMesh.geometry = nextGeometry;
  controls.target.set(0, params.height * 0.5, 0);
  cachedVolume = computeMeshVolume(vaseMesh.geometry);
  updateVolumeReadout();
  updateSectionLines();
  updateBoundingBoxState();
}

const shapeFolder = gui.addFolder('Shape');
shapeFolder.add(params, 'height', 80, 400, 1).name('Height (mm)').onChange(refreshGeometry);
shapeFolder.add(params, 'baseRadius', 20, 80, 1).name('Base radius').onChange(refreshGeometry);
shapeFolder.open();

const wallFolder = gui.addFolder('Structure');
wallFolder.add(params, 'wallThickness', 1, 15, 0.1).name('Wall thickness').onChange(refreshGeometry);
wallFolder.open();

const detailFolder = gui.addFolder('Mesh Detail');
detailFolder.add(params, 'radialSegments', 24, 256, 1).name('Radial segments').onChange(refreshGeometry);
detailFolder.add(params, 'heightSegments', 24, 220, 1).name('Height segments').onChange(refreshGeometry);

detailFolder.open();

const sectionFolder = gui.addFolder('Section View');
sectionFolder.add(params, 'sectionEnabled').name('Enable section').onChange(updateSectionState);
sectionOffsetController = sectionFolder
  .add(params, 'sectionOffset', -getSectionLimit(), getSectionLimit(), 1)
  .name('Offset (mm)')
  .onChange(updateSectionState);
sectionFolder.open();

const viewFolder = gui.addFolder('View');
const viewActions = {
  zoomExtents: () => zoomToVase()
};
viewFolder.add(viewActions, 'zoomExtents').name('Zoom extents');
viewFolder.add(params, 'showBoundingBox').name('Show bounding box').onChange(updateBoundingBoxState);
viewFolder.add(params, 'showWireframe').name('Wireframe view').onChange(updateWireframeState);
viewFolder.open();
updateWireframeState();

const metricsFolder = gui.addFolder('Metrics');
metricsControllers = [
  metricsFolder.add(metricsState, 'volumeMM3').name('Material Vol. (mm³)').listen(),
  metricsFolder.add(metricsState, 'volumeCM3').name('Material Vol. (cm³)').listen(),
  metricsFolder.add(metricsState, 'volumeL').name('Material Vol. (L)').listen(),
  metricsFolder.add(metricsState, 'internalVolumeMM3').name('Internal Vol. (mm³)').listen(),
  metricsFolder.add(metricsState, 'internalVolumeCM3').name('Internal Vol. (cm³)').listen(),
  metricsFolder.add(metricsState, 'internalVolumeL').name('Internal Vol. (L)').listen()
];
metricsControllers.forEach((controller) => {
  controller.domElement.querySelector('input')?.setAttribute('readonly', 'true');
});
metricsFolder.open();

const exporterFolder = gui.addFolder('Export');
const exportActions = {
  downloadSTL: () => downloadFile('parametric-vase.stl', stlExporter.parse(vaseMesh, { binary: false })),
  downloadOBJ: () => downloadFile('parametric-vase.obj', objExporter.parse(vaseMesh))
};
exporterFolder.add(exportActions, 'downloadSTL').name('Download STL');
exporterFolder.add(exportActions, 'downloadOBJ').name('Download OBJ');

function downloadFile(filename: string, data: string | ArrayBuffer) {
  const blob = data instanceof ArrayBuffer ? new Blob([data], { type: 'application/octet-stream' }) : new Blob([data], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function zoomToVase() {
  vaseMesh.geometry.computeBoundingSphere();
  const sphere = vaseMesh.geometry.boundingSphere;
  if (!sphere) return;

  const radius = sphere.radius * 1.6;
  const horizontalLength = Math.hypot(camera.position.x, camera.position.z) || 1;
  const offsetX = (camera.position.x / horizontalLength) * radius || radius;
  const offsetZ = (camera.position.z / horizontalLength) * radius || radius;

  camera.position.set(offsetX, sphere.center.y + radius * 0.5, offsetZ);
  camera.near = Math.max(0.1, radius * 0.05);
  camera.far = radius * 10;
  camera.updateProjectionMatrix();
  controls.target.set(0, sphere.center.y, 0);
  controls.update();
}

function buildSectionLineGeometry(geometry: BufferGeometry, plane: Plane, tolerance = 1e-4): BufferGeometry | null {
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return null;

  const indexAttr = geometry.getIndex();
  const segments: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();

  const triCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;
  for (let tri = 0; tri < triCount; tri += 1) {
    const ia = indexAttr ? indexAttr.getX(tri * 3) : tri * 3;
    const ib = indexAttr ? indexAttr.getX(tri * 3 + 1) : tri * 3 + 1;
    const ic = indexAttr ? indexAttr.getX(tri * 3 + 2) : tri * 3 + 2;

    a.fromBufferAttribute(positionAttr, ia);
    b.fromBufferAttribute(positionAttr, ib);
    c.fromBufferAttribute(positionAttr, ic);

    const da = plane.distanceToPoint(a);
    const db = plane.distanceToPoint(b);
    const dc = plane.distanceToPoint(c);

    if (Math.abs(da) < tolerance && Math.abs(db) < tolerance && Math.abs(dc) < tolerance) {
      // Triangle lies on the plane; add all edges
      segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
      segments.push(b.x, b.y, b.z, c.x, c.y, c.z);
      segments.push(c.x, c.y, c.z, a.x, a.y, a.z);
      continue;
    }

    const intersections: Vector3[] = [];
    computeIntersection(a, b, da, db, plane, intersections, tolerance);
    computeIntersection(b, c, db, dc, plane, intersections, tolerance);
    computeIntersection(c, a, dc, da, plane, intersections, tolerance);

    if (intersections.length >= 2) {
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const p1 = intersections[i];
        const p2 = intersections[i + 1];
        segments.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
  }

  if (!segments.length) {
    return null;
  }

  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new Float32BufferAttribute(segments, 3));
  return lineGeometry;
}

function computeIntersection(
  p1: Vector3,
  p2: Vector3,
  d1: number,
  d2: number,
  plane: Plane,
  bucket: Vector3[],
  tolerance: number
) {
  const hasSignChange = (d1 > tolerance && d2 < -tolerance) || (d1 < -tolerance && d2 > tolerance);
  const onPlane1 = Math.abs(d1) <= tolerance;
  const onPlane2 = Math.abs(d2) <= tolerance;

  if (onPlane1 && onPlane2) {
    bucket.push(p1.clone(), p2.clone());
    return;
  }

  if (onPlane1) {
    bucket.push(p1.clone());
    return;
  }

  if (onPlane2) {
    bucket.push(p2.clone());
    return;
  }

  if (!hasSignChange) {
    return;
  }

  const t = d1 / (d1 - d2);
  if (t >= 0 && t <= 1) {
    bucket.push(p1.clone().lerp(p2, t));
  }
}

function computeMeshVolume(geometry: BufferGeometry): number {
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return 0;

  const indexAttr = geometry.getIndex();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let volume = 0;

  const triangleCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;
  for (let tri = 0; tri < triangleCount; tri += 1) {
    const ia = indexAttr ? indexAttr.getX(tri * 3) : tri * 3;
    const ib = indexAttr ? indexAttr.getX(tri * 3 + 1) : tri * 3 + 1;
    const ic = indexAttr ? indexAttr.getX(tri * 3 + 2) : tri * 3 + 2;

    a.fromBufferAttribute(positionAttr, ia);
    b.fromBufferAttribute(positionAttr, ib);
    c.fromBufferAttribute(positionAttr, ic);

    volume += a.dot(b.clone().cross(c));
  }

  return Math.abs(volume / 6);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (needsUpdate) {
    updateVaseMesh();
    needsUpdate = false;
  }
  controls.update();
  renderer.render(scene, camera);
});

refreshGeometry();
updateSectionState();
