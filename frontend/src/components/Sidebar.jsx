const MENUS = [
  {
    id: "company-intelligence",
    label: "Company Intelligence",
    icon: "🏢",
  },
  {
    id: "market-intelligence",
    label: "Market Intelligence",
    icon: "📊",
  },
  {
    id: "linkedin-dashboard",
    label: "Lead Dashboard",
    icon: "👥",
  },
  {
    id: "content-generation",
    label: "Content Generation",
    icon: "✍️",
  },
  {
    id: "analytics-dashboard",
    label: "Analytics",
    icon: "📈",
  },
];

const Sidebar = ({ active, onSelect }) => {
  return (
    <div
      className="w-56 min-h-screen flex flex-col border-r border-[#b8a898] shrink-0"
      style={{ backgroundColor: "#F2DFFF" }}
    >
      {/* Sidebar header */}
      <div className="px-4 h-14 flex items-center border-b border-[#b8a898]">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Modules
        </p>
      </div>

      {/* Menu items */}
      <nav className="flex flex-col gap-1 px-2 py-3">
        {MENUS.map((menu) => {
          const isActive = active === menu.id;
          return (
            <button
              key={menu.id}
              onClick={() => onSelect(menu.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all
                ${isActive
                  ? "bg-[#C8D4B8] text-gray-900 border border-[#9aaa8a] shadow-sm"
                  : "text-gray-600 hover:bg-[#D4C4B4] hover:text-gray-800"
                }`}
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
