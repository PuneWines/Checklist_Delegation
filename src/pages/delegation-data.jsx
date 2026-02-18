"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { CheckCircle2, Trash2, X, Search, Play, Pause, Edit, Save } from "lucide-react"
import { useDispatch, useSelector } from "react-redux"
import { deleteDelegationTask, uniqueDelegationTaskData, updateDelegationTask } from "../redux/slice/quickTaskSlice"

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
    <div className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all duration-300 min-w-[140px] ${isPlaying
      ? 'bg-indigo-50/80 border-indigo-200 shadow-sm scale-[1.02]'
      : 'bg-white border-gray-100 hover:border-indigo-100 hover:shadow-xs'
      }`}>
      <button
        onClick={togglePlay}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${isPlaying
          ? 'bg-gradient-to-r from-rose-500 to-pink-600'
          : 'bg-gradient-to-r from-indigo-500 to-violet-600 hover:scale-110'
          }`}
      >
        {isPlaying ? (
          <Pause size={12} className="text-white fill-white" />
        ) : (
          <Play size={12} className="text-white fill-white ml-0.5" />
        )}
      </button>
      <div className="flex flex-col">
        <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${isPlaying ? 'text-indigo-700' : 'text-gray-400'
          }`}>
          {isPlaying ? 'Playing...' : 'Voice Note'}
        </span>
        {isPlaying && (
          <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
            <div className="w-0.5 h-full bg-indigo-400 animate-bounce" style={{ animationDuration: '0.6s' }}></div>
            <div className="w-0.5 h-2/3 bg-indigo-500 animate-bounce" style={{ animationDuration: '0.8s' }}></div>
            <div className="w-0.5 h-full bg-indigo-600 animate-bounce" style={{ animationDuration: '0.4s' }}></div>
            <div className="w-0.5 h-2/3 bg-indigo-500 animate-bounce" style={{ animationDuration: '0.7s' }}></div>
          </div>
        )}
      </div>
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
  isExternalDeleting = false,
  departments = [],
  givenByList = [],
  doersList = []
}) {
  const [successMessage, setSuccessMessage] = useState("")
  const [error, setError] = useState(null)
  const [userRole, setUserRole] = useState("")
  const [username, setUsername] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)
  const [internalSelectedTasks, setInternalSelectedTasks] = useState([])
  const [internalIsDeleting, setInternalIsDeleting] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editFormData, setEditFormData] = useState({})
  const [isSaving, setIsSaving] = useState(false)

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

  // Edit functionality
  const handleEditClick = (task) => {
    setEditingTaskId(task.id);
    setEditFormData({
      id: task.id,
      department: task.department || '',
      given_by: task.given_by || '',
      name: task.name || '',
      task_description: task.task_description || '',
      task_start_date: task.task_start_date || '',
      frequency: task.frequency || '',
      duration: task.duration || '',
      enable_reminder: task.enable_reminder || '',
      require_attachment: task.require_attachment || '',
      remarks: task.remarks || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditFormData({});
  };

  const handleSaveEdit = async () => {
    if (!editFormData.id) return;

    setIsSaving(true);
    try {
      await dispatch(updateDelegationTask(editFormData)).unwrap();
      setEditingTaskId(null);
      setEditFormData({});
      // Refresh
      dispatch(uniqueDelegationTaskData({}));
      setSuccessMessage("Task updated successfully");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to update task:", error);
      setError("Failed to update task");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]">
                    {departmentFilter ? "Work Description" : "Task Description"}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50 whitespace-nowrap">
                    Start Date
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Freq
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-blue-50">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Reminders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Attachment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
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
                      <td className="px-6 py-4 text-sm text-gray-500 min-w-[300px] max-w-[400px]">
                        {editingTaskId === task.id ? (
                          <textarea
                            value={editFormData.task_description}
                            onChange={(e) => handleInputChange('task_description', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            rows="3"
                          />
                        ) : (
                          <div className="whitespace-normal break-words underline-offset-2">
                            {isAudioUrl(task.task_description) ? (
                              <AudioPlayer url={task.task_description} />
                            ) : (
                              task.task_description || "—"
                            )}
                          </div>
                        )}
                      </td>
                      {!departmentFilter && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {editingTaskId === task.id ? (
                            <select
                              value={editFormData.department}
                              onChange={(e) => handleInputChange('department', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="">Select Department</option>
                              {departments.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                              ))}
                            </select>
                          ) : (
                            task.department || "—"
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {editingTaskId === task.id ? (
                          <select
                            value={editFormData.given_by}
                            onChange={(e) => handleInputChange('given_by', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select AssignBy</option>
                            {givenByList.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        ) : (
                          task.given_by || "—"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {editingTaskId === task.id ? (
                          <select
                            value={editFormData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select Name</option>
                            {doersList.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        ) : (
                          task.name || "—"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-yellow-50">
                        {editingTaskId === task.id ? (
                          <input
                            type="datetime-local"
                            value={editFormData.task_start_date ? new Date(editFormData.task_start_date).toISOString().slice(0, 16) : ''}
                            onChange={(e) => handleInputChange('task_start_date', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-100 italic"
                            disabled
                          />
                        ) : (
                          formatDateTime(task.task_start_date) || "—"
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {editingTaskId === task.id ? (
                          <select
                            value={editFormData.frequency}
                            onChange={(e) => handleInputChange('frequency', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-100 italic"
                            disabled
                          >
                            <option value="">Select Frequency</option>
                            <option value="Daily">Daily</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Monthly">Monthly</option>
                            <option value="Yearly">Yearly</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${task.frequency === 'Daily' ? 'bg-blue-100 text-blue-800' :
                            task.frequency === 'Weekly' ? 'bg-green-100 text-green-800' :
                              task.frequency === 'Monthly' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                            }`}>
                            {task.frequency || "—"}
                          </span>
                        )}
                      </td>
                      {/* Duration Column */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-blue-50">
                        {editingTaskId === task.id ? (
                          <select
                            value={editFormData.duration}
                            onChange={(e) => handleInputChange('duration', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select</option>
                            {["15 min", "30 min", "45 min", "1 hour", "1.5 hours", "2 hours", "3 hours", "4 hours", "Half Day", "Full Day"].map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        ) : (
                          task.duration ? (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              ⏱ {task.duration}
                            </span>
                          ) : "—"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {editingTaskId === task.id ? (
                          <select
                            value={editFormData.enable_reminder}
                            onChange={(e) => handleInputChange('enable_reminder', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        ) : (
                          task.enable_reminder || "—"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {editingTaskId === task.id ? (
                          <select
                            value={editFormData.require_attachment}
                            onChange={(e) => handleInputChange('require_attachment', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        ) : (
                          task.require_attachment || "—"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {editingTaskId === task.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              <Save size={14} />
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="flex items-center gap-1 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEditClick(task)}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                        )}
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