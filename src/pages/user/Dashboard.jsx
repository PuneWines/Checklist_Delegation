"use client"

import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import { fetchWorkTasksForUserApi } from "../../redux/api/workRecordsApi"
import { useMagicToast } from "../../context/MagicToastContext"
import supabase from "../../SupabaseClient"
import { 
  LayoutGrid, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  ArrowRight,
  ClipboardList,
  Calendar,
  Zap
} from "lucide-react"

const UserDashboard = () => {
  const { showToast } = useMagicToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [taskView, setTaskView] = useState("recent")
  
  const currentUsername = localStorage.getItem("user-name") || ""

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const role = (localStorage.getItem("role") || "").toLowerCase()
      const userAccess = localStorage.getItem("user_access") || ""
      
      let data = []
      if (role === "manager") {
        const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean)
        if (managerShops.length > 0) {
          const { data: tasksData, error } = await supabase
            .from('work_task')
            .select('*')
            .in('shop_name', managerShops)
            .order('current_date', { ascending: true })
          
          if (error) throw error
          data = tasksData || []
        }
      } else {
        data = await fetchWorkTasksForUserApi(currentUsername)
      }
      setTasks(data || [])
    } catch (error) {
      console.error("Error loading dashboard stats:", error)
      showToast("Failed to refresh dashboard data", "error")
    } finally {
      setLoading(false)
    }
  }, [currentUsername, showToast])

  useEffect(() => {
    if (currentUsername) {
      loadStats()
    }
  }, [loadStats, currentUsername])

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "APPROVED").length,
    pending: tasks.filter(t => t.status === "PENDING" || !t.status || t.status === "REJECTED").length,
    overdue: tasks.filter(t => {
      const dueDate = new Date(t.current_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return dueDate < today && t.status !== "APPROVED" && t.status !== "SUBMITTED"
    }).length,
  }

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  const getFilteredTasks = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (taskView === "recent") {
      return tasks.slice(0, 5) // Last 5 tasks
    }
    if (taskView === "upcoming") {
      return tasks.filter(t => new Date(t.current_date) >= today && t.status !== "APPROVED").slice(0, 5)
    }
    if (taskView === "overdue") {
      return tasks.filter(t => new Date(t.current_date) < today && t.status !== "APPROVED" && t.status !== "SUBMITTED")
    }
    return tasks
  }

  const filteredTasks = getFilteredTasks()

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center gap-4">
            <Zap className="text-amber-500 fill-amber-500" size={36} />
            My <span className="text-purple-600">Performance</span>
          </h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">
            Welcome back, <span className="text-purple-600">{currentUsername}</span> • {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link
          to="/dashboard/task"
          className="group flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-[2rem] font-black uppercase tracking-widest hover:bg-purple-600 transition-all shadow-2xl shadow-gray-200"
        >
          Manage All Tasks
          <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Assignments", value: stats.total, icon: ClipboardList, color: "blue", sub: "All time assigned" },
          { label: "Tasks Approved", value: stats.completed, icon: CheckCircle2, color: "green", sub: `${completionRate}% Success Rate` },
          { label: "Pending Action", value: stats.pending, icon: Clock, color: "purple", sub: "Awaiting submission" },
          { label: "Overdue Alerts", value: stats.overdue, icon: AlertTriangle, color: "red", sub: "Needs urgent attention" },
        ].map((item, idx) => (
          <div key={idx} className={`group relative bg-white p-8 rounded-[2.5rem] border-2 border-gray-50 shadow-sm hover:shadow-xl hover:border-${item.color}-100 transition-all duration-500 overflow-hidden`}>
            <div className={`absolute top-0 right-0 w-32 h-32 bg-${item.color}-50 rounded-full -mr-16 -mt-16 opacity-40 group-hover:scale-150 transition-transform duration-700`} />
            <div className="relative z-10 space-y-4">
              <div className={`w-12 h-12 bg-${item.color}-50 rounded-2xl flex items-center justify-center text-${item.color}-600`}>
                <item.icon size={24} />
              </div>
              <div>
                <div className={`text-4xl font-black text-gray-900`}>{loading ? "..." : item.value}</div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-1">{item.label}</p>
              </div>
              <p className={`text-[10px] font-bold text-${item.color}-500 flex items-center gap-1`}>
                <TrendingUp size={12} />
                {item.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        {/* Task List Section */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Work Records</h3>
            <div className="flex bg-gray-100/80 p-1 rounded-2xl border border-gray-200/50">
              {["recent", "upcoming", "overdue"].map((view) => (
                <button
                  key={view}
                  onClick={() => setTaskView(view)}
                  className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    taskView === view ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 min-h-[400px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border border-gray-50">
                <div className="w-12 h-12 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mb-4" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Loading tasks...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-gray-50/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                <Calendar className="text-gray-200 mb-4" size={48} />
                <p className="text-gray-400 font-medium italic">No tasks found in this view</p>
              </div>
            ) : (
              filteredTasks.map((task, idx) => (
                <div 
                  key={task.id} 
                  className="group bg-white p-6 rounded-[2rem] border-2 border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-purple-100 hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center font-black text-gray-400 group-hover:bg-purple-50 group-hover:text-purple-600 transition-colors">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-black text-gray-900 group-hover:text-purple-600 transition-colors">
                        {task.shop_name}
                        {task.name && <span className="text-xs font-medium text-gray-400 ml-2">({task.name})</span>}
                      </h4>
                      <p className="text-sm text-gray-500 font-medium line-clamp-1">{task.task_description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 px-4">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scheduled For</p>
                      <p className="font-bold text-gray-900 text-sm">
                        {new Date(task.current_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                      task.status === "APPROVED" ? "bg-green-50 text-green-600" : 
                      task.status === "SUBMITTED" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                    }`}>
                      {task.status || "PENDING"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar Activity Section */}
        <div className="space-y-8">
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-[3rem] p-10 text-white shadow-2xl shadow-purple-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-2xl" />
            <div className="relative z-10 space-y-6">
              <h3 className="text-2xl font-black tracking-tight">Your Weekly Focus</h3>
              <div className="space-y-4">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-purple-100">Task Completion</span>
                    <span className="text-xs font-black">{completionRate}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-1000" 
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-purple-100 leading-relaxed font-medium">
                  You've completed <span className="font-black text-white">{stats.completed}</span> out of <span className="font-black text-white">{stats.total}</span> tasks this period. Keep up the momentum!
                </p>
              </div>
              <Link
                to="/user/tasks"
                className="block w-full py-4 bg-white text-purple-600 rounded-2xl font-black uppercase tracking-widest text-center hover:bg-gray-50 transition-colors shadow-lg"
              >
                Go to My Tasks
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] border border-gray-100 p-8 space-y-6 shadow-sm">
            <h3 className="text-lg font-black text-gray-900 tracking-tight">Quick Insights</h3>
            <div className="space-y-6">
              {[
                { icon: Zap, label: "Next Due", val: stats.pending > 0 ? "Today" : "None" },
                { icon: ArrowRight, label: "Efficiency", val: "High" },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                      <item.icon size={18} />
                    </div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{item.label}</span>
                  </div>
                  <span className="text-sm font-black text-gray-900">{item.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserDashboard
