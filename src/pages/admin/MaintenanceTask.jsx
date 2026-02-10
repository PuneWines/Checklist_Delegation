import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, FileCheck, Calendar, Clock, Wrench, X } from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { useDispatch, useSelector } from "react-redux";
import { uniqueDepartmentData, uniqueDoerNameData, uniqueGivenByData } from "../../redux/slice/assignTaskSlice";
import { customDropdownDetails } from "../../redux/slice/settingSlice";
import { postMaintenanceTaskApi } from "../../redux/api/maintenanceApi";
import { maintenanceData } from "../../redux/slice/maintenanceSlice";
import supabase from "../../SupabaseClient";

export default function MaintenanceTask() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { department, doerName, givenBy } = useSelector((state) => state.assignTask);
    const maintenance = useSelector((state) => state.maintenance.maintenance);
    const { customDropdowns } = useSelector((state) => state.setting);
    const username = localStorage.getItem('user-name');

    const [formData, setFormData] = useState({
        department: "Maintenance",
        machineName: "",
        taskStatus: "",
        givenBy: "",
        machineArea: "",
        doerDepartment: "",
        partName: "",
        doerName: "",
        needSoundTest: "",
        temperature: "",
        priority: "",
        workDescription: "",
        startDate: "",
        startTime: "09:00",
        frequency: "daily",
        enableReminder: false,
        requireAttachment: false
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [holidays, setHolidays] = useState([]);

    useEffect(() => {
        const fetchHolidays = async () => {
            const { data } = await supabase.from('holidays').select('holiday_date');
            if (data) setHolidays(data.map(h => h.holiday_date));
        };
        fetchHolidays();
    }, []);

    useEffect(() => {
        dispatch(uniqueDepartmentData(username));
        dispatch(uniqueGivenByData());
        dispatch(uniqueDoerNameData("Maintenance"));
        dispatch(maintenanceData(1));
        dispatch(customDropdownDetails());
    }, [dispatch, username]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Validate required fields
        if (!formData.startDate) {
            alert("Please select a start date");
            setIsSubmitting(false);
            return;
        }

        if (!formData.doerName) {
            alert("Please select a doer name");
            setIsSubmitting(false);
            return;
        }

        if (!formData.givenBy) {
            alert("Please select who is giving the task");
            setIsSubmitting(false);
            return;
        }

        try {
            const tasksToInsert = [];
            const startDate = new Date(formData.startDate);
            const freq = formData.frequency.toLowerCase();

            if (freq === 'one-time') {
                const timestamp = Date.now();
                const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                const taskId = `MNT-${timestamp}-${randomSuffix}`;

                tasksToInsert.push({
                    task_id: taskId,
                    company_name: formData.department,
                    name: formData.doerName,
                    given_by: formData.givenBy,
                    task_start_date: `${formData.startDate}T${formData.startTime}:00`,
                    task_description: `${formData.machineName} - ${formData.workDescription} (Area: ${formData.machineArea}, Part: ${formData.partName})`,
                    freq: formData.frequency,
                    enable_reminder: formData.enableReminder,
                    status: null,
                    submission_date: null,
                });
            } else {
                let current = new Date(startDate);
                const endDate = new Date(startDate);
                endDate.setFullYear(endDate.getFullYear() + 1);

                const isHoliday = (d) => {
                    const dStr = d.toISOString().split('T')[0];
                    return holidays.includes(dStr);
                };

                const addDays = (date, days) => {
                    const d = new Date(date);
                    d.setDate(d.getDate() + days);
                    return d;
                };

                let attempts = 0;
                let counter = 0;
                while (current <= endDate && attempts < 1000) {
                    attempts++;
                    if (!isHoliday(current)) {
                        const timestamp = Date.now();
                        const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                        const taskId = `MNT-${timestamp}-${counter}-${randomSuffix}`;

                        tasksToInsert.push({
                            task_id: taskId,
                            company_name: formData.department,
                            name: formData.doerName,
                            given_by: formData.givenBy,
                            task_start_date: `${current.toISOString().split('T')[0]}T${formData.startTime}:00`,
                            task_description: `${formData.machineName} - ${formData.workDescription} (Area: ${formData.machineArea}, Part: ${formData.partName})`,
                            freq: formData.frequency,
                            enable_reminder: formData.enableReminder,
                            status: null,
                            submission_date: null,
                        });
                        counter++;
                    }

                    if (freq === 'daily') current = addDays(current, 1);
                    else if (freq === 'weekly') current = addDays(current, 7);
                    else if (freq === 'monthly') current.setMonth(current.getMonth() + 1);
                    else break;
                }
            }

            // Using insert for multiple rows if needed, or loop through postMaintenanceTaskApi
            // Given the pattern, let's use the API for each or update API to handle array.
            // Since postMaintenanceTaskApi is already defined, let's use it properly.

            if (tasksToInsert.length > 1) {
                // Batch insert using supabase directly as the api might not support arrays
                const { error } = await supabase.from('maintenance_tasks').insert(tasksToInsert);
                if (error) throw error;
            } else if (tasksToInsert.length === 1) {
                await postMaintenanceTaskApi(tasksToInsert[0]);
            }

            // Reset form
            setFormData({
                department: "Maintenance",
                machineName: "",
                machineArea: "",
                partName: "",
                workDescription: "",
                doerName: "",
                givenBy: "",
                startDate: "",
                startTime: "09:00",
                frequency: "one-time",
                enableReminder: false,
                requireAttachment: false
            });

            alert(`Successfully assigned ${tasksToInsert.length} maintenance task(s)!`);

            // Navigate to task management page
            navigate('/dashboard/task-management');
        } catch (error) {
            console.error(error);
            alert("Error assigning task");

            // Reset form on error as well
            setFormData({
                department: "Maintenance",
                machineName: "",
                machineArea: "",
                partName: "",
                workDescription: "",
                doerName: "",
                givenBy: "",
                startDate: "",
                startTime: "09:00",
                frequency: "one-time",
                enableReminder: false,
                requireAttachment: false
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AdminLayout>
            <div className="max-w-4xl mx-auto p-4">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <Wrench className="h-6 w-6 text-orange-600" />
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
                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        {/* Row 1: Department */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Department</label>
                            <select
                                name="department"
                                value={formData.department}
                                onChange={handleChange}
                                className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                            >
                                <option value="Maintenance">Maintenance</option>
                                {department.map((dept, i) => (
                                    <option key={i} value={typeof dept === 'string' ? dept : dept.department}>{typeof dept === 'string' ? dept : dept.department}</option>
                                ))}
                            </select>
                        </div>

                        {/* Row 2: Machine Name | Task Status */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Machine Name</label>
                                <select name="machineName" value={formData.machineName} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Machine</option>
                                    {customDropdowns
                                        .filter(item => item.category === "Machine Name")
                                        .map((item) => (
                                            <option key={item.id} value={item.value}>{item.value}</option>
                                        ))
                                    }
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Task Status</label>
                                <select name="taskStatus" value={formData.taskStatus} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Task Status</option>
                                    {customDropdowns
                                        .filter(item => item.category === "Task Status")
                                        .map((item) => (
                                            <option key={item.id} value={item.value}>{item.value}</option>
                                        ))
                                    }
                                    {/* Fallback hardcoded if no dynamic data */}
                                    {(!customDropdowns.some(item => item.category === "Task Status")) && (
                                        <>
                                            <option value="Pending">Pending</option>
                                            <option value="In Progress">In Progress</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* Row 3: Given By | Machine Area */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Assign From</label>
                                <select name="givenBy" value={formData.givenBy} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Assign From</option>
                                    {givenBy.map((g, i) => <option key={i} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Machine Area</label>
                                <input name="machineArea" value={formData.machineArea} onChange={handleChange} placeholder="Enter task area..." className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                        </div>

                        {/* Row 4: Doer's Department | Part Name */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Doer's Department</label>
                                <select name="doerDepartment" value={formData.doerDepartment} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Doer's Department</option>
                                    <option value="Mechanical">Mechanical</option>
                                    <option value="Electrical">Electrical</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Part Name</label>
                                <input name="partName" value={formData.partName} onChange={handleChange} placeholder="Enter part name..." className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                        </div>

                        {/* Row 5: Doer's Name | Need Sound Test */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Doer's Name</label>
                                <select name="doerName" value={formData.doerName} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Doer Name</option>
                                    {doerName.map((d, i) => <option key={i} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Need Sound Test</label>
                                <select name="needSoundTest" value={formData.needSoundTest} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Need Sound Test</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                        </div>

                        {/* Row 6: Temperature | Priority */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Temperature</label>
                                <select name="temperature" value={formData.temperature} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Temperature</option>
                                    <option value="Normal">Normal</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Priority</label>
                                <select name="priority" value={formData.priority} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Select Priority</option>
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                        </div>

                        {/* Row 7: Work Description */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Work Description</label>
                            <textarea
                                name="workDescription"
                                value={formData.workDescription}
                                onChange={handleChange}
                                rows="4"
                                placeholder="Enter work description..."
                                className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                            ></textarea>
                        </div>

                        {/* Row 8: Date | Time | Frequency */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Task Start Date</label>
                                <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Task Time</label>
                                <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">Frequency</label>
                                <select name="frequency" value={formData.frequency} onChange={handleChange} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="one-time">One Time</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
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
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                </label>
                            </div>
                            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                                <div>
                                    <p className="font-bold text-gray-700">Require Attachment</p>
                                    <p className="text-xs text-gray-500">User must upload a file when completing task</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" name="requireAttachment" checked={formData.requireAttachment} onChange={handleChange} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                </label>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? "Assigning..." : "Assign Task"}
                        </button>
                    </form>
                </div>
            </div>
        </AdminLayout>
    );
}
