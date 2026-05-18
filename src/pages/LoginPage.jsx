"use client"

import { useState, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"

import { loginUser } from "../redux/slice/loginSlice"
import { LoginCredentialsApi } from "../redux/api/loginApi"
import { useMagicToast } from "../context/MagicToastContext"
import supabase from "../SupabaseClient"
import { sendPasswordResetOTP } from "../services/whatsappService"
import { KeyRound, ShieldCheck, User as UserIcon, ArrowLeft, RefreshCw, Smartphone, Store } from "lucide-react"

const LoginPage = () => {
  const navigate = useNavigate()
  const { isLoggedIn, userData, error } = useSelector((state) => state.login);
  const dispatch = useDispatch();
  const { showToast } = useMagicToast();

  const [isLoginLoading, setIsLoginLoading] = useState(false)
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  })

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotStep, setForgotStep] = useState('username') // 'username', 'otp', 'reset'
  const [forgotData, setForgotData] = useState({
    username: "",
    otp: "",
    newPassword: "",
    confirmPassword: "",
    generatedOtp: ""
  })
  const [isForgotLoading, setIsForgotLoading] = useState(false)

  // Registration Mode & Data State
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    phone: "",
    role: "User",
    shop: "",
  })
  const [isRegisterLoading, setIsRegisterLoading] = useState(false)
  const [shops, setShops] = useState([])
  const [shopsLoading, setShopsLoading] = useState(false)

  useEffect(() => {
    const fetchShops = async () => {
      setShopsLoading(true)
      try {
        const { data, error } = await supabase
          .from('shop')
          .select('shop_name')
          .order('shop_name', { ascending: true });
        if (data) {
          const uniqueShops = [...new Set(data.map(d => d.shop_name))].filter(Boolean);
          setShops(uniqueShops);
        }
      } catch (err) {
        console.error("Error fetching shops:", err);
      } finally {
        setShopsLoading(false)
      }
    };
    fetchShops();
  }, []);

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    
    if (!registerData.username.trim()) {
      showToast("Username is required", "error");
      return;
    }
    if (!registerData.password || registerData.password.length < 4) {
      showToast("Password must be at least 4 characters long", "error");
      return;
    }
    if (!registerData.phone.trim() || registerData.phone.replace(/\D/g, '').length < 10) {
      showToast("Please enter a valid 10-digit mobile number", "error");
      return;
    }
    if (!registerData.role) {
      showToast("Please select a user role", "error");
      return;
    }
    if (!registerData.shop) {
      showToast("Please select a shop", "error");
      return;
    }

    setIsRegisterLoading(true);

    try {
      // Step 1: Check if username already exists
      const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("user_name", registerData.username.trim())
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingUser) {
        showToast("Username already exists. Please choose another one.", "error");
        setIsRegisterLoading(false);
        return;
      }

      // Step 2: Insert into database
      const allPageAccess = [
        "Dashboard", "Announcements", "Quick Task", "Assign Task", 
        "Work Records", "Delegation", "Task", "Calendar", 
        "Holiday List", "Working Day Calendar", "Admin Approval", "Settings"
      ];

      // Auto-generate employee_id matching Setting.jsx generation format
      const generatedEmpId = `EMP-${Date.now().toString().slice(-6)}`;

      const insertData = {
        user_name: registerData.username.trim(),
        password: registerData.password,
        number: parseInt(registerData.phone.toString().replace(/\D/g, '')),
        role: registerData.role,
        employee_id: generatedEmpId,
        status: 'active',
        can_self_assign: false,
        shop_name: registerData.shop,
        user_access: registerData.shop,
        page_access: registerData.role.toLowerCase() === 'admin' ? allPageAccess : []
      };

      const { error: insertError } = await supabase
        .from("users")
        .insert([insertData]);

      if (insertError) throw insertError;

      showToast("Account created successfully! You can now log in.", "success");
      
      setFormData({
        username: registerData.username.trim(),
        password: "",
      });
      setRegisterData({
        username: "",
        password: "",
        phone: "",
        role: "User",
        shop: "",
      });
      setIsRegisterMode(false);
    } catch (err) {
      console.error("❌ Registration error:", err);
      showToast(err.message || "Failed to create account", "error");
    } finally {
      setIsRegisterLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoginLoading(true);
    dispatch(loginUser(formData));
  };

  useEffect(() => {
    const handleLoginSuccess = async () => {
      if (isLoggedIn && userData) {
        console.log("User Data received:", userData); // Debug log

        let designation = userData.Designation || userData.designation || "";

        // If designation is missing, try fetching it explicitly
        if (!designation && userData.user_name) {
          try {
            const { data } = await supabase
              .from('users')
              .select('Designation')
              .eq('user_name', userData.user_name || userData.username)
              .single();
            if (data) {
              designation = data.Designation || "";
            }
          } catch (err) {
            console.error("Error fetching designation:", err);
          }
        }

        // Store all user data in localStorage
        localStorage.setItem('user-name', userData.user_name || userData.username || "");
        localStorage.setItem('user-id', userData.id || "");
        localStorage.setItem('role', userData.role || "");
        localStorage.setItem('email_id', userData.email_id || userData.email || "");
        localStorage.setItem('user_access', userData.user_access || "");
        localStorage.setItem('profile_image', userData.profile_image || "");
        localStorage.setItem('can_self_assign', userData.can_self_assign === true ? "true" : "false");
        localStorage.setItem('designation', designation);
        localStorage.setItem('page_access', JSON.stringify(userData.page_access || []));

        console.log("Stored email:", userData.email_id || userData.email); // Debug log

        showToast(`Welcome back, ${userData.user_name || userData.username}!`, "success");
        navigate("/dashboard/admin");
      } else if (error) {
        showToast(error, "error");
        setIsLoginLoading(false);
      }
    };

    handleLoginSuccess();
  }, [isLoggedIn, userData, error, navigate, showToast]);




  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="w-full max-w-md shadow-lg border border-blue-200 rounded-lg bg-white">
        <div className="space-y-1 p-4 bg-gradient-to-r from-blue-100 to-purple-100 rounded-t-lg">
          <h2 className="text-2xl font-bold text-blue-700 p-2 text-center">
            {isRegisterMode ? "TaskDesk - Sign Up" : "TaskDesk"}
          </h2>
        </div>

        {isRegisterMode ? (
          <form onSubmit={handleRegisterSubmit} className="p-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="reg-username" className="flex items-center text-blue-700 font-semibold text-sm">
                <UserIcon className="h-4 w-4 mr-2" />
                Username *
              </label>
              <input
                id="reg-username"
                name="username"
                type="text"
                placeholder="Choose a username"
                required
                value={registerData.username}
                onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-password" className="flex items-center text-blue-700 font-semibold text-sm">
                <KeyRound className="h-4 w-4 mr-2" />
                Password *
              </label>
              <input
                id="reg-password"
                name="password"
                type="password"
                placeholder="Create a password"
                required
                value={registerData.password}
                onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-phone" className="flex items-center text-blue-700 font-semibold text-sm">
                <Smartphone className="h-4 w-4 mr-2" />
                Mobile Number (WhatsApp) *
              </label>
              <input
                id="reg-phone"
                name="phone"
                type="tel"
                placeholder="e.g. 919876543210"
                required
                value={registerData.phone}
                onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-[10px] text-gray-400">Include country code without + (e.g. 91 for India)</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-shop" className="flex items-center text-blue-700 font-semibold text-sm">
                <Store className="h-4 w-4 mr-2" />
                Shop Name *
              </label>
              <select
                id="reg-shop"
                name="shop"
                required
                value={registerData.shop}
                onChange={(e) => setRegisterData({ ...registerData, shop: e.target.value })}
                className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              >
                <option value="">{shopsLoading ? "Loading shops..." : "Select a Shop"}</option>
                {shops.map((shopName, idx) => (
                  <option key={idx} value={shopName}>
                    {shopName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-role" className="flex items-center text-blue-700 font-semibold text-sm">
                <ShieldCheck className="h-4 w-4 mr-2" />
                User Role *
              </label>
              <select
                id="reg-role"
                name="role"
                required
                disabled
                value={registerData.role}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
              >
                <option value="User">User</option>
              </select>
              <p className="text-[10px] text-gray-400">All new sign-ups are registered as standard users. Admins can elevate your role later.</p>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 -mx-4 -mb-4 mt-4 rounded-b-lg flex flex-col gap-3">
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                disabled={isRegisterLoading}
              >
                {isRegisterLoading ? "Creating Account..." : "Register"}
              </button>
              <button
                type="button"
                onClick={() => setIsRegisterMode(false)}
                className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors text-center"
              >
                Already have an account? Sign In
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="flex items-center text-blue-700">
                <i className="fas fa-user h-4 w-4 mr-2"></i>
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                placeholder="Enter your username"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="flex items-center text-blue-700">
                <i className="fas fa-key h-4 w-4 mr-2"></i>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 -mx-4 -mb-4 mt-4 rounded-b-lg flex flex-col gap-3">
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                disabled={isLoginLoading}
              >
                {isLoginLoading ? "Logging in..." : "Login"}
              </button>
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Forgot Password?
                </button>
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(true)}
                  className="text-sm font-bold text-purple-600 hover:text-purple-800 transition-colors"
                >
                  Create Account
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Forgot Password Modal */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !isForgotLoading && setShowForgotModal(false)}></div>
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-blue-50">
              <div className="bg-gradient-to-br from-blue-50 to-white px-6 py-6 text-center">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  {forgotStep === 'username' && <UserIcon className="text-blue-600" size={32} />}
                  {forgotStep === 'otp' && <ShieldCheck className="text-blue-600" size={32} />}
                  {forgotStep === 'reset' && <KeyRound className="text-blue-600" size={32} />}
                </div>
                <h3 className="text-xl font-black text-gray-900 leading-tight">
                  {forgotStep === 'username' && "Find Your Account"}
                  {forgotStep === 'otp' && "Verify Identity"}
                  {forgotStep === 'reset' && "Set New Password"}
                </h3>
              </div>
              <div className="px-6 pb-8 space-y-4">
                {forgotStep === 'username' && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 text-center px-2">Enter your username. An OTP will be sent to your registered WhatsApp number.</p>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Username"
                        value={forgotData.username}
                        onChange={(e) => setForgotData({ ...forgotData, username: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                      />
                      <UserIcon className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    </div>
                    <button
                      onClick={async () => {
                        if (!forgotData.username) return showToast("Please enter username", "error");
                        setIsForgotLoading(true);
                        try {
                          const { data, error } = await supabase.from('users').select('user_name, number').eq('user_name', forgotData.username).single();
                          if (error || !data) return showToast("User not found", "error");
                          if (!data.number) return showToast("No registered phone number found for your account. Please contact the Admin to update your phone number.", "error");

                          const otp = Math.floor(100000 + Math.random() * 900000).toString();
                          await sendPasswordResetOTP(forgotData.username, otp);
                          setForgotData({ ...forgotData, generatedOtp: otp });
                          setForgotStep('otp');
                          showToast("OTP sent to your registered number via WhatsApp", "success");
                        } catch (err) {
                          showToast("Error processing request", "error");
                        } finally {
                          setIsForgotLoading(false);
                        }
                      }}
                      disabled={isForgotLoading}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isForgotLoading ? <RefreshCw className="animate-spin" size={18} /> : "Send OTP"}
                    </button>
                    <button onClick={() => setShowForgotModal(false)} className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                )}

                {forgotStep === 'otp' && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                      <Smartphone className="text-amber-600 flex-shrink-0" size={16} />
                      <p className="text-[10px] text-amber-800 font-medium">OTP has been sent to your registered WhatsApp number. Please enter the code below.</p>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Enter 6-digit OTP"
                        value={forgotData.otp}
                        onChange={(e) => setForgotData({ ...forgotData, otp: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm text-center tracking-[0.5em] font-black"
                        maxLength={6}
                      />
                      <ShieldCheck className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    </div>
                    <button
                      onClick={() => {
                        if (forgotData.otp === forgotData.generatedOtp) {
                          setForgotStep('reset');
                        } else {
                          showToast("Invalid OTP", "error");
                        }
                      }}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                    >
                      Verify OTP
                    </button>
                    <button onClick={() => setForgotStep('username')} className="w-full py-2 text-xs font-bold text-blue-600 flex items-center justify-center gap-1"><ArrowLeft size={12} /> Back to Username</button>
                  </div>
                )}

                {forgotStep === 'reset' && (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (forgotData.newPassword !== forgotData.confirmPassword) return showToast("Passwords don't match", "error");
                    if (forgotData.newPassword.length < 4) return showToast("Password too short", "error");

                    setIsForgotLoading(true);
                    try {
                      const { error } = await supabase.from('users').update({ password: forgotData.newPassword }).eq('user_name', forgotData.username);
                      if (error) throw error;
                      showToast("Password reset successfully!", "success");
                      setShowForgotModal(false);
                      setForgotStep('username');
                      setForgotData({ username: "", otp: "", newPassword: "", confirmPassword: "", generatedOtp: "" });
                    } catch (err) {
                      showToast("Error resetting password", "error");
                    } finally {
                      setIsForgotLoading(false);
                    }
                  }} className="space-y-4">
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="New Password"
                        required
                        value={forgotData.newPassword}
                        onChange={(e) => setForgotData({ ...forgotData, newPassword: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                      />
                      <KeyRound className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Confirm New Password"
                        required
                        value={forgotData.confirmPassword}
                        onChange={(e) => setForgotData({ ...forgotData, confirmPassword: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                      />
                      <ShieldCheck className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    </div>
                    <button
                      type="submit"
                      disabled={isForgotLoading}
                      className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isForgotLoading ? <RefreshCw className="animate-spin" size={18} /> : "Update Password"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="fixed left-0 right-0 bottom-0 py-1 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center text-sm shadow-md z-10">
          <a
            href="https://www.botivate.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Powered by-<span className="font-semibold">Botivate</span>
          </a>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
