import { Suspense } from "react";
import { GapsClient } from "@/components/admin/gaps-client";

export default function GapsPage() {
  return (
    <Suspense fallback={null}>
      <GapsClient />
    </Suspense>
  );
}
