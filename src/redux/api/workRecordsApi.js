import supabase from "../../SupabaseClient";
import { sendTaskAssignmentNotification, sendMultipleWorkTasksNotification } from "../../services/whatsappService";

/**
 * Fetches all active tasks from master_work_tasks.
 * Includes shop information.
 */
export const fetchMasterWorkTasksApi = async () => {
  try {
    const { data, error } = await supabase
      .from('master_work_tasks')
      .select('*, shop(id, shop_name)')
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching master work tasks:", error);
    throw error;
  }
};

/**
 * Fetches all current assignments from task_assignments.
 */
export const fetchTaskAssignmentsApi = async () => {
  try {
    const { data, error } = await supabase
      .from('task_assignments')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching task assignments:", error);
    throw error;
  }
};

/**
 * Bulk upserts task assignments.
 * Uses task_id as the conflict target.
 */
export const upsertTaskAssignmentsApi = async (assignments) => {
  try {
    const { data, error } = await supabase
      .from('task_assignments')
      .upsert(assignments, { onConflict: 'task_id' })
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error upserting task assignments:", error);
    throw error;
  }
};

/**
 * Generates individual work_task records for each day in the assignment range.
 */
export const generateWorkTasksApi = async (assignments) => {
  try {
    const tasksToInsert = [];

    // Gather all employee names, dates, task descriptions, and task_ids to query comprehensively
    const employeeNames = [];
    const dateStrings = [];
    const taskDescriptions = [];
    const taskIds = [];

    assignments.forEach(asgn => {
      if (asgn.employee_name) {
        asgn.employee_name.split(',').forEach(e => {
          const trimmed = e.trim();
          if (trimmed && !employeeNames.includes(trimmed)) employeeNames.push(trimmed);
        });
      }
      if (asgn.task_name && !taskDescriptions.includes(asgn.task_name)) {
        taskDescriptions.push(asgn.task_name);
      }
      if (asgn.task_id && !taskIds.includes(asgn.task_id)) {
        taskIds.push(asgn.task_id);
      }

      const start = new Date(asgn.start_datetime);
      const end = new Date(asgn.end_datetime);
      const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dateStrings.includes(dateStr)) dateStrings.push(dateStr);
      }
    });

    let existingTasks = [];
    if (employeeNames.length > 0 && dateStrings.length > 0) {
      const { data, error } = await supabase
        .from('work_task')
        .select('assignment_id, current_date, name, task_description, task_id')
        .in('name', employeeNames)
        .in('current_date', dateStrings);

      if (!error && data) {
        existingTasks = data;
      }
    }

    // Build existing keys sets for different possible unique constraints
    const existingAsgnKeys = new Set(existingTasks.map(t => `${t.assignment_id}_${t.current_date}_${t.name}`));
    const existingDescKeys = new Set(existingTasks.map(t => `${t.name}_${t.current_date}_${t.task_description}`));
    const existingIdKeys = new Set(existingTasks.map(t => `${t.name}_${t.current_date}_${t.task_id}`));

    // Keep track of keys we are about to insert to avoid duplicates within the insertion payload itself
    const insertedKeys = new Set();

    for (const asgn of assignments) {
      const start = new Date(asgn.start_datetime);
      const end = new Date(asgn.end_datetime);

      const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      const employeeNamesList = asgn.employee_name
        ? asgn.employee_name.split(',').map(e => e.trim()).filter(Boolean)
        : [];

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        for (const empName of employeeNamesList) {
          const asgnKey = `${asgn.assignmentId}_${dateStr}_${empName}`;
          const descKey = `${empName}_${dateStr}_${asgn.task_name}`;
          const idKey = `${empName}_${dateStr}_${asgn.task_id}`;

          // Avoid inserting if it already exists in the database under any of the unique constraints
          const existsInDb =
            (asgn.assignmentId && existingAsgnKeys.has(asgnKey)) ||
            existingDescKeys.has(descKey) ||
            existingIdKeys.has(idKey);

          // Avoid inserting if we already added it in this run
          const existsInCurrentPayload = insertedKeys.has(descKey) || insertedKeys.has(idKey);

          if (!existsInDb && !existsInCurrentPayload) {
            insertedKeys.add(descKey);
            insertedKeys.add(idKey);

            tasksToInsert.push({
              task_id: asgn.task_id,
              name: empName,
              task_description: asgn.task_name,
              shop_name: asgn.shopName,
              department: asgn.department,
              duration: asgn.estimated_minutes,
              "current_date": dateStr,
              status: (new Date(d.getFullYear(), d.getMonth(), d.getDate()) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))
                ? 'OVERDUE'
                : (new Date(d.getFullYear(), d.getMonth(), d.getDate()) > new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))
                  ? 'UPCOMING'
                  : 'PENDING',
              assignment_id: asgn.assignmentId
            });
          }
        }
      }
    }

    if (tasksToInsert.length > 0) {
      // 1. Insert into work_task
      const { error: insertError } = await supabase
        .from('work_task')
        .insert(tasksToInsert);

      if (insertError) throw insertError;
    }

    // 2. Update task_assignments status to 'GENERATED'
    const { error: updateError } = await supabase
      .from('task_assignments')
      .update({ status: 'GENERATED' })
      .in('id', assignments.map(a => a.id));

    if (updateError) throw updateError;

    return { success: true, count: tasksToInsert.length };
  } catch (error) {
    console.error("❌ Error generating work tasks:", error);
    throw error;
  }
};

