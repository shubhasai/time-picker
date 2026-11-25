/**
 * ThreeGearMachine — Full-Screen Celestial Orrery with:
 * - POV 1 ('space'): Outer Space view with separated golden Date/Time clusters, Golden Winding Key,
 *                    NASA Earth & Moon, Sun, and Keplerian cratered asteroids.
 * - POV 2 ('earth'): 2-Step Observatory experience:
 *     Step 1 ('room'):      Astronomer's room with live weather/day/night window, live Space monitor feed,
 *                           center desk control console, and clickable brass telescope.
 *     Step 2 ('telescope'): Pure astronomical Earth sky eyepiece view of Sun, Moon, stars & asteroids.
 */
import * as THREE from '../vendor/three.module.min.js';
import {
  GOLD_HEX,
  createStudioEnvironment,
  createBrushedMetalTexture,
  createMaterialLibrary,
  createSpurGear,
  createBevelGear,
  createWindingKeyRig,
  createPortraitTurretRig
} from './three-gear-factory.js?v=10';
import { SpaceCosmos, EARTH_SPACE_POS } from './space-cosmos.js?v=11';
import { ObservatoryRoom } from './observatory-room.js?v=10';
import { COUNTRY_TIMEZONES, resolveLocationFromLatLon, smoothstep } from './astronomy.js';

const DEG_TO_RAD = Math.PI / 180;
const KEY_DETENT_ANGLE = Math.PI / 4; // 45 deg per mechanical detent

const CLUSTER_POS = {
  date: new THREE.Vector3(-4.15, -1.05, 0.15),
  time: new THREE.Vector3(+4.15, -1.05, 0.15)
};
const CLUSTER_ROT_Y = {
  date: +11 * DEG_TO_RAD,
  time: -11 * DEG_TO_RAD
};

const GEAR_LAYOUT = {
  year:   { cluster: 'date', pos: [-1.72,  1.12, 0.96], rot: [0,  18 * DEG_TO_RAD, 0], teeth: 24, slots: 12, spokeCount: 5, moduleSize: 0.104 },
  month:  { cluster: 'date', pos: [ 1.72,  1.12, 0.96], rot: [0, -18 * DEG_TO_RAD, 0], teeth: 24, slots: 12, spokeCount: 5, moduleSize: 0.104 },
  day:    { cluster: 'date', pos: [ 0.00, -1.55, 1.32], rot: [-22 * DEG_TO_RAD, 0, 0], teeth: 32, slots: 16, spokeCount: 6, moduleSize: 0.104 },
  hour:   { cluster: 'time', pos: [-1.72,  1.12, 0.96], rot: [0,  18 * DEG_TO_RAD, 0], teeth: 24, slots: 12, spokeCount: 5, moduleSize: 0.104 },
  ampm:   { cluster: 'time', pos: [ 1.72,  1.12, 0.96], rot: [0, -18 * DEG_TO_RAD, 0], teeth: 18, slots: 2,  spokeCount: 4, moduleSize: 0.104 },
  minute: { cluster: 'time', pos: [ 0.00, -1.55, 1.32], rot: [-22 * DEG_TO_RAD, 0, 0], teeth: 32, slots: 16, spokeCount: 6, moduleSize: 0.104 }
};

const SPACE_CAM_HOME = {
  theta: 0.00,
  phi: 1.44,
  radius: 16.2,
  target: new THREE.Vector3(0.0, 0.20, -0.80)
};
// Unified dual-face connected horological gyroscope (Desktop, Mobile, & Room monitor)
const PORTRAIT_ASPECT = 0.8;
const DESKTOP_ROOT_POS = new THREE.Vector3(0.0, -1.10, 0.15);
const PORTRAIT_ROOT_POS = new THREE.Vector3(0.0, -1.40, 0.15);
const CLUSTER_POS_CONNECTED = {
  date: new THREE.Vector3(0.0, 0.0, +0.72),
  time: new THREE.Vector3(0.0, 0.0, -0.72)
};
const CLUSTER_ROT_Y_CONNECTED = {
  date: 0,
  time: Math.PI
};
const SPACE_CAM_TARGET_PORTRAIT = new THREE.Vector3(0.0, 0.35, -0.80);
const SPACE_RADIUS_MIN = 3.6;
const SPACE_RADIUS_MAX = 24.0;
const ROOM_FOV_HOME = 42;
const ROOM_FOV_MIN = 22;
const ROOM_FOV_MAX = 56;
const TELESCOPE_FOV_HOME = 48;
const TELESCOPE_MAG_MIN = 0.8;
const TELESCOPE_MAG_MAX = 24.0;
const TELESCOPE_HALF_TAN = Math.tan((TELESCOPE_FOV_HOME * DEG_TO_RAD) / 2);
const HORIZON_VISIBLE_ALT_DEG = -1.2;

function fovToTelescopeMag(fovDeg) {
  const halfTan = Math.tan(Math.max(0.4, fovDeg) * DEG_TO_RAD * 0.5);
  return TELESCOPE_HALF_TAN / halfTan;
}

function telescopeMagToFov(mag) {
  const m = THREE.MathUtils.clamp(mag, TELESCOPE_MAG_MIN, TELESCOPE_MAG_MAX);
  return (2 * Math.atan(TELESCOPE_HALF_TAN / m)) / DEG_TO_RAD;
}

const TELESCOPE_FOV_MIN = telescopeMagToFov(TELESCOPE_MAG_MAX);
const TELESCOPE_FOV_MAX = telescopeMagToFov(TELESCOPE_MAG_MIN);

export class ThreeGearMachine {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.onKeyStep = callbacks.onKeyStep || (() => {});
    this.onSelectGear = callbacks.onSelectGear || (() => {});
    this.onLockedAttempt = callbacks.onLockedAttempt || (() => {});
    this.onFirstKeyDrag = callbacks.onFirstKeyDrag || (() => {});
    this.onHoverEarth = callbacks.onHoverEarth || (() => {});
    this.onHoverInteract = callbacks.onHoverInteract || (() => {});
    this.onSelectCountry = callbacks.onSelectCountry || (() => {});
    this.onZoomChange = callbacks.onZoomChange || (() => {});
    this.onEarthStepChange = callbacks.onEarthStepChange || (() => {});
    this.onRequestSpacePov = callbacks.onRequestSpacePov || (() => {});
    this.onTelescopeTelemetry = callbacks.onTelescopeTelemetry || (() => {});
    this.onTelescopeTargetChange = callbacks.onTelescopeTargetChange || (() => {});
    this.onTurretFaceChange = callbacks.onTurretFaceChange || (() => {});
    this.onTurretAngleChange = callbacks.onTurretAngleChange || (() => {});

    this._motionMedia = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    this.state = {
      povMode: 'space', // 'space' or 'earth'
      earthStep: 'room', // 'room' | 'telescope'
      paused: false,
      engagedGearId: 'year',
      engagedCluster: 'date',
      keyAngle: 0,
      keyVel: 0,
      keyTargetStep: 0,
      coastingFree: false,
      keyPos: new THREE.Vector3(),
      keyQuat: new THREE.Quaternion(),
      keyExtractZ: 0,
      keyExtractVel: 0,
      isDraggingKey: false,
      hasDraggedKey: false,
      hintFade: 1.0,
      turretAngle: 0,
      turretTargetAngle: 0,
      turretVel: 0,
      isDraggingTurret: false,
      turretCoasting: false,
      hasRotatedTurret: false,
      turretHintFade: 1.0,
      lastFacingCluster: 'date',
      lastReportedTurretDeg: 0
    };

    this.cam = {
      theta: SPACE_CAM_HOME.theta,
      phi: SPACE_CAM_HOME.phi,
      radius: SPACE_CAM_HOME.radius,
      target: SPACE_CAM_HOME.target.clone(),
      targetTheta: SPACE_CAM_HOME.theta,
      targetPhi: SPACE_CAM_HOME.phi,
      targetRadius: SPACE_CAM_HOME.radius,
      targetLook: SPACE_CAM_HOME.target.clone()
    };

    this.roomCam = {
      yaw: 0,
      pitch: 0,
      targetYaw: 0,
      targetPitch: 0,
      fov: ROOM_FOV_HOME,
      targetFov: ROOM_FOV_HOME,
      focusMix: 0
    };

    this.pov = {
      azDeg: 180,
      elevDeg: 22,
      targetAzDeg: 180,
      targetElevDeg: 22,
      fov: TELESCOPE_FOV_HOME,
      targetFov: TELESCOPE_FOV_HOME,
      targetBody: null,
      solarFilterMix: 0
    };

    this.gearStates = {};
    this.clusterObjects = { date: null, time: null };
    this.gearHitMeshes = [];
    this.celestialState = null;
    this.weatherState = null;
    this._rafId = null;
    this._lastCamAspect = 0;
    this._lastRoomAspect = 0;

