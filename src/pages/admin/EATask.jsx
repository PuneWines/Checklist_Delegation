import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import { Users, Phone, Calendar, FileText, Save, ArrowLeft, Loader2 } from "lucide-react";
import supabase from "../../SupabaseClient";

export default function EATask() {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [formData, setFormData] = useState({
        doer_name: "",
        phone_number: "",
        planned_date: "",
        task_description: "",
        frequency: "One Time"
    });
    const [holidays, setHolidays] = useState([]);

    // Autocomplete states
    const [doerSuggestions, setDoerSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [allDoers, setAllDoers] = useState([]);

    // Fetch unique doers and holidays on component mount
    useEffect(() => {
        fetchUniqueDoers();
        fetchHolidays();
    }, []);

    const fetchHolidays = async () => {
        try {
            const { data, error } = await supabase.from('holidays').select('holiday_date');
            if (error) throw error;
            if (data) setHolidays(data.map(h => h.holiday_date));
        } catch (err) {
            console.error("Error fetching holidays:", err);
        }
    };

    const fetchUniqueDoers = async () => {
        try {
            const { data, error } = await supabase
                .from('ea_tasks')
                .select('doer_name, phone_number')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Create unique doers map (latest phone for each name)
            const doersMap = {};
            data.forEach(task => {
                if (task.doer_name && !doersMap[task.doer_name]) {
                    doersMap[task.doer_name] = task.phone_number || "";
                }
            });

            const uniqueDoers = Object.keys(doersMap).map(name => ({
                name,
                phone: doersMap[name]
            }));

            setAllDoers(uniqueDoers);
        } catch (err) {
            console.error("Error fetching doers:", err);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Handle autocomplete for doer_name
        if (name === "doer_name") {
            if (value.trim()) {
                const filtered = allDoers.filter(doer =>
                    doer.name.toLowerCase().includes(value.toLowerCase())
                );
                setDoerSuggestions(filtered);
                setShowSuggestions(true);
            } else {
                setShowSuggestions(false);
            }
        }
    };

    const selectDoer = (doer) => {
        setFormData(prev => ({
            ...prev,
            doer_name: doer.name,
            phone_number: doer.phone
        }));
        setShowSuggestions(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!formData.doer_name || !formData.planned_date || !formData.task_description) {
            alert("Please fill in all required fields");
            return;
        }

        setIsSubmitting(true);

        try {
            const givenBy = localStorage.getItem("user-name") || "Admin";
            const tasksToInsert = [];
            const startDate = new Date(formData.planned_date);

            if (formData.frequency === "One Time") {
                tasksToInsert.push({
                    doer_name: formData.doer_name,
                    phone_number: formData.phone_number,
                    planned_date: startDate.toISOString(),
                    task_description: formData.task_description,
                    status: 'pending',
                    given_by: givenBy
                });
            } else {
                let current = new Date(startDate);
                const endDate = new Date(startDate);
                endDate.setFullYear(endDate.getFullYear() + 1);

                const isHoliday = (d) => {
                    const dateStr = d.toISOString().split('T')[0];
                    return holidays.includes(dateStr);
                };

                const addDays = (date, days) => {
                    const d = new Date(date);
                    d.setDate(d.getDate() + days);
                    return d;
                };

                let attempts = 0;
                while (current <= endDate && attempts < 1000) {
                    attempts++;
                    if (!isHoliday(current)) {
                        tasksToInsert.push({
                            doer_name: formData.doer_name,
                            phone_number: formData.phone_number,
                            planned_date: current.toISOString(),
                            task_description: formData.task_description,
                            status: 'pending',
                            given_by: givenBy
                        });
                    }

                    if (formData.frequency === 'Daily') current = addDays(current, 1);
                    else if (formData.frequency === 'Weekly') current = addDays(current, 7);
                    else if (formData.frequency === 'Monthly') current.setMonth(current.getMonth() + 1);
                    else break;
                }
            }

            const { error } = await supabase
                .from('ea_tasks')
                .insert(tasksToInsert);

            if (error) throw error;

            setSuccessMessage(`${tasksToInsert.length} EA Task(s) assigned successfully!`);

            // Reset form
            setFormData({
                doer_name: "",
                phone_number: "",
                planned_date: "",
                task_description: "",
                frequency: "One Time"
            });

            // Refresh doers list
            fetchUniqueDoers();

            // Navigate to tasks page after 1.5 seconds
            setTimeout(() => {
                navigate("/dashboard/all-tasks");
            }, 1500);

        } catch (err) {
            console.error("Error creating EA task:", err);
            alert("Failed to assign task: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AdminLayout>
            <div className="max-w-4xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-700 rounded text-white">
                            <Users size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 uppercase tracking-tight">EA Task Assignment</h1>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Executive Assistant Operations</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate("/dashboard/assign-task")}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        Back
                    </button>
                </div>

                {/* Success Message */}
                {successMessage && (
                    <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Save size={18} />
                            <span className="font-medium">{successMessage}</span>
                        </div>
                        <button onClick={() => setSuccessMessage("")} className="text-green-600 hover:text-green-800">
                            ×
                        </button>
                    </div>
                )}

                {/* Form */}
                <div className="bg-white border border-gray-200 rounded shadow-sm">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <h2 className="text-sm font-bold text-gray-700 uppercase">Task Details</h2>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Doer Name */}
                        <div className="relative">
                            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">
                                <Users className="inline w-4 h-4 mr-1" />
                                Doer Name *
                            </label>
                            <input
                                type="text"
                                name="doer_name"
                                value={formData.doer_name}
                                onChange={handleInputChange}
                                onFocus={() => {
                                    if (formData.doer_name.trim() && doerSuggestions.length > 0) {
                                        setShowSuggestions(true);
                                    }
                                }}
                                onBlur={() => {
                                    // Delay to allow click on suggestion
                                    setTimeout(() => setShowSuggestions(false), 200);
                                }}
                                required
                                placeholder="Enter or select doer name"
                                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                autoComplete="off"
                            />

                            {/* Autocomplete Dropdown */}
                            {showSuggestions && doerSuggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                                    {doerSuggestions.map((doer, index) => (
                                        <div
                                            key={index}
                                            onClick={() => selectDoer(doer)}
                                            className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="font-medium text-gray-900">{doer.name}</div>
                                            {doer.phone && (
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    <Phone className="inline w-3 h-3 mr-1" />
                                                    {doer.phone}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Phone Number */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">
                                <Phone className="inline w-4 h-4 mr-1" />
                                Phone Number
                            </label>
                            <input
                                type="tel"
                                name="phone_number"
                                value={formData.phone_number}
                                onChange={handleInputChange}
                                placeholder="Enter contact number"
                                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                            />
                        </div>

                        {/* Planned Date & Frequency */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">
                                    <Calendar className="inline w-4 h-4 mr-1" />
                                    Planned Date *
                                </label>
                                <input
                                    type="datetime-local"
                                    name="planned_date"
                                    value={formData.planned_date}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">
                                    Recurrence
                                </label>
                                <select
                                    name="frequency"
                                    value={formData.frequency}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-white"
                                >
                                    <option>One Time</option>
                                    <option>Daily</option>
                                    <option>Weekly</option>
                                    <option>Monthly</option>
                                </select>
                                <p className="text-[10px] text-gray-500 mt-1 uppercase font-semibold">
                                    {formData.frequency !== "One Time" ? `Will generate tasks for 1 year (skipping holidays)` : "One unique task instance"}
                                </p>
                            </div>
                        </div>

                        {/* Task Description */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">
                                <FileText className="inline w-4 h-4 mr-1" />
                                Task Description *
                            </label>
                            <textarea
                                name="task_description"
                                value={formData.task_description}
                                onChange={handleInputChange}
                                required
                                rows="6"
                                placeholder="Describe the task in detail..."
                                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium resize-none"
                            />
                        </div>

                        {/* Submit Button */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => navigate("/dashboard/assign-task")}
                                className="px-6 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-700 rounded hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Assigning...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Assign Task
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </AdminLayout>
    );
}
