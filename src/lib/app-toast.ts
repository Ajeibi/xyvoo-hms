import { toast } from "@/hooks/use-toast";

export function toastSuccess(title: string, description?: string) {
  toast({
    variant: "success",
    title,
    description,
  });
}

export function toastError(title: string, description?: string) {
  toast({
    variant: "destructive",
    title,
    description,
  });
}

/** Neutral, self-dismissing FYI — no action required from the viewer. */
export function toastInfo(title: string, description?: string) {
  toast({
    variant: "default",
    title,
    description,
  });
}

export function toastFromResponse(
  res: Response,
  data: { error?: string } | null | undefined,
  options: { successTitle: string; errorTitle?: string; errorFallback?: string },
): boolean {
  if (!res.ok) {
    toastError(
      options.errorTitle ?? "Request failed",
      data?.error ?? options.errorFallback ?? "Please try again.",
    );
    return false;
  }
  toastSuccess(options.successTitle);
  return true;
}
