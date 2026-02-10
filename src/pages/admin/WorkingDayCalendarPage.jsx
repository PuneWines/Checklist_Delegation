import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
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

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = currentDate.toLocaleString('default', { month: 'long' });

    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    const dayCells = [];
    for (let i = 0; i < startDay; i++) {
        dayCells.push(<div key={`empty-${i}`} className="aspect-square bg-gray-50 border-r border-b border-gray-200"></div>);
    }

    for (let i = 1; i <= totalDays; i++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const holiday = holidays.find(h => h.holiday_date === dateString);
        const workingDay = workingDays.find(w => w.working_date === dateString);
        const isHoliday = !!holiday;
        const isWorking = !!workingDay;
        const isToday = new Date().toISOString().split('T')[0] === dateString;

        dayCells.push(
            <div
                key={i}
                onClick={() => toggleWorkingDay(dateString, isWorking, isHoliday)}
                className={`aspect-square border-r border-b border-gray-200 p-2 relative cursor-pointer transition-colors ${isHoliday ? 'bg-red-50' :
                    isWorking ? 'bg-white hover:bg-green-50/50' :
                        'bg-gray-100 hover:bg-gray-200'
                    }`}
            >
                <div className="flex justify-between items-start">
                    <span className={`text-xs font-bold ${isHoliday ? 'text-red-700 underline' :
                        isToday ? 'text-blue-700' :
                            'text-gray-700'
                        }`}>
                        {i}
                    </span>
                    {isToday && (
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                    )}
                </div>

                <div className="mt-2 text-center">
                    {isHoliday ? (
                        <p className="text-[9px] font-bold text-red-800 uppercase leading-tight truncate px-1">
                            {holiday.holiday_name}
                        </p>
                    ) : (
                        <p className={`text-[8px] font-bold uppercase tracking-widest ${isWorking ? 'text-green-600' : 'text-gray-400'}`}>
                            {isWorking ? 'Working' : 'Off Day'}
                        </p>
                    )}
                </div>

                {isProcessing && (
                    <div className="absolute inset-0 bg-white/40 flex items-center justify-center">
                        <Loader2 size={12} className="animate-spin text-blue-600" />
                    </div>
                )}
            </div>
        );
    }

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-4">
                {/* Header Section */}
                <div className="bg-white border-b border-gray-200 pb-5 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-700 rounded text-white font-bold">
                            <CalendarIcon size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 leading-tight tracking-tight uppercase">Working Day Calendar</h1>
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
                        <LegendItem label="Working" color="bg-white border border-gray-200" />
                        <LegendItem label="Holiday" color="bg-red-50 border border-red-200" />
                        <LegendItem label="Off Day" color="bg-gray-100 border border-gray-300" />
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
                    <div className="grid grid-cols-7 bg-gray-100 border-b border-gray-200">
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                            <div key={day} className="py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-200 last:border-0">
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
                        {dayCells}
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
                                Click any day to toggle between a Working Day and an Off Day.
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
