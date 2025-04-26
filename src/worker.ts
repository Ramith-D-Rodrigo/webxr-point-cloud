import * as THREE from 'three';
import { WorkerConfig } from './point_cloud';


self.addEventListener('message', (ev: MessageEvent<WorkerConfig>) => {
    const cfg = ev.data;
    const positions: number[] = [];
    const colors: number[] = [];

    const projMatrix = new THREE.Matrix4().fromArray(cfg.projectionMatrix);
    const invProjMatrix = new THREE.Matrix4().copy(projMatrix).invert();
    const viewMatrixInv = new THREE.Matrix4().fromArray(cfg.viewMatrixInv);

    for (let y = cfg.yStart; y < cfg.height; y += cfg.yInc) {
        for (let x = cfg.xStart; x < cfg.width; x += cfg.xInc) {
            const u = x / cfg.width;
            const v = y / cfg.height;
    
            const depth = getDepthInMeters(u, v, cfg);
            if (!depth || isNaN(depth)) continue;
    
            const camX = Math.floor(u * cfg.cameraWidth);
            const camY = Math.floor(v * cfg.cameraHeight);
            const pixelIndex = (camY * cfg.cameraWidth + camX) * 4;
    
            const r = cfg.pixels[pixelIndex] / 255;
            const g = cfg.pixels[pixelIndex + 1] / 255;
            const b = cfg.pixels[pixelIndex + 2] / 255;
    
            const ndcX = (x / cfg.width) * 2 - 1;
            const ndcY = (y / cfg.height) * 2 - 1;
    
            const clipCoord = new THREE.Vector4(ndcX, ndcY, -1, 1);

            // eye / camera space
            const eyeCoord = clipCoord.applyMatrix4(invProjMatrix);
            const eyePos = new THREE.Vector3(
                eyeCoord.x * depth,
                eyeCoord.y * depth,
                -depth
            );

            // World space
            const worldPos = eyePos.applyMatrix4(viewMatrixInv);    
            positions.push(worldPos.x, worldPos.y, worldPos.z);
            colors.push(r, g, b);
        }
    }

    self.postMessage({
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
    });
});

function getDepthInMeters(u: number, v: number, cfg: WorkerConfig): number {
    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) return NaN;

    const normViewCoord = new THREE.Vector4(u, v, 0.0, 1.0);
    const normViewMatrix = new THREE.Matrix4().fromArray(cfg.normDepthBufferFromNormView);
    const normDepthCoord = normViewCoord.applyMatrix4(normViewMatrix);

    const fx = normDepthCoord.x * cfg.width;
    const fy = normDepthCoord.y * cfg.height;

    const col = Math.min(cfg.width - 1, Math.max(0, Math.trunc(fx)));
    const row = Math.min(cfg.height - 1, Math.max(0, Math.trunc(fy)));

    const index = row * cfg.width + col;
    const byteIndex = index * 2;    // Because we are using luminance-alpha that has 2 bytes

    const luminance = cfg.depthBuffer[byteIndex];
    const alpha = cfg.depthBuffer[byteIndex + 1];
    const rawDepth = (alpha << 8) | luminance;

    return rawDepth * cfg.rawValueToMeters;
}
