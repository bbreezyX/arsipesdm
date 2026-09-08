"use client";

import {
  Children,
  isValidElement,
  useRef,
  type ReactNode,
  type AriaAttributes,
} from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Prefix every value so an empty option remains selectable in Radix.
const encode = (value: string) => `option:${value}`;
export function CustomSelect({
  value = "",
  onValueChange,
  children,
  className,
  id,
  disabled,
  required,
  name,
  ...aria
}: {
  value?: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
} & AriaAttributes) {
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedOption = Children.toArray(children).find((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode }>(child))
      return false;
    return (
      (child.props.value ?? Children.toArray(child.props.children).join("")) ===
      value
    );
  });
  const selectedLabel = isValidElement<{ children?: ReactNode }>(selectedOption)
    ? selectedOption.props.children
    : value;
  return (
    <SelectPrimitive.Root
      value={encode(value)}
      onValueChange={(v) => onValueChange(v.slice(7))}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        ref={trigger}
        id={id}
        className={cn("custom-select", className)}
        aria-required={required}
        {...aria}
      >
        <SelectPrimitive.Value>{selectedLabel}</SelectPrimitive.Value>
        <SelectPrimitive.Icon className="select-chevron">
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      {(required || name) && (
        <input
          className="select-validation"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          disabled={disabled}
          value={value}
          onChange={() => {}}
          onInvalid={() => trigger.current?.focus()}
        />
      )}
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select-popup"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {children}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function SelectOption({
  value,
  children,
  disabled,
}: {
  value?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const text = Children.toArray(children).join("");
  return (
    <SelectPrimitive.Item
      className="select-option"
      value={encode(value ?? text)}
      disabled={disabled}
      textValue={text}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="select-check">
        <Check size={15} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
