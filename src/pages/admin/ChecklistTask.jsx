import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    ClipboardList, Calendar, X, Search, Mic, Square, Trash2
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

export default function ChecklistTask() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { department, doerName, givenBy } = useSelector((state) => state.assignTask);
    const { customDropdowns = [] } = useSelector((state) => state.setting || {});
    const username = localStorage.getItem('user-name');

    const [date, setSelectedDate] = useState(null);
    const [time, setTime] = useState("09:00");
    const [showCalendar, setShowCalendar] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generatedTasks, setGeneratedTasks] = useState([]);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        department: "",
        givenBy: "",
        doer: "",
        description: "",
        frequency: "One Time (No Recurrence)",
        enableReminders: true,
        requireAttachment: false,
    });
    const [recordedAudio, setRecordedAudio] = useState(null);
    const [holidays, setHolidays] = useState([]);

    // Fetch holidays on mount
    useEffect(() => {
        const fetchHolidays = async () => {
            const { data } = await supabase.from('holidays').select('holiday_date');
            if (data) setHolidays(data.map(h => h.holiday_date));
        };
        fetchHolidays();
    }, []);

    // Fetch Logic
    useEffect(() => {
        dispatch(uniqueDepartmentData());
        dispatch(uniqueGivenByData());
        dispatch(customDropdownDetails());
        if (formData.department) dispatch(uniqueDoerNameData(formData.department));
    }, [dispatch, formData.department]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleToggle = (name) => setFormData(prev => ({ ...prev, [name]: !prev[name] }));

    // Add weeks/days helper
    const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };

    const generateTasksPreview = async () => {
        if (!date || !time || !formData.doer || (!formData.description && !recordedAudio) || !formData.department) {
            alert("Please fill in all required fields (Department, Given By, Doer, Date, Time, Description/Voice Note).");
            return;
        }

        const tasks = [];
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
        const freqKey = freqMap[formData.frequency] || "one-time";

        if (freqKey === "one-time") {
            const d = new Date(date);
            tasks.push({
                ...formData,
                taskType: "checklist",
                dueDate: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${time}:00`,
                displayDate: formatDate(d) + ` at ${time}`,
                frequency: freqKey
            });
        } else {
            let current = new Date(date);
            const endDate = new Date(date);
            endDate.setFullYear(endDate.getFullYear() + 1);

            // Fetch working days
            let workingDaySet = new Set();
            try {
                const { data: workingData, error: wdError } = await supabase
                    .from('working_day_calender')
                    .select('working_date')
                    .gte('working_date', date.toISOString().split('T')[0])
                    .lte('working_date', endDate.toISOString().split('T')[0]);

                if (wdError) throw wdError;
                if (workingData) {
                    workingData.forEach(d => workingDaySet.add(d.working_date));
                }
            } catch (err) {
                console.error("Error fetching working days:", err);
                alert("Failed to fetch working day calendar. Tasks may be generated incorrectly.");
                return;
            }

            const isHoliday = (d) => {
                const dateStr = d.toISOString().split('T')[0];
                return holidays.includes(dateStr);
            };

            const isWorkingDay = (d) => {
                const dStr = d.toISOString().split('T')[0];
                return workingDaySet.has(dStr);
            };

            const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };

            const addTask = (date) => {
                const dateStr = formatDate(date) + ` at ${time}`;
                tasks.push({
                    ...formData,
                    taskType: "checklist",
                    dueDate: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}T${time}:00`,
                    displayDate: dateStr,
                    frequency: freqKey
                });
            };

            if (freqKey === 'daily' || freqKey === 'alternate-day') {
                // Collect all valid working days first
                const validDays = [];
                let d = new Date(date);
                while (d <= endDate) {
                    if (!isHoliday(d) && isWorkingDay(d)) {
                        validDays.push(new Date(d));
                    }
                    d.setDate(d.getDate() + 1);
                }

                if (freqKey === 'daily') {
                    validDays.forEach(day => addTask(day));
                } else if (freqKey === 'alternate-day') {
                    // Every 2nd working day
                    validDays.forEach((day, index) => {
                        if (index % 2 === 0) addTask(day);
                    });
                }
            } else {
                // Calendar based intervals for others
                let current = new Date(date);
                let attempts = 0;
                while (current <= endDate && attempts < 1000) {
                    attempts++;
                    if (!isHoliday(current) && isWorkingDay(current)) {
                        addTask(current);
                    }

                    if (freqKey === 'weekly') current = addDays(current, 7);
                    else if (freqKey === 'fortnight') current = addDays(current, 14);
                    else if (freqKey === 'monthly') current.setMonth(current.getMonth() + 1);
                    else if (freqKey === 'quarterly') current.setMonth(current.getMonth() + 3);
                    else if (freqKey === 'half-yearly') current.setMonth(current.getMonth() + 6);
                    else if (freqKey === 'yearly') current.setFullYear(current.getFullYear() + 1);
                    else break;
                }
            }
        }
        setGeneratedTasks(tasks);
        setIsPreviewOpen(true);
    };

    const handleAssignTask = async () => {
        setIsSubmitting(true);
        try {
            let audioUrl = "";
            let descriptionWrapper = (desc) => desc;

            // Upload audio if exists
            if (recordedAudio && recordedAudio.blob) {
                try {
                    const fileName = `voice-notes/${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('audio-recordings')
                        .upload(fileName, recordedAudio.blob, {
                            contentType: recordedAudio.blob.type || 'audio/webm',
                            upsert: false
                        });

                    if (uploadError) throw new Error(`Audio Upload Error: ${uploadError.message}`);

                    const { data: publicUrlData } = supabase.storage
                        .from('audio-recordings')
                        .getPublicUrl(fileName);

                    audioUrl = publicUrlData.publicUrl;
                    // Append URL to description instead of replacing it, preserving text context
                    descriptionWrapper = (desc) => desc ? `${desc}\n\nVoice Note Link: ${audioUrl}` : `Voice Note Link: ${audioUrl}`;
                } catch (audioErr) {
                    console.error(audioErr);
                    alert(`Failed to upload audio: ${audioErr.message}`);
                    setIsSubmitting(false);
                    return;
                }
            }

            // Flatten data for API with potential audio URL
            const tasksToSubmit = generatedTasks.map(t => ({
                department: t.department,
                givenBy: t.givenBy,
                doer: t.doer,
                description: descriptionWrapper(t.description),
                frequency: t.frequency,
                enableReminders: t.enableReminders,
                requireAttachment: t.requireAttachment,
                dueDate: t.dueDate,
                status: "pending"
            }));

            const result = await dispatch(assignTaskInTable({
                tasks: tasksToSubmit,
                table: null // Let API decide: 'checklist' for recurring, 'delegation' for one-time
            }));

            // Check if the submission was successful
            if (result.error) {
                throw new Error(result.error.message || "Failed to assign tasks");
            }

            // Send WhatsApp notifications to assigned users (Send ONE notification per batch)
            try {
                if (tasksToSubmit.length > 0) {
                    const firstTask = tasksToSubmit[0];
                    await sendTaskAssignmentNotification({
                        doerName: firstTask.doer,
                        taskType: 'Checklist',
                        description: firstTask.description,
                        dueDate: firstTask.dueDate,
                        frequency: firstTask.frequency,
                        department: firstTask.department,
                        givenBy: firstTask.givenBy
                    });
                    console.log('✅ WhatsApp notification sent successfully');
                }
            } catch (whatsappError) {
                console.error('WhatsApp notification error:', whatsappError);
                // Don't fail the task assignment if WhatsApp fails
            }

            alert(`Successfully assigned ${tasksToSubmit.length} task(s)!`);
            navigate('/dashboard/admin');
        } catch (e) {
            console.error("Submission error", e);
            alert(`Failed to assign tasks: ${e.message || "Unknown error"}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AdminLayout>
            <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">

                {/* Header */}
                <div className="mb-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Task Details</h1>
                        <p className="text-gray-500 mt-1">Fill in the details to assign a new task to a staff member.</p>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard/assign-task')}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Main Form Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 sm:p-8 space-y-6">

                        {/* Checklist Only Header inside Form */}
                        <div className="pb-4 border-b border-gray-100">
                            <h2 className="text-lg font-bold text-purple-700 flex items-center gap-2">
                                <ClipboardList className="w-5 h-5" /> Checklist
                            </h2>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-6">
                            {/* Department */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Department Name <span className="text-red-500">*</span></label>
                                <select
                                    name="department"
                                    value={formData.department}
                                    onChange={handleChange}
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

                            {/* Given By & Doer */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Assign From</label>
                                    <select
                                        name="givenBy"
                                        value={formData.givenBy}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                                    >
                                        <option value="">Select Assign From</option>
                                        {givenBy.map((g, i) => <option key={i} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Doer's Name</label>
                                    <select
                                        name="doer"
                                        value={formData.doer}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                                    >
                                        <option value="">Select Doer</option>
                                        {doerName.map((d, i) => <option key={i} value={d}>{d}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Description & Audio Recording */}
                            <div>
                                <ReactMediaRecorder
                                    audio
                                    onStop={(blobUrl, blob) => {
                                        setRecordedAudio({ blobUrl, blob });
                                    }}
                                    render={({ status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl }) => (
                                        <div className="space-y-2">
                                            <label className="block text-sm font-bold text-gray-700">Task Description <span className="text-red-500">*</span></label>

                                            {/* Default View: Input with Mic */}
                                            {status !== 'recording' && !recordedAudio && (
                                                <div className="relative">
                                                    <textarea
                                                        name="description"
                                                        rows="4"
                                                        placeholder="Enter task description..."
                                                        value={formData.description}
                                                        onChange={handleChange}
                                                        className="w-full px-3 py-2.5 pr-12 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm resize-none"
                                                    ></textarea>
                                                    <button
                                                        type="button"
                                                        onClick={startRecording}
                                                        className="absolute bottom-3 right-3 p-2 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200 transition-all shadow-sm group"
                                                        title="Record Voice Note"
                                                    >
                                                        <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Recording View */}
                                            {status === 'recording' && (
                                                <div className="flex flex-col items-center justify-center p-8 bg-red-50 border border-red-100 rounded-xl space-y-4 animate-pulse">
                                                    <div className="p-4 bg-red-100 rounded-full shadow-inner">
                                                        <Mic className="w-8 h-8 text-red-600" />
                                                    </div>
                                                    <p className="text-red-600 font-bold text-lg">Recording Voice Note...</p>
                                                    <button
                                                        type="button"
                                                        onClick={stopRecording}
                                                        className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors font-bold shadow-lg"
                                                    >
                                                        <Square className="w-4 h-4" /> Stop Recording
                                                    </button>
                                                </div>
                                            )}

                                            {/* Recorded View (Player) */}
                                            {recordedAudio && status !== 'recording' && (
                                                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Voice Note Attached</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                clearBlobUrl();
                                                                setRecordedAudio(null);
                                                            }}
                                                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-bold"
                                                        >
                                                            <Trash2 className="w-3 h-3" /> Remove
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-purple-100 shadow-sm">
                                                        <audio src={recordedAudio.blobUrl} controls className="w-full h-8" />
                                                    </div>
                                                    <p className="text-xs text-center text-gray-500 mt-2">
                                                        Note: Task description hidden while voice note is attached.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                />
                            </div>

                            {/* Date, Time, Frequency */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <div className="relative">
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Task Start Date</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowCalendar(!showCalendar)}
                                        className="w-full px-3 py-2.5 text-left bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center justify-between text-sm text-gray-700"
                                    >
                                        {date ? formatDate(date) : "Select a date"}
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                    </button>
                                    {showCalendar && (
                                        <div className="absolute top-full left-0 mt-2 z-50">
                                            <CalendarComponent date={date} onChange={setSelectedDate} onClose={() => setShowCalendar(false)} />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Time</label>
                                    <div className="relative">
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                        />
                                        {/* <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" /> */}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Frequency</label>
                                    <select
                                        name="frequency"
                                        value={formData.frequency}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                                    >
                                        <option>One Time (No Recurrence)</option>
                                        <option>Alternate Day</option>
                                        <option>Daily</option>
                                        <option>Weekly</option>
                                        <option>Fortnight</option>
                                        <option>Monthly</option>
                                        <option>Quarterly</option>
                                        <option>Half Yearly</option>
                                        <option>Yearly</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Additional Options */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="text-sm font-bold text-gray-900 mb-4">Additional Options</h3>
                            <div className="space-y-4">
                                <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 cursor-pointer" onClick={() => handleToggle('enableReminders')}>
                                    <div>
                                        <span className="block text-sm font-bold text-gray-700">Enable Reminders</span>
                                        <span className="block text-xs text-gray-500 mt-0.5">Send reminders before task due date</span>
                                    </div>
                                    <div className={`w-11 h-6 flex-shrink-0 flex items-center rounded-full p-1 transition-colors ${formData.enableReminders ? 'bg-purple-600' : 'bg-gray-300'}`}>
                                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${formData.enableReminders ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                </div>

                                <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 cursor-pointer" onClick={() => handleToggle('requireAttachment')}>
                                    <div>
                                        <span className="block text-sm font-bold text-gray-700">Require Attachment</span>
                                        <span className="block text-xs text-gray-500 mt-0.5">User must upload a file when completing task</span>
                                    </div>
                                    <div className={`w-11 h-6 flex-shrink-0 flex items-center rounded-full p-1 transition-colors ${formData.requireAttachment ? 'bg-purple-600' : 'bg-gray-300'}`}>
                                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${formData.requireAttachment ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-6 space-y-3">
                            <button
                                onClick={generateTasksPreview}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200"
                            >
                                <Search className="w-4 h-4" /> Preview Generated Tasks
                            </button>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => navigate('/dashboard/assign-task')}
                                    className="w-full py-3 bg-white text-gray-700 font-bold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAssignTask}
                                    disabled={isSubmitting || generatedTasks.length === 0}
                                    className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg shadow-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {isSubmitting ? "Assigning..." : "Assign Task"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Preview Modal (Simple Inline for now or styled) */}
                {isPreviewOpen && (
                    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                                <h3 className="font-bold text-gray-800">Preview Tasks ({generatedTasks.length})</h3>
                                <button onClick={() => setIsPreviewOpen(false)}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                            </div>
                            <div className="p-4 overflow-y-auto space-y-3 flex-1">
                                {generatedTasks.map((t, idx) => (
                                    <div key={idx} className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm flex justify-between items-center text-sm">
                                        <div>
                                            <div className="font-bold text-gray-800">{t.description.substring(0, 30)}...</div>
                                            <div className="text-xs text-gray-500">{t.displayDate} - {t.doer}</div>
                                        </div>
                                        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-bold">{t.frequency}</span>
                                    </div>
                                ))}
                                {generatedTasks.length > 5 && <p className="text-center text-xs text-gray-400 mt-2">...and {generatedTasks.length - 5} more</p>}
                            </div>
                            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl bg-gray-50">
                                <button onClick={() => setIsPreviewOpen(false)} className="px-4 py-2 text-gray-600 font-medium hover:text-gray-800">Close</button>
                                <button onClick={() => { setIsPreviewOpen(false); }} className="px-4 py-2 bg-purple-600 text-white font-bold rounded-md hover:bg-purple-700">Confirm</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </AdminLayout>
    );
}
