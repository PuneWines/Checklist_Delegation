import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, FileCheck, Calendar, Clock, Wrench, X, Mic, Square, Trash2 } from "lucide-react";
import { ReactMediaRecorder } from "react-media-recorder";
import AdminLayout from "../../components/layout/AdminLayout";
import { useDispatch, useSelector } from "react-redux";
import { uniqueDepartmentData, uniqueDoerNameData, uniqueGivenByData } from "../../redux/slice/assignTaskSlice";
import { customDropdownDetails } from "../../redux/slice/settingSlice";
import { postMaintenanceTaskApi } from "../../redux/api/maintenanceApi";
import { maintenanceData } from "../../redux/slice/maintenanceSlice";
import supabase from "../../SupabaseClient";
import CalendarComponent from "../../components/CalendarComponent";
import { sendTaskAssignmentNotification } from "../../services/whatsappService";

const formatDateLong = (date) => date ? date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
const formatDateISO = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function MaintenanceTask() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { department, doerName, givenBy } = useSelector((state) => state.assignTask);
    const maintenance = useSelector((state) => state.maintenance.maintenance);
    const { customDropdowns = [] } = useSelector((state) => state.setting || {});
    const username = localStorage.getItem('user-name');

    const [formData, setFormData] = useState({
        department: "Maintenance",
        machineName: "",
        givenBy: "",
        machineArea: "",
        doerDepartment: "",
        partName: [], // Changed to array for multi-select
        doerName: "",
        needSoundTest: "",
        temperature: "",
        priority: "",
        workDescription: "",
        startDate: "",
        startTime: "09:00",
        frequency: "daily",
        enableReminder: true,
        requireAttachment: false
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [holidays, setHolidays] = useState([]);
    const [generatedTasks, setGeneratedTasks] = useState([]);
    const [showPreview, setShowPreview] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [recordedAudio, setRecordedAudio] = useState(null);
    const [showPartDropdown, setShowPartDropdown] = useState(false);

    useEffect(() => {
        const fetchHolidays = async () => {
            const { data } = await supabase.from('holidays').select('holiday_date');
            if (data) setHolidays(data.map(h => h.holiday_date));
        };
        fetchHolidays();
    }, []);


    useEffect(() => {
        dispatch(uniqueDepartmentData());
        dispatch(uniqueGivenByData());
        dispatch(uniqueDoerNameData("Maintenance"));
        dispatch(maintenanceData(1));
        dispatch(customDropdownDetails());
    }, [dispatch]);

    // Debug: Log customDropdowns whenever it changes
    useEffect(() => {
        console.log('🔄 CustomDropdowns in component:', customDropdowns);
        console.log('📊 Total dropdown items:', customDropdowns?.length || 0);
    }, [customDropdowns]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showPartDropdown && !event.target.closest('.part-dropdown-container')) {
                setShowPartDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPartDropdown]);


    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
            // Reset partName when machineName changes
            ...(name === 'machineName' && { partName: [] })
        }));
    };

    const handlePartToggle = (partValue) => {
        setFormData(prev => ({
            ...prev,
            partName: prev.partName.includes(partValue)
                ? prev.partName.filter(p => p !== partValue)
                : [...prev.partName, partValue]
        }));
    };

    // Get unique dropdown values
    const getUniqueDropdownValues = (category) => {
        const items = customDropdowns.filter(item => item.category === category);
        const uniqueValues = [...new Set(items.map(item => item.value))];
        return uniqueValues.map(value => {
            const item = items.find(i => i.value === value);
            return { ...item, value };
        });
    };

    const generatePreview = async (e) => {
        e.preventDefault();

        // Validate required fields
        if (!formData.startDate) {
            alert("Please select a start date");
            return;
        }

        if (!formData.doerName) {
            alert("Please select a doer name");
            return;
        }

        if (!formData.givenBy) {
            alert("Please select who is giving the task");
            return;
        }

        setIsSubmitting(true);

        try {
            const tasks = [];
            // Helper to get local YYYY-MM-DD
            const getLocalDateString = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const startDate = new Date(formData.startDate + 'T00:00:00'); // Force local midnight
            const freq = formData.frequency.toLowerCase();

            // Fetch working days if recurring
            let workingDaySet = new Set();
            if (freq !== 'one-time') {
                const yearEndDate = new Date(startDate);
                yearEndDate.setFullYear(yearEndDate.getFullYear() + 1);

                const { data: workingData, error: wdError } = await supabase
                    .from('working_day_calender')
                    .select('working_date')
                    .gte('working_date', getLocalDateString(startDate))
                    .lte('working_date', getLocalDateString(yearEndDate));

                if (wdError) throw wdError;

                if (workingData) {
                    workingData.forEach(d => workingDaySet.add(d.working_date));
                }
            }

            if (freq === 'one-time') {
                // tasks.push({ ... }) removed task_id
                tasks.push({
                    department: formData.department,
                    name: formData.doerName,
                    given_by: formData.givenBy,
                    task_start_date: `${formData.startDate}T${formData.startTime}:00`,
                    task_description: formData.workDescription,
                    machine_name: formData.machineName,
                    part_name: formData.partName.join(', '), // Join array to string
                    part_area: formData.machineArea,
                    freq: formData.frequency,
                    status: "Pending",
                    submission_date: null,
                });
            } else {
                const endDate = new Date(startDate);
                endDate.setFullYear(endDate.getFullYear() + 1);

                const isHoliday = (d) => {
                    const dStr = getLocalDateString(d);
                    return holidays.includes(dStr);
                };

                const isWorkingDay = (d) => {
                    const dStr = getLocalDateString(d);
                    return workingDaySet.has(dStr);
                };

                const addTask = (date) => {
                    tasks.push({
                        department: formData.department,
                        name: formData.doerName,
                        given_by: formData.givenBy,
                        task_start_date: `${getLocalDateString(date)}T${formData.startTime}:00`,
                        task_description: formData.workDescription,
                        machine_name: formData.machineName,
                        part_name: formData.partName.join(', '), // Join array to string
                        part_area: formData.machineArea,
                        freq: formData.frequency,
                        status: "Pending",
                        submission_date: null,
                    });
                };

                if (freq === 'daily' || freq === 'alternate-day') {
                    // Logic based on Valid Working Day Sequence
                    // 1. Gather all valid working days in the range
                    const validDays = [];
                    let d = new Date(startDate);
                    while (d <= endDate) {
                        if (!isHoliday(d) && isWorkingDay(d)) {
                            validDays.push(new Date(d));
                        }
                        d.setDate(d.getDate() + 1);
                    }

                    // 2. Select days based on frequency
                    if (freq === 'daily') {
                        validDays.forEach(date => addTask(date));
                    } else if (freq === 'alternate-day') {
                        // "Alternate Day" means every 2nd working day, starting from the first
                        validDays.forEach((date, index) => {
                            if (index % 2 === 0) addTask(date);
                        });
                    }
                } else {
                    // Calendar-based logic for Weekly, Monthly, Quarterly, Half-Yearly
                    // These strictly follow calendar intervals. If a date lands on a holiday/non-working day, it is skipped (as per previous behavior).
                    let current = new Date(startDate);
                    let attempts = 0;

                    const addDays = (date, days) => {
                        const d = new Date(date);
                        d.setDate(d.getDate() + days);
                        return d;
                    };

                    while (current <= endDate && attempts < 1000) {
                        attempts++;

                        // Check validity
                        if (!isHoliday(current) && isWorkingDay(current)) {
                            addTask(current);
                        }

                        // Advance
                        if (freq === 'weekly') current = addDays(current, 7);
                        else if (freq === 'fortnight') current = addDays(current, 14);
                        else if (freq === 'monthly') current.setMonth(current.getMonth() + 1);
                        else if (freq === 'quarterly') current.setMonth(current.getMonth() + 3);
                        else if (freq === 'half-yearly') current.setMonth(current.getMonth() + 6);
                        else if (freq === 'yearly') current.setFullYear(current.getFullYear() + 1);
                        else break;
                    }
                }
            }

            if (tasks.length === 0) {
                alert("No valid tasks generated.");
                return;
            }

            setGeneratedTasks(tasks);
            setShowPreview(true);

        } catch (error) {
            console.error(error);
            alert("Error generating preview");
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmSubmission = async () => {
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
                    descriptionWrapper = (desc) => audioUrl; // Store ONLY the URL if voice note exists
                } catch (audioErr) {
                    console.error(audioErr);
                    alert(`Failed to upload audio: ${audioErr.message}`);
                    setIsSubmitting(false);
                    return; // Stop if audio fails
                }
            }

            const tasksToSubmit = generatedTasks.map(t => ({
                ...t,
                task_description: descriptionWrapper(t.task_description)
            }));

            if (tasksToSubmit.length > 0) {
                const { error } = await supabase.from('maintenance_tasks').insert(tasksToSubmit);
                if (error) throw new Error(`Database Insert Error: ${error.message}`);

                // Send WhatsApp notifications to assigned users (Send ONE notification per batch)
                try {
                    if (tasksToSubmit.length > 0) {
                        const firstTask = tasksToSubmit[0];
                        await sendTaskAssignmentNotification({
                            doerName: firstTask.doer_name,
                            taskType: 'Maintenance',
                            description: firstTask.task_description,
                            dueDate: firstTask.task_start_date,
                            frequency: firstTask.frequency,
                            department: firstTask.department,
                            givenBy: firstTask.given_by,
                            machineName: firstTask.machine_name,
                            partName: firstTask.part_name,
                            priority: firstTask.priority
                        });
                        console.log('✅ WhatsApp notification sent successfully');
                    }
                } catch (whatsappError) {
                    console.error('WhatsApp notification error:', whatsappError);
                    // Don't fail the task assignment if WhatsApp fails
                }
            }

            setFormData({
                department: "Maintenance",
                machineName: "",
                machineArea: "",
                partName: [],
                workDescription: "",
                doerName: "",
                givenBy: "",
                startDate: "",
                startTime: "09:00",
                frequency: "one-time",
                needSoundTest: "",
                temperature: "",
                priority: "",
                enableReminder: false,
                requireAttachment: false,
                doerDepartment: ""
            });
            setRecordedAudio(null);

            alert("Tasks assigned successfully!");
            navigate('/dashboard/admin');

        } catch (error) {
            console.error(error);
            alert("Error assigning tasks: " + error.message);
        } finally {
            setIsSubmitting(false);
            setShowPreview(false);
        }
    };

    return (
        <AdminLayout>
            <div className="max-w-4xl mx-auto p-4">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <Wrench className="h-6 w-6 text-purple-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-800">Assign Maintenance Task</h1>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard/assign-task')}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                    <form onSubmit={generatePreview} className="p-8 space-y-6">


                        {/* Row 1: Machine Name | Machine Area */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Machine Name</label>
                                <select name="machineName" value={formData.machineName} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all">
                                    <option value="">Select Machine</option>
                                    {getUniqueDropdownValues("Machine Name")
                                        .map((item) => (
                                            <option key={item.id} value={item.value}>{item.value}</option>
                                        ))
                                    }
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Machine Area</label>
                                <select
                                    name="machineArea"
                                    value={formData.machineArea}
                                    onChange={handleChange}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all"
                                >
                                    <option value="">Select Area</option>
                                    {getUniqueDropdownValues("Machine Area")
                                        .map((item) => (
                                            <option key={item.id} value={item.value}>{item.value}</option>
                                        ))
                                    }
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Part Name */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Part Name (Multi-Select)</label>
                                <div className="relative part-dropdown-container">
                                    <button
                                        type="button"
                                        onClick={() => setShowPartDropdown(!showPartDropdown)}
                                        disabled={!formData.machineName}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 hover:bg-white transition-all text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="text-sm">
                                            {formData.partName.length === 0
                                                ? (formData.machineName ? 'Select Parts' : 'Select Machine First')
                                                : `${formData.partName.length} part(s) selected`
                                            }
                                        </span>
                                        <svg className={`w-4 h-4 transition-transform ${showPartDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {showPartDropdown && formData.machineName && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                            {getUniqueDropdownValues("Part Name")
                                                .filter(item => !item.parent || item.parent === formData.machineName)
                                                .map((item) => (
                                                    <label
                                                        key={item.id}
                                                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-purple-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.partName.includes(item.value)}
                                                            onChange={() => handlePartToggle(item.value)}
                                                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                                        />
                                                        <span className="text-sm text-gray-700">{item.value}</span>
                                                    </label>
                                                ))
                                            }
                                            {getUniqueDropdownValues("Part Name")
                                                .filter(item => !item.parent || item.parent === formData.machineName)
                                                .length === 0 && (
                                                    <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                                        No parts available for this machine
                                                    </div>
                                                )}
                                        </div>
                                    )}
                                </div>

                                {/* Selected parts display */}
                                {formData.partName.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {formData.partName.map((part, index) => (
                                            <span
                                                key={index}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium"
                                            >
                                                {part}
                                                <button
                                                    type="button"
                                                    onClick={() => handlePartToggle(part)}
                                                    className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Row 3: Assign From | Doer's Department */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Assign From</label>
                                <select name="givenBy" value={formData.givenBy} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all">
                                    <option value="">Select Assign From</option>
                                    {givenBy.map((g, i) => {
                                        const val = typeof g === 'object' ? (g.given_by || g.name) : g;
                                        return <option key={i} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Doer's Department</label>
                                <select
                                    name="doerDepartment"
                                    value={formData.doerDepartment}
                                    onChange={(e) => {
                                        handleChange(e);
                                        dispatch(uniqueDoerNameData(e.target.value));
                                    }}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all"
                                >
                                    <option value="">Select Doer's Department</option>
                                    {department.map((dept, i) => {
                                        const val = typeof dept === 'object' ? dept.department : dept;
                                        return <option key={i} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                        </div>

                        {/* Row 4: Doer's Name | Need Sound Test */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Doer's Name</label>
                                <select name="doerName" value={formData.doerName} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all">
                                    <option value="">Select Doer Name</option>
                                    {doerName.map((d, i) => {
                                        const val = typeof d === 'object' ? (d.user_name || d.name) : d;
                                        return <option key={i} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Need Sound Test</label>
                                <select name="needSoundTest" value={formData.needSoundTest} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all">
                                    <option value="">Select Need Sound Test</option>
                                    {customDropdowns
                                        .filter(item => item.category === "Sound Test")
                                        .map((item) => (
                                            <option key={item.id} value={item.value}>{item.value}</option>
                                        ))
                                    }
                                    {/* Fallback hardcoded if no dynamic data */}
                                    {(!customDropdowns.some(item => item.category === "Sound Test")) && (
                                        <>
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* Row 6: Temperature | Priority */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Temperature</label>
                                <select name="temperature" value={formData.temperature} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all">
                                    <option value="">Select Temperature</option>
                                    {customDropdowns
                                        .filter(item => item.category === "Temperature")
                                        .map((item) => (
                                            <option key={item.id} value={item.value}>{item.value}</option>
                                        ))
                                    }
                                    {/* Fallback strictly uses 'Low', 'Medium', 'High' */}
                                    {(!customDropdowns.some(item => item.category === "Temperature")) && (
                                        <>
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Priority</label>
                                <select name="priority" value={formData.priority} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all">
                                    <option value="">Select Priority</option>
                                    {customDropdowns
                                        .filter(item => item.category === "Task Priority")
                                        .map((item) => (
                                            <option key={item.id} value={item.value}>{item.value}</option>
                                        ))
                                    }
                                    {/* Fallback hardcoded if no dynamic data */}
                                    {(!customDropdowns.some(item => item.category === "Task Priority")) && (
                                        <>
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>

                        <ReactMediaRecorder
                            audio
                            onStop={(blobUrl, blob) => {
                                setRecordedAudio({ blobUrl, blob });
                            }}
                            render={({ status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl }) => (
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-700">Work Description</label>

                                    {/* 1. Default View: Textarea with Mic Button */}
                                    {status !== 'recording' && !recordedAudio && (
                                        <div className="relative">
                                            <textarea
                                                name="workDescription"
                                                value={formData.workDescription}
                                                onChange={handleChange}
                                                rows="4"
                                                placeholder="Enter work description..."
                                                className="w-full p-2.5 pb-10 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none resize-none bg-gray-50 focus:bg-white transition-all"
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

                                    {/* 2. Recording View */}
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

                                    {/* 3. Recorded View (Player) */}
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
                                                Note: Work description hidden while voice note is attached.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        />

                        {/* Row 8: Date | Time | Frequency */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2 relative">
                                <label className="text-sm font-bold text-gray-700">Task Start Date</label>
                                <button
                                    type="button"
                                    onClick={() => setShowCalendar(!showCalendar)}
                                    className="w-full p-2.5 text-left border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all flex items-center justify-between text-sm"
                                >
                                    {formData.startDate ? formatDateLong(new Date(formData.startDate)) : "Select a date"}
                                    <Calendar className="h-4 w-4 text-gray-400" />
                                </button>
                                {showCalendar && (
                                    <div className="absolute bottom-full left-0 mb-2 z-50">
                                        <CalendarComponent
                                            date={formData.startDate ? new Date(formData.startDate) : null}
                                            onChange={(date) => setFormData(prev => ({ ...prev, startDate: formatDateISO(date) }))}
                                            onClose={() => setShowCalendar(false)}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Task Time</label>
                                <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Frequency</label>
                                <select name="frequency" value={formData.frequency} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 focus:bg-white transition-all">
                                    <option value="one-time">One Time</option>
                                    <option value="alternate-day">Alternate Day</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="fortnight">Fortnight (Every 2 Weeks)</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="half-yearly">Half Yearly</option>
                                    <option value="yearly">Yearly</option>
                                </select>
                            </div>
                        </div>

                        {/* Additional Options */}
                        <div className="bg-gray-50 p-6 rounded-xl space-y-4">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Additional Options</h3>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-gray-700">Enable Reminder</p>
                                    <p className="text-xs text-gray-500">Send reminders before task due date</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" name="enableReminder" checked={formData.enableReminder} onChange={handleChange} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                                <div>
                                    <p className="font-bold text-gray-700">Require Attachment</p>
                                    <p className="text-xs text-gray-500">User must upload a file when completing task</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" name="requireAttachment" checked={formData.requireAttachment} onChange={handleChange} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? "Generating Preview..." : "Preview Tasks"}
                        </button>
                    </form>
                </div>

                {/* Preview Modal */}
                {showPreview && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-xl font-bold text-gray-800">Confirm Tasks Assignment</h3>
                                <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                    <X className="h-5 w-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="mb-4 bg-purple-50 text-purple-800 p-4 rounded-lg flex items-start gap-3">
                                    <FileCheck className="h-5 w-5 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Summary</p>
                                        <p className="text-sm">You are about to assign <span className="font-bold">{generatedTasks.length}</span> task(s).</p>
                                        {formData.frequency !== 'one-time' && (
                                            <p className="text-xs mt-1 opacity-80">Recurring tasks have been filtered based on holidays and the working day calendar.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {generatedTasks.map((task, index) => (
                                        <div key={index} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 text-sm">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                            <span className="font-medium text-gray-700">
                                                {new Date(task.task_start_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                            </span>
                                            <span className="text-gray-400">at</span>
                                            <span className="font-medium text-gray-700">
                                                {new Date(task.task_start_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-100 flex gap-3">
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                                >
                                    Edit Details
                                </button>
                                <button
                                    onClick={confirmSubmission}
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 px-4 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors shadow-lg disabled:opacity-50"
                                >
                                    {isSubmitting ? "Assigning..." : "Confirm & Assign"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
