import { useEffect, useRef } from "react";

const LIBRARY_FOLDERS = [
  "Mixed",
  "Speech",
  "Animal",
  "Rain",
  "Thunderstorm",
  "Siren",
  "Vehicle",
  "Music",
  "Bird",
  "Dog",
  "Fire",
  "Wind",
  "Crowd",
  "Silence",
  "Engine",
  "Water",
  "Cat",
  "Train",
];

const WIND_ROWS = [
  { name: "gust.wav", duration: "4.2s" },
  { name: "howl.aiff", duration: "8.0s" },
  { name: "breeze.wav", duration: "3.6s" },
  { name: "gale.flac", duration: "12.4s" },
  { name: "whistle.wav", duration: "2.1s" },
];

const DESTINATIONS = [
  { name: "Ableton Live", src: "/logos/abletonlive.svg" },
  { name: "Pro Tools", src: "/logos/protools.svg" },
  { name: "Bitwig", src: "/logos/bitwig.svg" },
  { name: "Audition", src: "/logos/adobeaudition.svg" },
  { name: "Premiere", src: "/logos/adobepremierepro.svg" },
  { name: "Audacity", src: "/logos/audacity.svg" },
];

function MaterialIcon({ name }) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      {name}
    </span>
  );
}

function easeInOut(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function arc(a, b, t, lift) {
  const p = easeInOut(t);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + lift;
  const u = 1 - p;
  return {
    x: u * u * a.x + 2 * u * p * mx + p * p * b.x,
    y: u * u * a.y + 2 * u * p * my + p * p * b.y,
  };
}

function useFileDrag(sceneRef) {
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const pointer = scene.querySelector(".drag-pointer");
    const ghost = scene.querySelector(".drag-ghost");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rows = () => [...scene.querySelectorAll(".mini-row")];
    const tiles = () => [...scene.querySelectorAll(".dest-tile")];

    const localPoint = (el, grip) => {
      const origin = scene.getBoundingClientRect();
      const rect = (grip ? el.querySelector(".mini-grip") : el)?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: rect.left + rect.width / 2 - origin.left,
        y: rect.top + rect.height / 2 - origin.top,
      };
    };

    const place = (el, x, y) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    let raf = 0;
    let running = false;
    let phaseStart = 0;
    let mode = "to-row";
    let index = 0;
    let from = null;

    const clear = () => {
      scene.querySelectorAll(".is-hover, .is-selected, .is-drop").forEach((el) => {
        el.classList.remove("is-hover", "is-selected", "is-drop");
      });
    };

    const paintStill = () => {
      const row = rows()[0];
      if (!row) return;
      clear();
      row.classList.add("is-hover");
      const at = localPoint(row, true);
      place(pointer, at.x, at.y);
      ghost.style.opacity = "0";
      pointer.classList.remove("is-down");
    };

    const tick = (now) => {
      const rowList = rows();
      const tileList = tiles();
      const row = rowList[index % rowList.length];
      const tile = tileList[index % tileList.length];
      if (!row || !tile) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const rowPt = localPoint(row, true);
      const tilePt = localPoint(tile, false);
      const elapsed = (now - phaseStart) / 1000;
      clear();

      let pos = rowPt;
      let ghostOn = false;
      let pressing = false;

      if (mode === "to-row") {
        const origin = from || { x: rowPt.x - 46, y: rowPt.y - 36 };
        const p = Math.min(1, elapsed / 0.62);
        pos = arc(origin, rowPt, p, -16);
        if (p > 0.72) row.classList.add("is-hover");
        if (p >= 1) {
          mode = "hover";
          phaseStart = now;
        }
      } else if (mode === "hover") {
        pos = rowPt;
        row.classList.add("is-hover");
        if (elapsed > 0.34) {
          mode = "drag";
          phaseStart = now;
        }
      } else if (mode === "drag") {
        const p = Math.min(1, elapsed / 0.78);
        pos = arc(rowPt, tilePt, p, -32);
        row.classList.add("is-selected");
        pressing = true;
        ghostOn = true;
        if (p > 0.86) tile.classList.add("is-drop");
        if (p >= 1) {
          mode = "drop";
          phaseStart = now;
        }
      } else {
        pos = tilePt;
        row.classList.add("is-selected");
        tile.classList.add("is-drop");
        pressing = elapsed < 0.2;
        ghostOn = elapsed < 0.18;
        if (elapsed > 0.42) {
          from = { x: pos.x, y: pos.y };
          index = (index + 1) % rowList.length;
          mode = "to-row";
          phaseStart = now;
          ghostOn = false;
          pressing = false;
        }
      }

      place(pointer, pos.x, pos.y);
      pointer.classList.toggle("is-down", pressing);
      place(ghost, pos.x + 12, pos.y + 14);
      ghost.style.opacity = ghostOn ? "1" : "0";

      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      phaseStart = performance.now();
      raf = requestAnimationFrame(tick);
    };

    paintStill();

    const visible = () => {
      const rect = scene.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    };
    const sync = () => {
      if (!document.hidden && visible()) start();
      else stop();
    };

    const io = new IntersectionObserver(sync, { threshold: 0.25 });
    io.observe(scene);
    document.addEventListener("visibilitychange", sync);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [sceneRef]);
}

