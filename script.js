// --- Supabase設定 ---
const SUPABASE_URL = 'https://pjatxvwtdjjgomnloyix.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dHduHee4U2ie3L5VkoGh4g_N9OnKgvK';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUsername = '名無し';
let currentRoom = 'general';

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

// Enterキーでの送信対応
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSendMessage();
});

// --- ログイン状態チェック ---
async function checkUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  currentUser = user;

  if (currentUser) {
    currentUsername = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
    
    // 表示更新
    currentUsernameEl.textContent = currentUsername;
    userAvatarEl.textContent = currentUsername.charAt(0).toUpperCase();
    
    authCard.classList.add('hidden');
    appCard.classList.remove('hidden');
    
    fetchMessages();
  } else {
    authCard.classList.remove('hidden');
    appCard.classList.add('hidden');
  }
}

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

  if (error) {
    alert('登録エラー: ' + error.message);
  } else {
    alert('アカウントを作成しました！');
    checkUser();
  }
}

// ログイン
async function handleLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) return alert('入力内容を確認してください');

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert('ログインエラー: ' + error.message);
  } else {
    checkUser();
  }
}

// ログアウト
async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  checkUser();
}

// ルーム切り替え
function handleJoinRoom() {
  const room = roomInput.value.trim();
  if (!room) return alert('合言葉を入力してください');
  
  currentRoom = room;
  currentRoomNameEl.textContent = currentRoom;
  fetchMessages();
}

// メッセージ取得
async function fetchMessages() {
  const { data, error } = await supabaseClient
    .from('Message_Table')
    .select('*')
    .eq('room_id', currentRoom)
    .order('created_at', { ascending: true }); // 古い順に表示

  if (error) {
    console.error('取得エラー:', error);
    return;
  }

  messageList.innerHTML = '';

  data.forEach(item => {
    const isMe = item.send_user === currentUsername;
    const date = item.created_at ? new Date(item.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${isMe ? 'me' : 'other'}`;
    msgEl.innerHTML = `
      <div class="msg-user">${escapeHtml(item.send_user || '名無し')}</div>
      <div class="msg-bubble">${escapeHtml(item.send_message)}</div>
      <div class="msg-date">${date}</div>
    `;
    messageList.appendChild(msgEl);
  });

  // 最下部へ自動スクロール
  messageList.scrollTop = messageList.scrollHeight;
}

// メッセージ送信
async function handleSendMessage() {
  const sendMessage = messageInput.value.trim();
  if (!sendMessage) return;

  const { error } = await supabaseClient
    .from('Message_Table')
    .insert([
      { 
        send_message: sendMessage, 
        send_user: currentUsername,
        room_id: currentRoom 
      }
    ]);

  if (error) {
    alert('送信に失敗しました');
    console.error('挿入エラー:', error);
  } else {
    messageInput.value = '';
    fetchMessages();
  }
}

// XSS対策
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// 初期実行
checkUser();