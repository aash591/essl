import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "secondary"
  size?: "default" | "icon" | "sm" | "lg"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
            "bg-secondary/50 text-foreground hover:bg-secondary border border-border": variant === "outline",
            "bg-secondary/50 text-foreground hover:bg-secondary": variant === "secondary",
            "hover:bg-secondary/50": variant === "ghost",
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-md px-3": size === "sm",
            "h-11 rounded-md px-8": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }

// Export buttonVariants for calendar component
export const buttonVariants = (props: { variant?: ButtonProps["variant"] }) => {
  return cn(
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
    "disabled:pointer-events-none disabled:opacity-50",
    {
      "bg-primary text-primary-foreground hover:bg-primary/90": props.variant === "default",
      "bg-secondary/50 text-foreground hover:bg-secondary border border-border": props.variant === "outline",
      "bg-secondary/50 text-foreground hover:bg-secondary": props.variant === "secondary",
      "hover:bg-secondary/50": props.variant === "ghost",
    }
  )
}

