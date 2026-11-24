/**
 * Procedural 3D horology geometry, brushed natural gold & steel PBR materials,
 * enlarged legible golden spur/bevel gears, sculpted Golden Winding Key,
 * and 3D Brass Handheld Remote Controller for Earth POV.
 */
import * as THREE from '../vendor/three.module.min.js';

export const GOLD_HEX = 0xdcb056;
export const GOLD_BRIGHT_HEX = 0xf7e1a0;
export const AMBER_HEX = 0xd99b43;
export const RUBY_HEX = 0xa81b34;

export function createStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x07080d);

  const addPanel = (color, intensity, pos, rot, size) => {
    const geo = new THREE.PlaneGeometry(size[0], size[1]);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    envScene.add(mesh);
    return { geo, mat };
  };

  const panels = [
    addPanel(0xfff4df, 3.1, [-8, 9, 8], [0.6, 0.7, 0], [11, 7]),
    addPanel(0xc8dcf5, 2.0, [9, 6, 7], [0.4, -0.9, 0], [9, 8]),
    addPanel(0xe5b865, 1.9, [7, -6, 6], [-0.5, -0.7, 0], [8, 6]),
    addPanel(0x7c8ca3, 1.4, [0, 12, 0], [Math.PI / 2, 0, 0], [16, 16]),
    addPanel(0x2d2922, 1.1, [0, -3, -11], [0, 0, 0], [14, 10])
  ];

  const envRT = pmrem.fromScene(envScene, 0.04);
  for (const p of panels) {
    p.geo.dispose();
    p.mat.dispose();
  }
  pmrem.dispose();
  return envRT.texture;
}

