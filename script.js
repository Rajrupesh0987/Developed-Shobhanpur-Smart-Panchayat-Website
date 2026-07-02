

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let currentUser = null;
let allListingsData = [];
let userFavorites = [];
let currentFilter = 'all';
let currentSubCategory = 'All';
let isLoginMode = true;
let selectedImages = []; 

let currentChatId = null;
let currentReceiverId = null; 
let chatUnsubscribe = null;

// 🔥 INFINITE SCROLL VARIABLES 🔥
let lastVisibleDoc = null; // To track where we stopped
let isFetching = false;    // To prevent double loading
let isEndOfData = false;   // To stop when data finishes

const categoryData = {
    sell: ["Bike/Scooty", "Car/Vehicle", "Cycle", "Mobile/Electronics", "Land/Plot", "Hardware/Tools", "Furniture", "Others"],
    job: ["Labour/Worker", "Mistri (Raj/Tile)", "Data Entry/Computer", "Driver", "Cook/Helper", "Teacher/Tutor", "Others"],
    promotion: ["Shop Banner", "Coaching", "Service Center", "Clinic/Doctor", "Others"]
};

// --- WINDOW FUNCTIONS ---
window.openLoginModal = () => { document.getElementById('loginModal').style.display = 'flex'; }
window.closeModal = (id) => document.getElementById(id).style.display = 'none';

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Login" : "Create Account";
    document.getElementById('authSwitchText').innerText = isLoginMode ? "New User? Create Account" : "Already have account? Login";
    document.querySelector('.forgot-pass').style.display = isLoginMode ? 'block' : 'none';
}

window.openPostModal = () => {
    document.getElementById('postModal').style.display = 'flex';
    const tipBox = document.getElementById('loginTipBox');
    tipBox.style.display = currentUser ? 'none' : 'block';
};

window.openProfile = () => { 
    if(!currentUser) return; 
    document.getElementById('profileModal').style.display = 'flex'; 
    document.getElementById('profPic').src = currentUser.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png"; 
    document.getElementById('profName').innerText = currentUser.displayName || currentUser.email.split('@')[0]; 
    window.switchProfileTab('my-ads'); 
}

window.switchProfileTab = (tab) => { 
    const tabs = document.querySelectorAll('.p-tab'); 
    tabs.forEach(t => t.classList.remove('active')); 
    if(tab === 'my-ads') tabs[0].classList.add('active'); 
    else if(tab === 'saved-ads') tabs[1].classList.add('active');
    else if(tab === 'chats') tabs[2].classList.add('active');
    
    const container = document.getElementById('profileContent'); 
    
    if (tab === 'my-ads') {
        renderData(allListingsData.filter(i => i.userId === currentUser.uid), container);
    } else if (tab === 'saved-ads') {
        renderData(allListingsData.filter(i => userFavorites.includes(i.id)), container);
    } else if (tab === 'chats') {
        loadUserChats(container); 
    }
}

async function loadUserChats(container) {
    container.innerHTML = '<p style="text-align:center; padding:20px;">Loading chats...</p>';
    const q = query(collection(db, "chats"), where("users", "array-contains", currentUser.uid), orderBy("updatedAt", "desc"));
    try {
        const snap = await getDocs(q);
        container.innerHTML = '';
        if (snap.empty) { container.innerHTML = '<p style="text-align:center; padding:20px;">No chats yet.</p>'; return; }
        snap.forEach(docSnap => {
            const chat = docSnap.data();
            const chatId = docSnap.id;
            const chatTitle = chat.adTitle || "Chat";
            const otherUserId = chat.users.find(id => id !== currentUser.uid);
            const isUnread = (chat.unreadBy === currentUser.uid);
            const div = document.createElement('div');
            div.className = 'chat-item';
            if(isUnread) div.classList.add('unread-chat-card'); 
            div.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/149/149071.png" style="width:40px; height:40px; border-radius:50%;"><div class="chat-info"><h4>${chatTitle} ${isUnread ? '<span class="notification-dot"></span>' : ''}</h4><p style="font-size:0.8rem; color:#666;">Tap to chat</p></div>`;
            div.onclick = async () => {
                currentChatId = chatId;
                currentReceiverId = otherUserId; 
                document.getElementById('chatHeaderName').innerText = chatTitle;
                document.getElementById('chatModal').style.display = 'flex';
                if(isUnread) {
                    await updateDoc(doc(db, "chats", chatId), { unreadBy: "" });
                    div.classList.remove('unread-chat-card');
                    const dot = div.querySelector('.notification-dot');
                    if(dot) dot.remove();
                }
                loadMessages();
            };
            container.appendChild(div);
        });
    } catch (e) { container.innerHTML = '<p style="text-align:center; color:red;">Create Index in Firebase Console.</p>'; }
}

