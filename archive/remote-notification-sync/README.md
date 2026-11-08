# Archived: Remote Utility Notification Sync Feature

This feature was developed to capture notifications from whitelisted utility apps (e.g., internet speed monitors, utility alerts) and upload them 4x daily to a hardcoded Google Apps Script Webhook.

It was temporarily shelved because Android's Google Play Protect flags sideloaded APKs containing `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` signed with ephemeral CI keys.

---

## 1. Archived Components

1. **`DropSpendNotificationService.kt`**
   - Extends `NotificationListenerService`.
   - Inspects posted notifications against `ALLOWED_UTILITY_PACKAGES` and regex `DEBIT_PATTERNS`.
   - Strictly excludes SMS, MMS, OTPs, and personal chat applications.
   - Buffers matched transactions into Android `SharedPreferences` under key `buffered_notifications_v1`.

2. **`NotificationSyncWorker.kt`**
   - Android `WorkManager` `CoroutineWorker`.
   - Runs 4x daily (every 6 hours) when network is connected.
   - POSTs JSON payload with action `"append_notifications"` to hardcoded Google Apps Script:
     `https://script.google.com/macros/s/AKfycbwWUN6LyBsdzRI-_p5f3aVhEQaZqIrvoGatXDbtLdFjzIl4wlmnX7f960fBC-3Kv1k/exec`
   - Clears the buffer upon HTTP 200–299.

3. **`AndroidManifest.xml` snippet**:
```xml
        <!-- DropSpend Notification Listener Service for Automatic Expense Tracking -->
        <service
            android:name=".DropSpendNotificationService"
            android:label="DropSpend Expense Parser"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
```

4. **`MainActivity.kt` snippet**:
```kotlin
        // Master code-level feature flag: Set to true to re-enable
        const val FEATURE_REMOTE_NOTIF_SYNC = true
        const val KEY_REMOTE_NOTIF_SYNC_ENABLED = "remote_notif_sync_enabled"

        // Schedule periodic sync (4 times a day = every 6 hours)
        schedulePeriodicNotificationSync()

    private fun schedulePeriodicNotificationSync() {
        if (!FEATURE_REMOTE_NOTIF_SYNC) {
            try {
                androidx.work.WorkManager.getInstance(applicationContext).cancelUniqueWork("DropSpend4xDailySync")
            } catch (_: Exception) {}
            return
        }
        try {
            val constraints = androidx.work.Constraints.Builder()
                .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                .build()

            val workRequest = androidx.work.PeriodicWorkRequestBuilder<NotificationSyncWorker>(
                6, java.util.concurrent.TimeUnit.HOURS
            )
            .setConstraints(constraints)
            .build()

            androidx.work.WorkManager.getInstance(applicationContext).enqueueUniquePeriodicWork(
                "DropSpend4xDailySync",
                androidx.work.ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
        } catch (_: Exception) {}
    }

    // Bridge methods
    @JavascriptInterface
    fun isNotificationListenerEnabled(): Boolean {
        return try {
            val flat = android.provider.Settings.Secure.getString(
                contentResolver,
                "enabled_notification_listeners"
            ) ?: return false
            flat.contains(packageName)
        } catch (e: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun openNotificationListenerSettings() {
        runOnUiThread {
            try {
                val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            } catch (e: Exception) {
                try {
                    val fallback = Intent(android.provider.Settings.ACTION_SETTINGS)
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(fallback)
                } catch (_: Exception) {}
            }
        }
    }
```

5. **`spec-ui.js` toggle snippet**:
```javascript
const FEATURE_REMOTE_NOTIF_SYNC = true; // Set to true to re-enable toggle in Settings
```

---

## 2. Play Protect Solution For Future Re-activation

When re-activating this feature:
1. Generate a permanent `release.keystore` and store it as a GitHub Actions repository secret (base64).
2. Sign every build with that exact same key so updates don't trigger signature mismatch alerts.
3. If Google Play Protect still flags `BIND_NOTIFICATION_LISTENER_SERVICE` on sideloaded APKs:
   - In Google Play Store -> Profile -> Play Protect -> Settings ⚙️ -> Pause "Scan apps with Play Protect" during installation.
   - Or submit the APK for Play Protect developer verification / Play Console release.