export function createBrushedMetalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#929292';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 650; i++) {
    const y = Math.random() * 512;
    const shade = 115 + Math.floor(Math.random() * 65);
    ctx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.18)`;
    ctx.lineWidth = 0.7 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export function createMaterialLibrary(metalTex) {
  return {
    goldGear: new THREE.MeshStandardMaterial({
      color: GOLD_HEX,
      metalness: 0.90,
      roughness: 0.26,
      roughnessMap: metalTex
    }),
    antiqueGold: new THREE.MeshStandardMaterial({
      color: 0xb38a3c,
      metalness: 0.86,
      roughness: 0.34,
      roughnessMap: metalTex
    }),
    polishedGold: new THREE.MeshStandardMaterial({
      color: GOLD_BRIGHT_HEX,
      metalness: 0.94,
      roughness: 0.16,
      roughnessMap: metalTex
    }),
    machinedSteel: new THREE.MeshStandardMaterial({
      color: 0x959fa9,
      metalness: 0.92,
      roughness: 0.22,
      roughnessMap: metalTex
    }),
    darkBronze: new THREE.MeshStandardMaterial({
      color: 0x262018,
      metalness: 0.78,
      roughness: 0.44,
      roughnessMap: metalTex
    }),
    ebonySlate: new THREE.MeshStandardMaterial({
      color: 0x16181f,
      metalness: 0.45,
      roughness: 0.52,
      roughnessMap: metalTex
    }),
    rubyJewel: new THREE.MeshPhysicalMaterial({
      color: RUBY_HEX,
      emissive: 0x3b0510,
      emissiveIntensity: 0.35,
      metalness: 0.12,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    })
  };
}

export function buildSpurGearShape(teeth, moduleSize, boreR, spokeSpec = null) {
  const rp = (teeth * moduleSize) / 2;
  const ra = rp + 0.82 * moduleSize;
  const rf = rp - 1.05 * moduleSize;
  const step = (2 * Math.PI) / teeth;

  const halfRoot = 0.305 * step;
  const halfPitch = 0.22 * step;
  const halfTip = 0.132 * step;

  const shape = new THREE.Shape();

  for (let i = 0; i < teeth; i++) {
    const c = i * step;
    const aR1 = c - halfRoot;
    const aP1 = c - halfPitch;
    const aT1 = c - halfTip;
    const aT2 = c + halfTip;
    const aP2 = c + halfPitch;
    const aR2 = c + halfRoot;

    const rx1 = rf * Math.cos(aR1);
    const ry1 = rf * Math.sin(aR1);

    if (i === 0) {
      shape.moveTo(rx1, ry1);
    } else {
      const prevEnd = (i - 1) * step + halfRoot;
      shape.absarc(0, 0, rf, prevEnd, aR1, false);
    }

    shape.lineTo(rp * Math.cos(aP1), rp * Math.sin(aP1));
    shape.lineTo(ra * Math.cos(aT1), ra * Math.sin(aT1));
    shape.absarc(0, 0, ra, aT1, aT2, false);
    shape.lineTo(rp * Math.cos(aP2), rp * Math.sin(aP2));
    shape.lineTo(rf * Math.cos(aR2), rf * Math.sin(aR2));
  }

  const lastEnd = (teeth - 1) * step + halfRoot;
  shape.absarc(0, 0, rf, lastEnd, 2 * Math.PI - halfRoot, false);
  shape.closePath();

  if (boreR > 0.02) {
    const bore = new THREE.Path();
    bore.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(bore);
  }

  if (spokeSpec && spokeSpec.outerR > spokeSpec.innerR + 0.08) {
    const { count, innerR, outerR } = spokeSpec;
    const sector = (2 * Math.PI) / count;
    const padOuter = Math.min(0.22, 0.22 * sector);
    const padInner = Math.min(0.32, 0.30 * sector);

    for (let s = 0; s < count; s++) {
      const a0 = s * sector + padInner;
      const a1 = (s + 1) * sector - padInner;
      const b0 = s * sector + padOuter;
      const b1 = (s + 1) * sector - padOuter;
      if (a1 <= a0 + 0.06 || b1 <= b0 + 0.06) continue;

      const hole = new THREE.Path();
      hole.moveTo(innerR * Math.cos(a0), innerR * Math.sin(a0));
      hole.lineTo(outerR * Math.cos(b0), outerR * Math.sin(b0));
      hole.absarc(0, 0, outerR, b0, b1, false);
      hole.lineTo(innerR * Math.cos(a1), innerR * Math.sin(a1));
      hole.absarc(0, 0, innerR, a1, a0, true);
      shape.holes.push(hole);
    }
  }

  return { shape, rp, ra, rf };
}

/**
 * Natural brushed gold 3D spur gear with enlarged wide ebony dial ring,
 * high-contrast bold numerals (68-86px), and large hub value medallion.
 */
export function createSpurGear(config, mats) {
  const {
    id,
    label,
    teeth,
    moduleSize = 0.104,
    thickness = 0.30,
    slots = 12,
    spokeCount = 5
  } = config;

  const rp = (teeth * moduleSize) / 2;
  const rf = rp - 1.05 * moduleSize;
  const dialOuterR = rf - 0.03;
  // Wider radial dial ring so large numerals fit cleanly with generous padding
  const dialInnerR = Math.max(0.30, dialOuterR * 0.44);
  const hubR = dialInnerR - 0.025;

  const spokeSpec = {
    count: spokeCount,
    innerR: Math.max(0.16, hubR * 0.42),
    outerR: Math.max(0.22, dialInnerR * 0.88)
  };

  const { shape, ra } = buildSpurGearShape(teeth, moduleSize, 0.10, spokeSpec);

  const gearGeo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.026,
    bevelSize: 0.020,
    bevelSegments: 2,
    curveSegments: 8
  });
  gearGeo.translate(0, 0, -thickness / 2);

  const bodyMat = mats.goldGear.clone();
  const rimMat = mats.antiqueGold.clone();

  const group = new THREE.Group();
  group.name = `gear-group-${id}`;

  const rotor = new THREE.Group();
  rotor.name = `gear-rotor-${id}`;
  group.add(rotor);

  const bodyMesh = new THREE.Mesh(gearGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.userData = { interactiveType: 'gear', gearId: id };
  rotor.add(bodyMesh);

  const frontZ = thickness / 2 + 0.030;
  const accentRing = new THREE.Mesh(
    new THREE.TorusGeometry(dialOuterR, 0.022, 12, 64),
    rimMat
  );
  accentRing.position.z = frontZ + 0.004;
  rotor.add(accentRing);

  const rearRing = new THREE.Mesh(
    new THREE.TorusGeometry(dialOuterR, 0.018, 10, 56),
    mats.antiqueGold
  );
  rearRing.position.z = -frontZ;
  rotor.add(rearRing);

  const dialCanvas = document.createElement('canvas');
  dialCanvas.width = 1024;
  dialCanvas.height = 1024;
  const dialCtx = dialCanvas.getContext('2d');
  const dialTex = new THREE.CanvasTexture(dialCanvas);
  dialTex.anisotropy = 8;
  dialTex.colorSpace = THREE.SRGBColorSpace;

  const dialGeo = new THREE.RingGeometry(dialInnerR, dialOuterR, 64, 1);
  const posAttr = dialGeo.attributes.position;
  const uvAttr = dialGeo.attributes.uv;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    uvAttr.setXY(i, vx / (2 * dialOuterR) + 0.5, vy / (2 * dialOuterR) + 0.5);
  }
  uvAttr.needsUpdate = true;

  const dialMat = new THREE.MeshStandardMaterial({
    map: dialTex,
    emissiveMap: dialTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.62,
    metalness: 0.35,
    roughness: 0.36
  });
  const dialMesh = new THREE.Mesh(dialGeo, dialMat);
  dialMesh.position.z = frontZ;
  dialMesh.userData = { interactiveType: 'gear', gearId: id };
  rotor.add(dialMesh);

  const hubCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR * 0.44, hubR * 0.50, thickness + 0.12, 28),
    mats.machinedSteel
  );
  hubCyl.rotation.x = Math.PI / 2;
  hubCyl.castShadow = true;
  hubCyl.userData = { interactiveType: 'gear', gearId: id };
  rotor.add(hubCyl);

  const jewelCap = new THREE.Mesh(
    new THREE.SphereGeometry(hubR * 0.22, 20, 16),
    mats.rubyJewel
  );
  jewelCap.scale.set(1, 1, 0.48);
  jewelCap.position.z = thickness / 2 + 0.07;
  rotor.add(jewelCap);

  const hitDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(ra + 0.08, ra + 0.08, thickness + 0.12, 24),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitDisc.rotation.x = Math.PI / 2;
  hitDisc.userData = { interactiveType: 'gear', gearId: id };
  group.add(hitDisc);

  const pointer = createReadingPointer(mats);
  pointer.position.set(0, dialOuterR + 0.045, frontZ + 0.055);
  group.add(pointer);

  // Larger, bolder central medallion plaque showing Label + Current Active Value
  const hubPlateCanvas = document.createElement('canvas');
  hubPlateCanvas.width = 320;
  hubPlateCanvas.height = 176;
  const hubPlateCtx = hubPlateCanvas.getContext('2d');
  const hubPlateTex = new THREE.CanvasTexture(hubPlateCanvas);
  hubPlateTex.colorSpace = THREE.SRGBColorSpace;
  const hubPlateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(hubR * 1.18, hubR * 0.65),
    new THREE.MeshBasicMaterial({ map: hubPlateTex, transparent: true })
  );
  hubPlateMesh.position.set(0, -hubR * 0.48, frontZ + 0.038);
  group.add(hubPlateMesh);

  let lastDrawSig = '';
  let engagedState = false;
  let lockedState = false;
  let currentActiveText = '';

  function drawHubTag() {
    hubPlateCtx.clearRect(0, 0, 320, 176);
    hubPlateCtx.fillStyle = 'rgba(18, 15, 11, 0.94)';
    roundRect(hubPlateCtx, 10, 10, 300, 156, 26);
    hubPlateCtx.fill();
    hubPlateCtx.lineWidth = 6;
    hubPlateCtx.strokeStyle = lockedState
      ? '#b87e35'
      : engagedState
        ? '#f7e1a0'
        : '#8b7242';
    hubPlateCtx.stroke();

    hubPlateCtx.fillStyle = lockedState
      ? '#e6b86a'
      : engagedState
        ? '#f7e1a0'
        : '#bfb299';
    hubPlateCtx.font = '700 34px "JetBrains Mono", monospace';
    hubPlateCtx.textAlign = 'center';
    hubPlateCtx.textBaseline = 'middle';
    hubPlateCtx.fillText(lockedState ? '24H SYNC' : label, 160, 52);

    hubPlateCtx.fillStyle = '#fff9ec';
    hubPlateCtx.font = '700 58px "JetBrains Mono", monospace';
    hubPlateCtx.fillText(currentActiveText || '', 160, 116);
    hubPlateTex.needsUpdate = true;
  }

  drawHubTag();

  function updateLabels(centerStep, activeTargetStep, getSlotInfo) {
    const activeInfo = getSlotInfo(activeTargetStep, ((activeTargetStep % slots) + slots) % slots);
    currentActiveText = activeInfo ? activeInfo.text.replace(/[☀☾]/g, '').trim() : '';

    const sig = `${centerStep}|${activeTargetStep}|${engagedState}|${lockedState}|${currentActiveText}|${getSlotInfo.sig || ''}`;
    if (sig === lastDrawSig) return;
    lastDrawSig = sig;

    drawHubTag();

    const w = 1024;
    const cx = 512;
    const cy = 512;
    const innerFrac = dialInnerR / dialOuterR;
    const rOuterPx = 508;
    const rInnerPx = Math.round(rOuterPx * innerFrac);
    const rTextPx = Math.round((rOuterPx + rInnerPx) * 0.50);
    const stepAngle = (2 * Math.PI) / slots;

    dialCtx.clearRect(0, 0, w, w);

    const grad = dialCtx.createRadialGradient(cx, cy, rInnerPx, cx, cy, rOuterPx);
    grad.addColorStop(0, '#12100d');
    grad.addColorStop(0.5, '#1b1712');
    grad.addColorStop(1, '#100e0b');
    dialCtx.fillStyle = grad;
    dialCtx.beginPath();
    dialCtx.arc(cx, cy, rOuterPx, 0, Math.PI * 2);
    dialCtx.fill();

    dialCtx.strokeStyle = engagedState ? 'rgba(247, 225, 160, 0.78)' : 'rgba(155, 130, 82, 0.48)';
    dialCtx.lineWidth = 5;
    dialCtx.beginPath();
    dialCtx.arc(cx, cy, rInnerPx + 6, 0, Math.PI * 2);
    dialCtx.stroke();

    const startOff = -(Math.floor(slots / 2) - 1);
    const endOff = Math.ceil(slots / 2);

    for (let off = startOff; off <= endOff; off++) {
      const stepVal = centerStep + off;
      const slotIdx = ((stepVal % slots) + slots) % slots;
      const info = getSlotInfo(stepVal, slotIdx);
      const isActive = stepVal === activeTargetStep && !info.outOfRange;

      dialCtx.save();
      dialCtx.translate(cx, cy);
      dialCtx.rotate(slotIdx * stepAngle);

      dialCtx.strokeStyle = isActive
        ? '#f7e1a0'
        : info.outOfRange
          ? 'rgba(140, 130, 110, 0.24)'
          : '#9e885d';
      dialCtx.lineWidth = isActive ? 8 : 5;
      dialCtx.beginPath();
      dialCtx.moveTo(0, -rOuterPx + 5);
      dialCtx.lineTo(0, -rOuterPx + (isActive ? 28 : 18));
      dialCtx.stroke();

      if (isActive) {
        dialCtx.fillStyle = info.accent === 'amber'
          ? 'rgba(205, 140, 52, 0.34)'
          : 'rgba(226, 188, 107, 0.32)';
        dialCtx.strokeStyle = '#f7e1a0';
        dialCtx.lineWidth = 6;
        const boxW = slots === 2 ? 240 : info.text.length >= 4 ? 190 : 148;
        const boxH = 112;
        roundRect(dialCtx, -boxW / 2, -rTextPx - boxH / 2, boxW, boxH, 18);
        dialCtx.fill();
        dialCtx.stroke();
      }

      dialCtx.fillStyle = isActive
        ? '#fffaf0'
        : info.outOfRange
          ? 'rgba(150, 140, 120, 0.34)'
          : '#f0e7d5';
      const fontSize = slots === 2
        ? 86
        : info.text.length >= 4
          ? 66
          : info.text.length === 3
            ? 74
            : 82;
      dialCtx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
      dialCtx.textAlign = 'center';
      dialCtx.textBaseline = 'middle';
      dialCtx.fillText(info.text, 0, -rTextPx);

      dialCtx.restore();
    }

    dialTex.needsUpdate = true;
  }

  function setEngaged(engaged) {
    if (engagedState === engaged) return;
    engagedState = engaged;
    bodyMat.color.setHex(engaged ? 0xebbf64 : 0xc79c45);
    bodyMat.roughness = engaged ? 0.21 : 0.32;
    rimMat.color.setHex(engaged ? GOLD_BRIGHT_HEX : 0x9c7b38);
    lastDrawSig = '';
  }

  function setLocked(locked) {
    if (lockedState === locked) return;
    lockedState = locked;
    rimMat.color.setHex(locked ? 0x9e7135 : engagedState ? GOLD_BRIGHT_HEX : 0x9c7b38);
    lastDrawSig = '';
  }

  return {
    id,
    group,
    rotor,
    rp,
    ra,
    rf,
    thickness,
    hitMeshes: [bodyMesh, dialMesh, hubCyl, hitDisc],
    updateLabels,
    setEngaged,
    setLocked
  };
}

function createReadingPointer(mats) {
  const g = new THREE.Group();

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.13, 0.14),
    mats.darkBronze
  );
  housing.position.set(0, 0.09, 0);
  g.add(housing);

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.085, 0.22, 4),
    mats.polishedGold
  );
  cone.rotation.z = Math.PI;
  cone.rotation.y = Math.PI / 4;
  cone.position.set(0, -0.02, 0);
  g.add(cone);

  return g;
}

export function createBevelGear(config, mats) {
  const {
    teeth = 16,
    outerR = 0.52,
    innerR = 0.26,
    height = 0.24,
    toothHeight = 0.07,
    isGold = true
  } = config;

  const group = new THREE.Group();
  const baseMat = isGold ? mats.goldGear : mats.machinedSteel;

  const coneGeo = new THREE.CylinderGeometry(innerR, outerR, height, teeth * 2, 1);
  coneGeo.rotateX(Math.PI / 2);
  const coneMesh = new THREE.Mesh(coneGeo, baseMat);
  coneMesh.castShadow = true;
  coneMesh.receiveShadow = true;
  group.add(coneMesh);

  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(outerR * 1.02, outerR * 1.02, 0.06, 32),
    mats.antiqueGold
  );
  flange.rotation.x = Math.PI / 2;
  flange.position.z = -height / 2 - 0.02;
  group.add(flange);

  const midR = (outerR + innerR) * 0.5;
  const slopeAngle = Math.atan2(outerR - innerR, height);
  const slantLen = Math.hypot(outerR - innerR, height) * 0.92;
  const pitchArc = (2 * Math.PI * midR) / teeth;

  const toothGeo = new THREE.BoxGeometry(slantLen, pitchArc * 0.44, toothHeight);

  for (let i = 0; i < teeth; i++) {
    const theta = (i * 2 * Math.PI) / teeth;
    const pivot = new THREE.Group();
    pivot.rotation.z = theta;

    const tooth = new THREE.Mesh(toothGeo, baseMat);
    tooth.position.set(midR, 0, 0.01);
    tooth.rotation.y = Math.PI / 2 - slopeAngle;
    tooth.castShadow = true;
    pivot.add(tooth);
    group.add(pivot);
  }

  return group;
}

export function createWindingKeyRig(mats) {
  const root = new THREE.Group();
  root.name = 'winding-key-rig';

  const slideGroup = new THREE.Group();
  root.add(slideGroup);

  const rotor = new THREE.Group();
  slideGroup.add(rotor);

  const pinion = createBevelGear({
    teeth: 14,
    outerR: 0.34,
    innerR: 0.18,
    height: 0.20,
    toothHeight: 0.06,
    isGold: true
  }, mats);
  pinion.position.z = -0.68;
  pinion.rotation.y = Math.PI;
  rotor.add(pinion);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 1.62, 24),
    mats.machinedSteel
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.08;
  shaft.castShadow = true;
  rotor.add(shaft);

  const torqueRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.145, 0.025, 12, 32),
    mats.polishedGold
  );
  torqueRing.position.z = 0.48;
  rotor.add(torqueRing);

  const bowShape = new THREE.Shape();
  bowShape.moveTo(-0.70, -0.24);
  bowShape.bezierCurveTo(-0.88, -0.24, -0.92, 0.24, -0.70, 0.24);
  bowShape.bezierCurveTo(-0.44, 0.24, -0.26, 0.40, 0, 0.40);
  bowShape.bezierCurveTo(0.26, 0.40, 0.44, 0.24, 0.70, 0.24);
  bowShape.bezierCurveTo(0.92, 0.24, 0.88, -0.24, 0.70, -0.24);
  bowShape.bezierCurveTo(0.44, -0.24, 0.26, -0.40, 0, -0.40);
  bowShape.bezierCurveTo(-0.26, -0.40, -0.44, -0.24, -0.70, -0.24);
  bowShape.closePath();

  const addWingCutout = (sign) => {
    const hole = new THREE.Path();
    hole.moveTo(sign * 0.22, -0.13);
    hole.bezierCurveTo(sign * 0.44, -0.15, sign * 0.68, -0.12, sign * 0.68, 0);
    hole.bezierCurveTo(sign * 0.68, 0.12, sign * 0.44, 0.15, sign * 0.22, 0.13);
    hole.bezierCurveTo(sign * 0.17, 0.07, sign * 0.17, -0.07, sign * 0.22, -0.13);
    bowShape.holes.push(hole);
  };
  addWingCutout(-1);
  addWingCutout(1);

  const bowGeo = new THREE.ExtrudeGeometry(bowShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.030,
    bevelSize: 0.022,
    bevelSegments: 2,
    curveSegments: 16
  });
  bowGeo.translate(0, 0, -0.08);

  const bowMat = mats.goldGear.clone();
  const bowMesh = new THREE.Mesh(bowGeo, bowMat);
  bowMesh.position.z = 0.96;
  bowMesh.castShadow = true;
  bowMesh.receiveShadow = true;
  rotor.add(bowMesh);

  const bowRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.02, 10, 28),
    mats.polishedGold
  );
  bowRim.position.set(0, 0, 1.07);
  rotor.add(bowRim);

  for (const sign of [-1, 1]) {
    const wingBar = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.017, 0.24, 6, 12),
      mats.polishedGold
    );
    wingBar.rotation.z = Math.PI / 2;
    wingBar.position.set(sign * 0.47, 0, 1.07);
    rotor.add(wingBar);
  }

  const bowJewel = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 20, 16),
    mats.rubyJewel
  );
  bowJewel.scale.set(1, 1, 0.55);
  bowJewel.position.set(0, 0, 1.07);
  rotor.add(bowJewel);

  const hintGroup = new THREE.Group();
  hintGroup.position.z = 0.96;
  const hintMat = new THREE.MeshBasicMaterial({
    color: GOLD_BRIGHT_HEX,
    transparent: true,
    opacity: 0.50
  });
  for (const baseAng of [0, Math.PI]) {
    const arcGeo = new THREE.TorusGeometry(0.98, 0.016, 8, 28, Math.PI * 0.56);
    const arc = new THREE.Mesh(arcGeo, hintMat);
    arc.rotation.z = baseAng + 0.35;
    hintGroup.add(arc);

    const tipAngle = baseAng + 0.35 + Math.PI * 0.56;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 12), hintMat);
    cone.position.set(0.98 * Math.cos(tipAngle), 0.98 * Math.sin(tipAngle), 0);
    cone.rotation.z = tipAngle;
    hintGroup.add(cone);
  }
  slideGroup.add(hintGroup);

  const hitProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(1.06, 0.80, 1.38, 20),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitProxy.rotation.x = Math.PI / 2;
  hitProxy.position.z = 0.78;
  slideGroup.add(hitProxy);

  const hitMeshes = [bowMesh, shaft, torqueRing, bowJewel, hitProxy];
  for (const m of hitMeshes) {
    m.userData = { interactiveType: 'key' };
  }

  return {
    root,
    slideGroup,
    rotor,
    hintGroup,
    hintMat,
    bowMat,
    hitMeshes,
    setHovered(hovered) {
      bowMat.color.setHex(hovered ? GOLD_BRIGHT_HEX : GOLD_HEX);
      bowMat.roughness = hovered ? 0.18 : 0.26;
    },
    setDragging(dragging) {
      bowMat.color.setHex(dragging ? 0xffe8a6 : GOLD_HEX);
      bowMat.roughness = dragging ? 0.15 : 0.26;
    },
    setHintOpacity(val) {
      hintMat.opacity = val;
      hintGroup.visible = val > 0.02;
    }
  };
}

/**
 * Sculpted 3D Horological Field-Telemetry Handheld Controller for Earth POV:
 * anodized gunmetal unibody with elastomer grip ribs, brushed brass faceplate
 * with hex screws, 3-stage telescopic antenna + live amber TX LED, sapphire-glass
 * live OLED telemetry display, 6 cylindrical recessed switches with status LEDs,
 * and a 36-flute knurled solid brass rotary encoder wheel with thumb dimple.
 */
export function createRemoteControllerRig(mats) {
  const root = new THREE.Group();
  root.name = 'earth-remote-rig';

  const metalTex = mats.goldGear.roughnessMap || null;

  const gunmetalMat = new THREE.MeshStandardMaterial({
    color: 0x1e2128,
    metalness: 0.74,
    roughness: 0.34,
    roughnessMap: metalTex
  });
  const elastomerMat = new THREE.MeshStandardMaterial({
    color: 0x101216,
    metalness: 0.06,
    roughness: 0.88
  });
  const knurlBrassMat = mats.goldGear.clone();
  const bezelBrassMat = mats.antiqueGold.clone();

  const makeRoundedRect = (w, h, r) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  };

  // Chamfered anodized gunmetal unibody
  const bw = 1.50;
  const bh = 2.48;
  const br = 0.20;
  const bodyShape = makeRoundedRect(bw, bh, br);

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 0.20,
    bevelEnabled: true,
    bevelThickness: 0.042,
    bevelSize: 0.036,
    bevelSegments: 4,
    curveSegments: 20
  });
  bodyGeo.translate(0, 0, -0.10);

  const bodyMesh = new THREE.Mesh(bodyGeo, gunmetalMat);
  bodyMesh.userData = { interactiveType: 'remoteBody' };
  root.add(bodyMesh);

  // Recessed warm dark faceplate panel + brushed-brass outer chamfer rim
  const deckShape = makeRoundedRect(bw - 0.14, bh - 0.14, br - 0.05);
  const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 16
  });
  const deckMesh = new THREE.Mesh(deckGeo, mats.ebonySlate);
  deckMesh.position.z = 0.125;
  deckMesh.userData = { interactiveType: 'remoteBody' };
  root.add(deckMesh);

  const rimShape = makeRoundedRect(bw - 0.04, bh - 0.04, br - 0.01);
  const rimHole = makeRoundedRect(bw - 0.14, bh - 0.14, br - 0.05);
  rimShape.holes.push(rimHole);
  const bezelMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rimShape, {
      depth: 0.025,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 16
    }),
    bezelBrassMat
  );
  bezelMesh.position.z = 0.122;
  bezelMesh.userData = { interactiveType: 'remoteBody' };
  root.add(bezelMesh);

  // Lateral tactile elastomer grip ribs (9 per side)
  const ribGeo = new THREE.BoxGeometry(0.042, 0.052, 0.14);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const rib = new THREE.Mesh(ribGeo, elastomerMat);
      rib.position.set(side * (bw / 2 + 0.024), -0.82 + i * 0.135, 0);
      root.add(rib);
    }
  }

  // 4 Micro hex-socket corner screws securing the faceplate
  const screwHeadGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.022, 6);
  screwHeadGeo.rotateX(Math.PI / 2);
  const screwSocketGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.026, 6);
  screwSocketGeo.rotateX(Math.PI / 2);
  for (const sx of [-0.61, 0.61]) {
    for (const sy of [-1.12, 1.12]) {
      const screw = new THREE.Mesh(screwHeadGeo, mats.machinedSteel);
      screw.position.set(sx, sy, 0.145);
      root.add(screw);
      const socket = new THREE.Mesh(screwSocketGeo, elastomerMat);
      socket.position.set(sx, sy, 0.147);
      root.add(socket);
    }
  }

  // 3-stage telescopic stainless antenna + knurled brass collar
  const antX = 0.46;
  const antBaseY = bh / 2 + 0.03;
  const antCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.080, 0.08, 18),
    mats.antiqueGold
  );
  antCollar.position.set(antX, antBaseY + 0.02, 0);
  root.add(antCollar);

  const antStage1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.052, 0.16, 16),
    mats.machinedSteel
  );
  antStage1.position.set(antX, antBaseY + 0.12, 0);
  root.add(antStage1);

  const antStage2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.035, 0.18, 16),
    mats.machinedSteel
  );
  antStage2.position.set(antX, antBaseY + 0.28, 0);
  root.add(antStage2);

  const antWhip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.022, 0.16, 14),
    mats.machinedSteel
  );
  antWhip.position.set(antX, antBaseY + 0.44, 0);
  root.add(antWhip);

  const antTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 14, 12),
    mats.polishedGold
  );
  antTip.position.set(antX, antBaseY + 0.525, 0);
  root.add(antTip);

  // Flush Amber TX telemetry LED inside chrome bezel on upper shoulder
  const txBezel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.050, 0.018, 18),
    mats.machinedSteel
  );
  txBezel.rotation.x = Math.PI / 2;
  txBezel.position.set(0.46, 1.135, 0.146);
  root.add(txBezel);

  const txLedMat = new THREE.MeshStandardMaterial({
    color: 0x5c3e12,
    emissive: 0xffb347,
    emissiveIntensity: 0.14,
    metalness: 0.15,
    roughness: 0.18
  });
  const txLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 14, 10),
    txLedMat
  );
  txLed.scale.set(1, 1, 0.6);
  txLed.position.set(0.46, 1.135, 0.155);
  root.add(txLed);

  // Recessed Sapphire-Glass Live OLED Telemetry Screen
  const oledFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.48, 0.032),
    mats.darkBronze
  );
  oledFrame.position.set(0, 0.83, 0.146);
  oledFrame.userData = { interactiveType: 'remoteBody' };
  root.add(oledFrame);

  const oledCanvas = document.createElement('canvas');
  oledCanvas.width = 384;
  oledCanvas.height = 160;
  const oledCtx = oledCanvas.getContext('2d');
  const oledTex = new THREE.CanvasTexture(oledCanvas);
  oledTex.colorSpace = THREE.SRGBColorSpace;
  oledTex.minFilter = THREE.LinearFilter;

  const oledScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.08, 0.41),
    new THREE.MeshBasicMaterial({ map: oledTex })
  );
  oledScreen.position.set(0, 0.83, 0.165);
  oledScreen.userData = { interactiveType: 'remoteBody' };
  root.add(oledScreen);

  const oledGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.11, 0.43),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.11,
      roughness: 0.06,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      depthWrite: false
    })
  );
  oledGlass.position.set(0, 0.83, 0.171);
  oledGlass.userData = { interactiveType: 'remoteBody' };
  root.add(oledGlass);

  let lastOledSig = '';
  const drawOled = (info = {}) => {
    const gearLabel = (info.gearLabel || 'YEAR').toUpperCase();
    const dateLine = info.dateLine || '2026-11-24';
    const timeLine = info.timeLine || '12:00 PM';
    const locationLine = (info.locationLine || 'LOCAL MERIDIAN').toUpperCase();
    const locked = Boolean(info.locked);
    const sig = `${gearLabel}|${dateLine}|${timeLine}|${locationLine}|${locked}`;
    if (sig === lastOledSig) return;
    lastOledSig = sig;

    oledCtx.fillStyle = '#080b11';
    oledCtx.fillRect(0, 0, 384, 160);

    // Subtle hairline separator & outer border glow
    oledCtx.strokeStyle = 'rgba(216, 173, 92, 0.28)';
    oledCtx.lineWidth = 2;
    oledCtx.strokeRect(3, 3, 378, 154);

    // Top telemetry strip: active channel & TX status
    oledCtx.fillStyle = '#d4aa5e';
    oledCtx.font = '700 18px "JetBrains Mono", monospace';
    oledCtx.textAlign = 'left';
    oledCtx.textBaseline = 'middle';
    oledCtx.fillText(`CH · ${gearLabel}`, 16, 26);

    oledCtx.fillStyle = locked ? '#b88346' : '#8fd3a4';
    oledCtx.font = '600 16px "JetBrains Mono", monospace';
    oledCtx.textAlign = 'right';
    oledCtx.fillText(locked ? '24H LOCK' : 'SYNC TX', 368, 26);

    oledCtx.strokeStyle = 'rgba(216, 173, 92, 0.18)';
    oledCtx.lineWidth = 1;
    oledCtx.beginPath();
    oledCtx.moveTo(14, 44);
    oledCtx.lineTo(370, 44);
    oledCtx.stroke();

    // Main center readout
    oledCtx.fillStyle = '#fff5dc';
    oledCtx.font = '700 32px "JetBrains Mono", monospace';
    oledCtx.textAlign = 'center';
    oledCtx.fillText(dateLine, 192, 76);

    oledCtx.fillStyle = '#f2cc78';
    oledCtx.font = '700 28px "JetBrains Mono", monospace';
    oledCtx.fillText(timeLine, 192, 112);

    // Bottom location footer
    oledCtx.fillStyle = '#9aa6bd';
    oledCtx.font = '600 15px "JetBrains Mono", monospace';
    oledCtx.fillText(locationLine.slice(0, 28), 192, 142);

    oledTex.needsUpdate = true;
  };
  drawOled({});

  // 6 Cylindrical Recessed Machined Tactile Buttons + per-button amber LEDs
  const btnSpecs = [
    { id: 'year',   short: 'YR',    row: 0, col: 0 },
    { id: 'month',  short: 'MO',    row: 0, col: 1 },
    { id: 'day',    short: 'DAY',   row: 0, col: 2 },
    { id: 'hour',   short: 'HR',    row: 1, col: 0 },
    { id: 'minute', short: 'MIN',   row: 1, col: 1 },
    { id: 'ampm',   short: 'AM/PM', row: 1, col: 2 }
  ];

  const remoteButtons = new Map();
  const buttonHitMeshes = [];

  const socketGeo = new THREE.CylinderGeometry(0.145, 0.156, 0.022, 28);
  socketGeo.rotateX(Math.PI / 2);
  const plungerGeo = new THREE.CylinderGeometry(0.120, 0.126, 0.048, 28);
  plungerGeo.rotateX(Math.PI / 2);
  const ledSocketGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.012, 12);
  ledSocketGeo.rotateX(Math.PI / 2);
  const ledBulbGeo = new THREE.SphereGeometry(0.016, 10, 8);

  for (const b of btnSpecs) {
    const bx = (b.col - 1) * 0.42;
    const by = b.row === 0 ? 0.36 : -0.02;

    // Stationary brass bezel socket
    const socket = new THREE.Mesh(socketGeo, mats.antiqueGold);
    socket.position.set(bx, by, 0.145);
    socket.userData = { interactiveType: 'remoteBody' };
    root.add(socket);

    // Per-button micro amber status LED above button
    const ledBase = new THREE.Mesh(ledSocketGeo, mats.darkBronze);
    ledBase.position.set(bx, by + 0.165, 0.148);
    root.add(ledBase);

    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x3b2c15,
      emissive: 0xffb347,
      emissiveIntensity: 0.06,
      metalness: 0.1,
      roughness: 0.25
    });
    const ledMesh = new THREE.Mesh(ledBulbGeo, ledMat);
    ledMesh.scale.set(1, 1, 0.65);
    ledMesh.position.set(bx, by + 0.165, 0.153);
    root.add(ledMesh);

    // Depressible cylindrical button plunger
    const btnGroup = new THREE.Group();
    btnGroup.position.set(bx, by, 0.162);
    root.add(btnGroup);

    const sideMat = mats.ebonySlate.clone();
    const plunger = new THREE.Mesh(plungerGeo, sideMat);
    plunger.userData = { interactiveType: 'remoteBtn', gearId: b.id };
    btnGroup.add(plunger);

    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;

    const capFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.114, 28),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    capFace.position.z = 0.025;
    capFace.userData = { interactiveType: 'remoteBtn', gearId: b.id };
    btnGroup.add(capFace);

    buttonHitMeshes.push(plunger, capFace);

    const drawBtn = (active, locked) => {
      ctx.clearRect(0, 0, 160, 160);
      ctx.beginPath();
      ctx.arc(80, 80, 76, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#2b2212' : '#14171e';
      ctx.fill();
      ctx.lineWidth = active ? 8 : 5;
      ctx.strokeStyle = locked ? '#7c5a2c' : active ? '#f6d887' : '#6e5c3e';
      ctx.stroke();

      ctx.fillStyle = locked ? '#b2874c' : active ? '#fff8df' : '#d5ccb8';
      ctx.font = b.short.length > 3
        ? '700 32px "JetBrains Mono", monospace'
        : '700 42px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(locked ? '24H' : b.short, 80, 82);
      tex.needsUpdate = true;

      btnGroup.position.z = active ? 0.146 : 0.166;
      sideMat.color.setHex(active ? 0x614b21 : 0x16181f);
      ledMat.emissive.setHex(locked ? 0x9e6f34 : 0xffb347);
      ledMat.emissiveIntensity = locked ? 0.10 : active ? 1.45 : 0.05;
    };

    drawBtn(b.id === 'year', false);
    remoteButtons.set(b.id, { drawBtn, active: b.id === 'year', locked: false });
  }

  // Prominent 36-Flute Knurled Solid Brass Rotary Jog Wheel + Vernier Scale Collar
  const knobPivot = new THREE.Group();
  knobPivot.position.set(0, -0.69, 0.145);
  root.add(knobPivot);

  const collarGeo = new THREE.CylinderGeometry(0.49, 0.52, 0.032, 48);
  collarGeo.rotateX(Math.PI / 2);
  const collar = new THREE.Mesh(collarGeo, mats.darkBronze);
  collar.userData = { interactiveType: 'remoteBody' };
  knobPivot.add(collar);

  const scaleRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.47, 0.008, 8, 48),
    mats.antiqueGold
  );
  scaleRing.position.z = 0.017;
  scaleRing.userData = { interactiveType: 'remoteBody' };
  knobPivot.add(scaleRing);

  // Stationary 12-o'clock brass triangular fiducial index pip on chassis above collar
  const indexPip = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.068, 4),
    mats.polishedGold
  );
  indexPip.rotation.z = Math.PI;
  indexPip.rotation.y = Math.PI / 4;
  indexPip.position.set(0, 0.51, 0.028);
  knobPivot.add(indexPip);

  const knobRotor = new THREE.Group();
  knobRotor.position.z = 0.055;
  knobPivot.add(knobRotor);

  const dialGeo = new THREE.CylinderGeometry(0.40, 0.415, 0.105, 48);
  dialGeo.rotateX(Math.PI / 2);
  const dialDisc = new THREE.Mesh(dialGeo, knurlBrassMat);
  knobRotor.add(dialDisc);

  // 36 Machined radial knurling flutes around the brass jog wheel perimeter
  const fluteCount = 36;
  const fluteGeo = new THREE.BoxGeometry(0.018, 0.022, 0.098);
  const fluteMesh = new THREE.InstancedMesh(fluteGeo, mats.polishedGold, fluteCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < fluteCount; i++) {
    const a = (i * Math.PI * 2) / fluteCount;
    dummy.position.set(0.408 * Math.cos(a), 0.408 * Math.sin(a), 0);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    fluteMesh.setMatrixAt(i, dummy.matrix);
  }
  fluteMesh.instanceMatrix.needsUpdate = true;
  knobRotor.add(fluteMesh);

  // Stepped top chamfer bezel & recessed anodized gunmetal cap face
  const topBezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.378, 0.016, 10, 48),
    mats.polishedGold
  );
  topBezel.position.z = 0.053;
  knobRotor.add(topBezel);

  const centerFaceGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.016, 40);
  centerFaceGeo.rotateX(Math.PI / 2);
  const centerFace = new THREE.Mesh(centerFaceGeo, gunmetalMat);
  centerFace.position.z = 0.052;
  knobRotor.add(centerFace);

  // Precision brass vernier pointer line pointing toward 12 o'clock on wheel face
  const vernierNeedle = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.24, 0.014),
    mats.polishedGold
  );
  vernierNeedle.position.set(0, 0.20, 0.062);
  knobRotor.add(vernierNeedle);

  // Concave ergonomic thumb spinner pocket offset on lower half of face
  const thumbPocketGroup = new THREE.Group();
  thumbPocketGroup.position.set(0, -0.20, 0.060);
  knobRotor.add(thumbPocketGroup);

  const thumbRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.088, 0.014, 10, 24),
    mats.polishedGold
  );
  thumbPocketGroup.add(thumbRim);

  const thumbWellGeo = new THREE.CylinderGeometry(0.080, 0.064, 0.018, 24);
  thumbWellGeo.rotateX(Math.PI / 2);
  const thumbWell = new THREE.Mesh(thumbWellGeo, mats.darkBronze);
  thumbWell.position.z = -0.002;
  thumbPocketGroup.add(thumbWell);

  // Center brushed steel hub cap screw
  const centerCapGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.022, 24);
  centerCapGeo.rotateX(Math.PI / 2);
  const centerCap = new THREE.Mesh(centerCapGeo, mats.machinedSteel);
  centerCap.position.z = 0.064;
  knobRotor.add(centerCap);

  // Invisible generous cylindrical hit volume for reliable drag capture
  const knobHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 0.26, 24),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  knobHit.rotation.x = Math.PI / 2;
  knobHit.position.z = 0.06;
  knobPivot.add(knobHit);

  // Subtle curved golden rotation hint arrows around jog wheel
  const hintGroup = new THREE.Group();
  hintGroup.position.z = 0.085;
  const hintMat = new THREE.MeshBasicMaterial({
    color: GOLD_BRIGHT_HEX,
    transparent: true,
    opacity: 0.55
  });
  for (const baseAng of [0, Math.PI]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.013, 8, 24, Math.PI * 0.50), hintMat);
    arc.rotation.z = baseAng + 0.38;
    hintGroup.add(arc);
    const tipAngle = baseAng + 0.38 + Math.PI * 0.50;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.09, 10), hintMat);
    cone.position.set(0.57 * Math.cos(tipAngle), 0.57 * Math.sin(tipAngle), 0);
    cone.rotation.z = tipAngle;
    hintGroup.add(cone);
  }
  knobPivot.add(hintGroup);

  const knobHitMeshes = [dialDisc, centerFace, vernierNeedle, thumbWell, centerCap, knobHit];
  for (const m of knobHitMeshes) {
    m.userData = { interactiveType: 'key' };
  }

  return {
    root,
    knobPivot,
    knobRotor,
    hintGroup,
    hintMat,
    knobHitMeshes,
    buttonHitMeshes,
    bodyHitMeshes: [bodyMesh, deckMesh, bezelMesh, collar, scaleRing, oledFrame, oledScreen, oledGlass],
    setActiveGear(gearId) {
      for (const [id, entry] of remoteButtons.entries()) {
        entry.active = id === gearId;
        entry.drawBtn(entry.active, entry.locked);
      }
    },
    setLocked(gearId, locked) {
      const entry = remoteButtons.get(gearId);
      if (entry) {
        entry.locked = locked;
        entry.drawBtn(entry.active, entry.locked);
      }
    },
    setKnobHovered(hovered) {
      knurlBrassMat.color.setHex(hovered ? GOLD_BRIGHT_HEX : GOLD_HEX);
      knurlBrassMat.roughness = hovered ? 0.16 : 0.26;
    },
    setHintOpacity(val) {
      hintMat.opacity = val;
      hintGroup.visible = val > 0.02;
    },
    setTransmitting(active) {
      txLedMat.emissiveIntensity = active ? 1.85 : 0.14;
    },
    updateDisplay(info) {
      drawOled(info);
    }
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
