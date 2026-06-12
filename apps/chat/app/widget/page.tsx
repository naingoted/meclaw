import { defaultSettings, getSettings, getSettingsVersion } from "@meclaw/core/settings";
import { Chat } from "@/components/chat/chat";
import { getChatDb, resolveEmbedClient } from "@/lib/embed/auth";
import { VERSION_LABEL } from "@/lib/version";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ embedToken?: string; parentOrigin?: string; theme?: string }>;
};

export default async function WidgetPage({ searchParams }: Props) {
  const { embedToken, parentOrigin, theme } = await searchParams;
  const initialTheme = theme === "light" || theme === "dark" ? theme : undefined;

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

  let settings = defaultSettings();
  let initialConfigVersion = "default";

  try {
    settings = await getSettings(db);
    initialConfigVersion = (await getSettingsVersion(db)) ?? "default";
  } catch {
    settings = defaultSettings();
    initialConfigVersion = "default";
  }

  const { greeting, suggestions } = settings.public;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Chat
        greeting={greeting}
        suggestions={suggestions}
        initialConfigVersion={initialConfigVersion}
        mode="embed"
        embedToken={embedToken}
        parentOrigin={parentOrigin}
        initialTheme={initialTheme}
      />
      <div
        data-testid="widget-version"
        style={{
          position: "fixed",
          right: 8,
          bottom: 4,
          fontSize: 10,
          fontFamily: "monospace",
          opacity: 0.4,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {VERSION_LABEL}
      </div>
    </div>
  );
}