window.updateCategoryOptions = () => {
    const type = document.getElementById('adType').value;
    const catSelect = document.getElementById('adCategory');
    const otherInput = document.getElementById('adOtherCategory');
    catSelect.innerHTML = '<option value="">-- Select Category --</option>';
    otherInput.style.display = 'none';
    if(type && categoryData[type]) {
        catSelect.disabled = false;
        categoryData[type].forEach(cat => { catSelect.innerHTML += `<option value="${cat}">${cat}</option>`; });
    } else { catSelect.disabled = true; }
};

window.checkOtherCategory = () => {
    const val = document.getElementById('adCategory').value;
    document.getElementById('adOtherCategory').style.display = (val === 'Others') ? 'block' : 'none';
};

window.handleGoogleLogin = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const userRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
            await setDoc(userRef, { email: user.email, favorites: [], createdAt: serverTimestamp() });
        }
        alert(`Welcome ${user.displayName || 'User'}!`);
        window.closeModal('loginModal');
    } catch (e) { alert("Google Login Error: " + e.message); }
};

window.handleAuth = async () => {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    if(!email || !pass) { alert("Please enter Email & Password"); return; }
    if(pass.length < 6) { alert("Password must be at least 6 digits"); return; }
    try {
        if(isLoginMode) { await signInWithEmailAndPassword(auth, email, pass); alert("Login Success!"); }
        else { await createUserWithEmailAndPassword(auth, email, pass); alert("Account Created!"); }
        window.closeModal('loginModal');
    } catch(e) { alert("Error: " + e.message); }
}

window.resetPassword = async () => {
    const email = document.getElementById('authEmail').value;
    if (!email) { alert("Enter Email first!"); return; }
    try { await sendPasswordResetEmail(auth, email); alert("Reset link sent to " + email); } catch (e) { alert("Error: " + e.message); }
}

window.logout = () => { signOut(auth).then(() => { location.reload(); }); };

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.querySelector('.login-btn').style.display = 'none';
        document.querySelector('.user-pic').style.display = 'block';
        document.querySelector('.user-pic').src = user.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
        await loadUserFavorites();
    } else {
        currentUser = null;
        document.querySelector('.login-btn').style.display = 'block';
        document.querySelector('.user-pic').style.display = 'none';
    }
    // 🔥 Initial Load (Reset)
    resetAndLoad();
});

window.handleImageSelect = (event) => {
    const files = event.target.files;
    if (selectedImages.length + files.length > 3) { alert("Maximum 3 photos allowed!"); return; }
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxWidth = 500;
                const scaleSize = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scaleSize;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                selectedImages.push(canvas.toDataURL('image/jpeg', 0.7)); 
                window.updatePreviewUI();
            }
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    event.target.value = ''; 
};

window.updatePreviewUI = () => {
    const previewArea = document.getElementById('previewArea');
    previewArea.innerHTML = ''; 
    selectedImages.forEach((imgSrc, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-wrapper';
        wrapper.innerHTML = `<img src="${imgSrc}" class="preview-thumb"><div class="remove-img-btn" onclick="removeImage(${index})">×</div>`;
        previewArea.appendChild(wrapper);
    });
};

