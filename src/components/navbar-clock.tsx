"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

const weekdayFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
});
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function NavbarClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <time className="navbar-clock" dateTime={now?.toISOString()}>
      <span className="sr-only">
        {now ? `${weekdayFormatter.format(now)}, ${dateFormatter.format(now)}, pukul ${timeFormatter.format(now)} WIB` : "Waktu Indonesia Barat"}
      </span>
      <span className="navbar-clock-icon" aria-hidden="true">
        <Clock3 size={17} strokeWidth={1.7} />
      </span>
      <span className="navbar-clock-calendar" aria-hidden="true">
        <span className="navbar-clock-day">{now ? weekdayFormatter.format(now) : "\u00a0"}</span>
        <span className="navbar-clock-date">{now ? dateFormatter.format(now) : "\u00a0"}</span>
      </span>
      <span className="navbar-clock-digital" aria-hidden="true">
        <span className="navbar-clock-time">{now ? timeFormatter.format(now) : "\u00a0"}</span>
        <span className="navbar-clock-zone">WIB</span>
      </span>
    </time>
  );
}
