import * as THREE from 'three';
import App from './app';

class Button {
    static createButton(app: App, sessionInit: XRSessionInit) {
        const button = document.createElement('button');

        const scene = app.getScene();
        const renderer = app.getRenderer();
        const container = document.querySelector("#btn-container") as HTMLElement;
        const gltfBtn = document.querySelector("#gltf") as HTMLElement;
        const messageDiv = document.querySelector("#main-content") as HTMLElement;

        function showStartAR( /*device*/ ) {
            let currentSession: XRSession | null = null;


            async function onSessionStarted(session: XRSession) {
                app.setViewerRefSpace(undefined);
                app.setXRBaseWebGLLayer(undefined);
                app.setXRGLBinding(undefined);
                app.setXRSession(undefined);

                scene.clear();
                session.addEventListener('end', onSessionEnded);
                renderer.xr.setReferenceSpaceType('unbounded');
                await renderer.xr.setSession(session);
                button.textContent = 'STOP AR';
                currentSession = session;
                container.classList.remove('not-session');
                container.classList.add('in-session');
                gltfBtn.classList.remove('hidden');
                messageDiv.classList.add('hidden');
            }

            function onSessionEnded( /*event*/ ) {
                scene.clear();
                currentSession?.removeEventListener( 'end', onSessionEnded);
                button.textContent = 'START AR';
                currentSession = null;
                container.classList.remove('in-session');
                container.classList.add('not-session');
                gltfBtn.classList.add('hidden');
                messageDiv.classList.remove('hidden');
            }

            button.style.cursor = 'pointer';
            button.textContent = 'START AR';

            button.onclick = function () {
                if (currentSession === null) {
                    navigator?.xr?.requestSession('immersive-ar', sessionInit).then(onSessionStarted);

                }else{
                    currentSession.end();
                }
            };
        }

        function disableButton() {
            button.onmouseenter = null;
            button.onmouseleave = null;
            button.onclick = null;
        }

        function showARNotSupported() {
            disableButton();
            button.textContent = 'AR NOT SUPPORTED';
        }

        function showARNotAllowed(exception: any) {
            disableButton();
            console.warn( 'Exception when trying to call xr.isSessionSupported', exception);
            button.textContent = 'AR NOT ALLOWED';
        }

        if (navigator.xr) {
            button.id = 'ARButton';
            button.className = 'ar-button';
            button.classList.add('btn');
            navigator.xr.isSessionSupported('immersive-ar').then( function (supported) {
                supported ? showStartAR() : showARNotSupported();
            } ).catch(showARNotAllowed);
            return button;

        } else {
            const message = document.createElement('a');
            if (window.isSecureContext === false) {
                message.href = document.location.href.replace( /^http:/, 'https:' );
                message.innerHTML = 'WEBXR NEEDS HTTPS'; // TODO Improve message

            }else{
                message.href = 'https://immersiveweb.dev/';
                message.innerHTML = 'WEBXR NOT AVAILABLE';
            }
            return message;
        }

    }

}

export { Button };
