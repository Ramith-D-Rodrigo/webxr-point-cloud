import * as THREE from 'three';
import {ARButton} from 'three/examples/jsm/webxr/ARButton';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import PointCloudGenerator from './point_cloud';
import { Button } from './button';

class App {
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private renderer: THREE.WebGLRenderer;
    private gl: WebGL2RenderingContext | WebGLRenderingContext;

    private glBinding: XRWebGLBinding | undefined;
    private viewerRefSpace: XRReferenceSpace | undefined;
    private baseLayer: XRWebGLLayer | undefined;
    private xrSession: XRSession | undefined;

    private pointCloudGenerator: PointCloudGenerator;

    private overlay: HTMLElement;
    private gltfBtn: HTMLElement;
    private toggleBtn: HTMLElement;
    private messageDiv: HTMLElement;

    private exporter: GLTFExporter;

    constructor(){
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance'});
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true; // Enable WebXR
        document.body.appendChild(this.renderer.domElement);
        this.renderer.setClearColor(0xffffff, 0);
        this.renderer.setAnimationLoop(this.animate.bind(this));

        this.gl = this.renderer.getContext();
        this.pointCloudGenerator = new PointCloudGenerator(this.gl, this.scene);

        this.overlay = document.querySelector("#overlay") as HTMLElement;
        this.messageDiv = document.querySelector('#main-content') as HTMLElement;
        this.gltfBtn = document.querySelector("#gltf") as HTMLElement;
        this.gltfBtn.addEventListener('click', async (e)=>{ 
            await this.exportPointCloud();
        });
        this.toggleBtn = document.querySelector("#cloudToggle") as HTMLElement;
        this.toggleBtn.addEventListener('click', (e) => {
            this.pointCloudGenerator.togglePointClouds();
        });

        this.exporter = new GLTFExporter();

        const sessionOptions: XRSessionInit = {
            requiredFeatures: ['unbounded', 'depth-sensing', 'camera-access', 'dom-overlay'], 
            depthSensing: {
                dataFormatPreference: ['luminance-alpha'],
                usagePreference: ['cpu-optimized']
            },
            domOverlay: {
                root: this.overlay
            }
        };

        const btn = Button.createButton(this, sessionOptions, this.gltfBtn, this.messageDiv, this.toggleBtn);
        document.getElementById('btn-container')?.appendChild(btn);
    }

    public async exportPointCloud() {    
        const innerText = this.gltfBtn.innerText;
        this.gltfBtn.innerText = "Please Wait...";
        this.renderer.setAnimationLoop(null);
        try {
            const gltf = await new Promise((resolve, reject) => {
                this.exporter.parse(
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
        this.gltfBtn.innerText = innerText;
        this.renderer.setAnimationLoop(this.animate.bind(this));
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
                    this.pointCloudGenerator.createPointCloudData(
                        depthInfo, view, this.baseLayer as XRWebGLLayer, 
                        webXRTexture, camera.width, camera.height
                    );
                }
            });
        }
        this.renderer.render(this.scene, this.camera);
    }

    public getScene(){
        return this.scene;
    }

    public getRenderer(){
        return this.renderer;
    }

    public getXRGLBinding(){
        return this.glBinding;
    }
    public setXRGLBinding(glBinding: XRWebGLBinding | undefined){
        this.glBinding = glBinding;
    }

    public getViewerRefSpace(){
        return this.viewerRefSpace;
    }
    public setViewerRefSpace(viewerRefSpace: XRReferenceSpace | undefined){
        this.viewerRefSpace = viewerRefSpace;
    }

    public getXRBaseWebGLLayer(){
        return this.baseLayer;
    }
    public setXRBaseWebGLLayer(baseLayer: XRWebGLLayer | undefined){
        this.baseLayer = baseLayer;
    }

    public getXRSession(){
        return this.xrSession;
    }
    public setXRSession(xrSession: XRSession | undefined){
        this.xrSession = xrSession;
    }

    public clearPointClouds(){
        this.pointCloudGenerator.clear();
    }

    public setPointCloudToggle(val: boolean){
        this.pointCloudGenerator.setToggle(val);
    }
}

export default App;
