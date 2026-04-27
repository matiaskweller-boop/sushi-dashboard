"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface NavSection {
  label: string;
  icon: string;
  items: Array<{ href: string; label: string }>;
}

const SECTIONS: NavSection[] = [
  {
    label: "Ventas",
    icon: "📊",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/kpis", label: "KPIs" },
      { href: "/historico", label: "Histórico" },
    ],
  },
  {
    label: "Productos",
    icon: "📦",
    items: [
      { href: "/consumo", label: "Consumo" },
      { href: "/stock", label: "Stock" },
    ],
  },
  {
    label: "Carta",
    icon: "🍣",
    items: [
      { href: "/menu", label: "Menú" },
      { href: "/competencia", label: "Competencia" },
    ],
  },
  {
    label: "Administración",
    icon: "⚙️",
    items: [{ href: "/administracion", label: "ERP" }],
  },
];

export default function Navigation() {
  const pathname = usePathname();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenSection(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setOpenSection(null);
  }, [pathname]);

  function isSectionActive(section: NavSection): boolean {
    return section.items.some((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    );
  }

  function getActiveItemLabel(section: NavSection): string | null {
    const active = section.items.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    );
    return active?.label || null;
  }

  return (
    <nav
      ref={navRef}
      className="bg-white border-b border-card-border relative z-40"
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-0">
          {SECTIONS.map((section) => {
            const isActive = isSectionActive(section);
            const isOpen = openSection === section.label;
            const activeItem = getActiveItemLabel(section);

            return (
              <div key={section.label} className="relative">
                {/* Section tab */}
                <button
                  onClick={() =>
                    setOpenSection(isOpen ? null : section.label)
                  }
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-blue-accent text-navy"
                      : "border-transparent text-gray-500 hover:text-navy hover:border-gray-300"
                  }`}
                >
                  <span className="text-xs">{section.icon}</span>
                  <span>{section.label}</span>
                  {activeItem && (
                    <span className="text-[10px] text-gray-400 font-normal hidden sm:inline">
                      · {activeItem}
                    </span>
                  )}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Dropdown */}
                {isOpen && (
                  <div
                    className="absolute top-full left-0 mt-0 bg-white border border-gray-200 rounded-b-lg shadow-lg min-w-[180px] py-1"
                    style={{ zIndex: 9999 }}
                  >
                    {section.items.map((item) => {
                      const itemActive =
                        item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block px-4 py-2.5 text-sm transition-colors ${
                            itemActive
                              ? "bg-blue-50 text-blue-accent font-medium"
                              : "text-gray-600 hover:bg-gray-50 hover:text-navy"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
