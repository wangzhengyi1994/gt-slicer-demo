/* ============================================
   GT Slicer UI - Application Logic
   Three.js Scene + UI Interactions
   ============================================ */

// ============================================
// THREE.JS SCENE SETUP
// ============================================
const viewport = document.getElementById('viewport');
const canvas = document.getElementById('three-canvas');

let scene, camera, renderer, controls;
let buildPlate, model, gridHelper;
let mousePos = { x: 0, y: 0 };

function initThreeJS() {
    // Scene
    scene = new THREE.Scene();

    // Fog for depth (edge fade effect per design doc)
    // Blue-gray scale: dark=gray-950 #0D0F17, light=gray-200 #B8BCC6
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
        scene.fog = new THREE.FogExp2(0x0D0F17, 0.0015);
        scene.background = new THREE.Color(0x0D0F17);
    } else {
        scene.fog = new THREE.FogExp2(0xB8BCC6, 0.0015);
        scene.background = new THREE.Color(0xB8BCC6);
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
    renderer.toneMappingExposure = isDark ? 0.8 : 1.2;
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

    // Show model info
    document.getElementById('modelInfo').style.display = 'flex';

    // Start render loop
    animate();
}

function createLighting() {
    const isDark = document.body.classList.contains('theme-dark');

    // Ambient light (gray-700 / gray-300 tinted)
    const ambient = new THREE.AmbientLight(
        isDark ? 0x333847 : 0x9CA1AE,
        isDark ? 0.6 : 0.8
    );
    scene.add(ambient);

    // Main directional light (sun)
    const mainLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.8 : 1.0);
    mainLight.position.set(300, 500, 400);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 10;
    mainLight.shadow.camera.far = 1500;
    mainLight.shadow.camera.left = -500;
    mainLight.shadow.camera.right = 500;
    mainLight.shadow.camera.top = 500;
    mainLight.shadow.camera.bottom = -500;
    mainLight.shadow.bias = -0.0005;
    mainLight.shadow.radius = 4;
    scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(
        isDark ? 0x3344aa : 0x6688cc,
        isDark ? 0.3 : 0.2
    );
    fillLight.position.set(-200, 200, -100);
    scene.add(fillLight);

    // Rim light (brand accent)
    const rimLight = new THREE.DirectionalLight(isDark ? 0x8B52DC : 0x7B2FD4, 0.15);
    rimLight.position.set(-100, 300, 300);
    scene.add(rimLight);

    // Bottom hemisphere for ground bounce (gray-800 / gray-300)
    const hemiLight = new THREE.HemisphereLight(
        isDark ? 0x232734 : 0x9CA1AE,
        isDark ? 0x171A25 : 0x5F6577,
        0.4
    );
    scene.add(hemiLight);
}

