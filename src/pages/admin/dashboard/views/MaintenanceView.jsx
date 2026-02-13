import React, { useMemo, useState, useRef, useEffect } from "react"
import { isToday, isThisWeek, isThisMonth } from "date-fns"
import { Settings, Calendar, CheckCircle, Clock, AlertTriangle, IndianRupee, FileText, Play, Pause, Edit, Save, X } from "lucide-react"
import { useDispatch } from "react-redux"
import { updateMaintenanceTask } from "../../../../redux/slice/maintenanceSlice"
import { fetchUniqueDepartmentDataApi, fetchUniqueGivenByDataApi, fetchUniqueDoerNameDataApi } from "../../../../redux/api/assignTaskApi"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

const isAudioUrl = (url) => {
    if (typeof url !== 'string') return false;
    return url.startsWith('http') && (
        url.includes('audio-recordings') ||
        url.includes('voice-notes') ||
        url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i)
    );
};

const AudioPlayer = ({ url }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);

    const togglePlay = (e) => {
        e.stopPropagation();
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleEnded = () => setIsPlaying(false);
        audio.addEventListener('ended', handleEnded);
        return () => audio.removeEventListener('ended', handleEnded);
    }, []);

    return (
        <div className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all duration-300 min-w-[140px] ${isPlaying
            ? 'bg-indigo-50/80 border-indigo-200 shadow-sm scale-[1.02]'
            : 'bg-white border-gray-100 hover:border-indigo-100 hover:shadow-xs'
            }`}>
            <button
                onClick={togglePlay}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${isPlaying
                    ? 'bg-gradient-to-r from-rose-500 to-pink-600'
                    : 'bg-gradient-to-r from-indigo-500 to-violet-600 hover:scale-110'
                    }`}
            >
                {isPlaying ? (
                    <Pause size={12} className="text-white fill-white" />
                ) : (
                    <Play size={12} className="text-white fill-white ml-0.5" />
                )}
            </button>
            <div className="flex flex-col">
                <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${isPlaying ? 'text-indigo-700' : 'text-gray-400'
                    }`}>
                    {isPlaying ? 'Playing...' : 'Voice Note'}
                </span>
                {isPlaying && (
                    <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
                        <div className="w-0.5 h-full bg-indigo-400 animate-bounce" style={{ animationDuration: '0.6s' }}></div>
                        <div className="w-0.5 h-2/3 bg-indigo-500 animate-bounce" style={{ animationDuration: '0.8s' }}></div>
                        <div className="w-0.5 h-full bg-indigo-600 animate-bounce" style={{ animationDuration: '0.4s' }}></div>
                        <div className="w-0.5 h-2/3 bg-indigo-500 animate-bounce" style={{ animationDuration: '0.7s' }}></div>
                    </div>
                )}
            </div>
            <audio ref={audioRef} src={url} className="hidden" />
        </div>
    );
};


const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white rounded-xl p-2 shadow-sm border border-gray-100 flex items-center gap-2 w-full min-w-0">
        <div className={`p-1.5 rounded-lg ${color} bg-opacity-10 flex-shrink-0`}>
            <Icon className={`h-4 w-4 ${color.replace('bg-', 'text-')}`} />
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-[9px] sm:text-[10px] text-gray-500 font-bold capitalize tracking-tight truncate mb-0.5 leading-tight">{label}</p>
            <p className="text-base sm:text-lg font-extrabold text-gray-900 truncate leading-none">{value}</p>
        </div>
    </div>
)

export default function MaintenanceView({ stats: originalStats, chartData, tasks = [] }) {
    const [maintFilter, setMaintFilter] = useState('today');
    const [isSaving, setIsSaving] = useState(false);

    // Dropdown lists
    const [givenByList, setGivenByList] = useState([]);
    const [doersList, setDoersList] = useState([]);

    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const dispatch = useDispatch();

    const handleEditClick = (task) => {
        setEditingTaskId(task.id);
        setEditFormData({
            id: task.id,
            machine_name: task.machine_name || '',
            part_name: task.part_name || '',
            part_area: task.part_area || '',
            given_by: task.given_by || '',
            name: task.assignedTo || '',
            task_description: task.task_description || task.title || '',
            task_start_date: task.originalTaskStartDate || '',
            freq: task.frequency || '',
        });
    };

    const handleCancelEdit = () => {
        setEditingTaskId(null);
        setEditFormData({});
    };

    const handleInputChange = async (field, value) => {
        setEditFormData(prev => ({ ...prev, [field]: value }));

        // If department changes (even if not in this view, good to have), refresh doers list
        if (field === 'department') {
            const doers = await fetchUniqueDoerNameDataApi(value);
            setDoersList(doers);
        }
    };

    const handleSaveEdit = async () => {
        setIsSaving(true);
        try {
            await dispatch(updateMaintenanceTask(editFormData)).unwrap();
            setEditingTaskId(null);
            // In a real app, you might want to refresh the parent data here
            // But for now, we'll assume the user will reload or the state is updated
        } catch (error) {
            console.error("Failed to save maintenance edit:", error);
            alert("Failed to save changes: " + (error.message || "Unknown error"));
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        // Fetch dropdown data
        const fetchDropdownData = async () => {
            const [givens, doers] = await Promise.all([
                fetchUniqueGivenByDataApi(),
                fetchUniqueDoerNameDataApi()
            ]);
            setGivenByList(givens);
            setDoersList(doers);
        };
        fetchDropdownData();
    }, []);

    // Filter tasks based on selected time range
    const filteredTasks = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return tasks.filter(task => {
            if (!task.originalTaskStartDate) return false;
            const taskDate = new Date(task.originalTaskStartDate);
            taskDate.setHours(0, 0, 0, 0);

            const hasSubmission = task.submission_date !== null && task.submission_date !== undefined;
            const isOverdue = taskDate < today;
            const isTaskToday = isToday(taskDate);

            // Hide pending tasks that are in the future (upcoming)
            if (!hasSubmission && !isTaskToday && !isOverdue) {
                return false;
            }

            // Apply time range filters (today, week, month, all)
            if (maintFilter === 'today') {
                return isTaskToday || isOverdue;
            }
            if (maintFilter === 'week') return isThisWeek(taskDate, { weekStartsOn: 1 });
            if (maintFilter === 'month') return isThisMonth(taskDate);
            return true; // 'all' - currently shows everything except upcoming pending
        });
    }, [tasks, maintFilter]);

    // Process data for charts and stats based on FILTERED tasks
    const processedData = useMemo(() => {
        const currentTasks = filteredTasks;
        if (!currentTasks || currentTasks.length === 0) return {
            totalMachines: 0,
            totalCost: 0,
            freqData: [],
            costData: [],
            deptCostData: [],
            completedCount: 0,
            pendingCount: 0,
            overdueCount: 0
        };

        const uniqueMachines = new Set();
        let totalCost = 0;
        let completedCount = 0;
        let pendingCount = 0;
        let overdueCount = 0;
        const freqCounts = {
            "One-time": 0, "Daily": 0, "Weekly": 0, "Monthly": 0,
            "Quarterly": 0, "Half-yearly": 0, "Yearly": 0
        };
        const monthlyCost = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        currentTasks.forEach(task => {
            // Count unique machines
            if (task.machine_name) uniqueMachines.add(task.machine_name);

            // Sum cost
            const cost = parseFloat(task.bill_amount) || 0;
            totalCost += cost;

            // Determine task status based on submission_date
            const taskStartDate = task.originalTaskStartDate ? new Date(task.originalTaskStartDate) : null;
            const hasSubmission = task.submission_date !== null && task.submission_date !== undefined;

            if (hasSubmission) {
                completedCount++;
            } else {
                pendingCount++;
                // Check if overdue (task start date is in the past and not completed)
                if (taskStartDate && taskStartDate < today) {
                    overdueCount++;
                }
            }

            // Frequency
            const freq = task.frequency ? task.frequency.charAt(0).toUpperCase() + task.frequency.slice(1) : "One-time";
            if (freqCounts[freq] !== undefined) freqCounts[freq]++;
            else freqCounts["One-time"]++;

            // Monthly Cost
            const date = task.originalTaskStartDate ? new Date(task.originalTaskStartDate) : new Date();
            const month = date.toLocaleString('default', { month: 'short' });
            monthlyCost[month] = (monthlyCost[month] || 0) + cost;

            // Department Cost (using machine_name as proxy for department if not available, or just mock logic if field missing)
            // Assuming task.company_name or given_by might be used for department categorization if available
            // For now, let's use a dummy or skip if no clear department field
        });

        const freqData = Object.keys(freqCounts).map(key => ({ name: key, count: freqCounts[key] }));

        const costData = Object.keys(monthlyCost).map(key => ({ name: key, cost: monthlyCost[key] }));
        // Ensure some data for chart if empty
        if (costData.length === 0) {
            ['Jan', 'Feb', 'Mar', 'Apr', 'May'].forEach(m => costData.push({ name: m, cost: 0 }));
        }

        return {
            totalMachines: uniqueMachines.size,
            totalCost,
            freqData,
            costData,
            deptCostData: [], // distinct department data needed if available
            completedCount,
            pendingCount,
            overdueCount
        };
    }, [filteredTasks]);

    // Use passed chartData or calculated or defaults
    const costData = processedData.costData;

    const deptCostData = [
        { name: "Logistics", value: 400, color: "#3B82F6" },
        { name: "Packaging", value: 300, color: "#10B981" },
        { name: "SMS", value: 300, color: "#F59E0B" },
        { name: "Mill", value: 200, color: "#EF4444" },
    ]

    const frequencyData = processedData.freqData;

    return (
        <div className="space-y-4 pb-8 overflow-x-hidden w-full max-w-full">
            {/* Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard icon={Settings} label="Total Machines" value={processedData?.totalMachines || 0} color="bg-blue-500" />
                <StatCard icon={Calendar} label="Total Tasks" value={filteredTasks.length} color="bg-indigo-500" />
                <StatCard icon={CheckCircle} label="Tasks Complete" value={processedData?.completedCount || 0} color="bg-green-500" />
                <StatCard icon={Clock} label="Tasks Pending" value={processedData?.pendingCount || 0} color="bg-amber-500" />
                <StatCard icon={AlertTriangle} label="Tasks Overdue" value={processedData?.overdueCount || 0} color="bg-red-500" />
                <StatCard icon={IndianRupee} label="Total Cost" value={`₹${processedData?.totalCost || 0}`} color="bg-purple-500" />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-gray-800">Maintenance Cost</h3>
                        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">Monthly View</span>
                    </div>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={costData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v) => `₹${v}`} />
                                <Tooltip
                                    cursor={{ fill: '#f9fafb' }}
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="cost" fill="#6366F1" radius={[6, 6, 0, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-gray-800">Department Cost Analysis</h3>
                        <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">By Department</span>
                    </div>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={deptCostData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    paddingAngle={8}
                                    dataKey="value"
                                >
                                    {deptCostData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Frequent Maintenance Graph */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="h-4 w-4 text-gray-400" />
                    <h3 className="text-base font-semibold text-gray-800">Frequent Maintenance</h3>
                </div>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={frequencyData}
                            margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis
                                dataKey="name"
                                axisLine={{ stroke: '#e5e7eb' }}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 10 }}
                                dy={5}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 10 }}
                                domain={[0, 'auto']}
                                allowDecimals={false}
                            />
                            <Tooltip
                                cursor={{ fill: '#f3f4f6', opacity: 0.4 }}
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    borderRadius: '8px',
                                    border: '1px solid #e5e7eb',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                }}
                                itemStyle={{ color: '#ef4444', fontWeight: '600', fontSize: '12px' }}
                            />
                            <Bar
                                dataKey="count"
                                name="Number of Tasks"
                                fill="#ef4444"
                                radius={[2, 2, 0, 0]}
                                barSize={40}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                    {/* Custom Legend for Number of Repairs */}
                    <div className="flex justify-center items-center gap-2 mt-4 pb-2">
                        <div className="w-3 h-3 bg-[#ef4444] rounded-sm"></div>
                        <span className="text-xs text-gray-600 font-bold uppercase tracking-wider">Number of Tasks</span>
                    </div>
                </div>
            </div>

            {/* Maintenance Tasks Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <h3 className="text-base font-bold text-gray-800">Maintenance Tasks</h3>
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 uppercase tracking-wider">
                            {maintFilter}
                        </span>
                    </div>

                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner">
                        {['today', 'week', 'month', 'all'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setMaintFilter(f)}
                                className={`px-4 py-1.5 text-[10px] font-extrabold rounded-md transition-all uppercase tracking-tight ${maintFilter === f
                                    ? 'bg-white text-purple-700 shadow-sm border border-gray-100'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Task ID</th>

                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Machine Name</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Part Name</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Part Area</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Assign From</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">Task Description</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Task Start Date & Time</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Freq</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Enable Reminders</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Require Attachment</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">Remarks</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Upload Image</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredTasks.length > 0 ? (
                                filteredTasks.map((task, index) => (
                                    <tr key={task.id || index} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{task.id}</td>

                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                            {editingTaskId === task.id ? (
                                                <input type="text" value={editFormData.machine_name} onChange={e => handleInputChange('machine_name', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" />
                                            ) : task.machine_name}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                            {editingTaskId === task.id ? (
                                                <input type="text" value={editFormData.part_name} onChange={e => handleInputChange('part_name', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" />
                                            ) : task.part_name}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                            {editingTaskId === task.id ? (
                                                <input type="text" value={editFormData.part_area} onChange={e => handleInputChange('part_area', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" />
                                            ) : task.part_area}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                            {editingTaskId === task.id ? (
                                                <select
                                                    value={editFormData.given_by}
                                                    onChange={e => handleInputChange('given_by', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-xs"
                                                >
                                                    <option value="">Select AssignBy</option>
                                                    {givenByList.map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            ) : task.given_by}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                            {editingTaskId === task.id ? (
                                                <select
                                                    value={editFormData.name}
                                                    onChange={e => handleInputChange('name', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-xs"
                                                >
                                                    <option value="">Select Name</option>
                                                    {doersList.map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            ) : task.assignedTo}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {editingTaskId === task.id ? (
                                                <textarea value={editFormData.task_description} onChange={e => handleInputChange('task_description', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" rows="2" />
                                            ) : (
                                                isAudioUrl(task.task_description || task.title) ? (
                                                    <AudioPlayer url={task.task_description || task.title} />
                                                ) : (
                                                    <div className="line-clamp-2" title={task.task_description || task.title}>
                                                        {task.task_description || task.title}
                                                    </div>
                                                )
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                            {editingTaskId === task.id ? (
                                                <input
                                                    type="datetime-local"
                                                    value={editFormData.task_start_date ? new Date(editFormData.task_start_date).toISOString().slice(0, 16) : ''}
                                                    onChange={e => handleInputChange('task_start_date', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-xs bg-gray-100 italic"
                                                    disabled
                                                />
                                            ) : (
                                                task.originalTaskStartDate ? new Date(task.originalTaskStartDate).toLocaleString('en-IN', {
                                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit', hour12: true
                                                }) : '-'
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap capitalize">
                                            {editingTaskId === task.id ? (
                                                <select
                                                    value={editFormData.freq}
                                                    onChange={e => handleInputChange('freq', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-xs bg-gray-100 italic"
                                                    disabled
                                                >
                                                    <option value="daily">Daily</option>
                                                    <option value="weekly">Weekly</option>
                                                    <option value="monthly">Monthly</option>
                                                </select>
                                            ) : task.frequency}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-center">
                                            {task.enable_reminders ? 'Yes' : 'No'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-center">
                                            {task.require_attachment ? 'Yes' : 'No'}
                                        </td>
                                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase border ${task.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                                                task.status === 'overdue' ? 'bg-red-50 text-red-700 border-red-200' :
                                                    'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                }`}>
                                                {task.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {isAudioUrl(task.remarks) ? <AudioPlayer url={task.remarks} /> : task.remarks}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-center">
                                            {task.uploaded_image_url ? (
                                                <a href={task.uploaded_image_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center justify-center gap-1">
                                                    <CheckCircle className="h-3 w-3" /> View
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                                            {editingTaskId === task.id ? (
                                                <div className="flex gap-2">
                                                    <button onClick={handleSaveEdit} disabled={isSaving} className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                                                        <Save size={14} />
                                                    </button>
                                                    <button onClick={handleCancelEdit} className="p-1 bg-gray-600 text-white rounded hover:bg-gray-700">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => handleEditClick(task)} className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="14" className="px-4 py-8 text-center text-gray-500 text-sm">
                                        No maintenance tasks found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