window.removeImage = (index) => { selectedImages.splice(index, 1); window.updatePreviewUI(); };

window.submitAd = async (e) => {
    e.preventDefault();
    const btn = document.querySelector('.submit-btn');
    btn.innerText = "Uploading..."; btn.disabled = true;
    let finalImages = selectedImages.length > 0 ? selectedImages : ['https://via.placeholder.com/300x200?text=No+Image'];
    const type = document.getElementById('adType').value;
    let category = document.getElementById('adCategory').value;
    if(category === 'Others') category = document.getElementById('adOtherCategory').value || 'Others';
    const data = {
        type: type, category: category,
        title: document.getElementById('adTitle').value,
        price: document.getElementById('adPrice').value || 'Contact',
        location: document.getElementById('adLocation').value,
        phone: document.getElementById('adPhone').value,
        desc: document.getElementById('adDesc').value,
        images: finalImages, image: finalImages[0], 
        timestamp: new Date(),
        userId: currentUser ? currentUser.uid : 'guest',
        userName: document.getElementById('adOwnerName').value || (currentUser ? currentUser.displayName || currentUser.email.split('@')[0] : 'User'),
        isPinned: false
    };
    try {
        await addDoc(collection(db, "listings"), data);
        alert("Ad Posted!");
        document.getElementById('adForm').reset();
        selectedImages = [];
        window.updatePreviewUI();
        window.closeModal('postModal');
        // Reload list
        resetAndLoad();
    } catch (e) { alert("Error: " + e.message); }
    btn.innerText = "Publish Ad Now"; btn.disabled = false;
};

window.startChat = (itemId, ownerId, itemTitle) => {
    if (!currentUser) { alert("Please Login first to Chat!"); window.openLoginModal(); return; }
    if (currentUser.uid === ownerId) { alert("This is your own Ad!"); return; }
    currentChatId = `${itemId}_${currentUser.uid}`;
    currentReceiverId = ownerId; 
    document.getElementById('chatHeaderName').innerText = `Chat: ${itemTitle}`;
    document.getElementById('chatModal').style.display = 'flex';
    document.getElementById('chatMessages').innerHTML = '<p style="text-align:center; color:#888;">Loading...</p>';
    setDoc(doc(db, "chats", currentChatId), { users: [currentUser.uid, ownerId], adTitle: itemTitle, updatedAt: serverTimestamp(), unreadBy: "" }, { merge: true });
    loadMessages();
};

