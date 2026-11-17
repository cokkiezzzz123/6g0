/* A small photo universe. No framework, account, or API key required.
 * True 3D globe + optional WebGL core: see globe-physics.js.
 * Keep image/anh1.jpg … image/anh10.jpg and image/nhac.mp3 from the original.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t), 3);
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;
  const images = Array.from({ length: 10 }, (_, i) => "image/anh" + (i + 1) + ".jpg");
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motionQuery.matches;
  motionQuery.addEventListener("change", e => { reduced = e.matches; });
  let seed = 2011;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const canvas = $("universe"), ctx = canvas.getContext("2d");
  const globe = $("globe"), gallery = $("gallery"), intro = $("intro");
  const envelope = $("envelope-button"), finale = $("finale"), replay = $("replay-button");
  const photoDialog = $("photo-dialog"), letterDialog = $("letter-dialog");
  const audio = $("background-music"), musicButton = $("music-button");
  const cursorStar = $("cursor-star"), flash = $("portal-flash"), plane = $("flight-plane");
  const hint = $("gesture-hint");
  let width = innerWidth, height = innerHeight, radius = 220, dpr = 1;
  let scene = "intro", sceneStart = performance.now(), lastFrame = sceneStart;
  let transition = null, restore = null, flashStart = 0, heartStart = 0;
  let yaw = 0, pitch = -.12, yawVelocity = 0, pitchVelocity = 0;
  let pointer = { x: width / 2, y: height / 2, px: width / 2, py: height / 2, active: false, speed: 0, movedAt: 0, type: "mouse" };
  let drag = null, lastDragAt = -1000, hovered = -1, selectedPhoto = 0, flipped = false;
  let activated = false, musicWanted = false, musicAttempt = 0, hiddenAt = 0;
  let stars = [], dust = [], bursts = [], rings = [], trails = [], textPoints = [];
  let lastFirework = 0, background;
  const tiles = [], heartPoints = [];

  // Filled heart: concentric versions of the classic heart curve.
  for (let ring = 1; ring <= 6; ring++) {
    for (let n = 0; n < ring * 6; n++) {
      const t = n / (ring * 6) * TAU, s = ring / 6;
      heartPoints.push({ x: Math.pow(Math.sin(t), 3) * s,
        y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 * s });
    }
  }
  // Latitude rows retain the tiled appearance of the original photo globe.
  for (let row = 0; row < 10; row++) {
    const phi = Math.PI * (row + .5) / 10;
    const cols = Math.max(3, Math.round(20 * Math.sin(phi)));
    for (let col = 0; col < cols; col++) {
      const theta = col / cols * TAU, index = tiles.length % images.length;
      const button = document.createElement("button");
      button.className = "photo-tile";
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute("aria-label", "Xem ảnh kỷ niệm " + (index + 1));
      button.dataset.index = String(index);
      const img = document.createElement("img");
      img.src = images[index]; img.alt = ""; img.draggable = false;
      button.append(img); globe.append(button);
      const tile = { el: button, index, phi, theta, x: Math.sin(phi) * Math.sin(theta),
        y: -Math.cos(phi), z: Math.sin(phi) * Math.cos(theta),
        angle: random() * TAU, depth: random() * 2.8, float: random() * TAU,
        screen: { x: width / 2, y: height / 2, scale: 0, stretch: 1, rotation: 0, opacity: 0, z: 0 } };
      button.addEventListener("pointerenter", () => { hovered = tiles.indexOf(tile); });
      button.addEventListener("pointerleave", () => { hovered = -1; });
      tiles.push(tile);
    }
  }
  const rigidGlobe = window.PhotoGlobe && window.THREE && window.THREE.CSS3DRenderer ?
    new window.PhotoGlobe.GlobeRenderer(globe, tiles, 10) : null;
  images.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src; img.alt = "Ảnh kỷ niệm " + (i + 1);
    img.style.setProperty("--tilt", (i % 2 ? 1.4 : -1.4) + "deg");
    $("collage").append(img);
  });

  function resize() {
    width = innerWidth; height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = Math.min(width * .29, height * .285, 230);
    if (rigidGlobe) rigidGlobe.resize(width, height, radius);
    stars = Array.from({ length: width < 600 ? 125 : 260 }, () => ({
      x: random() * width, y: random() * height, r: .35 + random() * 1.2,
      depth: .2 + random(), phase: random() * TAU, alpha: .2 + random() * .6
    }));
    dust = Array.from({ length: width < 600 ? 80 : 155 }, () => ({
      x: random() * width, y: random() * height, vx: (random() - .5) * .25,
      vy: (random() - .5) * .25, r: .5 + random() * 1.1, phase: random() * TAU
    }));
    if (ctx) {
      background = ctx.createRadialGradient(width * .5, height * .44, 0, width * .5, height * .44, Math.max(width, height) * .68);
      background.addColorStop(0, "#25172e"); background.addColorStop(.35, "#130e20"); background.addColorStop(1, "#070611");
      makeTextPoints();
    }
  }
  function makeTextPoints() {
    const off = document.createElement("canvas"), ox = off.getContext("2d");
    if (!ox) return;
    const fontSize = clamp(width * .06, 38, 76);
    off.width = Math.min(width, 950); off.height = 160;
    ox.font = "500 " + fontSize + "px Georgia"; ox.textAlign = "center"; ox.textBaseline = "middle";
    ox.fillStyle = "#fff"; ox.fillText("Gửi cô Nga", off.width / 2, 80);
    const data = ox.getImageData(0, 0, off.width, off.height).data;
    textPoints = [];
    for (let y = 0; y < off.height; y += 4) for (let x = 0; x < off.width; x += 4) {
      if (data[(y * off.width + x) * 4 + 3] > 100) textPoints.push({
        x: width / 2 + x - off.width / 2, y: height / 2 - 28 + y - 80,
        fromX: random() * width, fromY: random() * height, phase: random() * TAU
      });
    }
  }
  function setScene(next, now = performance.now()) {
    if (rigidGlobe && next !== "globe") {
      rigidGlobe.physics.stop();
      rigidGlobe.setActive(false);
    }
    scene = next; sceneStart = now; document.body.dataset.scene = next;
    intro.inert = next !== "intro";
    intro.setAttribute("aria-hidden", String(next !== "intro"));
    gallery.inert = next !== "globe"; finale.inert = next !== "finale";
    envelope.disabled = next !== "globe";
    replay.disabled = next !== "finale";
    if (next !== "globe") hint.classList.remove("show");
  }
  function burst(x, y, count = 40, power = 1) {
    if (reduced) return;
    for (let i = 0; i < count; i++) {
      const a = random() * TAU, speed = (.5 + random() * 3) * power;
      bursts.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 1, decay: .008 + random() * .012, r: .7 + random() * 1.3,
        color: random() > .4 ? "255,211,170" : "241,159,199" });
    }
    if (bursts.length > 500) bursts.splice(0, bursts.length - 500);
  }
  function calm() { return photoDialog.open || scene === "letter"; }
  function updateMusicButton() {
    const playing = !audio.paused && !audio.ended;
    musicButton.setAttribute("aria-pressed", String(playing));
    musicButton.setAttribute("aria-label", playing ? "Tắt nhạc" : "Bật nhạc");
  }
  async function playMusic() {
    const attempt = ++musicAttempt;
    try {
      await audio.play();
      if (attempt !== musicAttempt || !musicWanted) audio.pause();
    } catch (_) { /* Browser policy can block playback; the music button remains usable. */ }
    updateMusicButton();
  }
  function activate(event) {
    if (!activated && event.target.closest && event.target.closest("#music-button")) return;
    if (activated) return;
    activated = true; musicWanted = true; audio.volume = .55;
    void playMusic();
  }
  document.addEventListener("pointerdown", activate, { passive: true });
  document.addEventListener("keydown", e => {
    if (["Enter", " "].includes(e.key)) activate(e);
  });
  musicButton.addEventListener("click", () => {
    activated = true;
    musicWanted = audio.paused;
    if (musicWanted) { audio.volume = .55; void playMusic(); }
    else { musicAttempt++; audio.pause(); updateMusicButton(); }
  });
  audio.addEventListener("play", updateMusicButton);
  audio.addEventListener("pause", updateMusicButton);
  audio.addEventListener("error", () => {
    musicWanted = false; updateMusicButton();
    musicButton.setAttribute("aria-label", "Thử phát nhạc lại");
  });

  function showPhoto(index) {
    if (scene !== "globe" || performance.now() - lastDragAt < 250) return;
    if (rigidGlobe) rigidGlobe.physics.stop();
    selectedPhoto = (index + images.length) % images.length;
    $("large-photo").src = images[selectedPhoto];
    $("large-photo").alt = "Ảnh kỷ niệm " + (selectedPhoto + 1) + " cùng cô Nga";
    $("photo-count").textContent = String(selectedPhoto + 1).padStart(2, "0") + " / 10";
    hint.classList.remove("show");
    if (!photoDialog.open) photoDialog.showModal();
  }
  globe.addEventListener("click", e => {
    const tile = e.target.closest(".photo-tile");
    if (tile) showPhoto(Number(tile.dataset.index));
  });
  $("photo-close").addEventListener("click", () => photoDialog.close());
  $("photo-prev").addEventListener("click", () => showPhoto(selectedPhoto - 1));
  $("photo-next").addEventListener("click", () => showPhoto(selectedPhoto + 1));
  photoDialog.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault(); showPhoto(selectedPhoto + (e.key === "ArrowLeft" ? -1 : 1));
    }
  });
  photoDialog.addEventListener("click", e => { if (e.target === photoDialog) photoDialog.close(); });
  let swipe = null;
  $("large-photo").addEventListener("pointerdown", e => { swipe = { x: e.clientX, y: e.clientY }; });
  $("large-photo").addEventListener("pointerup", e => {
    if (swipe && Math.abs(e.clientX - swipe.x) > 40 && Math.abs(e.clientY - swipe.y) < 80)
      showPhoto(selectedPhoto + (e.clientX < swipe.x ? 1 : -1));
    swipe = null;
  });

  globe.addEventListener("pointerdown", e => {
    if (scene !== "globe" || photoDialog.open || e.button !== 0 || drag) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY,
      moved: false, target: e.target.closest(".photo-tile") || globe };
    drag.target.setPointerCapture(e.pointerId);
    yawVelocity = pitchVelocity = 0;
    if (rigidGlobe) rigidGlobe.physics.begin(e.clientX, e.clientY, performance.now() / 1000, rigidGlobe.geometry());
  });
  globe.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
    if (drag.moved) {
      const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
      if (rigidGlobe) {
        rigidGlobe.physics.move(e.clientX, e.clientY, performance.now() / 1000, rigidGlobe.geometry());
      } else {
        yaw += dx * .006; pitch = clamp(pitch - dy * .004, -.8, .8);
        yawVelocity = dx * .00025; pitchVelocity = -dy * .00012;
      }
      hint.classList.remove("show"); globe.classList.add("dragging");
    }
    drag.lastX = e.clientX; drag.lastY = e.clientY;
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const ended = drag;
    drag = null; globe.classList.remove("dragging");
    if (ended.moved) lastDragAt = performance.now();
    if (rigidGlobe) rigidGlobe.physics.end(performance.now() / 1000,
      !ended.moved || !e || e.type === "pointercancel" || reduced);
    if (ended.target.hasPointerCapture(ended.id)) ended.target.releasePointerCapture(ended.id);
  }
  globe.addEventListener("pointerup", endDrag);
  globe.addEventListener("pointercancel", endDrag);
  globe.addEventListener("lostpointercapture", endDrag);
  addEventListener("blur", () => endDrag());

  document.addEventListener("pointermove", e => {
    const now = performance.now(), dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer.px = pointer.x; pointer.py = pointer.y;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    pointer.type = e.pointerType; pointer.movedAt = now;
    pointer.speed = Math.min(45, Math.hypot(dx, dy));
    if (!reduced && !calm() && scene !== "restart" && (e.pointerType === "mouse" || e.buttons)) {
      trails.push({ x: pointer.x, y: pointer.y, born: now, r: Math.min(3, 1 + pointer.speed / 14) });
      if (trails.length > 100) trails.shift();
    }
    cursorStar.style.left = e.clientX + "px"; cursorStar.style.top = e.clientY + "px";
    cursorStar.style.opacity = e.pointerType === "mouse" && !calm() ? ".9" : "0";
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.active = false; cursorStar.style.opacity = "0"; });
  document.addEventListener("pointerup", e => {
    if (e.pointerType !== "mouse") pointer.active = false;
  }, { passive: true });
  document.addEventListener("click", e => {
    if (reduced || calm() || scene === "restart") return;
    const x = e.detail === 0 ? width / 2 : e.clientX;
    const y = e.detail === 0 ? height / 2 : e.clientY;
    rings.push({ x, y, born: performance.now() }); burst(x, y, 16, .7);
  });

  function snapshot() { return tiles.map(tile => ({ ...tile.screen })); }
  function beginEnvelope() {
    if (scene !== "globe" || transition) return;
    endDrag();
    const now = performance.now();
    transition = { kind: "envelope", start: now, duration: reduced ? 250 : 2400, from: snapshot() };
    burst(pointer.active ? pointer.x : width / 2, pointer.active ? pointer.y : height * .8, 80, 1.5);
    envelope.classList.remove("ready"); setScene("envelope", now);
  }
  envelope.addEventListener("click", beginEnvelope);
  function flipLetter() {
    if (scene !== "letter") return;
    flipped = !flipped;
    $("letter-card").classList.toggle("flipped", flipped);
    $("letter-front").inert = flipped; $("letter-back").inert = !flipped;
    $("letter-front").setAttribute("aria-hidden", String(flipped));
    $("letter-back").setAttribute("aria-hidden", String(!flipped));
    $("flip-button").setAttribute("aria-pressed", String(flipped));
    $("flip-button").setAttribute("aria-label", flipped ? "Lật lại lời chúc" : "Lật thư để xem ảnh");
  }
  $("flip-button").addEventListener("click", flipLetter);
  $("letter-card").addEventListener("click", e => {
    const rect = $("letter-card").getBoundingClientRect();
    if (e.clientX > rect.right - 60 && e.clientY > rect.bottom - 60) flipLetter();
  });
  function openLetter() {
    setScene("letter"); transition = null;
    flipped = false; $("letter-card").classList.remove("flipped");
    $("letter-front").inert = false; $("letter-back").inert = true;
    $("letter-front").setAttribute("aria-hidden", "false");
    $("letter-back").setAttribute("aria-hidden", "true");
    $("flip-button").setAttribute("aria-pressed", "false");
    $("flip-button").setAttribute("aria-label", "Lật thư để xem ảnh");
    letterDialog.classList.remove("sending");
    letterDialog.showModal();
  }
  $("letter-close").addEventListener("click", () => letterDialog.close());
  letterDialog.addEventListener("click", e => { if (e.target === letterDialog && scene === "letter") letterDialog.close(); });
  letterDialog.addEventListener("cancel", e => { if (scene === "sending") e.preventDefault(); });
  letterDialog.addEventListener("close", () => {
    if (scene !== "letter") return;
    restore = { start: performance.now(), from: snapshot() };
    setScene("globe"); envelope.classList.add("ready");
    envelope.focus({ preventScroll: true });
  });
  $("send-button").addEventListener("click", () => {
    if (scene !== "letter") return;
    setScene("sending"); letterDialog.classList.add("sending");
    burst(width / 2, height / 2, 45);
  });
  function startFinale(now) {
    plane.style.display = "none"; heartStart = now;
    transition = { kind: "heart", start: now, duration: reduced ? 250 : 2000, from: snapshot() };
    setScene("finale", now); finale.classList.add("visible");
    gallery.inert = true; replay.disabled = true;
    burst(width / 2, height * .32, 90, 1.2);
  }
  replay.addEventListener("click", e => {
    if (scene !== "finale" || transition) return;
    setScene("restart");
    finale.classList.remove("visible");
    transition = { kind: "restart", start: performance.now(), duration: reduced ? 600 : 4000,
      from: snapshot(), x: e.detail ? e.clientX : width / 2, y: e.detail ? e.clientY : height * .9 };
    gallery.classList.add("visible");
  });
  function restart(now) {
    transition = null; restore = null; heartStart = 0; flashStart = now;
    yaw = 0; pitch = -.12; yawVelocity = pitchVelocity = 0;
    if (rigidGlobe) rigidGlobe.physics.reset();
    trails = []; rings = []; bursts = [];
    gallery.classList.remove("visible"); finale.classList.remove("visible");
    envelope.classList.remove("ready");
    if (musicWanted && !audio.paused) {
      audio.currentTime = 0; audio.volume = 0;
    }
    setScene("intro", now);
  }

  function spherePosition(tile, now, i) {
    if (rigidGlobe) return rigidGlobe.position(i);
    const a = yaw, p = pitch;
    const x = tile.x * Math.cos(a) + tile.z * Math.sin(a);
    const z0 = tile.z * Math.cos(a) - tile.x * Math.sin(a);
    const y = tile.y * Math.cos(p) - z0 * Math.sin(p);
    const z = tile.y * Math.sin(p) + z0 * Math.cos(p);
    const perspective = 850 / (850 - z * radius);
    const glow = hovered === i ? 1.12 : 1;
    return { x: width / 2 + x * radius * perspective,
      y: height * .44 + y * radius * perspective,
      scale: perspective * (width < 600 ? .7 : .9) * glow,
      stretch: clamp(z * 1.15, .28, 1), rotation: x * 8,
      opacity: smooth((z + .02) * 4), z: Math.round(200 + z * 100) };
  }
  function heartPosition(tile, i, now) {
    const p = heartPoints[i % heartPoints.length];
    const r = Math.min(width * .27, height * .21, 225);
    const wave = reduced ? 0 : Math.sin(now * .0006 + tile.float) * 2;
    const mx = pointer.active && !reduced ? (pointer.x / width - .5) * 12 : 0;
    return { x: width / 2 + p.x * r + mx,
      y: height * .32 + p.y * r + wave, scale: width < 600 ? .32 : .48,
      stretch: 1, rotation: Math.sin(tile.float) * 8, opacity: .94, z: 100 + Math.round(p.y * 10) };
  }
  function tunnelPosition(tile, i, progress, kind) {
    const travel = kind === "restart" ? Math.pow(progress, 2.25) * 5.5 : progress * 2;
    const depth = ((tile.depth - travel) % 2.8 + 2.8) % 2.8;
    const perspective = .8 / (depth + .13);
    const angle = tile.angle + progress * (kind === "restart" ? 1.8 : .45);
    const radial = Math.min(width, height) * .38 * perspective;
    const centreBlend = ease(progress / .35);
    const cx = kind === "restart" ? lerp(transition.x, width / 2, centreBlend) : width / 2;
    const cy = kind === "restart" ? lerp(transition.y, height / 2, centreBlend) : height / 2;
    return { x: cx + Math.cos(angle) * radial * 1.25,
      y: cy + Math.sin(angle) * radial, scale: perspective * .8,
      stretch: 1, rotation: Math.sin(angle) * 20 + progress * 20,
      opacity: clamp(depth / .12) * clamp((2.8 - depth) / .4), z: Math.round(800 - depth * 200) };
  }
  function mixPosition(a, b, t) {
    const out = {};
    for (const key of ["x", "y", "scale", "stretch", "rotation", "opacity", "z"]) out[key] = lerp(a[key], b[key], t);
    return out;
  }
  function renderTiles(now, dt, seconds) {
    if (scene === "intro") return;
    if (rigidGlobe) {
      if (scene === "globe" && !photoDialog.open && !reduced) rigidGlobe.physics.step(seconds);
      else if (reduced) rigidGlobe.physics.stop();
      const enter = reduced || restore ? 1 : ease((now - sceneStart) / 1600);
      rigidGlobe.prepare(enter);
      if (scene === "globe" && !restore) {
        rigidGlobe.setActive(true);
        rigidGlobe.render();
        return;
      }
      rigidGlobe.setActive(false);
    } else if (scene === "globe" && !drag && !photoDialog.open && !reduced) {
      yaw += yawVelocity * dt;
      pitch = clamp(pitch + pitchVelocity * dt, -.8, .8);
      yawVelocity *= Math.pow(.94, dt); pitchVelocity *= Math.pow(.94, dt);
    }
    const winners = new Map();
    tiles.forEach((tile, i) => {
      let p;
      if (transition && (transition.kind === "restart" || transition.kind === "envelope")) {
        const progress = clamp((now - transition.start) / transition.duration);
        p = reduced ? { ...transition.from[i], opacity: 1 - progress } :
          mixPosition(transition.from[i], tunnelPosition(tile, i, progress, transition.kind), ease(progress / .22));
      } else if (scene === "finale") {
        p = heartPosition(tile, i, now);
        if (transition && transition.kind === "heart") {
          p = mixPosition(transition.from[i], p, ease((now - transition.start) / transition.duration));
        }
      } else if (scene === "letter" || scene === "sending") {
        p = { x: width / 2 + Math.cos(tile.angle + (reduced ? 0 : now * .00004)) * width * .5,
          y: height / 2 + Math.sin(tile.angle) * height * .55, scale: .65, stretch: 1,
          opacity: .16, rotation: Math.sin(tile.float) * 12, z: 50 };
      } else {
        p = spherePosition(tile, now, i);
        const enter = reduced ? 1 : ease((now - sceneStart) / 1600);
        if (!restore && enter < 1) {
          p.scale *= enter; p.opacity *= enter;
          p.x = lerp(width / 2, p.x, enter); p.y = lerp(height * .44, p.y, enter);
        }
        if (restore) p = mixPosition(restore.from[i], p, ease((now - restore.start) / 1000));
      }
      tile.screen = p;
      tile.el.style.transform = "translate3d(" + (p.x - (width < 600 ? 32 : 39)).toFixed(2) + "px," +
        (p.y - (width < 600 ? 24.5 : 29)).toFixed(2) + "px,0) rotate(" + p.rotation.toFixed(2) +
        "deg) scale(" + (p.scale * p.stretch).toFixed(3) + "," + p.scale.toFixed(3) + ")";
      tile.el.style.opacity = p.opacity.toFixed(3);
      tile.el.style.zIndex = String(Math.round(p.z));
      const interactive = scene === "globe" && p.opacity > .6;
      tile.el.style.pointerEvents = interactive ? "auto" : "none";
      if (interactive && (!winners.has(tile.index) || p.z > winners.get(tile.index).screen.z)) winners.set(tile.index, tile);
    });
    // One keyboard stop per unique photo, rather than 100+ repeated stops.
    for (const tile of tiles) {
      const accessible = winners.get(tile.index) === tile;
      tile.el.tabIndex = accessible ? 0 : -1;
      tile.el.setAttribute("aria-hidden", String(!accessible));
    }
    if (restore && now - restore.start > 1000) restore = null;
  }

  function drawUniverse(now, dt) {
    if (!ctx) return;
    const quiet = calm() ? .25 : 1, t = now * .001;
    ctx.globalAlpha = 1; ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    const nx = pointer.active && !reduced ? pointer.x / width - .5 : 0;
    const ny = pointer.active && !reduced ? pointer.y / height - .5 : 0;
    const warp = scene === "restart" && !reduced ? clamp((now - sceneStart) / 4000) : 0;
    stars.forEach(star => {
      const x = star.x - nx * star.depth * 22, y = star.y - ny * star.depth * 16;
      const alpha = reduced ? star.alpha : star.alpha * (.7 + .3 * Math.sin(t * .9 + star.phase));
      ctx.fillStyle = "rgba(255,234,226," + alpha + ")";
      if (warp > .2) {
        const dx = x - width / 2, dy = y - height / 2;
        ctx.strokeStyle = "rgba(255,226,214," + alpha * warp + ")";
        ctx.lineWidth = star.r * .7; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + dx * warp * warp * .17, y + dy * warp * warp * .17); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(x, y, star.r, 0, TAU); ctx.fill(); }
    });
    dust.forEach(d => {
      if (!reduced) {
        if (pointer.active && !calm() && scene !== "restart") {
          const dx = pointer.x - d.x, dy = pointer.y - d.y, distance = Math.hypot(dx, dy);
          if (distance > 4 && distance < 200) {
            const force = (1 - distance / 200) * .11;
            d.vx += (dx / distance * force - dy / distance * force * .8) * dt;
            d.vy += (dy / distance * force + dx / distance * force * .8) * dt;
          }
        }
        d.vx = clamp(d.vx * Math.pow(.987, dt), -3, 3); d.vy = clamp(d.vy * Math.pow(.987, dt), -3, 3);
        d.x += (d.vx + Math.sin(t * .2 + d.phase) * .04) * dt * quiet;
        d.y += (d.vy - .035) * dt * quiet;
        if (d.x < -20) d.x = width + 20; if (d.x > width + 20) d.x = -20;
        if (d.y < -20) d.y = height + 20; if (d.y > height + 20) d.y = -20;
      }
      ctx.fillStyle = "rgba(234,170,207," + (.35 * quiet) + ")";
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    });
    // A subtle galaxy arc behind the globe.
    ctx.save(); ctx.translate(width * .5, height * .44); ctx.rotate(-.32);
    ctx.scale(1, .22); ctx.lineWidth = 1; ctx.strokeStyle = "#d8b7bc16";
    ctx.beginPath(); ctx.arc(0, 0, radius * 1.8, 0, TAU); ctx.stroke(); ctx.restore();
    if (reduced) return;
    if (!calm() && scene !== "restart") {
      for (let i = 0; i < 2; i++) {
        const phase = (t * .13 + i * .53) % 1;
        if (phase < .16) {
          const p = phase / .16, x = width * (.2 + i * .5) + p * 230, y = height * .06 + p * 140;
          const g = ctx.createLinearGradient(x - 100, y - 60, x, y);
          g.addColorStop(0, "#ffffff00"); g.addColorStop(1, "#fff1e9bb");
          ctx.strokeStyle = g; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(x - 100, y - 60); ctx.lineTo(x, y); ctx.stroke();
        }
      }
    }
    trails = trails.filter(p => now - p.born < 650);
    trails.forEach((p, i) => {
      const life = 1 - (now - p.born) / 650;
      ctx.fillStyle = "rgba(255,216,179," + life * .7 * quiet + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * life, 0, TAU); ctx.fill();
      if (i > 0 && Math.hypot(p.x - trails[i - 1].x, p.y - trails[i - 1].y) < 100) {
        ctx.strokeStyle = "rgba(255,204,187," + life * .32 * quiet + ")";
        ctx.lineWidth = life * 1.8; ctx.beginPath(); ctx.moveTo(trails[i - 1].x, trails[i - 1].y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    });
    if (pointer.active && !calm() && scene !== "restart") {
      const idle = smooth((now - pointer.movedAt - 350) / 800);
      for (let i = 0; i < 5; i++) {
        const a = t * (1.1 + i * .04) + i * TAU / 5, r = 18 + i * 4;
        ctx.fillStyle = "rgba(255,221,178," + idle * .8 + ")";
        ctx.beginPath(); ctx.arc(pointer.x + Math.cos(a) * r, pointer.y + Math.sin(a) * r * .65, 1.1, 0, TAU); ctx.fill();
      }
    }
    rings = rings.filter(r => now - r.born < 1000);
    rings.forEach(r => {
      const p = (now - r.born) / 1000;
      ctx.strokeStyle = "rgba(247,188,212," + (1 - p) * .5 + ")";
      ctx.lineWidth = 1 - p + .2; ctx.beginPath(); ctx.arc(r.x, r.y, 10 + ease(p) * 170, 0, TAU); ctx.stroke();
    });
    bursts = bursts.filter(b => b.life > 0);
    bursts.forEach(b => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= Math.pow(.984, dt); b.vy += .008 * dt; b.life -= b.decay * dt;
      ctx.fillStyle = "rgba(" + b.color + "," + Math.max(0, b.life) * quiet + ")";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * Math.max(.1, b.life), 0, TAU); ctx.fill();
    });
    if (scene === "globe" && now - lastFirework > 8000) {
      lastFirework = now; burst(width * (.15 + random() * .7), height * (.12 + random() * .25), 22, .65);
    }
    if (scene === "intro") {
      const elapsed = now - sceneStart, formation = ease(elapsed / 1700);
      const alpha = clamp(1 - (elapsed - 1500) / 800);
      if (alpha > 0) textPoints.forEach(p => {
        const x = lerp(p.fromX, p.x, formation), y = lerp(p.fromY, p.y, formation);
        ctx.fillStyle = "rgba(255,219,222," + alpha * .85 + ")";
        ctx.fillRect(x, y, 1.5, 1.5);
      });
    }
    if (scene === "restart") {
      const p = clamp((now - sceneStart) / 4000);
      const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, 25 + p * p * Math.max(width, height) * .7);
      glow.addColorStop(0, "rgba(255,243,215," + (.25 + p * .65) + ")");
      glow.addColorStop(.2, "rgba(255,200,200," + p * .2 + ")");
      glow.addColorStop(1, "#ffddcc00"); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    }
  }

  function frame(now) {
    const seconds = clamp((now - lastFrame) / 1000, 0, .1);
    const dt = clamp((now - lastFrame) / 16.667, .1, 2.5); lastFrame = now;
    const elapsed = now - sceneStart;
    if (scene === "intro") {
      intro.style.opacity = String(reduced ? 1 : smooth((elapsed - 1400) / 850));
      if (elapsed > (reduced ? 1700 : 5200)) {
        intro.style.opacity = "0"; setScene("globe", now); gallery.classList.add("visible");
        envelope.classList.add("ready"); lastFirework = now;
        if (!reduced) hint.classList.add("show");
        burst(width / 2, height * .44, 110, 1.8);
      }
    }
    if (transition && elapsed >= transition.duration && ["envelope", "restart"].includes(transition.kind)) {
      if (transition.kind === "envelope") openLetter();
      else restart(now);
    }
    if (scene === "sending") {
      if (elapsed > (reduced ? 100 : 600)) {
        if (letterDialog.open) letterDialog.close();
        plane.style.display = "block";
        const progress = clamp((elapsed - (reduced ? 100 : 600)) / (reduced ? 150 : 1500));
        const x = width / 2 + Math.sin(progress * Math.PI * 1.1) * width * .25;
        const y = height * .5 - ease(progress) * height * .65;
        plane.style.transform = "translate(" + (x - 32) + "px," + (y - 32) + "px) rotate(" + (-25 - progress * 45) + "deg) scale(" + (1 - progress * .5) + ")";
        if (!reduced && progress < .95) trails.push({ x, y: y + 20, born: now, r: 2 });
        if (progress >= 1) startFinale(now);
      }
    }
    if (transition && transition.kind === "heart" && now - heartStart > transition.duration) {
      transition = null; replay.disabled = false; replay.focus({ preventScroll: true });
    }
    if (scene === "restart" && transition) {
      const progress = clamp(elapsed / transition.duration);
      flash.style.opacity = String(smooth((progress - .78) / .22));
      if (musicWanted && !audio.paused) audio.volume = .55 * (1 - progress);
    } else if (flashStart) {
      const progress = clamp((now - flashStart) / 900);
      flash.style.opacity = String(1 - smooth(progress));
      if (musicWanted && !audio.paused) audio.volume = .55 * progress;
      if (progress === 1) flashStart = 0;
    }
    drawUniverse(now, dt); renderTiles(now, dt, seconds);
    requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = performance.now();
    else if (hiddenAt) {
      const pause = performance.now() - hiddenAt;
      sceneStart += pause;
      if (transition) transition.start += pause;
      if (restore) restore.start += pause;
      if (flashStart) flashStart += pause;
      if (heartStart) heartStart += pause;
      hiddenAt = 0; lastFrame = performance.now();
    }
  });
  addEventListener("resize", resize, { passive: true });
  resize();
  if (document.fonts) document.fonts.ready.then(() => { if (scene === "intro") makeTextPoints(); });
  requestAnimationFrame(frame);
})();
