"use client"
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { format } from 'date-fns';
import { Search, ChevronDown, Filter, Trash2, Edit, Save, X, Play, Pause, Mic, Square } from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import DelegationPage from "./delegation-data";
import { useDispatch, useSelector } from "react-redux";
import { deleteChecklistTask, deleteDelegationTask, uniqueChecklistTaskData, uniqueDelegationTaskData, updateChecklistTask, fetchUsers, resetChecklistPagination, resetDelegationPagination } from "../redux/slice/quickTaskSlice";
import { maintenanceData, deleteMaintenanceTask, updateMaintenanceTask } from "../redux/slice/maintenanceSlice";
import { fetchUniqueDepartmentDataApi, fetchUniqueGivenByDataApi, fetchUniqueDoerNameDataApi } from "../redux/api/assignTaskApi";
import { ReactMediaRecorder } from "react-media-recorder";
import supabase from "../SupabaseClient";

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

export default function QuickTask() {
  const [tasks, setTasks] = useState([]);
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [activeTab, setActiveTab] = useState('checklist');
  const [freqFilter, setFreqFilter] = useState('');
  const tableContainerRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState({
    frequency: false
  });
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Dropdown lists
  const [departments, setDepartments] = useState([]);
  const [givenByList, setGivenByList] = useState([]);
  const [doersList, setDoersList] = useState([]);

  // const { quickTask, loading, delegationTasks, users } = useSelector((state) => state.quickTask);
  const {
    quickTask,
    loading,
    delegationTasks,
    users,                    // Add this
    checklistPage,            // Add this
    checklistHasMore,         // Add this
    delegationPage,           // Add this
    delegationHasMore         // Add this
  } = useSelector((state) => state.quickTask);

  const {
    maintenance,
    loading: maintenanceLoading,
    hasMore: maintenanceHasMore,
    currentPage: maintenancePage
  } = useSelector((state) => state.maintenance);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(resetChecklistPagination());
    dispatch(uniqueChecklistTaskData({ page: 0, pageSize: 50 }));

    // Fetch dropdown data
    const fetchDropdownData = async () => {
      const [depts, givens, doers] = await Promise.all([
        fetchUniqueDepartmentDataApi(),
        fetchUniqueGivenByDataApi(),
        fetchUniqueDoerNameDataApi()
      ]);
      setDepartments(depts);
      setGivenByList(givens);
      setDoersList(doers);
    };
    fetchDropdownData();
  }, [dispatch]);


  // Add this new function
  const handleScroll = useCallback(() => {
    if (!tableContainerRef.current || loading || (activeTab === 'maintenance' && maintenanceLoading)) return;

    const { scrollTop, scrollHeight, clientHeight } = tableContainerRef.current;

    // Check if scrolled near bottom (within 100px)
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (activeTab === 'checklist' && checklistHasMore) {
        dispatch(uniqueChecklistTaskData({
          page: checklistPage,
          pageSize: 50,
          append: true
        }));
      } else if (activeTab === 'delegation' && delegationHasMore) {
        dispatch(uniqueDelegationTaskData({
          page: delegationPage,
          pageSize: 50,
          append: true
        }));
      } else if (activeTab === 'maintenance' && maintenanceHasMore) {
        dispatch(maintenanceData({
          page: maintenancePage + 1,
          frequency: freqFilter,
          searchTerm: searchTerm
        }));
      }
    }
  }, [loading, maintenanceLoading, activeTab, checklistHasMore, delegationHasMore, maintenanceHasMore, checklistPage, delegationPage, maintenancePage, dispatch]);

  // Add scroll listener
  useEffect(() => {
    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Edit functionality
  const handleEditClick = (task) => {
    setEditingTaskId(task.id);
    if (activeTab === 'maintenance') {
      setEditFormData({
        id: task.id,
        machine_name: task.machine_name || '',
        part_name: task.part_name || '',
        part_area: task.part_area || '',
        given_by: task.given_by || '',
        name: task.name || '',
        task_description: task.task_description || '',
        task_start_date: task.task_start_date || '',
        freq: task.freq || '',
        status: task.status || '',
        remarks: task.remarks || ''
      });
    } else {
      setEditFormData({
        id: task.id,
        department: task.department || '',
        given_by: task.given_by || '',
        name: task.name || '',
        task_description: task.task_description || '',
        task_start_date: task.task_start_date || '',
        frequency: task.frequency || '',
        enable_reminder: task.enable_reminder || '',
        require_attachment: task.require_attachment || '',
        remark: task.remark || '',
        originalAudioUrl: isAudioUrl(task.task_description) ? task.task_description : null,
      });
    }
  };

  const [recordedAudio, setRecordedAudio] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

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

      // Handle Audio Upload
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

          finalEditData.task_description = publicUrlData.publicUrl;

          if (editFormData.originalAudioUrl) {
            audioToCleanup = editFormData.originalAudioUrl;
          }
        } catch (error) {
          console.error("Audio upload failed:", error);
          alert("Failed to upload voice note. Saving without it.");
        } finally {
          setIsUploading(false);
        }
      } else if (editFormData.originalAudioUrl && !isAudioUrl(editFormData.task_description)) {
        audioToCleanup = editFormData.originalAudioUrl;
      }

      if (activeTab === 'maintenance') {
        const originalTask = maintenance.find(task => task.id === editFormData.id);
        await dispatch(updateMaintenanceTask({
          updatedTask: finalEditData,
          originalTask: originalTask ? {
            machine_name: originalTask.machine_name,
            part_name: originalTask.part_name,
            task_description: originalTask.task_description
          } : null
        })).unwrap();
      } else if (activeTab === 'delegation') {
        const originalTask = delegationTasks.find(task => task.id === editFormData.id);
        await dispatch(updateDelegationTask({
          updatedTask: finalEditData,
          originalTask: originalTask ? {
            department: originalTask.department,
            name: originalTask.name,
            task_description: originalTask.task_description
          } : null
        })).unwrap();
      } else {
        // Find the original task data for matching (only for checklist currently)
        const originalTask = quickTask.find(task => task.id === editFormData.id);
        if (!originalTask) {
          setIsSaving(false);
          return;
        }

        await dispatch(updateChecklistTask({
          updatedTask: finalEditData,
          originalTask: {
            department: originalTask.department,
            name: originalTask.name,
            task_description: originalTask.task_description
          }
        })).unwrap();
      }

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

      // Refresh the data
      if (activeTab === 'checklist') {
        dispatch(uniqueChecklistTaskData());
      } else if (activeTab === 'maintenance') {
        dispatch(maintenanceData({ page: 1, frequency: freqFilter, searchTerm: searchTerm }));
      }

    } catch (error) {
      console.error("Failed to update task:", error);
      setError("Failed to update task");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = async (field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // If department changes, refresh doers list
    if (field === 'department') {
      const doers = await fetchUniqueDoerNameDataApi(value);
      setDoersList(doers);
    }
  };

  // Change your checkbox to store whole row instead of only id
  const handleCheckboxChange = (task) => {
    if (selectedTasks.find(t => t.id === task.id)) {
      setSelectedTasks(selectedTasks.filter(t => t.id !== task.id));
    } else {
      setSelectedTasks([...selectedTasks, task]);
    }
  };

  // Select all
  const handleSelectAll = () => {
    const currentTasks =
      activeTab === 'checklist' ? filteredChecklistTasks :
        activeTab === 'maintenance' ? filteredMaintenance :
          activeTab === 'delegation' ? filteredDelegationTasks : [];

    if (selectedTasks.length === currentTasks.length && currentTasks.length > 0) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(currentTasks); // store full rows
    }
  };

  // Delete
  const handleDeleteSelected = async () => {
    if (selectedTasks.length === 0) return;

    setIsDeleting(true);
    try {
      console.log("Deleting rows:", selectedTasks);
      if (activeTab === 'checklist') {
        await dispatch(deleteChecklistTask(selectedTasks)).unwrap();
      } else if (activeTab === 'maintenance') {
        await dispatch(deleteMaintenanceTask(selectedTasks)).unwrap();
      } else if (activeTab === 'delegation') {
        await dispatch(deleteDelegationTask(selectedTasks)).unwrap();
        dispatch(uniqueDelegationTaskData({}));
      }
      setSelectedTasks([]);
    } catch (error) {
      console.error("Failed to delete tasks:", error);
      setError("Failed to delete tasks");
    } finally {
      setIsDeleting(false);
    }
  };

  const CONFIG = {
    APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzXzqnKmbeXw3i6kySQcBOwxHQA7y8WBFfEe69MPbCR-jux0Zte7-TeSKi8P4CIFkhE/exec",
    SHEET_NAME: "Unique task",
    DELEGATION_SHEET: "Delegation",
    PAGE_CONFIG: {
      title: "Task Management",
      description: "Showing all unique tasks"
    }
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return "";
    try {
      const date = new Date(dateValue);
      return isNaN(date.getTime()) ? dateValue : format(date, 'dd/MM/yyyy HH:mm');
    } catch {
      return dateValue;
    }
  };

  const requestSort = (key) => {
    if (loading) return;
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleFrequencyFilterSelect = (freq) => {
    setFreqFilter(freq);
    setDropdownOpen({ ...dropdownOpen, frequency: false });

    if (activeTab === 'maintenance') {
      dispatch(maintenanceData({ page: 1, frequency: freq, searchTerm: searchTerm }));
    }
  };

  const clearFrequencyFilter = () => {
    setFreqFilter('');
    setDropdownOpen({ ...dropdownOpen, frequency: false });

    if (activeTab === 'maintenance') {
      dispatch(maintenanceData({ page: 1, frequency: '', searchTerm: searchTerm }));
    }
  };

  const filteredDelegationTasks = delegationTasks.filter(task => {
    const freqFilterPass = !freqFilter || (task.frequency?.toLowerCase() === freqFilter.toLowerCase());
    const searchTermPass = !searchTerm || (
      task.task_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.given_by?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return freqFilterPass && searchTermPass;
  });

  // Keep allFrequencies as is (or modify if you want to fetch frequencies from elsewhere)
  const allFrequencies = useMemo(() => {
    const freqs = new Set();
    // Checklist and Delegation use 'frequency'
    [...quickTask, ...delegationTasks].forEach(task => {
      if (task.frequency) freqs.add(task.frequency.toLowerCase());
    });
    // Maintenance uses 'freq'
    maintenance.forEach(task => {
      if (task.freq) freqs.add(task.freq.toLowerCase());
    });
    return Array.from(freqs).sort();
  }, [quickTask, delegationTasks, maintenance]);


  const filteredChecklistTasks = quickTask.filter(task => {
    const freqFilterPass = !freqFilter || (task.frequency?.toLowerCase() === freqFilter.toLowerCase());
    const searchTermPass = !searchTerm || task.task_description
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase());

    // Today and Overdue Filter (Hide Upcoming)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = task.task_start_date ? new Date(task.task_start_date) : null;
    let isUpcoming = false;
    if (taskDate) {
      const taskDay = new Date(taskDate);
      taskDay.setHours(0, 0, 0, 0);
      if (taskDay > today) isUpcoming = true;
    }

    return freqFilterPass && searchTermPass && !isUpcoming;
  }).sort((a, b) => {
    if (!sortConfig.key) return 0;
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const filteredMaintenance = maintenance.filter(task => {
    // Frequency Filter
    const freqFilterPass = !freqFilter || (task.freq?.toLowerCase() === freqFilter.toLowerCase());

    // Search Term Filter
    const searchTermPass = !searchTerm ||
      task.task_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.name?.toLowerCase().includes(searchTerm.toLowerCase());

    // Today and Overdue Filter (Hide Upcoming)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = task.task_start_date ? new Date(task.task_start_date) : null;
    let isUpcoming = false;
    if (taskDate) {
      const taskDay = new Date(taskDate);
      taskDay.setHours(0, 0, 0, 0);
      if (taskDay > today) isUpcoming = true;
    }

    return freqFilterPass && searchTermPass && !isUpcoming;
  });

  function formatTimestampToDDMMYYYY(timestamp) {
    if (!timestamp || timestamp === "" || timestamp === null) {
      return "—"; // or just return ""
    }

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return "—"; // fallback if it's not a valid date
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  return (
    <AdminLayout>
      <div className="sticky top-0 z-30 bg-white pb-4 border-b border-gray-200">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-purple-700">
              {CONFIG.PAGE_CONFIG.title}
            </h1>
            <p className="text-purple-600 text-sm">
              {activeTab === 'checklist'
                ? `Showing ${quickTask.length} checklist tasks`
                : activeTab === 'maintenance'
                  ? `Showing ${filteredMaintenance.length} maintenance tasks`
                  : `Showing delegation tasks`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex gap-2 self-start overflow-x-auto no-scrollbar pb-1 max-w-full">
              <button
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-all ${activeTab === 'checklist'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300'
                  }`}
                onClick={() => {
                  setActiveTab('checklist');
                  setSelectedTasks([]);
                  dispatch(resetChecklistPagination());
                  dispatch(uniqueChecklistTaskData({ page: 0, pageSize: 50 }));
                }}
              >
                Checklist
              </button>
              <button
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-all ${activeTab === 'delegation'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300'
                  }`}
                onClick={() => {
                  setActiveTab('delegation');
                  setSelectedTasks([]);
                  dispatch(resetDelegationPagination());
                  dispatch(uniqueDelegationTaskData({ page: 0, pageSize: 50 }));
                }}
              >
                Delegation
              </button>
              <button
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-all ${activeTab === 'maintenance'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300'
                  }`}
                onClick={() => {
                  setActiveTab('maintenance');
                  setSelectedTasks([]);
                  dispatch(maintenanceData({ page: 1, frequency: freqFilter, searchTerm: searchTerm }));
                }}
              >
                Maintenance
              </button>
            </div>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={loading || delegationLoading}
              />
            </div>

            <div className="flex gap-2">
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(prev => ({ ...prev, frequency: !prev.frequency }))}
                  className="flex items-center gap-2 px-3 py-2 border border-purple-200 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Filter className="h-4 w-4" />
                  {freqFilter || 'Filter by Frequency'}
                  <ChevronDown size={16} className={`transition-transform ${dropdownOpen.frequency ? 'rotate-180' : ''}`} />
                </button>
                {dropdownOpen.frequency && (
                  <div className="absolute z-50 mt-1 w-56 rounded-md bg-white shadow-lg border border-gray-200 max-h-60 overflow-auto">
                    <div className="py-1">
                      <button
                        onClick={clearFrequencyFilter}
                        className={`block w-full text-left px-4 py-2 text-sm ${!freqFilter ? 'bg-purple-100 text-purple-900' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        All Frequencies
                      </button>
                      {allFrequencies.map(freq => (
                        <button
                          key={freq}
                          onClick={() => handleFrequencyFilterSelect(freq)}
                          className={`block w-full text-left px-4 py-2 text-sm ${freqFilter === freq ? 'bg-purple-100 text-purple-900' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          <span className="capitalize">{freq}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {(selectedTasks.length > 0 && (activeTab === 'checklist' || activeTab === 'maintenance' || activeTab === 'delegation')) && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 size={16} />
                {isDeleting ? 'Deleting...' : `Delete (${selectedTasks.length})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 p-4 rounded-md text-red-800 text-center">
          {error}{" "}
          <button
            onClick={() => {
              dispatch(uniqueChecklistTaskData())
            }}
            className="underline ml-2 hover:text-red-600"
          >
            Try again
          </button>
        </div>
      )}

      {loading && activeTab === 'delegation' && (
        <div className="mt-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-2"></div>
          <p className="text-purple-600">Loading delegation data...</p>
        </div>
      )}

      {!error && (
        <>
          {activeTab === 'checklist' ? (
            <div className="mt-4 rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-4 flex justify-between items-center">
                <div>
                  <h2 className="text-purple-700 font-medium">Checklist Tasks</h2>
                  <p className="text-purple-600 text-sm">
                    {CONFIG.PAGE_CONFIG.description}
                  </p>
                </div>
                {selectedTasks.length > 0 && (
                  <span className="text-sm text-purple-600">
                    {selectedTasks.length} task(s) selected
                  </span>
                )}
              </div>
              <div
                ref={tableContainerRef}
                className="overflow-x-auto"
              >
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={selectedTasks.length === filteredChecklistTasks.length && filteredChecklistTasks.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                      </th>
                      {[
                        { key: 'id', label: 'Task ID' },
                        { key: 'task_description', label: 'Task Description', minWidth: 'min-w-[300px]' },
                        { key: 'department', label: 'Department' },
                        { key: 'given_by', label: 'Assign From' },
                        { key: 'name', label: 'Name' },
                        { key: 'task_start_date', label: 'Start Date', bg: 'bg-yellow-50' },
                        { key: 'frequency', label: 'Frequency' },
                        { key: 'enable_reminder', label: 'Reminders' },
                        { key: 'require_attachment', label: 'Attachment' },
                        { key: 'actions', label: 'Actions' },
                      ].map((column) => (
                        <th
                          key={column.label}
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.bg || ''} ${column.minWidth || ''} ${column.key && column.key !== 'actions' ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                          onClick={() => column.key && column.key !== 'actions' && requestSort(column.key)}
                        >
                          <div className="flex items-center">
                            {column.label}
                            {sortConfig.key === column.key && (
                              <span className="ml-1">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredChecklistTasks.length > 0 ? (
                      filteredChecklistTasks.map((task, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedTasks.includes(task)}
                              onChange={() => handleCheckboxChange(task)}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                          </td>

                          {/* Task ID */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.id}
                          </td>

                          {/* Task Description */}
                          <td className="px-6 py-4 text-sm text-gray-500 min-w-[300px] max-w-[400px]">
                            {editingTaskId === task.id ? (
                              <ReactMediaRecorder
                                audio
                                onStop={(blobUrl, blob) => setRecordedAudio({ blobUrl, blob })}
                                render={({ status, startRecording, stopRecording, clearBlobUrl }) => (
                                  <div className="space-y-2">
                                    {status !== 'recording' && !recordedAudio && (
                                      <div className="relative">
                                        {isAudioUrl(editFormData.task_description) ? (
                                          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                                            <div className="flex items-center justify-between mb-2">
                                              <span className="text-[10px] font-bold text-indigo-600 uppercase">Existing Audio</span>
                                              <button
                                                type="button"
                                                onClick={() => handleInputChange('task_description', '')}
                                                className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                                              >
                                                <Trash2 size={10} /> Remove
                                              </button>
                                            </div>
                                            <AudioPlayer url={editFormData.task_description} />
                                            <button
                                              type="button"
                                              onClick={startRecording}
                                              className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition-all"
                                            >
                                              <Mic size={12} /> Replace with Recording
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="relative">
                                            <textarea
                                              value={editFormData.task_description}
                                              onChange={(e) => handleInputChange('task_description', e.target.value)}
                                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm pr-10"
                                              rows="3"
                                              placeholder="Enter task text..."
                                            />
                                            <button
                                              type="button"
                                              onClick={startRecording}
                                              className="absolute bottom-2 right-2 p-1.5 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200"
                                              title="Record Audio"
                                            >
                                              <Mic size={16} />
                                            </button>
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
                                        <audio src={recordedAudio.blobUrl} controls className="w-full h-8 mt-1" />
                                      </div>
                                    )}
                                  </div>
                                )}
                              />
                            ) : (
                              <div className="whitespace-normal break-words">
                                {isAudioUrl(task.task_description) ? (
                                  <AudioPlayer url={task.task_description} />
                                ) : (
                                  task.task_description
                                )}
                              </div>
                            )}
                          </td>

                          {/* Department */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
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
                              task.department
                            )}
                          </td>

                          {/* Given By */}
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
                              task.given_by
                            )}
                          </td>

                          {/* Name */}
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
                              task.name
                            )}
                          </td>

                          {/* Task Start Date */}
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
                              formatTimestampToDDMMYYYY(task.task_start_date)
                            )}
                          </td>



                          {/* Frequency */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.frequency}
                                onChange={(e) => handleInputChange('frequency', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-100 italic"
                                disabled
                              >
                                <option value="">Select Frequency</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                              </select>
                            ) : (
                              <span className={`px-2 py-1 rounded-full text-xs ${task.frequency?.toLowerCase() === 'daily' ? 'bg-blue-100 text-blue-800' :
                                task.frequency?.toLowerCase() === 'weekly' ? 'bg-green-100 text-green-800' :
                                  task.frequency?.toLowerCase() === 'monthly' ? 'bg-purple-100 text-purple-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                {task.frequency}
                              </span>
                            )}
                          </td>

                          {/* Enable Reminders */}
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
                              <span className="capitalize">{task.enable_reminder || "—"}</span>
                            )}
                          </td>

                          {/* Require Attachment */}
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
                              <span className="capitalize">{task.require_attachment || "—"}</span>
                            )}
                          </td>

                          {/* Actions */}
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
                              // REMOVED THE submission_date CHECK - ALWAYS SHOW EDIT BUTTON
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
                        <td colSpan={11} className="px-6 py-4 text-center text-gray-500">
                          {searchTerm || freqFilter
                            ? "No tasks matching your filters"
                            : "No tasks available"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {loading && checklistHasMore && (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-500"></div>
                    <p className="text-purple-600 text-sm mt-2">Loading more tasks...</p>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'maintenance' ? (
            <div className="mt-4 rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-4">
                <h2 className="text-purple-700 font-medium">Maintenance Tasks</h2>
                <div className="flex items-center gap-2">
                  {maintenanceLoading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-purple-600"></div>}
                  <p className="text-purple-600 text-sm">Showing all maintenance tasks from database</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={selectedTasks.length === filteredMaintenance.length && filteredMaintenance.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                      </th>
                      {[
                        { label: 'Task ID' },
                        { label: 'Task Description', minWidth: 'min-w-[200px]' },
                        { label: 'Machine Name' },
                        { label: 'Part Name' },
                        { label: 'Part Area' },
                        { label: 'Assign From' },
                        { label: 'Name' },
                        { label: 'Start Date', bg: 'bg-yellow-50' },
                        { label: 'Frequency' },
                        { label: 'Status' },
                        { label: 'Remarks' },
                        { label: 'Actions' },
                      ].map((column) => (
                        <th
                          key={column.label}
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.bg || ''} ${column.minWidth || ''}`}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredMaintenance.length > 0 ? (
                      filteredMaintenance.map((task, index) => (
                        <tr key={index} className={`hover:bg-gray-50 ${selectedTasks.find(t => t.id === task.id) ? "bg-purple-50" : ""}`}>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={!!selectedTasks.find(t => t.id === task.id)}
                              onChange={() => handleCheckboxChange(task)}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.id}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 min-w-[200px] max-w-[400px]">
                            {editingTaskId === task.id ? (
                              <textarea
                                value={editFormData.task_description}
                                onChange={(e) => handleInputChange('task_description', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                rows="3"
                              />
                            ) : (
                              isAudioUrl(task.task_description) ? (
                                <AudioPlayer url={task.task_description} />
                              ) : (
                                <div className="whitespace-normal break-words">{task.task_description}</div>
                              )
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.machine_name}
                                onChange={(e) => handleInputChange('machine_name', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            ) : (
                              task.machine_name
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.part_name}
                                onChange={(e) => handleInputChange('part_name', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            ) : (
                              task.part_name
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.part_area}
                                onChange={(e) => handleInputChange('part_area', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            ) : (
                              task.part_area
                            )}
                          </td>
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
                              task.given_by
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
                              task.name
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
                              formatTimestampToDDMMYYYY(task.task_start_date)
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.freq}
                                onChange={(e) => handleInputChange('freq', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-100 italic"
                                disabled
                              >
                                <option value="">Select Frequency</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                              </select>
                            ) : (
                              <span className={`px-2 py-1 rounded-full text-xs ${task.freq?.toLowerCase() === 'daily' ? 'bg-blue-100 text-blue-800' :
                                task.freq?.toLowerCase() === 'weekly' ? 'bg-green-100 text-green-800' :
                                  task.freq?.toLowerCase() === 'monthly' ? 'bg-purple-100 text-purple-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                <span className="capitalize">{task.freq}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`px-2 py-1 rounded-full text-xs ${task.status === 'Done' ? 'bg-green-100 text-green-800' :
                              task.status === 'Issue' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                              {task.status || 'Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.remarks}
                                onChange={(e) => handleInputChange('remarks', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            ) : (
                              task.remarks || '—'
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
                        <td colSpan={13} className="px-6 py-4 text-center text-gray-500">
                          No maintenance tasks found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <DelegationPage
              searchTerm={searchTerm}
              freqFilter={freqFilter}
              setFreqFilter={setFreqFilter}
              externalSelectedTasks={selectedTasks}
              departments={departments}
              givenByList={givenByList}
              doersList={doersList}
              onSelectionChange={(taskOrAll, allTasks) => {
                if (taskOrAll === 'ALL') {
                  if (selectedTasks.length === allTasks.length) setSelectedTasks([]);
                  else setSelectedTasks(allTasks);
                } else {
                  handleCheckboxChange(taskOrAll);
                }
              }}
              onDelete={handleDeleteSelected}
              isExternalDeleting={isDeleting}
            />
          )}
        </>
      )}
    </AdminLayout>
  );
}
