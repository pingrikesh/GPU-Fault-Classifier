import { Info } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { GLOSSARY, type GlossaryKey } from "../lib/glossary";

interface Props {
  glossaryKey: GlossaryKey;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/** Click-to-open explainer for executives: a short definition plus why the
 * number or diagram matters, without requiring operator vocabulary. */
export function InfoPopover({ glossaryKey, side = "bottom", align = "start" }: Props) {
  const entry = GLOSSARY[glossaryKey];
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`What does ${entry.title} mean?`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-slate-400 ring-1 ring-slate-200/80 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50 dark:text-slate-500 dark:ring-white/[0.12] dark:hover:bg-white/[0.06] dark:hover:text-slate-300"
        >
          <Info size={11} strokeWidth={2.25} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl px-3.5 py-3 shadow-card animate-tooltipIn outline-none"
          style={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)" }}
        >
          <p className="text-[12px] font-semibold leading-snug text-slate-800 dark:text-slate-100">{entry.title}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">{entry.definition}</p>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Why it matters
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">{entry.whyItMatters}</p>
          <Popover.Arrow width={12} height={6} style={{ fill: "var(--tooltip-border)" }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
