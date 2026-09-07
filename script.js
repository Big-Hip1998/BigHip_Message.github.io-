// --- Supabase設定 ---
const SUPABASE_URL = 'https://pjatxvwtdjjgomnloyix.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dHduHee4U2ie3L5VkoGh4g_N9OnKgvK';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Web Push 用の VAPID 公開鍵 (生成した Public Key をここに記載してください)
const PUBLIC_VAPID_KEY = 'BGxI4WBNj_tIISNfPD3wsOPllp9zcTxpK1EuPzSsLKLsQv7V4xMjYzaZ6d9yCzONhh-PihUpb_jXEG7YXOocs5I';

let currentUser = null;
let currentUsername = '名無し';
let currentRoom = 'general';
let messageSubscription = null; // リアルタイム監視用

// --- Service Worker の登録 (Android版Firefox等の背景通知対策) ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.log('Service Worker 登録失敗:', err);
  });
}

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

// --- 認証状態のリアルタイム監視 ---
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user || null;

  if (currentUser) {
    currentUsername = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
    
    // UI表示の更新
    currentUsernameEl.textContent = currentUsername;
    userAvatarEl.textContent = currentUsername.charAt(0).toUpperCase();
    
    authCard.classList.add('hidden');
    appCard.classList.remove('hidden');
    
    // Web Push 購読設定とデータ取得
    await subscribeWebPush();
    subscribeToMessages();
  } else {
    authCard.classList.remove('hidden');
    appCard.classList.add('hidden');
    
    // ログアウト時はリアルタイム接続を解除
    if (messageSubscription) {
      supabaseClient.removeChannel(messageSubscription);
      messageSubscription = null;
    }
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

  if (error) {
    alert('登録エラー: ' + error.message);
  } else {
    alert('アカウントを作成しました！');
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
  }
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
  
  // 部屋を切り替えたら再度取得・購読設定
  subscribeToMessages();
}

// メッセージ取得およびリアルタイム受信（Supabase Realtime）
async function subscribeToMessages() {
  // 既存のチャネル購読があれば解除
  if (messageSubscription) {
    await supabaseClient.removeChannel(messageSubscription);
  }

  // 初回の全メッセージ取得
  await fetchMessages();

  // ルームの新規投稿をリアルタイム監視
  messageSubscription = supabaseClient
    .channel(`room:${currentRoom}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'Message_Table',
      filter: `room_id=eq.${currentRoom}`
    }, (payload) => {
      const newMsg = payload.new;
      appendMessage(newMsg);
    })
    .subscribe();
}

// メッセージの一括取得
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
  data.forEach(item => appendMessage(item));
}

// 画面へ1件メッセージを追加表示
function appendMessage(item) {
  // 自分が送信したメッセージかどうかの判定
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

  // 新規投稿時に最下部へ自動スクロール
  messageList.scrollTop = messageList.scrollHeight;
}

// メッセージ送信
async function handleSendMessage() {
  const sendMessage = messageInput.value.trim();
  if (!sendMessage || !currentUser) return;

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
    alert('送信に失敗しました: ' + error.message);
    console.error('挿入エラー:', error);
  } else {
    messageInput.value = '';
  }
}

// Web Pushの購読登録とSupabaseへの保存
async function subscribeWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('このブラウザは Push 通知に対応していません');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // 購読が存在しない場合は作成
    if (!subscription && PUBLIC_VAPID_KEY !== 'YOUR_PUBLIC_VAPID_KEY_HERE') {
      const convertedVapidKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    if (subscription && currentUser) {
      // Supabaseの subscriptions テーブルに保存 (upsert)
      const { error } = await supabaseClient
        .from('subscriptions')
        .upsert({
          user_id: currentUser.id,
          subscription: JSON.stringify(subscription),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Subscription保存エラー:', error);
      }
    }
  } catch (err) {
    console.error('Web Push 登録処理エラー:', err);
  }
}

// Base64URL文字列をUint8Arrayに変換するヘルパー関数
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// XSS対策用 HTMLエスケープ関数
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}