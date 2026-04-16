import { useState } from "react";

export function ExpandablePanel({ title, icon, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="glass-card overflow-hidden transition-all duration-200">
      <button onClick={() => setIsOpen(!isOpen)} className="expandable-trigger">
        <span className="flex items-center gap-2">
          {icon && <span className="text-xl">{icon}</span>}
          {title}
        </span>
        <span className={`transform transition-transform ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {isOpen && <div className="border-t border-gray-800 p-5 space-y-3">{children}</div>}
    </div>
  );
}

