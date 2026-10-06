import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import React, { useEffect, useRef } from "react";

import { Compass, X, LoaderCircle } from "lucide-react";

export function Avatar({
  person,
  className = "",
}: {
  person?: { display_name?: string; avatar_url?: string | null } | null;
  className?: string;
}) {
  return person?.avatar_url ? (
    <img
      className={`avatar ${className}`}
      src={person.avatar_url}
      alt={person.display_name}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className={`avatar initials ${className}`}>
      {person?.display_name?.[0] || "F"}
    </span>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#discover" aria-label="Flingtopia home">
      <svg className="brand-butterfly" viewBox="0 0 24 22" aria-hidden="true">
        <path
          d="M12 11C9 3 4 1 2 4c-2 3 2 8 10 7zM12 11c3-8 8-10 10-7 2 3-2 8-10 7z"
          fill="currentColor"
        />
      </svg>
      <span className="brand-name">FLINGTOPIA</span>
    </a>
  );
}

export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Loading…
    </div>
  );
}

export function Empty({
  icon: Icon = Compass,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={30} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    if (!el) return;
    el?.querySelector<HTMLElement>("button,input,select,textarea")?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...el!.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
          ),
        ];
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keys);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
