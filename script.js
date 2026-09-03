// --- Supabase設定 ---
const SUPABASE_URL = 'https://pjatxvwtdjjgomnloyix.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dHduHee4U2ie3L5VkoGh4g_N9OnKgvK';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUsername = '名無し';
let currentRoom = 'general';
let messageSubscription = null; // リアルタイム購読用

// --- UI要素取得 ---
const authCard = document.getElementById('auth-card');
const appCard = document.getElementById('app-card');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const currentUsernameEl = document.getElementById('current-username');
const userAvatarEl = document.getElementById('user-avatar');

const roomInput = document.getElementById('room-input');
const currentRoomNameEl = document.getElementById('current-room-name');

const messageInput = document.getElementById('message-input');
const messageList = document.getElementById('message-list');

// --- イベントリスナー設定 ---
document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('signup-btn').addEventListener('click', handleSignUp);
document.getElementById('logout-btn').addEventListener('click', handleLogout);
document.getElementById('join-room-btn').addEventListener('click', handleJoinRoom);
document.getElementById('send-btn').addEventListener('click', handleSendMessage);

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSendMessage();
});

// --- 認証状態の監視 ---
supabaseClient.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  if (currentUser) {
    currentUsername = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
    currentUsernameEl.textContent = currentUsername;
    userAvatarEl.textContent = currentUsername.charAt(0).toUpperCase();
    
    authCard.classList.add('hidden');
    appCard.classList.remove('hidden');
    
    subscribeToMessages();
  } else {
    authCard.classList.remove('hidden');
    appCard.classList.add('hidden');
    if (messageSubscription) supabaseClient.removeChannel(messageSubscription);
  }
});

// 新規登録
async function handleSignUp() {
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username) return alert('ユーザーネームを入力してください');
  if (!email || !password) return alert('メールアドレスとパスワードを入力してください');

  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { username: username } }
  });

  if (error) alert('登録エラー: ' + error.message);
  else alert('アカウントを作成しました！確認メールをご確認ください（設定による）。');
}

// ログイン
async function handleLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) return alert('入力内容を確認してください');

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) alert('ログインエラー: ' + error.message);
}

// ログアウト
async function handleLogout() {
  await supabaseClient.auth.signOut();
}

// ルーム切り替え
function handleJoinRoom() {
  const room = roomInput.value.trim();
  if (!room) return alert('合言葉を入力してください');
  
  currentRoom = room;
  currentRoomNameEl.textContent = currentRoom;
  subscribeToMessages();
}

// メッセージ取得 & リアルタイム受信設定
async function subscribeToMessages() {
  // 既存の購読解除
  if (messageSubscription) {
    await supabaseClient.removeChannel(messageSubscription);
  }

  // 初期メッセージ読み込み
  await fetchMessages();

  // Realtimeリスナー接続
  messageSubscription = supabaseClient
    .channel(`room:${currentRoom}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'Message_Table',
      filter: `room_id=eq.${currentRoom}`
    }, (payload) => {
      appendMessage(payload.new);
    })
    .subscribe();
}

async function fetchMessages() {
  const { data, error } = await supabaseClient
    .from('Message_Table')
    .select('*')
    .eq('room_id', currentRoom)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('取得エラー:', error);
    return;
  }

  messageList.innerHTML = '';
  data.forEach(appendMessage);
}

function appendMessage(item) {
  const isMe = currentUser && item.user_id === currentUser.id;
  const date = item.created_at ? new Date(item.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

  const msgEl = document.createElement('div');
  msgEl.className = `chat-message ${isMe ? 'me' : 'other'}`;
  msgEl.innerHTML = `
    <div class="msg-user">${escapeHtml(item.send_user || '名無し')}</div>
    <div class="msg-bubble">${escapeHtml(item.send_message)}</div>
    <div class="msg-date">${date}</div>
  `;
  messageList.appendChild(msgEl);
  messageList.scrollTop = messageList.scrollHeight;
}

// メッセージ送信（user_idを付与）
async function handleSendMessage() {
  const sendMessage = messageInput.value.trim();
  if (!sendMessage || !currentUser) return;

  const { error } = await supabaseClient
    .from('Message_Table')
    .insert([
      { 
        send_message: sendMessage, 
        send_user: currentUsername,
        user_id: currentUser.id, // 送信者のUIDを確実に記録
        room_id: currentRoom 
      }
    ]);

  if (error) {
    alert('送信に失敗しました');
    console.error('挿入エラー:', error);
  } else {
    messageInput.value = '';
  }
}

// XSS対策
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}