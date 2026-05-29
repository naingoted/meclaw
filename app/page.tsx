import { Chat } from "@/components/chat/chat";
import { ChatLayout } from "@/components/chat/chat-layout";

export default function Home() {
  return (
    <main className="bg-background">
      <ChatLayout>
        <Chat />
      </ChatLayout>
    </main>
  );
}
