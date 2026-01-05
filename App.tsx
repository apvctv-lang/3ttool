
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { ResultsPanel } from './components/ResultsPanel';
import { HistorySidebar } from './components/HistorySidebar';
import { AdminDashboard } from './components/AdminDashboard'; 
import { RedesignDetailModal } from './components/RedesignDetailModal';
import { LoginScreen } from './components/LoginScreen'; 
import { cleanupProductImage, analyzeProductDesign, generateProductRedesigns, remixProductImage, detectAndSplitCharacters, generateRandomMockup } from './services/geminiService';
import { sendDataToSheet, sendHeartbeat, logoutUser, getDesignsFromSheet, updateDesignInSheet, saveUserPreference, getUserPreference } from './services/googleSheetService'; 
import { ProductAnalysis, ProcessStage, PRODUCT_TYPES, HistoryItem, DesignMode, RopeType, AppTab, RetentionLevel } from './types';
import { AlertCircle, RefreshCw, Eraser, Sparkles, Package, Wand2, Paintbrush, Shirt, LayoutGrid, LogOut, Users, Settings, Target } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [permissions, setPermissions] = useState<string>('POD'); 
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.POD);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [generatedRedesigns, setRedesigns] = useState<string[] | null>(null);
  const [stage, setStage] = useState<ProcessStage>(ProcessStage.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [productType, setProductType] = useState<string>(PRODUCT_TYPES[0]);
  const [designMode, setDesignMode] = useState<DesignMode>(DesignMode.NEW_CONCEPT);
  const [retention, setRetention] = useState<RetentionLevel>('40%');
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);

  const [selectedRedesignIndex, setSelectedRedesignIndex] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [redesignHistory, setRedesignHistory] = useState<Record<number, string[]>>({});
  const [redoHistory, setRedoHistory] = useState<Record<number, string[]>>({});
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false); 
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const heartbeatFails = useRef(0);

  // Fetch user preference on login
  useEffect(() => {
    const fetchUserPrefs = async () => {
      if (isAuthenticated && username) {
        try {
          const res = await getUserPreference(username, 'retention');
          if (res.status === 'success' && res.value) {
            setRetention(res.value as RetentionLevel);
          }
        } catch (e) {
          console.warn("Failed to fetch user preferences", e);
        }
      }
    };
    fetchUserPrefs();
  }, [isAuthenticated, username]);

  useEffect(() => {
    const storedUser = localStorage.getItem('app_username');
    const storedPerms = localStorage.getItem('app_permissions');
    if (storedUser) {
      setUsername(storedUser);
      setIsAuthenticated(true);
      const perm = storedPerms || 'POD';
      setPermissions(perm);
      if (perm === 'TSHIRT') setActiveTab(AppTab.TSHIRT);
      else setActiveTab(AppTab.POD);
    }
    setIsLoadingAuth(false);
  }, []);

  const fetchCloudHistory = useCallback(async () => {
    if (!username) return;
    setIsLoadingHistory(true);
    try {
      const isAdmin = permissions === 'ADMIN' || username.trim().toLowerCase() === 'admin';
      const res = await getDesignsFromSheet(username, isAdmin);
      if (res.status === 'success' && res.data) {
        const cloudItems: HistoryItem[] = res.data.map((d: any) => ({
          id: d.id,
          timestamp: new Date(d.timestamp).getTime(),
          originalImage: d.images[0] || '',
          processedImage: d.images[0] || null,
          analysis: { description: d.description, redesignPrompt: d.prompt, designCritique: '', detectedComponents: [] },
          generatedRedesigns: d.images,
          productType: d.productType,
          designMode: DesignMode.NEW_CONCEPT,
          tab: AppTab.POD,
          username: d.username,
          retention: d.similarity
        }));
        setHistory(cloudItems);
      }
    } catch (e) {
      console.error("Failed to load history from cloud", e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [username, permissions]);

  useEffect(() => {
    if (isHistoryOpen) fetchCloudHistory();
  }, [isHistoryOpen, fetchCloudHistory]);

  useEffect(() => {
    let intervalId: any;
    const handleBeforeUnload = () => { if (isAuthenticated && username) logoutUser(username); };
    const runHeartbeat = async () => {
        if (!isAuthenticated || !username || heartbeatFails.current >= 3) return;
        try { await sendHeartbeat(username); heartbeatFails.current = 0; } 
        catch (err) { heartbeatFails.current++; }
    };
    if (isAuthenticated && username) {
        runHeartbeat();
        intervalId = setInterval(runHeartbeat, 300000);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }
    return () => { if (intervalId) clearInterval(intervalId); window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [isAuthenticated, username]);

  const handleLoginSuccess = (user: string, perms?: string, systemKey?: string) => {
    setUsername(user); setIsAuthenticated(true);
    localStorage.setItem('app_username', user);
    const finalPerms = perms || 'POD';
    setPermissions(finalPerms);
    localStorage.setItem('app_permissions', finalPerms);
    if (systemKey) localStorage.setItem('app_system_key', systemKey);
    heartbeatFails.current = 0; 
    if (finalPerms === 'TSHIRT') setActiveTab(AppTab.TSHIRT);
    else setActiveTab(AppTab.POD);
  };

  const handleLogout = () => {
    if (username) logoutUser(username);
    localStorage.removeItem('app_username'); localStorage.removeItem('app_permissions');
    setIsAuthenticated(false); setUsername(''); setPermissions('POD'); resetState();
  };

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure?")) return;
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleLoadHistory = (item: HistoryItem) => {
    setOriginalImage(item.originalImage); setProcessedImage(item.processedImage);
    setAnalysis(item.analysis); setRedesigns(item.generatedRedesigns);
    setProductType(item.productType); setDesignMode(item.designMode || DesignMode.NEW_CONCEPT);
    setActiveTab(item.tab || AppTab.POD); setCurrentDesignId(item.id);
    setStage(ProcessStage.COMPLETE); setError(null); setIsHistoryOpen(false);
    setRedesignHistory({}); setRedoHistory({});
  };

  const processFile = (file: File) => {
    setStage(ProcessStage.UPLOADING); setError(null); setProcessedImage(null); setAnalysis(null); setRedesigns(null); setCurrentDesignId(null); setRedesignHistory({}); setRedoHistory({});
    let currentMode = designMode;
    if (activeTab === AppTab.TOOLS) { currentMode = DesignMode.CLEAN_ONLY; setDesignMode(DesignMode.CLEAN_ONLY); }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setOriginalImage(base64);
      if (currentMode === DesignMode.CLEAN_ONLY) startQuickClean(base64);
      else startAnalysis(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleQuotaError = (err: any) => { const errorMessage = err.message || err.toString(); setError(errorMessage); };

  const startQuickClean = async (image: string) => {
    try { setStage(ProcessStage.CLEANING); const cleaned = await cleanupProductImage(image); setProcessedImage(cleaned); setStage(ProcessStage.COMPLETE); } 
    catch (err: any) { handleQuotaError(err); setStage(ProcessStage.IDLE); }
  };

  const startAnalysis = async (image: string) => {
    try {
      setStage(ProcessStage.CLEANING);
      let cleaned = image;
      if (activeTab !== AppTab.TSHIRT) { cleaned = await cleanupProductImage(image); setProcessedImage(cleaned); }
      
      setStage(ProcessStage.ANALYZING);
      const analysisResult = await analyzeProductDesign(image, productType, designMode, activeTab, retention);
      setAnalysis(analysisResult);
      
      if (analysisResult && analysisResult.redesignPrompt) {
         setStage(ProcessStage.GENERATING);
         const redesigns = await generateProductRedesigns(analysisResult.redesignPrompt, RopeType.NONE, [], "", productType, false, activeTab, image, retention);
         setRedesigns(redesigns);
         setStage(ProcessStage.COMPLETE);
         const simLabel = activeTab === AppTab.TSHIRT ? `Retention: ${retention}` : "Auto";
         const res = await sendDataToSheet(redesigns, analysisResult.redesignPrompt, analysisResult.description || "N/A", username, productType, simLabel);
         if (res && res.status === 'success' && res.designId) setCurrentDesignId(res.designId);
      } else { setStage(ProcessStage.COMPLETE); setError("Analysis failed to generate prompt."); }
    } catch (err: any) { handleQuotaError(err); if (stage !== ProcessStage.COMPLETE) setStage(ProcessStage.IDLE); }
  };

  const handleRetentionChange = async (val: RetentionLevel) => {
    setRetention(val);
    if (isAuthenticated && username) {
      await saveUserPreference(username, 'retention', val);
    }
  };

  const handleRedesignClick = (index: number) => { setSelectedRedesignIndex(index); setIsDetailModalOpen(true); };

  const handleUpdateImage = (newImage: string) => {
    if (generatedRedesigns && selectedRedesignIndex !== null) {
      const updated = [...generatedRedesigns];
      updated[selectedRedesignIndex] = newImage;
      setRedesigns(updated);
      if (currentDesignId && username) {
        updateDesignInSheet(username, currentDesignId, selectedRedesignIndex, newImage);
      }
    }
  };

  const resetState = () => { setStage(ProcessStage.IDLE); setOriginalImage(null); setProcessedImage(null); setRedesigns(null); setAnalysis(null); setCurrentDesignId(null); };

  if (isLoadingAuth) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500"><RefreshCw className="animate-spin" /></div>;
  if (!isAuthenticated) return <LoginScreen onLoginSuccess={handleLoginSuccess} />;

  const isAdmin = permissions === 'ADMIN' || username.trim().toLowerCase() === 'admin';
  const canAccessAdminPanel = isAdmin || permissions === 'MOCKUP_ADMIN' || permissions === 'MOCKUP_UPLOADER';
  const canAccessPOD = permissions === 'ALL' || permissions === 'POD' || isAdmin;
  const canAccessTshirt = permissions === 'ALL' || permissions === 'TSHIRT' || isAdmin;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-x-hidden text-slate-200">
      <Header onHistoryClick={() => setIsHistoryOpen(true)} useUltra={false} />
      <div className="bg-slate-900 border-b border-slate-800 py-2 px-4 shadow-sm z-30 relative">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 items-center">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            <span className="text-slate-300 font-bold text-xs">{username}</span>
          </div>
          <div className="flex items-center space-x-3">
             {canAccessAdminPanel && (
                <button onClick={() => setIsAdminDashboardOpen(true)} className="text-xs px-3 py-1.5 bg-teal-900/20 text-teal-300 hover:bg-teal-600 border border-teal-500/30 rounded-md font-bold transition-all flex items-center shadow-lg shadow-teal-900/10">
                  <Settings size={14} className="mr-1.5" /> {isAdmin ? 'Admin Panel' : 'Assets'}
                </button>
            )}
            <button onClick={handleLogout} className="text-xs px-3 py-1.5 bg-slate-800 text-red-400 border border-slate-700 rounded-md font-medium transition-colors flex items-center">
              <LogOut size={14} className="mr-1.5" /> Logout
            </button>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10 mt-8 mb-4 flex justify-center">
        <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800 inline-flex shadow-inner">
           {canAccessPOD && (
              <button onClick={() => { setActiveTab(AppTab.POD); setDesignMode(DesignMode.NEW_CONCEPT); resetState(); }} className={`relative flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 min-w-[140px] justify-center ${activeTab === AppTab.POD ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
                 <LayoutGrid size={16} className="mr-2" /> POD System
              </button>
           )}
           {canAccessTshirt && (
              <button onClick={() => { setActiveTab(AppTab.TSHIRT); setDesignMode(DesignMode.NEW_CONCEPT); resetState(); }} className={`relative flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 min-w-[140px] justify-center ml-1 ${activeTab === AppTab.TSHIRT ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
                 <Shirt size={16} className="mr-2" /> T-Shirt Studio
              </button>
           )}
        </div>
      </div>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full z-10">
        {stage === ProcessStage.IDLE && (
           <div className="mb-8 space-y-6 animate-fade-in text-center">
              <h2 className={`text-3xl font-bold bg-clip-text text-transparent mb-2 ${activeTab === AppTab.TSHIRT ? 'bg-gradient-to-r from-purple-400 to-pink-400' : 'bg-gradient-to-r from-indigo-400 to-teal-400'}`}>
                 {activeTab === AppTab.TSHIRT ? "Professional T-Shirt Designer" : "POD Product Reimagination"}
              </h2>
              <div className={`grid grid-cols-1 ${activeTab === AppTab.TSHIRT ? 'md:grid-cols-1 max-w-sm' : 'md:grid-cols-2 max-w-2xl'} gap-4 mx-auto bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg text-left`}>
                 <div className="flex flex-col">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center"><Target className="w-3 h-3 mr-1 text-purple-400" /> Aesthetic Retention</label>
                    <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                        {(['20%', '40%', '60%', '80%'] as RetentionLevel[]).map(r => (
                            <button key={r} onClick={() => handleRetentionChange(r)} className={`flex-1 py-2 text-[10px] font-bold rounded-md transition-all ${retention === r ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{r}</button>
                        ))}
                    </div>
                 </div>
                 {activeTab !== AppTab.TSHIRT && (
                   <div className="flex flex-col">
                      <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center"><Package className="w-3 h-3 mr-1 text-blue-400" /> Product Type</label>
                      <select value={productType} onChange={(e) => setProductType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none">
                          {PRODUCT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                   </div>
                 )}
              </div>
           </div>
        )}

        {stage === ProcessStage.IDLE ? (
          <div className="max-w-2xl mx-auto animate-fade-in delay-200"><FileUpload onFileSelect={processFile} /></div>
        ) : (
          <>
            {error && (
              <div className="mb-6 bg-red-950/30 border border-red-900/50 text-red-200 p-4 rounded-xl flex items-center shadow-lg animate-fade-in">
                <AlertCircle className="w-5 h-5 mr-3 text-red-500" />
                <span className="text-sm font-medium">{error}</span>
                <button onClick={() => setStage(ProcessStage.IDLE)} className="ml-auto text-xs bg-red-900/50 px-3 py-1.5 rounded-lg border border-red-800">Try Again</button>
              </div>
            )}
            <ResultsPanel 
              originalImage={originalImage || ''} 
              processedImage={processedImage} 
              analysis={analysis} 
              generatedRedesigns={generatedRedesigns} 
              stage={stage} 
              activeTab={activeTab} 
              onImageClick={handleRedesignClick} 
            />
            {stage === ProcessStage.COMPLETE && (
               <div className="mt-8 flex justify-center animate-fade-in">
                  <button onClick={resetState} className="flex items-center px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-bold shadow-lg transition-all border border-slate-700">
                    <RefreshCw className="w-4 h-4 mr-2" /> Start New Process
                  </button>
               </div>
            )}
          </>
        )}
      </main>

      <HistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={handleLoadHistory} onDelete={handleDeleteHistory} isLoading={isLoadingHistory} />
      <AdminDashboard isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} currentUser={username} currentPermissions={permissions} />
      {isDetailModalOpen && generatedRedesigns && selectedRedesignIndex !== null && (
        <RedesignDetailModal 
          isOpen={isDetailModalOpen} 
          onClose={() => setIsDetailModalOpen(false)} 
          imageUrl={generatedRedesigns[selectedRedesignIndex]} 
          onUpdateImage={handleUpdateImage}
          onRemix={async (instr) => {}}
          onRemoveBackground={async () => {}}
          onSplit={async () => []}
          onGenerateMockup={async (img) => img}
          isRemixing={false}
          isTShirtMode={activeTab === AppTab.TSHIRT}
        />
      )}
    </div>
  );
}

export default App;
