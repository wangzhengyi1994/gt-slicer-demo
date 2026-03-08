/* ============================================
   GT Slicer UI - Application Logic
   Three.js Scene + UI Interactions
   ============================================ */

// ============================================
// THREE.JS SCENE SETUP
// ============================================
let viewport, canvas;
let scene, camera, renderer, controls;
let buildPlate, model, gridHelper;
let transformControls;
let modelInitialSize = { x: 0, y: 0, z: 0 }; // bounding box baseline for scale 100%
let modelLocked = false;
let models = []; // all models in scene
let selectedModel = null; // currently selected model
let selectionOutline = null; // EdgesGeometry outline for selected model
let mousePos = { x: 0, y: 0 };

function initThreeJS() {
    viewport = document.getElementById('viewport');
    canvas = document.getElementById('three-canvas');
    if (!viewport || !canvas) { console.error('viewport or canvas not found'); return; }
    // Scene
    scene = new THREE.Scene();

    // Fog for depth (edge fade effect per design doc)
    // Blue-gray scale: dark=gray-950 #0D0F17, light=gray-200 #B8BCC6
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
        scene.fog = new THREE.FogExp2(0x0D0F17, 0.0015);
        scene.background = new THREE.Color(0x0D0F17);
    } else {
        scene.fog = new THREE.FogExp2(0x94999F, 0.001);
        scene.background = new THREE.Color(0x94999F);
    }

    // Camera
    camera = new THREE.PerspectiveCamera(
        45,
        viewport.clientWidth / viewport.clientHeight,
        0.1,
        5000
    );
    camera.position.set(400, 350, 500);
    camera.lookAt(0, 50, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
    });
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 0.8 : 1.0;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 50, 0);
    controls.minDistance = 100;
    controls.maxDistance = 2000;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controls.update();

    // Build the scene
    createLighting();
    createBuildPlate();
    createDemoModel();
    createEnvironment();

    // Show model info card
    const infoCard = document.getElementById('modelInfoCard');
    if (infoCard) infoCard.style.display = 'block';

    // Compute initial bounding box for scale baseline
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    modelInitialSize.x = size.x;
    modelInitialSize.y = size.y;
    modelInitialSize.z = size.z;

    // TransformControls
    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    transformControls.attach(model);
    transformControls.visible = false;
    transformControls.enabled = false;
    scene.add(transformControls);

    // Disable OrbitControls while dragging gizmo
    transformControls.addEventListener('dragging-changed', function(event) {
        controls.enabled = !event.value;
    });

    // Sync panel values when gizmo is used
    transformControls.addEventListener('objectChange', function() {
        if (typeof syncPanelFromModel === 'function') syncPanelFromModel();
    });

    // Gizmo dashed extension lines (translate mode only)
    window._gizmoDashLines = [];
    const dashConfigs = [
        { color: 0xff0000, dir: new THREE.Vector3(1, 0, 0) }, // X red
        { color: 0x00cc44, dir: new THREE.Vector3(0, 1, 0) }, // Y green
        { color: 0x0066ff, dir: new THREE.Vector3(0, 0, 1) }, // Z blue
    ];
    dashConfigs.forEach(({ color, dir }) => {
        const dashMat = new THREE.LineDashedMaterial({
            color: color,
            dashSize: 5,
            gapSize: 3,
            transparent: true,
            opacity: 0.3,
        });
        const pts = [
            dir.clone().multiplyScalar(-500),
            dir.clone().multiplyScalar(500),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, dashMat);
        line.computeLineDistances();
        line.visible = false;
        scene.add(line);
        window._gizmoDashLines.push(line);
    });

    // Start render loop
    animate();
}

function createLighting() {
    const isDark = document.body.classList.contains('theme-dark');

    // Strong ambient light for clear visibility
    const ambient = new THREE.AmbientLight(
        isDark ? 0x555566 : 0x8890A0,
        isDark ? 0.6 : 0.3
    );
    scene.add(ambient);

    // Main directional light - bright key light
    const mainLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.0 : 1.0);
    mainLight.position.set(300, 500, 400);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 4096;
    mainLight.shadow.mapSize.height = 4096;
    mainLight.shadow.camera.near = 10;
    mainLight.shadow.camera.far = 1500;
    mainLight.shadow.camera.left = -500;
    mainLight.shadow.camera.right = 500;
    mainLight.shadow.camera.top = 500;
    mainLight.shadow.camera.bottom = -500;
    mainLight.shadow.bias = -0.0003;
    mainLight.shadow.radius = 2;
    mainLight.shadow.normalBias = 0.02;
    scene.add(mainLight);

    // Fill light - bright, reduce harsh shadows
    const fillLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.4 : 0.35);
    fillLight.position.set(-200, 300, -100);
    scene.add(fillLight);

    // Back fill for even illumination
    const backLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.3 : 0.3);
    backLight.position.set(0, 200, -400);
    scene.add(backLight);

    // Hemisphere for ground bounce - brighter
    const hemiLight = new THREE.HemisphereLight(
        isDark ? 0x334455 : 0x8A9098,
        isDark ? 0x222233 : 0x404850,
        isDark ? 0.5 : 0.45
    );
    scene.add(hemiLight);

    // Top-down fill
    const topLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.2 : 0.2);
    topLight.position.set(0, 600, 0);
    scene.add(topLight);
}

function createBuildPlate() {
    const isDark = document.body.classList.contains('theme-dark');

    // Build plate dimensions (scaled from GT Carbon S800: 820x620mm)
    const plateW = 410;
    const plateD = 310;
    const plateH = 4;

    // Build plate - light blue-gray like reference, solid and clear
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: isDark ? 0x15161E : 0x15161E,
    });

    const plateGeo = new THREE.BoxGeometry(plateW, plateH, plateD);
    buildPlate = new THREE.Mesh(plateGeo, plateMaterial);
    buildPlate.material = new THREE.MeshBasicMaterial({ color: isDark ? 0x15161E : 0x15161E });
    buildPlate.position.y = -plateH / 2;
    buildPlate.receiveShadow = true;
    scene.add(buildPlate);

    // Border frame
    const borderMat = new THREE.MeshBasicMaterial({
        color: isDark ? 0x101218 : 0x101218,
    });
    const borderThickness = 6;
    const borderH = plateH + 1;

    // Front border
    const frontBorderGeo = new THREE.BoxGeometry(plateW + borderThickness * 2, borderH, borderThickness);
    const frontBorder = new THREE.Mesh(frontBorderGeo, borderMat);
    frontBorder.position.set(0, -plateH / 2, plateD / 2 + borderThickness / 2);
    scene.add(frontBorder);

    // Back border
    const backBorder = frontBorder.clone();
    backBorder.position.z = -plateD / 2 - borderThickness / 2;
    scene.add(backBorder);

    // Left border
    const sideBorderGeo = new THREE.BoxGeometry(borderThickness, borderH, plateD + borderThickness * 2);
    const leftBorder = new THREE.Mesh(sideBorderGeo, borderMat);
    leftBorder.position.set(-plateW / 2 - borderThickness / 2, -plateH / 2, 0);
    scene.add(leftBorder);

    // Right border
    const rightBorder = leftBorder.clone();
    rightBorder.position.x = plateW / 2 + borderThickness / 2;
    scene.add(rightBorder);

    // Corner clips - small rectangular cutout-style blocks at each corner
    const clipW = 16, clipD = 16, clipH = plateH + 2;
    const clipMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x2A2E38 : 0x3A3E48,
        metalness: 0.2,
        roughness: 0.7,
    });
    const clipOffsetX = plateW / 2 - clipW / 2 + 1;
    const clipOffsetZ = plateD / 2 - clipD / 2 + 1;
    const clipPositions = [
        [-clipOffsetX, -plateH / 2 + 0.5, -clipOffsetZ],
        [ clipOffsetX, -plateH / 2 + 0.5, -clipOffsetZ],
        [-clipOffsetX, -plateH / 2 + 0.5,  clipOffsetZ],
        [ clipOffsetX, -plateH / 2 + 0.5,  clipOffsetZ],
    ];
    clipPositions.forEach(pos => {
        const clipGeo = new THREE.BoxGeometry(clipW, clipH, clipD);
        const clip = new THREE.Mesh(clipGeo, clipMat);
        clip.position.set(pos[0], pos[1], pos[2]);
        scene.add(clip);
    });

    // Fine grid only (10mm spacing), very faint
    const fineGridSize = 400;
    const fineGridDivisions = 40;
    const fineGridColor = isDark ? 0x4A5060 : 0xFFFFFF;
    const fineGrid = new THREE.GridHelper(fineGridSize, fineGridDivisions, fineGridColor, fineGridColor);
    fineGrid.position.y = 0.3;
    fineGrid.material.opacity = 0.5;
    fineGrid.material.transparent = true;
    scene.add(fineGrid);

    // No coarse grid - assign gridHelper to fine grid for toggle support
    gridHelper = fineGrid;

    // Brand text on plate
    addPlateLabel(plateW, plateD);
}

function addPlateLabel(w, d) {
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');

    const isDark = document.body.classList.contains('theme-dark');

    ctx.clearRect(0, 0, 512, 64);
    ctx.font = 'bold 36px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.textAlign = 'center';
    ctx.fillText('GT Carbon HT440', 256, 42);

    const texture = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
    });

    const labelGeo = new THREE.PlaneGeometry(200, 24);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 1, d / 2 - 30);
    scene.add(label);
}

