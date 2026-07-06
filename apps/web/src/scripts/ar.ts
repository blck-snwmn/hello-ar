import {
	BoxGeometry,
	GridHelper,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PerspectiveCamera,
	RingGeometry,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';

type XRFrameWithHitTest = XRFrame & {
	getHitTestResults(source: XRHitTestSource): XRHitTestResult[];
};

type XRHitTestSource = {
	cancel(): void;
};

type XRHitTestResult = {
	getPose(baseSpace: XRReferenceSpace): XRPose | null;
};

type XRSessionWithHitTest = XRSession & {
	requestHitTestSource(options: { space: XRReferenceSpace }): Promise<XRHitTestSource>;
};

const furnitureSize = {
	width: 0.3,
	depth: 0.3,
	height: 0.3,
};

const trackingSpaceTypes: XRReferenceSpaceType[] = ['local-floor', 'local', 'unbounded'];

const sceneRoot = document.querySelector<HTMLDivElement>('#scene-root');
const startButton = document.querySelector<HTMLButtonElement>('#start-ar');
const statusText = document.querySelector<HTMLParagraphElement>('#status');

if (!sceneRoot || !startButton || !statusText) {
	throw new Error('Required AR UI elements are missing.');
}

const scene = new Scene();
const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 40);
camera.position.set(1.4, 1.1, 2.2);
camera.lookAt(0, 0.35, 0);

const renderer = new WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
sceneRoot.append(renderer.domElement);

const light = new HemisphereLight(0xffffff, 0x586058, 2.6);
scene.add(light);

const grid = new GridHelper(3, 12, 0x8ff0b8, 0x3f4942);
grid.position.y = -0.01;
scene.add(grid);

const previewBox = createFurnitureMesh(0.36);
previewBox.position.set(0, furnitureSize.height / 2, 0);
scene.add(previewBox);

const reticle = new Mesh(
	new RingGeometry(0.12, 0.15, 48).rotateX(-Math.PI / 2),
	new MeshBasicMaterial({ color: 0x8ff0b8 }),
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const scanMarker = new Mesh(
	new BoxGeometry(0.06, 0.06, 0.06),
	new MeshBasicMaterial({ color: 0xf7c95f }),
);
scanMarker.visible = false;
scene.add(scanMarker);

let currentSession: XRSession | null = null;
let hitTestSource: XRHitTestSource | null = null;
let localReferenceSpace: XRReferenceSpace | null = null;
let placedCount = 0;
let hasSurface = false;
const cameraPosition = new Vector3();
const cameraDirection = new Vector3();

function createFurnitureMesh(opacity = 0.86) {
	const geometry = new BoxGeometry(furnitureSize.width, furnitureSize.height, furnitureSize.depth);
	const material = new MeshStandardMaterial({
		color: 0xd8c7a3,
		metalness: 0.08,
		roughness: 0.72,
		transparent: opacity < 1,
		opacity,
	});
	return new Mesh(geometry, material);
}

function setStatus(message: string) {
	statusText.textContent = message;
}

async function checkSupport() {
	if (!('xr' in navigator) || !navigator.xr) {
		setStatus('WebXR is not available in this browser.');
		return;
	}

	const supported = await navigator.xr.isSessionSupported('immersive-ar');
	if (!supported) {
		setStatus('AR is not supported on this device/browser.');
		return;
	}

	startButton.disabled = false;
	setStatus('Ready. Open this URL on Android Chrome and start AR.');
}

async function startArSession() {
	if (!navigator.xr || currentSession) {
		return;
	}

	const session = await navigator.xr.requestSession('immersive-ar', {
		requiredFeatures: ['hit-test'],
		optionalFeatures: ['dom-overlay', 'local-floor', 'unbounded'],
		domOverlay: { root: document.body },
	});

	currentSession = session;
	document.body.classList.add('is-ar-active');
	startButton.disabled = true;
	grid.visible = false;
	previewBox.visible = false;
	hasSurface = false;
	setStatus('Scanning for a surface. Move the phone slowly across the floor.');

	session.addEventListener('end', () => {
		currentSession = null;
		document.body.classList.remove('is-ar-active');
		hitTestSource?.cancel();
		hitTestSource = null;
		localReferenceSpace = null;
		reticle.visible = false;
		scanMarker.visible = false;
		hasSurface = false;
		grid.visible = true;
		previewBox.visible = true;
		startButton.disabled = false;
		setStatus(`Session ended. Placed ${placedCount} object${placedCount === 1 ? '' : 's'}.`);
	});

	session.addEventListener('select', () => {
		if (!reticle.visible) {
			setStatus('Still scanning. Move slowly; tap only after the green ring appears.');
			return;
		}

		const mesh = createFurnitureMesh();
		mesh.matrix.copy(reticle.matrix);
		mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
		mesh.position.y += furnitureSize.height / 2;
		scene.add(mesh);
		placedCount += 1;
		setStatus(`Placed ${placedCount} object${placedCount === 1 ? '' : 's'}.`);
	});

	await renderer.xr.setSession(session);

	const viewerReferenceSpace = await session.requestReferenceSpace('viewer');
	localReferenceSpace = await requestTrackingSpace(session);
	hitTestSource = await (session as XRSessionWithHitTest).requestHitTestSource({
		space: viewerReferenceSpace,
	});
}

async function requestTrackingSpace(session: XRSession) {
	const errors: string[] = [];

	for (const type of trackingSpaceTypes) {
		try {
			const referenceSpace = await session.requestReferenceSpace(type);
			setStatus(`Scanning for a surface. Tracking: ${type}.`);
			return referenceSpace;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${type}: ${message}`);
		}
	}

	throw new Error(`No supported tracking reference space. ${errors.join(' / ')}`);
}

function onAnimationFrame(_time: DOMHighResTimeStamp, frame?: XRFrame) {
	if (frame && hitTestSource && localReferenceSpace) {
		const results = (frame as XRFrameWithHitTest).getHitTestResults(hitTestSource);
		if (results.length > 0) {
			const pose = results[0].getPose(localReferenceSpace);
			if (pose) {
				reticle.visible = true;
				reticle.matrix.fromArray(pose.transform.matrix);
				reticle.matrixWorldNeedsUpdate = true;
				scanMarker.visible = false;
				if (!hasSurface) {
					hasSurface = true;
					setStatus('Surface found. Tap the green ring to place the box.');
				}
			}
		}
		if (results.length === 0) {
			reticle.visible = false;
			hasSurface = false;
			showScanMarker();
		}
	}

	renderer.render(scene, camera);
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

startButton.addEventListener('click', () => {
	startArSession().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`Could not start AR: ${message}`);
		startButton.disabled = false;
	});
});

window.addEventListener('resize', resize);
renderer.setAnimationLoop(onAnimationFrame);

checkSupport().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	setStatus(`Could not check AR support: ${message}`);
});
