import { QueryClient } from '@tanstack/react-query';

const defaultOptions = {
  queries: {
    staleTime: 60 * 1000, // 1 phút
    gcTime: 5 * 60 * 1000, // 5 phút (trước đây cacheTime)
    retry: 1,
    refetchOnWindowFocus: false,
  },
  mutations: {
    retry: false,
  },
} as const;

export const queryClient = new QueryClient({ defaultOptions });
