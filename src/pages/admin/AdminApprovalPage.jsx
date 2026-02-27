import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useDispatch } from "react-redux";
import AdminLayout from "../../components/layout/AdminLayout";
import { fetchPendingApprovals, updateDelegationDoneStatus, rejectDelegationTask, fetchDelegationHistory } from "../../redux/api/delegationApi";
import { fetchPendingMaintenanceApprovals, approveMaintenanceTask, rejectMaintenanceTask, fetchApprovedMaintenance } from "../../redux/api/maintenanceApi";
import { fetchPendingRepairApprovals, approveRepairTask, rejectRepairTask, fetchApprovedRepairs } from "../../redux/api/repairApi";
import { fetchPendingEAApprovals, approveEATaskV2, rejectEATask, fetchApprovedEA } from "../../redux/api/eaApi";
import { fetchPendingChecklistApprovals, approveChecklistTask, rejectChecklistTask, fetchChecklistHistory } from "../../redux/api/quickTaskApi";
import { CheckCircle2, Search, Play, Pause, AlertCircle, BookCheck, Wrench, Hammer, Briefcase, XCircle, History, Clock } from "lucide-react";
import { sendTaskRejectionNotification } from "../../services/whatsappService";
import AudioPlayer from "../../components/AudioPlayer";
import { useMagicToast } from "../../context/MagicToastContext";

// Helper to extract audio URL from text
const extractAudioUrl = (text) => {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|wav|ogg|webm|m4a|aac)(\?.*)?)/i) ||
        text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*)/i);
    return match ? match[0] : null;
};

