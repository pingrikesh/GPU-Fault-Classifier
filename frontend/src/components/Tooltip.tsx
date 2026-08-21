import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

/** Mount once near the app root. Short delay on first hover, near-instant
 * when moving between adjacent hover targets (e.g. hopping across GPUs). */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={250} skipDelayDuration={120}>
      {children}
    </RadixTooltip.Provider>
  );
}

interface HoverTooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  disabled?: boolean;
}

/** Styled drop-in replacement for the native `title` attribute: same "hover
 * to learn more" affordance, but themeable, instant, and able to render
 * rich content (badges, colored severity, multi-line layout) instead of a
 * single plain-text line. */
export function HoverTooltip({ content, children, side = "top", align = "center", disabled }: HoverTooltipProps) {
  if (disabled) return <>{children}</>;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={7}
          collisionPadding={8}
          className="z-50 max-w-[220px] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug text-slate-700 shadow-card animate-tooltipIn dark:text-slate-100"
          style={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)" }}
        >
          {content}
          <RadixTooltip.Arrow width={10} height={5} style={{ fill: "var(--tooltip-border)" }} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
