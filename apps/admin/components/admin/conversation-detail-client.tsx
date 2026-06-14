"use client";
import { cn, relativeTime, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@meclaw/ui";
import type { ConversationDetail, RetrievalEventView } from "@/lib/admin/conversations";
import { useUrlState } from "@/lib/use-url-state";
import { AdminPage, useAdminFetch } from "./framework";

const TABS = ["thread", "retrieval"] as const;
const LOW_SCORE = 0.65;

export function ConversationDetailClient({ id }: { id: string }) {
  const [tab, setTab] = useUrlState("tab", "thread", TABS);
  const { data: detail, loading } = useAdminFetch<ConversationDetail>(
    `/api/admin/conversations/${id}`,
  );

  if (loading) return <Skeleton className="h-40" />;
  if (!detail) {
    return (
      <AdminPage title="Conversation not found" subtitle={`No conversation with id ${id}`}>
        <p className="text-sm text-muted-foreground">
          This may be an orphaned gap miss whose conversation was never persisted.
        </p>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Conversation"
      subtitle={`${detail.messages.length} messages · started ${relativeTime(detail.conversation.createdAt)} ago`}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="thread">Thread</TabsTrigger>
          <TabsTrigger value="retrieval">Retrieval</TabsTrigger>
        </TabsList>

        <TabsContent value="thread">
          <div className="space-y-3">
            {detail.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-md border border-border p-3",
                  m.role === "user" ? "bg-card" : "bg-muted/40",
                )}
              >
                <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span className={m.role === "assistant" ? "text-primary" : undefined}>
                    {m.role}
                  </span>
                  <span>{relativeTime(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{m.content}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="retrieval">
          <div className="space-y-3">
            {detail.messages
              .filter((m) => detail.retrieval[m.id])
              .map((m) => {
                const ev = detail.retrieval[m.id];
                if (!ev) return null;
                return <RetrievalCard key={m.id} event={ev} />;
              })}
            {detail.messages.every((m) => !detail.retrieval[m.id]) ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No retrieval telemetry for this conversation.
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function RetrievalCard({ event }: { event: RetrievalEventView }) {
  const low = event.topScore != null && event.topScore < LOW_SCORE;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="mb-2 text-sm text-foreground">{event.query}</p>
      <div className="mb-2 flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
        <span>{event.intent}</span>
        <span>grounded: {String(event.grounded)}</span>
        <span>answer used: {String(event.answerUsed)}</span>
        <span className={low ? "text-destructive" : undefined}>
          top: {event.topScore == null ? "—" : event.topScore.toFixed(2)}
        </span>
      </div>
      <ul className="space-y-1">
        {event.chunks.map((c) => (
          <li key={c.id} className="flex justify-between font-mono text-xs">
            <span className="text-muted-foreground">
              {c.source} {c.kept ? "·kept" : ""}
            </span>
            <span className={c.score < LOW_SCORE ? "text-destructive" : "text-foreground"}>
              {c.score.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
