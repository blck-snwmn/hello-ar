import {
  AlwaysStencilFunc,
  BoxGeometry,
  Color,
  DoubleSide,
  EqualStencilFunc,
  GridHelper,
  Group,
  HemisphereLight,
  KeepStencilOp,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  ReplaceStencilOp,
  Scene,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { constructSpherePoints, SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

type WallHitTestFrame = {
  getHitTestResults(source: WallHitTestSource): WallHitTestResult[];
};

type WallHitTestSource = {
  cancel(): void;
};

type WallAnchor = {
  anchorSpace: XRSpace;
  delete(): void;
};

type WallHitTestResult = {
  getPose(baseSpace: XRReferenceSpace): XRPose | null;
  createAnchor?: () => Promise<WallAnchor>;
};

type XRSessionWithHitTest = XRSession & {
  requestHitTestSource(options: { space: XRReferenceSpace }): Promise<WallHitTestSource>;
};

const portalWidth = 0.46;
const portalHeight = 0.62;
const frameThickness = 0.045;
const frameDepth = 0.018;
const portalBottom = 0;
const portalCenterY = portalBottom + portalHeight / 2;
const openingWidth = portalWidth - frameThickness * 2;
const openingHeight = portalHeight - frameThickness * 2;
const openingBottom = portalBottom + frameThickness;
const openingCenterY = openingBottom + openingHeight / 2;
const maxWallNormalY = 0.35;

const trackingSpaceTypes: XRReferenceSpaceType[] = ["local-floor", "local", "unbounded"];

const sceneRootElement = document.querySelector<HTMLDivElement>("#scene-root");
const startButtonElement = document.querySelector<HTMLButtonElement>("#start-ar");
const statusTextElement = document.querySelector<HTMLParagraphElement>("#status");

if (!sceneRootElement || !startButtonElement || !statusTextElement) {
  throw new Error("Required AR UI elements are missing.");
}

const sceneRoot = sceneRootElement;
const startButton = startButtonElement;
const statusText = statusTextElement;

const scene = new Scene();
const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 40);
camera.position.set(1.4, 1.1, 2.2);
camera.lookAt(0, 0.35, 0);

const renderer = new WebGLRenderer({ antialias: true, alpha: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
sceneRoot.appendChild(renderer.domElement);

const spark = new SparkRenderer({ renderer });
spark.renderOrder = 1;
spark.material.stencilWrite = true;
spark.material.stencilRef = 1;
spark.material.stencilFunc = EqualStencilFunc;
spark.material.stencilFail = KeepStencilOp;
spark.material.stencilZFail = KeepStencilOp;
spark.material.stencilZPass = KeepStencilOp;
scene.add(spark);

const light = new HemisphereLight(0xffffff, 0x586058, 2.6);
scene.add(light);

const grid = new GridHelper(3, 12, 0x8ff0b8, 0x3f4942);
grid.position.y = -0.01;
scene.add(grid);

const portalAnchor = new Group();
const sampleSplat = new SplatMesh({
  constructSplats: (splats) =>
    constructSpherePoints({
      splats,
      radius: 0.1,
      maxDepth: 4,
      pointRadius: 0.008,
      pointThickness: 0.003,
      color: (color, point) => {
        const blend = (point.y + 0.1) / 0.2;
        color.set(0xff6b9d).lerp(new Color(0x79f4e8), Math.max(0, Math.min(1, blend)));
      },
    }),
});
sampleSplat.position.set(0, openingCenterY, -0.38);
const portalModel = new Group();
portalModel.position.y = -portalCenterY;
portalModel.add(createPortalWindow());
portalModel.add(sampleSplat);
portalAnchor.add(portalModel);
portalAnchor.position.y = portalCenterY;
scene.add(portalAnchor);

const reticle = new Mesh(
  new RingGeometry(0.055, 0.075, 48),
  new MeshBasicMaterial({ color: 0x8ff0b8, side: DoubleSide }),
);
reticle.visible = false;
scene.add(reticle);

const scanMarker = new Mesh(
  new BoxGeometry(0.035, 0.035, 0.035),
  new MeshBasicMaterial({ color: 0xf7c95f }),
);
scanMarker.visible = false;
scene.add(scanMarker);

let currentSession: XRSession | null = null;
let hitTestSource: WallHitTestSource | null = null;
let localReferenceSpace: XRReferenceSpace | null = null;
let currentAnchor: WallAnchor | null = null;
let latestWallHitResult: WallHitTestResult | null = null;
let placedCount = 0;
let hasSurface = false;
const cameraPosition = new Vector3();
const cameraDirection = new Vector3();
const portalPosition = new Vector3();
const surfaceNormal = new Vector3();
const wallNormal = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const portalForward = new Vector3(0, 0, 1);
const hitPoseMatrix = new Matrix4();

function createPortalWindow() {
  const portal = new Group();
  const frameFrontMaterial = new MeshBasicMaterial({ color: 0x18262d });
  const frameSideMaterial = new MeshBasicMaterial({ color: 0x4a9eaa });
  const frameMaterials = [
    frameSideMaterial,
    frameSideMaterial,
    frameSideMaterial,
    frameSideMaterial,
    frameFrontMaterial,
    frameSideMaterial,
  ];
  const rimMaterial = new MeshBasicMaterial({ color: 0x79f4e8 });
  const roomMaterial = createPortalMaterial(0x071b2b);
  const roomDepth = 0.68;

  const addBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: MeshBasicMaterial | MeshBasicMaterial[],
  ) => {
    const part = new Mesh(new BoxGeometry(width, height, depth), material);
    part.position.set(x, y, z);
    part.renderOrder = 2;
    portal.add(part);
  };

  const portalMask = new Mesh(
    new PlaneGeometry(openingWidth, openingHeight),
    new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: AlwaysStencilFunc,
      stencilFail: ReplaceStencilOp,
      stencilZFail: ReplaceStencilOp,
      stencilZPass: ReplaceStencilOp,
    }),
  );
  portalMask.position.set(0, openingCenterY, -0.001);
  portalMask.renderOrder = 0;
  portal.add(portalMask);

  addBox(
    frameThickness,
    portalHeight,
    frameDepth,
    -portalWidth / 2 + frameThickness / 2,
    portalCenterY,
    frameDepth / 2,
    frameMaterials,
  );
  addBox(
    frameThickness,
    portalHeight,
    frameDepth,
    portalWidth / 2 - frameThickness / 2,
    portalCenterY,
    frameDepth / 2,
    frameMaterials,
  );
  addBox(
    portalWidth - frameThickness * 2,
    frameThickness,
    frameDepth,
    0,
    portalBottom + frameThickness / 2,
    frameDepth / 2,
    frameMaterials,
  );
  addBox(
    portalWidth - frameThickness * 2,
    frameThickness,
    frameDepth,
    0,
    portalBottom + portalHeight - frameThickness / 2,
    frameDepth / 2,
    frameMaterials,
  );

  const rimSize = 0.007;
  addBox(
    rimSize,
    openingHeight,
    frameDepth + 0.004,
    -openingWidth / 2,
    openingCenterY,
    frameDepth / 2,
    rimMaterial,
  );
  addBox(
    rimSize,
    openingHeight,
    frameDepth + 0.004,
    openingWidth / 2,
    openingCenterY,
    frameDepth / 2,
    rimMaterial,
  );
  addBox(openingWidth, rimSize, frameDepth + 0.004, 0, openingBottom, frameDepth / 2, rimMaterial);
  addBox(
    openingWidth,
    rimSize,
    frameDepth + 0.004,
    0,
    openingBottom + openingHeight,
    frameDepth / 2,
    rimMaterial,
  );

  const backWall = new Mesh(new PlaneGeometry(openingWidth, openingHeight), roomMaterial);
  backWall.position.set(0, openingCenterY, -roomDepth);
  backWall.renderOrder = 1;
  portal.add(backWall);

  const floor = new Mesh(new PlaneGeometry(openingWidth, roomDepth), roomMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, openingBottom, -roomDepth / 2);
  floor.renderOrder = 1;
  portal.add(floor);

  const ceiling = new Mesh(new PlaneGeometry(openingWidth, roomDepth), roomMaterial);
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.set(0, openingBottom + openingHeight, -roomDepth / 2);
  ceiling.renderOrder = 1;
  portal.add(ceiling);

  const sideGeometry = new PlaneGeometry(roomDepth, openingHeight);
  const leftWall = new Mesh(sideGeometry, roomMaterial);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-openingWidth / 2, openingCenterY, -roomDepth / 2);
  leftWall.renderOrder = 1;
  portal.add(leftWall);

  const rightWall = new Mesh(sideGeometry, roomMaterial);
  rightWall.rotation.y = Math.PI / 2;
  rightWall.position.x = openingWidth / 2;
  rightWall.position.y = openingCenterY;
  rightWall.position.z = -roomDepth / 2;
  rightWall.renderOrder = 1;
  portal.add(rightWall);

  const halo = new Mesh(
    new TorusGeometry(0.135, 0.005, 8, 72),
    new MeshBasicMaterial({ color: 0x79f4e8 }),
  );
  applyPortalStencil(halo.material);
  halo.position.set(0, openingCenterY, -0.64);
  halo.renderOrder = 1;
  portal.add(halo);

  const horizonMaterial = new MeshBasicMaterial({ color: 0xff6b9d });
  applyPortalStencil(horizonMaterial);
  const horizon = new Mesh(new BoxGeometry(openingWidth, 0.005, 0.005), horizonMaterial);
  horizon.position.set(0, openingCenterY - 0.15, -0.64);
  horizon.renderOrder = 1;
  portal.add(horizon);

  return portal;
}

