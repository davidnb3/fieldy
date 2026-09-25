import { useMemo, useState } from "react";
import Logo from "./Logo.jsx";
import { jumpTo } from "./route.jsx";

const FAQS = [
  {
    id: "blocked",
    q: "Why does my Mac or PC block Fieldy?",
    a: [
      "The downloads are unsigned. Fieldy does not have a paid Apple Developer ID or a Windows code-signing certificate, so Gatekeeper and SmartScreen stop an app they do not recognize until you allow it.",
      "On a Mac, unzip the download, Control-click Fieldy, and choose Open. If macOS still refuses, open System Settings, go to Privacy & Security, and choose Open Anyway.",
      "On Windows, if SmartScreen says it protected your PC, choose More info, then Run anyway. You allow it once. The file is the Fieldy build from this site.",
    ],
  },
  {
    id: "which-computer",
    q: "Which Mac or Windows PC can run it?",
    a: "The Mac download is for Apple Silicon. There is no Intel Mac build. The Windows download is 64-bit.",
  },
  {
    id: "account",
    q: "Do I need an account?",
    a: "No. There is nothing to sign in to, and there is no cloud library.",
  },
  {
    id: "upload",
    q: "Does Fieldy upload my recordings?",
    a: "No. You pick one folder on this computer, and that folder is the library. Files stay there. After Fieldy is installed, it works without the internet.",
  },
  {
    id: "yamnet",
    q: "How does Fieldy decide the folder?",
    a: [
      "An AI model called YAMNet listens to the recording on your computer. TensorFlow is the software that runs that model. Nothing is sent away to be analyzed.",
      "YAMNet already knows hundreds of everyday sounds, such as speech, rain, wind, animals, and engines. It does not judge the file in one gulp. It steps through the whole recording in short, overlapping slices, about a second each, and scores how much each sound is present.",
      "The folder is the sound it is most sure about, as long as that score clears the threshold in Settings. Other names that also clear the threshold are written on the file as tags. If nothing is sure enough, or two unrelated sounds each take over a different part of the take, the file goes in Mixed.",
    ],
  },
  {
    id: "formats",
    q: "Which files can I drop in?",
    a: "WAV, AIFF, FLAC, and MP3, or a folder of those files. Fieldy listens to the whole file and files it in a folder named for the sound it heard, such as Speech, Rain, or Wind. If nothing is clear enough, the file goes in Mixed. The original format is left as it is.",
  },
  {
    id: "move-copy",
    q: "What is the difference between move and copy?",
    a: "Settings has a choice for each drop. Move takes the file from where it is and puts it in the library. Copy leaves the original where it was and puts a copy in the library.",
  },
  {
    id: "tags",
    q: "Why is a file in Mixed, or why are there no tags?",
    a: "The folder is the sound Fieldy is most sure about. Tags are the other names that were confident enough to keep. If nothing reached that bar, the file can land in Mixed, and the list says there are no tags.",
  },
  {
    id: "drag",
    q: "Can I drag a file into another app?",
    a: "Yes. Drag the handle to the left of the play button, or the file name, out of Fieldy into a DAW, Finder, or Explorer. Fieldy does not replace those apps.",
  },
  {
    id: "undo",
    q: "Can I undo a drop or a delete?",
    a: "Yes. Undo and redo are in the app bar, and they last until you quit Fieldy. A drop, move, rename, delete, star, or collection change can be undone as one step.",
  },
  {
    id: "library",
    q: "What if my library folder is missing?",
    a: "If the folder was moved, renamed, or cannot be read, Fieldy says so and lets you pick it again or choose another folder. Changing the folder from Settings asks whether to bring the existing files along or start fresh. A new folder nested inside the old one, or the old one inside the new one, is refused.",
  },
  {
    id: "playback",
    q: "Does playback change my original file?",
    a: "No. Fieldy plays a temporary preview. The file in your library stays in the format you dropped.",
  },
  {
    id: "free",
    q: "Is Fieldy free?",
    a: "Yes. There is no subscription and no shop.",
  },
];

const TOPICS = [
  "My Mac or PC blocked the app",
  "Download or install",
  "The library folder",
  "Dropping and organizing files",
  "Something else",
];

const CONTACT_EMAIL = "support@fieldy.app";

