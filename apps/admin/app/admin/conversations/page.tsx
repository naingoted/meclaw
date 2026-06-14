import { Suspense } from "react";
import { ConversationsClient } from "@/components/admin/conversations-client";

export default function ConversationsPage() {
  return (
    <Suspense fallback={null}>
      <ConversationsClient />
    </Suspense>
  );
}
