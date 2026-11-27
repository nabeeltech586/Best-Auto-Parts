"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  Bell,
  Bot,
  CreditCard,
  Crown,
  FileCheck2,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Radio,
  Settings,
  Shield,
  ShoppingBag,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: "roleOwner",
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    labelKey: "roleAdmin",
    // Primary-tinted: significant but not as scarce as owner.
    className:
      "border-primary/40 bg-primary/10 text-primary",
  },
  agent: {
    icon: UserCog,
    labelKey: "roleAgent",
    // Neutral slate: the operational default.
    className:
      "border-border bg-muted text-foreground",
  },
  viewer: {
    icon: User,
    labelKey: "roleViewer",
    // Muted slate: read-only role; visually quieter than agent.
    className:
      "border-border bg-card text-muted-foreground",
  },
};
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
  badgeClass?: string;
}

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    labelKey: "dashboard",
    icon: LayoutDashboard,
    badgeClass: "bg-blue-500/15 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400",
  },
  {
    href: "/inbox",
    labelKey: "inbox",
    icon: MessageSquare,
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400",
  },
  {
    href: "/notifications",
    labelKey: "notifications",
    icon: Bell,
    badgeClass: "bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400",
  },
  {
    href: "/contacts",
    labelKey: "contacts",
    icon: Users,
    badgeClass: "bg-violet-500/15 text-violet-600 dark:bg-violet-500/25 dark:text-violet-400",
  },
  {
    href: "/inventory",
    labelKey: "inventory",
    icon: Package,
    badgeClass: "bg-sky-500/15 text-sky-600 dark:bg-sky-500/25 dark:text-sky-400",
  },
  {
    href: "/payments",
    labelKey: "payments",
    icon: CreditCard,
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400",
  },
  {
    href: "/orders",
    labelKey: "orders",
    icon: ShoppingBag,
    badgeClass: "bg-rose-500/15 text-rose-600 dark:bg-rose-500/25 dark:text-rose-400",
  },
  {
    href: "/pipelines",
    labelKey: "pipelines",
    icon: FileCheck2,
    badgeClass: "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-400",
  },
  {
    href: "/automations",
    labelKey: "automations",
    icon: Zap,
    badgeClass: "bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400",
  },
  {
    href: "/flows",
    labelKey: "flows",
    icon: Workflow,
    beta: true,
    badgeClass: "bg-teal-500/15 text-teal-600 dark:bg-teal-500/25 dark:text-teal-400",
  },
  {
    href: "/agents",
    labelKey: "aiAgents",
    icon: Bot,
    badgeClass: "bg-purple-500/15 text-purple-600 dark:bg-purple-500/25 dark:text-purple-400",
  },
];

const bottomNavItems = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from "next-intl";

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  useEffect(() => {
    fetch("/api/payments/links")
      .then((res) => (res.ok ? res.json() : { links: [] }))
      .then((data) => {
        const list = data.links || [];
        const pending = list.filter((l: { status: string }) => l.status === "PENDING").length;
        setPendingOrdersCount(pending);
      })
      .catch(() => {});
  }, [pathname]);
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left, respecting device safe area.
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, always visible — reset all the mobile framing.
          "lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none lg:pt-0 lg:pb-0",
        )}
        aria-label={t("primaryNav")}
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm shrink-0">
              <Package className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold tracking-tight text-foreground leading-tight truncate">
                Best Auto Parts
              </span>
              <span className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5 truncate">
                Bajaj • Hero • Honda Spares
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              const showUnreadDot =
                item.href === "/inbox" && totalUnread > 0 && !isActive;

              // Unlike the inbox dot, the notifications count stays visible
              // even while the page is active — it reflects unread state
              // (cleared by marking notifications read), not "currently
              // viewing this section".
              const showNotificationBadge =
                item.href === "/notifications" && unreadNotifications > 0;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      // Taller on mobile so fingers can hit the row reliably (≥44px).
                      "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:py-1.5",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md transition-colors shrink-0",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : item.badgeClass || "bg-muted text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 truncate">{t(item.labelKey as string)}</span>
                    {item.beta && (
                      <span
                        aria-label={t("beta")}
                        className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300"
                      >
                        {t("beta")}
                      </span>
                    )}
                    {showUnreadDot && (
                      <span
                        aria-label={t("unreadConversations", { count: totalUnread })}
                        className="relative flex h-2 w-2"
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                      </span>
                    )}
                    {showNotificationBadge && (
                      <span
                        aria-label={t("unreadNotifications", { count: unreadNotifications })}
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                      >
                        {unreadNotifications > 9 ? "9+" : unreadNotifications}
                      </span>
                    )}
                    {item.href === "/orders" && pendingOrdersCount > 0 && (
                      <span
                        title={`${pendingOrdersCount} pending payment orders`}
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/40 px-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"
                      >
                        {pendingOrdersCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 border-t border-border" />

          <ul className="flex flex-col gap-1">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {t(item.labelKey as string)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="shrink-0 border-t border-border p-3">
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name ? (
            <div className="mb-2 flex items-center gap-2 px-3 text-xs text-muted-foreground">
              <UsersRound className="size-3.5 shrink-0" />
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole ? (
                // Always render the chip — owners used to be
                // invisible here, which made them indistinguishable
                // from admins at a glance. Now everyone sees their
                // role (with a colour cue) regardless of tier.
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-3" />
                      {t(meta.labelKey as string)}
                    </span>
                  );
                })()
              ) : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60">
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t("defaultAvatar")}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {profile?.full_name ?? t("defaultUser")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                {t("menuProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                {t("menuSettings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                {t("menuSignOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
