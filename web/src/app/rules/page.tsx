import { CommunityRules } from "@/components/site/community-rules";
import { PageShell } from "@/components/site/header";

export default function RulesPage() {
  return (
    <PageShell className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Safety & community rules</h1>
      <p className="text-muted-foreground mt-2">LinguaMatch connects strangers. These rules keep it a good place to learn.</p>
      <div className="mt-8 grid gap-8">
        <CommunityRules />
        <section className="grid gap-3 text-sm leading-relaxed">
          <h2 className="text-lg font-medium">Your tools during a call</h2>
          <p><strong>End</strong> leaves the conversation and takes you to your report. <strong>Next</strong> skips to a new partner.</p>
          <p><strong>Block</strong> ends the call and makes sure you&apos;re never matched with that person again.</p>
          <p><strong>Report</strong> ends the call, blocks the person, and sends the report to moderators. Users reported by several people are suspended automatically pending review.</p>
        </section>
        <section className="grid gap-3 text-sm leading-relaxed">
          <h2 className="text-lg font-medium">What we store — and what we don&apos;t</h2>
          <p>Video and audio go directly between you and your partner (peer-to-peer) and are <strong>never recorded or stored</strong> by LinguaMatch.</p>
          <p>If you enable transcription, your browser converts only your own speech to text. In Chrome and Edge this uses the browser vendor&apos;s cloud speech service. The text is sent to our server and to our AI provider to produce your report.</p>
          <p>Transcripts are deleted once reports are generated, unless every participant chose to keep them in Settings. Your report only ever contains your own words — your partner never sees your report, and you never see theirs.</p>
          <p>Partners see only your username, native language and level. Never your email or account details.</p>
        </section>
      </div>
    </PageShell>
  );
}
