import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, FileText, CheckCircle2, ArrowLeft,
  Loader2, ChevronRight, LayoutGrid, Database, Info, ArrowRight, Table
} from 'lucide-react';
import Papa from 'papaparse';
import AdminLayout from '../components/layout/AdminLayout';
import { useMagicToast } from '../context/MagicToastContext';
import supabase from '../SupabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

const MasterWorkBulkImport = () => {
  const [csvData, setCsvData] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStatus, setImportStatus] = useState({ success: 0, failed: 0, total: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [mapping, setMapping] = useState({});
  const [currentStep, setCurrentStep] = useState(1); // 1: Upload, 2: Map, 3: Review
  const [shops, setShops] = useState([]);
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

  const FIELDS = [
    { key: 'shop_name', label: 'Shop Name', required: true },
    { key: 'task_name', label: 'Task Name', required: true },
    { key: 'department', label: 'Department', required: false },
    { key: 'estimated_minutes', label: 'Est. Minutes', required: false },
  ];

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results) => {
        setCsvData(results.data);
        setHeaders(results.meta.fields);

        // Auto-mapping
        const newMapping = {};
        FIELDS.forEach(field => {
          const match = results.meta.fields.find(h =>
            h.toLowerCase().replace(/[^a-z]/g, '') === field.key.toLowerCase().replace(/[^a-z]/g, '') ||
            h.toLowerCase().includes(field.label.toLowerCase())
          );
          if (match) newMapping[field.key] = match;
        });
        setMapping(newMapping);
        setIsProcessing(false);
        setCurrentStep(2);
        showToast("CSV parsed successfully", "success");
      },
      error: (err) => {
        console.error(err);
        showToast("Error parsing CSV", "error");
        setIsProcessing(false);
      }
    });
  };

  const handleImport = async () => {
    if (!csvData || csvData.length === 0) return;

    const missingRequired = FIELDS
      .filter(f => f.required && !mapping[f.key])
      .map(f => f.label);

    if (missingRequired.length > 0) {
      showToast(`Please map required fields: ${missingRequired.join(', ')}`, "error");
      return;
    }

    setIsImporting(true);
    setImportStatus({ success: 0, failed: 0, total: csvData.length });
    setCurrentStep(3);

    try {
      const allPreparedData = [];
      
      for (const row of csvData) {
        const rawShopName = row[mapping['shop_name']];
        const shop = shops.find(s => 
          s.shop_name?.toLowerCase().trim() === rawShopName?.toLowerCase().trim()
        );

        if (!shop) {
          console.warn(`Shop "${rawShopName}" not found. Skipping row.`);
          continue;
        }

        allPreparedData.push({
          shop_id: shop.id,
          task_name: row[mapping['task_name']] || "Untitled Task",
          department: row[mapping['department']] || "RETAIL",
          estimated_minutes: parseInt(row[mapping['estimated_minutes']]) || 0,
          is_active: true
        });
      }

      setImportStatus(prev => ({ ...prev, total: allPreparedData.length }));

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
        setImportStatus(prev => ({ ...prev, success: successCount, failed: failedCount }));
      }

      if (failedCount > 0) {
        showToast(`Imported ${successCount} tasks. ${failedCount} failed.`, "warning");
      } else {
        showToast(`Successfully imported ${successCount} tasks.`, "success");
        setTimeout(() => navigate('/dashboard/work-details'), 2000);
      }
    } catch (err) {
      showToast("Critical error during import", "error");
    } finally {
      setIsImporting(false);
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
                  Master Task <span className="text-purple-600">Bulk Import</span>
                </h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Update Master Definitions</p>
              </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200">
              {[1, 2, 3].map((step) => (
                <div key={step} className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all ${currentStep === step ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                  <span className="text-[10px] font-black">{step}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{step === 1 ? 'Upload' : step === 2 ? 'Map' : 'Status'}</span>
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-12 flex flex-col items-center text-center"
              >
                <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                  <Upload className="w-10 h-10 animate-bounce" />
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Upload Master Tasks CSV</h2>
                <p className="text-slate-500 text-sm mb-8 max-w-sm">
                  Import permanent task definitions. Ensure your CSV has columns for <b>Shop Name</b>, <b>Task Name</b>, and <b>Department</b>.
                </p>
                <label className="cursor-pointer group">
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  <div className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl group-hover:bg-purple-600 transition-all flex items-center gap-3">
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                    {isProcessing ? 'Processing...' : 'Select CSV File'}
                  </div>
                </label>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                {/* Field Mapping */}
                <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
                  <h3 className="font-black text-slate-900 uppercase tracking-widest text-[10px] mb-6">Map Columns</h3>
                  <div className="space-y-4">
                    {FIELDS.map(field => (
                      <div key={field.key} className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        <select
                          value={mapping[field.key] || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        >
                          <option value="">Select Column</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleImport}
                    className="w-full mt-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-black shadow-lg flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                  >
                    <CheckCircle2 size={16} /> Start Import
                  </button>
                </div>

                {/* Preview */}
                <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">CSV Preview</span>
                    <span className="text-[10px] font-black uppercase text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{csvData.length} Rows</span>
                  </div>
                  <div className="overflow-auto max-h-[500px]">
                    <table className="w-full text-left">
                      <thead className="bg-white sticky top-0 border-b">
                        <tr>
                          {headers.map(h => (
                            <th key={h} className={`px-4 py-3 text-[9px] font-black uppercase tracking-widest ${Object.values(mapping).includes(h) ? 'text-purple-600' : 'text-slate-300'}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {csvData.slice(0, 10).map((row, i) => (
                          <tr key={i}>
                            {headers.map(h => (
                              <td key={h} className={`px-4 py-2 text-[10px] font-bold ${Object.values(mapping).includes(h) ? 'text-slate-900' : 'text-slate-300'}`}>
                                {row[h]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-12 flex flex-col items-center text-center max-w-xl mx-auto"
              >
                <div className="w-24 h-24 relative mb-8">
                   <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
                   <motion.div 
                     className="absolute inset-0 border-4 border-purple-600 rounded-full"
                     initial={{ pathLength: 0 }}
                     animate={{ pathLength: (importStatus.success + importStatus.failed) / importStatus.total }}
                     style={{ rotate: -90 }}
                   />
                   <div className="absolute inset-0 flex items-center justify-center font-black text-xl">
                     {Math.round(((importStatus.success + importStatus.failed) / (importStatus.total || 1)) * 100)}%
                   </div>
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-6">Processing Master Tasks</h2>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                    <span className="block text-2xl font-black text-emerald-600">{importStatus.success}</span>
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Success</span>
                  </div>
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                    <span className="block text-2xl font-black text-red-600">{importStatus.failed}</span>
                    <span className="text-[10px] font-black text-red-700 uppercase tracking-widest">Failed</span>
                  </div>
                </div>
                {!isImporting && (
                   <button 
                     onClick={() => navigate('/dashboard/work-details')}
                     className="mt-10 px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest"
                   >
                     Finish & Exit
                   </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AdminLayout>
  );
};

export default MasterWorkBulkImport;
