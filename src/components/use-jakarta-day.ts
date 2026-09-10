"use client";

import { useEffect, useState } from "react";
import { jakartaDay } from "@/lib/model";

export function useJakartaDay(initialNow: string) {
  const [today, setToday] = useState(() => jakartaDay(initialNow));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      const day = jakartaDay(now);
      setToday(day);
      const nextMidnight = Date.parse(`${day}T00:00:00+07:00`) + 86_400_000;
      timer = setTimeout(refresh, Math.max(100, nextMidnight - now.getTime() + 100));
    }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
