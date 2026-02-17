import { useRef, useEffect, useState } from "react";
import { Users, Phone, Calendar, FileText, CheckCircle, Clock, AlertCircle, ArrowUpRight, TrendingUp, UserCheck, PieChart, Play, Pause } from "lucide-react";
import supabase from "../../../../SupabaseClient";

const isAudioUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
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

export default function EAView() {
    const [eaTasks, setEATasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        completed: 0,
        overdue: 0,
        extended: 0,
        doersCount: 0
    });
    const [doerStats, setDoerStats] = useState([]);

    useEffect(() => {
        fetchEATasks();
    }, []);

    const fetchEATasks = async () => {
        try {
            setLoading(true);
            const userRole = localStorage.getItem('role');
            const username = localStorage.getItem('user-name');

            let query = supabase
                .from('ea_tasks')
                .select('*')
                .order('planned_date', { ascending: true });

            const { data, error } = await query;

            if (error) throw error;

            let tasks = data || [];

            // Filter for non-admin users
            if (userRole !== 'admin' && username) {
                tasks = tasks.filter(t =>
                    (t.doer_name && t.doer_name.toLowerCase() === username.toLowerCase()) ||
                    (t.given_by && t.given_by.toLowerCase() === username.toLowerCase())
                );
            }

            setEATasks(tasks);
            calculateStats(tasks);
        } catch (err) {
            console.error('Error fetching EA tasks:', err);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (tasks) => {
        const now = new Date();
        const total = tasks.length;
        const pending = tasks.filter(t => t.status === 'pending' || (t.status === 'done' && !t.admin_done)).length;
        const completed = tasks.filter(t => t.status === 'done' && t.admin_done).length;
        const extended = tasks.filter(t => t.status === 'extended').length;
        const overdue = tasks.filter(t => {
            const plannedDate = new Date(t.planned_date);
            return (t.status === 'pending' || t.status === 'extended') && plannedDate < now;
        }).length;

        // Calculate doer statistics
        const doerMap = {};
        tasks.forEach(t => {
            if (!doerMap[t.doer_name]) {
                doerMap[t.doer_name] = { total: 0, completed: 0, pending: 0 };
            }
            doerMap[t.doer_name].total++;
            if (t.status === 'done' && t.admin_done) doerMap[t.doer_name].completed++;
            else doerMap[t.doer_name].pending++;
        });

        const doerList = Object.entries(doerMap)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        setStats({ total, pending, completed, overdue, extended, doersCount: Object.keys(doerMap).length });
        setDoerStats(doerList);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getStatusStyles = (status, plannedDate, admin_done) => {
        const now = new Date();
        const isOverdue = (status === 'pending' || status === 'extended') && new Date(plannedDate) < now;

        if (isOverdue) return {
            bg: 'bg-red-50',
            text: 'text-red-700',
            border: 'border-red-100',
            label: 'Overdue'
        };

        switch (status) {
            case 'done':
                if (admin_done) {
                    return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', label: 'Approved' };
                } else {
                    return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100', label: 'Pending Approval' };
                }
            case 'extended':
                return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', label: 'Extended' };
            default:
                return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100', label: 'Pending' };
        }
    };

    const calculatePercentage = (value, total) => {
        if (!total) return 0;
        return Math.round((value / total) * 100);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <div className="text-center">
                    <div className="relative h-16 w-16 mx-auto">
                        <div className="absolute inset-0 rounded-full border-4 border-blue-50 border-t-blue-600 animate-spin"></div>
                    </div>
                    <p className="mt-4 text-gray-500 font-bold tracking-tight uppercase text-xs">Syncing EA Intelligence...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-500">
            {/* Visual Analytics Header */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Task Distribution (CSS Donut Chart) */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-6 self-start flex items-center gap-2">
                        <PieChart size={16} className="text-blue-600" />
                        Task Distribution
                    </h3>

                    <div className="relative w-40 h-40 mb-6 group cursor-default">
                        {/* Dynamic SVG Donut */}
                        <svg viewBox="0 0 36 36" className="w-full h-full transform transition-transform group-hover:scale-105 duration-300">
                            <circle cx="18" cy="18" r="16" fill="transparent" stroke="#f3f4f6" strokeWidth="4"></circle>
                            {/* Completed Segment */}
                            <circle
                                cx="18" cy="18" r="16" fill="transparent"
                                stroke="#10b981" strokeWidth="4"
                                strokeDasharray={`${calculatePercentage(stats.completed, stats.total)} 100`}
                                strokeDashoffset="0"
                                className="transition-all duration-1000"
                            ></circle>
                            {/* Pending Segment */}
                            <circle
                                cx="18" cy="18" r="16" fill="transparent"
                                stroke="#6366f1" strokeWidth="4"
                                strokeDasharray={`${calculatePercentage(stats.pending, stats.total)} 100`}
                                strokeDashoffset={`-${calculatePercentage(stats.completed, stats.total)}`}
                                className="transition-all duration-1000"
                            ></circle>
                            {/* Extended Segment */}
                            <circle
                                cx="18" cy="18" r="16" fill="transparent"
                                stroke="#f59e0b" strokeWidth="4"
                                strokeDasharray={`${calculatePercentage(stats.extended, stats.total)} 100`}
                                strokeDashoffset={`-${calculatePercentage(stats.completed + stats.pending, stats.total)}`}
                                className="transition-all duration-1000"
                            ></circle>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-gray-800">{stats.total}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Tasks</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-2 gap-x-4 md:gap-x-8 gap-y-3 w-full mt-auto">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Done</span>
                            <span className="ml-auto text-[10px] font-black text-gray-700">{calculatePercentage(stats.completed, stats.total)}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Pending</span>
                            <span className="ml-auto text-[10px] font-black text-gray-700">{calculatePercentage(stats.pending, stats.total)}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Extd</span>
                            <span className="ml-auto text-[10px] font-black text-gray-700">{calculatePercentage(stats.extended, stats.total)}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-500">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></div>
                            <span className="text-[10px] font-bold uppercase">Overdue</span>
                            <span className="ml-auto text-[10px] font-black">{stats.overdue}</span>
                        </div>
                    </div>
                </div>

                {/* Performance Visuals / Doer Leaderboard */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <TrendingUp size={16} className="text-indigo-600" />
                            Top Performing Doers
                        </div>
                        <span className="text-[10px] text-gray-400 font-bold bg-gray-50 px-2 py-1 rounded">Total Active: {stats.doersCount}</span>
                    </h3>

                    <div className="space-y-5 flex-1 flex flex-col justify-center">
                        {doerStats.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 italic">No doer data available</div>
                        ) : (
                            doerStats.map((doer, idx) => (
                                <div key={idx} className="group">
                                    <div className="flex justify-between items-center mb-1.5 px-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-black uppercase border border-blue-100">
                                                {doer.name.slice(0, 2)}
                                            </div>
                                            <span className="text-xs font-bold text-gray-700 group-hover:text-blue-700 transition-colors uppercase truncate max-w-[120px]">{doer.name}</span>
                                        </div>
                                        <div className="text-[10px] font-black tracking-tighter">
                                            <span className="text-emerald-500">{doer.completed}</span>
                                            <span className="text-gray-300 mx-1">/</span>
                                            <span className="text-gray-700">{doer.total} Tasks</span>
                                        </div>
                                    </div>
                                    <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-[1px]">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(79,70,229,0.3)]"
                                            style={{ width: `${calculatePercentage(doer.completed, doer.total)}%`, transitionDelay: `${idx * 100}ms` }}
                                        ></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <button className="mt-6 text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1 hover:gap-2 transition-all self-end">
                        View Detailed Analytics <ArrowUpRight size={12} />
                    </button>
                </div>
            </div>

            {/* Premium Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Syncs', value: stats.total, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Active Queue', value: stats.pending, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Done Properly', value: stats.completed, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Critical Delay', value: stats.overdue, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                                <p className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
                            </div>
                            <div className={`p-2 ${stat.bg} ${stat.color} rounded-lg group-hover:scale-110 transition-transform`}>
                                <stat.icon size={18} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Task Console */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
                        <Users size={14} className="text-indigo-600" />
                        Executive Intelligence Console
                    </h3>
                    <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse delay-75"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse delay-150"></div>
                    </div>
                </div>

                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left min-w-[700px]">
                        <thead>
                            <tr className="bg-gray-50/30">
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Mobile</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Target Task</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Remarks Data</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {eaTasks.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-bold uppercase text-xs">
                                        No intelligence data found in the console
                                    </td>
                                </tr>
                            ) : (
                                eaTasks.slice(0, 8).map((task) => {
                                    const styles = getStatusStyles(task.status, task.planned_date, task.admin_done);
                                    return (
                                        <tr key={task.id} className="hover:bg-gray-50/50 group transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-600 text-[10px] uppercase border border-gray-200 shadow-sm group-hover:bg-white transition-colors">
                                                        {task.doer_name.slice(0, 2)}
                                                    </div>
                                                    <div className="text-xs font-black text-gray-800 uppercase leading-none">{task.doer_name}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-[10px] text-gray-600 font-bold flex items-center gap-1">
                                                    <Phone size={10} className="text-indigo-400" /> {task.phone_number || 'HIDDEN'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="max-w-xs group-hover:max-w-md transition-all duration-300">
                                                    {isAudioUrl(task.task_description) ? (
                                                        <AudioPlayer url={task.task_description} />
                                                    ) : (
                                                        <p className="text-xs font-medium text-gray-600 line-clamp-2 leading-relaxed italic border-l-2 border-indigo-100 pl-3">
                                                            "{task.task_description}"
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={12} className="text-indigo-400" />
                                                    <span className={`text-[11px] font-black uppercase tracking-tight ${styles.label === 'Overdue' ? 'text-rose-600 animate-pulse' : 'text-gray-600'}`}>
                                                        {formatDate(task.planned_date)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs text-gray-600 font-medium">
                                                    {task.remarks || '—'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${styles.bg} ${styles.text} ${styles.border} shadow-sm group-hover:shadow transition-all`}>
                                                    {styles.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {eaTasks.length > 8 && (
                    <div className="px-6 py-4 bg-gray-50/30 border-t border-gray-100">
                        <button className="w-full py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm">
                            Access Full Intelligence Archive ({eaTasks.length - 8} more)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
