# Firebase: вход через Google + синхронизация — настройка

Цель: реальные аккаунты (вход через Google) + облачная синхронизация данных между устройствами через Firebase Auth + Firestore. Это managed-бэкенд (свой сервер не нужен), есть бесплатный тариф.

## Шаги, которые делает ВЛАДЕЛЕЦ проекта (нужен Google-аккаунт)

1. **Создать проект**: https://console.firebase.google.com → Add project.
2. **Authentication** → Get started → Sign-in method → включить **Google** (выбрать support email).
3. **Firestore Database** → Create database → Production mode → выбрать регион.
4. **Project settings (⚙️) → Your apps:**
   - **Web app** (`</>`): зарегистрировать → скопировать объект `firebaseConfig` и передать Claude:
     ```js
     const firebaseConfig = {
       apiKey: "…", authDomain: "…", projectId: "…",
       storageBucket: "…", messagingSenderId: "…", appId: "…"
     };
     ```
   - **Android app**: package name **`com.scheduler.app`**; добавить отпечатки сертификата:
     - SHA-1 (debug): `84:21:33:66:BC:C7:A7:04:39:04:0E:03:D7:FE:54:F2:81:93:FB:BC`
     - SHA-256 (debug): `F9:38:78:39:B6:99:A5:C3:AD:E5:11:C1:4C:93:9A:F8:8D:C1:D1:4F:2E:06:1F:7B:10:02:9F:5E:8E:6B:9D:F1`
     - Скачать **`google-services.json`** → положить в `android/app/`.
     - (Для релизной сборки позже добавить SHA-1 релизного keystore.)

## Шаги, которые делает Claude (после получения конфига)

- Установить `firebase` + `@capacitor-firebase/authentication`; добавить google-services plugin в Gradle.
- `src/firebase.ts` — init app, auth, firestore (с offline-persistence).
- Экран входа «Войти через Google» + «Продолжить без аккаунта»; профиль с аватаром, выход.
- Слой синхронизации: `users/{uid}` ← persisted-срез store; pull при входе (merge-стратегия при первом входе), push с дебаунсом при изменениях.
- Индикатор статуса синхронизации; проверка в браузере; пересборка APK.

## Заметки / решения

- Модель синхронизации: «последняя запись побеждает», документ целиком (< 1 МБ Firestore-лимит — для личного приложения надолго хватит; при росте шардировать).
- Офлайн: Firestore кэширует локально; вход тоже работает с кэшем.
- Приватность: данные уходят в Google Cloud (Firestore) — приложение перестаёт быть чисто локальным.
