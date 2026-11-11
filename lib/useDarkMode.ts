"use client";
import { useEffect, useState } from "react";

export function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () =>
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(read());
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => setDark(read());
    mq.addEventListener("change", onMq);
    return () => {
      obs.disconnect();
      mq.removeEventListener("change", onMq);
    };
  }, []);
  return dark;
}
