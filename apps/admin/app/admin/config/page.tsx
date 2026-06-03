import { Suspense } from "react";
import { ConfigClient } from "@/components/admin/config-client";

export default function ConfigPage() {
  return (
    <Suspense fallback={null}>
      <ConfigClient />
    </Suspense>
  );
}
