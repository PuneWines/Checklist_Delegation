import supabase from "../../SupabaseClient";

export const fetchUniqueShopDataApi = async () => {
  try {
    console.log("🔍 Fetching unique shops from shop table...");

    const { data, error } = await supabase
      .from("shop")
      .select("shop_name")
      .order("shop_name", { ascending: true });

    if (error) throw error;

    // Filter out nulls/empties and get unique values
    let uniqueShops = [...new Set(data
      .map(item => item.shop_name)
      .filter(shop => shop && shop.trim() !== "")
    )].sort();

    console.log("✅ Unique shops found:", uniqueShops);
    return uniqueShops;
  } catch (error) {
    console.error("❌ Error fetching shops from shop table:", error);
    return [];
  }
};




export const fetchUniqueGivenByDataApi = async () => {
  try {
    console.log("🔍 API: Fetching 'Assign From' list from database...");

    const { data, error } = await supabase
      .from('assign_from')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error("❌ API ERROR (assign_from):", error.message);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn("⚠️ API: 'assign_from' table is empty. Add names in Settings.");
      return [];
    }

    const extractedNames = data.map(item => {
      let val = item.name || item.given_by || item.value || (typeof item === 'string' ? item : null);
      if (typeof val === 'string' && val.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(val);
          return parsed.given_by || parsed.name || val;
        } catch (e) { }
      }
      return val;
    }).filter(val => val && val.toString().trim() !== "");

    const uniqueNames = [...new Set(extractedNames)].sort();
    console.log("✅ API: Loaded Assigners:", uniqueNames);
    return uniqueNames;
  } catch (error) {
    console.error("❌ API: Unexpected failure fetching assigners:", error);
    return [];
  }
};

export const fetchUniqueDoerNameDataApi = async (shop) => {
  try {
    console.log("🔍 Fetching doer data for shop:", shop);

    let query = supabase
      .from("users")
      .select("user_name, user_access, status, leave_date, leave_end_date, reported_by, can_self_assign")
      .order("user_name", { ascending: true });

    if (shop) {
      query = query.ilike("user_access", `%${shop}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error when fetching user data", error);
      return [];
    }

    const role = (localStorage.getItem('role') || "").toUpperCase();
    const username = (localStorage.getItem('user-name') || "").toLowerCase();

    const uniqueUsers = [];
    const seenNames = new Set();

    data?.forEach(user => {
      const uName = (user.user_name || "").toLowerCase();
      if (uName && !seenNames.has(uName)) {
        if (role === 'HOD' && username) {
          const reportedBy = (user.reported_by || "").toLowerCase();
          if (reportedBy !== username && uName !== username) return;
          if (uName === username && !user.can_self_assign) return;
        }

        uniqueUsers.push({
          user_name: user.user_name,
          status: user.status,
          leave_date: user.leave_date,
          leave_end_date: user.leave_end_date,
          reported_by: user.reported_by,
          can_self_assign: user.can_self_assign
        });
        seenNames.add(uName);
      }
    });

    return uniqueUsers;
  } catch (error) {
    console.error("❌ Error from Supabase:", error);
    return [];
  }
};



export const pushAssignTaskApi = async (generatedTasks, targetTable = null) => {
  // If targetTable is explicitly provided, use it for all tasks (legacy behavior or forced override)
  if (targetTable) {
    const tasksData = generatedTasks.map((task) => ({
      shop_name: (task.shop || task.shop_name),
      given_by: task.givenBy,
      name: task.doer,
      task_description: task.task_description || task.description || null, // Support both naming conventions
      // task_start_date and planned_date are the same — both use the specific occurrence date (dueDate)
      task_start_date: task.dueDate,
      planned_date: task.dueDate,
      frequency: task.frequency,
      duration: task.duration || null,
      enable_reminder: task.enableReminders ? "yes" : "no",
      require_attachment: task.requireAttachment ? "yes" : "no",
      audio_url: task.audio_url || null,
      instruction_attachment_url: task.instruction_attachment_url || null,
      instruction_attachment_type: task.instruction_attachment_type || null,
      task_level: task.task_level || null,
      status: targetTable === 'checklist' ? null : (task.status || 'pending')
    }));

    try {
      const { data, error } = await supabase.from(targetTable).insert(tasksData).select();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error when posting data to ${targetTable}:`, error);
      throw error;
    }
  }

  // Otherwise, separate tasks by frequency and route to respective tables
  const delegationTasks = [];
  const checklistTasks = [];

  generatedTasks.forEach(task => {
    const freq = task.frequency?.toLowerCase() || "";
    const isOneTime = freq === "one-time" ||
      freq.includes("one time") ||
      freq.includes("no recurrence");

    const taskData = {
      shop_name: (task.shop || task.shop_name),
      given_by: task.givenBy,
      name: task.doer,
      task_description: task.task_description || task.description || null, // Support both naming conventions
      // task_start_date and planned_date are the same — both use the specific occurrence date (dueDate)
      task_start_date: task.dueDate,
      planned_date: task.dueDate,
      frequency: task.frequency,
      duration: task.duration || null,
      enable_reminder: task.enableReminders ? "yes" : "no",
      require_attachment: task.requireAttachment ? "yes" : "no",
      audio_url: task.audio_url || null,
      instruction_attachment_url: task.instruction_attachment_url || null,
      instruction_attachment_type: task.instruction_attachment_type || null,
      task_level: task.task_level || null,
      series_id: task.series_id || null,
    };

    if (isOneTime) {
      delegationTasks.push({ ...taskData, status: task.status || 'pending' });
    } else {
      checklistTasks.push({ ...taskData, status: null });
    }
  });

  const results = [];

  try {
    if (delegationTasks.length > 0) {
      const { data, error } = await supabase.from('delegation').insert(delegationTasks).select();
      if (error) {
        console.error("Error inserting into delegation table:", error);
        throw error;
      }
      if (data) results.push(...data);
    }

    if (checklistTasks.length > 0) {
      const { data, error } = await supabase.from('checklist').insert(checklistTasks).select();
      if (error) {
        console.error("Error inserting into checklist table:", error);
        throw error;
      }
      if (data) results.push(...data);
    }

    return results;
  } catch (error) {
    console.error("Error during distributed task assignment:", error);
    throw error;
  }
};

export const fetchMasterTasksApi = async (shop, level) => {
  try {
    let query = supabase.from('master_tasks').select('*');
    if (shop) query = query.eq('shop_name', shop);
    if (level) query = query.eq('level_name', level);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching master tasks:", error);
    return [];
  }
};

export const fetchLevelsApi = async () => {
  try {
    const { data, error } = await supabase.from('levels').select('*').order('level_name', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching levels:", error);
    return [];
  }
};