function applyPortalStencil(material: MeshBasicMaterial) {
  material.stencilWrite = true;
  material.stencilRef = 1;
  material.stencilFunc = EqualStencilFunc;
  material.stencilFail = KeepStencilOp;
  material.stencilZFail = KeepStencilOp;
  material.stencilZPass = KeepStencilOp;
}

function createPortalMaterial(color: number) {
  const material = new MeshBasicMaterial({ color, side: DoubleSide });
  applyPortalStencil(material);
  return material;
}

function setStatus(message: string) {
  statusText.textContent = message;
}

async function checkSupport() {
  if (!("xr" in navigator) || !navigator.xr) {
    setStatus("WebXR is not available in this browser.");
    return;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) {
    setStatus("AR is not supported on this device/browser.");
    return;
  }

  startButton.disabled = false;
  setStatus("準備完了。Android ChromeでARを開始してください。");
}

async function startArSession() {
  if (!navigator.xr || currentSession) {
    return;
  }

  const session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay", "local-floor", "unbounded", "anchors"],
    domOverlay: { root: document.body },
  });

  currentSession = session;
  document.body.classList.add("is-ar-active");
  startButton.disabled = true;
  grid.visible = false;
  portalAnchor.visible = false;
  hasSurface = false;
  setStatus("壁を探しています。平らな壁へ端末を向け、ゆっくり動かしてください。");

  session.addEventListener("end", () => {
    currentSession = null;
    document.body.classList.remove("is-ar-active");
    hitTestSource?.cancel();
    hitTestSource = null;
    currentAnchor?.delete();
    currentAnchor = null;
    latestWallHitResult = null;
    localReferenceSpace = null;
    reticle.visible = false;
    scanMarker.visible = false;
    hasSurface = false;
    grid.visible = true;
    portalAnchor.visible = true;
    startButton.disabled = false;
    setStatus(`ARを終了しました。窓の配置回数: ${placedCount}`);
  });

  session.addEventListener("select", async () => {
    if (!reticle.visible) {
      setStatus("まだ壁を探しています。緑のリングが壁に出てからタップしてください。");
      return;
    }

    const selectedPosition = reticle.position.clone();
    const selectedNormal = wallNormal.clone();
    const selectedHitResult = latestWallHitResult;

    currentAnchor?.delete();
    currentAnchor = null;
    placePortalAtSurface(selectedPosition, selectedNormal);
    portalAnchor.visible = true;
    placedCount += 1;

    if (selectedHitResult?.createAnchor) {
      try {
        currentAnchor = await selectedHitResult.createAnchor();
        setStatus("窓を壁に固定しました。端末を左右に動かして奥行きを確認できます。");
        return;
      } catch {
        // Fall back to the wall pose when the device exposes but rejects anchors.
      }
    }

    setStatus("窓を壁面へ配置しました。端末を左右に動かして奥行きを確認できます。");
  });

  await renderer.xr.setSession(session);

  const viewerReferenceSpace = await session.requestReferenceSpace("viewer");
  localReferenceSpace = await requestTrackingSpace(session);
  const requestedHitTestSource = await (session as XRSessionWithHitTest).requestHitTestSource({
    space: viewerReferenceSpace,
  });
  if (!requestedHitTestSource) {
    throw new Error("Hit-test source is not available on this device.");
  }
  hitTestSource = requestedHitTestSource;
}

