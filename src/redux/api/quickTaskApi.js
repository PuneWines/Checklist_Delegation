import supabase from "../../SupabaseClient";

// Update fetchChecklistData to support pagination and filtering
// More efficient approach using window functions (if supported by Supabase)
export const fetchChecklistData = async (page = 0, pageSize = 50, nameFilter = '') => {
  try {
    const start = page * pageSize;
    const end = start + pageSize - 1;

    // Step 1: Get unique task_descriptions with conditions applied at database level
    let uniqueQuery = supabase
      .from('checklist')
      .select('task_description')
      .is('submission_date', null)
      .not('task_description', 'is', null);

    if (nameFilter) {
      uniqueQuery = uniqueQuery.eq('name', nameFilter);
    }

    const { data: allUniqueDescriptions, error: uniqueError } = await uniqueQuery;

    if (uniqueError) {
      console.log("Error when fetching unique descriptions", uniqueError);
      return { data: [], total: 0 };
    }

    // Get truly unique descriptions (client-side dedupe for descriptions only)
    const seenDescriptions = new Set();
    const uniqueDescriptions = (allUniqueDescriptions || [])
      .map(row => row.task_description)
      .filter(desc => {
        if (!desc || seenDescriptions.has(desc)) return false;
        seenDescriptions.add(desc);
        return true;
      });

    console.log("Total unique descriptions found:", uniqueDescriptions.length);

    if (uniqueDescriptions.length === 0) {
      return { data: [], total: 0 };
    }

    // Step 2: Get paginated slice of unique descriptions for current page
    const paginatedDescriptions = uniqueDescriptions.slice(start, end + 1);

    if (paginatedDescriptions.length === 0) {
      return { data: [], total: uniqueDescriptions.length };
    }

    // Step 3: Fetch actual data only for the paginated unique descriptions
    let dataQuery = supabase
      .from('checklist')
      .select('*')
      .in('task_description', paginatedDescriptions)
      .is('submission_date', null)
      .order('task_start_date', { ascending: true });

    if (nameFilter) {
      dataQuery = dataQuery.eq('name', nameFilter);
    }

    const { data, error } = await dataQuery;

    if (error) {
      console.log("Error when fetching data", error);
      return { data: [], total: 0 };
    }

    // Final client-side deduplication (should be minimal now)
    const finalSeen = new Set();
    const finalData = (data || []).map(row => ({...row, id: row.task_id})).filter(row => {
      if (finalSeen.has(row.task_description)) {
        console.log("Final duplicate found:", row.task_description);
        return false;
      }
      finalSeen.add(row.task_description);
      return true;
    });

    console.log("Page", page, "-> Fetched:", finalData.length, "Unique total:", uniqueDescriptions.length);
    
    return { 
      data: finalData, 
      total: uniqueDescriptions.length
    };
   
  } catch (error) {
    console.log("Error from Supabase", error);
    return { data: [], total: 0 };
  }
};

