import * as THREE from 'three';
import {ARButton} from 'three/examples/jsm/webxr/ARButton';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import PointCloudGenerator from './point_cloud';

class App {
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private renderer: THREE.WebGLRenderer;
    private gl: WebGL2RenderingContext | WebGLRenderingContext;

    private glBinding: XRWebGLBinding;
    private viewerRefSpace: XRReferenceSpace;
    private baseLayer: XRWebGLLayer | undefined;
    private xrSession: XRSession;
    private pointCloudGenerator: PointCloudGenerator;

    constructor(){
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance'});
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true; // Enable WebXR
        document.body.appendChild(this.renderer.domElement);
        this.renderer.setClearColor(0xffffff, 0);
        this.renderer.setAnimationLoop(this.animate.bind(this));

        console.log(this.renderer);

        this.gl = this.renderer.getContext();
        this.pointCloudGenerator = new PointCloudGenerator(this.gl);


        const btn = ARButton.createButton(this.renderer, {
            requiredFeatures: ['unbounded', 'depth-sensing', 'camera-access'], 
            depthSensing: {
                dataFormatPreference: ['luminance-alpha'],
                usagePreference: ['cpu-optimized']
            }
        });
        
        btn.style.backgroundColor = 'black';
        document.body.appendChild(btn);
    }

    public async exportPointCloud() {    
        // Create exporter
        const exporter = new GLTFExporter();
        
        try {
            const gltf = await new Promise((resolve, reject) => {
                exporter.parse(
                    this.scene,
                    resolve,
                    reject,
                    { binary: false, trs: false } // Export as JSON, not binary
                );
            });
            
            this.downloadGLTF(gltf as unknown as object);
        } catch (error) {
            console.error("Export failed:", error);
        }
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
        }, 100);
    }

    private async animate(timestamp: DOMHighResTimeStamp, frame: XRFrame) {
        if(frame){
            if(!this.viewerRefSpace){
                this.viewerRefSpace = await this.renderer.xr.getSession()?.requestReferenceSpace('unbounded') as XRReferenceSpace;
            }
    
            if(!this.baseLayer){
                this.baseLayer = this.renderer.xr.getSession()?.renderState.baseLayer;
            }
    
            if(!this.xrSession){
                this.xrSession = this.renderer.xr.getSession() as XRSession;
                this.xrSession.addEventListener('select', (e)=>{
                    this.exportPointCloud();
                });
            }
    
            const pose = frame.getViewerPose(this.viewerRefSpace);
            pose?.views.forEach(view => {
                let camera = view.camera;
                if(!this.glBinding){
                    this.glBinding = new XRWebGLBinding(this.xrSession, this.renderer.getContext());
                }
                const webXRTexture: WebGLTexture = this.glBinding.getCameraImage(camera);
                const depthInfo = frame.getDepthInformation(view);
                
                if(depthInfo){
                    const pointCloud = this.pointCloudGenerator.createPointCloudData(
                        depthInfo, view, this.baseLayer as XRWebGLLayer, 
                        webXRTexture, camera.width, camera.height
                    );
                    this.addPointCloud(pointCloud);
                }
            });
        }
        this.renderer.render(this.scene, this.camera);
    }

    private addPointCloud(pointCloudData: {positions: Float32Array, colors: Float32Array}) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(pointCloudData.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(pointCloudData.colors, 3));
    
        const material = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: true, // Enable vertex coloring
            sizeAttenuation: true
        });
    
        const pointCloud = new THREE.Points(geometry, material);
        this.scene.add(pointCloud);
    }
}

export default App;
