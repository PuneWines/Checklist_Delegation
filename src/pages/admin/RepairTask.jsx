import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, Mic, Square, Trash2, Play, Pause } from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { useDispatch, useSelector } from "react-redux";
import { createRepair } from "../../redux/slice/repairSlice";
import { uniqueGivenByData } from "../../redux/slice/assignTaskSlice";
import { customDropdownDetails, userDetails } from "../../redux/slice/settingSlice";
import { ReactMediaRecorder } from "react-media-recorder";
import supabase from "../../SupabaseClient";
import { sendTaskAssignmentNotification } from "../../services/whatsappService";

// --- AUDIO UTILITIES ---
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

    return (
        <div className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all duration-300 min-w-[140px] ${isPlaying
            ? 'bg-purple-50/80 border-purple-200 shadow-sm'
            : 'bg-white border-gray-100 hover:border-purple-100 hover:shadow-xs'
            }`}>
            <button
                type="button"
                onClick={togglePlay}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${isPlaying
                    ? 'bg-gradient-to-r from-rose-500 to-pink-600'
                    : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:scale-110'
                    }`}
            >
                {isPlaying ? (
                    <Pause size={12} className="text-white fill-white" />
                ) : (
                    <Play size={12} className="text-white fill-white ml-0.5" />
                )}
            </button>
            <div className="flex flex-col">
                <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${isPlaying ? 'text-purple-700' : 'text-gray-400'
                    }`}>
                    {isPlaying ? 'Playing...' : 'Voice Note'}
                </span>
                {isPlaying && (
                    <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
                        <div className="w-0.5 h-full bg-purple-400 animate-bounce" style={{ animationDuration: '0.6s' }}></div>
                        <div className="w-0.5 h-2/3 bg-purple-500 animate-bounce" style={{ animationDuration: '0.8s' }}></div>
                        <div className="w-0.5 h-full bg-purple-600 animate-bounce" style={{ animationDuration: '0.4s' }}></div>
                        <div className="w-0.5 h-2/3 bg-purple-500 animate-bounce" style={{ animationDuration: '0.7s' }}></div>
                    </div>
                )}
            </div>
            <audio
                ref={audioRef}
                src={url}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
            />
        </div>
    );
};

export default function RepairTask() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { givenBy } = useSelector((state) => state.assignTask);
    const { customDropdowns = [], userData = [] } = useSelector((state) => state.setting || {});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State aligned with your requirements
    const [formData, setFormData] = useState({
        filledBy: "",
        assignedPerson: "",
        machineName: "",
        issueDetails: ""
    });
    const [recordedAudio, setRecordedAudio] = useState(null);

    // Helper to get unique dropdown values
    const getUniqueDropdownValues = (category) => {
        const items = customDropdowns.filter(item => item.category === category);
        const uniqueValues = [...new Set(items.map(item => item.value))];
        return uniqueValues.map(value => {
            const item = items.find(i => i.value === value);
            return { ...item, value };
        });
    };

    useEffect(() => {
        dispatch(uniqueGivenByData());
        dispatch(customDropdownDetails());
        dispatch(userDetails());
    }, [dispatch]);

    // Hardcoded Options
    const machineOptions = [
        "A", "B", "C", "D", "E", "F", "G", "H", "I",
        "Atlas compressor", "ELGI Compreser", "Transformers",
        "65/18 Pipe Extruder", "52/18 Pipe Extruder", "C/c Capping Exturder",
        "Polveiger machine", "Printer A", "Printer B", "Other"
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Basic Validation
        if (!formData.filledBy || !formData.assignedPerson || !formData.machineName || (!formData.issueDetails && !recordedAudio)) {
            alert("Please fill in all required fields marked with * (Inluding Issue Details or Voice Note)");
            return;
        }

        setIsSubmitting(true);

        try {
            let audioUrl = "";
            let descriptionWrapper = (desc) => desc;

            // Upload audio if exists
            if (recordedAudio && recordedAudio.blob) {
                try {
                    const fileName = `voice-notes/${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('audio-recordings')
                        .upload(fileName, recordedAudio.blob, {
                            contentType: recordedAudio.blob.type || 'audio/webm',
                            upsert: false
                        });

                    if (uploadError) throw new Error(`Audio Upload Error: ${uploadError.message}`);

                    const { data: publicUrlData } = supabase.storage
                        .from('audio-recordings')
                        .getPublicUrl(fileName);

                    audioUrl = publicUrlData.publicUrl;
                    descriptionWrapper = (desc) => audioUrl; // Store ONLY the URL if voice note exists
                } catch (audioErr) {
                    console.error(audioErr);
                    alert(`Failed to upload audio: ${audioErr.message}`);
                    setIsSubmitting(false);
                    return;
                }
            }

            // Dispatch the create action with potential audio URL
            await dispatch(createRepair({
                ...formData,
                issueDetails: descriptionWrapper(formData.issueDetails)
            })).unwrap();

            // Send WhatsApp notifications
            try {
                await sendTaskAssignmentNotification({
                    doerName: formData.assignedPerson,
                    taskType: 'Repair',
                    description: formData.issueDetails,
                    machineName: formData.machineName,
                    givenBy: formData.filledBy
                });
                console.log('✅ WhatsApp notification sent successfully');
            } catch (whatsappError) {
                console.error('WhatsApp notification error:', whatsappError);
            }

            alert("Repair Request Submitted Successfully!");
            navigate('/dashboard/assign-task'); // Redirect back to assign task page
        } catch (error) {
            console.error("Submission failed:", error);
            alert("Failed to submit request. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    return (
        <AdminLayout>
            <div className="max-w-2xl mx-auto p-6">
                <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mt-6">

                    {/* Header */}
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <div>
                            <h1 className="text-xl font-bold text-gray-800">Repairing Request Form</h1>
                            <p className="text-sm text-gray-500 mt-1">Submit a repair request. Fill in the basic details below and the admin will complete the remaining information.</p>
                        </div>
                        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">

                        {/* 1. Form Filled By */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Assign From <span className="text-red-500">*</span>
                            </label>
                            <select
                                name="filledBy"
                                value={formData.filledBy}
                                onChange={handleChange}
                                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-gray-50 focus:bg-white transition-all text-sm font-medium"
                            >
                                <option value="">Select Assign From...</option>
                                {givenBy.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>

                        {/* 2. To Assign Person */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                To Assign Person <span className="text-red-500">*</span>
                            </label>
                            <select
                                name="assignedPerson"
                                value={formData.assignedPerson}
                                onChange={handleChange}
                                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-gray-50 focus:bg-white transition-all text-sm font-medium"
                            >
                                <option value="">Select person... (Doer)</option>
                                {userData
                                    ?.filter(u => u.role === 'user' && u.status === 'active')
                                    .map(user => (
                                        <option key={user.id} value={user.user_name}>
                                            {user.user_name}
                                        </option>
                                    ))
                                }
                            </select>
                        </div>

                        {/* 3. Machine Name */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Machine Name <span className="text-red-500">*</span>
                            </label>
                            <select
                                name="machineName"
                                value={formData.machineName}
                                onChange={handleChange}
                                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-gray-50 focus:bg-white transition-all text-sm font-medium"
                            >
                                <option value="">Select machine...</option>
                                {getUniqueDropdownValues("Machine Name")
                                    .map((item) => (
                                        <option key={item.id || item.value} value={item.value}>{item.value}</option>
                                    ))
                                }
                                {/* Fallback hardcoded if no dynamic data */}
                                {(!customDropdowns.some(item => item.category === "Machine Name")) && (
                                    machineOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)
                                )}
                            </select>
                        </div>

                        {/* 4. Issue Details & Audio Recording */}
                        <div>
                            <ReactMediaRecorder
                                audio
                                onStop={(blobUrl, blob) => {
                                    setRecordedAudio({ blobUrl, blob });
                                }}
                                render={({ status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl }) => (
                                    <div className="space-y-2">
                                        <label className="block text-sm font-semibold text-gray-700">
                                            Issue Details <span className="text-red-500">*</span>
                                        </label>

                                        {/* Default View: Input with Mic */}
                                        {status !== 'recording' && !recordedAudio && (
                                            <div className="relative">
                                                <textarea
                                                    name="issueDetails"
                                                    value={formData.issueDetails}
                                                    onChange={handleChange}
                                                    rows="4"
                                                    placeholder="Describe the issue in detail..."
                                                    className="w-full p-3 pr-12 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none bg-gray-50 focus:bg-white transition-all text-sm font-medium"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={startRecording}
                                                    className="absolute bottom-3 right-3 p-2 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200 transition-all shadow-sm group"
                                                    title="Record Voice Note"
                                                >
                                                    <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                </button>
                                            </div>
                                        )}

                                        {/* Recording View */}
                                        {status === 'recording' && (
                                            <div className="flex flex-col items-center justify-center p-8 bg-red-50 border border-red-100 rounded-xl space-y-4 animate-pulse">
                                                <div className="p-4 bg-red-100 rounded-full shadow-inner">
                                                    <Mic className="w-8 h-8 text-red-600" />
                                                </div>
                                                <p className="text-red-600 font-bold text-lg">Recording Voice Note...</p>
                                                <button
                                                    type="button"
                                                    onClick={stopRecording}
                                                    className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors font-bold shadow-lg"
                                                >
                                                    <Square className="w-4 h-4" /> Stop Recording
                                                </button>
                                            </div>
                                        )}

                                        {/* Recorded View (Player) */}
                                        {recordedAudio && status !== 'recording' && (
                                            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Voice Note Attached</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            clearBlobUrl();
                                                            setRecordedAudio(null);
                                                        }}
                                                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-bold"
                                                    >
                                                        <Trash2 className="w-3 h-3" /> Remove
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-purple-100 shadow-sm">
                                                    <AudioPlayer url={recordedAudio.blobUrl} />
                                                </div>
                                                <p className="text-xs text-center text-gray-500 mt-2">
                                                    Note: Issue details hidden while voice note is attached.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            />
                        </div>

                        <p className="text-xs text-gray-500 italic">
                            After submission, the admin will fill in additional details like Part Replaced, Work Done, Status, etc.
                        </p>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Submitting Request...
                                </>
                            ) : (
                                "Submit Request"
                            )}
                        </button>

                    </form>
                </div>
            </div>
        </AdminLayout>
    );
}