function loadMessages() {
    if (chatUnsubscribe) chatUnsubscribe();
    const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("createdAt", "asc"));
    chatUnsubscribe = onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById('chatMessages');
        chatBox.innerHTML = '';
        snapshot.forEach((doc) => {
            const msg = doc.data();
            const div = document.createElement('div');
            div.className = `chat-msg ${msg.senderId === currentUser.uid ? 'sent' : 'received'}`;
            div.innerText = msg.text;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

window.sendMessage = async () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    input.value = '';
    try {
        await addDoc(collection(db, "chats", currentChatId, "messages"), { text: text, senderId: currentUser.uid, createdAt: serverTimestamp() });
        await updateDoc(doc(db, "chats", currentChatId), { updatedAt: serverTimestamp(), unreadBy: currentReceiverId || "" });
    } catch (e) { console.error("Chat Error:", e); }
};

window.changeSlide = (btn, direction) => {
    const card = btn.closest('.card');
    const slides = card.querySelectorAll('.slide-img');
    let activeIndex = 0;
    slides.forEach((slide, index) => { if(slide.classList.contains('active')) activeIndex = index; slide.classList.remove('active'); });
    let newIndex = activeIndex + direction;
    if (newIndex >= slides.length) newIndex = 0;
    if (newIndex < 0) newIndex = slides.length - 1;
    slides[newIndex].classList.add('active');
};

function renderData(data, container) {
    // 🔥 Removed container.innerHTML = '' to allow appending
    if (data.length === 0 && allListingsData.length === 0) { 
        container.innerHTML = '<p style="text-align:center; padding:20px;">No ads found.</p>'; return; 
    }
    
    // Instead of appending one by one, we re-render filtered data
    // This logic keeps your filters working with infinite scroll
    container.innerHTML = ''; 

    data.forEach(item => {
        const isOwner = currentUser && item.userId === currentUser.uid;
        const isLiked = userFavorites.includes(item.id);
        const isFeatured = item.isPinned === true;
        let dateStr = item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "Recently";
        let imageHtml = '';
        if (item.images && item.images.length > 1) {
            let slides = '';
            item.images.forEach((img, index) => { slides += `<img src="${img}" class="slide-img ${index === 0 ? 'active' : ''}">`; });
            imageHtml = `<div class="slider-container"><button class="prev-btn" onclick="changeSlide(this, -1)">&#10094;</button>${slides}<button class="next-btn" onclick="changeSlide(this, 1)">&#10095;</button></div>`;
        } else {
            const imgSrc = (item.images && item.images.length > 0) ? item.images[0] : (item.image || 'placeholder.jpg');
            imageHtml = `<img src="${imgSrc}" style="width:100%; height:200px; object-fit:cover;">`;
        }
        const card = `
            <div class="card ${isFeatured ? 'featured-card' : ''}">
                <div class="card-header">
                   ${isFeatured ? `<span class="featured-badge">⭐ FEATURED</span>` : `<span class="card-tag">${item.type}</span>`}
                   ${imageHtml}
                   <button class="delete-btn" style="display:${isOwner ? 'flex' : 'none'}" onclick="deleteAd('${item.id}')">🗑️</button>
                   <button id="like-${item.id}" class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${item.id}')">${isLiked ? '&#10084;' : '&#9825;'}</button>
                </div>
                <div class="card-body">
                    <h3>${item.title}</h3>
                    <p class="price">₹ ${item.price}</p>
                    <p class="location">📍 ${item.location}</p>
                    <button class="speak-btn" onclick="speakAd('Suniye ${item.title} ka daam ${item.price} hai')">🔊 सुनिए</button>
                    <p style="font-size:0.9rem; color:#555; margin-bottom:10px;">${item.desc}</p>
                    <div class="btn-group">
                        <button class="chat-btn" onclick="startChat('${item.id}', '${item.userId}', '${item.title}')">💬 Chat</button>
                        <a href="tel:${item.phone}" class="call-btn">📞 Call</a>
                    </div>
                    <div style="font-size:0.75rem; color:#999; text-align:right; margin-top:5px;">📅 ${dateStr}</div>
                </div>
            </div>`;
        container.innerHTML += card;
    });

    // Add loader at bottom if fetching
    if(isFetching) {
        container.innerHTML += '<p style="text-align:center; padding:10px;">⏳ Loading more ads...</p>';
    }
}

window.speakAd = (text) => {
    if (window.Android && window.Android.speak) { window.Android.speak(text); } 
    else { window.speechSynthesis.cancel(); const msg = new SpeechSynthesisUtterance(); msg.text = text; msg.lang = 'hi-IN'; window.speechSynthesis.speak(msg); }
};

window.deleteAd = async (id) => { 
    if(confirm("Delete ad?")) { await deleteDoc(doc(db, "listings", id)); resetAndLoad(); } 
};

window.toggleLike = async (id) => {
    if(!currentUser) { openLoginModal(); return; }
    const userRef = doc(db, "users", currentUser.uid);
    try {
        if (userFavorites.includes(id)) { await setDoc(userRef, { favorites: arrayRemove(id) }, { merge: true }); userFavorites = userFavorites.filter(i => i !== id); }
        else { await setDoc(userRef, { favorites: arrayUnion(id) }, { merge: true }); userFavorites.push(id); }
        window.switchProfileTab('saved-ads'); 
        // Just refresh view, don't reload from DB
        window.applyFilters();
    } catch(e) { console.error(e); }
};

async function loadUserFavorites() {
    if(!currentUser) return;
    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (docSnap.exists()) userFavorites = docSnap.data().favorites || [];
}

// 🔥 HELPER TO RESET LIST (Used when Filter Change / Initial Load)
function resetAndLoad() {
    allListingsData = [];
    lastVisibleDoc = null;
    isEndOfData = false;
    document.getElementById('listingsArea').innerHTML = '';
    loadListings(false);
}

// 🔥 MAIN LOAD FUNCTION (Supports Pagination)
async function loadListings(isNextPage = false) {
    if (isFetching || (isNextPage && isEndOfData)) return;
    
    isFetching = true;
    const container = document.getElementById('listingsArea');
    
    // Logic for loading spinner
    if(isNextPage) renderData(allListingsData, container); 

    try { 
        let q;
        const listingsRef = collection(db, "listings");

        if (!lastVisibleDoc) {
            // First 10 items
            q = query(listingsRef, orderBy("timestamp", "desc"), limit(10));
        } else {
            // Next 10 items (start after last one)
            q = query(listingsRef, orderBy("timestamp", "desc"), startAfter(lastVisibleDoc), limit(10));
        }

        const snap = await getDocs(q); 
        
        if (snap.empty) {
            isEndOfData = true;
            isFetching = false;
            if(isNextPage) renderData(allListingsData, container); // Update to remove loader
            return;
        }

        // Update Last Visible Doc
        lastVisibleDoc = snap.docs[snap.docs.length - 1];

        // Append new data to master list
        snap.forEach((d) => { allListingsData.push({ id: d.id, ...d.data() }); }); 
        
        window.applyFilters(); 

    } catch (e) { 
        console.log(e); 
        container.innerHTML = '<p style="text-align:center;">Create Index in Firebase Console (Click Link in Console).</p>'; 
    }
    isFetching = false;
}

// 🔥 SCROLL DETECTOR 🔥
window.onscroll = function() {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
        loadListings(true); // Load next batch
    }
};

