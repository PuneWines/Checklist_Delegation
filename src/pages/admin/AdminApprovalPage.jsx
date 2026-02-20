import { useState, useEffect, useRef } from "react";
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

// Helper to extract audio URL from text
const extractAudioUrl = (text) => {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|wav|ogg|webm|m4a|aac)(\?.*)?)/i) ||
        text.match(/(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*)/i);
    return match ? match[0] : null;
};

export default function AdminApprovalPage() {
    const [activeTab, setActiveTab] = useState("delegation");
    const [viewMode, setViewMode] = useState("pending"); // 'pending' or 'history'
    const [pendingTasks, setPendingTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const dispatch = useDispatch();

    const loadTasks = async () => {
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
    };

    useEffect(() => {
        loadTasks();
    }, [activeTab, viewMode]);

    const handleApprove = async (task) => {
        setProcessingId(task.id);
        if (!task.id) {
            console.error("Task ID is missing!", task);
            alert("Failed to approve task: Task ID is missing");
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
        } catch (error) {
            console.error("Detailed error in handleApprove:", error);
            alert("Failed to approve task: " + (error.message || "Unknown error"));
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (task) => {
        const reason = window.prompt("Enter rejection reason (User will be notified via WhatsApp):");
        if (reason === null) return; // Cancelled
        if (!reason.trim()) {
            alert("Rejection reason is required.");
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
        } catch (error) {
            console.error("Error rejecting task:", error);
            alert("Failed to reject task: " + (error.message || "Unknown error"));
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
            <div className="space-y-6">
                <div className="flex flex-col gap-4">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <AlertCircle className="text-amber-500" />
                        Admin Approval
                    </h1>
                    <p className="text-gray-600">Review pending task completions submitted by users.</p>

                    <div className="flex gap-4 items-center justify-between">
                        {/* Tabs */}
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {/* ... existing category tabs ... */}
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

                        {/* View Mode Toggle */}
                        <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200 shrink-0">
                            <button
                                onClick={() => setViewMode("pending")}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === "pending"
                                    ? "bg-white text-gray-800 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                <Clock size={14} />
                                Pending
                            </button>
                            <button
                                onClick={() => setViewMode("history")}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === "history"
                                    ? "bg-white text-gray-800 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                <History size={14} />
                                History
                            </button>
                        </div>
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
                                                <div className="text-sm font-medium text-gray-900">{task.doer_name || task.name || task.filled_by}</div>
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
                                                {task.status && (
                                                    <div className="text-xs font-bold text-blue-600 mt-1 uppercase bg-blue-50 px-2 py-0.5 rounded-sm inline-block">
                                                        Status: {task.status}
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
                                                {viewMode === 'pending' ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleApprove(task)}
                                                            disabled={processingId === task.id}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm text-xs border border-green-700"
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
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors shadow-sm text-xs"
                                                        >
                                                            <XCircle size={14} />
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    task.rejection_reason ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800" title={task.rejection_reason}>
                                                            Rejected
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
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
                </div>
            </div>
        </AdminLayout>
    );
}
