import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, Mic, Square, Trash2 } from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { useDispatch, useSelector } from "react-redux";
import { createRepair } from "../../redux/slice/repairSlice";
import { uniqueGivenByData, uniqueDoerNameData } from "../../redux/slice/assignTaskSlice";
import { customDropdownDetails } from "../../redux/slice/settingSlice";
import { ReactMediaRecorder } from "react-media-recorder";
import supabase from "../../SupabaseClient";

export default function RepairTask() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { givenBy, doerName } = useSelector((state) => state.assignTask);
    const { customDropdowns = [] } = useSelector((state) => state.setting || {});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State aligned with your requirements
    const [formData, setFormData] = useState({
        filledBy: "",
        assignedPerson: "",
        machineName: "",
        issueDetails: ""
    });
    const [recordedAudio, setRecordedAudio] = useState(null);

    useEffect(() => {
        dispatch(uniqueGivenByData());
        dispatch(uniqueDoerNameData("Maintenance")); // Or generic
        dispatch(customDropdownDetails());
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
                                {doerName.map(opt => <option key={opt} value={opt}>{opt}</option>)}
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
                                {customDropdowns
                                    .filter(item => item.category === "Machine Name")
                                    .map((item) => (
                                        <option key={item.id} value={item.value}>{item.value}</option>
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
                                                    <audio src={recordedAudio.blobUrl} controls className="w-full h-8" />
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