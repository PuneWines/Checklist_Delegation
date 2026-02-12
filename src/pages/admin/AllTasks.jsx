"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import supabase from "../../SupabaseClient";
import {
  ClipboardList,
  Wrench,
  Hammer,
  Search,
  Upload,
  CheckCircle2,
  X,
  History,
  ArrowLeft,
  Edit,
  Save,
  Loader2,
  Camera,
  Users,
  Play,
  Pause,
} from "lucide-react";
import TaskManagementTabs from "../../components/TaskManagementTabs";
import { updateRepairData } from "../../redux/api/repairApi";

const isAudioUrl = (url) => {
  if (typeof url !== 'string') return false;
  return url.startsWith('http') && (
    url.includes('audio-recordings') ||
    url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i)
  );
};

const AudioPlayer = ({ url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const togglePlay = () => {
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
    <div className="flex items-center gap-2">
      <button
        onClick={togglePlay}
        className="p-1.5 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200 transition-colors shadow-sm"
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <span className="text-xs font-medium text-purple-700">Voice Note</span>
      <audio ref={audioRef} src={url} className="hidden" />
    </div>
  );
};

const AllTasks = () => {
  // Active tab state
  const [activeTab, setActiveTab] = useState("checklist"); // checklist, maintenance, repair, ea
  const [showHistory, setShowHistory] = useState(false);

  // Data states
  const [tasks, setTasks] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [uploadedImages, setUploadedImages] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [remarksData, setRemarksData] = useState({});
  const [statusData, setStatusData] = useState({});
  const [extendedDateData, setExtendedDateData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Repair Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUpdateTask, setSelectedUpdateTask] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    partReplaced: "",
    billAmount: "",
    status: "",
    remarks: "",
    workDone: "",
    vendorName: "",
    workPhoto: null,
    billCopy: null
  });

  const [username, setUsername] = useState("");
  const [userRole, setUserRole] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [holidaysList, setHolidaysList] = useState([]);

  // Fetch holidays on mount
  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const { data, error } = await supabase.from('holidays').select('holiday_date');
        if (error) throw error;
        if (data) setHolidaysList(data.map(h => h.holiday_date));
      } catch (err) {
        console.error("Error fetching holidays:", err);
      }
    };
    fetchHolidays();
  }, []);


  // Check user credentials
  useEffect(() => {
    const role = localStorage.getItem("role");
    const user = localStorage.getItem("user-name");

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setUserRole(role || "");
    setUsername(user || "");
  }, []);

  // Format date to dd/mm/yyyy
  const formatDate = useCallback((dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      return dateString;
    }
  }, []);

  const formatDateWithTime = useCallback((dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (error) {
      return dateString;
    }
  }, []);

  const formatTimeOnly = useCallback((dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const seconds = date.getSeconds().toString().padStart(2, "0");
      return `${hours}:${minutes}:${seconds}`;
    } catch (error) {
      return "";
    }
  }, []);

  const calculateNextDueDate = (currentDateStr, frequency) => {
    if (!currentDateStr || !frequency) return null;

    // Safely parse the database date string (might be YYYY-MM-DD or ISO)
    let date = new Date(currentDateStr);
    if (isNaN(date.getTime())) return null;

    const isHoliday = (d) => {
      const dateStr = d.toISOString().split('T')[0];
      return holidaysList.includes(dateStr);
    };

    const freqLower = frequency.toLowerCase();

    switch (freqLower) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'half-yearly':
        date.setMonth(date.getMonth() + 6);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        return null;
    }

    // Skip holidays for daily, weekly, monthly tasks
    if (['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'].includes(freqLower)) {
      let attempts = 0;
      while (isHoliday(date) && attempts < 365) {
        date.setDate(date.getDate() + 1);
        attempts++;
      }
    }

    return date.toISOString();
  };

  // Fetch tasks based on active state (Pending or History)
  const fetchData = useCallback(async () => {
    if (!username) return;

    try {
      setIsLoading(true);
      setError(null);

      let tableName;
      let dateColumn;
      let completionField;
      let nameField = "name";
      let headers = [];

      switch (activeTab) {
        case "maintenance":
          tableName = "maintenance_tasks";
          dateColumn = "task_start_date";
          completionField = "submission_date";
          if (showHistory) {
            headers = [
              { id: "id", label: "Task ID" },
              { id: "task_description", label: "Task Description" },
              { id: "department", label: "Department" },
              { id: "machine_name", label: "Machine Name" },
              { id: "part_name", label: "Part Name" },
              { id: "part_area", label: "Part Area" },
              { id: "task_start_date", label: "Task Start Date & Time" },
              { id: "freq", label: "Freq" },
              { id: "require_attachment", label: "Require Attachment" },
              { id: "submission_date", label: "Actual Date & Time" },
              { id: "status", label: "Status" },
            ];
          } else {
            headers = [
              { id: "id", label: "Task ID" },
              { id: "task_description", label: "Task Description" },
              { id: "department", label: "Department" },
              { id: "machine_name", label: "Machine Name" },
              { id: "part_name", label: "Part Name" },
              { id: "part_area", label: "Part Area" },
              { id: "given_by", label: "Given By" },
              { id: "name", label: "Name" },
              { id: "task_start_date", label: "Task Start Date & Time" },
              { id: "freq", label: "Freq" },
              { id: "enable_reminders", label: "Enable Reminders" },
              { id: "require_attachment", label: "Require Attachment" },
              { id: "status", label: "Status" },
            ];
          }
          break;
        case "repair":
          tableName = "repair_tasks";
          dateColumn = "created_at";
          completionField = "status";
          nameField = "assigned_person";
          if (showHistory) {
            headers = [
              { id: "id", label: "Task ID" },
              { id: "issue_description", label: "Issue Detail" },
              { id: "submission_date", label: "Submission Date" },
              { id: "filled_by", label: "Form Filled By" },
              { id: "assigned_person", label: "Assigned To" },
              { id: "machine_name", label: "Machine Name" },
              { id: "status", label: "Status" },
              { id: "part_replaced", label: "Part Replaced" },
              { id: "bill_amount", label: "Bill Amount" },
              { id: "remarks", label: "Remarks" },
            ];
          } else {
            headers = [
              { id: "action", label: "Action" },
              { id: "id", label: "Task ID" },
              { id: "issue_description", label: "Issue Detail" },
              { id: "filled_by", label: "Form Filled By" },
              { id: "assigned_person", label: "Assigned To" },
              { id: "machine_name", label: "Machine Name" },
              { id: "status", label: "Status" },
              { id: "part_replaced", label: "Part Replaced" },
              { id: "bill_amount", label: "Bill Amount" },
            ];
          }
          break;
        case "ea":
          tableName = "ea_tasks";
          dateColumn = "planned_date";
          completionField = "status";
          nameField = "doer_name";
          headers = [
            { id: "id", label: "Task ID" },
            { id: "task_description", label: "Task Description" },
            { id: "doer_name", label: "Doer Name" },
            { id: "phone_number", label: "Phone Number" },
            { id: "planned_date", label: "Planned Date" },
            { id: "status", label: "Status" },
          ];
          break;
        default: // checklist
          tableName = "checklist";
          dateColumn = "task_start_date";
          completionField = "submission_date";
          headers = [
            { id: "id", label: "Task ID" },
            { id: "task_description", label: "Task Description" },
            { id: "department", label: "Department Name" },
            { id: "given_by", label: "Given By" },
            { id: "name", label: "Name" },
            { id: "task_start_date", label: "Task Start Date & Time" },
            { id: "frequency", label: "Freq" },
            { id: "enable_reminder", label: "Enable Reminders" },
            { id: "require_attachment", label: "Require Attachment" },
            { id: "status", label: "Status" },
          ];
      }

      setTableHeaders(headers);

      let query = supabase.from(tableName).select("*");

      if (userRole !== "admin") {
        query = query.eq(nameField, username);
      }

      if (showHistory) {
        if (activeTab === "repair") {
          query = query.neq("status", "Pending").order("submission_date", { ascending: false });
        } else if (activeTab === "ea") {
          query = query.in("status", ["done", "extended"]).order("created_at", { ascending: false });
        } else {
          query = query.not(completionField, "is", null).order(completionField, { ascending: false });
        }
      } else {
        if (activeTab === "repair") {
          query = query.eq("status", "Pending").order(dateColumn, { ascending: false });
        } else if (activeTab === "ea") {
          query = query.eq("status", "pending").order(dateColumn, { ascending: true });
        } else {
          query = query.is(completionField, null).order(dateColumn, { ascending: false });
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (data) {
        // Map task_id to id for consistency if id doesn't exist
        const mappedData = data.map(item => ({
          ...item,
          id: item.id || item.task_id
        }));

        if (showHistory) {
          setHistoryData(mappedData);
        } else {
          setTasks(mappedData);
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [username, userRole, activeTab, showHistory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtering Logic
  const filteredPendingTasks = useMemo(() => {
    const dateColumn = activeTab === "repair" ? "created_at" : (activeTab === "ea" ? "planned_date" : "task_start_date");

    // First, sort tasks by date to ensure we handle them in order
    const sortedTasks = [...tasks].sort((a, b) => {
      const dateA = a[dateColumn] ? new Date(a[dateColumn]) : new Date(0);
      const dateB = b[dateColumn] ? new Date(b[dateColumn]) : new Date(0);
      return dateA - dateB;
    });

    const seen = new Set();

    return sortedTasks.filter((task) => {
      const matchesSearch = searchTerm
        ? Object.values(task).some(
          (val) => val && val.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
        : true;

      if (!matchesSearch) return false;

      // Filter to only show tasks for today or overdue (past)
      // This addresses the user request to NOT show tomorrow's tasks
      if (activeTab === "checklist" || activeTab === "maintenance" || activeTab === "ea") {
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Allow all tasks for today
        const taskDate = task[dateColumn] ? new Date(task[dateColumn]) : null;
        if (taskDate) {
          // If the task date is in the future (beyond today), hide it
          if (taskDate > today) return false;
        }
      }

      // Deduplication logic for checklist tasks
      if (activeTab === "checklist") {
        // Include date in key to avoid hiding different occurrences of the same recurring task
        const taskDate = task[dateColumn] ? new Date(task[dateColumn]).toDateString() : "";
        const key = `${task.task_description}-${task.name}-${taskDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }

      return true;
    });
  }, [tasks, searchTerm, activeTab, holidaysList]);

  const filteredHistoryTasks = useMemo(() => {
    const completionField = "submission_date";

    return historyData.filter((task) => {
      const matchesSearch = searchTerm
        ? Object.values(task).some(
          (val) => val && val.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
        : true;

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

      return matchesSearch && matchesDateRange;
    });
  }, [historyData, searchTerm, startDate, endDate, activeTab]);

  // Handle Selections
  const handleSelectItem = useCallback((id, isChecked) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (isChecked) {
        next.add(id);
      } else {
        next.delete(id);
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
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (e) => {
      if (e.target.checked) {
        setSelectedItems(new Set(filteredPendingTasks.map((t) => t.id)));
      } else {
        setSelectedItems(new Set());
        setRemarksData({});
        setUploadedImages({});
        setStatusData({});
      }
    },
    [filteredPendingTasks]
  );

  // File Upload
  const handleImageUpload = useCallback((id, e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedImages((prev) => ({ ...prev, [id]: file }));
      setSuccessMessage(`File selected for task ID: ${id}`);
    }
  }, []);

  const uploadFile = async (id, file) => {
    const bucketName = activeTab;
    const fileName = `${id}_${Date.now()}_${file.name}`;
    const { data, error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    return publicUrl;
  };


  // Repair Update Handler
  const openUpdateModal = (task) => {
    setSelectedUpdateTask(task);
    setUpdateForm({
      partReplaced: task.part_replaced || "",
      billAmount: task.bill_amount || "",
      status: task.status || "",
      remarks: task.remarks || "",
      workDone: task.work_done || "",
      vendorName: task.vendor_name || "",
      workPhoto: null,
      billCopy: null
    });
    setIsModalOpen(true);
  };

  const handleRepairUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!updateForm.status) return alert("Please select a status");
    setIsSubmitting(true);
    try {
      let workPhotoUrl = null;
      let billCopyUrl = null;

      // Upload Work Photo if selected
      if (updateForm.workPhoto) {
        const fileExt = updateForm.workPhoto.name.split('.').pop();
        const fileName = `work_${selectedUpdateTask.id}_${Date.now()}.${fileExt}`;
        const { data, error } = await supabase.storage.from('repair').upload(fileName, updateForm.workPhoto);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('repair').getPublicUrl(fileName);
        workPhotoUrl = publicUrl;
      }

      // Upload Bill Copy if selected
      if (updateForm.billCopy) {
        const fileExt = updateForm.billCopy.name.split('.').pop();
        const fileName = `bill_${selectedUpdateTask.id}_${Date.now()}.${fileExt}`;
        const { data, error } = await supabase.storage.from('repair').upload(fileName, updateForm.billCopy);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('repair').getPublicUrl(fileName);
        billCopyUrl = publicUrl;
      }

      await updateRepairData([{
        taskId: selectedUpdateTask.id,
        status: updateForm.status,
        partReplaced: updateForm.partReplaced || null,
        billAmount: updateForm.billAmount ? parseFloat(updateForm.billAmount) : null, // Fix empty string issue
        remarks: updateForm.remarks || null,
        workDone: updateForm.workDone || null,
        vendorName: updateForm.vendorName || null,
        workPhotoUrl: workPhotoUrl,
        billCopyUrl: billCopyUrl
      }]);

      setIsModalOpen(false);
      setSuccessMessage("Repair task updated successfully!");
      fetchData(); // Refresh list
    } catch (error) {
      console.error(error);
      alert("Failed to update task: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  // Submit Logic
  const handleSubmit = async () => {
    if (selectedItems.size === 0) {
      alert("Please select at least one task to submit");
      return;
    }

    // Validate EA tasks with extended status must have extended date
    if (activeTab === "ea") {
      const selectedArray = Array.from(selectedItems);
      for (const id of selectedArray) {
        if (statusData[id] === "extended" && !extendedDateData[id]) {
          alert("Please provide an Extended Date for tasks with 'Extend' status");
          return;
        }
      }
    }

    setIsSubmitting(true);
    setSuccessMessage("");

    try {
      const tableName = activeTab === "checklist" ? "checklist" :
        activeTab === "maintenance" ? "maintenance_tasks" :
          activeTab === "ea" ? "ea_tasks" :
            "repair_tasks";
      const completionField = "submission_date";

      const selectedArray = Array.from(selectedItems);

      const updatePromises = selectedArray.map(async (id) => {
        let imageUrl = null;
        if (uploadedImages[id]) {
          imageUrl = await uploadFile(id, uploadedImages[id]);
        }

        const remarksField = activeTab === "checklist" ? "remark" : "remarks";
        const imageField = activeTab === "checklist" ? "image" : (activeTab === "maintenance" ? "uploaded_image_url" : "image_url");

        // Handle EA tasks differently
        if (activeTab === "ea") {
          const originalTask = tasks.find(t => t.id === id);
          const taskStatus = statusData[id] || "done";

          // Insert into ea_tasks_done for history
          const { error: doneError } = await supabase.from("ea_tasks_done").insert([{
            task_id: id,
            doer_name: originalTask.doer_name,
            phone_number: originalTask.phone_number,
            planned_date: originalTask.planned_date,
            task_description: originalTask.task_description,
            status: taskStatus,
            remarks: remarksData[id] || null,
            given_by: originalTask.given_by,
            extended_date: taskStatus === "extended" ? extendedDateData[id] : null
          }]);

          if (doneError) throw doneError;

          // Update main task
          if (taskStatus === "extended" && extendedDateData[id]) {
            // If extended, update planned_date and keep status as pending
            const { error: updateError } = await supabase.from(tableName).update({
              planned_date: new Date(extendedDateData[id]).toISOString(),
              extended_date: new Date(extendedDateData[id]).toISOString(),
              status: "pending",
              updated_at: new Date().toISOString()
            }).eq("id", id);
            if (updateError) throw updateError;
          } else {
            // If done, mark as done
            const { error: updateError } = await supabase.from(tableName).update({
              status: "done",
              updated_at: new Date().toISOString()
            }).eq("id", id);
            if (updateError) throw updateError;
          }
        } else {
          // Original logic for other task types
          const updates = {
            [completionField]: new Date().toISOString(),
            [remarksField]: remarksData[id] || null,
            status: statusData[id] || (activeTab === "checklist" ? "yes" : "Done")
          };
          if (imageUrl) {
            updates[imageField] = imageUrl;
          }

          const { error: updateError } = await supabase.from(tableName).update(updates).eq("id", id);
          if (updateError) throw updateError;
        }

        // --- Handle Recurring Task Regeneration ---
        const originalTask = tasks.find(t => t.id === id);
        const frequency = (originalTask?.frequency || originalTask?.freq || "").toLowerCase();

        if (originalTask && frequency && frequency !== "one-time" && frequency !== "no") {
          try {
            const nextDate = calculateNextDueDate(originalTask.task_start_date || new Date(), frequency);
            if (nextDate) {
              // Construct new task object based on table type
              let newTask = {};

              if (activeTab === "checklist") {
                newTask = {
                  department: originalTask.department,
                  given_by: originalTask.given_by,
                  name: originalTask.name,
                  task_description: originalTask.task_description,
                  task_start_date: nextDate,
                  frequency: originalTask.frequency, // Keep original casing or standardized
                  enable_reminder: originalTask.enable_reminder,
                  require_attachment: originalTask.require_attachment,
                  status: 'no' // Reset status for new task (or null depending on schema default)
                };
              } else if (activeTab === "maintenance") {
                newTask = {
                  machine_name: originalTask.machine_name,
                  given_by: originalTask.given_by,
                  name: originalTask.name,
                  task_description: originalTask.task_description,
                  task_start_date: nextDate,
                  freq: originalTask.freq,
                  enable_reminders: originalTask.enable_reminders,
                  require_attachment: originalTask.require_attachment,
                  company_name: originalTask.company_name, // Ensure this critical field is carried over if present
                  status: null // Pending status usually null for maintenance
                };
              }

              // Insert the new recurring task
              if (Object.keys(newTask).length > 0) {
                const { error: insertError } = await supabase.from(tableName).insert([newTask]);
                if (insertError) console.error("Error creating next recurring task:", insertError);
              }
            }
          } catch (recurError) {
            console.error("Failed to generate next recurring task:", recurError);
          }
        }
      });

      await Promise.all(updatePromises);

      setSuccessMessage(`Successfully submitted ${selectedItems.size} task(s)!`);
      setSelectedItems(new Set());
      setRemarksData({});
      setUploadedImages({});
      setStatusData({});
      setExtendedDateData({});
      fetchData();
    } catch (err) {
      console.error("Submission error:", err);
      alert("Failed to submit tasks: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
        {/* Tab System */}
        <div className="bg-white rounded-xl shadow-md border border-purple-100 px-4 md:px-6 py-4">
          <TaskManagementTabs activeTab={activeTab} setActiveTab={(newTab) => {
            setActiveTab(newTab);
            setShowHistory(false);
            setSelectedItems(new Set());
            setSearchTerm("");
          }} />
        </div>

        {/* Action Header */}
        <div className="flex flex-col gap-3 sm:gap-4">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-purple-700">
            {showHistory ? `${activeTab.toUpperCase()} Task History` : `${activeTab.toUpperCase()} Tasks`}
          </h1>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder={showHistory ? "Search history..." : "Search tasks..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm sm:text-base"
              />
            </div>


            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowHistory(!showHistory);
                  setSearchTerm("");
                  setStartDate("");
                  setEndDate("");
                }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base font-medium text-purple-700 bg-white border border-purple-200 rounded-md hover:bg-purple-50 transition-colors shadow-sm h-10"
              >
                {showHistory ? (
                  <>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    <span>Back to Tasks</span>
                  </>
                ) : (
                  <>
                    <History className="h-4 w-4 mr-1" />
                    <span>View History</span>
                  </>
                )}
              </button>

              {!showHistory && activeTab !== "repair" && (
                <button
                  onClick={handleSubmit}
                  disabled={selectedItems.size === 0 || isSubmitting}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all h-10"
                >
                  {isSubmitting ? "Processing..." : `Submit Selected (${selectedItems.size})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-3 sm:px-4 py-3 rounded-md flex items-center justify-between text-sm sm:text-base animate-in fade-in duration-300">
            <div className="flex items-center">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-green-500 flex-shrink-0" />
              <span className="break-words font-medium">{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage("")} className="text-green-500 hover:text-green-700 ml-2 flex-shrink-0">
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        )}

        {/* Table Container */}
        <div className="rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-3 sm:p-4">
            <h2 className="text-purple-700 font-semibold text-sm sm:text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 inline-block animate-pulse"></span>
              {showHistory ? `Completed ${activeTab} Tasks` : `Pending ${activeTab} Tasks`}
            </h2>
            <p className="text-purple-600 text-xs sm:text-sm mt-1">
              {showHistory
                ? "Read-only view of completed tasks with submission history."
                : `Showing pending tasks for ${userRole === "admin" ? "all users" : "you"}.`}
            </p>
          </div>

          {showHistory && (
            <div className="p-3 sm:p-4 border-b border-purple-100 bg-gray-50 flex flex-col sm:flex-row gap-3 items-center">
              <span className="text-xs sm:text-sm font-medium text-purple-700 whitespace-nowrap">Filter by Range:</span>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
            </div>
          )}

          <div className="overflow-x-auto min-h-[300px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500 mb-2"></div>
                <p className="text-purple-600 text-sm">Loading data...</p>
              </div>
            ) : error ? (
              <div className="py-20 text-center">
                <p className="text-red-500 mb-2 font-medium">{error}</p>
                <button onClick={fetchData} className="text-sm text-purple-600 underline">Try again</button>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {!showHistory && activeTab !== "repair" && (
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left">
                        <input
                          type="checkbox"
                          checked={selectedItems.size === filteredPendingTasks.length && filteredPendingTasks.length > 0}
                          onChange={handleSelectAll}
                          className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                      </th>
                    )}
                    {tableHeaders.map((header) => (
                      <th key={header.id} className={`px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${header.id === 'task_start_date' ? 'bg-yellow-50' : ''}`}>
                        {header.label}
                      </th>
                    ))}
                    {!showHistory && activeTab === "ea" && (
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Extended Date</th>
                    )}
                    {!showHistory && activeTab !== "repair" && activeTab !== "ea" && (
                      <>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Remarks</th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Image</th>
                      </>
                    )}
                    {showHistory && activeTab !== "repair" && (
                      <>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Remarks</th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Attachment</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(showHistory ? filteredHistoryTasks : filteredPendingTasks).length > 0 ? (
                    (showHistory ? filteredHistoryTasks : filteredPendingTasks).map((task) => (
                      <tr key={task.id} className="hover:bg-gray-50">
                        {!showHistory && activeTab !== "repair" && (
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(task.id)}
                              onChange={(e) => handleSelectItem(task.id, e.target.checked)}
                              className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                            />
                          </td>
                        )}
                        {activeTab === "repair" ? (
                          <>
                            {!showHistory ? (
                              <>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                  <button onClick={() => openUpdateModal(task)} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1">
                                    <Edit className="h-3 w-3" /> Process
                                  </button>
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800 font-bold">{task.id}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 min-w-[200px]">
                                  {isAudioUrl(task.issue_description) ? <AudioPlayer url={task.issue_description} /> : task.issue_description}
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.filled_by}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.assigned_person}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.machine_name}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm">
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${task.status === "Pending" ? "bg-yellow-100 text-yellow-800" : task.status === "Completed" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                                    {task.status}
                                  </span>
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.part_replaced || "—"}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.bill_amount ? `₹${task.bill_amount}` : "—"}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800 font-bold">{task.id}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 min-w-[200px]">
                                  {isAudioUrl(task.issue_description) ? <AudioPlayer url={task.issue_description} /> : task.issue_description}
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                  {task.submission_date ? new Date(task.submission_date).toLocaleString() : "—"}
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.filled_by}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.assigned_person}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.machine_name}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm">
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${task.status === "Pending" ? "bg-yellow-100 text-yellow-800" : task.status === "Completed" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                                    {task.status}
                                  </span>
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.part_replaced || "—"}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">{task.bill_amount ? `₹${task.bill_amount}` : "—"}</td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 max-w-xs truncate">{task.remarks || "—"}</td>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {tableHeaders.map((header) => (
                              <td key={header.id} className={`px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 ${header.id === 'task_description' || header.id === 'issue_description' ? 'min-w-[200px] whitespace-normal' : 'whitespace-nowrap'} ${header.id === 'task_start_date' ? 'bg-yellow-50' : ''}`}>
                                {header.id === "task_start_date" || header.id === "created_at" || header.id === "planned_date"
                                  ? (
                                    <div className="flex flex-col">
                                      <span className="font-bold text-gray-900">{formatDate(task[header.id])}</span>
                                      <span className="text-[11px] text-gray-400">{formatTimeOnly(task[header.id])}</span>
                                    </div>
                                  )
                                  : header.id === "submission_date"
                                    ? (activeTab === "maintenance" && showHistory)
                                      ? (
                                        <div className="flex flex-col">
                                          <span className="font-bold text-gray-900">{formatDate(task[header.id])}</span>
                                          <span className="text-[11px] text-gray-400">{formatTimeOnly(task[header.id])}</span>
                                        </div>
                                      )
                                      : formatDateWithTime(task[header.id])
                                    : header.id === "status"
                                      ? !showHistory && (activeTab === "maintenance" || activeTab === "checklist" || activeTab === "ea")
                                        ? (
                                          <select
                                            value={statusData[task.id] || ""}
                                            onChange={(e) => setStatusData(prev => ({ ...prev, [task.id]: e.target.value }))}
                                            disabled={!selectedItems.has(task.id)}
                                            className="block w-full py-1.5 pl-3 pr-8 text-xs sm:text-sm text-gray-700 bg-white border border-gray-200 rounded-md focus:border-purple-500 focus:outline-none disabled:bg-gray-50/50 disabled:text-gray-400 appearance-none shadow-sm cursor-pointer hover:border-gray-300 transition-colors"
                                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}
                                          >
                                            <option value="">Select Status</option>
                                            {activeTab === "ea" ? (
                                              <>
                                                <option value="done">Done</option>
                                                <option value="extended">Extend</option>
                                              </>
                                            ) : (
                                              <>
                                                <option value={activeTab === 'checklist' ? 'yes' : 'Done'}>Done</option>
                                                <option value={activeTab === 'checklist' ? 'no' : 'Not Done'}>Not Done</option>
                                              </>
                                            )}
                                          </select>
                                        )
                                        : <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${task[header.id] === "Done" || task[header.id] === "yes" || task[header.id] === "done" ? "bg-green-100 text-green-800" : task[header.id] === "extended" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}>
                                          {task[header.id]}
                                        </span>
                                      : (header.id === "enable_reminders" || header.id === "require_attachment" || header.id === "enable_reminder")
                                        ? (task[header.id] ? "Yes" : "No")
                                        : header.id === "machine_name"
                                          ? (task.machine_name || (task.task_description ? task.task_description.split(' - ')[0] : "—"))
                                          : isAudioUrl(task[header.id])
                                            ? <AudioPlayer url={task[header.id]} />
                                            : task[header.id] || "—"}
                              </td>
                            ))}
                            {!showHistory && activeTab === "ea" && (
                              <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                <input
                                  type="date"
                                  placeholder="Extended Date"
                                  value={extendedDateData[task.id] || ""}
                                  onChange={(e) => setExtendedDateData((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  className="w-full min-w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:border-purple-400 outline-none text-xs text-gray-700 disabled:opacity-50"
                                  disabled={!selectedItems.has(task.id) || statusData[task.id] !== 'extended'}
                                />
                              </td>
                            )}
                            {!showHistory && activeTab !== "ea" && (
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
                                    <label className={`flex items-center gap-2 cursor-pointer text-xs font-medium transition-colors ${selectedItems.has(task.id) ? "text-purple-600 hover:text-purple-800" : "text-gray-400 cursor-not-allowed"}`}>
                                      <Upload className="h-3.5 w-3.5" />
                                      <span>{uploadedImages[task.id] ? "File Selected" : "Upload Receipt"}</span>
                                      <input
                                        type="file"
                                        className="hidden"
                                        onChange={(e) => handleImageUpload(task.id, e)}
                                        disabled={!selectedItems.has(task.id)}
                                      />
                                    </label>
                                    <label className={`flex items-center gap-2 cursor-pointer text-xs font-medium transition-colors ${selectedItems.has(task.id) ? "text-cyan-500 hover:text-cyan-700" : "text-gray-400 cursor-not-allowed"}`}>
                                      <Camera className="h-3.5 w-3.5" />
                                      <span>Take Photo</span>
                                      <input
                                        type="file"
                                        accept="image/*"
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
                                  {isAudioUrl(task.remark || task.remarks) ? <AudioPlayer url={task.remark || task.remarks} /> : (task.remark || task.remarks || "—")}
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                  {task.image || task.uploaded_image_url || task.image_url ? (
                                    <a href={task.image || task.uploaded_image_url || task.image_url} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">View</a>
                                  ) : "—"}
                                </td>
                              </>
                            )}
                          </>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={tableHeaders.length + (showHistory || activeTab === "repair" ? 1 : 3)} className="px-6 py-20 text-center text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                          <Search size={40} className="text-gray-200" />
                          <p>No {showHistory ? "history" : "pending tasks"} found.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div >

      {/* Repair Update Modal */}
      {isModalOpen && selectedUpdateTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-fade-in border border-purple-100">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b border-purple-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-purple-800 uppercase">Update Ticket #{selectedUpdateTask.id}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-purple-400 hover:text-purple-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleRepairUpdateSubmit} className="p-6">
              <div className="bg-purple-50 rounded border border-purple-200 p-3 mb-6 flex gap-4 text-sm">
                <div className="flex-1">
                  <span className="block text-xs font-bold text-purple-500 uppercase mb-1">Machine</span>
                  <span className="text-gray-800 font-medium">{selectedUpdateTask.machine_name}</span>
                </div>
                <div className="flex-[2]">
                  <span className="block text-xs font-bold text-purple-500 uppercase mb-1">Issue</span>
                  <span className="text-gray-600">{selectedUpdateTask.issue_description}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Status <span className="text-red-500">*</span></label>
                  <select className="w-full p-2 text-sm border border-gray-300 rounded focus:border-purple-500 outline-none" value={updateForm.status} onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value })}>
                    <option value="">Select Status...</option>
                    <option value="Completed">✅ Completed (कार्य पूर्ण)</option>
                    <option value="Pending">⏳ Pending (लंबित कार्य)</option>
                    <option value="Observation">🔍 Under Observation (निरीक्षण)</option>
                    <option value="Temporary Fix">🔄 Temporary Fix (अस्थायी/जुगाड़)</option>
                    <option value="Cancelled">🚫 Cancelled (रद्द)</option>
                  </select>
                </div>

                {/* Conditional Fields for Completed Status */}
                {/* As per request: Part Replaced, Work Done, Vendor Name, Bill Amount, Remarks, Photos */}
                {updateForm.status === 'Completed' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">

                    {/* Part Replaced */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Part Replaced</label>
                      <input
                        className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-purple-500"
                        value={updateForm.partReplaced}
                        onChange={(e) => setUpdateForm({ ...updateForm, partReplaced: e.target.value })}
                        placeholder="Enter part name..."
                      />
                    </div>

                    {/* Work Done & Vendor */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Work Done</label>
                        <select
                          className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-purple-500"
                          value={updateForm.workDone}
                          onChange={(e) => setUpdateForm({ ...updateForm, workDone: e.target.value })}
                        >
                          <option value="">Select work done...</option>
                          <option value="Repairing">Repairing</option>
                          <option value="Replacement">Replacement</option>
                          <option value="Service/Maintenance">Service/Maintenance</option>
                          <option value="Installation">Installation</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vendor Name</label>
                        <input
                          className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-purple-500"
                          value={updateForm.vendorName}
                          onChange={(e) => setUpdateForm({ ...updateForm, vendorName: e.target.value })}
                          placeholder="Enter vendor name..."
                        />
                      </div>
                    </div>

                    {/* Bill Amount */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bill Amount (₹)</label>
                      <input
                        type="number"
                        className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-purple-500"
                        value={updateForm.billAmount}
                        onChange={(e) => setUpdateForm({ ...updateForm, billAmount: e.target.value })}
                        placeholder="Enter bill amount..."
                      />
                    </div>

                    {/* Remarks (Conditional for Completed, but user asked for it in general list. Placing here for Completed flow) */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Remarks</label>
                      <textarea
                        className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-purple-500"
                        rows="2"
                        value={updateForm.remarks}
                        onChange={(e) => setUpdateForm({ ...updateForm, remarks: e.target.value })}
                        placeholder="Enter any additional remarks..."
                      ></textarea>
                    </div>

                    {/* File Uploads */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <Upload className="h-6 w-6 text-gray-400 mb-2" />
                        <span className="text-xs font-bold text-gray-500">Photo of Work Done</span>
                        <span className="text-[10px] text-gray-400 mt-1">{updateForm.workPhoto ? updateForm.workPhoto.name : "Click to upload"}</span>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => setUpdateForm({ ...updateForm, workPhoto: e.target.files[0] })} />
                      </label>

                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <Upload className="h-6 w-6 text-gray-400 mb-2" />
                        <span className="text-xs font-bold text-gray-500">Bill Copy</span>
                        <span className="text-[10px] text-gray-400 mt-1">{updateForm.billCopy ? updateForm.billCopy.name : "Click to upload"}</span>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => setUpdateForm({ ...updateForm, billCopy: e.target.files[0] })} />
                      </label>
                    </div>

                  </div>
                )}

                {/* Remarks for Non-Completed Status */}
                {updateForm.status && updateForm.status !== 'Completed' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Remarks</label>
                    <textarea
                      className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-purple-500"
                      rows="3"
                      value={updateForm.remarks}
                      onChange={(e) => setUpdateForm({ ...updateForm, remarks: e.target.value })}
                      placeholder="Add remarks..."
                    ></textarea>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-gray-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50 text-sm">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded text-sm flex items-center gap-2">{isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AdminLayout>
  );
};

export default AllTasks;