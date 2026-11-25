/**
 * ObservatoryRoom — Step 1 of Earth POV:
 * Full 3D interior room featuring:
 *  1. Framed observatory window looking out onto live Day/Dusk/Night sky, clouds, mountains & weather.
 *  2. Studio widescreen desk monitor displaying the real live 3D Outer Space gear/Sun/Moon feed.
 *  3. Ergonomic center-desk Horological Control Console (knurled rotary wheel + 6 channel switches).
 *  4. Tripod-mounted brass refractor telescope on the right side (click to enter Step 2 Sky View).
 */
import * as THREE from '../vendor/three.module.min.js';
import { GOLD_HEX, GOLD_BRIGHT_HEX, createRemoteControllerRig } from './three-gear-factory.js?v=10';

const DEG_TO_RAD = Math.PI / 180;

export class ObservatoryRoom {
  constructor(mats, envTex, monitorTexture) {
    this.mats = mats;
    this.scene = new THREE.Scene();
    this.scene.environment = envTex || null;
    this.scene.background = new THREE.Color(0x090d16);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.telescopeHitMeshes = [];
    this.monitorHitMeshes = [];
    this._telescopeMat = null;
    this._cloudTime = 0;

    this._buildTextures();
    this._buildExteriorWorld();
    this._buildRoomArchitecture();
    this._buildDeskAndLamp();
    this._buildComputerMonitor(monitorTexture);
    this._buildDeskController();
    this._buildTelescope();
    this._buildRoomLighting();
  }

