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

function MaterialIcon({ name }) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      {name}
    </span>
  );
}

export function DropFiledVisual() {
  const trackRef = useRef(null);
  const rows = [...LIBRARY_FOLDERS, ...LIBRARY_FOLDERS];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const first = track.querySelector("li");
    const rowH = first?.getBoundingClientRect().height || 42;
    const loopH = rowH * LIBRARY_FOLDERS.length;

    let y = 0;
    let vel = 0;
    let raf = 0;
    let last = 0;
    let played = false;

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const tick = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      y += vel * dt;
      vel *= Math.pow(0.5, dt / 0.42);
      if (vel < 36) {
        const target = Math.round(y / rowH) * rowH;
        y += (target - y) * Math.min(1, dt * 12);
        vel *= 0.82;
        if (Math.abs(target - y) < 0.5 && vel < 10) {
          y = target;
          vel = 0;
          if (y >= loopH) y -= loopH;
          track.style.transform = `translateY(${-y}px)`;
          stop();
          return;
        }
      }

      if (y >= loopH) y -= loopH;
      track.style.transform = `translateY(${-y}px)`;
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (played) return;
      played = true;
      vel = 1800 + Math.random() * 700;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const target = track.closest(".feature-row") || track.closest(".library-scene") || track;
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
  }, []);

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
  return (
    <svg className="feature-svg" viewBox="0 0 480 340" role="img" aria-label="Dragging a file into other software">
      <rect x="1" y="1" width="478" height="338" rx="20" fill="#24262b" stroke="#3c4043" />
      <rect x="36" y="48" width="168" height="244" rx="12" fill="#1a1b1e" stroke="#3c4043" />
      <text x="48" y="76" fill="#ff8a3d" fontSize="11" fontWeight="600" fontFamily="Inter, sans-serif">
        LIBRARY
      </text>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(48 ${96 + i * 42})`}>
          <rect width="144" height="32" rx="6" fill={i === 1 ? "#3a2e26" : "#2a2c31"} />
          <rect x="8" y="10" width="14" height="12" rx="2" fill="#ff8a3d" opacity={i === 1 ? 1 : 0.4} />
          <rect x="30" y="12" width={90 - i * 10} height="8" rx="2" fill="#9aa0a6" opacity="0.5" />
        </g>
      ))}
      <g className="anim-drag">
        <rect x="210" y="150" width="92" height="40" rx="8" fill="#ff8a3d" />
        <text x="256" y="175" textAnchor="middle" fill="#1a1b1e" fontSize="12" fontWeight="600" fontFamily="Inter, sans-serif">
          take.wav
        </text>
      </g>
      <rect x="320" y="88" width="124" height="164" rx="12" fill="#1a1b1e" stroke="#3c4043" strokeDasharray="6 6" />
      <text x="382" y="168" textAnchor="middle" fill="#9aa0a6" fontSize="13" fontFamily="Inter, sans-serif">
        DAW
      </text>
      <text x="382" y="190" textAnchor="middle" fill="#9aa0a6" fontSize="12" fontFamily="Inter, sans-serif">
        Finder
      </text>
    </svg>
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

export function HeroGraphic() {
  return (
    <svg className="hero-graphic" viewBox="0 0 640 360" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
        </linearGradient>
        <clipPath id="heroClip">
          <rect width="640" height="360" rx="24" />
        </clipPath>
      </defs>
      <g clipPath="url(#heroClip)">
        <rect width="640" height="360" fill="url(#heroFade)" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
          const h = 40 + ((i * 37) % 160);
          return (
            <rect
              key={i}
              className="hero-bar"
              style={{ animationDelay: `${i * 0.12}s` }}
              x={48 + i * 46}
              y={280 - h}
              width="22"
              height={h}
              rx="11"
              fill="#ff8a3d"
              opacity={0.25 + (i % 4) * 0.12}
            />
          );
        })}
      </g>
    </svg>
  );
}
