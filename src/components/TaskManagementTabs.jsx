"use client"
import React from 'react'
import { ClipboardCheck, Hammer, Wrench, Activity, Users } from 'lucide-react'

export default function TaskManagementTabs({ activeTab, setActiveTab }) {
    const tabs = [
        { id: 'checklist', label: 'Checklist', icon: ClipboardCheck, color: 'text-purple-600' },
        { id: 'maintenance', label: 'Maintenance', icon: Hammer, color: 'text-blue-600' },
        { id: 'repair', label: 'Repair', icon: Wrench, color: 'text-orange-600' },
        { id: 'ea', label: 'EA Tasks', icon: Users, color: 'text-green-600' },
    ]

    return (
        <div className="sticky top-0 z-30 bg-gray-50/95 backdrop-blur-md border-b border-gray-200 px-2 py-3 md:py-4 md:bg-transparent md:border-none md:static md:px-0 mb-6 transition-all duration-300">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

                {/* Title / Brand Section */}
                <div className="flex items-center gap-3">
                    <div className="bg-white p-2 md:p-2.5 rounded-xl shadow-sm border border-purple-100">
                        <Activity className="text-purple-600 w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 leading-tight">Task Control</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Management Console</p>
                    </div>
                </div>

                {/* Navigation Tabs - Force Mobile-style scrollbar on all screens */}
                <div className="w-full lg:w-auto overflow-hidden">
                    <div className="flex border border-purple-200 rounded-xl overflow-x-auto no-scrollbar bg-white shadow-sm p-1">
                        {tabs.map((tab) => {
                            const normalizedActive = activeTab.toLowerCase();
                            const normalizedId = tab.id.toLowerCase();
                            const isActive = normalizedActive === normalizedId || (normalizedActive === 'default' && normalizedId === 'checklist');
                            const Icon = tab.icon;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        flex-1 md:flex-none flex items-center justify-center gap-2 py-2 px-4 md:px-6 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 whitespace-nowrap min-w-[100px] md:min-w-[130px]
                                        ${isActive
                                            ? 'bg-purple-600 text-white shadow-md transform scale-[1.02]'
                                            : 'bg-transparent text-purple-600 hover:bg-purple-50'
                                        }
                                    `}
                                >
                                    <Icon size={isActive ? 18 : 16} className="transition-all duration-300" />
                                    <span>{tab.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