// Update fetchDelegationData similarly
export const fetchDelegationData = async (page = 0, pageSize = 50, nameFilter = '') => {
  try {
    const start = page * pageSize;
    const end = start + pageSize - 1;

    // Step 1: Get unique task_descriptions with conditions applied at database level
    let uniqueQuery = supabase
      .from('delegation')
      .select('task_description')
      .is('submission_date', null)
      .not('task_description', 'is', null);

    if (nameFilter) {
      uniqueQuery = uniqueQuery.eq('name', nameFilter);
    }

    const { data: allUniqueDescriptions, error: uniqueError } = await uniqueQuery;

    if (uniqueError) {
      console.log("Error when fetching unique descriptions", uniqueError);
      return { data: [], total: 0 };
    }

    // Get truly unique descriptions
    const seenDescriptions = new Set();
    const uniqueDescriptions = (allUniqueDescriptions || [])
      .map(row => row.task_description)
      .filter(desc => {
        if (!desc || seenDescriptions.has(desc)) return false;
        seenDescriptions.add(desc);
        return true;
      });

    console.log("Total unique delegation descriptions found:", uniqueDescriptions.length);

    if (uniqueDescriptions.length === 0) {
      return { data: [], total: 0 };
    }

    // Step 2: Get paginated slice of unique descriptions for current page
    const paginatedDescriptions = uniqueDescriptions.slice(start, end + 1);

    if (paginatedDescriptions.length === 0) {
      return { data: [], total: uniqueDescriptions.length };
    }

    // Step 3: Fetch actual data only for the paginated unique descriptions
    let dataQuery = supabase
      .from('delegation')
      .select('*')
      .in('task_description', paginatedDescriptions)
      .is('submission_date', null)
      .order('task_id', { ascending: true });

    if (nameFilter) {
      dataQuery = dataQuery.eq('name', nameFilter);
    }

    const { data, error } = await dataQuery;

    if (error) {
      console.log("Error when fetching delegation data", error);
      return { data: [], total: 0 };
    }

    // Final client-side deduplication
    const finalSeen = new Set();
    const finalData = (data || []).map(row => ({...row, id: row.task_id})).filter(row => {
      if (finalSeen.has(row.task_description)) {
        console.log("Final delegation duplicate found:", row.task_description);
        return false;
      }
      finalSeen.add(row.task_description);
      return true;
    });

    console.log("Delegation Page", page, "-> Fetched:", finalData.length, "Unique total:", uniqueDescriptions.length);
    
    return { 
      data: finalData, 
      total: uniqueDescriptions.length
    };
   
  } catch (error) {
    console.log("Error from Supabase delegation", error);
    return { data: [], total: 0 };
  }
};

export const deleteChecklistTasksApi = async (tasks) => {
  for (const task of tasks) {
    const { error } = await supabase
      .from("checklist")
      .delete()
      .eq("name", task.name)
      .eq("task_description", task.task_description)
      .is("submission_date", null); // only delete if submission_date is null
 
    if (error) throw error;
  }
  return tasks;
};

export const deleteDelegationTasksApi = async (tasks) => {
  const taskIds = tasks.map(t => t.id || t.taskId || t.task_id);
  const { error } = await supabase
    .from("delegation")
    .delete()
    .in("task_id", taskIds)
    .is("submission_date", null); // ✅ only delete if submission_date IS NULL
 
  if (error) throw error;
  return taskIds;
};

export const updateChecklistTaskApi = async (updatedTask, originalTask) => {
  try {
    let query = supabase.from("checklist").update({
      department: updatedTask.department,
      given_by: updatedTask.given_by,
      name: updatedTask.name,
      task_description: updatedTask.task_description,
      task_start_date: updatedTask.task_start_date,
      frequency: updatedTask.frequency,
      enable_reminder: updatedTask.enable_reminder,
      require_attachment: updatedTask.require_attachment,
      remark: updatedTask.remark
    });

    if (originalTask) {
      // Update all matching pending tasks
      query = query
        .eq("department", originalTask.department)
        .eq("name", originalTask.name)
        .eq("task_description", originalTask.task_description)
        .is("submission_date", null);
    } else {
      // Fallback to single record update
      query = query.eq("task_id", updatedTask.id || updatedTask.task_id);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("API Error updating checklist task:", error);
    throw error;
  }
};

export const updateDelegationTaskApi = async (updatedTask, originalTask) => {
  try {
    let query = supabase.from("delegation").update({
      department: updatedTask.department,
      given_by: updatedTask.given_by,
      name: updatedTask.name,
      task_description: updatedTask.task_description,
      task_start_date: updatedTask.task_start_date,
      frequency: updatedTask.frequency,
      enable_reminder: updatedTask.enable_reminder,
      require_attachment: updatedTask.require_attachment,
      remarks: updatedTask.remarks
    });

    if (originalTask) {
      // Update all matching pending tasks
      query = query
        .eq("department", originalTask.department)
        .eq("name", originalTask.name)
        .eq("task_description", originalTask.task_description)
        .is("submission_date", null);
    } else {
      // Fallback to single record update
      query = query.eq("task_id", updatedTask.id || updatedTask.task_id);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("API Error updating delegation task:", error);
    throw error;
  }
};

// Add this new function
export const fetchUsersData = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_name')
      .not('user_name', 'is', null); // Only get rows where user_name is not null
      
    if (error) {
      console.log("Error when fetching users", error);
      return [];
    }
 
    console.log("Fetched users successfully", data);
    return data;
   
  } catch (error) {
    console.log("Error from Supabase", error);
    return [];
  }
};


















