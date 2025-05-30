import * as THREE from 'three';
import { WorkerManager } from './worker_manager';

class PointCloudGenerator {
    private gl: WebGL2RenderingContext | WebGLRenderingContext;
    private tempFramebuffer: WebGLFramebuffer;

    private yStart: number = 0;
    private xStart: number = 0;
    private yInc: number = 10;
    private xInc: number = 10;

    private useWorkers: boolean;
    private workerManager: WorkerManager | undefined;

    private scene: THREE.Scene;
    private generatedPointClouds: THREE.Points[] = [];
    private pointCloudsEnabled: boolean = true;

    constructor(gl: WebGL2RenderingContext | WebGLRenderingContext, scene: THREE.Scene, useWorkers: boolean) {
        this.gl = gl;
        this.tempFramebuffer = this.gl.createFramebuffer();

        this.scene = scene;
        this.useWorkers = useWorkers;

        if(this.useWorkers){
            this.workerManager = new WorkerManager();
        }
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

        if(!this.useWorkers){
            const positions: number[] = [];
            const colors: number[] = [];

            const projMatrix = new THREE.Matrix4().fromArray(view.projectionMatrix);
            const invProjMatrix = new THREE.Matrix4().copy(projMatrix).invert();
            const viewMatrixInv = new THREE.Matrix4().fromArray(view.transform.matrix);

            const height = depthInfo.height;
            const width = depthInfo.width;
            for (let y = this.yStart; y < height; y += this.yInc) {
                for (let x = this.xStart; x < width; x += this.xInc) {
                    const u = x / width;
                    const v = y / height;

                    const depth = depthInfo.getDepthInMeters(u, v);
                    if (!depth || isNaN(depth)) continue;

                    const camX = Math.floor(u * cameraWidth);
                    const camY = Math.floor(v * cameraHeight);
                    const pixelIndex = (camY * cameraWidth + camX) * 4;

                    const r = pixels[pixelIndex] / 255;
                    const g = pixels[pixelIndex + 1] / 255;
                    const b = pixels[pixelIndex + 2] / 255;

                    const ndcX = (x / width) * 2 - 1;
                    const ndcY = (y / height) * 2 - 1;

                    const clipCoord = new THREE.Vector4(ndcX, ndcY, 0, 1);

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

            this.addPointCloud({
                positions: new Float32Array(positions),
                colors: new Float32Array(colors)
            });
        }
        else{
            this.createUsingWorkers(depthInfo, cameraWidth, cameraHeight, pixels, view);
        }

        this.xStart = (this.xStart + Math.floor(Math.random() * this.xInc)) % (this.xInc + 1);
        this.yStart = (this.yStart + Math.floor(Math.random() * this.yInc)) % (this.yInc + 1);
    }

    private createUsingWorkers(depthInfo: XRCPUDepthInformation, cameraWidth: number, cameraHeight: number, pixels: Uint8Array, view: XRView){
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
            viewMatrixInv: view.transform.matrix, //This is the inverse of viewMatrix
            xStart: this.xStart,
            yStart: this.yStart,
            xInc: this.xInc,
            yInc: this.yInc,
        };
        
        const wrapper = this.workerManager?.getIdleWorker();
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
        pointCloud.visible = this.pointCloudsEnabled;
        this.generatedPointClouds.push(pointCloud);
        this.scene.add(pointCloud);
    }

    public togglePointClouds(){
        this.pointCloudsEnabled = !this.pointCloudsEnabled;
        this.generatedPointClouds.forEach(pc => {
            pc.visible = this.pointCloudsEnabled;
        });
    }

    public clear(){
        this.generatedPointClouds = [];
    }

    public setToggle(val: boolean){
        this.pointCloudsEnabled = val;
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
    viewMatrixInv: Float32Array;
    xStart: number;
    yStart: number;
    xInc: number;
    yInc: number;
}

export default PointCloudGenerator;
export {WorkerConfig};

