import { Chat } from "@/components/chat/chat";
import { getChatDb, resolveEmbedClient } from "@/lib/embed/auth";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ embedToken?: string; parentOrigin?: string }>;
};

export default async function WidgetPage({ searchParams }: Props) {
  const { embedToken, parentOrigin } = await searchParams;

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

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Chat
        greeting="Hello! I'm the embed widget."
        suggestions={["What can you help me with?", "Tell me more"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken={embedToken}
        parentOrigin={parentOrigin}
      />
    </div>
  );
}
