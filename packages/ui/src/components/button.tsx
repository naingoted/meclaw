import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,background-color,border-color,transform] duration-100 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        "ghost-danger": "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
      },
      size: { default: "h-9 px-4 py-2", sm: "h-8 px-3", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="h-3.5 w-3.5 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}
export { buttonVariants };
