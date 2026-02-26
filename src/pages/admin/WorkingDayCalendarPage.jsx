import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, CheckCircle2, ShieldAlert, Loader2, Plus, Trash2 } from 'lucide-react';
import supabase from '../../SupabaseClient';

const WorkingDayCalendarPage = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState([]);
    const [workingDays, setWorkingDays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const [tasks, setTasks] = useState([]);

    useEffect(() => {
        fetchData();
    }, [currentDate]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
            const endStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}T23:59:59`;

            const [holidaysRes, workingDaysRes, checklistRes, maintenanceRes, delegationRes, eaRes] = await Promise.all([
                supabase.from('holidays').select('*'),
                supabase.from('working_day_calender')
                    .select('*')
                    .gte('working_date', startOfMonth)
                    .lte('working_date', endStr)
                    .order('working_date', { ascending: true }),
                supabase.from('checklist').select('planned_date, task_start_date').gte('planned_date', startOfMonth).lte('planned_date', endStr),
                supabase.from('maintenance_tasks').select('planned_date').gte('planned_date', startOfMonth).lte('planned_date', endStr),
                supabase.from('delegation').select('planned_date').gte('planned_date', startOfMonth).lte('planned_date', endStr),
                supabase.from('ea_tasks').select('planned_date').gte('planned_date', startOfMonth).lte('planned_date', endStr)
            ]);

            if (holidaysRes.error && holidaysRes.error.code !== '42P01') throw holidaysRes.error;
            if (workingDaysRes.error && workingDaysRes.error.code !== '42P01') throw workingDaysRes.error;

            setHolidays(holidaysRes.data || []);
            setWorkingDays(workingDaysRes.data || []);

            // Combine task dates for counting
            const allTaskDates = [
                ...(checklistRes.data || []).map(t => (t.planned_date || t.task_start_date || "").split('T')[0]),
                ...(maintenanceRes.data || []).map(t => (t.planned_date || "").split('T')[0]),
                ...(delegationRes.data || []).map(t => (t.planned_date || "").split('T')[0]),
                ...(eaRes.data || []).map(t => (t.planned_date || "").split('T')[0])
            ].filter(Boolean);

            setTasks(allTaskDates);
        } catch (err) {
            console.error('Error fetching calendar data:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleWorkingDay = async (dateStr, isWorking, isHoliday) => {
        if (isHoliday || isProcessing) return;

        try {
            setIsProcessing(true);
            if (isWorking) {
                // Remove from working days (Make it an Off Day)
                const { error } = await supabase
                    .from('working_day_calender')
                    .delete()
                    .eq('working_date', dateStr);
                if (error) throw error;

                // Also remove tasks for this specific day (Off Day)
                const startOfDay = `${dateStr}T00:00:00.000Z`;
                const endOfDay = `${dateStr}T23:59:59.999Z`;

                await Promise.all([
                    supabase.from('checklist').delete().gte('task_start_date', startOfDay).lte('task_start_date', endOfDay),
                    supabase.from('delegation').delete().gte('task_start_date', startOfDay).lte('task_start_date', endOfDay),
                    supabase.from('maintenance_tasks').delete().gte('task_start_date', startOfDay).lte('task_start_date', endOfDay),
                    supabase.from('ea_tasks').delete().gte('planned_date', startOfDay).lte('planned_date', endOfDay)
                ]);
                console.log(`Cleaned up tasks for Off Day: ${dateStr}`);
            } else {
                // Add to working days
                const dateObj = new Date(dateStr);
                const dow = dateObj.getDay();

                // Only proceed if not Sunday (to match database rules)
                if (dow !== 0) {
                    const hindiDays = {
                        1: 'सोम',
                        2: 'मंगल',
                        3: 'बुध',
                        4: 'गुरु',
                        5: 'शुक्र',
                        6: 'शनि'
                    };

                    const dayName = hindiDays[dow];
                    const monthNum = dateObj.getMonth() + 1;

                    // ISO Week Number calculation
                    const getISOWeek = (date) => {
                        const d = new Date(date);
                        d.setHours(0, 0, 0, 0);
                        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
                        const yearStart = new Date(d.getFullYear(), 0, 1);
                        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
                    };

                    const weekNum = getISOWeek(dateObj);

                    const { error } = await supabase
                        .from('working_day_calender')
                        .insert([{
                            working_date: dateStr,
                            day: dayName,
                            week_num: weekNum,
                            month: monthNum
                        }]);
                    if (error) throw error;
                }
            }
            await fetchData();
        } catch (err) {
            console.error('Toggle error:', err);
            alert('Failed to update working day');
        } finally {
            setIsProcessing(false);
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

    // Function to convert English day names to Hindi
    const getDayInHindi = (englishDay) => {
        const dayMap = {
            'Sunday': 'रविवार',
            'Monday': 'सोमवार',
            'Tuesday': 'मंगलवार',
            'Wednesday': 'बुधवार',
            'Thursday': 'गुरुवार',
            'Friday': 'शुक्रवार',
            'Saturday': 'शनिवार'
        };
        const hindiDay = dayMap[englishDay] || englishDay;
        return `${hindiDay} (${englishDay})`;
    };

    // Get all days in the month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const allDaysInMonth = [];

    for (let i = 1; i <= daysInMonth; i++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dateObj = new Date(dateString);

        // Use robust matching to handle ISO strings or timestamps from Supabase
        const holiday = holidays.find(h => (h.holiday_date || "").split('T')[0] === dateString);
        const workingDay = workingDays.find(w => (w.working_date || "").split('T')[0] === dateString);

        const englishDayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });

        const taskCount = tasks.filter(tDate => tDate === dateString).length;

        allDaysInMonth.push({
            date: dateString,
            day: i,
            dayName: getDayInHindi(englishDayName),
            isHoliday: !!holiday,
            isWorking: !!workingDay,
            holidayName: holiday?.holiday_name,
            weekNum: workingDay?.week_num,
            taskCount
        });
    }

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-4 px-4 pb-10">
                {/* Header Section - Professional & Clean */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 py-6 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded text-white font-semibold shadow-sm">
                            <List size={22} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Working Days Management</h1>
                            <p className="text-sm text-gray-500 font-medium">
                                Configure operational availability and scheduled work days.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                        <div className="flex items-center bg-white border border-gray-300 rounded shadow-sm overflow-hidden text-sm w-full sm:w-auto">
                            <button onClick={prevMonth} className="p-2.5 hover:bg-gray-50 transition-colors border-r border-gray-300 text-gray-600">
                                <ChevronLeft size={18} strokeWidth={2.5} />
                            </button>
                            <div className="px-6 py-2.5 font-bold text-gray-800 min-w-[160px] text-center tracking-wide">
                                {monthName} {year}
                            </div>
                            <button onClick={nextMonth} className="p-2.5 hover:bg-gray-50 transition-colors border-l border-gray-300 text-gray-600">
                                <ChevronRight size={18} strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="flex gap-3 bg-gray-50 p-2 rounded-lg border border-gray-200 w-full sm:w-auto justify-center">
                            <LegendItem label="Working" color="bg-emerald-500" />
                            <LegendItem label="Holiday" color="bg-red-500" />
                            <LegendItem label="Off Day" color="bg-gray-300" />
                        </div>
                    </div>
                </div>

                {/* Days Table List - Classic & Readable */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                        <h2 className="text-base font-semibold text-gray-800">
                            Schedule for {monthName} {year}
                        </h2>
                        <span className="text-xs font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100 uppercase">
                            {workingDays.length} Working Days
                        </span>
                    </div>

                    <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                        <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                            <thead>
                                <tr className="bg-white border-b border-gray-200 sticky top-0 z-10">
                                    <th className="px-6 py-3 font-semibold text-gray-600 text-[10px] uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 font-semibold text-gray-600 text-[10px] uppercase tracking-wider">Day of Week</th>
                                    <th className="px-6 py-3 font-semibold text-gray-600 text-[10px] uppercase tracking-wider">Week No.</th>
                                    <th className="px-6 py-3 font-semibold text-gray-600 text-[10px] uppercase tracking-wider text-center">Tasks</th>
                                    <th className="px-6 py-3 font-semibold text-gray-600 text-[10px] uppercase tracking-wider">Operational Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-gray-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="animate-spin text-blue-500" size={24} />
                                                <span className="text-xs font-medium uppercase tracking-widest">Fetching Data...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : allDaysInMonth.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-gray-400">
                                            <span className="text-xs font-bold uppercase tracking-widest">No records available for this period</span>
                                        </td>
                                    </tr>
                                ) : (
                                    allDaysInMonth.map((dayInfo) => (
                                        <tr
                                            key={dayInfo.date}
                                            className={`transition-colors ${dayInfo.isHoliday ? 'bg-red-50/20' :
                                                dayInfo.isWorking ? 'bg-white hover:bg-gray-50' :
                                                    'bg-gray-50 text-gray-400'
                                                }`}
                                        >
                                            <td className="px-6 py-4">
                                                <div className={`font-semibold ${dayInfo.isWorking ? 'text-gray-900' : 'text-gray-500'}`}>
                                                    {new Date(dayInfo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium">
                                                {dayInfo.dayName}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-medium">
                                                {dayInfo.weekNum || '—'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {dayInfo.taskCount > 0 ? (
                                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white font-bold text-[10px] shadow-sm">
                                                        {dayInfo.taskCount}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300 text-[10px]">0</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {dayInfo.isHoliday ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded-full border border-red-200">
                                                        <ShieldAlert size={12} />
                                                        {dayInfo.holidayName}
                                                    </span>
                                                ) : dayInfo.isWorking ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                                                        <CheckCircle2 size={12} />
                                                        WORKING
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full border border-gray-300">
                                                        OFF DAY
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Info Card - Professional Tip */}
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                    <div className="p-1.5 bg-blue-100 rounded text-blue-600">
                        <ShieldAlert size={18} />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wide">Operational Guidelines</h3>
                        <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                            Working days represent scheduled availability. Off days will automatically restrict new task assignments for that date.
                            Holidays override manual working day configurations.
                        </p>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

const LegendItem = ({ label, color }) => (
    <div className="flex items-center gap-1.5 px-2 py-1">
        <div className={`w-2.5 h-2.5 ${color} rounded-sm shadow-sm`}></div>
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">{label}</span>
    </div>
);

export default WorkingDayCalendarPage;
