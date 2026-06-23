import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Baseline: 5 min stale. Per-query overrides in useInstitution/useAdmin
      // take precedence. High baseline prevents refetch on every navigation
      // while Railway containers are cold.
      staleTime: 5 * 60 * 1000,   // 5 min
      gcTime:    15 * 60 * 1000,  // 15 min — keep cache alive across navigation
    },
  },
});
