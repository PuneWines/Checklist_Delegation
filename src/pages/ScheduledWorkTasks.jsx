"use client";
import { useState, useMemo, useEffect, useCallback, Fragment } from "react";
import { motion } from "framer-motion";
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
  ArrowLeft
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import supabase from "../SupabaseClient";
import AdminLayout from "../components/layout/AdminLayout";
import { fetchWorkRecords, saveAssignments } from "../redux/slice/workRecordsSlice";
import { userDetails } from "../redux/slice/settingSlice";
import { useMagicToast } from "../context/MagicToastContext";
import { checkAndPromoteAssignmentsApi } from "../redux/api/workRecordsApi";

const getTaskStatusInfo = (item, isModified) => {
  if (isModified) {
    return {
      text: "Pending Save",
      className: "bg-amber-50 text-amber-700 border-amber-200",
      dotClass: "bg-amber-500 animate-pulse"
    };
  }

  if (!item.next_start_datetime) {
    return {
      text: "Not Scheduled",
      className: "bg-gray-50 text-gray-500 border-gray-200",
      dotClass: "bg-gray-400"
    };
  }

  return {
    text: "Scheduled Next",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotClass: "bg-indigo-500"
  };
};

const getDatePart = (value) => {
  if (!value) return "";
  return String(value).split("T")[0] || "";
};

const getTimePart = (value) => {
  if (!value || !String(value).includes("T")) return "";
  return String(value).split("T")[1]?.substring(0, 5) || "";
};

const combineDateAndTime = (date, time) => {
  if (!date && !time) return "";
  if (!time) return date;
  if (!date) return "";
  return `${date}T${time}`;
};

