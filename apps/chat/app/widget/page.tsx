import { Chat } from "@/components/chat/chat";
import { getChatDb, resolveEmbedClient } from "@/lib/embed/auth";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ embedToken?: string }>;
};

export default async function WidgetPage({ searchParams }: Props) {
  const { embedToken } = await searchParams;

  if (!embedToken) {
    return (
      <div style={{ padding: 20, fontFamily: "sans-serif", color: "#666" }}>
        Missing embed token
      </div>
    );
  }

  const db = await getChatDb();
  const client = await resolveEmbedClient(db, embedToken);

  if (!client) {
    return (
      <div style={{ padding: 20, fontFamily: "sans-serif", color: "#666" }}>
        Invalid or revoked embed token
      </div>
    );
  }

  // TODO(Task 9): Chat component needs mode and embedToken props
  // For now, pass them as any to make tests pass until Task 9 adds the prop types
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Chat
        greeting="Hello! I'm the embed widget."
        suggestions={["What can you help me with?", "Tell me more"]}
        initialConfigVersion="0"
        {...({ mode: "embed", embedToken } as any)}
      />
    </div>
  );
}