function createDemoModel() {
    const isDark = document.body.classList.contains('theme-dark');

    // Solid opaque materials - light gray like real slicer software
    const matLight = new THREE.MeshStandardMaterial({
        color: 0xE8A820,
        metalness: 0.05,
        roughness: 0.4,
        transparent: false,
        opacity: 1.0,
    });

    const matDark = new THREE.MeshStandardMaterial({
        color: 0xD09018,
        metalness: 0.08,
        roughness: 0.45,
        transparent: false,
        opacity: 1.0,
    });

    // === Model 1: Mechanical bracket (left side) ===
    const group1 = new THREE.Group();
    group1.userData.name = '\u652f\u67b6-1';

    const baseGeo = new THREE.BoxGeometry(100, 20, 60);
    const baseMesh = new THREE.Mesh(baseGeo, matLight);
    baseMesh.position.y = 10;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group1.add(baseMesh);

    const pillarGeo = new THREE.BoxGeometry(15, 80, 60);
    const leftPillar = new THREE.Mesh(pillarGeo, matLight);
    leftPillar.position.set(-42.5, 60, 0);
    leftPillar.castShadow = true;
    leftPillar.receiveShadow = true;
    group1.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, matLight);
    rightPillar.position.set(42.5, 60, 0);
    rightPillar.castShadow = true;
    rightPillar.receiveShadow = true;
    group1.add(rightPillar);

    const bridgeGeo = new THREE.BoxGeometry(100, 15, 60);
    const bridge = new THREE.Mesh(bridgeGeo, matLight);
    bridge.position.y = 107.5;
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    group1.add(bridge);

    const holeGeo = new THREE.CylinderGeometry(12, 12, 62, 32);
    const holeMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x171A25 : 0x909090,
        metalness: 0.3,
        roughness: 0.7,
    });

    const leftHole = new THREE.Mesh(holeGeo, holeMat);
    leftHole.rotation.x = Math.PI / 2;
    leftHole.position.set(-42.5, 60, 0);
    group1.add(leftHole);

    const rightHole = new THREE.Mesh(holeGeo, holeMat);
    rightHole.rotation.x = Math.PI / 2;
    rightHole.position.set(42.5, 60, 0);
    group1.add(rightHole);

    const topCylGeo = new THREE.CylinderGeometry(18, 18, 20, 32);
    const topCyl = new THREE.Mesh(topCylGeo, matLight);
    topCyl.position.y = 125;
    topCyl.castShadow = true;
    group1.add(topCyl);

    for (let i = 0; i < 3; i++) {
        const ribGeo = new THREE.BoxGeometry(2, 60, 55);
        const rib = new THREE.Mesh(ribGeo, matLight.clone());
        rib.position.set(-20 + i * 20, 55, 0);
        rib.castShadow = true;
        group1.add(rib);
    }

    group1.position.set(-90, 0, 0);
    scene.add(group1);
    models.push(group1);

    // === Model 2: L-shaped bracket (right side) ===
    const group2 = new THREE.Group();
    group2.userData.name = 'L\u578b\u652f\u67b6-2';

    const lVertGeo = new THREE.BoxGeometry(40, 100, 50);
    const lVert = new THREE.Mesh(lVertGeo, matDark);
    lVert.position.set(0, 50, 0);
    lVert.castShadow = true;
    lVert.receiveShadow = true;
    group2.add(lVert);

    const lHorizGeo = new THREE.BoxGeometry(80, 25, 50);
    const lHoriz = new THREE.Mesh(lHorizGeo, matDark);
    lHoriz.position.set(20, 12.5, 0);
    lHoriz.castShadow = true;
    lHoriz.receiveShadow = true;
    group2.add(lHoriz);

    const filletGeo = new THREE.CylinderGeometry(15, 15, 50, 32);
    const fillet = new THREE.Mesh(filletGeo, matDark);
    fillet.rotation.x = Math.PI / 2;
    fillet.position.set(10, 35, 0);
    fillet.castShadow = true;
    group2.add(fillet);

    const mountGeo = new THREE.CylinderGeometry(6, 6, 26, 24);
    const mountMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x171A25 : 0x787878,
        metalness: 0.3,
        roughness: 0.7,
    });
    const mount1 = new THREE.Mesh(mountGeo, mountMat);
    mount1.position.set(40, 12.5, 0);
    group2.add(mount1);
    const mount2 = new THREE.Mesh(mountGeo, mountMat);
    mount2.position.set(0, 12.5, 0);
    group2.add(mount2);

    const capGeo = new THREE.CylinderGeometry(20, 20, 10, 32);
    const cap = new THREE.Mesh(capGeo, matDark);
    cap.position.set(0, 105, 0);
    cap.castShadow = true;
    group2.add(cap);

    group2.position.set(100, 0, 20);
    scene.add(group2);
    models.push(group2);

    // Default: select first model
    model = group1;
    selectModel(group1);

    // === Click selection ===
    const raycaster = new THREE.Raycaster();
    const clickMouse = new THREE.Vector2();

    function onClickSelect(event) {
        // Ignore if dragging (OrbitControls)
        const rect = renderer.domElement.getBoundingClientRect();
        clickMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        clickMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(clickMouse, camera);

        let hit = null;
        for (const m of models) {
            const intersects = raycaster.intersectObjects(m.children, true);
            if (intersects.length > 0) {
                hit = m;
                break;
            }
        }

        if (hit) {
            selectModel(hit);
        } else {
            clearSelection();
        }
    }

    renderer.domElement.addEventListener('click', onClickSelect);
}

function selectModel(m) {
    if (selectedModel === m) return;
    clearSelection();
    selectedModel = m;
    model = m;

    // White outline via backface-scaled shells
    const outlineGroup = new THREE.Group();
    outlineGroup.userData.isOutline = true;
    const outlineMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        side: THREE.BackSide,
    });

    m.children.forEach(function(child) {
        if (child.isMesh && child.geometry) {
            var shell = new THREE.Mesh(child.geometry, outlineMat);
            shell.position.copy(child.position);
            shell.rotation.copy(child.rotation);
            shell.scale.copy(child.scale).multiplyScalar(1.06);
            outlineGroup.add(shell);
        }
    });

    m.add(outlineGroup);
    selectionOutline = outlineGroup;

    // Slight emissive on selected model
    m.children.forEach(function(child) {
        if (child.isMesh && child.material && !child.userData.isOutline) {
            child.userData.origEmissive = child.material.emissive ? child.material.emissive.getHex() : 0x000000;
            child.userData.origEmissiveIntensity = child.material.emissiveIntensity || 0;
            child.material.emissive = new THREE.Color(0x222222);
            child.material.emissiveIntensity = 0.15;
        }
    });

    if (transformControls && !modelLocked) {
        transformControls.attach(m);
    }

    if (typeof updateModelInfoCard === 'function') updateModelInfoCard();
    if (typeof syncPanelFromModel === 'function') syncPanelFromModel();
}

function clearSelection() {
    if (selectedModel && selectionOutline) {
        selectedModel.remove(selectionOutline);
        selectionOutline = null;

        selectedModel.children.forEach(function(child) {
            if (child.isMesh && child.material && child.userData.origEmissive !== undefined) {
                child.material.emissive = new THREE.Color(child.userData.origEmissive);
                child.material.emissiveIntensity = child.userData.origEmissiveIntensity;
            }
        });
    }
    selectedModel = null;
    if (transformControls) {
        transformControls.detach();
    }
}

function createEnvironment() {
    const isDark = document.body.classList.contains('theme-dark');

    // Ground plane with subtle reflectivity
    const groundGeo = new THREE.PlaneGeometry(4000, 4000);
    const groundMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x0D0F17 : 0x6A7078,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -6;
    ground.receiveShadow = true;
    scene.add(ground);

    // Gradient fade ring around build plate (environmental depth)
    const fadeRingGeo = new THREE.RingGeometry(280, 800, 64);
    const fadeRingMat = new THREE.MeshBasicMaterial({
        color: isDark ? 0x0D0F17 : 0x7A8088,
        transparent: true,
        opacity: isDark ? 0.5 : 0.3,
        depthWrite: false,
    });
    const fadeRing = new THREE.Mesh(fadeRingGeo, fadeRingMat);
    fadeRing.rotation.x = -Math.PI / 2;
    fadeRing.position.y = -2.5;
    scene.add(fadeRing);

    // Axis indicator lines at origin - thicker visual
    const axisLen = 50;

    // X axis (red)
    const xLine = createAxisLine(
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(axisLen, 0.5, 0),
        0xff4444
    );
    scene.add(xLine);

    // Y axis (green)
    const yLine = createAxisLine(
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, axisLen, 0),
        0x44ff44
    );
    scene.add(yLine);

    // Z axis (blue)
    const zLine = createAxisLine(
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, 0.5, axisLen),
        0x4488ff
    );
    scene.add(zLine);

    // Axis labels using canvas textures
    const axisLabels = [
        { text: 'X', color: '#ff4444', pos: [axisLen + 8, 2, 0] },
        { text: 'Y', color: '#44ff44', pos: [0, axisLen + 8, 0] },
        { text: 'Z', color: '#4488ff', pos: [0, 2, axisLen + 8] },
    ];
    axisLabels.forEach(({ text, color, pos }) => {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 16, 16);
        const tex = new THREE.CanvasTexture(c);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.6, depthTest: false }));
        sprite.position.set(pos[0], pos[1], pos[2]);
        sprite.scale.set(12, 12, 1);
        scene.add(sprite);
    });
}

function createAxisLine(start, end, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
    });
    return new THREE.Line(geo, mat);
}

// Model info card - compute and display model stats
window._updateModelInfoCard = (function() {
    const elSize = document.getElementById('modelInfoSize');
    const elVolume = document.getElementById('modelInfoVolume');
    const elTriangles = document.getElementById('modelInfoTriangles');
    let frameCount = 0;

    function countTriangles(obj) {
        let count = 0;
        obj.traverse(child => {
            if (child.isMesh && child.geometry) {
                const geo = child.geometry;
                if (geo.index) {
                    count += geo.index.count / 3;
                } else if (geo.attributes.position) {
                    count += geo.attributes.position.count / 3;
                }
            }
        });
        return Math.round(count);
    }

    function estimateVolume(obj) {
        let vol = 0;
        obj.traverse(child => {
            if (child.isMesh && child.geometry) {
                const geo = child.geometry;
                const pos = geo.attributes.position;
                if (!pos) return;
                const idx = geo.index;
                const count = idx ? idx.count / 3 : pos.count / 3;
                for (let i = 0; i < count; i++) {
                    let a, b, c;
                    if (idx) {
                        a = idx.getX(i * 3);
                        b = idx.getX(i * 3 + 1);
                        c = idx.getX(i * 3 + 2);
                    } else {
                        a = i * 3; b = i * 3 + 1; c = i * 3 + 2;
                    }
                    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
                    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
                    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
                    vol += (ax*(by*cz - bz*cy) + bx*(cy*az - cz*ay) + cx*(ay*bz - az*by)) / 6;
                }
            }
        });
        return Math.abs(vol);
    }

    return function() {
        var target = selectedModel || model;
        if (!target || !elSize) return;
        frameCount++;
        if (frameCount % 15 !== 0) return;

        var nameEl = document.getElementById('modelInfoName');
        if (nameEl) nameEl.textContent = target.userData.name || '3D Model';

        const box = new THREE.Box3().setFromObject(target);
        const size = new THREE.Vector3();
        box.getSize(size);
        elSize.textContent = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;

        const triangles = countTriangles(target);
        elTriangles.textContent = triangles.toLocaleString();

        const volume = estimateVolume(target);
        if (volume > 1000) {
            elVolume.textContent = (volume / 1000).toFixed(1) + ' cm³';
        } else {
            elVolume.textContent = volume.toFixed(1) + ' mm³';
        }
    };
})();

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Update gizmo dashed lines (translate mode only, follows selected model)
    if (window._gizmoDashLines && transformControls) {
        const target = selectedModel || model;
        const isTranslate = transformControls.visible && transformControls.mode === 'translate' && target;
        window._gizmoDashLines.forEach(line => {
            line.visible = isTranslate;
            if (isTranslate && target) {
                line.position.copy(target.position);
            }
        });
    }

    renderer.render(scene, camera);

    // Sync ViewCube with camera orientation
    if (window._viewCube && window._viewCube.syncWithCamera) {
        window._viewCube.syncWithCamera();
        window._viewCube.render();
    }

    // Update model info card
    if (window._updateModelInfoCard) window._updateModelInfoCard();
}

// Resize handler
function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

window.addEventListener('resize', onResize);


// ============================================
// UI INTERACTIONS
// ============================================

// --- Theme Toggle ---
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
    const body = document.body;
    if (body.classList.contains('theme-dark')) {
        body.classList.remove('theme-dark');
        body.classList.add('theme-light');
    } else {
        body.classList.remove('theme-light');
        body.classList.add('theme-dark');
    }
    // Rebuild scene for new theme
    rebuildScene();
});

