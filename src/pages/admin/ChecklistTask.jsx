import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    ClipboardList, Calendar, X, Search
} from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { useDispatch, useSelector } from "react-redux";
import { assignTaskInTable, uniqueDepartmentData, uniqueDoerNameData, uniqueGivenByData } from "../../redux/slice/assignTaskSlice";

const CalendarComponent = ({ date, onChange, onClose }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const handleDateClick = (day) => {
        const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        onChange(selectedDate);
        onClose();
    };

    const renderDays = () => {
        const days = [];
        const daysInMonth = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
        const firstDayOfMonth = getFirstDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth());

        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected = date && date.getDate() === day && date.getMonth() === currentMonth.getMonth() && date.getFullYear() === currentMonth.getFullYear();
            days.push(
                <button
                    key={day}
                    type="button"
                    onClick={() => handleDateClick(day)}
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors ${isSelected ? "bg-purple-600 text-white" : "hover:bg-purple-100 text-gray-700"}`}
                >
                    {day}
                </button>
            );
        }
        return days;
    };

    return (
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-xl w-72">
            <div className="flex justify-between items-center mb-4">
                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-1 hover:bg-gray-100 rounded-full text-gray-600">&lt;</button>
                <div className="text-sm font-bold text-gray-800">{currentMonth.toLocaleString("default", { month: "long" })} {currentMonth.getFullYear()}</div>
                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-1 hover:bg-gray-100 rounded-full text-gray-600">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (<div key={day} className="h-8 w-8 flex items-center justify-center text-xs font-semibold text-gray-400">{day}</div>))}
            </div>
            <div className="grid grid-cols-7 gap-1">{renderDays()}</div>
        </div>
    );
};

const formatDate = (date) => date ? date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";

export default function ChecklistTask() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { department, doerName, givenBy } = useSelector((state) => state.assignTask);
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
        enableReminders: false,
        requireAttachment: false,
    });
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
        dispatch(uniqueDepartmentData(username));
        dispatch(uniqueGivenByData());
        if (formData.department) dispatch(uniqueDoerNameData(formData.department));
    }, [dispatch, username, formData.department]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleToggle = (name) => setFormData(prev => ({ ...prev, [name]: !prev[name] }));

    // Add weeks/days helper
    const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };

    const generateTasksPreview = () => {
        if (!date || !time || !formData.doer || !formData.description || !formData.department) {
            alert("Please fill in all required fields (Department, Given By, Doer, Date, Time, Description).");
            return;
        }

        const tasks = [];
        const freqMap = {
            "One Time (No Recurrence)": "one-time",
            "Daily": "daily",
            "Weekly": "weekly",
            "Monthly": "monthly"
        };
        const freqKey = freqMap[formData.frequency];

        if (freqKey === "one-time") {
            tasks.push({
                ...formData,
                taskType: "checklist",
                dueDate: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}T${time}:00`,
                displayDate: formatDate(date) + ` at ${time}`
            });
        } else {
            let current = new Date(date);
            const isHoliday = (d) => {
                const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
                return holidays.includes(dateStr);
            };

            // Generate 30 occurrences for preview
            let generatedCount = 0;
            let attempts = 0;
            while (generatedCount < 30 && attempts < 100) {
                attempts++;
                if (!isHoliday(current)) {
                    const dateStr = formatDate(current) + ` at ${time}`;
                    tasks.push({
                        ...formData,
                        taskType: "checklist",
                        dueDate: `${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, '0')}-${current.getDate().toString().padStart(2, '0')}T${time}:00`,
                        displayDate: dateStr
                    });
                    generatedCount++;
                }

                if (freqKey === 'daily') current = addDays(current, 1);
                else if (freqKey === 'weekly') current = addDays(current, 7);
                else if (freqKey === 'monthly') current.setMonth(current.getMonth() + 1);
                else break; // Should not happen with current freqKey logic but safe
            }
        }
        setGeneratedTasks(tasks);
        setIsPreviewOpen(true);
    };

    const handleAssignTask = async () => {
        setIsSubmitting(true);
        try {
            // Flatten data for API
            const tasksToSubmit = generatedTasks.map(t => ({
                department: t.department,
                givenBy: t.givenBy,
                doer: t.doer,
                description: t.description,
                frequency: t.frequency,
                enableReminders: t.enableReminders,
                requireAttachment: t.requireAttachment,
                dueDate: t.dueDate,
                status: "pending"
            }));

            const result = await dispatch(assignTaskInTable(tasksToSubmit));

            // Check if the submission was successful
            if (result.error) {
                throw new Error(result.error.message || "Failed to assign tasks");
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
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Given By</label>
                                    <select
                                        name="givenBy"
                                        value={formData.givenBy}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm"
                                    >
                                        <option value="">Select Given By</option>
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

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Task Description</label>
                                <textarea
                                    name="description"
                                    rows="4"
                                    placeholder="Enter task description..."
                                    value={formData.description}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-sm resize-none"
                                ></textarea>
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
                                        <option>Daily</option>
                                        <option>Weekly</option>
                                        <option>Monthly</option>
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
