"use client";
import { label } from "@/lib/domain";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/app" aria-label="CampusFix home">
      <span className="brand-mark">
        <Wrench size={21} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span>
        campus<span className="brand-light">fix</span>
        {!compact && <small>UNIVERSITY SERVICES</small>}
      </span>
    </Link>
  );
}
export function Badge({
  value,
  priority = false,
}: {
  value: string;
  priority?: boolean;
}) {
  return (
    <span
      className={`badge ${priority ? "priority " : ""}${value.toLowerCase()}`}
    >
      <span className="status-dot" />
      {priority ? `${value.slice(0, 2)} ${label(value)}` : label(value)}
    </span>
  );
}
export function Notice({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? (
        <CheckCircle2 size={18} aria-hidden="true" />
      ) : (
        <AlertCircle size={18} aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title = "No reports here yet",
  text = "New reports will appear here.",
  href,
  action,
}: {
  title?: string;
  text?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {href && (
        <Link className="btn btn-primary" href={href}>
          {action}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function Loading({
  label: text = "Loading your workspace",
}: {
  label?: string;
}) {
  return (
    <div role="status" className="loading">
      <span className="sr-only">{text}</span>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-banner" />
      <div className="skeleton-row">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton skeleton-stat" />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
export function Busy() {
  return <LoaderCircle size={16} className="spin" aria-hidden="true" />;
}
export function Field({
  label: caption,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={htmlFor}>{caption}</label>
      {children}
      {error ? (
        <span className="field-message" id={`${htmlFor}-hint`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={`${htmlFor}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
export function CampusIllustration() {
  return (
    <svg
      className="campus-illustration"
      viewBox="0 0 460 220"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M20 172 215 214 450 150 255 111Z" opacity=".2" />
        <path d="m72 143 150 34 159-45-147-33Z" opacity=".3" />
        <path d="m72 143 0-62 86 20v62M72 81l63-23 86 20-63 23M158 101l63-23v62l-63 23" />
        <path d="m235 137 0-64 106-30 0 64-106 30Z" />
        <path d="m235 73-57-15 106-30 57 15M178 58v26" />
        <path d="m267 126 0-37 35-10 0 37M245 78v16m11-19v16m57-33v15m15-19v15M84 96v12m18-8v12m18-8v12m17-8v12m40-20v14m20-21v14" />
        <path d="m320 159 0-38 66-18 0 38-66 18ZM320 121l-39-10 66-19 39 11M281 111v27l39 10M332 125v13m14-17v13m14-17v13m14-17v13M95 157l0 15m-8-20c0-13 16-13 16 0 0 11-16 11-16 0Zm310-65v18m-9-24c0-15 18-15 18 0 0 14-18 14-18 0Z" />
        <path
          d="M206 188 416 130M38 142 63 149"
          strokeDasharray="5 5"
          opacity=".5"
        />
      </g>
      <circle cx="242" cy="50" r="17" fill="#e7c975" />
      <path
        d="m235 50 5 5 9-11"
        stroke="#163c32"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
