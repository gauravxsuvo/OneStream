// Small hand-rolled icon set (no icon library dependency) — 20x20 viewBox,
// inherit color via currentColor/fill so they drop into any button cleanly.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M5.5 3.6c0-.9 1-1.4 1.7-.9l9.6 6.4c.6.4.6 1.4 0 1.8l-9.6 6.4c-.7.5-1.7 0-1.7-.9V3.6Z" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <rect x="4.5" y="3.5" width="4" height="13" rx="1" />
      <rect x="11.5" y="3.5" width="4" height="13" rx="1" />
    </svg>
  );
}

export function VolumeIcon({ muted, level, ...props }: IconProps & { muted?: boolean; level?: number }) {
  const silent = muted || (level ?? 1) === 0;
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H7l4.1-3.4c.6-.5 1.4 0 1.4.8v13.2c0 .8-.8 1.3-1.4.8L7 14H4.5A1.5 1.5 0 0 1 3 12.5v-5Z" />
      {!silent && (
        <path
          d="M15.2 6.8a4.8 4.8 0 0 1 0 6.4M17.3 4.7a7.8 7.8 0 0 1 0 10.6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {silent && (
        <path
          d="M14.5 7.5 18 11M18 7.5l-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M11.4 2.5c.3 0 .6.2.7.5l.3 1.2c.5.2 1 .4 1.4.7l1.2-.4c.3-.1.6 0 .8.3l1 1.7c.1.3.1.6-.1.8l-.8.9c.1.5.1 1 0 1.5l.8.9c.2.2.2.5.1.8l-1 1.7c-.2.3-.5.4-.8.3l-1.2-.4c-.4.3-.9.5-1.4.7l-.3 1.2c-.1.3-.4.5-.7.5h-2c-.3 0-.6-.2-.7-.5l-.3-1.2c-.5-.2-1-.4-1.4-.7l-1.2.4c-.3.1-.6 0-.8-.3l-1-1.7c-.1-.3-.1-.6.1-.8l.8-.9a5.4 5.4 0 0 1 0-1.5l-.8-.9a.7.7 0 0 1-.1-.8l1-1.7c.2-.3.5-.4.8-.3l1.2.4c.4-.3.9-.5 1.4-.7l.3-1.2c.1-.3.4-.5.7-.5h2Zm-1 4.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function FullscreenIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7.5 3H4a1 1 0 0 0-1 1v3.5M12.5 3H16a1 1 0 0 1 1 1v3.5M7.5 17H4a1 1 0 0 1-1-1v-3.5M12.5 17H16a1 1 0 0 0 1-1v-3.5" />
    </svg>
  );
}

export function ExitFullscreenIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.5 7.5H7V4M16.5 7.5H13V4M3.5 12.5H7V16M16.5 12.5H13V16" />
    </svg>
  );
}

export function PipIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <rect x="9.5" y="10" width="6" height="4.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9v4.5" strokeLinecap="round" />
      <circle cx="10" cy="6.75" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
