import { initDb } from "@meclaw/core/db";
import { defaultSettings, getSettings, getSettingsVersion } from "@meclaw/core/settings";
import { Chat } from "@/components/chat/chat";
import { ChatLayout } from "@/components/chat/chat-layout";
import { VERSION_LABEL } from "@/lib/version";

export const dynamic = "force-dynamic";

// Read config server-side so the public page reflects /admin edits with no
// client fetch and no flash. The version prop lets an already-open tab refresh
// itself after another process updates the singleton settings row.
export default async function Home() {
  let settings = defaultSettings();
  let initialConfigVersion = "default";

  try {
    const database = await initDb();
    settings = await getSettings(database);
    initialConfigVersion = (await getSettingsVersion(database)) ?? "default";
  } catch {
    // DB unavailable (e.g. build/preview without a database) - fall back to
    // seeded defaults rather than failing the render.
    settings = defaultSettings();
    initialConfigVersion = "default";
  }

  const { greeting, suggestions, calUrl, githubUrl, botName, brandLogoUrl, brandAccent } =
    settings.public;
  return (
    <main className="bg-background">
      <ChatLayout
        calUrl={calUrl}
        githubUrl={githubUrl}
        versionLabel={VERSION_LABEL}
        botName={botName}
        brandLogoUrl={brandLogoUrl}
        brandAccent={brandAccent}
      >
        <Chat
          greeting={greeting}
          suggestions={suggestions}
          initialConfigVersion={initialConfigVersion}
        />
      </ChatLayout>
    </main>
  );
}
