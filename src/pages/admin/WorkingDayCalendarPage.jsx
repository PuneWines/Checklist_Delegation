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

    useEffect(() => {
        fetchData();
    }, [currentDate]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString().split('T')[0];

            const [holidaysRes, workingDaysRes] = await Promise.all([
                supabase.from('holidays').select('*'),
                supabase.from('working_day_calender')
                    .select('*')
                    .gte('working_date', startOfMonth)
                    .lte('working_date', endOfMonth)
                    .order('working_date', { ascending: true })
            ]);

            if (holidaysRes.error && holidaysRes.error.code !== '42P01') throw holidaysRes.error;
            if (workingDaysRes.error && workingDaysRes.error.code !== '42P01') throw workingDaysRes.error;

            setHolidays(holidaysRes.data || []);
            setWorkingDays(workingDaysRes.data || []);
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
                const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });
                const monthNum = dateObj.getMonth() + 1;

                const firstDayOfYear = new Date(dateObj.getFullYear(), 0, 1);
                const pastDaysOfYear = (dateObj - firstDayOfYear) / 86400000;
                const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);

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
        const holiday = holidays.find(h => h.holiday_date === dateString);
        const workingDay = workingDays.find(w => w.working_date === dateString);
        const englishDayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });

        allDaysInMonth.push({
            date: dateString,
            day: i,
            dayName: getDayInHindi(englishDayName),
            isHoliday: !!holiday,
            isWorking: !!workingDay,
            holidayName: holiday?.holiday_name,
            weekNum: workingDay?.week_num
        });
    }

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-4">
                {/* Header Section */}
                <div className="bg-white border-b border-gray-200 pb-5 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-700 rounded text-white font-bold">
                            <List size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 leading-tight tracking-tight uppercase">Working Days List</h1>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Manage Operational Availability
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center border border-gray-300 rounded shadow-sm overflow-hidden text-sm">
                        <button onClick={prevMonth} className="p-2 bg-gray-50 hover:bg-gray-100 transition-colors border-r border-gray-300 text-gray-700">
                            <ChevronLeft size={16} strokeWidth={3} />
                        </button>
                        <div className="px-6 py-2 bg-white font-bold text-gray-900 min-w-[180px] text-center uppercase tracking-widest">
                            {monthName} {year}
                        </div>
                        <button onClick={nextMonth} className="p-2 bg-gray-50 hover:bg-gray-100 transition-colors border-l border-gray-300 text-gray-700">
                            <ChevronRight size={16} strokeWidth={3} />
                        </button>
                    </div>

                    <div className="flex gap-4">
                        <LegendItem label="Working" color="bg-green-50 border border-green-200" />
                        <LegendItem label="Holiday" color="bg-red-50 border border-red-200" />
                        <LegendItem label="Off Day" color="bg-gray-100 border border-gray-300" />
                    </div>
                </div>

                {/* Working Days List */}
                <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <h2 className="text-sm font-bold text-gray-700 uppercase">
                            Days in {monthName} {year} ({workingDays.length} Working Days)
                        </h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-gray-100 border-b border-gray-200">
                                    <th className="px-4 py-3 font-bold text-gray-600 text-xs uppercase">Date</th>
                                    <th className="px-4 py-3 font-bold text-gray-600 text-xs uppercase">Day</th>
                                    <th className="px-4 py-3 font-bold text-gray-600 text-xs uppercase">Week #</th>
                                    <th className="px-4 py-3 font-bold text-gray-600 text-xs uppercase">Status</th>
                                    <th className="px-4 py-3 font-bold text-gray-600 text-xs uppercase text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-10 text-center text-gray-400 italic">
                                            <Loader2 className="inline animate-spin mr-2" size={16} />
                                            Loading data...
                                        </td>
                                    </tr>
                                ) : allDaysInMonth.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-10 text-center text-gray-400 font-bold">
                                            NO RECORDS FOUND
                                        </td>
                                    </tr>
                                ) : (
                                    allDaysInMonth.map((dayInfo) => (
                                        <tr
                                            key={dayInfo.date}
                                            className={`hover:bg-gray-50 transition-colors ${dayInfo.isHoliday ? 'bg-red-50/30' :
                                                dayInfo.isWorking ? 'bg-green-50/20' :
                                                    'bg-gray-50/30'
                                                }`}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-gray-900">
                                                    {new Date(dayInfo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-700">
                                                {dayInfo.dayName}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-700">
                                                {dayInfo.weekNum || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {dayInfo.isHoliday ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded">
                                                        <ShieldAlert size={12} />
                                                        {dayInfo.holidayName}
                                                    </span>
                                                ) : dayInfo.isWorking ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">
                                                        <CheckCircle2 size={12} />
                                                        Working Day
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded">
                                                        Off Day
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {!dayInfo.isHoliday && (
                                                    <button
                                                        onClick={() => toggleWorkingDay(dayInfo.date, dayInfo.isWorking, dayInfo.isHoliday)}
                                                        disabled={isProcessing}
                                                        className={`px-3 py-1.5 text-xs font-bold rounded transition-colors flex items-center gap-1 ml-auto ${dayInfo.isWorking
                                                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                            } disabled:opacity-50`}
                                                    >
                                                        {dayInfo.isWorking ? (
                                                            <>
                                                                <Trash2 size={12} />
                                                                Remove
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Plus size={12} />
                                                                Add
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Legend/Info Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded flex items-start gap-4 shadow-sm">
                        <div className="p-2 bg-white border border-gray-200 rounded text-green-600">
                            <CheckCircle2 size={18} />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-900 uppercase mb-1">Interactive Management</h3>
                            <p className="text-[10px] font-medium text-gray-500 leading-relaxed uppercase">
                                Click Add/Remove buttons to toggle between Working Day and Off Day.
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded flex items-start gap-4 shadow-sm">
                        <div className="p-2 bg-white border border-gray-200 rounded text-red-600">
                            <ShieldAlert size={18} />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-900 uppercase mb-1">Holiday Lock</h3>
                            <p className="text-[10px] font-medium text-gray-500 leading-relaxed uppercase">
                                Holidays are managed via the Holiday List. They cannot be toggled here to prevent scheduling conflicts.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

const LegendItem = ({ label, color }) => (
    <div className="flex items-center gap-2">
        <div className={`w-3.5 h-3.5 ${color} rounded-sm`}></div>
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter">{label}</span>
    </div>
);

export default WorkingDayCalendarPage;
