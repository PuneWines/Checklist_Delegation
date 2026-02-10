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
        <div className="sticky top-0 z-30 bg-gray-50/95 backdrop-blur-md border-b border-gray-200 -mx-4 px-4 py-2 md:py-0 md:bg-transparent md:border-none md:static md:mx-0 md:px-0 mb-6 transition-all duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                {/* Title / Brand Section (Hidden on Mobile for cleaner Nav look) */}
                <div className="hidden md:flex items-center gap-3">
                    <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-100">
                        <Activity className="text-purple-600 w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 leading-tight">Task Control</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Management Console</p>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="w-full md:w-auto">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar md:inline-flex w-full">
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
                     flex-1 md:flex-none flex items-center justify-center gap-2.5 py-2.5 px-5 rounded-md border-2 text-sm font-medium transition-all duration-200 whitespace-nowrap min-w-[110px]
                     ${isActive
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                            : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300'
                                        }
                   `}
                                >
                                    <Icon size={18} className="transition-colors duration-200" />
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
