import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import supabase from "../../SupabaseClient";
import {
  Search,
  CheckCircle2,
  X,
  ArrowLeft,
  History,
  Users,
  ChevronDown,
  Filter,
  Camera,
  Loader2
} from "lucide-react";
import AudioPlayer from "../../components/AudioPlayer";
import { useMagicToast } from "../../context/MagicToastContext";
import RenderDescription from "../../components/RenderDescription";

const isAudioUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http') && (
    url.includes('audio-recordings') ||
    url.includes('voice-notes') ||
    url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i)
  );
};

const getWorkTaskTimeBounds = (task) => {
  const startStr = task.task_assignments?.start_datetime;
  const endStr = task.task_assignments?.end_datetime;

  let startHour = 0;
  let startMin = 0;
  let endHour = 23;
  let endMin = 59;

  if (startStr) {
    const parts = startStr.split('T');
    if (parts[1]) {
      const timeParts = parts[1].split(':');
      startHour = parseInt(timeParts[0]) || 0;
      startMin = parseInt(timeParts[1]) || 0;
    }
  }

  if (endStr) {
    const parts = endStr.split('T');
    if (parts[1]) {
      const timeParts = parts[1].split(':');
      endHour = parseInt(timeParts[0]) || 0;
      endMin = parseInt(timeParts[1]) || 0;
    }
  }

  let year, month, day;
  if (task.current_date && typeof task.current_date === 'string' && task.current_date.includes('-')) {
    [year, month, day] = task.current_date.split('-').map(Number);
  } else if (startStr && startStr.includes('T')) {
    const datePart = startStr.split('T')[0];
    [year, month, day] = datePart.split('-').map(Number);
  } else {
    const today = new Date();
    year = today.getFullYear();
    month = today.getMonth() + 1;
    day = today.getDate();
  }
  const taskStart = new Date(year, month - 1, day, startHour, startMin, 0);

  const estimatedMins = task.duration || 0;
  const baseEnd = new Date(year, month - 1, day, endHour, endMin, 0);
  const taskEnd = new Date(baseEnd.getTime() + estimatedMins * 60 * 1000);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

  return { taskStart, taskEnd, endOfDay };
};

const getWorkTaskDynamicStatus = (task, currentTime = new Date()) => {
  if (task.status === "APPROVED") return "APPROVED";
  if (task.status === "SUBMITTED" || task.status === "Done" || task.status === "done" || task.submission_date) return "SUBMITTED";
  if (task.status === "REJECTED") return "REJECTED";

  const { taskStart, endOfDay } = getWorkTaskTimeBounds(task);

  if (currentTime < taskStart) {
    return "UPCOMING";
  } else if (currentTime <= endOfDay) {
    return "ACTIVE";
  } else {
    return "NOT_DONE";
  }
};

const renderUserStatus = (task, formatDateWithTime) => {
  const isDone = !!(task.submission_date || ["SUBMITTED", "MANAGER_APPROVED", "APPROVED"].includes(task.status));
  if (isDone) {
    return (
      <div className="flex flex-col">
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 w-fit">
          Done
        </span>
        {task.submission_date && (
          <span className="text-[10px] text-gray-500 mt-0.5">
            {formatDateWithTime ? formatDateWithTime(task.submission_date) : task.submission_date}
          </span>
        )}
      </div>
    );
  }
  return (
    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
      Not Done
    </span>
  );
};

const renderManagerStatus = (task, formatDateWithTime) => {
  const isApproved = task.status === "APPROVED" || task.status === "MANAGER_APPROVED" || !!task.manager_approval_date;
  const isRejected = task.status === "REJECTED" && !!task.manager_approved_by;
  
  if (isApproved) {
    return (
      <div className="flex flex-col">
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 w-fit">
          Approved
        </span>
        {task.manager_approved_by && (
          <span className="text-[10px] text-gray-500 mt-0.5">By: {task.manager_approved_by}</span>
        )}
        {task.manager_approval_date && (
          <span className="text-[10px] text-gray-500 mt-0.5">
            {formatDateWithTime ? formatDateWithTime(task.manager_approval_date) : task.manager_approval_date}
          </span>
        )}
      </div>
    );
  }
  if (isRejected) {
    return (
      <div className="flex flex-col">
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 w-fit" title={task.rejection_reason}>
          Rejected
        </span>
        {task.manager_approved_by && (
          <span className="text-[10px] text-gray-500 mt-0.5">By: {task.manager_approved_by}</span>
        )}
        {task.manager_approval_date && (
          <span className="text-[10px] text-gray-500 mt-0.5">
            {formatDateWithTime ? formatDateWithTime(task.manager_approval_date) : task.manager_approval_date}
          </span>
        )}
      </div>
    );
  }
  const isUserDone = !!(task.submission_date || ["SUBMITTED", "MANAGER_APPROVED", "APPROVED"].includes(task.status));
  if (!isUserDone) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  return (
    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800 w-fit">
      Pending
    </span>
  );
};

const renderAdminStatus = (task) => {
  const isApproved = task.status === "APPROVED" || !!task.admin_approval_date;
  const isRejected = task.status === "REJECTED" && !!task.admin_approved_by;
  
  if (isApproved) {
    return (
      <div className="flex flex-col">
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 w-fit">
          Approved
        </span>
        {task.admin_approved_by && (
          <span className="text-[10px] text-gray-500 mt-0.5">By: {task.admin_approved_by}</span>
        )}
      </div>
    );
  }
  if (isRejected) {
    return (
      <div className="flex flex-col">
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 w-fit" title={task.rejection_reason}>
          Rejected
        </span>
        {task.admin_approved_by && (
          <span className="text-[10px] text-gray-500 mt-0.5">By: {task.admin_approved_by}</span>
        )}
      </div>
    );
  }
  const isUserDone = !!(task.submission_date || ["SUBMITTED", "MANAGER_APPROVED", "APPROVED"].includes(task.status));
  if (!isUserDone) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  return (
    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800 w-fit">
      Pending
    </span>
  );
};

