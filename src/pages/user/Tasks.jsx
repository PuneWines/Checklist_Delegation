"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchWorkTasksForUserApi, submitWorkTaskApi } from "../../redux/api/workRecordsApi"
import { useMagicToast } from "../../context/MagicToastContext"
import supabase from "../../SupabaseClient"
import { Loader2, CheckCircle2, Clock, AlertCircle, Search, Filter, Paperclip, MessageSquare, LayoutGrid } from "lucide-react"

const getWorkTaskTimeBounds = (task) => {
  const startStr = task.task_assignments?.start_datetime;
  let startHour = 0;
  let startMin = 0;
  if (startStr) {
    const parts = startStr.split('T');
    if (parts[1]) {
      const timeParts = parts[1].split(':');
      startHour = parseInt(timeParts[0]) || 0;
      startMin = parseInt(timeParts[1]) || 0;
    }
  }
  const [year, month, day] = task.current_date.split('-').map(Number);
  const taskStart = new Date(year, month - 1, day, startHour, startMin, 0);
  const duration = task.duration || 0; // minutes
  const taskEnd = new Date(taskStart.getTime() + duration * 60 * 1000);
  const taskExtraEnd = new Date(taskEnd.getTime() + 45 * 60 * 1000);
  return { taskStart, taskEnd, taskExtraEnd };
};

const getWorkTaskDynamicStatus = (task, currentTime = new Date()) => {
  if (task.status === "APPROVED" || task.status === "APPROVED") return "APPROVED";
  if (task.status === "SUBMITTED" || task.status === "Done" || task.status === "done" || task.submission_date) return "SUBMITTED";
  if (task.status === "REJECTED") return "REJECTED";

  const { taskStart, taskEnd, taskExtraEnd } = getWorkTaskTimeBounds(task);

  if (currentTime < taskStart) {
    return "UPCOMING";
  } else if (currentTime >= taskStart && currentTime < taskEnd) {
    return "ACTIVE";
  } else if (currentTime >= taskEnd && currentTime < taskExtraEnd) {
    return "EXTRA_TIME";
  } else {
    return "NOT_DONE";
  }
};

const getExtraTimeRemaining = (task, currentTime) => {
  const { taskExtraEnd } = getWorkTaskTimeBounds(task);
  const diffMs = taskExtraEnd.getTime() - currentTime.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (60 * 1000));
};

const formatTaskStartTime = (startStr) => {
  if (!startStr) return "";
  try {
    const date = new Date(startStr);
    if (isNaN(date.getTime())) return "";
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return "";
  }
};