export function SiteHeader({ path, navigate, solid }) {
  const home = path === "/";
  return (
    <header className={`nav ${solid || !home ? "nav-solid" : ""}`}>
      <div className="nav-inner">
        <a
          className="nav-logo"
          href={home ? "#top" : "/"}
          aria-label="Fieldy home"
          onClick={home ? jumpTo("top") : (event) => navigate(event, "/")}
        >
          <Logo height={22} />
        </a>
        <nav className="nav-links" aria-label="Site">
          {home ? (
            <a href="#features" onClick={jumpTo("features")}>
              Features
            </a>
          ) : (
            <a href="/#features">Features</a>
          )}
          {home ? (
            <a href="#download" onClick={jumpTo("download")}>
              Download
            </a>
          ) : (
            <a href="/#download">Download</a>
          )}
          <a
            href="/support"
            aria-current={path === "/support" || path === "/contact" ? "page" : undefined}
            onClick={(event) => navigate(event, "/support")}
          >
            Support & Contact
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ path, navigate }) {
  const home = path === "/";
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-top">
          <Logo height={20} />
          <p className="tagline">free · offline · yours</p>
        </div>
        <div className="footer-links">
          {home ? (
            <a href="#download" onClick={jumpTo("download")}>
              Download
            </a>
          ) : (
            <a href="/#download">Download</a>
          )}
          {home ? (
            <a href="#features" onClick={jumpTo("features")}>
              Features
            </a>
          ) : (
            <a href="/#features">Features</a>
          )}
          <a href="/support" onClick={(event) => navigate(event, "/support")}>
            Support & Contact
          </a>
          <a href={home ? "#legal" : "/#legal"} onClick={home ? jumpTo("legal") : undefined}>
            Privacy
          </a>
          <a href={home ? "#legal" : "/#legal"} onClick={home ? jumpTo("legal") : undefined}>
            Terms
          </a>
        </div>
        <p className="legal" id={home ? "legal" : undefined}>
          Fieldy is a desktop library for your own recordings. Not a cloud SFX platform, not a shop,
          not a search of the internet.
        </p>
      </div>
    </footer>
  );
}

export function SupportPage({ navigate }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(() => new Set(["blocked"]));
  const needle = query.trim().toLowerCase();
  const items = useMemo(() => {
    if (!needle) return FAQS;
    return FAQS.filter((item) => {
      const answer = Array.isArray(item.a) ? item.a.join(" ") : item.a;
      return item.q.toLowerCase().includes(needle) || answer.toLowerCase().includes(needle);
    });
  }, [needle]);

  function toggle(id) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="page page-support">
      <div className="shell page-narrow">
        <h1>Support & Contact</h1>
        <p className="page-lead">
          Short answers for a blocked download, a missing folder, and where a recording went.
        </p>
        <div className="support-search">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label="Search questions"
            value={query}
            placeholder="Search questions"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {items.length === 0 ? (
          <p className="qa-empty">Nothing matches that. Try another word, or use Contact us.</p>
        ) : (
          <div className="qa">
            {items.map((item) => {
              const expanded = needle ? true : open.has(item.id);
              return (
                <div className="qa-item" key={item.id}>
                  <button
                    type="button"
                    className="qa-q"
                    aria-expanded={expanded}
                    aria-controls={`answer-${item.id}`}
                    onClick={() => toggle(item.id)}
                  >
                    {item.q}
                    <span
                      className={`material-symbols-outlined qa-chevron${expanded ? " open" : ""}`}
                      aria-hidden="true"
                    >
                      expand_more
                    </span>
                  </button>
                  {expanded ? (
                    <div className="qa-a" id={`answer-${item.id}`}>
                      {(Array.isArray(item.a) ? item.a : [item.a]).map((part) => (
                        <p key={part}>{part}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <a className="contact-fab" href="/contact" onClick={(event) => navigate(event, "/contact")}>
        <span className="material-symbols-outlined" aria-hidden="true">
          chat
        </span>
        Contact us
      </a>
    </main>
  );
}

export function ContactPage() {
  const [sent, setSent] = useState(false);

  function onSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = `Fieldy — ${data.get("topic")}`;
    const body = `${data.get("message")}\n\n${data.get("name")}\n${data.get("email")}`;
    const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setSent(true);
  }

  return (
    <main className="page">
      <div className="shell contact-grid">
        <div className="page-intro">
          <h1>Tell us what happened.</h1>
          <p className="page-lead">
            If macOS or Windows blocked the app, a folder went missing, or a file landed somewhere
            unexpected, write it here.
          </p>
          <p className="contact-note">
            There is no account to look up. The form opens your email app with the note filled in, and
            it sends from you to {CONTACT_EMAIL}.
          </p>
        </div>
        <form className="contact-form" onSubmit={onSubmit}>
          <label className="field">
            Topic
            <select name="topic" required defaultValue="">
              <option value="" disabled>
                Choose a topic
              </option>
              {TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Your name
            <input name="name" type="text" autoComplete="name" required placeholder="Your name" />
          </label>
          <label className="field">
            Your email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            Message
            <textarea name="message" required rows={6} placeholder="What happened, and what you expected" />
          </label>
          <div className="form-actions">
            {sent ? <p className="form-sent">Your email app should open with this note. Send it from there.</p> : null}
            <button className="btn btn-primary" type="submit">
              Send
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
