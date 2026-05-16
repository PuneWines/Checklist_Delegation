import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { 
  fetchMasterWorkTasksApi, 
  fetchTaskAssignmentsApi, 
  upsertTaskAssignmentsApi 
} from "../api/workRecordsApi";

// Thunks
export const fetchWorkRecords = createAsyncThunk(
  "workRecords/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      const [tasks, assignments] = await Promise.all([
        fetchMasterWorkTasksApi(),
        fetchTaskAssignmentsApi()
      ]);
      return { tasks, assignments };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAssignments = createAsyncThunk(
  "workRecords/saveAssignments",
  async (assignments, { rejectWithValue }) => {
    try {
      const data = await upsertTaskAssignmentsApi(assignments);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const workRecordsSlice = createSlice({
  name: "workRecords",
  initialState: {
    tasks: [],
    assignments: [],
    loading: false,
    saving: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch
      .addCase(fetchWorkRecords.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkRecords.fulfilled, (state, action) => {
        state.loading = false;
        state.tasks = action.payload.tasks;
        state.assignments = action.payload.assignments;
      })
      .addCase(fetchWorkRecords.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Save
      .addCase(saveAssignments.pending, (state) => {
        state.saving = true;
      })
      .addCase(saveAssignments.fulfilled, (state, action) => {
        state.saving = false;
        // Update local assignments with the saved data
        const savedData = action.payload;
        savedData.forEach(newAsgn => {
          const index = state.assignments.findIndex(a => a.task_id === newAsgn.task_id);
          if (index !== -1) {
            state.assignments[index] = newAsgn;
          } else {
            state.assignments.push(newAsgn);
          }
        });
      })
      .addCase(saveAssignments.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      });
  },
});

export const { clearError } = workRecordsSlice.actions;
export default workRecordsSlice.reducer;
