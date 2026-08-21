import type { PropsWithChildren } from "react";

interface Props {
  width: number;
  height: number;
  className?: string;
}

/**
 * Renders SVG content that scales to fill its parent box (in either dimension)
 * while preserving the viewBox aspect ratio \u2014 the SVG equivalent of `object-fit: contain`.
 * The parent element determines the available size; no fixed pixel dimensions here.
 */
export function ViewBoxFrame({ width, height, className = "", children }: PropsWithChildren<Props>) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className={`h-full w-full ${className}`.trim()}>
      {children}
    </svg>
  );
}
