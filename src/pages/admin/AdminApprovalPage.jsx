import { useState, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import AdminLayout from "../../components/layout/AdminLayout";
import { fetchPendingApprovals, updateDelegationDoneStatus } from "../../redux/api/delegationApi";
import { fetchPendingMaintenanceApprovals, approveMaintenanceTask } from "../../redux/api/maintenanceApi";
import { fetchPendingRepairApprovals, approveRepairTask } from "../../redux/api/repairApi";
import { fetchPendingEAApprovals, approveEATask } from "../../redux/api/eaApi";
import { fetchPendingChecklistApprovals, approveChecklistTask } from "../../redux/api/quickTaskApi";
import { CheckCircle2, Search, Play, Pause, AlertCircle, BookCheck, Wrench, Hammer, Briefcase } from "lucide-react";

// Helper to extract audio URL from text
const extractAudioUrl = (text) => {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|wav|ogg|webm|m4a|aac)(\?.*)?)/i) ||
        text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*)/i);
    return match ? match[0] : null;
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
                <audio ref={audioRef} src={url} className="hidden" />
            </div>
        </div>
    );
};

export default function AdminApprovalPage() {
    const [activeTab, setActiveTab] = useState("delegation");
    const [pendingTasks, setPendingTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const dispatch = useDispatch();

    const loadPendingTasks = async () => {
        setLoading(true);
        setPendingTasks([]);
        let data = [];
        try {
            if (activeTab === "delegation") {
                data = await fetchPendingApprovals();
            } else if (activeTab === "maintenance") {
                data = await fetchPendingMaintenanceApprovals();
            } else if (activeTab === "repair") {
                data = await fetchPendingRepairApprovals();
            } else if (activeTab === "ea") {
                data = await fetchPendingEAApprovals();
            } else if (activeTab === "checklist") {
                data = await fetchPendingChecklistApprovals();
            }
        } catch (error) {
            console.error("Error loading tasks:", error);
        }
        setPendingTasks(data || []);
        setLoading(false);
    };

    useEffect(() => {
        loadPendingTasks();
    }, [activeTab]);

    const handleApprove = async (task) => {
        setProcessingId(task.id);
        try {
            if (activeTab === "delegation") {
                await dispatch(updateDelegationDoneStatus({
                    id: task.id,
                    status: 'done',
                    taskId: task.task_id
                })).unwrap();
            } else if (activeTab === "maintenance") {
                await approveMaintenanceTask(task.id);
            } else if (activeTab === "repair") {
                await approveRepairTask(task.id);
            } else if (activeTab === "ea") {
                await approveEATask(task.id);
            } else if (activeTab === "checklist") {
                await approveChecklistTask(task.id);
            }

            // Remove from list
            setPendingTasks(prev => prev.filter(t => t.id !== task.id));
        } catch (error) {
            console.error("Failed to approve task:", error);
            alert("Failed to approve task");
        } finally {
            setProcessingId(null);
        }
    };

    const filteredTasks = pendingTasks.filter(task => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            task.name?.toLowerCase().includes(term) ||
            task.task_description?.toLowerCase().includes(term) ||
            task.given_by?.toLowerCase().includes(term) ||
            task.machine_name?.toLowerCase().includes(term) ||
            task.issue_description?.toLowerCase().includes(term)
        );
    });

    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        try {
            return new Date(dateStr).toLocaleString();
        } catch {
            return dateStr;
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-4">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <AlertCircle className="text-amber-500" />
                        Admin Approval
                    </h1>
                    <p className="text-gray-600">Review pending task completions submitted by users.</p>

                    {/* Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        <button
                            onClick={() => setActiveTab("delegation")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "delegation"
                                ? "bg-purple-100 text-purple-700 border border-purple-200"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <BookCheck size={16} />
                            Delegation
                        </button>
                        <button
                            onClick={() => setActiveTab("maintenance")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "maintenance"
                                ? "bg-blue-100 text-blue-700 border border-blue-200"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <Wrench size={16} />
                            Maintenance
                        </button>
                        <button
                            onClick={() => setActiveTab("repair")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "repair"
                                ? "bg-amber-100 text-amber-700 border border-amber-200"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <Hammer size={16} />
                            Repair
                        </button>
                        <button
                            onClick={() => setActiveTab("ea")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "ea"
                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <Briefcase size={16} />
                            EA
                        </button>
                        <button
                            onClick={() => setActiveTab("checklist")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "checklist"
                                ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <BookCheck size={16} />
                            Checklist
                        </button>
                    </div>

                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {activeTab === "delegation" || activeTab === "ea" || activeTab === "checklist" ? "Task Description" :
                                            activeTab === "maintenance" ? "Task/Machine" : "Issue/Machine"}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submission Time</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proof</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                            <div className="flex justify-center mb-2">
                                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                            </div>
                                            Loading...
                                        </td>
                                    </tr>
                                ) : filteredTasks.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                            No pending approvals found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTasks.map((task) => (
                                        <tr key={task.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{task.name || task.filled_by || task.doer_name}</div>
                                                <div className="text-xs text-gray-500">By: {task.given_by || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 max-w-xs break-words space-y-2">
                                                    {(() => {
                                                        const desc = task.task_description || task.issue_description;
                                                        if (!desc) return '-';

                                                        const audioUrl = extractAudioUrl(desc);

                                                        return (
                                                            <>
                                                                {audioUrl && <AudioPlayer url={audioUrl} />}
                                                                {/* Show text if it exists and is not just the URL itself */}
                                                                {(!audioUrl || desc.replace(audioUrl, '').trim().replace(/Voice Note Link:?\s*/i, '').length > 0) && (
                                                                    <div className="whitespace-pre-wrap">{desc}</div>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                {(task.machine_name || task.part_name) && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Machine: {task.machine_name} {task.part_name ? `(${task.part_name})` : ''}
                                                    </div>
                                                )}
                                                {task.reason && (
                                                    <div className="text-xs text-gray-500 mt-1 italic">
                                                        Note: {task.reason}
                                                    </div>
                                                )}
                                                {(task.remarks || task.remark) && (
                                                    <div className="text-xs text-gray-500 mt-1 italic">
                                                        Remark: {task.remarks || task.remark}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {task.department || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {formatDate(task.created_at || task.submission_timestamp || task.submission_date)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {task.image_url || task.uploaded_image_url || task.work_photo_url ? (
                                                    <a
                                                        href={task.image_url || task.uploaded_image_url || task.work_photo_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:underline flex items-center gap-1"
                                                    >
                                                        View Image
                                                    </a>
                                                ) : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <button
                                                    onClick={() => handleApprove(task)}
                                                    disabled={processingId === task.id}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                                                >
                                                    {processingId === task.id ? (
                                                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                    ) : (
                                                        <CheckCircle2 size={16} />
                                                    )}
                                                    Approve
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
