import supabase from "../../SupabaseClient";

const CATEGORY_TO_COLUMN = {
  "Machine Name": "machine_name",
  "Machine Area": "machine_area",
  "Part Name": "part_name",
  "Priority": "priority",
  "Task Priority": "task_priority",
  "Project Type": "project_type",
  "Task Status": "task_status",
  "Sound Test": "sound_test",
  "Temperature": "temperature"
};

export const fetchUserDetailsApi = async () => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select('*, user_access, leave_date, leave_end_date, remark, employee_id') // Add employee_id
      .not("user_name", "is", null)
      .neq("user_name", "");

    if (error) {
      console.log("Error when fetching data", error);
      return [];
    }

    console.log("Fetched successfully", data);
    return data;
  } catch (error) {
    console.log("Error from Supabase", error);
    return [];
  }
};


// export const fetchUserDetailsApi = async () => {
//   try {
//     const { data, error } = await supabase
//       .from("users")
//       .select('*, user_access, leave_date, leave_end_date, remark') // Add leave_end_date
//       .not("user_name", "is", null)
//       .neq("user_name", "");

//     if (error) {
//       console.log("Error when fetching data", error);
//       return [];
//     }

//     console.log("Fetched successfully", data);
//     return data;
//   } catch (error) {
//     console.log("Error from Supabase", error);
//     return [];
//   }
// };

export const fetchDepartmentDataApi = async () => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.log("error when fetching departments", error);
      return [];
    }

    // Format to match old expectations if necessary, 
    // though name is better than department field name now
    const formatted = data.map(d => ({
      id: d.id,
      department: d.name,
      given_by: d.given_by || ""
    }));

    console.log("fetch successfully", formatted);
    return formatted;
  } catch (error) {
    console.log("error from supabase", error);
    return [];
  }
};



export const createUserApi = async (newUser) => {
  try {
    // Step 1: Get the current max ID
    const { data: maxIdData, error: maxIdError } = await supabase
      .from("users")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (maxIdError) {
      console.error("Error fetching last ID:", maxIdError);
      return;
    }

    const lastId = maxIdData?.[0]?.id || 0;
    const newId = lastId + 1;

    // Step 2: Insert user with new ID
    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          id: newId,
          user_name: newUser.username,
          password: newUser.password,
          email_id: newUser.email,
          number: newUser.phone,
          employee_id: newUser.employee_id, // Add this line
          role: newUser.role,
          status: newUser.status,
          user_access: newUser.user_access
        }
      ])
      .select()
      .single();

    if (error) {
      console.log("Error when posting data:", error);
    } else {
      console.log("Posted successfully", data);
    }

    return data;
  } catch (error) {
    console.log("Error from Supabase:", error);
  }
};

export const updateUserDataApi = async ({ id, updatedUser }) => {
  try {
    const updateData = {
      user_name: updatedUser.user_name,
      password: updatedUser.password,
      email_id: updatedUser.email_id,
      number: updatedUser.number,
      employee_id: updatedUser.employee_id, // Add this line
      role: updatedUser.role,
      status: updatedUser.status,
      user_access: updatedUser.user_access
    };

    // Add leave data if provided
    if (updatedUser.leave_date !== undefined) {
      updateData.leave_date = updatedUser.leave_date;
    }
    if (updatedUser.leave_end_date !== undefined) {
      updateData.leave_end_date = updatedUser.leave_end_date;
    }
    if (updatedUser.remark !== undefined) {
      updateData.remark = updatedUser.remark;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    console.log(data, "data")
    console.log(error, "error")
    if (error) {
      console.log("Error when update data", error);
      throw error;
    }

    console.log("update successfully", data);
    return data;
  } catch (error) {
    console.log("Error from Supabase", error);
    throw error;
  }
};


export const createDepartmentApi = async (newDept) => {
  try {
    const { data, error } = await supabase
      .from("departments")
      .insert([{
        name: newDept.department,
        given_by: newDept.given_by
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.log("Error creating department:", error);
    throw error;
  }
};

export const updateDepartmentDataApi = async ({ id, updatedDept }) => {
  try {
    const { data, error } = await supabase
      .from("departments")
      .update({
        name: updatedDept.department,
        given_by: updatedDept.given_by
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.log("Error updating department:", error);
    throw error;
  }
};


export const deleteDepartmentApi = async (id) => {
  try {
    const { error } = await supabase
      .from("departments")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return id;
  } catch (error) {
    console.log("Error deleting department:", error);
    throw error;
  }
};

export const deleteAssignFromApi = async (id) => {
  try {
    const { error } = await supabase
      .from("assign_from")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return id;
  } catch (error) {
    console.log("Error deleting assign_from:", error);
    throw error;
  }
};

export const updateCustomDropdownApi = async ({ id, category, value }) => {
  try {
    const column = CATEGORY_TO_COLUMN[category];
    if (!column) throw new Error(`Invalid category: ${category}`);

    const { data, error } = await supabase
      .from("dropdown_options")
      .update({ [column]: value })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      category: category,
      value: data[column]
    };
  } catch (error) {
    console.log("Error updating custom dropdown:", error);
    throw error;
  }
};

export const deleteUserByIdApi = async (id) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.log("Error deleting user:", error);
      throw error;
    }

    console.log("User deleted successfully:", data);
    return data;
  } catch (error) {
    console.log("Error from Supabase:", error);
    throw error;
  }
};



// In your settingApi.js file, add these functions:

// Fetch only unique departments
export const fetchDepartmentsOnlyApi = async () => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data.map(d => ({ department: d.name }));
  } catch (error) {
    console.log("error fetching departments", error);
    return [];
  }
};

