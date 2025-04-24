import * as THREE from 'three';
import {ARButton} from 'three/examples/jsm/webxr/ARButton';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

// Set up Three.js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true; // Enable WebXR
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0xffffff, 0);
renderer.setAnimationLoop(animate);

const gl = renderer.getContext();
const tempFramebuffer = gl.createFramebuffer();

let glBinding: XRWebGLBinding;

const btn = ARButton.createButton(renderer, {
    requiredFeatures: ['unbounded', 'depth-sensing', 'camera-access'], 
    depthSensing: {
        dataFormatPreference: ['luminance-alpha'],
        usagePreference: ['cpu-optimized']
    }
});
btn.style.backgroundColor = 'black';
document.body.appendChild(btn);

let viewerRefSpace: XRReferenceSpace | null = null;
let baseLayer: XRWebGLLayer | undefined;
let xrSession: XRSession;

async function exportPointCloud() {    
    // Create exporter
    const exporter = new GLTFExporter();
    
    try {
        const gltf = await new Promise((resolve, reject) => {
            exporter.parse(
                scene,
                resolve,
                reject,
                { binary: false, trs: false } // Export as JSON, not binary
            );
        });
        
        downloadGLTF(gltf as unknown as object);
        console.log("Export successful", gltf);
    } catch (error) {
        console.error("Export failed:", error);
    }
}

function downloadGLTF(gltf: object){
    const data = JSON.stringify(gltf, null, 2);
    
    // Create download link
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `pointcloud_${new Date().toISOString()}.gltf`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// Render loop
async function animate(timestamp: DOMHighResTimeStamp, frame: XRFrame) {
    if(frame){
        if(viewerRefSpace === null){
            viewerRefSpace = await renderer.xr.getSession()?.requestReferenceSpace('unbounded') as XRReferenceSpace;
        }

        if(!baseLayer){
            baseLayer = renderer.xr.getSession()?.renderState.baseLayer;
        }

        if(!xrSession){
            xrSession = renderer.xr.getSession() as XRSession;
            xrSession.addEventListener('select', (e)=>{
                exportPointCloud();
            });
        }

        const pose = frame.getViewerPose(viewerRefSpace);
        pose?.views.forEach(view => {
            let camera = view.camera;
            if(!glBinding){
                glBinding = new XRWebGLBinding(xrSession, renderer.getContext());
            }
            const webXRTexture: WebGLTexture = glBinding.getCameraImage(camera);
            const depthInfo = frame.getDepthInformation(view);
            
            if(depthInfo){
                const pointCloud = createColoredPointCloud(depthInfo, view, webXRTexture, camera.width, camera.height);
                renderColoredPointCloud(pointCloud);
            }
        });
    }
    renderer.render(scene, camera);
}


function createColoredPointCloud(depthInfo: XRCPUDepthInformation, view: XRView, webXRTexture: WebGLTexture, cameraWidth: number, cameraHeight: number
): {positions: Float32Array, colors: Float32Array} {
    const positions: number[] = [];
    const colors: number[] = [];
    const width = depthInfo.width;
    const height = depthInfo.height;
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempFramebuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, 
        gl.COLOR_ATTACHMENT0, 
        gl.TEXTURE_2D, 
        webXRTexture, 
        0
    );
    // Read pixels from the texture
    const pixels = new Uint8Array(cameraWidth * cameraHeight * 4);
    gl.readPixels(0, 0, cameraWidth, cameraHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // Clean up
    gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer?.framebuffer as WebGLFramebuffer);
    
    // Create inverse projection matrix
    const projMatrix = new THREE.Matrix4().fromArray(view.projectionMatrix);
    const invProjMatrix = new THREE.Matrix4().copy(projMatrix).invert();
    const viewMatrix = new THREE.Matrix4().fromArray(view.transform.matrix);

    for (let y = 0; y < height; y += 5) { // Reduced density for performance
        for (let x = 0; x < width; x += 5) {
            const u = x / width;
            const v = y / height;

            const depth = depthInfo.getDepthInMeters(u, v);
            if (!depth || isNaN(depth)) continue;

            // Calculate corresponding camera pixel coordinates
            const cameraX = Math.floor(u * cameraWidth);
            const cameraY = Math.floor((v) * cameraHeight); // Flip Y
            const pixelIndex = (cameraY * cameraWidth + cameraX) * 4;
            const r = pixels[pixelIndex] / 255;
            const g = pixels[pixelIndex + 1] / 255;
            const b = pixels[pixelIndex + 2] / 255;

            // Normalized device coordinates (NDC)
            const ndcX = (x / width) * 2 - 1;
            const ndcY = (y / height) * 2 - 1;

            // Clip coordinates
            const clipCoord = new THREE.Vector4(ndcX, ndcY, -1, 1);

            // Eye (camera) space
            const eyeCoord = clipCoord.applyMatrix4(invProjMatrix);
            const eyePos = new THREE.Vector3(
                eyeCoord.x * depth,
                eyeCoord.y * depth,
                -depth
            );

            // World space
            const worldPos = eyePos.applyMatrix4(viewMatrix);
            
            positions.push(worldPos.x, worldPos.y, worldPos.z);
            colors.push(r, g, b);
        }
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors)
    };
}

function renderColoredPointCloud(pointCloudData: {positions: Float32Array, colors: Float32Array}) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pointCloudData.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(pointCloudData.colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.01,
        vertexColors: true, // Enable vertex coloring
        sizeAttenuation: true
    });

    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);
}

