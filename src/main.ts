import './styles.css';
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  LatheGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  Vector2,
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
  bellyRadius: number;
  neckRadius: number;
  lipRadius: number;
  neckHeightRatio: number;
  profileBias: number;
  wallThickness: number;
  radialSegments: number;
  heightSegments: number;
}

const gui = new GUI({ width: 320 });
const stlExporter = new STLExporter();
const objExporter = new OBJExporter();

const params: VaseParams = {
  height: 220,
  baseRadius: 45,
  bellyRadius: 85,
  neckRadius: 32,
  lipRadius: 46,
  neckHeightRatio: 0.32,
  profileBias: 0.75,
  wallThickness: 4,
  radialSegments: 96,
  heightSegments: 110
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
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, params.height * 0.5, 0);

const ambient = new AmbientLight(0xffffff, 0.7);
const sun = new DirectionalLight(0xffffff, 0.9);
sun.position.set(150, 300, 200);
scene.add(ambient, sun);

const material = new MeshStandardMaterial({
  color: 0x9ed5ff,
  roughness: 0.35,
  metalness: 0.15,
  side: DoubleSide
});

const vaseMesh = new Mesh(createVaseGeometry(params), material);
scene.add(vaseMesh);

let needsUpdate = false;

const refreshGeometry = () => {
  needsUpdate = true;
};

function createVaseGeometry(current: VaseParams): BufferGeometry {
  const radialSegments = Math.max(12, Math.floor(current.radialSegments));
  const heightSegments = Math.max(8, Math.floor(current.heightSegments));
  const outerProfile = buildProfilePoints(heightSegments, current, false);
  const innerProfile = buildProfilePoints(heightSegments, current, true);

  const outer = new LatheGeometry(outerProfile, radialSegments);
  const inner = new LatheGeometry(innerProfile, radialSegments);
  inner.scale(-1, 1, 1);

  const base = new RingGeometry(innerProfile[0].x, outerProfile[0].x, radialSegments);
  base.rotateX(Math.PI / 2);
  base.translate(0, outerProfile[0].y, 0);

  const merged = mergeGeometries([outer, inner, base], false);
  if (!merged) {
    throw new Error('Failed to build vase geometry');
  }

  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function buildProfilePoints(segments: number, settings: VaseParams, isInner: boolean): Vector2[] {
  const points: Vector2[] = [];
  const lipGuard = settings.wallThickness * 0.25;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const radius = Math.max(
      computeRadius(t, settings) - (isInner ? settings.wallThickness : 0),
      lipGuard
    );
    const y = t * settings.height;
    points.push(new Vector2(radius, y));
  }
  return points;
}

function computeRadius(t: number, settings: VaseParams): number {
  const bellyInfluence = Math.pow(Math.sin(Math.PI * t), settings.profileBias);
  const lowerBlend = MathUtils.lerp(settings.baseRadius, settings.bellyRadius, bellyInfluence);

  const neckStart = 1 - MathUtils.clamp(settings.neckHeightRatio, 0.05, 0.9);
  const neckT = MathUtils.clamp((t - neckStart) / (1 - neckStart), 0, 1);
  const neckBlend = MathUtils.lerp(settings.bellyRadius, settings.neckRadius, Math.pow(neckT, 0.85));

  const lipBlend = MathUtils.lerp(settings.neckRadius, settings.lipRadius, Math.pow(neckT, 1.6));

  if (t <= neckStart) {
    return lowerBlend;
  }
  return MathUtils.lerp(neckBlend, lipBlend, neckT);
}

function updateVaseMesh() {
  const nextGeometry = createVaseGeometry(params);
  vaseMesh.geometry.dispose();
  vaseMesh.geometry = nextGeometry;
  controls.target.set(0, params.height * 0.5, 0);
}

const shapeFolder = gui.addFolder('Shape');
shapeFolder.add(params, 'height', 80, 400, 1).name('Height (mm)').onChange(refreshGeometry);
shapeFolder.add(params, 'baseRadius', 20, 80, 1).name('Base radius').onChange(refreshGeometry);
shapeFolder.add(params, 'bellyRadius', 30, 130, 1).name('Belly radius').onChange(refreshGeometry);
shapeFolder.add(params, 'neckRadius', 10, 80, 1).name('Neck radius').onChange(refreshGeometry);
shapeFolder.add(params, 'lipRadius', 10, 120, 1).name('Lip radius').onChange(refreshGeometry);
shapeFolder.add(params, 'neckHeightRatio', 0.1, 0.9, 0.01).name('Neck height ratio').onChange(refreshGeometry);
shapeFolder.add(params, 'profileBias', 0.25, 2, 0.01).name('Profile bias').onChange(refreshGeometry);
shapeFolder.open();

const wallFolder = gui.addFolder('Structure');
wallFolder.add(params, 'wallThickness', 1, 15, 0.1).name('Wall thickness').onChange(refreshGeometry);
wallFolder.open();

const detailFolder = gui.addFolder('Mesh Detail');
detailFolder.add(params, 'radialSegments', 24, 256, 1).name('Radial segments').onChange(refreshGeometry);
detailFolder.add(params, 'heightSegments', 24, 220, 1).name('Height segments').onChange(refreshGeometry);

detailFolder.open();

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