/**
 * Resets task assignments and deletes generated work_tasks.
 */
export const resetWorkTasksApi = async (assignmentIds) => {
  try {
    // 1. Delete from work_task
    const { error: deleteError } = await supabase
      .from('work_task')
      .delete()
      .in('assignment_id', assignmentIds);

    if (deleteError) throw deleteError;

    // 2. Update task_assignments status back to 'ACTIVE'
    const { error: updateError } = await supabase
      .from('task_assignments')
      .update({ status: 'ACTIVE' })
      .in('id', assignmentIds);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error) {
    console.error("❌ Error resetting work tasks:", error);
    throw error;
  }
};

/**
 * Fetches work tasks for a specific employee.
 */
export const fetchWorkTasksForUserApi = async (username) => {
  try {
    const { data, error } = await supabase
      .from('work_task')
      .select('*, task_assignments:assignment_id(start_datetime, end_datetime)')
      .eq('name', username)
      .order('current_date', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching user work tasks:", error);
    throw error;
  }
};

/**
 * Submits a work task.
 */
export const submitWorkTaskApi = async (taskId, submissionData) => {
  try {
    const { data, error } = await supabase
      .from('work_task')
      .update({
        remark: submissionData.remark,
        image: submissionData.image,
        status: 'Done',
        submission_date: new Date().toISOString()
      })
      .eq('id', taskId)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error submitting work task:", error);
    throw error;
  }
};

/**
 * Fetches pending approvals for work tasks.
 */
export const fetchPendingWorkApprovalsApi = async (role) => {
  try {
    const userRole = (role || "").toLowerCase();
    let query = supabase.from('work_task').select('*, task_assignments:assignment_id(manager_name)');

    if (userRole === 'manager') {
      query = query.or('status.eq.SUBMITTED,status.eq.Done,status.eq.done,status.eq.COMPLETED,status.eq.completed');
    } else if (userRole === 'admin') {
      query = query.eq('status', 'MANAGER_APPROVED');
    } else {
      query = query.or('status.eq.SUBMITTED,status.eq.Done,status.eq.done,status.eq.COMPLETED,status.eq.completed');
    }

    const { data, error } = await query
      .not('submission_date', 'is', null)
      .order('submission_date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching pending work approvals:", error);
    throw error;
  }
};

/**
 * Fetches approved/rejected history for work tasks.
 */
export const fetchWorkTaskHistoryApi = async (role, username) => {
  try {
    const userRole = (role || localStorage.getItem("role") || "").toLowerCase();
    const userName = username || localStorage.getItem("user-name");
    let query = supabase.from('work_task').select('*, task_assignments:assignment_id(manager_name)');

    if (userRole === 'manager') {
      query = query
        .or(`manager_approved_by.eq."${userName}",admin_approved_by.eq."${userName}",status.in.("SUBMITTED","Done","done","COMPLETED","completed","APPROVED","REJECTED")`)
        .order('submission_date', { ascending: false });
    } else {
      query = query
        .in('status', ['APPROVED', 'REJECTED', 'MANAGER_APPROVED', 'SUBMITTED', 'Done', 'done', 'COMPLETED', 'completed'])
        .order('submission_date', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching work task history:", error);
    throw error;
  }
};

/**
 * Approves a work task.
 */
export const approveWorkTaskApi = async (taskId) => {
  try {
    const role = (localStorage.getItem("role") || "").toLowerCase();
    const userName = localStorage.getItem("user-name");
    const now = new Date().toISOString();

    let updateFields = {};
    if (role === 'manager') {
      updateFields = {
        status: 'MANAGER_APPROVED',
        manager_approved_by: userName,
        manager_approval_date: now
      };
    } else {
      updateFields = {
        status: 'APPROVED',
        admin_done: true,
        admin_approved_by: userName,
        admin_approval_date: now
      };
    }

    const { data, error } = await supabase
      .from('work_task')
      .update(updateFields)
      .eq('id', taskId)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error approving work task:", error);
    throw error;
  }
};

/**
 * Rejects a work task.
 */
export const rejectWorkTaskApi = async (taskId, reason) => {
  try {
    const role = (localStorage.getItem("role") || "").toLowerCase();
    const userName = localStorage.getItem("user-name");
    const now = new Date().toISOString();

    let updateFields = {};
    if (role === 'manager') {
      updateFields = {
        status: 'REJECTED',
        rejection_reason: reason,
        submission_date: null,
        manager_approved_by: userName,
        manager_approval_date: now
      };
    } else {
      updateFields = {
        status: 'REJECTED',
        rejection_reason: reason,
        submission_date: null,
        admin_done: false,
        admin_approved_by: userName,
        admin_approval_date: now
      };
    }

    const { data, error } = await supabase
      .from('work_task')
      .update(updateFields)
      .eq('id', taskId)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error rejecting work task:", error);
    throw error;
  }
};

/**
 * Automatically checks for expired assignments and promotes next scheduled assignments to active.
 */
export const checkAndPromoteAssignmentsApi = async () => {
  try {
    const now = new Date();
    // 1. Fetch all assignments that have a scheduled next assignment
    const { data: assignments, error } = await supabase
      .from('task_assignments')
      .select('*')
      .not('next_start_datetime', 'is', null);

    if (error) throw error;
    if (!assignments || assignments.length === 0) return { promotedCount: 0 };

    const promoted = [];
    for (const asgn of assignments) {
      // Check if current assignment is expired (end_datetime passed) OR is null
      const isExpired = !asgn.end_datetime || new Date(asgn.end_datetime) < now;

      if (isExpired && asgn.next_start_datetime && asgn.next_end_datetime) {
        promoted.push(asgn);
      }
    }

    if (promoted.length === 0) return { promotedCount: 0 };

    // Promote in database
    for (const asgn of promoted) {
      // 1. Update task_assignments row to promote next_* fields to active fields, status to 'LOCKED', and clear next_*
      const { error: updateErr } = await supabase
        .from('task_assignments')
        .update({
          start_datetime: asgn.next_start_datetime,
          end_datetime: asgn.next_end_datetime,
          manager_name: asgn.next_manager_name,
          employee_name: asgn.next_employee_name,
          status: 'LOCKED', // Promote to LOCKED so it can be generated
          next_start_datetime: null,
          next_end_datetime: null,
          next_manager_name: null,
          next_employee_name: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', asgn.id);

      if (updateErr) throw updateErr;

      // 2. Fetch the updated assignment details (with shop name, etc. if needed for generation)
      const { data: masterTask, error: masterErr } = await supabase
        .from('master_work_tasks')
        .select('*, shop(shop_name)')
        .eq('id', asgn.task_id)
        .single();

      if (masterErr) throw masterErr;

      // Prepare the assignment object for generateWorkTasksApi
      const promotedAssignment = {
        id: asgn.id,
        assignmentId: asgn.id,
        task_id: asgn.task_id,
        task_name: masterTask.task_name,
        shopName: masterTask.shop?.shop_name || "N/A",
        department: masterTask.department || "N/A",
        estimated_minutes: masterTask.estimated_minutes || 0,
        start_datetime: asgn.next_start_datetime,
        end_datetime: asgn.next_end_datetime,
        employee_name: asgn.next_employee_name,
        manager_name: asgn.next_manager_name,
        status: 'LOCKED'
      };

      // 3. Generate the work tasks checklist for this promoted assignment
      await generateWorkTasksApi([promotedAssignment]);

      // 4. Send WhatsApp notification grouped by employee name
      const nowTime = new Date();
      const startTime = new Date(promotedAssignment.start_datetime);
      if (startTime <= nowTime) {
        const employeeNames = promotedAssignment.employee_name
          ? promotedAssignment.employee_name.split(',').map(e => e.trim()).filter(Boolean)
          : [];

        const empTasks = [];
        employeeNames.forEach(empName => {
          empTasks.push({
            taskType: 'work',
            doerName: empName,
            taskId: promotedAssignment.task_id,
            description: promotedAssignment.task_name,
            start_datetime: promotedAssignment.start_datetime,
            end_datetime: promotedAssignment.end_datetime,
            givenBy: promotedAssignment.manager_name || 'Admin',
            shop_name: promotedAssignment.shopName,
            department: promotedAssignment.department,
            duration: promotedAssignment.estimated_minutes
          });
        });

        empTasks.forEach(task => {
          sendTaskAssignmentNotification(task).catch(err => {
            console.error(`❌ Error sending auto-scheduled WhatsApp alert for ${task.doerName}:`, err);
          });
        });
      }
    }

    return { promotedCount: promoted.length };
  } catch (error) {
    console.error("❌ Error checking and promoting assignments:", error);
    throw error;
  }
};

/**
 * Fetches paginated work records with search and filter applied directly in the database.
 */
export const fetchPaginatedWorkRecordsApi = async ({ page, limit, searchTerm, selectedShop, role, managerShops }) => {
  try {
    const from = page * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('master_work_tasks')
      .select('*, shop!inner(id, shop_name), task_assignments(*)', { count: 'exact' })
      .eq('is_active', true);

    if (role === 'manager' && managerShops && managerShops.length > 0) {
      query = query.in('shop.shop_name', managerShops);
    }

    if (selectedShop && selectedShop !== 'All') {
      query = query.eq('shop.shop_name', selectedShop);
    }

    if (searchTerm) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`task_name.ilike.${term},task_assignments.manager_name.ilike.${term},task_assignments.employee_name.ilike.${term}`);
    }

    const { data, count, error } = await query
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const formattedData = (data || []).map(task => {
      const assignment = task.task_assignments?.[0] || null;
      return {
        ...task,
        ...(assignment || {}),
        taskId: task.id,
        shopName: task.shop?.shop_name || "N/A",
        assignmentId: assignment?.id || null
      };
    });

    return { data: formattedData, totalCount: count || 0 };
  } catch (error) {
    console.error("❌ Error fetching paginated work records:", error);
    throw error;
  }
};

/**
 * Fetches paginated scheduled work tasks with search and filter applied directly in the database.
 */
export const fetchPaginatedScheduledWorkTasksApi = async ({ page, limit, searchTerm, selectedShop, role, managerShops }) => {
  try {
    const from = page * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('master_work_tasks')
      .select('*, shop!inner(id, shop_name), task_assignments(*)', { count: 'exact' })
      .eq('is_active', true);

    if (role === 'manager' && managerShops && managerShops.length > 0) {
      query = query.in('shop.shop_name', managerShops);
    }

    if (selectedShop && selectedShop !== 'All') {
      query = query.eq('shop.shop_name', selectedShop);
    }

    if (searchTerm) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`task_name.ilike.${term},task_assignments.next_manager_name.ilike.${term},task_assignments.next_employee_name.ilike.${term}`);
    }

    const { data, count, error } = await query
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const formattedData = (data || []).map(task => {
      const assignment = task.task_assignments?.[0] || null;
      return {
        ...task,
        ...(assignment || {}),
        taskId: task.id,
        shopName: task.shop?.shop_name || "N/A",
        assignmentId: assignment?.id || null
      };
    });

    return { data: formattedData, totalCount: count || 0 };
  } catch (error) {
    console.error("❌ Error fetching paginated scheduled work tasks:", error);
    throw error;
  }
};
