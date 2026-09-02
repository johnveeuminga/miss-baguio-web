import { AlertCircle, Loader2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared loading / empty / error states for judge-facing pages, so a judge
 * mid-event sees the same spinner and the same wording everywhere instead
 * of a different ad-hoc "Loading…" div per screen.
 */

export function LoadingView({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground",
        className
      )}
    >
      <Loader2 className="size-6 animate-spin" />
      <div className="text-sm">{label}</div>
    </div>
  );
}

export function EmptyView({
  title,
  description,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  icon?: typeof Inbox;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground",
        className
      )}
    >
      <Icon className="size-6" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <div className="text-sm max-w-sm">{description}</div>}
    </div>
  );
}

export function ErrorView({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className
      )}
    >
      <AlertCircle className="size-6 text-destructive" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && (
          <div className="text-sm text-muted-foreground max-w-sm mt-1">
            {description}
          </div>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
