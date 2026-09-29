import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Allotiq pills (N2), echo-sized: xl is the 60px hero CTA. "default" is ink on light sections and
// bone on dark ones (it follows --primary). "volt" is the one loud action per view.
const variants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-[background-color,box-shadow,color,opacity,transform] duration-300 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg:not([class*='size-'])]:size-[1.05em] hover:[&_svg:last-child]:translate-x-0.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        volt: "bg-volt text-[#0c0e0d] shadow-[0_12px_32px_-14px_rgb(212_255_58/0.9)] hover:bg-volt-2",
        outline: "border-fg/30 bg-transparent text-fg hover:border-fg/50 hover:bg-fg/[0.06] aria-expanded:bg-fg/[0.06]",
        secondary: "bg-card text-fg ring-1 ring-line hover:bg-sunken aria-expanded:bg-sunken",
        ghost: "text-fg hover:bg-fg/[0.06] aria-expanded:bg-fg/[0.06]",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20",
        link: "rounded-md text-fg underline decoration-[1.5px] underline-offset-4 hover:decoration-hl",
      },
      size: {
        default: "h-11 gap-2 px-5 text-[15px]",
        xs: "h-7 gap-1 px-3 text-xs",
        sm: "h-9 gap-1.5 px-4 text-sm",
        lg: "h-13 gap-2 px-6 text-base",
        xl: "h-15 gap-2.5 px-8 text-lg",
        icon: "size-11",
        "icon-xs": "size-7",
        "icon-sm": "size-9",
        "icon-lg": "size-13",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Class names for a button look — merged, so it's safe to use directly on a <Link>. */
function buttonVariants(props?: Parameters<typeof variants>[0]) {
  return cn(variants(props))
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof variants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
