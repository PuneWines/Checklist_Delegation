import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { CheckCircle2, Trash2, X, Search, Play, Pause, Edit, Save, Mic, Square } from "lucide-react"
import { useDispatch, useSelector } from "react-redux"
import { deleteDelegationTask, uniqueDelegationTaskData, updateDelegationTask } from "../redux/slice/quickTaskSlice"
import { ReactMediaRecorder } from "react-media-recorder"
import supabase from "../SupabaseClient"
import AudioPlayer from "../components/AudioPlayer"
import { useMagicToast } from "../context/MagicToastContext"

const isAudioUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http') && (
    url.includes('audio-recordings') ||
    url.includes('voice-notes') ||
    url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i)
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
  const { showToast } = useMagicToast();
  const [error, setError] = useState(null)
  const [userRole, setUserRole] = useState("")
  const [username, setUsername] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)
  const [internalSelectedTasks, setInternalSelectedTasks] = useState([])
  const [internalIsDeleting, setInternalIsDeleting] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editFormData, setEditFormData] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

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
      showToast("Tasks deleted successfully", "success")
      dispatch(uniqueDelegationTaskData({}))
    } catch (error) {
      console.error("Failed to delete tasks:", error)
      showToast("Failed to delete tasks", "error")
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
      audio_url: task.audio_url || null,
      task_start_date: task.task_start_date || '',
      frequency: task.frequency || '',
      duration: task.duration || '',
      enable_reminder: task.enable_reminder || '',
      require_attachment: task.require_attachment || '',
      remarks: task.remarks || '',
      originalAudioUrl: task.audio_url || (isAudioUrl(task.task_description) ? task.task_description : null)
    });
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditFormData({});
    setRecordedAudio(null);
  };

  const handleSaveEdit = async () => {
    if (!editFormData.id) return;

    setIsSaving(true);
    try {
      let finalEditData = { ...editFormData };
      let audioToCleanup = null;

      if (recordedAudio && recordedAudio.blob) {
        setIsUploading(true);
        try {
          const fileName = `voice-notes/${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('audio-recordings')
            .upload(fileName, recordedAudio.blob, {
              contentType: recordedAudio.blob.type || 'audio/webm',
              upsert: false
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from('audio-recordings')
            .getPublicUrl(fileName);

          finalEditData.audio_url = publicUrlData.publicUrl;

          // If legacy audio was in description, clear it to separate
          if (isAudioUrl(finalEditData.task_description)) {
            finalEditData.task_description = '';
          }

          if (editFormData.originalAudioUrl) {
            audioToCleanup = editFormData.originalAudioUrl;
          }
        } catch (error) {
          console.error("Audio upload failed:", error);
          showToast("Failed to upload voice note. Saving without it.", "error");
        } finally {
          setIsUploading(false);
        }
      } else if (editFormData.originalAudioUrl && editFormData.audio_url === null && !isAudioUrl(editFormData.task_description)) {
        audioToCleanup = editFormData.originalAudioUrl;
      }

      const originalTask = delegationTasks.find(task => task.id === editFormData.id);

      await dispatch(updateDelegationTask({
        updatedTask: finalEditData,
        originalTask: originalTask ? {
          department: originalTask.department,
          name: originalTask.name,
          task_description: originalTask.task_description
        } : null
      })).unwrap();

      if (audioToCleanup) {
        try {
          const path = audioToCleanup.split('audio-recordings/').pop().split('?')[0];
          await supabase.storage.from('audio-recordings').remove([path]);
        } catch (cleanupError) {
          console.error("Failed to cleanup old audio:", cleanupError);
        }
      }

      setEditingTaskId(null);
      setEditFormData({});
      setRecordedAudio(null);
      // Refresh
      dispatch(uniqueDelegationTaskData({}));
      showToast("Task updated successfully", "success");
    } catch (error) {
      console.error("Failed to update task:", error)
      showToast("Failed to update task", "error");
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

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return filtered.map(task => {
      const taskDate = task.task_start_date ? new Date(task.task_start_date) : null;
      let timeStatus = "Not Submitted";

      if (taskDate) {
        const taskDay = new Date(taskDate);
        taskDay.setHours(0, 0, 0, 0);

        if (taskDay < now) {
          timeStatus = "Overdue";
        } else if (taskDay.getTime() === now.getTime()) {
          timeStatus = "Today";
        } else {
          timeStatus = "Upcoming";
        }
      }

      return { ...task, timeStatus };
    });
  }, [delegationTasks, searchTerm, freqFilter, departmentFilter])

  return (
    <>
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
            {/* Desktop View */}
            <table className="hidden md:table min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
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
                    Time Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
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
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-bold">
                        <span className={`px-2 py-0.5 rounded-full ${task.timeStatus === "Overdue" ? "bg-red-100 text-red-700" :
                          task.timeStatus === "Today" ? "bg-amber-100 text-amber-700" :
                            task.timeStatus === "Upcoming" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-700"
                          }`}>
                          {task.timeStatus}
                        </span>
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.id || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 min-w-[300px] max-w-[400px]">
                        {editingTaskId === task.id ? (
                          <ReactMediaRecorder
                            audio
                            onStop={(blobUrl, blob) => setRecordedAudio({ blobUrl, blob })}
                            render={({ status, startRecording, stopRecording, clearBlobUrl }) => (
                              <div className="space-y-2">
                                {status !== 'recording' && !recordedAudio && (
                                  <div className="space-y-2">
                                    <div className="relative">
                                      <textarea
                                        value={editFormData.task_description || ''}
                                        onChange={(e) => handleInputChange('task_description', e.target.value)}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm pr-10 focus:ring-1 focus:ring-purple-500 outline-none"
                                        rows="2"
                                        placeholder="Enter task text..."
                                      />
                                      <button
                                        type="button"
                                        onClick={startRecording}
                                        className="absolute bottom-2 right-2 p-1.5 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200"
                                        title="Record Audio"
                                      >
                                        <Mic size={14} />
                                      </button>
                                    </div>
                                    {(editFormData.audio_url || isAudioUrl(editFormData.task_description)) && (
                                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[10px] font-bold text-indigo-600 uppercase">Existing Voice Note</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleInputChange('audio_url', null);
                                              if (isAudioUrl(editFormData.task_description)) {
                                                handleInputChange('task_description', '');
                                              }
                                            }}
                                            className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                                          >
                                            <Trash2 size={10} /> Remove
                                          </button>
                                        </div>
                                        <AudioPlayer url={editFormData.audio_url || editFormData.task_description} />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {status === 'recording' && (
                                  <div className="flex flex-col items-center justify-center p-4 bg-red-50 border border-red-100 rounded-lg space-y-2 animate-pulse">
                                    <Mic size={20} className="text-red-600" />
                                    <button
                                      type="button"
                                      onClick={stopRecording}
                                      className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 text-xs font-bold"
                                    >
                                      <Square size={10} /> Stop
                                    </button>
                                  </div>
                                )}

                                {recordedAudio && status !== 'recording' && (
                                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-bold text-purple-600 uppercase">New Voice Note Attached</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          clearBlobUrl();
                                          setRecordedAudio(null);
                                        }}
                                        className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                                      >
                                        <Trash2 size={10} /> Remove
                                      </button>
                                    </div>
                                    <AudioPlayer url={recordedAudio.blobUrl} />
                                  </div>
                                )}
                              </div>
                            )}
                          />
                        ) : (
                          <div className="whitespace-normal break-words underline-offset-2 space-y-2">
                            {task.task_description && !isAudioUrl(task.task_description) && (
                              <div className="text-gray-900">{task.task_description}</div>
                            )}
                            {(task.audio_url || isAudioUrl(task.task_description)) && (
                              <AudioPlayer url={task.audio_url || task.task_description} />
                            )}
                            {!task.task_description && !task.audio_url && "—"}
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
                            {doersList.map(user => (
                              <option key={user.user_name || user} value={user.user_name || user}>
                                {user.user_name || user}
                              </option>
                            ))}
                          </select>
                        ) : (
                          task.name || "—"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap bg-yellow-50">
                        {editingTaskId === task.id ? (
                          <input
                            type="datetime-local"
                            value={editFormData.task_start_date ? editFormData.task_start_date.slice(0, 16) : ""}
                            onChange={(e) => handleInputChange("task_start_date", e.target.value)}
                            className="text-xs border-gray-300 rounded focus:ring-purple-500"
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
                          <input
                            type="text"
                            value={editFormData.duration}
                            onChange={(e) => handleInputChange('duration', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="e.g. 1 hour"
                          />
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

            {/* Mobile View - Delegation Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task, index) => (
                  <div key={index} className={`p-5 bg-white space-y-4 ${selectedTasks.find(t => t.id === task.id) ? "bg-purple-50/50" : ""}`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-300">{(index + 1).toString().padStart(2, '0')}</span>
                        <input
                          type="checkbox"
                          checked={!!selectedTasks.find(t => t.id === task.id)}
                          onChange={() => handleCheckboxChange(task)}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black text-purple-500 uppercase tracking-wider">#{task.id || 'N/A'}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${task.frequency === 'Daily' ? 'bg-blue-100 text-blue-800' :
                            task.frequency === 'Weekly' ? 'bg-green-100 text-green-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                            {task.frequency || 'Manual'}
                          </span>
                        </div>

                        {editingTaskId === task.id ? (
                          <div className="space-y-4 py-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-gray-400 uppercase">Description</label>
                              <textarea
                                value={editFormData.task_description}
                                onChange={(e) => handleInputChange('task_description', e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"
                                rows="3"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase">Department</label>
                                <select
                                  value={editFormData.department}
                                  onChange={(e) => handleInputChange('department', e.target.value)}
                                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                                >
                                  <option value="">Select Dept</option>
                                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase">Assignee</label>
                                <select
                                  value={editFormData.name}
                                  onChange={(e) => handleInputChange('name', e.target.value)}
                                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                                >
                                  <option value="">Select Doer</option>
                                  {doersList.map(u => <option key={u.user_name || u} value={u.user_name || u}>{u.user_name || u}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <button onClick={handleSaveEdit} className="flex-1 flex justify-center items-center gap-2 py-2.5 bg-green-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-100">
                                <Save size={14} /> Save
                              </button>
                              <button onClick={handleCancelEdit} className="flex-1 py-2.5 bg-gray-100 text-gray-500 rounded-xl text-xs font-black uppercase tracking-widest">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-gray-800 leading-tight mb-4 space-y-2">
                              {task.task_description && !isAudioUrl(task.task_description) && (
                                <div>{task.task_description}</div>
                              )}
                              {(task.audio_url || isAudioUrl(task.task_description)) && (
                                <AudioPlayer url={task.audio_url || task.task_description} />
                              )}
                              {!task.task_description && !task.audio_url && "—"}
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t border-gray-50 pt-4">
                              <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Dept</span>
                                <div className="text-[11px] font-bold text-gray-700 truncate">{task.department || '—'}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">From</span>
                                <div className="text-[11px] font-bold text-gray-700 truncate">{task.given_by || '—'}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Assignee</span>
                                <div className="text-[11px] font-bold text-gray-700 truncate">{task.name || '—'}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Start</span>
                                <div className="text-[11px] font-bold text-gray-700">{formatDateTime(task.task_start_date)}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Time Status</span>
                                <div className={`text-[10px] font-bold w-fit px-2 py-0.5 rounded-full ${task.timeStatus === "Overdue" ? "bg-red-100 text-red-700" :
                                  task.timeStatus === "Today" ? "bg-amber-100 text-amber-700" :
                                    task.timeStatus === "Upcoming" ? "bg-blue-100 text-blue-700" :
                                      "bg-gray-100 text-gray-700"
                                  }`}>
                                  {task.timeStatus}
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      {!editingTaskId && (
                        <button onClick={() => handleEditClick(task)} className="p-2 bg-blue-50 text-blue-600 rounded-xl active:scale-95 transition-all">
                          <Edit size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-gray-400 font-bold text-sm">No delegation tasks archived</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DelegationPage