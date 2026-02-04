import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Wallet, Lock, ArrowRight, Power, Pen, Tag, Plus, 
  History, X, RefreshCw, Receipt, Check, AlertTriangle, 
  User, Clock, Trash2, Settings, Camera, LogOut, ChevronRight, ChevronDown, Edit2, ChevronLeft, Info, Download, Calendar
} from 'lucide-react';
import './App.css';

// --- CONFIGURATION ---
const API_URL = "http://localhost:3000/api"; 

// --- COOKIE HELPERS ---
const setCookie = (name, value, days = 30) => {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + date.toUTCString();
  document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Strict";
};

const getCookie = (name) => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

const eraseCookie = (name) => {
  document.cookie = name + '=; Max-Age=-99999999; path=/;';
};

// --- CACHE KEYS ---
const CACHE_KEY_PEOPLE = 'expense_tracker_people';
const CACHE_KEY_CATEGORIES = 'expense_tracker_categories';
const CACHE_KEY_AVATAR = 'expense_tracker_avatar';

// --- MAIN APP COMPONENT ---
export default function App() {
  const [view, setView] = useState('login'); 
  const [authMode, setAuthMode] = useState('login'); 
  
  // Auth Form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  // Date/Time Selection
  const [isManualTime, setIsManualTime] = useState(false);
  const [manualDate, setManualDate] = useState('');

  // Data
  const [people, setPeople] = useState(['Me']);
  const [categories, setCategories] = useState([]);
  
  // Expense Form
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPeople, setSelectedPeople] = useState(new Set(['Me']));
  const [saveStatus, setSaveStatus] = useState('idle');

  // Modals
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false); 
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false); 
  
  // History State
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0); 
  const [expandedHistoryId, setExpandedHistoryId] = useState(null); 

  // Edit Expense State
  const [editingExpense, setEditingExpense] = useState(null);
  const [editSelectedPeople, setEditSelectedPeople] = useState(new Set()); 
  const [editNewPersonName, setEditNewPersonName] = useState(''); 

  // Profile Edit State
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [avatarColor, setAvatarColor] = useState('#2563eb');
  const [avatarImage, setAvatarImage] = useState(null); // Base64 image
  const [expandCategories, setExpandCategories] = useState(false);
  const [expandPeople, setExpandPeople] = useState(false);
  const [expandExport, setExpandExport] = useState(false); // NEW

  // Export State
  const [exportMode, setExportMode] = useState('default'); // 'default' | 'custom'
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [firstRecordDate, setFirstRecordDate] = useState(null);
  
  const fileInputRef = useRef(null);

  // --- CACHE HELPERS ---
  const updateCache = (newPeople, newCategories) => {
    localStorage.setItem(CACHE_KEY_PEOPLE, JSON.stringify(newPeople));
    localStorage.setItem(CACHE_KEY_CATEGORIES, JSON.stringify(newCategories));
  };

  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY_PEOPLE);
    localStorage.removeItem(CACHE_KEY_CATEGORIES);
    localStorage.removeItem(CACHE_KEY_AVATAR);
  };

  // --- EFFECTS ---
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    const savedToken = getCookie('auth_token');
    const savedUser = getCookie('auth_user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUsername(savedUser);
      setTempName(savedUser); 
      
      const cachedPeople = localStorage.getItem(CACHE_KEY_PEOPLE);
      const cachedCategories = localStorage.getItem(CACHE_KEY_CATEGORIES);
      const cachedAvatar = localStorage.getItem(CACHE_KEY_AVATAR);

      if (cachedPeople && cachedCategories) {
        setPeople(JSON.parse(cachedPeople));
        setCategories(JSON.parse(cachedCategories));
      } else {
        fetchInitData(savedToken);
      }

      if (cachedAvatar) setAvatarImage(cachedAvatar);
      
      setView('dashboard');
    }
    
    return () => clearInterval(timer);
  }, []);

  // --- HELPER: DATE FORMATTING ---
  const toLocalISOString = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date - offset)).toISOString().slice(0, 16);
  };

  const handleTimeClick = () => {
    setIsManualTime(true);
    setManualDate(toLocalISOString(new Date()));
  };

  const handleResetTime = (e) => {
    e.stopPropagation(); 
    setIsManualTime(false);
    setManualDate('');
  };

  // --- AUTH HANDLERS ---
  const handleAuth = async () => {
    if (!username || !password) return alert("Please fill all fields");
    setLoading(true);
    try {
      if (authMode === 'login') {
        const res = await axios.post(`${API_URL}/login`, { username, password });
        if (res.data.status === 'success') {
          const newToken = res.data.token;
          setCookie('auth_token', newToken);
          setCookie('auth_user', res.data.username);
          setToken(newToken);
          setTempName(res.data.username);
          await fetchInitData(newToken);
          setView('dashboard');
        }
      } else {
        const res = await axios.post(`${API_URL}/register`, { username, password });
        if (res.data.status === 'success') {
          alert("Account created! Please log in.");
          setAuthMode('login');
          setPassword('');
        }
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const fetchInitData = async (authToken) => {
    try {
      const res = await axios.get(`${API_URL}/init`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.data.status === 'success') {
        setPeople(res.data.people);
        setCategories(res.data.categories);
        updateCache(res.data.people, res.data.categories);
      }
    } catch (err) {
      console.error("Failed to load init data", err);
      if(err.response?.status === 403 || err.response?.status === 401) handleLogout();
    }
  };

  const handleLogout = () => {
    eraseCookie('auth_token');
    eraseCookie('auth_user');
    clearCache();
    setToken('');
    setUsername('');
    setPassword('');
    setView('login');
    setShowProfileModal(false);
    setAvatarImage(null);
  };

  // --- HISTORY CRUD & PAGINATION ---
  const fetchHistory = async (page = 0) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_URL}/expenses/history?page=${page}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setHistoryItems(res.data.transactions);
        setHistoryPage(page);
        setExpandedHistoryId(null); 
      }
    } catch (err) {
      console.error("History fetch error", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleNextPage = () => {
    if (historyItems.length < 10 && historyPage > 0) return; 
    fetchHistory(historyPage + 1);
  };

  const handlePrevPage = () => {
    if (historyPage > 0) fetchHistory(historyPage - 1);
  };

  const toggleHistoryItem = (id) => {
    setExpandedHistoryId(expandedHistoryId === id ? null : id);
  };

  const handleDeleteExpense = async (id) => {
    if(!window.confirm("Delete this expense?")) return;
    try {
        await axios.delete(`${API_URL}/expenses/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchHistory(historyPage);
    } catch(err) { console.error(err); }
  };

  // --- EDIT EXPENSE LOGIC ---
  const openEditExpense = (item) => {
    setEditingExpense(item);
    const peopleSet = new Set(item.person ? item.person.split(', ') : []);
    setEditSelectedPeople(peopleSet);
    setShowEditExpenseModal(true);
  };

  const toggleEditPerson = (name) => {
    const newSet = new Set(editSelectedPeople);
    if (newSet.has(name)) {
      if(newSet.size > 0) newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setEditSelectedPeople(newSet);
  };

  const handleAddPersonInEdit = async () => {
    if (!editNewPersonName) return;
    const updatedPeople = [...people, editNewPersonName];
    setPeople(updatedPeople);
    setEditSelectedPeople(prev => new Set(prev).add(editNewPersonName));
    updateCache(updatedPeople, categories);
    
    // Save to DB
    try {
        await axios.post(`${API_URL}/people`, { name: editNewPersonName }, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
    } catch(err) { console.error(err); }

    setEditNewPersonName('');
  };

  const handleUpdateExpense = async () => {
    if (!editingExpense) return;
    
    const finalPeople = Array.from(editSelectedPeople).join(', ');
    const updatedPayload = { ...editingExpense, person: finalPeople };

    try {
        await axios.put(`${API_URL}/expenses/${editingExpense.id}`, updatedPayload, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        setShowEditExpenseModal(false);
        fetchHistory(historyPage);
    } catch(err) { console.error(err); alert("Update failed"); }
  };

  // --- DELETE HANDLERS (Tags/People) ---
  const handleDeleteCategory = async (catName) => {
    if(!window.confirm(`Delete category "${catName}"?`)) return;
    const updated = categories.filter(c => c !== catName);
    setCategories(updated);
    if(selectedCategory === catName) setSelectedCategory('');
    updateCache(people, updated);
    try {
        await axios.delete(`${API_URL}/categories/${encodeURIComponent(catName)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch(err) { console.error("Failed to delete category", err); }
  };

  const handleDeletePerson = async (personName) => {
    if(personName === 'Me') return alert("Cannot delete 'Me'");
    if(!window.confirm(`Delete person "${personName}"?`)) return;
    const updated = people.filter(p => p !== personName);
    setPeople(updated);
    const newSelected = new Set(selectedPeople);
    newSelected.delete(personName);
    setSelectedPeople(newSelected);
    updateCache(updated, categories);
    try {
        await axios.delete(`${API_URL}/people/${encodeURIComponent(personName)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch(err) { console.error("Failed to delete person", err); }
  };

  // --- DATA HANDLERS ---
  const togglePerson = (name) => {
    const newSet = new Set(selectedPeople);
    if (newSet.has(name)) {
      if (newSet.size > 0) newSet.delete(name); 
    } else {
      newSet.add(name);
    }
    setSelectedPeople(newSet);
  };

  const handleAddPerson = async () => {
    if (!newPersonName) return;
    const updatedPeople = [...people, newPersonName];
    setPeople(updatedPeople);
    setSelectedPeople(prev => new Set(prev).add(newPersonName));
    updateCache(updatedPeople, categories);
    axios.post(`${API_URL}/people`, { name: newPersonName }, { headers: { 'Authorization': `Bearer ${token}` } });
    setNewPersonName('');
    setShowPersonModal(false);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName) return;
    const updatedCategories = [...categories, newCategoryName];
    setCategories(updatedCategories);
    setSelectedCategory(newCategoryName);
    setCustomTag(''); 
    updateCache(people, updatedCategories);
    axios.post(`${API_URL}/categories`, { name: newCategoryName }, { headers: { 'Authorization': `Bearer ${token}` } });
    setNewCategoryName('');
    setShowCategoryModal(false);
  };

  const handleSubmit = async () => {
    if (!amount) return alert("Please enter an amount");
    setSaveStatus('saving');
    const finalCategory = customTag || selectedCategory || 'Uncategorized';
    const finalDate = isManualTime && manualDate ? new Date(manualDate).toISOString() : new Date().toISOString();

    const payload = {
      amount,
      description,
      category: finalCategory,
      person: Array.from(selectedPeople).join(', '),
      date: finalDate
    };

    try {
      const res = await axios.post(`${API_URL}/expenses`, payload, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSaveStatus('success');
        setTimeout(() => {
          setAmount('');
          setDescription('');
          setCustomTag('');
          setSelectedCategory('');
          setSaveStatus('idle');
        }, 2000);
      } else {
        throw new Error("API Error");
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // --- PROFILE IMAGE HANDLER ---
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) return alert("Image too large (Max 2MB)");
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setAvatarImage(base64);
        localStorage.setItem(CACHE_KEY_AVATAR, base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  // --- EXPORT HANDLERS ---
  const toggleExport = async () => {
    setExpandExport(!expandExport);
    if (!expandExport && !firstRecordDate) {
        // Fetch meta to validate dates
        try {
            const res = await axios.get(`${API_URL}/expenses/meta`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.data.status === 'success') {
                setFirstRecordDate(res.data.firstDate);
            }
        } catch (e) { console.error(e); }
    }
  };

  const handleExport = async () => {
    let params = {};
    
    if (exportMode === 'custom') {
        if (!exportStart || !exportEnd) return alert("Please select both start and end dates.");
        if (new Date(exportStart) > new Date(exportEnd)) return alert("Start date cannot be after end date.");
        
        if (firstRecordDate && new Date(exportStart) < new Date(firstRecordDate)) {
            alert(`Note: Your first recorded expense is on ${new Date(firstRecordDate).toLocaleDateString()}. Exporting available data.`);
        }
        params = { startDate: exportStart, endDate: exportEnd };
    }

    try {
        const res = await axios.get(`${API_URL}/expenses/export`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: params
        });

        if (res.data.status === 'success') {
            const data = res.data.transactions;
            if (data.length === 0) return alert("No records found for this period.");

            // Convert to CSV
            const headers = ["Date", "Amount", "Category", "Description", "Person"];
            const csvRows = [headers.join(",")];
            data.forEach(row => {
                csvRows.push([
                    new Date(row.date).toLocaleDateString(),
                    row.amount,
                    `"${row.category}"`,
                    `"${row.description || ''}"`,
                    `"${row.person}"`
                ].join(","));
            });

            const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `expenses-${exportMode === 'default' ? 'last30days' : 'custom'}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.error("Export failed", e);
        alert("Failed to export data");
    }
  };

  // --- RENDER HELPERS ---
  const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const formatDate = (date) => date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  // Cycle avatar color (Only if no image)
  const cycleColor = (e) => {
    e.stopPropagation(); // Don't trigger file upload if clicking logic was shared
    const colors = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#9333ea', '#db2777'];
    const currentIdx = colors.indexOf(avatarColor);
    setAvatarColor(colors[(currentIdx + 1) % colors.length]);
  };

  const startEditingName = () => {
    setTempName(username);
    setIsEditingName(true);
  };

  const cancelEditingName = () => {
    setTempName(username);
    setIsEditingName(false);
  };

  const saveUsername = () => {
    if (tempName.trim()) {
      setUsername(tempName);
      setCookie('auth_user', tempName);
      setIsEditingName(false);
    }
  };

  return (
    <>
      {/* <style>{cssStyles}</style> */}
      <div className="app-container">
        
        {/* === LOGIN VIEW === */}
        <div className={`login-overlay ${view === 'dashboard' ? 'slide-up' : ''}`}>
          {/* ... Login Content ... */}
          <div className="login-content">
            <div style={{ marginBottom: '2rem' }}>
              <Wallet size={64} color="#3b82f6" style={{ margin: '0 auto 1rem' }} />
              <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Expense Tracker</h1>
              <p style={{ color: '#94a3b8' }}>{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</p>
            </div>
            <div className="login-input-group">
              <User size={20} color="#94a3b8" style={{ marginLeft: '10px' }} />
              <input type="text" id="login-username" name="username" className="login-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="login-input-group">
              <Lock size={20} color="#94a3b8" style={{ marginLeft: '10px' }} />
              <input type="password" id="login-password" name="password" className="login-input" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAuth()} />
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <button onClick={handleAuth} disabled={loading} className="login-btn" style={{ width: '100%' }}>
                {loading ? <div className="loading-spinner" style={{ borderColor: 'white', borderTopColor: 'transparent' }}></div> : (authMode === 'login' ? 'Login' : 'Register')}
              </button>
            </div>
            <div className="auth-toggle" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setPassword(''); }}>
              {authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Login'}
            </div>
          </div>
        </div>

        {/* === DASHBOARD VIEW === */}
        <div className="dashboard-view">
          <header className="header">
            <div onClick={handleTimeClick} style={{ cursor: 'pointer' }}>
              {isManualTime ? (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="datetime-local" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="date-input" onClick={(e) => e.stopPropagation()} />
                  <button onClick={handleResetTime} className="reset-time-btn" title="Back to Live Clock"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {formatTime(currentTime)} <Pen size={12} color="#94a3b8" />
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>{formatDate(currentTime)}</p>
                </>
              )}
            </div>
            
            <div className="flex">
              <button onClick={() => setShowProfileModal(true)} className="profile-btn">
                <div 
                    className="avatar-small" 
                    style={avatarImage ? { backgroundImage: `url(${avatarImage})`, backgroundColor: 'transparent' } : { backgroundColor: avatarColor }}
                >
                  {!avatarImage && username.charAt(0).toUpperCase()}
                </div>
              </button>
            </div>
          </header>

          <div className="main-content">
            <div style={{ marginBottom: '1rem', color: '#64748b', fontSize: '0.9rem' }}>
              Hi, <span style={{ fontWeight: 'bold', color: '#334155' }}>{username}</span>
            </div>

            {/* Amount */}
            <div className="card">
              <label className="input-label" htmlFor="expense-amount">Amount</label>
              <div className="amount-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" id="expense-amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="amount-input" placeholder="0" />
              </div>
            </div>

            {/* Description */}
            <div className="desc-input-group">
              <Pen size={20} color="#cbd5e1" />
              <input type="text" id="expense-desc" name="description" value={description} onChange={(e) => setDescription(e.target.value)} className="desc-input" placeholder="What is this for?" />
            </div>

            {/* Categories */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="section-header">
                <label className="input-label" htmlFor="expense-category" style={{ marginBottom: 0 }}>Category</label>
                <button onClick={() => setShowCategoryModal(true)} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Plus size={12} style={{ marginRight: '2px' }} /> Add
                </button>
              </div>
              <input type="text" id="expense-category" name="category" value={customTag} onChange={(e) => { setCustomTag(e.target.value); setSelectedCategory(''); }} className="custom-tag-input" placeholder="Or type a custom category..." />
              <div className="tag-container">
                {categories.map((tag) => (
                  <ItemButton
                    key={tag}
                    onClick={() => { setSelectedCategory(tag); setCustomTag(''); }}
                    onLongPress={() => handleDeleteCategory(tag)}
                    isSelected={selectedCategory === tag}
                    className="tag-btn"
                  >
                    <Tag size={12} style={{ marginRight: '4px', opacity: 0.5 }} />
                    {tag}
                  </ItemButton>
                ))}
              </div>
            </div>

            {/* People */}
            <div>
              <div className="section-header">
                <label className="input-label" style={{ marginBottom: 0 }}>Split With</label>
                <button onClick={() => setShowPersonModal(true)} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Plus size={12} style={{ marginRight: '2px' }} /> Add
                </button>
              </div>
              <div className="tag-container">
                {people.map((person) => (
                  <ItemButton
                    key={person}
                    onClick={() => togglePerson(person)}
                    onLongPress={() => handleDeletePerson(person)}
                    isSelected={selectedPeople.has(person)}
                    className="person-btn"
                  >
                    {person}
                  </ItemButton>
                ))}
              </div>
            </div>

            <button onClick={handleSubmit} disabled={saveStatus !== 'idle'} className={`save-btn ${saveStatus}`}>
              {saveStatus === 'saving' && <div className="loading-spinner" style={{ borderColor: 'white', borderTopColor: 'transparent' }}></div>}
              {saveStatus === 'success' && <Check size={20} />}
              {saveStatus === 'error' && <AlertTriangle size={20} />}
              {saveStatus === 'idle' && 'Save Expense'}
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'success' && 'Saved!'}
              {saveStatus === 'error' && 'Error'}
            </button>
          </div>
        </div>

        {/* === MODALS === */}

        {/* PROFILE MODAL */}
        <div className={`modal-overlay ${showProfileModal ? 'open' : ''}`}>
          <div className="modal-content">
            <div className="section-header">
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>My Profile</h3>
              <button onClick={() => { setShowProfileModal(false); cancelEditingName(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button>
            </div>

            <div className="profile-header">
              <div 
                className="profile-avatar-large" 
                style={avatarImage ? { backgroundImage: `url(${avatarImage})`, backgroundColor: 'transparent' } : { backgroundColor: '#e0e7ff', color: avatarColor }}
              >
                {!avatarImage && username.charAt(0).toUpperCase()}
                
                {/* File Input */}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{display: 'none'}} 
                    accept="image/*"
                    onChange={handleImageChange}
                />
                
                <button onClick={avatarImage ? triggerFileInput : cycleColor} className="edit-avatar-btn" title={avatarImage ? "Change Image" : "Change Color / Upload"}>
                  <Camera size={14} onClick={(e) => {
                      if (!avatarImage) {
                          // If no image, normal click cycles color, but maybe long press or specific action triggers upload?
                          // For simplicity, let's make single click cycle color, but add a way to upload.
                          // Actually, let's just make the camera icon ALWAYS trigger upload if clicked directly.
                          e.stopPropagation();
                          triggerFileInput();
                      }
                  }}/>
                </button>
              </div>
              
              <div className="username-container">
                {isEditingName ? (
                  <div className="username-edit-group">
                    <input 
                      type="text" 
                      id="profile-username"
                      name="profile-username"
                      value={tempName} 
                      onChange={(e) => setTempName(e.target.value)} 
                      className="username-edit-input"
                      autoFocus
                    />
                    <button className="save-name-btn" onClick={saveUsername}><Check size={16} /></button>
                    <button className="cancel-name-btn" onClick={cancelEditingName}><X size={16} /></button>
                  </div>
                ) : (
                  <>
                    <span className="username-display">{username}</span>
                    <button className="edit-name-btn" onClick={startEditingName} title="Edit Name">
                      <Edit2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <button className="menu-btn" onClick={() => { setShowProfileModal(false); setShowHistoryModal(true); fetchHistory(0); }}>
              <div className="menu-btn-content"><History size={20} /> Transaction History</div>
              <ChevronRight size={16} color="#cbd5e1" />
            </button>

            {/* EXPORT SECTION */}
            <div className="manage-section">
                <div className="manage-title" onClick={toggleExport} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {expandExport ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span>Export Data</span>
                    </div>
                </div>
                {expandExport && (
                    <div className="export-options">
                        <div className="export-radio-group">
                            <label className="export-radio-label">
                                <input type="radio" name="exportMode" checked={exportMode === 'default'} onChange={() => setExportMode('default')} />
                                Last Month
                            </label>
                            <label className="export-radio-label">
                                <input type="radio" name="exportMode" checked={exportMode === 'custom'} onChange={() => setExportMode('custom')} />
                                Custom Range
                            </label>
                        </div>
                        
                        {exportMode === 'custom' && (
                            <div className="export-inputs">
                                <input type="date" className="date-picker-sm" value={exportStart} onChange={(e) => setExportStart(e.target.value)} />
                                <span style={{alignSelf:'center'}}>-</span>
                                <input type="date" className="date-picker-sm" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} />
                            </div>
                        )}

                        <button className="download-btn" onClick={handleExport}>
                            <Download size={18} /> Download Excel (CSV)
                        </button>
                    </div>
                )}
            </div>

            {/* Manage Sections... */}
            <div className="manage-section">
              <div className="manage-title" onClick={() => setExpandCategories(!expandCategories)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {expandCategories ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>Manage Categories</span>
                </div>
              </div>
              
              {expandCategories && (
                <div className="manage-content">
                    <button onClick={() => setShowCategoryModal(true)} style={{ width: '100%', padding: '10px', background: '#eff6ff', border: '1px dashed #2563eb', color: '#2563eb', fontWeight: 'bold', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.8rem' }}>
                        <Plus size={14} style={{ marginRight: '4px' }} /> Add New Category
                    </button>
                    <div className="manage-list">
                        {categories.map(cat => (
                        <div key={cat} className="manage-item">
                            <span>{cat}</span>
                            <button className="delete-icon-btn" onClick={() => handleDeleteCategory(cat)}><Trash2 size={16} /></button>
                        </div>
                        ))}
                    </div>
                </div>
              )}
            </div>

            <div className="manage-section">
              <div className="manage-title" onClick={() => setExpandPeople(!expandPeople)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {expandPeople ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>Manage People</span>
                </div>
              </div>
              {expandPeople && (
                <div className="manage-content">
                    <button onClick={() => setShowPersonModal(true)} style={{ width: '100%', padding: '10px', background: '#eff6ff', border: '1px dashed #2563eb', color: '#2563eb', fontWeight: 'bold', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.8rem' }}>
                        <Plus size={14} style={{ marginRight: '4px' }} /> Add New Person
                    </button>
                    <div className="manage-list">
                        {people.map(person => (
                        <div key={person} className="manage-item">
                            <span>{person}</span>
                            {person !== 'Me' && <button className="delete-icon-btn" onClick={() => handleDeletePerson(person)}><Trash2 size={16} /></button>}
                        </div>
                        ))}
                    </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '2rem' }}>
              <button className="menu-btn logout" onClick={handleLogout}>
                <div className="menu-btn-content"><LogOut size={20} /> Log Out</div>
              </button>
            </div>
          </div>
        </div>

        {/* History Modal */}
        <div className={`modal-overlay ${showHistoryModal ? 'open' : ''}`}>
          <div className="modal-content">
            <div className="section-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '0' }}>
              <div style={{display:'flex', alignItems:'center'}}>
                <button onClick={() => fetchHistory(historyPage)} className="refresh-btn-header" title="Refresh"><RefreshCw size={20} /></button>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Recent Activity</h3>
              </div>
              <button onClick={() => setShowHistoryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button>
            </div>
            <div className="history-list">
              {historyLoading ? (
                <div className="text-center" style={{ padding: '2rem' }}><div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div><p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Fetching...</p></div>
              ) : historyItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No transactions found.</div>
              ) : (
                historyItems.map((item, i) => (
                  <div key={i} className={`history-item ${expandedHistoryId === item.id ? 'expanded' : ''}`} onClick={() => toggleHistoryItem(item.id)}>
                      <div className="history-item-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                            <div style={{ background: '#eff6ff', color: '#2563eb', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Receipt size={20} /></div>
                            <div style={{ minWidth: 0 }}>
                            <h4 style={{ margin: 0, fontWeight: 'bold', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description || 'Expense'}</h4>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(item.date).toLocaleDateString()}</p>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span style={{ display: 'block', fontWeight: 'bold', fontSize: '1.1rem' }}>-${item.amount}</span>
                        </div>
                      </div>
                      
                      {expandedHistoryId === item.id && (
                        <div className="history-details" onClick={(e) => e.stopPropagation()}>
                            <div className="history-detail-row"><span className="history-detail-label">Date:</span> <span>{new Date(item.date).toLocaleString()}</span></div>
                            <div className="history-detail-row"><span className="history-detail-label">People:</span> <span>{item.person}</span></div>
                            <div className="history-detail-row"><span className="history-detail-label">Category:</span> <span>{item.category}</span></div>
                            <div className="history-detail-row"><span className="history-detail-label">Note:</span> <span>{item.description || '-'}</span></div>
                            
                            <div className="history-actions-expanded">
                                <button className="action-btn edit" onClick={() => openEditExpense(item)}><Edit2 size={14} /> Edit</button>
                                <button className="action-btn delete" onClick={() => handleDeleteExpense(item.id)}><Trash2 size={14} /> Delete</button>
                            </div>
                        </div>
                      )}
                  </div>
                ))
              )}
            </div>
            <div className="pagination-controls">
                <button className="page-btn" onClick={handlePrevPage} disabled={historyPage === 0}><ChevronLeft size={16} /> Newer</button>
                <span style={{fontSize:'0.9rem', color:'#94a3b8'}}>Page {historyPage + 1}</span>
                <button className="page-btn" onClick={handleNextPage} disabled={historyItems.length < 10}>Older <ChevronRight size={16} /></button>
            </div>
          </div>
        </div>

        {/* Edit Expense Modal */}
        <div className={`modal-overlay ${showEditExpenseModal ? 'open' : ''}`}>
          <div className="modal-content">
            <div className="section-header">
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Edit Expense</h3>
                <button onClick={() => setShowEditExpenseModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button>
            </div>
            {editingExpense && (
                <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
                    <div>
                        <label className="input-label" htmlFor="edit-amount">Amount</label>
                        <input type="number" id="edit-amount" name="edit-amount" className="amount-input" style={{fontSize:'2rem'}} value={editingExpense.amount} onChange={(e) => setEditingExpense({...editingExpense, amount: e.target.value})} />
                    </div>
                    <div>
                        <label className="input-label" htmlFor="edit-desc">Description</label>
                        <input type="text" id="edit-desc" name="edit-description" className="custom-tag-input" value={editingExpense.description || ''} onChange={(e) => setEditingExpense({...editingExpense, description: e.target.value})} />
                    </div>
                    <div>
                        <label className="input-label" htmlFor="edit-category">Category</label>
                        <input 
                            type="text" 
                            id="edit-category" 
                            name="edit-category" 
                            className="custom-tag-input" 
                            value={editingExpense.category || ''} 
                            onChange={(e) => setEditingExpense({...editingExpense, category: e.target.value})} 
                            placeholder="Type or select below"
                        />
                        <div className="tag-container" style={{marginTop:'8px'}}>
                            {categories.map(c => (
                                <button key={c} onClick={() => setEditingExpense({...editingExpense, category: c})} className={`tag-btn ${editingExpense.category === c ? 'selected' : ''}`} style={{fontSize: '0.8rem', padding: '6px 12px'}}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="input-label">People</label>
                        <div className="tag-container" style={{background:'#f8fafc', padding:'10px', borderRadius:'12px', border:'1px solid #e2e8f0'}}>
                            {people.map(p => (
                                <button
                                    key={p}
                                    onClick={() => toggleEditPerson(p)}
                                    className={`person-btn ${editSelectedPeople.has(p) ? 'selected' : ''}`}
                                    style={{fontSize: '0.8rem', padding: '6px 12px'}}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                        {/* Inline Add Person for Edit */}
                        <div style={{display:'flex', marginTop:'10px', gap:'8px'}}>
                            <input 
                                type="text" 
                                placeholder="Add new person..." 
                                value={editNewPersonName}
                                onChange={(e) => setEditNewPersonName(e.target.value)}
                                className="custom-tag-input"
                                style={{marginBottom:0, padding:'8px'}}
                            />
                            <button onClick={handleAddPersonInEdit} style={{background: 'var(--primary)', color:'white', border:'none', borderRadius:'8px', padding:'0 12px', cursor:'pointer'}}><Plus size={16}/></button>
                        </div>
                    </div>
                    <button className="save-btn success" onClick={handleUpdateExpense}><Check size={20}/> Update Record</button>
                </div>
            )}
          </div>
        </div>

        {/* Add Person/Category Modals (Keep existing ones) */}
        <div className={`modal-overlay ${showPersonModal ? 'open' : ''}`}>
          <div className="modal-content" style={{ maxHeight: 'none' }}>
            <h3 style={{ marginTop: 0 }}>Add New Person</h3>
            <input type="text" id="new-person" name="new-person" value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} className="custom-tag-input" placeholder="Name" />
            <div style={{ display: 'flex', gap: '12px', marginTop: '1rem' }}>
              <button onClick={() => setShowPersonModal(false)} style={{ flex: 1, padding: '12px', border: 'none', background: '#f1f5f9', borderRadius: '12px', cursor: 'pointer', color: '#64748b' }}>Cancel</button>
              <button onClick={handleAddPerson} style={{ flex: 1, padding: '12px', border: 'none', background: '#2563eb', color: 'white', borderRadius: '12px', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>

        <div className={`modal-overlay ${showCategoryModal ? 'open' : ''}`}>
          <div className="modal-content" style={{ maxHeight: 'none' }}>
            <h3 style={{ marginTop: 0 }}>Add New Category</h3>
            <input type="text" id="new-category" name="new-category" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="custom-tag-input" placeholder="Category Name" />
            <div style={{ display: 'flex', gap: '12px', marginTop: '1rem' }}>
              <button onClick={() => setShowCategoryModal(false)} style={{ flex: 1, padding: '12px', border: 'none', background: '#f1f5f9', borderRadius: '12px', cursor: 'pointer', color: '#64748b' }}>Cancel</button>
              <button onClick={handleAddCategory} style={{ flex: 1, padding: '12px', border: 'none', background: '#2563eb', color: 'white', borderRadius: '12px', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}

// --- HELPER COMPONENT FOR LONG PRESS ---
function ItemButton({ children, onClick, onLongPress, isSelected, className }) {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);

  const startPress = () => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      if (navigator.vibrate) navigator.vibrate(50); 
      onLongPress();
    }, 600); 
  };

  const cancelPress = () => {
    clearTimeout(timerRef.current);
  };

  const handleClick = (e) => {
    if (isLongPress.current) return;
    onClick(e);
  };

  return (
    <button
      className={`${className} ${isSelected ? 'selected' : ''}`}
      style={className === 'tag-btn' ? { display: 'flex', alignItems: 'center' } : {}}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress();
      }}
    >
      {children}
    </button>
  );
}