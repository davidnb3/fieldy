import { useEffect, useMemo, useState } from "react";
import { jumpTo, scrollToId, usePath } from "./route.jsx";
import { PrivacyPage, TermsPage } from "./legal.jsx";
import { ContactPage, SiteFooter, SiteHeader, SupportPage } from "./support.jsx";
import {
  DropFiledVisual,
  DragOutVisual,
  LocalFolderVisual,
  OfflineFreeVisual,
} from "./visuals.jsx";

function detectOs() {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  return "mac";
}

const DOWNLOADS = {
  mac: {
    id: "mac",
    label: "View on GitHub",
    href: "https://github.com/davidnb3/fieldy",
  },
  windows: {
    id: "windows",
    label: "Download for Windows",
    href: "https://pub-e44d3963d21b4f35a226df362031034a.r2.dev/Fieldy-windows-x64.zip",
    file: "Fieldy-windows-x64.zip",
  },
};

function DownloadButtons({ primaryClass = "btn-primary", secondaryClass = "btn-ghost" }) {
  const os = useMemo(detectOs, []);
  const primary = os === "windows" ? DOWNLOADS.windows : DOWNLOADS.mac;
  const secondary = os === "windows" ? DOWNLOADS.mac : DOWNLOADS.windows;

  return (
    <div className="cta-row">
      <a
        className={primaryClass}
        href={primary.href}
        {...(primary.file ? { download: primary.file } : {})}
        data-os={primary.id}
      >
        {primary.label}
      </a>
      <a
        className={secondaryClass}
        href={secondary.href}
        {...(secondary.file ? { download: secondary.file } : {})}
        data-os={secondary.id}
      >
        {secondary.label}
      </a>
    </div>
  );
}

const MAIN_FEATURES = [
  {
    id: "drop",
    title: "Your Local Files Organized",
    copy: [
      "Drop WAV, AIFF, FLAC, or MP3 — files or folders — and Fieldy puts them into clear folders on disk.",
      "When a take doesn’t fit one class, it goes in a “Mixed” folder. Your original files stay the original format. Matching class names are written as tags on the files, and you can search, sort, and filter the library.",
    ],
    Visual: DropFiledVisual,
  },
  {
    id: "drag",
    title: "Integrates with your Workflow & Tools. Anywhere.",
    copy: [
      "Pull files from Fieldy into any other DAW or editor.",
      "Fieldy stays a library. It is not a walled garden, and it does not replace the apps you already use.",
    ],
    Visual: DragOutVisual,
  },
  {
    id: "local",
    title: "On your computer, not in the cloud",
    copy: [
      "There is no cloud library, no remote databank, and no login.",
      "You pick a folder. That folder is the library. Fieldy never asks you to upload your recordings.",
    ],
    Visual: LocalFolderVisual,
  },
  {
    id: "free",
    title: "Works offline, and it’s free",
    copy: [
      "After install, Fieldy runs without the internet.",
      "No subscription. No account. No shop. Just the files you already recorded.",
    ],
    Visual: OfflineFreeVisual,
  },
];

const MORE = [
  {
    title: "Stars & collections",
    body: "Star files you need again. Build collections as lists inside Fieldy — they are not extra folders on disk.",
  },
  {
    title: "Listen in the app",
    body: "Play a selection with a waveform, rewind, loop, mute, and pitch or tempo. The file on disk is never rewritten.",
  },
  {
    title: "Search, sort, filter",
    body: "Find folders and files quickly. Select many at once, then move, star, or add them in one step.",
  },
  {
    title: "Move or copy",
    body: "When you drop files, choose whether Fieldy moves them into the library or copies them and leaves the source.",
  },
  {
    title: "Undo",
    body: "A drop, a move, a rename, a delete — undo and redo from the app bar.",
  },
  {
    title: "Tags on the file",
    body: "Matching class names are written as tags on the original. Empty when nothing reached the threshold.",
  },
  {
    title: "Available on Windows",
    body: "A free Windows download. The code is on GitHub. No account required.",
  },
  {
    title: "No account",
    body: "No collaboration cloud. No team login. The library lives in the folder you chose.",
  },
];

export default function App() {
  const { path, navigate } = usePath();
  const [navSolid, setNavSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [path]);

  return (
    <>
      <SiteHeader path={path} navigate={navigate} solid={navSolid} />
      {path === "/support" ? (
        <SupportPage navigate={navigate} />
      ) : path === "/contact" ? (
        <ContactPage />
      ) : path === "/privacy" ? (
        <PrivacyPage navigate={navigate} />
      ) : path === "/terms" ? (
        <TermsPage navigate={navigate} />
      ) : (
        <Home />
      )}
      <SiteFooter path={path} navigate={navigate} />
    </>
  );
}

function Home() {
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    scrollToId(id, "auto");
    document.documentElement.style.scrollBehavior = previous;
  }, []);

  return (
    <main id="top">
        <section className="hero">
          <img
            className="hero-photo"
            src="/fieldy-hero.jpg?v=1"
            alt=""
            aria-hidden="true"
          />
          <div className="hero-bg" />
          <div className="hero-inner">
            <div className="hero-copy">
              <h1>Your recordings. Your folders. Only on your computer.</h1>
              <p className="lede">
                Fieldy is a simple, free, offline desktop library. Drop the files you recorded, let it
                organize them into folders describing the type of sound, then drag them into the tools you
                already use.
              </p>
              <DownloadButtons />
              <a className="see-features" href="#features" onClick={jumpTo("features")}>
                See features
              </a>
            </div>
          </div>
        </section>

        <section id="features" className="main-features">
          {MAIN_FEATURES.map((feat, i) => {
            const Visual = feat.Visual;
            const reverse = i % 2 === 1;
            return (
              <article
                key={feat.id}
                className={`feature-row ${reverse ? "reverse" : ""}`}
                id={`feature-${feat.id}`}
              >
                <div className="shell feature-split">
                  <div className="feature-text">
                    <h2>{feat.title}</h2>
                    {feat.copy.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                  <div className="feature-frame">
                    <Visual />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="more" id="more">
          <div className="shell">
            <h2>More, without the extra</h2>
            <p className="more-lede">
              A short list of what is actually in the app. Not a gold mine of other people’s sounds.
            </p>
            <div className="more-grid">
              {MORE.map((card) => (
                <article key={card.title} className="more-card">
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="download-wrap" id="download">
          <div className="download">
            <h2>Download Fieldy</h2>
            <p>Free for Windows. The code is on GitHub. No account. Runs on your computer, offline.</p>
            <DownloadButtons />
          </div>
        </section>
    </main>
  );
}
