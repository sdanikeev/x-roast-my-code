import type { FormHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Form({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} className={cn("flex flex-col gap-5", className)} />;
}
