"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, X, Edit, Save, Loader2, Play, Pause, Search, Mic, Users, Filter, Check, ChevronDown } from 'lucide-react';
import supabase from '../../SupabaseClient';

const extractAudioUrl = (text) => {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|wav|ogg|webm|m4a|aac)(\?.*)?)/i) ||
        text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*)/i);
    return match ? match[0] : null;
};

const isAudioUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    return url.startsWith('http') && (
        url.includes('audio-recordings') ||
        url.includes('voice-notes') ||
        url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i)
    );
};

// Helper to normalize any date format to YYYY-MM-DD
const normalizeDate = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') {
        const isoMatch = dateVal.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) return isoMatch[1];
        if (dateVal.includes('/')) {
            const parts = dateVal.split('/');
            if (parts.length === 3) {
                return `${parts[2].trim()}-${parts[1].trim().padStart(2, '0')}-${parts[0].trim().padStart(2, '0')}`;
            }
        }
    }
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    } catch (e) {
        return null;
    }
};

const AudioPlayer = ({ url }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);

    const togglePlay = (e) => {
        if (e) e.stopPropagation();
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
        <div className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all duration-300 min-w-[140px] mt-2 ${isPlaying
            ? 'bg-blue-50 border-blue-200 shadow-sm scale-[1.02]'
            : 'bg-white border-gray-100 hover:border-blue-100 hover:shadow-xs'
            }`}>
            <button
                onClick={togglePlay}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${isPlaying
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-700'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-110'
                    }`}
            >
                {isPlaying ? (
                    <Pause size={14} className="text-white fill-white" />
                ) : (
                    <Play size={14} className="text-white fill-white ml-0.5" />
                )}
            </button>
            <div className="flex flex-col">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isPlaying ? 'text-blue-700' : 'text-gray-400'}`}>
                    {isPlaying ? 'Playing...' : 'Voice Note'}
                </span>
                {isPlaying && (
                    <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
                        <div className="w-0.5 h-full bg-blue-400 animate-bounce" style={{ animationDuration: '0.6s' }}></div>
                        <div className="w-0.5 h-2/3 bg-blue-500 animate-bounce" style={{ animationDuration: '0.8s' }}></div>
                        <div className="w-0.5 h-full bg-blue-600 animate-bounce" style={{ animationDuration: '0.4s' }}></div>
                        <div className="w-0.5 h-2/3 bg-blue-500 animate-bounce" style={{ animationDuration: '0.7s' }}></div>
                    </div>
                )}
            </div>
            <audio ref={audioRef} src={url} className="hidden" />
        </div>
    );
};

const getHindiDay = (day) => {
    const dayMap = {
        'Sunday': 'रविवार',
        'Monday': 'सोमवार',
        'Tuesday': 'मंगलवार',
        'Wednesday': 'बुधवार',
        'Thursday': 'गुरुवार',
        'Friday': 'शुक्रवार',
        'Saturday': 'शनिवार'
    };
    return dayMap[day] || day;
};

const CalendarPage = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [tasks, setTasks] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [workingDays, setWorkingDays] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal & Edit State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedTasks, setSelectedTasks] = useState([]);
    const [isHolidayDate, setIsHolidayDate] = useState(false);
    const [holidayName, setHolidayName] = useState('');
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editForm, setEditForm] = useState({ status: '', remark: '' });
    const [isUpdating, setIsUpdating] = useState(false);

    // Filter State
    const [allUsers, setAllUsers] = useState([]);
    const [selectedPersons, setSelectedPersons] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showPersonFilter, setShowPersonFilter] = useState(false);
    const filterRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (filterRef.current && !filterRef.current.contains(event.target)) {
                setShowPersonFilter(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredTasks = useMemo(() => {
        if (selectedPersons.length === 0) return tasks;
        return tasks.filter(t => selectedPersons.includes(t.name));
    }, [tasks, selectedPersons]);

    const handleVoiceSearch = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Voice recognition is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.start();
        setIsListening(true);

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setSearchTerm(transcript);
            setIsListening(false);
        };

        recognition.onerror = () => {
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };
    };

    const togglePerson = (name) => {
        setSelectedPersons(prev =>
            prev.includes(name)
                ? prev.filter(p => p !== name)
                : [...prev, name]
        );
    };

    const clearFilters = () => {
        setSelectedPersons([]);
        setSearchTerm("");
    };

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    useEffect(() => {
        fetchTasks();
        fetchUsers();
    }, [currentDate]);

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('user_name')
                .eq('status', 'active')
                .order('user_name', { ascending: true });
            if (error) throw error;
            if (data) setAllUsers(data.map(u => u.user_name));
        } catch (err) {
            console.error('Error fetching users:', err);
        }
    };

    const fetchTasks = async () => {
        try {
            setLoading(true);

            const role = localStorage.getItem('role');
            const username = localStorage.getItem('user-name');
            const userAccess = localStorage.getItem('user_access');

            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

            // Format for Supabase (YYYY-MM-DD)
            const startStr = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}-01`;
            const endStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}T23:59:59`;

            let checklistQuery = supabase.from('checklist').select('*').gte('planned_date', startStr).lte('planned_date', endStr);
            let maintenanceQuery = supabase.from('maintenance_tasks').select('*').gte('planned_date', startStr).lte('planned_date', endStr);
            let repairQuery = supabase.from('repair_tasks').select('*').gte('created_at', startStr).lte('created_at', endStr);
            let delegationQuery = supabase.from('delegation').select('*').gte('planned_date', startStr).lte('planned_date', endStr);
            let eaQuery = supabase.from('ea_tasks').select('*').gte('planned_date', startStr).lte('planned_date', endStr);

            // Role Filters
            // For regular users, only show their own tasks
            if (role === 'user' && username) {
                checklistQuery = checklistQuery.eq('name', username);
                maintenanceQuery = maintenanceQuery.eq('name', username);
                repairQuery = repairQuery.eq('assigned_person', username); // standardizing on assigned_person
                delegationQuery = delegationQuery.eq('name', username);
                eaQuery = eaQuery.eq('doer_name', username);
            }
            // For admins, we now show EVERYTHING by default to match the global counts 
            // of the Working Day Calendar, unless we WANT to add optional filtering later.
            // This fixes the issue where counts are visible but tasks are hidden due to 
            // strict department/access rules.

            let [
                checklistRes,
                maintenanceRes,
                repairRes,
                delegationRes,
                eaRes,
                holidaysRes,
                workingDaysRes
            ] = await Promise.all([
                checklistQuery,
                maintenanceQuery,
                repairQuery,
                delegationQuery,
                eaQuery,
                supabase.from('holidays').select('*'),
                supabase
                    .from('working_day_calender')
                    .select('working_date')
                    .gte('working_date', startStr)
                    .lte('working_date', endStr)
            ]);


            const finalRepairRes = repairRes;
            const finalEARes = eaRes;

            const normalizedTasks = [
                ...(checklistRes.data || []).map(t => ({
                    ...t,
                    id: t.task_id || t.id,
                    cat: 'CK',
                    title: t.task_description || t.tasks,
                    date: normalizeDate(t.planned_date || t.task_start_date || t.created_at),
                    type: 'checklist',
                    name: t.name || t.assigned_person // Fallback for name field
                })),

                ...(maintenanceRes.data || []).map(t => ({
                    ...t,
                    cat: 'MT',
                    title: t.task_description || t.id,
                    date: normalizeDate(t.planned_date || t.task_start_date || t.created_at),
                    type: 'maintenance',
                    name: t.name || t.assigned_person
                })),

                ...(repairRes.data || []).map(t => ({
                    ...t,
                    cat: 'RP',
                    title: t.issue_description || t.task_description || t.id,
                    date: normalizeDate(t.planned_date || t.task_start_date || t.created_at),
                    type: 'repair',
                    name: t.assigned_person || t.name || t.filled_by
                })),

                ...(delegationRes.data || []).map(t => ({
                    ...t,
                    id: t.task_id || t.id,
                    cat: 'DL',
                    title: t.task_description || t.id,
                    date: normalizeDate(t.planned_date || t.task_start_date || t.created_at),
                    type: 'delegation',
                    name: t.name || t.assigned_person
                })),

                ...(eaRes.data || []).map(t => ({
                    ...t,
                    id: t.task_id || t.id,
                    cat: 'EA',
                    title: t.task_description || t.id,
                    date: normalizeDate(t.planned_date || t.task_start_date || t.created_at),
                    type: 'ea',
                    name: t.doer_name || t.name
                }))
            ].filter(t => t.date); // Ensure only tasks with a valid date are shown

            // Sort by ascending date so tasks appear sequentially
            normalizedTasks.sort((a, b) => {
                const dateA = a.date ? new Date(a.date) : new Date(0);
                const dateB = b.date ? new Date(b.date) : new Date(0);
                return dateA - dateB;
            });

            console.log(`✅ Loaded ${normalizedTasks.length} tasks for Calendar.`);
            setTasks(normalizedTasks);
            setHolidays(holidaysRes.data || []);
            setWorkingDays(workingDaysRes.data || []);
        } catch (err) {
            console.error('Error fetching calendar tasks:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCellClick = (day, holiday, isOffDay) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTasks = filteredTasks.filter(t => t.date === dateStr);

        setSelectedDate(dateStr);
        setSelectedTasks(dayTasks);
        setIsHolidayDate(!!holiday);
        setHolidayName(holiday?.holiday_name || (isOffDay ? 'Off Day' : ''));
        setIsModalOpen(true);
        setEditingTaskId(null); // Reset editing state
    };

    const handleEditClick = (task) => {
        setEditingTaskId(task.id);
        setEditForm({
            status: task.status || '',
            remark: task.remark || task.remarks || ''
        });
    };

    const handleUpdateTask = async (task) => {
        setIsUpdating(true);
        try {
            let tableName = '';
            const updates = { status: editForm.status };

            if (task.type === 'checklist') {
                tableName = 'checklist';
                updates.remark = editForm.remark;
                if (editForm.status === 'yes') updates.submission_date = new Date().toISOString();
            } else if (task.type === 'maintenance') {
                tableName = 'maintenance_tasks';
                updates.remarks = editForm.remark;
                if (editForm.status === 'completed') updates.submission_date = new Date().toISOString();
            } else if (task.type === 'repair') {
                tableName = 'repair_tasks';
                updates.remarks = editForm.remark;
            }

            const pkField = task.type === 'checklist' ? 'task_id' : 'id';
            const { error } = await supabase.from(tableName).update(updates).eq(pkField, task.id);
            if (error) throw error;

            setEditingTaskId(null);
            fetchTasks(); // Refresh data

            // Update local state for the modal
            setSelectedTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates, remark: editForm.remark, remarks: editForm.remark } : t));
        } catch (err) {
            console.error('Update error:', err);
            alert('Update failed');
        } finally {
            setIsUpdating(false);
        }
    };

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = currentDate.toLocaleString('default', { month: 'long' });

    const days = [];
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    for (let i = 0; i < startDay; i++) {
        days.push(<div key={`empty-${i}`} className="aspect-square bg-gray-50 border-r border-b border-gray-200"></div>);
    }

    for (let i = 1; i <= totalDays; i++) {
        const dayDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const holiday = holidays.find(h => normalizeDate(h.holiday_date) === dayDate);
        const workingDay = workingDays.find(w => normalizeDate(w.working_date) === dayDate);
        const dayTasks = filteredTasks.filter(t => t.date === dayDate);
        const isToday = new Date().toISOString().split('T')[0] === dayDate;
        const isHoliday = !!holiday;
        const isOffDay = !isHoliday && !workingDay;

        days.push(
            <div
                key={i}
                onClick={() => handleCellClick(i, holiday, isOffDay)}
                className={`aspect-square border-r border-b border-gray-200 p-2 cursor-pointer transition-colors relative ${isHoliday ? 'bg-rose-50' : isOffDay ? 'bg-slate-50' : isToday ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-start mb-1">
                    <span className={`text-xs font-bold ${isHoliday ? 'text-red-700 underline' : isOffDay ? 'text-gray-600' : isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                        {i}
                    </span>
                    {dayTasks.length > 0 && !isHoliday && (
                        <div className="flex gap-0.5">
                            {Array.from(new Set(dayTasks.map(d => d.cat))).map(cat => (
                                <div key={cat} className={`w-2 h-2 rounded-full ${cat === 'CK' ? 'bg-blue-600' :
                                    cat === 'MT' ? 'bg-orange-600' :
                                        cat === 'RP' ? 'bg-red-600' :
                                            cat === 'DL' ? 'bg-purple-600' :
                                                'bg-indigo-600'
                                    }`} title={cat} />
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-0.5 mt-1 overflow-hidden h-[calc(100%-1.5rem)]">
                    {isHoliday && (
                        <p className="text-[9px] font-black text-red-600 uppercase leading-tight truncate px-1 mb-0.5 bg-red-100/50 rounded-sm">
                            {holiday.holiday_name}
                        </p>
                    )}
                    {isOffDay && (
                        <p className="text-[9px] font-black text-gray-500 uppercase leading-tight truncate px-1 mb-0.5 bg-gray-200/50 rounded-sm">
                            Off Day
                        </p>
                    )}
                    {dayTasks.slice(0, 3).map((task, idx) => (
                        <div key={idx} className="bg-white border-l-4 border-gray-200 pl-1 py-0.5 shadow-sm mb-0.5">
                            <p className="text-[9px] font-bold text-gray-700 truncate uppercase flex items-center gap-1">
                                {isAudioUrl(task.title) ? (
                                    <><Play size={8} className="text-blue-600 fill-blue-600 flex-shrink-0" /> <span className="truncate">Voice Note</span></>
                                ) : (
                                    <span className="truncate">{task.title}</span>
                                )}
                            </p>
                        </div>
                    ))}
                    {dayTasks.length > 3 && (
                        <p className="text-[9px] font-bold text-blue-700 pl-1">+ {dayTasks.length - 3} More</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-4">
                {/* Header Section */}
                <div className="bg-white border-b border-gray-200 pb-5 flex flex-col lg:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-700 rounded text-white font-bold shadow-sm">
                            <CalendarIcon size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 leading-tight tracking-tight uppercase">Operational Calendar</h1>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                Task Scheduling & Resource Planning
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Person Filter Button */}
                        <div className="relative" ref={filterRef}>
                            <button
                                onClick={() => setShowPersonFilter(!showPersonFilter)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-300 font-bold uppercase text-[10px] tracking-widest ${selectedPersons.length > 0
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                            >
                                <Users size={14} />
                                {selectedPersons.length > 0 ? `${selectedPersons.length} Selected` : 'Filter Person'}
                                <ChevronDown size={14} className={`transition-transform duration-300 ${showPersonFilter ? 'rotate-180' : ''}`} />
                            </button>

                            {showPersonFilter && (
                                <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-[50] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                        <div className="relative flex items-center mb-3">
                                            <Search className="absolute left-3 text-gray-400" size={14} />
                                            <input
                                                type="text"
                                                placeholder="Search person..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-9 pr-10 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                            />
                                            <button
                                                onClick={handleVoiceSearch}
                                                className={`absolute right-3 p-1 rounded-full transition-colors ${isListening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                                            >
                                                <Mic size={14} />
                                            </button>
                                        </div>
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                                                {selectedPersons.length} Persons Selected
                                            </span>
                                            <button
                                                onClick={clearFilters}
                                                className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-tighter"
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto p-2">
                                        {allUsers
                                            .filter(u => u.toLowerCase().includes(searchTerm.toLowerCase()))
                                            .map(user => (
                                                <button
                                                    key={user}
                                                    onClick={() => togglePerson(user)}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all duration-200 ${selectedPersons.includes(user)
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : 'hover:bg-gray-50 text-gray-700'
                                                        }`}
                                                >
                                                    <span className="text-xs font-bold uppercase tracking-tight">{user}</span>
                                                    {selectedPersons.includes(user) && <Check size={14} className="text-blue-600" />}
                                                </button>
                                            ))}
                                        {allUsers.filter(u => u.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                            <div className="p-4 text-center">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">No Persons Found</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white shrink-0">
                            <button onClick={prevMonth} className="p-3 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 transition-all border-r border-gray-200 text-gray-700">
                                <ChevronLeft size={18} strokeWidth={3} />
                            </button>
                            <div className="px-8 py-2.5 font-black text-gray-900 text-sm min-w-[200px] text-center uppercase tracking-[0.2em]">
                                {monthName} {year}
                            </div>
                            <button onClick={nextMonth} className="p-3 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 transition-all border-l border-gray-200 text-gray-700">
                                <ChevronRight size={18} strokeWidth={3} />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 max-w-sm lg:max-w-none">
                        {[
                            { label: 'Checklist', color: 'bg-blue-600' },
                            { label: 'Maintenance', color: 'bg-orange-600' },
                            { label: 'Repair', color: 'bg-red-600' },
                            { label: 'Delegation', color: 'bg-purple-600' },
                            { label: 'EA', color: 'bg-indigo-600' },
                            { label: 'Off Day', color: 'bg-gray-300' }
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-50 border border-gray-100">
                                <div className={`w-2.5 h-2.5 ${item.color} rounded-sm shadow-inner`}></div>
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-tight">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Calendar View */}
                <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
                    <div className="grid grid-cols-7 bg-gray-100 border-b border-gray-200">
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                            <div key={day} className="py-2 text-center text-[9px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-200 last:border-0 leading-tight">
                                <span className="text-gray-400 block mb-0.5">{getHindiDay(day)}</span>
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 relative border-l border-t border-gray-200">
                        {loading && (
                            <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center font-bold text-blue-700 uppercase tracking-[0.3em]">
                                Loading Data...
                            </div>
                        )}
                        {days}
                    </div>
                </div>
            </div>

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white w-full max-w-2xl rounded shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="px-6 py-4 bg-blue-700 text-white flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold uppercase tracking-widest flex items-center gap-3">
                                    <Clock className="w-4 h-4" /> {isHolidayDate ? 'Public Holiday' : selectedTasks.length === 0 && !workingDays.find(w => w.working_date === selectedDate) ? 'Off Day' : 'Task Records'}
                                </h2>
                                <p className="text-[10px] font-medium uppercase opacity-75 mt-0.5">
                                    {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-4">
                            {isHolidayDate ? (
                                <div className="p-10 text-center space-y-3 bg-red-50 border border-red-100 rounded">
                                    <h3 className="text-xl font-bold text-red-800 uppercase tracking-tight">{holidayName}</h3>
                                    <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Company Holiday - No Operations</p>
                                </div>
                            ) : selectedTasks.length === 0 ? (
                                <div className="p-10 text-center bg-gray-50 border border-gray-100 rounded">
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Zero Tasks For This Day</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedTasks.map((task) => (
                                        <div key={task.id} className="border border-gray-200 rounded p-4 flex flex-col relative overflow-hidden">
                                            <div className={`absolute top-0 left-0 w-2 h-full ${task.cat === 'CK' ? 'bg-blue-600' :
                                                task.cat === 'MT' ? 'bg-orange-600' :
                                                    task.cat === 'RP' ? 'bg-red-600' :
                                                        task.cat === 'DL' ? 'bg-purple-600' :
                                                            'bg-indigo-600'
                                                }`}></div>
                                            <div className="pl-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">ID: #{task.id}</span>
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase ${['completed', 'yes', 'Done'].includes(task.status) ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {task.status || 'Pending'}
                                                    </span>
                                                </div>
                                                {(() => {
                                                    const audioUrl = extractAudioUrl(task.title);
                                                    return (
                                                        <div className="mb-3">
                                                            {audioUrl && (
                                                                <div className="mb-2">
                                                                    <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-1">Description Recording:</h4>
                                                                    <AudioPlayer url={audioUrl} />
                                                                </div>
                                                            )}
                                                            {(!audioUrl || task.title.replace(audioUrl, '').trim().length > 0) && (
                                                                <h4 className="text-sm font-bold text-gray-900 uppercase mb-1 leading-tight">
                                                                    {task.title.replace(/Voice Note Link:?\s*/i, '').replace(audioUrl || '', '').trim() || (audioUrl ? '' : '—')}
                                                                </h4>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                <div className="grid grid-cols-2 gap-4 text-[10px] font-medium text-gray-500 uppercase mb-4">
                                                    <div>Assigned: <span className="text-gray-900 font-bold">{task.name || '-'}</span></div>
                                                    <div>Type: <span className="text-gray-900 font-bold">{task.type}</span></div>
                                                </div>

                                                {(task.remark || task.remarks) && (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 mb-4">
                                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Remarks:</h4>
                                                        {(() => {
                                                            const remarkText = task.remark || task.remarks;
                                                            const audioUrl = extractAudioUrl(remarkText);
                                                            return (
                                                                <>
                                                                    {audioUrl && <AudioPlayer url={audioUrl} />}
                                                                    {(!audioUrl || remarkText.replace(audioUrl, '').trim().length > 0) && (
                                                                        <p className="text-xs font-medium text-gray-600 italic">
                                                                            {remarkText.replace(/Voice Note Link:?\s*/i, '').replace(audioUrl || '', '').trim()}
                                                                        </p>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default CalendarPage;