function rebuildScene() {
    // Clear scene and reset state
    while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }
    models = [];
    selectedModel = null;
    selectionOutline = null;
    const isDark = document.body.classList.contains('theme-dark');
    scene.fog = new THREE.FogExp2(isDark ? 0x0D0F17 : 0x94999F, 0.001);
    scene.background = new THREE.Color(isDark ? 0x0D0F17 : 0x94999F);
    renderer.toneMappingExposure = isDark ? 0.8 : 1.0;

    createLighting();
    createBuildPlate();
    createDemoModel();
    createEnvironment();
}

// --- Tool Buttons (old — now handled by floating toolbar) ---

// --- Parameter Card Accordion ---
document.querySelectorAll('.param-card-header').forEach(header => {
    header.addEventListener('click', function() {
        const body = this.nextElementSibling;
        if (!body || !body.classList.contains('param-card-body')) return;

        const isOpen = body.classList.contains('open');
        body.classList.toggle('open');

        // Rotate chevron
        const chevron = this.querySelector('.param-card-chevron');
        if (chevron) {
            chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    });
});

// --- Slider Value Display ---
const infillSlider = document.getElementById('infillSlider');
const infillValue = document.getElementById('infillValue');
if (infillSlider && infillValue) {
    infillSlider.addEventListener('input', function() {
        infillValue.textContent = this.value;
    });
}

// --- Panel Toggle ---
const panelToggle = document.getElementById('panelToggle');
const panelRight = document.getElementById('panelRight');
let panelCollapsed = false;

if (panelToggle) panelToggle.addEventListener('click', () => {
    panelCollapsed = !panelCollapsed;
    panelRight.classList.toggle('collapsed', panelCollapsed);

    // Flip arrow
    const svg = panelToggle.querySelector('svg');
    svg.style.transform = panelCollapsed ? 'rotate(180deg)' : '';

    // Resize viewport after animation
    setTimeout(onResize, 300);
});

// --- Tab Switcher ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.classList.remove('tab-highlight');
        });
        this.classList.add('active');
    });
});

// --- Slice Button Simulation ---
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const title = this.getAttribute('title');
        if (title === '切片') {
            runSliceSimulation();
        }
    });
});

function runSliceSimulation() {
    const modal = document.getElementById('sliceModal');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    modal.style.display = 'flex';
    progressFill.style.width = '0%';

    const steps = [
        { pct: 15, text: '正在分析模型...' },
        { pct: 30, text: '生成支撑结构...' },
        { pct: 50, text: '计算路径规划...' },
        { pct: 70, text: '优化打印路径...' },
        { pct: 85, text: '生成 G-code...' },
        { pct: 100, text: '切片完成！' },
    ];

    let i = 0;
    const interval = setInterval(() => {
        if (i >= steps.length) {
            clearInterval(interval);
            setTimeout(() => {
                modal.style.display = 'none';
                // Update status bar
                document.getElementById('printTime').textContent = '3h 42min';
                document.getElementById('materialUsage').textContent = '28.5g / 9.2m';
                document.getElementById('layerCount').textContent = '325 层';
            }, 800);
            return;
        }
        progressFill.style.width = steps[i].pct + '%';
        progressText.textContent = steps[i].text;
        i++;
    }, 600);
}

// --- Dropdown menu close on outside click (menu bar) ---
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-item')) {
        document.querySelectorAll('.dropdown-menu').forEach(d => {
            d.style.display = '';
        });
    }
});

// ============================================
// MODAL SYSTEM
// ============================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// --- Open modals from data-modal triggers ---
document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-modal]');
    if (trigger) {
        const modalId = trigger.getAttribute('data-modal');

        // Handle confirm modal special case
        if (modalId === 'confirmModal') {
            const title = trigger.getAttribute('data-confirm-title');
            const text = trigger.getAttribute('data-confirm-text');
            if (title) document.getElementById('confirmTitle').textContent = title;
            if (text) document.getElementById('confirmText').textContent = text;
        }

        openModal(modalId);
        // Close menus when opening modal from menu
        document.querySelectorAll('.dropdown-menu').forEach(d => { d.style.display = ''; });
        e.stopPropagation();
    }
});

// --- Close modal buttons ---
document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', function() {
        const modalId = this.getAttribute('data-close');
        closeModal(modalId);
    });
});

// --- Close modal on overlay click ---
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });
});

// --- Close modal on Escape key ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => {
            if (m.style.display !== 'none' && m.id !== 'sliceModal') {
                m.style.display = 'none';
            }
        });
    }
});

// ============================================
// PREFERENCES MODAL — Tab Switching
// ============================================
document.querySelectorAll('.modal-nav-item[data-pref-tab]').forEach(navItem => {
    navItem.addEventListener('click', function() {
        const tab = this.getAttribute('data-pref-tab');

        // Update nav active state
        document.querySelectorAll('.modal-nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');

        // Show corresponding panel
        document.querySelectorAll('.pref-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('pref-' + tab);
        if (panel) panel.classList.add('active');
    });
});

// --- Preferences: Theme select live preview ---
const prefThemeSelect = document.getElementById('prefThemeSelect');
if (prefThemeSelect) {
    // Sync current theme on open
    const observer = new MutationObserver(() => {
        const isDark = document.body.classList.contains('theme-dark');
        prefThemeSelect.value = isDark ? 'dark' : 'light';
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    prefThemeSelect.addEventListener('change', function() {
        const body = document.body;
        body.classList.remove('theme-dark', 'theme-light');
        body.classList.add(this.value === 'dark' ? 'theme-dark' : 'theme-light');
        rebuildScene();
    });
}

// --- Settings tab: category collapse/expand ---
document.querySelectorAll('.settings-category-header').forEach(header => {
    header.addEventListener('click', function() {
        const cat = this.closest('.settings-category');
        const body = cat.querySelector('.settings-category-body');
        const isOpen = cat.getAttribute('data-open') === 'true';
        cat.setAttribute('data-open', isOpen ? 'false' : 'true');
        body.style.display = isOpen ? 'none' : 'block';
    });
});

// --- Settings tab: check all toggle ---
const checkAllBox = document.getElementById('settingsCheckAll');
if (checkAllBox) {
    checkAllBox.addEventListener('change', function() {
        const panel = document.getElementById('pref-settings');
        panel.querySelectorAll('.settings-category-body input[type="checkbox"]').forEach(cb => {
            if (!cb.disabled) cb.checked = checkAllBox.checked;
        });
    });
}

// --- Settings tab: filter input ---
const filterInput = document.querySelector('.pref-input-filter');
if (filterInput) {
    filterInput.addEventListener('input', function() {
        const keyword = this.value.toLowerCase().trim();
        document.querySelectorAll('.settings-category-body .pref-checkbox').forEach(label => {
            const text = label.textContent.toLowerCase();
            label.style.display = (keyword === '' || text.includes(keyword)) ? '' : 'none';
        });
    });
}

// --- List panel: item switching (Printers/Profiles) ---
document.querySelectorAll('.pref-list-sidebar').forEach(sidebar => {
    sidebar.querySelectorAll('.pref-list-item').forEach(item => {
        item.addEventListener('click', function() {
            sidebar.querySelectorAll('.pref-list-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

// ============================================
// MATERIALS TAB — Tree & Detail Interactions
// ============================================

// Brand header toggle
document.querySelectorAll('.mat-brand-header').forEach(header => {
    header.addEventListener('click', function() {
        const brand = this.closest('.mat-brand');
        const isCollapsed = brand.getAttribute('data-collapsed') === 'true';
        brand.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
        const toggle = this.querySelector('.mat-toggle');
        if (toggle) toggle.textContent = isCollapsed ? '⌄' : '‹';
    });
});

// Type header toggle
document.querySelectorAll('.mat-type-header').forEach(header => {
    header.addEventListener('click', function(e) {
        e.stopPropagation();
        const type = this.closest('.mat-type');
        const isCollapsed = type.getAttribute('data-collapsed') === 'true';
        type.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
        const toggle = this.querySelector('.mat-toggle');
        if (toggle) toggle.textContent = isCollapsed ? '⌄' : '‹';
    });
});

// Material item selection
document.querySelectorAll('.mat-item').forEach(item => {
    item.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.mat-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});

// Favorite star toggle
document.querySelectorAll('.mat-fav').forEach(star => {
    star.addEventListener('click', function(e) {
        e.stopPropagation();
        this.classList.toggle('unfav');
        this.textContent = this.classList.contains('unfav') ? '☆' : '★';
    });
});

// Material detail tabs
document.querySelectorAll('.mat-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const target = this.getAttribute('data-mat-tab');
        document.querySelectorAll('.mat-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.mat-tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('mat-tab-' + target);
        if (panel) panel.classList.add('active');
    });
});

// --- Printer list item switching ---
document.querySelectorAll('.printer-list-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.printer-list-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});

// --- Profile list item switching ---
document.querySelectorAll('.profile-list-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.profile-list-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});

// ============================================
// ADD PRINTER MODAL — Interactions
// ============================================

// Brand header toggle
document.querySelectorAll('.ap-brand-header').forEach(header => {
    header.addEventListener('click', function() {
        const brand = this.closest('.ap-brand');
        const isCollapsed = brand.getAttribute('data-collapsed') === 'true';
        brand.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
        const caret = this.querySelector('.ap-caret');
        if (caret) caret.textContent = isCollapsed ? '⌄' : '›';
    });
});

// Radio selection → update detail panel
document.querySelectorAll('input[name="addPrinter"]').forEach(radio => {
    radio.addEventListener('change', function() {
        const name = this.getAttribute('data-name') || '';
        const mfr = this.getAttribute('data-mfr') || '';
        const author = this.getAttribute('data-author') || '';
        const titleEl = document.getElementById('apDetailTitle');
        const mfrEl = document.getElementById('apDetailMfr');
        const authorEl = document.getElementById('apDetailAuthor');
        const nameInput = document.getElementById('apDetailName');
        if (titleEl) titleEl.textContent = name;
        if (mfrEl) mfrEl.textContent = mfr;
        if (authorEl) authorEl.textContent = author;
        if (nameInput) nameInput.value = name;
    });
});

// --- Parameter input modification marker ---
document.querySelectorAll('.param-input').forEach(input => {
    const originalValue = input.value;
    input.addEventListener('change', function() {
        const row = this.closest('.param-row');
        if (this.value !== originalValue) {
            row.classList.add('modified');
        } else {
            row.classList.remove('modified');
        }
    });
});

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
    // Ctrl+Z - show as feedback
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        flashStatus('撤销操作');
    }
    // Delete
    if (e.key === 'Delete') {
        flashStatus('删除选中模型');
    }
    // F11 fullscreen
    if (e.key === 'F11') {
        e.preventDefault();
        document.documentElement.requestFullscreen?.();
    }
});

function flashStatus(msg) {
    const statusBar = document.getElementById('statusBar');
    // Temporarily show message
    const existing = statusBar.querySelector('.flash-msg');
    if (existing) existing.remove();

    const flash = document.createElement('div');
    flash.className = 'flash-msg';
    flash.style.cssText = `
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        font-size: 11px;
        color: var(--brand-orange);
        font-weight: 500;
        pointer-events: none;
        animation: fadeIn 0.2s ease;
    `;
    flash.textContent = msg;
    statusBar.appendChild(flash);

    setTimeout(() => flash.remove(), 2000);
}

// ============================================
// PRINTER DROPDOWN SELECTOR (Left Panel)
// ============================================
const printerSelectorBtn = document.getElementById('printerSelectorBtn');
const printerDropdown = document.getElementById('printerDropdown');

if (printerSelectorBtn && printerDropdown) {
    printerSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        printerDropdown.classList.toggle('open');
    });

    printerDropdown.querySelectorAll('.printer-dropdown-item').forEach(item => {
        item.addEventListener('click', function() {
            const name = this.getAttribute('data-printer');
            const meta = this.getAttribute('data-meta') || '';
            document.getElementById('printerSelectorName').textContent = name;
            // Update meta
            const metaEl = printerSelectorBtn.querySelector('.lp-printer-meta');
            if (metaEl && meta) metaEl.textContent = meta;
            printerDropdown.querySelectorAll('.printer-dropdown-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            printerDropdown.classList.remove('open');
        });
    });

    printerDropdown.querySelectorAll('.printer-dropdown-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            printerDropdown.classList.remove('open');
        });
    });
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (printerDropdown && !e.target.closest('.lp-printer-section')) {
        printerDropdown.classList.remove('open');
    }
});

// ============================================
// LEFT PANEL — Category Tabs (质量/强度/支撑/其他)
// ============================================
document.querySelectorAll('.lp-cat-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const cat = this.getAttribute('data-cat');
        // Switch tab active
        document.querySelectorAll('.lp-cat-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        // Switch panel
        document.querySelectorAll('.lp-cat-panel').forEach(p => p.classList.remove('active'));
        const panel = document.querySelector(`.lp-cat-panel[data-panel="${cat}"]`);
        if (panel) panel.classList.add('active');
    });
});