// import supabase from "../../SupabaseClient";

// export const fetchChecklistData = async () => {
//   try {
//     const { data, error } = await supabase
//       .from('checklist')
//       .select('*') 
//       .order("task_start_date", { ascending: true });
      
//     if (error) {
//       console.log("Error when fetching data", error);
//       return [];
//     }
 
//     const seen = new Set();
//     const uniqueRows = data.filter(row => {
//       if (seen.has(row.task_description)) return false;
//       seen.add(row.task_description);
//       return true;
//     });
 
//     console.log("Fetched successfully", uniqueRows);
//     return uniqueRows;
   
//   } catch (error) {
//     console.log("Error from Supabase", error);
//     return [];
//   }
// };

// export const fetchDelegationData = async () => {
//   try {
//     const { data, error } = await supabase
//       .from('delegation')
//       .select('*')
//       .order('task_id', { ascending: true });
            
//     if (error) {
//       console.log("Error when fetching data", error);
//       return [];
//     }
 
//     const seen = new Set();
//     const uniqueRows = data.filter(row => {
//       if (seen.has(row.task_description)) return false;
//       seen.add(row.task_description);
//       return true;
//     });
 
//     console.log("Fetched successfully", uniqueRows);
//     return uniqueRows;
   
//   } catch (error) {
//     console.log("Error from Supabase", error);
//     return [];
//   }
// };

// export const deleteChecklistTasksApi = async (tasks) => {
//   for (const task of tasks) {
//     const { error } = await supabase
//       .from("checklist")
//       .delete()
//       .eq("name", task.name)
//       .eq("task_description", task.task_description)
//       .is("submission_date", null); // only delete if submission_date is null
 
//     if (error) throw error;
//   }
//   return tasks;
// };

// export const deleteDelegationTasksApi = async (taskIds) => {
//   const { error } = await supabase
//     .from("delegation")
//     .delete()
//     .in("task_id", taskIds)
//     .is("submission_date", null); // ✅ only delete if submission_date IS NULL
 
//   if (error) throw error;
//   return taskIds;
// };

// // New function to update checklist task - matches department, name, task_description
// export const updateChecklistTaskApi = async (updatedTask, originalTask) => {
//   try {
//     console.log("Updating with:", { updatedTask, originalTask }); // Debug log
    
//     const { data, error } = await supabase
//       .from("checklist")
//       .update({
//         department: updatedTask.department,
//         given_by: updatedTask.given_by,
//         name: updatedTask.name,
//         task_description: updatedTask.task_description,
//         // task_start_date: updatedTask.task_start_date,
//         // frequency: updatedTask.frequency,
//         enable_reminder: updatedTask.enable_reminder,
//         require_attachment: updatedTask.require_attachment,
//         remark: updatedTask.remark
//       })
//       .eq("department", originalTask.department)
//       .eq("name", originalTask.name)
//       .eq("task_description", originalTask.task_description)
//       .is("submission_date", null)
//       .select();

//     if (error) {
//       console.error("Supabase error:", error);
//       throw error;
//     }

//     console.log("Update successful:", data);
//     return data;

//   } catch (error) {
//     console.error("API Error:", error);
//     throw error;
//   }
// };