function createBuildPlate() {
    const isDark = document.body.classList.contains('theme-dark');

    // Build plate dimensions (scaled from GT Carbon S800: 820x620mm)
    const plateW = 410;
    const plateD = 310;
    const plateH = 4;

    // Metallic brushed build plate (gray-700 / gray-150)
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: isDark ? 0x333847 : 0xD1D4DB,
        metalness: isDark ? 0.8 : 0.4,
        roughness: isDark ? 0.4 : 0.5,
    });

    const plateGeo = new THREE.BoxGeometry(plateW, plateH, plateD);
    buildPlate = new THREE.Mesh(plateGeo, plateMaterial);
    buildPlate.position.y = -plateH / 2;
    buildPlate.receiveShadow = true;
    scene.add(buildPlate);

    // Edge highlight strip (gray-600 / gray-100)
    const edgeMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x464C5E : 0xE4E6EB,
        metalness: 0.9,
        roughness: 0.2,
        emissive: isDark ? 0x232734 : 0x000000,
    });

    // Front edge
    const edgeGeo = new THREE.BoxGeometry(plateW + 4, plateH + 2, 2);
    const frontEdge = new THREE.Mesh(edgeGeo, edgeMat);
    frontEdge.position.set(0, -plateH / 2, plateD / 2 + 1);
    scene.add(frontEdge);

    // Back edge
    const backEdge = frontEdge.clone();
    backEdge.position.z = -plateD / 2 - 1;
    scene.add(backEdge);

    // Left edge
    const sideEdgeGeo = new THREE.BoxGeometry(2, plateH + 2, plateD + 4);
    const leftEdge = new THREE.Mesh(sideEdgeGeo, edgeMat);
    leftEdge.position.set(-plateW / 2 - 1, -plateH / 2, 0);
    scene.add(leftEdge);

    // Right edge
    const rightEdge = leftEdge.clone();
    rightEdge.position.x = plateW / 2 + 1;
    scene.add(rightEdge);

    // Grid on plate surface
    const gridSize = 400;
    const gridDivisions = 20;
    const gridColor = isDark ? 0x333847 : 0x9CA1AE;       // gray-700 / gray-300
    const gridColorCenter = isDark ? 0x464C5E : 0xB8BCC6; // gray-600 / gray-200
    gridHelper = new THREE.GridHelper(gridSize, gridDivisions, gridColorCenter, gridColor);
    gridHelper.position.y = 0.5;
    gridHelper.material.opacity = isDark ? 0.25 : 0.35;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

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
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    ctx.textAlign = 'center';
    ctx.fillText('GT Carbon S800', 256, 42);

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

    // Create a sample 3D model (a mechanical bracket-like shape)
    const group = new THREE.Group();

    const matOrange = new THREE.MeshStandardMaterial({
        color: isDark ? 0x8B52DC : 0x7B2FD4,
        metalness: 0.1,
        roughness: 0.6,
    });

    const matBody = new THREE.MeshStandardMaterial({
        color: isDark ? 0x7040B0 : 0x9050E0,
        metalness: 0.15,
        roughness: 0.5,
    });

    // Main body - a complex bracket shape
    // Base block
    const baseGeo = new THREE.BoxGeometry(100, 20, 60);
    const baseMesh = new THREE.Mesh(baseGeo, matBody);
    baseMesh.position.y = 10;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Left pillar
    const pillarGeo = new THREE.BoxGeometry(15, 80, 60);
    const leftPillar = new THREE.Mesh(pillarGeo, matBody);
    leftPillar.position.set(-42.5, 60, 0);
    leftPillar.castShadow = true;
    leftPillar.receiveShadow = true;
    group.add(leftPillar);

    // Right pillar
    const rightPillar = new THREE.Mesh(pillarGeo, matBody);
    rightPillar.position.set(42.5, 60, 0);
    rightPillar.castShadow = true;
    rightPillar.receiveShadow = true;
    group.add(rightPillar);

    // Top bridge
    const bridgeGeo = new THREE.BoxGeometry(100, 15, 60);
    const bridge = new THREE.Mesh(bridgeGeo, matBody);
    bridge.position.y = 107.5;
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    group.add(bridge);

    // Cylindrical holes in pillars
    const holeGeo = new THREE.CylinderGeometry(12, 12, 62, 32);
    const holeMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x171A25 : 0xB8BCC6, // gray-900 / gray-200
        metalness: 0.3,
        roughness: 0.7,
    });

    const leftHole = new THREE.Mesh(holeGeo, holeMat);
    leftHole.rotation.x = Math.PI / 2;
    leftHole.position.set(-42.5, 60, 0);
    group.add(leftHole);

    const rightHole = new THREE.Mesh(holeGeo, holeMat);
    rightHole.rotation.x = Math.PI / 2;
    rightHole.position.set(42.5, 60, 0);
    group.add(rightHole);

    // Center cylinder on top
    const topCylGeo = new THREE.CylinderGeometry(18, 18, 20, 32);
    const topCyl = new THREE.Mesh(topCylGeo, matOrange);
    topCyl.position.y = 125;
    topCyl.castShadow = true;
    group.add(topCyl);

    // Ribs on the side for detail
    for (let i = 0; i < 3; i++) {
        const ribGeo = new THREE.BoxGeometry(2, 60, 55);
        const ribMat = new THREE.MeshStandardMaterial({
            color: isDark ? 0x6B42AD : 0x6422B0,
            metalness: 0.1,
            roughness: 0.6,
        });
        const rib = new THREE.Mesh(ribGeo, ribMat);
        rib.position.set(-20 + i * 20, 55, 0);
        rib.castShadow = true;
        group.add(rib);
    }

    // Contact shadow (fake, projected on plate)
    const shadowGeo = new THREE.PlaneGeometry(130, 80);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: isDark ? 0.35 : 0.15,
        depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.5;
    group.add(shadowPlane);

    model = group;
    scene.add(model);
}

function createEnvironment() {
    const isDark = document.body.classList.contains('theme-dark');

    // Ground plane (infinite feel) gray-950 / gray-200
    const groundGeo = new THREE.PlaneGeometry(4000, 4000);
    const groundMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x0D0F17 : 0xB8BCC6,
        metalness: 0,
        roughness: 1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    ground.receiveShadow = true;
    scene.add(ground);

    // Volume box outline (faint print volume indicator)
    const volumeH = 300; // Z height 600mm scaled
    const plateW = 410;
    const plateD = 310;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(plateW, volumeH, plateD));
    const lineMat = new THREE.LineBasicMaterial({
        color: isDark ? 0x464C5E : 0x9CA1AE, // gray-600 / gray-300
        transparent: true,
        opacity: isDark ? 0.15 : 0.2,
    });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.y = volumeH / 2;
    scene.add(wireframe);

    // Axis indicator lines at origin
    const axisLen = 40;

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

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
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
    // Clear scene
    while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }
    const isDark = document.body.classList.contains('theme-dark');
    scene.fog = new THREE.FogExp2(isDark ? 0x0D0F17 : 0xB8BCC6, 0.0015);
    scene.background = new THREE.Color(isDark ? 0x0D0F17 : 0xB8BCC6);
    renderer.toneMappingExposure = isDark ? 0.8 : 1.2;

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

panelToggle.addEventListener('click', () => {
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
// FLOATING TOOLBAR
// ============================================
document.querySelectorAll('.ftool-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.ftool-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

// --- Mouse position tracking for potential ray cast ---
viewport.addEventListener('mousemove', (e) => {
    const rect = viewport.getBoundingClientRect();
    mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
});


// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('DOMContentLoaded', () => {
    initThreeJS();
});
