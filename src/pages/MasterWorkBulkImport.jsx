import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, ArrowLeft, Plus, Trash2, Save, Loader2, ChevronDown, Check, X
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import { useMagicToast } from '../context/MagicToastContext';
import supabase from '../SupabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

// Custom Multi-Select Component
const MultiSelectDropdown = ({ options, selectedValues, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (id) => {
    if (id === 'all') {
      if (selectedValues.length === options.length) {
        onChange([]);
      } else {
        onChange(options.map(o => o.id));
      }
      return;
    }

    if (selectedValues.includes(id)) {
      onChange(selectedValues.filter(val => val !== id));
    } else {
      onChange([...selectedValues, id]);
    }
  };

  const removeOption = (id, e) => {
    e.stopPropagation();
    onChange(selectedValues.filter(val => val !== id));
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) return "Select Shops";
    if (selectedValues.length === options.length) return "All Shops Selected";
    if (selectedValues.length <= 2) {
      return selectedValues.map(id => options.find(o => o.id === id)?.shop_name).join(', ');
    }
    return `${selectedValues.length} Shops Selected`;
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full min-h-[42px] text-xs font-bold p-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all cursor-pointer"
      >
        <div className="flex flex-wrap gap-1 items-center">
          {selectedValues.length > 0 && selectedValues.length <= 2 ? (
            selectedValues.map(id => {
              const opt = options.find(o => o.id === id);
              return opt ? (
                <span key={id} className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded flex items-center gap-1">
                  {opt.shop_name}
                  <X className="w-3 h-3 hover:text-purple-900 cursor-pointer" onClick={(e) => removeOption(id, e)} />
                </span>
              ) : null;
            })
          ) : (
            <span className={selectedValues.length === 0 ? "text-gray-400 font-normal" : "text-gray-800"}>
              {getDisplayText()}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl max-h-60 overflow-y-auto"
          >
            <div 
              onClick={() => toggleOption('all')}
              className="flex items-center px-3 py-2 cursor-pointer hover:bg-slate-50 border-b border-slate-100"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${selectedValues.length === options.length ? 'bg-purple-600 border-purple-600' : 'border-slate-300'}`}>
                {selectedValues.length === options.length && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs font-bold text-slate-700">Select All</span>
            </div>
            {options.map(option => (
              <div 
                key={option.id}
                onClick={() => toggleOption(option.id)}
                className="flex items-center px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 flex-shrink-0 ${selectedValues.includes(option.id) ? 'bg-purple-600 border-purple-600' : 'border-slate-300'}`}>
                  {selectedValues.includes(option.id) && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className={`text-xs ${selectedValues.includes(option.id) ? 'font-bold text-purple-700' : 'font-medium text-slate-600'}`}>
                  {option.shop_name}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MasterWorkBulkImport = () => {
  const [shops, setShops] = useState([]);
  const [rows, setRows] = useState([
    { id: Date.now(), shop_ids: [], task_name: '', department: '' }
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useMagicToast();
  const navigate = useNavigate();

  // Fetch shops for ID mapping
  useEffect(() => {
    const fetchShops = async () => {
      const { data, error } = await supabase.from('shop').select('id, shop_name');
      if (data) setShops(data);
      if (error) console.error("Error fetching shops:", error);
    };
    fetchShops();
  }, []);

  const addRow = () => {
    setRows([...rows, { id: Date.now(), shop_ids: [], task_name: '', department: '' }]);
  };

  const removeRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(row => row.id !== id));
    }
  };

  const handleRowChange = (id, field, value) => {
    setRows(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleSave = async () => {
    // Validate rows
    const validRows = rows.filter(row => row.shop_ids.length > 0 && row.task_name.trim());
    
    if (validRows.length === 0) {
      showToast("Please fill in at least one valid row (Shop and Task Description are required)", "warning");
      return;
    }

    if (validRows.length !== rows.length) {
      showToast(`Skipping ${rows.length - validRows.length} incomplete rows.`, "warning");
    }

    setIsSaving(true);

    try {
      const allPreparedData = [];
      
      validRows.forEach(row => {
        row.shop_ids.forEach(shop_id => {
          allPreparedData.push({
            shop_id: shop_id,
            task_name: row.task_name.trim(),
            department: row.department.trim() || "RETAIL",
            estimated_minutes: 0,
            is_active: true
          });
        });
      });

      const CHUNK_SIZE = 50;
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < allPreparedData.length; i += CHUNK_SIZE) {
        const chunk = allPreparedData.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('master_work_tasks').insert(chunk);

        if (error) {
          failedCount += chunk.length;
          console.error("Insert error:", error);
        } else {
          successCount += chunk.length;
        }
      }

      if (failedCount > 0) {
        showToast(`Saved ${successCount} tasks. ${failedCount} failed.`, "warning");
      } else {
        showToast(`Successfully saved ${successCount} tasks across selected shops.`, "success");
        setTimeout(() => navigate('/dashboard/work-details'), 2000);
      }
    } catch (err) {
      console.error(err);
      showToast("Critical error during save", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-5">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 text-slate-600 hover:text-purple-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Master Task <span className="text-purple-600">Entry</span>
                </h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Manually Add Master Definitions</p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? "Saving..." : "Save Tasks"}
            </button>
          </div>

          <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-visible">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Manual Task Entry</span>
              <button
                onClick={addRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>
            
            <div className="overflow-visible p-4 sm:p-6 pb-40">
              <table className="w-full text-left min-w-[600px] border-separate border-spacing-y-2">
                <thead className="bg-transparent">
                  <tr>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 w-1/4">Shop Name(s) *</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 w-2/5">Task Description *</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 w-1/4">Department</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-transparent">
                  <AnimatePresence>
                    {rows.map((row) => (
                      <motion.tr 
                        key={row.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group"
                      >
                        <td className="px-2 py-1 align-top">
                          <MultiSelectDropdown 
                            options={shops}
                            selectedValues={row.shop_ids}
                            onChange={(vals) => handleRowChange(row.id, 'shop_ids', vals)}
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <input
                            type="text"
                            placeholder="Enter task description"
                            value={row.task_name}
                            onChange={(e) => handleRowChange(row.id, 'task_name', e.target.value)}
                            className="w-full text-xs font-bold p-2 min-h-[42px] bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <input
                            type="text"
                            placeholder="Optional (e.g., RETAIL)"
                            value={row.department}
                            onChange={(e) => handleRowChange(row.id, 'department', e.target.value)}
                            className="w-full text-xs font-bold p-2 min-h-[42px] bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                          />
                        </td>
                        <td className="px-2 py-1 text-center align-top pt-2">
                          <button
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length === 1}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Remove Row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            {rows.length === 0 && (
              <div className="p-10 text-center text-slate-400 text-sm font-medium">
                No rows added. Click "Add Row" to start.
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default MasterWorkBulkImport;
