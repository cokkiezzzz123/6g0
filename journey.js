/* Extra chapters for the 20/11 gift. Uses only the ten existing photos. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrap = (x, n) => ((x % n) + n) % n;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const svgNS = "http://www.w3.org/2000/svg";

  class Journey {
    constructor(options) {
      this.options = options; this.images = options.images;
      this.root = $("journey-shell");
      this.views = { ribbon: $("ribbon-scene"), wishes: $("wishes-scene"), constellation: $("constellation-scene") };
      this.stage = null; this.enteredAt = 0;
      this.position = 0; this.target = 0; this.ribbonDrag = null;
      this.lastDragAt = -1000; this.lastWheelAt = -1000;
      this.wishIndex = 0; this.flipped = false;
      this.wishes = [
        { text: "Chúc cô luôn mạnh khỏe.", icon: "health", photo: 5 },
        { text: "Chúc cô mỗi ngày đều vui vẻ.", icon: "sun", photo: 6 },
        { text: "Chúc gia đình cô luôn hạnh phúc.", icon: "home", photo: 9 }
      ];
      this.nodes = [
        [-.34,-.18],[-.16,-.29],[.12,-.27],[.34,-.15],[.31,.16],
        [.13,.29],[-.09,.27],[-.31,.18],[-.39,.01],[.39,.02]
      ];
      this.edges = [[0,1],[1,2],[2,3],[3,9],[9,4],[4,5],[5,6],[6,7],[7,8],[8,0],[1,6],[2,4]];
      this.starPositions = []; this.spark = { x: innerWidth / 2, y: innerHeight / 2 };
      this.ribbonCards = []; this.starCards = []; this.lines = [];
      this.makePhotos();
      // The envelope belongs to the constellation, not a hidden extra step.
      $("constellation-scene").append($("envelope-button"));
      this.bind();
      this.setWish(0);
      this.hide();
    }
    makePhotos() {
      this.images.forEach((src, i) => {
        const button = document.createElement("button");
        button.className = "ribbon-photo";
        button.setAttribute("aria-label", "Xem ảnh kỷ niệm " + (i + 1));
        const img = document.createElement("img");
        img.src = src; img.alt = ""; img.draggable = false;
        button.append(img); $("ribbon-stage").append(button);
        button.addEventListener("click", () => {
          if (this.stage !== "ribbon" || performance.now() - this.lastDragAt < 250) return;
          const selected = wrap(Math.round(this.target), this.images.length);
          if (selected === i) this.options.onPhoto(i);
          else this.slide(this.distance(i, this.target));
        });
        this.ribbonCards.push(button);

        const star = document.createElement("button");
        star.className = "star-photo";
        star.setAttribute("aria-label", "Xem ảnh kỷ niệm " + (i + 1));
        const starImg = document.createElement("img");
        starImg.src = src; starImg.alt = ""; starImg.draggable = false;
        star.append(starImg); $("constellation-photos").append(star);
        star.addEventListener("click", () => this.options.onPhoto(i));
        this.starCards.push(star);
      });
      this.edges.forEach(([a,b]) => {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("pathLength", "1");
        $("constellation-lines").append(line);
        this.lines.push({ line, a, b });
      });
    }
    bind() {
      $("ribbon-button").addEventListener("click", () => this.options.onNavigate("ribbon"));
      $("ribbon-prev").addEventListener("click", () => this.slide(-1));
      $("ribbon-next").addEventListener("click", () => this.slide(1));
      $("ribbon-home").addEventListener("click", () => this.options.onHome());
      $("ribbon-continue").addEventListener("click", () => {
        this.setWish(0); this.options.onNavigate("wishes");
      });
      $("wish-card").addEventListener("click", () => {
        if (this.flipped) this.options.onPhoto(this.wishes[this.wishIndex].photo);
        else this.flipWish();
      });
      $("wish-flip").addEventListener("click", () => this.flipWish());
      $("wish-prev").addEventListener("click", () => {
        if (this.wishIndex > 0) this.setWish(this.wishIndex - 1);
        else this.options.onNavigate("ribbon");
      });
      $("wish-next").addEventListener("click", () => {
        if (this.wishIndex < 2) this.setWish(this.wishIndex + 1);
        else this.options.onNavigate("constellation");
      });
      [...$("wish-dots").children].forEach((dot, i) => dot.addEventListener("click", () => this.setWish(i)));
      $("constellation-back").addEventListener("click", () => {
        this.setWish(2); this.options.onNavigate("wishes");
      });
      const stage = $("ribbon-stage");
      stage.addEventListener("pointerdown", e => {
        if (this.stage !== "ribbon" || e.button !== 0 || this.ribbonDrag) return;
        const target = e.target.closest(".ribbon-photo") || stage;
        this.ribbonDrag = { id: e.pointerId, x: e.clientX, position: this.position, moved: false, target };
        target.setPointerCapture(e.pointerId);
      });
      stage.addEventListener("pointermove", e => {
        const d = this.ribbonDrag;
        if (!d || e.pointerId !== d.id) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 6) d.moved = true;
        if (d.moved) {
          this.target = d.position - dx / this.ribbonSpacing();
          this.position = this.target;
        }
      });
      const finish = e => {
        const d = this.ribbonDrag;
        if (!d || (e && e.pointerId !== d.id)) return;
        this.ribbonDrag = null;
        if (d.moved) this.lastDragAt = performance.now();
        this.target = Math.round(this.target);
        if (d.target.hasPointerCapture(d.id)) d.target.releasePointerCapture(d.id);
      };
      stage.addEventListener("pointerup", finish);
      stage.addEventListener("pointercancel", finish);
      stage.addEventListener("lostpointercapture", finish);
      this.finishDrag = finish;
      stage.addEventListener("wheel", e => {
        if (this.stage !== "ribbon") return;
        e.preventDefault();
        if (performance.now() - this.lastWheelAt < 220) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 3) return;
        this.lastWheelAt = performance.now(); this.slide(Math.sign(delta));
      }, { passive: false });
      this.views.ribbon.addEventListener("keydown", e => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault(); this.slide(e.key === "ArrowLeft" ? -1 : 1);
        }
      });
      addEventListener("blur", () => this.finishDrag());
    }
    distance(index, position) {
      const n = this.images.length;
      return wrap(index - position + n / 2, n) - n / 2;
    }
    ribbonSpacing() { return innerWidth < 600 ? Math.min(innerWidth * .53, 235) : Math.min(innerWidth * .235, 280); }
    slide(amount) {
      this.target = Math.round(this.target + amount);
      if (this.options.reduced()) this.position = this.target;
    }
    setWish(index) {
      this.wishIndex = clamp(index, 0, 2); this.flipped = false;
      const wish = this.wishes[this.wishIndex];
      $("wish-text").textContent = wish.text;
      $("wish-icon-use").setAttribute("href", "#icon-" + wish.icon);
      $("wish-photo").src = this.images[wish.photo];
      $("wish-photo").alt = "Ảnh kỷ niệm " + (wish.photo + 1) + " cùng cô Nga";
      this.updateWishFace();
      [...$("wish-dots").children].forEach((dot, i) => dot.setAttribute("aria-pressed", String(i === this.wishIndex)));
      $("wish-prev").setAttribute("aria-label", this.wishIndex ? "Lời chúc trước" : "Quay lại dải ảnh");
      $("wish-next").setAttribute("aria-label", this.wishIndex === 2 ? "Tiếp tục đến bầu trời kỷ niệm" : "Lời chúc tiếp theo");
    }
    flipWish() { this.flipped = !this.flipped; this.updateWishFace(); }
    updateWishFace() {
      $("wish-card").classList.toggle("flipped", this.flipped);
      $("wish-card").setAttribute("aria-pressed", String(this.flipped));
      $("wish-card").setAttribute("aria-label", this.flipped ? "Xem ảnh kỷ niệm" : this.wishes[this.wishIndex].text + " Lật thẻ để xem ảnh");
      $("wish-front").setAttribute("aria-hidden", String(this.flipped));
      $("wish-back").setAttribute("aria-hidden", String(!this.flipped));
      $("wish-flip").setAttribute("aria-label", this.flipped ? "Lật lại lời chúc" : "Lật lời chúc để xem ảnh");
    }
    enter(stage) {
      this.hide(); this.stage = stage; this.enteredAt = performance.now();
      this.root.hidden = false; this.root.inert = false;
      this.views[stage].hidden = false; this.views[stage].inert = false;
      if (stage === "constellation") this.layoutConstellation();
      const focus = stage === "ribbon" ? $("ribbon-continue") : stage === "wishes" ? $("wish-card") : $("envelope-button");
      focus.focus({ preventScroll: true });
    }
    hide() {
      if (this.finishDrag) this.finishDrag();
      this.stage = null; this.root.hidden = true; this.root.inert = true;
      Object.values(this.views).forEach(view => { view.hidden = true; view.inert = true; });
    }
    reset() {
      this.hide(); this.position = this.target = 0; this.setWish(0);
    }
    progress(scene) {
      const map = { globe:0, ribbon:1, wishes:2, constellation:3, letter:4, sending:4, finale:5 };
      const p = $("journey-progress");
      p.hidden = !(scene in map) || scene === "letter" || scene === "sending";
      [...p.children].forEach((dot,i) => dot.classList.toggle("active", i === map[scene]));
    }
    pause(milliseconds) { if (this.stage) this.enteredAt += milliseconds; }
    layoutConstellation() {
      const w = innerWidth, h = innerHeight;
      const sx = Math.min(w * .94, 940), sy = Math.min(h * .64, 500);
      this.starSize = w < 600 ? 48 : 68;
      this.starPositions = this.nodes.map(([x,y]) => ({ x: w / 2 + x * sx, y: h * .46 + y * sy }));
      const svg = $("constellation-lines");
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      this.lines.forEach(({line,a,b}) => {
        line.setAttribute("x1", this.starPositions[a].x); line.setAttribute("y1", this.starPositions[a].y);
        line.setAttribute("x2", this.starPositions[b].x); line.setAttribute("y2", this.starPositions[b].y);
      });
      this.layoutWidth = w; this.layoutHeight = h;
    }
    photoPose(index) {
      if (!this.starPositions.length) this.layoutConstellation();
      const p = this.starPositions[index];
      return { x:p.x, y:p.y, scale:this.starSize / (innerWidth < 600 ? 64 : 78),
        stretch:1, rotation:0, opacity:1, z:100 };
    }
    update(now, seconds, pointer) {
      if (!this.stage) return;
      const reduced = this.options.reduced();
      const appear = reduced ? 1 : smooth((now - this.enteredAt) / 900);
      if (this.stage === "ribbon") {
        const blend = reduced || this.ribbonDrag ? 1 : 1 - Math.exp(-seconds / .095);
        this.position = lerp(this.position, this.target, blend);
        const w = innerWidth, h = innerHeight, spacing = this.ribbonSpacing();
        const cw = w < 600 ? Math.min(w * .58, 240) : Math.min(w * .24, 290);
        const ch = Math.min(cw * 1.23, h * .47);
        this.ribbonCards.forEach((card,i) => {
          const d = this.distance(i, this.position), ad = Math.abs(d);
          const scale = Math.pow(.78, ad) * (.94 + .06 * appear);
          const x = w / 2 + d * spacing * .78;
          const y = h * .43 + ad * ad * 14 + (1 - appear) * 25;
          card.style.width = cw + "px"; card.style.height = ch + "px";
          card.style.transform = "translate3d(" + (x - cw / 2) + "px," + (y - ch / 2) + "px," + (-ad * 85) + "px) rotateY(" + (-d * 16) + "deg) rotate(" + (d * 1.5) + "deg) scale(" + scale + ")";
          card.style.opacity = String(ad < 3 ? Math.max(0, 1 - ad * .25) * appear : 0);
          card.style.zIndex = String(Math.round(100 - ad * 10));
          card.style.pointerEvents = ad < 2.6 ? "auto" : "none";
          card.tabIndex = ad < .45 ? 0 : -1;
          card.setAttribute("aria-hidden", String(ad >= 2.6));
        });
        const count = String(wrap(Math.round(this.target), this.images.length) + 1).padStart(2,"0") + " / 10";
        if ($("ribbon-count").textContent !== count) $("ribbon-count").textContent = count;
      } else if (this.stage === "wishes") {
        const x = reduced || !pointer.active ? 0 : (pointer.x / innerWidth - .5) * 6;
        const y = reduced || !pointer.active ? 0 : (pointer.y / innerHeight - .5) * -5;
        $("wish-tilt").style.transform = "translate(-50%,-50%) rotateX(" + y + "deg) rotateY(" + x + "deg)";
      } else if (this.stage === "constellation") {
        if (this.layoutWidth !== innerWidth || this.layoutHeight !== innerHeight) this.layoutConstellation();
        this.starCards.forEach((card,i) => {
          const p = this.starPositions[i];
          const alpha = reduced ? 1 : smooth((now - this.enteredAt - i * 65) / 700);
          card.style.width = this.starSize + "px"; card.style.height = this.starSize + "px";
          card.style.transform = "translate(" + (p.x - this.starSize / 2) + "px," + (p.y - this.starSize / 2 + (1 - alpha) * 12) + "px) scale(" + (.9 + alpha * .1) + ")";
          card.style.opacity = String(alpha);
        });
        this.lines.forEach(({line}) => { line.style.strokeDashoffset = String(1 - appear); });
        let target = this.starPositions[0], distance = Infinity;
        if (pointer.active) {
          this.lines.forEach(({a,b}) => {
            const p = this.starPositions[a], q = this.starPositions[b];
            const dx = q.x - p.x, dy = q.y - p.y;
            const t = clamp(((pointer.x - p.x) * dx + (pointer.y - p.y) * dy) / (dx*dx + dy*dy), 0, 1);
            const candidate = { x:p.x + t*dx, y:p.y + t*dy };
            const d = Math.hypot(pointer.x - candidate.x,pointer.y - candidate.y);
            if (d < distance) { distance = d; target = candidate; }
          });
        } else if (!reduced) {
          const travel = (now - this.enteredAt) / 2200;
          const edge = this.edges[wrap(Math.floor(travel), this.edges.length)];
          const p = this.starPositions[edge[0]], q = this.starPositions[edge[1]];
          target = { x:lerp(p.x,q.x,travel % 1), y:lerp(p.y,q.y,travel % 1) };
        }
        const follow = reduced ? 1 : 1 - Math.exp(-seconds / .12);
        this.spark.x = lerp(this.spark.x,target.x,follow); this.spark.y = lerp(this.spark.y,target.y,follow);
        $("constellation-spark").style.transform = "translate(" + (this.spark.x - 3) + "px," + (this.spark.y - 3) + "px)";
        $("constellation-spark").style.opacity = String(appear * .8);
      }
    }
  }
  window.GiftJourney = Journey;
})();
