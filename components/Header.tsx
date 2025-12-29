
import React from 'react';
import { Camera, Sparkles, History, Rocket } from 'lucide-react';

interface HeaderProps {
  onHistoryClick: () => void;
  useUltra?: boolean; // New Prop
}

export const Header: React.FC<HeaderProps> = ({ onHistoryClick, useUltra }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <Camera className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Team3T AI
          </h1>
          {useUltra && (
              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white shadow-lg shadow-purple-500/40 flex items-center border border-purple-400 animate-pulse">
                  <Rocket size={10} className="mr-1" /> PRO ULTRA
              </span>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={onHistoryClick}
            className="flex items-center space-x-2 text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors px-3 py-2 rounded-lg hover:bg-slate-800"
          >
            <History className="w-4 h-4" />
            <span>History</span>
          </button>
          <div className="hidden sm:flex items-center text-sm text-slate-500 border-l border-slate-700 pl-4 ml-2">
            <Sparkles className="w-4 h-4 mr-1 text-amber-400" />
            TH Version 1.0
          </div>
        </div>
      </div>
    </header>
  );
};
