import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] text-[12px] font-semibold cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-[#ff5722] text-white shadow-sm hover:bg-[#e64a19]",
        destructive: "bg-[#e74c3c] text-white shadow-sm hover:bg-[#c0392b]",
        outline:
          "border border-[color:var(--border)] bg-white text-[#374a5c] shadow-sm hover:bg-[#f4f6f8] hover:border-[#c9d3dc]",
        secondary: "bg-[#7f8c8d] text-white shadow-sm hover:bg-[#6b7778]",
        success: "bg-[#27ae60] text-white shadow-sm hover:bg-[#219653]",
        info: "bg-[#3498db] text-white shadow-sm hover:bg-[#2874a6]",
        warning: "bg-[#f39c12] text-white shadow-sm hover:bg-[#d68910]",
        ghost: "text-[#374a5c] hover:bg-[#f0f3f6]",
        link: "text-[#3498db] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-[11px]",
        xs: "h-6 px-2 text-[11px] gap-1 [&_svg]:size-3",
        lg: "h-10 px-5 text-sm",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
