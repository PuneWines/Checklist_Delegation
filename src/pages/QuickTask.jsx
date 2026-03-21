"use client"
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { format } from 'date-fns';
import { Search, ChevronDown, Filter, Trash2, Edit, Save, X, Play, Pause, Mic, Square } from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import DelegationPage from "./delegation-data";
import { useDispatch, useSelector } from "react-redux";
import { deleteChecklistTask, deleteDelegationTask, uniqueChecklistTaskData, uniqueDelegationTaskData, updateChecklistTask, updateDelegationTask, fetchUsers, resetChecklistPagination, resetDelegationPagination } from "../redux/slice/quickTaskSlice";
import { maintenanceData, deleteMaintenanceTask, updateMaintenanceTask } from "../redux/slice/maintenanceSlice";
import { fetchUniqueDepartmentDataApi, fetchUniqueGivenByDataApi, fetchUniqueDoerNameDataApi } from "../redux/api/assignTaskApi";
import { fetchCustomDropdownsApi } from "../redux/api/settingApi";
import { ReactMediaRecorder } from "react-media-recorder";
import supabase from "../SupabaseClient";
import AudioPlayer from "../components/AudioPlayer";
import { useMagicToast } from "../context/MagicToastContext";

const isAudioUrl = (url) => {
  if (typeof url !== 'string') return false;
  return url.startsWith('http') && (
    url.includes('audio-recordings') ||
    url.includes('voice-notes') ||
    url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i)
  );
};

const getTimeStatus = (dateString, taskStatus) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const taskDate = new Date(date);
  taskDate.setHours(0, 0, 0, 0);

  const isExtended = taskStatus?.toLowerCase() === "extended" || taskStatus?.toLowerCase() === "extend";

  if (isExtended) {
    if (taskDate < today) return "Overdue";
    return "Today";
  }

  if (taskDate < today) return "Overdue";
  if (taskDate.getTime() === today.getTime()) return "Today";
  return "Upcoming";
};
const RenderDescription = ({ text, audioUrl, instructionUrl, instructionType }) => {
  if (!text && !audioUrl && !instructionUrl) return "—";

  const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|wav|ogg|webm|m4a|aac)(\?.*)?)/i;
  let match = null;
  if (text && typeof text === 'string') {
      match = text.match(urlRegex);
  }

  let url = audioUrl || (match ? match[0] : null);
  let cleanText = text || '';

  if (match && !audioUrl) {
    cleanText = text.replace(match[0], '').replace(/Voice Note Link:/i, '').replace(/Voice Note:/i, '').trim();
  }

  const renderInstruction = () => {
    if (!instructionUrl || !instructionType || instructionType === 'none') return null;
    let iconLabel = "View Reference";
    if (instructionType === 'video') iconLabel = "Play Video Reference";
    if (instructionType === 'image') iconLabel = "View Image Reference";
    if (instructionType === 'pdf') iconLabel = "Open PDF Reference";
    if (instructionType === 'link') iconLabel = "Visit Reference Link";

    return (
      <a href={instructionUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 mt-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1.5 rounded-md hover:bg-blue-100 transition-colors w-fit shadow-sm">
        🔗 {iconLabel}
      </a>
    );
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[200px]">
      {cleanText && <span className="whitespace-pre-wrap text-sm" title={cleanText}>{cleanText}</span>}
      {url && <AudioPlayer url={url} />}
      {renderInstruction()}
    </div>
  );
};

