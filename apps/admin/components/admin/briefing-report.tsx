"use client";

import { cn, StatusPill } from "@meclaw/ui";
import type * as React from "react";
import type { BriefingReport, RunStatus, SourceKind } from "@/lib/research/types";

const SOURCE_TINTS: Record<SourceKind, { chip: string; dot: string; label: string }> = {
  corpus: {
    chip: "border-primary/20 bg-primary/10 text-primary",
    dot: "bg-primary",
    label: "corpus",
  },
  db: {
    chip: "border-success/20 bg-success/10 text-success",
    dot: "bg-success",
    label: "db",
  },
  web: {
    chip: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "web",
  },
};

export function BriefingReportView({
  report,
  status,
  target,
}: {
  report: BriefingReport;
  status: RunStatus;
  target: { company?: string; role?: string };
}) {
  const title = [target.company, target.role].filter(Boolean).join(" · ");
  const fitScore = typeof report.fit_score === "number" ? report.fit_score : null;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/90 p-4 text-card-foreground shadow-sm">
      <header className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Intelligence briefing
            </p>
            <h2 className="text-lg font-bold tracking-tight">{title || "Briefing report"}</h2>
          </div>
          <StatusPill status={status} />
        </div>

        <p className="max-w-3xl text-sm leading-6 text-foreground/90">{report.summary}</p>

        <FitScore score={fitScore} />
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-background/60">
        <Reveal index={0}>
          <DossierSection label="Matched strengths">
            <MatchedStrengthsList items={report.matched_strengths} />
          </DossierSection>
        </Reveal>

        <Reveal index={1}>
          <DossierSection label="Gaps">
            <GapsList items={report.gaps} />
          </DossierSection>
        </Reveal>

        <Reveal index={2}>
          <DossierSection label="Talking points">
            <TalkingPointsList items={report.talking_points} />
          </DossierSection>
        </Reveal>

        <Reveal index={3}>
          <DossierSection label="Sources">
            <SourcesList items={report.sources} />
          </DossierSection>
        </Reveal>
      </div>
    </section>
  );
}

function FitScore({ score }: { score: number | null }) {
  const percent = score == null ? 0 : Math.max(0, Math.min(1, score));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Fit score
        </p>
        <p className="font-mono text-sm text-foreground">
          {score == null ? "—" : score.toFixed(2)}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full border border-border bg-muted"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
          style={{ width: `${percent * 100}%` }}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
      {children}
    </p>
  );
}

function DossierSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border px-4 py-3 first:border-t-0">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

function SourceChip({ source }: { source: { kind: SourceKind; ref: string; title?: string } }) {
  const tone = SOURCE_TINTS[source.kind];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide",
        tone.chip,
      )}
      title={source.ref}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      <span className="truncate">{source.title ?? source.ref}</span>
      <span className="text-[9px] opacity-70">{tone.label}</span>
    </span>
  );
}

function Reveal({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        animation: `briefing-reveal 500ms ease-out ${index * 90}ms both`,
      }}
      className="motion-reduce:[animation:none]"
    >
      {children}
    </div>
  );
}

function MatchedStrengthsList({ items }: { items: BriefingReport["matched_strengths"] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No matched strengths were recorded.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((strength) => (
        <article
          key={`${strength.point}-${strength.evidence}`}
          className="rounded-md border border-border/70 bg-card/60 p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-medium text-foreground">{strength.point}</h3>
            <div className="flex flex-wrap gap-1.5">
              {strength.sources.map((source) => (
                <SourceChip key={`${source.kind}-${source.ref}`} source={source} />
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{strength.evidence}</p>
        </article>
      ))}
    </div>
  );
}

function GapsList({ items }: { items: BriefingReport["gaps"] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No gaps were recorded.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((gap) => (
        <article
          key={`${gap.point}-${gap.note}`}
          className="rounded-md border border-border/70 bg-card/60 p-3"
        >
          <h3 className="font-medium text-foreground">{gap.point}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{gap.note}</p>
        </article>
      ))}
    </div>
  );
}

function TalkingPointsList({ items }: { items: BriefingReport["talking_points"] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No talking points were recorded.</p>;
  }
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground">
      {items.map((point) => (
        <li key={point} className="pl-1">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {point}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SourcesList({ items }: { items: BriefingReport["sources"] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No sources were recorded.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((source) => (
        <SourceChip key={`${source.kind}-${source.ref}`} source={source} />
      ))}
    </div>
  );
}
