"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchStaffTasksDataApi, getStaffTasksCountApi, getTotalUsersCountApi } from "../redux/api/dashboardApi"
import AdminLayout from '../components/layout/AdminLayout';

function StaffTasksPage() {
    const [dashboardStaffFilter, setDashboardStaffFilter] = useState("all")
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`
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

    const userRole = localStorage.getItem("role")
    const username = localStorage.getItem("user-name")

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1)
        setStaffMembers([])
        setFilteredStaffMembers([])
        setHasMoreData(true)
        setTotalStaffCount(0)
    }, [dashboardStaffFilter, selectedMonth])

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

    // Optimized data loading with parallel requests
    const loadStaffData = useCallback(async (page = 1, append = false) => {
        if (isLoading) return;

        try {
            setIsLoading(true)

            // Load checklist, delegation, and work data in parallel
            if (page === 1) {
                const [checklistData, delegationData, workData, staffCount, usersCount] = await Promise.all([
                    fetchStaffTasksDataApi("checklist", dashboardStaffFilter, null, page, itemsPerPage, selectedMonth),
                    fetchStaffTasksDataApi("delegation", dashboardStaffFilter, null, page, itemsPerPage, selectedMonth),
                    fetchStaffTasksDataApi("work", dashboardStaffFilter, null, page, itemsPerPage, selectedMonth),
                    getStaffTasksCountApi("checklist", dashboardStaffFilter, null, selectedMonth),
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
                    fetchStaffTasksDataApi("checklist", dashboardStaffFilter, null, page, itemsPerPage, selectedMonth),
                    fetchStaffTasksDataApi("delegation", dashboardStaffFilter, null, page, itemsPerPage, selectedMonth),
                    fetchStaffTasksDataApi("work", dashboardStaffFilter, null, page, itemsPerPage, selectedMonth)
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
    }, [dashboardStaffFilter, isLoading, selectedMonth])

    useEffect(() => {
        loadStaffData(1, false)
    }, [dashboardStaffFilter, selectedMonth, loadStaffData])

    // Function to load more data
    const loadMoreData = () => {
        if (!isLoading && hasMoreData) {
            const nextPage = currentPage + 1
            setCurrentPage(nextPage)
            loadStaffData(nextPage, true)
        }
    }

    // Optimized available staff fetching
    useEffect(() => {
        const fetchAvailableStaff = async () => {
            try {
                const [checklistData, delegationData, workData] = await Promise.all([
                    fetchStaffTasksDataApi("checklist", "all", null, 1, 100, selectedMonth),
                    fetchStaffTasksDataApi("delegation", "all", null, 1, 100, selectedMonth),
                    fetchStaffTasksDataApi("work", "all", null, 1, 100, selectedMonth)
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
    }, [userRole, username, selectedMonth])

    // Helper to format dates for DATE START and DATE END columns
    const getMonthDates = () => {
        let year, month;
        if (selectedMonth) {
            [year, month] = selectedMonth.split('-').map(Number);
        } else {
            const now = new Date();
            year = now.getFullYear();
            month = now.getMonth() + 1;
        }
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;
        
        const formatToShow = (dateStr) => {
            const [y, m, d] = dateStr.split("-");
            return `${d}/${m}/${y}`;
        };

        return {
            start: formatToShow(startDate),
            end: formatToShow(endDate)
        };
    };

    const { start: dateStart, end: dateEnd } = getMonthDates();

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

        const { start: dateStart, end: dateEnd } = getMonthDates();

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
                `"${dateStart}"`,
                `"${dateEnd}"`,
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
        link.setAttribute("download", `Staff_MIS_Report_${selectedMonth || "all"}.csv`);
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
                            <div className="flex flex-col sm:flex-row gap-3 items-center">
                                {/* Search Bar */}
                                <div className="w-full sm:w-64">
                                    <input
                                        type="text"
                                        placeholder="Search staff..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full rounded-md border border-purple-200 p-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm"
                                    />
                                </div>

                                {/* Month Picker */}
                                <div className="w-full sm:w-40">
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full rounded-md border border-purple-200 p-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm"
                                    />
                                </div>

                                {/* Staff Filter */}
                                <div className="w-full sm:w-48">
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
                                <button
                                    onClick={handleExportCSV}
                                    disabled={filteredStaffMembers.length === 0}
                                    className="w-full sm:w-auto px-4 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                                {selectedMonth && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                                        Month: {selectedMonth}
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
                                                        <tr key={`${staff.name}-${index}`} className="hover:bg-gray-50">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div>
                                                                    <div className="text-sm font-semibold text-gray-900">{staff.name}</div>
                                                                    <div className="text-xs text-gray-500">{staff.email}</div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                                                {dateStart}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                                                {dateEnd}
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
        </AdminLayout>
    );
}

export default StaffTasksPage;