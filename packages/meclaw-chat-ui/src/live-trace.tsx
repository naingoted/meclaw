"use client";

function StepDots() {
  return (
    <span className="flex gap-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

export function LiveTrace({ steps, label = "Thinking…" }: { steps: string[]; label?: string }) {
  return (
    <div>
      <section
        aria-label="Assistant says"
        className="w-fit rounded-2xl bg-muted px-4 py-2 font-sans text-sm text-muted-foreground"
      >
        {steps.length === 0 ? (
          <div className="flex items-center gap-2">
            <StepDots />
            <span>{label}</span>
          </div>
        ) : (
          <ul className="space-y-1">
            {steps.map((step, i) => {
              const active = i === steps.length - 1;
              return (
                <li key={`${step}-${i}`} data-active={active} className="flex items-center gap-2">
                  {active ? (
                    <StepDots />
                  ) : (
                    <span aria-hidden="true" className="text-foreground">
                      ✓
                    </span>
                  )}
                  <span className={active ? "" : "text-foreground"}>{step}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
