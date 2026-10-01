"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, token, _hasHydrated } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Debug on mount
  useEffect(() => {
  }, []);

  // Debug on auth state change
  useEffect(() => {
  }, [isAuthenticated, _hasHydrated, pathname]);

  // Redirect if not authenticated (only after hydration)
  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router, _hasHydrated]);

  // Show loading state while hydrating
  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        {/* Desktop Sidebar - Hidden on mobile/tablet */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Main Content */}
        <div className="md:pl-64">
          <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
          <main className="p-3 sm:p-4 md:p-6 min-w-0 overflow-x-clip">{children}</main>
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="fixed left-0 top-0 h-full w-64 bg-card z-50 md:hidden overflow-y-auto">
              <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
            </div>
          </>
        )}
      </div>
    </QueryClientProvider>
  );
}
