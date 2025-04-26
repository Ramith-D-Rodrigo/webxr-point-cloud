import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";
import * as THREE from 'three';

class GLTFManager {
    private exporter: GLTFExporter;

    constructor(){
        this.exporter = new GLTFExporter();
    }

    public async exportPointCloud(gltfBtn: HTMLElement, scene: THREE.Scene) {    
        const innerText = gltfBtn.innerText;
        gltfBtn.innerText = "Please Wait...";
        try {
            const gltf = await new Promise((resolve, reject) => {
                this.exporter.parse(
                    scene,
                    resolve,
                    reject,
                    { binary: false, trs: false } // Export as JSON, not binary
                );
            });
            
            this.downloadGLTF(gltf as unknown as object);
        } catch (error) {
            console.error("Export failed:", error);
        }
        gltfBtn.innerText = innerText;

    }


    private downloadGLTF(gltf: object){
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
        }, 1000);
    }
}

export default GLTFManager;