// Fetch only given_by data
export const fetchGivenByDataApi = async () => {
  try {
    const { data, error } = await supabase
      .from('assign_from')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data.map(d => ({ id: d.id, given_by: d.name }));
  } catch (error) {
    console.log("error fetching assign_from data", error);
    return [];
  }
};

export const createAssignFromApi = async (name) => {
  try {
    const { data, error } = await supabase
      .from("assign_from")
      .insert([{ name }])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.log("error creating assign_from", error);
    throw error;
  }
};

export const updateAssignFromApi = async ({ id, given_by }) => {
  try {
    const { data, error } = await supabase
      .from("assign_from")
      .update({ name: given_by })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.log("error updating assign_from", error);
    throw error;
  }
};

export const fetchCustomDropdownsApi = async () => {
  try {
    const { data, error } = await supabase
      .from('dropdown_options')
      .select('*');

    if (error) throw error;

    const formatted = [];
    data.forEach(item => {
      Object.keys(CATEGORY_TO_COLUMN).forEach(category => {
        const column = CATEGORY_TO_COLUMN[category];
        if (item[column] !== null && item[column] !== undefined && item[column] !== "") {
          formatted.push({
            id: item.id,
            category: category,
            value: item[column],
            // Include machine_name for Part Name entries to enable cascading
            ...(category === "Part Name" && item.machine_name && { parent: item.machine_name })
          });
        }
      });
    });

    return formatted;
  } catch (error) {
    console.error("❌ Error fetching custom dropdowns:", error);
    return [];
  }
};

export const createCustomDropdownApi = async (item) => {
  try {
    const column = CATEGORY_TO_COLUMN[item.category];
    if (!column) throw new Error(`Invalid category: ${item.category}`);

    const { data, error } = await supabase
      .from('dropdown_options')
      .insert([{
        [column]: item.value
      }])
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      category: item.category,
      value: data[column]
    };
  } catch (error) {
    console.log("error creating custom dropdown", error);
    throw error;
  }
};

// End of file

export const deleteCustomDropdownApi = async (id) => {
  try {
    const { error } = await supabase.from('dropdown_options').delete().eq('id', id);
    if (error) throw error;
    return id;
  } catch (error) {
    console.log("error deleting custom dropdown", error);
    throw error;
  }
};

export const createMachineEntriesApi = async (entries) => {
  try {
    const { data, error } = await supabase
      .from('dropdown_options')
      .insert(entries)
      .select();

    if (error) throw error;

    const formatted = [];
    data.forEach(item => {
      Object.keys(CATEGORY_TO_COLUMN).forEach(category => {
        const column = CATEGORY_TO_COLUMN[category];
        if (item[column] !== null && item[column] !== undefined && item[column] !== "") {
          formatted.push({
            id: item.id,
            category: category,
            value: item[column]
          });
        }
      });
    });

    return formatted;
  } catch (error) {
    console.error("Error creating machine entries:", error);
    throw error;
  }
};
