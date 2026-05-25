import Link from "next/link";
import { useRouter } from "next/router";
import { Home, Search, Star, Bell } from "lucide-react";

const NAV_ITEMS = [
  { href: "/",          icon: Home,   label: "Home"      },
  { href: "/scanner",   icon: Search, label: "Scanner"   },
  { href: "/watchlist", icon: Star,   label: "Watchlist" },
  { href: "/alerts",    icon: Bell,   label: "Alerts"    },
];

const HIDE_ON = ["/track-record"];

export function BottomNav() {
  const router = useRouter();

  if (HIDE_ON.some((p) => router.pathname.startsWith(p))) return null;

  return (
    <nav
      className="sl-bottom-nav"
      aria-label="Primary navigation"
    >
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = router.pathname === href || (href !== "/" && router.pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`sl-bottom-nav__item ${active ? "sl-bottom-nav__item--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
