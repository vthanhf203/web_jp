"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/components/SearchBar.module.css";

export interface SearchBarProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
}

export default function SearchBar({
  name,
  value,
  defaultValue = "",
  placeholder = "Tim theo y nghia, mau cau, vi du...",
  onChange,
  className,
  autoFocus,
}: SearchBarProps) {
  const [innerValue, setInnerValue] = useState<string>(value ?? defaultValue);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof value === "string") {
      setInnerValue(value);
    }
  }, [value]);

  const emitDebouncedChange = useCallback(
    (nextValue: string) => {
      if (!onChange) {
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        onChange(nextValue);
      }, 300);
    },
    [onChange]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className={`${styles.wrapper} ${className ?? ""}`}>
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M11 4a7 7 0 105.3 11.6L20 19"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <input
        type="search"
        name={name}
        value={innerValue}
        autoFocus={autoFocus}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setInnerValue(next);
          emitDebouncedChange(next);
        }}
        placeholder={placeholder}
        className={styles.input}
      />
    </div>
  );
}
