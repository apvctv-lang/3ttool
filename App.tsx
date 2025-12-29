
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { ResultsPanel } from './components/ResultsPanel';
import { HistorySidebar } from './components/HistorySidebar';
import { AdminDashboard } from './components/AdminDashboard'; 
import { RedesignDetailModal } from './components/RedesignDetailModal';
import { LoginScreen } from './components/LoginScreen'; 
import { cleanupProductImage, analyzeProductDesign, generateProductRedesigns, remixProductImage, detectAndSplitCharacters, generateRandomMockup } from './services/geminiService';
import { sendDataToSheet, sendHeartbeat, logoutUser, getDesignsFromSheet } from './services/googleSheetService'; 
import { ProductAnalysis, ProcessStage, PRODUCT_TYPES, HistoryItem, DesignMode, RopeType, AppTab } from './types';
import { AlertCircle, RefreshCw, Eraser, Sparkles, Package, Wand2, Paintbrush, Shirt, LayoutGrid, LogOut, Users, Settings } from 'lucide-react';

function App() {
  // --- AUTHENTICATION STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [permissions, setPermissions] = useState<string>('POD'); 
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // --- APP STATE ---
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.POD);
  
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [generatedRedesigns, setRedesigns] = useState<string[] | null>(null);
  const [stage, setStage] = useState<ProcessStage>(ProcessStage.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [productType, setProductType] = useState<string>(PRODUCT_TYPES[0]);
  const [designMode, setDesignMode] = useState<DesignMode>(DesignMode.NEW_CONCEPT);
  
  // Remix / Detail Modal State
  const [selectedRedesignIndex, setSelectedRedesignIndex] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);

  // Undo/Redo History State
  const [redesignHistory, setRedesignHistory] = useState<Record<number, string[]>>({});
  const [redoHistory, setRedoHistory] = useState<Record<number, string[]>>({});

  // Modals State
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false); 
  
  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Heartbeat Error Tracking
  const heartbeatFails = useRef(0);

  // --- EFFECT: Check Auth Session ---
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
          username: d.username
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
    if (isHistoryOpen) {
      fetchCloudHistory();
    }
  }, [isHistoryOpen, fetchCloudHistory]);

  // --- HEARTBEAT & LOGOUT EFFECT ---
  useEffect(() => {
    let intervalId: any;
    
    const handleBeforeUnload = () => {
        if (isAuthenticated && username) {
            logoutUser(username); 
        }
    };

    const runHeartbeat = async () => {
        if (!isAuthenticated || !username || heartbeatFails.current >= 3) return;
        try {
            await sendHeartbeat(username);
            heartbeatFails.current = 0; // Reset counter on success
        } catch (err) {
            heartbeatFails.current++;
            console.warn(`Heartbeat attempt ${heartbeatFails.current} failed.`);
            if (heartbeatFails.current >= 3) {
                console.error("Heartbeat stopped due to multiple failures.");
            }
        }
    };

    if (isAuthenticated && username) {
        runHeartbeat();
        intervalId = setInterval(runHeartbeat, 300000); // 5 mins

        window.addEventListener('beforeunload', handleBeforeUnload);
    }
    
    return () => {
        if (intervalId) clearInterval(intervalId);
        window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, username]);

  // --- HANDLERS ---
  const handleLoginSuccess = (user: string, perms?: string) => {
    setUsername(user);
    setIsAuthenticated(true);
    localStorage.setItem('app_username', user);
    
    const finalPerms = perms || 'POD';
    setPermissions(finalPerms);
    localStorage.setItem('app_permissions', finalPerms);
    heartbeatFails.current = 0; // Reset counter on login

    if (finalPerms === 'TSHIRT') setActiveTab(AppTab.TSHIRT);
    else setActiveTab(AppTab.POD);
  };

  const handleLogout = () => {
    if (username) logoutUser(username);
    localStorage.removeItem('app_username');
    localStorage.removeItem('app_permissions');
    setIsAuthenticated(false);
    setUsername('');
    setPermissions('POD');
    resetState();
  };

  const addToHistory = (
    orig: string, 
    proc: string | null, 
    anal: ProductAnalysis | null, 
    redesigns: string[] | null,
    pType: string,
    dMode: DesignMode,
    rType: RopeType,
    tab: AppTab
  ) => {
    // Cloud sync happens via sendDataToSheet already called in startAnalysis
  };

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(history.filter(item => item.id !== id));
  };

  const handleLoadHistory = (item: HistoryItem) => {
    setOriginalImage(item.originalImage);
    setProcessedImage(item.processedImage);
    setAnalysis(item.analysis);
    setRedesigns(item.generatedRedesigns);
    setProductType(item.productType);
    setDesignMode(item.designMode || DesignMode.NEW_CONCEPT);
    setActiveTab(item.tab || AppTab.POD);
    setStage(ProcessStage.COMPLETE);
    setError(null);
    setIsHistoryOpen(false);
    setRedesignHistory({});
    setRedoHistory({});
  };

  const processFile = (file: File) => {
    setStage(ProcessStage.UPLOADING);
    setError(null);
    setProcessedImage(null);
    setAnalysis(null);
    setRedesigns(null);
    setRedesignHistory({});
    setRedoHistory({});

    let currentMode = designMode;
    if (activeTab === AppTab.TOOLS) {
        currentMode = DesignMode.CLEAN_ONLY;
        setDesignMode(DesignMode.CLEAN_ONLY);
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setOriginalImage(base64);
      
      if (currentMode === DesignMode.CLEAN_ONLY) {
          startQuickClean(base64);
      } else {
          startAnalysis(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQuotaError = (err: any) => {
     const errorMessage = err.message || err.toString();
     setError(errorMessage || "Service currently unavailable.");
  };

  const startQuickClean = async (image: string) => {
    try {
        setStage(ProcessStage.CLEANING);
        const cleaned = await cleanupProductImage(image);
        setProcessedImage(cleaned);
        setStage(ProcessStage.COMPLETE);
    } catch (err: any) {
        console.error(err);
        handleQuotaError(err);
        setStage(ProcessStage.IDLE);
    }
  };

  const startAnalysis = async (image: string) => {
    try {
      setStage(ProcessStage.CLEANING); 
      let cleaned = image;

      if (activeTab === AppTab.TSHIRT) {
         setProcessedImage(null); 
      } else {
         cleaned = await cleanupProductImage(image);
         setProcessedImage(cleaned);
      }
      
      setStage(ProcessStage.ANALYZING);
      const analysisResult = await analyzeProductDesign(image, productType, designMode, activeTab);
      setAnalysis(analysisResult);
      
      if (analysisResult && analysisResult.redesignPrompt) {
         setStage(ProcessStage.GENERATING);
         
         const redesigns = await generateProductRedesigns(
            analysisResult.redesignPrompt, 
            RopeType.NONE, 
            [], 
            "", 
            productType,
            false,
            activeTab,
            image 
         );
         
         setRedesigns(redesigns);
         setStage(ProcessStage.COMPLETE);
         
         const similarity = activeTab === AppTab.TSHIRT ? "50-60% (Breakthrough)" : "Auto";
         sendDataToSheet(redesigns, analysisResult.redesignPrompt, analysisResult.description || "N/A", username, productType, similarity).catch(e => console.error("Logging failed", e));
      }

    } catch (err: any) {
      console.error(err);
      handleQuotaError(err);
      if (stage !== ProcessStage.COMPLETE) {
         setStage(ProcessStage.IDLE);
      }
    }
  };

  const handleRedesignClick = (index: number) => {
    setSelectedRedesignIndex(index);
    setIsDetailModalOpen(true);
  };

  const pushToUndoHistory = (index: number, currentImage: string) => {
      setRedesignHistory(prev => ({
          ...prev,
          [index]: [...(prev[index] || []), currentImage]
      }));
      setRedoHistory(prev => ({
          ...prev,
          [index]: []
      }));
  };

  const handleUndoRedesign = (index: number) => {
      if (!generatedRedesigns) return;
      const historyStack = redesignHistory[index];
      if (!historyStack || historyStack.length === 0) return;
      const currentImage = generatedRedesigns[index];
      const previousImage = historyStack[historyStack.length - 1];
      const newHistory = historyStack.slice(0, -1);
      setRedoHistory(prev => ({ ...prev, [index]: [...(prev[index] || []), currentImage] }));
      setRedesignHistory(prev => ({ ...prev, [index]: newHistory }));
      const newRedesigns = [...generatedRedesigns];
      newRedesigns[index] = previousImage;
      setRedesigns(newRedesigns);
  };

  const handleRedoRedesign = (index: number) => {
      if (!generatedRedesigns) return;
      const redoStack = redoHistory[index];
      if (!redoStack || redoStack.length === 0) return;
      const currentImage = generatedRedesigns[index];
      const nextImage = redoStack[redoStack.length - 1];
      const newRedoStack = redoStack.slice(0, -1);
      setRedesignHistory(prev => ({ ...prev, [index]: [...(prev[index] || []), currentImage] }));
      setRedoHistory(prev => ({ ...prev, [index]: newRedoStack }));
      const newRedesigns = [...generatedRedesigns];
      newRedesigns[index] = nextImage;
      setRedesigns(newRedesigns);
  };

  const handleRemix = async (instruction: string) => {
    if (selectedRedesignIndex === null || !generatedRedesigns) return;
    setIsRemixing(true);
    try {
      const currentImage = generatedRedesigns[selectedRedesignIndex];
      pushToUndoHistory(selectedRedesignIndex, currentImage);
      const newImage = await remixProductImage(currentImage, instruction);
      const newRedesigns = [...generatedRedesigns];
      newRedesigns[selectedRedesignIndex] = newImage;
      setRedesigns(newRedesigns);
    } catch (err: any) {
      handleQuotaError(err);
    } finally {
      setIsRemixing(false);
    }
  };

  const handleUpdateRedesign = (newImage: string) => {
      if (selectedRedesignIndex === null || !generatedRedesigns) return;
      const currentImage = generatedRedesigns[selectedRedesignIndex];
      pushToUndoHistory(selectedRedesignIndex, currentImage);
      const newRedesigns = [...generatedRedesigns];
      newRedesigns[selectedRedesignIndex] = newImage;
      setRedesigns(newRedesigns);
  };

  const handleRemoveBackground = async () => {
    if (selectedRedesignIndex === null || !generatedRedesigns) return;
    setIsRemixing(true);
    try {
       const currentImage = generatedRedesigns[selectedRedesignIndex];
       pushToUndoHistory(selectedRedesignIndex, currentImage);
       const cleanedImage = await cleanupProductImage(currentImage);
       const newRedesigns = [...generatedRedesigns];
       newRedesigns[selectedRedesignIndex] = cleanedImage;
       setRedesigns(newRedesigns);
    } catch (err: any) {
       handleQuotaError(err);
    } finally {
       setIsRemixing(false);
    }
  };

  const handleSplit = async () => {
      if (selectedRedesignIndex === null || !generatedRedesigns) return [];
      const currentImage = generatedRedesigns[selectedRedesignIndex];
      return await detectAndSplitCharacters(currentImage);
  };
  
  const handleGenerateMockup = async (image: string) => {
      return await generateRandomMockup(image);
  };

  const resetState = () => {
      setStage(ProcessStage.IDLE);
      setOriginalImage(null);
      setProcessedImage(null);
      setRedesigns(null);
      setAnalysis(null);
  };

  if (isLoadingAuth) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500"><RefreshCw className="animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const isAdmin = permissions === 'ADMIN' || username.trim().toLowerCase() === 'admin';
  const isMockupManager = permissions === 'MOCKUP_ADMIN';
  const isMockupUploader = permissions === 'MOCKUP_UPLOADER';
  const canAccessAdminPanel = isAdmin || isMockupManager || isMockupUploader;

  const canAccessPOD = permissions === 'ALL' || permissions === 'POD' || isAdmin || isMockupManager || isMockupUploader;
  const canAccessTshirt = permissions === 'ALL' || permissions === 'TSHIRT' || isAdmin || isMockupManager || isMockupUploader;

  let mainTitle = "POD Product Reimagination";
  let mainDesc = "Professional AI Design Tool for POD & T-Shirts.";
  let titleGradient = "bg-gradient-to-r from-indigo-400 to-teal-400";
  
  if (activeTab === AppTab.TSHIRT) {
      mainTitle = "Professional T-Shirt Designer";
      titleGradient = "bg-gradient-to-r from-purple-400 to-pink-400";
  } else if (activeTab === AppTab.TOOLS) {
      mainTitle = "Quick AI Tools";
      mainDesc = "Rapid image processing utilities. No prompt required.";
      titleGradient = "bg-gradient-to-r from-teal-400 to-emerald-400";
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-x-hidden text-slate-200">
      <Header onHistoryClick={() => setIsHistoryOpen(true)} useUltra={false} />

      <div className="bg-slate-900 border-b border-slate-800 py-2 px-4 shadow-sm z-30 relative">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          
          <div className="flex items-center space-x-3 text-xs text-slate-400">
             <div className="flex items-center bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                <span className="text-slate-300 font-bold">{username}</span>
                {isAdmin && (
                  <span className="ml-2 px-1.5 py-0.5 bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 rounded text-[10px] font-bold">ADMIN</span>
                )}
                {isMockupManager && (
                  <span className="ml-2 px-1.5 py-0.5 bg-orange-900/50 text-orange-300 border border-orange-700/50 rounded text-[10px] font-bold">MOCKUP MANAGER</span>
                )}
                {isMockupUploader && (
                  <span className="ml-2 px-1.5 py-0.5 bg-teal-900/50 text-teal-300 border border-teal-700/50 rounded text-[10px] font-bold">MOCKUP UPLOADER</span>
                )}
             </div>
          </div>

          <div className="flex items-center space-x-3">
             {canAccessAdminPanel && (
                <button 
                  onClick={() => setIsAdminDashboardOpen(true)}
                  className="text-xs px-3 py-1.5 bg-teal-900/20 text-teal-300 hover:text-white hover:bg-teal-600 border border-teal-500/30 rounded-md font-bold transition-all flex items-center shadow-lg shadow-teal-900/10"
                >
                  {isAdmin ? <Users size={14} className="mr-1.5" /> : <Settings size={14} className="mr-1.5" />}
                  {isAdmin ? 'Manage Users' : (isMockupUploader ? 'Upload Assets' : 'Asset Management')}
                </button>
            )}
            <button 
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 bg-slate-800 text-red-400 hover:bg-red-900/20 border border-slate-700 hover:border-red-900 rounded-md font-medium transition-colors flex items-center"
            >
              <LogOut size={14} className="mr-1.5" />
              Logout
            </button>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10 mt-8 mb-4">
        <div className="flex justify-center">
            <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800 inline-flex shadow-inner">
               {canAccessPOD && (
                  <button 
                    onClick={() => { setActiveTab(AppTab.POD); setDesignMode(DesignMode.NEW_CONCEPT); resetState(); }}
                    className={`relative flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 min-w-[140px] justify-center ${activeTab === AppTab.POD ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  >
                     <LayoutGrid size={16} className={`mr-2 ${activeTab === AppTab.POD ? 'text-white' : 'text-slate-500'}`} />
                     POD System
                  </button>
               )}
               {canAccessTshirt && (
                  <button 
                    onClick={() => { setActiveTab(AppTab.TSHIRT); setDesignMode(DesignMode.NEW_CONCEPT); resetState(); }}
                    className={`relative flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 min-w-[140px] justify-center ml-1 ${activeTab === AppTab.TSHIRT ? 'bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/20 ring-1 ring-white/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  >
                     <Shirt size={16} className={`mr-2 ${activeTab === AppTab.TSHIRT ? 'text-white' : 'text-slate-500'}`} />
                     T-Shirt Studio
                  </button>
               )}
               <button 
                  onClick={() => { setActiveTab(AppTab.TOOLS); setDesignMode(DesignMode.CLEAN_ONLY); resetState(); }}
                  className={`relative flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 min-w-[140px] justify-center ml-1 ${activeTab === AppTab.TOOLS ? 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-500/20 ring-1 ring-white/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                >
                    <Eraser size={16} className={`mr-2 ${activeTab === AppTab.TOOLS ? 'text-white' : 'text-slate-500'}`} />
                    Quick Tools
                </button>
            </div>
        </div>
      </div>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full z-10">
        {stage === ProcessStage.IDLE && (
           <div className="mb-8 space-y-6 animate-fade-in">
              <div className="text-center mb-8">
                  <h2 className={`text-3xl font-bold bg-clip-text text-transparent mb-2 ${titleGradient}`}>
                     {mainTitle}
                  </h2>
                  <p className="text-slate-500 max-w-lg mx-auto">{mainDesc}</p>
              </div>
              {activeTab === AppTab.POD && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
                     <div className="flex flex-col">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center">
                            <Wand2 className="w-3 h-3 mr-1 text-purple-400" />
                            Design Goal
                        </label>
                        <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                            <button onClick={() => setDesignMode(DesignMode.NEW_CONCEPT)} className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center ${designMode === DesignMode.NEW_CONCEPT ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                                <Sparkles size={12} className="mr-1.5" />
                                New Concept
                            </button>
                            <button onClick={() => setDesignMode(DesignMode.ENHANCE_EXISTING)} className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center ${designMode === DesignMode.ENHANCE_EXISTING ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                                <Paintbrush size={12} className="mr-1.5" />
                                Enhance Existing
                            </button>
                        </div>
                     </div>
                     <div className="flex flex-col">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center">
                            <Package className="w-3 h-3 mr-1 text-blue-400" />
                            Product Type
                        </label>
                        <select value={productType} onChange={(e) => setProductType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none">
                            {PRODUCT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                     </div>
                  </div>
              )}
           </div>
        )}

        {stage === ProcessStage.IDLE ? (
          <div className="max-w-2xl mx-auto animate-fade-in delay-200"><FileUpload onFileSelect={processFile} /></div>
        ) : (
          <>
            {error && (
              <div className="mb-6 bg-red-950/30 border border-red-900/50 text-red-200 p-4 rounded-xl flex items-center shadow-lg animate-fade-in">
                <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 text-red-500" />
                <span className="text-sm font-medium">{error}</span>
                <button onClick={() => setStage(ProcessStage.IDLE)} className="ml-auto text-xs bg-red-900/50 hover:bg-red-800 px-3 py-1.5 rounded-lg border border-red-800">Try Again</button>
              </div>
            )}
            <ResultsPanel originalImage={originalImage || ''} processedImage={processedImage} analysis={analysis} generatedRedesigns={generatedRedesigns} stage={stage} activeTab={activeTab} onImageClick={handleRedesignClick} />
            {stage === ProcessStage.COMPLETE && (
               <div className="mt-8 flex justify-center animate-fade-in">
                  <button onClick={resetState} className="flex items-center px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-bold shadow-lg transition-all border border-slate-700 hover:border-indigo-500">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Start New Process
                  </button>
               </div>
            )}
          </>
        )}
      </main>

      <HistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={handleLoadHistory} onDelete={handleDeleteHistory} isLoading={isLoadingHistory} />
      <AdminDashboard isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} currentUser={username} currentPermissions={permissions} />

      {generatedRedesigns && selectedRedesignIndex !== null && (
        <RedesignDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          imageUrl={generatedRedesigns[selectedRedesignIndex]}
          onRemix={handleRemix}
          onRemoveBackground={handleRemoveBackground}
          onSplit={handleSplit}
          onGenerateMockup={handleGenerateMockup}
          onUpdateImage={handleUpdateRedesign}
          isRemixing={isRemixing}
          onUndo={() => handleUndoRedesign(selectedRedesignIndex!)}
          onRedo={() => handleRedoRedesign(selectedRedesignIndex!)}
          canUndo={(redesignHistory[selectedRedesignIndex!]?.length || 0) > 0}
          canRedo={(redoHistory[selectedRedesignIndex!]?.length || 0) > 0}
          isTShirtMode={activeTab === AppTab.TSHIRT}
        />
      )}
    </div>
  );
}

export default App;
