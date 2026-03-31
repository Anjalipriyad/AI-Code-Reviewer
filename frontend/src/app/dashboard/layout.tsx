"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2,
  Flame,
  GitBranch,
  History,
  LayoutDashboard,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";

const GitHubIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/* ═════════════════════════════════════════════════════════════
   Dashboard Layout — Glassmorphism Sidebar + Content Area
   ═════════════════════════════════════════════════════════════ */

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard size={20} />,
  },
  {
    label: "Analyze Code",
    href: "/dashboard/analyze",
    icon: <Code2 size={20} />,
    badge: "AI",
  },
  {
    label: "Repositories",
    href: "/dashboard/repositories",
    icon: <GitBranch size={20} />,
  },
  {
    label: "Review History",
    href: "/dashboard/history",
    icon: <History size={20} />,
  },
  {
    label: "Security",
    href: "/dashboard/security",
    icon: <Shield size={20} />,
  },
  {
    label: "Heatmap",
    href: "/dashboard/heatmap",
    icon: <Flame size={20} />,
    badge: "NEW",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: <Settings size={20} />,
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Glassmorphism Sidebar ────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="glass relative z-30 flex flex-col border-r border-[var(--color-glass-border)] shrink-0"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-[var(--color-glass-border)]">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-accent)] shrink-0">
            <Zap size={18} className="text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <h1 className="text-sm font-semibold text-white whitespace-nowrap tracking-tight">
                  AI Code Reviewer
                </h1>
                <p className="text-[10px] text-white/40 font-mono">v0.1.0</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <motion.div
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group cursor-pointer relative",
                    isActive
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent-light)]"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--color-accent)]"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}

                  <span className="shrink-0">{item.icon}</span>

                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm font-medium whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Badge */}
                  {item.badge && !collapsed && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent-light)]"
                    >
                      {item.badge}
                    </motion.span>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* GitHub Connect */}
        <div className="p-3 border-t border-[var(--color-glass-border)]">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={clsx(
              "flex items-center gap-2 w-full px-3 py-2 rounded-lg",
              "bg-white/[0.04] hover:bg-white/[0.08] transition-colors",
              "text-white/60 hover:text-white/90 text-sm"
            )}
          >
            <GitHubIcon size={18} />
            {!collapsed && <span className="font-medium">Connect GitHub</span>}
          </motion.button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-white/40 hover:text-white/80 hover:border-[var(--color-accent)]/50 transition-all z-50"
        >
          {collapsed ? (
            <ChevronRight size={12} />
          ) : (
            <ChevronLeft size={12} />
          )}
        </button>
      </motion.aside>

      {/* ── Main Content ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
