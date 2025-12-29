
import React, { useState } from 'react';
import { Sparkles, ArrowRight, User, Lock, Loader2, AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { loginUser, registerUser } from '../services/googleSheetService';

interface LoginScreenProps {
  onLoginSuccess: (username: string, permissions?: string, systemKey?: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isRegistering) {
        const res = await registerUser(username, password);
        if (res.status === 'success') {
          // MODIFIED: Inform user about pending status
          setSuccessMsg("Đăng ký thành công! Vui lòng chờ Admin duyệt tài khoản trước khi đăng nhập.");
          setIsRegistering(false); 
          setPassword('');
        } else {
          setError(res.message);
        }
      } else {
        const res = await loginUser(username, password);
        if (res.status === 'success') {
          // Pass systemKey from response
          onLoginSuccess(username, res.user?.permissions, res.user?.systemKey);
        } else {
          setError(res.message);
        }
      }
    } catch (err) {
      setError("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#020617]">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse delay-700"></div>
      
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-xl mb-4 shadow-indigo-500/20">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">ProductPerfect AI</h1>
          <p className="text-slate-400 mt-2">Nền tảng thiết kế sản phẩm thông minh</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
          
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
            {isRegistering ? <UserPlus className="w-5 h-5 mr-2 text-indigo-400" /> : <LogIn className="w-5 h-5 mr-2 text-indigo-400" />}
            {isRegistering ? 'Tạo tài khoản mới' : 'Đăng nhập hệ thống'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400 ml-1 uppercase">Tài khoản</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl leading-5 bg-slate-950/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all sm:text-sm"
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
            </div>

            <div className="space-y-1">
               <label className="text-xs font-medium text-slate-400 ml-1 uppercase">Mật khẩu</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl leading-5 bg-slate-950/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center p-3 text-xs text-red-200 bg-red-900/20 border border-red-900/50 rounded-lg animate-fade-in">
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

             {successMsg && (
              <div className="flex items-center p-3 text-xs text-green-200 bg-green-900/20 border border-green-900/50 rounded-lg animate-fade-in">
                <Check className="w-4 h-4 mr-2 flex-shrink-0" />
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                   {isRegistering ? 'Gửi Yêu Cầu Đăng Ký' : 'Truy Cập Ngay'}
                   <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              {isRegistering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}
              <button
                onClick={() => { setIsRegistering(!isRegistering); setError(null); setSuccessMsg(null); }}
                className="ml-2 font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {isRegistering ? 'Đăng nhập' : 'Đăng ký ngay'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Check = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
