"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number | null;
  onChange: (cents: number | null) => void;
  id: string;
  name: string;
  error?: string;
  placeholder?: string;
}

function centsToDisplay(cents: number | null): string {
  if (cents === null || Number.isNaN(cents)) return "";
  return (cents / 100).toFixed(2);
}

export function CurrencyInput({
  value,
  onChange,
  id,
  name,
  error,
  placeholder,
}: CurrencyInputProps) {
  const [text, setText] = useState<string>(centsToDisplay(value));
  const describedById = useId();

  // Keep local text in sync when the parent resets the value.
  useEffect(() => {
    setText(centsToDisplay(value));
  }, [value]);

  // Strict decimal: optional integer part, optional decimal point with up to
  // two fractional digits. We deliberately reject "75abc" — `parseFloat` would
  // silently accept it as `75`, which the original implementation did.
  const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

  const handleBlur = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      onChange(null);
      setText("");
      return;
    }
    if (!DECIMAL_RE.test(trimmed)) {
      onChange(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      onChange(null);
      return;
    }
    const cents = Math.round(parsed * 100);
    onChange(cents);
    setText((cents / 100).toFixed(2));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-neutral-700"
        >
          $
        </span>
        <input
          id={id}
          name={name}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          aria-describedby={describedById}
          placeholder={placeholder}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent pl-7 pr-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            error && "border-destructive",
          )}
        />
        <span id={describedById} className="sr-only">
          US dollars
        </span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
