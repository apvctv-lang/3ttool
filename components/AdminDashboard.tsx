
import React, { useState, useEffect, useCallback } from 'react';
import { X, Users, RefreshCw, CheckCircle2, AlertCircle, Shield, MoreHorizontal, Search, Globe, Clock, Circle, Store, Upload, Plus, Image as ImageIcon, LayoutGrid, HardDrive, MousePointer2, Trash2, Loader2, Settings } from 'lucide-react';
import { getUsers, updateUserPermission, saveMockupToSheet, getMockupsFromSheet } from '../services/googleSheetService';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  currentPermissions: string;
}

interface UserData {
  username: string;
  createdAt: string;
  permissions: string;
  lastIp?: string;
  lastLogin?: string;
  lastActive?: string;
  currentStatus?: string;
}

const PERMISSION_OPTIONS = [
  { value: 'PENDING', label: 'Pending Approval', color: 'bg-amber-900/30 text-amber-500 border-amber-900' },
  { value: 'POD', label: 'POD Only', color: 'bg-indigo-900/30 text-indigo-400 border-indigo-900' },
  { value: 'TSHIRT', label: 'T-Shirt Only', color: 'bg-purple-900/30 text-purple-400 border-purple-900' },
  { value: 'MOCKUP_UPLOADER', label: 'Mockup Uploader (User)', color: 'bg-teal-900/30 text-teal-400 border-teal-900' },
  { value: 'MOCKUP_ADMIN', label: 'Mockup Manager', color: 'bg-orange-900/30 text-orange-400 border-orange-900' },
  { value: 'ALL', label: 'All Access', color: 'bg-green-900/30 text-green-400 border-green-900' },
  { value: 'ADMIN', label: 'Admin', color: 'bg-red-900/30 text-red-400 border-red-900' },
  { value: 'BLOCK', label: 'Blocked', color: 'bg-slate-700 text-slate-400 border-slate-600' },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose, currentUser, currentPermissions }) => {
  const isAdmin = currentPermissions === 'ADMIN' || currentUser.trim().toLowerCase() === 'admin';
  const isMockupAdmin = currentPermissions === 'MOCKUP_ADMIN';
  const isMockupUploader = currentPermissions === 'MOCKUP_UPLOADER';

  const [activeTab, setActiveTab] = useState<'users' | 'mockups'>(isAdmin ? 'users' : 'mockups');
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  // Mockup Upload State
  const [storeName, setStoreName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const fetchUsers = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getUsers();
      if (res.status === 'success' && res.users) {
        setUsers(res.users);
      } else {
        setError(res.message || "Failed to fetch users");
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'users' && isAdmin) {
      fetchUsers();
    }
  }, [isOpen, activeTab, isAdmin]);

  const handlePermissionChange = async (username: string, newPerm: string) => {
    setUpdatingUser(username);
    try {
      const res = await updateUserPermission(username, newPerm);
      if (res.status === 'success') {
        setUsers(users.map(u => u.username === username ? { ...u, permissions: newPerm } : u));
      } else {
        alert("Update failed: " + res.message);
      }
    } catch (e) {
      alert("Update failed due to network error");
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      setPendingFiles(prev => [...prev, ...files]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Xử lý tải lên hàng loạt Mockup (Xác nhận thủ công)
   */
  const startMockupUpload = async () => {
    if (pendingFiles.length === 0) return;
    if (!storeName.trim()) {
      alert("Vui lòng nhập tên Store trước khi upload hình ảnh.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus(`Bắt đầu tải ${pendingFiles.length} ảnh...`);

    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setUploadStatus(`Đang tải ${i + 1}/${pendingFiles.length}: ${file.name}`);
        
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await saveMockupToSheet(storeName.trim(), file.name, base64, currentUser);
        
        if (res.status === 'error') {
          console.warn(`Lỗi file ${file.name}:`, res.message);
        }

        setUploadProgress(Math.round(((i + 1) / pendingFiles.length) * 100));
      }

      setUploadStatus("Hoàn tất tải lên!");
      setPendingFiles([]);
      setStoreName('');
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (err: any) {
      alert("Lỗi upload: " + err.message);
      setUploadStatus("Gặp lỗi khi tải lên.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      setPendingFiles(prev => [...prev, ...files]);
    }
  };

  const isUserOnline = (user: UserData) => {
    if (user.currentStatus === 'Offline') return false;
    if (!user.lastActive) return false;
    const lastActive = new Date(user.lastActive).getTime();
    const now = new Date().getTime();
    return (now - lastActive) / 1000 / 60 < 10;
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.lastIp && u.lastIp.includes(searchTerm))
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl border border-slate-800 h-[85vh] flex flex-col overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950">
            <div className="flex items-center space-x-6">
              <h3 className="text-xl font-bold text-slate-200 flex items-center">
                <Shield className="w-6 h-6 mr-2 text-indigo-500" />
                {isAdmin ? 'Admin System Control' : (isMockupUploader ? 'User Mockup Upload Center' : 'Asset Management Center')}
              </h3>
              
              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                {isAdmin && (
                  <button 
                    onClick={() => setActiveTab('users')}
                    className={`flex items-center px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Users size={14} className="mr-2" />
                    User Management
                  </button>
                )}
                {(isAdmin || isMockupAdmin || isMockupUploader) && (
                  <button 
                    onClick={() => setActiveTab('mockups')}
                    className={`flex items-center px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'mockups' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Store size={14} className="mr-2" />
                    Store & Mockup
                  </button>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors">
              <X size={20} />
            </button>
          </div>

          {activeTab === 'users' && isAdmin ? (
            <>
              {/* User Controls */}
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900/50">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 text-slate-500 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search user or IP..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:border-indigo-500 outline-none"
                    />
                </div>
                <button 
                    onClick={fetchUsers}
                    disabled={loading}
                    className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                >
                    <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh List
                </button>
              </div>

              {/* User Table */}
              <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700">
                 <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-950 sticky top-0 z-10">
                         <tr>
                             <th className="p-4 text-xs font-bold text-slate-500 uppercase border-b border-slate-800">User / Status</th>
                             <th className="p-4 text-xs font-bold text-slate-500 uppercase border-b border-slate-800">Role</th>
                             <th className="p-4 text-xs font-bold text-slate-500 uppercase border-b border-slate-800">Last IP</th>
                             <th className="p-4 text-xs font-bold text-slate-500 uppercase border-b border-slate-800">Activity</th>
                             <th className="p-4 text-xs font-bold text-slate-500 uppercase border-b border-slate-800 text-right">Actions</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                         {loading && users.length === 0 ? (
                             <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading users...</td></tr>
                         ) : error ? (
                             <tr><td colSpan={5} className="p-8 text-center text-red-500">{error}</td></tr>
                         ) : filteredUsers.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-500">No users found.</td></tr>
                         ) : (
                             filteredUsers.map((user) => {
                                 const currentPerm = PERMISSION_OPTIONS.find(p => p.value === user.permissions) || PERMISSION_OPTIONS[0];
                                 const isMe = user.username === currentUser;
                                 const online = isUserOnline(user);

                                 return (
                                     <tr key={user.username} className="hover:bg-slate-800/50 transition-colors">
                                         <td className="p-4">
                                             <div className="flex items-center">
                                                 <div className="relative">
                                                     <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold mr-3 border border-slate-700">
                                                         {user.username.charAt(0).toUpperCase()}
                                                     </div>
                                                     <div className={`absolute -bottom-1 right-2 w-3 h-3 border-2 border-slate-900 rounded-full ${online ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                                                 </div>
                                                 <div>
                                                     <div className="font-medium text-slate-200 flex items-center">
                                                         {user.username}
                                                         {isMe && <span className="ml-2 text-[10px] text-indigo-400 bg-indigo-900/20 px-1.5 py-0.5 rounded">You</span>}
                                                     </div>
                                                     <div className={`text-xs flex items-center ${online ? 'text-green-400 font-bold' : 'text-slate-500'}`}>
                                                         {online ? 'Online' : 'Offline'}
                                                     </div>
                                                 </div>
                                             </div>
                                         </td>
                                         <td className="p-4">
                                             <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${currentPerm.color}`}>
                                                 {currentPerm.label}
                                             </span>
                                         </td>
                                         <td className="p-4">
                                             <div className="flex items-center text-sm text-slate-400 font-mono bg-slate-950 px-2 py-1 rounded w-fit border border-slate-800">
                                                 <Globe size={12} className="mr-2 text-slate-600" />
                                                 {user.lastIp || 'Unknown'}
                                             </div>
                                         </td>
                                         <td className="p-4 text-xs text-slate-500">
                                             <div className="flex flex-col space-y-1">
                                                <div className="flex items-center">Login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '-'}</div>
                                                <div className="flex items-center text-slate-400">Active: {user.lastActive ? new Date(user.lastActive).toLocaleTimeString() : '-'}</div>
                                             </div>
                                         </td>
                                         <td className="p-4 text-right">
                                             {!isMe && (
                                                 <select
                                                     value={user.permissions}
                                                     disabled={updatingUser === user.username}
                                                     onChange={(e) => handlePermissionChange(user.username, e.target.value)}
                                                     className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg p-2 focus:border-indigo-500 outline-none"
                                                 >
                                                     {PERMISSION_OPTIONS.map(opt => (
                                                         <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                     ))}
                                                 </select>
                                             )}
                                         </td>
                                     </tr>
                                 );
                             })
                         )}
                     </tbody>
                 </table>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-auto p-8 bg-slate-900/30 flex flex-col items-center">
               <div className="max-w-xl w-full space-y-8 animate-fade-in">
                  <div className="text-center">
                      <div className="inline-flex p-4 bg-purple-900/20 rounded-2xl border border-purple-500/30 text-purple-400 mb-4">
                        <HardDrive size={32} />
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-2">Quản lý Store & Mockup</h2>
                      <p className="text-slate-500 text-sm">Thêm các bộ sưu tập mẫu áo mới để người dùng sử dụng khi thiết kế.</p>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-6">
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <Plus size={14} className="mr-1.5 text-purple-500" />
                            1. Tên Store (Collection)
                          </label>
                          <input 
                            type="text" 
                            placeholder="Ví dụ: Ornament 2024, T-Shirt Basic..." 
                            value={storeName}
                            onChange={(e) => setStoreName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 text-sm focus:border-purple-500 outline-none transition-colors"
                          />
                      </div>

                      <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <Upload size={14} className="mr-1.5 text-purple-500" />
                            2. Chọn hình ảnh mẫu áo
                          </label>
                          <div 
                            className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer group shadow-inner ${isDragging ? 'border-purple-500 bg-purple-900/20 scale-[1.02]' : 'border-slate-700 bg-slate-950/50 hover:border-purple-500/50'}`}
                            onClick={() => !isUploading && document.getElementById('admin-mockup-upload')?.click()}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                          >
                              <input 
                                type="file" 
                                id="admin-mockup-upload" 
                                multiple 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleFileSelect}
                                disabled={isUploading}
                              />
                              <div className={`p-4 rounded-full mb-3 transition-colors ${isDragging ? 'bg-purple-500 text-white' : 'bg-slate-900 text-slate-600 group-hover:text-purple-400'}`}>
                                <Upload size={32} />
                              </div>
                              <p className="text-sm font-bold text-slate-300 group-hover:text-white">Kéo thả ảnh vào đây hoặc nhấn để chọn</p>
                              
                              {isDragging && (
                                <div className="absolute inset-0 bg-purple-600/10 flex items-center justify-center rounded-2xl">
                                   <div className="bg-purple-600 text-white px-4 py-2 rounded-full text-xs font-bold animate-bounce shadow-lg">
                                      Thả để thêm vào danh sách
                                   </div>
                                </div>
                              )}
                          </div>
                      </div>

                      {pendingFiles.length > 0 && (
                        <div className="space-y-2 animate-fade-in">
                          <label className="text-xs font-bold text-slate-400 uppercase flex justify-between">
                            Danh sách chờ ({pendingFiles.length})
                            <button onClick={() => setPendingFiles([])} className="text-red-400 hover:text-red-300">Xoá tất cả</button>
                          </label>
                          <div className="bg-slate-950 rounded-xl border border-slate-700 p-2 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                             {pendingFiles.map((file, idx) => (
                               <div key={idx} className="flex items-center justify-between p-2 hover:bg-slate-900 rounded-lg text-xs text-slate-300 group">
                                  <div className="flex items-center truncate mr-2">
                                     <ImageIcon size={14} className="mr-2 text-slate-600" />
                                     <span className="truncate">{file.name}</span>
                                  </div>
                                  <button onClick={() => removePendingFile(idx)} className="text-slate-600 hover:text-red-500">
                                     <Trash2 size={14} />
                                  </button>
                               </div>
                             ))}
                          </div>

                          <button 
                            onClick={startMockupUpload}
                            disabled={isUploading || !storeName.trim()}
                            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold flex items-center justify-center shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                          >
                            {isUploading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Plus size={18} className="mr-2" />}
                            Xác Nhận Tải Lên {pendingFiles.length} Ảnh
                          </button>
                        </div>
                      )}

                      {isUploading && (
                          <div className="space-y-3 p-4 bg-slate-950/80 rounded-xl border border-slate-700 animate-fade-in shadow-lg">
                              <div className="flex justify-between items-center text-xs">
                                  <span className="text-purple-400 font-bold flex items-center">
                                    <RefreshCw size={12} className="mr-1.5 animate-spin" />
                                    {uploadStatus}
                                  </span>
                                  <span className="text-slate-500 font-mono">{uploadProgress}%</span>
                              </div>
                              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-300 shadow-[0_0_10px_rgba(168,85,247,0.5)]" 
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                              </div>
                          </div>
                      )}

                      {uploadStatus && !isUploading && (
                          <div className="flex items-center p-4 bg-green-950/30 border border-green-900/50 text-green-400 rounded-xl text-xs font-bold animate-fade-in">
                              <CheckCircle2 size={16} className="mr-2" />
                              {uploadStatus}
                          </div>
                      )}
                  </div>
               </div>
            </div>
          )}
          
          <div className="p-4 border-t border-slate-800 bg-slate-950 rounded-b-2xl">
              <p className="text-[10px] text-slate-600 flex items-center justify-center font-bold uppercase tracking-widest">
                ProductPerfect Admin Console • {isAdmin ? 'User & Identity Service' : (isMockupUploader ? 'User Asset Portal' : 'Cloud Asset Manager')}
              </p>
          </div>
        </div>
      </div>
    </div>
  );
};