    this._initScene();
    this._buildClusters();
    this._attachInteractions();
    this._resize();
    this._startLoop();
  }

  prefersReducedMotion() {
    return Boolean(this._motionMedia && this._motionMedia.matches);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03050b);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.envTex = createStudioEnvironment(this.renderer);
    this.scene.environment = this.envTex;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    // Linear NoColorSpace RenderTarget so Observatory monitor applies toneMapping & sRGB once on screen
    this.monitorRT = new THREE.WebGLRenderTarget(1024, 640, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    this.monitorCamera = new THREE.PerspectiveCamera(40, 1024 / 640, 0.1, 200);
    this.monitorCamera.position.set(0.0, 0.55, 15.6);
    this.monitorCamera.lookAt(0.0, 0.45, -0.80);

    this.roomCamera = new THREE.PerspectiveCamera(ROOM_FOV_HOME, 1, 0.05, 80);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.cosmos = new SpaceCosmos(this.scene, maxAniso);

    this.hemiLight = new THREE.HemisphereLight(0xd9e6f7, 0x221d16, 0.95);
    this.scene.add(this.hemiLight);

    this.warmFillLight = new THREE.PointLight(0xffe1a6, 4.2, 42, 1.3);
    this.warmFillLight.position.set(0, -1.2, 7.0);
    this.scene.add(this.warmFillLight);

    this.coolRimLight = new THREE.PointLight(0x9ebde6, 2.4, 38, 1.4);
    this.coolRimLight.position.set(-6.0, 2.8, 4.5);
    this.scene.add(this.coolRimLight);

    this.gearFocusLight = new THREE.PointLight(0xffe7b3, 3.6, 11, 1.45);
    this.gearFocusLight.position.set(0, -1.0, 4.0);
    this.scene.add(this.gearFocusLight);

    this.metalTex = createBrushedMetalTexture();
    this.mats = createMaterialLibrary(this.metalTex);
  }

  _buildClusters() {
    // Unified connected dual-face horological gyroscope
    this.clustersRoot = new THREE.Group();
    this.scene.add(this.clustersRoot);

    this.clusterObjects.date = this._buildSingleCluster('date');
    this.clusterObjects.time = this._buildSingleCluster('time');

    // Connected Turret Spindle, Core Coupling Gears & Floating Gyroscope Ring
    this.portraitTurret = createPortraitTurretRig(this.mats);
    this.portraitTurret.root.visible = true;
    this.clustersRoot.add(this.portraitTurret.root);

    this.clustersRoot.position.copy(DESKTOP_ROOT_POS);
    this.clustersRoot.scale.setScalar(0.69);
    this.clustersRoot.updateMatrixWorld(true);

    // Outer Space Winding Key
    this.keyRig = createWindingKeyRig(this.mats);
    this.scene.add(this.keyRig.root);

    // Observatory Room (Earth POV Step 1) featuring live desk monitor, window weather, console & telescope
    this.room = new ObservatoryRoom(this.mats, this.envTex, this.monitorRT.texture);
    this.remoteRig = this.room.deskController;

    const initPose = this._getSocketWorldPose('date');
    this.state.keyPos.copy(initPose.pos);
    this.state.keyQuat.copy(initPose.quat);
    this.keyRig.root.position.copy(initPose.pos);
    this.keyRig.root.quaternion.copy(initPose.quat);
  }

  _buildSingleCluster(clusterName) {
    const clusterGroup = new THREE.Group();
    clusterGroup.position.copy(CLUSTER_POS_CONNECTED[clusterName]);
    clusterGroup.rotation.y = CLUSTER_ROT_Y_CONNECTED[clusterName];
    this.clustersRoot.add(clusterGroup);

    const framePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.98, 2.05, 0.18, 6),
      this.mats.darkBronze
    );
    framePlate.rotation.x = Math.PI / 2;
    framePlate.position.z = -0.14;
    clusterGroup.add(framePlate);

    const sign = clusterName === 'date' ? 1 : -1;
    const socketPos = new THREE.Vector3(sign * 2.22, -1.72, 1.12);
    const socketTarget = new THREE.Vector3(sign * 2.85, -1.80, 2.55);

    const socketGroup = new THREE.Group();
    socketGroup.position.copy(socketPos);
    socketGroup.lookAt(socketTarget);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.30, 24),
      this.mats.darkBronze
    );
    collar.rotation.x = Math.PI / 2;
    socketGroup.add(collar);

    const brassLip = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.028, 10, 32),
      this.mats.polishedGold
    );
    brassLip.position.z = 0.15;
    socketGroup.add(brassLip);

    for (let b = 0; b < 4; b++) {
      const a = (b * Math.PI) / 2 + Math.PI / 4;
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.034, 0.034, 0.05, 6),
        this.mats.machinedSteel
      );
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(0.21 * Math.cos(a), 0.21 * Math.sin(a), 0.15);
      socketGroup.add(bolt);
    }

    const strutVec = socketPos.clone().sub(new THREE.Vector3(sign * 0.72, -0.62, 0.05));
    const socketStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.105, strutVec.length(), 12),
      this.mats.darkBronze
    );
    socketStrut.position.copy(new THREE.Vector3(sign * 0.72, -0.62, 0.05)).addScaledVector(strutVec, 0.5);
    socketStrut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), strutVec.clone().normalize());
    clusterGroup.add(socketStrut);
    clusterGroup.add(socketGroup);

    const sunCol = new THREE.Group();
    sunCol.position.set(0, 0, 0.40);

    const sunShape = createSpurGear({
      id: `${clusterName}-sun`,
      label: '',
      teeth: 18,
      moduleSize: 0.094,
      thickness: 0.20,
      slots: 12,
      spokeCount: 4
    }, this.mats);
    for (const m of sunShape.hitMeshes) m.userData = {};

    const sunRotor = new THREE.Group();
    sunRotor.add(sunShape.rotor.children[0].clone());

    const centralBevel = createBevelGear({
      teeth: 16,
      outerR: 0.62,
      innerR: 0.30,
      height: 0.24,
      toothHeight: 0.068,
      isGold: true
    }, this.mats);
    centralBevel.position.z = 0.24;
    sunRotor.add(centralBevel);

    const centerJewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 18, 14),
      this.mats.rubyJewel
    );
    centerJewel.position.z = 0.36;
    sunRotor.add(centerJewel);

    sunCol.add(sunRotor);
    clusterGroup.add(sunCol);

    const escRig = new THREE.Group();
    escRig.position.set(-sign * 0.98, -0.20, 0.40);
    escRig.rotation.y = Math.PI / 2;
    const escGear = createSpurGear({
      id: `${clusterName}-esc`,
      label: '',
      teeth: 14,
      moduleSize: 0.064,
      thickness: 0.12,
      slots: 12,
      spokeCount: 4
    }, this.mats);
    for (const m of escGear.hitMeshes) m.userData = {};
    escRig.add(escGear.rotor);
    clusterGroup.add(escRig);

    const shafts = {};
    const clusterGearHitMeshes = [];
    const gearIds = Object.keys(GEAR_LAYOUT).filter((id) => GEAR_LAYOUT[id].cluster === clusterName);

    for (const id of gearIds) {
      const cfg = GEAR_LAYOUT[id];
      const gearObj = createSpurGear({
        id,
        label: id === 'ampm' ? 'AM/PM' : id === 'minute' ? 'MIN' : id.toUpperCase(),
        teeth: cfg.teeth,
        moduleSize: cfg.moduleSize,
        thickness: id === 'day' || id === 'minute' ? 0.34 : 0.28,
        slots: cfg.slots,
        spokeCount: cfg.spokeCount
      }, this.mats);

      gearObj.group.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      gearObj.group.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      clusterGroup.add(gearObj.group);
      this.gearHitMeshes.push(...gearObj.hitMeshes);
      clusterGearHitMeshes.push(...gearObj.hitMeshes);

      const rearCrown = createBevelGear({
        teeth: 14,
        outerR: 0.50,
        innerR: 0.25,
        height: 0.22,
        toothHeight: 0.06,
        isGold: true
      }, this.mats);
      rearCrown.rotation.y = Math.PI;
      rearCrown.position.z = -(gearObj.thickness / 2 + 0.14);
      gearObj.rotor.add(rearCrown);

      const gearPos = new THREE.Vector3(...cfg.pos);
      const gearQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...cfg.rot));
      const gearForward = new THREE.Vector3(0, 0, 1).applyQuaternion(gearQuat);

      const strutStart = new THREE.Vector3(cfg.pos[0] * 0.65, cfg.pos[1] * 0.65, -0.06);
      const strutEnd = gearPos.clone().addScaledVector(gearForward, -0.32);
      const strutVec2 = strutEnd.clone().sub(strutStart);

      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.115, strutVec2.length(), 14),
        this.mats.darkBronze
      );
      strut.position.copy(strutStart).addScaledVector(strutVec2, 0.5);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), strutVec2.clone().normalize());
      clusterGroup.add(strut);

      const driveStart = new THREE.Vector3(0, 0, 0.64);
      const driveTarget = gearPos.clone().addScaledVector(gearForward, -0.38);
      const driveVec = driveTarget.clone().sub(driveStart);
      const driveLen = driveVec.length();

      const shaftGroup = new THREE.Group();
      shaftGroup.position.copy(driveStart);
      shaftGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), driveVec.clone().normalize());

      const shaftSpin = new THREE.Group();
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.058, Math.max(0.20, driveLen - 0.46), 14),
        this.mats.machinedSteel
      );
      rod.rotation.x = Math.PI / 2;
      rod.position.z = driveLen * 0.52;
      shaftSpin.add(rod);

      const innerPinion = createBevelGear({
        teeth: 12,
        outerR: 0.22,
        innerR: 0.11,
        height: 0.15,
        toothHeight: 0.045,
        isGold: true
      }, this.mats);
      innerPinion.position.z = 0.56;
      innerPinion.rotation.y = Math.PI;
      shaftSpin.add(innerPinion);

      const outerPinion = createBevelGear({
        teeth: 12,
        outerR: 0.25,
        innerR: 0.125,
        height: 0.16,
        toothHeight: 0.05,
        isGold: true
      }, this.mats);
      outerPinion.position.z = driveLen - 0.11;
      shaftSpin.add(outerPinion);

      shaftGroup.add(shaftSpin);

      const clutchMat = this.mats.antiqueGold.clone();
      const clutchCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.24, 16),
        clutchMat
      );
      clutchCollar.rotation.x = Math.PI / 2;
      clutchCollar.position.z = driveLen * 0.48;
      shaftGroup.add(clutchCollar);

      clusterGroup.add(shaftGroup);

      shafts[id] = { shaftSpin, clutchMat, shaftAngle: 0 };
      this.gearStates[id] = {
        id,
        cluster: clusterName,
        teeth: cfg.teeth,
        slots: cfg.slots,
        stepAngle: (2 * Math.PI) / cfg.slots,
        minStep: id === 'year' ? 1900 : -Infinity,
        maxStep: id === 'year' ? 2100 : Infinity,
        isLocked: false,
        angle: 0,
        prevAngle: 0,
        velocity: 0,
        targetStep: 0,
        targetAngle: 0,
        basePos: new THREE.Vector3(...cfg.pos),
        baseFwd: new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...cfg.rot)),
        focusMix: 0,
        gearObj
      };
    }

    return {
      clusterGroup,
      sunRotor,
      escRotor: escGear.rotor,
      shafts,
      gearHitMeshes: clusterGearHitMeshes,
      socketGroup,
      sunAngle: 0,
      escAngle: 0
    };
  }

  _getSocketWorldPose(clusterName) {
    const obj = this.clusterObjects[clusterName];
    obj.clusterGroup.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    obj.socketGroup.getWorldPosition(pos);
    obj.socketGroup.getWorldQuaternion(quat);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    pos.addScaledVector(fwd, 0.80);
    return { pos, quat };
  }

  registerGearState(id, initialStep, labelFn) {
    const g = this.gearStates[id];
    if (!g) return;
    g.targetStep = initialStep;
    g.targetAngle = initialStep * g.stepAngle;
    g.angle = g.targetAngle;
    g.prevAngle = g.angle;
    g.labelFn = labelFn;
    g.gearObj.rotor.rotation.z = g.angle;
    g.gearObj.updateLabels(initialStep, initialStep, labelFn);
  }

  setGearTargetStep(id, newStep, labelFn = null) {
    const g = this.gearStates[id];
    if (!g) return;
    if (labelFn) g.labelFn = labelFn;
    const clamped = Math.max(g.minStep, Math.min(g.maxStep, newStep));
    g.targetStep = clamped;
    g.targetAngle = clamped * g.stepAngle;
    if (this.prefersReducedMotion()) {
      g.angle = g.targetAngle;
      g.prevAngle = g.angle;
      g.velocity = 0;
      g.gearObj.rotor.rotation.z = g.angle;
    }
    const centerStep = Math.round(g.angle / g.stepAngle);
    if (g.labelFn) g.gearObj.updateLabels(centerStep, g.targetStep, g.labelFn);
  }

  setGearImmediate(id, newStep, labelFn = null) {
    const g = this.gearStates[id];
    if (!g) return;
    if (labelFn) g.labelFn = labelFn;
    const clamped = Math.max(g.minStep, Math.min(g.maxStep, newStep));
    g.targetStep = clamped;
    g.targetAngle = clamped * g.stepAngle;
    g.angle = g.targetAngle;
    g.prevAngle = g.angle;
    g.velocity = 0;
    g.gearObj.rotor.rotation.z = g.angle;
    if (g.labelFn) g.gearObj.updateLabels(clamped, clamped, g.labelFn);
  }

  refreshGearLabels(id, labelFn = null) {
    const g = this.gearStates[id];
    if (!g) return;
    if (labelFn) g.labelFn = labelFn;
    const centerStep = Math.round(g.angle / g.stepAngle);
    if (g.labelFn) g.gearObj.updateLabels(centerStep, g.targetStep, g.labelFn);
  }

  setGearLocked(id, locked) {
    const g = this.gearStates[id];
    if (!g) return;
    g.isLocked = Boolean(locked);
    g.gearObj.setLocked(g.isLocked);
    this.remoteRig.setLocked(id, g.isLocked);
    this.refreshGearLabels(id);
  }

  setEngagedGear(id, { rotateToFace = true } = {}) {
    const g = this.gearStates[id];
    if (!g) return;
    const prevCluster = this.state.engagedCluster;
    const changed = this.state.engagedGearId !== id;
    this.state.engagedGearId = id;
    this.state.engagedCluster = g.cluster;

    this.remoteRig.setActiveGear(id);

    for (const [gid, gs] of Object.entries(this.gearStates)) {
      const active = gid === id;
      gs.gearObj.setEngaged(active);
      const cl = this.clusterObjects[gs.cluster];
      if (cl && cl.shafts[gid]) {
        cl.shafts[gid].clutchMat.color.setHex(active ? GOLD_HEX : 0x6b5630);
        cl.shafts[gid].clutchMat.roughness = active ? 0.16 : 0.40;
      }
    }

    if (changed) {
      this.state.coastingFree = false;
      this.state.keyVel = 0;
      if (!this.prefersReducedMotion()) {
        this.state.keyExtractVel += prevCluster !== g.cluster ? 5.2 : 2.2;
      }
    }

    if (rotateToFace) {
      this.setTurretFace(g.cluster);
      if (this.state.povMode === 'space') {
        const gearSide = g.basePos.x < -0.5 ? -0.09 : g.basePos.x > 0.5 ? 0.09 : 0;
        this.cam.targetTheta = gearSide;
      }
    }
  }

  setTurretFace(clusterName) {
    const faceBase = clusterName === 'time' ? Math.PI : 0;
    const delta = normalizeAngle(faceBase - this.state.turretAngle);
    this.state.turretTargetAngle = this.state.turretAngle + delta;
    this.state.turretCoasting = false;
    if (this.prefersReducedMotion()) {
      this.state.turretAngle = this.state.turretTargetAngle;
      this.state.turretVel = 0;
    }
  }

  rotateTurretBy(deltaRad) {
    if (!deltaRad) return;
    this.state.hasRotatedTurret = true;
    this.state.turretCoasting = false;
    this.state.turretTargetAngle += deltaRad;
    if (this.prefersReducedMotion()) {
      this.state.turretAngle = this.state.turretTargetAngle;
      this.state.turretVel = 0;
    }
  }

  scrubTurret(deltaRad) {
    if (!deltaRad) return;
    this.state.hasRotatedTurret = true;
    this.state.turretCoasting = false;
    this.state.turretAngle += deltaRad;
    this.state.turretTargetAngle = this.state.turretAngle;
    this.state.turretVel = 0;
  }

  snapTurretToNearestFace() {
    const face = Math.cos(this.state.turretAngle) >= 0 ? 'date' : 'time';
    this.setTurretFace(face);
  }

  setPov(povMode) {
    const isEarth = povMode === 'earth';
    this.state.povMode = isEarth ? 'earth' : 'space';
    this.onHoverEarth(null);
    this.onHoverInteract(null);
    if (this.room) this.room.setTelescopeHovered(false);

    if (isEarth) {
      this.setEarthStep('room');
    } else {
      this.pov.targetBody = null;
      this.pov.solarFilterMix = 0;
      this.cosmos.setTelescopeOptics({ active: false, solarFilterMix: 0 });
      this.cosmos.setPovMode(false, this.prefersReducedMotion());
      if (this.celestialState) {
        this.updateAstronomy(this.celestialState, this.weatherState);
      }
      this.keyRig.root.visible = true;
      this.cam.targetTheta = SPACE_CAM_HOME.theta;
      this.cam.targetPhi = SPACE_CAM_HOME.phi;
      this.cam.targetRadius = SPACE_CAM_HOME.radius;
      this.cam.targetLook.copy(this._isPortrait() ? SPACE_CAM_TARGET_PORTRAIT : SPACE_CAM_HOME.target);
      this.onEarthStepChange(null);
      this._applyCameraFov();
      this.onZoomChange(this.getZoomLabel());
    }
  }

  setEarthStep(step) {
    const target = step === 'telescope'
      ? 'telescope'
      : step === 'remote'
        ? 'remote'
        : 'room';
    this.state.earthStep = target;
    this.onHoverEarth(null);
    this.onHoverInteract(null);
    if (this.room) this.room.setTelescopeHovered(false);
    if (this.remoteRig && this.remoteRig.setDoneHovered) {
      this.remoteRig.setDoneHovered(false);
    }

    if (this.state.povMode !== 'earth') return;

    if (target !== 'telescope') {
      this.pov.targetBody = null;
      this.pov.solarFilterMix = 0;
      this.cosmos.setTelescopeOptics({ active: false, solarFilterMix: 0 });
      this.cosmos.setPovMode(false, true);
      if (this.celestialState) {
        this.updateAstronomy(this.celestialState, this.weatherState);
      }
      this.onTelescopeTargetChange(null);
      this.roomCam.targetYaw = 0;
      this.roomCam.targetPitch = 0;
      this.roomCam.targetFov = ROOM_FOV_HOME;
      this.roomCam.fov = ROOM_FOV_HOME;
      if (this.prefersReducedMotion()) {
        this.roomCam.focusMix = target === 'remote' ? 1 : 0;
      }
      if (this.remoteRig && this.remoteRig.setRemoteFocused) {
        this.remoteRig.setRemoteFocused(target === 'remote');
      }
      this._updateRoomCamera(this.prefersReducedMotion() ? 1 : 0, true);
    } else {
      this.cosmos.setPovMode(true, true);
      this.pov.solarFilterMix = 0;
      this.cosmos.setTelescopeOptics({ active: true, solarFilterMix: 0 });
      this.clustersRoot.visible = false;
      this.keyRig.root.visible = false;
      if (this.remoteRig && this.remoteRig.setRemoteFocused) {
        this.remoteRig.setRemoteFocused(false);
      }

      const sunH = this.cosmos.getPovBodyHorizon('sun') || (this.celestialState && this.celestialState.sunHorizon);
      const moonH = this.cosmos.getPovBodyHorizon('moon') || (this.celestialState && this.celestialState.moonHorizon);

      if (sunH && sunH.altDeg >= 0) {
        this.pov.targetBody = 'sun';
        this.pov.targetAzDeg = sunH.azDeg;
        this.pov.targetElevDeg = THREE.MathUtils.clamp(sunH.altDeg, HORIZON_VISIBLE_ALT_DEG, 88.5);
      } else if (moonH && moonH.altDeg >= HORIZON_VISIBLE_ALT_DEG) {
        this.pov.targetBody = 'moon';
        this.pov.targetAzDeg = moonH.azDeg;
        this.pov.targetElevDeg = THREE.MathUtils.clamp(moonH.altDeg, HORIZON_VISIBLE_ALT_DEG, 88.5);
      } else if (sunH && sunH.altDeg >= HORIZON_VISIBLE_ALT_DEG) {
        this.pov.targetBody = 'sun';
        this.pov.targetAzDeg = sunH.azDeg;
        this.pov.targetElevDeg = THREE.MathUtils.clamp(sunH.altDeg, HORIZON_VISIBLE_ALT_DEG, 88.5);
      } else {
        const northHemi = !this.celestialState || this.celestialState.observerLatDeg >= 0;
        this.pov.targetBody = null;
        this.pov.targetAzDeg = northHemi ? 180 : 0;
        this.pov.targetElevDeg = 28;
      }

      // Snap initial bore-sight onto acquired sky sector to avoid spinning from stale angles
      this.pov.azDeg = this.pov.targetAzDeg;
      this.pov.elevDeg = this.pov.targetElevDeg;
      this.pov.fov = TELESCOPE_FOV_HOME;
      this.pov.targetFov = this.pov.targetBody ? telescopeMagToFov(3.5) : TELESCOPE_FOV_HOME;
      if (this.prefersReducedMotion()) {
        this.pov.fov = this.pov.targetFov;
      }
      this._applyCameraFov(true);
      this.onTelescopeTargetChange(this.pov.targetBody);
    }

    this.onEarthStepChange(target);
    this.onZoomChange(this.getZoomLabel());
  }

  focusTelescopeBody(body, { zoomToAcquire = true } = {}) {
    if (body !== 'sun' && body !== 'moon') {
      this.pov.targetBody = null;
      this.onTelescopeTargetChange(null);
      return { visible: false, body: null, altDeg: -90 };
    }
    const h = this.cosmos.getPovBodyHorizon(body)
      || (body === 'sun'
        ? (this.celestialState && this.celestialState.sunHorizon)
        : (this.celestialState && this.celestialState.moonHorizon));
    if (!h) {
      return { visible: false, body, altDeg: -90 };
    }

    if (h.altDeg < HORIZON_VISIBLE_ALT_DEG) {
      this.pov.targetBody = null;
      this.pov.targetAzDeg = h.azDeg;
      this.pov.targetElevDeg = 2.0;
      if (this.pov.targetFov < TELESCOPE_FOV_HOME) {
        this.pov.targetFov = TELESCOPE_FOV_HOME;
      }
      if (this.prefersReducedMotion()) {
        this.pov.azDeg = this.pov.targetAzDeg;
        this.pov.elevDeg = this.pov.targetElevDeg;
        this.pov.fov = this.pov.targetFov;
        this._applyCameraFov(true);
      }
      this.onTelescopeTargetChange(null);
      this.onZoomChange(this.getZoomLabel());
      return { visible: false, body, altDeg: h.altDeg, azDeg: h.azDeg };
    }

    const alreadyLocked = this.pov.targetBody === body;
    this.pov.targetBody = body;
    this.pov.targetAzDeg = h.azDeg;
    this.pov.targetElevDeg = THREE.MathUtils.clamp(h.altDeg, HORIZON_VISIBLE_ALT_DEG, 88.5);
    if (zoomToAcquire) {
      const curMag = fovToTelescopeMag(this.pov.targetFov);
      if (!alreadyLocked && curMag < 5.5) {
        this.pov.targetFov = telescopeMagToFov(6.0);
      } else if (alreadyLocked && curMag < 11.5) {
        this.pov.targetFov = telescopeMagToFov(12.0);
      }
    }
    if (this.prefersReducedMotion()) {
      this.pov.azDeg = this.pov.targetAzDeg;
      this.pov.elevDeg = this.pov.targetElevDeg;
      this.pov.fov = this.pov.targetFov;
      this._applyCameraFov(true);
    }
    this.onTelescopeTargetChange(body);
    this.onZoomChange(this.getZoomLabel());
    return { visible: true, body, altDeg: h.altDeg, azDeg: h.azDeg };
  }

  updateRemoteDisplay(info) {
    if (this.remoteRig && this.remoteRig.updateDisplay) {
      this.remoteRig.updateDisplay(info);
    }
  }

  getZoomLabel() {
    let mag = 1.0;
    if (this.state.povMode === 'earth') {
      mag = this.state.earthStep !== 'telescope'
        ? ROOM_FOV_HOME / this.roomCam.targetFov
        : fovToTelescopeMag(this.pov.targetFov);
    } else {
      mag = SPACE_CAM_HOME.radius / this.cam.targetRadius;
    }
    return `${mag.toFixed(1)}×`;
  }

  zoomIn(factor = 1.25) {
    if (this.state.povMode === 'earth') {
      if (this.state.earthStep !== 'telescope') {
        this.roomCam.targetFov = Math.max(ROOM_FOV_MIN, this.roomCam.targetFov / factor);
        if (this.prefersReducedMotion()) {
          this.roomCam.fov = this.roomCam.targetFov;
          this._updateRoomCamera(1);
        }
      } else {
        const curMag = fovToTelescopeMag(this.pov.targetFov);
        const nextMag = Math.min(TELESCOPE_MAG_MAX, curMag * factor);
        this.pov.targetFov = Math.max(TELESCOPE_FOV_MIN, telescopeMagToFov(nextMag));
        if (this.prefersReducedMotion()) {
          this.pov.fov = this.pov.targetFov;
          this._applyCameraFov(true);
        }
      }
    } else {
      this.cam.targetRadius = Math.max(SPACE_RADIUS_MIN, this.cam.targetRadius / factor);
      if (this.prefersReducedMotion()) {
        this.cam.radius = this.cam.targetRadius;
      }
    }
    this.onZoomChange(this.getZoomLabel());
  }

  zoomOut(factor = 1.25) {
    if (this.state.povMode === 'earth') {
      if (this.state.earthStep !== 'telescope') {
        this.roomCam.targetFov = Math.min(ROOM_FOV_MAX, this.roomCam.targetFov * factor);
        if (this.prefersReducedMotion()) {
          this.roomCam.fov = this.roomCam.targetFov;
          this._updateRoomCamera(1);
        }
      } else {
        const curMag = fovToTelescopeMag(this.pov.targetFov);
        const nextMag = Math.max(TELESCOPE_MAG_MIN, curMag / factor);
        this.pov.targetFov = Math.min(TELESCOPE_FOV_MAX, telescopeMagToFov(nextMag));
        if (this.prefersReducedMotion()) {
          this.pov.fov = this.pov.targetFov;
          this._applyCameraFov(true);
        }
      }
    } else {
      this.cam.targetRadius = Math.min(SPACE_RADIUS_MAX, this.cam.targetRadius * factor);
      if (this.prefersReducedMotion()) {
        this.cam.radius = this.cam.targetRadius;
      }
    }
    this.onZoomChange(this.getZoomLabel());
  }

  resetZoom() {
    if (this.state.povMode === 'earth') {
      if (this.state.earthStep !== 'telescope') {
        this.roomCam.targetFov = ROOM_FOV_HOME;
        if (this.prefersReducedMotion()) {
          this.roomCam.fov = ROOM_FOV_HOME;
          this._updateRoomCamera(1);
        }
      } else {
        this.pov.targetFov = TELESCOPE_FOV_HOME;
        if (this.prefersReducedMotion()) {
          this.pov.fov = TELESCOPE_FOV_HOME;
          this._applyCameraFov();
        }
      }
    } else {
      this.cam.targetRadius = SPACE_CAM_HOME.radius;
      if (this.prefersReducedMotion()) {
        this.cam.radius = SPACE_CAM_HOME.radius;
      }
    }
    this.onZoomChange(this.getZoomLabel());
  }

  setPaused(paused) {
    const next = Boolean(paused);
    if (this.state.paused === next) return;
    this.state.paused = next;
    this.onHoverEarth(null);
    this.onHoverInteract(null);

    if (next) {
      if (this._rafId !== null) {
        window.cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    } else {
      this._resize();
      if (this._rafId === null) {
        this._startLoop();
      }
    }
  }

  // Slow cinematic push-in used when a host page reveals the picker
  playOpeningDolly(durationMs = 2600) {
    if (this.prefersReducedMotion() || this.state.povMode !== 'space') return;
    this.cam.radius = this.cam.targetRadius * 1.55;
    this._camLerpRate = 1.5;
    if (this._dollyTimer) clearTimeout(this._dollyTimer);
    this._dollyTimer = setTimeout(() => {
      this._camLerpRate = null;
      this._dollyTimer = null;
    }, durationMs);
  }

  _isPortrait() {
    return (this.camera.aspect || 1) < PORTRAIT_ASPECT;
  }

  // Connected back-to-back horological gyroscope across all viewports and monitor
  _setClusterLayout() {
    for (const name of ['date', 'time']) {
      const cl = this.clusterObjects[name];
      const group = cl && (cl.group || cl.clusterGroup);
      if (!group) continue;
      group.position.copy(CLUSTER_POS_CONNECTED[name]);
      group.rotation.y = CLUSTER_ROT_Y_CONNECTED[name];
      group.visible = true;
    }

    if (this.portraitTurret) {
      this.portraitTurret.root.visible = true;
    }
  }

  _applyCameraFov(force = false) {
    const aspect = this.camera.aspect || 1;
    const baseFov = aspect < 1.38 ? Math.min(66, 42 * (1.38 / aspect)) : 42;
    const inTelescope = this.state.povMode === 'earth' && this.state.earthStep === 'telescope';
    const nextFov = inTelescope
      ? THREE.MathUtils.clamp(this.pov.fov, 1.8, 68)
      : baseFov;
    if (
      force ||
      Math.abs(this.camera.fov - nextFov) > 0.002 ||
      Math.abs(aspect - this._lastCamAspect) > 0.0005
    ) {
      this._lastCamAspect = aspect;
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  _updateRoomCamera(lerpFactor = 1, force = false) {
    this.roomCam.yaw += (this.roomCam.targetYaw - this.roomCam.yaw) * lerpFactor;
    this.roomCam.pitch += (this.roomCam.targetPitch - this.roomCam.pitch) * lerpFactor;
    this.roomCam.fov += (this.roomCam.targetFov - this.roomCam.fov) * lerpFactor;
    const targetFocus = this.state.earthStep === 'remote' ? 1 : 0;
    this.roomCam.focusMix += (targetFocus - this.roomCam.focusMix) * lerpFactor;

    const aspect = this.camera.aspect || 1;
    this.roomCamera.aspect = aspect;
    const baseFov = aspect < 0.85
      ? Math.min(72, ROOM_FOV_HOME * (1.15 / aspect))
      : aspect < 1.38
        ? Math.min(62, ROOM_FOV_HOME * (1.38 / aspect))
        : ROOM_FOV_HOME;
    const nextFov = THREE.MathUtils.clamp(baseFov * (this.roomCam.fov / ROOM_FOV_HOME), 18, 76);
    if (
      force ||
      Math.abs(this.roomCamera.fov - nextFov) > 0.01 ||
      Math.abs(aspect - this._lastRoomAspect) > 0.0005
    ) {
      this._lastRoomAspect = aspect;
      this.roomCamera.fov = nextFov;
      this.roomCamera.updateProjectionMatrix();
    }

    const isPortrait = aspect < 0.85;
    const roomPos = new THREE.Vector3(isPortrait ? 0.08 : 0.0, isPortrait ? 1.62 : 1.50, isPortrait ? 3.72 : 2.34);
    const roomLook = new THREE.Vector3(
      (isPortrait ? 0.06 : 0.04) + Math.sin(this.roomCam.yaw) * 3.2,
      (isPortrait ? 1.08 : 1.12) + Math.sin(this.roomCam.pitch) * 2.2,
      -1.0
    );
    const remotePos = new THREE.Vector3(-0.02, isPortrait ? 1.50 : 1.77, isPortrait ? 1.09 : 1.29);
    const remoteLook = new THREE.Vector3(-0.02, 0.93, 0.65);

    const mix = THREE.MathUtils.clamp(this.roomCam.focusMix, 0, 1);
    this.roomCamera.position.lerpVectors(roomPos, remotePos, mix);
    this.roomCamera.lookAt(roomLook.lerp(remoteLook, mix));
    this.roomCamera.updateMatrixWorld(true);
  }

  highlightCountry(countryId) {
    this.cosmos.highlightCountryPin(countryId);
  }

  updateAstronomy(celestial, weather = null) {
    this.celestialState = celestial;
    if (weather) this.weatherState = weather;
    if (this.state.povMode === 'earth' && this.state.earthStep === 'telescope') return;
    this.hemiLight.intensity = 0.68 + 0.68 * celestial.dayFactor;
    this.warmFillLight.intensity = 3.4 + 1.2 * celestial.dayFactor;
    this.coolRimLight.intensity = 2.6 - 0.8 * celestial.dayFactor;
  }

  crankKeyStep(deltaSteps) {
    if (!deltaSteps) return;
    this.state.coastingFree = false;
    this.state.keyTargetStep += deltaSteps;
    if (this.prefersReducedMotion()) {
      this.state.keyAngle = this.state.keyTargetStep * KEY_DETENT_ANGLE;
      this.state.keyVel = 0;
    }
  }

  _resolveEarthHit(hit) {
    if (hit.object.userData.interactiveType === 'countryPin') {
      const cid = hit.object.userData.countryId;
      return COUNTRY_TIMEZONES.find((c) => c.id === cid) || null;
    }
    if (hit.object.userData.interactiveType === 'earth') {
      const { latDeg, lonDeg } = this.cosmos.worldPointToLatLon(hit.point);
      return resolveLocationFromLatLon(latDeg, lonDeg);
    }
    return null;
  }

  _attachInteractions() {
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();

    let mode = null; // 'key' | 'gearDrag' | 'turretDrag' | 'orbit' | null
    let activePointerId = null;
    let lastClientX = 0;
    let lastClientY = 0;
    let prevKeyScreenAngle = 0;
    let draggedGearId = null;
    let gearDragStarted = false;
    let prevGearScreenAngle = 0;
    let turretAngVel = 0;
    let lastMoveTime = 0;
    let keyAngVel = 0;
    let totalDragDist = 0;
    let wheelAccum = 0;
    let wheelTimer = null;
    let earthClickCandidate = null;
    let roomClickAction = null;
    let skyBodyClickCandidate = null;

    const getActiveCamera = () => (
      this.state.povMode === 'earth' && this.state.earthStep !== 'telescope'
        ? this.roomCamera
        : this.camera
    );

    const updateNDC = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return rect;
    };

    const projectWorldToScreen = (worldVec, rect) => {
      const v = worldVec.clone().project(getActiveCamera());
      return {
        x: rect.left + ((v.x + 1) * 0.5) * rect.width,
        y: rect.top + ((1 - v.y) * 0.5) * rect.height
      };
    };

    const getKeyProjection = (rect) => {
      const pivotWorld = new THREE.Vector3();
      const bowWorld = new THREE.Vector3();

      if (this.state.povMode === 'earth' && this.state.earthStep !== 'telescope') {
        this.room.scene.updateMatrixWorld(true);
        this.remoteRig.knobPivot.getWorldPosition(pivotWorld);
        bowWorld.set(0, 0, 0.14).applyMatrix4(this.remoteRig.knobPivot.matrixWorld);
      } else {
        this.keyRig.rotor.getWorldPosition(pivotWorld);
        bowWorld.set(0, 0, 0.96).applyMatrix4(this.keyRig.slideGroup.matrixWorld);
      }

      const axisWorld = bowWorld.clone().sub(pivotWorld).normalize();
      const camDir = new THREE.Vector3();
      getActiveCamera().getWorldDirection(camDir);
      const facing = -axisWorld.dot(camDir);

      return {
        bowScreen: projectWorldToScreen(bowWorld, rect),
        pivotScreen: projectWorldToScreen(pivotWorld, rect),
        facing
      };
    };

    const getGearScreenCenter = (gearId, rect) => {
      const worldCenter = new THREE.Vector3();
      this.gearStates[gearId].gearObj.group.getWorldPosition(worldCenter);
      return projectWorldToScreen(worldCenter, rect);
    };

    const applyKeyDelta = (deltaAngle, dt) => {
      if (!this.state.hasDraggedKey && Math.abs(deltaAngle) > 0.05) {
        this.state.hasDraggedKey = true;
        this.onFirstKeyDrag();
      }
      this.state.keyAngle += deltaAngle;
      this.state.keyVel = 0;
      this.state.coastingFree = false;
      keyAngVel = keyAngVel * 0.45 + (deltaAngle / dt) * 0.55;

      const liveDetent = Math.round(this.state.keyAngle / KEY_DETENT_ANGLE);
      if (liveDetent !== this.state.keyTargetStep) {
        const stepDiff = liveDetent - this.state.keyTargetStep;
        this.state.keyTargetStep = liveDetent;
        this.onKeyStep(stepDiff);
      }
    };

    const releaseKeyOrGearDrag = () => {
      this.state.isDraggingKey = false;
      this.keyRig.setDragging(false);
      const releaseVel = (performance.now() - lastMoveTime) > 85 ? 0 : keyAngVel;
      if (Math.abs(releaseVel) > 1.8 && !this.prefersReducedMotion()) {
        this.state.keyVel = THREE.MathUtils.clamp(releaseVel, -16, 16);
        this.state.coastingFree = true;
      } else {
        this.state.coastingFree = false;
        this.state.keyVel = THREE.MathUtils.clamp(releaseVel * 0.25, -4, 4);
        const coast = Math.max(-1.5 * KEY_DETENT_ANGLE, Math.min(1.5 * KEY_DETENT_ANGLE, releaseVel * 0.08));
        const snapped = Math.round((this.state.keyAngle + coast) / KEY_DETENT_ANGLE);
        if (snapped !== this.state.keyTargetStep) {
          const stepDiff = snapped - this.state.keyTargetStep;
          this.state.keyTargetStep = snapped;
          this.onKeyStep(stepDiff);
        }
      }
    };

    const activeRayTargets = () => {
      if (this.state.povMode === 'earth') {
        return this.state.earthStep !== 'telescope'
          ? this.room.getRayTargets()
          : this.cosmos.skyBodyHitMeshes;
      }
      const turretDial = this.portraitTurret ? this.portraitTurret.hitMeshes : [];
      return [...turretDial, ...this.keyRig.hitMeshes, ...this.gearHitMeshes, ...this.cosmos.earthHitMeshes];
    };

    const activeTouches = new Map();
    let prevPinchDist = null;

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state.paused) return;
      if (e.pointerType === 'touch') {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) {
          const pts = [...activeTouches.values()];
          prevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          mode = null;
          draggedGearId = null;
          gearDragStarted = false;
          activePointerId = null;
          this.state.isDraggingKey = false;
          this.keyRig.setDragging(false);
          this.state.isDraggingTurret = false;
          if (this.portraitTurret) this.portraitTurret.setDialDragging(false);
          earthClickCandidate = null;
          roomClickAction = null;
          skyBodyClickCandidate = null;
          return;
        }
      }

      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const rect = updateNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNDC, getActiveCamera());
      const hits = raycaster.intersectObjects(activeRayTargets(), false);

      activePointerId = e.pointerId;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      lastMoveTime = performance.now();
      totalDragDist = 0;
      keyAngVel = 0;
      earthClickCandidate = null;
      roomClickAction = null;
      skyBodyClickCandidate = null;

      if (hits.length > 0) {
        const hitData = hits[0].object.userData;

        if (hitData.interactiveType === 'remoteDone') {
          mode = null;
          this.setEarthStep('room');
          return;
        }

        if (hitData.interactiveType === 'turretDial') {
          mode = 'turretDrag';
          this.state.isDraggingTurret = true;
          this.state.turretCoasting = false;
          this.state.turretVel = 0;
          turretAngVel = 0;
          if (this.portraitTurret) this.portraitTurret.setDialDragging(true);
          if (this.canvas.setPointerCapture) {
            try {
              this.canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
          }
          return;
        }

        if (hitData.interactiveType === 'key') {
          if (this.state.povMode === 'earth' && this.state.earthStep === 'room') {
            this.setEarthStep('remote');
          }
          mode = 'key';
          this.state.isDraggingKey = true;
          this.state.coastingFree = false;
          this.state.keyVel = 0;
          this.keyRig.setDragging(true);
          const proj = getKeyProjection(rect);
          prevKeyScreenAngle = Math.atan2(
            e.clientY - proj.bowScreen.y,
            e.clientX - proj.bowScreen.x
          );
          if (this.canvas.setPointerCapture) {
            try {
              this.canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
          }
          return;
        }

        if (hitData.interactiveType === 'remoteBtn' || hitData.interactiveType === 'gear') {
          const gearId = hitData.gearId;
          const gs = this.gearStates[gearId];
          if (gs) {
            if (gs.isLocked) {
              this.onLockedAttempt();
            } else {
              this.onSelectGear(gearId);
            }
          }
          if (hitData.interactiveType === 'remoteBtn' && this.state.povMode === 'earth' && this.state.earthStep === 'room') {
            this.setEarthStep('remote');
          }
          if (hitData.interactiveType === 'gear' && gs && !gs.isLocked) {
            mode = 'gearDrag';
            draggedGearId = gearId;
            gearDragStarted = false;
            const center = getGearScreenCenter(gearId, rect);
            prevGearScreenAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
            if (this.canvas.setPointerCapture) {
              try {
                this.canvas.setPointerCapture(e.pointerId);
              } catch (_) {}
            }
          } else {
            mode = null;
          }
          return;
        }

        if (hitData.interactiveType === 'remoteBody') {
          if (this.state.povMode === 'earth' && this.state.earthStep === 'room') {
            this.setEarthStep('remote');
          }
          mode = null;
          return;
        }

        if (hitData.interactiveType === 'telescope' || hitData.interactiveType === 'monitorScreen') {
          roomClickAction = hitData.interactiveType;
          mode = 'orbit';
          if (this.canvas.setPointerCapture) {
            try {
              this.canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
          }
          return;
        }

        if (hitData.interactiveType === 'skyBody') {
          skyBodyClickCandidate = hitData.body || null;
          mode = 'orbit';
          if (this.canvas.setPointerCapture) {
            try {
              this.canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
          }
          return;
        }

        if (hitData.interactiveType === 'countryPin' || hitData.interactiveType === 'earth') {
          earthClickCandidate = this._resolveEarthHit(hits[0]);
        }
      }

      mode = 'orbit';
      if (this.canvas.setPointerCapture) {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.state.paused) return;

      if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) {
          const pts = [...activeTouches.values()];
          const currDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          if (prevPinchDist && currDist > 8) {
            const ratio = currDist / prevPinchDist;
            if (ratio > 1.004) this.zoomIn(ratio);
            else if (ratio < 0.996) this.zoomOut(1 / ratio);
          }
          prevPinchDist = currDist;
          return;
        }
      }

      const rect = updateNDC(e.clientX, e.clientY);

      if (activePointerId !== e.pointerId) {
        raycaster.setFromCamera(pointerNDC, getActiveCamera());
        const hits = raycaster.intersectObjects(activeRayTargets(), false);
        const first = hits.length > 0 ? hits[0] : null;
        const hitType = first ? first.object.userData.interactiveType : null;

        this.keyRig.setHovered(hitType === 'key');
        this.remoteRig.setKnobHovered(hitType === 'key');
        if (this.portraitTurret) {
          this.portraitTurret.setDialHovered(hitType === 'turretDial');
        }
        const inRoomView = this.state.povMode === 'earth' && this.state.earthStep !== 'telescope';
        if (this.room) {
          this.room.setTelescopeHovered(inRoomView && hitType === 'telescope');
        }
        if (this.remoteRig && this.remoteRig.setDoneHovered) {
          this.remoteRig.setDoneHovered(inRoomView && hitType === 'remoteDone');
        }

        if (hitType === 'countryPin' || hitType === 'earth') {
          const country = this._resolveEarthHit(first);
          this.canvas.style.cursor = 'pointer';
          this.onHoverInteract(null);
          this.onHoverEarth(
            country ? { country, x: e.clientX - rect.left, y: e.clientY - rect.top } : null
          );
        } else if (inRoomView && hitType === 'remoteDone') {
          this.onHoverEarth(null);
          this.canvas.style.cursor = 'pointer';
          this.onHoverInteract({
            text: 'Done · Return focus to Observatory Room',
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          });
        } else if (inRoomView && hitType === 'remoteBody' && this.state.earthStep === 'room') {
          this.onHoverEarth(null);
          this.canvas.style.cursor = 'pointer';
          this.onHoverInteract({
            text: 'Desk Remote · Click to focus controller',
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          });
        } else if (this.state.povMode === 'earth' && this.state.earthStep === 'telescope' && hitType === 'skyBody') {
          const body = first.object.userData.body;
          this.onHoverEarth(null);
          this.canvas.style.cursor = 'pointer';
          this.onHoverInteract({
            text: body === 'sun'
              ? 'Sun · Click to lock & zoom (ND5 filter)'
              : 'Moon · Click to lock & zoom',
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          });
        } else if (inRoomView && (hitType === 'telescope' || hitType === 'monitorScreen')) {
          this.onHoverEarth(null);
          this.canvas.style.cursor = 'pointer';
          this.onHoverInteract({
            text: hitType === 'telescope'
              ? "Brass Telescope · Click to look through Earth's sky eyepiece"
              : 'Outer Space Feed · Click monitor to open full Space POV',
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          });
        } else {
          this.onHoverEarth(null);
          this.onHoverInteract(null);
          this.canvas.style.cursor =
            hitType === 'key' || hitType === 'turretDial'
              ? 'grab'
              : hitType === 'gear' || hitType === 'remoteBtn' || hitType === 'remoteDone'
                ? 'pointer'
                : 'move';
        }
        return;
      }

      this.onHoverEarth(null);
      this.onHoverInteract(null);

      const dx = e.clientX - lastClientX;
      const dy = e.clientY - lastClientY;
      totalDragDist += Math.hypot(dx, dy);
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      if (mode === 'turretDrag') {
        const nowMs = performance.now();
        const dt = Math.max(0.008, (nowMs - lastMoveTime) / 1000);
        lastMoveTime = nowMs;

        const dTheta = dx * 0.015;
        this.state.hasRotatedTurret = true;
        this.state.turretAngle += dTheta;
        this.state.turretTargetAngle = this.state.turretAngle;
        turretAngVel = turretAngVel * 0.4 + (dTheta / dt) * 0.6;
        return;
      }

      if (mode === 'key') {
        const nowMs = performance.now();
        const dt = Math.max(0.008, (nowMs - lastMoveTime) / 1000);
        lastMoveTime = nowMs;

        const proj = getKeyProjection(rect);
        let deltaAngle = 0;

        if (Math.abs(proj.facing) > 0.25) {
          const currScreenAng = Math.atan2(
            e.clientY - proj.bowScreen.y,
            e.clientX - proj.bowScreen.x
          );
          deltaAngle = normalizeAngle(currScreenAng - prevKeyScreenAngle);
          prevKeyScreenAngle = currScreenAng;
          if (proj.facing < 0) deltaAngle = -deltaAngle;
        } else {
          const axis2x = proj.bowScreen.x - proj.pivotScreen.x;
          const axis2y = proj.bowScreen.y - proj.pivotScreen.y;
          const len = Math.max(12, Math.hypot(axis2x, axis2y));
          const perpX = -axis2y / len;
          const perpY = axis2x / len;
          deltaAngle = (dx * perpX + dy * perpY) / 52;
        }

        applyKeyDelta(deltaAngle, dt);
        return;
      }

      if (mode === 'gearDrag' && draggedGearId) {
        if (totalDragDist <= 6) return;
        const gs = this.gearStates[draggedGearId];
        if (!gs || gs.isLocked) return;

        const center = getGearScreenCenter(draggedGearId, rect);
        if (!gearDragStarted) {
          gearDragStarted = true;
          this.state.isDraggingKey = true;
          this.state.coastingFree = false;
          this.state.keyVel = 0;
          this.keyRig.setDragging(true);
          lastMoveTime = performance.now();
          prevGearScreenAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
          return;
        }

        const nowMs = performance.now();
        const dt = Math.max(0.008, (nowMs - lastMoveTime) / 1000);
        lastMoveTime = nowMs;

        const dist = Math.hypot(e.clientX - center.x, e.clientY - center.y);
        const gearWorldQuat = new THREE.Quaternion();
        gs.gearObj.group.getWorldQuaternion(gearWorldQuat);
        const gearFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(gearWorldQuat);
        const camDir = new THREE.Vector3();
        getActiveCamera().getWorldDirection(camDir);
        const facingSign = -gearFwd.dot(camDir) >= 0 ? 1 : -1;

        let deltaKeyAngle = 0;
        if (dist > 16) {
          const currAng = Math.atan2(e.clientY - center.y, e.clientX - center.x);
          const screenCw = normalizeAngle(currAng - prevGearScreenAngle);
          prevGearScreenAngle = currAng;
          deltaKeyAngle = -screenCw * facingSign * (KEY_DETENT_ANGLE / gs.stepAngle);
        } else {
          deltaKeyAngle = (-dx / 38) * facingSign * KEY_DETENT_ANGLE;
        }

        applyKeyDelta(deltaKeyAngle, dt);
        return;
      }

      if (mode === 'orbit' && totalDragDist > 5) {
        if (this.state.povMode === 'earth') {
          if (this.state.earthStep === 'room') {
            this.roomCam.targetYaw = THREE.MathUtils.clamp(this.roomCam.targetYaw - dx * 0.0028, -0.45, 0.45);
            this.roomCam.targetPitch = THREE.MathUtils.clamp(this.roomCam.targetPitch + dy * 0.0022, -0.22, 0.28);
          } else if (this.state.earthStep === 'telescope') {
            if (this.pov.targetBody) {
              this.pov.targetBody = null;
              this.onTelescopeTargetChange(null);
            }
            const degPerPx = (this.camera.fov / Math.max(300, rect.height)) * 1.15;
            const cosEl = Math.max(0.18, Math.cos(this.pov.targetElevDeg * DEG_TO_RAD));
            this.pov.targetAzDeg = ((this.pov.targetAzDeg - (dx * degPerPx) / cosEl) % 360 + 360) % 360;
            this.pov.targetElevDeg = THREE.MathUtils.clamp(this.pov.targetElevDeg + dy * degPerPx, -4, 88.5);
          }
        } else {
          this.cam.targetTheta -= dx * 0.0075;
          this.cam.targetPhi = Math.max(0.28, Math.min(2.45, this.cam.targetPhi - dy * 0.0075));
        }
      }
    });

    const endDrag = (e) => {
      if (e.pointerType === 'touch') {
        activeTouches.delete(e.pointerId);
        if (activeTouches.size < 2) prevPinchDist = null;
      }
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;

      if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }

      if (mode === 'key') {
        releaseKeyOrGearDrag();
      } else if (mode === 'gearDrag') {
        if (gearDragStarted) {
          releaseKeyOrGearDrag();
        }
        draggedGearId = null;
        gearDragStarted = false;
      } else if (mode === 'turretDrag') {
        this.state.isDraggingTurret = false;
        if (this.portraitTurret) this.portraitTurret.setDialDragging(false);
        const releaseVel = (performance.now() - lastMoveTime) > 90 ? 0 : turretAngVel;
        if (Math.abs(releaseVel) > 1.8 && !this.prefersReducedMotion()) {
          this.state.turretVel = THREE.MathUtils.clamp(releaseVel, -12, 12);
          this.state.turretCoasting = true;
        } else {
          const nearFace = Math.cos(this.state.turretAngle) >= 0 ? 'date' : 'time';
          const nearRad = nearFace === 'time' ? Math.PI : 0;
          if (Math.abs(normalizeAngle(nearRad - this.state.turretAngle)) < 14 * DEG_TO_RAD) {
            this.setTurretFace(nearFace);
          } else {
            this.state.turretTargetAngle = this.state.turretAngle;
          }
        }
      } else if (mode === 'orbit' && totalDragDist < 6) {
        if (skyBodyClickCandidate) {
          this.focusTelescopeBody(skyBodyClickCandidate, { zoomToAcquire: true });
        } else if (roomClickAction === 'telescope') {
          this.setEarthStep('telescope');
        } else if (roomClickAction === 'monitorScreen') {
          this.onRequestSpacePov();
        } else if (earthClickCandidate) {
          this.onSelectCountry(earthClickCandidate, { enterPov: false });
        }
      }
      earthClickCandidate = null;
      roomClickAction = null;
      skyBodyClickCandidate = null;
      mode = null;
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('pointerleave', () => {
      this.onHoverEarth(null);
      this.onHoverInteract(null);
      if (this.room) this.room.setTelescopeHovered(false);
      if (this.remoteRig && this.remoteRig.setDoneHovered) {
        this.remoteRig.setDoneHovered(false);
      }
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.state.paused) return;
        e.preventDefault();
        updateNDC(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNDC, getActiveCamera());
        const hits = raycaster.intersectObjects(activeRayTargets(), false);
        const hit = hits.length > 0 ? hits[0].object.userData : null;

        const inTelescope = this.state.povMode === 'earth' && this.state.earthStep === 'telescope';
        if (!inTelescope && ((hit && hit.interactiveType === 'key') || (hit && hit.interactiveType === 'gear') || e.shiftKey)) {
          if (hit && hit.interactiveType === 'gear' && hit.gearId !== this.state.engagedGearId) {
            const gs = this.gearStates[hit.gearId];
            if (gs && !gs.isLocked) {
              this.onSelectGear(hit.gearId);
            }
          }
          const raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
          wheelAccum += raw;
          if (wheelTimer) clearTimeout(wheelTimer);
          wheelTimer = setTimeout(() => {
            wheelAccum = 0;
          }, 120);

          if (Math.abs(wheelAccum) >= 42) {
            const steps = Math.trunc(wheelAccum / 42);
            wheelAccum -= steps * 42;
            const delta = steps > 0 ? 1 : -1;
            this.crankKeyStep(delta);
            this.onKeyStep(delta);
          }
          return;
        }

        const zoomScale = Math.exp(-e.deltaY * (inTelescope ? 0.0018 : 0.0016));
        if (zoomScale > 1.001) {
          this.zoomIn(zoomScale);
        } else if (zoomScale < 0.999) {
          this.zoomOut(1 / zoomScale);
        }
      },
      { passive: false }
    );

    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.canvas.parentElement || this.canvas);
    } else {
      window.addEventListener('resize', () => this._resize());
    }
  }

  _resize() {
    const host = this.canvas.parentElement || this.canvas;
    const w = Math.max(300, host.clientWidth);
    const h = Math.max(300, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this._applyCameraFov(true);
    this._updateRoomCamera(1, true);
  }

  _integrateSpring(pos, vel, target, stiffness, damping, dt) {
    const accel = stiffness * (target - pos) - damping * vel;
    const nextVel = vel + accel * dt;
    const nextPos = pos + nextVel * dt;
    return { pos: nextPos, vel: nextVel };
  }

  _startLoop() {
    let lastTime = performance.now();
    const tick = (now) => {
      if (this.state.paused) {
        this._rafId = null;
        return;
      }
      this._rafId = window.requestAnimationFrame(tick);
      const dt = Math.min(0.032, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const reduced = this.prefersReducedMotion();

      if (this.celestialState) {
        this.cosmos.update(this.celestialState, dt, reduced);
      }

      if (reduced) {
        this.state.keyExtractZ = 0;
        this.state.keyExtractVel = 0;
      } else {
        const pulse = this._integrateSpring(this.state.keyExtractZ, this.state.keyExtractVel, 0, 175, 20, dt);
        this.state.keyExtractZ = pulse.pos;
        this.state.keyExtractVel = pulse.vel;
      }
      this.keyRig.slideGroup.position.z = this.state.keyExtractZ;

      if (!this.state.isDraggingKey) {
        if (reduced) {
          this.state.coastingFree = false;
          this.state.keyAngle = this.state.keyTargetStep * KEY_DETENT_ANGLE;
          this.state.keyVel = 0;
        } else if (this.state.coastingFree) {
          // Viscous brass-on-jewel friction + sinusoidal mechanical pawl detent torque
          const detentPhase = (this.state.keyAngle / KEY_DETENT_ANGLE) * Math.PI * 2;
          const accel = -6.8 * this.state.keyVel - 11.0 * Math.sin(detentPhase);
          this.state.keyVel += accel * dt;
          this.state.keyAngle += this.state.keyVel * dt;

          const liveDetent = Math.round(this.state.keyAngle / KEY_DETENT_ANGLE);
          if (liveDetent !== this.state.keyTargetStep) {
            const stepDiff = liveDetent - this.state.keyTargetStep;
            this.state.keyTargetStep = liveDetent;
            this.onKeyStep(stepDiff);
          }

          const offset = this.state.keyAngle - this.state.keyTargetStep * KEY_DETENT_ANGLE;
          if (
            (Math.abs(this.state.keyVel) < 0.95 && Math.abs(offset) < 0.22) ||
            Math.abs(this.state.keyVel) < 0.45
          ) {
            this.state.coastingFree = false;
          }
        } else {
          const keyTargetAng = this.state.keyTargetStep * KEY_DETENT_ANGLE;
          const kr = this._integrateSpring(this.state.keyAngle, this.state.keyVel, keyTargetAng, 260, 25, dt);
          this.state.keyAngle = kr.pos;
          this.state.keyVel = kr.vel;
        }
      }
      this.keyRig.rotor.rotation.z = -this.state.keyAngle;
      this.remoteRig.knobRotor.rotation.z = -this.state.keyAngle;

      const isTransmitting =
        this.state.isDraggingKey ||
        this.state.coastingFree ||
        Math.abs(this.state.keyVel) > 0.35;
      this.remoteRig.setTransmitting(isTransmitting);

      if (this.state.hasDraggedKey && this.state.hintFade > 0) {
        this.state.hintFade = Math.max(0, this.state.hintFade - dt * 1.8);
        this.keyRig.setHintOpacity(this.state.hintFade * 0.50);
        this.remoteRig.setHintOpacity(this.state.hintFade * 0.55);
      } else if (!this.state.hasDraggedKey && !reduced) {
        const wobble = Math.sin(now * 0.0022) * 0.18;
        this.keyRig.hintGroup.rotation.z = wobble;
        this.remoteRig.hintGroup.rotation.z = wobble;
      }

      const engagedId = this.state.engagedGearId;
      const keyFrac = (this.state.keyAngle / KEY_DETENT_ANGLE) - this.state.keyTargetStep;

      for (const g of Object.values(this.gearStates)) {
        const prevA = g.angle;
        if (reduced) {
          g.angle = g.targetAngle;
          g.velocity = 0;
        } else if (g.id === engagedId && (this.state.isDraggingKey || this.state.coastingFree)) {
          // 1:1 continuous real-time tooth coupling directly with winding key / remote dial
          const rawContinuous = g.targetAngle + keyFrac * g.stepAngle;
          const clampedTarget = THREE.MathUtils.clamp(
            rawContinuous,
            g.minStep * g.stepAngle - 0.14,
            g.maxStep * g.stepAngle + 0.14
          );
          const trackLerp = Math.min(1, dt * 36);
          const nextA = prevA + (clampedTarget - prevA) * trackLerp;
          g.velocity = (nextA - prevA) / dt;
          g.angle = nextA;
        } else {
          const gr = this._integrateSpring(g.angle, g.velocity, g.targetAngle, 225, 24, dt);
          g.angle = gr.pos;
          g.velocity = gr.vel;
        }

        // Physical spatial focus: active gear steps forward (+0.36) and scales up (1.12x vs 0.93x siblings)
        const targetFocus = g.id === engagedId && this.state.povMode === 'space' ? 1 : 0;
        g.focusMix += (targetFocus - g.focusMix) * (reduced ? 1 : Math.min(1, dt * 8.5));
        g.gearObj.group.position.copy(g.basePos).addScaledVector(g.baseFwd, g.focusMix * 0.36);
        g.gearObj.group.scale.setScalar(0.93 + g.focusMix * 0.19);

        g.gearObj.rotor.rotation.z = g.angle;
        if (g.labelFn) {
          const centerStep = Math.round(g.angle / g.stepAngle);
          g.gearObj.updateLabels(centerStep, g.targetStep, g.labelFn);
        }

        // True tooth-ratio drivetrain coupling ONLY on the engaged clutch shaft + central sun/escapement
        if (g.id === engagedId) {
          const dGear = g.angle - g.prevAngle;
          g.prevAngle = g.angle;
          const activeCl = this.clusterObjects[g.cluster];
          if (activeCl && Math.abs(dGear) > 1e-6) {
            const shaftObj = activeCl.shafts[g.id];
            if (shaftObj) {
              // Outer gear crown teeth ratio against 12-tooth bevel pinion
              shaftObj.shaftAngle -= (g.teeth / 12) * dGear;
              shaftObj.shaftSpin.rotation.z = shaftObj.shaftAngle;
            }
            // Central Sun hub (Z_SUN = 18) and orthogonal escapement (Z_ESC = 14)
            const dSun = (g.teeth / 18) * dGear;
            activeCl.sunAngle += dSun;
            activeCl.escAngle -= (18 / 14) * dSun;
            activeCl.sunRotor.rotation.z = activeCl.sunAngle;
            activeCl.escRotor.rotation.z = activeCl.escAngle;

            // Synchronized gyroscope core bevels & side coupling gears
            if (this.portraitTurret && this.portraitTurret.root.visible) {
              this.portraitTurret.spinCouplers(dGear);
            }
          }
        } else {
          g.prevAngle = g.angle;
        }
      }

      const camLerp = reduced ? 1 : Math.min(1, dt * (this._camLerpRate || 6.5));
      if (this.state.povMode === 'earth') {
        if (this.state.earthStep !== 'telescope') {
          // 1. Update Space scene + Winding Key so Monitor Feed stays 100% live
          this.cosmos.setPovMode(false, true);
          this._setClusterLayout();
          this.clustersRoot.visible = true;
          this.clustersRoot.position.copy(DESKTOP_ROOT_POS);
          this.clustersRoot.rotation.set(0, this.state.turretAngle, 0);
          this.clustersRoot.scale.setScalar(0.68);
          this.clustersRoot.updateMatrixWorld(true);
          this.warmFillLight.position.set(0, -1.2, 7.0);
          if (this.gearFocusLight) this.gearFocusLight.intensity = 3.6;

          const socketPose = this._getSocketWorldPose(this.state.engagedCluster);
          if (reduced) {
            this.state.keyPos.copy(socketPose.pos);
            this.state.keyQuat.copy(socketPose.quat);
          } else {
            const kLerp = Math.min(1, dt * 8.5);
            this.state.keyPos.lerp(socketPose.pos, kLerp);
            this.state.keyQuat.slerp(socketPose.quat, kLerp);
          }
          this.keyRig.root.visible = true;
          this.keyRig.root.position.copy(this.state.keyPos);
          this.keyRig.root.quaternion.copy(this.state.keyQuat);
          this.keyRig.root.scale.setScalar(0.68);
          this.keyRig.root.updateMatrixWorld(true);

          // Render real Outer Space scene into desk monitor WebGLRenderTarget
          this.renderer.setRenderTarget(this.monitorRT);
          this.renderer.clear();
          this.renderer.render(this.scene, this.monitorCamera);
          this.renderer.setRenderTarget(null);

          // 2. Update Observatory Room sky/weather/lights & render room camera to screen
          if (this.celestialState) {
            this.room.update(this.celestialState, this.weatherState, dt, reduced);
          }
          this._updateRoomCamera(camLerp);
          this.renderer.render(this.room.scene, this.roomCamera);
        } else {
          // Step 2: Looking purely through the Room's Telescope (zero floating gears or studio fill lights)
          this.clustersRoot.visible = false;
          this.keyRig.root.visible = false;
          if (this.gearFocusLight) this.gearFocusLight.intensity = 0;
          this.warmFillLight.intensity = 0;
          this.coolRimLight.intensity = 0;
          this.hemiLight.intensity = 0.06;

          if (this.pov.targetBody) {
            const h = this.cosmos.getPovBodyHorizon(this.pov.targetBody);
            if (h && h.altDeg >= HORIZON_VISIBLE_ALT_DEG) {
              this.pov.targetAzDeg = h.azDeg;
              this.pov.targetElevDeg = THREE.MathUtils.clamp(h.altDeg, HORIZON_VISIBLE_ALT_DEG, 88.5);
            } else {
              this.pov.targetBody = null;
              this.onTelescopeTargetChange(null);
            }
          }

          const scopeLerp = reduced ? 1 : Math.min(1, dt * 8.0);
          const azDiff = normalizeAngle((this.pov.targetAzDeg - this.pov.azDeg) * DEG_TO_RAD) * (180 / Math.PI);
          this.pov.azDeg = (this.pov.azDeg + azDiff * scopeLerp + 360) % 360;
          this.pov.elevDeg += (this.pov.targetElevDeg - this.pov.elevDeg) * scopeLerp;
          this.pov.fov += (this.pov.targetFov - this.pov.fov) * camLerp;
          this._applyCameraFov();

          const azR = this.pov.azDeg * DEG_TO_RAD;
          const elR = this.pov.elevDeg * DEG_TO_RAD;
          const lx = Math.cos(elR) * Math.sin(azR);
          const ly = Math.sin(elR);
          const lz = -Math.cos(elR) * Math.cos(azR);
          this.camera.position.set(0, 0.35, 0);
          this.camera.lookAt(lx * 10, 0.35 + ly * 10, lz * 10);
          this.camera.updateMatrixWorld(true);

          // Automatic ND5 optical solar filter when magnifying onto the daytime Sun
          const sunH = this.cosmos.getPovBodyHorizon('sun');
          const curMag = fovToTelescopeMag(this.pov.fov);
          let targetSolarFilter = 0;
          if (sunH && sunH.altDeg >= -1.5 && curMag > 2.2) {
            const dotSun = THREE.MathUtils.clamp(
              lx * sunH.vec[0] + ly * sunH.vec[1] + lz * sunH.vec[2],
              -1,
              1
            );
            const sunAngDeg = Math.acos(dotSun) * (180 / Math.PI);
            const angGate = 1 - smoothstep(3.8, Math.max(9.5, this.pov.fov * 0.85), sunAngDeg);
            targetSolarFilter = smoothstep(2.2, 5.2, curMag) * angGate;
          }
          this.pov.solarFilterMix += (targetSolarFilter - this.pov.solarFilterMix) * (reduced ? 1 : Math.min(1, dt * 7.5));
          this.cosmos.setTelescopeOptics({ active: true, solarFilterMix: this.pov.solarFilterMix });

          this.onTelescopeTelemetry({
            azDeg: this.pov.azDeg,
            elevDeg: this.pov.elevDeg,
            fovDeg: this.pov.fov,
            zoomLabel: this.getZoomLabel(),
            targetBody: this.pov.targetBody,
            solarFilterActive: this.pov.solarFilterMix > 0.35
          });

          this.renderer.render(this.scene, this.camera);
        }
      } else {
        this._applyCameraFov();
        const portrait = this._isPortrait();
        const rootPos = portrait ? PORTRAIT_ROOT_POS : DESKTOP_ROOT_POS;
        const rootScale = portrait ? 0.80 : 0.69;
        const keyScale = portrait ? 0.76 : 0.68;

        if (!this.state.isDraggingTurret) {
          if (reduced) {
            this.state.turretAngle = this.state.turretTargetAngle;
            this.state.turretVel = 0;
            this.state.turretCoasting = false;
          } else if (this.state.turretCoasting) {
            this.state.turretVel *= Math.exp(-4.2 * dt);
            this.state.turretAngle += this.state.turretVel * dt;
            if (Math.abs(this.state.turretVel) < 0.45) {
              this.state.turretCoasting = false;
              this.state.turretVel = 0;
              this.snapTurretToNearestFace();
            }
          } else {
            const tr = this._integrateSpring(
              this.state.turretAngle,
              this.state.turretVel,
              this.state.turretTargetAngle,
              115,
              18,
              dt
            );
            this.state.turretAngle = tr.pos;
            this.state.turretVel = tr.vel;
          }
        }

        if (this.portraitTurret) {
          if (this.state.hasRotatedTurret && this.state.turretHintFade > 0) {
            this.state.turretHintFade = Math.max(0, this.state.turretHintFade - dt * 1.8);
            this.portraitTurret.setHintOpacity(this.state.turretHintFade);
          } else if (!this.state.hasRotatedTurret && !reduced) {
            this.portraitTurret.hintGroup.rotation.y = Math.sin(now * 0.0024) * 0.14;
          }
        }

        this.clustersRoot.visible = true;
        this.clustersRoot.position.copy(rootPos);
        this.clustersRoot.rotation.set(0, this.state.turretAngle, 0);
        this.clustersRoot.scale.setScalar(rootScale);
        this._setClusterLayout();
        this.clustersRoot.updateMatrixWorld(true);
        this.warmFillLight.position.set(0, -1.2, 7.0);

        const facing = Math.cos(this.state.turretAngle) >= 0 ? 'date' : 'time';
        if (facing !== this.state.lastFacingCluster) {
          this.state.lastFacingCluster = facing;
          if (facing !== this.state.engagedCluster) {
            this.onTurretFaceChange(facing);
          }
        }

        const deg = ((Math.round((this.state.turretAngle * 180) / Math.PI) % 360) + 360) % 360;
        if (deg !== this.state.lastReportedTurretDeg) {
          this.state.lastReportedTurretDeg = deg;
          this.onTurretAngleChange(deg);
        }

        // Synchronized Camera Focus & Spotlight tracking active gear
        const activeState = this.gearStates[engagedId];
        const baseTarget = portrait ? SPACE_CAM_TARGET_PORTRAIT : SPACE_CAM_HOME.target;
        if (activeState && activeState.gearObj) {
          const engagedWorldPos = new THREE.Vector3();
          const engagedWorldQuat = new THREE.Quaternion();
          activeState.gearObj.group.getWorldPosition(engagedWorldPos);
          activeState.gearObj.group.getWorldQuaternion(engagedWorldQuat);
          const engagedWorldFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(engagedWorldQuat);

          if (this.gearFocusLight) {
            this.gearFocusLight.intensity = 3.6;
            this.gearFocusLight.position.copy(engagedWorldPos).addScaledVector(engagedWorldFwd, 1.9);
          }

          const focusOffX = THREE.MathUtils.clamp((engagedWorldPos.x - rootPos.x) * 0.32, -0.70, 0.70);
          const focusOffY = THREE.MathUtils.clamp((engagedWorldPos.y - rootPos.y) * 0.16, -0.40, 0.40);
          this.cam.targetLook.set(baseTarget.x + focusOffX, baseTarget.y + focusOffY, baseTarget.z);
        } else {
          if (this.gearFocusLight) this.gearFocusLight.intensity = 3.6;
          this.cam.targetLook.copy(baseTarget);
        }

        this.cam.theta += (this.cam.targetTheta - this.cam.theta) * camLerp;
        this.cam.phi += (this.cam.targetPhi - this.cam.phi) * camLerp;
        this.cam.radius += (this.cam.targetRadius - this.cam.radius) * camLerp;
        this.cam.target.lerp(this.cam.targetLook, camLerp);

        const sinPhi = Math.sin(this.cam.phi);
        this.camera.position.set(
          this.cam.target.x + this.cam.radius * sinPhi * Math.sin(this.cam.theta),
          this.cam.target.y + this.cam.radius * Math.cos(this.cam.phi),
          this.cam.target.z + this.cam.radius * sinPhi * Math.cos(this.cam.theta)
        );
        this.camera.lookAt(this.cam.target);
        this.camera.updateMatrixWorld(true);

        const socketPose = this._getSocketWorldPose(this.state.engagedCluster);
        if (reduced) {
          this.state.keyPos.copy(socketPose.pos);
          this.state.keyQuat.copy(socketPose.quat);
        } else {
          const kLerp = Math.min(1, dt * 10.5);
          this.state.keyPos.lerp(socketPose.pos, kLerp);
          this.state.keyQuat.slerp(socketPose.quat, kLerp);
        }
        this.keyRig.root.visible = true;
        this.keyRig.root.position.copy(this.state.keyPos);
        this.keyRig.root.quaternion.copy(this.state.keyQuat);
        this.keyRig.root.scale.setScalar(keyScale);
        this.keyRig.root.updateMatrixWorld(true);

        this.renderer.render(this.scene, this.camera);
      }
    };

    this._rafId = window.requestAnimationFrame(tick);
  }
}

function normalizeAngle(rad) {
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}
