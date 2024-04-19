import { loadPly } from './loaders/ply/ply-loader'
import { loadSplat } from './loaders/splat/splat-loader'
import CameraWebGL from './webgl2/camera-webGL'
import CubeInstanceWebGL from './webgl2/cubeInstance-webGL'
import SplatWebGL from './webgl2/splat-webGL'

const renderScale = 1;

Component({
  behaviors: [],
  data: {
    theme: 'light',
    widthScale: 1,      // canvas宽度缩放值
    heightScale: 1,   // canvas高度缩放值
    renderByXRFrame: false, // 是否使用 xr-frame渲染
    renderByWebGL2: true, // 是否使用WebGL2渲染
    workerOn: true,
    maxGaussians: 600000,
  },
  lifetimes: {
    /**
    * 生命周期函数--监听页面加载
    */
    attached() {
      console.log("页面attached")

      console.log('[worker] 排序 worker 的创建')
      this.worker = wx.createWorker('workers/gaussianSplatting/index.js');
      console.log('[worker] 具体 worker', this.worker);

    },
    detached() {
      console.log("页面detached")
      if (wx.offThemeChange) {
        wx.offThemeChange()
      }
      if (this.worker) this.worker.terminate()

    },
    ready() {
    console.log("页面准备完全")
      this.setData({
        theme: wx.getSystemInfoSync().theme || 'light'
      })

      if (wx.onThemeChange) {
        wx.onThemeChange(({theme}) => {
          this.setData({theme})
        })
      }
    },
  },
  methods: {
    onReady() {
      // 获取canvas
      wx.createSelectorQuery()
          .select('#canvas')
          .node()
          .exec(res => {
              this.canvas = res[0].node

              const info = wx.getSystemInfoSync()
              const pixelRatio = info.pixelRatio;
              const width = info.windowWidth * this.data.widthScale * pixelRatio * renderScale;
              const height = info.windowHeight * this.data.heightScale * pixelRatio * renderScale;
              // 存在 webgl Canvas的情况下，写入大小
              if (this.canvas) {
                  this.canvas.width = width;
                  this.canvas.height = height;
              }
              console.log(`canvas size: width = ${width} , height = ${height}`)
              console.log(`window size: width = ${info.windowWidth} , height = ${info.windowHeight}`)

              this.setData({
                  width: width,
                  height: height,
              });

              // 页面自定义初始化
              if (this.init) this.init()
          })
    },
    // 对应案例的初始化逻辑，由统一的 arBehavior 触发
    init() {
      console.log('== Page Init start ==')

      // 注册 各类渲染器
      if (this.data.renderByWebGL2) {
        this.initWebGL2();
      } else if (this.data.renderByXRFrame) {
        this.initXRFrame();
      }
    },
    initPLY(id){
      console.log('== PLY Init start ==')

      const host = 'https://mmbizwxaminiprogram-1258344707.cos.ap-guangzhou.myqcloud.com/xr-frame/demo';
      // const host = 'http://10.9.169.120:8030'
      
      let type;

      // 加载 ply
      // type = 'ply';
      // const pcSrc = `${host}/ply/oneflower.cleaned.ply`;
      // const pcSrc = `${host}/ply/point_cloud.ply`;
      // const pcSrc = `${host}/ply/room.ply`;
      // const pcSrc = `${host}/ply/gs_USJ_Mario_enter.cleaned.ply`;
      // const pcSrc = `${host}/ply/oneflower.ply`;
      // const pcSrc = `${host}/ply/sakura.ply`;
      // const pcSrc = `${host}/ply/sakura.cleaned.ply`;
      // const pcSrc = `${host}/ply/sakura.compressed.ply`;

      // 加载 splat
      type = 'splat';
      const pcSrc = `${host}/splat/${id}.splat`;

      // Setup Camera
      switch(id) {
        case 'room':
          this.camera.updateCameraInfo(
            // target
            [0, 2, -1],
            // theta
            -Math.PI/2,
            // phi
            Math.PI/2,
            // raidus
            1
          )
          break;
        case 'garden':
          this.camera.updateCameraInfo(
            // target
            [0, 1, -1],
            // theta
            -Math.PI/2,
            // phi
            Math.PI/2,
            // raidus
            8
          )
          break;
        case 'stump':
          this.camera.updateCameraInfo(
            // target
            [0, -0.5, 0],
            // theta
            -Math.PI * 2 /3,
            // phi
            Math.PI * 2 /3,
            // raidus
            4
          )
          break;
        case 'oneflower':
          this.camera.updateCameraInfo(
            // target
            [0, 1.5, 3],
            // theta
            -Math.PI/2,
            // phi
            Math.PI/2,
            // raidus
            8
          )
          break;
        case 'usj':
          this.camera.updateCameraInfo(
            // target
            [0, -1, 0],
            // theta
            -Math.PI * 7 / 6,
            // phi
            Math.PI / 2,
            // raidus
            4
          )
          break;
        case 'sakura':
          this.camera.updateCameraInfo(
            // target
            [1.6, 0.5, 1],
            // theta
            Math.PI / 4,
            // phi
            Math.PI * 3 / 5,
            // raidus
            0.5
          )
          break;
      }

      console.log('splat src', pcSrc)

      wx.downloadFile({
        url: pcSrc,
        timeout: 200000,
        success: (res) => {
          console.log("downloadFile 下载回调", res);

          const filePath = res.tempFilePath;

          const fs = wx.getFileSystemManager()

          /**
           * 因为微信读文件，最大只能读100MB的，所以需要分块读取。
           */
          const fd  = fs.openSync({ filePath: filePath })
          const stats = fs.fstatSync({fd: fd})
          console.log('fd stats', stats);
          let size = stats.size;
          if (size > 0) {
            const buffer = new ArrayBuffer(size);
            const viewU8 = new Uint8Array(buffer);
            let offset = 0;
            let uindex = 0;
            while (size > 0) {
              const chunkSize = Math.min(size, 100 * 1024 * 1024/* 100MB */);

              const res = fs.readFileSync( 
                filePath,
                undefined,
                offset,
                chunkSize,
              );
              const resU8 = new Uint8Array(res);
              viewU8.set(new Uint8Array(res), uindex);
              uindex += resU8.length;

              // console.log('res', res)
              // console.log('uindex', uindex);
              // console.log('offset', offset);
              // console.log('chunkSize', chunkSize)

              offset += chunkSize;
              size -= chunkSize;
            }
            fs.close({ fd });

            // console.log('buffer', buffer)

            let info;

            const maxGaussians = this.data.maxGaussians;

            switch (type) {
              case 'ply':
                info = loadPly(buffer, maxGaussians);
                console.log("plyLoader return", info);
                break;
              case 'splat':
                info = loadSplat(buffer, maxGaussians);
                console.log("splatLoader return", info);
                break;
            }

            // 初始化 worker 相关
            this.initWorker(info, {
              maxGaussians
            });
  
          } else {
            wx.hideLoading();
            wx.showToast({
              title: res.errMsg,
              icon: 'none',
              duration: 2000
            })
            console.error('file size is 0')
          }
        },
        fail(res) {
          wx.hideLoading();
          wx.showToast({
            title: res.errMsg,
            icon: 'none',
            duration: 2000
          })
          console.error(res)
        }
      });
    },

    initWorker(plyInfo, config) {
      console.log('== Worker Init start ==')

      // 监听worker回调
      this.worker.onMessage((res) => {
        if (res.type === 'execFunc_init') {
          // worker 初始化 回调
          console.log('[Worker callback] gaussianSplatting init callBack', res)

          this.camera.isWorkerInit = true;
          this.camera.update();


        } else if (res.type === 'execFunc_sort') {
          // worker 排序 回调
          // console.log(res)

          this.camera.isWorkerSorting = false;

          const start = new Date().getTime()

          const data = res.result.data

          const gl = this.gl

          const updateBuffer = (buffer, data) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
          }

          const colors = new Float32Array(data.colors);
          const positions = new Float32Array(data.positions);
          const opacities = new Float32Array(data.opacities);
          const cov3Da = new Float32Array(data.cov3Da);
          const cov3Db = new Float32Array(data.cov3Db);


          updateBuffer(this.splat.buffers.color, colors)
          updateBuffer(this.splat.buffers.center, positions)
          updateBuffer(this.splat.buffers.opacity, opacities)
          updateBuffer(this.splat.buffers.covA, cov3Da)
          updateBuffer(this.splat.buffers.covB, cov3Db)

          // console.log(this.splat.buffers.color, colors)
          // console.log(this.splat.buffers.center, positions)
          // console.log(this.splat.buffers.opacity, opacities)
          // console.log(this.splat.buffers.covA, cov3Da)
          // console.log(this.splat.buffers.covB, cov3Db)

          this.gaussiansCount = data.gaussiansCount;

          console.log('gaussiansCount', this.gaussiansCount)


          const end = new Date().getTime()

          const sortTime = `${((end - start)/1000).toFixed(3)}s`
          console.log(`updateBuffer ${sortTime}`)

          // this.requestRender();
          this.canvas.requestAnimationFrame(this.requestRender.bind(this));

          // console.log('execFunc_sort end')
        }
      })

      // 提交初始数据到 worker 侧
      this.worker.postMessage({
        type: 'execFunc_init',
        params: [plyInfo, config]
      })
    },
    // 后续为 webGL2 相关，为了方便开发，先放在一起
    initWebGL2() {
      console.log('== InitWebGL2 start ==')
      const canvas = this.canvas;
      const gl = this.gl = this.canvas.getContext('webgl2');
      console.log('webgl2 context', gl);

      // Setup Camera
      const cameraParameters = {
        up: [0, 1.0, 0.0],
        target: [0, 1, 0],
        camera: [-Math.PI/2, Math.PI/2, 4], // theta phi radius
      }
      this.camera = new CameraWebGL(gl, this.worker, cameraParameters)

      // Setup Instance Mesh
      // this.cubeInstance = new CubeInstanceWebGL(gl)

      // Setup Splat
      this.initSplat(gl);


    },
    initSplat(gl) {
      this.splat = new SplatWebGL(gl);
    },
    requestRender() {
      // console.log('requestRender')

      // 限帧
      let now = Date.now()
      const last =  this.lastRenderTime || 0;
      const mill = now - last
      if (mill < 30) {
        return
      }
      this.lastRenderTime = now
      
      const gl = this.gl;

      const start = new Date().getTime()

      // Clear State
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
      gl.clearColor(0, 0, 0, 0.0);

      // Set correct blending
      gl.disable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE)
      // gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

 
       // clear
       gl.clear(gl.COLOR_BUFFER_BIT);

      // camera
      // const projMatrix = this.camera.projMatrix;
      // const viewMatrix = this.camera.viewMatrix;

      // this.drawCubeMesh(gl, projMatrix, viewMatrix)


      this.drawSplat(gl);

      // const end = new Date().getTime()
      // const sortTime = `${((end - start)/1000).toFixed(4)}s`
      // console.log(`requestRender ${sortTime}`)
    },
    drawCubeMesh(gl, projMatrix, viewMatrix) {
      // mesh
      const meshCube = this.cubeInstance
      // Tell WebGL to use our program when drawing
      gl.useProgram(meshCube.programInfo.program);
      // VAO
      gl.bindVertexArray(meshCube.vao);
      // mesh position
      gl.bindBuffer(gl.ARRAY_BUFFER, meshCube.positionBuffer);
      gl.vertexAttribPointer(meshCube.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(meshCube.programInfo.attribLocations.vertexPosition);
      // mesh color
      gl.bindBuffer(gl.ARRAY_BUFFER, meshCube.colorBuffer);
      gl.vertexAttribPointer(meshCube.programInfo.attribLocations.vertexColor, 4, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(meshCube.programInfo.attribLocations.vertexColor);

      // Tell WebGL which indices to use to index the vertices
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshCube.indices);

      // Set the shader uniforms
      gl.uniformMatrix4fv(
        meshCube.programInfo.uniformLocations.projectionMatrix,
        false,
        projMatrix
      );
      gl.uniformMatrix4fv(
        meshCube.programInfo.uniformLocations.modelViewMatrix,
        false,
        viewMatrix
      );

      // draw
      const vertexCount = 36;
      const type = gl.UNSIGNED_SHORT;
      const offset = 0;
      gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
    },
    drawSplat(gl) {
      // console.log('drawSplat')

      // Splat
      const splat = this.splat
      const program = splat.program;
      const cam = this.camera
      // Use Program
      gl.useProgram(program);
      // VAO
      gl.bindVertexArray(splat.vao);

      // Original implementation parameters
      const W = gl.canvas.width
      const H = gl.canvas.height
      const tan_fovy = Math.tan(cam.fov_y * 0.5)
      const tan_fovx = tan_fovy * W / H
      const focal_y = H / (2 * tan_fovy)
      const focal_x = W / (2 * tan_fovx)

      // console.log('==== camera ====')
      // console.log(cam)
      // console.log('W', W)
      // console.log('H', H)
      // console.log('tan_fovy', tan_fovy)
      // console.log('tan_fovx', tan_fovx)
      // console.log('focal_y', focal_y)
      // console.log('focal_x', focal_x)
      // console.log('projmatrix', cam.vpm)
      // console.log('viewmatrix', cam.vm)

      gl.uniform1f(gl.getUniformLocation(program, 'W'), W)
      gl.uniform1f(gl.getUniformLocation(program, 'H'), H)
      gl.uniform1f(gl.getUniformLocation(program, 'focal_x'), focal_x)
      gl.uniform1f(gl.getUniformLocation(program, 'focal_y'), focal_y)
      gl.uniform1f(gl.getUniformLocation(program, 'tan_fovx'), tan_fovx)
      gl.uniform1f(gl.getUniformLocation(program, 'tan_fovy'), tan_fovy)
      gl.uniform1f(gl.getUniformLocation(program, 'scale_modifier'), 1.0)
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projmatrix'), false, cam.vpm)
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'viewmatrix'), false, cam.vm)
      
      // Draw
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.gaussiansCount);
      
    },
    // webGL触摸相关逻辑
    onTouchStartWebGL(e) {
      // console.log(e);
      this.camera.lastTouch.clientX = e.touches[0].clientX
      this.camera.lastTouch.clientY = e.touches[0].clientY
    },
    onTouchMoveWebGL(e) {
      // console.log(e);

      const touch = e.touches[0]
      const movementX = touch.clientX - this.camera.lastTouch.clientX
      const movementY = touch.clientY - this.camera.lastTouch.clientY
      this.camera.lastTouch.clientX = touch.clientX
      this.camera.lastTouch.clientY = touch.clientY

      this.camera.theta -= movementX * 0.01 * .5 * .3
      this.camera.phi = Math.max(1e-6, Math.min(Math.PI - 1e-6, this.camera.phi + movementY * 0.01 * .5))
      
      this.camera.update();

      // this.requestRender();
      this.canvas.requestAnimationFrame(this.requestRender.bind(this));
    },
    onTapControl(e) {
      const dataSet = e.target.dataset;
    
      const id = dataSet.id;
  
      // 开始处理 ply 资源
      this.initPLY(id);
    },
    changeMaxGaussianCount(e) {
      this.setData({
        maxGaussians: e.detail.value
      })

      console.log('slider maxGaussians:', this.data.maxGaussians);
    },
    switchWorker(e) {
      this.setData({
        workerOn: e.detail.value
      })

      this.camera.setWorkerOn(this.data.workerOn);

      console.log('switch WorkerOn:', this.data.workerOn);
    }
  },
})

