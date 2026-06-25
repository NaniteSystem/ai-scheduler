# Сборка Android APK

Приложение упаковано через **Capacitor** — веб-сборка (`dist/`) запускается в нативном WebView и собирается в обычный APK.

- App ID: `com.scheduler.app`
- App name: `Scheduler`
- Web dir: `dist` (Vite + vite-plugin-singlefile — всё инлайнится в один `index.html`)

## Что уже сделано
- Установлены `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`
- Создан `capacitor.config.ts`
- Сгенерирован нативный проект в `android/`
- Веб-ассеты синхронизированы в `android/app/src/main/assets/public`

## Что нужно установить (один раз)
Всё ставится через Homebrew **без sudo** и **без Android Studio** (именно так собран текущий APK):
1. **JDK 21** — формула (не cask, чтобы не требовался пароль):
   ```sh
   brew install openjdk@21
   ```
2. **Android command-line tools**:
   ```sh
   brew install --cask android-commandlinetools
   ```
3. Переменные окружения (добавить в `~/.zshrc`):
   ```sh
   export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
   ```
4. SDK-пакеты (проект таргетит API 36) + принять лицензии:
   ```sh
   yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
   sdkmanager --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
   ```
   Путь к SDK прописан в `android/local.properties` (`sdk.dir=…`).

## Сборка APK

### Вариант A — командная строка (debug APK)
```sh
npm run android:apk
```
Готовый файл: `android/app/build/outputs/apk/debug/app-debug.apk`
Установка на подключённый телефон: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`

### Вариант B — Android Studio
```sh
npm run android:open
```
Затем в Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Релизный (подписанный) APK
1. Создать ключ:
   ```sh
   keytool -genkey -v -keystore scheduler.keystore -alias scheduler -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Прописать подпись в `android/app/build.gradle` (`signingConfigs`) или собрать через Android Studio: **Build → Generate Signed Bundle / APK**.
3. Сборка: `cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`.

## После изменений в веб-коде
Любые правки React/Vite нужно пересобрать и синхронизировать в Android:
```sh
npm run android:sync     # vite build + cap sync android
```
(или `npm run android:apk` — сразу пересоберёт и упакует APK).

## Примечания
- Данные хранятся в `localStorage` WebView — переживают перезагрузку, привязаны к приложению.
- Иконку/сплэш можно сгенерировать через `@capacitor/assets` (`npx @capacitor/assets generate --android`), положив `assets/icon.png` (1024×1024) и `assets/splash.png`.