function useSpin(trackRef, count, wheel) {
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const first = track.querySelector("li");
    const rowH = first?.getBoundingClientRect().height || (wheel ? 72 : 42);
    const loopH = rowH * count;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let y = wheel ? loopH : 0;
    let vel = 0;
    let raf = 0;
    let last = 0;
    let played = false;

    const paint = () => {
      const shift = wheel ? -y : -y;
      track.style.transform = `translateY(${shift}px)`;
      if (!wheel) return;
      const viewH = track.parentElement?.clientHeight || 1;
      const mid = viewH / 2;
      for (const li of track.children) {
        const rel = li.offsetTop + rowH / 2 - y - mid;
        const norm = Math.max(-1.15, Math.min(1.15, rel / (viewH * 0.46)));
        const angle = norm * 58;
        const scale = Math.max(0.64, 1 - Math.abs(norm) * 0.34);
        li.style.transform = `rotateX(${-angle}deg) scale(${scale})`;
        li.style.opacity = String(Math.max(0.22, 1 - Math.abs(norm) * 0.7));
      }
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    paint();
    if (reduce) return;

    const tick = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      y += vel * dt;
      vel *= Math.pow(0.5, dt / (wheel ? 1.4 : 0.42));
      if (Math.abs(vel) < 36) {
        const target = Math.round(y / rowH) * rowH;
        y += (target - y) * Math.min(1, dt * 12);
        vel *= 0.82;
        if (Math.abs(target - y) < 0.5 && Math.abs(vel) < 10) {
          y = target;
          vel = 0;
          if (wheel) {
            if (y <= 0) y += loopH;
          } else if (y >= loopH) y -= loopH;
          paint();
          stop();
          return;
        }
      }

      if (wheel) {
        if (y <= 0) y += loopH;
      } else if (y >= loopH) y -= loopH;
      paint();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (played) return;
      played = true;
      const speed = wheel ? 260 : 1800 + Math.random() * 700;
      vel = wheel ? -speed : speed;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const target = track.closest(".feature-row") || track.closest(".library-scene") || track.closest(".drag-scene") || track;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          start();
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(target);

    return () => {
      stop();
      io.disconnect();
    };
  }, [trackRef, count, wheel]);
}

