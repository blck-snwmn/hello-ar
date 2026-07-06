interface Navigator {
	xr?: XRSystem;
}

interface XRSystem {
	isSessionSupported(mode: XRSessionMode): Promise<boolean>;
	requestSession(mode: XRSessionMode, options?: XRSessionInit): Promise<XRSession>;
}

type XRSessionMode = 'immersive-ar';

interface XRSessionInit {
	requiredFeatures?: string[];
	optionalFeatures?: string[];
	domOverlay?: {
		root: Element;
	};
}

interface XRSession extends EventTarget {
	requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
	addEventListener(type: 'end' | 'select', listener: () => void): void;
}

type XRReferenceSpaceType = 'viewer' | 'local' | 'local-floor' | 'unbounded';

interface XRReferenceSpace {}

interface XRFrame {}

interface XRPose {
	transform: {
		matrix: Float32Array;
	};
}
