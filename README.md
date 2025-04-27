# Real-time 3D Point Cloud Reconstruction using WebXR 

This project demonstrates how to use WebXR to capture and reconstruct 3D point clouds in real-time using a mobile device's camera.

## Used Technologies

- Three.js: A JavaScript library for creating 3D graphics in the browser.
- WebXR: A web standard for accessing virtual reality (VR) and augmented reality (AR) devices.
- Web Workers: A JavaScript feature that allows for running scripts in background threads, enabling parallel processing.
- WebGL: A JavaScript API for rendering 2D and 3D graphics within any compatible web browser without the use of plug-ins.

## WebXR Device API Features

`depth-sensing` feature is used to capture depth information from the camera.

`camera-access` feature is used to access the camera stream to obtain the RGB colors of the each pixel in every frame so that we can map the colors to the point cloud.

`dom-overlay` feature is used to display relevant buttons and information on the screen.

## Three.js Features

`THREE.Points`: A class for rendering point clouds in Three.js.

`GLTFExporter`: A utility for exporting 3D models in the GLTF format.

`THREE.Color`: A class for representing colors in Three.js.

## Implementation Concept

The overall idea is as follows:

1. Use WebXR to access the camera and depth sensor of the mobile device.
2. Capture the RGB and depth data from the camera stream in real-time.
3. Use a Web Worker to process the depth data and convert it into a 3D point cloud.
4. Map the RGB colors to the point cloud based on the captured RGB data.
5. Render the point cloud using Three.js.
6. Allow the user to export the point cloud as a GLTF file.
7. Provide a user interface for starting and stopping the point cloud reconstruction process.
8. Use the `dom-overlay` feature to display relevant buttons and information on the screen.


### Getting Depth Data

Depth data is obtained from the camera using the `depth-sensing` feature of WebXR. 

Since depth is the distance from the camera to the object, we need to unproject the depth data to get the 3D coordinates of each point in the point cloud.

This is easily done by reversing the projection process when we normally do in the vertex shader.

Normal Process:

``` Projection * View * Model * Position3D ```

Here `Position3D` is the 3D coordinates in local space, `Model` is the model matrix (i.e., the world space), `View` is the view matrix, and `Projection` is the projection matrix.

Since the API provides Projection and View matrices, it is trivial. However, depth data is contained in a 2D texutre (depth map). So what we do is get the NDC (Normalized Device Coordinates) of the pixel in the depth map and then unproject it to get the 3D coordinates.

```
// width and height are the dimensions of the depth map
// x and y are the pixel coordinates in the depth map
// We map the pixel coordinates to NDC coordinates (-1 to 1 range)

ndcX = (x / width) * 2 - 1 // x is the pixel coordinate in the depth map
ndcY = (y / height) * 2 - 1 // y is the pixel coordinate in the depth map

ClipCoord = (ndcX, ndcY, 0, 1) // NDC coordinates

viewSpaceCoord = inverse(Projection) * ClipCoord // Transform to view space

viewSpaceCoord.x = viewSpaceCoord.x * depth 
viewSpaceCoord.y = viewSpaceCoord.y * depth 
viewSpaceCoord.z = -depth // depth is negative in view space

worldSpaceCoord = inverse(View) * viewSpaceCoord // Transform to world space 
```

The above code is a simplified version of the unprojection process. We need to make sure `depth` is in correct units (i.e., meters).

### Mapping RGB Colors to the Point Cloud

API provides the camera frame as a 2D WebGL texture. We map the texture to a canvas and then use the `getImageData` method to get the pixel data. The pixel data is in RGBA format, so we need to convert it to RGB format before mapping it to the point cloud.

When we are working with the depth map, coordinates are normalized. So we can easily map that coordinates to the pixel coordinates in the camera frame. 

```
// cameraWidth and cameraHeight are the dimensions of the camera frame
// u and v are the normalized coordinates in the depth map

camX = Math.floor(u * cameraWidth);
camY = Math.floor(v * cameraHeight);
pixelIndex = (camY * cameraWidth + camX) * 4;

r = pixels[pixelIndex] / 255;
g = pixels[pixelIndex + 1] / 255;
b = pixels[pixelIndex + 2] / 255;
```

The above code is a simplified version of the mapping process. We need to make sure `u` and `v` are in correct range (i.e., 0 to 1).

### Point Cloud Rendering

The point cloud is rendered using the `THREE.Points` class in Three.js. We create a `THREE.BufferGeometry` object to store the point cloud data and a `THREE.PointsMaterial` object to define the appearance of the points.

### Worker Threads

To improve the performance, a pool of worker threads is created to process the depth data in parallel. Each worker thread is responsible for processing depth data for a frame and sending the processed data back to the main thread. The main thread is responsible for rendering the point cloud and updating the user interface.

### Exporting the Point Cloud

Since the THREE.Scene contains every point cloud that we generated, the user can export the point cloud as a GLTF file using the `GLTFExporter` class in Three.js. The exported file can be downloaded and used in other 3D applications.

## Usage

1. Clone the repository or download the ZIP file.
2. Run `npm install` to install the dependencies.
3. Run `npm run dev` to start the development server.
4. Open the application (http://localhost:5173) in a WebXR-compatible browser (e.g., Chrome, Firefox) on a mobile device.


You can view the deployed version of the project [here](https://webxr-point-cloud.vercel.app/).








