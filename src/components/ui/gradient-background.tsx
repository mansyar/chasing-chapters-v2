"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type GradientBackgroundProps = React.HTMLAttributes<HTMLDivElement>;

function GradientBackground({ className, ...props }: GradientBackgroundProps) {
  return (
    <div
      data-slot="gradient-background"
      className={cn(
        "size-full bg-linear-to-br from-fuchsia-400 from-0% via-50% via-violet-500 to-fuchsia-600 to-100% animate-gradient",
        className,
      )}
      {...props}
    />
  );
}

export { GradientBackground, type GradientBackgroundProps };
