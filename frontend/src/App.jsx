import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Upload, 
  ShieldAlert, 
  MessageSquare, 
  Settings, 
  Sparkles, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  FileText, 
  ArrowRight,
  UserCheck,
  BrainCircuit,
  Search,
  Check,
  ChevronRight,
  Volume2,
  Trash2
} from 'lucide-react';

const API_BASE = 'http://localhost:5001/api';

export default function App() {
  // Application State
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [modelName, setModelName] = useState('gemini-1.5-flash');
  const [activeTab, setActiveTab] = useState('setup'); // 'setup' | 'pipeline' | 'review' | 'plagiarism'
  
  // File Upload State
  const [paperFile, setPaperFile] = useState(null);
  const [paperDetails, setPaperDetails] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [styleGuide, setStyleGuide] = useState(null);
  
  // Agent configuration State
  const [customInstructions, setCustomInstructions] = useState({
    grammarian: '',
    stylist: '',
    critic: '',
    reference_auditor: '',
    plagiarism_sentinel: ''
  });
  const [editingAgent, setEditingAgent] = useState(null); // agent profile key for modal
  const [editingText, setEditingText] = useState('');

  // Processing state
  const [processingStatus, setProcessingStatus] = useState('idle'); // 'idle' | 'analyzing_style' | 'running_pipeline' | 'completed'
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [segments, setSegments] = useState([]); // array of original text blocks
  const [processedResults, setProcessedResults] = useState([]); // array of results from backend
  const [activeAgentNode, setActiveAgentNode] = useState(null); // 'orchestrator' | 'grammarian' | 'stylist' | 'critic' | 'reference_auditor' | 'consolidation'

  // Review state
  const [selectedParagraphIdx, setSelectedParagraphIdx] = useState(null);
  
  // Standalone Plagiarism Checker State
  const [plagiPasteText, setPlagiPasteText] = useState('');
  const [plagiResult, setPlagiResult] = useState(null);
  const [plagiLoading, setPlagiLoading] = useState(false);

  // Agent profiles list
  const agentProfiles = {
    orchestrator: { name: 'The Orchestrator', role: 'Conductor', avatar: '/avatars/orchestrator.png', color: 'text-cyan-400' },
    grammarian: { name: 'The Grammarian', role: 'Lector', avatar: '/avatars/grammarian.png', color: 'text-purple-400' },
    stylist: { name: 'Academic Stylist', role: 'Rhetorician', avatar: '/avatars/stylist.png', color: 'text-pink-400' },
    critic: { name: 'Reviewer 2', role: 'Peer Reviewer', avatar: '/avatars/critic.png', color: 'text-red-400' },
    reference_auditor: { name: 'Quellen-Detektiv', role: 'Reference Auditor', avatar: '/avatars/reference_auditor.png', color: 'text-yellow-400' },
    plagiarism_sentinel: { name: 'Plagiats-Wächter', role: 'Sentinel', avatar: '/avatars/plagiarism_sentinel.png', color: 'text-green-400' }
  };

  // Sync API Key
  const handleApiKeyChange = (val) => {
    setApiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  // Fetch session state on init
  useEffect(() => {
    fetchSessionState();
  }, []);

  const fetchSessionState = async () => {
    try {
      const res = await fetch(`${API_BASE}/session-state`);
      const data = await res.json();
      setReferenceFiles(data.referenceFiles || []);
      if (data.globalStyle) setStyleGuide(data.globalStyle);
      if (data.agentCustomInstructions) setCustomInstructions(data.agentCustomInstructions);
    } catch (e) {
      console.error("Failed to load session details", e);
    }
  };

  // Upload main paper
  const handlePaperUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPaperFile(file);
    const formData = new FormData();
    formData.append('paper', file);

    try {
      const res = await fetch(`${API_BASE}/upload-paper`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setPaperDetails(data);
      
      // Split raw paper into paragraphs for segmented correction
      const paras = data.sample ? data.sample.split(/\n\n+/).filter(p => p.trim().length > 15) : [];
      // If we read the whole paper in the future, we would split the full text. For testing:
      const fullTextParas = data.textLength > 0 ? data.sample.split(/\n\n+/).filter(p => p.trim().length > 15) : [];
      setSegments(fullTextParas);
    } catch (error) {
      alert("Error uploading paper: " + error.message);
    }
  };

  // Upload reference source PDFs
  const handleReferencesUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach(file => {
      formData.append('references', file);
    });

    try {
      const res = await fetch(`${API_BASE}/upload-references`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setReferenceFiles(data.files);
    } catch (error) {
      alert("Error uploading references: " + error.message);
    }
  };

  const clearReferences = async () => {
    try {
      await fetch(`${API_BASE}/clear-references`, { method: 'POST' });
      setReferenceFiles([]);
    } catch (e) {
      console.error(e);
    }
  };

  // Open custom instructions editing modal
  const startEditingAgent = (key) => {
    setEditingAgent(key);
    setEditingText(customInstructions[key] || '');
  };

  const saveCustomInstructions = async () => {
    const updated = { ...customInstructions, [editingAgent]: editingText };
    setCustomInstructions(updated);
    setEditingAgent(null);

    try {
      await fetch(`${API_BASE}/configure-instructions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: updated })
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Phase 1: Extract Global Style Guide
  const analyzeStyleGuide = async () => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first!");
      return;
    }
    setProcessingStatus('analyzing_style');
    setActiveAgentNode('orchestrator');

    try {
      const res = await fetch(`${API_BASE}/extract-style`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ model: modelName })
      });
      const data = await res.json();
      setStyleGuide(data.styleGuide);
      setProcessingStatus('idle');
    } catch (error) {
      alert("Failed style analysis: " + error.message);
      setProcessingStatus('idle');
    }
  };

  // Run full segmented pipeline
  const runProofreaderPipeline = async () => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first!");
      return;
    }
    if (segments.length === 0) {
      alert("Please upload a paper first!");
      return;
    }

    setProcessingStatus('running_pipeline');
    setProcessedResults([]);
    setCurrentSegmentIndex(0);
    setActiveTab('pipeline');

    const results = [];
    for (let i = 0; i < segments.length; i++) {
      setCurrentSegmentIndex(i);
      
      // Cycle through active nodes visually to show pipeline stages
      setActiveAgentNode('grammarian');
      await new Promise(r => setTimeout(r, 600));
      setActiveAgentNode('stylist');
      await new Promise(r => setTimeout(r, 600));
      setActiveAgentNode('critic');
      await new Promise(r => setTimeout(r, 600));
      setActiveAgentNode('reference_auditor');
      await new Promise(r => setTimeout(r, 600));
      setActiveAgentNode('consolidation');

      try {
        const res = await fetch(`${API_BASE}/process-segment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({
            segmentText: segments[i],
            model: modelName
          })
        });

        const data = await res.json();
        results.push(data);
        setProcessedResults([...results]);
      } catch (err) {
        console.error("Segment processing error", err);
        results.push({
          originalText: segments[i],
          finalText: segments[i],
          changes: [],
          criticFeedback: "Failed to evaluate segment.",
          debateLog: [],
          referenceAudit: { status: "yellow", message: "Failed API call." }
        });
        setProcessedResults([...results]);
      }
    }

    setProcessingStatus('completed');
    setActiveTab('review');
    setSelectedParagraphIdx(0);
  };

  // Standalone Plagiarism Checker call
  const triggerPlagiarismCheck = async () => {
    if (!plagiPasteText.trim()) return;
    setPlagiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/plagiarism-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plagiPasteText })
      });
      const data = await res.json();
      setPlagiResult(data);
    } catch (e) {
      alert("Error scanning text: " + e.message);
    } finally {
      setPlagiLoading(false);
    }
  };

  // Highlight Text Diff logic
  const renderTextWithDiff = (resultItem) => {
    if (!resultItem) return null;
    let text = resultItem.finalText;
    const changes = resultItem.changes || [];
    
    if (changes.length === 0) return <span>{text}</span>;

    // A simple presentation: show what was changed in a highlights format
    let renderedElements = [];
    let lastIdx = 0;
    
    // Sort changes by occurrence or render simple badges of changes for high aesthetics
    return (
      <div className="flex flex-col gap-3">
        <p className="leading-relaxed text-[16px] text-gray-100">{text}</p>
        {changes.length > 0 && (
          <div className="mt-2 border-t border-dashed border-gray-800 pt-2">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider block mb-1">Synthesised Corrections:</span>
            <div className="flex flex-wrap gap-2">
              {changes.map((c, i) => (
                <div key={i} className="text-xs glass-panel bg-slate-900/80 px-2 py-1 flex items-center gap-1 border-gray-800">
                  <span className="diff-removed text-[10px]">{c.original}</span>
                  <ArrowRight size={10} className="text-cyan-400" />
                  <span className="diff-added text-[10px]">{c.replacement}</span>
                  <span className="text-gray-500 font-mono text-[9px] ml-1">({c.reason})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-gray-200 relative overflow-hidden flex flex-col">
      {/* Decorative Blur Backdrops */}
      <div className="bg-glow-radial"></div>
      <div className="bg-glow-radial-left"></div>

      {/* Main Premium Navbar */}
      <header className="border-b border-gray-900 bg-slate-950/65 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <BrainCircuit className="text-slate-950" size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-wide text-white flex items-center gap-2">
              Expert Panel <span className="text-xs font-semibold px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full uppercase tracking-wider">Proofreader v1.0</span>
            </h1>
            <p className="text-xs text-gray-400">Stable multi-pass scientific quality auditing</p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-4">
          {/* Key Input */}
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-gray-500" />
            <input 
              type="password"
              placeholder="Paste Gemini API Key..."
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              className="cyber-input text-xs w-[180px]"
            />
          </div>

          {/* Model selection */}
          <select 
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            className="cyber-input text-xs bg-slate-900 border-gray-800"
          >
            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Ultimate Quality)</option>
          </select>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR: Agent Panel */}
        <aside className="w-[300px] border-r border-gray-900 bg-slate-950/50 p-6 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Sparkles size={12} className="text-cyan-400" /> Active Expert Panel
            </h2>
            
            {/* Agent List */}
            <div className="flex flex-col gap-3">
              {Object.keys(agentProfiles).map((key) => {
                const profile = agentProfiles[key];
                const hasInstructions = customInstructions[key] && customInstructions[key].length > 0;

                return (
                  <div 
                    key={key} 
                    className={`glass-panel p-3 border-gray-800/80 flex items-center justify-between gap-3 relative group transition-all duration-300 hover:border-gray-700/80 ${
                      activeAgentNode === key ? 'border-cyan-500/50 shadow-md shadow-cyan-500/10' : ''
                    }`}
                  >
                    {activeAgentNode === key && (
                      <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-cyan-400 anim-pulse-glow" />
                    )}
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full border border-gray-800 overflow-hidden bg-slate-900 flex-shrink-0">
                        {/* We use inline stylized icons representing agents as avatars fallback if image not loaded */}
                        <img 
                          src={profile.avatar} 
                          alt={profile.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=80&q=80";
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-200 truncate">{profile.name}</p>
                        <p className="text-[11px] text-gray-500 font-mono">{profile.role}</p>
                      </div>
                    </div>
                    
                    {/* Settings Trigger */}
                    <button 
                      onClick={() => startEditingAgent(key)}
                      className={`h-7 w-7 rounded-lg hover:bg-slate-900 border border-transparent hover:border-gray-800 flex items-center justify-center transition-all ${
                        hasInstructions ? 'text-cyan-400 bg-cyan-400/5' : 'text-gray-500'
                      }`}
                      title="Edit instructions"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-auto border-t border-gray-900 pt-4 flex flex-col gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Current Workspace:</span>
            <span className="text-xs text-cyan-400/80 font-mono truncate" title="/Users/xepter/.../expert-panel-proofreader">
              .../expert-panel-proofreader
            </span>
          </div>
        </aside>

        {/* MAIN PANEL CONTENT */}
        <main className="flex-1 flex flex-col bg-slate-950/20 overflow-y-auto">
          {/* Main Action Tabs */}
          <div className="border-b border-gray-900 bg-slate-950/40 px-6 py-2 flex items-center gap-6">
            <button 
              onClick={() => setActiveTab('setup')}
              className={`py-3 text-sm font-semibold tracking-wide border-b-2 transition-all ${
                activeTab === 'setup' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              1. Setup & Upload
            </button>
            <button 
              onClick={() => setActiveTab('pipeline')}
              disabled={segments.length === 0}
              className={`py-3 text-sm font-semibold tracking-wide border-b-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                activeTab === 'pipeline' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              2. Orchestration Pipeline
            </button>
            <button 
              onClick={() => setActiveTab('review')}
              disabled={processedResults.length === 0}
              className={`py-3 text-sm font-semibold tracking-wide border-b-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                activeTab === 'review' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              3. Interactive Review ({processedResults.length}/{segments.length})
            </button>
            <button 
              onClick={() => setActiveTab('plagiarism')}
              className={`py-3 text-sm font-semibold tracking-wide border-b-2 transition-all ${
                activeTab === 'plagiarism' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              🛡️ Plagiarism Sentinel
            </button>
          </div>

          {/* TAB 1: SETUP & UPLOAD VIEW */}
          {activeTab === 'setup' && (
            <div className="p-8 max-w-4xl flex flex-col gap-6">
              <div className="glass-panel p-6 border-gray-900">
                <h3 className="text-md font-bold mb-1 text-white">Upload Scientific Paper</h3>
                <p className="text-xs text-gray-400 mb-4">Select your academic paper (Markdown or Text format). We split it into logical chapters/paragraphs automatically.</p>
                
                <div className="border border-dashed border-gray-800 rounded-xl p-8 bg-slate-900/20 flex flex-col items-center justify-center gap-3 hover:border-cyan-500/40 transition-all cursor-pointer relative">
                  <input 
                    type="file" 
                    accept=".txt,.md" 
                    onChange={handlePaperUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload size={32} className="text-cyan-400" />
                  <p className="text-sm font-semibold">Drag & Drop Paper here or click to browse</p>
                  <p className="text-[10px] text-gray-500">Supports .md, .txt files</p>
                </div>

                {paperDetails && (
                  <div className="mt-4 flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-gray-800">
                    <div className="flex items-center gap-2">
                      <FileText className="text-cyan-400" size={16} />
                      <div>
                        <p className="text-xs font-semibold text-gray-200">{paperFile?.name}</p>
                        <p className="text-[10px] text-gray-500">Document parsed successfully ({segments.length} paragraphs extracted)</p>
                      </div>
                    </div>
                    <CheckCircle className="text-green-500" size={16} />
                  </div>
                )}
              </div>

              <div className="glass-panel p-6 border-gray-900">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-md font-bold text-white">Source Library & References PDFs</h3>
                  {referenceFiles.length > 0 && (
                    <button 
                      onClick={clearReferences}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Clear library
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-4">Upload reference PDFs for citation claim verification and plagiarism audits. Files should match in-text citations names (e.g. Müller_2022.pdf).</p>

                <div className="border border-dashed border-gray-800 rounded-xl p-8 bg-slate-900/20 flex flex-col items-center justify-center gap-3 hover:border-cyan-500/40 transition-all cursor-pointer relative">
                  <input 
                    type="file" 
                    multiple
                    accept=".pdf" 
                    onChange={handleReferencesUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <BookOpen size={32} className="text-purple-400" />
                  <p className="text-sm font-semibold">Upload PDF references here</p>
                  <p className="text-[10px] text-gray-500">Supports multiple .pdf files</p>
                </div>

                {referenceFiles.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Reference Library ({referenceFiles.length} files):</p>
                    <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-1">
                      {referenceFiles.map((filename, i) => (
                        <span key={i} className="text-xs bg-slate-900 border border-gray-800 px-2.5 py-1 rounded-full text-gray-300 font-mono">
                          📄 {filename}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Style guide extraction pass */}
              {segments.length > 0 && (
                <div className="glass-panel p-6 border-gray-900 flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-md font-bold text-white">Global Style Guide Policy</h3>
                      <p className="text-xs text-gray-400">Run a style extraction pass over the document structure to dictate consistent spelling, citation standards, and gendering rules.</p>
                    </div>
                    {!styleGuide ? (
                      <button 
                        onClick={analyzeStyleGuide}
                        disabled={processingStatus !== 'idle'}
                        className="cyber-btn"
                      >
                        <RefreshCw size={14} className={processingStatus === 'analyzing_style' ? 'animate-spin' : ''} />
                        Analyze Style Guide
                      </button>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full flex items-center gap-1">
                        <Check size={12} /> Style policy established
                      </span>
                    )}
                  </div>

                  {styleGuide && (
                    <div className="grid grid-cols-3 gap-4 bg-slate-900/40 p-4 rounded-xl border border-gray-900">
                      <div>
                        <span className="text-[10px] text-gray-500 font-mono block">Detected Language:</span>
                        <span className="text-sm font-semibold">{styleGuide.language}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-mono block">Writing Style:</span>
                        <span className="text-sm font-semibold">{styleGuide.spellingStyle}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-mono block">Citation standard:</span>
                        <span className="text-sm font-semibold">{styleGuide.citationFormat}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-mono block">Oxford Comma:</span>
                        <span className="text-sm font-semibold">{styleGuide.oxfordComma === 'true' ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-mono block">Detected Tone:</span>
                        <span className="text-sm font-semibold uppercase">{styleGuide.tone}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-mono block">Recommended Gendering:</span>
                        <span className="text-sm font-semibold">{styleGuide.recommendedGenderStyle}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Start execution */}
              {segments.length > 0 && (
                <div className="flex justify-end gap-3 mt-4">
                  <button 
                    onClick={runProofreaderPipeline}
                    disabled={processingStatus !== 'idle'}
                    className="cyber-btn text-base px-8 py-3.5 shadow-lg shadow-cyan-500/10"
                  >
                    <Sparkles size={16} /> Start Rigorous Academic Correction
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PIPELINE PROGRESS VIEW */}
          {activeTab === 'pipeline' && (
            <div className="p-8 max-w-4xl flex flex-col gap-6">
              <div className="glass-panel p-6 border-gray-900">
                <h3 className="text-md font-bold text-white mb-1">Expert Multi-Pass Orchestration Pipeline</h3>
                <p className="text-xs text-gray-400 mb-6">Viewing parallel processing, debate orchestration, and consolidation. Absolute precision in progress.</p>

                {/* Progress bar */}
                <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-2">
                  <span>Processing paragraph {currentSegmentIndex + 1} of {segments.length}...</span>
                  <span>{Math.round(((currentSegmentIndex + 1) / segments.length) * 100)}%</span>
                </div>
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden mb-8 border border-gray-900">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 transition-all duration-300"
                    style={{ width: `${((currentSegmentIndex + 1) / segments.length) * 100}%` }}
                  />
                </div>

                {/* Node graph pipeline */}
                <div className="flex items-center justify-between relative px-4 py-8 mb-8 border border-gray-900 rounded-xl bg-slate-950/60 overflow-x-auto">
                  
                  {/* Pipeline Horizontal Connection Line */}
                  <div className="absolute top-1/2 left-[50px] right-[50px] h-[2px] bg-slate-800 -translate-y-1/2 z-0" />
                  
                  {/* Style Orchestrator Node */}
                  <div className="flex flex-col items-center gap-2 z-10">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center border font-semibold text-xs transition-all duration-300 ${
                      activeAgentNode === 'orchestrator' ? 'bg-cyan-500/10 border-cyan-400 shadow-lg shadow-cyan-500/25 anim-pulse-glow text-cyan-400' : 'bg-slate-900 border-gray-800 text-gray-500'
                    }`}>
                      SO
                    </div>
                    <span className="text-[10px] font-mono tracking-wider">Style Engine</span>
                  </div>

                  <ChevronRight className="text-gray-700 z-10" />

                  {/* Parallel Specialists Cluster */}
                  <div className="flex flex-col gap-4 border border-dashed border-gray-800 p-3 rounded-xl bg-slate-900/10 z-10">
                    <span className="text-[9px] uppercase font-bold tracking-widest text-center text-gray-500">Parallel Audits</span>
                    
                    <div className="flex gap-4">
                      {/* Grammarian */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-semibold text-[10px] transition-all duration-300 ${
                          activeAgentNode === 'grammarian' ? 'bg-purple-500/10 border-purple-400 shadow-md shadow-purple-500/25 anim-pulse-glow text-purple-400' : 'bg-slate-900 border-gray-800 text-gray-500'
                        }`}>
                          GR
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">Grammar</span>
                      </div>

                      {/* Stylist */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-semibold text-[10px] transition-all duration-300 ${
                          activeAgentNode === 'stylist' ? 'bg-pink-500/10 border-pink-400 shadow-md shadow-pink-500/25 anim-pulse-glow text-pink-400' : 'bg-slate-900 border-gray-800 text-gray-500'
                        }`}>
                          ST
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">Stylist</span>
                      </div>

                      {/* Critic */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-semibold text-[10px] transition-all duration-300 ${
                          activeAgentNode === 'critic' ? 'bg-red-500/10 border-red-400 shadow-md shadow-red-500/25 anim-pulse-glow text-red-400' : 'bg-slate-900 border-gray-800 text-gray-500'
                        }`}>
                          CR
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">Reviewer 2</span>
                      </div>

                      {/* Reference Auditor */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-semibold text-[10px] transition-all duration-300 ${
                          activeAgentNode === 'reference_auditor' ? 'bg-yellow-500/10 border-yellow-400 shadow-md shadow-yellow-500/25 anim-pulse-glow text-yellow-400' : 'bg-slate-900 border-gray-800 text-gray-500'
                        }`}>
                          RA
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">Ref Audit</span>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="text-gray-700 z-10" />

                  {/* Consolidation Node */}
                  <div className="flex flex-col items-center gap-2 z-10">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center border font-semibold text-xs transition-all duration-300 ${
                      activeAgentNode === 'consolidation' ? 'bg-purple-500/10 border-purple-400 shadow-lg shadow-purple-500/25 anim-pulse-glow text-purple-400' : 'bg-slate-900 border-gray-800 text-gray-500'
                    }`}>
                      ED
                    </div>
                    <span className="text-[10px] font-mono tracking-wider">Editor</span>
                  </div>
                </div>

                {/* Processing Log Box */}
                <div className="glass-panel bg-slate-950 p-4 border-gray-900 font-mono text-xs text-cyan-400 h-[180px] overflow-y-auto flex flex-col gap-2">
                  <p className="text-gray-500">Initializing multi-pass pipeline audit...</p>
                  {processedResults.slice(-3).map((res, i) => (
                    <div key={i} className="flex flex-col gap-1 border-b border-gray-900 pb-2">
                      <p className="text-green-400">✓ Paragraph {processedResults.length - 2 + i} consolidated: style elevated and typos purged.</p>
                      {res.referenceAudit && (
                        <p className={`text-[10px] ${
                          res.referenceAudit.status === 'green' ? 'text-green-500' : res.referenceAudit.status === 'red' ? 'text-red-500' : 'text-yellow-500'
                        }`}>
                          ↳ Citation Fact Check: {res.referenceAudit.message}
                        </p>
                      )}
                    </div>
                  ))}
                  {processingStatus === 'running_pipeline' && (
                    <p className="text-cyan-400 animate-pulse">⚡ [Agent Debate active] Reviewer 2 is questioning argument logic... Style Orchestrator compiling changes...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INTERACTIVE REVIEW & DIFF VIEW */}
          {activeTab === 'review' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Left pane: Paragraph list */}
              <div className="w-[300px] border-r border-gray-900 overflow-y-auto p-4 flex flex-col gap-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">Chapters / Paragraphs</h4>
                {processedResults.map((result, idx) => {
                  const hasCritique = result.criticFeedback && result.criticFeedback.length > 30;
                  const isChecked = result.referenceAudit?.status;

                  return (
                    <button 
                      key={idx}
                      onClick={() => setSelectedParagraphIdx(idx)}
                      className={`glass-panel p-3 border-gray-800/80 text-left text-xs transition-all flex flex-col gap-2 ${
                        selectedParagraphIdx === idx ? 'border-cyan-500/60 bg-cyan-500/5' : 'hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-gray-500">Block #{idx + 1}</span>
                        <div className="flex items-center gap-1">
                          {isChecked === 'green' && <CheckCircle size={12} className="text-green-500" />}
                          {isChecked === 'yellow' && <AlertCircle size={12} className="text-yellow-500" />}
                          {isChecked === 'red' && <ShieldAlert size={12} className="text-red-500" />}
                        </div>
                      </div>
                      <p className="text-gray-400 truncate w-full">{result.originalText}</p>
                    </button>
                  );
                })}
              </div>

              {/* Right pane: Side-by-side Editor & Agent Debate Room */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Side-by-side Diff split screen */}
                <div className="flex-1 flex border-b border-gray-900 overflow-hidden">
                  
                  {/* Left: Original Text */}
                  <div className="flex-1 p-6 overflow-y-auto border-r border-gray-900 flex flex-col gap-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Original Draft</span>
                    <p className="leading-relaxed text-[16px] text-gray-400 font-normal">
                      {processedResults[selectedParagraphIdx]?.originalText}
                    </p>
                  </div>

                  {/* Right: Corrected Text */}
                  <div className="flex-1 p-6 overflow-y-auto bg-slate-900/10 flex flex-col gap-4">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest block">Corrected Academic Text</span>
                    {renderTextWithDiff(processedResults[selectedParagraphIdx])}
                  </div>
                </div>

                {/* Bottom: Debate Room & Fact logs */}
                <div className="h-[280px] bg-slate-950/70 border-t border-gray-900 flex overflow-hidden">
                  
                  {/* Citation Fact Audit report */}
                  <div className="w-[300px] border-r border-gray-900 p-4 flex flex-col gap-3 overflow-y-auto">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      🔎 Source Fact Audit
                    </span>
                    
                    {processedResults[selectedParagraphIdx]?.referenceAudit && (
                      <div className={`p-3 rounded-xl border text-xs flex flex-col gap-2 bg-slate-900/50 ${
                        processedResults[selectedParagraphIdx].referenceAudit.status === 'green' ? 'border-green-500/20 text-green-300' :
                        processedResults[selectedParagraphIdx].referenceAudit.status === 'red' ? 'border-red-500/20 text-red-300' : 'border-yellow-500/20 text-yellow-300'
                      }`}>
                        <div className="flex items-center gap-1.5 font-semibold">
                          {processedResults[selectedParagraphIdx].referenceAudit.status === 'green' ? <CheckCircle size={14} className="text-green-500" /> :
                           processedResults[selectedParagraphIdx].referenceAudit.status === 'red' ? <ShieldAlert size={14} className="text-red-500" /> : <AlertCircle size={14} className="text-yellow-500" />}
                          Status: {processedResults[selectedParagraphIdx].referenceAudit.status.toUpperCase()}
                        </div>
                        <p className="leading-relaxed">{processedResults[selectedParagraphIdx].referenceAudit.message}</p>
                        
                        {processedResults[selectedParagraphIdx].referenceAudit.matchSnippet && (
                          <div className="mt-2 bg-slate-950 p-2.5 rounded-lg border border-gray-900 text-[11px] font-mono text-gray-400 max-h-[100px] overflow-y-auto">
                            <span className="text-gray-500 font-bold block mb-1">Snippet from Reference:</span>
                            "{processedResults[selectedParagraphIdx].referenceAudit.matchSnippet}"
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reviewer 2 core notes */}
                    {processedResults[selectedParagraphIdx]?.criticFeedback && (
                      <div className="border border-gray-900 bg-slate-900/30 p-3 rounded-xl text-xs flex flex-col gap-1.5">
                        <span className="font-semibold text-red-400 flex items-center gap-1">🗣️ Reviewer 2 Notes:</span>
                        <p className="text-gray-400 leading-relaxed text-[11px]">{processedResults[selectedParagraphIdx].criticFeedback}</p>
                      </div>
                    )}
                  </div>

                  {/* WhatsApp-style Debate Room Group Chat Log */}
                  <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/90">
                    <div className="border-b border-gray-900 px-4 py-2.5 bg-slate-900/25 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-cyan-400" />
                        <span className="text-xs font-bold text-white">Agent Debate Room (Reasoning Transparency)</span>
                      </div>
                      <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">
                        Chat log for Block #{selectedParagraphIdx + 1}
                      </span>
                    </div>

                    {/* Chat Bubble Area */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
                      {processedResults[selectedParagraphIdx]?.debateLog && processedResults[selectedParagraphIdx].debateLog.length > 0 ? (
                        processedResults[selectedParagraphIdx].debateLog.map((chat, i) => {
                          const isOrchestrator = chat.sender === 'The Orchestrator';
                          
                          return (
                            <div 
                              key={i} 
                              className={`flex flex-col max-w-[85%] ${
                                isOrchestrator ? 'ml-auto items-end' : 'mr-auto items-start'
                              }`}
                            >
                              {/* Sender Profile */}
                              <div className="flex items-center gap-1.5 mb-1 px-1">
                                <span className={`text-[10px] font-bold ${
                                  chat.sender === 'The Grammarian' ? 'text-purple-400' :
                                  chat.sender === 'The Academic Stylist' ? 'text-pink-400' :
                                  chat.sender === 'Reviewer 2' ? 'text-red-400' :
                                  chat.sender === 'The Reference Auditor' ? 'text-yellow-400' : 'text-cyan-400'
                                }`}>
                                  {chat.sender}
                                </span>
                                <span className="text-[9px] text-gray-600 font-mono">{chat.timestamp || '20:12'}</span>
                              </div>

                              {/* Chat bubble body */}
                              <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                                isOrchestrator 
                                  ? 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/25 rounded-tr-none' 
                                  : 'bg-slate-900 text-gray-300 border border-gray-800/80 rounded-tl-none'
                              }`}>
                                {chat.message}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-gray-500 italic text-center mt-8">Select a paragraph block to view the live agent debate logs.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ISOLATED PLAGIARISM CHECKER */}
          {activeTab === 'plagiarism' && (
            <div className="p-8 max-w-4xl flex flex-col gap-6">
              <div className="glass-panel p-6 border-gray-900">
                <h3 className="text-md font-bold mb-1 text-white">Standalone Plagiarism Sentinel</h3>
                <p className="text-xs text-gray-400 mb-6">Audits isolated text paragraphs against the reference library. Scans text similarity, copy-paste snippets, and paraphrasing drift.</p>

                <div className="flex flex-col gap-3 mb-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest font-mono">Paste text section to scan:</span>
                  <textarea 
                    value={plagiPasteText}
                    onChange={(e) => setPlagiPasteText(e.target.value)}
                    placeholder="Paste a paragraph or chapter section here..."
                    className="cyber-input h-[150px] font-sans text-sm resize-none bg-slate-900/50 border-gray-800 leading-relaxed"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <div className="text-xs text-gray-500">
                    Will scan against <span className="text-purple-400 font-semibold">{referenceFiles.length} uploaded PDF references</span>.
                  </div>
                  <button 
                    onClick={triggerPlagiarismCheck}
                    disabled={plagiLoading || !plagiPasteText.trim()}
                    className="cyber-btn"
                  >
                    {plagiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                    Scan Text for Plagiarism
                  </button>
                </div>
              </div>

              {/* Plagiarism results */}
              {plagiResult && (
                <div className="glass-panel p-6 border-gray-900 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center border font-bold text-lg ${
                      plagiResult.status === 'green' ? 'border-green-500/20 bg-green-500/10 text-green-400' :
                      plagiResult.status === 'yellow' ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400' :
                      'border-red-500/20 bg-red-500/10 text-red-400'
                    }`}>
                      {plagiResult.score > 0 ? `${Math.round(plagiResult.score * 100)}%` : '0%'}
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Analysis Status: {plagiResult.status.toUpperCase()}</h4>
                      <p className="text-xs text-gray-400 leading-relaxed">{plagiResult.message}</p>
                    </div>
                  </div>

                  {plagiResult.snippets && plagiResult.snippets.length > 0 && (
                    <div className="flex flex-col gap-3 mt-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Matched References Snippets:</span>
                      <div className="flex flex-col gap-3">
                        {plagiResult.snippets.map((snip, idx) => (
                          <div key={idx} className="border border-gray-900 bg-slate-900/30 p-4 rounded-xl flex flex-col gap-2">
                            <div className="flex justify-between items-center text-xs font-mono">
                              <span className="text-cyan-400 font-semibold">📄 {snip.sourceName}</span>
                              <span className="text-red-400 font-semibold">Match Score: {Math.round(snip.score * 100)}%</span>
                            </div>
                            <p className="text-xs text-gray-400 font-mono italic bg-slate-950 p-3 rounded-lg leading-relaxed">
                              "{snip.snippet}"
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* OVERLAY MODAL: Edit Agent Custom Instructions */}
      {editingAgent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg border-gray-900 bg-slate-950 flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-900 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full border border-gray-800 overflow-hidden bg-slate-900 flex-shrink-0">
                <img 
                  src={agentProfiles[editingAgent]?.avatar} 
                  alt={agentProfiles[editingAgent]?.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <h3 className="font-bold text-white">Configure {agentProfiles[editingAgent]?.name}</h3>
                <p className="text-xs text-gray-500 font-mono">{agentProfiles[editingAgent]?.role} Custom System Instructions</p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest font-mono">Default prompt guidelines:</span>
                <p className="text-[11px] text-gray-500 bg-slate-900/60 p-3 rounded-lg border border-gray-800 leading-relaxed italic">
                  "{editingAgent === 'orchestrator' ? 'Styleguide enforcement' : 
                    editingAgent === 'grammarian' ? 'Orthography, deep grammar check, punctuation.' :
                    editingAgent === 'stylist' ? 'Vocabulary register elevation, academic phrasing.' :
                    editingAgent === 'critic' ? 'Argument logic questioning, method challenge.' :
                    editingAgent === 'reference_auditor' ? 'Validate cited claims against sources.' : 
                    'Compare text chunk overlap against source PDFs.'}"
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest font-mono">My Custom Instructions (Prompts):</span>
                <textarea 
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  placeholder="e.g. Always gender with asterisks (*). Do not correct active voices. Focus on IEEE format."
                  className="cyber-input h-[120px] text-xs resize-none font-sans bg-slate-900/80 leading-relaxed"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-900 bg-slate-900/25 flex justify-end gap-3">
              <button 
                onClick={() => setEditingAgent(null)}
                className="cyber-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={saveCustomInstructions}
                className="cyber-btn text-xs px-6"
              >
                Save configurations
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