export function DropFiledVisual() {
  const trackRef = useRef(null);
  const rows = [...LIBRARY_FOLDERS, ...LIBRARY_FOLDERS];
  useSpin(trackRef, LIBRARY_FOLDERS.length, false);

  return (
    <div className="library-scene" role="img" aria-label="Library folders scrolling by class name">
      <span className="library-icon icon-wave" style={{ "--d": "0s" }}>
        <MaterialIcon name="record_voice_over" />
      </span>
      <span className="library-icon icon-animal" style={{ "--d": "0.4s" }}>
        <MaterialIcon name="pets" />
      </span>
      <span className="library-icon icon-rain" style={{ "--d": "1.1s" }}>
        <MaterialIcon name="rainy" />
      </span>
      <span className="library-icon icon-bird" style={{ "--d": "0.7s" }}>
        <MaterialIcon name="waves" />
      </span>
      <span className="library-icon icon-music" style={{ "--d": "1.6s" }}>
        <MaterialIcon name="train" />
      </span>
      <span className="library-icon icon-vehicle" style={{ "--d": "0.2s" }}>
        <MaterialIcon name="precision_manufacturing" />
      </span>
      <div className="library-card">
        <p className="library-label">LIBRARY</p>
        <div className="library-mask">
          <ul className="library-track" ref={trackRef}>
            {rows.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}


export function DragOutVisual() {
  const sceneRef = useRef(null);
  useFileDrag(sceneRef);

  return (
    <div className="drag-scene" ref={sceneRef} role="img" aria-label="A pointer drags a file from the Wind folder into another program">
      <div className="mini-app">
        <p className="mini-heading">Wind</p>
        <div className="mini-list">
          {WIND_ROWS.map((file) => (
            <div className="mini-row" key={file.name}>
              <span className="mini-grip" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              <span className="mini-play" aria-hidden="true">
                ▶
              </span>
              <span className="mini-star" aria-hidden="true">
                ☆
              </span>
              <span className="mini-name">{file.name}</span>
              <span className="mini-dur">{file.duration}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="dest-pane">
        <div className="dest-grid">
          {DESTINATIONS.map((program) => (
            <div className="dest-tile" key={program.name}>
              <img src={program.src} alt="" />
              <span>{program.name}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="drag-pointer" aria-hidden="true">
        <MaterialIcon name="arrow_selector_tool" />
      </span>
      <span className="drag-ghost" aria-hidden="true">
        <MaterialIcon name="audio_file" />
      </span>
    </div>
  );
}

export function LocalFolderVisual() {
  return (
    <svg className="feature-svg" viewBox="0 0 480 340" role="img" aria-label="A library folder on your computer">
      <rect x="1" y="1" width="478" height="338" rx="20" fill="#24262b" stroke="#3c4043" />
      <g transform="translate(88 78)">
        <path d="M24 52h220v140H24z" fill="#2e3138" stroke="#ff8a3d" strokeWidth="2" />
        <path d="M24 52h72l16-18h48v18" fill="#3a3d45" stroke="#ff8a3d" strokeWidth="2" />
        <text x="134" y="128" textAnchor="middle" fill="#e8eaed" fontSize="18" fontFamily="Syne, sans-serif" fontWeight="700">
          Your folder
        </text>
        <text x="134" y="154" textAnchor="middle" fill="#9aa0a6" fontSize="13" fontFamily="Inter, sans-serif">
          on this machine
        </text>
      </g>
      <g className="anim-pulse" transform="translate(340 48)">
        <circle cx="40" cy="40" r="28" fill="none" stroke="#3c4043" strokeWidth="2" />
        <path d="M28 40h24M40 28v24" stroke="#3c4043" strokeWidth="2" />
        <line x1="18" y1="18" x2="62" y2="62" stroke="#e5534b" strokeWidth="3" />
      </g>
      <text x="380" y="128" textAnchor="middle" fill="#9aa0a6" fontSize="11" fontFamily="Inter, sans-serif">
        no cloud
      </text>
    </svg>
  );
}

export function OfflineFreeVisual() {
  return (
    <svg className="feature-svg" viewBox="0 0 480 340" role="img" aria-label="Offline and free">
      <rect x="1" y="1" width="478" height="338" rx="20" fill="#24262b" stroke="#3c4043" />
      <circle className="anim-ring" cx="240" cy="150" r="72" fill="none" stroke="#ff8a3d" strokeWidth="3" opacity="0.35" />
      <circle cx="240" cy="150" r="56" fill="#1a1b1e" stroke="#ff8a3d" strokeWidth="2" />
      <g transform="translate(214 124)">
        <rect x="10" y="18" width="32" height="36" rx="4" fill="#ff8a3d" />
        <path d="M16 18v-8a10 10 0 0 1 20 0v8" fill="none" stroke="#ff8a3d" strokeWidth="3" />
      </g>
      <text x="240" y="248" textAnchor="middle" fill="#e8eaed" fontSize="20" fontFamily="Syne, sans-serif" fontWeight="700">
        Free · offline
      </text>
      <text x="240" y="276" textAnchor="middle" fill="#9aa0a6" fontSize="13" fontFamily="Inter, sans-serif">
        After install, no internet required
      </text>
    </svg>
  );
}