// ============================================
// LEFT PANEL — Parameter Group Collapse
// ============================================
document.querySelectorAll('.lp-group-header').forEach(header => {
    header.addEventListener('click', function() {
        const group = this.closest('.lp-param-group');
        const isOpen = group.getAttribute('data-group-open') === 'true';
        group.setAttribute('data-group-open', isOpen ? 'false' : 'true');
    });
});

// ============================================
// LEFT PANEL — Spinner +/- buttons
// ============================================
document.querySelectorAll('.lp-spin-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const spinner = this.closest('.lp-spinner');
        const input = spinner.querySelector('.lp-spin-input');
        const step = parseFloat(input.getAttribute('step')) || 1;
        let val = parseFloat(input.value) || 0;
        if (this.textContent.trim() === '+') {
            val += step;
        } else {
            val -= step;
        }
        // Round to avoid floating point issues
        val = Math.round(val * 1000) / 1000;
        input.value = val;
    });
});

// ============================================
// LEFT PANEL — Process Toggle (全局/对象)
// ============================================
document.querySelectorAll('.lp-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        this.closest('.lp-process-toggle').querySelectorAll('.lp-toggle-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

// ============================================
// TOP BAR — Tab Switcher
// ============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

// ============================================
// FLOATING TOOLBAR + TOOL PANELS
// ============================================
// Global function for gizmo objectChange → panel sync
function syncPanelFromModel() {
    if (typeof window._syncPanelFromModel === 'function') window._syncPanelFromModel();
}

(function() {
    const toolPanel = document.getElementById('toolPanel');
    const toolPanelTitle = document.getElementById('toolPanelTitle');
    const toolPanelShortcut = document.getElementById('toolPanelShortcut');
    const toolPanelBody = document.getElementById('toolPanelBody');
    let currentTool = 'select';

    // --- Helper: read live model values ---
    function getPos() {
        if (!model) return { x: 0, y: 0, z: 0 };
        return { x: model.position.x, y: model.position.y, z: model.position.z };
    }
    function getRot() {
        if (!model) return { x: 0, y: 0, z: 0 };
        return {
            x: Math.round(THREE.MathUtils.radToDeg(model.rotation.x)),
            y: Math.round(THREE.MathUtils.radToDeg(model.rotation.y)),
            z: Math.round(THREE.MathUtils.radToDeg(model.rotation.z))
        };
    }
    function getScaleMM() {
        if (!model) return { x: 0, y: 0, z: 0 };
        return {
            x: (Math.abs(model.scale.x) * modelInitialSize.x).toFixed(4),
            y: (Math.abs(model.scale.y) * modelInitialSize.y).toFixed(4),
            z: (Math.abs(model.scale.z) * modelInitialSize.z).toFixed(4)
        };
    }
    function getScalePct() {
        if (!model) return { x: 100, y: 100, z: 100 };
        return {
            x: Math.round(Math.abs(model.scale.x) * 100),
            y: Math.round(Math.abs(model.scale.y) * 100),
            z: Math.round(Math.abs(model.scale.z) * 100)
        };
    }

    // --- Sync panel inputs from model (called on gizmo drag) ---
    window._syncPanelFromModel = function() {
        if (currentTool === 'move') {
            const inputs = toolPanelBody.querySelectorAll('.tp-input');
            if (inputs.length >= 3) {
                const p = getPos();
                inputs[0].value = p.x.toFixed(4);
                inputs[1].value = p.y.toFixed(4);
                inputs[2].value = p.z.toFixed(4);
            }
        } else if (currentTool === 'scale') {
            const inputs = toolPanelBody.querySelectorAll('.tp-input');
            if (inputs.length >= 6) {
                const mm = getScaleMM();
                const pct = getScalePct();
                inputs[0].value = mm.x; inputs[1].value = pct.x;
                inputs[2].value = mm.y; inputs[3].value = pct.y;
                inputs[4].value = mm.z; inputs[5].value = pct.z;
            }
        } else if (currentTool === 'rotate') {
            const inputs = toolPanelBody.querySelectorAll('.tp-input');
            if (inputs.length >= 3) {
                const r = getRot();
                inputs[0].value = r.x;
                inputs[1].value = r.y;
                inputs[2].value = r.z;
            }
        }
    };

    // --- Update TransformControls mode for current tool ---
    function updateGizmoMode(tool) {
        if (!transformControls || !model) return;
        const modeMap = { move: 'translate', scale: 'scale', rotate: 'rotate' };
        if (modeMap[tool]) {
            transformControls.attach(model);
            transformControls.setMode(modeMap[tool]);
            transformControls.visible = true;
            transformControls.enabled = !modelLocked;
        } else {
            transformControls.detach();
            transformControls.visible = false;
            transformControls.enabled = false;
        }
    }

    // Tools that have panels
    const toolPanelDefs = {
        move: {
            title: '移动',
            shortcut: 'T',
            render() {
                const p = getPos();
                return `
                    <div class="tp-section">
                        <div class="tp-section-header" data-section="worldcoord">
                            <svg class="tp-section-arrow" viewBox="0 0 10 10" width="10" height="10"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                            <span>世界坐标</span>
                        </div>
                        <div class="tp-section-body" id="worldCoordBody">
                            <div class="tp-row">
                                <span class="tp-axis-tag axis-x-tag">X</span>
                                <div class="tp-input-wrap"><input class="tp-input" data-axis="x" type="number" value="${p.x.toFixed(4)}" step="0.1"><span class="tp-input-unit">mm</span></div>
                            </div>
                            <div class="tp-row">
                                <span class="tp-axis-tag axis-y-tag">Y</span>
                                <div class="tp-input-wrap"><input class="tp-input" data-axis="y" type="number" value="${p.y.toFixed(4)}" step="0.1"><span class="tp-input-unit">mm</span></div>
                            </div>
                            <div class="tp-row">
                                <span class="tp-axis-tag axis-z-tag">Z</span>
                                <div class="tp-input-wrap"><input class="tp-input" data-axis="z" type="number" value="${p.z.toFixed(4)}" step="0.1"><span class="tp-input-unit">mm</span></div>
                            </div>
                        </div>
                    </div>
                    <div class="tp-section">
                        <div class="tp-section-header" data-section="alignplate">
                            <svg class="tp-section-arrow" viewBox="0 0 10 10" width="10" height="10"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                            <span>对齐盘</span>
                        </div>
                        <div class="tp-section-body" id="alignPlateBody">
                            <div class="tp-align-grid">
                                <button class="tp-align-btn" data-align="lf" title="左前">◰</button>
                                <button class="tp-align-btn" data-align="cf" title="中前">◳</button>
                                <button class="tp-align-btn" data-align="rf" title="右前">◲</button>
                                <button class="tp-align-btn" data-align="lb" title="左后">◱</button>
                                <button class="tp-align-btn" data-align="cb" title="中后">◳</button>
                                <button class="tp-align-btn" data-align="rb" title="右后">◲</button>
                            </div>
                            <button class="tp-btn tp-snap-btn" id="snapGridBtn" title="网格对齐"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M8 2v12M2 8h12"/><circle cx="8" cy="8" r="2"/></svg> 网格对齐</button>
                        </div>
                    </div>
                    <label class="tp-checkbox-row"><input type="checkbox" id="lockModelCb"${modelLocked ? ' checked' : ''}> 锁定模型</label>
                    <label class="tp-checkbox-row"><input type="checkbox" id="dropDownCb"> Drop Down Model</label>
                `;
            },
            bind() {
                // Section collapse/expand
                toolPanelBody.querySelectorAll('.tp-section-header').forEach(header => {
                    header.addEventListener('click', function() {
                        const section = this.closest('.tp-section');
                        section.classList.toggle('collapsed');
                    });
                });

                const inputs = toolPanelBody.querySelectorAll('.tp-input');
                inputs.forEach(inp => {
                    inp.addEventListener('change', function() {
                        if (!model) return;
                        const axis = this.dataset.axis;
                        model.position[axis] = parseFloat(this.value) || 0;
                    });
                });
                // Lock model checkbox
                const lockCb = toolPanelBody.querySelector('#lockModelCb');
                if (lockCb) {
                    lockCb.addEventListener('change', function() {
                        modelLocked = this.checked;
                        if (transformControls) {
                            transformControls.enabled = !modelLocked;
                        }
                    });
                }
                // Drop Down Model
                const dropCb = toolPanelBody.querySelector('#dropDownCb');
                if (dropCb) {
                    dropCb.addEventListener('change', function() {
                        if (this.checked && model) {
                            model.position.y = 0;
                            inputs[1].value = '0.0000';
                        }
                    });
                }
                // Alignment buttons
                const plateW = 410, plateD = 310;
                const alignPositions = {
                    lf: [-plateW/4, 0, plateD/4],
                    cf: [0, 0, plateD/4],
                    rf: [plateW/4, 0, plateD/4],
                    lb: [-plateW/4, 0, -plateD/4],
                    cb: [0, 0, -plateD/4],
                    rb: [plateW/4, 0, -plateD/4],
                };
                toolPanelBody.querySelectorAll('.tp-align-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        if (!model) return;
                        const key = this.dataset.align;
                        const pos = alignPositions[key];
                        if (pos) {
                            model.position.set(pos[0], pos[1], pos[2]);
                            if (typeof syncPanelFromModel === 'function') syncPanelFromModel();
                            showToast('已对齐到 ' + this.title);
                        }
                    });
                });
                // Snap grid button
                const snapBtn = toolPanelBody.querySelector('#snapGridBtn');
                if (snapBtn) {
                    snapBtn.addEventListener('click', function() {
                        if (!model) return;
                        model.position.x = Math.round(model.position.x / 10) * 10;
                        model.position.z = Math.round(model.position.z / 10) * 10;
                        if (typeof syncPanelFromModel === 'function') syncPanelFromModel();
                        showToast('已对齐到网格');
                    });
                }
            }
        },
        scale: {
            title: '缩放',
            shortcut: 'S',
            render() {
                const mm = getScaleMM();
                const pct = getScalePct();
                return `
                    <div class="tp-row">
                        <span class="tp-axis-label axis-x">X</span>
                        <div class="tp-input-wrap"><input class="tp-input tp-scale-mm" data-axis="x" type="number" value="${mm.x}" step="0.1"><span class="tp-input-unit">mm</span></div>
                        <div class="tp-input-wrap"><input class="tp-input tp-scale-pct" data-axis="x" type="number" value="${pct.x}" step="1"><span class="tp-input-unit">%</span></div>
                    </div>
                    <div class="tp-row">
                        <span class="tp-axis-label axis-y">Y</span>
                        <div class="tp-input-wrap"><input class="tp-input tp-scale-mm" data-axis="y" type="number" value="${mm.y}" step="0.1"><span class="tp-input-unit">mm</span></div>
                        <div class="tp-input-wrap"><input class="tp-input tp-scale-pct" data-axis="y" type="number" value="${pct.y}" step="1"><span class="tp-input-unit">%</span></div>
                    </div>
                    <div class="tp-row">
                        <span class="tp-axis-label axis-z">Z</span>
                        <div class="tp-input-wrap"><input class="tp-input tp-scale-mm" data-axis="z" type="number" value="${mm.z}" step="0.1"><span class="tp-input-unit">mm</span></div>
                        <div class="tp-input-wrap"><input class="tp-input tp-scale-pct" data-axis="z" type="number" value="${pct.z}" step="1"><span class="tp-input-unit">%</span></div>
                    </div>
                    <div class="tp-btn-row">
                        <button class="tp-btn" id="scaleResetBtn" title="重置"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8a5 5 0 019-3"/><path d="M13 8a5 5 0 01-9 3"/><path d="M12 5h2V3"/></svg></button>
                    </div>
                    <label class="tp-checkbox-row"><input type="checkbox"> 等距缩放（Snap Scaling）</label>
                    <label class="tp-checkbox-row"><input type="checkbox" checked id="uniformScaleCb"> 等比例缩放</label>
                `;
            },
            bind() {
                const mmInputs = toolPanelBody.querySelectorAll('.tp-scale-mm');
                const pctInputs = toolPanelBody.querySelectorAll('.tp-scale-pct');
                const uniformCb = toolPanelBody.querySelector('#uniformScaleCb');

                function refreshAll() {
                    const mm = getScaleMM();
                    const pct = getScalePct();
                    const axes = ['x', 'y', 'z'];
                    mmInputs.forEach((inp, i) => { inp.value = mm[axes[i]]; });
                    pctInputs.forEach((inp, i) => { inp.value = pct[axes[i]]; });
                }

                // mm input → update scale
                mmInputs.forEach(inp => {
                    inp.addEventListener('change', function() {
                        if (!model) return;
                        const axis = this.dataset.axis;
                        const newMM = parseFloat(this.value) || 0;
                        const baseSize = modelInitialSize[axis];
                        if (baseSize === 0) return;
                        const sign = model.scale[axis] < 0 ? -1 : 1;
                        const newScale = newMM / baseSize;
                        model.scale[axis] = sign * newScale;
                        if (uniformCb && uniformCb.checked) {
                            const axes = ['x', 'y', 'z'];
                            axes.forEach(a => {
                                if (a !== axis) {
                                    const s = model.scale[a] < 0 ? -1 : 1;
                                    model.scale[a] = s * newScale;
                                }
                            });
                        }
                        refreshAll();
                    });
                });

                // pct input → update scale
                pctInputs.forEach(inp => {
                    inp.addEventListener('change', function() {
                        if (!model) return;
                        const axis = this.dataset.axis;
                        const newPct = parseFloat(this.value) || 100;
                        const newScale = newPct / 100;
                        const sign = model.scale[axis] < 0 ? -1 : 1;
                        model.scale[axis] = sign * newScale;
                        if (uniformCb && uniformCb.checked) {
                            const axes = ['x', 'y', 'z'];
                            axes.forEach(a => {
                                if (a !== axis) {
                                    const s = model.scale[a] < 0 ? -1 : 1;
                                    model.scale[a] = s * newScale;
                                }
                            });
                        }
                        refreshAll();
                    });
                });

                // Reset button
                const resetBtn = toolPanelBody.querySelector('#scaleResetBtn');
                if (resetBtn) {
                    resetBtn.addEventListener('click', function() {
                        if (!model) return;
                        model.scale.set(1, 1, 1);
                        refreshAll();
                        showToast('缩放已重置');
                    });
                }
            }
        },
        rotate: {
            title: '旋转',
            shortcut: 'R',
            render() {
                const r = getRot();
                return `
                    <div class="tp-row">
                        <span class="tp-axis-label axis-x">X</span>
                        <div class="tp-input-wrap"><input class="tp-input" data-axis="x" type="number" value="${r.x}" step="1"><span class="tp-input-unit">°</span></div>
                    </div>
                    <div class="tp-row">
                        <span class="tp-axis-label axis-y">Y</span>
                        <div class="tp-input-wrap"><input class="tp-input" data-axis="y" type="number" value="${r.y}" step="1"><span class="tp-input-unit">°</span></div>
                    </div>
                    <div class="tp-row">
                        <span class="tp-axis-label axis-z">Z</span>
                        <div class="tp-input-wrap"><input class="tp-input" data-axis="z" type="number" value="${r.z}" step="1"><span class="tp-input-unit">°</span></div>
                    </div>
                    <label class="tp-checkbox-row"><input type="checkbox" checked> 等距旋转（Snap Rotation）</label>
                    <div class="tp-btn-row">
                        <button class="tp-btn" id="rotResetBtn" title="重置旋转"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8a5 5 0 019-3"/><path d="M13 8a5 5 0 01-9 3"/><path d="M12 5h2V3"/></svg> 重置</button>
                        <button class="tp-btn" id="rotAutoBtn" title="自动摆放"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 13h12"/><path d="M5 13V7l3-4 3 4v6"/></svg> 自动摆放</button>
                        <button class="tp-btn" id="rotFlatBtn" title="放平到底面"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="10" width="12" height="4"/><path d="M5 10V6h6v4"/></svg> 放平</button>
                    </div>
                `;
            },
            bind() {
                const inputs = toolPanelBody.querySelectorAll('.tp-input');
                inputs.forEach(inp => {
                    inp.addEventListener('change', function() {
                        if (!model) return;
                        const axis = this.dataset.axis;
                        if (!axis) return;
                        model.rotation[axis] = THREE.MathUtils.degToRad(parseFloat(this.value) || 0);
                    });
                });

                // Reset
                const resetBtn = toolPanelBody.querySelector('#rotResetBtn');
                if (resetBtn) {
                    resetBtn.addEventListener('click', function() {
                        if (!model) return;
                        model.rotation.set(0, 0, 0);
                        inputs.forEach(inp => { if (inp.dataset.axis) inp.value = 0; });
                        showToast('旋转已重置');
                    });
                }

                // Auto orient (demo: small random rotation)
                const autoBtn = toolPanelBody.querySelector('#rotAutoBtn');
                if (autoBtn) {
                    autoBtn.addEventListener('click', function() {
                        if (!model) return;
                        model.rotation.x = THREE.MathUtils.degToRad(Math.round(Math.random() * 30 - 15));
                        model.rotation.y = THREE.MathUtils.degToRad(Math.round(Math.random() * 30 - 15));
                        model.rotation.z = THREE.MathUtils.degToRad(Math.round(Math.random() * 30 - 15));
                        const r = getRot();
                        inputs[0].value = r.x;
                        inputs[1].value = r.y;
                        inputs[2].value = r.z;
                        showToast('已自动摆放');
                    });
                }

                // Lay flat
                const flatBtn = toolPanelBody.querySelector('#rotFlatBtn');
                if (flatBtn) {
                    flatBtn.addEventListener('click', function() {
                        if (!model) return;
                        model.rotation.set(0, 0, 0);
                        inputs.forEach(inp => { if (inp.dataset.axis) inp.value = 0; });
                        showToast('已放平到底面');
                    });
                }
            }
        },
        mirror: {
            title: '镜像',
            shortcut: 'M',
            render() {
                return `
                    <div class="tp-mirror-grid">
                        <button class="tp-mirror-btn mirror-x" data-mirror="x"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8l4-4v8z"/></svg> X+</button>
                        <button class="tp-mirror-btn mirror-x" data-mirror="x"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8l-4-4v8z"/></svg> X-</button>
                        <button class="tp-mirror-btn mirror-y" data-mirror="y"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 4l-4 4h8z"/></svg> Y+</button>
                        <button class="tp-mirror-btn mirror-y" data-mirror="y"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 12l-4-4h8z"/></svg> Y-</button>
                        <button class="tp-mirror-btn mirror-z" data-mirror="z"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8l4-4v8z"/></svg> Z+</button>
                        <button class="tp-mirror-btn mirror-z" data-mirror="z"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8l-4-4v8z"/></svg> Z-</button>
                    </div>
                `;
            },
            bind() {
                toolPanelBody.querySelectorAll('.tp-mirror-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        if (!model) return;
                        const axis = this.dataset.mirror;
                        model.scale[axis] *= -1;
                        const axisLabel = axis.toUpperCase();
                        showToast('已沿 ' + axisLabel + ' 轴镜像');
                    });
                });
            }
        },
        permodel: {
            title: '单独设置',
            shortcut: '',
            render() {
                return `
                    <div class="tp-mesh-grid">
                        <button class="tp-mesh-btn active" title="正常模式"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14"/></svg></button>
                        <button class="tp-mesh-btn" title="填充模式"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14"/><path d="M3 7h14M3 11h14M3 15h14M7 3v14M11 3v14"/></svg></button>
                        <button class="tp-mesh-btn" title="线框模式"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" stroke-dasharray="2 2"/><path d="M3 10h14M10 3v14" stroke-dasharray="2 2"/></svg></button>
                        <button class="tp-mesh-btn" title="自定义"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="3"/><circle cx="13" cy="7" r="3"/><circle cx="7" cy="13" r="3"/><circle cx="13" cy="13" r="3"/></svg></button>
                    </div>
                    <p class="tp-desc">网格类型: 正常模式</p>
                    <button class="tp-btn">选择设置</button>
                `;
            },
            bind() {
                const meshBtns = toolPanelBody.querySelectorAll('.tp-mesh-btn');
                const meshLabels = ['正常模式', '填充模式', '线框模式', '自定义模式'];
                meshBtns.forEach((btn, i) => {
                    btn.addEventListener('click', () => {
                        meshBtns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        toolPanelBody.querySelector('.tp-desc').textContent = '网格类型: ' + meshLabels[i];
                    });
                });
            }
        },
        supportblocker: {
            title: '支撑拦截器',
            shortcut: 'E',
            render() {
                return `
                    <p class="tp-desc">在模型表面绘制区域以阻止生成支撑</p>
                    <label class="tp-checkbox-row"><input type="checkbox"> 启用支撑拦截</label>
                `;
            }
        }
    };

    const floatingToolbar = document.getElementById('floatingToolbar');

    function showToolPanel(tool) {
        const def = toolPanelDefs[tool];
        if (!def) { toolPanel.style.display = 'none'; floatingToolbar.classList.remove('panel-open'); return; }
        toolPanelTitle.textContent = def.title;
        toolPanelShortcut.textContent = def.shortcut;
        toolPanelShortcut.style.display = def.shortcut ? '' : 'none';
        toolPanelBody.innerHTML = def.render();
        toolPanel.style.display = '';
        floatingToolbar.classList.add('panel-open');
        toolPanel.style.animation = 'none';
        toolPanel.offsetHeight; // reflow
        toolPanel.style.animation = '';

        // Bind events for this tool
        if (def.bind) def.bind();

        // Update gizmo mode
        updateGizmoMode(tool);
    }

    function hideToolPanel() {
        toolPanel.style.display = 'none';
        floatingToolbar.classList.remove('panel-open');
        updateGizmoMode('select');
    }

    // Tool button clicks
    document.querySelectorAll('#floatingToolbar .ftool-btn:not(.ftool-extruder)').forEach(btn => {
        btn.addEventListener('click', function() {
            const tool = this.dataset.tool;
            // Toggle: clicking same tool again closes the panel
            if (tool === currentTool && tool !== 'select') {
                // Deselect to select mode
                document.querySelectorAll('#floatingToolbar .ftool-btn:not(.ftool-extruder)').forEach(b => b.classList.remove('active'));
                document.querySelector('.ftool-btn[data-tool="select"]').classList.add('active');
                currentTool = 'select';
                hideToolPanel();
                return;
            }
            document.querySelectorAll('#floatingToolbar .ftool-btn:not(.ftool-extruder)').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentTool = tool;
            if (tool === 'select') {
                hideToolPanel();
            } else {
                showToolPanel(tool);
            }
        });
    });

    // Extruder button clicks
    document.querySelectorAll('.ftool-extruder').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.ftool-extruder').forEach(b => b.classList.remove('ftool-extruder-active'));
            this.classList.add('ftool-extruder-active');
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const keyMap = { t: 'move', s: 'scale', r: 'rotate', m: 'mirror', e: 'supportblocker' };
        const tool = keyMap[e.key.toLowerCase()];
        if (tool) {
            const btn = document.querySelector('.ftool-btn[data-tool="' + tool + '"]');
            if (btn) btn.click();
        }
    });
})();