export default function AdminApprovalPage() {
    const { showToast } = useMagicToast();
    const [activeTab, setActiveTab] = useState("checklist");
    const [viewMode, setViewMode] = useState("pending"); // 'pending' or 'history'
    const [pendingTasks, setPendingTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const dispatch = useDispatch();

    const loadTasks = useCallback(async () => {
        setLoading(true);
        setPendingTasks([]);
        let data = [];
        try {
            if (viewMode === "pending") {
                if (activeTab === "delegation") data = await fetchPendingApprovals();
                else if (activeTab === "maintenance") data = await fetchPendingMaintenanceApprovals();
                else if (activeTab === "repair") data = await fetchPendingRepairApprovals();
                else if (activeTab === "ea") data = await fetchPendingEAApprovals();
                else if (activeTab === "checklist") data = await fetchPendingChecklistApprovals();
            } else {
                // History Mode
                if (activeTab === "delegation") data = await fetchDelegationHistory();
                else if (activeTab === "maintenance") data = await fetchApprovedMaintenance();
                else if (activeTab === "repair") data = await fetchApprovedRepairs();
                else if (activeTab === "ea") data = await fetchApprovedEA();
                else if (activeTab === "checklist") data = await fetchChecklistHistory();
            }
        } catch (error) {
            console.error("Error loading tasks:", error);
        }
        setPendingTasks(data || []);
        setLoading(false);
    }, [activeTab, viewMode]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    const handleApprove = async (task) => {
        setProcessingId(task.id);
        if (!task.id) {
            console.error("Task ID is missing!", task);
            showToast("Failed to approve task: Task ID is missing", "error");
            setProcessingId(null);
            return;
        }

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
                await approveEATaskV2(task.id, task.done_id);
            } else if (activeTab === "checklist") {
                await approveChecklistTask(task.id);
            }

            // Remove from list
            setPendingTasks(prev => prev.filter(t => t.id !== task.id));
            showToast("Task approved successfully!", "success");
        } catch (error) {
            console.error("Detailed error in handleApprove:", error);
            showToast("Failed to approve task: " + (error.message || "Unknown error"), "error");
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (task) => {
        const reason = window.prompt("Enter rejection reason (User will be notified via WhatsApp):");
        if (reason === null) return; // Cancelled
        if (!reason.trim()) {
            showToast("Rejection reason is required.", "error");
            return;
        }

        setProcessingId(task.id);
        try {
            if (activeTab === "delegation") {
                await rejectDelegationTask(task.id, task.task_id, reason);
            } else if (activeTab === "maintenance") {
                await rejectMaintenanceTask(task.id, reason);
            } else if (activeTab === "repair") {
                await rejectRepairTask(task.id, reason);
            } else if (activeTab === "ea") {
                await rejectEATask(task.id, task.done_id, reason);
            } else if (activeTab === "checklist") {
                await rejectChecklistTask(task.id, reason);
            }

            // Send notification
            await sendTaskRejectionNotification({
                doerName: task.doer_name || task.name || task.filled_by,
                taskId: task.id, // Or visible task ID
                description: task.task_description || task.issue_description,
                taskType: activeTab,
                reason: reason
            });

            // Remove from list
            setPendingTasks(prev => prev.filter(t => t.id !== task.id));
            showToast("Task rejected successfully!", "success");
        } catch (error) {
            console.error("Error rejecting task:", error);
            showToast("Failed to reject task: " + (error.message || "Unknown error"), "error");
        } finally {
            setProcessingId(null);
        }
    };

    const filteredTasks = pendingTasks.filter(task => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            task.doer_name?.toLowerCase().includes(term) ||
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
            <div className="space-y-4 sm:space-y-6">
                {/* Sticky Header and Controls */}
                <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl -mx-4 px-4 sm:mx-0 sm:px-0 py-6 mb-6 border-b border-gray-100/50 shadow-sm transition-all duration-300">
                    <div className="max-w-7xl mx-auto space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-2 sm:px-0">
                            <div className="space-y-1">
                                <motion.div
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="flex items-center gap-4"
                                >
                                    <div className="w-1.5 h-8 bg-purple-600 rounded-full hidden sm:block" />
                                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                                        Admin <span className="text-purple-600">Approval</span>
                                    </h1>
                                </motion.div>
                                <p className="text-sm font-medium text-gray-400 ml-0 sm:ml-5 flex items-center gap-2">
                                    <Clock size={14} className="text-gray-300" />
                                    Review and manage user task submissions
                                </p>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="px-4 py-2 bg-purple-50 rounded-xl border border-purple-100 flex items-center gap-2.5">
                                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                    <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                                        {pendingTasks.length} Pending
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/40 backdrop-blur-md rounded-2xl p-2 sm:p-3 border border-gray-100/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Tabs */}
                            <div className="flex bg-gray-100/80 p-1 rounded-xl border border-gray-200/30 relative overflow-x-auto no-scrollbar max-w-max">
                                {[
                                    { id: 'checklist', label: 'Checklist', icon: BookCheck, color: 'bg-purple-600' },
                                    { id: 'delegation', label: 'Delegation', icon: BookCheck, color: 'bg-indigo-600' },
                                    { id: 'maintenance', label: 'Maintenance', icon: Wrench, color: 'bg-blue-600' },
                                    { id: 'repair', label: 'Repair', icon: Hammer, color: 'bg-amber-600' },
                                    { id: 'ea', label: 'EA Tasks', icon: Briefcase, color: 'bg-emerald-600' },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            relative flex items-center justify-center gap-2 py-2 px-6 rounded-lg text-xs font-bold transition-all duration-500 whitespace-nowrap min-w-[110px] z-10
                                            ${activeTab === tab.id ? 'text-white' : 'text-gray-500 hover:text-purple-600'}
                                        `}
                                    >
                                        {activeTab === tab.id && (
                                            <motion.div
                                                layoutId="approvalTabPillMinimal"
                                                className={`absolute inset-0 rounded-lg shadow-md z-[-1] ${tab.color}`}
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        <tab.icon size={15} />
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* View Mode & Search */}
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200 shrink-0 w-full sm:w-auto">
                                    <button
                                        onClick={() => setViewMode("pending")}
                                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${viewMode === "pending"
                                            ? "bg-white text-gray-800 shadow-sm"
                                            : "text-gray-500 hover:text-gray-700"
                                            }`}
                                    >
                                        <Clock size={14} />
                                        Pending
                                    </button>
                                    <button
                                        onClick={() => setViewMode("history")}
                                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${viewMode === "history"
                                            ? "bg-white text-gray-800 shadow-sm"
                                            : "text-gray-500 hover:text-gray-700"
                                            }`}
                                    >
                                        <History size={14} />
                                        History
                                    </button>
                                </div>
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search records..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-medium shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
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
                                        <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-bold text-gray-900">{task.doer_name || task.name || task.filled_by}</div>
                                                <div className="text-[10px] text-gray-500 font-medium uppercase tracking-tight">By: {task.given_by || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 max-w-xs break-words">
                                                    {(() => {
                                                        const desc = task.task_description || task.issue_description;
                                                        const audioUrl = task.audio_url || extractAudioUrl(desc);

                                                        let cleanText = desc || '';
                                                        if (audioUrl && desc && typeof desc === 'string' && desc.includes(audioUrl)) {
                                                            cleanText = desc.replace(audioUrl, '').replace(/Voice Note Link:?\s*/i, '').replace(/Voice Note:?\s*/i, '').trim();
                                                        }

                                                        if (!cleanText && !audioUrl) return <span className="text-gray-400 italic">No description</span>;

                                                        return (
                                                            <div className="space-y-2">
                                                                {audioUrl && <AudioPlayer url={audioUrl} />}
                                                                {cleanText && (
                                                                    <div className="whitespace-pre-wrap leading-relaxed">{cleanText}</div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                {(task.machine_name || task.part_name) && (
                                                    <div className="text-[10px] text-indigo-600 font-bold mt-1.5 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded inline-block">
                                                        Machine: {task.machine_name} {task.part_name ? `(${task.part_name})` : ''}
                                                    </div>
                                                )}
                                                {task.reason && (
                                                    <div className="text-xs text-amber-600 mt-1 font-medium bg-amber-50 px-2 py-0.5 rounded">
                                                        Note: {task.reason}
                                                    </div>
                                                )}
                                                {(task.remarks || task.remark) && (
                                                    <div className="text-xs text-gray-500 mt-1 italic">
                                                        Remark: {task.remarks || task.remark}
                                                    </div>
                                                )}
                                                {task.status && (
                                                    <div className="text-[10px] font-bold text-blue-600 mt-2 uppercase bg-blue-50 px-2 py-0.5 rounded-sm inline-block tracking-widest">
                                                        Status: {task.status}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">{task.department || '-'}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-medium">
                                                {formatDate(task.created_at || task.submission_timestamp || task.submission_date)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {task.image_url || task.uploaded_image_url || task.work_photo_url ? (
                                                    <a
                                                        href={task.image_url || task.uploaded_image_url || task.work_photo_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm shadow-blue-100 inline-flex items-center gap-1.5"
                                                    >
                                                        View Proof
                                                    </a>
                                                ) : <span className="text-gray-300 text-xs italic">No Proof</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                {viewMode === 'pending' ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleApprove(task)}
                                                            disabled={processingId === task.id}
                                                            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all shadow-md shadow-green-100 text-xs font-bold border-none"
                                                        >
                                                            {processingId === task.id ? (
                                                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                            ) : (
                                                                <CheckCircle2 size={14} />
                                                            )}
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(task)}
                                                            disabled={processingId === task.id}
                                                            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-all text-xs font-bold"
                                                        >
                                                            <XCircle size={14} />
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    task.rejection_reason ? (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-800" title={task.rejection_reason}>
                                                            Rejected
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-800">
                                                            Approved
                                                        </span>
                                                    )
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-gray-100">
                        {loading ? (
                            <div className="p-10 text-center text-gray-500">
                                <div className="flex justify-center mb-2">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                </div>
                                <p className="text-sm font-medium">Loading tasks...</p>
                            </div>
                        ) : filteredTasks.length === 0 ? (
                            <div className="p-10 text-center text-gray-500 bg-gray-50/50">
                                <BookCheck size={40} className="mx-auto text-gray-200 mb-3" />
                                <p className="text-sm font-medium">No tasks found</p>
                            </div>
                        ) : (
                            filteredTasks.map((task) => (
                                <div key={`card-${task.id}`} className="p-4 space-y-4 hover:bg-blue-50/30 transition-colors">
                                    {/* Card Header: User & Info */}
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-gray-900">{task.doer_name || task.name || task.filled_by}</p>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
                                                <Clock size={10} /> {formatDate(task.created_at || task.submission_timestamp || task.submission_date)}
                                            </p>
                                        </div>
                                        <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                            {task.department || 'No Dept'}
                                        </span>
                                    </div>

                                    {/* Task Content */}
                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                                        {(() => {
                                            const desc = task.task_description || task.issue_description;
                                            const audioUrl = task.audio_url || extractAudioUrl(desc);

                                            let cleanText = desc || '';
                                            if (audioUrl && desc && typeof desc === 'string' && desc.includes(audioUrl)) {
                                                cleanText = desc.replace(audioUrl, '').replace(/Voice Note Link:?\s*/i, '').replace(/Voice Note:?\s*/i, '').trim();
                                            }

                                            if (!cleanText && !audioUrl) return <p className="text-xs text-gray-400 italic">No description</p>;

                                            return (
                                                <div className="space-y-2">
                                                    {audioUrl && <AudioPlayer url={audioUrl} />}
                                                    {cleanText && (
                                                        <p className="text-xs text-gray-800 leading-normal font-medium">{cleanText}</p>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {(task.machine_name || task.part_name) && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                                                    Machine: {task.machine_name}
                                                </span>
                                                {task.part_name && (
                                                    <span className="text-[9px] font-black text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded uppercase">
                                                        Part: {task.part_name}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* proof & Metadata */}
                                    <div className="flex items-center justify-between text-[10px] font-bold">
                                        <div className="text-gray-400 uppercase tracking-widest">
                                            Given By: <span className="text-gray-600">{task.given_by || '-'}</span>
                                        </div>
                                        {task.image_url || task.uploaded_image_url || task.work_photo_url ? (
                                            <a
                                                href={task.image_url || task.uploaded_image_url || task.work_photo_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 flex items-center gap-1 underline"
                                            >
                                                View Proof
                                            </a>
                                        ) : <span className="text-gray-300 font-normal italic">No Proof</span>}
                                    </div>

                                    {/* Actions */}
                                    <div className="pt-2">
                                        {viewMode === 'pending' ? (
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={() => handleApprove(task)}
                                                    disabled={processingId === task.id}
                                                    className="flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl text-xs font-black shadow-lg shadow-green-100 disabled:opacity-50 active:scale-95 transition-all"
                                                >
                                                    {processingId === task.id ? (
                                                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                    ) : (
                                                        <CheckCircle2 size={16} />
                                                    )}
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => handleReject(task)}
                                                    disabled={processingId === task.id}
                                                    className="flex items-center justify-center gap-2 py-2.5 bg-red-100 text-red-600 rounded-xl text-xs font-black active:scale-95 transition-all"
                                                >
                                                    <XCircle size={16} />
                                                    Reject
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                {task.rejection_reason ? (
                                                    <span className="block w-full py-1.5 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest rounded-lg">Rejected: {task.rejection_reason}</span>
                                                ) : (
                                                    <span className="block w-full py-1.5 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded-lg">Approved ✅</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
