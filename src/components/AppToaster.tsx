import { lazy, Suspense } from "react";

import { useToast } from "@/hooks/useToast";

const Toaster = lazy(() =>
  import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })),
);

export function AppToaster() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
