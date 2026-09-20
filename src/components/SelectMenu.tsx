"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useId,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectMenuOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectMenuProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  disabled?: boolean;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  size?: "md" | "sm";
};

export function SelectMenu({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Select…",
  searchable = false,
  searchPlaceholder = "Search...",
  className,
  triggerClassName,
  menuClassName,
  size = "md",
}: SelectMenuProps) {
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!searchable || trimmed.length === 0) {
      return options;
    }

    return options.filter((option) =>
      option.label.toLowerCase().includes(trimmed),
    );
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const maxMenuHeight = 240;
      const viewportPadding = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const measuredMenuHeight = Math.min(
        maxMenuHeight,
        menuRef.current?.scrollHeight ?? maxMenuHeight,
      );
      const openUpward =
        spaceBelow < maxMenuHeight + 8 && spaceAbove > spaceBelow;

      // Calculate scroll offsets for absolute positioning from document
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

      const top = openUpward
        ? Math.max(viewportPadding, rect.top + scrollTop - measuredMenuHeight - 4)
        : rect.bottom + scrollTop + 4;

      const left = rect.left + scrollLeft;

      setMenuStyle({
        position: "absolute",
        top,
        left,
        width: rect.width,
        zIndex: 1000,
        maxHeight: maxMenuHeight,
      });
    };

    updatePosition();

    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      const menuEl = menuRef.current;
      const target = e.target as Node;
      if (el?.contains(target) || menuEl?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      // Ignore menu-internal scroll events so list scrolling stays smooth.
      if (target && menuRef.current?.contains(target)) return;
      updatePosition();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);

    if (searchable) {
      window.requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    }

    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, searchable]);

  useEffect(() => {
    if (!open && query) {
      setQuery("");
    }
  }, [open, query]);

  useEffect(() => {
    const onExternalOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id !== instanceId) {
        setOpen(false);
      }
    };

    window.addEventListener("select-menu-opened", onExternalOpen);
    return () => {
      window.removeEventListener("select-menu-opened", onExternalOpen);
    };
  }, [instanceId]);

  useEffect(() => {
    if (!open) return;

    window.dispatchEvent(
      new CustomEvent("select-menu-opened", {
        detail: { id: instanceId },
      }),
    );
  }, [instanceId, open]);

  const mdTrigger = "min-h-9 px-3 py-2 text-sm rounded-md gap-2";
  const smTrigger = "min-h-8 px-2 py-1.5 text-xs rounded-md gap-1.5";
  const mdItem = "px-3 py-2 text-sm";
  const smItem = "px-2 py-1.5 text-xs";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          setOpen((isOpen) => !isOpen);
        }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between border border-gray-200 bg-white text-left text-gray-900 outline-none",
          "hover:bg-gray-50",
          "focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-gray-700 dark:bg-[#1A1F2E] dark:text-gray-100 dark:hover:bg-white/5",
          size === "md" ? mdTrigger : smTrigger,
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-slate-500 opacity-70 dark:text-gray-400",
            size === "md" ? "h-4 w-4" : "h-3.5 w-3.5",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={menuStyle}
            className={cn(
              "overflow-hidden rounded-md border border-[var(--border)] bg-white py-0.5 shadow-card",
              "dark:border-gray-700 dark:bg-[#1A1F2E]",
              menuClassName,
            )}
          >
            {searchable ? (
              <div className="border-b border-gray-200 p-2 dark:border-gray-700">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder={searchPlaceholder}
                  className={cn(
                    "w-full rounded-md border border-gray-200 bg-white text-gray-900 outline-none",
                    "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
                    "dark:border-gray-700 dark:bg-[#1A1F2E] dark:text-gray-100",
                    size === "md" ? "px-3 py-2 text-sm" : "px-2 py-1.5 text-xs",
                  )}
                />
              </div>
            ) : null}
            <div className="max-h-60 overflow-y-auto overscroll-contain">
              {filteredOptions.length === 0 ? (
                <div
                  className={cn(
                    "text-gray-500 dark:text-gray-400",
                    size === "md" ? mdItem : smItem,
                  )}
                >
                  No results
                </div>
              ) : null}
              {filteredOptions.map((opt, index) => {
                const isActive = opt.value === value;
                return (
                  <button
                    key={`${opt.value}::${opt.label}::${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={opt.disabled}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left transition-colors",
                      size === "md" ? mdItem : smItem,
                      isActive
                        ? "bg-brand-50 font-medium text-brand-900 dark:bg-brand-950/50 dark:text-brand-100"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5",
                      opt.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="block truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
