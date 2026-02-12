"use client"

import { Filter, ChevronDown, ChevronUp } from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { fetchDashboardDataApi, getDashboardDataCount } from "../../../redux/api/dashboardApi"

export default function TaskNavigationTabs({
  dashboardType,
  taskView,
  setTaskView,
  searchQuery,
  setSearchQuery,
  filterStaff,
  setFilterStaff,
  departmentData,
  getFrequencyColor,
  dashboardStaffFilter,
  departmentFilter // Add this prop
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [displayedTasks, setDisplayedTasks] = useState([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreData, setHasMoreData] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [isFilterExpanded, setIsFilterExpanded] = useState(false) // Add this state
  const itemsPerPage = 50

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1)
    setDisplayedTasks([])
    setHasMoreData(true)
    setTotalCount(0)
  }, [taskView, dashboardType, dashboardStaffFilter, departmentFilter]) // Add departmentFilter

  // Function to load tasks from server
  const loadTasksFromServer = useCallback(async (page = 1, append = false) => {
    if (isLoadingMore) return;

    try {
      setIsLoadingMore(true)

      console.log('Loading tasks with filters:', {
        dashboardType,
        dashboardStaffFilter,
        taskView,
        page,
        departmentFilter
      });

      // Use departmentFilter for server call (only affects table data)
      const data = await fetchDashboardDataApi(
        dashboardType,
        dashboardStaffFilter,
        page,
        itemsPerPage,
        taskView,
        departmentFilter // Pass department filter to API
      )

      // Get total count for this view (only on first load)
      if (page === 1) {
        const count = await getDashboardDataCount(dashboardType, dashboardStaffFilter, taskView, departmentFilter)
        setTotalCount(count)
      }

      if (!data || data.length === 0) {
        setHasMoreData(false)
        if (!append) {
          setDisplayedTasks([])
        }
        setIsLoadingMore(false)
        return
      }

      console.log('Raw data received:', data.length, 'records');

      // Process the data similar to your existing logic
      const processedTasks = data.map((task) => {
        const taskStartDate = parseTaskStartDate(task.task_start_date)
        const completionDate = task.submission_date ? parseTaskStartDate(task.submission_date) : null

        let status = "pending"
        if (completionDate || task.status === 'yes') {
          status = "completed"
        } else if (taskStartDate && isDateInPast(taskStartDate)) {
          status = "overdue"
        }

        return {
          id: task.id,
          title: task.task_description,
          assignedTo: task.name || "Unassigned",
          taskStartDate: formatDateToDDMMYYYY(taskStartDate),
          originalTaskStartDate: task.task_start_date,
          status,
          frequency: task.frequency || "one-time",
          rating: task.color_code_for || 0,
          department: task.department || "N/A", // Add department field
        }
      })

      console.log('Processed tasks:', processedTasks.length, 'records');

      // Apply client-side search filter if needed
      let filteredTasks = processedTasks.filter((task) => {
        if (searchQuery && searchQuery.trim() !== "") {
          const query = searchQuery.toLowerCase().trim()
          return (
            (task.title && task.title.toLowerCase().includes(query)) ||
            (task.id && task.id.toString().includes(query)) ||
            (task.assignedTo && task.assignedTo.toLowerCase().includes(query))
          )
        }
        return true
      })

      console.log('Final filtered tasks:', filteredTasks.length, 'records');

      if (append) {
        setDisplayedTasks(prev => [...prev, ...filteredTasks])
      } else {
        setDisplayedTasks(filteredTasks)
      }

      // Check if we have more data
      setHasMoreData(data.length === itemsPerPage)

    } catch (error) {
      console.error('Error loading tasks:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [dashboardType, dashboardStaffFilter, taskView, searchQuery, departmentFilter, isLoadingMore, itemsPerPage])

  // Helper functions
  const parseTaskStartDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return null

    if (dateStr.includes("-") && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      const parsed = new Date(dateStr)
      return isNaN(parsed) ? null : parsed
    }

    if (dateStr.includes("/")) {
      const parts = dateStr.split(" ")
      const datePart = parts[0]
      const dateComponents = datePart.split("/")
      if (dateComponents.length !== 3) return null

      const [day, month, year] = dateComponents.map(Number)
      if (!day || !month || !year) return null

      const date = new Date(year, month - 1, day)
      if (parts.length > 1) {
        const timePart = parts[1]
        const timeComponents = timePart.split(":")
        if (timeComponents.length >= 2) {
          const [hours, minutes, seconds] = timeComponents.map(Number)
          date.setHours(hours || 0, minutes || 0, seconds || 0)
        }
      }
      return isNaN(date) ? null : date
    }

    const parsed = new Date(dateStr)
    return isNaN(parsed) ? null : parsed
  }

  const formatDateToDDMMYYYY = (date) => {
    if (!date || !(date instanceof Date) || isNaN(date)) return ""
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const isDateInPast = (date) => {
    if (!date || !(date instanceof Date)) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    return checkDate < today
  }

  // Initial load when component mounts or key dependencies change
  useEffect(() => {
    loadTasksFromServer(1, false)
  }, [taskView, dashboardType, dashboardStaffFilter, departmentFilter])

  // Load more when search changes (client-side filter)
  useEffect(() => {
    if (currentPage === 1) {
      loadTasksFromServer(1, false)
    }
  }, [searchQuery])

  // Reset local staff filter when dashboardStaffFilter changes
  useEffect(() => {
    if (dashboardStaffFilter !== "all") {
      setFilterStaff("all")
    }
  }, [dashboardStaffFilter])

  // Function to load more data when scrolling
  const loadMoreData = () => {
    if (!isLoadingMore && hasMoreData) {
      const nextPage = currentPage + 1
      setCurrentPage(nextPage)
      loadTasksFromServer(nextPage, true)
    }
  }

  // Handle scroll event for infinite loading
  useEffect(() => {
    const handleScroll = () => {
      if (!hasMoreData || isLoadingMore) return

      const tableContainer = document.querySelector('.task-table-container')
      if (!tableContainer) return

      const { scrollTop, scrollHeight, clientHeight } = tableContainer
      const isNearBottom = scrollHeight - scrollTop <= clientHeight * 1.2

      if (isNearBottom) {
        loadMoreData()
      }
    }

    const tableContainer = document.querySelector('.task-table-container')
    if (tableContainer) {
      tableContainer.addEventListener('scroll', handleScroll)
      return () => tableContainer.removeEventListener('scroll', handleScroll)
    }
  }, [hasMoreData, isLoadingMore, currentPage])

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="bg-gray-50/50 p-3 border-b border-gray-100">
        <div className="flex bg-white rounded-xl border border-purple-100 p-1 shadow-sm overflow-x-auto no-scrollbar">
          {["recent", "upcoming", "overdue"].map((view) => (
            <button
              key={view}
              onClick={() => setTaskView(view)}
              className={`flex-1 min-w-[120px] py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 uppercase tracking-wider ${taskView === view
                ? "bg-purple-600 text-white shadow-md transform scale-[1.02]"
                : "text-purple-600 hover:bg-purple-50"
                }`}
            >
              {view === "overdue" ? "Overdue" :
                (dashboardType === "delegation"
                  ? (view === "recent" ? "Today Task" : "Future Task")
                  : (view === "recent" ? "Recent" : "Upcoming")
                )
              }
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Accordion Filter Section */}
        {dashboardType !== 'checklist' && dashboardType !== 'delegation' && (
          <div className="mb-4 border border-gray-200 rounded-lg">
            <button
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-purple-600" />
                <span className="font-medium text-purple-700">Filters</span>
                {(searchQuery || dashboardStaffFilter !== "all" || departmentFilter !== "all") && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                    Active
                  </span>
                )}
              </div>
              {isFilterExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              )}
            </button>

            {isFilterExpanded && (
              <div className="p-4 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                      Search Tasks
                    </label>
                    <input
                      id="search"
                      placeholder="Search by task title or ID"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-md border border-gray-300 p-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  {/* Active Filters Display */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Active Filters
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {dashboardStaffFilter !== "all" && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                          Staff: {dashboardStaffFilter}
                        </span>
                      )}
                      {departmentFilter !== "all" && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                          Department: {departmentFilter}
                        </span>
                      )}
                      {searchQuery && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                          Search: {searchQuery}
                        </span>
                      )}
                      {!dashboardStaffFilter || dashboardStaffFilter === "all" &&
                        !departmentFilter || departmentFilter === "all" &&
                        !searchQuery && (
                          <span className="text-xs text-gray-500">No active filters</span>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}


        {/* Task List / Table Rendering */}
        {displayedTasks.length === 0 && !isLoadingMore ? (
          <div className="text-center p-12 bg-white rounded-xl border border-dashed border-gray-300">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gray-50 rounded-full">
                <Filter className="h-8 w-8 text-gray-300" />
              </div>
            </div>
            <p className="text-gray-500 font-medium">No tasks found for {taskView} view.</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                className="task-table-container overflow-x-auto"
                style={{ maxHeight: "500px", overflowY: "auto" }}
              >
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 transition-all">
                    <tr>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-50/90 backdrop-blur-sm shadow-sm border-b border-gray-100">Seq</th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-50/90 backdrop-blur-sm shadow-sm border-b border-gray-100">ID</th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-50/90 backdrop-blur-sm shadow-sm border-b border-gray-100">Description</th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-50/90 backdrop-blur-sm shadow-sm border-b border-gray-100">Staff</th>
                      {dashboardType === "checklist" && (
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-50/90 backdrop-blur-sm shadow-sm border-b border-gray-100">Department</th>
                      )}
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-50/90 backdrop-blur-sm shadow-sm border-b border-gray-100">Date</th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-50/90 backdrop-blur-sm shadow-sm border-b border-gray-100">Freq</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {displayedTasks.map((task, index) => (
                      <tr key={`${task.id}-${task.taskStartDate}`} className="hover:bg-purple-50/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-400">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-purple-700">{task.id}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate font-medium">{task.title}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">{task.assignedTo}</td>
                        {dashboardType === "checklist" && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{task.department}</td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{task.taskStartDate}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${getFrequencyColor(task.frequency)}`}>
                            {task.frequency}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {displayedTasks.map((task, index) => (
                <div key={`${task.id}-${task.taskStartDate}`} className="bg-white p-4 rounded-xl shadow-md border border-gray-100 relative overflow-hidden group active:scale-[0.98] transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded uppercase">#{task.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getFrequencyColor(task.frequency)}`}>
                      {task.frequency}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-800 line-clamp-2 mb-3 pr-4 leading-relaxed">{task.title}</h3>
                  <div className="grid grid-cols-2 gap-y-2 border-t border-gray-50 pt-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Assigned To</span>
                      <span className="text-xs font-semibold text-gray-700">{task.assignedTo}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Start Date</span>
                      <span className="text-xs font-semibold text-gray-700">{task.taskStartDate}</span>
                    </div>
                    {dashboardType === "checklist" && (
                      <div className="flex flex-col col-span-2 mt-1">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Department</span>
                        <span className="text-xs font-semibold text-gray-700">{task.department}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
              ))}
            </div>

            {isLoadingMore && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-purple-600 mt-3 uppercase tracking-widest">Loading Tasks...</p>
              </div>
            )}

            {!hasMoreData && displayedTasks.length > 0 && (
              <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">
                You've reached the end
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
