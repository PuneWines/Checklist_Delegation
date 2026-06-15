"use client"
import React, { useState, useEffect, useMemo } from 'react'
import { ClipboardCheck, Hammer, Wrench, Activity, Users, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import supabase from '../SupabaseClient'

let memoryCache = {};

const allTabs = [
    { id: 'checklist', label: 'Checklist', icon: ClipboardCheck, color: 'text-purple-600', activeColor: 'bg-purple-600' },
    { id: 'work', label: 'Work', icon: Activity, color: 'text-indigo-600', activeColor: 'bg-indigo-600' },
    { id: 'maintenance', label: 'Maintenance', icon: Hammer, color: 'text-blue-600', activeColor: 'bg-blue-600' },
    { id: 'repair', label: 'Repair', icon: Wrench, color: 'text-orange-600', activeColor: 'bg-orange-600' },
    { id: 'ea', label: 'EA', icon: Users, color: 'text-green-600', activeColor: 'bg-green-600' },
]

export default function TaskManagementTabs({ activeTab, setActiveTab }) {
    const role = (localStorage.getItem("role") || "").toLowerCase();
    const designation = (localStorage.getItem("designation") || "").toLowerCase();
    const isMachineOperator = designation.includes("machin") || designation.includes("operat") || designation.includes("oprat");
    const username = localStorage.getItem("user-name") || "";
    const cacheKey = `user_tasks_visibility_${username}`;

    const [userHasTasks, setUserHasTasks] = useState(() => {
        if (role !== "user" || !username) {
            return { checklist: true, work: true, maintenance: true, repair: true, ea: true };
        }
        if (memoryCache[username]) {
            return memoryCache[username];
        }
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                memoryCache[username] = parsed;
                return parsed;
            }
        } catch (e) {
            console.error("Error reading task visibility cache:", e);
        }
        return {
            checklist: false,
            work: false,
            maintenance: false,
            repair: false,
            ea: false
        };
    });

    const [isLoading, setIsLoading] = useState(() => {
        if (role !== "user" || !username) return false;
        if (memoryCache[username]) return false;
        try {
            return !sessionStorage.getItem(cacheKey);
        } catch (e) {
            return true;
        }
    });

    useEffect(() => {
        const username = localStorage.getItem("user-name");
        if (role !== "user" || !username) return;

        // Skip fetch if already in memory cache
        if (memoryCache[username]) {
            setIsLoading(false);
            return;
        }

        const checkUserTasks = async () => {
            try {
                const [
                    checklistRes,
                    delegationRes,
                    workRes,
                    maintenanceRes,
                    repairRes,
                    eaRes
                ] = await Promise.all([
                    supabase.from('checklist').select('task_id').eq('name', username).limit(1),
                    supabase.from('delegation').select('task_id').eq('name', username).limit(1),
                    supabase.from('work_task').select('id').eq('name', username).limit(1),
                    supabase.from('maintenance_tasks').select('id').eq('name', username).limit(1),
                    supabase.from('repair_tasks').select('id').eq('assigned_person', username).limit(1),
                    supabase.from('ea_tasks').select('id').eq('doer_name', username).limit(1)
                ]);

                const result = {
                    checklist: (checklistRes.data && checklistRes.data.length > 0) || (delegationRes.data && delegationRes.data.length > 0),
                    work: workRes.data && workRes.data.length > 0,
                    maintenance: maintenanceRes.data && maintenanceRes.data.length > 0,
                    repair: repairRes.data && repairRes.data.length > 0,
                    ea: eaRes.data && eaRes.data.length > 0
                };

                setUserHasTasks(result);
                memoryCache[username] = result;
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify(result));
                } catch (e) {
                    console.error("Error writing task visibility cache:", e);
                }
            } catch (error) {
                console.error("Error checking tasks for user role in TaskManagementTabs:", error);
            } finally {
                setIsLoading(false);
            }
        };

        checkUserTasks();
    }, [role, username]);

    const tabs = useMemo(() => {
        return allTabs.filter(tab => {
            if (role === "hod") {
                if (tab.id === "checklist") return true;
                if (tab.id === "repair" && isMachineOperator) return true;
                return false;
            }
            if (role === "manager") {
                return tab.id === "work";
            }
            if (role === "user") {
                return userHasTasks[tab.id];
            }
            return true;
        });
    }, [role, isMachineOperator, userHasTasks]);

    useEffect(() => {
        if (tabs.length > 0) {
            const hasActiveTab = tabs.some(t => t.id === activeTab || (activeTab === 'default' && t.id === 'checklist'));
            if (!hasActiveTab) {
                setActiveTab(tabs[0].id);
            }
        }
    }, [tabs, activeTab, setActiveTab]);

    return (
        <div className="bg-white/40 backdrop-blur-md rounded-2xl p-1.5 border border-gray-100/80 shadow-sm">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-start">
                {/* Navigation Tabs */}
                <div className="w-full lg:w-auto overflow-hidden">
                    <div className="flex bg-gray-100/50 p-1 rounded-xl relative overflow-x-auto no-scrollbar max-w-max min-h-[38px] items-center">
                        {isLoading ? (
                            <div className="flex items-center gap-2 px-6 py-1.5 text-xs font-bold text-gray-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                                <span>Loading modules...</span>
                            </div>
                        ) : (
                            tabs.map((tab) => {
                                const normalizedActive = activeTab.toLowerCase();
                                const normalizedId = tab.id.toLowerCase();
                                const isActive = normalizedActive === normalizedId || (normalizedActive === 'default' && normalizedId === 'checklist');
                                const Icon = tab.icon;

                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            relative flex items-center justify-center gap-2.5 py-2 px-6 rounded-lg text-xs font-bold transition-all duration-500 whitespace-nowrap min-w-[100px] md:min-w-[120px] z-10
                                            ${isActive ? 'text-white' : 'text-gray-500 hover:text-purple-600'}
                                        `}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeTabPillGlobal"
                                                className={`absolute inset-0 rounded-lg shadow-md z-[-1] ${
                                                    tab.id === 'checklist' ? 'bg-purple-600' : 
                                                    tab.id === 'work' ? 'bg-indigo-600' : 
                                                    tab.id === 'maintenance' ? 'bg-blue-600' : 
                                                    tab.id === 'repair' ? 'bg-orange-600' : 
                                                    'bg-green-600'}`}
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        <Icon size={isActive ? 17 : 16} className={`${isActive ? 'text-white' : tab.color} transition-colors duration-300`} />
                                        <span className="relative">{tab.label}</span>
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
