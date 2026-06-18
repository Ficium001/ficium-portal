import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Per-query staleTime in useInstitution.ts / useAdmin.ts overrides this.
      // This baseline just stops un-tuned queries from refetching on every mount.
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  },
});
