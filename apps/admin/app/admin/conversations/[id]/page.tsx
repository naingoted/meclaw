import { Suspense } from "react";
import { ConversationDetailClient } from "@/components/admin/conversation-detail-client";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ConversationDetailClient id={id} />
    </Suspense>
  );
}
