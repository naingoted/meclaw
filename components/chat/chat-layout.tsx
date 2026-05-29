"use client";

import { Button } from "@/components/ui/button";
import { Download, Calendar, ExternalLink } from "lucide-react";
import Link from "next/link";

const calUrl = process.env.NEXT_PUBLIC_CAL_URL || "https://cal.com/your-handle";
const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/your-username";

export function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      {/* Header with action buttons */}
      <div className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <div />
          <div className="flex items-center gap-2">
            <Link href="/resume" download>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download résumé</span>
                <span className="sm:hidden">Résumé</span>
              </Button>
            </Link>
            <a href={calUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Book a call</span>
                <span className="sm:hidden">Book</span>
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Chat content */}
      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Footer */}
      <div className="border-t px-4 py-2 text-center">
        <p className="text-xs text-muted-foreground">
          Built this myself{" "}
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
