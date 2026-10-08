import { ShieldCheck } from "lucide-react";

export const COMMUNITY_RULES = [
  "Be respectful. No harassment, bullying, threats or hate speech.",
  "No sexual, explicit or violent content — on camera or in speech.",
  "You must be 18 or older to use LinguaMatch.",
  "Don't share personal details (full name, address, phone, social handles), and don't ask for them.",
  "No spam, advertising or recruiting.",
  "Practice the target language — this is a learning space.",
];

export function CommunityRules({ compact = false }: { compact?: boolean }) {
  return (
    <div className="bg-muted/50 rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="text-primary size-4" /> Community rules
      </div>
      <ul className={compact ? "text-muted-foreground space-y-1 text-xs" : "text-muted-foreground space-y-1.5 text-sm"}>
        {COMMUNITY_RULES.map((r) => (
          <li key={r} className="flex gap-2">
            <span aria-hidden>•</span>
            {r}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3 text-xs">
        You can end, skip, block or report anyone at any time. Reported users are reviewed and may be suspended.
      </p>
    </div>
  );
}
