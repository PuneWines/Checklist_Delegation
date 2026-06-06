"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchStaffTasksDataApi, getStaffTasksCountApi, getTotalUsersCountApi } from "../redux/api/dashboardApi"
import AdminLayout from '../components/layout/AdminLayout';
import supabase from '../SupabaseClient';

function StaffTasksPage() {
    const [dashboardStaffFilter, setDashboardStaffFilter] = useState("all")
    
    // Set default date range to the previous week (Monday to Sunday)
    const [startDate, setStartDate] = useState(() => {
        const today = new Date()
        const dayOfWeek = today.getDay()
        const daysToSubtract = (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + 7
        const prevMonday = new Date(today)
        prevMonday.setDate(today.getDate() - daysToSubtract)
        return prevMonday.toISOString().split('T')[0]
    })
    const [endDate, setEndDate] = useState(() => {
        const today = new Date()
        const dayOfWeek = today.getDay()
        const daysToSubtract = (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + 7
        const prevMonday = new Date(today)
        prevMonday.setDate(today.getDate() - daysToSubtract)
        const prevSunday = new Date(prevMonday)
        prevSunday.setDate(prevMonday.getDate() + 6)
        return prevSunday.toISOString().split('T')[0]
    })
    
    const [currentPage, setCurrentPage] = useState(1)
    const [staffMembers, setStaffMembers] = useState([])
    const [filteredStaffMembers, setFilteredStaffMembers] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [hasMoreData, setHasMoreData] = useState(true)
    const [totalStaffCount, setTotalStaffCount] = useState(0)
    const [totalUsersCount, setTotalUsersCount] = useState(0)
    const [availableStaff, setAvailableStaff] = useState([])
    const [searchQuery, setSearchQuery] = useState("")
    const itemsPerPage = 50

    const [selectedStaff, setSelectedStaff] = useState(null)
    const [modalData, setModalData] = useState([])
    const [isModalLoading, setIsModalLoading] = useState(false)

    const [selectedModule, setSelectedModule] = useState(null)
    const [rawTasks, setRawTasks] = useState([])
    const [subModalFilter, setSubModalFilter] = useState("all")
    const [isSubModalLoading, setIsSubModalLoading] = useState(false)

    const userRole = localStorage.getItem("role")
    const username = localStorage.getItem("user-name")

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1)
        setStaffMembers([])
        setFilteredStaffMembers([])
        setHasMoreData(true)
        setTotalStaffCount(0)
    }, [dashboardStaffFilter, startDate, endDate])

    // Optimized filter function with debouncing
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredStaffMembers(staffMembers)
        } else {
            const query = searchQuery.toLowerCase().trim()
            const filtered = staffMembers.filter(staff =>
                staff.name?.toLowerCase().includes(query) ||
                staff.email?.toLowerCase().includes(query)
            )
            setFilteredStaffMembers(filtered)
        }
    }, [staffMembers, searchQuery])

    // Combine checklist, delegation, and work data
    const combineStaffData = (checklistData, delegationData, workData) => {
        const combinedMap = new Map()

        // Process checklist data
        if (checklistData) {
            checklistData.forEach(staff => {
                const total = staff.totalTasks || staff.total_tasks || 0
                const completed = staff.completedTasks || staff.total_completed_tasks || 0
                const pending = staff.pendingTasks || (total - completed) || 0
                const progress = staff.progress || staff.completion_score || 0
                const doneOnTime = staff.total_done_on_time || 0
                combinedMap.set(staff.name, {
                    ...staff,
                    checklistTotal: total,
                    checklistCompleted: completed,
                    checklistPending: pending,
                    checklistProgress: progress,
                    checklistDoneOnTime: doneOnTime
                })
            })
        }

        // Process delegation data
        if (delegationData) {
            delegationData.forEach(staff => {
                const total = staff.totalTasks || staff.total_tasks || 0
                const completed = staff.completedTasks || staff.total_completed_tasks || 0
                const pending = staff.pendingTasks || (total - completed) || 0
                const progress = staff.progress || staff.completion_score || 0
                const doneOnTime = staff.total_done_on_time || 0

                const existing = combinedMap.get(staff.name)
                if (existing) {
                    combinedMap.set(staff.name, {
                        ...existing,
                        delegationTotal: total,
                        delegationCompleted: completed,
                        delegationPending: pending,
                        delegationProgress: progress,
                        delegationDoneOnTime: doneOnTime
                    })
                } else {
                    combinedMap.set(staff.name, {
                        ...staff,
                        name: staff.name,
                        email: staff.email,
                        checklistTotal: 0,
                        checklistCompleted: 0,
                        checklistPending: 0,
                        checklistProgress: 0,
                        checklistDoneOnTime: 0,
                        delegationTotal: total,
                        delegationCompleted: completed,
                        delegationPending: pending,
                        delegationProgress: progress,
                        delegationDoneOnTime: doneOnTime
                    })
                }
            })
        }

        // Process work data
        if (workData) {
            workData.forEach(staff => {
                const total = staff.totalTasks || staff.total_tasks || 0
                const completed = staff.completedTasks || staff.total_completed_tasks || 0
                const pending = staff.pendingTasks || (total - completed) || 0
                const progress = staff.progress || staff.completion_score || 0
                const doneOnTime = staff.total_done_on_time || 0

                const existing = combinedMap.get(staff.name)
                if (existing) {
                    combinedMap.set(staff.name, {
                        ...existing,
                        workTotal: total,
                        workCompleted: completed,
                        workPending: pending,
                        workProgress: progress,
                        workDoneOnTime: doneOnTime
                    })
                } else {
                    combinedMap.set(staff.name, {
                        ...staff,
                        name: staff.name,
                        email: staff.email,
                        checklistTotal: 0,
                        checklistCompleted: 0,
                        checklistPending: 0,
                        checklistProgress: 0,
                        checklistDoneOnTime: 0,
                        delegationTotal: 0,
                        delegationCompleted: 0,
                        delegationPending: 0,
                        delegationProgress: 0,
                        delegationDoneOnTime: 0,
                        workTotal: total,
                        workCompleted: completed,
                        workPending: pending,
                        workProgress: progress,
                        workDoneOnTime: doneOnTime
                    })
                }
            })
        }

        // Calculate combined totals and return array
        return Array.from(combinedMap.values()).map(staff => {
            const checklistTotal = staff.checklistTotal || 0
            const checklistCompleted = staff.checklistCompleted || 0
            const checklistPending = staff.checklistPending || 0
            const checklistDoneOnTime = staff.checklistDoneOnTime || 0

            const delegationTotal = staff.delegationTotal || 0
            const delegationCompleted = staff.delegationCompleted || 0
            const delegationPending = staff.delegationPending || 0
            const delegationDoneOnTime = staff.delegationDoneOnTime || 0

            const workTotal = staff.workTotal || 0
            const workCompleted = staff.workCompleted || 0
            const workPending = staff.workPending || 0
            const workDoneOnTime = staff.workDoneOnTime || 0

            const totalTasks = checklistTotal + delegationTotal + workTotal
            const completed = checklistCompleted + delegationCompleted + workCompleted
            const pending = checklistPending + delegationPending + workPending
            const doneOnTime = checklistDoneOnTime + delegationDoneOnTime + workDoneOnTime
            const progress = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0
            const ontimeScore = totalTasks > 0 ? Math.round((doneOnTime / totalTasks) * 100) : 0

            return {
                ...staff,
                checklistTotal,
                checklistCompleted,
                checklistPending,
                checklistDoneOnTime,
                delegationTotal,
                delegationCompleted,
                delegationPending,
                delegationDoneOnTime,
                workTotal,
                workCompleted,
                workPending,
                workDoneOnTime,
                totalTasks,
                completedTasks: completed,
                pendingTasks: pending,
                doneOnTime,
                progress,
                ontimeScore
            }
        })
    }

    // Optimized data loading with parallel requests using Date Range parameters
    const loadStaffData = useCallback(async (page = 1, append = false) => {
        if (isLoading) return;

        try {
            setIsLoading(true)

            // Load checklist, delegation, and work data in parallel using custom Date Range
            if (page === 1) {
                const [checklistData, delegationData, workData, staffCount, usersCount] = await Promise.all([
                    fetchStaffTasksDataApi("checklist", dashboardStaffFilter, null, page, itemsPerPage, null, startDate, endDate),
                    fetchStaffTasksDataApi("delegation", dashboardStaffFilter, null, page, itemsPerPage, null, startDate, endDate),
                    fetchStaffTasksDataApi("work", dashboardStaffFilter, null, page, itemsPerPage, null, startDate, endDate),
                    getStaffTasksCountApi("checklist", dashboardStaffFilter, null, null, startDate, endDate),
                    getTotalUsersCountApi()
                ]);

                setTotalStaffCount(staffCount)
                setTotalUsersCount(usersCount)

                const combinedData = combineStaffData(checklistData, delegationData, workData)

                if (!combinedData || combinedData.length === 0) {
                    setHasMoreData(false)
                    setStaffMembers([])
                    setFilteredStaffMembers([])
                    return
                }

                setStaffMembers(combinedData)
                setFilteredStaffMembers(combinedData)
                setHasMoreData(combinedData.length === itemsPerPage)
            } else {
                // For subsequent pages, load all data types
                const [checklistData, delegationData, workData] = await Promise.all([
                    fetchStaffTasksDataApi("checklist", dashboardStaffFilter, null, page, itemsPerPage, null, startDate, endDate),
                    fetchStaffTasksDataApi("delegation", dashboardStaffFilter, null, page, itemsPerPage, null, startDate, endDate),
                    fetchStaffTasksDataApi("work", dashboardStaffFilter, null, page, itemsPerPage, null, startDate, endDate)
                ])

                const combinedData = combineStaffData(checklistData, delegationData, workData)

                if (!combinedData || combinedData.length === 0) {
                    setHasMoreData(false)
                    return
                }

                setStaffMembers(prev => {
                    const newStaff = [...prev, ...combinedData]
                    setFilteredStaffMembers(newStaff)
                    return newStaff
                })
                setHasMoreData(combinedData.length === itemsPerPage)
            }

        } catch (error) {
            console.error('Error loading staff data:', error)
        } finally {
            setIsLoading(false)
        }
    }, [dashboardStaffFilter, isLoading, startDate, endDate])

    useEffect(() => {
        loadStaffData(1, false)
    }, [dashboardStaffFilter, startDate, endDate, loadStaffData])

    // Function to load more data
    const loadMoreData = () => {
        if (!isLoading && hasMoreData) {
            const nextPage = currentPage + 1
            setCurrentPage(nextPage)
            loadStaffData(nextPage, true)
        }
    }

    // Optimized available staff fetching based on custom Date Range
    useEffect(() => {
        const fetchAvailableStaff = async () => {
            try {
                const [checklistData, delegationData, workData] = await Promise.all([
                    fetchStaffTasksDataApi("checklist", "all", null, 1, 100, null, startDate, endDate),
                    fetchStaffTasksDataApi("delegation", "all", null, 1, 100, null, startDate, endDate),
                    fetchStaffTasksDataApi("work", "all", null, 1, 100, null, startDate, endDate)
                ])

                const combinedData = combineStaffData(checklistData, delegationData, workData)
                const uniqueStaff = [...new Set(combinedData.map(staff => staff.name).filter(Boolean))]

                if (userRole !== "admin" && username) {
                    if (!uniqueStaff.some(staff => staff.toLowerCase() === username.toLowerCase())) {
                        uniqueStaff.push(username)
                    }
                }

                setAvailableStaff(uniqueStaff)
            } catch (error) {
                console.error('Error fetching staff:', error)
            }
        }

        fetchAvailableStaff()
    }, [userRole, username, startDate, endDate])

    // Helper to format dates for DATE START and DATE END columns
    const formatToShow = (dateStr) => {
        if (!dateStr) return "";
        const [y, m, d] = dateStr.split("-");
        return `${d}/${m}/${y}`;
    };

    const dateStartFormatted = formatToShow(startDate);
    const dateEndFormatted = formatToShow(endDate);

    const getStatusBadge = (ontimeScore, totalTasks) => {
        if (totalTasks === 0) {
            return (
                <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                    N/A
                </span>
            );
        }
        if (ontimeScore >= 95) {
            return (
                <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full bg-green-50 text-green-700 border border-green-200 uppercase whitespace-nowrap">
                    &gt;95% PERF
                </span>
            );
        }
        if (ontimeScore >= 90) {
            return (
                <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase whitespace-nowrap">
                    90-95% PERF
                </span>
            );
        }
        if (ontimeScore >= 80) {
            return (
                <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase whitespace-nowrap">
                    80-90% PERF
                </span>
            );
        }
        if (ontimeScore >= 60) {
            return (
                <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 uppercase whitespace-nowrap">
                    60-80% PERF
                </span>
            );
        }
        return (
            <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200 uppercase whitespace-nowrap">
                &lt;60% PERF
            </span>
        );
    };

    const getInitials = (name) => {
        if (!name) return "";
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    // Format a raw ISO date string as DD/MM/YYYY HH:mm:ss
    const formatDateTime = (dateStr) => {
        if (!dateStr) return "—";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "—";
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    // Calculate delay as HH:mm:ss between planned and actual (actual - planned)
    const calcDelay = (plannedStr, actualStr) => {
        if (!plannedStr || !actualStr) return null;
        const planned = new Date(plannedStr);
        const actual = new Date(actualStr);
        if (isNaN(planned.getTime()) || isNaN(actual.getTime())) return null;
        const diffMs = actual.getTime() - planned.getTime();
        if (diffMs <= 0) return null; // on time or early
        const totalSecs = Math.floor(diffMs / 1000);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    };

    // Format a date string (YYYY-MM-DD or ISO timestamp) as DD/MM/YYYY
    const formatDateOnly = (dateStr) => {
        if (!dateStr) return "—";
        if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [y, m, d] = dateStr.split("-");
            return `${d}/${m}/${y}`;
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "—";
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };

    // Calculate delay in days between planned and actual (date-only comparison)
    const calcDayDelay = (plannedStr, actualStr) => {
        if (!plannedStr || !actualStr) return null;
        const planned = new Date(plannedStr);
        const actual = new Date(actualStr);
        if (isNaN(planned.getTime()) || isNaN(actual.getTime())) return null;

        // Reset times to midnight to calculate pure day difference
        const plannedDay = new Date(planned.getFullYear(), planned.getMonth(), planned.getDate());
        const actualDay = new Date(actual.getFullYear(), actual.getMonth(), actual.getDate());

        const diffMs = actualDay.getTime() - plannedDay.getTime();
        if (diffMs <= 0) return null; // on time or early

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return `${diffDays} Day${diffDays > 1 ? 's' : ''}`;
    };

    // Determine per-task status: 'ontime', 'delay', 'pending'
    const getTaskStatus = (task, moduleId) => {
        const planned = task.planned_date || task.task_start_date || task.current_date;
        const actual = task.submission_date;
        if (!actual) return "pending";
        const plannedDate = new Date(planned);
        const actualDate = new Date(actual);
        // Compare date only (ignore time) for on-time check
        const plannedDay = new Date(plannedDate.getFullYear(), plannedDate.getMonth(), plannedDate.getDate());
        const actualDay = new Date(actualDate.getFullYear(), actualDate.getMonth(), actualDate.getDate());
        return actualDay <= plannedDay ? "ontime" : "delay";
    };

    const MODULE_TABLE_MAP = {
        checklist: "checklist",
        delegation: "delegation",
        work: "work_task",
        maintenance: "maintenance_tasks",
        repair: "repair_tasks",
        ea: "ea_tasks",
    };

    const MODULE_NAME_FIELD = {
        checklist: "name",
        delegation: "name",
        work: "name",
        maintenance: "name",
        repair: "assigned_person",
        ea: "doer_name",
    };

    const MODULE_DATE_COL = {
        checklist: "planned_date",
        delegation: "planned_date",
        work: "current_date",
        maintenance: "planned_date",
        repair: "created_at",
        ea: "planned_date",
    };

    // Modules whose date column stores bare dates (YYYY-MM-DD) vs ISO timestamps
    const MODULE_DATE_IS_DATEONLY = new Set(["checklist", "work"]);

    const MODULE_TASK_LABEL_FIELD = {
        checklist: "task_description",
        delegation: "task_description",
        work: "task_description",
        maintenance: "task_description",
        repair: "issue_description",
        ea: "task_description",
    };

    const handleModuleRowClick = async (row) => {
        setSelectedModule(row);
        setSubModalFilter("all");
        setRawTasks([]);
        setIsSubModalLoading(true);

        try {
            const table = MODULE_TABLE_MAP[row.id];
            const nameField = MODULE_NAME_FIELD[row.id];
            const dateCol = MODULE_DATE_COL[row.id];
            const staffName = selectedStaff?.name;

            if (!table || !staffName) return;

            const { data, error } = await supabase
                .from(table)
                .select("*")
                .eq(nameField, staffName)
                .gte(dateCol, MODULE_DATE_IS_DATEONLY.has(row.id) ? startDate : `${startDate}T00:00:00`)
                .lte(dateCol, MODULE_DATE_IS_DATEONLY.has(row.id) ? endDate : `${endDate}T23:59:59`)
                .order(dateCol, { ascending: true });

            if (error) throw error;
            setRawTasks(data || []);
        } catch (err) {
            console.error("Error fetching raw tasks:", err);
            setRawTasks([]);
        } finally {
            setIsSubModalLoading(false);
        }
    };

    const handleRowClick = async (staff) => {
        setSelectedStaff(staff);
        setIsModalLoading(true);
        setModalData([]);

        try {
            const modules = [
                { id: "checklist", label: "Checklist", fmsName: "All Checklist & Delegation", dept: "Checklist & Delegation" },
                { id: "delegation", label: "Delegation", fmsName: "All Checklist & Delegation", dept: "Checklist & Delegation" },
                { id: "work", label: "Work Task", fmsName: "All Work Task", dept: "Work Task" },
                { id: "maintenance", label: "Maintenance", fmsName: "All Maintenance", dept: "Maintenance" },
                { id: "repair", label: "Repair", fmsName: "All Repair", dept: "Repair" },
                { id: "ea", label: "EA", fmsName: "All EA", dept: "EA" }
            ];

            const results = await Promise.all(
                modules.map(mod => 
                    fetchStaffTasksDataApi(mod.id, staff.name, null, 1, 100, null, startDate, endDate)
                )
            );

            const yearSuffix = startDate ? ` ${new Date(startDate).getFullYear()}` : "";
            const rows = [];

            modules.forEach((mod, index) => {
                const data = results[index] || [];
                const staffSum = data.find(item => item.name?.toLowerCase() === staff.name?.toLowerCase());

                if (staffSum && staffSum.total_tasks > 0) {
                    const target = staffSum.total_tasks;
                    const achievement = staffSum.total_completed_tasks;
                    const doneOnTime = staffSum.total_done_on_time;
                    
                    const workNotDone = target > 0 ? ((achievement - target) / target) * 100 : 0;
                    const workNotDoneOnTime = target > 0 ? ((doneOnTime - target) / target) * 100 : 0;
                    const pending = target - achievement;

                    rows.push({
                        id: mod.id,
                        fmsName: `${mod.fmsName}${yearSuffix}`,
                        taskName: `${mod.label} Task - ${staff.name}`,
                        department: mod.dept,
                        target,
                        achievement,
                        workNotDone,
                        workNotDoneOnTime,
                        pending
                    });
                }
            });

            setModalData(rows);
        } catch (error) {
            console.error("Error loading staff task details:", error);
        } finally {
            setIsModalLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (filteredStaffMembers.length === 0) return;

        const headers = [
            "Name",
            "Email",
            "Date Start",
            "Date End",
            "Target",
            "Actual Work Done %",
            "Work Not Done %",
            "Work Not Done On Time %",
            "Total Done",
            "Pending",
            "Performance Status"
        ];

        const csvRows = [
            headers.join(",")
        ];

        filteredStaffMembers.forEach(staff => {
            const workNotDone = 100 - staff.progress;
            const workNotDoneOnTime = staff.totalTasks > 0 ? Math.round(((staff.totalTasks - staff.doneOnTime) / staff.totalTasks) * 100) : 0;
            
            let statusText = "N/A";
            if (staff.totalTasks > 0) {
                if (staff.ontimeScore >= 95) statusText = ">95% PERF";
                else if (staff.ontimeScore >= 90) statusText = "90-95% PERF";
                else if (staff.ontimeScore >= 80) statusText = "80-90% PERF";
                else if (staff.ontimeScore >= 60) statusText = "60-80% PERF";
                else statusText = "<60% PERF";
            }

            const rowValues = [
                `"${(staff.name || "").replace(/"/g, '""')}"`,
                `"${(staff.email || "").replace(/"/g, '""')}"`,
                `"${dateStartFormatted}"`,
                `"${dateEndFormatted}"`,
                staff.totalTasks,
                `"${staff.progress}%"`,
                `"${workNotDone}%"`,
                `"${workNotDoneOnTime}%"`,
                staff.completedTasks,
                staff.pendingTasks,
                `"${statusText}"`
            ];

            csvRows.push(rowValues.join(","));
        });

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;\uFEFF" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Staff_MIS_Report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header Section */}
                <div className="bg-white rounded-lg border border-purple-200 shadow-md">
                    <div className="p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            {/* Title Section */}
                            <div className="flex-1">
                                <h1 className="text-2xl font-bold text-purple-700">Staff MIS Report</h1>
                                <p className="text-sm text-gray-600 mt-1">Combined Task Management System Data</p>
                            </div>

                            {/* Filters Section */}
                            <div className="flex flex-col xl:flex-row gap-3 items-center w-full xl:w-auto">
                                {/* Search Bar */}
                                <div className="w-full sm:w-60">
                                    <input
                                        type="text"
                                        placeholder="Search staff..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full rounded-md border border-purple-200 p-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm"
                                    />
                                </div>

                                {/* Date Range Pickers */}
                                <div className="flex flex-col sm:flex-row gap-2 items-center w-full sm:w-auto">
                                    <div className="flex items-center gap-1 w-full sm:w-auto">
                                        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">From:</span>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="rounded-md border border-purple-200 p-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm w-full sm:w-36"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1 w-full sm:w-auto">
                                        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">To:</span>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="rounded-md border border-purple-200 p-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm w-full sm:w-36"
                                        />
                                    </div>
                                </div>

                                {/* Staff Filter */}
                                <div className="w-full sm:w-44">
                                    <select
                                        value={dashboardStaffFilter}
                                        onChange={(e) => setDashboardStaffFilter(e.target.value)}
                                        className="w-full rounded-md border border-purple-200 p-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm"
                                    >
                                        <option value="all">All Staff</option>
                                        {availableStaff.map((staff) => (
                                            <option key={staff} value={staff}>
                                                {staff}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Export CSV Button */}
                                <div className="w-full sm:w-auto">
                                    <button
                                        onClick={handleExportCSV}
                                        disabled={filteredStaffMembers.length === 0}
                                        className="w-full px-4 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                        </svg>
                                        Export CSV
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Staff Tasks Table */}
                <div className="rounded-lg border border-purple-200 shadow-md bg-white">
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-purple-700 font-medium">Staff Performance Details</h3>
                                <p className="text-xs text-gray-600">Showing combined checklist, delegation and work tasks data</p>
                            </div>

                            {/* Active Filters Display */}
                            <div className="flex gap-2">
                                {startDate && endDate && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                                        Period: {dateStartFormatted} - {dateEndFormatted}
                                    </span>
                                )}
                                {dashboardStaffFilter !== "all" && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                        Staff: {dashboardStaffFilter}
                                    </span>
                                )}
                                {searchQuery && (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                        Search: "{searchQuery}"
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4">
                        <div className="space-y-4">
                            {/* Show total counts */}
                            <div className="text-sm text-gray-600">
                                {searchQuery ? (
                                    `Showing ${filteredStaffMembers.length} of ${staffMembers.length} staff members`
                                ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <span>Total Users: <strong>{totalUsersCount}</strong></span>
                                        <span className="hidden sm:inline">•</span>
                                        <span>Showing: <strong>{staffMembers.length}</strong>{hasMoreData && '+'}</span>
                                    </div>
                                )}
                            </div>

                            {filteredStaffMembers.length === 0 && !isLoading ? (
                                <div className="text-center p-8 text-gray-500">
                                    {searchQuery ? (
                                        <div>
                                            <p>No staff members found matching "{searchQuery}"</p>
                                            <p className="text-sm mt-2">Try adjusting your search terms</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <p>No staff data found.</p>
                                            {dashboardStaffFilter !== "all" && (
                                                <p className="text-sm mt-2">Try selecting "All Staff" to see more results.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div
                                        className="staff-table-container rounded-md border border-gray-200 overflow-auto"
                                        style={{ maxHeight: "500px" }}
                                    >
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50 sticky top-0 z-10">
                                                <tr>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        Name
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        Date Start
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        Date End
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                                                        Target
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        Actual Work Done
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        % Work Not Done
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        % Work Not Done On Time
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                                                        Total Done
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                                                        Pending
                                                    </th>
                                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        Status
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {filteredStaffMembers.map((staff, index) => {
                                                    const workNotDone = 100 - staff.progress;
                                                    const workNotDoneOnTime = staff.totalTasks > 0 ? Math.round(((staff.totalTasks - staff.doneOnTime) / staff.totalTasks) * 100) : 0;

                                                    return (
                                                        <tr 
                                                            key={`${staff.name}-${index}`} 
                                                            className="hover:bg-gray-50 cursor-pointer"
                                                            onClick={() => handleRowClick(staff)}
                                                        >
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div>
                                                                    <div className="text-sm font-semibold text-gray-900">{staff.name}</div>
                                                                    <div className="text-xs text-gray-500">{staff.email}</div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                                                {dateStartFormatted}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                                                {dateEndFormatted}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold text-center">
                                                                {staff.totalTasks}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-[100px] bg-gray-100 rounded-full h-2">
                                                                        <div
                                                                            className="bg-blue-600 h-2 rounded-full"
                                                                            style={{ width: `${staff.progress}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-gray-700 min-w-[36px] text-right">{staff.progress}%</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-[100px] bg-gray-100 rounded-full h-2">
                                                                        <div
                                                                            className="bg-gray-300 h-2 rounded-full"
                                                                            style={{ width: `${workNotDone}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-gray-700 min-w-[36px] text-right">{workNotDone}%</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-[100px] bg-gray-100 rounded-full h-2">
                                                                        <div
                                                                            className="bg-gray-300 h-2 rounded-full"
                                                                            style={{ width: `${workNotDoneOnTime}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-gray-700 min-w-[36px] text-right">{workNotDoneOnTime}%</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className="inline-flex items-center justify-center px-4 py-1.5 bg-blue-50 text-blue-600 font-bold rounded-md border border-blue-200 text-sm min-w-[64px]">
                                                                    {staff.completedTasks}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className="inline-flex items-center justify-center px-4 py-1.5 bg-gray-50 text-gray-600 font-bold rounded-md border border-gray-200 text-sm min-w-[64px]">
                                                                    {staff.pendingTasks}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {getStatusBadge(staff.ontimeScore, staff.totalTasks)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Load More Button */}
                                    {hasMoreData && !searchQuery && (
                                        <div className="flex justify-center mt-4">
                                            <button
                                                onClick={loadMoreData}
                                                disabled={isLoading}
                                                className="px-6 py-2 text-black rounded-md transition-colors flex items-center gap-2 border border-purple-200 bg-white hover:bg-purple-50"
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                                                        Loading...
                                                    </>
                                                ) : (
                                                    `Load More (${Math.min(itemsPerPage, totalStaffCount - staffMembers.length)} more)`
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {!hasMoreData && staffMembers.length > 0 && !searchQuery && (
                                        <div className="text-center py-4 text-sm text-gray-500">
                                            All {staffMembers.length} staff members loaded
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedStaff && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div id="printable-modal-area" className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-5xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-6 flex items-center justify-between border-b border-gray-100 no-print">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
                                    {getInitials(selectedStaff.name)}
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">{selectedStaff.name}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* PRINT BUTTON — commented out
                                <button
                                    onClick={() => window.print()}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h6z"></path>
                                    </svg>
                                    Print Tasks
                                </button>
                                */}
                                <button
                                    onClick={() => setSelectedStaff(null)}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Print-only Header (hidden on screen, shown in print) */}
                        <div className="hidden print:flex items-center gap-4 p-6 border-b border-gray-300">
                            <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xl border border-gray-400">
                                {getInitials(selectedStaff.name)}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-950">{selectedStaff.name}</h2>
                                <p className="text-xs text-gray-500">Staff Task Performance Details (Period: {dateStartFormatted} - {dateEndFormatted})</p>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Task Details</h3>
                            {isModalLoading ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-3">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
                                    <p className="text-sm text-gray-500 font-medium">Loading task details...</p>
                                </div>
                            ) : modalData.length === 0 ? (
                                <div className="py-12 text-center text-gray-500">
                                    No detailed task data found for {selectedStaff.name} in this period.
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                {["FMS Name", "Task Name", "Department", "Target", "Total Achievement", "% Work Not Done", "% Work Not Done On Time", "All Pending Till Date"].map((hdr, idx) => (
                                                    <th 
                                                        key={hdr} 
                                                        scope="col" 
                                                        className={`px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider ${
                                                            idx < 3 ? "text-left" : "text-center"
                                                        }`}
                                                    >
                                                        {hdr}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {modalData.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                                                    onClick={() => handleModuleRowClick(row)}
                                                    title="Click to view individual tasks"
                                                >
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 font-medium text-left">{row.fmsName}</td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-700 font-semibold text-left underline-offset-2 hover:underline">{row.taskName}</td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium text-left">{row.department}</td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-bold text-center">{row.target}</td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                                                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                            row.achievement < row.target
                                                                ? "bg-red-50 text-red-700 border border-red-200"
                                                                : "bg-green-50 text-green-700 border border-green-200"
                                                        }`}>
                                                            {row.achievement}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-bold text-center">
                                                        {row.workNotDone === 0 ? "0" : `${row.workNotDone > 0 ? "+" : ""}${Number(row.workNotDone.toFixed(2))}`}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-bold text-center">
                                                        {row.workNotDoneOnTime === 0 ? "0" : `${row.workNotDoneOnTime > 0 ? "+" : ""}${Number(row.workNotDoneOnTime.toFixed(2))}`}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-950 font-bold text-center">{row.pending}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end no-print">
                            <button
                                onClick={() => setSelectedStaff(null)}
                                className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 text-sm font-semibold rounded-md border border-gray-300 hover:border-gray-400 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Sub-Modal: Individual Task List ── */}
            {selectedModule && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-3xl w-full flex flex-col overflow-hidden max-h-[88vh]">
                        {/* Sub-Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Total Achievement Details</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {selectedModule.taskName}
                                    {" • "}
                                    <span className="font-semibold text-blue-600">
                                        Total Tasks: {rawTasks.length}
                                    </span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Filter Pills */}
                                {["all", "ontime", "pending", "delay"].map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => setSubModalFilter(f)}
                                        className={`px-3 py-1 rounded text-xs font-bold transition-colors border ${
                                            subModalFilter === f
                                                ? f === "all"
                                                    ? "bg-gray-800 text-white border-gray-800"
                                                    : f === "ontime"
                                                    ? "bg-green-600 text-white border-green-600"
                                                    : f === "pending"
                                                    ? "bg-amber-500 text-white border-amber-500"
                                                    : "bg-orange-500 text-white border-orange-500"
                                                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                                        }`}
                                    >
                                        {f === "all" ? "All" : f === "ontime" ? "On Time" : f === "pending" ? "Pending" : "Delay"}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setSelectedModule(null)}
                                    className="ml-1 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Sub-Modal Body */}
                        <div className="overflow-y-auto flex-1">
                            {isSubModalLoading ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-3">
                                    <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-600"></div>
                                    <p className="text-sm text-gray-500">Loading tasks...</p>
                                </div>
                            ) : rawTasks.length === 0 ? (
                                <div className="py-12 text-center text-gray-500 text-sm">
                                    No tasks found for {selectedStaff?.name} in this period.
                                </div>
                            ) : (() => {
                                const filtered = rawTasks.filter(task => {
                                    if (subModalFilter === "all") return true;
                                    const status = getTaskStatus(task, selectedModule.id);
                                    return status === subModalFilter;
                                });
                                const labelField = MODULE_TASK_LABEL_FIELD[selectedModule.id] || "task_description";
                                const plannedField = MODULE_DATE_COL[selectedModule.id] || "planned_date";
                                return (
                                    <table className="min-w-full">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Task Name</th>
                                                <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Planned</th>
                                                <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actual</th>
                                                <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Delay</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-orange-50">
                                            {filtered.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">
                                                        No tasks match the selected filter.
                                                    </td>
                                                </tr>
                                            ) : filtered.map((task, idx) => {
                                                const isWorkModule = selectedModule.id === "work";
                                                const planned = task[plannedField] || task.planned_date || task.task_start_date;
                                                const actual = task.submission_date;
                                                const delay = isWorkModule
                                                    ? calcDayDelay(planned, actual)
                                                    : calcDelay(planned, actual);
                                                const status = getTaskStatus(task, selectedModule.id);
                                                const taskLabel = task[labelField] || task.task_description || task.issue_description || "(no description)";
                                                return (
                                                    <tr
                                                        key={task.task_id || task.id || idx}
                                                        className="bg-orange-50/40 hover:bg-orange-50/80 transition-colors"
                                                    >
                                                        <td className="px-5 py-3.5">
                                                            <span className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide">
                                                                • {taskLabel}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                                            <span className="text-xs text-gray-700 font-mono">
                                                                {isWorkModule ? formatDateOnly(planned) : formatDateTime(planned)}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                                            {actual ? (
                                                                <span className="text-xs text-gray-700 font-mono">{formatDateTime(actual)}</span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Pending</span>
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                                            {delay ? (
                                                                <span className={`text-xs font-bold font-mono ${
                                                                    isWorkModule ? "text-red-600" : "text-orange-600"
                                                                }`}>{delay}</span>
                                                            ) : status === "pending" ? (
                                                                <span className="text-xs text-gray-400">—</span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">On Time</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                );
                            })()}
                        </div>

                        {/* Sub-Modal Footer */}
                        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setSelectedModule(null)}
                                className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 text-sm font-semibold rounded-md border border-gray-300 hover:border-gray-400 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Dynamic CSS Print Styles */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    body > * {
                        display: none !important;
                    }
                    #printable-modal-area {
                        display: block !important;
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        border: none !important;
                        box-shadow: none !important;
                        max-height: none !important;
                        background: white;
                        color: black;
                        z-index: 9999;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}} />
        </AdminLayout>
    );
}

export default StaffTasksPage;