/**
 * GT Slicer - 3D Interactive Features
 * MIT License - 可商用
 */

(function() {
  'use strict';

  // 等 Three.js 和场景就绪
  var checkReady = setInterval(function() {
    if (window.scene && window.camera && window.renderer) {
      clearInterval(checkReady);
      initSlicer3D();
    }
  }, 200);

  function initSlicer3D() {
    console.log('[GT Slicer 3D] Initializing...');
    
    var scene = window.scene;
    var camera = window.camera;
    var renderer = window.renderer;
    
    // ========== 1. STL 拖拽加载 ==========
    var loadedModel = null;
    var modelBBox = null;

    // 拖拽提示覆盖层
    var dropOverlay = document.createElement('div');
    dropOverlay.id = 'drop-overlay';
    dropOverlay.innerHTML = '<div class="drop-content"><div class="drop-icon">📦</div><div class="drop-text">拖放 STL 文件到此处</div></div>';
    dropOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(108,92,231,0.15);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:9999;pointer-events:none;';
    dropOverlay.querySelector('.drop-content').style.cssText = 'text-align:center;color:#fff;';
    dropOverlay.querySelector('.drop-icon').style.cssText = 'font-size:64px;margin-bottom:16px;';
    dropOverlay.querySelector('.drop-text').style.cssText = 'font-size:18px;font-weight:600;opacity:0.9;';
    document.body.appendChild(dropOverlay);

    var viewport = document.getElementById('viewport') || renderer.domElement.parentElement;
    
    viewport.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropOverlay.style.display = 'flex';
    });
    viewport.addEventListener('dragleave', function(e) {
      dropOverlay.style.display = 'none';
    });
    viewport.addEventListener('drop', function(e) {
      e.preventDefault();
      dropOverlay.style.display = 'none';
      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        if (files[i].name.toLowerCase().endsWith('.stl')) {
          loadSTLFile(files[i]);
        }
      }
    });

    function loadSTLFile(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var loader = new THREE.STLLoader();
        var geometry = loader.parse(e.target.result);
        
        // 移除旧模型
        if (loadedModel) {
          scene.remove(loadedModel);
        }
        // 移除 demo 模型
        scene.traverse(function(child) {
          if (child.isMesh && child.name === 'demoModel') {
            scene.remove(child);
          }
        });

        // 居中模型
        geometry.computeBoundingBox();
        var bbox = geometry.boundingBox;
        var center = new THREE.Vector3();
        bbox.getCenter(center);
        geometry.translate(-center.x, -center.y + (bbox.max.y - bbox.min.y) / 2, -center.z);

        // 材质
        var material = new THREE.MeshPhongMaterial({
          color: 0x6C5CE7,
          specular: 0x222222,
          shininess: 40,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        });

        loadedModel = new THREE.Mesh(geometry, material);
        loadedModel.name = 'loadedModel';
        loadedModel.castShadow = true;
        loadedModel.receiveShadow = true;
        
        // 自动缩放适配打印平台
        geometry.computeBoundingBox();
        modelBBox = geometry.boundingBox;
        var size = new THREE.Vector3();
        modelBBox.getSize(size);
        var maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 200) {
          var s = 180 / maxDim;
          loadedModel.scale.set(s, s, s);
        }

        scene.add(loadedModel);
        
        // 更新状态
        updateModelInfo(file.name, size);
        
        // 重置切片状态
        resetSlicePreview();
        
        console.log('[GT Slicer 3D] Model loaded:', file.name);
      };
      reader.readAsArrayBuffer(file);
    }

    function updateModelInfo(name, size) {
      var info = document.getElementById('model-info');
      if (!info) {
        info = document.createElement('div');
        info.id = 'model-info';
        info.style.cssText = 'position:absolute;bottom:60px;left:12px;background:rgba(22,33,62,0.9);border:1px solid #2a3a5c;border-radius:8px;padding:10px 14px;color:#e0e0e0;font-size:11px;z-index:100;backdrop-filter:blur(8px);';
        (document.getElementById('viewport') || renderer.domElement.parentElement).appendChild(info);
      }
      info.innerHTML = '<div style="color:#6C5CE7;font-weight:600;margin-bottom:4px;">📦 ' + name + '</div>' +
        '<div style="color:#888;">尺寸: ' + size.x.toFixed(1) + ' × ' + size.y.toFixed(1) + ' × ' + size.z.toFixed(1) + ' mm</div>';
    }

    // ========== 2. 切片动画 ==========
    var slicePlane = null;
    var sliceLines = [];
    var isSlicing = false;
    var sliceProgress = 0;
    var sliceHeight = 0;
    var layerHeight = 0.2;
    var totalLayers = 0;
    var currentLayer = 0;

    // 切片平面
    slicePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshBasicMaterial({ 
        color: 0x6C5CE7, 
        transparent: true, 
        opacity: 0.12, 
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    slicePlane.rotation.x = -Math.PI / 2;
    slicePlane.visible = false;
    slicePlane.name = 'slicePlane';
    scene.add(slicePlane);

    // 切片边缘发光线
    var sliceRing = new THREE.Mesh(
      new THREE.RingGeometry(120, 125, 64),
      new THREE.MeshBasicMaterial({ 
        color: 0x6C5CE7, 
        transparent: true, 
        opacity: 0.3, 
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    sliceRing.rotation.x = -Math.PI / 2;
    sliceRing.visible = false;
    sliceRing.name = 'sliceRing';
    scene.add(sliceRing);

    function startSliceAnimation() {
      if (!loadedModel && !scene.getObjectByName('demoModel')) {
        console.log('[GT Slicer 3D] No model to slice');
        return;
      }

      var target = loadedModel || scene.getObjectByName('demoModel');
      if (!target) return;

      var bbox = new THREE.Box3().setFromObject(target);
      var minY = bbox.min.y;
      var maxY = bbox.max.y;
      totalLayers = Math.ceil((maxY - minY) / layerHeight);
      currentLayer = 0;
      sliceHeight = minY;
      isSlicing = true;
      
      slicePlane.visible = true;
      sliceRing.visible = true;
      slicePlane.position.y = minY;
      sliceRing.position.y = minY;

      // 清除旧路径
      clearGCodePreview();

      // 显示进度
      showSliceProgress(0, totalLayers);
    }

    function updateSliceAnimation() {
      if (!isSlicing) return;

      var target = loadedModel || scene.getObjectByName('demoModel');
      if (!target) return;

      var bbox = new THREE.Box3().setFromObject(target);
      var maxY = bbox.max.y;

      if (sliceHeight >= maxY) {
        isSlicing = false;
        slicePlane.visible = false;
        sliceRing.visible = false;
        showSliceComplete();
        return;
      }

      // 移动切片平面
      slicePlane.position.y = sliceHeight;
      sliceRing.position.y = sliceHeight;
      
      // 每隔几层生成路径
      if (currentLayer % 3 === 0) {
        generateLayerPath(sliceHeight, target, bbox);
      }

      sliceHeight += layerHeight;
      currentLayer++;
      
      showSliceProgress(currentLayer, totalLayers);
    }

    // ========== 3. G-Code 路径预览 ==========
    var gcodeGroup = new THREE.Group();
    gcodeGroup.name = 'gcodePreview';
    scene.add(gcodeGroup);

    var pathColors = {
      wall: new THREE.Color(0x6C5CE7),    // 紫色 - 外壁
      infill: new THREE.Color(0xfdcb6e),  // 黄色 - 填充
      support: new THREE.Color(0x00b894), // 绿色 - 支撑
      travel: new THREE.Color(0xe74c3c),  // 红色 - 空走
      skin: new THREE.Color(0x74b9ff)     // 蓝色 - 表皮
    };

    function generateLayerPath(y, model, bbox) {
      var cx = (bbox.min.x + bbox.max.x) / 2;
      var cz = (bbox.min.z + bbox.max.z) / 2;
      var rx = (bbox.max.x - bbox.min.x) / 2 * 0.9;
      var rz = (bbox.max.z - bbox.min.z) / 2 * 0.9;
      
      // 外壁 (矩形路径)
      var wallPoints = [];
      var steps = 40;
      for (var i = 0; i <= steps; i++) {
        var t = i / steps * Math.PI * 2;
        var wobble = 1 + Math.sin(t * 3 + y * 0.5) * 0.05;
        wallPoints.push(new THREE.Vector3(
          cx + Math.cos(t) * rx * wobble,
          y,
          cz + Math.sin(t) * rz * wobble
        ));
      }
      
      var wallGeo = new THREE.BufferGeometry().setFromPoints(wallPoints);
      var wallLine = new THREE.Line(wallGeo, new THREE.LineBasicMaterial({ 
        color: pathColors.wall, 
        transparent: true,
        opacity: 0.8
      }));
      gcodeGroup.add(wallLine);

      // 填充 (锯齿线)
      if (currentLayer % 6 === 0) {
        var infillPoints = [];
        var infillSteps = 12;
        var spacing = (bbox.max.x - bbox.min.x) / infillSteps;
        for (var j = 0; j < infillSteps; j++) {
          var ix = bbox.min.x + j * spacing + spacing * 0.3;
          var iz1 = (j % 2 === 0) ? bbox.min.z * 0.8 : bbox.max.z * 0.8;
          var iz2 = (j % 2 === 0) ? bbox.max.z * 0.8 : bbox.min.z * 0.8;
          infillPoints.push(new THREE.Vector3(ix, y, iz1));
          infillPoints.push(new THREE.Vector3(ix, y, iz2));
        }
        if (infillPoints.length > 1) {
          var infillGeo = new THREE.BufferGeometry().setFromPoints(infillPoints);
          var infillLine = new THREE.Line(infillGeo, new THREE.LineBasicMaterial({ 
            color: pathColors.infill, 
            transparent: true,
            opacity: 0.5
          }));
          gcodeGroup.add(infillLine);
        }
      }
    }

    function clearGCodePreview() {
      while (gcodeGroup.children.length > 0) {
        var child = gcodeGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        gcodeGroup.remove(child);
      }
    }

    function resetSlicePreview() {
      clearGCodePreview();
      isSlicing = false;
      slicePlane.visible = false;
      sliceRing.visible = false;
    }

    // ========== 进度 UI ==========
    function showSliceProgress(current, total) {
      var el = document.getElementById('slice-progress');
      if (!el) {
        el = document.createElement('div');
        el.id = 'slice-progress';
        el.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(22,33,62,0.95);border:1px solid #6C5CE7;border-radius:12px;padding:20px 32px;color:#fff;font-size:13px;z-index:200;text-align:center;backdrop-filter:blur(12px);min-width:220px;';
        (document.getElementById('viewport') || renderer.domElement.parentElement).appendChild(el);
      }
      el.style.display = 'block';
      var pct = Math.round(current / total * 100);
      el.innerHTML = 
        '<div style="color:#6C5CE7;font-weight:700;font-size:15px;margin-bottom:8px;">⚡ 切片中</div>' +
        '<div style="background:#1a1a2e;border-radius:6px;height:6px;overflow:hidden;margin-bottom:8px;">' +
          '<div style="background:linear-gradient(90deg,#6C5CE7,#a29bfe);height:100%;width:' + pct + '%;transition:width 0.1s;border-radius:6px;"></div>' +
        '</div>' +
        '<div style="color:#888;font-size:11px;">第 ' + current + ' / ' + total + ' 层 (' + pct + '%)</div>';
    }

    function showSliceComplete() {
      var el = document.getElementById('slice-progress');
      if (el) {
        el.innerHTML = 
          '<div style="color:#00b894;font-weight:700;font-size:15px;margin-bottom:8px;">✓ 切片完成</div>' +
          '<div style="color:#888;font-size:11px;margin-bottom:8px;">共 ' + totalLayers + ' 层 | 层高 ' + layerHeight + 'mm</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;margin-top:4px;">' +
            '<span style="color:#6C5CE7;">■</span><span style="color:#888;font-size:10px;">外壁</span>' +
            '<span style="color:#fdcb6e;">■</span><span style="color:#888;font-size:10px;">填充</span>' +
            '<span style="color:#00b894;">■</span><span style="color:#888;font-size:10px;">支撑</span>' +
          '</div>';
        setTimeout(function() {
          el.style.display = 'none';
        }, 3000);
      }
    }

    // ========== 图层滑块 ==========
    var layerSlider = document.createElement('div');
    layerSlider.id = 'layer-slider';
    layerSlider.style.cssText = 'position:absolute;right:440px;top:60px;bottom:40px;width:32px;z-index:100;display:none;';
    layerSlider.innerHTML = 
      '<div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;">' +
        '<div style="color:#888;font-size:9px;margin-bottom:4px;" id="layer-top-label">0</div>' +
        '<input type="range" id="layer-range" orient="vertical" min="0" max="100" value="100" ' +
          'style="writing-mode:bt-lr;-webkit-appearance:slider-vertical;width:20px;flex:1;accent-color:#6C5CE7;cursor:pointer;">' +
        '<div style="color:#888;font-size:9px;margin-top:4px;">0</div>' +
      '</div>';
    (document.getElementById('viewport') || renderer.domElement.parentElement).appendChild(layerSlider);

    // ========== 动画循环 ==========
    var sliceSpeed = 0;
    var origAnimate = window.animate;
    
    function enhancedAnimate() {
      if (isSlicing) {
        sliceSpeed++;
        if (sliceSpeed % 2 === 0) {
          updateSliceAnimation();
        }
      }
    }

    // 挂到渲染循环
    var origRAF = window.requestAnimationFrame;
    (function hookAnimate() {
      var _origRender = renderer.render.bind(renderer);
      var renderCount = 0;
      renderer.render = function(s, c) {
        renderCount++;
        if (renderCount % 1 === 0) {
          enhancedAnimate();
        }
        return _origRender(s, c);
      };
    })();

    // ========== 暴露 API ==========
    window.gtSlicer = {
      loadSTL: loadSTLFile,
      startSlice: startSliceAnimation,
      resetSlice: resetSlicePreview,
      clearPaths: clearGCodePreview,
      setLayerHeight: function(h) { layerHeight = h; },
      showLayerSlider: function() { 
        layerSlider.style.display = 'block';
        var range = document.getElementById('layer-range');
        range.max = totalLayers;
        range.value = totalLayers;
        document.getElementById('layer-top-label').textContent = totalLayers;
        range.oninput = function() {
          var maxLayer = parseInt(this.value);
          gcodeGroup.children.forEach(function(child, idx) {
            child.visible = idx < maxLayer * 2;
          });
        };
      }
    };

    // ========== 键盘快捷键 ==========
    document.addEventListener('keydown', function(e) {
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        startSliceAnimation();
      }
    });

    console.log('[GT Slicer 3D] Ready. Drag STL files or press F5 to slice.');
  }
})();
