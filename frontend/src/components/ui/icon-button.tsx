import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IconButtonProps = ButtonProps & {
  label: string;
  tone?: "default" | "danger";
};

export function IconButton({ label, tone = "default", className, type = "button", ...props }: IconButtonProps) {
  return (
    <Button
      type={type}
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn(
        "h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground",
        tone === "danger" && "hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      {...props}
    />
  );
}
