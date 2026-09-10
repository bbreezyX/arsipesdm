"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type InputHTMLAttributes } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = {value: string; description?: string};
type EditorElement = HTMLInputElement | HTMLTextAreaElement;
type Props = Omit<InputHTMLAttributes<EditorElement>, "value" | "onChange" | "list" | "children"> & {
  value: string;
  onValueChange: (value: string) => void;
  onOptionSelect?: (option: ComboboxOption) => void;
  options: ComboboxOption[];
  emptyMessage?: string;
  multiline?: boolean;
  rows?: number;
};

/** Editable suggestions: typing a new value remains valid, as with the original fields. */
export function Combobox({value, onValueChange, onOptionSelect, options, className, emptyMessage = "Tidak ada pilihan yang cocok.", onKeyDown, disabled, multiline = false, rows = 3, ...inputProps}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(-1);
  const input = useRef<EditorElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const query = search.trim().toLocaleLowerCase("id-ID");
  const unique = [...new Map(options.map(option => [option.value, option])).values()];
  const filtered = unique.filter(option => `${option.value} ${option.description ?? ""}`.toLocaleLowerCase("id-ID").includes(query));
  const activeIndex = active >= 0 && active < filtered.length ? active : -1;
  useEffect(() => {
    if (open && activeIndex >= 0) list.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({block: "nearest"});
  }, [activeIndex, open]);
  function choose(option: ComboboxOption) {
    onValueChange(option.value);
    onOptionSelect?.(option);
    setOpen(false); setSearch(""); setActive(-1);
    input.current?.focus();
  }
  function toggle() {
    setOpen(current => !current); setSearch(""); setActive(-1);
    input.current?.focus();
  }
  function handleKeyDown(event: KeyboardEvent<EditorElement>) {
    if (event.nativeEvent.isComposing) return;
    // Preserve cursor movement and newlines in long descriptions. Search has its own keyboard navigation.
    if (event.currentTarget.tagName === "TEXTAREA" && !event.altKey && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      if (event.key === "Enter") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {setSearch(""); setOpen(true); setActive(event.key === "ArrowDown" ? 0 : unique.length - 1);}
      else setActive(current => {
        if (!filtered.length) return -1;
        if (current < 0) return event.key === "ArrowDown" ? 0 : filtered.length - 1;
        return (current + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex >= 0) choose(filtered[activeIndex]);
      else {setOpen(false); input.current?.focus();}
      return;
    }
    if (event.key === "Escape" && open) {event.preventDefault(); event.stopPropagation(); setOpen(false); input.current?.focus(); return;}
    if (event.key === "Tab") setOpen(false);
    if (event.currentTarget === input.current) onKeyDown?.(event);
  }
  const editorProps = {
    ...inputProps, disabled, value, role: "combobox",
    "aria-autocomplete": "list" as const,
    "aria-expanded": open && !disabled,
    "aria-controls": open ? id : undefined,
    "aria-activedescendant": open && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined,
    onClick: () => {setOpen(true); setSearch(""); setActive(-1);},
    onChange: (event: React.ChangeEvent<EditorElement>) => {onValueChange(event.target.value); setSearch(event.target.value); setActive(-1); setOpen(true);},
    onKeyDown: handleKeyDown,
  };
  return <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
    <Popover.Anchor asChild>
      <div ref={anchor} className={cn("custom-combobox", className)} data-disabled={disabled || undefined} data-multiline={multiline || undefined}>
        {multiline
          ? <textarea {...editorProps} rows={rows} ref={element => {input.current = element;}} />
          : <input {...editorProps} ref={element => {input.current = element;}} />}
        <button type="button" className="combobox-toggle" tabIndex={-1} aria-label="Tampilkan pilihan" disabled={disabled} onClick={toggle}><ChevronDown size={16} /></button>
      </div>
    </Popover.Anchor>
    {/* Keep the menu inside the modal focus and scroll boundary. */}
    <Popover.Portal container={anchor.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? undefined}>
      <Popover.Content className="select-popup combobox-popup" sideOffset={6} collisionPadding={12} align="start"
        collisionBoundary={anchor.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? undefined}
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => {if (anchor.current?.contains(event.target as Node)) event.preventDefault();}}
        onEscapeKeyDown={event => {event.preventDefault(); setOpen(false); input.current?.focus();}}
      >
        <div className="combobox-caption">
          <Search size={14} aria-hidden="true" />
          <input className="combobox-search" aria-label={`Cari ${inputProps["aria-label"]?.toLocaleLowerCase("id-ID") || "pilihan"}`} placeholder="Cari pilihan…" value={search}
            autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id}
            aria-activedescendant={activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
            onChange={event => {setSearch(event.target.value); setActive(-1);}}
            onKeyDown={handleKeyDown} />
          <span className="combobox-count">{filtered.length}</span>
        </div>
        <div ref={list} id={id} role="listbox" aria-label={inputProps["aria-label"] || inputProps.placeholder || "Pilihan"} className="combobox-options">
          {filtered.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value} data-index={index} data-active={activeIndex === index || undefined} className="select-option combobox-option"
            onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
            <span><span className="combobox-option-title">{option.value}</span>{option.description && <small>{option.description}</small>}</span>
            {option.value === value && <Check size={15} className="select-check" />}
          </div>)}
          {!filtered.length && <div className="combobox-empty">{emptyMessage}<small>{value.trim() ? "Nilai yang diketik tetap dapat digunakan." : "Ketik untuk menambahkan nilai baru."}</small></div>}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
