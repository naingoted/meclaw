import { Chat } from "@/components/chat/chat";
import { ChatLayout } from "@/components/chat/chat-layout";
import { initDb } from "@meclaw/core/db";
import { getSettings, defaultSettings } from "@meclaw/core/settings";

// Read config server-side so the public page reflects /admin edits with no
// client fetch and no flash. Uses the same configCache (TTL) as the chat route,
// so it is bounded-eventually-consistent with admin saves.
export default async function Home() {
  let settings;
  try {
    settings = await getSettings(await initDb());
  } catch {
    // DB unavailable (e.g. build/preview without a database) — fall back to
    // seeded defaults rather than failing the render.
    settings = defaultSettings();
  }
  const { greeting, suggestions, calUrl, githubUrl } = settings.public;
  return (
    <main className="bg-background">
      <ChatLayout calUrl={calUrl} githubUrl={githubUrl}>
        <Chat greeting={greeting} suggestions={suggestions} />
      </ChatLayout>
    </main>
  );
}
