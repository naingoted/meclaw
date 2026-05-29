import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">echo-clone</h1>
      <p className="max-w-md text-muted-foreground">
        Personal AI-twin chatbot. Scaffold is live — chat arrives in M1.
      </p>
      <Button disabled>Chat (coming in M1)</Button>
    </main>
  );
}
