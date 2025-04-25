import * as THREE from 'three';
import { WorkerManager } from './worker_manager';

class PointCloudGenerator {
    private gl: WebGL2RenderingContext | WebGLRenderingContext;
    private tempFramebuffer: WebGLFramebuffer;

    private yStart: number = 0;
    private xStart: number = 0;
    private yInc: number = 5;
    private xInc: number = 5;

    private workerManager: WorkerManager;

    private scene: THREE.Scene;

    constructor(gl: WebGL2RenderingContext | WebGLRenderingContext, scene: THREE.Scene) {
        this.gl = gl;
        this.tempFramebuffer = this.gl.createFramebuffer();

        this.scene = scene;

        this.workerManager = new WorkerManager();
    }

    public createPointCloudData(depthInfo: XRCPUDepthInformation, view: XRView, baseLayer: XRWebGLLayer,
        webXRTexture: WebGLTexture, cameraWidth: number, cameraHeight: number) {        
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.tempFramebuffer);
        this.gl.framebufferTexture2D(
            this.gl.FRAMEBUFFER, 
            this.gl.COLOR_ATTACHMENT0, 
            this.gl.TEXTURE_2D, 
            webXRTexture, 
            0
        );
        // Read pixels from the texture
        const pixels = new Uint8Array(cameraWidth * cameraHeight * 4);
        this.gl.readPixels(0, 0, cameraWidth, cameraHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
        // Clean up
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, baseLayer?.framebuffer as WebGLFramebuffer);

        const cfg: WorkerConfig = {
            depthBuffer: new Uint8Array(depthInfo.data),
            width: depthInfo.width,
            height: depthInfo.height,
            rawValueToMeters: depthInfo.rawValueToMeters,
            normDepthBufferFromNormView: depthInfo.normDepthBufferFromNormView.matrix,
            cameraWidth,
            cameraHeight,
            pixels, // from readPixels
            projectionMatrix: view.projectionMatrix,
            viewMatrix: view.transform.matrix,
            xStart: this.xStart,
            yStart: this.yStart,
            xInc: this.xInc,
            yInc: this.yInc,
        };
        
        const wrapper = this.workerManager.getIdleWorker();
        if(wrapper){
            wrapper.busy = true;
            const { worker } = wrapper;
        
            const onMessage = (e: MessageEvent<{ positions: Float32Array; colors: Float32Array }>) => {
                wrapper.busy = false;
                worker.removeEventListener('message', onMessage); // Prevent stacking
                this.addPointCloud(e.data);
            };
        
            worker.addEventListener('message', onMessage);
            worker.postMessage(cfg, [cfg.depthBuffer.buffer, cfg.pixels.buffer]);
        
        }else{
            console.warn('All workers are busy. Consider queuing this task.');
        }

        this.xStart = (this.xStart + Math.floor(Math.random() * this.xInc)) % (this.xInc + 1);
        this.yStart = (this.yStart + Math.floor(Math.random() * this.yInc)) % (this.yInc + 1);
    }

    private addPointCloud(pointCloudData: {positions: Float32Array, colors: Float32Array}) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(pointCloudData.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(pointCloudData.colors, 3));
    
        const material = new THREE.PointsMaterial({
            size: 0.005,
            vertexColors: true, // Enable vertex coloring
            sizeAttenuation: true
        });
    
        const pointCloud = new THREE.Points(geometry, material);
        this.scene.add(pointCloud);
    }
};

interface WorkerConfig {
    depthBuffer: Uint8Array;
    width: number;
    height: number;
    rawValueToMeters: number;
    normDepthBufferFromNormView: Float32Array;
    cameraWidth: number;
    cameraHeight: number;
    pixels: Uint8Array;
    projectionMatrix: Float32Array;
    viewMatrix: Float32Array;
    xStart: number;
    yStart: number;
    xInc: number;
    yInc: number;
}

export default PointCloudGenerator;
export {WorkerConfig};

