import React, { useEffect, useState, useRef } from 'react';
import { Plus, User, Building, X, Save, Edit, Trash2, Settings, Search, ChevronDown, Calendar, RefreshCw } from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import { useDispatch, useSelector } from 'react-redux';
import { createDepartment, createUser, deleteUser, departmentOnlyDetails, givenByDetails, departmentDetails, updateDepartment, updateUser, userDetails, customDropdownDetails, createCustomDropdown, deleteCustomDropdown, createAssignFrom, deleteDepartment, deleteAssignFrom, updateCustomDropdown, updateAssignFrom, createMachineEntries } from '../redux/slice/settingSlice';
import supabase from '../SupabaseClient';
import CalendarComponent from '../components/CalendarComponent';
import { createPortal } from 'react-dom';
import { sendTaskReassignmentNotification } from '../services/whatsappService';
import { useMagicToast } from '../context/MagicToastContext';

const formatDateLong = (date) => date ? date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
const formatDateISO = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Setting = () => {
  const { showToast } = useMagicToast();
  const [activeTab, setActiveTab] = useState('users');
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentDeptId, setCurrentDeptId] = useState(null);
  const [usernameFilter, setUsernameFilter] = useState('');
  const [usernameDropdownOpen, setUsernameDropdownOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastSyncError = useRef({ status: null, timestamp: 0 });

  const [activeDeptSubTab, setActiveDeptSubTab] = useState('departments');
  // Leave Management State
  const [leavePersonId, setLeavePersonId] = useState('');
  const [leavePersonName, setLeavePersonName] = useState('');
  const [leaveRemark, setLeaveRemark] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveTasks, setLeaveTasks] = useState([]);
  const [leaveTasksLoading, setLeaveTasksLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [shiftToPerson, setShiftToPerson] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(false);
  const [leaveUsernameFilter, setLeaveUsernameFilter] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [startCalendarPos, setStartCalendarPos] = useState({ top: 0, left: 0 });
  const [endCalendarPos, setEndCalendarPos] = useState({ top: 0, left: 0 });
  const startBtnRef = useRef(null);
  const endBtnRef = useRef(null);

  const { userData, department, departmentsOnly, givenBy, customDropdowns, loading, error } = useSelector((state) => state.setting);
  const dispatch = useDispatch();


  const fetchDeviceLogsAndUpdateStatus = async () => {
    // Set to true to enable background sync when the hardware API is online
    const ENABLE_DEVICE_SYNC = false;
    if (!ENABLE_DEVICE_SYNC) return;

    try {
      const now = Date.now();
      // Only sync once every 30 mins if we are in an error state
      if (lastSyncError.current.status === 400 && (now - lastSyncError.current.timestamp) < 30 * 60 * 1000) {
        return;
      }

      setIsRefreshing(true);
      const today = new Date().toISOString().split('T')[0];

      const urls = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`http://139.167.179.193:90/api/v2/WebAPI/GetDeviceLogs?APIKey=205511032522&SerialNumber=E03C1CB34D83AA02&FromDate=${today}&ToDate=${today}`)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`http://139.167.179.193:90/api/v2/WebAPI/GetDeviceLogs?APIKey=205511032522&SerialNumber=E03C1CB36042AA02&FromDate=${today}&ToDate=${today}`)}`
      ];

      let allLogs = [];
      let encountered400 = false;

      // Sequential fetch to isolate errors
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const logs = await response.json();
            if (Array.isArray(logs)) allLogs = [...allLogs, ...logs];
          } else if (response.status === 400) {
            encountered400 = true;
          }
        } catch (e) {
          // Network errors are caught here
        }
      }

      // Back-off logic if entirely failing
      if (encountered400 && allLogs.length === 0) {
        if (lastSyncError.current.status !== 400) {
          console.log('ℹ️ Device APIs unreachable (400). Sync paused for 30 minutes.');
        }
        lastSyncError.current = { status: 400, timestamp: now };
        return;
      }

      // Clear back-off if we got any data
      if (allLogs.length > 0 && lastSyncError.current.status === 400) {
        console.log('✅ Device sync partially or fully restored.');
        lastSyncError.current = { status: null, timestamp: 0 };
      }

      if (allLogs.length === 0) return;

      // Sort logs by date (latest first)
      allLogs.sort((a, b) => new Date(b.LogDate) - new Date(a.LogDate));

      const employeeStatus = {};
      allLogs.forEach(log => {
        const employeeCode = log.EmployeeCode;
        if (!employeeStatus[employeeCode]) {
          const punchDirection = log.PunchDirection?.toLowerCase();
          employeeStatus[employeeCode] = {
            status: punchDirection === 'in' ? 'active' : 'inactive'
          };
        }
      });

      const updatePromises = Object.entries(employeeStatus).map(async ([employeeCode, statusInfo]) => {
        if (!userData || !Array.isArray(userData)) return;
        const user = userData.find(u => u.employee_id === employeeCode);
        if (user && user.status !== statusInfo.status && user.status !== 'on leave' && user.status !== 'on_leave') {
          const { error } = await supabase
            .from('users')
            .update({ status: statusInfo.status })
            .eq('id', user.id);

          if (error) console.error(`Error updating status for ${user.user_name}:`, error);
        }
      });

      await Promise.all(updatePromises);
      dispatch(userDetails());
    } catch (error) {
      // Final catch for logic errors
    } finally {
      setIsRefreshing(false);
    }
  };

  // Add real-time subscription
  useEffect(() => {
    // Subscribe to users table changes
    const subscription = supabase
      .channel('users-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users'
        },
        (payload) => {
          // console.log('Real-time update received:', payload);
          // Refresh user data when any change occurs
          dispatch(userDetails());
        }
      )
      .subscribe();

    // Set up interval to check device logs every 60 seconds (reduced frequency)
    const intervalId = setInterval(fetchDeviceLogsAndUpdateStatus, 60000);

    // Initial fetch of device logs
    fetchDeviceLogsAndUpdateStatus();

    // Fetch departments and dropdowns on mount
    dispatch(departmentDetails());
    dispatch(customDropdownDetails());
    dispatch(givenByDetails()); // Fetch givenBy details on mount

    return () => {
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [dispatch]);


  // Add manual refresh button handler
  const handleManualRefresh = () => {
    fetchDeviceLogsAndUpdateStatus();
  };

  const handleUsernameFilterSelect = (username) => {
    setUsernameFilter(username);
    setUsernameDropdownOpen(false);
  };

  const clearUsernameFilter = () => {
    setUsernameFilter('');
    setUsernameDropdownOpen(false);
  };

  const toggleUsernameDropdown = () => {
    setUsernameDropdownOpen(!usernameDropdownOpen);
  };

  const handleAddButtonClick = () => {
    if (activeTab === 'users') {
      resetUserForm();
      setShowUserModal(true);
    } else if (activeTab === 'departments' || activeTab === 'categories') {
      resetDeptForm();
      setShowDeptModal(true);
    }
    // No action for leave tab
  };

  // Fetch tasks for the person on leave within the date range
  const handleFetchLeaveTasks = async () => {
    if (!leavePersonName || !leaveStartDate || !leaveEndDate) {
      showToast('Please select a person and both start and end dates', 'error');
      return;
    }
    if (new Date(leaveStartDate) > new Date(leaveEndDate)) {
      showToast('End date cannot be before start date', 'error');
      return;
    }
    setLeaveTasksLoading(true);
    setLeaveTasks([]);
    setHasFetched(false);
    setLeaveSuccess(false);
    try {
      const startISO = `${leaveStartDate}T00:00:00`;
      const endISO = `${leaveEndDate}T23:59:59`;

      const [
        { data: checklistTasks },
        { data: delegationTasks },
        { data: maintenanceTasks },
        { data: repairTasks },
        { data: eaTasks }
      ] = await Promise.all([
        supabase.from('checklist').select('*').eq('name', leavePersonName)
          .gte('task_start_date', startISO).lte('task_start_date', endISO).is('submission_date', null),
        supabase.from('delegation').select('*').eq('name', leavePersonName)
          .gte('task_start_date', startISO).lte('task_start_date', endISO).is('submission_date', null),
        supabase.from('maintenance_tasks').select('*').eq('name', leavePersonName)
          .gte('task_start_date', startISO).lte('task_start_date', endISO).is('submission_date', null),
        supabase.from('repair_tasks').select('*').eq('assigned_person', leavePersonName)
          .gte('created_at', startISO).lte('created_at', endISO).eq('status', 'Pending'),
        supabase.from('ea_tasks').select('*').eq('doer_name', leavePersonName)
          .gte('planned_date', startISO).lte('planned_date', endISO).eq('status', 'pending')
      ]);

      const combined = [
        ...(checklistTasks || []).map(t => ({ ...t, _table: 'checklist', id: t.task_id })),
        ...(delegationTasks || []).map(t => ({ ...t, _table: 'delegation', id: t.task_id })),
        ...(maintenanceTasks || []).map(t => ({ ...t, _table: 'maintenance_tasks', id: t.id })),
        ...(repairTasks || []).map(t => ({ ...t, _table: 'repair_tasks', id: t.id, task_description: t.issue_description, task_start_date: t.created_at })),
        ...(eaTasks || []).map(t => ({ ...t, _table: 'ea_tasks', id: t.id, task_description: t.task_description, task_start_date: t.planned_date }))
      ];
      setLeaveTasks(combined);
      setHasFetched(true);
    } catch (err) {
      console.error('Error fetching leave tasks:', err);
    } finally {
      setLeaveTasksLoading(false);
    }
  };

  // Shift all fetched tasks to the substitute person and mark on leave
  const handleShiftTasks = async () => {
    // If there are tasks found, we MUST have a substitute person
    if (leaveTasks.length > 0 && !shiftToPerson) {
      showToast('Please select a person to shift tasks to', 'error');
      return;
    }

    const confirmMsg = leaveTasks.length > 0
      ? `Shift ${leaveTasks.length} task(s) from "${leavePersonName}" to "${shiftToPerson}" and mark "${leavePersonName}" as On Leave?`
      : `Mark "${leavePersonName}" as On Leave? (No tasks found to shift)`;

    if (!window.confirm(confirmMsg)) return;

    setLeaveSubmitting(true);
    try {
      const checklistIds = leaveTasks.filter(t => t._table === 'checklist').map(t => t.task_id);
      const delegationIds = leaveTasks.filter(t => t._table === 'delegation').map(t => t.task_id);
      const maintenanceIds = leaveTasks.filter(t => t._table === 'maintenance_tasks').map(t => t.id);
      const repairIds = leaveTasks.filter(t => t._table === 'repair_tasks').map(t => t.id);
      const eaIds = leaveTasks.filter(t => t._table === 'ea_tasks').map(t => t.id);

      // Update User Status and Leave Dates
      const { error: userUpdateError } = await supabase
        .from('users')
        .update({
          status: 'on_leave',
          leave_date: leaveStartDate,
          leave_end_date: leaveEndDate,
          remark: leaveRemark || 'Shifted tasks'
        })
        .eq('id', leavePersonId);

      if (userUpdateError) throw userUpdateError;

      // Update Tasks (If any)
      if (checklistIds.length > 0) {
        const { error: checklistError } = await supabase.from('checklist').update({ name: shiftToPerson }).in('task_id', checklistIds);
        if (checklistError) console.error('Error updating checklist tasks:', checklistError);
      }
      if (delegationIds.length > 0) {
        const { error: delegationError } = await supabase.from('delegation').update({ name: shiftToPerson }).in('task_id', delegationIds);
        if (delegationError) console.error('Error updating delegation tasks:', delegationError);
      }
      if (maintenanceIds.length > 0) {
        const { error: maintenanceError } = await supabase.from('maintenance_tasks').update({ name: shiftToPerson }).in('id', maintenanceIds);
        if (maintenanceError) console.error('Error updating maintenance tasks:', maintenanceError);
      }
      if (repairIds.length > 0) {
        const { error: repairError } = await supabase.from('repair_tasks').update({ assigned_person: shiftToPerson }).in('id', repairIds);
        if (repairError) console.error('Error updating repair tasks:', repairError);
      }
      if (eaIds.length > 0) {
        const { error: eaError } = await supabase.from('ea_tasks').update({ doer_name: shiftToPerson }).in('id', eaIds);
        if (eaError) console.error('Error updating EA tasks:', eaError);
      }

      // Send WhatsApp Notifications for shifted tasks
      if (leaveTasks.length > 0) {
        for (const task of leaveTasks) {
          await sendTaskReassignmentNotification({
            newDoerName: shiftToPerson,
            originalDoerName: leavePersonName,
            taskId: task.task_id || task.id,
            description: task.task_description || task.tasks || task.title || task.issue_description,
            startDate: (task.task_start_date || task.planned_date || task.created_at) ? new Date(task.task_start_date || task.planned_date || task.created_at).toLocaleDateString('en-IN') : 'N/A',
            givenBy: task.given_by || task.filled_by || 'Admin',
            department: task.department,
            taskType: task._table
          });
        }
      }

      setLeaveSuccess(true);
      setLeaveTasks([]);
      setShiftToPerson('');
      setLeaveRemark('');
      // Re-fetch user details to reflect the "on leave" status immediately
      dispatch(userDetails());
    } catch (err) {
      console.error('Error shifting tasks:', err);
      showToast('Error shifting tasks. Please try again.', 'error');
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleResetLeave = () => {
    setLeavePersonId('');
    setLeavePersonName('');
    setLeaveRemark('');
    setLeaveStartDate('');
    setLeaveEndDate('');
    setLeaveTasks([]);
    setShiftToPerson('');
    setLeaveSuccess(false);
    setHasFetched(false);
  };

  // Add to your existing handleTabChange function
  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'users') {
      dispatch(userDetails());
      dispatch(departmentOnlyDetails());
    } else if (tab === 'departments') {
      // Fetch data based on activeDeptSubTab
      if (activeDeptSubTab === 'departments') {
        dispatch(departmentDetails());
      } else if (activeDeptSubTab === 'givenBy') {
        dispatch(givenByDetails());
      }
    } else if (tab === 'categories') {
      dispatch(customDropdownDetails());
    }
  };

  // Add to your handleAddButtonClick function





  // Sample data
  // const [users, setUsers] = useState([
  //   {
  //     id: '1',
  //     username: 'john_doe',
  //     email: 'john@example.com',
  //     password: '********',
  //     department: 'IT',
  //     givenBy: 'admin',
  //     phone: '1234567890',
  //     role: 'user',
  //     status: 'active'
  //   },
  //   {
  //     id: '2',
  //     username: 'jane_smith',
  //     email: 'jane@example.com',
  //     password: '********',
  //     department: 'HR',
  //     givenBy: 'admin',
  //     phone: '0987654321',
  //     role: 'admin',
  //     status: 'active'
  //   }
  // ]);

  // const [departments, setDepartments] = useState([
  //   { id: '1', name: 'IT', givenBy: 'super_admin' },
  //   { id: '2', name: 'HR', givenBy: 'super_admin' },
  //   { id: '3', name: 'Finance', givenBy: 'admin' }
  // ]);

  // Form states
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    phone: '',
    employee_id: '',
    role: 'user',
    status: 'active',
    department: ''
  });

  const [deptForm, setDeptForm] = useState({
    name: '',
    givenBy: '',
    partName: '',
    machineArea: ''
  });
  const [inputParts, setInputParts] = useState(['']);

  const handleAddPartInput = () => {
    setInputParts([...inputParts, '']);
  };

  const handlePartInputChange = (index, value) => {
    const newParts = [...inputParts];
    newParts[index] = value;
    setInputParts(newParts);
  };

  const handleRemovePartInput = (index) => {
    const newParts = inputParts.filter((_, i) => i !== index);
    setInputParts(newParts);
  };

  useEffect(() => {
    dispatch(userDetails());
    dispatch(departmentDetails()); // Fetch departments on mount
    dispatch(givenByDetails()); // Fetch givenBy details on mount
    dispatch(customDropdownDetails()); // Fetch custom dropdowns on mount
  }, [dispatch])

  // In your handleAddUser function:
  // Modified handleAddUser
  const handleAddUser = async (e) => {
    e.preventDefault();
    // Auto-generate employee_id
    const generatedEmpId = `EMP-${Date.now().toString().slice(-6)}`;

    const newUser = {
      ...userForm,
      employee_id: generatedEmpId,
      user_access: userForm.department,
    };

    try {
      console.log("Creating user with payload:", newUser);
      await dispatch(createUser(newUser)).unwrap();
      resetUserForm();
      setShowUserModal(false);
      showToast("User created successfully!", "success");
      dispatch(userDetails()); // Explicitly refresh user details
    } catch (error) {
      console.error('Error adding user:', error);
      showToast("Failed to create user.", "error");
    }
  };

  // Modified handleUpdateUser
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    const updatedUser = {
      user_name: userForm.username,
      password: userForm.password,
      email_id: userForm.email,
      number: userForm.phone,
      employee_id: userForm.employee_id, // Add this line
      role: userForm.role,
      status: userForm.status,
      user_access: userForm.department,
      leave_date: userForm.leave_date || null,
      leave_end_date: userForm.leave_end_date || null,
      remark: userForm.remark || null
    };

    try {
      await dispatch(updateUser({ id: currentUserId, updatedUser })).unwrap();
      resetUserForm();
      setShowUserModal(false);
      showToast("User updated successfully!", "success");
      dispatch(userDetails()); // Explicitly refresh user details
    } catch (error) {
      console.error('Error updating user:', error);
      showToast("Failed to update user.", "error");
    }
  };

  const handleUpdateDepartment = async (e) => {
    e.preventDefault();

    if (activeTab === 'categories') {
      try {
        await dispatch(updateCustomDropdown({
          id: currentDeptId,
          category: 'Machine Name', // Force Machine Name category
          value: deptForm.givenBy
        })).unwrap();
        resetDeptForm();
        setShowDeptModal(false);
        dispatch(customDropdownDetails()); // Explicitly refresh custom dropdowns
      } catch (error) {
        console.error('Error updating category:', error);
      }
      return;
    }

    if (activeTab === 'departments') {
      if (activeDeptSubTab === 'departments') {
        const updatedDept = {
          department: deptForm.name,
          given_by: deptForm.givenBy
        };
        try {
          await dispatch(updateDepartment({ id: currentDeptId, updatedDept })).unwrap();

          // Also ensure it exists in assign_from table
          if (deptForm.givenBy) {
            try {
              await dispatch(createAssignFrom({ given_by: deptForm.givenBy })).unwrap();
            } catch (e) { }
          }
          resetDeptForm();
          setShowDeptModal(false);
          dispatch(departmentDetails()); // Explicitly refresh department details
        } catch (error) {
          console.error('Error updating department:', error);
        }
      } else if (activeDeptSubTab === 'givenBy') {
        try {
          await dispatch(updateAssignFrom({
            id: currentDeptId,
            given_by: deptForm.name
          })).unwrap();
          resetDeptForm();
          setShowDeptModal(false);
          dispatch(givenByDetails()); // Explicitly refresh givenBy details
        } catch (error) {
          console.error('Error updating assign_from:', error);
        }
      }
    }
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();

    if (activeTab === 'categories') {
      try {
        const machineName = deptForm.givenBy;
        const machineArea = deptForm.machineArea;
        const parts = inputParts.filter(p => p.trim() !== '');

        if (!machineName) {
          showToast("Machine Name is required", "error");
          return;
        }

        const entries = [];
        if (parts.length > 0) {
          parts.forEach(part => {
            entries.push({
              machine_name: machineName,
              part_name: part,
              machine_area: machineArea
            });
          });
        } else {
          entries.push({
            machine_name: machineName,
            part_name: null,
            machine_area: machineArea
          });
        }

        await dispatch(createMachineEntries(entries)).unwrap();

        resetDeptForm();
        setShowDeptModal(false);
        dispatch(customDropdownDetails()); // Explicitly refresh custom dropdowns
      } catch (error) {
        console.error('Error adding category option:', error);
      }
      return;
    }

    if (activeTab === 'departments') {
      if (activeDeptSubTab === 'givenBy') {
        try {
          await dispatch(createAssignFrom({ given_by: deptForm.name })).unwrap(); // Changed to createAssignFrom
          resetDeptForm();
          setShowDeptModal(false);
          dispatch(givenByDetails()); // Explicitly refresh givenBy details
        } catch (error) {
          console.error('Error adding assign_from:', error);
        }
      } else { // activeDeptSubTab === 'departments'
        try {
          await dispatch(createDepartment({
            department: deptForm.name,
            given_by: deptForm.givenBy
          })).unwrap(); // Pass department and given_by

          // Also ensure it exists in assign_from table
          if (deptForm.givenBy) {
            try {
              await dispatch(createAssignFrom({ given_by: deptForm.givenBy })).unwrap();
            } catch (e) { }
          }

          resetDeptForm();
          setShowDeptModal(false);
          dispatch(departmentDetails()); // Explicitly refresh department details
        } catch (error) {
          console.error('Error adding department:', error);
        }
      }
    }
  };

  // Modified handleDeleteUser
  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await dispatch(deleteUser(userId)).unwrap();
        dispatch(userDetails()); // Explicitly refresh user details
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };


  // User form handlers
  const handleUserInputChange = (e) => {
    const { name, value } = e.target;
    setUserForm(prev => ({ ...prev, [name]: value }));
  };

  // const handleAddUser = (e) => {
  //   e.preventDefault();
  //   const newUser = {
  //     ...userForm,
  //     id: (users.length + 1).toString(),
  //     password: '********'
  //   };
  //   setUsers([...users, newUser]);
  //   resetUserForm();
  //   setShowUserModal(false);
  // };
  const handleEditUser = (userId) => {
    const user = userData.find(u => u.id === userId);
    setUserForm({
      username: user.user_name,
      email: user.email_id,
      password: '', // Leave empty when editing to keep current password
      phone: user.number,
      employee_id: user.employee_id || '',
      department: user.user_access || '',
      role: user.role,
      status: user.status,
      leave_date: user.leave_date ? user.leave_date.split('T')[0] : '',
      leave_end_date: user.leave_end_date ? user.leave_end_date.split('T')[0] : '',
      remark: user.remark || ''
    });
    setCurrentUserId(userId);
    setIsEditing(true);
    setShowUserModal(true);
  };

  const handleEditDepartment = (deptId) => {
    if (activeTab === 'departments' && activeDeptSubTab === 'departments') {
      const dept = department.find(d => d.id === deptId);
      setDeptForm({
        name: dept.department,
        givenBy: dept.given_by || ''
      });
      setCurrentDeptId(deptId);
      setIsEditing(true); // Set editing mode
      setShowDeptModal(true);
    } else if (activeTab === 'departments' && activeDeptSubTab === 'givenBy') {
      const item = givenBy.find(g => g.id === deptId); // Assuming givenBy items also have an 'id'
      setDeptForm({
        name: item.given_by,
        givenBy: '' // givenBy table only has 'given_by' field, no secondary field
      });
      setCurrentDeptId(deptId);
      setIsEditing(true);
      setShowDeptModal(true);
    } else if (activeTab === 'categories') {
      const item = customDropdowns.find(c => c.id === deptId);
      setDeptForm({
        name: item.category,
        givenBy: item.value
      });
      setCurrentDeptId(deptId);
      setIsEditing(true);
      setShowDeptModal(true);
    }
  };
  // const handleUpdateUser = (e) => {
  //   e.preventDefault();
  //   setUsers(users.map(user => 
  //     user.id === currentUserId ? { ...userForm, id: currentUserId } : user
  //   ));
  //   resetUserForm();
  //   setShowUserModal(false);
  // };



  const resetUserForm = () => {
    setUserForm({
      username: '',
      email: '',
      password: '',
      phone: '',
      employee_id: '',
      department: '', // Add this line
      givenBy: '',
      role: 'user',
      status: 'active',
      leave_date: '',
      leave_end_date: '',
      remark: ''
    });
    setIsEditing(false);
    setCurrentUserId(null);
  };

  // Department form handlers
  const handleDeptInputChange = (e) => {
    const { name, value } = e.target;
    setDeptForm(prev => ({ ...prev, [name]: value }));
  };

  // const handleAddDepartment = (e) => {
  //   e.preventDefault();
  //   const newDept = {
  //     ...deptForm,
  //     id: (departments.length + 1).toString()
  //   };
  //   setDepartments([...departments, newDept]);
  //   resetDeptForm();
  //   setShowDeptModal(false);
  // };


  //   const handleUpdateDepartment = (e) => {
  //     e.preventDefault();
  //     setDepartments(departments.map(dept => 
  //       dept.id === currentDeptId ? { ...deptForm, id: currentDeptId } : dept
  //     ));
  //     resetDeptForm();
  //     setShowDeptModal(false);
  //   };


  // const handleDeleteDepartment = (deptId) => {
  //   setDepartments(department.filter(dept => dept.id !== deptId));
  // };

  const resetDeptForm = () => {
    setDeptForm({
      name: '',
      givenBy: '',
      partName: '',
      machineArea: ''
    });
    setCurrentDeptId(null);
    setIsEditing(false); // Reset editing state for department modal
    setInputParts(['']);
  };


  // User names list for dropdowns
  const userNames = (userData || []).filter(u => u && u.user_name && u.user_name !== 'admin' && u.user_name !== 'DSMC').map(u => u.user_name);


  const getStatusColor = (status) => {
    if (status === 'active') return 'bg-green-100 text-green-800';
    if (status === 'on leave' || status === 'on_leave') return 'bg-amber-100 text-amber-800';
    return 'bg-red-100 text-red-800';
  };
  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'bg-blue-100 text-blue-800';
      case 'manager': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-6">
          <h1 className="text-2xl font-bold text-purple-600">User Management System</h1>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex border border-purple-200 rounded-lg overflow-x-auto scrollbar-hide bg-white shadow-sm">
              <button
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all ${activeTab === 'users' ? 'bg-purple-600 text-white shadow-inner' : 'text-purple-600 hover:bg-purple-50'}`}
                onClick={() => {
                  handleTabChange('users');
                  dispatch(userDetails());
                }}
              >
                <User size={16} />
                <span>Users</span>
              </button>
              <button
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-l border-purple-100 transition-all ${activeTab === 'departments' ? 'bg-purple-600 text-white shadow-inner' : 'text-purple-600 hover:bg-purple-50'}`}
                onClick={() => {
                  handleTabChange('departments');
                  dispatch(departmentDetails());
                  dispatch(givenByDetails());
                }}
              >
                <Building size={16} />
                <span>Departments</span>
              </button>
              <button
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-l border-purple-100 transition-all ${activeTab === 'leave' ? 'bg-purple-600 text-white shadow-inner' : 'text-purple-600 hover:bg-purple-50'}`}
                onClick={() => handleTabChange('leave')}
              >
                <Calendar size={16} />
                <span>Leave</span>
              </button>
              <button
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-l border-purple-100 transition-all ${activeTab === 'categories' ? 'bg-purple-600 text-white shadow-inner' : 'text-purple-600 hover:bg-purple-50'}`}
                onClick={() => handleTabChange('categories')}
              >
                <Settings size={16} />
                <span>Machines</span>
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="p-2.5 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-all disabled:opacity-50"
                title="Refresh Status"
              >
                <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
              </button>

              {(activeTab === 'users' || activeTab === 'departments' || activeTab === 'categories') && (
                <button
                  onClick={() => {
                    if (activeTab === 'categories') {
                      resetDeptForm();
                      setShowDeptModal(true);
                    } else {
                      handleAddButtonClick();
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg font-bold shadow-md hover:bg-purple-700 transition-all text-sm"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">
                    {activeTab === 'users' ? 'New User' :
                      activeTab === 'departments' ?
                        (activeDeptSubTab === 'departments' ? 'New Department' : 'New Assign From') :
                        'New Machine'}
                  </span>
                  <span className="sm:hidden">Add</span>
                </button>
              )}
            </div>
          </div>
        </div>
        {/* <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h3 className="text-sm font-medium text-yellow-800">Debug Info</h3>
        <p className="text-xs text-yellow-700">
          Total Users: {userData?.length || 0} | 
          Active: {userData?.filter(u => u && u.status === 'active').length || 0} | 
          Inactive: {userData?.filter(u => u && u.status === 'inactive').length || 0}
        </p>
        <div className="text-[10px] text-gray-400 mt-1 truncate">
          Employee IDs in DB: {userData?.filter(u => u && u.employee_id).map(u => u.employee_id).join(', ') || 'None'}
        </div>
      </div> */}


        {/* Leave Management Tab */}
        {activeTab === 'leave' && (
          <div className="space-y-5">
            {/* Step 1: Leave Form */}
            <div className="bg-white shadow rounded-xl border border-purple-200 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-purple-700">Leave Management</h2>
                  <p className="text-xs text-purple-500 mt-0.5">Reassign tasks to a substitute during leave period</p>
                </div>
                {(leaveTasks.length > 0 || leaveSuccess) && (
                  <button onClick={handleResetLeave} className="text-xs text-purple-600 border border-purple-200 rounded-lg px-3 py-1.5 hover:bg-purple-50 font-semibold transition-all">
                    ↺ Start Over
                  </button>
                )}
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Person on Leave */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Person on Leave</label>
                    <select
                      value={leavePersonId}
                      onChange={e => {
                        const id = e.target.value;
                        const user = userData.find(u => u.id.toString() === id.toString());
                        setLeavePersonId(id);
                        setLeavePersonName(user ? user.user_name : '');
                        setLeaveTasks([]);
                      }}
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                    >
                      <option value="">Select person...</option>
                      {userData && [...userData].filter(u => u && u.user_name).sort((a, b) => a.user_name.localeCompare(b.user_name)).map(user => (
                        <option key={user.id} value={user.id}>{user.user_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Remark Field */}
                  <div className="md:col-span-2 relative">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Leave Remark / Reason</label>
                    <input
                      type="text"
                      value={leaveRemark}
                      onChange={e => setLeaveRemark(e.target.value)}
                      placeholder="e.g. Family function, Sick leave..."
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                    />
                  </div>

                  {/* Leave Start Date */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Leave Start Date</label>
                    <button
                      ref={startBtnRef}
                      type="button"
                      onClick={() => {
                        const rect = startBtnRef.current?.getBoundingClientRect();
                        if (rect) setStartCalendarPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
                        setShowStartCalendar(!showStartCalendar);
                        setShowEndCalendar(false);
                      }}
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-left flex justify-between items-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      <span className={leaveStartDate ? 'text-gray-800' : 'text-gray-400'}>
                        {leaveStartDate ? formatDateLong(new Date(leaveStartDate)) : 'Select date'}
                      </span>
                      <Calendar size={14} className="text-gray-400" />
                    </button>
                    {showStartCalendar && createPortal(
                      <div style={{ position: 'fixed', top: startCalendarPos.top, left: startCalendarPos.left, zIndex: 9999 }}>
                        <CalendarComponent
                          date={leaveStartDate ? new Date(leaveStartDate) : null}
                          onChange={date => { setLeaveStartDate(formatDateISO(date)); setShowStartCalendar(false); setLeaveTasks([]); }}
                          onClose={() => setShowStartCalendar(false)}
                        />
                      </div>,
                      document.body
                    )}
                  </div>

                  {/* Leave End Date */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Leave End Date</label>
                    <button
                      ref={endBtnRef}
                      type="button"
                      onClick={() => {
                        const rect = endBtnRef.current?.getBoundingClientRect();
                        if (rect) setEndCalendarPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
                        setShowEndCalendar(!showEndCalendar);
                        setShowStartCalendar(false);
                      }}
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-left flex justify-between items-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      <span className={leaveEndDate ? 'text-gray-800' : 'text-gray-400'}>
                        {leaveEndDate ? formatDateLong(new Date(leaveEndDate)) : 'Select date'}
                      </span>
                      <Calendar size={14} className="text-gray-400" />
                    </button>
                    {showEndCalendar && createPortal(
                      <div style={{ position: 'fixed', top: endCalendarPos.top, left: endCalendarPos.left, zIndex: 9999 }}>
                        <CalendarComponent
                          date={leaveEndDate ? new Date(leaveEndDate) : null}
                          onChange={date => { setLeaveEndDate(formatDateISO(date)); setShowEndCalendar(false); setLeaveTasks([]); }}
                          onClose={() => setShowEndCalendar(false)}
                        />
                      </div>,
                      document.body
                    )}
                  </div>

                  {/* Fetch Button */}
                  <div className="flex items-end">
                    <button
                      onClick={handleFetchLeaveTasks}
                      disabled={leaveTasksLoading || !leavePersonName || !leaveStartDate || !leaveEndDate}
                      className="w-full py-2.5 px-4 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {leaveTasksLoading ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Fetching...</>
                      ) : 'Show Tasks'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Success Banner */}
            {leaveSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-lg">✓</div>
                <div>
                  <p className="text-green-800 font-bold text-sm">Tasks shifted successfully!</p>
                  <p className="text-green-600 text-xs mt-0.5">All tasks have been reassigned to <strong>{shiftToPerson || 'the substitute'}</strong> and will appear in their task panel.</p>
                </div>
              </div>
            )}

            {/* Step 2: Tasks Preview + Shift */}
            {leaveTasks.length > 0 && !leaveSuccess && (
              <div className="bg-white shadow rounded-xl border border-purple-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-blue-800">Tasks During Leave Period</h3>
                    <p className="text-xs text-blue-500 mt-0.5">
                      {leaveTasks.length} task(s) found for <strong>{leavePersonName}</strong> between {leaveStartDate} and {leaveEndDate}
                    </p>
                  </div>

                  {/* Shift To + Confirm */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div>
                      <select
                        value={shiftToPerson}
                        onChange={e => setShiftToPerson(e.target.value)}
                        className="border border-blue-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white min-w-[180px]"
                      >
                        <option value="">Shift to person...</option>
                        {userNames.filter(n => n !== leavePersonName).map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleShiftTasks}
                      disabled={leaveSubmitting || !shiftToPerson}
                      className="py-2 px-5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {leaveSubmitting ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Shifting...</>
                      ) : '✓ Confirm Shift'}
                    </button>
                  </div>
                </div>

                <div className="overflow-auto max-h-[400px]">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Task</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Given By</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {leaveTasks.map((task, idx) => (
                        <tr key={`lt-${task.task_id}-${idx}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-800 max-w-xs truncate">{task.task_description}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${task._table === 'checklist' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                              {task._table === 'checklist' ? 'Checklist' : 'Delegation'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {task.task_start_date ? new Date(task.task_start_date).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{task.department || '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{task.given_by || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty state after fetch */}
            {!leaveTasksLoading && hasFetched && leavePersonName && leaveStartDate && leaveEndDate && leaveTasks.length === 0 && !leaveSuccess && (
              <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 text-center">
                <Calendar size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No pending tasks found</p>
                <p className="text-gray-400 text-sm mt-1">There are no pending tasks for <strong>{leavePersonName}</strong> between the selected dates.</p>
                <button
                  onClick={handleShiftTasks}
                  disabled={leaveSubmitting}
                  className="mt-6 py-2.5 px-6 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-2 mx-auto"
                >
                  {leaveSubmitting ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Updating...</>
                  ) : 'Mark as On Leave Anyway'}
                </button>
              </div>
            )}
          </div>
        )}


        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white shadow rounded-lg overflow-hidden border border-purple-200">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple px-4 py-4 md:px-6 flex flex-col md:flex-row gap-4 md:items-center justify-between">
              <h2 className="text-lg font-bold text-purple-700">User List</h2>

              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    list="usernameOptions"
                    placeholder="Search users..."
                    value={usernameFilter}
                    onChange={(e) => setUsernameFilter(e.target.value)}
                    className="w-full sm:w-48 pl-10 pr-8 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm shadow-sm"
                  />
                  <datalist id="usernameOptions">
                    {(userData || []).filter(u => u && u.user_name).map(user => (
                      <option key={`opt-user-${user.id}`} value={user.user_name} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="max-h-[calc(100vh-250px)] overflow-auto scrollbar-thin">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Phone No.
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee ID
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Department
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(userData || [])
                      .filter(user =>
                        user &&
                        user.user_name &&
                        user.user_name !== 'admin' &&
                        user.user_name !== 'DSMC' && (
                          !usernameFilter || user.user_name.toLowerCase().includes(usernameFilter.toLowerCase()))
                      )
                      .map((user, index) => (
                        <tr key={`user-${user?.id || index}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="text-sm font-medium text-gray-900">{user?.user_name}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{user?.email_id}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{user?.number}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{user?.employee_id || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{user?.user_access || 'N/A'}</div>
                          </td>

                          {/* ADD THE STATUS CELL HERE */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <div className="flex items-center">
                                <span className={`px-2 py-1 inline-flex text-[10px] leading-4 font-bold rounded-full uppercase tracking-wider ${getStatusColor(user?.status)}`}>
                                  {user?.status === 'on_leave' ? 'On Leave' : user?.status}
                                </span>
                                {user?.status === 'active' && (
                                  <span className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm shadow-green-200" title="Live Status"></span>
                                )}
                              </div>
                              {(user?.status === 'on leave' || user?.status === 'on_leave') && user?.leave_date && (
                                <div className="flex flex-col mt-1 space-y-0.5">
                                  <span className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                    <Calendar size={10} />
                                    {new Date(user.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    {user.leave_end_date ? ` - ${new Date(user.leave_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                                  </span>
                                  {user.remark && (
                                    <span className="text-[9px] text-gray-400 italic font-medium truncate max-w-[120px]" title={user.remark}>
                                      {user.remark}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          {/* END OF STATUS CELL */}

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(user?.role)}`}>
                              {user?.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditUser(user?.id)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Edit User"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user?.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete User"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Departments Tab */}
        {activeTab === 'departments' && (
          <div className="bg-white shadow rounded-lg overflow-hidden border border-purple-200">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple px-4 py-4 md:px-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center text-center sm:text-left">
                <h2 className="text-lg font-bold text-purple-700">Department Management</h2>

                <div className="flex border border-purple-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <button
                    className={`px-4 py-2 text-xs font-bold transition-all ${activeDeptSubTab === 'departments' ? 'bg-purple-600 text-white' : 'bg-white text-purple-600 hover:bg-purple-50'}`}
                    onClick={() => {
                      setActiveDeptSubTab('departments');
                      dispatch(departmentDetails());
                    }}
                  >
                    Main Departments
                  </button>
                  <button
                    className={`px-4 py-2 text-xs font-bold border-l border-purple-100 transition-all ${activeDeptSubTab === 'givenBy' ? 'bg-purple-600 text-white' : 'bg-white text-purple-600 hover:bg-purple-50'}`}
                    onClick={() => {
                      setActiveDeptSubTab('givenBy');
                      dispatch(givenByDetails());
                    }}
                  >
                    Assign From
                  </button>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <p className="mt-2 text-gray-600">Loading...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md m-4">
                <p className="text-red-600">Error: {error}</p>
              </div>
            )}

            {/* Departments Sub-tab - Show only department names */}
            {activeDeptSubTab === 'departments' && !loading && (
              <div className="max-h-[calc(100vh-250px)] overflow-auto scrollbar-thin">
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ID
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Department Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {department && department.length > 0 ? (
                        department.map((dept, index) => (
                          <tr key={`dept-${dept.id || index}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{dept.department}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex space-x-2 justify-end">
                                <button
                                  onClick={() => handleEditDepartment(dept.id)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded-md"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm('Delete this department?')) {
                                      dispatch(deleteDepartment(dept.id));
                                    }
                                  }}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded-md"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">
                            No departments found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Given By Sub-tab - Show only given_by values */}
            {activeDeptSubTab === 'givenBy' && !loading && (
              <div className="h-[calc(100vh-275px)] overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assign From</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {givenBy && givenBy.length > 0 ? (
                      givenBy.map((item, index) => (
                        <tr key={`given-${item.id || index}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.given_by}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex space-x-2 justify-end">
                              <button onClick={() => handleEditDepartment(item.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded-md">
                                <Edit size={16} />
                              </button>
                              <button onClick={() => {
                                if (window.confirm('Delete this entry?')) {
                                  dispatch(deleteAssignFrom(item.id));
                                }
                              }} className="p-1 text-red-600 hover:bg-red-50 rounded-md">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">No data found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Machines Tab (Machine Management) */}
        {activeTab === 'categories' && (
          <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-purple-100">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-8 py-6 flex justify-between items-center border-b border-purple-100">
              <div>
                <h2 className="text-xl font-bold text-indigo-900">Machine Manager</h2>
                <p className="text-sm text-indigo-600">Add and manage machines for tasks</p>
              </div>
            </div>

            <div className="max-h-[calc(100vh-250px)] overflow-auto scrollbar-hide">
              <div className="p-6">
                {(() => {
                  // Group by Machine Name
                  const machinesByName = {};
                  const machineIds = {};

                  if (customDropdowns) {
                    customDropdowns.forEach(item => {
                      if (item.category === 'Machine Name') {
                        if (!machinesByName[item.value]) {
                          machinesByName[item.value] = { parts: [], areas: new Set(), ids: [] };
                        }
                        machinesByName[item.value].ids.push(item.id);
                      }
                    });

                    // Associate Parts and Areas
                    Object.keys(machinesByName).forEach(machineName => {
                      const ids = machinesByName[machineName].ids;
                      customDropdowns.forEach(item => {
                        if (ids.includes(item.id)) {
                          if (item.category === 'Part Name') machinesByName[machineName].parts.push(item);
                          if (item.category === 'Machine Area') machinesByName[machineName].areas.add(item.value);
                        }
                      });
                    });
                  }

                  const machineNames = Object.keys(machinesByName).sort();

                  return machineNames.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Machine Name</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Machine Area</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parts Count</th>
                          <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {machineNames.map((machineName, idx) => {
                          const data = machinesByName[machineName];
                          const isExpanded = activeDeptSubTab === `expanded-${idx}`;

                          return (
                            <React.Fragment key={idx}>
                              <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setActiveDeptSubTab(isExpanded ? '' : `expanded-${idx}`)}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                                  <ChevronDown size={16} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  {machineName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {[...data.areas].join(', ') || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  <span className="bg-indigo-100 text-indigo-800 py-0.5 px-2.5 rounded-full text-xs font-medium">
                                    {data.parts.length} parts
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (window.confirm(`Delete machine "${machineName}" and all its parts?`)) {
                                        data.ids.forEach(id => dispatch(deleteCustomDropdown(id)));
                                      }
                                    }}
                                    className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-gray-50/50">
                                  <td colSpan="4" className="px-6 py-4">
                                    <div className="pl-6 border-l-2 border-indigo-200">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Associated Parts</p>
                                      <div className="flex flex-wrap gap-2">
                                        {data.parts.length > 0 ? data.parts.map(part => (
                                          <span key={part.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-md border border-gray-200 shadow-sm">
                                            {part.value}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Delete part "${part.value}"?`)) {
                                                  dispatch(deleteCustomDropdown(part.id));
                                                }
                                              }}
                                              className="text-gray-400 hover:text-red-600 transition-colors"
                                            >
                                              <X size={12} />
                                            </button>
                                          </span>
                                        )) : (
                                          <span className="text-sm text-gray-400 italic">No parts added for this machine</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Settings size={48} className="text-gray-200 mb-4" />
                      <p className="text-gray-500 font-medium">No machines found</p>
                      <p className="text-gray-400 text-sm mt-1">Add a new machine to get started</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}


        {/* User Modal */}
        {showUserModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => setShowUserModal(false)}
            ></div>

            <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden transform transition-all border border-purple-100 flex flex-col max-h-[90vh]">
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-8 py-6 flex justify-between items-center border-b border-purple-100">
                <h3 className="text-xl font-bold text-indigo-900">
                  {isEditing ? 'Edit User Profile' : 'Create New User'}
                </h3>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar">
                <form onSubmit={isEditing ? handleUpdateUser : handleAddUser} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="username" className="block text-sm font-bold text-gray-700 ml-1">Username</label>
                      <input
                        type="text"
                        name="username"
                        id="username"
                        value={userForm.username}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                        placeholder="Enter username"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="email" className="block text-sm font-bold text-gray-700 ml-1">Email Address</label>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        value={userForm.email}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                        placeholder="Enter email address"
                      />
                    </div>

                    {!isEditing && (
                      <div className="space-y-2">
                        <label htmlFor="password" className="block text-sm font-bold text-gray-700 ml-1">Password</label>
                        <input
                          type="password"
                          name="password"
                          id="password"
                          value={userForm.password}
                          onChange={handleUserInputChange}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="phone" className="block text-sm font-bold text-gray-700 ml-1">Phone Number</label>
                      <input
                        type="tel"
                        name="phone"
                        id="phone"
                        value={userForm.phone}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                        placeholder="+91 00000 00000"
                      />
                    </div>

                    {isEditing && (
                      <div className="space-y-2">
                        <label htmlFor="employee_id" className="block text-sm font-bold text-gray-700 ml-1">Employee ID</label>
                        <input
                          type="text"
                          name="employee_id"
                          id="employee_id"
                          value={userForm.employee_id}
                          readOnly
                          className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="role" className="block text-sm font-bold text-gray-700 ml-1">User Role</label>
                      <select
                        id="role"
                        name="role"
                        value={userForm.role}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                      </select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label htmlFor="department" className="block text-sm font-bold text-gray-700 ml-1">Department Assigned</label>
                      <select
                        id="department"
                        name="department"
                        value={userForm.department}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                      >
                        <option value="">Choose a department...</option>
                        {department && department.length > 0 ? (
                          [...new Set(department.map(dept => dept.department))]
                            .filter(Boolean)
                            .map((deptName, index) => (
                              <option key={index} value={deptName}>{deptName}</option>
                            ))
                        ) : null}
                      </select>
                    </div>

                    {isEditing && (
                      <>
                        <div className="md:col-span-2 border-t border-gray-100 pt-4 mt-2">
                          <h4 className="text-sm font-bold text-indigo-900 mb-4 px-1">Leave & Status Management</h4>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="status" className="block text-sm font-bold text-gray-700 ml-1">User Status</label>
                          <select
                            id="status"
                            name="status"
                            value={userForm.status}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="on_leave">On Leave</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="leave_date" className="block text-sm font-bold text-gray-700 ml-1">Leave Start Date</label>
                          <input
                            type="date"
                            id="leave_date"
                            name="leave_date"
                            value={userForm.leave_date}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="leave_end_date" className="block text-sm font-bold text-gray-700 ml-1">Leave End Date</label>
                          <input
                            type="date"
                            id="leave_end_date"
                            name="leave_end_date"
                            value={userForm.leave_end_date}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label htmlFor="remark" className="block text-sm font-bold text-gray-700 ml-1">Remark / Reason</label>
                          <textarea
                            id="remark"
                            name="remark"
                            value={userForm.remark}
                            onChange={handleUserInputChange}
                            rows="2"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none"
                            placeholder="Enter any remarks or leave reason..."
                          ></textarea>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-6">
                    <button
                      type="button"
                      onClick={() => setShowUserModal(false)}
                      className="px-6 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-8 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                    >
                      <Save size={18} />
                      {isEditing ? 'Save Changes' : 'Create User'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Department / Category Modal */}
        {showDeptModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => setShowDeptModal(false)}
            ></div>

            <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-purple-100 transform transition-all">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-8 py-6 flex justify-between items-center border-b border-purple-100">
                <h3 className="text-xl font-bold text-purple-900">
                  {activeTab === 'categories'
                    ? (isEditing ? 'Edit Machine' : 'Add New Machine')
                    : (activeDeptSubTab === 'givenBy'
                      ? (isEditing ? 'Edit Assign From' : 'Create New Assign From')
                      : (isEditing ? 'Edit Department' : 'Create New Department'))}
                </h3>
                <button
                  onClick={() => setShowDeptModal(false)}
                  className="p-2 text-gray-400 hover:text-purple-600 hover:bg-white rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 md:p-8 overflow-y-auto">
                <form onSubmit={isEditing ? handleUpdateDepartment : handleAddDepartment} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="givenBy" className="block text-sm font-bold text-gray-700 ml-1">
                      {activeTab === 'categories' ? 'Machine Name' :
                        activeDeptSubTab === 'givenBy' ? 'Assign From Name' : 'Department Name'}
                    </label>
                    {activeTab === 'categories' ? (
                      <input
                        type="text"
                        name="givenBy" // Using givenBy as the value field for categories
                        id="givenBy"
                        value={deptForm.givenBy}
                        onChange={handleDeptInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        placeholder="Enter machine name..."
                      />
                    ) : (
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={deptForm.name}
                        onChange={handleDeptInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        placeholder={activeDeptSubTab === 'givenBy' ? 'e.g. CEO' : 'e.g. Marketing'}
                      />
                    )}
                  </div>


                  {deptForm.name === "Temperature" && (
                    <p className="text-xs text-amber-600 ml-1 mt-1 font-bold">
                      ⚠️ Temperature strictly uses: 'Low', 'Medium', 'High'
                    </p>
                  )}

                  {activeTab === 'categories' && !isEditing && (
                    <>
                      <div className="space-y-2 pt-2">
                        <label className="block text-sm font-bold text-gray-700 ml-1">
                          Part Names <span className="text-gray-400 font-normal text-xs">(Add multiple parts)</span>
                        </label>
                        <div className="space-y-2">
                          {inputParts.map((part, index) => (
                            <div key={index} className="flex gap-2">
                              <input
                                type="text"
                                value={part}
                                onChange={(e) => handlePartInputChange(index, e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-all"
                                placeholder={`Part #${index + 1}`}
                              />
                              {inputParts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePartInput(index)}
                                  className="p-2 text-red-400 hover:bg-red-50 rounded-lg"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={handleAddPartInput}
                          className="mt-2 text-sm text-purple-600 font-bold hover:text-purple-800 flex items-center gap-1"
                        >
                          <Plus size={16} /> Add Another Part
                        </button>
                      </div>

                      <div className="space-y-2 pt-2">
                        <label htmlFor="machineArea" className="block text-sm font-bold text-gray-700 ml-1">
                          Machine Area <span className="text-gray-400 font-normal text-xs">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          name="machineArea"
                          id="machineArea"
                          value={deptForm.machineArea}
                          onChange={handleDeptInputChange}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                          placeholder="Enter machine area..."
                        />
                      </div>
                    </>
                  )}



                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowDeptModal(false)}
                      className="px-6 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-8 py-2.5 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-100 transition-all flex items-center gap-2"
                    >
                      <Save size={18} />
                      {activeTab === 'categories'
                        ? (currentDeptId ? 'Update Category' : 'Save Category')
                        : (currentDeptId ? 'Update Department' : 'Save Department')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout >
  );
};

export default Setting;