// --- Mouse position tracking for potential ray cast ---
if (viewport) viewport.addEventListener('mousemove', (e) => {
    const rect = viewport.getBoundingClientRect();
    mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
});


// ============================================
// SVG VIEWCUBE - 3D Orientation Navigator
// ============================================

window._viewCube = (function() {
    const svg = document.getElementById('viewCubeSVG');
    if (!svg) return {};

    const SIZE = 140;
    const CENTER = SIZE / 2;
    const CUBE_SIZE = 28; // half-size of cube (Bambu style, slightly smaller)

    // Cube vertices in 3D (centered at origin)
    const vertices = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // back face (0-3)
        [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1], // front face (4-7)
    ];

    // Faces: [vertex indices], label, viewName
    const faces = [
        { verts: [4, 5, 6, 7], label: '前面', view: 'front' },
        { verts: [1, 0, 3, 2], label: '后面', view: 'back' },
        { verts: [5, 1, 2, 6], label: '右面', view: 'right' },
        { verts: [0, 4, 7, 3], label: '左面', view: 'left' },
        { verts: [7, 6, 2, 3], label: '顶部', view: 'top' },
        { verts: [0, 1, 5, 4], label: '底部', view: 'bottom' },
    ];

    // 12 edges with direction labels
    const edgeDefs = [
        { verts: [0,1], label: '后下' }, { verts: [1,2], label: '右后' },
        { verts: [2,3], label: '后上' }, { verts: [3,0], label: '左后' },
        { verts: [4,5], label: '前下' }, { verts: [5,6], label: '右前' },
        { verts: [6,7], label: '前上' }, { verts: [7,4], label: '左前' },
        { verts: [0,4], label: '左下' }, { verts: [1,5], label: '右下' },
        { verts: [2,6], label: '右上' }, { verts: [3,7], label: '左上' },
    ];

    // 8 corners with combined labels and view directions
    const cornerDefs = [
        { vert: 0, label: '左后下' }, { vert: 1, label: '右后下' },
        { vert: 2, label: '右后上' }, { vert: 3, label: '左后上' },
        { vert: 4, label: '左前下' }, { vert: 5, label: '右前下' },
        { vert: 6, label: '右前上' }, { vert: 7, label: '左前上' },
    ];

    // Current rotation angles (synced with camera)
    let rotX = -0.5; // pitch
    let rotY = 0.6;  // yaw

    let hoveredFace = null;
    let hoveredEdge = null;
    let hoveredCorner = null;
    let faceElements = [];

    function project(x, y, z) {
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        let x1 = x * cosY + z * sinY;
        let z1 = -x * sinY + z * cosY;
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        let y1 = y * cosX - z1 * sinX;
        let z2 = y * sinX + z1 * cosX;
        const perspective = 4;
        const scale = perspective / (perspective + z2 * 0.3);
        return {
            x: CENTER + x1 * CUBE_SIZE * scale,
            y: CENTER - y1 * CUBE_SIZE * scale,
            z: z2,
        };
    }

    function getFaceNormalZ(faceIdx) {
        const f = faces[faceIdx];
        const v = f.verts.map(i => {
            const [vx, vy, vz] = vertices[i];
            return project(vx, vy, vz);
        });
        const ax = v[1].x - v[0].x, ay = v[1].y - v[0].y;
        const bx = v[3].x - v[0].x, by = v[3].y - v[0].y;
        return ax * by - ay * bx;
    }

    // Get 3D face normal z-component (how much the face points toward camera)
    function getFaceFrontness(faceIdx) {
        const f = faces[faceIdx];
        // Face normals in object space
        const normals = [
            [0,0,1], [0,0,-1], [1,0,0], [-1,0,0], [0,1,0], [0,-1,0]
        ];
        const [nx, ny, nz] = normals[faceIdx];
        // Rotate normal same way as vertices
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        let nx1 = nx * cosY + nz * sinY;
        let nz1 = -nx * sinY + nz * cosY;
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        let ny1 = ny * cosX - nz1 * sinX;
        let nz2 = ny * sinX + nz1 * cosX;
        return nz2; // positive = facing camera
    }

    // Unique gradient ID counter
    let gradIdCounter = 0;

    function render() {
        const isDark = document.body.classList.contains('theme-dark');
        gradIdCounter = 0;

        // Colors
        const baseFaceColor = isDark ? [39, 40, 53] : [242, 243, 245];
        const faceStroke = isDark ? '#464C5E' : '#C1C7CF';
        const hoverColor = isDark ? '#3A225B' : '#EBDCFF';
        const hoverStroke = isDark ? '#8B52DC' : '#7B2FD4';
        const textColor = isDark ? '#A4ABB8' : '#666D80';
        const hoverTextColor = isDark ? '#DBBFF8' : '#7B2FD4';
        const edgeHighlight = isDark ? 'rgba(180,190,220,0.35)' : 'rgba(120,130,160,0.25)';
        const edgeHoverColor = isDark ? '#8B52DC' : '#7B2FD4';
        const cornerColor = isDark ? 'rgba(160,170,200,0.5)' : 'rgba(100,110,140,0.4)';
        const cornerHoverColor = isDark ? '#DBBFF8' : '#7B2FD4';

        // Sort faces by average z
        const faceOrder = faces.map((f, i) => {
            const avgZ = f.verts.reduce((sum, vi) => {
                const [vx, vy, vz] = vertices[vi];
                return sum + project(vx, vy, vz).z;
            }, 0) / 4;
            return { index: i, avgZ, normalZ: getFaceNormalZ(i) };
        }).filter(f => f.normalZ > 0)
          .sort((a, b) => a.avgZ - b.avgZ);

        let defs = '';
        let html = '';
        faceElements = [];

        // --- SVG Filters ---
        defs += `
        <filter id="vcGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="vcEdgeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>`;

        // --- Back edges (wireframe, subtle) ---
        edgeDefs.forEach(({ verts: [a, b] }) => {
            const [ax,ay,az] = vertices[a];
            const [bx,by,bz] = vertices[b];
            const pa = project(ax, ay, az);
            const pb = project(bx, by, bz);
            html += `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="${faceStroke}" stroke-width="0.5" opacity="0.2"/>`;
        });

        // --- Visible faces with gradients ---
        faceOrder.forEach(({ index }) => {
            const f = faces[index];
            const frontness = getFaceFrontness(index);
            const projected = f.verts.map(vi => {
                const [vx, vy, vz] = vertices[vi];
                return project(vx, vy, vz);
            });

            const pathD = projected.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
            const isHovered = hoveredFace === index;

            // Brightness based on frontness (0..1 → how much face points at camera)
            const brightness = Math.max(0, Math.min(1, frontness * 0.8 + 0.2));

            if (!isHovered) {
                // Create gradient for each face (corner-to-corner brightness variation)
                const gid = `vcFGrad${gradIdCounter++}`;
                const [r, g, b] = baseFaceColor;
                const lightR = Math.min(255, r + Math.round(30 * brightness));
                const lightG = Math.min(255, g + Math.round(30 * brightness));
                const lightB = Math.min(255, b + Math.round(30 * brightness));
                const darkR = Math.max(0, r - Math.round(15 * (1 - brightness)));
                const darkG = Math.max(0, g - Math.round(15 * (1 - brightness)));
                const darkB = Math.max(0, b - Math.round(15 * (1 - brightness)));

                defs += `<linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="rgb(${lightR},${lightG},${lightB})"/>
                    <stop offset="100%" stop-color="rgb(${darkR},${darkG},${darkB})"/>
                </linearGradient>`;

                html += `<path d="${pathD}" fill="url(#${gid})" stroke="${faceStroke}" stroke-width="1" data-face="${index}" style="cursor:pointer;" opacity="0.94"/>`;
            } else {
                // Hovered face: glow effect
                html += `<path d="${pathD}" fill="${hoverColor}" stroke="${hoverStroke}" stroke-width="1.5" data-face="${index}" style="cursor:pointer;" opacity="0.96" filter="url(#vcGlow)"/>`;
            }

            // Label
            const cx = projected.reduce((s, p) => s + p.x, 0) / 4;
            const cy = projected.reduce((s, p) => s + p.y, 0) / 4;
            const fontSize = isHovered ? 13 : 11;
            const txtColor = isHovered ? hoverTextColor : textColor;
            html += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central"
                      fill="${txtColor}" font-size="${fontSize}" font-weight="${isHovered ? '700' : '500'}"
                      font-family="-apple-system, sans-serif" pointer-events="none">${f.label}</text>`;

            faceElements.push({ index, path: pathD, projected });
        });

        // --- Front edges (highlighted, metallic look) ---
        const visibleFaceSet = new Set(faceOrder.map(f => f.index));
        edgeDefs.forEach(({ verts: [a, b] }, edgeIdx) => {
            const [ax,ay,az] = vertices[a];
            const [bx,by,bz] = vertices[b];
            const pa = project(ax, ay, az);
            const pb = project(bx, by, bz);
            // Check if edge is shared by at least one visible face
            const edgeVisible = faces.some((f, fi) => visibleFaceSet.has(fi) && f.verts.includes(a) && f.verts.includes(b));
            if (!edgeVisible) return;

            const isEdgeHovered = hoveredEdge === edgeIdx;
            const strokeW = isEdgeHovered ? 2.5 : 1.2;
            const strokeC = isEdgeHovered ? edgeHoverColor : edgeHighlight;
            const filterAttr = isEdgeHovered ? ' filter="url(#vcEdgeGlow)"' : '';
            html += `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="${strokeC}" stroke-width="${strokeW}" stroke-linecap="round"${filterAttr}/>`;

            // Edge hover label
            if (isEdgeHovered) {
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2;
                html += `<rect x="${mx - 16}" y="${my - 9}" width="32" height="18" rx="4" fill="${isDark ? 'rgba(30,32,44,0.85)' : 'rgba(255,255,255,0.9)'}" stroke="${edgeHoverColor}" stroke-width="0.5"/>`;
                html += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="central" fill="${hoverTextColor}" font-size="9" font-weight="600" font-family="-apple-system, sans-serif" pointer-events="none">${edgeDefs[edgeIdx].label}</text>`;
            }
        });

        // --- Corner dots ---
        vertices.forEach(([vx, vy, vz], vi) => {
            const p = project(vx, vy, vz);
            // Only show corners connected to visible faces
            const cornerVisible = faces.some((f, fi) => visibleFaceSet.has(fi) && f.verts.includes(vi));
            if (!cornerVisible) return;

            const isCornerHovered = hoveredCorner === vi;
            const cr = isCornerHovered ? 3 : 2;
            const cc = isCornerHovered ? cornerHoverColor : cornerColor;
            const filterAttr = isCornerHovered ? ' filter="url(#vcEdgeGlow)"' : '';
            html += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${cr}" fill="${cc}"${filterAttr}/>`;

            // Corner hover label
            if (isCornerHovered) {
                const label = cornerDefs[vi].label;
                const lw = label.length * 9 + 8;
                html += `<rect x="${p.x - lw/2}" y="${p.y - 20}" width="${lw}" height="16" rx="4" fill="${isDark ? 'rgba(30,32,44,0.85)' : 'rgba(255,255,255,0.9)'}" stroke="${cornerHoverColor}" stroke-width="0.5"/>`;
                html += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" dominant-baseline="central" fill="${hoverTextColor}" font-size="8" font-weight="600" font-family="-apple-system, sans-serif" pointer-events="none">${label}</text>`;
            }
        });

        // --- Axis indicator (separate, bottom-left of cube) ---
        const axisOriginX = 24;
        const axisOriginY = SIZE - 24;
        const axisScale = 18;
        const axesDefs = [
            { dir: [1, 0, 0], color: '#E53935', label: 'x' },  // red = X (right)
            { dir: [0, 1, 0], color: '#43A047', label: 'y' },  // green = Y (up)
            { dir: [0, 0, 1], color: '#1E88E5', label: 'z' },  // blue = Z (front)
        ];
        // Project axis directions using same rotation as cube
        function projectAxis(dx, dy, dz) {
            const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
            let x1 = dx * cosY + dz * sinY;
            let z1 = -dx * sinY + dz * cosY;
            const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
            let y1 = dy * cosX - z1 * sinX;
            return { x: x1 * axisScale, y: -y1 * axisScale };
        }
        // Draw origin dot
        html += `<circle cx="${axisOriginX}" cy="${axisOriginY}" r="2" fill="#888"/>`;
        axesDefs.forEach(({ dir: [dx, dy, dz], color, label }) => {
            const tip = projectAxis(dx, dy, dz);
            const ex = axisOriginX + tip.x;
            const ey = axisOriginY + tip.y;
            html += `<line x1="${axisOriginX}" y1="${axisOriginY}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>`;
            // Filled triangle arrowhead
            const tipLen = 5;
            const angle = Math.atan2(ey - axisOriginY, ex - axisOriginX);
            const a1x = ex - tipLen * Math.cos(angle - 0.35);
            const a1y = ey - tipLen * Math.sin(angle - 0.35);
            const a2x = ex - tipLen * Math.cos(angle + 0.35);
            const a2y = ey - tipLen * Math.sin(angle + 0.35);
            html += `<polygon points="${ex.toFixed(1)},${ey.toFixed(1)} ${a1x.toFixed(1)},${a1y.toFixed(1)} ${a2x.toFixed(1)},${a2y.toFixed(1)}" fill="${color}" opacity="0.9"/>`;
            // Label (lowercase)
            const lx = ex + (ex - axisOriginX) * 0.35;
            const ly = ey + (ey - axisOriginY) * 0.35;
            html += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="9" font-weight="700" font-family="-apple-system, sans-serif" opacity="0.9">${label}</text>`;
        });

        svg.innerHTML = `<defs>${defs}</defs>${html}`;
    }

    // Sync ViewCube rotation with Three.js camera
    function syncWithCamera() {
        if (!camera || !controls) return;
        const target = controls.target;
        const pos = camera.position;
        const dx = pos.x - target.x;
        const dy = pos.y - target.y;
        const dz = pos.z - target.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        rotY = Math.atan2(dx, dz);
        rotX = -Math.asin(dy / dist);
    }

    // Camera view presets
    const viewPresets = {
        front:  { pos: [0, 50, 600], target: [0, 50, 0] },
        back:   { pos: [0, 50, -600], target: [0, 50, 0] },
        right:  { pos: [600, 50, 0], target: [0, 50, 0] },
        left:   { pos: [-600, 50, 0], target: [0, 50, 0] },
        top:    { pos: [0, 600, 0.01], target: [0, 0, 0] },
        bottom: { pos: [0, -600, 0.01], target: [0, 0, 0] },
    };

    function setView(viewName) {
        const preset = viewPresets[viewName];
        if (!preset || !camera || !controls) return;

        const startPos = camera.position.clone();
        const startTarget = controls.target.clone();
        const endPos = new THREE.Vector3(...preset.pos);
        const endTarget = new THREE.Vector3(...preset.target);
        const duration = 400;
        const startTime = performance.now();

        function animateView(time) {
            const elapsed = time - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);

            camera.position.lerpVectors(startPos, endPos, ease);
            controls.target.lerpVectors(startTarget, endTarget, ease);
            controls.update();

            if (t < 1) {
                requestAnimationFrame(animateView);
            }
        }
        requestAnimationFrame(animateView);
    }

    // Distance from point to line segment
    function pointToSegmentDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    // Mouse events
    const container = document.getElementById('viewCubeContainer');
    if (container) {
        container.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * (SIZE / rect.width);
            const my = (e.clientY - rect.top) * (SIZE / rect.height);

            hoveredFace = null;
            hoveredEdge = null;
            hoveredCorner = null;

            // 1. Check corners first (highest priority, 8px radius)
            const visibleFaceSet = new Set(faceElements.map(el => el.index));
            for (let vi = 0; vi < vertices.length; vi++) {
                const cornerVisible = faces.some((f, fi) => visibleFaceSet.has(fi) && f.verts.includes(vi));
                if (!cornerVisible) continue;
                const [vx, vy, vz] = vertices[vi];
                const p = project(vx, vy, vz);
                if (Math.hypot(mx - p.x, my - p.y) < 8) {
                    hoveredCorner = vi;
                    break;
                }
            }

            // 2. Check edges (5px proximity)
            if (hoveredCorner === null) {
                edgeDefs.forEach(({ verts: [a, b] }, idx) => {
                    if (hoveredEdge !== null) return;
                    const edgeVisible = faces.some((f, fi) => visibleFaceSet.has(fi) && f.verts.includes(a) && f.verts.includes(b));
                    if (!edgeVisible) return;
                    const [ax,ay,az] = vertices[a];
                    const [bx,by,bz] = vertices[b];
                    const pa = project(ax, ay, az);
                    const pb = project(bx, by, bz);
                    if (pointToSegmentDist(mx, my, pa.x, pa.y, pb.x, pb.y) < 5) {
                        hoveredEdge = idx;
                    }
                });
            }

            // 3. Check faces (lowest priority)
            if (hoveredCorner === null && hoveredEdge === null) {
                for (let i = faceElements.length - 1; i >= 0; i--) {
                    if (pointInPolygon(mx, my, faceElements[i].projected)) {
                        hoveredFace = faceElements[i].index;
                        break;
                    }
                }
            }

            render();
        });

        container.addEventListener('mouseleave', () => {
            hoveredFace = null;
            hoveredEdge = null;
            hoveredCorner = null;
            render();
        });

        container.addEventListener('click', () => {
            if (hoveredFace !== null) {
                setView(faces[hoveredFace].view);
            }
            // Edge/corner clicks could navigate to diagonal views in the future
        });
    }

    function pointInPolygon(px, py, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // Gear button click
    const gearBtn = document.getElementById('viewCubeGearBtn');
    if (gearBtn) {
        gearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showToast('视图设置（开发中）');
        });
    }

    return { render, syncWithCamera };
})();

// ============================================
// TOAST SYSTEM
// ============================================
(function() {
    // Inject toast styles
    const style = document.createElement('style');
    style.textContent = `
        #toastContainer {
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            pointer-events: none;
        }
        .toast {
            background: rgba(0, 0, 0, 0.78);
            color: #fff;
            padding: 10px 24px;
            border-radius: 8px;
            font-size: 13px;
            line-height: 1.5;
            pointer-events: auto;
            opacity: 0;
            transform: translateY(16px);
            animation: toastIn 0.25s ease forwards;
            white-space: nowrap;
        }
        .toast.toast-out {
            animation: toastOut 0.25s ease forwards;
        }
        @keyframes toastIn {
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastOut {
            to { opacity: 0; transform: translateY(16px); }
        }
    `;
    document.head.appendChild(style);
})();

function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-out');
        el.addEventListener('animationend', () => el.remove());
    }, 2000);
}

// ============================================
// CONFIRM DIALOG HELPER
// ============================================
function showConfirm(title, text) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    openModal('confirmModal');
}

// ============================================
// CLOSE ALL MENUS HELPER
// ============================================
function closeAllMenus() {
    document.querySelectorAll('.dropdown-menu').forEach(d => {
        d.style.display = '';
    });
}

// ============================================
// FILE INPUT
// ============================================
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', function() {
        if (this.files && this.files.length > 0) {
            showToast('已加载: ' + this.files[0].name);
            this.value = '';
        }
    });
}

function triggerOpenFile() {
    const fi = document.getElementById('fileInput');
    if (fi) fi.click();
}

// ============================================
// MENU ITEM CLICK HANDLER
// ============================================
// Toggle states for view menu
let gridVisible = true;
let axisVisible = true;

function getMenuLabel(item) {
    const labelEl = item.querySelector('.menu-label');
    if (labelEl) {
        return labelEl.textContent.trim();
    }
    return item.textContent.trim().replace(/[›✓]/g, '').trim();
}

document.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;

    // Skip items that have submenus (they just open submenus)
    if (item.classList.contains('has-submenu')) return;

    // Skip items that already have data-modal (handled by existing modal system)
    if (item.getAttribute('data-modal')) return;

    // Skip items that have data-close (modal close buttons)
    if (item.getAttribute('data-close')) return;

    const label = getMenuLabel(item);

    // --- FILE MENU ---
    if (label.includes('新建项目')) {
        closeAllMenus();
        showConfirm('新建项目', '是否新建项目? 当前未保存的更改将丢失');
        return;
    }
    if (label.includes('打开文件')) {
        closeAllMenus();
        triggerOpenFile();
        return;
    }
    if (item.classList.contains('recent-file')) {
        closeAllMenus();
        showToast('已加载: ' + label);
        return;
    }
    if (label.includes('保存项目')) {
        closeAllMenus();
        showToast('项目已保存');
        return;
    }
    if (label.includes('另存为')) {
        closeAllMenus();
        showToast('项目已另存为');
        return;
    }
    if (label.includes('导入')) {
        closeAllMenus();
        triggerOpenFile();
        return;
    }
    if (label.includes('导出')) {
        closeAllMenus();
        const exportModal = document.getElementById('exportModal');
        if (exportModal) {
            openModal('exportModal');
        } else {
            showToast('导出完成');
        }
        return;
    }
    if (label.includes('退出')) {
        closeAllMenus();
        showConfirm('退出', '确定要退出吗?');
        return;
    }

    // --- EDIT MENU ---
    if (label.includes('撤销')) {
        closeAllMenus();
        showToast('撤销');
        return;
    }
    if (label.includes('重做')) {
        closeAllMenus();
        showToast('重做');
        return;
    }
    if (label.includes('全选')) {
        closeAllMenus();
        showToast('已全选所有模型');
        return;
    }
    if (label.includes('自动排列')) {
        closeAllMenus();
        showToast('已自动排列模型');
        return;
    }
    if (label.includes('复制所选')) {
        closeAllMenus();
        showToast('已复制所选模型');
        return;
    }
    if (label.includes('删除所选')) {
        closeAllMenus();
        showToast('已删除所选模型');
        return;
    }
    if (label.includes('重置所有模型位置')) {
        closeAllMenus();
        showToast('已重置所有模型位置');
        return;
    }
    if (label.includes('重置所有模型旋转')) {
        closeAllMenus();
        showToast('已重置所有模型旋转');
        return;
    }
    if (label.includes('取消编组')) {
        closeAllMenus();
        showToast('已取消编组');
        return;
    }
    if (label.includes('合并')) {
        closeAllMenus();
        showToast('已合并');
        return;
    }
    if (label.includes('编组')) {
        closeAllMenus();
        showToast('已编组');
        return;
    }

    // --- VIEW MENU ---
    if (label.includes('显示网格')) {
        closeAllMenus();
        gridVisible = !gridVisible;
        const check = gridVisible ? '✓ ' : '';
        const labelEl = item.querySelector('.menu-label');
        if (labelEl) {
            // Preserve SVG icon, update text
            const svg = labelEl.querySelector('svg');
            labelEl.textContent = '';
            if (svg) labelEl.appendChild(svg);
            labelEl.appendChild(document.createTextNode(check + '显示网格'));
        }
        showToast(gridVisible ? '网格已显示' : '网格已隐藏');
        // Toggle grid in scene
        if (typeof gridHelper !== 'undefined' && gridHelper) {
            gridHelper.visible = gridVisible;
        }
        return;
    }
    if (label.includes('显示坐标轴')) {
        closeAllMenus();
        axisVisible = !axisVisible;
        const check = axisVisible ? '✓ ' : '';
        const labelEl = item.querySelector('.menu-label');
        if (labelEl) {
            const svg = labelEl.querySelector('svg');
            labelEl.textContent = '';
            if (svg) labelEl.appendChild(svg);
            labelEl.appendChild(document.createTextNode(check + '显示坐标轴'));
        }
        showToast(axisVisible ? '坐标轴已显示' : '坐标轴已隐藏');
        return;
    }
    if (label.includes('全屏')) {
        closeAllMenus();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
        return;
    }

    // --- SETTINGS MENU ---
    // Nozzle sizes
    const nozzleSizes = ['0.2 mm', '0.4 mm', '0.6 mm', '0.8 mm'];
    const cleanLabel = label.replace('✓', '').trim();
    if (nozzleSizes.includes(cleanLabel)) {
        // Find sibling nozzle items in the same submenu
        const parentSub = item.closest('.submenu');
        if (parentSub) {
            parentSub.querySelectorAll('.dropdown-item').forEach(si => {
                si.classList.remove('selected-mark');
                si.textContent = si.textContent.replace(' ✓', '').trim();
            });
            item.classList.add('selected-mark');
            item.textContent = cleanLabel + ' ✓';
        }
        closeAllMenus();
        showToast('已切换喷嘴: ' + cleanLabel);
        return;
    }

    // Material brands
    const brandParent = item.closest('.submenu-brands');
    if (brandParent) {
        brandParent.querySelectorAll('.dropdown-item').forEach(si => {
            si.classList.remove('selected-mark');
            si.textContent = si.textContent.replace(' ✓', '').trim();
        });
        item.classList.add('selected-mark');
        item.textContent = cleanLabel + ' ✓';
        closeAllMenus();
        showToast('已切换耗材: ' + cleanLabel);
        return;
    }

    if (label.includes('设为主挤出机')) {
        closeAllMenus();
        showToast('已设为主挤出机');
        return;
    }
    if (label.includes('关闭挤出机')) {
        closeAllMenus();
        showToast('已关闭挤出机');
        return;
    }

    // --- HELP MENU ---
    if (label.includes('用户手册')) {
        closeAllMenus();
        showToast('用户手册');
        return;
    }
    if (label.includes('检查更新')) {
        closeAllMenus();
        showToast('已是最新版本');
        return;
    }
    if (label.includes('反馈问题')) {
        closeAllMenus();
        showToast('反馈问题');
        return;
    }
    if (label.includes('参数显示设置')) {
        closeAllMenus();
        showToast('参数显示设置');
        return;
    }
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        showConfirm('新建项目', '是否新建项目? 当前未保存的更改将丢失');
        return;
    }
    if (ctrl && !e.shiftKey && e.key === 'o') {
        e.preventDefault();
        triggerOpenFile();
        return;
    }
    if (ctrl && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        showToast('项目已保存');
        return;
    }
    if (ctrl && e.key === 'z') {
        e.preventDefault();
        showToast('撤销');
        return;
    }
    if (ctrl && e.key === 'y') {
        e.preventDefault();
        showToast('重做');
        return;
    }
    if (ctrl && e.key === 'a') {
        e.preventDefault();
        showToast('已全选所有模型');
        return;
    }
    if (e.key === 'Delete') {
        e.preventDefault();
        showToast('已删除所选模型');
        return;
    }
    if (e.key === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
        return;
    }
});

// ============================================
// UNDO / LAY FLAT / SNAP ROTATION
// ============================================
(function() {
    var undoBtn = document.getElementById('undoBtn');
    var layFlatIcon = document.getElementById('layFlatIcon');
    var layFlatBtn = document.getElementById('layFlatBtn');
    var snapCheck = document.getElementById('snapRotation');

    if (undoBtn) undoBtn.addEventListener('click', function() {
        if (typeof showToast === 'function') showToast('撤销');
    });

    function layFlat() {
        var target = selectedModel || model;
        if (!target) return;
        // Reset rotation to lay flat on build plate
        target.rotation.set(0, 0, 0);
        // Ensure bottom touches plate (y=0)
        var box = new THREE.Box3().setFromObject(target);
        target.position.y -= box.min.y;
        if (typeof showToast === 'function') showToast('已放平');
        if (typeof syncPanelFromModel === 'function') syncPanelFromModel();
    }

    if (layFlatIcon) layFlatIcon.addEventListener('click', layFlat);

    var alignFaceBtn = document.getElementById('alignFaceBtn');
    if (alignFaceBtn) alignFaceBtn.addEventListener('click', function() {
        if (typeof showToast === 'function') showToast('选择要与构建板对齐的面');
    });

    if (snapCheck) snapCheck.addEventListener('change', function() {
        if (typeof transformControls !== 'undefined' && transformControls) {
            transformControls.setRotationSnap(this.checked ? THREE.MathUtils.degToRad(15) : null);
        }
    });
})();

// ============================================
// GRID TYPE POPUP
// ============================================
(function() {
    const gridNames = { normal: '正常模式', lines: '线条填充', support: '修改重叠设置', nolap: '不支持重叠' };

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#gridTypeBtn');
        const popup = document.getElementById('gridTypePopup');
        if (!popup) return;

        if (btn) {
            popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
            e.stopPropagation();
            return;
        }

        const gridBtn = e.target.closest('.grid-type-btn');
        if (gridBtn) {
            document.querySelectorAll('.grid-type-btn').forEach(function(b) { b.classList.remove('active'); });
            gridBtn.classList.add('active');
            var mode = gridBtn.getAttribute('data-grid');
            var label = document.getElementById('gridTypeLabel');
            if (label) label.textContent = '网格类型: ' + (gridNames[mode] || mode);

            // Apply grid style change
            if (typeof gridHelper !== 'undefined' && gridHelper && gridHelper.material) {
                if (mode === 'normal') {
                    gridHelper.visible = true;
                    gridHelper.material.opacity = 0.45;
                } else if (mode === 'lines') {
                    gridHelper.visible = true;
                    gridHelper.material.opacity = 0.3;
                } else if (mode === 'support') {
                    gridHelper.visible = true;
                    gridHelper.material.opacity = 0.6;
                } else if (mode === 'nolap') {
                    gridHelper.visible = true;
                    gridHelper.material.opacity = 0.35;
                }
            }
            return;
        }

        if (e.target.closest('#gridSettingsBtn')) {
            if (typeof showToast === 'function') showToast('网格设置功能开发中');
            return;
        }

        // Click outside closes popup
        if (!e.target.closest('.grid-type-popup')) {
            popup.style.display = 'none';
        }
    });
})();

// ============================================
// INITIALIZATION
// ============================================
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => { initThreeJS(); });
} else {
    initThreeJS();
}
