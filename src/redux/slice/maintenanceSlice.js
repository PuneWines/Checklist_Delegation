
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchMaintenanceDataSortByDate, fetchMaintenanceDataForHistory, updateMaintenanceData, deleteMaintenanceTasksApi } from "../api/maintenanceApi";

export const deleteMaintenanceTask = createAsyncThunk(
    "deleteMaintenanceTask",
    async (tasks, { rejectWithValue }) => {
        try {
            const response = await deleteMaintenanceTasksApi(tasks);
            return response;
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const maintenanceData = createAsyncThunk("maintenanceData", async (page = 1, { rejectWithValue }) => {
    try {
        const response = await fetchMaintenanceDataSortByDate(page);
        return response;
    } catch (error) {
        return rejectWithValue(error.message);
    }
});

export const maintenanceHistoryData = createAsyncThunk("maintenanceHistoryData", async (page = 1, { rejectWithValue }) => {
    try {
        const response = await fetchMaintenanceDataForHistory(page);
        return response;
    } catch (error) {
        return rejectWithValue(error.message);
    }
});

export const updateMaintenance = createAsyncThunk("updateMaintenance", async (submissionData, { rejectWithValue }) => {
    try {
        const response = await updateMaintenanceData(submissionData);
        return response;
    } catch (error) {
        return rejectWithValue(error.message);
    }
});

const maintenanceSlice = createSlice({
    name: "maintenance",
    initialState: {
        maintenance: [],
        history: [],
        loading: false,
        error: null,
        hasMore: true,
        currentPage: 1,
        totalCount: 0
    },
    reducers: {},
    extraReducers: (builder) => {
        // Pending Tasks
        builder.addCase(maintenanceData.pending, (state) => {
            state.loading = true;
        });
        builder.addCase(maintenanceData.fulfilled, (state, action) => {
            state.loading = false;
            // If page 1, replace data. If > 1, append.
            const { data, totalCount } = action.payload;

            // Logic to handle page 1 reset vs append could be in component or here. 
            // Standardizing: if page arg > 1 (implied by usage in component), append. 
            // But here we rely on the component managing state mostly? 
            // Actually `checkListSlice` logic usually replaces or appends based on a flag or just replaces?
            // Let's implement simple replacement for now, or check page arg?
            // The thunk payload is just the response. `meta.arg` has the page.

            if (action.meta.arg === 1) {
                state.maintenance = data;
            } else {
                state.maintenance = [...state.maintenance, ...data];
            }
            state.totalCount = totalCount;
            // state.hasMore = data.length === 50; // simple heuristic
            state.hasMore = state.maintenance.length < totalCount;
            state.currentPage = action.meta.arg;
        });
        builder.addCase(maintenanceData.rejected, (state, action) => {
            state.loading = false;
            state.error = action.payload;
        });

        // History
        builder.addCase(maintenanceHistoryData.fulfilled, (state, action) => {
            if (action.meta.arg === 1) {
                state.history = action.payload;
            } else {
                state.history = [...state.history, ...action.payload];
            }
        });

        // Update
        builder.addCase(updateMaintenance.fulfilled, (state, action) => {
            // We can filter out updated items from 'maintenance' state locally to update UI immediately
            // or rely on reload. 
            // Let's rely on reload or refetch as per existing patterns.
        });

        // Delete
        builder.addCase(deleteMaintenanceTask.pending, (state) => {
            state.loading = true;
        });
        builder.addCase(deleteMaintenanceTask.fulfilled, (state, action) => {
            state.loading = false;
            const deletedIds = action.payload;
            state.maintenance = state.maintenance.filter(task => !deletedIds.includes(task.id));
        });
        builder.addCase(deleteMaintenanceTask.rejected, (state, action) => {
            state.loading = false;
            state.error = action.payload;
        });
    }
});

export default maintenanceSlice.reducer;
