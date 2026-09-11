import { useId, type ReactNode } from "react";
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