window.applyFilters = () => {
    const searchText = document.getElementById('searchInput').value.toLowerCase(); 
    let filteredData = allListingsData;
    if (currentFilter !== 'all') filteredData = filteredData.filter(i => i.type === currentFilter);
    if (currentSubCategory !== 'All' && currentFilter !== 'all') filteredData = filteredData.filter(i => i.category === currentSubCategory);
    if (searchText.length > 0) filteredData = filteredData.filter(i => i.location.toLowerCase().includes(searchText) || i.title.toLowerCase().includes(searchText));
    filteredData.sort((a, b) => { if (b.isPinned && !a.isPinned) return 1; if (!b.isPinned && a.isPinned) return -1; return 0; });
    
    renderData(filteredData, document.getElementById('listingsArea'));
}

window.setMainFilter = (type) => { 
    currentFilter = type; currentSubCategory = 'All'; 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); 
    const subArea = document.getElementById('subFiltersArea'); subArea.innerHTML = ''; 
    if(type !== 'all' && categoryData[type]) { 
        subArea.innerHTML += `<div class="chip active" onclick="setSubFilter('All')">All ${type}</div>`; 
        categoryData[type].forEach(cat => subArea.innerHTML += `<div class="chip" onclick="setSubFilter('${cat}')">${cat}</div>`); 
    } 
    // 🔥 Reload from scratch because maybe user didn't scroll enough to get that category data
    // (Optional: You can keep filtering locally if you prefer, but reset is safer for filters)
    window.applyFilters(); 
}

window.setSubFilter = (cat) => { 
    currentSubCategory = cat; 
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); event.target.classList.add('active'); 
    window.applyFilters(); 
}