import supabase from "../../SupabaseClient";

export const fetchUniqueDepartmentDataApi = async (user_name) => {
  try {
    // 1. Get the logged-in user's role + access
    const { data: userData } = await supabase
      .from("users")
      .select("role, user_access")
      .eq("user_name", user_name)
      .single();

    // 2. If admin or manager → show all departments from dedicated table
    if (userData?.role === "admin" || userData?.role === "manager") {
      const { data, error } = await supabase
        .from("departments")
        .select("name")
        .order("name", { ascending: true });

      if (error) throw error;
      return data.map(d => d.name);
    }

    // 3. If user → show only their own department (fallback if table data missing)
    if (userData?.role === "user") {
      return [userData.user_access];
    }

    return [];
  } catch (error) {
    console.error("Error from Supabase:", error);
    return [];
  }
};




export const fetchUniqueGivenByDataApi = async () => {
  try {
    const { data, error } = await supabase
      .from('assign_from')
      .select('name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data.map(d => d.name);
  } catch (error) {
    console.log("error from supabase", error);
    return [];
  }
};

export const fetchUniqueDoerNameDataApi = async (department) => {
  try {
    console.log("Department passed:", department);

    let query = supabase
      .from("users")
      .select("user_name, role, user_access")
      .eq("status", "active")
      .eq("role", "user")
      .order("user_name", { ascending: true });

    if (department) {
      query = query.or(`user_access.ilike.%${department}%,role.eq.admin`);
    } else {
      query = query.eq("role", "admin"); // Fallback if no department
    }

    const { data, error } = await query;

    const uniqueDoerName = [...new Set(data?.map((d) => d.user_name))];

    if (!error) {
      console.log("Fetched successfully", uniqueDoerName);
    } else {
      console.log("Error when fetching data", error);
    }
    return uniqueDoerName;
  } catch (error) {
    console.log("Error from Supabase", error);
  }
};



export const pushAssignTaskApi = async (generatedTasks) => {
  // Determine which table to use based on frequency
  const firstTaskFrequency = generatedTasks[0]?.frequency?.toLowerCase() || "";
  const isOneTime = firstTaskFrequency === "one-time" ||
    firstTaskFrequency.includes("one time") ||
    firstTaskFrequency.includes("no recurrence");

  const submitTable = isOneTime ? "delegation" : "checklist";
  console.log("Submitting to table:", submitTable, "Frequency:", generatedTasks[0]?.frequency);


  const tasksData = generatedTasks.map((task) => ({
    department: task.department,
    given_by: task.givenBy,
    name: task.doer,
    task_description: task.description,
    task_start_date: task.dueDate,
    frequency: task.frequency,
    enable_reminder: task.enableReminders ? "yes" : "no",
    require_attachment: task.requireAttachment ? "yes" : "no",
  }));


  try {
    const { data, error } = await supabase
      .from(submitTable)
      .insert(tasksData);

    if (error) {
      console.error("Error when posting data:", error);
      throw error;
    }

    console.log("Posted successfully to", submitTable, ":", data);
    return data;
  } catch (error) {
    console.error("Error from supabase:", error);
    throw error;
  }
}


