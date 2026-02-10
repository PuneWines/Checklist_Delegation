import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import { ClipboardList, Wrench, Hammer, Plus, ArrowUpRight, LayoutGrid, Users } from "lucide-react";

export default function AssignTask() {
  const navigate = useNavigate();

  const modules = [
    {
      id: "checklist",
      label: "Checklist Operations",
      subLabel: "Daily Routine Tasks",
      icon: ClipboardList,
      path: "/dashboard/checklist",
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "hover:border-purple-500",
      ring: "hover:ring-purple-200"
    },
    {
      id: "maintenance",
      label: "Maintenance Schedule",
      subLabel: "Preventive Care",
      icon: Wrench,
      path: "/dashboard/maintenance",
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "hover:border-blue-500",
      ring: "hover:ring-blue-200"
    },
    {
      id: "repair",
      label: "Repair Tickets",
      subLabel: "Issue Resolution",
      icon: Hammer,
      path: "/dashboard/repair",
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "hover:border-orange-500",
      ring: "hover:ring-orange-200"
    },
    {
      id: "ea",
      label: "EA Tasks",
      subLabel: "Executive Assistant",
      icon: Users,
      path: "/dashboard/ea-task",
      color: "text-green-600",
      bg: "bg-green-50",
      border: "hover:border-green-500",
      ring: "hover:ring-green-200"
    }
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">

        {/* System Header */}
        <div className="flex items-center gap-3 mb-8 border-b border-gray-200 pb-5">
          <div className="p-2 bg-gray-100 rounded-lg">
            <LayoutGrid className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 uppercase tracking-tight">Task Assignment Console</h1>
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">SELECT_MODULE // SYSTEM_V1.0</p>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => navigate(mod.path)}
              className={`
                        group relative flex flex-col p-6 bg-white border border-gray-200 rounded-xl 
                        transition-all duration-200 text-left
                        hover:shadow-md ${mod.border} hover:ring-2 ${mod.ring}
                    `}
            >
              <div className="flex justify-between items-start w-full mb-5">
                <div className={`p-2.5 rounded-lg border border-gray-100 ${mod.bg}`}>
                  <mod.icon className={`w-6 h-6 ${mod.color}`} />
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                  <ArrowUpRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>

              <h3 className="text-base font-bold text-gray-900 group-hover:text-black transition-colors">
                {mod.label}
              </h3>
              <p className="text-sm text-gray-500 mt-1 mb-6">
                {mod.subLabel}
              </p>

              <div className="mt-auto pt-4 border-t border-dashed border-gray-100 w-full flex justify-between items-center">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Module Action</span>
                <div className={`flex items-center gap-1.5 text-[11px] font-bold ${mod.color} bg-white border border-gray-100 shadow-sm px-3 py-1.5 rounded-md group-hover:bg-gray-50 transition-colors`}>
                  <Plus className="w-3.5 h-3.5" /> Initialize
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AdminLayout>
  )
}