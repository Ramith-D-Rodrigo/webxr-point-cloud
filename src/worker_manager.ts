
interface WorkerWrapper {
    worker: Worker;
    busy: boolean;
}

class WorkerManager {
    private readonly MAX_WORKERS = navigator.hardwareConcurrency;

    private workers: WorkerWrapper[]; 
    constructor(){
        this.workers = Array.from({ length: this.MAX_WORKERS }, () => ({
            worker: new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
            busy: false
        }));
    }

    public getIdleWorker(): WorkerWrapper | null {
        for (const wrapper of this.workers) {
            if (!wrapper.busy) return wrapper;
        }
        return null; // All busy
    }
}

export {WorkerManager, WorkerWrapper};