export default function ScheduledWorkTasks() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useMagicToast();

  const { tasks: masterTasks, assignments, loading, saving, error } = useSelector(state => state.workRecords);
  const { userData } = useSelector(state => state.setting);

  // User Role Logic
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const username = (localStorage.getItem("user-name") || "").toLowerCase();
  const isSuperAdmin = username === "admin";
  const isAdmin = isSuperAdmin || role === "admin";
  const isHOD = role === "hod" || role === "manager";

  const userAccess = localStorage.getItem("user_access") || "";
  const managerShops = useMemo(() => {
    return userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }, [userAccess]);

  // UI States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShop, setSelectedShop] = useState("All");
  const [searchDropdown, setSearchDropdown] = useState({ type: null, id: null, term: "" });
  const [modifiedRows, setModifiedRows] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // Selection & Bulk States
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Background Promotion Trigger
  const runPromotionCheck = useCallback(async () => {
    try {
      const { promotedCount } = await checkAndPromoteAssignmentsApi();
      if (promotedCount > 0) {
        showToast(`Auto-promoted ${promotedCount} expired work assignment(s)!`, "info");
        dispatch(fetchWorkRecords());
      }
    } catch (err) {
      console.error("Auto promotion check failed:", err);
    }
  }, [dispatch, showToast]);

  useEffect(() => {
    runPromotionCheck();
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      runPromotionCheck();
    }, 60000); // 1 minute
    return () => clearInterval(timer);
  }, [runPromotionCheck]);

  // Handle click outside to collapse dropdowns
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!searchDropdown.type) return;
      if (!e.target.closest(".dropdown-container")) {
        setSearchDropdown({ type: null, id: null, term: "" });
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [searchDropdown.type]);

  // Initial Fetch
  useEffect(() => {
    dispatch(fetchWorkRecords());
    dispatch(userDetails());
  }, [dispatch]);

  // Derived Dropdowns
  const shopFilteredUsers = useMemo(() => {
    return userData.filter(u => {
      const userShopsList = (u.shop_name || u.user_access || "")
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (role === "manager" && !userShopsList.some(s => managerShops.includes(s))) {
        return false;
      }

      if (selectedShop !== "All") {
        return userShopsList.includes(selectedShop.toLowerCase());
      }

      return true;
    });
  }, [userData, role, managerShops, selectedShop]);

  const managerUserData = useMemo(() => {
    return shopFilteredUsers.filter(u => (u.role || "").toLowerCase() === "manager");
  }, [shopFilteredUsers]);

  const employeeUserData = useMemo(() => {
    return shopFilteredUsers.filter(u => {
      const r = (u.role || "").toLowerCase();
      return r === "user" || r === "manager";
    });
  }, [shopFilteredUsers]);

  const shops = useMemo(() => {
    const filteredMasterTasks = role === "manager"
      ? masterTasks.filter(t => managerShops.includes(t.shop?.shop_name?.toLowerCase()))
      : masterTasks;
    const s = new Set(filteredMasterTasks.map(t => t.shop?.shop_name).filter(Boolean));
    return ["All", ...Array.from(s)];
  }, [masterTasks, role, managerShops]);

  // Merge Master Tasks and Current Assignments
  const mergedData = useMemo(() => {
    return masterTasks.map(task => {
      const assignment = assignments.find(a => a.task_id === task.id) || {};
      const modified = modifiedRows[task.id] || {};

      return {
        ...task,
        ...assignment,
        ...modified, // local overrides
        taskId: task.id,
        shopName: task.shop?.shop_name || "N/A",
        assignmentId: assignment?.id || null
      };
    });
  }, [masterTasks, assignments, modifiedRows]);

  // Filtering
  const filteredTasks = useMemo(() => {
    return mergedData.filter(item => {
      if (role === "manager" && !managerShops.includes(item.shopName?.toLowerCase())) {
        return false;
      }
      const matchesShop = selectedShop === "All" || item.shopName === selectedShop;
      const matchesSearch = item.task_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.next_manager_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.next_employee_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesShop && matchesSearch;
    });
  }, [mergedData, selectedShop, searchTerm, role, managerShops]);

  const handleFieldChange = (taskId, field, value) => {
    setModifiedRows(prev => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [field]: value
      }
    }));
  };

  const handleScheduledTimeChange = (item, field, time) => {
    const existingDateTime = field === "next_start_datetime" ? item.next_start_datetime : item.next_end_datetime;
    const date = getDatePart(existingDateTime) || "";
    if (time && !date) {
      showToast("Please select a date first", "error");
      return;
    }
    handleFieldChange(item.taskId, field, combineDateAndTime(date, time));
  };

  const handleSelectRow = (id) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
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

  const applyBulkSchedules = () => {
    if (!(isAdmin || isHOD)) {
      showToast("Only admins and managers can bulk schedule tasks", "error");
      return;
    }

    if (!bulkStartDate && !bulkEndDate) {
      showToast("Please select bulk dates first", "error");
      return;
    }

    if (selectedRows.size === 0) {
      showToast("No tasks selected", "error");
      return;
    }

    const updates = {};
    selectedRows.forEach(id => {
      const currentTask = mergedData.find(t => t.taskId === id) || {};
      const displayStart = currentTask.next_start_datetime || "";
      const displayEnd = currentTask.next_end_datetime || "";
      
      const currentStartDate = getDatePart(displayStart);
      const currentEndDate = getDatePart(displayEnd);
      const currentStartTime = getTimePart(displayStart);
      const currentEndTime = getTimePart(displayEnd);

      const targetStartDate = bulkStartDate || currentStartDate;
      const targetEndDate = bulkEndDate || currentEndDate;

      updates[id] = {
        ...(modifiedRows[id] || {}),
        next_start_datetime: combineDateAndTime(targetStartDate, currentStartTime),
        next_end_datetime: combineDateAndTime(targetEndDate, currentEndTime)
      };
    });

    setModifiedRows(prev => ({ ...prev, ...updates }));
    showToast(`Applied bulk dates to ${selectedRows.size} tasks`, "success");
  };

  const selectUser = (taskId, field, user) => {
    handleFieldChange(taskId, field, user.user_name);
    setSearchDropdown({ type: null, id: null, term: "" });
  };

  const toggleNextEmployee = (taskId, empName, currentEmployeeNameStr) => {
    const currentEmps = currentEmployeeNameStr ? currentEmployeeNameStr.split(',').map(e => e.trim()).filter(Boolean) : [];
    let nextEmps;
    if (currentEmps.includes(empName)) {
      nextEmps = currentEmps.filter(e => e !== empName);
    } else {
      nextEmps = [...currentEmps, empName];
    }
    handleFieldChange(taskId, "next_employee_name", nextEmps.join(', ') || null);
    setSearchDropdown(prev => ({ ...prev, term: "" }));
  };

  const validateScheduledAssignment = (data) => {
    const nextStart = data.next_start_datetime;
    const nextEnd = data.next_end_datetime;

    const startDateExists = Boolean(getDatePart(nextStart));
    const endDateExists = Boolean(getDatePart(nextEnd));

    // If any scheduled field is filled, validate completeness
    if (startDateExists || endDateExists || data.next_manager_name || data.next_employee_name) {
      if (!startDateExists || !endDateExists) {
        return "Scheduled Start and End dates are required";
      }
      if (isAdmin && (!getTimePart(nextStart) || !getTimePart(nextEnd))) {
        return "Scheduled Start and End times are required for Admin updates";
      }
      if (new Date(nextStart) >= new Date(nextEnd)) {
        return "Scheduled Start date/time must be before End date/time";
      }
      if (!data.next_manager_name || !data.next_employee_name) {
        return "Scheduled Manager and Employee names are required";
      }
    }
    return null;
  };

  const handleSaveChanges = async () => {
    const allIdsToProcess = Object.keys(modifiedRows).map(id => parseInt(id));

    if (allIdsToProcess.length === 0) {
      showToast("Please make changes to save", "info");
      return;
    }

    const assignmentsToUpsert = [];
    const errors = [];

    allIdsToProcess.forEach(id => {
      const task = mergedData.find(t => t.taskId === id);
      if (!task) return;
      const effectiveTask = {
        ...task,
        ...(modifiedRows[id] || {})
      };

      const isCompletelyEmpty =
        !effectiveTask.next_manager_name &&
        !effectiveTask.next_employee_name &&
        !effectiveTask.next_start_datetime &&
        !effectiveTask.next_end_datetime;

      if (isCompletelyEmpty) {
        // Clear schedule
        assignmentsToUpsert.push({
          task_id: effectiveTask.taskId,
          start_datetime: task.start_datetime || null,
          end_datetime: task.end_datetime || null,
          manager_name: task.manager_name || null,
          employee_name: task.employee_name || null,
          status: task.status || 'LOCKED',
          next_manager_name: null,
          next_employee_name: null,
          next_start_datetime: null,
          next_end_datetime: null,
          updated_at: new Date().toISOString()
        });
        return;
      }

      const schedError = validateScheduledAssignment(effectiveTask);
      if (schedError) {
        errors.push(`Task "${effectiveTask.task_name}": ${schedError}`);
      }

      if (errors.length === 0) {
        assignmentsToUpsert.push({
          task_id: effectiveTask.taskId,
          start_datetime: task.start_datetime || null,
          end_datetime: task.end_datetime || null,
          manager_name: task.manager_name || null,
          employee_name: task.employee_name || null,
          status: task.status || 'LOCKED',

          next_manager_name: effectiveTask.next_manager_name !== undefined ? effectiveTask.next_manager_name : (task.next_manager_name || null),
          next_employee_name: effectiveTask.next_employee_name !== undefined ? effectiveTask.next_employee_name : (task.next_employee_name || null),
          next_start_datetime: effectiveTask.next_start_datetime !== undefined ? effectiveTask.next_start_datetime : (task.next_start_datetime || null),
          next_end_datetime: effectiveTask.next_end_datetime !== undefined ? effectiveTask.next_end_datetime : (task.next_end_datetime || null),
          updated_at: new Date().toISOString()
        });
      }
    });

    if (errors.length > 0) {
      showToast(errors[0], "error");
      return;
    }

    try {
      if (assignmentsToUpsert.length > 0) {
        await dispatch(saveAssignments(assignmentsToUpsert)).unwrap();
      }

      // Trigger auto-promote if Admin saved
      if (isAdmin) {
        const { promotedCount } = await checkAndPromoteAssignmentsApi();
        if (promotedCount > 0) {
          showToast(`Successfully saved & auto-promoted ${promotedCount} expired task(s)!`, "success");
        } else {
          showToast("Scheduled work tasks saved successfully", "success");
        }
      } else {
        showToast("Scheduled work tasks saved successfully", "success");
      }

      setModifiedRows({});
      setSelectedRows(new Set());
      dispatch(fetchWorkRecords());
    } catch (err) {
      showToast(err?.message || err || "Failed to save scheduled records", "error");
    }
  };

  const clearScheduledAssignment = (taskId) => {
    handleFieldChange(taskId, "next_manager_name", null);
    handleFieldChange(taskId, "next_employee_name", null);
    handleFieldChange(taskId, "next_start_datetime", null);
    handleFieldChange(taskId, "next_end_datetime", null);
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 mt-2 animate-in fade-in duration-500 pb-20 md:pb-4">
        {/* Header Section */}
        <div className="bg-white border-b border-purple-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative overflow-hidden rounded-t-xl">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-600 to-purple-600" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-100">
              <Calendar className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-700 to-purple-700 bg-clip-text text-transparent tracking-tight">
                Scheduled Work Tasks
              </h1>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -mt-1">
                Configure next assignment cycles
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {/* Active Tasks Link Button */}
            <button
              onClick={() => navigate('/dashboard/work-details')}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0"
            >
              <ArrowLeft size={14} /> Active Tasks 📋
            </button>

            <div className="relative group w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
              <input
                type="text"
                placeholder="Search scheduled tasks..."
                className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none w-full md:w-64 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Toggle Filters Button for Mobile View */}
        <div className="block md:hidden px-4 py-2.5 bg-white border-x border-gray-100">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all border border-indigo-100 shadow-sm active:scale-95"
          >
            <LayoutGrid size={14} />
            {showMobileFilters ? "Hide Filters & Actions ✖" : "Show Filters & Actions ⚙️"}
          </button>
        </div>

        {/* Filters and Actions Bar */}
        <motion.div
          initial={false}
          animate={
            !isMobile
              ? { height: "auto", opacity: 1, overflow: "visible" }
              : showMobileFilters
                ? {
                    height: "auto",
                    opacity: 1,
                    transitionEnd: { overflow: "visible" }
                  }
                : {
                    height: 0,
                    opacity: 0,
                    overflow: "hidden"
                  }
          }
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="overflow-hidden w-full"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 bg-white p-4 shadow-sm items-end border-x border-gray-100">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
              <LayoutGrid size={10} className="text-indigo-500" /> Filter Shop
            </label>
            <div className="relative group">
              <select
                className="w-full pl-2.5 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none appearance-none transition-all group-hover:bg-indigo-50/50"
                value={selectedShop}
                onChange={(e) => setSelectedShop(e.target.value)}
              >
                {shops.map(shop => <option key={shop} value={shop}>{shop}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none group-hover:text-indigo-600" />
            </div>
          </div>

          {(isAdmin || isHOD) && (
            <>
              {/* Bulk Start Date */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
                  <Calendar size={10} className="text-emerald-500" /> Bulk Start Date
                </label>
                <input
                  type="date"
                  className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-indigo-600 outline-none hover:bg-emerald-50/30 transition-all"
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                />
              </div>

              {/* Bulk End Date */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
                  <Calendar size={10} className="text-orange-500" /> Bulk End Date
                </label>
                <input
                  type="date"
                  className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-indigo-600 outline-none hover:bg-orange-50/30 transition-all"
                  value={bulkEndDate}
                  onChange={(e) => setBulkEndDate(e.target.value)}
                />
              </div>

              {/* Apply Bulk button */}
              <button
                onClick={applyBulkSchedules}
                disabled={selectedRows.size === 0}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:grayscale text-white font-black py-2 px-4 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-emerald-200 active:scale-95"
              >
                <CheckCircle2 size={14} /> Apply Bulk
              </button>
            </>
          )}

          {/* Save All Schedules */}
          <button
            onClick={handleSaveChanges}
            disabled={saving || Object.keys(modifiedRows).length === 0}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-2 px-4 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-indigo-200 active:scale-95 sm:col-span-2 md:col-span-1"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save All Schedules"}
          </button>
        </div>
      </motion.div>

        {/* Error State */}
        {error && (
          <div className="mx-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 animate-bounce">
            <AlertCircle size={20} />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        {/* Table View */}
        <div className="hidden md:block overflow-x-auto bg-white rounded-b-xl shadow-2xl border border-gray-100">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50/80 text-gray-400 uppercase text-[9px] font-black tracking-[0.15em] border-b border-gray-100">
                <th className="px-4 py-4 w-12 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded-md border-gray-200 text-indigo-600 focus:ring-offset-0 focus:ring-0 transition-all cursor-pointer"
                    onChange={handleSelectAll}
                    checked={selectedRows.size === filteredTasks.length && filteredTasks.length > 0}
                  />
                </th>
                <th className="px-4 py-4 w-12 text-center">No.</th>
                <th className="px-2 py-4">Shop</th>
                <th className="px-2 py-4 w-[20%]">Task Description</th>
                <th className="px-2 py-4">Dept</th>
                <th className="px-2 py-4 text-center">Mins</th>
                <th className="px-2 py-4">Next Start Date</th>
                <th className="px-2 py-4">Next End Date</th>
                <th className="px-2 py-4">Next Start Time</th>
                <th className="px-2 py-4">Next End Time</th>
                <th className="px-2 py-4">Next Manager</th>
                <th className="px-2 py-4">Next Employee(s)</th>
                <th className="px-2 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTasks.map((item, index) => {
                const isModified = !!modifiedRows[item.taskId];
                const displayStart = item.next_start_datetime || "";
                const displayEnd = item.next_end_datetime || "";

                return (
                  <tr key={item.taskId} className={`hover:bg-indigo-50/20 transition-all group ${isModified ? 'bg-amber-50/20' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded-md border-gray-200 text-indigo-600 focus:ring-offset-0 focus:ring-0 transition-all cursor-pointer"
                        checked={selectedRows.has(item.taskId)}
                        onChange={() => handleSelectRow(item.taskId)}
                      />
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-bold text-gray-400">
                      {index + 1}
                    </td>
                    <td className="px-2 py-3">
                      <span className="px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded text-[9px] font-black border border-sky-100 uppercase tracking-tighter w-fit">
                        {item.shopName}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-gray-700 leading-tight">
                          {item.task_name}
                        </span>
                        {(() => {
                          const statusInfo = getTaskStatusInfo(item, isModified);
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider mt-1 w-fit ${statusInfo.className}`}>
                              <span className={`w-1 h-1 rounded-full ${statusInfo.dotClass}`} />
                              {statusInfo.text}
                            </span>
                          );
                        })()}
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

                    {/* Next Start Date */}
                    <td className="px-2 py-3">
                      <input
                        type="date"
                        className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                        value={getDatePart(displayStart)}
                        onChange={(e) => handleFieldChange(item.taskId, "next_start_datetime", combineDateAndTime(e.target.value, getTimePart(displayStart)))}
                      />
                    </td>

                    {/* Next End Date */}
                    <td className="px-2 py-3">
                      <input
                        type="date"
                        className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                        value={getDatePart(displayEnd)}
                        onChange={(e) => handleFieldChange(item.taskId, "next_end_datetime", combineDateAndTime(e.target.value, getTimePart(displayEnd)))}
                      />
                    </td>

                    {/* Next Start Time */}
                    <td className="px-2 py-3">
                      <input
                        type="time"
                        className={`w-full px-1.5 py-1.5 border rounded text-[10px] font-bold outline-none transition-all ${
                          isAdmin 
                            ? 'border-gray-200 bg-gray-50 hover:bg-white focus:border-indigo-500' 
                            : 'border-gray-100 bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                        value={getTimePart(displayStart)}
                        onChange={(e) => handleScheduledTimeChange(item, "next_start_datetime", e.target.value)}
                        disabled={!isAdmin}
                      />
                    </td>

                    {/* Next End Time */}
                    <td className="px-2 py-3">
                      <input
                        type="time"
                        className={`w-full px-1.5 py-1.5 border rounded text-[10px] font-bold outline-none transition-all ${
                          isAdmin 
                            ? 'border-gray-200 bg-gray-50 hover:bg-white focus:border-indigo-500' 
                            : 'border-gray-100 bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                        value={getTimePart(displayEnd)}
                        onChange={(e) => handleScheduledTimeChange(item, "next_end_datetime", e.target.value)}
                        disabled={!isAdmin}
                      />
                    </td>

                    {/* Next Manager */}
                    <td className="px-2 py-3 relative">
                      <div className="relative dropdown-container">
                        <input
                          type="text"
                          placeholder="Select Manager..."
                          className="w-full px-2 py-1.5 border border-gray-200 bg-gray-50 hover:bg-white rounded text-[10px] font-bold outline-none transition-all"
                          value={item.next_manager_name || ""}
                          onChange={(e) => {
                            handleFieldChange(item.taskId, "next_manager_name", e.target.value);
                            setSearchDropdown({ type: "next_manager", id: item.taskId, term: e.target.value });
                          }}
                          onFocus={() => setSearchDropdown({ type: "next_manager", id: item.taskId, term: item.next_manager_name || "" })}
                        />
                        {searchDropdown.type === "next_manager" && searchDropdown.id === item.taskId && (
                          <div className={`absolute z-50 left-0 min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-2xl max-h-52 overflow-y-auto ${index >= filteredTasks.length - 3 ? "bottom-full mb-1" : "top-full mt-1"}`}>
                            {managerUserData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).length === 0 ? (
                              <div className="px-4 py-3 text-[11px] text-gray-400 font-semibold text-center">No managers found</div>
                            ) : managerUserData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => (
                              <button
                                key={user.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-indigo-50 flex items-center justify-between gap-3 transition-colors border-b border-gray-50"
                                onClick={() => selectUser(item.taskId, "next_manager_name", user)}
                              >
                                <span>{user.user_name}</span>
                                {item.next_manager_name === user.user_name && <Check size={12} className="text-indigo-600" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Next Employee */}
                    <td className="px-2 py-3">
                      <div className="relative flex flex-col gap-1 min-w-[170px] dropdown-container">
                        {item.next_employee_name && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {item.next_employee_name.split(',').map(emp => emp.trim()).filter(Boolean).map((emp, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black border border-emerald-100 shadow-sm">
                                {emp}
                                <button
                                  type="button"
                                  className="hover:bg-emerald-200/50 rounded-full w-3 h-3 flex items-center justify-center text-emerald-800 transition-colors font-black text-[9px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNextEmployee(item.taskId, emp, item.next_employee_name);
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <input
                          type="text"
                          placeholder={item.next_employee_name ? "Add doer..." : "Select doer.."}
                          className="w-full px-2 py-1.5 border border-gray-200 bg-gray-50 hover:bg-white rounded text-[10px] font-bold outline-none"
                          value={(searchDropdown.type === "next_employee" && searchDropdown.id === item.taskId) ? searchDropdown.term : ""}
                          onChange={(e) => setSearchDropdown({ type: "next_employee", id: item.taskId, term: e.target.value })}
                          onFocus={() => setSearchDropdown({ type: "next_employee", id: item.taskId, term: "" })}
                        />
                        {searchDropdown.type === "next_employee" && searchDropdown.id === item.taskId && (
                          <div className={`absolute z-50 left-0 min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-2xl max-h-52 overflow-y-auto ${index >= filteredTasks.length - 3 ? "bottom-full mb-1" : "top-full mt-1"}`}>
                            {employeeUserData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).length === 0 ? (
                              <div className="px-4 py-3 text-[11px] text-gray-400 font-semibold text-center">No employees found</div>
                            ) : employeeUserData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => {
                              const isSelected = item.next_employee_name?.split(',').map(e => e.trim()).filter(Boolean).includes(user.user_name);
                              return (
                                <button
                                  key={user.id}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-[11px] font-semibold hover:bg-emerald-50 flex items-center justify-between gap-3 transition-colors border-b border-gray-50 ${isSelected ? 'bg-emerald-50/60 text-emerald-700' : 'text-gray-700'}`}
                                  onClick={() => toggleNextEmployee(item.taskId, user.user_name, item.next_employee_name)}
                                >
                                  <span>{user.user_name}</span>
                                  {isSelected && <Check size={12} className="text-emerald-600" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Action Column */}
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => clearScheduledAssignment(item.taskId)}
                        className="text-[9.5px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest bg-red-50 hover:bg-red-100/60 px-2.5 py-1.5 rounded-lg border border-red-200 transition-colors"
                      >
                        Clear
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTasks.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center gap-3">
              <LayoutGrid size={48} className="text-gray-200" />
              <p className="text-gray-400 font-bold tracking-widest uppercase text-xs">No matching scheduled work records found</p>
            </div>
          )}
        </div>

        {/* Mobile View Card List */}
        <div className="md:hidden space-y-4 p-4 bg-gray-50/30 rounded-b-xl border-x border-b border-gray-100">
          {filteredTasks.map((item, index) => {
            const isModified = !!modifiedRows[item.taskId];
            const displayStart = item.next_start_datetime || "";
            const displayEnd = item.next_end_datetime || "";

            return (
              <div
                key={item.taskId}
                className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4 relative transition-all ${isModified ? 'bg-amber-50/20 border-amber-200' : 'hover:border-indigo-200'}`}
              >
                {/* Shop, Dept & Status */}
                <div className="flex items-start justify-between gap-2 border-b border-gray-50 pb-3">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded-md border-gray-200 text-indigo-600 focus:ring-offset-0 focus:ring-0 transition-all cursor-pointer mt-0.5"
                      checked={selectedRows.has(item.taskId)}
                      onChange={() => handleSelectRow(item.taskId)}
                    />
                    <div className="flex flex-col gap-1">
                      <span className="px-2 py-0.5 bg-sky-50 text-sky-600 rounded text-[9px] font-black border border-sky-100 uppercase tracking-tighter w-fit">
                        {item.shopName}
                      </span>
                      <h3 className="text-sm font-bold text-gray-800 tracking-tight leading-snug mt-1">
                        {item.task_name}
                      </h3>
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black border border-emerald-100 uppercase tracking-tight">
                    {item.department || "N/A"}
                  </span>
                </div>

                {/* Date Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Next Start Date</label>
                    <input
                      type="date"
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 outline-none"
                      value={getDatePart(displayStart)}
                      onChange={(e) => handleFieldChange(item.taskId, "next_start_datetime", combineDateAndTime(e.target.value, getTimePart(displayStart)))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Next End Date</label>
                    <input
                      type="date"
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 outline-none"
                      value={getDatePart(displayEnd)}
                      onChange={(e) => handleFieldChange(item.taskId, "next_end_datetime", combineDateAndTime(e.target.value, getTimePart(displayEnd)))}
                    />
                  </div>
                </div>

                {/* Time Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Next Start Time</label>
                    <input
                      type="time"
                      className={`w-full px-2 py-1.5 border rounded text-[10px] font-bold outline-none ${
                        isAdmin ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                      value={getTimePart(displayStart)}
                      onChange={(e) => handleScheduledTimeChange(item, "next_start_datetime", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Next End Time</label>
                    <input
                      type="time"
                      className={`w-full px-2 py-1.5 border rounded text-[10px] font-bold outline-none ${
                        isAdmin ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                      value={getTimePart(displayEnd)}
                      onChange={(e) => handleScheduledTimeChange(item, "next_end_datetime", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>

                {/* Manager Selector */}
                <div className="space-y-1 relative dropdown-container">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Next Manager</label>
                  <input
                    type="text"
                    placeholder="Select Manager..."
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 outline-none"
                    value={item.next_manager_name || ""}
                    onChange={(e) => {
                      handleFieldChange(item.taskId, "next_manager_name", e.target.value);
                      setSearchDropdown({ type: "next_manager", id: item.taskId, term: e.target.value });
                    }}
                    onFocus={() => setSearchDropdown({ type: "next_manager", id: item.taskId, term: item.next_manager_name || "" })}
                  />
                  {searchDropdown.type === "next_manager" && searchDropdown.id === item.taskId && (
                    <div className="absolute z-50 left-0 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-40 overflow-y-auto mt-1 top-full">
                      {managerUserData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => (
                        <button
                          key={user.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-indigo-50 flex items-center justify-between"
                          onClick={() => selectUser(item.taskId, "next_manager_name", user)}
                        >
                          <span>{user.user_name}</span>
                          {item.next_manager_name === user.user_name && <Check size={12} className="text-indigo-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Employee Selector */}
                <div className="space-y-1 relative dropdown-container">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Next Employee(s)</label>
                  {item.next_employee_name && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {item.next_employee_name.split(',').map(emp => emp.trim()).filter(Boolean).map((emp, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black border border-emerald-100 shadow-sm">
                          {emp}
                          <button
                            type="button"
                            className="hover:bg-emerald-200/50 rounded-full w-3 h-3 flex items-center justify-center text-emerald-800 text-[9px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleNextEmployee(item.taskId, emp, item.next_employee_name);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Add employee..."
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 outline-none"
                    value={(searchDropdown.type === "next_employee" && searchDropdown.id === item.taskId) ? searchDropdown.term : ""}
                    onChange={(e) => setSearchDropdown({ type: "next_employee", id: item.taskId, term: e.target.value })}
                    onFocus={() => setSearchDropdown({ type: "next_employee", id: item.taskId, term: "" })}
                  />
                  {searchDropdown.type === "next_employee" && searchDropdown.id === item.taskId && (
                    <div className="absolute z-50 left-0 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-40 overflow-y-auto mt-1 top-full">
                      {employeeUserData.filter(u => u.user_name?.toLowerCase().includes(searchDropdown.term.toLowerCase())).map(user => {
                        const isSelected = item.next_employee_name?.split(',').map(e => e.trim()).filter(Boolean).includes(user.user_name);
                        return (
                          <button
                            key={user.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-[11px] font-semibold hover:bg-emerald-50 flex items-center justify-between"
                            onClick={() => toggleNextEmployee(item.taskId, user.user_name, item.next_employee_name)}
                          >
                            <span>{user.user_name}</span>
                            {isSelected && <Check size={12} className="text-emerald-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Card Clear Button */}
                <div className="flex justify-end pt-2 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={() => clearScheduledAssignment(item.taskId)}
                    className="text-[9.5px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest bg-red-50 hover:bg-red-100/60 px-3 py-1.5 rounded-lg border border-red-200"
                  >
                    Clear Schedule
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
