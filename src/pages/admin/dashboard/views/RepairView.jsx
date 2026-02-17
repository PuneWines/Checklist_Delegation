import React, { useMemo } from "react"
import { FileText, CheckCircle, IndianRupee, PieChart as PieIcon } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-1 relative overflow-hidden min-w-0">
        <div className={`absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full ${color} opacity-5`}></div>
        <div className="flex justify-between items-start z-10">
            <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-[11px] text-gray-500 font-bold capitalize tracking-tight truncate mb-0.5">{label}</p>
                <p className="text-xl sm:text-2xl font-extrabold text-gray-900 truncate leading-none">{value}</p>
            </div>
            <div className={`p-2 rounded-full ${color} bg-opacity-10 flex-shrink-0`}>
                <Icon className={`h-5 w-5 ${color.replace('bg-', 'text-')}`} />
            </div>
        </div>
    </div>
)

export default function RepairView({ tasks = [] }) {
    const processedData = useMemo(() => {
        if (!tasks || tasks.length === 0) {
            return {
                deptData: [],
                statusCounts: { Pending: 0, Completed: 0, InProgress: 0, Observation: 0, Cancelled: 0 },
                vendorData: [],
                totalCost: 0,
                completedTasksCount: 0,
                paymentData: [{ name: "Full", value: 0, color: "#3B82F6" }, { name: "Partial", value: 0, color: "#10B981" }]
            };
        }

        const deptCounts = {};
        const statusCounts = { Pending: 0, Completed: 0, InProgress: 0, Observation: 0, Cancelled: 0 };
        const vendorCosts = {};
        let totalCost = 0;
        let completedTasksCount = 0;

        tasks.forEach(task => {
            // Department / Machine Name grouping
            const dept = task.machine_name || "General";
            deptCounts[dept] = (deptCounts[dept] || 0) + 1;

            // Normalize Status
            const rawStatus = (task.status || "Pending").toLowerCase();
            let statusKey = "Pending";
            if ((rawStatus.includes("complete") || rawStatus === "done") && task.admin_done) {
                statusKey = "Completed";
                completedTasksCount++;
            } else if (rawStatus.includes("observation")) {
                statusKey = "Observation";
            } else if (rawStatus.includes("cancel")) {
                statusKey = "Cancelled";
            } else if (rawStatus.includes("progress") || rawStatus.includes("fix")) {
                statusKey = "InProgress";
            } else {
                statusKey = "Pending";
            }
            statusCounts[statusKey]++;

            // Cost Calculation
            const cost = Number(task.bill_amount) || 0;
            totalCost += cost;

            // Vendor Calculation
            if (task.vendor_name) {
                const vendorName = task.vendor_name.trim();
                vendorCosts[vendorName] = (vendorCosts[vendorName] || 0) + cost;
            }
        });

        // Format Department Data
        const deptData = Object.keys(deptCounts)
            .map(name => ({ name, value: deptCounts[name] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5); // Top 5

        // Format Vendor Data
        const vendorData = Object.keys(vendorCosts)
            .map(name => ({ name, cost: vendorCosts[name] }))
            .sort((a, b) => b.cost - a.cost);
        // .slice(0, 5); // Top 5 vendors

        // Payment Data (Mocking logic based on completed vs pure cost)
        // Assuming Completed tasks are "Full" payment
        const paymentData = [
            { name: "Full", value: completedTasksCount, color: "#3B82F6" },
            { name: "Partial", value: statusCounts.InProgress + statusCounts.Pending, color: "#10B981" },
        ];

        return { deptData, statusCounts, vendorData, totalCost, completedTasksCount, paymentData };
    }, [tasks]);

    const { deptData, statusCounts, vendorData, totalCost, completedTasksCount, paymentData } = processedData;

    const taskOverviewData = [
        { name: "Pending", value: statusCounts.Pending },
        { name: "Completed", value: statusCounts.Completed },
        { name: "In Progress", value: statusCounts.InProgress },
        { name: "Observation", value: statusCounts.Observation },
    ];

    const maxVendorCost = Math.max(...vendorData.map(v => v.cost), 1);

    return (
        <div className="space-y-6 pb-8 overflow-x-hidden w-full max-w-full">
            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard icon={FileText} label="Total Indents" value={tasks.length} color="bg-blue-500" />
                <StatCard icon={CheckCircle} label="Repairs Completed" value={completedTasksCount} color="bg-green-500" />
                <StatCard icon={IndianRupee} label="Total Repair Cost" value={`₹${totalCost.toLocaleString()}`} color="bg-orange-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Repair Status by Department */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-gray-800 text-center w-full">Repair Status by Machine/Dept</h3>
                    </div>
                    <div className="space-y-6">
                        {deptData.length > 0 ? deptData.map((item, i) => (
                            <div key={i} className="space-y-1">
                                <div className="flex justify-between text-[11px] font-semibold">
                                    <span className="text-gray-500 truncate max-w-[70%]">{item.name}</span>
                                    <span className="text-gray-900">{item.value}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                                        style={{ width: `${(item.value / (tasks.length || 1)) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )) : <p className="text-center text-gray-400 text-xs">No data available</p>}
                    </div>
                </div>

                {/* Task Status Overview */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-gray-800 text-center w-full">Task Status Overview</h3>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={taskOverviewData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="name" axisLine={{ stroke: '#9ca3af' }} tickLine={false} tick={{ fill: '#4b5563', fontSize: 12 }} dy={10} interval={0} />
                                <YAxis axisLine={{ stroke: '#9ca3af' }} tickLine={false} tick={{ fill: '#4b5563', fontSize: 13 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Line type="monotone" dataKey="value" stroke="#4b5563" strokeWidth={2} dot={{ r: 4, fill: '#4b5563' }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment Type Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-8">
                        <PieIcon className="h-4 w-4 text-gray-400" />
                        <h3 className="text-lg font-bold text-gray-800">Payment Status Distribution</h3>
                    </div>
                    <div className="flex items-center justify-around h-48">
                        <div className="h-full w-1/2">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={paymentData} innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value">
                                        {paymentData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-4">
                            {paymentData.map((e, i) => (
                                <div key={i} className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color }}></div>
                                        <span className="text-[12px] font-bold text-gray-600">{e.name}</span>
                                    </div>
                                    <span className="text-[12px] font-bold text-gray-800">{e.value} Tasks</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Vendor-Wise Repair Costs */}
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-6">
                        <IndianRupee className="h-4 w-4 text-gray-400" />
                        <h3 className="text-base font-bold text-gray-800">Vendor-Wise Repair Costs</h3>
                    </div>
                    <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {vendorData.length > 0 ? vendorData.map((vendor, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <span className="text-[11px] font-bold text-gray-500 w-24 truncate" title={vendor.name}>{vendor.name}</span>
                                <div className="flex-1 flex items-center gap-3">
                                    <div className="flex-1 h-1.5 bg-orange-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${(vendor.cost / maxVendorCost) * 100}%` }}></div>
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-700 whitespace-nowrap min-w-[60px] text-right">₹ {vendor.cost.toLocaleString()}</span>
                                </div>
                            </div>
                        )) : <p className="text-center text-gray-400 text-xs w-full py-10">No vendor data available</p>}
                    </div>
                </div>
            </div>
        </div >
    )
}

