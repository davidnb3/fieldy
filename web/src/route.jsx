import { useCallback, useEffect, useState } from "react";

const HOME_TITLE = "Fieldy — Your recordings. Your folders. Only on your computer.";

export function scrollToId(id, behavior = "smooth") {
  const target = document.getElementById(id);
  if (!target) return;
  const navHeight = document.querySelector(".nav")?.getBoundingClientRect().height ?? 0;
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - navHeight);
  window.scrollTo({ top, behavior });
}

export function jumpTo(id) {
  return (event) => {
    event.preventDefault();
    scrollToId(id);
    window.history.replaceState(null, "", `#${id}`);
  };
}

function normalize(pathname) {
  if (!pathname || pathname === "/") return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function usePath() {
  const [path, setPath] = useState(() => normalize(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(normalize(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((event, href) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const next = normalize(new URL(href, window.location.origin).pathname);
    if (next === normalize(window.location.pathname)) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.history.pushState(null, "", href);
    setPath(next);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const titles = {
      "/support": "Support & Contact — Fieldy",
      "/contact": "Contact — Fieldy",
      "/privacy": "Privacy — Fieldy",
      "/terms": "Terms — Fieldy",
    };
    document.title = titles[path] || HOME_TITLE;
  }, [path]);

  return { path, navigate };
}
