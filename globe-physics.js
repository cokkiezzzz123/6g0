/*
 * Photo globe: sphere placement, outward-facing photo cards, and CSS3DRenderer
 * adapted from guiconga/6g0, index.html (initSphereGallery).
 * https://github.com/guiconga/6g0
 * Uses the original project's js/three.js and js/CSS3DRenderer.js unchanged.
 * New: arcball rotation, release velocity, friction, and optional WebGL core.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.PhotoGlobe = factory(root.THREE);
})(typeof window !== "undefined" ? window : this, function (THREE) {
  "use strict";
  if (!THREE) return null;

  // YOUR CONTROLS, BRO:
  // friction: 0.55 = longer spin; 1.30 = shorter spin. Keep it above zero.
  // webglCore: true uses a shaded WebGL sphere when the browser supports it.
  // There is NO automatic rotation or mouse-follow tilt.
  const SETTINGS = {
    friction: 0.85,
    stopSpeed: 0.012,
    maxSpeed: 7,
    releaseWindow: 0.12,
    webglCore: true
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  class SpinPhysics {
    constructor(options) {
      this.options = Object.assign({}, SETTINGS, options);
      if (!(this.options.friction > 0) || !(this.options.stopSpeed > 0))
        throw new Error("Globe friction and stopSpeed must be above zero.");
      this.orientation = new THREE.Quaternion();
      this.velocity = new THREE.Vector3();
      this.previous = new THREE.Vector3();
      this.delta = new THREE.Quaternion();
      this.axis = new THREE.Vector3();
      this.dragging = false;
      this.lastMoveTime = 0;
      this.reset();
    }
    reset() {
      this.orientation.setFromEuler(new THREE.Euler(-0.12, 0, 0));
      this.stop(); this.dragging = false;
    }
    stop() { this.velocity.set(0, 0, 0); }
    // Sphere centre and radius are in screen pixels. A hyperbolic outer region
    // avoids sudden jumps if a drag moves beyond the edge of the globe.
    project(x, y, geometry) {
      const px = (x - geometry.x) / geometry.radius;
      const py = (geometry.y - y) / geometry.radius;
      const distance2 = px * px + py * py;
      const z = distance2 <= 0.5 ? Math.sqrt(1 - distance2) : 0.5 / Math.sqrt(distance2);
      return new THREE.Vector3(px, py, z).normalize();
    }
    begin(x, y, time, geometry) {
      this.stop(); this.dragging = true;
      this.previous.copy(this.project(x, y, geometry));
      this.lastMoveTime = time;
    }
    move(x, y, time, geometry) {
      if (!this.dragging) return;
      const elapsed = time - this.lastMoveTime;
      if (!(elapsed > 0)) return;
      const next = this.project(x, y, geometry);
      this.delta.setFromUnitVectors(this.previous, next).normalize();
      this.orientation.premultiply(this.delta).normalize();
      const sine = Math.hypot(this.delta.x, this.delta.y, this.delta.z);
      const angle = 2 * Math.atan2(sine, Math.abs(this.delta.w));
      if (sine > 1e-8 && angle > 1e-7) {
        this.axis.set(this.delta.x, this.delta.y, this.delta.z).divideScalar(sine);
        const speed = Math.min(this.options.maxSpeed, angle / Math.max(elapsed, 1 / 1000));
        const sample = this.axis.clone().multiplyScalar(speed);
        // Exponential smoothing uses seconds, not event count or frame count.
        const blend = 1 - Math.exp(-elapsed / 0.035);
        this.velocity.lerp(sample, blend);
      } else {
        this.velocity.multiplyScalar(Math.exp(-elapsed / 0.04));
      }
      this.previous.copy(next); this.lastMoveTime = time;
    }
    end(time, cancelled) {
      if (!this.dragging) return;
      this.dragging = false;
      // Holding still before letting go means "stop", not another launch.
      if (cancelled || time - this.lastMoveTime > this.options.releaseWindow) this.stop();
    }
    step(seconds) {
      if (this.dragging || !(seconds > 0)) return;
      const speed = this.velocity.length();
      if (speed <= this.options.stopSpeed) { this.stop(); return; }
      const friction = this.options.friction;
      const untilStopped = Math.log(speed / this.options.stopSpeed) / friction;
      const dt = Math.min(seconds, untilStopped);
      const decay = Math.exp(-friction * dt);
      // Exact integral of decaying angular velocity: same spin at 30/60/144 Hz.
      const angle = speed * (1 - decay) / friction;
      this.axis.copy(this.velocity).divideScalar(speed);
      this.delta.setFromAxisAngle(this.axis, angle);
      this.orientation.premultiply(this.delta).normalize();
      this.velocity.multiplyScalar(decay);
      if (seconds >= untilStopped) this.stop();
    }
  }

  class GlobeRenderer {
    constructor(element, tiles, rows) {
      this.element = element; this.tiles = tiles; this.rows = rows || 10;
      this.physics = new SpinPhysics();
      this.scene = new THREE.Scene();
      this.group = new THREE.Group(); this.scene.add(this.group);
      this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 10000);
      this.renderer = new THREE.CSS3DRenderer();
      this.renderer.domElement.className = "globe-css-renderer";
      Object.assign(this.renderer.domElement.style, {
        position: "absolute", inset: "0", pointerEvents: "none", visibility: "hidden"
      });
      element.appendChild(this.renderer.domElement);
      this.active = false; this.width = innerWidth; this.height = innerHeight;
      this.radius = 220; this.enter = 1;
      this.world = new THREE.Vector3(); this.projected = new THREE.Vector3();
      this.normal = new THREE.Vector3(); this.cameraRay = new THREE.Vector3();
      this.objects = [];

      // Same spherical positions and lookAt(outward) construction as the
      // classmate's original, rather than flattened 2D photo billboards.
      const spherical = new THREE.Spherical(), outward = new THREE.Vector3();
      tiles.forEach(tile => {
        const wrapper = document.createElement("div");
        wrapper.className = "globe-photo-surface";
        Object.assign(wrapper.style, {
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transformStyle: "preserve-3d", pointerEvents: "none"
        });
        const object = new THREE.CSS3DObject(wrapper);
        spherical.set(1, tile.phi, tile.theta);
        const unit = new THREE.Vector3().setFromSpherical(spherical);
        object.position.copy(unit);
        object.up.set(0, 1, 0);
        outward.copy(unit).multiplyScalar(2);
        object.lookAt(outward);
        this.group.add(object);
        this.objects.push({ object, wrapper, unit });
      });

      this.fallbackCore = document.createElement("div");
      this.fallbackCore.setAttribute("aria-hidden", "true");
      Object.assign(this.fallbackCore.style, {
        position: "absolute", left: "50%", top: "44%", borderRadius: "50%",
        transform: "translate(-50%,-50%)", pointerEvents: "none",
        background: "radial-gradient(circle at 30% 23%,#49364c,#211529 38%,#0b0713 76%)",
        border: "1px solid #e6b4d327", boxShadow: "0 0 50px #d996bc12",
        visibility: "hidden"
      });
      element.insertBefore(this.fallbackCore, this.renderer.domElement);
      this.setupWebGL();
    }
    setupWebGL() {
      this.gpu = null; this.gpuLost = false;
      if (!SETTINGS.webglCore) { this.reportRenderer(); return; }
      const canvas = document.createElement("canvas");
      let gl;
      try {
        gl = canvas.getContext("webgl", { alpha: true, antialias: true }) ||
          canvas.getContext("experimental-webgl", { alpha: true, antialias: true });
        if (!gl) { this.reportRenderer(); return; }
        this.gpu = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
        this.gpu.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
        this.gpu.setClearColor(0x000000, 0);
        Object.assign(canvas.style, { position: "absolute", inset: "0", pointerEvents: "none", visibility: "hidden" });
        canvas.setAttribute("aria-hidden", "true");
        this.element.insertBefore(canvas, this.renderer.domElement);
        this.gpuScene = new THREE.Scene();
        this.core = new THREE.Mesh(
          new THREE.SphereGeometry(1, 40, 28),
          new THREE.MeshPhongMaterial({ color: 0x332039, shininess: 22, specular: 0x77556a })
        );
        this.gpuScene.add(this.core);
        this.gpuScene.add(new THREE.AmbientLight(0xb8a2c9, 0.6));
        const key = new THREE.DirectionalLight(0xffe2d2, 0.9);
        key.position.set(-3, 4, 5); this.gpuScene.add(key);
        const rim = new THREE.DirectionalLight(0xc189bc, 0.5);
        rim.position.set(4, -1, 1); this.gpuScene.add(rim);
        canvas.addEventListener("webglcontextlost", event => {
          event.preventDefault(); this.gpuLost = true; this.reportRenderer();
        });
        canvas.addEventListener("webglcontextrestored", () => {
          this.gpuLost = false; this.reportRenderer();
        });
      } catch (_) {
        if (this.gpu) this.gpu.dispose();
        this.gpu = null; canvas.remove();
      }
      this.reportRenderer();
    }
    reportRenderer() {
      // Readable in DevTools for the user's GPU test; no visible technical badge.
      document.body.dataset.globeRenderer = this.gpu && !this.gpuLost ? "css3d+webgl" : "css3d";
    }
    resize(width, height, radius) {
      this.width = width; this.height = height; this.radius = radius;
      this.camera.aspect = width / height;
      this.camera.position.z = height / (2 * Math.tan(20 * Math.PI / 180));
      this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
      this.renderer.setSize(width, height);
      if (this.gpu) this.gpu.setSize(width, height);
      // Square, tangent cards sized to their spherical cells, as in the source.
      this.cardSize = Math.PI * radius / this.rows * 0.94;
      this.objects.forEach(item => {
        item.object.position.copy(item.unit).multiplyScalar(radius);
        item.wrapper.style.width = this.cardSize + "px";
        item.wrapper.style.height = this.cardSize + "px";
      });
      this.fallbackCore.style.width = radius * 1.98 + "px";
      this.fallbackCore.style.height = radius * 1.98 + "px";
      this.prepare(1);
    }
    geometry() {
      const distance = this.camera.position.z;
      return { x: this.width / 2, y: this.height * 0.44,
        radius: this.radius * distance / Math.sqrt(Math.max(1, distance * distance - this.radius * this.radius)) };
    }
    setActive(active) {
      if (this.active === active) return;
      this.active = active;
      this.renderer.domElement.style.visibility = active ? "visible" : "hidden";
      this.tiles.forEach((tile, i) => {
        if (active) {
          this.objects[i].wrapper.appendChild(tile.el);
          Object.assign(tile.el.style, {
            width: "100%", height: "100%", left: "0", top: "0", transform: "none",
            zIndex: "", boxShadow: "", backfaceVisibility: "hidden"
          });
        } else {
          this.element.appendChild(tile.el);
          tile.el.style.width = ""; tile.el.style.height = "";
          tile.el.style.backfaceVisibility = "";
        }
      });
      if (!active) {
        this.fallbackCore.style.visibility = "hidden";
        if (this.gpu) this.gpu.domElement.style.visibility = "hidden";
      }
    }
    prepare(enter) {
      this.enter = enter;
      this.group.position.set(0, this.height * 0.06, 0);
      this.group.quaternion.copy(this.physics.orientation);
      this.group.scale.setScalar(Math.max(0.0001, enter));
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);
    }
    position(index) {
      const item = this.objects[index], distance = this.camera.position.z;
      this.world.copy(item.unit).multiplyScalar(this.radius * this.enter)
        .applyQuaternion(this.physics.orientation).add(this.group.position);
      this.projected.copy(this.world).project(this.camera);
      this.normal.copy(item.unit).applyQuaternion(this.physics.orientation);
      this.cameraRay.copy(this.camera.position).sub(this.world).normalize();
      const facing = this.normal.dot(this.cameraRay);
      const magnification = distance / Math.max(1, distance - this.world.z);
      return {
        x: (this.projected.x * 0.5 + 0.5) * this.width,
        y: (-this.projected.y * 0.5 + 0.5) * this.height,
        scale: this.cardSize / (this.width < 600 ? 64 : 78) * magnification * this.enter,
        stretch: Math.max(0.08, facing), rotation: 0,
        opacity: facing > 0.025 ? Math.min(1, facing * 12) * Math.min(1, this.enter * 3) : 0,
        z: Math.round(200 + this.world.z)
      };
    }
    render() {
      const winners = new Map();
      this.tiles.forEach((tile, i) => {
        const p = this.position(i); tile.screen = p;
        this.objects[i].wrapper.style.visibility = p.opacity > 0 ? "visible" : "hidden";
        tile.el.style.opacity = String(p.opacity);
        tile.el.style.pointerEvents = p.opacity > 0.6 ? "auto" : "none";
        if (p.opacity > 0.6 && (!winners.has(tile.index) || p.z > winners.get(tile.index).screen.z))
          winners.set(tile.index, tile);
      });
      this.tiles.forEach(tile => {
        const accessible = winners.get(tile.index) === tile;
        tile.el.tabIndex = accessible ? 0 : -1;
        tile.el.setAttribute("aria-hidden", String(!accessible));
      });
      this.renderer.render(this.scene, this.camera);
      const useGPU = this.gpu && !this.gpuLost;
      this.fallbackCore.style.visibility = useGPU ? "hidden" : "visible";
      this.fallbackCore.style.opacity = String(Math.min(1, this.enter * 3));
      this.fallbackCore.style.transform = "translate(-50%,-50%) scale(" + this.enter + ")";
      if (this.gpu) {
        this.gpu.domElement.style.visibility = useGPU ? "visible" : "hidden";
        if (useGPU) {
          this.core.position.copy(this.group.position);
          this.core.quaternion.copy(this.physics.orientation);
          this.core.scale.setScalar(this.radius * this.enter * 0.988);
          this.gpu.render(this.gpuScene, this.camera);
        }
      }
    }
  }
  return { SETTINGS, SpinPhysics, GlobeRenderer };
});
