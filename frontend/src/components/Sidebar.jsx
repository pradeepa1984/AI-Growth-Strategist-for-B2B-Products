const MENUS = [
  { id: "company-intelligence", label: "Company Intelligence", icon: "🏢" },
  { id: "market-intelligence",  label: "Market Intelligence",  icon: "📊" },
  { id: "linkedin-dashboard",   label: "Lead Dashboard",       icon: "👥" },
  { id: "content-generation",   label: "Content Generation",   icon: "✍️" },
  { id: "analytics-dashboard",  label: "Analytics",            icon: "📈" },
  { id: "report-generation",    label: "Report Generation",    icon: "📄" },
];

const Sidebar = ({ active, onSelect }) => {
  return (
    <div
      className="w-56 min-h-screen flex flex-col shrink-0"
      style={{
        backgroundColor: "#0B4F43",
        marginRight: "16px",
        boxShadow: "4px 0 20px rgba(0,0,0,0.15)",
      }}
    >
      <div className="px-5 h-14 flex items-center">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
          Modules
        </p>
      </div>

      <nav className="flex flex-col gap-2 px-3 py-4">
        {MENUS.map((menu) => {
          const isActive = active === menu.id;
          return (
            <button
              key={menu.id}
              onClick={() => onSelect(menu.id)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-all"
              style={{
                borderRadius: "10px",
                backgroundColor: isActive ? "#1A9E7A" : "transparent",
                color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.7)",
                fontWeight: isActive ? "600" : "500",
                boxShadow: isActive ? "0 2px 8px rgba(26,158,122,0.30)" : "none",
              }}
            >
              <span className="text-base">{menu.icon}</span>
              <span className="leading-tight">{menu.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default Sidebar;
