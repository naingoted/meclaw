"use client";
import * as React from "react";

type CorpusState = {
  version: number | null;
  documents: number | null;
  chunks: number | null;
  lastIngestedAt: string | null;
  embedModel: string; // part of the /api/admin/corpus shape; not rendered here
};

// Local on purpose: @meclaw/ui's relativeTime returns bare units ("5m", "now")
// and can't express the corpus-specific copy we need here ("never ingested" for
// a never-ingested corpus, "just now", "…m ago"). Keep these strings in sync with
// the spec, not with the ui formatter.
function relativeTime(iso: string | null): string {
  if (!iso) return "never ingested";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function CorpusStrip() {
  const [state, setState] = React.useState<CorpusState | null>(null);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/corpus");
      setState(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
    const t = setInterval(() => {
      void load();
    }, 2000);
    return () => clearInterval(t);
  }, [load]);

  if (failed || (state && state.version === null)) {
    return <p className="font-mono text-xs text-muted-foreground">corpus status unavailable</p>;
  }
  if (!state) {
    return <p className="font-mono text-xs text-muted-foreground">loading corpus…</p>;
  }
  return (
    <p className="font-mono text-xs text-muted-foreground">
      Corpus v{state.version} · {state.documents} docs · {state.chunks} chunks ·{" "}
      {relativeTime(state.lastIngestedAt)}
    </p>
  );
}
