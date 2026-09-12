"use client";

import { useState, type ComponentType } from "react";
import {
  ChevronDown, FilePlus2, FileX2, MapPin, MapPinOff, PenLine, Plus, Save, Sparkles, Trash2, Undo2, type LucideProps,
} from "lucide-react";
import type { ActivityItem } from "@/lib/beranda";

const DAY = 86_400_000;
const jakartaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayText = new Intl.DateTimeFormat("id-ID", { weekday: "long" });
const dateShort = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long" });
const dateLong = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

type Icon = ComponentType<LucideProps>;
type Phrase = { icon: Icon; verb: string; noun: string; tail?: string };

/** Kalimat aktif untuk setiap tindakan yang dicatat API; tindakan lain jatuh ke bentuk aslinya. */
const phrases: Record<string, Phrase> = {
  "Arsip ditambahkan": { icon: Plus, verb: "menambahkan", noun: "arsip" },
  "Draft disimpan": { icon: Save, verb: "menyimpan", noun: "draft" },
  "Arsip dilengkapi": { icon: PenLine, verb: "melengkapi", noun: "arsip" },
  "Arsip diperbarui": { icon: PenLine, verb: "memperbarui", noun: "arsip" },
  "Dipindahkan ke sampah": { icon: Trash2, verb: "memindahkan", noun: "arsip", tail: "ke sampah" },
  "Arsip dipulihkan": { icon: Undo2, verb: "memulihkan", noun: "arsip" },
  "Dokumen diunggah": { icon: FilePlus2, verb: "mengunggah", noun: "dokumen" },
  "Dokumen dihapus": { icon: FileX2, verb: "menghapus", noun: "dokumen" },
  "Berkas fisik dicatat": { icon: MapPin, verb: "mencatat", noun: "berkas fisik" },
  "Catatan berkas fisik dihapus": { icon: MapPinOff, verb: "menghapus", noun: "catatan berkas fisik" },
};

function sentence(actor: string, action: string, count: number) {
  const phrase = phrases[action];
  if (!phrase) return <><b>{actor}</b>: {action}</>;
  const object = count > 1 ? `${count} ${phrase.noun}` : phrase.noun;
  return <><b>{actor}</b> {phrase.verb} {object}{phrase.tail ? ` ${phrase.tail}` : ""}</>;
}

/** PD/2026/0077 … PD/2026/0084 menjadi "PD/2026/0077–0084" bila awalannya sama. */
function codeRange(codes: string[]) {
  const unique = [...new Set(codes)];
  if (unique.length === 1) return unique[0];
  const split = (code: string) => {
    const at = code.lastIndexOf("/");
    return at === -1 ? null : { prefix: code.slice(0, at + 1), suffix: code.slice(at + 1) };
  };
  const parts = unique.map(split);
  const prefix = parts[0]?.prefix;
  if (prefix && parts.every(part => part && part.prefix === prefix && /^\d+$/.test(part.suffix))) {
    const numbers = parts.map(part => part!.suffix).sort();
    return `${prefix}${numbers[0]}–${numbers[numbers.length - 1]}`;
  }
  return `${unique[0]} dan ${unique.length - 1} lainnya`;
}

type Entry = { key: string; actor: string; action: string; at: string; items: ActivityItem[] };
type DayGroup = { day: string; entries: Entry[] };

function groupActivity(activity: ActivityItem[]): DayGroup[] {
  const days: DayGroup[] = [];
  for (const item of activity) {
    const day = jakartaDay.format(new Date(item.at));
    let group = days[days.length - 1];
    if (!group || group.day !== day) {
      group = { day, entries: [] };
      days.push(group);
    }
    const last = group.entries[group.entries.length - 1];
    // Tindakan sama oleh orang yang sama, berturut-turut: satu baris agenda.
    if (last && last.actor === item.actor && last.action === item.action && phrases[item.action]) {
      last.items.push(item);
    } else {
      group.entries.push({ key: `${item.tripId}-${item.id}`, actor: item.actor, action: item.action, at: item.at, items: [item] });
    }
  }
  return days;
}

function dayHeading(day: string, today: string) {
  const date = new Date(`${day}T12:00:00`);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  if (day === today) return { title: "Hari ini", date: `${weekdayText.format(date)}, ${dateShort.format(date)}` };
  if (day === yesterday) return { title: "Kemarin", date: `${weekdayText.format(date)}, ${dateShort.format(date)}` };
  return { title: weekdayText.format(date), date: (sameYear ? dateShort : dateLong).format(date) };
}

export default function BerandaActivity({ activity, today, onOpen }: {
  activity: ActivityItem[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!activity.length) {
    return (
      <div className="beranda-tidy">
        <Sparkles size={24} strokeWidth={1.6} aria-hidden="true" />
        <strong>Belum ada aktivitas</strong>
        <p>Perubahan arsip oleh setiap operator akan tercatat di sini.</p>
      </div>
    );
  }
  const days = groupActivity(activity);

  return (
    <div className="beranda-log">
      {days.map(group => {
        const heading = dayHeading(group.day, today);
        return (
          <section key={group.day} className="beranda-log-day" aria-label={`${heading.title}, ${heading.date}`}>
            <h3 className="beranda-log-date"><span>{heading.title}</span><span>{heading.date}</span></h3>
            <ol className="beranda-log-list">
              {group.entries.map(entry => {
                const phrase = phrases[entry.action];
                const Mark = phrase?.icon ?? PenLine;
                const many = entry.items.length > 1;
                const first = entry.items[0];
                const expanded = many && !!open[entry.key];
                return (
                  <li key={entry.key} className="beranda-log-entry" data-open={expanded || undefined}>
                    <time className="beranda-log-time" dateTime={entry.at}>{clock.format(new Date(entry.at))}</time>
                    <Mark className="beranda-log-mark" size={14} strokeWidth={1.9} aria-hidden="true" />
                    {many ? (
                      <div className="beranda-log-body">
                        <span className="beranda-log-text">{sentence(entry.actor, entry.action, entry.items.length)}</span>
                        <span className="beranda-log-ref">{codeRange(entry.items.map(item => item.code))}</span>
                        <button type="button" className="beranda-log-toggle" aria-expanded={expanded}
                          onClick={() => setOpen(state => ({ ...state, [entry.key]: !expanded }))}>
                          {expanded ? "Sembunyikan" : `Tampilkan ${entry.items.length} ${phrase?.noun ?? "catatan"}`}
                          <ChevronDown size={14} aria-hidden="true" />
                        </button>
                        {expanded && (
                          <ol className="beranda-log-items">
                            {entry.items.map(item => (
                              <li key={`${item.tripId}-${item.id}`}>
                                <button type="button" onClick={() => onOpen(item.tripId)}>
                                  <span className="beranda-log-ref">{item.code}</span>
                                  <span className="beranda-log-title">{item.title}</span>
                                </button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ) : (
                      <button type="button" className="beranda-log-body beranda-log-open" onClick={() => onOpen(first.tripId)}>
                        <span className="beranda-log-text">{sentence(entry.actor, entry.action, 1)}</span>
                        <span className="beranda-log-title"><span className="beranda-log-ref">{first.code}</span> {first.title}</span>
                        {first.detail ? <span className="beranda-log-detail">{first.detail}</span> : null}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
