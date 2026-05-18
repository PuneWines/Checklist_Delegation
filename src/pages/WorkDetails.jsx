"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { 
  Search, 
  Calendar, 
  Clock, 
  Save, 
  CheckCircle2, 
  ChevronDown,
  LayoutGrid,
  Check,
  Loader2,
  AlertCircle,
  Upload
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import supabase from "../SupabaseClient";
import AdminLayout from "../components/layout/AdminLayout";
import { fetchWorkRecords, saveAssignments } from "../redux/slice/workRecordsSlice";
import { userDetails } from "../redux/slice/settingSlice";
import { useMagicToast } from "../context/MagicToastContext";
import { generateWorkTasksApi, resetWorkTasksApi } from "../redux/api/workRecordsApi";
import { sendTaskAssignmentNotification } from "../services/whatsappService";

export default function WorkDetails() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useMagicToast();
  
  const { tasks: masterTasks, assignments, loading, saving, error } = useSelector(state => state.workRecords);
  const { userData } = useSelector(state => state.setting);
  
  // Use same role logic as AdminLayout
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const username = (localStorage.getItem("user-name") || "").toLowerCase();
  const isSuperAdmin = username === "admin";
  const isAdmin = isSuperAdmin || role === "admin";
  const isHOD = role === "hod" || role === "manager";

  // Filter & UI States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShop, setSelectedShop] = useState("All");
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [searchDropdown, setSearchDropdown] = useState({ type: null, id: null, term: "" });

  // Local state for modified fields (spreadsheet-style editing)
  const [modifiedRows, setModifiedRows] = useState({});

  // Real-time Timer: Update every minute to trigger auto-reset
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // 1 minute
    return () => clearInterval(timer);
  }, []);

  // Initial Data Fetch
  useEffect(() => {
    dispatch(fetchWorkRecords());
    dispatch(userDetails());
  }, [dispatch]);

  // Derived Shops List
  const shops = useMemo(() => {
    const s = new Set(masterTasks.map(t => t.shop?.shop_name).filter(Boolean));
    return ["All", ...Array.from(s)];
  }, [masterTasks]);
  
  // Background Cleanup: Archive & Delete expired assignments from DB
  useEffect(() => {
    if (assignments.length > 0) {
      const expiredAssignments = assignments.filter(a => {
        if (!a.end_datetime) return false;
        const endTime = new Date(a.end_datetime);
        return endTime < currentTime;
      });

      if (expiredAssignments.length > 0) {
        console.log("🕒 Detected expired tasks for archiving:", expiredAssignments.length);
        const archiveAndCleanup = async () => {
          try {
            // 1. Prepare history records
            const historyRecords = expiredAssignments.map(a => ({
              task_id: a.task_id,
              start_datetime: a.start_datetime,
              end_datetime: a.end_datetime,
              manager_name: a.manager_name,
              employee_name: a.employee_name,
              completed_at: new Date().toISOString()
            }));

            // 2. Insert into history
            const { error: histError } = await supabase
              .from('task_assignment_history')
              .insert(historyRecords);

            if (histError) {
              console.error("❌ History Archive Error:", histError);
              throw histError;
            }

            // 3. Delete from active assignments
            const { error: delError } = await supabase
              .from('task_assignments')
              .delete()
              .in('id', expiredAssignments.map(a => a.id));
            
            if (delError) {
              console.error("❌ Cleanup Delete Error:", delError);
            } else {
              console.log(`✅ Archived and cleaned up ${expiredAssignments.length} expired assignments.`);
              // Re-fetch to update the UI after DB changes
              dispatch(fetchWorkRecords());
            }
          } catch (err) {
            console.error("Failed to archive/cleanup expired assignments:", err);
          }
        };
        archiveAndCleanup();
      }
    }
  }, [assignments, currentTime, dispatch]);

  // Merge Master Tasks and Current Assignments
  const mergedData = useMemo(() => {
    return masterTasks.map(task => {
      let assignment = assignments.find(a => a.task_id === task.id);
      
      // Auto-Reset Logic: If end_datetime has passed, treat as unassigned
      if (assignment && assignment.end_datetime && new Date(assignment.end_datetime) < currentTime) {
        assignment = null;
      }

      const modified = modifiedRows[task.id] || {};
      
      return {
        ...task,
        ...(assignment || {}),
        ...modified, // local overrides
        taskId: task.id, // reference to master task
        shopName: task.shop?.shop_name || "N/A",
        assignmentId: assignment?.id || null // explicitly track if it's currently assigned
      };
    });
  }, [masterTasks, assignments, modifiedRows]);

  // Filtering
  const filteredTasks = useMemo(() => {
    return mergedData.filter(item => {
      const matchesShop = selectedShop === "All" || item.shopName === selectedShop;
      const matchesSearch = item.task_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.manager_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.employee_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesShop && matchesSearch;
    });
  }, [mergedData, selectedShop, searchTerm]);

  // Handlers
  const handleSelectRow = (id) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
      // If unchecked, clear its local modifications so it doesn't trigger validation on Save All
      setModifiedRows(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(new Set(filteredTasks.map(t => t.taskId)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleFieldChange = (taskId, field, value) => {
    setModifiedRows(prev => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [field]: value
      }
    }));
  };

  const applyBulkDates = () => {
    if (!bulkStartDate && !bulkEndDate) {
      showToast("Please select bulk dates first", "error");
      return;
    }
    
    if (selectedRows.size === 0) {
      showToast("No rows selected", "error");
      return;
    }

    const updates = {};
    selectedRows.forEach(id => {
      updates[id] = {
        ...(modifiedRows[id] || {}),
        ...(bulkStartDate && { start_datetime: bulkStartDate }),
        ...(bulkEndDate && { end_datetime: bulkEndDate })
      };
    });
    
    setModifiedRows(prev => ({ ...prev, ...updates }));
    showToast(`Applied dates to ${selectedRows.size} tasks`, "success");
  };

  const validateAssignment = (data) => {
    if (!data.start_datetime || !data.end_datetime) return "Start and End dates are required";
    if (new Date(data.start_datetime) >= new Date(data.end_datetime)) return "Start date must be before End date";
    if (!data.manager_name || !data.employee_name) return "Manager and Employee names are required";
    return null;
  };

  const handleSaveChanges = async () => {
    // Collect IDs from both modified rows AND selected rows
    const selectedIds = Array.from(selectedRows);
    const modifiedIds = Object.keys(modifiedRows).map(id => parseInt(id));
    const allIdsToProcess = Array.from(new Set([...selectedIds, ...modifiedIds]));

    if (allIdsToProcess.length === 0) {
      showToast("Please select tasks or make changes to save", "info");
      return;
    }

    const assignmentsToUpsert = [];
    const assignmentsToDelete = [];
    const errors = [];

    allIdsToProcess.forEach(id => {
      const task = mergedData.find(t => t.taskId === id);
      if (!task) return;

      // Check if ALL details are completely cleared/empty
      const isCompletelyEmpty = 
        !task.start_datetime && 
        !task.end_datetime && 
        !task.manager_name && 
        !task.employee_name;

      if (isCompletelyEmpty) {
        if (task.assignmentId) {
          assignmentsToDelete.push(task.assignmentId);
        }
        return; // Safe path, no validation error, no upsert
      }

      const error = validateAssignment(task);
      if (error) {
        // Only show error for modified rows or explicitly selected rows that have SOME data
        if (modifiedRows[id] || (task.manager_name || task.employee_name || task.start_datetime || task.end_datetime)) {
          errors.push(`Task "${task.task_name}": ${error}`);
        }
      } else {
        assignmentsToUpsert.push({
          task_id: task.taskId,
          start_datetime: task.start_datetime,
          end_datetime: task.end_datetime,
          manager_name: task.manager_name,
          employee_name: task.employee_name,
          status: 'LOCKED', // Both Admin and HOD now lock the task on save
          updated_at: new Date().toISOString()
        });
      }
    });

    if (errors.length > 0) {
      showToast(errors[0], "error");
      return;
    }

    try {
      // 1. Delete cleared assignments from task_assignments table
      if (assignmentsToDelete.length > 0) {
        const { error: delError } = await supabase
          .from('task_assignments')
          .delete()
          .in('id', assignmentsToDelete);
        
        if (delError) throw delError;
      }

      // 2. Upsert updated assignments
      if (assignmentsToUpsert.length > 0) {
        await dispatch(saveAssignments(assignmentsToUpsert)).unwrap();
      }

      setModifiedRows({});
      setSelectedRows(new Set());
      showToast("Work records saved successfully", "success");
      dispatch(fetchWorkRecords()); // Refresh records to ensure local state sync
    } catch (err) {
      showToast(err?.message || err || "Failed to save records", "error");
    }
  };

  const handleBulkGenerate = async () => {
    const selectedAssignments = mergedData.filter(item => 
      selectedRows.has(item.taskId) && item.status === 'LOCKED' && item.assignmentId
    );
    
    if (selectedAssignments.length === 0) {
      showToast("No locked assignments selected for generation", "error");
      return;
    }

    try {
      await generateWorkTasksApi(selectedAssignments);
      showToast(`Generated tasks for ${selectedAssignments.length} assignments`, "success");
      
      // WhatsApp notification trigger based on start_datetime compared to current time
      const now = new Date();
      selectedAssignments.forEach(asgn => {
        if (asgn.start_datetime) {
          const startTime = new Date(asgn.start_datetime);
          if (startTime <= now) {
            const employeeNames = asgn.employee_name
              ? asgn.employee_name.split(',').map(e => e.trim()).filter(Boolean)
              : [];
              
            employeeNames.forEach(empName => {
              const taskDetails = {
                taskType: 'work',
                doerName: empName,
                taskId: asgn.task_id,
                description: asgn.task_name,
                start_datetime: asgn.start_datetime,
                end_datetime: asgn.end_datetime,
                givenBy: localStorage.getItem("user-name") || 'Admin',
                shop_name: asgn.shopName,
                department: asgn.department,
                duration: asgn.estimated_minutes
              };
              sendTaskAssignmentNotification(taskDetails).catch(err => {
                console.error("❌ Error sending work task WhatsApp alert:", err);
              });
            });
          }
        }
      });

      dispatch(fetchWorkRecords());
      setSelectedRows(new Set());
    } catch (err) {
      showToast("Generation failed", "error");
    }
  };

  const handleBulkReset = async () => {
    const selectedAsgnIds = mergedData
      .filter(item => selectedRows.has(item.taskId) && (item.status === 'LOCKED' || item.status === 'GENERATED') && item.assignmentId)
      .map(item => item.assignmentId);
    
    if (selectedAsgnIds.length === 0) {
      showToast("No locked or generated tasks selected to unlock", "error");
      return;
    }

    if (!window.confirm("Are you sure you want to unlock selected tasks? All generated work checklist tasks will be deleted, and HOD will be able to edit them again.")) return;

    try {
      await resetWorkTasksApi(selectedAsgnIds);
      showToast("Tasks unlocked successfully", "success");
      dispatch(fetchWorkRecords());
      setSelectedRows(new Set());
    } catch (err) {
      showToast("Unlock failed", "error");
    }
  };

  const selectUser = (taskId, field, user) => {
    handleFieldChange(taskId, field, user.user_name);
    setSearchDropdown({ type: null, id: null, term: "" });
  };

  const toggleEmployee = (taskId, empName, currentEmployeeNameStr) => {
    const currentEmps = currentEmployeeNameStr ? currentEmployeeNameStr.split(',').map(e => e.trim()).filter(Boolean) : [];
    let nextEmps;
    if (currentEmps.includes(empName)) {
      nextEmps = currentEmps.filter(e => e !== empName);
    } else {
      nextEmps = [...currentEmps, empName];
    }
    handleFieldChange(taskId, "employee_name", nextEmps.join(', '));
    setSearchDropdown(prev => ({ ...prev, term: "" }));
  };

  if (loading && masterTasks.length === 0) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Loading work definitions...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 mt-2 animate-in fade-in duration-500 pb-20 md:pb-4">
        {/* Header Section */}
        <div className="bg-white border-b border-purple-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative overflow-hidden rounded-t-xl">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-600 to-purple-600" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-100">
              <LayoutGrid className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-blue-700 to-purple-700 bg-clip-text text-transparent tracking-tight">
                Master Work Records
              </h1>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -mt-1">
                Operational Checklist Dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="relative group w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={16} />
              <input 
                type="text"
                placeholder="Search tasks, managers..."
                className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none w-full md:w-64 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 flex items-center justify-center gap-2 shrink-0">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">
                {filteredTasks.length} / {masterTasks.length} Records
              </span>
            </div>
          </div>
        </div>

        {/* Filters & Bulk Actions Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-3 bg-white p-4 shadow-sm items-end border-x border-gray-100">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
              <LayoutGrid size={10} className="text-blue-500" /> Filter Shop
            </label>
            <div className="relative group">
              <select 
                className="w-full pl-2.5 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none appearance-none transition-all group-hover:bg-blue-50/50"
                value={selectedShop}
                onChange={(e) => setSelectedShop(e.target.value)}
              >
                {shops.map(shop => <option key={shop} value={shop}>{shop}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none group-hover:text-blue-600" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
              <Calendar size={10} className="text-emerald-500" /> Bulk Start Date
            </label>
            <input 
              type="datetime-local" 
              className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-blue-600 outline-none hover:bg-emerald-50/30 transition-all"
              value={bulkStartDate}
              onChange={(e) => setBulkStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
              <Calendar size={10} className="text-orange-500" /> Bulk End Date
            </label>
            <input 
              type="datetime-local" 
              className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-blue-600 outline-none hover:bg-orange-50/30 transition-all"
              value={bulkEndDate}
              onChange={(e) => setBulkEndDate(e.target.value)}
            />
          </div>

          <button 
            onClick={applyBulkDates}
            disabled={selectedRows.size === 0}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:grayscale text-white font-black py-2 px-4 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-emerald-200 active:scale-95"
          >
            <CheckCircle2 size={14} /> Apply Bulk
          </button>

          <button 
            onClick={handleSaveChanges}
            disabled={saving || Object.keys(modifiedRows).length === 0}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black py-2 px-4 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-blue-200 active:scale-95"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save All"}
          </button>

          {isAdmin && (
            <>
              <button 
                onClick={handleBulkGenerate}
                disabled={selectedRows.size === 0}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-2 px-4 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-indigo-200 active:scale-95"
              >
                <CheckCircle2 size={14} /> Generate Tasks
              </button>
              <button 
                onClick={handleBulkReset}
                disabled={selectedRows.size === 0}
                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-2 px-4 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-red-200 active:scale-95"
              >
                <Clock size={14} /> Unlock Tasks
              </button>
            </>
          )}

          {isAdmin && (
            <button 
              onClick={() => navigate('/dashboard/work-records/bulk-import')}
              className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-black py-2 px-4 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-purple-200 active:scale-95"
            >
              <Upload size={14} /> Bulk Import
            </button>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="mx-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 animate-bounce">
            <AlertCircle size={20} />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        {/* Table Section */}
        {/* Desktop View Table */}
        <div className="hidden md:block overflow-x-auto bg-white rounded-b-xl shadow-2xl border border-gray-100">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50/80 text-gray-400 uppercase text-[9px] font-black tracking-[0.15em] border-b border-gray-100">
                <th className="px-4 py-4 w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded-md border-gray-200 text-[#006699] focus:ring-offset-0 focus:ring-0 transition-all cursor-pointer"
                    onChange={handleSelectAll}
                    checked={selectedRows.size === filteredTasks.length && filteredTasks.length > 0}
                  />
                </th>
                <th className="px-2 py-4">Shop</th>
                <th className="px-2 py-4 w-[22%]">Task Description</th>
                <th className="px-2 py-4">Dept</th>
                <th className="px-2 py-4 text-center">Mins</th>
                <th className="px-2 py-4">Start DateTime</th>
                <th className="px-2 py-4">End DateTime</th>
                <th className="px-2 py-4">Manager</th>
                <th className="px-2 py-4">Employee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTasks.map((item, index) => {
                const isModified = !!modifiedRows[item.taskId];
                const isActive = item.status === 'ACTIVE' && !isModified;
                
                return (
                  <tr key={item.taskId} className={`hover:bg-blue-50/40 transition-all group ${isModified ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="checkbox" 
                        className={`w-4 h-4 rounded-md border-gray-200 text-[#006699] focus:ring-offset-0 focus:ring-0 transition-all ${((item.status === 'LOCKED' || item.status === 'GENERATED') && !isAdmin) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                        checked={selectedRows.has(item.taskId)}
                        onChange={() => handleSelectRow(item.taskId)}
                        disabled={(item.status === 'LOCKED' || item.status === 'GENERATED') && !isAdmin}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded text-[9px] font-black border border-sky-100 uppercase tracking-tighter w-fit">
                          {item.shopName}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-gray-700 leading-tight">
                          {item.task_name}
                        </span>
                        {isActive && (
                          <span className={`text-[8px] font-black uppercase tracking-widest mt-0.5 flex items-center gap-1 ${
                            item.status === 'LOCKED' ? 'text-amber-600' : 
                            item.status === 'GENERATED' ? 'text-indigo-600' : 'text-emerald-600'
                          }`}>
                            <div className={`w-1 h-1 rounded-full ${
                              item.status === 'LOCKED' ? 'bg-amber-500' : 
                              item.status === 'GENERATED' ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500 animate-ping'
                            }`} /> 
                            {item.status || 'Assigned'}
                          </span>
                        )}
                        {isModified && (
                          <span className="text-[8px] text-amber-600 font-black uppercase tracking-widest mt-0.5 flex items-center gap-1">
                            <div className="w-1 h-1 bg-amber-500 rounded-full" /> Pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black border border-emerald-100 uppercase tracking-tight">
                        {item.department || "N/A"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="inline-flex items-center gap-1 text-orange-500 font-bold text-[10px]">
                        <Clock size={10} />
                        {item.estimated_minutes || "--"}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <input 
                        type="datetime-local" 
                        className={`w-full px-1.5 py-1.5 border rounded text-[10px] font-bold outline-none transition-all ${
                          isModified && modifiedRows[item.taskId].start_datetime 
                          ? 'border-amber-300 bg-amber-50/50' 
                          : item.status === 'LOCKED' || item.status === 'GENERATED'
                            ? 'border-gray-100 bg-gray-100/50 text-gray-400 cursor-not-allowed'
                            : 'border-gray-100 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                        }`}
                        value={item.start_datetime ? item.start_datetime.substring(0, 16) : ""}
                        onChange={(e) => handleFieldChange(item.taskId, "start_datetime", e.target.value)}
                        disabled={item.status === 'LOCKED' || item.status === 'GENERATED'}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <input 
                        type="datetime-local" 
                        className={`w-full px-1.5 py-1.5 border rounded text-[10px] font-bold outline-none transition-all ${
                          isModified && modifiedRows[item.taskId].end_datetime 
                          ? 'border-amber-300 bg-amber-50/50' 
                          : item.status === 'LOCKED' || item.status === 'GENERATED'
                            ? 'border-gray-100 bg-gray-100/50 text-gray-400 cursor-not-allowed'
                            : 'border-gray-100 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                        }`}
                        value={item.end_datetime ? item.end_datetime.substring(0, 16) : ""}
                        onChange={(e) => handleFieldChange(item.taskId, "end_datetime", e.target.value)}
                        disabled={item.status === 'LOCKED' || item.status === 'GENERATED'}
                      />
                    </td>
                    <td className="px-2 py-3 relative">
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Manager.."
                          className={`w-full px-2 py-1.5 border rounded text-[10px] font-bold outline-none transition-all placeholder:text-gray-300 ${
                            isModified && modifiedRows[item.taskId].manager_name 
                            ? 'border-amber-300 bg-amber-50/50' 
                            : item.status === 'LOCKED' || item.status === 'GENERATED'
                              ? 'border-gray-100 bg-gray-100/50 text-gray-400 cursor-not-allowed'
                              : 'border-gray-100 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                          }`}
                          value={item.manager_name || ""}
                          onChange={(e) => {
                            handleFieldChange(item.taskId, "manager_name", e.target.value);
                            setSearchDropdown({ type: "manager", id: item.taskId, term: e.target.value });
                          }}
                          onFocus={() => setSearchDropdown({ type: "manager", id: item.taskId, term: item.manager_name || "" })}
                          disabled={item.status === 'LOCKED' || item.status === 'GENERATED'}
                        />
                        {searchDropdown.type === "manager" && searchDropdown.id === item.taskId && (
                          <div className={`absolute z-50 left-0 right-0 bg-white border border-gray-100 rounded-lg shadow-2xl max-h-40 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-300 ${
                            index >= filteredTasks.length - 3 ? "bottom-full mb-1" : "top-full mt-1"
                          }`}>
                            {userData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => (
                              <button 
                                key={user.id}
                                className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-blue-50 flex items-center justify-between transition-colors border-b border-gray-50 last:border-0"
                                onClick={() => selectUser(item.taskId, "manager_name", user)}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[8px]">
                                    {user.user_name?.charAt(0)}
                                  </div>
                                  {user.user_name}
                                </div>
                                {item.manager_name === user.user_name && <Check size={10} className="text-blue-600" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="relative">
                        {(item.status === 'LOCKED' || item.status === 'GENERATED') ? (
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {item.employee_name ? (
                              item.employee_name.split(',').map(emp => emp.trim()).filter(Boolean).map((emp, i) => (
                                <span key={i} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black border border-emerald-100 flex items-center gap-1 shadow-sm">
                                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                                  {emp}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-400 text-[10px] font-bold">No Employee Assigned</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 w-full min-w-[160px]">
                            {/* Selected Employees Tag List */}
                            {item.employee_name && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {item.employee_name.split(',').map(emp => emp.trim()).filter(Boolean).map((emp, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black border border-emerald-100 shadow-sm animate-in zoom-in-95 duration-150">
                                    {emp}
                                    <button 
                                      type="button"
                                      className="hover:bg-emerald-200/50 rounded-full w-3 h-3 flex items-center justify-center text-emerald-800 transition-colors font-black text-[9px] leading-none"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleEmployee(item.taskId, emp, item.employee_name);
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            {/* Search input to select employees */}
                            <input 
                              type="text" 
                              placeholder={item.employee_name ? "Add employee..." : "Employee.."}
                              className={`w-full px-2 py-1.5 border rounded text-[10px] font-bold outline-none transition-all placeholder:text-gray-300 ${
                                isModified && modifiedRows[item.taskId].employee_name 
                                ? 'border-amber-300 bg-amber-50/50' 
                                : 'border-gray-100 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                              }`}
                              value={(searchDropdown.type === "employee" && searchDropdown.id === item.taskId) ? searchDropdown.term : ""}
                              onChange={(e) => {
                                setSearchDropdown({ type: "employee", id: item.taskId, term: e.target.value });
                              }}
                              onFocus={() => setSearchDropdown({ type: "employee", id: item.taskId, term: "" })}
                            />
                            
                            {searchDropdown.type === "employee" && searchDropdown.id === item.taskId && (
                              <div className={`absolute z-50 left-0 right-0 bg-white border border-gray-100 rounded-lg shadow-2xl max-h-40 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-300 ${
                                index >= filteredTasks.length - 3 ? "bottom-full mb-1" : "top-full mt-1"
                              }`}>
                                {userData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => {
                                  const isSelected = item.employee_name?.split(',').map(e => e.trim()).filter(Boolean).includes(user.user_name);
                                  return (
                                    <button 
                                      key={user.id}
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-blue-50 flex items-center justify-between transition-colors border-b border-gray-50 last:border-0"
                                      onClick={() => toggleEmployee(item.taskId, user.user_name, item.employee_name)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[8px]">
                                          {user.user_name?.charAt(0)}
                                        </div>
                                        {user.user_name}
                                      </div>
                                      {isSelected && <Check size={10} className="text-blue-600" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTasks.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center gap-3">
              <LayoutGrid size={48} className="text-gray-200" />
              <p className="text-gray-400 font-bold tracking-widest uppercase text-xs">No matching work records found</p>
            </div>
          )}
        </div>

        {/* Mobile View Cards */}
        <div className="md:hidden space-y-4 p-4 bg-gray-50/30 rounded-b-xl border-x border-b border-gray-100">
          {filteredTasks.map((item, index) => {
            const isModified = !!modifiedRows[item.taskId];
            const isActive = item.status === 'ACTIVE' && !isModified;
            
            return (
              <div 
                key={item.taskId} 
                className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4 relative transition-all ${
                  isModified ? 'bg-amber-50/20 border-amber-200' : 'hover:border-blue-200'
                }`}
              >
                {/* Card Top Row: Checkbox, Shop, Dept, Status */}
                <div className="flex items-start justify-between gap-2 border-b border-gray-50 pb-3">
                  <div className="flex items-center gap-2.5">
                    <input 
                      type="checkbox" 
                      className={`w-5 h-5 rounded-md border-gray-300 text-[#006699] focus:ring-offset-0 focus:ring-0 transition-all ${
                        ((item.status === 'LOCKED' || item.status === 'GENERATED') && !isAdmin) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                      checked={selectedRows.has(item.taskId)}
                      onChange={() => handleSelectRow(item.taskId)}
                      disabled={(item.status === 'LOCKED' || item.status === 'GENERATED') && !isAdmin}
                    />
                    <div className="flex flex-col gap-1">
                      <span className="px-2 py-0.5 bg-sky-50 text-sky-600 rounded text-[9px] font-black border border-sky-100 uppercase tracking-tighter w-fit">
                        {item.shopName}
                      </span>
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black border border-emerald-100 uppercase tracking-tight w-fit">
                        {item.department || "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="inline-flex items-center gap-1 text-orange-500 font-bold text-[10px]">
                      <Clock size={10} />
                      <span>{item.estimated_minutes || "--"} Mins</span>
                    </div>
                    {isActive && (
                      <span className={`text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${
                        item.status === 'LOCKED' ? 'text-amber-600' : 
                        item.status === 'GENERATED' ? 'text-indigo-600' : 'text-emerald-600'
                      }`}>
                        <div className={`w-1 h-1 rounded-full ${
                          item.status === 'LOCKED' ? 'bg-amber-500' : 
                          item.status === 'GENERATED' ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500 animate-ping'
                        }`} /> 
                        {item.status || 'Assigned'}
                      </span>
                    )}
                    {isModified && (
                      <span className="text-[8px] text-amber-600 font-black uppercase tracking-widest flex items-center gap-1">
                        <div className="w-1 h-1 bg-amber-500 rounded-full" /> Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Task Description */}
                <div>
                  <h4 className="text-xs font-bold text-gray-800 leading-snug">
                    {item.task_name}
                  </h4>
                </div>

                {/* Edit Fields Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-gray-50">
                  {/* Start Date */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Start DateTime</label>
                    <input 
                      type="datetime-local" 
                      className={`w-full px-2 py-1.5 border rounded-lg text-[10px] font-bold outline-none transition-all ${
                        isModified && modifiedRows[item.taskId].start_datetime 
                        ? 'border-amber-300 bg-amber-50/50' 
                        : item.status === 'LOCKED' || item.status === 'GENERATED'
                          ? 'border-gray-100 bg-gray-100/50 text-gray-400 cursor-not-allowed'
                          : 'border-gray-200 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                      }`}
                      value={item.start_datetime ? item.start_datetime.substring(0, 16) : ""}
                      onChange={(e) => handleFieldChange(item.taskId, "start_datetime", e.target.value)}
                      disabled={item.status === 'LOCKED' || item.status === 'GENERATED'}
                    />
                  </div>

                  {/* End Date */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">End DateTime</label>
                    <input 
                      type="datetime-local" 
                      className={`w-full px-2 py-1.5 border rounded-lg text-[10px] font-bold outline-none transition-all ${
                        isModified && modifiedRows[item.taskId].end_datetime 
                        ? 'border-amber-300 bg-amber-50/50' 
                        : item.status === 'LOCKED' || item.status === 'GENERATED'
                          ? 'border-gray-100 bg-gray-100/50 text-gray-400 cursor-not-allowed'
                          : 'border-gray-200 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                      }`}
                      value={item.end_datetime ? item.end_datetime.substring(0, 16) : ""}
                      onChange={(e) => handleFieldChange(item.taskId, "end_datetime", e.target.value)}
                      disabled={item.status === 'LOCKED' || item.status === 'GENERATED'}
                    />
                  </div>

                  {/* Manager Input */}
                  <div className="space-y-1 relative">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Manager</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Assign Manager.."
                        className={`w-full px-2.5 py-1.5 border rounded-lg text-[10px] font-bold outline-none transition-all placeholder:text-gray-300 ${
                          isModified && modifiedRows[item.taskId].manager_name 
                          ? 'border-amber-300 bg-amber-50/50' 
                          : item.status === 'LOCKED' || item.status === 'GENERATED'
                            ? 'border-gray-100 bg-gray-100/50 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                        }`}
                        value={item.manager_name || ""}
                        onChange={(e) => {
                          handleFieldChange(item.taskId, "manager_name", e.target.value);
                          setSearchDropdown({ type: "manager", id: item.taskId, term: e.target.value });
                        }}
                        onFocus={() => setSearchDropdown({ type: "manager", id: item.taskId, term: item.manager_name || "" })}
                        disabled={item.status === 'LOCKED' || item.status === 'GENERATED'}
                      />
                      {searchDropdown.type === "manager" && searchDropdown.id === item.taskId && (
                        <div className="absolute z-50 left-0 right-0 bg-white border border-gray-150 rounded-lg shadow-2xl max-h-40 overflow-y-auto mt-1">
                          {userData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => (
                            <button 
                              key={user.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-blue-50 flex items-center justify-between transition-colors border-b border-gray-50 last:border-0"
                              onClick={() => selectUser(item.taskId, "manager_name", user)}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[8px]">
                                  {user.user_name?.charAt(0)}
                                </div>
                                {user.user_name}
                              </div>
                              {item.manager_name === user.user_name && <Check size={10} className="text-blue-600" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Employee Tag/Badge Multi-select Input */}
                  <div className="space-y-1 relative">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Employees</label>
                    
                    {/* Selected Employees Tag List - Positioned above wrapper so they are always visible */}
                    {!(item.status === 'LOCKED' || item.status === 'GENERATED') && item.employee_name && (
                      <div className="flex flex-wrap gap-1 mb-1.5 pt-0.5">
                        {item.employee_name.split(',').map(emp => emp.trim()).filter(Boolean).map((emp, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black border border-emerald-100 shadow-sm animate-in zoom-in-95 duration-150">
                            {emp}
                            <button 
                              type="button"
                              className="hover:bg-emerald-200/50 rounded-full w-3 h-3 flex items-center justify-center text-emerald-800 transition-colors font-black text-[9px] leading-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleEmployee(item.taskId, emp, item.employee_name);
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="relative">
                      {(item.status === 'LOCKED' || item.status === 'GENERATED') ? (
                        <div className="flex flex-wrap gap-1">
                          {item.employee_name ? (
                            item.employee_name.split(',').map(emp => emp.trim()).filter(Boolean).map((emp, i) => (
                              <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black border border-emerald-100 flex items-center gap-1 shadow-sm">
                                <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                                {emp}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400 text-[10px] font-bold">No Employee Assigned</span>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Search input to select employees */}
                          <input 
                            type="text" 
                            placeholder={item.employee_name ? "Add employee..." : "Assign Employee.."}
                            className={`w-full px-2 py-1.5 border rounded-lg text-[10px] font-bold outline-none transition-all placeholder:text-gray-300 ${
                              isModified && modifiedRows[item.taskId].employee_name 
                              ? 'border-amber-300 bg-amber-50/50' 
                              : 'border-gray-200 bg-gray-50/30 hover:bg-white hover:border-gray-300'
                            }`}
                            value={(searchDropdown.type === "employee" && searchDropdown.id === item.taskId) ? searchDropdown.term : ""}
                            onChange={(e) => {
                              setSearchDropdown({ type: "employee", id: item.taskId, term: e.target.value });
                            }}
                            onFocus={() => setSearchDropdown({ type: "employee", id: item.taskId, term: "" })}
                          />
                          
                          {searchDropdown.type === "employee" && searchDropdown.id === item.taskId && (
                            <div className="absolute z-50 left-0 right-0 bg-white border border-gray-150 rounded-lg shadow-2xl max-h-40 overflow-y-auto mt-1 top-full">
                              {userData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => {
                                const isSelected = item.employee_name?.split(',').map(e => e.trim()).filter(Boolean).includes(user.user_name);
                                return (
                                  <button 
                                    key={user.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-blue-50 flex items-center justify-between transition-colors border-b border-gray-50 last:border-0"
                                    onClick={() => toggleEmployee(item.taskId, user.user_name, item.employee_name)}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[8px]">
                                        {user.user_name?.charAt(0)}
                                      </div>
                                      {user.user_name}
                                    </div>
                                    {isSelected && <Check size={10} className="text-blue-600" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {filteredTasks.length === 0 && (
            <div className="py-12 text-center flex flex-col items-center gap-2">
              <LayoutGrid size={36} className="text-gray-300" />
              <p className="text-gray-400 font-bold tracking-wider uppercase text-[10px]">No matching work records found</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Click outside to close dropdowns */}
      {searchDropdown.id && (
        <div className="fixed inset-0 z-40" onClick={() => setSearchDropdown({ type: null, id: null, term: "" })} />
      )}
    </AdminLayout>
  );
}
