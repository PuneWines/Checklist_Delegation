import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    ClipboardList, Calendar, X, Mic, Square, Trash2, Plus, Save, Loader2, CheckCircle2, Clock
} from "lucide-react";
import { ReactMediaRecorder } from "react-media-recorder";
import AdminLayout from "../../components/layout/AdminLayout";
import { useDispatch, useSelector } from "react-redux";
import { assignTaskInTable, uniqueDepartmentData, uniqueDoerNameData, uniqueGivenByData } from "../../redux/slice/assignTaskSlice";
import { customDropdownDetails } from "../../redux/slice/settingSlice";
import supabase from "../../SupabaseClient";
import CalendarComponent from "../../components/CalendarComponent";
import { sendTaskAssignmentNotification } from "../../services/whatsappService";

const formatDate = (date) => date ? date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
const formatDateISO = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const FREQUENCY_OPTIONS = [
    "One Time (No Recurrence)", "Alternate Day", "Daily", "Weekly",
    "Fortnight", "Monthly", "Quarterly", "Half Yearly", "Yearly"
];



const defaultTask = () => ({
    id: Date.now() + Math.random(),
    department: "",
    givenBy: "",
    doer: "",
    description: "",
    frequency: "One Time (No Recurrence)",
    duration: "",
    enableReminders: true,
    requireAttachment: false,
    date: null,
    time: "09:00",
    recordedAudio: null,
    showCalendar: false,
});

