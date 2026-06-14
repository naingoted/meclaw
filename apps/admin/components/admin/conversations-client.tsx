"use client";
import {
  Button,
  EmptyState,
  relativeTime,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@meclaw/ui";
import Link from "next/link";
import * as React from "react";
import type {
  ConversationListResult,
  ConversationSummary,
  Outcome,
} from "@/lib/admin/conversations";
import { useUrlState } from "@/lib/use-url-state";
import { OutcomeBadge, TurnCountBadge } from "./conversation-badges";
import { AdminPage } from "./framework";

const OUTCOMES = ["all", "answered", "gap", "abandoned"] as const;
const POLL_MS = 30_000;

export function ConversationsClient() {
  const [outcome, setOutcome] = useUrlState("outcome", "all", OUTCOMES);

  const [items, setItems] = React.useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const baseQuery = React.useMemo(() => {
    const p = new URLSearchParams();
    if (outcome !== "all") p.set("outcome", outcome);
    return p.toString();
  }, [outcome]);

  const load = React.useCallback(
    async (cursor: string | null, append: boolean) => {
      const p = new URLSearchParams(baseQuery);
      if (cursor) p.set("cursor", cursor);
      const res = await fetch(`/api/admin/conversations?${p.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as ConversationListResult;
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    },
    [baseQuery],
  );

  // Reset + load page 1 whenever the filter changes.
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    void load(null, false).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  // 30s background refresh of page 1 (resets pagination — acceptable for "latest" monitoring).
  React.useEffect(() => {
    const t = setInterval(() => void load(null, false), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    await load(nextCursor, true);
    setLoadingMore(false);
  }

  return (
    <AdminPage title="Conversations" subtitle={loading ? undefined : `${items.length} loaded`}>
      <div className="mb-item flex gap-2">
        {OUTCOMES.map((o) => (
          <Button
            key={o}
            size="sm"
            variant={o === outcome ? "default" : "ghost"}
            aria-pressed={o === outcome}
            onClick={() => setOutcome(o)}
          >
            {o}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No conversations"
          hint="Public chat threads will appear here as visitors talk to the bot."
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Question</TH>
                <TH>Turns</TH>
                <TH>Outcome</TH>
                <TH>Started</TH>
                <TH>Last activity</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/admin/conversations/${c.id}`}
                      className="text-left text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {c.firstUserPreview || "(no message)"}
                    </Link>
                  </TD>
                  <TD>
                    <TurnCountBadge count={c.turnCount} />
                  </TD>
                  <TD>
                    <OutcomeBadge outcome={c.outcome as Outcome} />
                  </TD>
                  <TD className="text-muted-foreground">{relativeTime(c.createdAt)}</TD>
                  <TD className="text-muted-foreground">
                    {c.lastMessageAt ? relativeTime(c.lastMessageAt) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {nextCursor ? (
            <div className="mt-item">
              <Button variant="outline" loading={loadingMore} onClick={loadMore}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </AdminPage>
  );
}