const WorkTasksTab = ({
  username,
  userRole,
  holidaysList,
  allUsers,
  formatDate,
  formatTimeOnly,
  formatDateWithTime,
  setLightboxImage,
  searchTerm,
  setSearchTerm,
  showHistory,
  setShowHistory,
  dateFilter,
  setDateFilter,
  workEmployeeFilter,
  setWorkEmployeeFilter,
  selectedItems,
  setSelectedItems,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  isSubmitting,
  setIsSubmitting,
  registerSubmit,
}) => {
  const { showToast } = useMagicToast();

  const [tasks, setTasks] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [uploadedImages, setUploadedImages] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [remarksData, setRemarksData] = useState({});
  const [historyShopFilter, setHistoryShopFilter] = useState("all");
  const [historyManagerFilter, setHistoryManagerFilter] = useState("all");
  const [availableShops, setAvailableShops] = useState([]);
  const [availableManagers, setAvailableManagers] = useState([]);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [shopsRes, managersRes] = await Promise.all([
          supabase.from('shop').select('shop_name').order('shop_name', { ascending: true }),
          supabase.from('users').select('user_name').eq('status', 'active').ilike('role', 'manager').order('user_name', { ascending: true })
        ]);
        if (shopsRes.data) {
          setAvailableShops(shopsRes.data.map(s => s.shop_name).filter(Boolean));
        }
        if (managersRes.data) {
          setAvailableManagers(managersRes.data.map(u => u.user_name).filter(Boolean));
        }
      } catch (err) {
        console.error("Error fetching history filter options:", err);
      }
    };
    fetchFilterOptions();
  }, []);
  const [statusData, setStatusData] = useState({});
  const [imagePreviews, setImagePreviews] = useState({});
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState({ dateFilter: false, workEmployee: false });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const loadingRef = useRef(null);

  const getTimeStatus = useCallback((dateString, taskStatus) => {
    if (!dateString) return "—";
    let date;
    if (typeof dateString === 'string' && dateString.includes('-') && !dateString.includes('T') && !dateString.includes(' ')) {
      const parts = dateString.split('-');
      date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      date = new Date(dateString);
    }
    if (isNaN(date.getTime())) return "—";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    const isExtended = taskStatus?.toLowerCase() === "extended" || taskStatus?.toLowerCase() === "extend";

    if (isExtended) {
      if (taskDate < today) return "Not Done";
      return "Today";
    }

    if (taskDate < today) return "Not Done";
    if (taskDate.getTime() === today.getTime()) return "Today";
    return "Upcoming";
  }, []);

  const tableHeaders = useMemo(() => {
    const baseHeaders = [
      { id: "time_status", label: "Time" },
      { id: "id", label: "ID" },
      { id: "task_description", label: "Description" },
      { id: "manager_name", label: "Manager Name" },
      { id: "shop_name", label: "Shop" },
      { id: "department", label: "Department" },
      { id: "name", label: "Employee" },
      { id: "current_date", label: "Date" },
      { id: "duration", label: "Mins" },
    ];

    if (showHistory) {
      const role = (userRole || "").toLowerCase();
      if (role === "admin") {
        return [
          ...baseHeaders.filter(h => h.id !== "time_status"),
          { id: "user_status", label: "Employee Task" },
          { id: "manager_status", label: "Manager Approval" },
          { id: "admin_status", label: "Admin Approval" }
        ];
      } else if (role === "manager") {
        return [
          ...baseHeaders.filter(h => h.id !== "time_status"),
          { id: "user_status", label: "Employee Task" },
          { id: "manager_status", label: "Manager Approval" }
        ];
      } else {
        return [
          ...baseHeaders.filter(h => h.id !== "time_status"),
          { id: "user_status", label: "Task Status" }
        ];
      }
    } else {
      return [...baseHeaders, { id: "status", label: "Status" }];
    }
  }, [showHistory, userRole]);

  const fetchData = useCallback(async (pageNumber = 0, append = false) => {
    if (!username) return;

    try {
      if (pageNumber === 0) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);
      if (!append) {
        setTasks([]);
        setHistoryData([]);
      }

      const tableName = "work_task";
      let query = supabase.from(tableName).select("*, task_assignments:assignment_id(start_datetime, end_datetime, manager_name)");

      // Apply pagination limit/range in database
      const limit = 50;
      const from = pageNumber * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const currentUsername = (username || "");
      const currentUserRole = (userRole || "").toLowerCase();
      const isSuperAdmin = currentUsername.toLowerCase() === "admin";

      let reportingUsers = [currentUsername];
      let applyNameFilter = true;
      let allowedShops = [];
      let filterByShop = false;

      if (isSuperAdmin) {
        applyNameFilter = false;
      } else if (currentUserRole === "admin") {
        applyNameFilter = false;
        const userAccess = localStorage.getItem("user_access") || "";
        if (userAccess && userAccess.toLowerCase() !== "all" && userAccess.toLowerCase() !== "admin") {
          allowedShops = userAccess.split(',').map(shop => shop.trim().toLowerCase()).filter(d => d && d !== 'all');
          if (allowedShops.length > 0) {
            filterByShop = true;
          }
        }
      } else if (currentUserRole === "hod") {
        const { data: reports } = await supabase
          .from("users")
          .select("user_name")
          .eq("reported_by", username);
        if (reports && reports.length > 0) {
          reportingUsers = [currentUsername, ...reports.map((r) => (r.user_name || ""))];
        }
      } else if (currentUserRole === "manager") {
        const { data: allDbUsers } = await supabase
          .from("users")
          .select("user_name, shop_name, user_access");
        if (allDbUsers) {
          const userAccess = localStorage.getItem("user_access") || "";
          const managerShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          const matchedUsers = allDbUsers.filter(u => {
            const userShop = (u.shop_name || u.user_access || "").toLowerCase();
            const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
            return userShopsList.some(s => managerShops.includes(s));
          }).map(u => u.user_name || "");
          reportingUsers = [...new Set([currentUsername, ...matchedUsers])].filter(Boolean);
        }
      }

      if (applyNameFilter) {
        query = query.in("name", reportingUsers);
      }

      const getLocalStyleDate = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      if (showHistory) {
        const todayStr = getLocalStyleDate(new Date());
        query = query.or(`submission_date.not.is.null,current_date.lt.${todayStr}`);
        if (startDate) {
          query = query.gte("submission_date", startDate);
        }
        if (endDate) {
          query = query.lte("submission_date", endDate + 'T23:59:59');
        }
        query = query.order('current_date', { ascending: false });
      } else {
        const todayStr = getLocalStyleDate(new Date());

        query = query.or('submission_date.is.null,status.eq.REJECTED');

        // Only today tasks in 'live'
        if (dateFilter === "today" || dateFilter === "all") {
          query = query.eq('current_date', todayStr);
        } else {
          // "not_done" or "upcoming" filter should return empty since live is today only
          query = query.eq('id', -1);
        }

        // Ascending order: today's tasks
        query = query.order('current_date', { ascending: true });
      }

      if (debouncedSearchTerm && debouncedSearchTerm.trim() !== "") {
        const cleanTerm = debouncedSearchTerm.trim();
        const searchFields = ["task_description", "shop_name", "name"];

        const orQueryParts = [];
        searchFields.forEach(f => {
          orQueryParts.push(`${f}.ilike.%${cleanTerm}%`);
        });

        if (orQueryParts.length > 0) {
          query = query.or(orQueryParts.join(','));
        }
      }

      if (workEmployeeFilter && workEmployeeFilter !== "all") {
        query = query.eq('name', workEmployeeFilter);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) {
        console.error("WorkTasksTab Supabase fetch error:", fetchError);
        throw fetchError;
      }
      
      const mappedData = (data || []).map(item => {
        const mapped = {
          ...item,
          id: item.id || item.task_id,
          _table: item._table || tableName,
          shop: item.shop || item.shop_name || "-",
          manager_name: item.task_assignments?.manager_name || "—"
        };

        if (mapped.status === "REJECTED") {
          const todayStr = getLocalStyleDate(new Date());
          mapped.current_date = todayStr;
          mapped.submission_date = null;
        }

        return mapped;
      });
      
      let filteredWorkTasks = mappedData;
      if (filterByShop) {
        filteredWorkTasks = mappedData.filter(item => {
          const shopName = (item.shop_name || "").toLowerCase();
          return allowedShops.includes(shopName);
        });
      }

      if (currentUserRole === "manager") {
        filteredWorkTasks = filteredWorkTasks.filter(item =>
          item.name === currentUsername || item.manager_name === currentUsername
        );
      }
      
      filteredWorkTasks = filteredWorkTasks.filter(item => {
        const taskDate = item.current_date?.split('T')[0];
        if (!taskDate) return true;
        const isHoliday = holidaysList.includes(taskDate);
        return !isHoliday;
      });

      const hasMoreData = (data && data.length === limit);
      setHasMore(hasMoreData);

      if (showHistory) {
        const historyTasks = filteredWorkTasks.filter(item => {
          const ds = getWorkTaskDynamicStatus(item, currentTime);
          return ds === "NOT_DONE" || item.submission_date;
        });
        setHistoryData(prev => append ? [...prev, ...historyTasks] : historyTasks);
      } else {
        setTasks(prev => append ? [...prev, ...filteredWorkTasks] : filteredWorkTasks);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [username, userRole, showHistory, holidaysList, debouncedSearchTerm, workEmployeeFilter, currentTime, dateFilter, startDate, endDate]);

  useEffect(() => {
    setPage(0);
    setHasMore(true);
    fetchData(0, false);
  }, [showHistory, debouncedSearchTerm, dateFilter, workEmployeeFilter, startDate, endDate, username, userRole, fetchData]);

  const filteredPendingTasks = useMemo(() => {
    const sortedTasks = [...tasks].sort((a, b) => {
      const statusA = getTimeStatus(a.current_date, a.status);
      const statusB = getTimeStatus(b.current_date, b.status);

      const rank = { "Not Done": 0, "Today": 1, "Upcoming": 2 };
      const groupA = rank[statusA] !== undefined ? rank[statusA] : 3;
      const groupB = rank[statusB] !== undefined ? rank[statusB] : 3;

      if (groupA !== groupB) return groupA - groupB;

      const dateA = a.current_date ? new Date(a.current_date) : new Date(0);
      const dateB = b.current_date ? new Date(b.current_date) : new Date(0);
      return dateA - dateB;
    });

    const seen = new Set();

    return sortedTasks.filter((task) => {
      const taskDateValue = task.current_date;
      const status = taskDateValue ? getTimeStatus(taskDateValue, task.status) : null;

      if (taskDateValue && status) {
        if (dateFilter === "all") {
          // Keep all
        } else if (dateFilter === "today") {
          if (status !== "Today") return false;
        } else if (dateFilter === "not_done") {
          if (status !== "Not Done") return false;
        } else if (dateFilter === "upcoming") {
          if (status !== "Upcoming") return false;
        }
      }

      const nameKey = task.name || "";
      let seriesBase = `${task.assignment_id || ""}_${nameKey}_${task.id || ""}`;

      if (status === "Upcoming") {
        const key = `upcoming::${seriesBase}`;
        if (seen.has(key)) return false;
        seen.add(key);
      } else {
        const taskDate = taskDateValue ? new Date(taskDateValue).toDateString() : "";
        const key = `${seriesBase}::${taskDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }

      return true;
    });
  }, [tasks, dateFilter, getTimeStatus]);

  const filteredHistoryTasks = useMemo(() => {
    const completionField = "submission_date";

    return historyData.filter((task) => {
      let matchesDateRange = true;
      if (startDate || endDate) {
        const itemDate = task[completionField] ? new Date(task[completionField]) : null;
        if (!itemDate) return false;

        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (itemDate < start) matchesDateRange = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end) matchesDateRange = false;
        }
      }
      let matchesShop = true;
      if (historyShopFilter && historyShopFilter !== "all") {
        const taskShop = (task.shop_name || "").trim().toLowerCase();
        matchesShop = taskShop === historyShopFilter.trim().toLowerCase();
      }

      let matchesManager = true;
      if (historyManagerFilter && historyManagerFilter !== "all") {
        const taskManager = (task.manager_name || "").trim().toLowerCase();
        matchesManager = taskManager === historyManagerFilter.trim().toLowerCase();
      }

      return matchesDateRange && matchesShop && matchesManager;
    });
  }, [historyData, startDate, endDate, historyShopFilter, historyManagerFilter]);

  const paginatedTasks = useMemo(() => {
    return showHistory ? filteredHistoryTasks : filteredPendingTasks;
  }, [showHistory, filteredHistoryTasks, filteredPendingTasks]);

  const totalItemsRendered = paginatedTasks.length;
  const exactTotalAvailable = paginatedTasks.length;

  const loadMore = useCallback(() => {
    if (!isLoading && !isLoadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchData(nextPage, true);
    }
  }, [isLoading, isLoadingMore, hasMore, page, fetchData]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && !isLoadingMore && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadingRef.current) {
      observer.observe(loadingRef.current);
    }

    return () => {
      if (loadingRef.current) observer.unobserve(loadingRef.current);
    };
  }, [isLoading, isLoadingMore, hasMore, loadMore]);

  const handleSelectItem = useCallback((id, isChecked) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (isChecked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

    if (!isChecked) {
      setRemarksData((prevR) => {
        const n = { ...prevR };
        delete n[id];
        return n;
      });
      setUploadedImages((prevI) => {
        const n = { ...prevI };
        delete n[id];
        return n;
      });
      setStatusData((prevS) => {
        const n = { ...prevS };
        delete n[id];
        return n;
      });
    }
  }, [setSelectedItems]);

  const handleSelectAll = useCallback(
    (e) => {
      if (e.target.checked) {
        const submittableTasks = filteredPendingTasks.filter(t => {
          const ds = getWorkTaskDynamicStatus(t, currentTime);
          const isAssignedByMe = (userRole || "").toLowerCase() === "manager" && t.manager_name === username && t.name !== username;
          return ds !== "UPCOMING" && ds !== "NOT_DONE" && !isAssignedByMe;
        });
        setSelectedItems(new Set(submittableTasks.map((t) => t.id)));
      } else {
        setSelectedItems(new Set());
        setRemarksData({});
        setUploadedImages({});
        setStatusData({});
      }
    }, [filteredPendingTasks, userRole, username, currentTime]);

  const handleImageUpload = useCallback((id, e) => {
    const file = e.target.files[0];
    if (file) {
      if (imagePreviews[id]) {
        URL.revokeObjectURL(imagePreviews[id]);
      }

      const previewUrl = URL.createObjectURL(file);
      setUploadedImages((prev) => ({ ...prev, [id]: file }));
      setImagePreviews((prev) => ({ ...prev, [id]: previewUrl }));
      setSuccessMessage(`File selected for task ID: ${id}`);
    }
  }, [imagePreviews]);

  useEffect(() => {
    return () => {
      Object.values(imagePreviews).forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  const uploadFile = async (id, file) => {
    const bucketName = "work";
    const fileName = `${id}_${Date.now()}_${file.name}`;
    const { data, error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    return publicUrl;
  };

  const handleSubmit = useCallback(async () => {
    if (selectedItems.size === 0) {
      showToast("Please select at least one task to submit", "error");
      return;
    }

    const selectedArray = Array.from(selectedItems);

    for (const id of selectedArray) {
      const task = tasks.find((t) => t.id === id || t.task_id === id);

      if (task) {
        const isAttachmentRequired =
          task.require_attachment === true ||
          String(task.require_attachment).toLowerCase() === "yes" ||
          String(task.require_attachment).toLowerCase() === "true" ||
          task.attachment === true;

        const currentStatus = statusData[id] || "Done";
        const isMarkedDone = ["done", "yes", "completed"].includes(currentStatus.toLowerCase());

        if (isAttachmentRequired && isMarkedDone && !uploadedImages[id]) {
          showToast(`Attachment required! Please upload an image/file for Task #${id} before submitting.`, "error");
          return;
        }
      }
    }

    setIsSubmitting(true);
    setSuccessMessage("");

    try {
      const updatePromises = selectedArray.map(async (id) => {
        let imageUrl = null;
        if (uploadedImages[id]) {
          imageUrl = await uploadFile(id, uploadedImages[id]);
        }

        const updates = {
          remark: remarksData[id] || null,
          image: imageUrl,
          status: 'SUBMITTED',
          submission_date: new Date(new Date().getTime() + (330 * 60000)).toISOString().replace('Z', '+05:30')
        };
        const { error: updateError } = await supabase.from("work_task").update(updates).eq("id", id);
        if (updateError) throw updateError;
      });

      await Promise.all(updatePromises);

      setSuccessMessage(`Successfully submitted ${selectedItems.size} task(s)!`);
      setSelectedItems(new Set());
      setRemarksData({});
      setUploadedImages({});
      setStatusData({});
      fetchData();
    } catch (err) {
      console.error("Submission error:", err);
      alert("Failed to submit tasks: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedItems, tasks, statusData, uploadedImages, remarksData, username, fetchData, showToast, setIsSubmitting, setSelectedItems]);

  useEffect(() => {
    if (registerSubmit) {
      registerSubmit(handleSubmit);
    }
    return () => {
      if (registerSubmit) {
        registerSubmit(null);
      }
    };
  }, [handleSubmit, registerSubmit]);

  return (
    <>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 sm:px-4 py-3 rounded-md flex items-center justify-between text-sm sm:text-base animate-in fade-in duration-300 mb-4">
          <div className="flex items-center">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-emerald-600 flex-shrink-0" />
            <span className="break-words font-black uppercase tracking-wide">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage("")} className="text-emerald-600 hover:text-emerald-800 ml-2 flex-shrink-0">
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="rounded-xl border border-gray-200 shadow-sm bg-white overflow-hidden">
        {showHistory && (
          <div className="p-3 sm:p-4 border-b border-purple-100 bg-gray-50 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-medium text-purple-700 whitespace-nowrap">Filter by Range:</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs sm:text-sm border border-gray-200 rounded-md p-1 focus:ring-1 focus:ring-purple-400 outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs sm:text-sm border border-gray-200 rounded-md p-1 focus:ring-1 focus:ring-purple-400 outline-none"
                />
              </div>
              {(startDate || endDate) && (
                <button onClick={() => { setStartDate(""); setEndDate(""); }} className="text-xs text-red-500 hover:underline">Clear</button>
              )}
            </div>

            {/* Shop Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-medium text-purple-700 whitespace-nowrap">Shop:</span>
              <select
                value={historyShopFilter}
                onChange={(e) => setHistoryShopFilter(e.target.value)}
                className="text-xs sm:text-sm border border-gray-200 rounded-md p-1.5 focus:ring-1 focus:ring-purple-400 outline-none bg-white font-medium text-gray-700"
              >
                <option value="all">All Shops</option>
                {availableShops.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Manager Filter (shown for admin role only) */}
            {(userRole || "").toLowerCase() === "admin" && (
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-medium text-purple-700 whitespace-nowrap">Manager:</span>
                <select
                  value={historyManagerFilter}
                  onChange={(e) => setHistoryManagerFilter(e.target.value)}
                  className="text-xs sm:text-sm border border-gray-200 rounded-md p-1.5 focus:ring-1 focus:ring-purple-400 outline-none bg-white font-medium text-gray-700"
                >
                  <option value="all">All Managers</option>
                  {availableManagers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="min-h-[300px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500 mb-2"></div>
              <p className="text-purple-600 text-sm font-bold uppercase tracking-wider">Loading data...</p>
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              <p className="text-red-500 mb-2 font-medium">{error}</p>
              <button onClick={fetchData} className="text-sm text-purple-600 underline">Try again</button>
            </div>
          ) : (
            <>
              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm transition-all duration-300">
                    <tr>
                      {!showHistory && (
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left font-bold text-gray-900">
                          <input
                            type="checkbox"
                            checked={(() => {
                              const submittableTasks = filteredPendingTasks.filter(t => {
                                const ds = getWorkTaskDynamicStatus(t, currentTime);
                                const isAssignedByMe = (userRole || "").toLowerCase() === "manager" && t.manager_name === username && t.name !== username;
                                return ds !== "UPCOMING" && ds !== "NOT_DONE" && !isAssignedByMe;
                              });
                              return submittableTasks.length > 0 && submittableTasks.every(t => selectedItems.has(t.id));
                            })()}
                            onChange={handleSelectAll}
                            className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-30"
                          />
                        </th>
                      )}
                      {tableHeaders.map((header) => (
                        <th key={header.id} className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {header.label}
                        </th>
                      ))}
                      {!showHistory && (
                        <>
                          <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Remarks</th>
                          <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Image</th>
                        </>
                      )}
                      {showHistory && (
                        <>
                          <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Remarks</th>
                          <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Attachment</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedTasks.length > 0 ? (
                      paginatedTasks.map((task, index) => {
                        const currentStatus = getTimeStatus(task.current_date, task.status);
                        const prevStatus = index > 0 ? getTimeStatus(paginatedTasks[index - 1].current_date, paginatedTasks[index - 1].status) : null;
                        const showGroupHeader = currentStatus !== prevStatus;

                        return (
                          <Fragment key={task.id}>
                            {showGroupHeader && !showHistory && (
                              <tr className="bg-gray-100/30">
                                <td colSpan={tableHeaders.length + 6} className="px-4 sm:px-6 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${currentStatus === 'Not Done' ? 'bg-red-500' : currentStatus === 'Today' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                                      {currentStatus}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr className="hover:bg-gray-50">
                              {!showHistory && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedItems.has(task.id)}
                                    onChange={(e) => handleSelectItem(task.id, e.target.checked)}
                                    disabled={(() => {
                                      const ds = getWorkTaskDynamicStatus(task, currentTime);
                                      const isAssignedByMe = (userRole || "").toLowerCase() === "manager" && task.manager_name === username && task.name !== username;
                                      return ds === "UPCOMING" || ds === "NOT_DONE" || isAssignedByMe;
                                    })()}
                                    className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                  />
                                </td>
                              )}
                              {tableHeaders.map((header) => (
                                <td key={header.id} className={`px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 ${header.id === 'task_description' ? 'min-w-[200px] whitespace-normal' : 'whitespace-nowrap'}`}>
                                  {header.id === "time_status" ? (
                                    (() => {
                                      const ds = getWorkTaskDynamicStatus(task, currentTime);
                                      const badgeColors = ds === 'NOT_DONE' ? 'bg-red-50 text-red-500' : ds === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
                                      const label = ds === 'NOT_DONE' ? 'Not Done' : ds === 'ACTIVE' ? 'Active' : 'Upcoming';
                                      return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeColors}`}>{label}</span>;
                                    })()
                                  ) : header.id === "current_date" ? (
                                    <div className="flex flex-col">
                                      <span className="font-bold text-gray-900">{formatDate(task[header.id])}</span>
                                      <span className="text-[11px] text-gray-400">
                                        {task.task_assignments?.start_datetime ? formatTimeOnly(task.task_assignments.start_datetime) : ""}
                                      </span>
                                    </div>
                                  ) : header.id === "id" ? (
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-gray-900">{task[header.id]}</span>
                                    </div>
                                  ) : header.id === "submission_date" ? (
                                    formatDateWithTime(task[header.id])
                                  ) : header.id === "user_status" ? (
                                    renderUserStatus(task, formatDateWithTime)
                                  ) : header.id === "manager_status" ? (
                                    renderManagerStatus(task, formatDateWithTime)
                                  ) : header.id === "admin_status" ? (
                                    renderAdminStatus(task)
                                  ) : header.id === "status" ? (
                                    (() => {
                                      const ds = getWorkTaskDynamicStatus(task, currentTime);
                                      if (ds === "APPROVED") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Approved</span>;
                                      if (ds === "SUBMITTED") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Pending Approval</span>;
                                      if (ds === "REJECTED") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Rejected</span>;
                                      if (ds === "UPCOMING") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-600">Upcoming</span>;
                                      if (ds === "NOT_DONE") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-50 text-red-500">Not Done</span>;
                                      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-50 text-purple-700">Active</span>;
                                    })()
                                  ) : (header.id === 'name' || header.id === 'manager_name') ? (
                                    <span className="font-bold text-gray-900">{task[header.id] || "—"}</span>
                                  ) : header.id === 'task_description' ? (
                                    <RenderDescription text={task[header.id]} audioUrl={task.audio_url} instructionUrl={task.instruction_attachment_url} instructionType={task.instruction_attachment_type} />
                                  ) : isAudioUrl(task[header.id]) ? (
                                    <AudioPlayer url={task[header.id]} />
                                  ) : (
                                    task[header.id] || "—"
                                  )}
                                </td>
                              ))}
                              {!showHistory && (
                                <>
                                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                    <input
                                      type="text"
                                      placeholder="Enter remarks"
                                      value={remarksData[task.id] || ""}
                                      onChange={(e) => setRemarksData((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                      className="w-full min-w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:border-purple-400 outline-none text-xs text-gray-700 disabled:opacity-50"
                                      disabled={!selectedItems.has(task.id)}
                                    />
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800 bg-emerald-50/30">
                                    <div className="flex flex-col gap-2">
                                      {imagePreviews[task.id] && (
                                        <div className="relative w-16 h-16 mb-1 group">
                                          <img
                                            src={imagePreviews[task.id]}
                                            className="w-full h-full object-cover rounded-md border-2 border-purple-200 shadow-sm"
                                            alt="Preview"
                                          />
                                          <button
                                            onClick={() => {
                                              URL.revokeObjectURL(imagePreviews[task.id]);
                                              setImagePreviews(prev => {
                                                const next = { ...prev };
                                                delete next[task.id];
                                                return next;
                                              });
                                              setUploadedImages(prev => {
                                                const next = { ...prev };
                                                delete next[task.id];
                                                return next;
                                              });
                                            }}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                            <X size={10} />
                                          </button>
                                        </div>
                                      )}
                                      <label className={`flex items-center gap-2 cursor-pointer text-xs font-medium transition-colors ${selectedItems.has(task.id) ? "text-cyan-500 hover:text-cyan-700" : "text-gray-400 cursor-not-allowed"}`}>
                                        <Camera className="h-3.5 w-3.5" />
                                        <span>
                                          {uploadedImages[task.id] ? "Retake Photo" : (task.require_attachment || task.attachment) ? <span>Take Photo <span className="text-red-500 font-bold">*</span></span> : "Take Photo"}
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="hidden"
                                          onChange={(e) => handleImageUpload(task.id, e)}
                                          disabled={!selectedItems.has(task.id)}
                                        />
                                      </label>
                                    </div>
                                  </td>
                                </>
                              )}
                              {showHistory && (
                                <>
                                  <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 max-w-xs truncate">
                                    <RenderDescription text={task.remark || task.remarks} audioUrl={task.audio_url} instructionUrl={task.instruction_attachment_url} instructionType={task.instruction_attachment_type} />
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                    {task.image || task.uploaded_image_url || task.image_url ? (
                                      <a href={task.image || task.uploaded_image_url || task.image_url} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">View</a>
                                    ) : "—"}
                                  </td>
                                </>
                              )}
                            </tr>
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={tableHeaders.length + 6} className="px-6 py-20 text-center text-gray-400">
                          <div className="flex flex-col items-center gap-2">
                            <Search size={40} className="text-gray-200" />
                            <p>No {showHistory ? "history" : "pending tasks"} found.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile view Toolbar */}
              {!showHistory && (
                <div className="md:hidden sticky top-[header_height] z-30 transition-all duration-300">
                  <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={(() => {
                            const submittableTasks = filteredPendingTasks.filter(t => {
                              const ds = getWorkTaskDynamicStatus(t, currentTime);
                              const isAssignedByMe = (userRole || "").toLowerCase() === "manager" && t.manager_name === username && t.name !== username;
                              return ds !== "UPCOMING" && ds !== "NOT_DONE" && !isAssignedByMe;
                            });
                            return submittableTasks.length > 0 && submittableTasks.every(t => selectedItems.has(t.id));
                          })()}
                          onChange={handleSelectAll}
                          className="h-5 w-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 transition-all cursor-pointer"
                        />
                      </div>
                      <span className="text-sm font-black text-gray-700 uppercase tracking-tight">Select All Tasks</span>
                    </div>

                    {selectedItems.size > 0 && (
                      <button
                        onClick={() => { setSelectedItems(new Set()); setRemarksData({}); setUploadedImages({}); setStatusData({}); }}
                        className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-700 transition-colors"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Mobile view Cards */}
              <div className="md:hidden space-y-4 p-4 bg-gray-50/50 pb-24">
                {paginatedTasks.length > 0 ? (
                  paginatedTasks.map((task, index) => {
                    const currentStatus = getTimeStatus(task.current_date, task.status);
                    const prevStatus = index > 0 ? getTimeStatus(paginatedTasks[index - 1].current_date, paginatedTasks[index - 1].status) : null;
                    const showGroupHeader = currentStatus !== prevStatus;

                    return (
                      <Fragment key={task.id}>
                        {showGroupHeader && !showHistory && (
                          <div className="pt-2 pb-1 px-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                              <div className={`w-1 h-1 rounded-full ${currentStatus === 'Not Done' ? 'bg-red-500' : currentStatus === 'Today' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                              {currentStatus}
                            </span>
                          </div>
                        )}
                        <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
                          {/* Card Header */}
                          <div className="bg-purple-50/50 px-4 py-3 border-b border-purple-100 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              {!showHistory && (
                                <input
                                  type="checkbox"
                                  checked={selectedItems.has(task.id)}
                                  onChange={(e) => handleSelectItem(task.id, e.target.checked)}
                                  disabled={(() => {
                                    const ds = getWorkTaskDynamicStatus(task, currentTime);
                                    const isAssignedByMe = (userRole || "").toLowerCase() === "manager" && task.manager_name === username && task.name !== username;
                                    return ds === "UPCOMING" || ds === "NOT_DONE" || isAssignedByMe;
                                  })()}
                                  className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                />
                              )}
                              <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">#{task.id}</span>
                            </div>
                            <span className={`px-2 py-0.5 inline-flex text-[10px] leading-5 font-semibold rounded-full ${currentStatus === 'Not Done' ? 'bg-red-100 text-red-800' :
                              currentStatus === 'Today' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                              {currentStatus}
                            </span>
                          </div>

                          {/* Card Body */}
                          <div className="p-4 space-y-3">
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">Description</p>
                              <div className="text-sm text-gray-800">
                                <RenderDescription text={task.task_description} audioUrl={task.audio_url} instructionUrl={task.instruction_attachment_url} instructionType={task.instruction_attachment_type} />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Employee</p>
                                  <p className="text-sm font-bold text-gray-900">{task.name || "—"}</p>
                              </div>
                              {showHistory ? (
                                <div className="space-y-2 col-span-2 border-t border-gray-100 pt-2">
                                  {(() => {
                                    const role = (userRole || "").toLowerCase();
                                    if (role === "admin") {
                                      return (
                                        <div className="grid grid-cols-3 gap-2">
                                          <div className="space-y-0.5">
                                            <p className="text-[9px] text-gray-400 uppercase font-semibold">Employee Task</p>
                                            <div>{renderUserStatus(task, formatDateWithTime)}</div>
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-[9px] text-gray-400 uppercase font-semibold">Manager Approval</p>
                                            <div>{renderManagerStatus(task, formatDateWithTime)}</div>
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-[9px] text-gray-400 uppercase font-semibold">Admin Approval</p>
                                            <div>{renderAdminStatus(task)}</div>
                                          </div>
                                        </div>
                                      );
                                    } else if (role === "manager") {
                                      return (
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="space-y-0.5">
                                            <p className="text-[9px] text-gray-400 uppercase font-semibold">Employee Task</p>
                                            <div>{renderUserStatus(task, formatDateWithTime)}</div>
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-[9px] text-gray-400 uppercase font-semibold">Manager Approval</p>
                                            <div>{renderManagerStatus(task, formatDateWithTime)}</div>
                                          </div>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <div className="space-y-0.5">
                                          <p className="text-[9px] text-gray-400 uppercase font-semibold">Task Status</p>
                                          <div>{renderUserStatus(task, formatDateWithTime)}</div>
                                        </div>
                                      );
                                    }
                                  })()}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Status</p>
                                  <div className="text-sm">
                                    {(() => {
                                      const ds = getWorkTaskDynamicStatus(task, currentTime);
                                      if (ds === "APPROVED") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Approved</span>;
                                      if (ds === "SUBMITTED") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Pending Approval</span>;
                                      if (ds === "REJECTED") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Rejected</span>;
                                      if (ds === "UPCOMING") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-600">Upcoming</span>;
                                      if (ds === "NOT_DONE") return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-50 text-red-500">Not Done</span>;
                                      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-50 text-purple-700">Active</span>;
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-1 border-t border-gray-50">
                              <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold">Planned Date</p>
                                <p className="text-sm font-bold text-purple-700">
                                  {formatDate(task.current_date)}
                                  {task.task_assignments?.start_datetime && (
                                    <span className="text-xs text-gray-500 font-normal block">{formatTimeOnly(task.task_assignments.start_datetime)}</span>
                                  )}
                                </p>
                              </div>
                              {task.manager_name && (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Manager</p>
                                  <p className="text-sm text-gray-800 text-[11px] font-bold">{task.manager_name}</p>
                                </div>
                              )}
                              {(task.shop || task.shop_name) && (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Shop</p>
                                  <p className="text-sm text-gray-800 uppercase text-[11px] font-bold">{task.shop || task.shop_name}</p>
                                </div>
                              )}
                              {task.department && (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Department</p>
                                  <p className="text-sm text-gray-800 uppercase text-[11px] font-bold">{task.department}</p>
                                </div>
                              )}
                            </div>

                            {!showHistory && (
                              <div className="pt-2 space-y-3 border-t border-gray-50">
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Remarks</p>
                                  <input
                                    type="text"
                                    placeholder="Enter remarks"
                                    value={remarksData[task.id] || ""}
                                    onChange={(e) => setRemarksData((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                    disabled={!selectedItems.has(task.id)}
                                    className="w-full text-xs border-gray-200 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                  />
                                </div>
                                <div className="flex flex-col gap-3">
                                  {imagePreviews[task.id] && (
                                    <div className="relative w-full h-32 rounded-lg border-2 border-dashed border-purple-200 bg-purple-50/30 flex items-center justify-center overflow-hidden">
                                      <img src={imagePreviews[task.id]} className="w-full h-full object-contain" alt="Preview" />
                                      <button
                                        onClick={() => {
                                          URL.revokeObjectURL(imagePreviews[task.id]);
                                          setImagePreviews(prev => {
                                            const next = { ...prev };
                                            delete next[task.id];
                                            return next;
                                          });
                                          setUploadedImages(prev => {
                                            const next = { ...prev };
                                            delete next[task.id];
                                            return next;
                                          });
                                        }}
                                        className="absolute top-2 right-2 bg-red-500/80 backdrop-blur-sm text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-all ${selectedItems.has(task.id) ? "border-cyan-200 bg-cyan-50 text-cyan-500 active:scale-95" : "border-gray-100 bg-gray-50 text-gray-400 grayscale"}`}>
                                      <Camera className="h-3.5 w-3.5" />
                                      <span>{uploadedImages[task.id] ? "Retake" : "Photo"}</span>
                                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(task.id, e)} disabled={!selectedItems.has(task.id)} />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            )}

                            {showHistory && (task.image || task.uploaded_image_url || task.image_url) && (
                              <div className="pt-2 border-t border-gray-50">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Attachments</p>
                                <div className="flex flex-wrap gap-3">
                                  {(task.image || task.uploaded_image_url || task.image_url) && (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[10px] text-gray-500 font-medium">Work Photo</span>
                                      <img
                                        src={task.image || task.uploaded_image_url || task.image_url}
                                        alt="Work"
                                        className="w-24 h-24 object-cover rounded-lg border-2 border-purple-100 shadow-sm cursor-zoom-in"
                                        onClick={() => setLightboxImage({ url: task.image || task.uploaded_image_url || task.image_url, name: "Work Photo" })}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Fragment>
                    );
                  })
                ) : (
                  <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
                    <Search size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">No tasks found.</p>
                  </div>
                )}
              </div>

              {/* Mobile Floating Submit Bar */}
              {!showHistory && selectedItems.size > 0 && (
                <div className="md:hidden fixed bottom-6 left-4 right-4 z-40 animate-in slide-in-from-bottom-8 duration-500">
                  <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-purple-100 p-2 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="pl-4">
                        <p className="text-[10px] font-black text-purple-600 uppercase tracking-[0.2em] mb-0.5">Ready to Submit</p>
                        <p className="text-xs font-bold text-gray-500">{selectedItems.size} task{selectedItems.size !== 1 ? 's' : ''} selected</p>
                      </div>
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-black rounded-xl shadow-lg shadow-purple-200 transition-all active:scale-95 flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Submitting</>
                        ) : (
                          <><CheckCircle2 className="w-4 h-4" /> Submit Now</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Infinite Scroll Sentinel */}
              {paginatedTasks.length > 0 && (
                <div ref={loadingRef} className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm w-full">
                  {hasMore ? (
                    <div className="flex items-center space-x-3 bg-white px-6 py-3 rounded-full shadow-sm border border-gray-100">
                      <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-medium text-gray-600">Loading more tasks...</span>
                    </div>
                  ) : (
                    <span className="bg-gray-50 text-gray-400 px-4 py-2 rounded-full font-medium text-xs">All tasks loaded.</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default WorkTasksTab;
