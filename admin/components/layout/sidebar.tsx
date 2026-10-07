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
  MapPin,
  Briefcase,
  ChevronDown,
} from "lucide-react";

interface NavItem {
  icon: any;
  label: string;
  href: string;
  roles: string[];
}

interface NavGroup {
  id: string;
  icon: any;
  label: string;
  items: NavItem[];
}

const ALL_ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"];

const navGroups: NavGroup[] = [
  {
    id: "job",
    icon: Briefcase,
    label: "Job",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", roles: ALL_ROLES },
      { icon: Printer, label: "Job Cards", href: "/job-cards", roles: ALL_ROLES },
      { icon: CheckSquare, label: "Tasks", href: "/tasks", roles: ALL_ROLES },
      { icon: FolderKanban, label: "Projects", href: "/projects", roles: ALL_ROLES },
      { icon: Users, label: "Employees", href: "/employees", roles: ["ADMIN", "MANAGER"] },
      { icon: MapPin, label: "Offices", href: "/offices", roles: ["ADMIN"] },
      { icon: BarChart3, label: "Reports", href: "/reports", roles: ["ADMIN", "MANAGER"] },
      { icon: Settings, label: "Settings", href: "/settings", roles: ["ADMIN"] },
    ],
  },
  {
    id: "profile",
    icon: User,
    label: "Profile",
    items: [
      { icon: User, label: "Profile", href: "/profile", roles: ALL_ROLES },
      { icon: Calendar, label: "Leave", href: "/leave", roles: ALL_ROLES },
      { icon: Clock, label: "Attendance", href: "/attendance", roles: ALL_ROLES },
      { icon: Activity, label: "Productivity", href: "/productivity", roles: ALL_ROLES },
      { icon: IndianRupee, label: "Salary Slips", href: "/payroll", roles: ALL_ROLES },
    ],
  },
];

const isActivePath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps = {}) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ job: true, profile: true });

  // Handle hydration
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Keep the group that contains the current page expanded
  useEffect(() => {
    const activeGroup = navGroups.find((g) => g.items.some((item) => isActivePath(pathname, item.href)));
    if (activeGroup) setOpenGroups((prev) => (prev[activeGroup.id] ? prev : { ...prev, [activeGroup.id]: true }));
  }, [pathname]);

  // Filter navigation based on user role
  // Show all items during SSR or if role not loaded yet
  const userNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: hydrated && user?.role ? group.items.filter((item) => item.roles.includes(user.role)) : group.items,
    }))
    .filter((group) => group.items.length > 0);

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
        <div className="space-y-3">
          {userNavGroups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = openGroups[group.id] ?? true;
            const hasActiveChild = group.items.some((item) => isActivePath(pathname, item.href));

            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !isOpen }))}
                  className={cn(
                    "h-auto w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-muted",
                    hasActiveChild ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-expanded={isOpen}
                >
                  <GroupIcon className="w-4 h-4" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen ? "rotate-0" : "-rotate-90")} />
                </button>

                {isOpen && (
                  <div className="mt-1 ml-3 space-y-1 border-l pl-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = isActivePath(pathname, item.href);

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
                            <span>{item.label}</span>
                          </Button>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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
