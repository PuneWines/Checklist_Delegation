import React, { useState, useEffect } from "react";
import supabase from "../../SupabaseClient";
import AdminLayout from "../../components/layout/AdminLayout";

export default function TaskRecovery() {
    const [seriesList, setSeriesList] = useState([]);
    const [selectedSeries, setSelectedSeries] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [anchorDate, setAnchorDate] = useState("");
    const [status, setStatus] = useState("");
    const [holidays, setHolidays] = useState([]);
    const [workingDays, setWorkingDays] = useState(new Set());
    const [activeTab, setActiveTab] = useState('checklist'); // checklist, maintenance_tasks, delegation
    const [duplicateStats, setDuplicateStats] = useState({}); // { seriesKey: count }

    useEffect(() => {
        fetchUniqueSeries();
        fetchHolidays();
        fetchWorkingDays();
    }, [activeTab]);

    const fetchHolidays = async () => {
        const { data } = await supabase.from('holidays').select('holiday_date');
        if (data) setHolidays(data.map(h => h.holiday_date));
    };

    const fetchWorkingDays = async () => {
        const { data } = await supabase.from('working_day_calender').select('working_date');
        if (data) {
            setWorkingDays(new Set(data.map(d => d.working_date)));
        }
    };

    const fetchUniqueSeries = async (query = "") => {
        setIsLoading(true);
        const tableName = activeTab;

        setStatus(query ? `Searching for "${query}" in ${activeTab}...` : `Loading ${activeTab} series...`);
        try {
            let allData = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore && from < 30000) {
                let supabaseQuery = supabase
                    .from(tableName)
                    .select(`planned_date, task_description, name, ${activeTab === 'maintenance_tasks' ? 'machine_name' : 'department'}, ${activeTab === 'maintenance_tasks' ? 'freq' : 'frequency'}`)
                    .range(from, from + step - 1);

                if (query) {
                    supabaseQuery = supabaseQuery.or(`task_description.ilike.%${query}%,name.ilike.%${query}%`);
                }

                const { data, error } = await supabaseQuery;

                if (error) throw error;
                allData = [...allData, ...data];

                if (data.length < step) hasMore = false;
                from += step;
                if (!query) setStatus(`Fetched ${allData.length} records...`);
            }

            const seenSeries = new Set();
            const unique = [];
            const duplicates = {};

            allData.forEach(row => {
                const dateKey = row.planned_date?.split('T')[0] || "no-date";
                const name = (row.name || "").trim().toLowerCase();
                const desc = (row.task_description || "").trim().toLowerCase();
                const context = (row.department || row.machine_name || "").trim().toLowerCase();
                const seriesKey = `${name}|${desc}|${context}`;
                const clashKey = `${seriesKey}|${dateKey}`;

                if (!seenSeries.has(seriesKey)) {
                    seenSeries.add(seriesKey);
                    unique.push(row);
                }

                if (duplicates[clashKey]) {
                    duplicates[clashKey]++;
                    duplicates[seriesKey] = (duplicates[seriesKey] || 0) + 1;
                } else {
                    duplicates[clashKey] = 1;
                }
            });

            setSeriesList(unique);
            setDuplicateStats(duplicates);
            setStatus(`Analysis complete. Found ${unique.length} series in ${activeTab}.`);
        } catch (err) {
            console.error(err);
            setStatus("Fetch failed: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCleanupDuplicates = async () => {
        if (!window.confirm("Are you sure? This will delete all extra duplicate rows from Checklist, Maintenance, and Delegation tables.")) return;

        setIsLoading(true);
        setStatus("Starting Global Database Cleanup...");
        let totalDeleted = 0;

        try {
            const tables = [
                { name: 'checklist', idField: 'task_id', dateField: 'planned_date' },
                { name: 'delegation', idField: 'task_id', dateField: 'planned_date' },
                { name: 'maintenance_tasks', idField: 'id', dateField: 'planned_date' }
            ];

            for (const table of tables) {
                setStatus(`Scanning ${table.name}...`);
                let allItems = [];
                let from = 0;
                let hasMore = true;

                while (hasMore) {
                    const { data, error } = await supabase.from(table.name).select(`*`).range(from, from + 999);
                    if (error) throw error;
                    allItems = [...allItems, ...data];
                    if (data.length < 1000) hasMore = false;
                    from += 1000;
                }

                // Keep submitted tasks over pending, then keep oldest by ID
                allItems.sort((a, b) => {
                    if (a.submission_date && !b.submission_date) return -1;
                    if (!a.submission_date && b.submission_date) return 1;
                    return (a[table.idField] || 0) - (b[table.idField] || 0);
                });

                const seenKeys = new Set();
                const toDelete = [];

                allItems.forEach(item => {
                    const dateStr = item[table.dateField]?.split('T')[0] || "no-date";
                    const name = (item.name || "").trim().toLowerCase();
                    const desc = (item.task_description || "").trim().toLowerCase();
                    const context = (item.department || item.machine_name || "").trim().toLowerCase();
                    const key = `${name}|${desc}|${context}|${dateStr}`;

                    if (seenKeys.has(key)) {
                        toDelete.push(item[table.idField]);
                    } else {
                        seenKeys.add(key);
                    }
                });

                if (toDelete.length > 0) {
                    setStatus(`Cleaning ${toDelete.length} duplicates from ${table.name}...`);
                    for (let i = 0; i < toDelete.length; i += 100) {
                        const chunk = toDelete.slice(i, i + 100);
                        const { error: delError } = await supabase.from(table.name).delete().in(table.idField, chunk);
                        if (delError) throw delError;
                    }
                    totalDeleted += toDelete.length;
                }
            }

            setStatus(`SUCCESS: Cleanup complete. Removed ${totalDeleted} duplicates.`);
            fetchUniqueSeries();
        } catch (err) {
            console.error(err);
            setStatus("Cleanup Failed: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const loadSeriesDetail = async (series) => {
        setIsLoading(true);
        setSelectedSeries(series);
        setAnchorDate("");
        try {
            let allTasks = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from(activeTab)
                    .select('*')
                    .eq('task_description', series.task_description)
                    .eq('name', series.name)
                    .order(activeTab === 'maintenance_tasks' ? 'id' : 'task_id', { ascending: true })
                    .range(from, from + step - 1);

                if (error) throw error;
                allTasks = [...allTasks, ...data];
                if (data.length < step) hasMore = false;
                from += step;
            }

            setTasks(allTasks);
            const firstUnsubmitted = allTasks.find(t => !t.submission_date);
            if (firstUnsubmitted) {
                setAnchorDate(firstUnsubmitted.planned_date.substring(0, 16));
            }
        } catch (err) {
            setStatus("Error: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const isBadDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        return holidays.includes(dateStr) || !workingDays.has(dateStr);
    };

    const handleRepair = async () => {
        if (!anchorDate || !selectedSeries) return;
        setIsLoading(true);
        setStatus("Repairing dates...");

        try {
            const unsubmitted = tasks.filter(t => !t.submission_date).sort((a, b) => (a.task_id || a.id) - (b.task_id || b.id));
            const timePart = anchorDate.split('T')[1] || "09:00";
            let currentLoopDate = new Date(anchorDate);

            while (isBadDate(currentLoopDate)) {
                currentLoopDate.setDate(currentLoopDate.getDate() + 1);
            }

            for (let i = 0; i < unsubmitted.length; i++) {
                const task = unsubmitted[i];
                const year = currentLoopDate.getFullYear();
                const month = String(currentLoopDate.getMonth() + 1).padStart(2, '0');
                const day = String(currentLoopDate.getDate()).padStart(2, '0');
                const targetDate = `${year}-${month}-${day}T${timePart}:00`;

                await supabase.from(activeTab)
                    .update({ planned_date: targetDate, task_start_date: targetDate })
                    .eq(activeTab === 'maintenance_tasks' ? 'id' : 'task_id', task.task_id || task.id);

                // Increment for next
                const freq = (selectedSeries.frequency || selectedSeries.freq || 'daily').toLowerCase();
                if (freq.includes('weekly')) currentLoopDate.setDate(currentLoopDate.getDate() + 7);
                else if (freq.includes('monthly')) currentLoopDate.setMonth(currentLoopDate.getMonth() + 1);
                else if (freq.includes('alternate')) currentLoopDate.setDate(currentLoopDate.getDate() + 2);
                else currentLoopDate.setDate(currentLoopDate.getDate() + 1);

                while (isBadDate(currentLoopDate)) {
                    currentLoopDate.setDate(currentLoopDate.getDate() + 1);
                }
            }

            setStatus("Series repaired successfully.");
            loadSeriesDetail(selectedSeries);
        } catch (err) {
            setStatus("Error: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AdminLayout>
            <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h1 style={{ margin: 0 }}>Task Recovery & Maintenance</h1>
                    <button
                        onClick={handleCleanupDuplicates}
                        disabled={isLoading}
                        style={{ padding: '10px 20px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Cleanup All Duplicates
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    {['checklist', 'maintenance_tasks', 'delegation'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); setSelectedSeries(null); setTasks([]); }}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: activeTab === tab ? '#2563eb' : '#f3f4f6',
                                color: activeTab === tab ? 'white' : '#475569',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                textTransform: 'capitalize'
                            }}
                        >
                            {tab.replace('_tasks', '')}
                        </button>
                    ))}
                </div>

                {status && (
                    <div style={{ padding: '15px', borderRadius: '4px', backgroundColor: status.includes('Error') || status.includes('Failed') ? '#fee2e2' : '#dcfce7', color: status.includes('Error') || status.includes('Failed') ? '#991b1b' : '#166534', marginBottom: '20px', fontWeight: 'bold' }}>
                        {status}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 2fr', gap: '30px' }}>
                    <div>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <input
                                type="text"
                                placeholder="Search series..."
                                style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '4px' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <button
                                onClick={() => fetchUniqueSeries(searchTerm)}
                                disabled={isLoading}
                                style={{ padding: '0 20px', backgroundColor: '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Search
                            </button>
                        </div>
                        <div style={{ height: '600px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: 'white' }}>
                            {seriesList.length > 0 ? seriesList.map((s, i) => {
                                const name = (s.name || "").trim().toLowerCase();
                                const desc = (s.task_description || "").trim().toLowerCase();
                                const ctx = (s.department || s.machine_name || "").trim().toLowerCase();
                                const skey = `${name}|${desc}|${ctx}`;
                                const dcount = duplicateStats[skey] || 0;
                                return (
                                    <div
                                        key={i}
                                        onClick={() => loadSeriesDetail(s)}
                                        style={{ padding: '15px', borderBottom: '1px solid #eee', cursor: 'pointer', backgroundColor: selectedSeries === s ? '#eff6ff' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    >
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{s.task_description}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b' }}>{s.name} | {s.frequency || s.freq}</div>
                                        </div>
                                        {dcount > 0 && <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px' }}>{dcount} CLASHES</span>}
                                    </div>
                                );
                            }) : <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No series found.</div>}
                        </div>
                    </div>

                    <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '20px', backgroundColor: 'white' }}>
                        {selectedSeries ? (
                            <>
                                <h2 style={{ marginTop: 0 }}>{selectedSeries.task_description}</h2>
                                <p style={{ color: '#666' }}>{selectedSeries.department || selectedSeries.machine_name} | {selectedSeries.name}</p>

                                <div style={{ border: '1px solid #e5e7eb', padding: '15px', borderRadius: '4px', backgroundColor: '#f9fafb', marginBottom: '20px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>New Start Date for First Pending Task:</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input type="datetime-local" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', flex: 1 }} />
                                        <button onClick={handleRepair} disabled={isLoading || !anchorDate} style={{ padding: '8px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Repair Series</button>
                                    </div>
                                </div>

                                <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f3f4f6' }}>
                                            <tr>
                                                <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>ID</th>
                                                <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Date</th>
                                                <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const dcounts = {};
                                                return tasks.map((t, idx) => {
                                                    const dkey = t.planned_date.split('T')[0];
                                                    dcounts[dkey] = (dcounts[dkey] || 0) + 1;
                                                    const clash = dcounts[dkey] > 1;
                                                    return (
                                                        <tr key={idx} style={{ backgroundColor: clash ? '#fff1f2' : 'transparent' }}>
                                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>#{t.task_id || t.id}</td>
                                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>{t.planned_date.replace('T', ' ')}{clash && <b style={{ color: '#e11d48', fontSize: '10px', marginLeft: '5px' }}>⚠️ DUP</b>}</td>
                                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                                                {t.submission_date ? <b style={{ color: '#059669' }}>DONE</b> : clash ? <b style={{ color: '#e11d48' }}>CLASH</b> : <span>PENDING</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : <div style={{ textAlign: 'center', padding: '100px', color: '#999' }}>Select a series to repair.</div>}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
