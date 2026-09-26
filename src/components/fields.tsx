import { useId, type KeyboardEvent, type ReactNode } from "react";
import { reportSessionResponse } from "@/lib/session-client";
export function Field({
  label,
  children,
  hint,
  required = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: isian dikirim lewat children
    <label className={`field ${className}`}>
      <span className="field-label">
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
export function Empty({
  icon,
  heading,
  description,
  action,
}: {
  icon: ReactNode;
  heading: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{heading}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
/** Enter di isian satu baris pindah ke isian berikutnya dan tidak pernah mengirim formulir. */
export function advanceOnEnter(event: KeyboardEvent<HTMLElement>) {
  const target = event.target;
  if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing) return;
  if (!(target instanceof HTMLInputElement) || ["checkbox", "radio", "button", "submit", "file"].includes(target.type)) return;
  event.preventDefault();
  const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])',
  )).filter(field => field.getClientRects().length > 0);
  fields[fields.indexOf(target) + (event.shiftKey ? -1 : 1)]?.focus();
}
export function ErrorMessage({ message }: { message: string }) {
  const id = useId();
  return message ? (
    <p id={id} role="alert" className="error-message">
      {message}
    </p>
  ) : null;
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  reportSessionResponse(url, response);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Gagal menyimpan. Silakan coba lagi.");
  return result as T;
}
