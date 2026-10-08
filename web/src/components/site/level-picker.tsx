"use client";

import { CEFR_DESCRIPTIONS, CEFR_LEVELS, type CefrLevel } from "@linguamatch/shared";
import { cn } from "@/lib/utils";

export function LevelPicker({ value, onChange }: { value: CefrLevel | null; onChange: (level: CefrLevel) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Proficiency level">
      {CEFR_LEVELS.map((level) => {
        const info = CEFR_DESCRIPTIONS[level];
        const selected = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(level)}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              selected ? "border-primary bg-primary/5 ring-primary/20 ring-2" : "hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md text-sm font-semibold",
                selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              {level}
            </span>
            <span>
              <span className="block text-sm font-medium">{info.name}</span>
              <span className="text-muted-foreground block text-xs leading-snug">{info.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
