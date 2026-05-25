/**
 * MobileBottomNav — sticky bottom tab bar for Telecaller / Agent / InHouseTC
 * dashboards on screens <768px. Items are passed in as props so each dashboard
 * controls its own tab set.
 *
 *   <MobileBottomNav
 *     items={[
 *       { key:"calls", label:"Calls", icon: Phone },
 *       { key:"leads", label:"Leads", icon: Users },
 *     ]}
 *     activeKey={tab}
 *     onSelect={setTab}
 *   />
 */
export default function MobileBottomNav({ items = [], activeKey, onSelect }) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#1e2825]/95 backdrop-blur border-t border-[#E5E3DB] dark:border-[#2d3530] flex justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      data-testid="mobile-bottom-nav"
    >
      {items.map(({ key, label, icon: Icon, badge }) => {
        const active = key === activeKey;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect?.(key)}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            data-testid={`bottom-nav-${key}`}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${active ? "text-[#3B5249] dark:text-[#A8C7B6]" : "text-[#59615D] dark:text-[#a6a89f]"}`}
            style={{ minHeight: "56px" }}
          >
            <div className="relative">
              {Icon && <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />}
              {badge != null && badge > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#A66E4E] text-white text-[9px] font-bold flex items-center justify-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </div>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
