import { QueryClient } from "@tanstack/react-query";
import { PortalApiError } from "@/shared/lib/portalApi";

/** Retry once on network/5xx errors, never on 4xx client errors —
 *  retrying a 401/403/404 can only produce the same result and floods
 *  the console + the API with pointless duplicate requests. */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof PortalApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryUnlessClientError,
      refetchOnWindowFocus: false,
      // Baseline: 5 min stale. Per-query overrides in useInstitution/useAdmin
      // take precedence. High baseline prevents refetch on every navigation
      // while Railway containers are cold.
      staleTime: 5 * 60 * 1000,   // 5 min
      gcTime:    15 * 60 * 1000,  // 15 min — keep cache alive across navigation
    },
  },
});
