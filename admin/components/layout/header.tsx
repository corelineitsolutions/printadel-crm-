"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { Bell, LogOut, Menu, User as UserIcon, Settings, ChevronDown } from "lucide-react";
import { NotificationDropdown } from "./notification-dropdown";
import { LogoutActivityModal } from "./logout-activity-modal";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { user, logout, isPunchedIn, hasLoggedActivityToday } = useAuthStore();
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);

  const handleLogoutClick = () => {
    if (isPunchedIn && user?.role === "EMPLOYEE") {
      toast.error("Punch out required", {
        description: "Please punch out and submit your work summary before logging out.",
        duration: 5000,
      });
      return;
    }
    if (hasLoggedActivityToday()) {
      executeFinalLogout();
      return;
    }
    setShowLogoutModal(true);
  };

  const executeFinalLogout = () => {
    setShowLogoutModal(false);
    logout();
    router.push("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-4 md:px-8 gap-4 max-w-[1600px] mx-auto">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-10 w-10 hover:bg-muted/50 rounded-xl transition-all"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </Button>

          {/* Dynamic Title / Breadcrumb Placeholder */}
          <div className="hidden md:flex flex-col">
            <h1 className="text-sm font-semibold tracking-tight text-foreground uppercase tracking-wider">Printadel CRM</h1>
            <p className="text-xs text-muted-foreground font-medium">Print & Packaging Operations</p>
          </div>

          <div className="flex-1" />

          {/* Actions Area */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Notifications */}
          <NotificationDropdown />

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="flex items-center gap-3 px-2 py-1.5 h-auto hover:bg-muted/50 rounded-2xl transition-all border border-transparent hover:border-border"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center shadow-sm">
                  <span className="text-primary font-bold text-sm">
                    {user?.fullName?.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </span>
                </div>
                <div className="hidden sm:flex flex-col items-start text-left">
                  <span className="text-xs font-bold leading-none mb-1">
                    {user?.fullName}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                    {user?.role}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-2 rounded-2xl p-2 shadow-2xl">
              <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Account Actions
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => router.push("/profile")}
                className="rounded-xl cursor-pointer py-2.5 gap-3"
              >
                <UserIcon className="w-4 h-4" />
                <span>Profile Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => router.push("/settings")}
                className="rounded-xl cursor-pointer py-2.5 gap-3"
              >
                <Settings className="w-4 h-4" />
                <span>Preferences</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogoutClick}
                className="rounded-xl cursor-pointer py-2.5 gap-3 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

    <LogoutActivityModal
      isOpen={showLogoutModal}
      onClose={() => setShowLogoutModal(false)}
      onConfirmLogout={executeFinalLogout}
    />
  </>
  );
}
