import supabase from "../../SupabaseClient";

// ── Centralized date column mapping (NEW) ──
const getDateColumn = (dashboardType) => {
  switch (dashboardType) {
    case 'checklist': return 'task_start_date';
    case 'delegation': return 'planned_date';
    case 'work': return 'current_date';
    case 'maintenance': return 'planned_date';
    case 'ea': return 'planned_date';
    case 'repair': return 'created_at';
    default: return 'created_at';
  }
};

/**
 * Fetch dashboard data with proper server-side filtering and pagination
 */
export const fetchDashboardDataApi = async (
  dashboardType,
  staffFilter = null,
  page = 1,
  limit = 50,
  taskView = 'recent',
  shopFilter = null,
  startDate = null,
  endDate = null
) => {
  try {

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const role = (localStorage.getItem('role') || "").toUpperCase();
    const username = localStorage.getItem('user-name');
    const today = new Date().toISOString().split('T')[0];

    // OLD: const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'ea') ? 'planned_date' : 
    //                        (dashboardType === 'work') ? 'current_date' : 'created_at';
    const dateColumn = getDateColumn(dashboardType);
    // Use ascending order for checklist/delegation/maintenance/work to show oldest/most overdue first
    const isAscending = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'work');

    const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
                      dashboardType === 'repair' ? 'repair_tasks' :
                      dashboardType === 'ea' ? 'ea_tasks' : 
                      dashboardType === 'work' ? 'work_task' : dashboardType;

    let query = supabase
      .from(tableName)
      .select(dashboardType === 'work' ? '*, task_assignments:assignment_id(end_datetime, manager_name)' : '*')
      .order(dateColumn, { ascending: isAscending })
      .range(from, to);

    // Apply role-based filtering first
    if (role === 'USER' && username) {
      query = query.eq('name', username);
    } else if (role === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in('name', reportingUsers);
    }

    // Apply shop filter if provided (for checklist and delegation)
    if (shopFilter && shopFilter !== 'all') {
      query = query.ilike('shop_name', shopFilter);
    } else if (role === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        query = query.or(orCondition);
      }
    }



    // Apply staff filter if provided and not "all" (for admin/HOD/manager users)
    if (staffFilter && staffFilter !== 'all' && (role === 'ADMIN' || role === 'HOD' || role === 'MANAGER')) {
      query = query.eq('name', staffFilter);
    }

    // Apply task view filtering on server side
    switch (taskView) {
      case 'recent':
        // Today's tasks only (or restricted to custom date range)
        if (startDate && endDate) {
          query = query.gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
                       .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`));
        } else {
          query = query.gte(dateColumn, `${today}T00:00:00`)
                       .lte(dateColumn, `${today}T23:59:59`);
        }
        if (dashboardType === 'ea') {
          query = query.in('status', ['pending', 'extend', 'extended', 'Pending']);
        } else if (dashboardType === 'checklist' || dashboardType === 'maintenance' || dashboardType === 'delegation' || dashboardType === 'work') {
          // Exclude completed tasks for recent view
          query = query.is('submission_date', null);
        }
        break;

      case 'upcoming':
        // All future tasks (after today, restricted to custom date range if present)
        if (startDate && endDate) {
          query = query.gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
                       .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`))
                       .gt(dateColumn, (dashboardType === 'work' ? today : `${today}T23:59:59`));
        } else {
          query = query.gt(dateColumn, `${today}T23:59:59`);
        }
        break;

      case 'overdue': {
        // Tasks before today that are not completed (restricted to custom date range if present)
        if (startDate && endDate) {
          query = query.gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
                       .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`))
                       .lt(dateColumn, (dashboardType === 'work' ? today : `${today}T00:00:00`));
        } else {
          query = query.lt(dateColumn, `${today}T00:00:00`);
        }

        if (dashboardType === 'ea') {
          query = query.in('status', ['pending', 'extend', 'extended', 'Pending']);
        } else {
          query = query.is('submission_date', null);
          if (dashboardType === 'delegation') {
            query = query.neq('status', 'done');
          }
        }
        break;
      }

      case 'all':
        // Fetch tasks from start-of-previous-month up to today.
        // This ensures we include the full current + previous month data (e.g. Feb 24 → Mar 6)
        // while excluding stale old records that inflate the count.
        {
          const now2 = new Date();
          // Lower bound: 1st day of the PREVIOUS month (covers last ~2 months)
          const prevMonthStart = new Date(now2.getFullYear(), now2.getMonth() - 1, 1)
            .toISOString().split('T')[0];
          const upperBound = endDate || today;
          const lowerBound = startDate || prevMonthStart;
          query = query
            .gte(dateColumn, `${lowerBound}T00:00:00`)
            .lte(dateColumn, `${upperBound}T23:59:59`);
        }
        break;
      default:
        // For checklist/delegation, default to lte today
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
      const taskDateStr = task.planned_date || task.task_start_date;
      if (!taskDateStr) return true;
      const dateStr = taskDateStr.split('T')[0];
      return !holidayDates.includes(dateStr);
    });

    return filteredData.map(task => ({
      ...task,
      id: task.id || task.task_id
    }));

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getDashboardDataCount = async (dashboardType, staffFilter = null, taskView = 'recent', shopFilter = null, startDate = null, endDate = null) => {
  try {
    const role = (localStorage.getItem('role') || "").toUpperCase();
    const username = localStorage.getItem('user-name');
    const today = new Date().toISOString().split('T')[0];
    const dateColumn = getDateColumn(dashboardType);

    const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
                      dashboardType === 'repair' ? 'repair_tasks' :
                      dashboardType === 'ea' ? 'ea_tasks' : 
                      dashboardType === 'work' ? 'work_task' : dashboardType;

    let query = supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .not('name', 'is', null);

    // Apply role-based filtering
    if (role === 'USER' && username) {
      query = query.eq('name', username);
    } else if (role === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in('name', reportingUsers);
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && (role === 'ADMIN' || role === 'HOD' || role === 'MANAGER')) {
      query = query.eq('name', staffFilter);
    }

    // Apply shop filter
    if (shopFilter && shopFilter !== 'all') {
      query = query.ilike('shop_name', shopFilter);
    } else if (role === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        query = query.or(orCondition);
      }
    }

    // Apply task view filtering
    switch (taskView) {
      case 'recent':
        if (startDate && endDate) {
          query = query.gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
                       .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`));
        } else {
          query = query.gte(dateColumn, (dashboardType === 'work' ? today : `${today}T00:00:00`))
                       .lte(dateColumn, (dashboardType === 'work' ? today : `${today}T23:59:59`));
        }
        
        if (dashboardType === 'ea') {
          query = query.in('status', ['pending', 'extend', 'extended', 'Pending']);
        } else if (dashboardType === 'checklist' || dashboardType === 'maintenance' || dashboardType === 'delegation' || dashboardType === 'work') {
          query = query.is('submission_date', null);
        }
        break;

      case 'upcoming':
        // All future tasks (after today)
        if (startDate && endDate) {
          query = query.gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
                       .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`))
                       .gt(dateColumn, (dashboardType === 'work' ? today : `${today}T23:59:59`));
        } else {
          query = query.gt(dateColumn, (dashboardType === 'work' ? today : `${today}T23:59:59`));
        }
        break;

      case 'overdue': {
        // Tasks before today that are not completed
        if (startDate && endDate) {
          query = query.gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
                       .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`))
                       .lt(dateColumn, (dashboardType === 'work' ? today : `${today}T00:00:00`));
        } else {
          query = query.lt(dateColumn, (dashboardType === 'work' ? today : `${today}T00:00:00`));
        }

        if (dashboardType === 'ea') {
          query = query.in('status', ['pending', 'extend', 'extended', 'Pending']);
        } else {
          query = query.is('submission_date', null);
          if (dashboardType === 'delegation') {
            query = query.neq('status', 'done');
          }
        }
        break;
      }

      case 'all':
        {
          const now2 = new Date();
          const prevMonthStart = new Date(now2.getFullYear(), now2.getMonth() - 1, 1)
            .toISOString().split('T')[0];
          const upperBound = endDate || today;
          const lowerBound = startDate || prevMonthStart;
          query = query
            .gte(dateColumn, `${lowerBound}T00:00:00`)
            .lte(dateColumn, `${upperBound}T23:59:59`);
        }
        break;
      default:
        if (dashboardType !== 'checklist' && dashboardType !== 'delegation') {
          query = query.lte(dateColumn, (dashboardType === 'work' ? today : `${today}T23:59:59`));
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

export const countPendingOrDelayTaskApi = async (dashboardType, staffFilter = null, shopFilter = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const today = new Date().toISOString().split('T')[0];
    // OLD: const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'ea') ? 'planned_date' : 
    //                        (dashboardType === 'work') ? 'current_date' : 'created_at';
    const dateColumn = getDateColumn(dashboardType);

    let query;
    if (dashboardType === 'delegation') {
      query = supabase
        .from('delegation')
        .select('*', { count: 'exact', head: true })
        .is('submission_date', null)
        .not('status', 'eq', 'done')
        .gte(dateColumn, `${today}T00:00:00`)
        .lte(dateColumn, `${today}T23:59:59`);
    } else {
      const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
        dashboardType === 'repair' ? 'repair_tasks' :
          dashboardType === 'ea' ? 'ea_tasks' : 
          dashboardType === 'work' ? 'work_task' : dashboardType;

      query = supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (dashboardType === 'ea') {
        query = query.in('status', ['pending', 'extend', 'extended', 'Pending']);
      } else {
        query = query.is('submission_date', null);
      }

      query = query.gte(dateColumn, (dashboardType === 'work' ? today : `${today}T00:00:00`))
        .lte(dateColumn, (dashboardType === 'work' ? today : `${today}T23:59:59`));
    }

    const nameField = dashboardType === 'repair' ? 'assigned_person' :
                      dashboardType === 'ea' ? 'doer_name' : 'name';

    const upperRole = (role || "").toUpperCase();
    // Apply filters
    if (upperRole === 'USER' && username) {
      query = query.eq(nameField, username);
    } else if (upperRole === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in(nameField, reportingUsers);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq(nameField, staffFilter);
    }

    // Apply shop filter
    if (dashboardType === 'ea') {
      let targetShops = [];
      if (shopFilter && shopFilter !== 'all') {
        targetShops = [shopFilter.toLowerCase()];
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        targetShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      }
      
      if (targetShops.length > 0) {
        const { data: dbUsers } = await supabase
          .from("users")
          .select("user_name, shop_name, user_access");
        if (dbUsers) {
          const allowedUsernames = dbUsers.filter(u => {
            const userShop = (u.shop_name || u.user_access || "").toLowerCase();
            const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
            return userShopsList.some(s => targetShops.includes(s));
          }).map(u => u.user_name || "");
          if (allowedUsernames.length > 0) {
            query = query.in('doer_name', allowedUsernames);
          } else {
            query = query.eq('doer_name', 'none');
          }
        }
      }
    } else {
      if (shopFilter && shopFilter !== 'all') {
        query = query.ilike('shop_name', shopFilter);
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
        if (managerShops.length > 0) {
          const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
          query = query.or(orCondition);
        }
      }
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

export const getDashboardSummaryApi = async (dashboardType, staffFilter = null, shopFilter = null, startDate = null, endDate = null) => {
  try {
    const [totalTasks, completedTasks, pendingTasks, overdueTasks] = await Promise.all([
      countTotalTaskApi(dashboardType, staffFilter, shopFilter, startDate, endDate),
      countCompleteTaskApi(dashboardType, staffFilter, shopFilter, startDate, endDate),
      countPendingOrDelayTaskApi(dashboardType, staffFilter, shopFilter),
      countOverDueORExtendedTaskApi(dashboardType, staffFilter, shopFilter, startDate, endDate)
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
export const fetchStaffTasksDataApi = async (
  dashboardType,
  staffFilter = null,
  shopFilter = null,
  page = 1,
  limit = 20,
  selectedMonth = null,
  startDateParam = null,
  endDateParam = null
) => {
  try {
    // console.log('Fetching staff tasks data:', { dashboardType, staffFilter, shopFilter, page, limit, selectedMonth });

    const role = (localStorage.getItem('role') || "").toUpperCase();
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

    // Calculate start and end dates for the selected month, or use params
    const startDate = startDateParam || `${year}-${month.toString().padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const endDate = endDateParam || `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;

    // OLD: const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'ea') ? 'planned_date' : 
    //                        (dashboardType === 'work') ? 'current_date' : 'created_at';
    const dateColumn = getDateColumn(dashboardType);

    // console.log('Date range for filtering:', {
    //   startDate,
    //   endDate,
    //   year,
    //   month,
    //   lastDayOfMonth,
    //   selectedMonth
    // });

    const nameField = dashboardType === 'repair' ? 'assigned_person' :
                      dashboardType === 'ea' ? 'doer_name' : 'name';

    // Build the query
    let query = supabase
      .from(dashboardType === 'maintenance' ? 'maintenance_tasks' :
        dashboardType === 'repair' ? 'repair_tasks' :
          dashboardType === 'ea' ? 'ea_tasks' : 
          dashboardType === 'work' ? 'work_task' : dashboardType)
      .select(dashboardType === 'work' ? '*, task_assignments:assignment_id(end_datetime, manager_name)' : '*')
      .gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
      .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`))
      .not(nameField, 'is', null);

    // Apply role-based filtering
    if (role === 'USER' && username) {
      query = query.eq(nameField, username);
    } else if (role === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in(nameField, reportingUsers);
    }

    // Apply staff filter if provided
    if (staffFilter && staffFilter !== 'all' && (role === 'ADMIN' || role === 'HOD' || role === 'MANAGER')) {
      query = query.eq(nameField, staffFilter);
    }

    // Apply shop filter
    if (dashboardType === 'ea') {
      let targetShops = [];
      if (shopFilter && shopFilter !== 'all') {
        targetShops = [shopFilter.toLowerCase()];
      } else if (role === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        targetShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      }
      
      if (targetShops.length > 0) {
        const { data: dbUsers } = await supabase
          .from("users")
          .select("user_name, shop_name, user_access");
        if (dbUsers) {
          const allowedUsernames = dbUsers.filter(u => {
            const userShop = (u.shop_name || u.user_access || "").toLowerCase();
            const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
            return userShopsList.some(s => targetShops.includes(s));
          }).map(u => u.user_name || "");
          if (allowedUsernames.length > 0) {
            query = query.in('doer_name', allowedUsernames);
          } else {
            query = query.eq('doer_name', 'none');
          }
        }
      }
    } else {
      if (shopFilter && shopFilter !== 'all') {
        query = query.ilike('shop_name', shopFilter);
      } else if (role === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
        if (managerShops.length > 0) {
          const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
          query = query.or(orCondition);
        }
      }
    }

    const { data: tasksData, error } = await query;

    if (error) {
      console.error("Error fetching tasks data:", error);
      throw error;
    }

    // console.log(`Found ${tasksData.length} tasks in date range ${startDate} to ${endDate}`);

    // Fetch active users to map shop managers
    const shopManagersMap = {};
    const managerNames = [];
    if (dashboardType === 'work') {
      try {
        const { data: dbUsers } = await supabase
          .from('users')
          .select('user_name, shop_name, user_access, role')
          .eq('status', 'active');

        if (dbUsers) {
          dbUsers.forEach(u => {
            const roleLower = (u.role || "").toLowerCase();
            if (roleLower === 'manager') {
              const accessStr = u.user_access || u.shop_name || "";
              const shops = accessStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
              shops.forEach(shop => {
                if (!shopManagersMap[shop]) {
                  shopManagersMap[shop] = new Set();
                }
                shopManagersMap[shop].add(u.user_name);
              });
              if (!managerNames.includes(u.user_name)) {
                managerNames.push(u.user_name);
              }
            }
          });
        }
      } catch (err) {
        console.error("Error loading managers for scoring:", err);
      }
    }

    // Process data to match SQL query structure
    const summary = {};

    tasksData.forEach(task => {
      const shopVal = task.shop || task.shop_name || (dashboardType === 'ea' ? 'EA' : 'No Shop');
      const nameVal = task.name || task.assigned_person || task.doer_name || 'Unnamed Staff';
      const key = `${shopVal}-${nameVal}`;

      if (!summary[key]) {
        summary[key] = {
          shop: shopVal,
          name: nameVal,
          total_tasks: 0,
          total_completed_tasks: 0,
          total_done_on_time: 0
        };
      }

      summary[key].total_tasks++;

      // Check if task is completed
      // Generic completion check: has submission_date AND (if delegation) is approved
      const statusLower = (task.status || "").toLowerCase();
      const isCompleted = (task.submission_date !== null) ||
        (statusLower === 'yes') ||
        (statusLower.includes('done')) ||
        (statusLower.includes('completed')) ||
        (statusLower.includes('approved')) ||
        (dashboardType === 'delegation' && task.admin_done === true);

      if (isCompleted) {
        summary[key].total_completed_tasks++;

        if (dashboardType === 'work') {
          let deadline = null;
          const endDateTimeStr = task.task_assignments?.end_datetime;
          if (task.current_date) {
            if (endDateTimeStr && endDateTimeStr.includes('T')) {
              const timeAndOffset = endDateTimeStr.split('T')[1];
              deadline = new Date(`${task.current_date}T${timeAndOffset}`);
            } else {
              deadline = new Date(`${task.current_date}T23:59:59+05:30`);
            }
          }
          if (task.submission_date && deadline && !isNaN(deadline.getTime())) {
            const submissionDate = new Date(task.submission_date);
            if (submissionDate <= deadline) {
              summary[key].total_done_on_time++;
            }
          }
        } else {
          // Check if done on time - use planned_date as the definitive deadline
          const dueDateStr = task.planned_date || task.current_date || task.task_start_date || task.created_at;
          if (task.submission_date && dueDateStr) {
            const submissionDate = new Date(task.submission_date);
            const dueDate = new Date(dueDateStr);

            // Compare dates only (ignore time)
            const submissionDateOnly = new Date(submissionDate.getFullYear(), submissionDate.getMonth(), submissionDate.getDate());
            const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

            // Count as "on time" only if submission date is same as or before due date
            if (submissionDateOnly <= dueDateOnly) {
              summary[key].total_done_on_time++;
            }
          }
        }
      }

      // ── MANAGER SCORING ──
      if (dashboardType === 'work') {
        const shopKey = (task.shop_name || "").trim().toLowerCase();
        const managersSet = shopManagersMap[shopKey];
        const managers = managersSet ? Array.from(managersSet) : [];

        // Identify the manager(s) responsible for this task:
        // Either the specific manager who assigned it, or fallback to the shop's active managers
        let responsibleManagers = [];
        if (task.task_assignments?.manager_name) {
          responsibleManagers = [task.task_assignments.manager_name];
        } else {
          responsibleManagers = managers;
        }

        if (!task.submission_date) {
          // Employee hasn't completed the task -> down-score responsible managers
          responsibleManagers.forEach(mgrName => {
            const mgrKey = `${shopVal}-${mgrName}`;
            if (!summary[mgrKey]) {
              summary[mgrKey] = {
                shop: shopVal,
                name: mgrName,
                total_tasks: 0,
                total_completed_tasks: 0,
                total_done_on_time: 0
              };
            }
            summary[mgrKey].total_tasks++;
          });
        } else {
          // Employee has completed/submitted the task
          if (task.manager_approved_by) {
            // Manager approved it
            const mgrName = task.manager_approved_by;
            const mgrKey = `${shopVal}-${mgrName}`;
            if (!summary[mgrKey]) {
              summary[mgrKey] = {
                shop: shopVal,
                name: mgrName,
                total_tasks: 0,
                total_completed_tasks: 0,
                total_done_on_time: 0
              };
            }
            summary[mgrKey].total_tasks++;
            summary[mgrKey].total_completed_tasks++;

            // Manager approved on time only if approved on the same day as task submission
            const approvalDate = new Date(task.manager_approval_date || task.updated_at);
            const submissionDate = new Date(task.submission_date);
            const approvalDateOnly = new Date(approvalDate.getFullYear(), approvalDate.getMonth(), approvalDate.getDate());
            const submissionDateOnly = new Date(submissionDate.getFullYear(), submissionDate.getMonth(), submissionDate.getDate());

            if (approvalDateOnly.getTime() === submissionDateOnly.getTime()) {
              summary[mgrKey].total_done_on_time++;
            }
          } else {
            // Completed by employee, but pending manager approval -> down-score responsible managers
            responsibleManagers.forEach(mgrName => {
              const mgrKey = `${shopVal}-${mgrName}`;
              if (!summary[mgrKey]) {
                summary[mgrKey] = {
                  shop: shopVal,
                  name: mgrName,
                  total_tasks: 0,
                  total_completed_tasks: 0,
                  total_done_on_time: 0
                };
              }
              summary[mgrKey].total_tasks++;
            });
          }
        }
      }
    });

    // Fetch user images for the staff and managers found
    const staffNames = tasksData.map(t => t.name || t.assigned_person || t.doer_name).filter(Boolean);
    const uniqueNames = [...new Set([...staffNames, ...managerNames])];
    let userImageMap = {};

    if (uniqueNames.length > 0) {
      const { data: userDataForImages, error: userError } = await supabase
        .from('users')
        .select('user_name, profile_image')
        .in('user_name', uniqueNames);

      if (!userError && userDataForImages) {
        userDataForImages.forEach(u => {
          userImageMap[u.user_name] = u.profile_image;
        });
      }
    }

    // Calculate scores and convert to array
    let staffResults = Object.values(summary).map(staff => {
      // Overall Performance Score: (On-time tasks / Total tasks) * 100
      // This gives 0 if nothing completed, and reflects both completion and timeliness
      const performance_score = staff.total_tasks > 0
        ? Math.round((staff.total_done_on_time / staff.total_tasks) * 100)
        : 0;

      // Completion rate for internal reference
      const completion_rate = staff.total_tasks > 0
        ? Math.round((staff.total_completed_tasks / staff.total_tasks) * 100)
        : 0;

      return {
        id: (staff.name || "unnamed").replace(/\s+/g, "-").toLowerCase(),
        shop: ((staff.shop || staff.shop_name) || (staff.shop || staff.shop_name)) || "No Shop",
        name: staff.name || "Unnamed Staff",
        email: `${(staff.name || "user").toLowerCase().replace(/\s+/g, ".")}@example.com`,
        profile_image: userImageMap[staff.name] || null,
        total_tasks: staff.total_tasks,
        total_completed_tasks: staff.total_completed_tasks,
        total_done_on_time: staff.total_done_on_time,
        completion_score: completion_rate,
        ontime_score: performance_score // This is the 'Score' shown in the table
      };
    });

    // Sort by completion score descending (Top performers first)
    staffResults.sort((a, b) => b.completion_score - a.completion_score || b.total_completed_tasks - a.total_completed_tasks);

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit;
    const paginatedResults = staffResults.slice(from, to);

    // console.log(`Fetched ${paginatedResults.length} staff members with task data for ${month}/${year}`);
    return paginatedResults;

  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getStaffTasksCountApi = async (
  dashboardType,
  staffFilter = null,
  shopFilter = null,
  selectedMonth = null,
  startDateParam = null,
  endDateParam = null
) => {
  try {
    const role = (localStorage.getItem('role') || "").toUpperCase();
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

    const startDate = startDateParam || `${year}-${month.toString().padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const endDate = endDateParam || `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;

    // OLD: const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'ea') ? 'planned_date' : 
    //                        (dashboardType === 'work') ? 'current_date' : 'created_at';
    const dateColumn = getDateColumn(dashboardType);

    const nameField = dashboardType === 'repair' ? 'assigned_person' :
                      dashboardType === 'ea' ? 'doer_name' : 'name';
    const selectFields = dashboardType === 'ea' ? 'doer_name' :
                         dashboardType === 'repair' ? 'shop_name, assigned_person' :
                         dashboardType === 'work' ? 'shop_name, name, task_assignments:assignment_id(manager_name)' : 'shop_name, name';

    let query = supabase
      .from(dashboardType === 'maintenance' ? 'maintenance_tasks' :
        dashboardType === 'repair' ? 'repair_tasks' :
          dashboardType === 'ea' ? 'ea_tasks' : 
          dashboardType === 'work' ? 'work_task' : dashboardType)
      .select(selectFields)
      .gte(dateColumn, (dashboardType === 'work' ? startDate : `${startDate}T00:00:00`))
      .lte(dateColumn, (dashboardType === 'work' ? endDate : `${endDate}T23:59:59`))
      .not(nameField, 'is', null);

    // Apply role-based filtering
    if (role === 'USER' && username) {
      query = query.eq(nameField, username);
    } else if (role === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in(nameField, reportingUsers);
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && (role === 'ADMIN' || role === 'HOD' || role === 'MANAGER')) {
      query = query.eq(nameField, staffFilter);
    }

    // Apply shop filter
    if (dashboardType === 'ea') {
      let targetShops = [];
      if (shopFilter && shopFilter !== 'all') {
        targetShops = [shopFilter.toLowerCase()];
      } else if (role === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        targetShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      }
      
      if (targetShops.length > 0) {
        const { data: dbUsers } = await supabase
          .from("users")
          .select("user_name, shop_name, user_access");
        if (dbUsers) {
          const allowedUsernames = dbUsers.filter(u => {
            const userShop = (u.shop_name || u.user_access || "").toLowerCase();
            const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
            return userShopsList.some(s => targetShops.includes(s));
          }).map(u => u.user_name || "");
          if (allowedUsernames.length > 0) {
            query = query.in('doer_name', allowedUsernames);
          } else {
            query = query.eq('doer_name', 'none');
          }
        }
      }
    } else {
      if (shopFilter && shopFilter !== 'all') {
        query = query.ilike('shop_name', shopFilter);
      } else if (role === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
        if (managerShops.length > 0) {
          const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
          query = query.or(orCondition);
        }
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error getting staff count:", error);
      throw error;
    }

    // Count unique staff names and responsible managers for work tasks
    const uniqueStaff = new Set();
    const shopManagersMap = {};

    if (dashboardType === 'work') {
      try {
        const { data: dbUsers } = await supabase
          .from('users')
          .select('user_name, shop_name, user_access, role')
          .eq('status', 'active');

        if (dbUsers) {
          dbUsers.forEach(u => {
            const roleLower = (u.role || "").toLowerCase();
            if (roleLower === 'manager') {
              const accessStr = u.user_access || u.shop_name || "";
              const shops = accessStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
              shops.forEach(shop => {
                if (!shopManagersMap[shop]) {
                  shopManagersMap[shop] = new Set();
                }
                shopManagersMap[shop].add(u.user_name);
              });
            }
          });
        }
      } catch (err) {
        console.error("Error loading managers for count:", err);
      }
    }

    data.forEach(item => {
      const shopVal = item.shop || item.shop_name || (dashboardType === 'ea' ? 'EA' : 'No Shop');
      const nameVal = item.name || item.assigned_person || item.doer_name || 'Unnamed Staff';
      uniqueStaff.add(`${shopVal}-${nameVal}`);

      if (dashboardType === 'work') {
        const shopKey = (item.shop_name || "").trim().toLowerCase();
        const managersSet = shopManagersMap[shopKey];
        const managers = managersSet ? Array.from(managersSet) : [];

        let responsibleManagers = [];
        if (item.task_assignments?.manager_name) {
          responsibleManagers = [item.task_assignments.manager_name];
        } else {
          responsibleManagers = managers;
        }

        responsibleManagers.forEach(mgrName => {
          uniqueStaff.add(`${shopVal}-${mgrName}`);
        });

        if (item.manager_approved_by) {
          uniqueStaff.add(`${shopVal}-${item.manager_approved_by}`);
        }
      }
    });
    // console.log(`Total unique staff count for ${month}/${year}: ${uniqueStaff.size}`);
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

export const getTotalUsersCountApi = async (shopFilter = null) => {
  try {
    const role = (localStorage.getItem('role') || "").toUpperCase();
    const username = localStorage.getItem('user-name');

    let query = supabase
      .from('users')
      .select('user_name, shop_name', { count: 'exact', head: true })
      .not('user_name', 'is', null)
      .not('user_name', 'eq', '');

    // Apply role-based filtering
    if (role === 'HOD' && username) {
      query = query.or(`reported_by.eq.${username},user_name.eq.${username}`);
    }

    // Apply shop filter if provided and not "all"
    if (shopFilter && shopFilter !== 'all') {
      query = query.ilike('shop_name', shopFilter);
    } else if (role === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        query = query.or(orCondition);
      }
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error fetching total users count:", error);
      throw error;
    }

    // console.log(`Total users count${shopFilter && shopFilter !== 'all' ? ` for shop ${shopFilter}` : ''}: ${count}`);
    return count || 0;
  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};

export const getUniqueShopsApi = async () => {
  try {
    // Shops are managed in the dedicated 'shop' table (same as Settings page)
    const { data, error } = await supabase
      .from('shop')
      .select('shop_name')
      .not('shop_name', 'is', null)
      .not('shop_name', 'eq', '')
      .order('shop_name', { ascending: true });

    if (error) {
      console.error("Error fetching shops:", error);
      throw error;
    }

    const role = localStorage.getItem('role');
    const userAccess = localStorage.getItem('user_access');

    let shops = (data || []).map(d => d.shop_name.trim()).filter(Boolean);

    if ((role === 'HOD' || role === 'manager') && userAccess && userAccess !== 'all') {
      const allowedShops = userAccess.split(',').map(d => d.trim().toLowerCase());
      shops = shops.filter(d => allowedShops.includes(d.toLowerCase()));
    }

    return shops;
  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};



export const getStaffNamesByShopApi = async (shopFilter = null) => {
  try {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    let query = supabase
      .from('users')
      .select('user_name, user_access, shop_name, status, reported_by')
      .not('user_name', 'is', null)
      .not('user_name', 'eq', '')
      .eq('status', 'active');

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching staff names:", error);
      throw error;
    }

    let staff = data;

    // Filter by HOD reports if applicable
    if (role === 'HOD' && username) {
      staff = staff.filter(user => user.reported_by === username || user.user_name === username);
    }

    // Filter by Manager shop if applicable
    if (role === 'manager') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      staff = staff.filter(user => {
        const userShop = (user.shop_name || user.user_access || "").toLowerCase();
        const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
        return userShopsList.some(s => managerShops.includes(s));
      });
    }

    // Filter by shop if provided
    if (shopFilter && shopFilter !== 'all') {
      staff = staff.filter(user => {
        const userAccessStr = (user.user_access || "").toLowerCase();
        const shopFilterLower = shopFilter.toLowerCase();
        
        // If user_access contains admin, check their shop_name
        if (userAccessStr === 'admin' || userAccessStr.includes('admin')) {
          const userShopNameStr = (user.shop_name || "").toLowerCase();
          const shopNameList = userShopNameStr.split(',').map(dept => dept.trim());
          return shopNameList.includes(shopFilterLower);
        }
        
        // Otherwise, check user_access
        const userAccessList = userAccessStr.split(',').map(dept => dept.trim());
        return userAccessList.includes(shopFilterLower);
      });
    }

    const names = [...new Set(staff.map(user => user.user_name).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b)); // Alphabetical order
  } catch (error) {
    console.error("Error from Supabase:", error);
    throw error;
  }
};


export const fetchChecklistDataByDateRangeApi = async (
  startDate,
  endDate,
  staffFilter = null,
  shopFilter = null,
  page = 1,
  limit = 1000, // Increased for better performance
  statusFilter = 'all',
  dashboardType = 'checklist'
) => {
  try {
    console.log('Fetching checklist data by date range:', {
      startDate,
      endDate,
      staffFilter,
      shopFilter,
      page,
      limit,
      statusFilter,
      dashboardType
    });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const role = (localStorage.getItem('role') || "").toUpperCase();
    const username = localStorage.getItem('user-name');

    const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
      dashboardType === 'repair' ? 'repair_tasks' :
        dashboardType === 'ea' ? 'ea_tasks' : 'checklist';

    // OLD: const dateColumn = 'planned_date'; // This API is specific to checklist
    const dateColumn = 'task_start_date'; // Checklist uses task_start_date column

    let query = supabase
      .from(tableName)
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

    const upperRole = (role || "").toUpperCase();
    // Apply role-based filtering
    if (upperRole === 'USER' && username) {
      query = query.eq('name', username);
    }

    // Apply shop filter
    if (shopFilter && shopFilter !== 'all') {
      query = query.ilike('shop_name', shopFilter);
    } else if (upperRole === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        query = query.or(orCondition);
      }
    }

    // Apply staff filter (for admin users)
    if (staffFilter && staffFilter !== 'all' && (upperRole === 'ADMIN' || upperRole === 'MANAGER')) {
      query = query.eq('name', staffFilter);
    }

    // Apply status filter
    switch (statusFilter) {
      case 'completed':
        query = query.not('submission_date', 'is', null);
        break;
      case 'pending': {
        const today = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .gte(dateColumn, `${today}T00:00:00`);
        break;
      }
      case 'overdue': {
        const todayOverdue = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .lt(dateColumn, `${todayOverdue}T00:00:00`);
        break;
      }
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
  shopFilter = null,
  statusFilter = 'all',
  dashboardType = 'checklist'
) => {
  try {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
      dashboardType === 'repair' ? 'repair_tasks' :
        dashboardType === 'ea' ? 'ea_tasks' : 'checklist';

    let query = supabase
      .from(tableName)
      .select('*'); // Removed { count: 'exact', head: true } to actually fetch data

    // OLD: const dateColumn = 'planned_date'; // checklist specific
    const dateColumn = 'task_start_date'; // Checklist uses task_start_date column

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

    const upperRole = (role || "").toUpperCase();
    // Apply role-based filtering
    if (upperRole === 'USER' && username) {
      query = query.eq('name', username);
    }

    // Apply shop filter
    if (shopFilter && shopFilter !== 'all') {
      query = query.ilike('shop_name', shopFilter);
    } else if (upperRole === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        query = query.or(orCondition);
      }
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && (upperRole === 'ADMIN' || upperRole === 'MANAGER')) {
      query = query.eq('name', staffFilter);
    }

    // Apply status filter
    switch (statusFilter) {
      case 'completed':
        query = query.not('submission_date', 'is', null);
        break;
      case 'pending': {
        const today = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .gte(dateColumn, `${today}T00:00:00`);
        break;
      }
      case 'overdue': {
        const todayOverdue = new Date().toISOString().split('T')[0];
        query = query.is('submission_date', null)
          .lt(dateColumn, `${todayOverdue}T00:00:00`);
        break;
      }
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
  shopFilter = null,
  dashboardType = 'checklist'
) => {
  try {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');

    console.log('📊 getChecklistDateRangeStatsApi called with:', {
      startDate, endDate, staffFilter, shopFilter
    });

    // OLD: const dateColumn = 'planned_date'; // checklist specific
    const dateColumn = 'task_start_date'; // Checklist uses task_start_date column

    const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
      dashboardType === 'repair' ? 'repair_tasks' :
        dashboardType === 'ea' ? 'ea_tasks' : 'checklist';

    // MAIN FIX: Remove the today date filter that was limiting results
    let totalQuery = supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    // Apply ONLY date range filter - no other date restrictions
    if (startDate && endDate) {
      totalQuery = totalQuery
        .gte(dateColumn, `${startDate}T00:00:00`)
        .lte(dateColumn, `${endDate}T23:59:59`);
    }

    const upperRole = (role || "").toUpperCase();
    // Apply role-based filtering
    if (upperRole === 'USER' && username) {
      totalQuery = totalQuery.eq('name', username);
    }

    // Apply shop filter
    if (shopFilter && shopFilter !== 'all') {
      totalQuery = totalQuery.ilike('shop_name', shopFilter);
    } else if (upperRole === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        totalQuery = totalQuery.or(orCondition);
      }
    }

    // Apply staff filter
    if (staffFilter && staffFilter !== 'all' && (upperRole === 'ADMIN' || upperRole === 'MANAGER')) {
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
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .not('submission_date', 'is', null);

    // Apply the same date range and filters
    if (startDate && endDate) {
      completedQuery = completedQuery
        .gte('planned_date', `${startDate}T00:00:00`)
        .lte('planned_date', `${endDate}T23:59:59`);
    }
    if (upperRole === 'USER' && username) {
      completedQuery = completedQuery.eq('name', username);
    }
    if (shopFilter && shopFilter !== 'all') {
      completedQuery = completedQuery.ilike('shop_name', shopFilter);
    } else if (upperRole === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        completedQuery = completedQuery.or(orCondition);
      }
    }
    if (staffFilter && staffFilter !== 'all' && (upperRole === 'ADMIN' || upperRole === 'MANAGER')) {
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

    const today = new Date().toISOString().split('T')[0];
    let overdueQuery = supabase
      .from('checklist')
      .select('*', { count: 'exact', head: true })
      .is('submission_date', null) // Not submitted
      .lt('planned_date', `${today}T00:00:00`); // Before today

    // Apply the same date range and filters
    if (startDate && endDate) {
      overdueQuery = overdueQuery
        .gte('planned_date', `${startDate}T00:00:00`)
        .lte('planned_date', `${endDate}T23:59:59`);
    }
    if (upperRole === 'USER' && username) {
      overdueQuery = overdueQuery.eq('name', username);
    }
    if (shopFilter && shopFilter !== 'all') {
      overdueQuery = overdueQuery.ilike('shop_name', shopFilter);
    } else if (upperRole === 'MANAGER') {
      const userAccess = localStorage.getItem('user_access') || "";
      const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
      if (managerShops.length > 0) {
        const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
        overdueQuery = overdueQuery.or(orCondition);
      }
    }
    if (staffFilter && staffFilter !== 'all' && (upperRole === 'ADMIN' || upperRole === 'MANAGER')) {
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
  shopFilter = null,
  statusFilter = 'all'
) => {
  try {
    console.log('🚀 Fetching COMPLETE checklist data for date range:', {
      startDate,
      endDate,
      staffFilter,
      shopFilter,
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
      shopFilter,
      statusFilter
    );

    console.log(`📈 Expected total records: ${totalCount}`);

    while (hasMore) {
      console.log(`📄 Fetching page ${page}...`);

      const data = await fetchChecklistDataByDateRangeApi(
        startDate,
        endDate,
        staffFilter,
        shopFilter,
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


export const countTotalTaskApi = async (dashboardType, staffFilter = null, shopFilter = null, startDate = null, endDate = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const { start: defaultStart, end: defaultEnd } = getCurrentMonthRange();
    const start = startDate ? `${startDate}T00:00:00` : defaultStart;
    const end = endDate ? `${endDate}T23:59:59` : defaultEnd;
    
    // OLD: const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'ea') ? 'planned_date' : 
    //                        (dashboardType === 'work') ? 'current_date' : 'created_at';
    const dateColumn = getDateColumn(dashboardType);
    
    const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
      dashboardType === 'repair' ? 'repair_tasks' :
        dashboardType === 'ea' ? 'ea_tasks' : 
        dashboardType === 'work' ? 'work_task' : dashboardType;

    let query = supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .gte(dateColumn, (dashboardType === 'work' ? (startDate || defaultStart.split('T')[0]) : start))
      .lte(dateColumn, (dashboardType === 'work' ? (endDate || defaultEnd.split('T')[0]) : end));

    const nameField = dashboardType === 'repair' ? 'assigned_person' :
                      dashboardType === 'ea' ? 'doer_name' : 'name';

    // Apply filters
    const upperRole = (role || "").toUpperCase();
    if (upperRole === 'USER' && username) {
      query = query.eq(nameField, username);
    } else if (upperRole === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in(nameField, reportingUsers);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq(nameField, staffFilter);
    }

    // Apply shop filter
    if (dashboardType === 'ea') {
      let targetShops = [];
      if (shopFilter && shopFilter !== 'all') {
        targetShops = [shopFilter.toLowerCase()];
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        targetShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      }
      
      if (targetShops.length > 0) {
        const { data: dbUsers } = await supabase
          .from("users")
          .select("user_name, shop_name, user_access");
        if (dbUsers) {
          const allowedUsernames = dbUsers.filter(u => {
            const userShop = (u.shop_name || u.user_access || "").toLowerCase();
            const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
            return userShopsList.some(s => targetShops.includes(s));
          }).map(u => u.user_name || "");
          if (allowedUsernames.length > 0) {
            query = query.in('doer_name', allowedUsernames);
          } else {
            query = query.eq('doer_name', 'none');
          }
        }
      }
    } else {
      if (shopFilter && shopFilter !== 'all') {
        query = query.ilike('shop_name', shopFilter);
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
        if (managerShops.length > 0) {
          const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
          query = query.or(orCondition);
        }
      }
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
export const countCompleteTaskApi = async (dashboardType, staffFilter = null, shopFilter = null, startDate = null, endDate = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const { start: defaultStart, end: defaultEnd } = getCurrentMonthRange();
    const start = startDate ? `${startDate}T00:00:00` : defaultStart;
    const end = endDate ? `${endDate}T23:59:59` : defaultEnd;
    
    // OLD: const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'ea') ? 'planned_date' : 
    //                        (dashboardType === 'work') ? 'current_date' : 'created_at';
    const dateColumn = getDateColumn(dashboardType);
    let query;

    if (dashboardType === 'delegation') {
      query = supabase
        .from('delegation')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'done')
        .eq('admin_done', true)
        .gte(dateColumn, start)
        .lte(dateColumn, end);
    } else {
      const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
        dashboardType === 'repair' ? 'repair_tasks' :
          dashboardType === 'ea' ? 'ea_tasks' : 
          dashboardType === 'work' ? 'work_task' : dashboardType;

      query = supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .gte(dateColumn, (dashboardType === 'work' ? (startDate || defaultStart.split('T')[0]) : start))
        .lte(dateColumn, (dashboardType === 'work' ? (endDate || defaultEnd.split('T')[0]) : end));

      if (dashboardType === 'work') {
        // Very inclusive check for Work tasks to ensure nothing is missed
        query = query.or('status.in.("Done","SUBMITTED","done","APPROVED","Approved","submitted"),admin_done.eq.true,submission_date.not.is.null')
                     .not('status', 'ilike', 'REJECTED');
      } else if (dashboardType === 'ea') {
        // EA doesn't have submission_date, use status/admin_done
        query = query.or('status.ilike.done,admin_done.eq.true');
      } else {
        query = query.not('submission_date', 'is', null);
      }
    }

    const nameField = dashboardType === 'repair' ? 'assigned_person' :
                      dashboardType === 'ea' ? 'doer_name' : 'name';

    const upperRole = (role || "").toUpperCase();
    // Apply filters
    if (upperRole === 'USER' && username) {
      query = query.eq(nameField, username);
    } else if (upperRole === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in(nameField, reportingUsers);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq(nameField, staffFilter);
    }

    // Apply shop filter
    if (dashboardType === 'ea') {
      let targetShops = [];
      if (shopFilter && shopFilter !== 'all') {
        targetShops = [shopFilter.toLowerCase()];
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        targetShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      }
      
      if (targetShops.length > 0) {
        const { data: dbUsers } = await supabase
          .from("users")
          .select("user_name, shop_name, user_access");
        if (dbUsers) {
          const allowedUsernames = dbUsers.filter(u => {
            const userShop = (u.shop_name || u.user_access || "").toLowerCase();
            const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
            return userShopsList.some(s => targetShops.includes(s));
          }).map(u => u.user_name || "");
          if (allowedUsernames.length > 0) {
            query = query.in('doer_name', allowedUsernames);
          } else {
            query = query.eq('doer_name', 'none');
          }
        }
      }
    } else {
      if (shopFilter && shopFilter !== 'all') {
        query = query.ilike('shop_name', shopFilter);
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
        if (managerShops.length > 0) {
          const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
          query = query.or(orCondition);
        }
      }
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

export const countOverDueORExtendedTaskApi = async (dashboardType, staffFilter = null, shopFilter = null, startDate = null, endDate = null) => {
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('user-name');

  try {
    const { start: defaultStart, todayStart } = getCurrentMonthRange();
    const start = startDate ? `${startDate}T00:00:00` : defaultStart;
    
    // OLD: const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance' || dashboardType === 'ea') ? 'planned_date' : 
    //                        (dashboardType === 'work') ? 'current_date' : 'created_at';
    const dateColumn = getDateColumn(dashboardType);
    let query;

    if (dashboardType === 'delegation') {
      query = supabase
        .from('delegation')
        .select('*', { count: 'exact', head: true })
        .is('submission_date', null)
        .not('status', 'eq', 'done')
        .lt(dateColumn, todayStart)
        .gte(dateColumn, start);
    } else {
      const tableName = dashboardType === 'maintenance' ? 'maintenance_tasks' :
        dashboardType === 'repair' ? 'repair_tasks' :
          dashboardType === 'ea' ? 'ea_tasks' : 
          dashboardType === 'work' ? 'work_task' : dashboardType;

      query = supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (dashboardType === 'ea') {
        query = query.in('status', ['pending', 'extend', 'extended', 'Pending']);
      } else {
        query = query.is('submission_date', null);
      }

      query = query.lt(dateColumn, (dashboardType === 'work' ? todayStart.split('T')[0] : todayStart))
        .gte(dateColumn, (dashboardType === 'work' ? start.split('T')[0] : start));
    }

    const nameField = dashboardType === 'repair' ? 'assigned_person' :
                      dashboardType === 'ea' ? 'doer_name' : 'name';

    const upperRole = (role || "").toUpperCase();
    // Apply filters
    if (upperRole === 'USER' && username) {
      query = query.eq(nameField, username);
    } else if (upperRole === 'HOD' && username) {
      const { data: reports } = await supabase
        .from("users")
        .select("user_name")
        .eq("reported_by", username);
      const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
      query = query.in(nameField, reportingUsers);
    } else if (staffFilter && staffFilter !== 'all') {
      query = query.eq(nameField, staffFilter);
    }

    // Apply shop filter
    if (dashboardType === 'ea') {
      let targetShops = [];
      if (shopFilter && shopFilter !== 'all') {
        targetShops = [shopFilter.toLowerCase()];
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        targetShops = userAccess.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      }
      
      if (targetShops.length > 0) {
        const { data: dbUsers } = await supabase
          .from("users")
          .select("user_name, shop_name, user_access");
        if (dbUsers) {
          const allowedUsernames = dbUsers.filter(u => {
            const userShop = (u.shop_name || u.user_access || "").toLowerCase();
            const userShopsList = userShop.split(',').map(s => s.trim()).filter(Boolean);
            return userShopsList.some(s => targetShops.includes(s));
          }).map(u => u.user_name || "");
          if (allowedUsernames.length > 0) {
            query = query.in('doer_name', allowedUsernames);
          } else {
            query = query.eq('doer_name', 'none');
          }
        }
      }
    } else {
      if (shopFilter && shopFilter !== 'all') {
        query = query.ilike('shop_name', shopFilter);
      } else if (upperRole === 'MANAGER') {
        const userAccess = localStorage.getItem('user_access') || "";
        const managerShops = userAccess.split(',').map(s => s.trim()).filter(Boolean);
        if (managerShops.length > 0) {
          const orCondition = managerShops.map(shop => `shop_name.ilike."${shop}"`).join(',');
          query = query.or(orCondition);
        }
      }
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

/**
 * Invoke the Edge Function to compute combined dashboard data and statistics
 */
export const fetchDashboardStatsApi = async (filters) => {
  try {
    const { data, error } = await supabase.functions.invoke('calculate-dashboard-stats', {
      body: {
        dashboardType: filters.dashboardType,
        shopFilter: filters.shopFilter,
        staffFilter: filters.staffFilter,
        startDate: filters.startDate,
        endDate: filters.endDate
      }
    })
    
    if (error) {
      console.error("Error calling edge function:", error)
      return null
    }
    
    return data // Returns: { tasks, summaryStats }
  } catch (err) {
    console.error("Exception calling edge function:", err)
    return null
  }
}