// Single Task Card
function TaskCard({ task, index, total, department, doerName, givenBy, dispatch, onUpdate, onRemove }) {
    const handleChange = (e) => {
        onUpdate(task.id, { [e.target.name]: e.target.value });
    };

    // Filter doers based on task date and leave status
    const getFilteredDoers = () => {
        if (!doerName || !Array.isArray(doerName)) return [];
        if (!task.date) return doerName;

        const taskD = new Date(task.date);
        taskD.setHours(0, 0, 0, 0);

        return doerName.filter(user => {
            if (typeof user === 'string') return true; // Fallback for old data format

            if (user.status === 'inactive') return false;

            if (user.status === 'on leave' && user.leave_date && user.leave_end_date) {
                const leaveS = new Date(user.leave_date);
                const leaveE = new Date(user.leave_end_date);
                leaveS.setHours(0, 0, 0, 0);
                leaveE.setHours(0, 0, 0, 0);

                if (taskD >= leaveS && taskD <= leaveE) {
                    return false; // User is on leave during this task date
                }
            }
            return true;
        });
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible hover:shadow-md transition-all duration-300">
            {/* Card Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 rounded-t-2xl">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-black shadow-sm">
                        {index + 1}
                    </div>
                    <span className="text-sm font-bold text-purple-800">Task {index + 1}</span>
                    {task.doer && <span className="text-xs text-purple-500 font-medium">— {task.doer}</span>}
                </div>
                {total > 1 && (
                    <button type="button" onClick={() => onRemove(task.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="p-5 space-y-4">
                {/* Department & Assign From */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                            Department <span className="text-red-500">*</span>
                        </label>
                        <select
                            name="department"
                            value={task.department}
                            onChange={(e) => {
                                onUpdate(task.id, { department: e.target.value, doer: "" });
                                dispatch(uniqueDoerNameData(e.target.value));
                            }}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                        >
                            <option value="">Select Department</option>
                            <option value="Checklist">Checklist</option>
                            {department.map((d, i) => (
                                <option key={i} value={typeof d === 'string' ? d : d.department}>
                                    {typeof d === 'string' ? d : d.department}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                            Assign From <span className="text-red-500">*</span>
                        </label>
                        <select
                            name="givenBy"
                            value={task.givenBy}
                            onChange={handleChange}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                        >
                            <option value="">Select Assign From</option>
                            {givenBy.map((g, i) => <option key={i} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>

                {/* Doer */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Doer's Name <span className="text-red-500">*</span>
                    </label>
                    <select
                        name="doer"
                        value={task.doer}
                        onChange={handleChange}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                    >
                        <option value="">Select Doer</option>
                        {getFilteredDoers().map((d, i) => (
                            <option key={i} value={typeof d === 'string' ? d : d.user_name}>
                                {typeof d === 'string' ? d : d.user_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Description & Voice Note */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Task Description <span className="text-red-500">*</span>
                    </label>
                    <ReactMediaRecorder
                        audio
                        onStop={(blobUrl, blob) => onUpdate(task.id, { recordedAudio: { blobUrl, blob } })}
                        render={({ status, startRecording, stopRecording, clearBlobUrl }) => (
                            <div>
                                {status !== 'recording' && !task.recordedAudio && (
                                    <div className="relative">
                                        <textarea
                                            name="description"
                                            value={task.description}
                                            onChange={handleChange}
                                            rows="3"
                                            placeholder="Enter task description..."
                                            className="w-full p-3 pr-11 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none bg-gray-50 focus:bg-white transition-all text-sm"
                                        />
                                        <button type="button" onClick={startRecording} className="absolute bottom-2.5 right-2.5 p-1.5 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200 transition-all" title="Record Voice Note">
                                            <Mic className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                                {status === 'recording' && (
                                    <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg animate-pulse">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                            <span className="text-red-600 font-bold text-sm">Recording...</span>
                                        </div>
                                        <button type="button" onClick={stopRecording} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold">
                                            <Square className="w-3 h-3" /> Stop
                                        </button>
                                    </div>
                                )}
                                {task.recordedAudio && status !== 'recording' && (
                                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                                                <Mic className="w-3 h-3" /> Voice Note Attached
                                            </span>
                                            <button type="button" onClick={() => { clearBlobUrl(); onUpdate(task.id, { recordedAudio: null }); }} className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1">
                                                <Trash2 className="w-3 h-3" /> Remove
                                            </button>
                                        </div>
                                        <audio src={task.recordedAudio.blobUrl} controls className="w-full h-8" />
                                    </div>
                                )}
                            </div>
                        )}
                    />
                </div>

                {/* Date, Time, Frequency, Duration */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Start Date <span className="text-red-500">*</span></label>
                        <button
                            type="button"
                            onClick={() => onUpdate(task.id, { showCalendar: !task.showCalendar })}
                            className="w-full px-3 py-2.5 text-left border border-gray-200 rounded-lg bg-gray-50 hover:bg-white focus:ring-2 focus:ring-purple-500 transition-all flex items-center justify-between text-xs"
                        >
                            <span className={task.date ? "text-gray-800" : "text-gray-400"}>
                                {task.date ? formatDate(task.date) : "Select"}
                            </span>
                            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        </button>
                        {task.showCalendar && (
                            <div className="absolute top-full left-0 mt-1 z-50">
                                <CalendarComponent
                                    date={task.date}
                                    onChange={(d) => onUpdate(task.id, { date: d, showCalendar: false })}
                                    onClose={() => onUpdate(task.id, { showCalendar: false })}
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Time</label>
                        <input
                            type="time"
                            name="time"
                            value={task.time}
                            onChange={handleChange}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Frequency</label>
                        <select
                            name="frequency"
                            value={task.frequency}
                            onChange={handleChange}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-xs"
                        >
                            {FREQUENCY_OPTIONS.map(f => <option key={f}>{f}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Duration
                        </label>
                        <input
                            type="time"
                            name="duration"
                            value={task.duration}
                            onChange={handleChange}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                        />
                    </div>
                </div>

                {/* Toggles */}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => onUpdate(task.id, { enableReminders: !task.enableReminders })}
                        className={`flex-1 flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all ${task.enableReminders ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                    >
                        <span>Enable Reminders</span>
                        <div className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${task.enableReminders ? 'bg-purple-600' : 'bg-gray-300'}`}>
                            <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform ${task.enableReminders ? 'translate-x-4' : ''}`} />
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => onUpdate(task.id, { requireAttachment: !task.requireAttachment })}
                        className={`flex-1 flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all ${task.requireAttachment ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                    >
                        <span>Require Attachment</span>
                        <div className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${task.requireAttachment ? 'bg-purple-600' : 'bg-gray-300'}`}>
                            <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform ${task.requireAttachment ? 'translate-x-4' : ''}`} />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ChecklistTask() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { department, doerName, givenBy } = useSelector((state) => state.assignTask);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [holidays, setHolidays] = useState([]);

    // Per-task list
    const [tasks, setTasks] = useState([defaultTask()]);

    useEffect(() => {
        const fetchHolidays = async () => {
            const { data } = await supabase.from('holidays').select('holiday_date');
            if (data) setHolidays(data.map(h => h.holiday_date));
        };
        fetchHolidays();
        dispatch(uniqueDepartmentData());
        dispatch(uniqueGivenByData());
        dispatch(customDropdownDetails());
    }, [dispatch]);

    const updateTask = (id, updates) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    const addTask = () => setTasks(prev => [...prev, defaultTask()]);
    const removeTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));

    const freqMap = {
        "One Time (No Recurrence)": "one-time",
        "Alternate Day": "alternate-day",
        "Daily": "daily",
        "Weekly": "weekly",
        "Fortnight": "fortnight",
        "Monthly": "monthly",
        "Quarterly": "quarterly",
        "Half Yearly": "half-yearly",
        "Yearly": "yearly"
    };

    const generateDatesForTask = async (task) => {
        const freqKey = freqMap[task.frequency] || "one-time";
        const dates = [];
        const startDate = task.date;
        const time = task.time;

        if (freqKey === "one-time") {
            const d = new Date(startDate);
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${time}:00`);
            return dates;
        }

        const endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);

        const { data: workingData } = await supabase
            .from('working_day_calender')
            .select('working_date')
            .gte('working_date', startDate.toISOString().split('T')[0])
            .lte('working_date', endDate.toISOString().split('T')[0]);

        const workingDaySet = new Set(workingData?.map(d => d.working_date) || []);
        const isHoliday = (d) => holidays.includes(d.toISOString().split('T')[0]);
        const isWorkingDay = (d) => workingDaySet.has(d.toISOString().split('T')[0]);
        const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${time}:00`;
        const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

        if (freqKey === 'daily' || freqKey === 'alternate-day') {
            const validDays = [];
            let d = new Date(startDate);
            while (d <= endDate) {
                if (!isHoliday(d) && isWorkingDay(d)) validDays.push(new Date(d));
                d.setDate(d.getDate() + 1);
            }
            if (freqKey === 'daily') validDays.forEach(day => dates.push(toISO(day)));
            else validDays.forEach((day, i) => { if (i % 2 === 0) dates.push(toISO(day)); });
        } else {
            let current = new Date(startDate);
            let attempts = 0;
            while (current <= endDate && attempts < 1000) {
                attempts++;
                if (!isHoliday(current) && isWorkingDay(current)) dates.push(toISO(current));
                if (freqKey === 'weekly') current = addDays(current, 7);
                else if (freqKey === 'fortnight') current = addDays(current, 14);
                else if (freqKey === 'monthly') current.setMonth(current.getMonth() + 1);
                else if (freqKey === 'quarterly') current.setMonth(current.getMonth() + 3);
                else if (freqKey === 'half-yearly') current.setMonth(current.getMonth() + 6);
                else if (freqKey === 'yearly') current.setFullYear(current.getFullYear() + 1);
                else break;
            }
        }
        return dates;
    };

    const handleSubmitAll = async () => {
        for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            if (!t.department || !t.givenBy) {
                alert(`Task ${i + 1}: Please select Department and Assign From.`);
                return;
            }
            if (!t.doer || !t.date || (!t.description && !t.recordedAudio)) {
                alert(`Task ${i + 1}: Please fill in Doer, Date, and Description or Voice Note.`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const allTasksToSubmit = [];

            for (const task of tasks) {
                let finalDescription = task.description;
                if (task.recordedAudio && task.recordedAudio.blob) {
                    const fileName = `voice-notes/${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
                    const { error: uploadError } = await supabase.storage
                        .from('audio-recordings')
                        .upload(fileName, task.recordedAudio.blob, { contentType: task.recordedAudio.blob.type || 'audio/webm', upsert: false });
                    if (uploadError) throw new Error(`Audio Upload Error: ${uploadError.message}`);
                    const { data: publicUrlData } = supabase.storage.from('audio-recordings').getPublicUrl(fileName);
                    finalDescription = publicUrlData.publicUrl;
                }

                const dates = await generateDatesForTask(task);
                const freqKey = freqMap[task.frequency] || "one-time";

                for (const dueDate of dates) {
                    allTasksToSubmit.push({
                        department: task.department,
                        givenBy: task.givenBy,
                        doer: task.doer,
                        description: finalDescription,
                        frequency: freqKey,
                        duration: task.duration || null,
                        enableReminders: task.enableReminders,
                        requireAttachment: task.requireAttachment,
                        dueDate,
                        status: "pending"
                    });
                }
            }

            const result = await dispatch(assignTaskInTable({ tasks: allTasksToSubmit, table: null }));
            if (result.error) throw new Error(result.error.message || "Failed to assign tasks");

            // Send WhatsApp notifications (one per unique doer)
            try {
                const insertedTasks = result.payload;
                if (insertedTasks && insertedTasks.length > 0) {
                    const notified = new Set();
                    for (const t of insertedTasks) {
                        if (!notified.has(t.name)) {
                            notified.add(t.name);
                            await sendTaskAssignmentNotification({
                                doerName: t.name,
                                taskId: t.task_id || t.id,
                                description: t.task_description,
                                startDate: new Date(t.task_start_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
                                givenBy: t.given_by,
                                department: t.department,
                                taskType: 'checklist'
                            });
                        }
                    }
                }
            } catch (whatsappError) {
                console.error('WhatsApp notification error:', whatsappError);
            }

            setSuccessMessage(`Successfully assigned ${allTasksToSubmit.length} task(s)!`);
            setTasks([defaultTask()]);
            setTimeout(() => navigate('/dashboard/admin'), 1500);
        } catch (e) {
            console.error("Submission error", e);
            alert(`Failed to assign tasks: ${e.message || "Unknown error"}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AdminLayout>
            <div className="max-w-3xl mx-auto p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-600 rounded-xl text-white shadow-md">
                            <ClipboardList size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-gray-900">Checklist Task Assignment</h1>
                            <p className="text-sm text-gray-500 mt-0.5">Assign one or multiple checklist tasks at once</p>
                        </div>
                    </div>
                    <button onClick={() => navigate('/dashboard/assign-task')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Success Message */}
                {successMessage && (
                    <div className="mb-5 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={18} />
                            <span className="font-bold text-sm">{successMessage}</span>
                        </div>
                        <button onClick={() => setSuccessMessage("")} className="text-green-600 hover:text-green-800 font-bold text-lg">×</button>
                    </div>
                )}

                {/* Task Cards */}
                <div className="space-y-4">
                    {tasks.map((task, index) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            index={index}
                            total={tasks.length}
                            department={department}
                            doerName={doerName}
                            givenBy={givenBy}
                            dispatch={dispatch}
                            onUpdate={updateTask}
                            onRemove={removeTask}
                        />
                    ))}
                </div>

                {/* Add Another Task */}
                <button
                    type="button"
                    onClick={addTask}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-purple-300 text-purple-600 font-bold rounded-2xl hover:border-purple-500 hover:bg-purple-50 transition-all duration-200 group"
                >
                    <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    Add Another Task
                </button>

                {/* Summary & Submit */}
                <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-sm font-bold text-gray-700">{tasks.length} task{tasks.length !== 1 ? 's' : ''} ready to assign</p>
                            <p className="text-xs text-gray-400 mt-0.5">Recurring tasks will generate multiple entries</p>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-black text-purple-600">{tasks.length}</span>
                            <p className="text-xs text-gray-400">Entries</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/dashboard/assign-task')}
                            className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                        >
                            <X className="w-4 h-4" /> Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmitAll}
                            disabled={isSubmitting}
                            className="flex-grow py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <><Loader2 size={18} className="animate-spin" /> Submitting...</>
                            ) : (
                                <><Save size={18} /> Submit All {tasks.length} Task{tasks.length !== 1 ? 's' : ''}</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
