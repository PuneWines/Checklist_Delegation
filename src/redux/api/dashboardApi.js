import supabase from "../../SupabaseClient";

/**
 * Fetch dashboard data with proper server-side filtering and pagination
 */
export const fetchDashboardDataApi = async (
  dashboardType,
  staffFilter = null,
  page = 1,
  limit = 50,
  taskView = 'recent',
  departmentFilter = null,
  startDate = null,
  endDate = null
) => {
  try {
    console.log('Fetching dashboard data:', { dashboardType, staffFilter, page, limit, taskView, departmentFilter });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');
    const today = new Date().toISOString().split('T')[0];

    const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance') ? 'planned_date' : 'task_start_date';
    // Use ascending order for checklist/delegation/maintenance to show oldest/most overdue first
    const isAscending = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance');

    let query = supabase
      .from(dashboardType)
      .select('*')
      .order(dateColumn, { ascending: isAscending })
      .range(from, to);

    // Apply role-based filtering first
    if (role === 'user' && username) {
      query = query.eq('name', username);
    }

    // Apply department filter if provided (for checklist and delegation)
    if (departmentFilter && departmentFilter !== 'all' && (dashboardType === 'checklist' || dashboardType === 'delegation')) {
      query = query.eq('department', departmentFilter);
    }



    // Apply staff filter if provided and not "all" (for admin users)
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      query = query.eq('name', staffFilter);
    }

    // Apply task view filtering on server side
    switch (taskView) {
      case 'recent':
        // Today's tasks only
        query = query.gte(dateColumn, `${today}T00:00:00`)
          .lte(dateColumn, `${today}T23:59:59`);
        if (dashboardType === 'checklist' || dashboardType === 'maintenance' || dashboardType === 'delegation') {
          // Exclude completed tasks for recent view
          query = query.is('submission_date', null);
        }
        break;

      case 'upcoming':
        // All future tasks (after today)
        query = query.gt(dateColumn, `${today}T23:59:59`);
        break;

      case 'overdue':
        // Tasks before today that are not completed AND have null submission_date
        query = query.lt(dateColumn, `${today}T00:00:00`)
          .is('submission_date', null);

        if (dashboardType === 'delegation') {
          query = query.neq('status', 'done');
        }
        break;

      case 'all':
        // No date filters for all tasks
        break;
      default:
        // For checklist/delegation "all" or undefined views, we don't want to restrict to today
        if (dashboardType !== 'checklist' && dashboardType !== 'delegation') {
          query = query.lte(dateColumn, `${today}T23:59:59`);
        }
        break;
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching dashboard data:", error);
      throw error;
    }

    // Filter out holidays from the results
    const { data: holidays } = await supabase.from('holidays').select('holiday_date');
    const holidayDates = holidays ? holidays.map(h => h.holiday_date) : [];

    const filteredData = (data || []).filter(task => {
      if (!task.task_start_date) return true;
      const dateStr = task.task_start_date.split('T')[0];
      return !holidayDates.includes(dateStr);
    });

    console.log(`Fetched ${filteredData.length} records for ${taskView} view (after holiday filter)`);
    return filteredData.map(task => ({
      ...task,
      id: task.id || task.task_id
    }));

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getDashboardDataCount = async (dashboardType, staffFilter = null, taskView = 'recent', departmentFilter = null) => {
  try {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from(dashboardType)
      .select('*', { count: 'exact', head: true });

    // Apply role-based filtering
    if (role === 'user' && username) {
      query = query.eq('name', username);
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      query = query.eq('name', staffFilter);
    }

    // Apply department filter (for checklist and delegation)
    if (departmentFilter && departmentFilter !== 'all' && (dashboardType === 'checklist' || dashboardType === 'delegation')) {
      query = query.eq('department', departmentFilter);
    }

    const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance') ? 'planned_date' : 'task_start_date';

    // Apply task view filtering
    switch (taskView) {
      case 'recent':
        query = query.gte(dateColumn, `${today}T00:00:00`)
          .lte(dateColumn, `${today}T23:59:59`);
        if (dashboardType === 'checklist' || dashboardType === 'maintenance' || dashboardType === 'delegation') {
          query = query.is('submission_date', null);
        }
        break;

      case 'upcoming':
        // All future tasks (after today)
        query = query.gt(dateColumn, `${today}T23:59:59`);
        break;

      case 'overdue':
        // Tasks before today that are not completed AND have null submission_date
        query = query.lt(dateColumn, `${today}T00:00:00`)
          .is('submission_date', null);

        if (dashboardType === 'delegation') {
          query = query.neq('status', 'done');
        }
        break;

      case 'all':
        // No date filters
        break;
      default:
        if (dashboardType !== 'checklist' && dashboardType !== 'delegation') {
          query = query.lte(dateColumn, `${today}T23:59:59`);
        }
        break;
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error getting count:", error);
      throw error;
    }

    return count || 0;

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const countPendingOrDelayTaskApi = async (dashboardType, staffFilter = null, departmentFilter = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const today = new Date().toISOString().split('T')[0];
    let query;

    const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation') ? 'planned_date' : 'task_start_date';
    if (dashboardType === 'delegation') {
      query = supabase
        .from('delegation')
        .select('*', { count: 'exact', head: true })
        .is('submission_date', null)
        .gte(dateColumn, `${today}T00:00:00`)
        .lte(dateColumn, `${today}T23:59:59`);
    } else {
      query = supabase
        .from('checklist')
        .select('*', { count: 'exact', head: true })
        .is('submission_date', null)
        .gte(dateColumn, `${today}T00:00:00`)
        .lte(dateColumn, `${today}T23:59:59`);
    }

    // Apply filters
    if (role === 'user' && username) {
      query = query.eq('name', username);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq('name', staffFilter);
    }

    // Apply department filter (only for checklist)
    if (departmentFilter && departmentFilter !== 'all' && dashboardType === 'checklist') {
      query = query.eq('department', departmentFilter);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error counting pending tasks:', error);
      throw error;
    }

    return count || 0;

  } catch (error) {
    console.error('Unexpected error:', error);
    throw error;
  }
};

export const getDashboardSummaryApi = async (dashboardType, staffFilter = null) => {
  try {
    const [totalTasks, completedTasks, pendingTasks, overdueTasks] = await Promise.all([
      countTotalTaskApi(dashboardType, staffFilter),
      countCompleteTaskApi(dashboardType, staffFilter),
      countPendingOrDelayTaskApi(dashboardType, staffFilter),
      countOverDueORExtendedTaskApi(dashboardType, staffFilter)
    ]);

    const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      completionRate: parseFloat(completionRate)
    };
  } catch (error) {
    console.error('Error getting dashboard summary:', error);
    throw error;
  }
};

// Alternative version if you want to see detailed task breakdown for debugging
export const fetchStaffTasksDataApi = async (dashboardType, staffFilter = null, departmentFilter = null, page = 1, limit = 20, selectedMonth = null) => {
  try {
    console.log('Fetching staff tasks data:', { dashboardType, staffFilter, departmentFilter, page, limit, selectedMonth });

    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    // Use selected month or current month as default
    let year, month;
    if (selectedMonth) {
      [year, month] = selectedMonth.split('-').map(Number);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    // Calculate start and end dates for the selected month
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;

    console.log('Date range for filtering:', {
      startDate,
      endDate,
      year,
      month,
      lastDayOfMonth,
      selectedMonth
    });

    const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation') ? 'planned_date' : 'task_start_date';

    // Build the query
    let query = supabase
      .from(dashboardType)
      .select('*')
      .gte(dateColumn, `${startDate}T00:00:00`)
      .lte(dateColumn, `${endDate}T23:59:59`)
      .not('name', 'is', null);

    // Apply role-based filtering
    if (role === 'user' && username) {
      query = query.eq('name', username);
    }

    // Apply staff filter if provided
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      query = query.eq('name', staffFilter);
    }

    // Apply department filter if provided
    if (departmentFilter && departmentFilter !== 'all') {
      query = query.eq('department', departmentFilter);
    }

    const { data: tasksData, error } = await query;

    if (error) {
      console.error("Error fetching tasks data:", error);
      throw error;
    }

    console.log(`Found ${tasksData.length} tasks in date range ${startDate} to ${endDate}`);

    // Process data to match SQL query structure
    const summary = {};

    tasksData.forEach(task => {
      const key = `${task.department}-${task.name}`;

      if (!summary[key]) {
        summary[key] = {
          department: task.department,
          name: task.name,
          total_tasks: 0,
          total_completed_tasks: 0,
          total_done_on_time: 0
        };
      }

      summary[key].total_tasks++;

      // Check if task is completed
      const isCompleted = dashboardType === 'checklist'
        ? task.status === 'yes' || task.status === 'yes' || task.status === 'Completed' || task.status === 'completed'
        : (dashboardType === 'delegation' ? (task.status === 'done' && task.admin_done === true) || (task.status === 'completed' && task.admin_done === true) || (task.status === 'Done' && task.admin_done === true) : false);

      if (isCompleted) {
        summary[key].total_completed_tasks++;

        // Check if done on time
        if (task.submission_date && task.task_start_date) {
          const submissionDate = new Date(task.submission_date);
          const startDate = new Date(task.task_start_date);

          // Compare dates only (ignore time)
          const submissionDateOnly = new Date(submissionDate.getFullYear(), submissionDate.getMonth(), submissionDate.getDate());
          const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

          // Count as "on time" only if submission date is same as or before start date
          if (submissionDateOnly <= startDateOnly) {
            summary[key].total_done_on_time++;
          }
        }
      }
    });

    // Calculate scores and convert to array
    let staffResults = Object.values(summary).map(staff => {
      const completion_score = staff.total_tasks > 0
        ? Number((((staff.total_completed_tasks / staff.total_tasks) * 100) - 100).toFixed(2))
        : -100;

      const ontime_score = staff.total_completed_tasks > 0
        ? Number((((staff.total_done_on_time / staff.total_completed_tasks) * 100) - 100).toFixed(2))
        : (staff.total_tasks > 0 ? -100 : 0);

      return {
        id: staff.name.replace(/\s+/g, "-").toLowerCase(),
        department: staff.department,
        name: staff.name,
        email: `${staff.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        total_tasks: staff.total_tasks,
        total_completed_tasks: staff.total_completed_tasks,
        total_done_on_time: staff.total_done_on_time,
        completion_score,
        ontime_score
      };
    });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit;
    const paginatedResults = staffResults.slice(from, to);

    console.log(`Fetched ${paginatedResults.length} staff members with task data for ${month}/${year}`);
    return paginatedResults;

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getStaffTasksCountApi = async (dashboardType, staffFilter = null, departmentFilter = null, selectedMonth = null) => {
  try {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    // Use selected month or current month as default
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

    const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation') ? 'planned_date' : 'task_start_date';

    let query = supabase
      .from(dashboardType)
      .select('department, name')
      .gte(dateColumn, `${startDate}T00:00:00`)
      .lte(dateColumn, `${endDate}T23:59:59`)
      .not('name', 'is', null);

    // Apply role-based filtering
    if (role === 'user' && username) {
      query = query.eq('name', username);
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      query = query.eq('name', staffFilter);
    }

    // Apply department filter
    if (departmentFilter && departmentFilter !== 'all') {
      query = query.eq('department', departmentFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error getting staff count:", error);
      throw error;
    }

    // Count unique staff names
    const uniqueStaff = new Set(data.map(item => `${item.department}-${item.name}`));
    console.log(`Total unique staff count for ${month}/${year}: ${uniqueStaff.size}`);
    return uniqueStaff.size;

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

// Helper function to get exact date range for any month
export const getCurrentMonthDateRange = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const startDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
  const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
  const endDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;

  return {
    startDate,
    endDate,
    currentYear,
    currentMonth,
    lastDayOfMonth
  };
};

export const getTotalUsersCountApi = async (departmentFilter = null) => {
  try {
    let query = supabase
      .from('users')
      .select('user_name, department', { count: 'exact', head: true })
      .not('user_name', 'is', null)
      .not('user_name', 'eq', '');

    // Apply department filter if provided and not "all"
    if (departmentFilter && departmentFilter !== 'all') {
      query = query.eq('department', departmentFilter);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error fetching total users count:", error);
      throw error;
    }

    console.log(`Total users count${departmentFilter && departmentFilter !== 'all' ? ` for department ${departmentFilter}` : ''}: ${count}`);
    return count || 0;
  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getUniqueDepartmentsApi = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('department')
      .not('department', 'is', null)
      .not('department', 'eq', '');

    if (error) {
      console.error("Error fetching departments:", error);
      throw error;
    }

    // Get unique departments, splitting comma-separated values
    const uniqueDepartments = [...new Set(
      data.flatMap(item => item.department.split(',')) // Split by comma
        .map(dept => dept.trim()) // Remove extra spaces
        .filter(dept => dept.length > 0) // Remove empty strings
    )].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())); // Case-insensitive sort

    return uniqueDepartments;
  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};


export const getStaffNamesByDepartmentApi = async (departmentFilter = null) => {
  try {
    let query = supabase
      .from('users')
      .select('user_name, user_access')
      .not('user_name', 'is', null)
      .neq('user_access', 'admin')
      .not('user_name', 'eq', '');

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching staff names:", error);
      throw error;
    }

    let filteredStaff = data.map(user => user.user_name);

    // Filter by department if provided
    if (departmentFilter && departmentFilter !== 'all') {
      filteredStaff = data
        .filter(user => {
          if (!user.user_access) return false;
          const userDepartments = user.user_access.split(',').map(dept => dept.trim().toLowerCase());
          return userDepartments.includes(departmentFilter.toLowerCase());
        })
        .map(user => user.user_name);
    }

    return [...new Set(filteredStaff)]; // Remove duplicates
  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};


export const fetchChecklistDataByDateRangeApi = async (
  startDate,
  endDate,
  staffFilter = null,
  departmentFilter = null,
  page = 1,
  limit = 1000, // Increased for better performance
  statusFilter = 'all'
) => {
  try {
    console.log('Fetching checklist data by date range:', {
      startDate,
      endDate,
      staffFilter,
      departmentFilter,
      page,
      limit,
      statusFilter
    });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    const dateColumn = 'planned_date'; // This API is specific to checklist

    let query = supabase
      .from('checklist')
      .select('*')
      .order(dateColumn, { ascending: true }) // Ascending for date ranges usually better
      .range(from, to);

    // Apply date range filter ONLY
    if (startDate && endDate) {
      query = query
        .gte(dateColumn, `${startDate}T00:00:00`)
        .lte(dateColumn, `${endDate}T23:59:59`);
    } else if (startDate) {
      query = query.gte(dateColumn, `${startDate}T00:00:00`);
    } else if (endDate) {
      query = query.lte(dateColumn, `${endDate}T23:59:59`);
    }

    // Apply role-based filtering
    if (role === 'user' && username) {
      query = query.eq('name', username);
    }

    // Apply department filter
    if (departmentFilter && departmentFilter !== 'all') {
      query = query.eq('department', departmentFilter);
    }

    // Apply staff filter (for admin users)
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      query = query.eq('name', staffFilter);
    }

    // Apply status filter
    switch (statusFilter) {
      case 'completed':
        query = query.not('submission_date', 'is', null);
        break;
      case 'pending':
        const today = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .gte('task_start_date', `${today}T00:00:00`);
        break;
      case 'overdue':
        const todayOverdue = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .lt('task_start_date', `${todayOverdue}T00:00:00`);
        break;
      // 'all' - no additional status filter
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching checklist data by date range:", error);
      throw error;
    }

    console.log(`✅ Fetched ${data?.length || 0} records for date range ${startDate} to ${endDate}`);
    return (data || []).map(task => ({
      ...task,
      id: task.id || task.task_id
    }));

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getChecklistDateRangeCountApi = async (
  startDate,
  endDate,
  staffFilter = null,
  departmentFilter = null,
  statusFilter = 'all'
) => {
  try {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    let query = supabase
      .from('checklist')
      .select('*', { count: 'exact', head: true });

    const dateColumn = 'planned_date'; // checklist specific

    // Apply date range filter ONLY - no today date restrictions
    if (startDate && endDate) {
      query = query
        .gte(dateColumn, `${startDate}T00:00:00`)
        .lte(dateColumn, `${endDate}T23:59:59`);
    } else if (startDate) {
      query = query.gte(dateColumn, `${startDate}T00:00:00`);
    } else if (endDate) {
      query = query.lte(dateColumn, `${endDate}T23:59:59`);
    }

    // Apply role-based filtering
    if (role === 'user' && username) {
      query = query.eq('name', username);
    }

    // Apply department filter
    if (departmentFilter && departmentFilter !== 'all') {
      query = query.eq('department', departmentFilter);
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      query = query.eq('name', staffFilter);
    }

    // Apply status filter
    switch (statusFilter) {
      case 'completed':
        query = query.not('submission_date', 'is', null);
        break;
      case 'pending':
        const today = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .gte(dateColumn, `${today}T00:00:00`);
        break;
      case 'overdue':
        const todayOverdue = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .lt(dateColumn, `${todayOverdue}T00:00:00`);
        break;
      // 'all' - no additional status filter
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error getting date range count:", error);
      throw error;
    }

    console.log('🔢 Date range count result:', { startDate, endDate, count, statusFilter });
    return count || 0;

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getChecklistDateRangeStatsApi = async (
  startDate,
  endDate,
  staffFilter = null,
  departmentFilter = null
) => {
  try {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    console.log('📊 getChecklistDateRangeStatsApi called with:', {
      startDate, endDate, staffFilter, departmentFilter
    });

    const dateColumn = 'planned_date'; // checklist specific

    // MAIN FIX: Remove the today date filter that was limiting results
    let totalQuery = supabase
      .from('checklist')
      .select('*', { count: 'exact', head: true });

    // Apply ONLY date range filter - no other date restrictions
    if (startDate && endDate) {
      totalQuery = totalQuery
        .gte(dateColumn, `${startDate}T00:00:00`)
        .lte(dateColumn, `${endDate}T23:59:59`);
    }

    // Apply role-based filtering
    if (role === 'user' && username) {
      totalQuery = totalQuery.eq('name', username);
    }

    // Apply department filter
    if (departmentFilter && departmentFilter !== 'all') {
      totalQuery = totalQuery.eq('department', departmentFilter);
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      totalQuery = totalQuery.eq('name', staffFilter);
    }

    const { count: totalTasks, error: totalError } = await totalQuery;

    if (totalError) {
      console.error("Error counting total tasks:", totalError);
      throw totalError;
    }

    console.log('📊 Total tasks in date range:', totalTasks);

    // Get completed tasks count
    let completedQuery = supabase
      .from('checklist')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'yes');

    // Apply the same date range and filters
    if (startDate && endDate) {
      completedQuery = completedQuery
        .gte('task_start_date', `${startDate}T00:00:00`)
        .lte('task_start_date', `${endDate}T23:59:59`);
    }
    if (role === 'user' && username) {
      completedQuery = completedQuery.eq('name', username);
    }
    if (departmentFilter && departmentFilter !== 'all') {
      completedQuery = completedQuery.eq('department', departmentFilter);
    }
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      completedQuery = completedQuery.eq('name', staffFilter);
    }

    const { count: completedTasks, error: completedError } = await completedQuery;

    if (completedError) {
      console.error("Error counting completed tasks:", completedError);
      throw completedError;
    }

    console.log('📊 Completed tasks in date range:', completedTasks);

    // Calculate pending tasks (total - completed)
    const pendingTasks = totalTasks - completedTasks;

    // Get overdue tasks count (tasks before today that are not completed)
    const today = new Date().toISOString().split('T')[0];
    let overdueQuery = supabase
      .from('checklist')
      .select('*', { count: 'exact', head: true })
      .or('status.is.null,status.neq.yes') // Not completed
      .is('submission_date', null) // Not submitted
      .lt('task_start_date', `${today}T00:00:00`); // Before today

    // Apply the same date range and filters
    if (startDate && endDate) {
      overdueQuery = overdueQuery
        .gte('task_start_date', `${startDate}T00:00:00`)
        .lte('task_start_date', `${endDate}T23:59:59`);
    }
    if (role === 'user' && username) {
      overdueQuery = overdueQuery.eq('name', username);
    }
    if (departmentFilter && departmentFilter !== 'all') {
      overdueQuery = overdueQuery.eq('department', departmentFilter);
    }
    if (staffFilter && staffFilter !== 'all' && role === 'admin') {
      overdueQuery = overdueQuery.eq('name', staffFilter);
    }

    const { count: overdueTasks, error: overdueError } = await overdueQuery;

    if (overdueError) {
      console.error("Error counting overdue tasks:", overdueError);
      throw overdueError;
    }

    console.log('📊 Overdue tasks in date range:', overdueTasks);

    const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

    const result = {
      totalTasks: totalTasks || 0,
      completedTasks: completedTasks || 0,
      pendingTasks: pendingTasks || 0,
      overdueTasks: overdueTasks || 0,
      completionRate: parseFloat(completionRate),
    };

    console.log('📊 Final stats for date range:', result);
    return result;

  } catch (error) {
    console.error("Error getting date range statistics:", error);
    throw error;
  }
};

export const fetchCompleteChecklistDataByDateRangeApi = async (
  startDate,
  endDate,
  staffFilter = null,
  departmentFilter = null,
  statusFilter = 'all'
) => {
  try {
    console.log('🚀 Fetching COMPLETE checklist data for date range:', {
      startDate,
      endDate,
      staffFilter,
      departmentFilter,
      statusFilter
    });

    const allData = [];
    let page = 1;
    const limit = 1000;
    let hasMore = true;

    // First get total count to set expectations
    const totalCount = await getChecklistDateRangeCountApi(
      startDate,
      endDate,
      staffFilter,
      departmentFilter,
      statusFilter
    );

    console.log(`📈 Expected total records: ${totalCount}`);

    while (hasMore) {
      console.log(`📄 Fetching page ${page}...`);

      const data = await fetchChecklistDataByDateRangeApi(
        startDate,
        endDate,
        staffFilter,
        departmentFilter,
        page,
        limit,
        statusFilter
      );

      if (data && data.length > 0) {
        allData.push(...data);
        console.log(`📊 Page ${page}: ${data.length} records | Total: ${allData.length}/${totalCount}`);

        // Stop if we've reached the end or got all expected data
        if (data.length < limit || allData.length >= totalCount) {
          hasMore = false;
          console.log(`✅ Reached end of data at page ${page}`);
        } else {
          page++;
        }
      } else {
        hasMore = false;
        console.log(`🛑 No more data at page ${page}`);
      }

      // Safety limit
      if (page > 100) {
        console.warn('⚠️ Safety limit reached - stopping pagination');
        hasMore = false;
      }
    }

    console.log(`🎉 Successfully fetched ALL ${allData.length} records`);

    // Verify count
    if (totalCount && allData.length !== totalCount) {
      console.warn(`⚠️ Count mismatch: Expected ${totalCount}, Got ${allData.length}`);
    }

    return allData;

  } catch (error) {
    console.error("Error fetching complete checklist data:", error);
    throw error;
  }
};

// Helper function to get current month date range
// Common date range function
const getCurrentMonthRange = () => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = new Date();

  return {
    start: firstDayOfMonth.toISOString().split('T')[0] + 'T00:00:00',
    end: today.toISOString().split('T')[0] + 'T23:59:59',
    todayStart: today.toISOString().split('T')[0] + 'T00:00:00'
  };
};


export const countTotalTaskApi = async (dashboardType, staffFilter = null, departmentFilter = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const { start, end } = getCurrentMonthRange();

    let query = supabase
      .from(dashboardType)
      .select('*', { count: 'exact', head: true })
      .gte('task_start_date', start)
      .lte('task_start_date', end);

    // Apply filters
    if (role === 'user' && username) {
      query = query.eq('name', username);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq('name', staffFilter);
    }

    // Apply department filter (only for checklist)
    if (departmentFilter && departmentFilter !== 'all' && dashboardType === 'checklist') {
      query = query.eq('department', departmentFilter);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error counting total tasks:", error);
      throw error;
    }

    return count || 0;

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

// 2. Count Complete Tasks (Current Month)
export const countCompleteTaskApi = async (dashboardType, staffFilter = null, departmentFilter = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const { start, end } = getCurrentMonthRange();
    let query;

    if (dashboardType === 'delegation') {
      query = supabase
        .from('delegation')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'done')
        .eq('admin_done', true) // Only count as complete if admin approved
        .gte('task_start_date', start)
        .lte('task_start_date', end);
    } else {
      query = supabase
        .from('checklist')
        .select('*', { count: 'exact', head: true })
        .not('submission_date', 'is', null)
        // .eq('status', 'yes') // Removed status check to encompass all completions
        .gte('task_start_date', start)
        .lte('task_start_date', end);
    }

    // Apply filters
    if (role === 'user' && username) {
      query = query.eq('name', username);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq('name', staffFilter);
    }

    // Apply department filter (only for checklist)
    if (departmentFilter && departmentFilter !== 'all' && dashboardType === 'checklist') {
      query = query.eq('department', departmentFilter);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error counting complete tasks:', error);
      throw error;
    }

    return count || 0;

  } catch (error) {
    console.error('Unexpected error:', error);
    throw error;
  }
};

// 3. Count Overdue Tasks (Current Month) - UPDATED
export const countOverDueORExtendedTaskApi = async (dashboardType, staffFilter = null, departmentFilter = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const { start, todayStart } = getCurrentMonthRange();
    let query;

    if (dashboardType === 'delegation') {
      query = supabase
        .from('delegation')
        .select('*', { count: 'exact', head: true })
        .is('submission_date', null)
        // If admin_done is false but submission_date exists, it's not overdue, it's pending approval
        // So we keep checking submission_date is null for overdue
        .lt('task_start_date', todayStart)  // Overdue: started before today
        .gte('task_start_date', start);     // Current month: from 1st of month
    } else {
      query = supabase
        .from('checklist')
        .select('*', { count: 'exact', head: true })
        .is('submission_date', null)
        // .or('status.is.null,status.neq.yes') // Removed status check
        .lt('task_start_date', todayStart)  // Overdue: started before today
        .gte('task_start_date', start);     // Current month: from 1st of month
    }

    // Apply filters
    if (role === 'user' && username) {
      query = query.eq('name', username);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq('name', staffFilter);
    }

    // Apply department filter (only for checklist)
    if (departmentFilter && departmentFilter !== 'all' && dashboardType === 'checklist') {
      query = query.eq('department', departmentFilter);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error counting overdue tasks:', error);
      throw error;
    }

    return count || 0;

  } catch (error) {
    console.error('Unexpected error:', error);
    throw error;
  }
};