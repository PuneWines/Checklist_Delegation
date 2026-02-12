"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { CheckCircle2, Trash2, X, Search, Play, Pause } from "lucide-react"
import { useDispatch, useSelector } from "react-redux"
import { deleteDelegationTask, uniqueDelegationTaskData } from "../redux/slice/quickTaskSlice"

const isAudioUrl = (url) => {
  if (typeof url !== 'string') return false;
  return url.startsWith('http') && (
    url.includes('audio-recordings') ||
    url.includes('voice-notes') ||
    url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i)
  );
};

const AudioPlayer = ({ url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, []);

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        onClick={togglePlay}
        className="p-1.5 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200 transition-colors shadow-sm"
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <span className="text-[10px] font-bold text-purple-700 uppercase tracking-tight">Voice Note</span>
      <audio ref={audioRef} src={url} className="hidden" />
    </div>
  );
};

const CONFIG = {
  PAGE_CONFIG: {
    title: "Pending Delegation Tasks",
    description: "Showing all pending tasks",
  },
}

function DelegationPage({
  searchTerm = "",
  freqFilter = "",
  setFreqFilter,
  departmentFilter = "",
  showLayout = true,
  externalSelectedTasks = null,
  onSelectionChange = null,
  onDelete = null,
  isExternalDeleting = false
}) {
  const [successMessage, setSuccessMessage] = useState("")
  const [error, setError] = useState(null)
  const [userRole, setUserRole] = useState("")
  const [username, setUsername] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)
  const [internalSelectedTasks, setInternalSelectedTasks] = useState([])
  const [internalIsDeleting, setInternalIsDeleting] = useState(false)

  const isControlled = externalSelectedTasks !== null;
  const selectedTasks = isControlled ? externalSelectedTasks : internalSelectedTasks;
  const isDeleting = isControlled ? isExternalDeleting : internalIsDeleting;

  const { delegationTasks, loading } = useSelector((state) => state.quickTask)
  const dispatch = useDispatch()

  // Handle checkbox selection
  const handleCheckboxChange = (task) => {
    if (isControlled) {
      if (onSelectionChange) onSelectionChange(task);
      return;
    }
    const taskId = task.id;
    if (internalSelectedTasks.find(t => t.id === taskId)) {
      setInternalSelectedTasks(internalSelectedTasks.filter(t => t.id !== taskId))
    } else {
      setInternalSelectedTasks([...internalSelectedTasks, task])
    }
  }

  // Select all checkboxes
  const handleSelectAll = () => {
    if (isControlled) {
      // In controlled mode, we expect the parent to handle "Select All"
      if (onSelectionChange) onSelectionChange('ALL', filteredTasks);
      return;
    }
    if (internalSelectedTasks.length === filteredTasks.length) {
      setInternalSelectedTasks([])
    } else {
      setInternalSelectedTasks(filteredTasks)
    }
  }

  // Delete selected tasks
  const handleDeleteSelected = async () => {
    if (selectedTasks.length === 0) return

    if (isControlled && onDelete) {
      onDelete();
      return;
    }

    setInternalIsDeleting(true)
    try {
      await dispatch(deleteDelegationTask(selectedTasks)).unwrap()
      setInternalSelectedTasks([])
      setSuccessMessage("Tasks deleted successfully")
      dispatch(uniqueDelegationTaskData({}))

      setTimeout(() => setSuccessMessage(""), 3000)
    } catch (error) {
      console.error("Failed to delete tasks:", error)
      setError("Failed to delete tasks")
    } finally {
      setInternalIsDeleting(false)
    }
  }

  const formatDateTime = useCallback((dateStr) => {
    if (!dateStr) return "—"
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const year = date.getFullYear()
      return `${day}/${month}/${year}`
    } catch {
      return dateStr
    }
  }, [])

  useEffect(() => {
    const role = localStorage.getItem("role")
    const user = localStorage.getItem("user-name")
    setUserRole(role || "")
    setUsername(user || "")
    setIsInitialized(true)
  }, [])

  useEffect(() => {
    if (isInitialized) {
      dispatch(uniqueDelegationTaskData({}))
    }
  }, [dispatch, isInitialized])

  const filteredTasks = useMemo(() => {
    let filtered = delegationTasks;

    if (searchTerm) {
      filtered = filtered.filter(task =>
        task.task_description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (freqFilter) {
      filtered = filtered.filter(task => task.frequency === freqFilter)
    }

    if (departmentFilter) {
      filtered = filtered.filter(task => task.department?.toLowerCase().includes(departmentFilter.toLowerCase()))
    }

    // Today and Overdue Filter (Hide Upcoming)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filtered = filtered.filter(task => {
      const taskDate = task.task_start_date ? new Date(task.task_start_date) : null;
      if (taskDate) {
        const taskDay = new Date(taskDate);
        taskDay.setHours(0, 0, 0, 0);
        return taskDay <= today; // Only show today and past
      }
      return true; // Show tasks without dates (e.g. manual entries)
    });

    return filtered
  }, [delegationTasks, searchTerm, freqFilter, departmentFilter])

  return (
    <>
      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md flex items-center justify-between shadow-lg">
          <div className="flex items-center">
            <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
            {successMessage}
          </div>
          <button onClick={() => setSuccessMessage("")} className="text-green-500 hover:text-green-700 ml-4">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 bg-red-50 p-4 rounded-md text-red-800 text-center">
          {error}
        </div>
      )}

      {/* Main Content */}
      {isInitialized && (
        <div className="mt-4 rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-4 flex justify-between items-center">
            <div>
              <h2 className="text-purple-700 font-medium">
                {departmentFilter ? `${departmentFilter} Tasks` : "Delegation Tasks"}
              </h2>
              <p className="text-purple-600 text-sm">
                Manage your {departmentFilter ? departmentFilter.toLowerCase() : "delegation"} tasks ({filteredTasks.length})
              </p>
            </div>

            {selectedTasks.length > 0 && !isControlled && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 shadow-sm transition-colors"
              >
                <Trash2 size={16} />
                {isDeleting ? 'Deleting...' : `Delete (${selectedTasks.length})`}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={selectedTasks.length === filteredTasks.length && filteredTasks.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Task ID
                  </th>
                  {!departmentFilter && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Department
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Given By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {departmentFilter ? "Doer Name" : "Name"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]">
                    {departmentFilter ? "Work Description" : "Task Description"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50 whitespace-nowrap">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50 whitespace-nowrap">
                    End Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Freq
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Reminders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Attachment
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTasks.length > 0 ? (
                  filteredTasks.map((task, index) => (
                    <tr key={index} className={`hover:bg-gray-50 ${selectedTasks.find(t => t.id === task.id) ? "bg-purple-50" : ""}`}>
                      <td className="px-2 sm:px-3 py-2 sm:py-4 w-16">
                        <div className="text-xs sm:text-sm font-medium text-gray-900 text-center">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={!!selectedTasks.find(t => t.id === task.id)}
                          onChange={() => handleCheckboxChange(task)}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.id || "—"}
                      </td>
                      {!departmentFilter && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {task.department || "—"}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.given_by || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.name || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 min-w-[300px] max-w-[400px]">
                        <div className="whitespace-normal break-words underline-offset-2">
                          {isAudioUrl(task.task_description) ? (
                            <AudioPlayer url={task.task_description} />
                          ) : (
                            task.task_description || "—"
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-yellow-50">
                        {formatDateTime(task.task_start_date) || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-yellow-50">
                        {formatDateTime(task.submission_date) || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${task.frequency === 'Daily' ? 'bg-blue-100 text-blue-800' :
                          task.frequency === 'Weekly' ? 'bg-green-100 text-green-800' :
                            task.frequency === 'Monthly' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'
                          }`}>
                          {task.frequency || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.enable_reminder || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.require_attachment || "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12} className="px-6 py-8 text-center text-gray-500">
                      {loading ? (
                        <div className="flex flex-col items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-2"></div>
                          <p>Loading tasks from database...</p>
                        </div>
                      ) : (
                        "No tasks found in database"
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

export default DelegationPage