async function requestTrackingSpace(session: XRSession) {
  const errors: string[] = [];

  for (const type of trackingSpaceTypes) {
    try {
      const referenceSpace = await session.requestReferenceSpace(type);
      setStatus(`壁を探しています。トラッキング: ${type}`);
      return referenceSpace;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${type}: ${message}`);
    }
  }

  throw new Error(`No supported tracking reference space. ${errors.join(" / ")}`);
}

function onAnimationFrame(_time: DOMHighResTimeStamp, frame?: XRFrame) {
  if (frame && hitTestSource && localReferenceSpace) {
    const results = (frame as unknown as WallHitTestFrame).getHitTestResults(hitTestSource);
    const wallHit = findWallHit(results, localReferenceSpace);

    if (wallHit) {
      latestWallHitResult = wallHit.result;
      reticle.visible = true;
      hitPoseMatrix.fromArray(wallHit.pose.transform.matrix);
      reticle.position.setFromMatrixPosition(hitPoseMatrix);
      reticle.quaternion.setFromUnitVectors(portalForward, wallNormal);
      scanMarker.visible = false;
      if (!hasSurface) {
        hasSurface = true;
        setStatus("壁を検出しました。緑のリングをタップして窓を置きます。");
      }
    }

    if (!wallHit) {
      latestWallHitResult = null;
      reticle.visible = false;
      hasSurface = false;
      showScanMarker();
    }

    updateAnchoredPortal(frame, localReferenceSpace);
  }

  sampleSplat.position.y = openingCenterY + Math.sin(_time * 0.0014) * 0.025;
  renderer.render(scene, camera);
}

function findWallHit(results: WallHitTestResult[], referenceSpace: XRReferenceSpace) {
  for (const result of results) {
    const pose = result.getPose(referenceSpace);
    if (!pose) {
      continue;
    }

    hitPoseMatrix.fromArray(pose.transform.matrix);
    const elements = hitPoseMatrix.elements;
    surfaceNormal.set(elements[4], elements[5], elements[6]).normalize();

    if (Math.abs(surfaceNormal.dot(worldUp)) <= maxWallNormalY) {
      wallNormal.copy(surfaceNormal);
      return { pose, result };
    }
  }

  return null;
}

function updateAnchoredPortal(frame: XRFrame, referenceSpace: XRReferenceSpace) {
  if (!currentAnchor) {
    return;
  }

  const pose = frame.getPose(currentAnchor.anchorSpace, referenceSpace);
  if (!pose) {
    return;
  }

  hitPoseMatrix.fromArray(pose.transform.matrix);
  const elements = hitPoseMatrix.elements;
  surfaceNormal.set(elements[4], elements[5], elements[6]).normalize();
  portalPosition.setFromMatrixPosition(hitPoseMatrix);
  placePortalAtSurface(portalPosition, surfaceNormal);
}

function placePortalAtSurface(position: Vector3, normal: Vector3) {
  portalAnchor.position.copy(position);
  wallNormal.copy(normal);

  camera.getWorldPosition(cameraPosition);
  portalAnchor.getWorldPosition(portalPosition);
  cameraDirection.copy(cameraPosition).sub(portalPosition);
  cameraDirection.y = 0;

  if (wallNormal.dot(cameraDirection) < 0) {
    wallNormal.multiplyScalar(-1);
  }

  portalAnchor.rotation.set(0, Math.atan2(wallNormal.x, wallNormal.z), 0);
}

function showScanMarker() {
  camera.getWorldPosition(cameraPosition);
  camera.getWorldDirection(cameraDirection);
  scanMarker.position.copy(cameraPosition).addScaledVector(cameraDirection, 1.1);
  scanMarker.visible = true;
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

startButton.addEventListener("click", () => {
  startArSession().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Could not start AR: ${message}`);
    startButton.disabled = false;
  });
});

window.addEventListener("resize", resize);
renderer.setAnimationLoop(onAnimationFrame);

checkSupport().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Could not check AR support: ${message}`);
});

sampleSplat.initialized.catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Could not load the sample Gaussian splat: ${message}`);
});