  _buildTextures() {
    // Rich dark oak hardwood floor planks
    const fc = document.createElement('canvas');
    fc.width = 512;
    fc.height = 512;
    const fctx = fc.getContext('2d');
    fctx.fillStyle = '#2d2118';
    fctx.fillRect(0, 0, 512, 512);
    for (let p = 0; p < 8; p++) {
      const y = p * 64;
      const shade = 36 + ((p * 17) % 14);
      fctx.fillStyle = `rgb(${shade + 10}, ${shade}, ${Math.max(12, shade - 10)})`;
      fctx.fillRect(0, y + 1, 512, 62);
      for (let g = 0; g < 35; g++) {
        fctx.fillStyle = 'rgba(15, 10, 6, 0.14)';
        fctx.fillRect(0, y + Math.random() * 62, 512, 1.2);
      }
      fctx.fillStyle = '#18110b';
      fctx.fillRect(0, y, 512, 2);
      const seamX = ((p * 173 + 64) % 440) + 32;
      fctx.fillRect(seamX, y, 2, 64);
    }
    this.floorTex = new THREE.CanvasTexture(fc);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;
    this.floorTex.wrapS = THREE.RepeatWrapping;
    this.floorTex.wrapT = THREE.RepeatWrapping;
    this.floorTex.repeat.set(4, 4);

    // Satin walnut veneer for desk & architectural trim
    const wc = document.createElement('canvas');
    wc.width = 512;
    wc.height = 512;
    const wctx = wc.getContext('2d');
    wctx.fillStyle = '#3b2619';
    wctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 220; i++) {
      const alpha = 0.06 + Math.random() * 0.10;
      wctx.strokeStyle = i % 2 === 0 ? `rgba(24, 14, 8, ${alpha})` : `rgba(88, 56, 36, ${alpha * 0.8})`;
      wctx.lineWidth = 1 + Math.random() * 2.5;
      const y = Math.random() * 512;
      wctx.beginPath();
      wctx.moveTo(0, y);
      wctx.bezierCurveTo(170, y + (Math.random() - 0.5) * 14, 340, y + (Math.random() - 0.5) * 14, 512, y);
      wctx.stroke();
    }
    this.walnutTex = new THREE.CanvasTexture(wc);
    this.walnutTex.colorSpace = THREE.SRGBColorSpace;
    this.walnutTex.wrapS = THREE.RepeatWrapping;
    this.walnutTex.wrapT = THREE.RepeatWrapping;
  }

  _buildExteriorWorld() {
    this.exteriorGroup = new THREE.Group();
    this.root.add(this.exteriorGroup);

    this.extSkyUniforms = {
      uDayFactor: { value: 0.85 },
      uTwilightFactor: { value: 0.0 },
      uCloudCover: { value: 0.25 },
      uRainIntensity: { value: 0.0 },
      uSunUV: { value: new THREE.Vector2(0.55, 0.72) },
      uMoonUV: { value: new THREE.Vector2(0.30, 0.78) },
      uTime: { value: 0.0 }
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.extSkyUniforms,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uDayFactor;
        uniform float uTwilightFactor;
        uniform float uCloudCover;
        uniform float uRainIntensity;
        uniform vec2 uSunUV;
        uniform vec2 uMoonUV;
        uniform float uTime;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            v += amp * noise2(p);
            p *= 2.04;
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          float h = clamp((vUv.y - 0.15) / 0.85, 0.0, 1.0);

          vec3 nightZenith = vec3(0.015, 0.028, 0.068);
          vec3 nightHorizon = vec3(0.055, 0.092, 0.165);
          vec3 dayZenith = vec3(0.11, 0.34, 0.72);
          vec3 dayHorizon = vec3(0.56, 0.76, 0.94);

          vec3 baseSky = mix(
            mix(nightHorizon, nightZenith, pow(h, 0.65)),
            mix(dayHorizon, dayZenith, pow(h, 0.55)),
            uDayFactor
          );

          // Overcast storm desaturation when cloudy or rainy
          float stormTint = clamp(uCloudCover * 0.45 + uRainIntensity * 0.35, 0.0, 0.75);
          vec3 overcastCol = mix(vec3(0.06, 0.08, 0.12), vec3(0.36, 0.43, 0.52), uDayFactor);
          baseSky = mix(baseSky, overcastCol, stormTint);

          // Golden dawn / dusk horizon glow
          vec3 twiCol = mix(vec3(0.95, 0.42, 0.18), vec3(0.98, 0.72, 0.38), clamp(h * 2.2, 0.0, 1.0));
          baseSky = mix(baseSky, twiCol, uTwilightFactor * (1.0 - smoothstep(0.0, 0.72, h)) * 0.82);

          // Crisp starfield at night
          float starVis = smoothstep(0.45, 0.0, uDayFactor) * (1.0 - clamp(uCloudCover * 1.1, 0.0, 0.95));
          if (starVis > 0.01) {
            vec2 sg = vUv * vec2(120.0, 80.0);
            vec2 cell = floor(sg);
            vec2 cf = fract(sg) - 0.5;
            float r = hash21(cell);
            if (r > 0.965) {
              float dist = length(cf);
              float twinkle = 0.7 + 0.3 * sin(uTime * 2.2 + r * 40.0);
              baseSky += vec3(0.92, 0.95, 1.0) * smoothstep(0.18, 0.01, dist) * twinkle * starVis * (0.4 + 0.6 * h);
            }
          }

          // Solar disc + atmospheric scatter halo (attenuated by thick clouds/rain)
          vec2 dSun = (vUv - uSunUV) * vec2(1.4, 1.0);
          float sunDist = length(dSun);
          float clearFactor = 1.0 - uRainIntensity * 0.85;
          baseSky += vec3(1.0, 0.86, 0.60) * smoothstep(0.38, 0.0, sunDist) * (0.28 + 0.55 * uDayFactor) * clearFactor;
          baseSky += vec3(1.0, 0.97, 0.88) * smoothstep(0.055, 0.022, sunDist) * (uDayFactor * 1.2 + uTwilightFactor * 0.9) * clearFactor;

          // Lunar disc + soft halo during twilight & night
          vec2 dMoon = (vUv - uMoonUV) * vec2(1.4, 1.0);
          float moonDist = length(dMoon);
          float moonVis = smoothstep(0.65, 0.05, uDayFactor) * (1.0 - uRainIntensity * 0.75);
          baseSky += vec3(0.68, 0.78, 0.96) * smoothstep(0.22, 0.0, moonDist) * 0.25 * moonVis;
          baseSky += vec3(0.95, 0.96, 1.0) * smoothstep(0.036, 0.018, moonDist) * 0.88 * moonVis;

          // Drifting volumetric cumulus & storm clouds
          vec2 cloudCoord = vec2(vUv.x * 3.6 + uTime * 0.018, vUv.y * 2.4 + 1.2);
          float n = fbm(cloudCoord);
          float cloudThresh = mix(0.66, 0.26, clamp(uCloudCover, 0.0, 1.0));
          float cloudAlpha = smoothstep(cloudThresh, cloudThresh + 0.26, n) * smoothstep(0.10, 0.42, vUv.y);
          vec3 cloudLit = mix(vec3(0.14, 0.18, 0.28), vec3(0.96, 0.97, 0.99), uDayFactor);
          cloudLit = mix(cloudLit, vec3(0.96, 0.65, 0.42), uTwilightFactor * 0.75);
          cloudLit = mix(cloudLit, vec3(0.22, 0.25, 0.30), uRainIntensity * 0.65 * uDayFactor);
          baseSky = mix(baseSky, cloudLit, cloudAlpha * 0.88);

          gl_FragColor = vec4(baseSky, 1.0);
        }
      `
    });

    const skyBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(18, 11), skyMat);
    skyBackdrop.position.set(-1.5, 2.2, -16.0);
    this.exteriorGroup.add(skyBackdrop);

    // Distant mountain range silhouette outside the observatory window
    const makeRidge = (seedOffset, baseHeight, zPos) => {
      const shape = new THREE.Shape();
      shape.moveTo(-9, -4);
      for (let i = 0; i <= 36; i++) {
        const x = -9 + (i / 36) * 18;
        const y =
          baseHeight +
          0.42 * Math.sin(x * 0.65 + seedOffset) +
          0.22 * Math.cos(x * 1.45 - seedOffset * 1.3) +
          0.11 * Math.sin(x * 3.1 + seedOffset);
        shape.lineTo(x, y);
      }
      shape.lineTo(9, -4);
      shape.closePath();
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a2638 });
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      mesh.position.set(-1.5, 0, zPos);
      this.exteriorGroup.add(mesh);
      return mat;
    };

    this.farRidgeMat = makeRidge(0.8, 0.86, -12.5);
    this.nearRidgeMat = makeRidge(2.7, 0.56, -8.5);

    // Glistening rain streaks outside the window pane (activated dynamically by weather.rainIntensity)
    const rainCount = 180;
    const rainPositions = new Float32Array(rainCount * 6);
    this._rainDrops = [];
    for (let i = 0; i < rainCount; i++) {
      const x = -3.4 + Math.random() * 3.2;
      const y = 0.6 + Math.random() * 2.8;
      const z = -2.55 - Math.random() * 2.6;
      const len = 0.14 + Math.random() * 0.16;
      this._rainDrops.push({ x, y, z, len, speed: 4.5 + Math.random() * 2.5 });
      rainPositions[i * 6 + 0] = x;
      rainPositions[i * 6 + 1] = y;
      rainPositions[i * 6 + 2] = z;
      rainPositions[i * 6 + 3] = x - 0.03;
      rainPositions[i * 6 + 4] = y - len;
      rainPositions[i * 6 + 5] = z;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xc8daf0,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this.rainLines = new THREE.LineSegments(rainGeo, this.rainMat);
    this.rainLines.visible = false;
    this.exteriorGroup.add(this.rainLines);
  }

  _buildRoomArchitecture() {
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTex,
      roughness: 0.62,
      metalness: 0.08
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 7.6), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    this.wallMat = new THREE.MeshStandardMaterial({
      color: 0x262d38,
      roughness: 0.86,
      metalness: 0.06
    });
    const wainscotMat = new THREE.MeshStandardMaterial({
      map: this.walnutTex,
      roughness: 0.56,
      metalness: 0.10
    });
    const trimMat = new THREE.MeshStandardMaterial({
      map: this.walnutTex,
      color: 0x6e4b32,
      roughness: 0.42,
      metalness: 0.14
    });

    // Window aperture on left-back wall: x in [-2.36, -0.88], y in [0.96, 2.74], z = -2.20
    const wxMin = -2.36;
    const wxMax = -0.88;
    const wyMin = 0.96;
    const wyMax = 2.74;
    const wz = -2.20;

    // 4 solid wall slabs framing the open aperture
    const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(8.6, wyMin, 0.16), wainscotMat);
    lowerWall.position.set(0, wyMin / 2, wz);
    lowerWall.receiveShadow = true;
    this.root.add(lowerWall);

    const upperWall = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.70, 0.16), this.wallMat);
    upperWall.position.set(0, wyMax + 0.35, wz);
    this.root.add(upperWall);

    const leftWallPier = new THREE.Mesh(new THREE.BoxGeometry(2.0, wyMax - wyMin, 0.16), this.wallMat);
    leftWallPier.position.set(wxMin - 1.0, (wyMin + wyMax) / 2, wz);
    this.root.add(leftWallPier);

    const rightWallPanel = new THREE.Mesh(new THREE.BoxGeometry(5.6, wyMax - wyMin, 0.16), this.wallMat);
    rightWallPanel.position.set(wxMax + 2.8, (wyMin + wyMax) / 2, wz);
    rightWallPanel.receiveShadow = true;
    this.root.add(rightWallPanel);

    // Side walls & ceiling enclosing the room
    const sideLeft = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.45), this.wallMat);
    sideLeft.position.set(-3.6, 1.725, 1.2);
    sideLeft.rotation.y = Math.PI / 2;
    this.root.add(sideLeft);

    const sideRight = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.45), this.wallMat);
    sideRight.position.set(3.6, 1.725, 1.2);
    sideRight.rotation.y = -Math.PI / 2;
    this.root.add(sideRight);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 7.6), this.wallMat);
    ceiling.position.set(0, 3.40, 1.2);
    ceiling.rotation.x = Math.PI / 2;
    this.root.add(ceiling);

    // Chair rail molding across back wall right under window level
    const chairRail = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.06, 0.08), trimMat);
    chairRail.position.set(0, wyMin - 0.02, wz + 0.09);
    this.root.add(chairRail);

    // Window walnut casing, projecting sill, and 2x2 mullions
    const wWidth = wxMax - wxMin;
    const wHeight = wyMax - wyMin;
    const wCenterX = (wxMin + wxMax) / 2;
    const wCenterY = (wyMin + wyMax) / 2;

    const sill = new THREE.Mesh(new THREE.BoxGeometry(wWidth + 0.18, 0.055, 0.24), trimMat);
    sill.position.set(wCenterX, wyMin + 0.01, wz + 0.04);
    this.root.add(sill);

    const header = new THREE.Mesh(new THREE.BoxGeometry(wWidth + 0.16, 0.075, 0.20), trimMat);
    header.position.set(wCenterX, wyMax - 0.01, wz + 0.02);
    this.root.add(header);

    for (const sx of [wxMin + 0.03, wxMax - 0.03]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.07, wHeight, 0.20), trimMat);
      jamb.position.set(sx, wCenterY, wz + 0.02);
      this.root.add(jamb);
    }

    const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.032, wHeight - 0.04, 0.06), trimMat);
    vMullion.position.set(wCenterX, wCenterY, wz);
    this.root.add(vMullion);

    const hMullion = new THREE.Mesh(new THREE.BoxGeometry(wWidth - 0.04, 0.032, 0.06), trimMat);
    hMullion.position.set(wCenterX, wCenterY + 0.05, wz);
    this.root.add(hMullion);

    // Subtle linen side drapes framing window sides
    const drapeMat = new THREE.MeshStandardMaterial({
      color: 0x3b3532,
      roughness: 0.92,
      metalness: 0.02
    });
    for (const dx of [wxMin - 0.11, wxMax + 0.11]) {
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.08, 12), drapeMat);
      drape.scale.set(1.0, 1.0, 0.45);
      drape.position.set(dx, wCenterY - 0.06, wz + 0.15);
      this.root.add(drape);
    }

    // Subtle reflective window glass
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff0ff,
      transparent: true,
      opacity: 0.07,
      roughness: 0.06,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      depthWrite: false
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(wWidth - 0.06, wHeight - 0.06), glassMat);
    glass.position.set(wCenterX, wCenterY, wz);
    this.root.add(glass);

    // Soft slanted atmospheric window light beam plane
    this.windowBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffe4b3,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.4), this.windowBeamMat);
    beam.position.set(-1.35, 1.45, -1.25);
    beam.rotation.set(-0.48, 0.25, -0.18);
    this.root.add(beam);

    // Brass framed star chart painting on right-back wall behind telescope
    const chartFrame = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.70, 0.03), this.mats.antiqueGold);
    chartFrame.position.set(0.95, 1.98, wz + 0.09);
    this.root.add(chartFrame);

    const chartInner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.88, 0.60),
      new THREE.MeshStandardMaterial({ color: 0x111722, roughness: 0.8, metalness: 0.1 })
    );
    chartInner.position.set(0.95, 1.98, wz + 0.11);
    this.root.add(chartInner);
  }

  _buildDeskAndLamp() {
    const deskWoodMat = new THREE.MeshStandardMaterial({
      map: this.walnutTex,
      roughness: 0.38,
      metalness: 0.12
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1c1f26,
      roughness: 0.45,
      metalness: 0.78
    });

    // Broad walnut observatory desk surface at y = 0.78 (clear of right-side telescope tripod)
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.50, 0.065, 1.36), deskWoodMat);
    deskTop.position.set(-0.04, 0.748, 0.22);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    this.root.add(deskTop);

    // Chamfered brass front desk edge trim
    const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(2.50, 0.014, 0.015), this.mats.antiqueGold);
    frontTrim.position.set(-0.04, 0.774, 0.902);
    this.root.add(frontTrim);

    // Steel legs with machined brass feet
    for (const lx of [-1.14, 1.06]) {
      for (const lz of [-0.34, 0.76]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.72, 12), steelMat);
        leg.position.set(lx, 0.36, lz);
        this.root.add(leg);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.06, 12), this.mats.antiqueGold);
        foot.position.set(lx, 0.03, lz);
        this.root.add(foot);
      }
    }

    // Charcoal full-grain leather desk blotter pad
    const blotter = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 0.012, 0.90),
      new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.82, metalness: 0.05 })
    );
    blotter.position.set(-0.02, 0.786, 0.32);
    blotter.receiveShadow = true;
    this.root.add(blotter);

    // Classic brass observatory desk lamp on left rear of desk
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-0.98, 0.782, -0.08);
    lampGroup.rotation.y = 0.42;
    this.root.add(lampGroup);

    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.135, 0.035, 24),
      this.mats.antiqueGold
    );
    lampBase.position.y = 0.018;
    lampGroup.add(lampBase);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.38, 14), this.mats.polishedGold);
    stem.position.set(-0.02, 0.21, -0.02);
    stem.rotation.z = -0.18;
    lampGroup.add(stem);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 12), this.mats.polishedGold);
    arm.position.set(0.07, 0.42, 0.02);
    arm.rotation.z = 0.95;
    lampGroup.add(arm);

    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.145, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x1c4a35, roughness: 0.24, metalness: 0.28 })
    );
    shade.position.set(0.16, 0.40, 0.04);
    shade.rotation.z = -0.26;
    lampGroup.add(shade);

    this.lampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff0cc,
      emissive: 0xffba5c,
      emissiveIntensity: 1.4,
      roughness: 0.2
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), this.lampBulbMat);
    bulb.position.set(0.15, 0.35, 0.04);
    lampGroup.add(bulb);
  }

  _buildComputerMonitor(monitorTexture) {
    const monGroup = new THREE.Group();
    monGroup.position.set(0.02, 0.782, -0.22);
    monGroup.rotation.y = 0.02;
    this.root.add(monGroup);

    const aluminumMat = new THREE.MeshStandardMaterial({
      color: 0x7c8490,
      metalness: 0.85,
      roughness: 0.26
    });
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x111318,
      metalness: 0.45,
      roughness: 0.42
    });

    // Stand foot + vertical neck riser
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.018, 0.24), aluminumMat);
    foot.position.set(0, 0.009, 0.02);
    foot.castShadow = true;
    monGroup.add(foot);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.49, 0.036), aluminumMat);
    neck.position.set(0, 0.255, -0.05);
    neck.rotation.x = 0.08;
    monGroup.add(neck);

    // Widescreen slim display housing centered at y = 0.72 relative to desk -> world y = 1.50
    const screenFrame = new THREE.Group();
    screenFrame.position.set(0, 0.72, 0.0);
    screenFrame.rotation.x = -0.03;
    monGroup.add(screenFrame);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.76, 0.038), bezelMat);
    housing.castShadow = true;
    screenFrame.add(housing);

    const goldAccentStrip = new THREE.Mesh(
      new THREE.BoxGeometry(1.225, 0.012, 0.040),
      this.mats.antiqueGold
    );
    goldAccentStrip.position.y = -0.376;
    screenFrame.add(goldAccentStrip);

    // Live 3D Outer Space WebGLRenderTarget feed (linear NoColorSpace -> main pass toneMaps & encodes once)
    const screenMat = new THREE.MeshBasicMaterial({
      map: monitorTexture,
      toneMapped: true
    });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.69), screenMat);
    screenMesh.position.z = 0.021;
    screenMesh.userData = { interactiveType: 'monitorScreen' };
    screenFrame.add(screenMesh);

    const statusLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x7be0a0 })
    );
    statusLed.position.set(0.54, -0.362, 0.022);
    screenFrame.add(statusLed);

    this.monitorHitMeshes = [screenMesh];
  }

  _buildDeskController() {
    this.deskController = createRemoteControllerRig(this.mats);

    const dockGroup = new THREE.Group();
    dockGroup.position.set(-0.02, 0.785, 0.66);
    this.root.add(dockGroup);

    // Angled walnut + brass charging cradle on desk blotter
    const cradleWoodMat = new THREE.MeshStandardMaterial({
      map: this.walnutTex,
      roughness: 0.42,
      metalness: 0.10
    });
    const cradleBase = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.032, 0.32), cradleWoodMat);
    cradleBase.position.set(0, 0.016, -0.02);
    cradleBase.castShadow = true;
    cradleBase.receiveShadow = true;
    dockGroup.add(cradleBase);

    const cradleWedge = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.34, 4), cradleWoodMat);
    cradleWedge.rotation.y = Math.PI / 4;
    cradleWedge.rotation.z = Math.PI / 2;
    cradleWedge.scale.set(0.68, 1.0, 0.88);
    cradleWedge.position.set(0, 0.072, -0.06);
    dockGroup.add(cradleWedge);

    const brassLip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.024, 0.024), this.mats.antiqueGold);
    brassLip.position.set(0, 0.038, 0.135);
    dockGroup.add(brassLip);

    // Mount the horological controller ergonomically tilted toward seated user, completely below monitor screen
    this.deskController.root.position.set(0, 0.138, 0.01);
    this.deskController.root.rotation.set(-0.94, 0.0, 0.0);
    this.deskController.root.scale.setScalar(0.215);
    dockGroup.add(this.deskController.root);
  }

  _buildTelescope() {
    this.telescopeGroup = new THREE.Group();
    this.telescopeGroup.position.set(1.58, 0.0, -0.36);
    this.root.add(this.telescopeGroup);

    const legWoodMat = new THREE.MeshStandardMaterial({
      map: this.walnutTex,
      roughness: 0.46,
      metalness: 0.08
    });
    this._telescopeMat = this.mats.polishedGold.clone();
    const matteBlackMat = new THREE.MeshStandardMaterial({
      color: 0x14171e,
      metalness: 0.65,
      roughness: 0.38
    });

    // Three spread walnut & brass tripod legs meeting mount hub at y = 1.24
    const hubPos = new THREE.Vector3(0, 1.24, 0);
    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3 + 0.35;
      const footPos = new THREE.Vector3(Math.cos(ang) * 0.36, 0.02, Math.sin(ang) * 0.36);
      const vec = hubPos.clone().sub(footPos);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.014, vec.length(), 10), legWoodMat);
      leg.position.copy(footPos).addScaledVector(vec, 0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
      leg.castShadow = true;
      this.telescopeGroup.add(leg);

      const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.011, 0.10, 10), this.mats.antiqueGold);
      ferrule.position.copy(footPos).addScaledVector(vec.clone().normalize(), 0.05);
      ferrule.quaternion.copy(leg.quaternion);
      this.telescopeGroup.add(ferrule);
    }

    // Center spreader tray + brass equatorial mount head
    const spreader = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.018, 18), this.mats.antiqueGold);
    spreader.position.y = 0.68;
    this.telescopeGroup.add(spreader);

    const eqBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.14, 18), this.mats.darkBronze);
    eqBase.position.y = 1.26;
    this.telescopeGroup.add(eqBase);

    const cradleYoke = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.10), this.mats.antiqueGold);
    cradleYoke.position.y = 1.38;
    this.telescopeGroup.add(cradleYoke);

    // Counterweight rod & steel weight
    const cwRod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.36, 10), this.mats.machinedSteel);
    cwRod.position.set(0.09, 1.25, 0.08);
    cwRod.rotation.z = 0.48;
    this.telescopeGroup.add(cwRod);

    const cwWeight = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.06, 16), this.mats.machinedSteel);
    cwWeight.position.set(0.16, 1.12, 0.08);
    cwWeight.rotation.z = 0.48;
    this.telescopeGroup.add(cwWeight);

    // Optical Barrel Pivot angled toward window & upper-left sky
    const otaGroup = new THREE.Group();
    otaGroup.position.set(0, 1.44, 0);
    otaGroup.rotation.order = 'YXZ';
    otaGroup.rotation.y = 0.62;
    otaGroup.rotation.x = 0.56;
    this.telescopeGroup.add(otaGroup);

    // Brass optical tube extending along +Z (objective facing skyward away/left) & eyepiece on -Z
    const mainTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.072, 1.05, 24),
      this._telescopeMat
    );
    mainTube.rotation.x = Math.PI / 2;
    mainTube.castShadow = true;
    otaGroup.add(mainTube);

    // Cradle clamp rings
    for (const rz of [-0.12, 0.12]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.070, 0.012, 10, 24), this.mats.darkBronze);
      ring.position.z = rz;
      otaGroup.add(ring);
    }

    // Matte-black dew shield hood + cobalt-coated objective lens
    const dewShield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.075, 0.24, 24),
      matteBlackMat
    );
    dewShield.rotation.x = Math.PI / 2;
    dewShield.position.z = -0.62;
    otaGroup.add(dewShield);

    const objGlass = new THREE.Mesh(
      new THREE.CircleGeometry(0.066, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x265c99,
        metalness: 0.25,
        roughness: 0.05,
        clearcoat: 1.0
      })
    );
    objGlass.rotation.y = Math.PI;
    objGlass.position.z = -0.71;
    otaGroup.add(objGlass);

    // Eyepiece drawtube, focuser knobs & star diagonal facing observer
    const focuser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.052, 0.18, 18),
      matteBlackMat
    );
    focuser.rotation.x = Math.PI / 2;
    focuser.position.z = 0.56;
    otaGroup.add(focuser);

    for (const side of [-1, 1]) {
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.030, 0.030, 0.036, 16),
        this._telescopeMat
      );
      knob.rotation.z = Math.PI / 2;
      knob.position.set(side * 0.068, -0.02, 0.55);
      otaGroup.add(knob);
    }

    const eyepieceCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.034, 0.11, 16),
      matteBlackMat
    );
    eyepieceCup.position.set(0, 0.06, 0.64);
    eyepieceCup.rotation.x = 0.25;
    otaGroup.add(eyepieceCup);

    // Parallel mini finder scope on brass stalks
    const finderTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.34, 14),
      this._telescopeMat
    );
    finderTube.rotation.x = Math.PI / 2;
    finderTube.position.set(0, 0.115, 0.14);
    otaGroup.add(finderTube);

    // Generous invisible raycast collider covering barrel & mount
    const teleHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 1.45, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    teleHit.rotation.x = Math.PI / 2;
    teleHit.userData = { interactiveType: 'telescope' };
    otaGroup.add(teleHit);

    const mountHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 1.30, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    mountHit.position.y = 0.68;
    mountHit.userData = { interactiveType: 'telescope' };
    this.telescopeGroup.add(mountHit);

    this.telescopeHitMeshes = [teleHit, mountHit];
  }

  _buildRoomLighting() {
    this.roomHemiLight = new THREE.HemisphereLight(0xbcd4f5, 0x2c2218, 0.72);
    this.scene.add(this.roomHemiLight);

    // Primary window light casting natural day sunbeams or silver night moonlight across room
    this.windowLight = new THREE.DirectionalLight(0xfff4df, 2.2);
    this.windowLight.position.set(-2.6, 2.9, -4.5);
    this.windowLight.target.position.set(0.3, 0.8, 0.6);
    this.scene.add(this.windowLight);
    this.scene.add(this.windowLight.target);

    // Cozy warm brass desk lamp illuminating desk blotter & horological console (peaks at night)
    this.deskLampLight = new THREE.PointLight(0xffbe6b, 1.6, 4.6, 1.4);
    this.deskLampLight.position.set(-0.92, 1.12, 0.05);
    this.scene.add(this.deskLampLight);

    // Subtle fill from computer monitor onto the center desk console
    this.monitorGlowLight = new THREE.PointLight(0xa8c8ff, 0.65, 2.8, 1.6);
    this.monitorGlowLight.position.set(0.02, 1.38, 0.16);
    this.scene.add(this.monitorGlowLight);

    // Soft interior fill so room features stay crisp even in deep night
    this.interiorFill = new THREE.PointLight(0xd9cdb8, 0.55, 8.0, 1.5);
    this.interiorFill.position.set(0.5, 2.35, 2.2);
    this.scene.add(this.interiorFill);
  }

  setTelescopeHovered(hovered) {
    if (!this._telescopeMat) return;
    this._telescopeMat.color.setHex(hovered ? 0xfff0b5 : GOLD_BRIGHT_HEX);
    this._telescopeMat.roughness = hovered ? 0.10 : 0.16;
  }

  getRayTargets() {
    return [
      ...(this.deskController.doneHitMeshes || []),
      ...this.deskController.knobHitMeshes,
      ...this.deskController.buttonHitMeshes,
      ...this.deskController.bodyHitMeshes,
      ...this.telescopeHitMeshes,
      ...this.monitorHitMeshes
    ];
  }

  update(celestial, weather, dt, reducedMotion = false) {
    if (!celestial) return;
    const w = weather || { id: 'clear', cloudCover: 0.25, rainIntensity: 0 };

    if (!reducedMotion) {
      this._cloudTime += dt;
    }
    this.extSkyUniforms.uTime.value = this._cloudTime;
    this.extSkyUniforms.uDayFactor.value = celestial.dayFactor;
    this.extSkyUniforms.uTwilightFactor.value = celestial.twilightFactor;
    this.extSkyUniforms.uCloudCover.value = w.cloudCover;
    this.extSkyUniforms.uRainIntensity.value = w.rainIntensity;

    // Position Sun & Moon smoothly across the framed window UV space [0..1]
    const sunHaNorm = ((celestial.sunHaDeg + 180) % 360) / 360;
    const sunElev = THREE.MathUtils.clamp((celestial.sunHorizon.altDeg + 12) / 95, 0.12, 0.88);
    this.extSkyUniforms.uSunUV.value.set(
      THREE.MathUtils.clamp(0.20 + sunHaNorm * 0.60, 0.15, 0.85),
      sunElev
    );

    const moonHaNorm = ((celestial.moonHaDeg + 180) % 360) / 360;
    const moonElev = THREE.MathUtils.clamp((celestial.moonHorizon.altDeg + 15) / 95, 0.18, 0.86);
    this.extSkyUniforms.uMoonUV.value.set(
      THREE.MathUtils.clamp(0.18 + moonHaNorm * 0.64, 0.15, 0.85),
      moonElev
    );

    // Mountain silhouette atmospheric tinting
    const day = celestial.dayFactor;
    const twi = celestial.twilightFactor;
    this.farRidgeMat.color.setRGB(
      0.04 + 0.14 * day + 0.16 * twi,
      0.06 + 0.21 * day + 0.08 * twi,
      0.13 + 0.26 * day + 0.06 * twi
    );
    this.nearRidgeMat.color.setRGB(
      0.025 + 0.07 * day + 0.08 * twi,
      0.035 + 0.11 * day + 0.04 * twi,
      0.075 + 0.13 * day
    );

    // Animate outside rain streaks when raining
    if (w.rainIntensity > 0.05) {
      this.rainLines.visible = true;
      this.rainMat.opacity = w.rainIntensity * 0.52;
      if (!reducedMotion) {
        const pos = this.rainLines.geometry.attributes.position;
        for (let i = 0; i < this._rainDrops.length; i++) {
          const drop = this._rainDrops[i];
          drop.y -= drop.speed * dt;
          if (drop.y < 0.45) {
            drop.y = 3.2;
          }
          pos.setXYZ(i * 2, drop.x, drop.y, drop.z);
          pos.setXYZ(i * 2 + 1, drop.x - 0.03, drop.y - drop.len, drop.z);
        }
        pos.needsUpdate = true;
      }
    } else {
      this.rainLines.visible = false;
    }

    // Exterior window sun/moon beam intensity & color
    const skyClear = Math.max(0.2, 1 - w.rainIntensity * 0.75 - w.cloudCover * 0.35);
    const beamDayCol = new THREE.Color(0xffe6ba);
    const beamTwiCol = new THREE.Color(0xff9b54);
    const beamNightCol = new THREE.Color(0x6d92cf);
    this.windowBeamMat.color
      .copy(beamNightCol)
      .lerp(beamDayCol, day)
      .lerp(beamTwiCol, twi * 0.7);
    this.windowBeamMat.opacity = (0.025 + 0.075 * day + 0.04 * twi) * skyClear;

    // Room lighting transitions organically between bright sunny day and warm cozy lamp-lit night
    this.roomHemiLight.intensity = 0.44 + 0.65 * day + 0.18 * twi;
    this.windowLight.color.copy(this.windowBeamMat.color);
    this.windowLight.intensity = (0.65 + 2.35 * day + 0.85 * twi) * (0.55 + 0.45 * skyClear);

    const lampFactor = Math.max(0.28, 1.0 - day * 0.72 + w.rainIntensity * 0.25);
    this.deskLampLight.intensity = 2.6 * lampFactor;
    this.lampBulbMat.emissiveIntensity = 0.55 + 1.35 * lampFactor;

    this.wallMat.color.setRGB(
      0.11 + 0.08 * day + 0.04 * twi,
      0.13 + 0.09 * day + 0.02 * twi,
      0.18 + 0.10 * day
    );
  }
}
