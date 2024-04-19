const data = {}
let gaussians
let depthIndex

const sortingAlgorithm = 'count sort';

let loopTime = 0;

function init(plyInfo, config) {
    console.log('[Worker] gaussianSplatting init');

    // console.log('plyInfo', plyInfo);
    gaussians = plyInfo;
    gaussians.totalCount = plyInfo.count;
    gaussians.count = Math.min(gaussians.totalCount, config.maxGaussians)

    depthIndex = new Uint32Array(gaussians.count);

    console.log(`[Worker] Received ${gaussians.count} gaussians`)
    
    data.positions = new Float32Array(gaussians.count * 3)
    data.opacities = new Float32Array(gaussians.count)
    data.cov3Da = new Float32Array(gaussians.count * 3)
    data.cov3Db = new Float32Array(gaussians.count * 3)
    data.colors = new Float32Array(gaussians.count * 3)

}

function sort(params) {
    // console.log('[worker] gaussianSplatting sort');

    loopTime++;

    const { viewMatrix } = params

    const start = new Date().getTime()


    // console.log('viewMatrix', viewMatrix)
    // console.log('viewMatrix 2 6 10', viewMatrix[2], viewMatrix[6], viewMatrix[10])
    // console.log('viewMatrix 8 9 10', viewMatrix[8], viewMatrix[9], viewMatrix[10])

    // Sort the gaussians!
    sortGaussiansByDepth(depthIndex, gaussians, viewMatrix)

    // Update arrays containing the data
    for (let j = 0; j < gaussians.count; j++) {
        const i = depthIndex[j]

        data.colors[j*3] = gaussians.colors[i*3]
        data.colors[j*3+1] = gaussians.colors[i*3+1]
        data.colors[j*3+2] = gaussians.colors[i*3+2]

        data.positions[j*3] = gaussians.positions[i*3]
        data.positions[j*3+1] = gaussians.positions[i*3+1]
        data.positions[j*3+2] = gaussians.positions[i*3+2]


        data.opacities[j] = gaussians.opacities[i]

        // Split the covariance matrix into two vec3
        // so they can be used as vertex shader attributes
        data.cov3Da[j*3] = gaussians.cov3Ds[i*6]
        data.cov3Da[j*3+1] = gaussians.cov3Ds[i*6+1]
        data.cov3Da[j*3+2] = gaussians.cov3Ds[i*6+2]

        data.cov3Db[j*3] = gaussians.cov3Ds[i*6+3]
        data.cov3Db[j*3+1] = gaussians.cov3Ds[i*6+4]
        data.cov3Db[j*3+2] = gaussians.cov3Ds[i*6+5]
    }

    const end = new Date().getTime();

    const sortTime = `${((end - start)/1000).toFixed(3)}s`
    console.log(`[Worker] Sorted ${gaussians.count} gaussians in ${sortTime}. Algorithm: ${sortingAlgorithm}`)

    return {
        data: {
            colors: data.colors.buffer,
            positions: data.positions.buffer,
            opacities: data.opacities.buffer,
            cov3Da: data.cov3Da.buffer,
            cov3Db: data.cov3Db.buffer,
            gaussiansCount: gaussians.count,
        }
    };
}

function sortGaussiansByDepth(depthIndex, gaussians, viewMatrix) {
    const calcDepth = (i) => gaussians.positions[i*3] * viewMatrix[2] +
                             gaussians.positions[i*3+1] * viewMatrix[6] +
                             gaussians.positions[i*3+2] * viewMatrix[10]

    let maxDepth = -Infinity;
    let minDepth = Infinity;
    let sizeList = new Int32Array(gaussians.count);

    for (let i = 0; i < gaussians.count; i++) {
        const depth = (calcDepth(i) * 4096) | 0

        sizeList[i] = depth
        maxDepth = Math.max(maxDepth, depth)
        minDepth = Math.min(minDepth, depth)
    }
    
    let depthInv = (256 * 256) / (maxDepth - minDepth);
    let counts0 = new Uint32Array(256*256);
    for (let i = 0; i < gaussians.count; i++) {
        sizeList[i] = ((sizeList[i] - minDepth) * depthInv) | 0;
        counts0[sizeList[i]]++;
    }
    let starts0 = new Uint32Array(256*256);
    for (let i = 1; i < 256*256; i++) starts0[i] = starts0[i - 1] + counts0[i - 1];
    for (let i = 0; i < gaussians.count; i++) depthIndex[starts0[sizeList[i]]++] = i;
}

worker.onMessage(function (msg) {
    if (msg.type === 'execFunc_init') {
        worker.postMessage({
            type: 'execFunc_init',
            result: init(msg.params[0], msg.params[1])
        })
    } else if(msg.type === 'execFunc_sort') {
        worker.postMessage({
            type: 'execFunc_sort',
            result: sort(msg.params[0])
        })
    }
})
