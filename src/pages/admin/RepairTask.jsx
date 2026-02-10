import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2 } from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { useDispatch, useSelector } from "react-redux";
import { createRepair } from "../../redux/slice/repairSlice";
import { uniqueGivenByData, uniqueDoerNameData } from "../../redux/slice/assignTaskSlice";

export default function RepairTask() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { givenBy, doerName } = useSelector((state) => state.assignTask);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State aligned with your requirements
    const [formData, setFormData] = useState({
        filledBy: "",
        assignedPerson: "",
        machineName: "",
        issueDetails: ""
    });

    useEffect(() => {
        dispatch(uniqueGivenByData());
        dispatch(uniqueDoerNameData("Maintenance")); // Or generic
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
        if (!formData.filledBy || !formData.assignedPerson || !formData.machineName || !formData.issueDetails) {
            alert("Please fill in all required fields marked with *");
            return;
        }

        setIsSubmitting(true);

        try {
            // Dispatch the create action
            await dispatch(createRepair(formData)).unwrap();

            alert("Repair Request Submitted Successfully!");
            navigate('/dashboard/task-management'); // Redirect back to list
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
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
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
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
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
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                            >
                                <option value="">Select machine...</option>
                                {machineOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>

                        {/* 4. Issue Details */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Issue Details <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                name="issueDetails"
                                value={formData.issueDetails}
                                onChange={handleChange}
                                rows="4"
                                // Placeholder - waiting for view_file="Describe the issue in detail..."
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none transition-all"
                            />
                        </div>

                        <p className="text-xs text-gray-500 italic">
                            After submission, the admin will fill in additional details like Part Replaced, Work Done, Status, etc.
                        </p>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
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