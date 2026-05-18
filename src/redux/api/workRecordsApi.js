import supabase from "../../SupabaseClient";

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
    
    // Failsafe: Fetch existing tasks for these assignments to avoid duplicates and overwriting employee work
    const assignmentIds = assignments.map(a => a.assignmentId);
    const { data: existingTasks } = await supabase
      .from('work_task')
      .select('assignment_id, current_date, name')
      .in('assignment_id', assignmentIds);

    const existingKeys = new Set(existingTasks?.map(t => `${t.assignment_id}_${t.current_date}_${t.name}`) || []);

    for (const asgn of assignments) {
      const start = new Date(asgn.start_datetime);
      const end = new Date(asgn.end_datetime);
      
      const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      const employeeNames = asgn.employee_name
        ? asgn.employee_name.split(',').map(e => e.trim()).filter(Boolean)
        : [];

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        for (const empName of employeeNames) {
          const key = `${asgn.assignmentId}_${dateStr}_${empName}`;

          // Only add if it doesn't already exist in the database
          if (!existingKeys.has(key)) {
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

    if (tasksToInsert.length === 0) return;

    // 1. Insert into work_task
    const { error: insertError } = await supabase
      .from('work_task')
      .insert(tasksToInsert);

    if (insertError) throw insertError;

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
      .select('*')
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
export const fetchPendingWorkApprovalsApi = async () => {
  try {
    const { data, error } = await supabase
      .from('work_task')
      .select('*')
      .or('status.eq.SUBMITTED,status.eq.Done,status.eq.done')
      .not('submission_date', 'is', null)
      .order('submission_date', { ascending: true });

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
export const fetchWorkTaskHistoryApi = async () => {
  try {
    const { data, error } = await supabase
      .from('work_task')
      .select('*')
      .in('status', ['APPROVED', 'REJECTED'])
      .order('admin_approval_date', { ascending: false });

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
    const { data, error } = await supabase
      .from('work_task')
      .update({
        status: 'APPROVED',
        admin_done: true,
        admin_approved_by: localStorage.getItem("user-name"),
        admin_approval_date: new Date().toISOString()
      })
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
    const { data, error } = await supabase
      .from('work_task')
      .update({
        status: 'REJECTED',
        rejection_reason: reason,
        admin_done: false,
        admin_approved_by: localStorage.getItem("user-name"),
        admin_approval_date: new Date().toISOString()
      })
      .eq('id', taskId)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error rejecting work task:", error);
    throw error;
  }
};
