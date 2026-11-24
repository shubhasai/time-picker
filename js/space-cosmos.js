/**
 * SpaceCosmos — Photorealistic NASA Satellite Earth & Moon,
 * Actively Running 3D Asteroids & Shooting Meteoroids,
 * Smoothly Animated Day/Night Cycle ON THE EARTH, and Earth Surface Horizon.
 */
import * as THREE from '../vendor/three.module.min.js';
import {
  COUNTRY_TIMEZONES,
  equatorialToHorizon,
  orreryVector,
  computeSkyFactors
} from './astronomy.js';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const EARTH_RADIUS = 2.35;
export const EARTH_SPACE_POS = new THREE.Vector3(0, 4.15, -10.4);
const SUN_SPACE_DIST = 8.2;
const MOON_SPACE_DIST = 4.15;

const GOLD_HEX = 0xe2bc6b;
const GOLD_BRIGHT_HEX = 0xf7df9c;

function shortestDegDelta(fromDeg, toDeg) {
  let d = ((toDeg - fromDeg + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(Math.abs(d) - 180) < 0.6) {
    d = 180;
  }
  return d;
}

function shortestRadDelta(fromRad, toRad) {
  return ((toRad - fromRad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

export class SpaceCosmos {
  constructor(scene, maxAnisotropy = 4) {
    this.scene = scene;
    this.maxAnisotropy = Math.min(8, maxAnisotropy || 4);
    this.povMix = 0;
    this.povTarget = 0;
    this.selectedCountryId = 'local';

    this.anim = {
      initialized: false,
      sunHaDeg: 0,
      sunDecDeg: -20,
      moonHaDeg: 90,
      moonDecDeg: 10,
      earthRotY: -Math.PI / 2,
      targetEarthRotY: -Math.PI / 2,
      cloudOffset: 0
    };

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.countryPinMap = new Map();
    this.earthHitMeshes = [];
    this.asteroids = [];

    this._buildSkyDome();
    this._buildStarfield();
    this._buildRunningAsteroids();
    this._buildEarth();
    this._buildMoon();
    this._buildSun();
    this._buildEarthPovHorizon();
  }

  _loadTex(path, isSRGB = true) {
    const loader = new THREE.TextureLoader();
    const tex = loader.load(path);
    tex.anisotropy = this.maxAnisotropy;
    if (isSRGB) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    return tex;
  }

  _buildSkyDome() {
    this.skyUniforms = {
      uPovMix: { value: 0 },
      uDayFactor: { value: 0.8 },
      uTwilightFactor: { value: 0.0 },
      uSunDir: { value: new THREE.Vector3(0, 0.5, 0.86) }
    };

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldDir;
        uniform float uPovMix;
        uniform float uDayFactor;
        uniform float uTwilightFactor;
        uniform vec3 uSunDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.12);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise2(p);
            p *= 2.05;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float sunDot = max(0.0, dot(dir, normalize(uSunDir)));

          // Deep cosmic backdrop + delicate natural Milky Way dust lane
          vec3 spaceCol = mix(
            vec3(0.008, 0.012, 0.024),
            vec3(0.014, 0.021, 0.040),
            smoothstep(-0.5, 0.8, dir.y)
          );

          float planeDist = dir.y * 0.74 - dir.x * 0.52 + 0.08;
          float galBand = exp(-pow(planeDist * 3.4, 2.0));
          vec2 galCoord = vec2(atan(dir.z + 0.0001, dir.x) * 2.2, planeDist * 4.5);
          float galCloud = fbm(galCoord);
          float dustRift = smoothstep(0.32, 0.68, fbm(galCoord * 2.1 + 3.7));
          float galCore = exp(-pow((dir.x + 0.25) * 1.4, 2.0)) * galBand;

          vec3 galColor = mix(vec3(0.055, 0.075, 0.115), vec3(0.145, 0.132, 0.108), galCore);
          float mwStrength = galBand * (0.35 + 0.65 * galCloud) * (1.0 - 0.55 * dustRift * exp(-pow(planeDist * 10.0, 2.0)));
          spaceCol += galColor * mwStrength * 0.68;
          spaceCol += vec3(1.0, 0.82, 0.52) * pow(sunDot, 14.0) * (0.20 + 0.14 * uDayFactor);

          // Earth POV natural Rayleigh sky above horizon
          float elev = clamp(dir.y, -0.2, 1.0);
          float horizonBand = exp(-max(0.0, elev) * 6.8);
          vec3 povNight = mix(vec3(0.006, 0.010, 0.024), vec3(0.020, 0.036, 0.072), horizonBand);
          vec3 povDay   = mix(vec3(0.11, 0.34, 0.70), vec3(0.52, 0.76, 0.95), horizonBand);
          vec3 povCol   = mix(povNight, povDay, uDayFactor);

          vec3 twiCol = mix(vec3(0.92, 0.38, 0.14), vec3(1.0, 0.78, 0.42), pow(sunDot, 2.5));
          povCol += twiCol * uTwilightFactor * horizonBand * (0.58 + 0.65 * pow(sunDot, 2.0));
          povCol += vec3(1.0, 0.90, 0.68) * pow(sunDot, 32.0) * (0.40 + 0.55 * uDayFactor);

          float belowMask = smoothstep(0.02, -0.06, dir.y);
          vec3 groundCol = mix(vec3(0.010, 0.014, 0.026), vec3(0.035, 0.056, 0.095), uDayFactor);
          povCol = mix(povCol, groundCol, belowMask);

          vec3 finalCol = mix(spaceCol, povCol, uPovMix);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `
    });

    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(88, 36, 24), skyMat);
    this.root.add(this.skyDome);
  }

  _buildStarfield() {
    const count = 3000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const palette = [
      new THREE.Color(0xf6f8ff),
      new THREE.Color(0xc2dcff),
      new THREE.Color(0xffe7bd),
      new THREE.Color(0xffcfa0),
      new THREE.Color(0xdbe8ff)
    ];

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 70 + Math.random() * 12;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const c = palette[Math.floor(Math.random() * palette.length)];
      const magRand = Math.random();
      const bright = magRand < 0.85 ? 0.35 + Math.random() * 0.45 : 0.78 + Math.random() * 0.22;
      colors[i * 3] = c.r * bright;
      colors[i * 3 + 1] = c.g * bright;
      colors[i * 3 + 2] = c.b * bright;

      sizes[i] = magRand < 0.86
        ? 1.1 + Math.random() * 1.1
        : magRand < 0.98
          ? 2.2 + Math.random() * 1.4
          : 3.8 + Math.random() * 1.8;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.starUniforms = {
      uOpacity: { value: 0.95 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
    };

    const starMat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = clamp(aSize * uPixelRatio, 1.0, 14.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        uniform float uOpacity;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5) discard;
          float core = exp(-d * d * 26.0);
          float halo = exp(-d * d * 7.5) * 0.35;
          float alpha = (core + halo) * uOpacity;
          gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.65), alpha);
        }
      `
    });

    this.starPoints = new THREE.Points(geo, starMat);
    this.root.add(this.starPoints);
  }

  _buildRunningAsteroids() {
    const asteroidMap = this._loadTex('assets/textures/moon.jpg', true);
    asteroidMap.wrapS = THREE.RepeatWrapping;
    asteroidMap.wrapT = THREE.RepeatWrapping;
    const asteroidBump = this._loadTex('assets/textures/moon.jpg', false);
    asteroidBump.wrapS = THREE.RepeatWrapping;
    asteroidBump.wrapT = THREE.RepeatWrapping;

    const rockMat = new THREE.MeshStandardMaterial({
      map: asteroidMap,
      bumpMap: asteroidBump,
      bumpScale: 0.085,
      roughness: 0.92,
      metalness: 0.14
    });

    // Deterministic seeded PRNG (Mulberry32) so all boulders look organic yet repeatable
    const createRng = (seedInit) => {
      let a = (seedInit * 2654435761) >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const createCrateredBoulderGeometry = (seed) => {
      const rand = createRng(seed);
      const geo = new THREE.IcosahedronGeometry(1.0, 4);
      const posAttr = geo.attributes.position;
      const count = posAttr.count;

      // Triaxial asteroid proportions + macro ridges
      const elong = new THREE.Vector3(
        0.78 + rand() * 0.58,
        0.58 + rand() * 0.38,
        0.74 + rand() * 0.54
      );
      const phase1 = rand() * Math.PI * 2;
      const phase2 = rand() * Math.PI * 2;
      const phase3 = rand() * Math.PI * 2;

      // 8 parabolic impact craters with raised ejecta rims
      const craters = [];
      for (let c = 0; c < 8; c++) {
        const theta = rand() * Math.PI * 2;
        const z = rand() * 2 - 1;
        const rXY = Math.sqrt(Math.max(0, 1 - z * z));
        craters.push({
          center: new THREE.Vector3(rXY * Math.cos(theta), z, rXY * Math.sin(theta)),
          radius: 0.22 + rand() * 0.24,
          depth: 0.07 + rand() * 0.11
        });
      }

      const origKeys = new Array(count);
      const tmp = new THREE.Vector3();
      const dir = new THREE.Vector3();

      for (let i = 0; i < count; i++) {
        tmp.fromBufferAttribute(posAttr, i);
        // Save quantized spherical coordinate key so shared non-indexed vertices weld normals seamlessly
        origKeys[i] = `${Math.round(tmp.x * 1e4)}_${Math.round(tmp.y * 1e4)}_${Math.round(tmp.z * 1e4)}`;
        dir.copy(tmp).normalize();

        // Multi-octave rock contour displacement
        const n1 = Math.sin(dir.x * 2.7 + phase1) * Math.cos(dir.y * 2.3 - dir.z * 2.1 + phase2);
        const n2 = Math.sin(dir.y * 5.4 + dir.z * 4.9 + phase2) * Math.cos(dir.x * 4.6 + phase3);
        const n3 = Math.sin(dir.z * 11.2 - dir.x * 9.8 + phase3) * 0.5;
        let r = 0.88 + 0.17 * n1 + 0.09 * n2 + 0.035 * n3;

        // Carve impact craters + raised rims
        for (const cr of craters) {
          const dot = THREE.MathUtils.clamp(dir.dot(cr.center), -1, 1);
          const angDist = Math.acos(dot);
          const u = angDist / cr.radius;
          if (u < 1.38) {
            if (u < 1.0) {
              // Concave parabolic bowl
              r -= (1.0 - u * u) * cr.depth;
            }
            // Subtle raised crater rim peaking just outside u = 1.04
            const rim = Math.exp(-Math.pow((u - 1.04) / 0.17, 2)) * cr.depth * 0.36;
            r += rim;
          }
        }

        tmp.copy(dir).multiplyScalar(r);
        tmp.multiply(elong);
        posAttr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }

      // Compute smooth shared normals across triangle seam boundaries
      const normAccum = new Map();
      const pA = new THREE.Vector3();
      const pB = new THREE.Vector3();
      const pC = new THREE.Vector3();
      const ab = new THREE.Vector3();
      const ac = new THREE.Vector3();
      const faceN = new THREE.Vector3();

      for (let i = 0; i < count; i += 3) {
        pA.fromBufferAttribute(posAttr, i);
        pB.fromBufferAttribute(posAttr, i + 1);
        pC.fromBufferAttribute(posAttr, i + 2);
        ab.subVectors(pB, pA);
        ac.subVectors(pC, pA);
        faceN.crossVectors(ab, ac);

        for (const idx of [i, i + 1, i + 2]) {
          const k = origKeys[idx];
          let acc = normAccum.get(k);
          if (!acc) {
            acc = new THREE.Vector3();
            normAccum.set(k, acc);
          }
          acc.add(faceN);
        }
      }

      const normAttr = geo.attributes.normal;
      for (let i = 0; i < count; i++) {
        const n = normAccum.get(origKeys[i]);
        if (n && n.lengthSq() > 1e-10) {
          n.normalize();
          normAttr.setXYZ(i, n.x, n.y, n.z);
        }
      }
      normAttr.needsUpdate = true;
      posAttr.needsUpdate = true;
      geo.computeBoundingSphere();
      return geo;
    };

    const protos = [
      { geo: createCrateredBoulderGeometry(17), count: 38 },
      { geo: createCrateredBoulderGeometry(43), count: 36 },
      { geo: createCrateredBoulderGeometry(79), count: 36 },
      { geo: createCrateredBoulderGeometry(113), count: 35 },
      { geo: createCrateredBoulderGeometry(157), count: 35 }
    ];

    // Natural carbonaceous (C), silicate (S), and metallic (M) chondrite hues
    const meteoriteTones = [
      new THREE.Color(0x6e6a64), // C-type dark carbonaceous
      new THREE.Color(0x888178), // Basaltic ash
      new THREE.Color(0xa19688), // S-type chondrite regolith
      new THREE.Color(0xb2a18c), // Warm silicate iron oxide tint
      new THREE.Color(0x7c8085)  // M-type nickel-iron slate
    ];

    const dummy = new THREE.Object3D();
    const orbitVec = new THREE.Vector3();
    const tiltEuler = new THREE.Euler();

    for (const proto of protos) {
      const mesh = new THREE.InstancedMesh(proto.geo, rockMat, proto.count);
      const items = [];

      for (let i = 0; i < proto.count; i++) {
        const isSkyBelt = i >= Math.floor(proto.count * 0.65);
        // Minimum orbital radius >= 26.5 keeps all boulders outside max Space POV zoom shell (r <= 24)
        const orbitRadius = isSkyBelt
          ? 28.5 + Math.random() * 28
          : 26.5 + Math.random() * 24;
        const orbitAngle = Math.random() * Math.PI * 2;
        const orbitEcc = 1.0 + (Math.random() - 0.5) * 0.14;
        const orbitTiltX = isSkyBelt
          ? (Math.random() - 0.5) * 0.52
          : (Math.random() - 0.5) * 0.34;
        const orbitTiltZ = (Math.random() - 0.5) * 0.30;
        const orbitY = isSkyBelt
          ? 8 + Math.random() * 20
          : -5 + Math.random() * 15;

        // Kepler's 3rd Law scaling: angular velocity proportional to r^(-3/2)
        const angSpeed = (5.2 / Math.pow(orbitRadius, 1.5)) * (0.88 + Math.random() * 0.28);

        const scale = 0.24 + Math.pow(Math.random(), 1.85) * 0.62;
        const rot = new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );
        const spin = new THREE.Vector3(
          (Math.random() - 0.5) * 0.42,
          (Math.random() - 0.5) * 0.48,
          (Math.random() - 0.5) * 0.36
        );

        const it = {
          orbitRadius,
          orbitAngle,
          orbitEcc,
          orbitTiltX,
          orbitTiltZ,
          orbitY,
          angSpeed,
          scale,
          rot,
          spin
        };

        tiltEuler.set(it.orbitTiltX, 0, it.orbitTiltZ);
        orbitVec
          .set(
            Math.cos(it.orbitAngle) * it.orbitRadius,
            it.orbitY,
            Math.sin(it.orbitAngle) * it.orbitRadius * it.orbitEcc
          )
          .applyEuler(tiltEuler);

        dummy.position.copy(orbitVec);
        dummy.rotation.copy(it.rot);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, meteoriteTones[Math.floor(Math.random() * meteoriteTones.length)]);

        items.push(it);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.root.add(mesh);
      this.asteroids.push({ mesh, items });
    }
  }

  _buildEarth() {
    this.earthGroup = new THREE.Group();
    this.earthGroup.position.copy(EARTH_SPACE_POS);
    this.root.add(this.earthGroup);

    const dayTex = this._loadTex('assets/textures/earth-day.jpg', true);
    const nightTex = this._loadTex('assets/textures/earth-night.jpg', true);
    const waterTex = this._loadTex('assets/textures/earth-water.png', false);
    const normalTex = this._loadTex('assets/textures/earth-normal.jpg', false);
    const cloudTex = this._loadTex('assets/textures/earth-clouds.png', true);
    cloudTex.wrapS = THREE.RepeatWrapping;

    this.earthUniforms = {
      uDayTex: { value: dayTex },
      uNightTex: { value: nightTex },
      uWaterTex: { value: waterTex },
      uNormalTex: { value: normalTex },
      uCloudTex: { value: cloudTex },
      uCloudOffset: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 0.3, 0.95) }
    };

    const earthMat = new THREE.ShaderMaterial({
      uniforms: this.earthUniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldTangent;
        varying vec3 vWorldBitangent;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;

          vec3 localN = normalize(normal);
          // Analytical spherical tangent along increasing phi (+u / East) to avoid UV seams
          vec3 localT = length(position.xz) > 0.0001
            ? normalize(vec3(position.z, 0.0, -position.x))
            : vec3(1.0, 0.0, 0.0);
          vec3 localB = normalize(cross(localN, localT));

          mat3 m3 = mat3(modelMatrix);
          vWorldNormal = normalize(m3 * localN);
          vWorldTangent = normalize(m3 * localT);
          vWorldBitangent = normalize(m3 * localB);

          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldTangent;
        varying vec3 vWorldBitangent;
        varying vec3 vWorldPos;

        uniform sampler2D uDayTex;
        uniform sampler2D uNightTex;
        uniform sampler2D uWaterTex;
        uniform sampler2D uNormalTex;
        uniform sampler2D uCloudTex;
        uniform float uCloudOffset;
        uniform vec3 uSunDir;

        void main() {
          vec3 nGeo = normalize(vWorldNormal);
          vec3 tW = normalize(vWorldTangent);
          vec3 bW = normalize(vWorldBitangent);

          // Sample terrain normal relief (stronger on land)
          vec3 mapN = texture2D(uNormalTex, vUv).xyz * 2.0 - 1.0;
          float waterMask = texture2D(uWaterTex, vUv).r;
          mapN.xy *= mix(0.75, 0.06, waterMask);
          vec3 nPerturbed = normalize(tW * mapN.x + bW * mapN.y + nGeo * mapN.z);

          vec3 s = normalize(uSunDir);
          vec3 v = normalize(cameraPosition - vWorldPos);

          float ndlGeo = dot(nGeo, s);
          float ndlTerrain = max(0.0, dot(nPerturbed, s));

          float dayMix = smoothstep(-0.14, 0.22, ndlGeo);
          float twiBand = exp(-pow(ndlGeo * 6.5, 2.0));

          vec3 dayMap = texture2D(uDayTex, vUv).rgb;
          vec3 nightMap = texture2D(uNightTex, vUv).rgb;

          // Subtle soft cloud shadows cast onto sunlit ground/ocean
          vec2 cloudUv = vec2(fract(vUv.x - uCloudOffset + 0.004), clamp(vUv.y - 0.003, 0.0, 1.0));
          float cloudShadow = texture2D(uCloudTex, cloudUv).a;
          float shadowAtten = 1.0 - cloudShadow * 0.26 * dayMix;

          // Blinn-Phong solar ocean glint strictly on water
          vec3 halfVec = normalize(s + v);
          float spec = pow(max(0.0, dot(nGeo, halfVec)), 52.0) * waterMask * smoothstep(0.0, 0.25, ndlGeo);

          vec3 dayCol = dayMap * (0.09 + 1.12 * ndlTerrain) * shadowAtten + vec3(1.0, 0.92, 0.78) * spec * 0.45;
          vec3 nightCol = dayMap * 0.018 + nightMap * 1.65 * (1.0 - smoothstep(-0.20, 0.14, ndlGeo));

          vec3 col = mix(nightCol, dayCol, dayMix);

          // Warm natural sunrise/sunset terminator scatter band across real continents & oceans
          col += vec3(0.96, 0.46, 0.15) * twiBand * 0.26;

          // Subtle Rayleigh limb scatter on sunlit hemisphere
          float rim = pow(1.0 - max(0.0, dot(nGeo, v)), 3.2);
          col += vec3(0.32, 0.64, 0.98) * rim * (0.28 * dayMix);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 96, 64),
      earthMat
    );
    this.earthMesh.userData = { interactiveType: 'earth' };
    this.earthGroup.add(this.earthMesh);
    this.earthHitMeshes.push(this.earthMesh);

    // Real NASA Swirling Satellite Cloud Layer
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCloudTex: { value: cloudTex },
        uSunDir: this.earthUniforms.uSunDir
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        uniform sampler2D uCloudTex;
        uniform vec3 uSunDir;
        void main() {
          float c = texture2D(uCloudTex, vUv).a;
          float ndl = dot(normalize(vWorldNormal), normalize(uSunDir));
          float lit = smoothstep(-0.18, 0.28, ndl);
          float twi = exp(-pow(ndl * 6.0, 2.0));
          vec3 cloudCol = mix(vec3(0.025, 0.035, 0.06), vec3(0.98, 0.98, 1.0), lit);
          cloudCol = mix(cloudCol, vec3(1.0, 0.60, 0.30), twi * 0.42);
          gl_FragColor = vec4(cloudCol, c * (0.14 + 0.78 * lit));
        }
      `
    });
    this.cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.011, 72, 48),
      this.cloudMat
    );
    this.earthGroup.add(this.cloudMesh);

    // Natural FrontSide orbital atmosphere crescent
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSunDir: this.earthUniforms.uSunDir
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform vec3 uSunDir;
        void main() {
          vec3 n = normalize(vNormal);
          float fresnel = pow(1.0 - clamp(dot(n, normalize(vViewDir)), 0.0, 1.0), 3.6);
          float sunSide = smoothstep(-0.22, 0.72, dot(n, normalize(uSunDir)));
          vec3 col = mix(vec3(0.10, 0.22, 0.45), vec3(0.45, 0.78, 1.0), sunSide);
          gl_FragColor = vec4(col, fresnel * (0.08 + 0.65 * sunSide));
        }
      `
    });
    const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.028, 64, 48), atmoMat);
    this.earthGroup.add(atmoMesh);

    // Delicate hairline Timezone Meridian along front +Z
    const meridianGeo = new THREE.TorusGeometry(EARTH_RADIUS + 0.02, 0.007, 10, 72, Math.PI);
    const meridianMat = new THREE.MeshBasicMaterial({
      color: GOLD_HEX,
      transparent: true,
      opacity: 0.44
    });
    const meridianArc = new THREE.Mesh(meridianGeo, meridianMat);
    meridianArc.rotation.y = -Math.PI / 2;
    meridianArc.rotation.z = -Math.PI / 2;
    this.earthGroup.add(meridianArc);

    // Observer beacon pin on Timezone Meridian
    this.observerPin = new THREE.Group();
    const pinDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({ color: GOLD_BRIGHT_HEX })
    );
    const pinRing = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.115, 24),
      new THREE.MeshBasicMaterial({ color: GOLD_HEX, side: THREE.DoubleSide })
    );
    this.observerPin.add(pinDot, pinRing);
    this.earthGroup.add(this.observerPin);

    this._buildCountryPins();

    // Subtle lunar orbital track
    const orbitGeo = new THREE.TorusGeometry(MOON_SPACE_DIST, 0.009, 8, 96);
    orbitGeo.rotateX(Math.PI / 2);
    this.moonOrbitRing = new THREE.Mesh(
      orbitGeo,
      new THREE.MeshBasicMaterial({
        color: 0x6e695d,
        transparent: true,
        opacity: 0.28
      })
    );
    this.earthGroup.add(this.moonOrbitRing);
  }

  _buildCountryPins() {
    const r = EARTH_RADIUS + 0.032;
    for (const c of COUNTRY_TIMEZONES) {
      if (c.id === 'local') continue;
      const phi = Math.PI + c.lonDeg * DEG_TO_RAD;
      const theta = (90 - c.latDeg) * DEG_TO_RAD;

      const x = -r * Math.cos(phi) * Math.sin(theta);
      const y = r * Math.cos(theta);
      const z = r * Math.sin(phi) * Math.sin(theta);

      const pinGroup = new THREE.Group();
      pinGroup.position.set(x, y, z);

      const mat = new THREE.MeshBasicMaterial({ color: 0xe6c373 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), mat);
      pinGroup.add(head);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.userData = { interactiveType: 'countryPin', countryId: c.id };
      pinGroup.add(hit);

      this.earthMesh.add(pinGroup);
      this.earthHitMeshes.push(hit);
      this.countryPinMap.set(c.id, { pinGroup, head, mat });
    }
  }

  highlightCountryPin(countryId) {
    this.selectedCountryId = countryId;
    for (const [id, entry] of this.countryPinMap.entries()) {
      const active = id === countryId;
      entry.mat.color.setHex(active ? 0xfff0b8 : 0xd6ac56);
      entry.head.scale.setScalar(active ? 1.55 : 1.0);
    }
  }

  worldPointToLatLon(worldPoint) {
    const local = this.earthMesh.worldToLocal(worldPoint.clone()).normalize();
    const latDeg = Math.asin(Math.max(-1, Math.min(1, local.y))) * RAD_TO_DEG;
    const phi = Math.atan2(local.z, -local.x);
    const lonDeg = ((phi - Math.PI + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * RAD_TO_DEG;
    return { latDeg, lonDeg };
  }

  _buildMoon() {
    const moonTex = this._loadTex('assets/textures/moon.jpg', true);
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      bumpMap: moonTex,
      bumpScale: 0.035,
      roughness: 0.94,
      metalness: 0.02
    });

    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.58, 48, 36), moonMat);
    this.moonMesh.castShadow = true;
    this.moonMesh.receiveShadow = true;
    this.root.add(this.moonMesh);
  }

  _buildSun() {
    this.sunGroup = new THREE.Group();
    this.root.add(this.sunGroup);

    this.sunUniforms = {
      uTime: { value: 0.0 }
    };

    const sunMat = new THREE.ShaderMaterial({
      uniforms: this.sunUniforms,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        uniform float uTime;

        float hash3(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
            mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
            f.z
          );
        }

        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vViewPos);
          float mu = clamp(dot(n, v), 0.0, 1.0);
          float limb = pow(mu, 0.55);

          vec3 gp = vLocalPos * 7.5 + vec3(uTime * 0.06, -uTime * 0.04, uTime * 0.03);
          float gran = noise3(gp) * 0.65 + noise3(gp * 2.15) * 0.35;

          vec3 coreCol = vec3(1.0, 0.985, 0.89);
          vec3 midCol  = vec3(1.0, 0.82, 0.38);
          vec3 rimCol  = vec3(0.95, 0.44, 0.09);

          vec3 col = mix(
            rimCol,
            mix(midCol, coreCol, smoothstep(0.35, 0.95, limb)),
            smoothstep(0.0, 0.68, limb)
          );
          col *= 0.88 + 0.24 * gran;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.86, 40, 32),
      sunMat
    );
    this.sunGroup.add(this.sunSphere);

    const innerCoronaTex = this._createSoftDiscTexture(256, '#ffe5a3', 1.0);
    const innerCorona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: innerCoronaTex,
        color: 0xffe29a,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    innerCorona.scale.set(2.9, 2.9, 1);
    this.sunGroup.add(innerCorona);

    const outerCoronaTex = this._createSoftDiscTexture(256, '#ffab48', 0.85);
    const outerCorona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: outerCoronaTex,
        color: 0xffb35c,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    outerCorona.scale.set(5.2, 5.2, 1);
    this.sunGroup.add(outerCorona);

    this.solarLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
    this.scene.add(this.solarLight);
  }

  _buildEarthPovHorizon() {
    this.horizonGroup = new THREE.Group();
    this.horizonGroup.visible = false;
    this.root.add(this.horizonGroup);

    const groundGeo = new THREE.SphereGeometry(42, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.34);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x101822,
      roughness: 0.88,
      metalness: 0.12
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = -42.45;
    groundMesh.receiveShadow = true;
    this.horizonGroup.add(groundMesh);
    this.povGroundMat = groundMat;

    const horizonRim = new THREE.Mesh(
      new THREE.TorusGeometry(23.5, 0.048, 8, 96),
      new THREE.MeshBasicMaterial({ color: GOLD_HEX, transparent: true, opacity: 0.42 })
    );
    horizonRim.rotation.x = Math.PI / 2;
    horizonRim.position.y = -0.55;
    this.horizonGroup.add(horizonRim);

    const meridianSkyArc = new THREE.Mesh(
      new THREE.TorusGeometry(22.8, 0.036, 8, 72, Math.PI),
      new THREE.MeshBasicMaterial({ color: GOLD_HEX, transparent: true, opacity: 0.28 })
    );
    meridianSkyArc.rotation.y = Math.PI / 2;
    this.horizonGroup.add(meridianSkyArc);

    const cardinals = [
      { label: 'N', pos: [0, 0.4, -22.2], color: '#e2bc6b' },
      { label: 'E · DAWN', pos: [22.2, 0.4, 0], color: '#f5d28a' },
      { label: 'S · NOON', pos: [0, 0.4, 22.2], color: '#f3efe6' },
      { label: 'W · DUSK', pos: [-22.2, 0.4, 0], color: '#e89d65' }
    ];
    for (const c of cardinals) {
      const sprite = this._createLabelSprite(c.label, c.color);
      sprite.position.set(c.pos[0], c.pos[1], c.pos[2]);
      sprite.scale.set(3.4, 1.35, 1);
      this.horizonGroup.add(sprite);
    }
  }

  setPovMode(isPov, instant = false) {
    this.povTarget = isPov ? 1 : 0;
    if (instant) {
      this.povMix = this.povTarget;
      this.skyUniforms.uPovMix.value = this.povMix;
    }
  }

  update(celestial, dt, reducedMotion = false) {
    if (!celestial) return;

    this.povMix += (this.povTarget - this.povMix) * (reducedMotion ? 1 : Math.min(1, dt * 6.5));
    const inPov = this.povMix > 0.5;

    const tzLonRad = celestial.tzLonDeg * DEG_TO_RAD;
    this.anim.targetEarthRotY = -Math.PI / 2 - tzLonRad;

    if (!this.anim.initialized || reducedMotion) {
      this.anim.initialized = true;
      this.anim.sunHaDeg = celestial.sunHaDeg;
      this.anim.sunDecDeg = celestial.sunDecDeg;
      this.anim.moonHaDeg = celestial.moonHaDeg;
      this.anim.moonDecDeg = celestial.moonDecDeg;
      this.anim.earthRotY = this.anim.targetEarthRotY;
    } else {
      const rate = Math.min(1, dt * 4.8);
      this.anim.sunHaDeg += shortestDegDelta(this.anim.sunHaDeg, celestial.sunHaDeg) * rate;
      this.anim.sunDecDeg += (celestial.sunDecDeg - this.anim.sunDecDeg) * rate;
      this.anim.moonHaDeg += shortestDegDelta(this.anim.moonHaDeg, celestial.moonHaDeg) * rate;
      this.anim.moonDecDeg += (celestial.moonDecDeg - this.anim.moonDecDeg) * rate;
      this.anim.earthRotY += shortestRadDelta(this.anim.earthRotY, this.anim.targetEarthRotY) * Math.min(1, dt * 5.8);
      this.anim.cloudOffset += dt * 0.008;
    }

    const animSunHorizon = equatorialToHorizon(this.anim.sunHaDeg, this.anim.sunDecDeg, celestial.observerLatDeg);
    const animMoonHorizon = equatorialToHorizon(this.anim.moonHaDeg, this.anim.moonDecDeg, celestial.observerLatDeg);
    const animSky = computeSkyFactors(animSunHorizon.altDeg, this.anim.sunHaDeg);

    const sunDirOrrery = new THREE.Vector3(...orreryVector(this.anim.sunHaDeg, this.anim.sunDecDeg)).normalize();
    const moonDirOrrery = new THREE.Vector3(...orreryVector(this.anim.moonHaDeg, this.anim.moonDecDeg)).normalize();
    const sunDirPov = new THREE.Vector3(...animSunHorizon.vec).normalize();
    const moonDirPov = new THREE.Vector3(...animMoonHorizon.vec).normalize();

    this.skyUniforms.uPovMix.value = this.povMix;
    this.skyUniforms.uDayFactor.value = animSky.dayFactor;
    this.skyUniforms.uTwilightFactor.value = animSky.twilightFactor;

    if (!reducedMotion) {
      this.sunUniforms.uTime.value += dt;
    }

    this.starPoints.rotation.y = -celestial.lstDeg * DEG_TO_RAD * 0.45;
    this.starUniforms.uOpacity.value = inPov
      ? Math.max(0.06, 0.95 * (1 - animSky.dayFactor * 0.90))
      : 0.95;

    this.earthMesh.rotation.y = this.anim.earthRotY;
    this.cloudMesh.rotation.y = this.anim.earthRotY + this.anim.cloudOffset;
    this.earthUniforms.uCloudOffset.value = (this.anim.cloudOffset / (2 * Math.PI)) % 1;

    const latRad = celestial.observerLatDeg * DEG_TO_RAD;
    this.observerPin.position.set(
      0,
      (EARTH_RADIUS + 0.045) * Math.sin(latRad),
      (EARTH_RADIUS + 0.045) * Math.cos(latRad)
    );
    this.observerPin.lookAt(
      0,
      (EARTH_RADIUS + 1.0) * Math.sin(latRad),
      (EARTH_RADIUS + 1.0) * Math.cos(latRad)
    );

    this.earthUniforms.uSunDir.value.copy(sunDirOrrery);

    this.earthGroup.visible = !inPov;
    this.horizonGroup.visible = inPov;

    if (inPov) {
      this.skyUniforms.uSunDir.value.copy(sunDirPov);
      this.sunGroup.position.copy(sunDirPov).multiplyScalar(42);
      this.sunGroup.scale.setScalar(1.45);
      this.moonMesh.position.copy(moonDirPov).multiplyScalar(32);
      this.moonMesh.scale.setScalar(2.15);
      this.moonMesh.lookAt(0, 0, 0);

      this.solarLight.position.copy(sunDirPov).multiplyScalar(36);
      this.povGroundMat.color.setRGB(
        0.025 + 0.05 * animSky.dayFactor,
        0.038 + 0.08 * animSky.dayFactor,
        0.065 + 0.11 * animSky.dayFactor
      );
    } else {
      this.skyUniforms.uSunDir.value.copy(sunDirOrrery);
      // Elevate Sun orbit slightly above lower gear clusters so it stays clear of MONTH/HOUR gears
      const sunX = EARTH_SPACE_POS.x + sunDirOrrery.x * SUN_SPACE_DIST;
      const sunY = Math.max(1.85, EARTH_SPACE_POS.y + sunDirOrrery.y * SUN_SPACE_DIST * 0.58);
      const sunZ = EARTH_SPACE_POS.z + sunDirOrrery.z * SUN_SPACE_DIST;
      this.sunGroup.position.set(sunX, sunY, sunZ);
      this.sunGroup.scale.setScalar(1.0);
      this.moonMesh.position.copy(EARTH_SPACE_POS).addScaledVector(moonDirOrrery, MOON_SPACE_DIST);
      this.moonMesh.scale.setScalar(1.0);
      this.moonMesh.lookAt(EARTH_SPACE_POS);

      this.solarLight.position.copy(sunDirOrrery).multiplyScalar(24);
    }

    const dayCol = new THREE.Color(0xfff5df);
    const twiCol = new THREE.Color(0xff9c50);
    const nightCol = new THREE.Color(0x6e8dc2);
    const lightCol = nightCol
      .clone()
      .lerp(dayCol, animSky.dayFactor)
      .lerp(twiCol, animSky.twilightFactor * 0.72);
    this.solarLight.color.copy(lightCol);
    this.solarLight.intensity = 0.72 + 2.5 * animSky.dayFactor + 0.85 * animSky.twilightFactor;

    // Keplerian orbital progression & slow axial tumbling for cratered boulders
    if (!reducedMotion) {
      const dummy = new THREE.Object3D();
      const orbitVec = new THREE.Vector3();
      const tiltEuler = new THREE.Euler();
      for (const batch of this.asteroids) {
        const { mesh, items } = batch;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          it.orbitAngle += it.angSpeed * dt;
          if (it.orbitAngle > Math.PI * 2) it.orbitAngle -= Math.PI * 2;

          it.rot.x += it.spin.x * dt;
          it.rot.y += it.spin.y * dt;
          it.rot.z += it.spin.z * dt;

          tiltEuler.set(it.orbitTiltX, 0, it.orbitTiltZ);
          orbitVec
            .set(
              Math.cos(it.orbitAngle) * it.orbitRadius,
              it.orbitY,
              Math.sin(it.orbitAngle) * it.orbitRadius * it.orbitEcc
            )
            .applyEuler(tiltEuler);

          dummy.position.copy(orbitVec);
          dummy.rotation.copy(it.rot);
          dummy.scale.setScalar(it.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  _createSoftDiscTexture(size, colorHex, coreAlpha) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, `rgba(255,255,255,${coreAlpha})`);
    grad.addColorStop(0.28, colorHex);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _createLabelSprite(text, colorHex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(10, 12, 18, 0.78)';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(10, 14, 236, 68, 14);
    } else {
      ctx.rect(10, 14, 236, 68);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.font = '700 32px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 49);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  }
}
