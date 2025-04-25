import * as THREE from 'three';

class PointCloudGenerator {
    private gl: WebGL2RenderingContext | WebGLRenderingContext;
    private tempFramebuffer: WebGLFramebuffer;

    private yStart: number = 0;
    private xStart: number = 0;
    private yInc: number = 10;
    private xInc: number = 10;

    constructor(gl: WebGL2RenderingContext | WebGLRenderingContext) {
        this.gl = gl;
        this.tempFramebuffer = this.gl.createFramebuffer();
    }

    public createPointCloudData(depthInfo: XRCPUDepthInformation, view: XRView, baseLayer: XRWebGLLayer,
        webXRTexture: WebGLTexture, cameraWidth: number, cameraHeight: number)
    : {positions: Float32Array, colors: Float32Array} {
        const positions: number[] = [];
        const colors: number[] = [];
        const width = depthInfo.width;
        const height = depthInfo.height;
        
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
        
        // Create inverse projection matrix
        const projMatrix = new THREE.Matrix4().fromArray(view.projectionMatrix);
        const invProjMatrix = new THREE.Matrix4().copy(projMatrix).invert();
        const viewMatrix = new THREE.Matrix4().fromArray(view.transform.matrix);

        for (let y = this.yStart; y < height; y += this.yInc) { // Reduced density for performance
            for (let x = this.xStart; x < width; x += this.xInc) {
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

        this.xStart = (this.xStart + Math.floor(Math.random() * this.xInc)) % (this.xInc + 1);
        this.yStart = (this.yStart + Math.floor(Math.random() * this.yInc)) % (this.yInc + 1);

        return {
            positions: new Float32Array(positions),
            colors: new Float32Array(colors)
        };
    }
};

export default PointCloudGenerator;