export default function QuickTask() {
  const { showToast } = useMagicToast();
  const [tasks, setTasks] = useState([]);
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('checklist');
  const tableContainerRef = useRef(null);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Dropdown lists
  const [departments, setDepartments] = useState([]);
  const [givenByList, setGivenByList] = useState([]);
  const [doersList, setDoersList] = useState([]);
  const [customOptions, setCustomOptions] = useState([]);

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [freqFilter, setFreqFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all');

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

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
      const [depts, givens, doers, customs] = await Promise.all([
        fetchUniqueDepartmentDataApi(),
        fetchUniqueGivenByDataApi(),
        fetchUniqueDoerNameDataApi(),
        fetchCustomDropdownsApi()
      ]);
      setDepartments(depts);
      setGivenByList(givens);
      setDoersList(doers);
      setCustomOptions(customs);
    };
    fetchDropdownData();
  }, [dispatch]);

  // Re-fetch when activeTab or filters change (with debounced search)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (activeTab === 'checklist') {
        dispatch(resetChecklistPagination());
        dispatch(uniqueChecklistTaskData({ page: 0, pageSize: 50, dateFilter, nameFilter: searchTerm }));
      } else if (activeTab === 'delegation') {
        dispatch(resetDelegationPagination());
        dispatch(uniqueDelegationTaskData({ page: 0, pageSize: 50, dateFilter, nameFilter: searchTerm }));
      } else if (activeTab === 'maintenance') {
        dispatch(maintenanceData({ page: 1, frequency: freqFilter, searchTerm: searchTerm }));
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [dispatch, activeTab, dateFilter, freqFilter, searchTerm]);


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
          page: maintenancePage + 1
        }));
      }
    }
  }, [loading, maintenanceLoading, activeTab, checklistHasMore, delegationHasMore, maintenanceHasMore, checklistPage, delegationPage, maintenancePage, dispatch]);

  // Options for Maintenance dropdowns
  const machineOptions = useMemo(() =>
    [...new Set(customOptions.filter(o => o.category === "Machine Name").map(o => o.value))].sort(),
    [customOptions]
  );

  const areaOptions = useMemo(() =>
    [...new Set(customOptions.filter(o => o.category === "Machine Area").map(o => o.value))].sort(),
    [customOptions]
  );

  const partOptions = useMemo(() => {
    let filtered = customOptions.filter(o => o.category === "Part Name");
    if (editFormData.machine_name) {
      filtered = filtered.filter(o => o.parent === editFormData.machine_name);
    }
    return [...new Set(filtered.map(o => o.value))].sort();
  }, [customOptions, editFormData.machine_name]);

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
        audio_url: task.audio_url || null,
        task_start_date: task.task_start_date || '',
        freq: task.freq || '',
        duration: task.duration || '',
        status: task.status || '',
        remarks: task.remarks || '',
        originalAudioUrl: task.audio_url || (isAudioUrl(task.task_description) ? task.task_description : null),
      });
    } else {
      setEditFormData({
        id: task.id,
        department: task.department || '',
        given_by: task.given_by || '',
        name: task.name || '',
        task_description: task.task_description || '',
        audio_url: task.audio_url || null, // Added audio_url
        task_start_date: task.task_start_date || '',
        frequency: task.frequency || '',
        duration: task.duration || '',
        enable_reminder: task.enable_reminder || '',
        require_attachment: task.require_attachment || '',
        remark: task.remark || '',
        originalAudioUrl: task.audio_url || (isAudioUrl(task.task_description) ? task.task_description : null),
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

          finalEditData.audio_url = publicUrlData.publicUrl; // Store in audio_url column

          // If legacy audio was in description, clear it to separate
          if (isAudioUrl(finalEditData.task_description)) {
            finalEditData.task_description = '';
          }

          if (editFormData.originalAudioUrl) {
            audioToCleanup = editFormData.originalAudioUrl;
          }
        } catch (error) {
          console.error("Audio upload failed:", error);
          alert("Failed to upload voice note. Saving without it.");
        } finally {
          setIsUploading(false);
        }
      } else if (editFormData.originalAudioUrl && editFormData.audio_url === null && !isAudioUrl(editFormData.task_description)) {
        audioToCleanup = editFormData.originalAudioUrl;
      }

      if (activeTab === 'maintenance') {
        const originalTask = maintenance.find(task => task.id === editFormData.id);
        await dispatch(updateMaintenanceTask({
          updatedTask: finalEditData,
          originalTask: originalTask ? {
            machine_name: originalTask.machine_name,
            part_name: originalTask.part_name,
            part_area: originalTask.part_area,
            task_description: originalTask.task_description,
            name: originalTask.name
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

      showToast("Task updated successfully!", "success");

      // Refresh the data
      if (activeTab === 'checklist') {
        dispatch(uniqueChecklistTaskData({ page: 0, pageSize: 50, dateFilter, nameFilter: searchTerm }));
      } else if (activeTab === 'maintenance') {
        dispatch(maintenanceData({ page: 1, frequency: freqFilter, searchTerm: searchTerm }));
      } else if (activeTab === 'delegation') {
        dispatch(uniqueDelegationTaskData({ page: 0, pageSize: 50, dateFilter, nameFilter: searchTerm }));
      }

    } catch (error) {
      console.error("Failed to update task:", error);
      showToast("Failed to update task", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = async (field, value) => {
    setEditFormData(prev => {
      const newData = { ...prev, [field]: value };
      // If machine_name changes, clear part_name
      if (field === 'machine_name') {
        newData.part_name = '';
      }
      return newData;
    });

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
      showToast(`${selectedTasks.length} task(s) deleted successfully!`, "success");
      setSelectedTasks([]);
    } catch (error) {
      console.error("Failed to delete tasks:", error);
      showToast("Failed to delete tasks", "error");
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

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const filteredDelegationTasks = useMemo(() => {
    const seen = new Set();
    // Apply client-side search filter across description AND name
    const searched = delegationTasks.filter(task => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (task.task_description || '').toLowerCase().includes(term) ||
        (task.name || '').toLowerCase().includes(term)
      );
    });
    // Deduplicate strictly by task_description + name (API already deduped, this is a safety net)
    return searched.filter(task => {
      const key = `${(task.department || '').trim()}::${(task.task_description || '').trim()}::${(task.name || '').trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [delegationTasks, searchTerm]);

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


  const filteredChecklistTasks = useMemo(() => {
    const seen = new Set();
    // Apply client-side search filter across description AND name
    const searched = quickTask.filter(task => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (task.task_description || '').toLowerCase().includes(term) ||
        (task.name || '').toLowerCase().includes(term)
      );
    });
    // Deduplicate strictly by task_description + name (API already deduped, this is a safety net)
    const unique = searched.filter(task => {
      const key = `${(task.department || '').trim()}::${(task.task_description || '').trim()}::${(task.name || '').trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by sortConfig or default to task_start_date ascending
    return [...unique].sort((a, b) => {
      if (sortConfig.key) {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }
      const dateA = new Date(a.task_start_date || 0);
      const dateB = new Date(b.task_start_date || 0);
      return dateA - dateB;
    });
  }, [quickTask, sortConfig, searchTerm]);

  const filteredMaintenance = useMemo(() => {
    // Search filter
    const searched = maintenance.filter(task =>
      !searchTerm ||
      task.task_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Deduplicate by task_description + name
    const seen = new Set();
    const unique = searched.filter(task => {
      const key = `${(task.machine_name || '').trim()}::${(task.part_name || '').trim()}::${(task.part_area || '').trim()}::${(task.task_description || '').trim()}::${(task.name || '').trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by task_start_date ascending
    return [...unique].sort((a, b) => {
      const dateA = new Date(a.task_start_date || 0);
      const dateB = new Date(b.task_start_date || 0);
      return dateA - dateB;
    });
  }, [maintenance, searchTerm]);



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
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-purple-700">
                  {CONFIG.PAGE_CONFIG.title}
                </h1>
                <p className="text-purple-600 text-[11px] font-bold uppercase tracking-wider opacity-80">
                  {activeTab === 'checklist'
                    ? `Showing ${quickTask.length} checklist tasks`
                    : activeTab === 'maintenance'
                      ? `Showing ${filteredMaintenance.length} maintenance tasks`
                      : `Showing delegation tasks`}
                </p>
              </div>

              {selectedTasks.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-4 py-1.5 bg-red-600 text-white text-xs font-black rounded-full hover:bg-red-700 transition-all shadow-md animate-in fade-in zoom-in duration-300 transform active:scale-95 flex-shrink-0"
                >
                  <Trash2 size={14} className="stroke-[3]" />
                  {isDeleting ? 'Deleting...' : `Delete (${selectedTasks.length})`}
                </button>
              )}
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner w-full sm:w-auto overflow-x-auto no-scrollbar">
              {[
                { id: 'checklist', label: 'Checklist' },
                { id: 'delegation', label: 'Delegation' },
                { id: 'maintenance', label: 'Maintenance' }
              ].map(tab => (
                <button
                  key={tab.id}
                  className={`flex-1 sm:flex-none px-6 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab.id
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-purple-600 hover:bg-white/50'
                    }`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedTasks([]);
                    setEditingTaskId(null);
                    setEditFormData({});
                    if (tab.id === 'checklist') {
                      dispatch(resetChecklistPagination());
                      dispatch(uniqueChecklistTaskData({ page: 0, pageSize: 50, dateFilter }));
                    } else if (tab.id === 'delegation') {
                      dispatch(resetDelegationPagination());
                      dispatch(uniqueDelegationTaskData({ page: 0, pageSize: 50, dateFilter }));
                    } else {
                      dispatch(maintenanceData({ page: 1, frequency: freqFilter, searchTerm: searchTerm }));
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center mt-2">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by task or name..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 p-4 rounded-md text-red-800 text-center">
          {error} <button onClick={() => dispatch(uniqueChecklistTaskData())} className="underline ml-2 hover:text-red-600">Try again</button>
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
                {/* Desktop View */}
                <table className="hidden md:table min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={filteredChecklistTasks.length > 0 && filteredChecklistTasks.every(t => selectedTasks.find(s => s.id === t.id))}
                          onChange={handleSelectAll}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                      </th>
                      {[
                        { key: 'actions', label: 'Actions' },
                        { key: 'id', label: 'Task ID' },
                        { key: 'task_description', label: 'Task Description', minWidth: 'min-w-[300px]' },
                        { key: 'department', label: 'Department' },
                        { key: 'given_by', label: 'Assign From' },
                        { key: 'name', label: 'Name' },
                        { key: 'task_start_date', label: 'Working Day', bg: 'bg-yellow-50' },
                        { key: 'frequency', label: 'Frequency' },
                        { key: 'duration', label: 'Duration' },
                        { key: 'enable_reminder', label: 'Reminders' },
                        { key: 'require_attachment', label: 'Attachment' },
                        { key: 'remarks', label: 'Remarks' },
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
                              checked={!!selectedTasks.find(t => t.id === task.id)}
                              onChange={() => handleCheckboxChange(task)}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
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
                              <div className="whitespace-normal break-words">
                                <RenderDescription text={task.task_description} audioUrl={task.audio_url} instructionUrl={task.instruction_attachment_url} instructionType={task.instruction_attachment_type} />
                              </div>
                            )}
                          </td>

                          {/* Department */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.department || ''}
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
                                value={editFormData.given_by || ''}
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
                                value={editFormData.name || ''}
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
                                value={editFormData.frequency || ''}
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

                          {/* Duration */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-blue-50">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.duration || ''}
                                onChange={(e) => handleInputChange('duration', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="e.g. 15 mins"
                              />
                            ) : (
                              task.duration ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  ⏱ {task.duration}
                                </span>
                              ) : "—"
                            )}
                          </td>

                          {/* Enable Reminders */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.enable_reminder || ''}
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
                                value={editFormData.require_attachment || ''}
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

                          {/* Remarks */}
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.remark || ''}
                                onChange={(e) => handleInputChange('remark', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            ) : (
                              task.remark || "—"
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

                {/* Mobile View - Checklist Cards */}
                <div className="md:hidden divide-y divide-gray-100">
                  {filteredChecklistTasks.length > 0 ? (
                    filteredChecklistTasks.map((task, index) => (
                      <div key={index} className={`p-4 bg-white space-y-3 ${selectedTasks.find(t => t.id === task.id) ? 'bg-purple-50/50' : ''}`}>
                        <div className="flex justify-between items-start gap-3">
                          <input
                            type="checkbox"
                            checked={!!selectedTasks.find(t => t.id === task.id)}
                            onChange={() => handleCheckboxChange(task)}
                            className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="flex-grow min-w-0">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black text-purple-500 uppercase tracking-wider">#{task.id}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${task.frequency?.toLowerCase() === 'daily' ? 'bg-blue-100 text-blue-800' :
                                task.frequency?.toLowerCase() === 'weekly' ? 'bg-green-100 text-green-800' :
                                  'bg-purple-100 text-purple-800'
                                }`}>
                                {task.frequency || 'Manual'}
                              </span>
                            </div>
                            {editingTaskId === task.id ? (
                              <div className="space-y-4 py-2">
                                {/* Mobile Edit Form */}
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-gray-400 uppercase">Description</label>
                                  <textarea
                                    value={editFormData.task_description || ''}
                                    onChange={(e) => handleInputChange('task_description', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"
                                    rows="3"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Department</label>
                                    <select
                                      value={editFormData.department || ''}
                                      onChange={(e) => handleInputChange('department', e.target.value)}
                                      className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                                    >
                                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Assign From</label>
                                    <select
                                      value={editFormData.given_by || ''}
                                      onChange={(e) => handleInputChange('given_by', e.target.value)}
                                      className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                                    >
                                      {givenByList.map(g => <option key={g} value={g}>{g}</option>)}
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
                                <div className="text-sm font-bold text-gray-800 leading-tight mb-2">
                                  <RenderDescription text={task.task_description} instructionUrl={task.instruction_attachment_url} instructionType={task.instruction_attachment_type} />
                                  {task.audio_url && (
                                    <div className="mt-2">
                                      <AudioPlayer url={task.audio_url} />
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-gray-500">
                                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>{task.department}</span>
                                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>{task.name}</span>
                                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>{formatTimestampToDDMMYYYY(task.task_start_date)}</span>
                                  {task.duration && (
                                    <span className="flex items-center gap-1.5 text-blue-600">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                      ⏱ {task.duration}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {!editingTaskId && (
                            <button
                              onClick={() => handleEditClick(task)}
                              className="p-2 bg-blue-50 text-blue-600 rounded-xl transition-all active:scale-95"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-sm font-bold">No checklist tasks found</div>
                  )}
                </div>

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
                {/* Desktop view */}
                <table className="hidden md:table min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={filteredMaintenance.length > 0 && filteredMaintenance.every(t => selectedTasks.find(s => s.id === t.id))}
                          onChange={handleSelectAll}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                      </th>
                      {[
                        { label: 'Actions' },
                        { label: 'Task ID' },
                        { label: 'Task Description', minWidth: 'min-w-[200px]' },
                        { label: 'Machine Name' },
                        { label: 'Part Name' },
                        { label: 'Part Area' },
                        { label: 'Assign From' },
                        { label: 'Name' },
                        { label: 'Working Day', bg: 'bg-yellow-50' },
                        { label: 'Frequency' },
                        { label: 'Duration' },
                        { label: 'Status' },
                        { label: 'Remarks' },
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.id}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 min-w-[200px] max-w-[400px]">
                            {editingTaskId === task.id ? (
                              <ReactMediaRecorder
                                audio
                                onStop={(blobUrl, blob) => setRecordedAudio({ blobUrl, blob })}
                                render={({ status, startRecording, stopRecording, clearBlobUrl }) => (
                                  <div className="space-y-2">
                                    {status !== 'recording' && !recordedAudio && (
                                      <div className="relative">
                                        {editFormData.audio_url ? (
                                          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                                            <div className="flex items-center justify-between mb-2">
                                              <AudioPlayer url={editFormData.audio_url} />
                                              <button
                                                type="button"
                                                onClick={() => handleInputChange('audio_url', null)}
                                                className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                                              >
                                                <Trash2 size={10} /> Remove
                                              </button>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={startRecording}
                                              className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition-all"
                                            >
                                              <Mic size={12} /> Replace with Recording
                                            </button>
                                          </div>
                                        ) : isAudioUrl(editFormData.task_description) ? (
                                          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                                            <div className="flex items-center justify-between mb-2">
                                              <AudioPlayer url={editFormData.task_description} />
                                              <button
                                                type="button"
                                                onClick={() => handleInputChange('task_description', '')}
                                                className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                                              >
                                                <Trash2 size={10} /> Remove
                                              </button>
                                            </div>
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
                                              value={editFormData.task_description || ''}
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
                                        <AudioPlayer url={recordedAudio.blobUrl} />
                                      </div>
                                    )}
                                  </div>
                                )}
                              />
                            ) : (
                              <>
                                <RenderDescription
                                  text={task.task_description || task.work_description}
                                  audioUrl={task.audio_url}
                                  instructionUrl={task.instruction_attachment_url}
                                  instructionType={task.instruction_attachment_type}
                                />
                              </>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.machine_name || ''}
                                onChange={(e) => handleInputChange('machine_name', e.target.value)}
                                className="w-full px-2 py-1 border border-purple-200 rounded text-[11px] font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                              >
                                <option value="">Select Machine</option>
                                {machineOptions.map((opt, idx) => (
                                  <option key={`m-${idx}`} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              task.machine_name
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.part_name || ''}
                                onChange={(e) => handleInputChange('part_name', e.target.value)}
                                className="w-full px-2 py-1 border border-purple-200 rounded text-[11px] font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                              >
                                <option value="">Select Part</option>
                                {partOptions.map((opt, idx) => (
                                  <option key={`p-${idx}`} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              task.part_name
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.part_area || ''}
                                onChange={(e) => handleInputChange('part_area', e.target.value)}
                                className="w-full px-2 py-1 border border-purple-200 rounded text-[11px] font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                              >
                                <option value="">Select Area</option>
                                {areaOptions.map((opt, idx) => (
                                  <option key={`a-${idx}`} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              task.part_area
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <select
                                value={editFormData.given_by || ''}
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
                                value={editFormData.name || ''}
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
                                value={editFormData.freq || ''}
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

                          {/* Duration */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-blue-50">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.duration || ''}
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
                            <span className={`px-2 py-1 rounded-full text-xs ${task.status === 'Done' ? 'bg-green-100 text-green-800' :
                              task.status === 'Issue' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                              {task.status || 'Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editFormData.remarks || ''}
                                onChange={(e) => handleInputChange('remarks', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            ) : (
                              task.remarks || '—'
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

                {/* Mobile View - Maintenance Cards */}
                <div className="md:hidden divide-y divide-gray-100">
                  {filteredMaintenance.length > 0 ? (
                    filteredMaintenance.map((task, index) => (
                      <div key={index} className={`p-5 bg-white space-y-4 ${selectedTasks.find(t => t.id === task.id) ? "bg-purple-50/50" : ""}`}>
                        <div className="flex justify-between items-start gap-4">
                          <input
                            type="checkbox"
                            checked={!!selectedTasks.find(t => t.id === task.id)}
                            onChange={() => handleCheckboxChange(task)}
                            className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="flex-grow min-w-0">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black text-purple-500 uppercase tracking-wider">#{task.id}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${task.status === 'Done' ? 'bg-green-100 text-green-800' :
                                task.status === 'Issue' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                {task.status || 'Pending'}
                              </span>
                            </div>

                            {editingTaskId === task.id ? (
                              <div className="space-y-4 py-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-gray-400 uppercase">Description</label>
                                  <textarea
                                    value={editFormData.task_description || ''}
                                    onChange={(e) => handleInputChange('task_description', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"
                                    rows="3"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Machine</label>
                                    <select
                                      value={editFormData.machine_name || ''}
                                      onChange={(e) => handleInputChange('machine_name', e.target.value)}
                                      className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                                    >
                                      {machineOptions.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Part</label>
                                    <select
                                      value={editFormData.part_name || ''}
                                      onChange={(e) => handleInputChange('part_name', e.target.value)}
                                      className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                                    >
                                      {partOptions.map(p => <option key={p} value={p}>{p}</option>)}
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
                                <div className="text-sm font-bold text-gray-800 leading-tight mb-3">
                                  <RenderDescription
                                    text={task.task_description || task.work_description}
                                    audioUrl={task.audio_url}
                                    instructionUrl={task.instruction_attachment_url}
                                    instructionType={task.instruction_attachment_type}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Resource</span>
                                    <div className="text-xs font-bold text-gray-700">{task.machine_name || '—'}</div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Component</span>
                                    <div className="text-xs font-bold text-gray-700">{task.part_name || '—'}</div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Assignee</span>
                                    <div className="text-xs font-bold text-gray-700">{task.name || '—'}</div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Schedule</span>
                                    <div className="text-xs font-bold text-gray-700">{formatTimestampToDDMMYYYY(task.task_start_date)}</div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                          {!editingTaskId && (
                            <button onClick={() => handleEditClick(task)} className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                              <Edit size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-sm font-bold">No maintenance tasks found</div>
                  )}
                </div>
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
