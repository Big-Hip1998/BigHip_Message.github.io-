// sw.js - Service Worker for Notifications

// インストール時の処理
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// アクティベート時の処理
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 1. サーバー（Edge Function）から Push 通知が送られてきた時の処理
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || '新着メッセージ';
  const options = {
    body: data.body || '新しいメッセージが届きました。',
    icon: data.icon || '/favicon.ico',
    tag: data.tag || 'general-message',
    renotify: true,
    data: { url: data.url || self.location.origin }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 2. 通知がタップ（クリック）された時の処理
self.addEventListener('notificationclick', (event) => {
  // タップされた通知を閉じる
  event.notification.close();

  // クリック時に既存のタブを開いてフォーカスするか、なければ新規タブでページを開く
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既にアプリのタブが開いている場合はそのタブにフォーカスする
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // タブが開いていない場合は指定されたURL（またはトップページ）を新規で開く
      if (clients.openWindow) {
        const urlToOpen = event.notification.data?.url || '/';
        return clients.openWindow(urlToOpen);
      }
    })
  );
});