"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import {
  LayoutDashboard,
  Clock,
  Users,
  FolderKanban,
  CheckSquare,
  Calendar,
  IndianRupee,
  BarChart3,
  Settings,
  Building2,
  User,
  Printer,
  Activity,
} from "lucide-react";

interface NavItem {
  icon: any;
  label: string;
  href: string;
  roles: string[];
}

const navItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/dashboard",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: Printer,
    label: "Job Cards",
    href: "/job-cards",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: Activity,
    label: "Productivity",
    href: "/productivity",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: User,
    label: "Profile",
    href: "/profile",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: Clock,
    label: "Attendance",
    href: "/attendance",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: Calendar,
    label: "Leave",
    href: "/leave",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: CheckSquare,
    label: "Tasks",
    href: "/tasks",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: FolderKanban,
    label: "Projects",
    href: "/projects",
    roles: ["ADMIN", "MANAGER","EMPLOYEE"],
  },
  {
    icon: Users,
    label: "Employees",
    href: "/employees",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    icon: IndianRupee,
    label: "Salary",
    href: "/payroll",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    icon: BarChart3,
    label: "Reports",
    href: "/reports",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    icon: Settings,
    label: "Settings",
    href: "/settings",
    roles: ["ADMIN"],
  },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps = {}) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Handle hydration
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Filter navigation based on user role
  // Show all items during SSR or if role not loaded yet
  const userNavItems = hydrated && user?.role
    ? navItems.filter((item) => item.roles.includes(user.role))
    : navItems;

  return (
    <aside className="flex h-screen w-64 flex-col fixed left-0 top-0 border-r bg-card z-50 shadow-lg">
      {/* Logo */}
      <div className="p-6 border-b">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="p-2 bg-primary rounded-lg shadow-sm">
            <Printer className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Printadel</h1>
            <p className="text-xs text-muted-foreground font-medium">Print & Packaging Hub</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {userNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === "/payroll" && pathname.startsWith("/payroll"));
            const displayLabel = item.href === "/payroll" && user?.role === "EMPLOYEE" ? "Salary Slips" : item.label;

            return (
              <Link key={item.href} href={item.href} onClick={onClose}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3",
                    isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{displayLabel}</span>
                </Button>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
            {user?.fullName?.charAt(0) || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user?.fullName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.designation || user?.role}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