const UserTasks = () => {
  const { showToast } = useMagicToast()
  const [userTasks, setUserTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTasks, setSelectedTasks] = useState([])
  const [remarks, setRemarks] = useState({})
  const [selectedFiles, setSelectedFiles] = useState({})
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  const currentUsername = localStorage.getItem("user-name") || ""

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchWorkTasksForUserApi(currentUsername)
      setUserTasks(data || [])
    } catch (error) {
      console.error("Error loading tasks:", error)
      showToast("Failed to load tasks", "error")
    } finally {
      setLoading(false)
    }
  }, [currentUsername, showToast])

  useEffect(() => {
    if (currentUsername) {
      loadTasks()
    }
  }, [loadTasks, currentUsername])

  const filteredTasks = userTasks.filter((task) => {
    const dynamicStatus = getWorkTaskDynamicStatus(task, currentTime);

    // Filter by status
    if (filterStatus === "completed") {
      if (dynamicStatus !== "APPROVED") return false;
    } else if (filterStatus === "submitted") {
      if (dynamicStatus !== "SUBMITTED") return false;
    } else if (filterStatus === "pending") {
      if (dynamicStatus !== "ACTIVE" && dynamicStatus !== "EXTRA_TIME") return false;
    } else if (filterStatus === "not_done") {
      if (dynamicStatus !== "NOT_DONE") return false;
    } else if (filterStatus === "overdue") {
      return false; // Work tasks do not show up under normal overdue
    }

    // Filter by search query
    if (
      searchQuery &&
      !task.task_description?.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !task.shop_name?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false
    }

    return true
  })

  const handleTaskSelection = (taskId) => {
    setSelectedTasks((prev) => {
      if (prev.includes(taskId)) {
        return prev.filter((id) => id !== taskId)
      } else {
        return [...prev, taskId]
      }
    })
  }

  const handleRemarksChange = (taskId, value) => {
    setRemarks((prev) => ({ ...prev, [taskId]: value }))
    if (errors[taskId]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[taskId]
        return newErrors
      })
    }
  }

  const handleFileChange = (taskId, e) => {
    const file = e.target.files?.[0] || null
    setSelectedFiles((prev) => ({ ...prev, [taskId]: file }))
    if (errors[taskId]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[taskId]
        return newErrors
      })
    }
  }

  const uploadFile = async (id, file) => {
    if (!file) return null
    try {
      const fileExt = file.name.split(".").pop()
      const fileName = `work-proofs/${id}-${Date.now()}.${fileExt}`
      const { data, error } = await supabase.storage.from("task-proofs").upload(fileName, file)

      if (error) throw error

      const {
        data: { publicUrl },
      } = supabase.storage.from("task-proofs").getPublicUrl(fileName)

      return publicUrl
    } catch (error) {
      console.error("Upload error:", error)
      return null
    }
  }

  const handleSubmitTasks = async () => {
    if (selectedTasks.length === 0) return
    setIsSubmitting(true)
    const newErrors = {}

    // Validation
    for (const taskId of selectedTasks) {
      const task = userTasks.find((t) => t.id === taskId)
      if (!task) continue

      // In Work Detail, we might want to enforce image proof for all or based on master config
      // For now, let's assume it's optional unless specified otherwise
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setIsSubmitting(false)
      showToast("Please fix the errors before submitting.", "error")
      return
    }

    try {
      for (const taskId of selectedTasks) {
        let imageUrl = null
        if (selectedFiles[taskId]) {
          imageUrl = await uploadFile(taskId, selectedFiles[taskId])
        }

        await submitWorkTaskApi(taskId, {
          remark: remarks[taskId] || "",
          image: imageUrl,
        })
      }

      showToast(`${selectedTasks.length} tasks submitted for approval!`, "success")
      
      // Reset state
      setSelectedTasks([])
      setRemarks({})
      setSelectedFiles({})
      setErrors({})
      
      // Reload tasks
      loadTasks()
    } catch (e) {
      console.error("Submission error:", e)
      showToast("Failed to submit tasks: " + e.message, "error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusBadge = (task) => {
    const ds = getWorkTaskDynamicStatus(task, currentTime);
    if (ds === "APPROVED") {
      return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Approved</span>;
    }
    if (ds === "SUBMITTED") {
      return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Submitted</span>;
    }
    if (ds === "REJECTED") {
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Rejected</span>;
    }
    if (ds === "UPCOMING") {
      return <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full uppercase tracking-wider">Upcoming</span>;
    }
    if (ds === "EXTRA_TIME") {
      const minsLeft = getExtraTimeRemaining(task, currentTime);
      return (
        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1">
          <Clock size={10} className="animate-spin-slow" />
          Extra Time: {minsLeft} Min Left
        </span>
      );
    }
    if (ds === "NOT_DONE") {
      return <span className="px-2 py-0.5 bg-red-50 text-red-500 text-[10px] font-bold rounded-full uppercase tracking-wider">Not Done</span>;
    }
    return <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Active</span>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <LayoutGrid className="text-purple-600" size={32} />
            My <span className="text-purple-600">Work Detail</span>
          </h1>
          <p className="text-gray-500 font-medium">Manage and submit your routine assigned work tasks</p>
        </div>
        
        {selectedTasks.length > 0 && (
          <button
            onClick={handleSubmitTasks}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 disabled:opacity-50 transition-all shadow-xl shadow-purple-200"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            Submit {selectedTasks.length} Tasks
          </button>
        )}
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by description or shop..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-400 font-medium transition-all"
            />
          </div>
          
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="pl-10 pr-8 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-400 font-bold text-xs uppercase tracking-wider appearance-none"
              >
                <option value="all">All Tasks</option>
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="completed">Approved</option>
                <option value="not_done">Not Done</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin" />
            <p className="text-purple-600 font-black uppercase tracking-widest text-xs">Fetching your tasks...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300">
              <LayoutGrid size={40} />
            </div>
            <p className="text-gray-400 font-medium">No tasks found matching your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => {
                    const dynamicStatus = getWorkTaskDynamicStatus(task, currentTime);
                    if (dynamicStatus === "ACTIVE" || dynamicStatus === "EXTRA_TIME" || dynamicStatus === "REJECTED") {
                      handleTaskSelection(task.id);
                    }
                  }}
                  className={`group relative p-5 rounded-3xl border-2 transition-all cursor-pointer ${
                    selectedTasks.includes(task.id)
                      ? "border-purple-600 bg-purple-50/30"
                      : "border-gray-50 bg-white hover:border-purple-200"
                  } ${
                    (() => {
                      const ds = getWorkTaskDynamicStatus(task, currentTime);
                      return (ds === "APPROVED" || ds === "SUBMITTED" || ds === "UPCOMING" || ds === "NOT_DONE") ? "opacity-60 cursor-default" : "";
                    })()
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                        selectedTasks.includes(task.id) ? "bg-purple-600 border-purple-600" : "border-gray-200"
                      }`}>
                        {selectedTasks.includes(task.id) && <CheckCircle2 className="text-white" size={14} />}
                      </div>
                      <span className="font-black text-gray-900 tracking-tight">{task.shop_name}</span>
                    </div>
                    {getStatusBadge(task)}
                  </div>
                  
                  <p className="text-gray-600 text-sm font-medium leading-relaxed mb-4">
                    {task.task_description}
                  </p>
                  
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Clock size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {new Date(task.current_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{task.task_assignments?.start_datetime && ` @ ${formatTaskStartTime(task.task_assignments.start_datetime)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Loader2 size={14} className="animate-spin-slow" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{task.duration} Mins</span>
                      </div>
                    </div>
                    {task.rejection_reason && (
                      <div className="flex items-center gap-1 text-red-500" title={task.rejection_reason}>
                        <AlertCircle size={14} />
                        <span className="text-[10px] font-bold uppercase">Rejected</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-6">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Completion Details</h3>
              {selectedTasks.length === 0 ? (
                <div className="bg-gray-50 rounded-[2.5rem] p-10 text-center border-2 border-dashed border-gray-100">
                  <p className="text-gray-400 font-medium">Select tasks from the list to enter submission details</p>
                </div>
              ) : (
                <div className="space-y-6 overflow-y-auto max-h-[550px] pr-2 custom-scrollbar">
                  {selectedTasks.map((taskId) => {
                    const task = userTasks.find((t) => t.id === taskId)
                    if (!task) return null

                    return (
                      <div key={taskId} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                          <h4 className="font-black text-gray-900 text-sm">{task.task_description.substring(0, 40)}...</h4>
                          <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full uppercase">ID: {task.id}</span>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase tracking-widest ml-1">
                            <MessageSquare size={14} />
                            Remarks
                          </label>
                          <textarea
                            placeholder="Describe your work..."
                            value={remarks[task.id] || ""}
                            onChange={(e) => handleRemarksChange(task.id, e.target.value)}
                            className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-400 transition-all min-h-[80px] text-sm font-medium"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase tracking-widest ml-1">
                            <Paperclip size={14} />
                            Proof Attachment
                          </label>
                          <div className="relative group">
                            <input
                              type="file"
                              onChange={(e) => handleFileChange(task.id, e)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className={`p-4 bg-gray-50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${
                              selectedFiles[task.id] ? "border-purple-600 bg-purple-50" : "border-gray-100 group-hover:border-purple-200"
                            }`}>
                              {selectedFiles[task.id] ? (
                                <>
                                  <CheckCircle2 className="text-purple-600 mb-2" size={20} />
                                  <p className="text-xs font-bold text-purple-600 truncate max-w-full px-4">
                                    {selectedFiles[task.id].name}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <Paperclip className="text-gray-300 mb-2" size={20} />
                                  <p className="text-xs font-bold text-gray-400 uppercase">Click to upload photo</p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {errors[task.id] && (
                          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-2xl text-xs font-bold">
                            <AlertCircle size={14} />
                            {errors[task.id]}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #e2e8f0;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
    </div>
  )
}

export default UserTasks
